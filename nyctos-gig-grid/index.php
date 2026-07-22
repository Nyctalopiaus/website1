<?php
/**
 * Frontend Interface - Nycto's Gig Grid
 */
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/genre_buckets.php';
require_once __DIR__ . '/ignored_artists.php';

if (!headers_sent()) {
    header("Content-Security-Policy: default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com https://*.mzstatic.com; connect-src 'self' https://api.open-meteo.com https://itunes.apple.com; media-src 'self' https://*.itunes.apple.com https://*.apple.com https://*.mzstatic.com; upgrade-insecure-requests");
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: SAMEORIGIN');
    header('Referrer-Policy: strict-origin-when-cross-origin');
    header('Permissions-Policy: geolocation=(), microphone=(), camera=()');
}

$db = getDbConnection();
$genreBuckets = getGenreBucketConfig();
$ignoredArtists = getIgnoredArtistsNormalized();

$allowedMarkets = ['front-range', 'socal', 'scotland'];
$requestedMarket = strtolower(trim((string)($_GET['market'] ?? $_COOKIE['market'] ?? 'front-range')));
if (!in_array($requestedMarket, $allowedMarkets, true)) {
    $requestedMarket = 'front-range';
}
$activeMarket = $requestedMarket;
if (($_COOKIE['market'] ?? null) !== $activeMarket) {
    setcookie('market', $activeMarket, time() + (86400 * 30), '/');
}

$marketConfig = [
    'front-range' => [
        'title' => "Nycto's Gig Grid - Front Range Rock & Metal",
        'region_name' => 'Front Range Rock & Metal',
        'logo_text' => "Nycto's Gig Grid",
        'intro' => 'Your direct link to heavy music events between Colorado Springs and Fort Collins. Real-time API aggregation, zero AI noise.'
    ],
    'socal' => [
        'title' => "Nycto's Gig Grid - SoCal Rock & Metal",
        'region_name' => 'SoCal Rock & Metal',
        'logo_text' => "Nycto's Gig Grid",
        'intro' => 'Your direct link to heavy music events from Los Angeles to San Diego. Real-time API aggregation, zero AI noise.'
    ],
    'scotland' => [
        'title' => "Nycto's Gig Grid - Scotland Rock & Metal",
        'region_name' => 'Scotland Rock & Metal',
        'logo_text' => "Nycto's Gig Grid",
        'intro' => 'Your direct link to heavy music events across Glasgow, Edinburgh, and the Scottish central belt. Real-time API aggregation, zero AI noise.'
    ]
];
$activeMarketConfig = $marketConfig[$activeMarket] ?? $marketConfig['front-range'];

function buildMarketLink($marketKey) {
    $params = $_GET;
    $params['market'] = $marketKey;
    return 'index.php?' . http_build_query($params);
}

$marketLinks = [
    'front-range' => buildMarketLink('front-range'),
    'socal' => buildMarketLink('socal'),
    'scotland' => buildMarketLink('scotland')
];

// Fetch unique months containing upcoming events in the SQLite database.
$monthsStmt = $db->prepare("
    SELECT DISTINCT strftime('%Y-%m', start_time) AS event_month 
    FROM events 
    WHERE market = :market
      AND
      start_time >= date('now', '-1 day') 
    ORDER BY event_month ASC
");
$monthsStmt->execute([':market' => $activeMarket]);
$activeMonths = $monthsStmt->fetchAll(PDO::FETCH_COLUMN);

// Group events by month.
$eventsByMonth = [];
foreach ($activeMonths as $month) {
    $stmt = $db->prepare("
        SELECT * 
        FROM events 
        WHERE market = :market
          AND strftime('%Y-%m', start_time) = :month 
          AND start_time >= date('now', '-1 day') 
        ORDER BY start_time ASC
");
    $stmt->execute([
        ':market' => $activeMarket,
        ':month' => $month
    ]);
    $events = $stmt->fetchAll();
    if (!empty($ignoredArtists)) {
        $events = array_values(array_filter($events, function($event) use ($ignoredArtists) {
            return !isArtistIgnored($event['artist_name'] ?? '', $ignoredArtists);
        }));
    }

    if (!empty($events)) {
        $eventsByMonth[$month] = $events;
    }
}

$activeMonths = array_keys($eventsByMonth);

// Fetch all whitelisted venues from the database to expose to the frontend
$venuesStmt = $db->prepare("SELECT * FROM venues WHERE market = :market ORDER BY venue_name ASC");
$venuesStmt->execute([':market' => $activeMarket]);
$venuesList = $venuesStmt->fetchAll();

// Helper to format month name
function formatMonthName($yearMonthStr) {
    $date = strtotime($yearMonthStr . "-01");
    return date('F Y', $date);
}


// Helper to format event date details
function getEventDateDetails($dateTimeStr) {
    $timestamp = strtotime($dateTimeStr);
    return [
        'day' => date('d', $timestamp),
        'month_abbr' => date('M', $timestamp),
        'weekday' => date('D', $timestamp),
        'time' => date('g:i A', $timestamp)
    ];
}

// Fetch last sync timestamp
$lastSyncFile = __DIR__ . '/cache/last_sync.txt';
$lastSyncText = 'Never';
if (file_exists($lastSyncFile)) {
    $lastSyncTime = file_get_contents($lastSyncFile);
    $timestamp = strtotime($lastSyncTime);
    if ($timestamp) {
        $lastSyncText = date('M j, g:i A', $timestamp);
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title><?php echo htmlspecialchars($activeMarketConfig['title']); ?> // Live Show Intelligence</title>
    <link rel="stylesheet" href="styles.css?v=9" />
</head>
<body data-market="<?php echo htmlspecialchars($activeMarket); ?>">

    <!-- Dynamic Ingestion Loading Screen -->
    <div id="sync-overlay" class="sync-overlay">
        <span class="loader"></span>
        <h3 style="margin-top: 1.5rem; font-family: var(--font-header); font-size: 2.2rem; letter-spacing: 0.05em; text-transform: uppercase;">Syncing Stage Data...</h3>
        <p style="color: var(--text-muted); margin-top: 0.5rem; font-size: 0.9rem;">Fetching raw schedules from Ticketmaster & Bandsintown APIs...</p>
        <div id="sync-logs" class="sync-logs"></div>
        <button id="btn-close-sync" class="btn-action" style="margin-top: 1.5rem; display: none;">Close &amp; Refresh</button>
    </div>

    <!-- Venue Information Popup Modal -->
    <div id="venue-modal" class="sync-overlay" style="display: none; align-items: center; justify-content: center; z-index: 110; background: rgba(0,0,0,0.85);">
        <div class="modal-content" style="background: #14161a; border: 1px solid var(--card-border); max-width: 440px; width: 90%; padding: 2rem; border-radius: var(--border-radius); box-shadow: 0 20px 50px rgba(0,0,0,0.9); position: relative;">
            <button id="btn-close-venue" style="position: absolute; top: 1rem; right: 1.25rem; background: transparent; border: none; color: var(--text-muted); font-size: 1.5rem; cursor: pointer; transition: color 0.2s; outline: none;">&times;</button>
            
            <h2 id="venue-modal-name" style="font-family: var(--font-header); font-size: 2rem; color: var(--text-bright); text-transform: uppercase; margin-bottom: 1.25rem; border-bottom: 2px solid var(--accent-crimson); padding-bottom: 0.5rem; letter-spacing: 0.02em;">Venue Name</h2>
            
            <div style="margin-bottom: 1.25rem;">
                <label style="display: block; font-size: 0.7rem; text-transform: uppercase; color: var(--text-muted); font-weight: 700; margin-bottom: 0.35rem; letter-spacing: 0.05em;">📍 Address / Location:</label>
                <div id="venue-modal-address" style="color: var(--text-bright); font-size: 0.95rem; font-weight: 500; line-height: 1.4;">Address</div>
            </div>
            
            <div style="display: flex; gap: 1rem; justify-content: flex-end; margin-top: 2rem;">
                <a id="venue-modal-maps" href="#" target="_blank" class="btn-tickets" style="margin-top: 0; padding: 0.55rem 1.5rem; border-radius: 4px; display: inline-flex; align-items: center; gap: 0.5rem; text-decoration: none; font-size: 0.8rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">
                    🗺️ Google Maps (New Tab)
                </a>
            </div>
        </div>
    </div>


    <!-- Setlist.fm Popup Modal -->
    <div id="setlist-modal" class="sync-overlay" style="display: none; align-items: center; justify-content: center; z-index: 120; background: rgba(0,0,0,0.85);">
        <div class="modal-content" style="background: #14161a; border: 1px solid var(--card-border); max-width: 440px; width: 90%; padding: 2rem; border-radius: var(--border-radius); box-shadow: 0 20px 50px rgba(0,0,0,0.9); position: relative;">
            <button id="btn-close-setlist" style="position: absolute; top: 1rem; right: 1.25rem; background: transparent; border: none; color: var(--text-muted); font-size: 1.5rem; cursor: pointer; transition: color 0.2s; outline: none;">&times;</button>
            
            <h2 id="setlist-modal-title" style="font-family: var(--font-header); font-size: 2.0rem; color: var(--text-bright); text-transform: uppercase; margin-bottom: 0.35rem; border-bottom: 2px solid var(--accent-crimson); padding-bottom: 0.5rem; letter-spacing: 0.02em;">Concert Setlist</h2>
            <div id="setlist-modal-meta" style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 1.25rem; font-weight: 600;">Artist // Date // Venue</div>
            
            <div style="margin-bottom: 1.25rem; max-height: 280px; overflow-y: auto; padding-right: 0.5rem;" id="setlist-songs-container">
                <!-- Songs will be populated here -->
            </div>
            
            <div style="font-size: 0.7rem; color: var(--text-muted); text-align: center; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 1rem; margin-top: 1rem;">
                Provided by <a href="https://www.setlist.fm" target="_blank" style="color: var(--text-bright); text-decoration: underline;">setlist.fm</a>
            </div>
        </div>
    </div>

    <!-- Email Show List Modal -->
    <div id="email-modal" class="sync-overlay" style="display: none; align-items: center; justify-content: center; z-index: 125; background: rgba(0,0,0,0.85);">
        <div class="modal-content" style="background: #14161a; border: 1px solid var(--card-border); max-width: 460px; width: 90%; padding: 2rem; border-radius: var(--border-radius); box-shadow: 0 20px 50px rgba(0,0,0,0.9); position: relative;">
            <button id="btn-close-email" style="position: absolute; top: 1rem; right: 1.25rem; background: transparent; border: none; color: var(--text-muted); font-size: 1.5rem; cursor: pointer; transition: color 0.2s; outline: none;">&times;</button>
            
            <h2 style="font-family: var(--font-header); font-size: 1.8rem; color: var(--text-bright); text-transform: uppercase; margin-bottom: 1.25rem; border-bottom: 2px solid var(--accent-crimson); padding-bottom: 0.5rem; letter-spacing: 0.02em;">Email Show List</h2>
            
            <!-- Explicit Modal Privacy Notice -->
            <div style="background: rgba(239, 68, 68, 0.04); border: 1px solid rgba(239, 68, 68, 0.15); border-radius: 0.5rem; padding: 0.75rem 1rem; margin-bottom: 1.25rem; display: flex; align-items: flex-start; gap: 0.75rem; font-size: 0.75rem; color: var(--text-muted); line-height: 1.45;">
                <span style="font-size: 1rem; line-height: 1;">🔒</span>
                <div>
                    <strong style="color: #ffd6d6; text-shadow: 0 1px 2px rgba(0,0,0,0.65); font-family: var(--font-header); letter-spacing: 0.02em; display: block; margin-bottom: 0.15rem; text-transform: uppercase; font-size: 0.75rem;">100% Private & Dispatch-Only</strong>
                    Your email address is used for this one-time dispatch only. It is not stored in our database, nor will it ever be shared or used for marketing.
                </div>
            </div>
            
            <div id="email-error" style="display: none; background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.25); color: #fca5a5; padding: 0.65rem; border-radius: 4px; font-size: 0.8rem; margin-bottom: 1.25rem; text-align: center;"></div>
            <div id="email-success" style="display: none; background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.25); color: #a7f3d0; padding: 0.65rem; border-radius: 4px; font-size: 0.8rem; margin-bottom: 1.25rem; text-align: center;"></div>
            
            <form id="email-form">
                <div style="margin-bottom: 1.5rem;">
                    <label style="display: block; font-size: 0.75rem; text-transform: uppercase; color: var(--text-muted); margin-bottom: 0.4rem; font-weight: 700;">Your Email Address</label>
                    <input type="email" id="email-input-field" required placeholder="name@domain.com" style="background: rgba(0,0,0,0.4); border: 1px solid var(--card-border); color: white; padding: 0.65rem 0.85rem; border-radius: 4px; width: 100%; font-size: 0.9rem; outline: none; box-sizing: border-box;" />
                </div>
                
                <div style="display: flex; gap: 1rem; justify-content: flex-end;">
                    <button type="button" id="btn-cancel-email" class="btn-tickets secondary" style="margin-top: 0; padding: 0.5rem 1.25rem; border-radius: 4px;">Cancel</button>
                    <button type="submit" id="btn-submit-email" class="btn-tickets" style="margin-top: 0; padding: 0.5rem 1.5rem; border-radius: 4px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; display: inline-flex; align-items: center; gap: 0.5rem;">
                        ✉️ Send Show List
                    </button>
                </div>
            </form>
        </div>
    </div>

    <!-- Feature Overview Modal -->
    <div id="features-modal" class="sync-overlay" style="display: none; align-items: center; justify-content: center; z-index: 126; background: rgba(0,0,0,0.85);">
        <div class="modal-content feature-modal-content">
            <button id="btn-close-features" class="modal-close-button" aria-label="Close feature overview">&times;</button>

            <h2 class="feature-modal-title">What Nycto's Gig Grid Can Do</h2>
            <p class="feature-modal-intro">A fast, heavy-music calendar built to help you find shows, compare options, and move from discovery to planning without jumping between five tabs.</p>

            <ul class="feature-modal-list">
                <li><strong>Regional filtering:</strong> switch markets, filter by sub-region, venue, and genre buckets.</li>
                <li><strong>Fresh syncs:</strong> pulls upcoming show data from live sources and keeps the calendar current.</li>
                <li><strong>Outdoor weather context:</strong> shows forecast callouts for venue/date combinations when weather matters.</li>
                <li><strong>Band intelligence:</strong> quick artist insights for context before you commit to a ticket.</li>
                <li><strong>Instant listening:</strong> preview music directly from the card flow.</li>
                <li><strong>Venue directions:</strong> open mapped venue details and addresses in one click.</li>
                <li><strong>Calendar export:</strong> generate ICS files to drop selected shows into your calendar.</li>
                <li><strong>Setlist lookup:</strong> check song lists and expected tour setlists when available.</li>
                <li><strong>Interested show tracking:</strong> star shows, email yourself a short list, and keep the schedule tight.</li>
            </ul>
        </div>
    </div>

    <!-- Header Navigation -->
    <header class="container header">
        <div class="header-nav">
            <a href="../index.html" class="btn-back">← Back to Lab</a>
            <a href="../" class="logo">
                <span class="logo-icon">🤘</span>
                <span class="logo-text"><?php echo htmlspecialchars($activeMarketConfig['logo_text']); ?></span>
            </a>
        </div>
        <div class="controls-group">
            <div class="header-market-controls">
                <nav class="header-market-switcher" aria-label="Market selector">
                    <a href="<?php echo htmlspecialchars($marketLinks['front-range']); ?>" class="header-market-link <?php echo $activeMarket === 'front-range' ? 'active' : ''; ?>" <?php echo $activeMarket === 'front-range' ? 'aria-current="page"' : ''; ?>>🏔️ Colorado (Front Range)</a>
                    <a href="<?php echo htmlspecialchars($marketLinks['socal']); ?>" class="header-market-link <?php echo $activeMarket === 'socal' ? 'active' : ''; ?>" <?php echo $activeMarket === 'socal' ? 'aria-current="page"' : ''; ?>>🌴 Southern California (LA - San Diego)</a>
                    <a href="<?php echo htmlspecialchars($marketLinks['scotland']); ?>" class="header-market-link <?php echo $activeMarket === 'scotland' ? 'active' : ''; ?>" <?php echo $activeMarket === 'scotland' ? 'aria-current="page"' : ''; ?>>🏴 Scotland</a>
                </nav>
                <button type="button" id="btn-copy-market-link" class="header-copy-link" data-default-label="Copy Link" title="Copy shareable market URL">
                    🔗 Copy Link
                </button>
            </div>
            <span class="sync-status">
                <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background-color: #10b981; box-shadow: 0 0 8px #10b981;"></span>
                Last Sync: <?php echo htmlspecialchars($lastSyncText); ?>
            </span>
        </div>
    </header>

    <main class="container">
        <!-- Banner Intro -->
        <section class="intro">
            <h1>
                <span class="intro-title-main">NYCTO'S GIG GRID</span>
                <span class="intro-title-region"><?php echo htmlspecialchars($activeMarketConfig['region_name']); ?></span>
            </h1>
            <p><?php echo htmlspecialchars($activeMarketConfig['intro']); ?></p>
        </section>

        <!-- Privacy & Trust Header Banner -->
        <div class="privacy-banner-container" style="background: rgba(239, 68, 68, 0.04); border: 1px solid rgba(239, 68, 68, 0.15); border-radius: 0.75rem; padding: 0.85rem 1.25rem; margin-bottom: 1.5rem; display: flex; align-items: flex-start; gap: 0.85rem; font-size: 0.8rem; color: var(--text-muted); line-height: 1.5;">
            <span class="privacy-banner-icon" style="font-size: 1.15rem; line-height: 1.2;">🔒</span>
            <div class="privacy-banner-copy">
                <strong style="color: #ffd6d6; text-shadow: 0 1px 2px rgba(0,0,0,0.65); font-family: var(--font-header); letter-spacing: 0.02em; display: block; margin-bottom: 0.2rem; text-transform: uppercase; font-size: 0.85rem;">100% Private & Dispatch-Only</strong>
                Your data is processed locally to you. If you choose to email your show list, your email address is used for this one-time dispatch only. It is not stored in our database, nor will it ever be shared or used for future marketing.
            </div>
            <button type="button" id="btn-open-features" class="privacy-feature-button" title="View site features">
                <span class="privacy-feature-button-icon">◌</span>
                <span>Site Features</span>
            </button>
        </div>

        <!-- Dynamic On-Page Search Bar -->
        <style>
            #artist-search-input:focus {
                border-color: var(--accent-crimson) !important;
                box-shadow: 0 0 12px rgba(225, 29, 72, 0.45), 0 4px 15px rgba(0,0,0,0.5) !important;
                background: rgba(0,0,0,0.55) !important;
            }
        </style>
        <div class="search-container" style="margin-bottom: 1.25rem; width: 100%;">
            <input type="text" id="artist-search-input" placeholder="🔍 Search band, venue, or subgenre tag (e.g. Gojira, Red Rocks, Deathcore)..." style="background: rgba(0,0,0,0.35); border: 1px solid var(--card-border); color: white; padding: 0.85rem 1.25rem; border-radius: 8px; width: 100%; font-size: 1rem; outline: none; transition: all 0.25s ease; box-shadow: 0 4px 12px rgba(0,0,0,0.3); font-family: inherit;" />
        </div>

        <!-- Filter & Control Panel -->
        <div class="filter-panel" style="background: var(--card-bg); border: 1px solid var(--card-border); padding: 1.25rem 1.5rem; border-radius: var(--border-radius); margin-bottom: 2rem; display: flex; flex-wrap: wrap; gap: 1.5rem; align-items: center; justify-content: space-between;">
            
            <!-- 1. Region Toggle Button Group -->
            <div class="filter-group" style="display: flex; align-items: center; gap: 0.5rem;">
                <span style="font-size: 0.85rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-medium);">Region:</span>
                <div style="display: flex; background: rgba(0,0,0,0.3); border-radius: 6px; border: 1px solid var(--card-border); overflow: hidden;">
                    <button class="region-btn active" data-region="all" style="background: transparent; color: var(--text-muted); border: none; padding: 0.45rem 1rem; font-size: 0.75rem; font-weight: 600; cursor: pointer;">All</button>
                    <?php if ($activeMarket === 'front-range'): ?>
                        <button class="region-btn" data-region="springs" style="background: transparent; color: var(--text-muted); border: none; border-left: 1px solid var(--card-border); padding: 0.45rem 1rem; font-size: 0.75rem; font-weight: 600; cursor: pointer;">Springs</button>
                        <button class="region-btn" data-region="denver" style="background: transparent; color: var(--text-muted); border: none; border-left: 1px solid var(--card-border); padding: 0.45rem 1rem; font-size: 0.75rem; font-weight: 600; cursor: pointer;">Denver/Boulder</button>
                        <button class="region-btn" data-region="north" style="background: transparent; color: var(--text-muted); border: none; border-left: 1px solid var(--card-border); padding: 0.45rem 1rem; font-size: 0.75rem; font-weight: 600; cursor: pointer;">Ft Collins</button>
                    <?php elseif ($activeMarket === 'socal'): ?>
                        <button class="region-btn" data-region="la" style="background: transparent; color: var(--text-muted); border: none; border-left: 1px solid var(--card-border); padding: 0.45rem 1rem; font-size: 0.75rem; font-weight: 600; cursor: pointer;">Los Angeles</button>
                        <button class="region-btn" data-region="oc" style="background: transparent; color: var(--text-muted); border: none; border-left: 1px solid var(--card-border); padding: 0.45rem 1rem; font-size: 0.75rem; font-weight: 600; cursor: pointer;">Orange County</button>
                        <button class="region-btn" data-region="sd" style="background: transparent; color: var(--text-muted); border: none; border-left: 1px solid var(--card-border); padding: 0.45rem 1rem; font-size: 0.75rem; font-weight: 600; cursor: pointer;">San Diego</button>
                    <?php elseif ($activeMarket === 'scotland'): ?>
                        <button class="region-btn" data-region="glasgow" style="background: transparent; color: var(--text-muted); border: none; border-left: 1px solid var(--card-border); padding: 0.45rem 1rem; font-size: 0.75rem; font-weight: 600; cursor: pointer;">Glasgow</button>
                        <button class="region-btn" data-region="edinburgh" style="background: transparent; color: var(--text-muted); border: none; border-left: 1px solid var(--card-border); padding: 0.45rem 1rem; font-size: 0.75rem; font-weight: 600; cursor: pointer;">Edinburgh</button>
                        <button class="region-btn" data-region="other" style="background: transparent; color: var(--text-muted); border: none; border-left: 1px solid var(--card-border); padding: 0.45rem 1rem; font-size: 0.75rem; font-weight: 600; cursor: pointer;">Other</button>
                    <?php endif; ?>
                </div>
            </div>

            <!-- 2. Venue Multi-Select Dropdown -->
            <div class="filter-group" style="display: flex; align-items: center; gap: 0.75rem; position: relative;">
                <span style="font-size: 0.85rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-medium);">Venues:</span>
                <div class="dropdown-wrapper" style="position: relative;">
                    <button id="venue-dropdown-toggle" style="background: rgba(0,0,0,0.3); border: 1px solid var(--card-border); color: var(--text-medium); padding: 0.5rem 1rem; border-radius: 6px; font-size: 0.8rem; cursor: pointer; min-width: 160px; text-align: left; display: flex; justify-content: space-between; align-items: center;">
                        <span id="venue-selected-count">All Venues</span>
                        <span style="font-size: 0.6rem; margin-left: 0.5rem;">▼</span>
                    </button>
                    <div id="venue-dropdown-menu" style="display: none; position: absolute; top: 100%; left: 0; background: #14161a; border: 1px solid var(--card-border); border-radius: 6px; box-shadow: 0 10px 25px rgba(0,0,0,0.8); z-index: 50; padding: 0.5rem; max-height: 250px; overflow-y: auto; min-width: 220px; margin-top: 4px;">
                        <label style="display: flex; align-items: center; gap: 0.5rem; padding: 0.35rem 0.5rem; color: var(--text-bright); font-size: 0.8rem; font-weight: 600; border-bottom: 1px solid rgba(255,255,255,0.05); cursor: pointer; user-select: none;">
                            <input type="checkbox" id="venue-select-all" checked style="accent-color: var(--accent-crimson);" /> Toggle All
                        </label>
                        <div id="venue-checkboxes-list" style="margin-top: 0.25rem;">
                        </div>
                    </div>
                </div>
            </div>

            <!-- 3. Genre Filter Dropdown -->
            <div class="filter-group genre-filter-group" style="display: flex; align-items: center; gap: 0.75rem; position: relative;">
                <span style="font-size: 0.85rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-medium);">Genre:</span>
                <select id="genre-select" style="background: rgba(0,0,0,0.3); border: 1px solid var(--card-border); color: white; padding: 0.5rem 1rem; border-radius: 6px; font-size: 0.8rem; cursor: pointer; outline: none; font-family: inherit; font-weight: 600; min-width: 150px; transition: border-color 0.2s ease;">
                    <?php foreach ($genreBuckets as $bucketKey => $bucket): ?>
                        <option value="<?php echo htmlspecialchars($bucketKey); ?>"><?php echo htmlspecialchars($bucket['label']); ?></option>
                    <?php endforeach; ?>
                </select>
                <button type="button" id="genre-help-trigger" class="genre-help-trigger" aria-label="Genre filter help">?</button>
                <div id="genre-help-panel" class="genre-help-panel" role="note" aria-live="polite">
                    <div id="genre-help-title" class="genre-help-title"><?php echo htmlspecialchars($genreBuckets['all']['label']); ?></div>
                    <div id="genre-help-text" class="genre-help-text"><?php echo htmlspecialchars($genreBuckets['all']['title']); ?></div>
                </div>
            </div>

            <!-- 4. Interested Shows Filter -->
            <div class="filter-group" style="display: flex; align-items: center; gap: 0.5rem;">
                <button type="button" id="btn-interested-filter" class="btn-tickets secondary" style="margin-top: 0; padding: 0.45rem 1rem; border-radius: 6px; font-size: 0.75rem; font-weight: 700; height: auto; white-space: nowrap; line-height: 1.2; display: inline-flex; align-items: center; gap: 0.35rem; cursor: pointer; transition: all 0.2s ease;">
                    <span>⭐</span> Interested Only
                </button>
            </div>

            <!-- 5. Email Show List Dispatch -->
            <div class="filter-group" style="display: flex; align-items: center; gap: 0.5rem; margin-left: auto;">
                <button type="button" id="btn-email-passport" class="btn-tickets btn-email-passport-premium">
                    <span class="btn-email-passport-icon">✉️</span>
                    <span class="btn-email-passport-label">Email Me My Interested Shows</span>
                </button>
            </div>

        </div>

        <!-- Month Selection Dropdown -->
        <section class="tabs-container" style="justify-content: flex-start; gap: 1rem; background: transparent; padding: 0; margin-bottom: 2rem; border-bottom: none;">
            <div class="filter-group" style="display: flex; align-items: center; gap: 0.75rem; width: 100%; max-width: 320px;">
                <span style="font-size: 0.85rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-medium); white-space: nowrap;">📅 Select Month:</span>
                <select id="month-dropdown-select" style="background: rgba(0,0,0,0.3); border: 1px solid var(--card-border); color: white; padding: 0.55rem 1rem; border-radius: 6px; font-size: 0.85rem; cursor: pointer; width: 100%; outline: none; font-family: inherit; font-weight: 600; transition: border-color 0.2s ease; box-shadow: 0 4px 10px rgba(0,0,0,0.3);">
                    <?php if (empty($activeMonths)): ?>
                        <option value="empty-view">No Shows Found</option>
                    <?php else: ?>
                        <!-- Month options -->
                        <?php foreach ($activeMonths as $index => $month): ?>
                            <option value="month-<?php echo $month; ?>" <?php echo $index === 0 ? 'selected' : ''; ?>>
                                <?php echo formatMonthName($month); ?>
                            </option>
                        <?php endforeach; ?>
                        
                        <!-- Interested shows option -->
                        <option id="interested-dropdown-option" value="interested-view">⭐ Interested Shows (0)</option>
                    <?php endif; ?>
                </select>
            </div>
        </section>

        <!-- Calendar Events Listings -->
        <section class="events-content">
            <?php if (empty($activeMonths)): ?>
                <div id="empty-view" class="calendar-view active">
                    <div class="no-events">
                        <div class="no-events-icon">🤘</div>
                        <h3 style="color: var(--text-bright); font-family: var(--font-header); font-size: 1.8rem; margin-bottom: 0.5rem;">The Stage is Dark</h3>
                        <p style="color: var(--text-muted); max-width: 400px; margin: 0 auto; font-size: 0.9rem;">No upcoming concerts are loaded. Click the "Sync Live Gigs" button in the corner to trigger the aggregator script.</p>
                    </div>
                </div>
            <?php else: ?>
                <!-- Approved Month Event Listings (Default strict mode applies to this calendar container) -->
                <?php foreach ($activeMonths as $index => $month): ?>
                    <div id="month-<?php echo $month; ?>" class="calendar-view strict-mode <?php echo $index === 0 ? 'active' : ''; ?>">
                        
                        <?php foreach ($eventsByMonth[$month] as $event): 
                            $dateInfo = getEventDateDetails($event['start_time']);
                            $ticketUrl = $event['ticket_url'];
                        ?>
                            <article class="event-card" data-status="Approved" data-city="<?php echo htmlspecialchars(strtolower($event['city_name'])); ?>" data-venue="<?php echo htmlspecialchars(strtolower($event['venue_name'])); ?>" data-genre="<?php echo htmlspecialchars(strtolower($event['genre'] ?? 'metal')); ?>" data-tags="<?php echo htmlspecialchars(strtolower($event['tags'] ?? '')); ?>" id="card-<?php echo $event['event_id']; ?>">
                                <!-- Left Stub -->
                                <div class="date-stub">
                                    <span class="date-month"><?php echo $dateInfo['month_abbr']; ?></span>
                                    <span class="date-day"><?php echo $dateInfo['day']; ?></span>
                                    <span class="date-weekday"><?php echo $dateInfo['weekday']; ?></span>
                                </div>

                                <!-- Center Info -->
                                <div class="event-info">
                                    <div class="artist-header">
                                         <h2 class="artist-name"><?php echo htmlspecialchars($event['artist_name']); ?></h2>
                                         <button type="button" class="btn-listen" data-artist="<?php echo htmlspecialchars($event['artist_name']); ?>">
                                             🎧 Listen
                                         </button>
                                         <button type="button" class="btn-listen btn-insights" data-artist="<?php echo htmlspecialchars($event['artist_name']); ?>" style="margin-left: 0.5rem; display: inline-flex; align-items: center; gap: 0.25rem;">
                                             ℹ️ Band Insights
                                         </button>
                                     </div>
                                     <?php if (!empty($event['tags']) || (isset($event['price_min']) && $event['price_min'] !== null) || !empty($event['price_dropped_flag']) || !empty($event['low_ticket_flag'])): ?>
                                         <div class="tags-row" style="margin-top: 0.15rem; margin-bottom: 0.65rem;">

                                             <?php if (isset($event['price_min']) && $event['price_min'] !== null): 
                                                 $pMin = $event['price_min'];
                                                 $pMax = $event['price_max'] ?? null;
                                                 if ($pMin < 30) {
                                                     $tier = '$';
                                                     $tierClass = 'price-low';
                                                     $tierText = 'Budget-Friendly';
                                                 } elseif ($pMin <= 60) {
                                                     $tier = '$$';
                                                     $tierClass = 'price-mid';
                                                     $tierText = 'Moderate';
                                                 } else {
                                                     $tier = '$$$';
                                                     $tierClass = 'price-high';
                                                     $tierText = 'Premium';
                                                 }
                                                 $tooltipText = "Est: $" . number_format($pMin, 2);
                                                 if ($pMax && $pMax > $pMin) {
                                                     $tooltipText .= " - $" . number_format($pMax, 2);
                                                 }
                                             ?>
                                                 <span class="badge-price <?php echo $tierClass; ?>" title="<?php echo htmlspecialchars($tooltipText . ' (' . $tierText . ')'); ?>">
                                                     💵 <?php echo $tier; ?>
                                                 </span>
                                             <?php endif; ?>

                                             <?php if (!empty($event['price_dropped_flag'])):
                                                 $dropAmount = isset($event['price_drop_amount']) ? (float)$event['price_drop_amount'] : 0;
                                                 $dropDetectedAt = $event['price_drop_detected_at'] ?? null;
                                                 $dropTooltip = 'Recent ticket price drop detected during sync.';
                                                 if ($dropAmount > 0) {
                                                     $dropTooltip .= ' Down by $' . number_format($dropAmount, 2) . '.';
                                                 }
                                                 if (!empty($dropDetectedAt)) {
                                                     $dropTooltip .= ' Triggered: ' . date('M j, g:i A', strtotime($dropDetectedAt)) . '.';
                                                 }
                                             ?>
                                                 <span class="badge-price-alert alert-drop alert-pulse" title="<?php echo htmlspecialchars($dropTooltip); ?>">
                                                     ⬇ Price Dropped
                                                 </span>
                                             <?php endif; ?>

                                             <?php if (!empty($event['low_ticket_flag'])): ?>
                                                 <span class="badge-price-alert alert-low-ticket alert-pulse" title="Low ticket inventory warning from source API.">
                                                     ! Low Tickets
                                                 </span>
                                             <?php endif; ?>
                                             
                                             <?php if (!empty($event['tags'])): ?>
                                                 <?php foreach (explode(',', $event['tags']) as $tag): 
                                                     $tag = trim($tag);
                                                     if (empty($tag)) continue;
                                                 ?>
                                                     <span class="tag-pill"><?php echo htmlspecialchars($tag); ?></span>
                                                 <?php endforeach; ?>
                                             <?php endif; ?>
                                         </div>
                                     <?php endif; ?>
                                    <div class="venue-row">
                                        <span>📍</span>
                                        <strong class="clickable-venue" data-venue-name="<?php echo htmlspecialchars($event['venue_name']); ?>"><?php echo htmlspecialchars($event['venue_name']); ?></strong> 
                                        <span style="color: var(--text-muted);">// <?php echo htmlspecialchars(formatMarketLocation($event['city_name'] ?? '', $event['market'] ?? $activeMarket)); ?></span>
                                    </div>
                                    <div class="time-row" style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                                        <span>⏱️</span>
                                        <span>Show starts at <?php echo $dateInfo['time']; ?></span>
                                        <span class="weather-container" data-venue="<?php echo htmlspecialchars($event['venue_name']); ?>" data-start="<?php echo htmlspecialchars($event['start_time']); ?>"></span>
                                    </div>
                                    <?php if (!empty($event['tags'])): ?>
                                        <div style="font-size: 0.65rem; color: var(--text-muted); margin-top: 0.5rem; font-style: italic;">
                                            *Subgenre tags auto-imported from MusicBrainz / Ticketmaster API
                                        </div>
                                    <?php endif; ?>
                                </div>

                                <div class="ticket-stub">
                                    <?php if (!empty($ticketUrl)): ?>
                                        <a href="<?php echo htmlspecialchars($ticketUrl); ?>" target="_blank" class="btn-tickets">
                                            Get Tickets
                                        </a>
                                    <?php else: ?>
                                        <a href="https://www.google.com/search?q=<?php echo urlencode($event['artist_name'] . ' concert ' . $event['venue_name']); ?>" target="_blank" class="btn-tickets secondary">
                                            Search Tickets
                                        </a>
                                    <?php endif; ?>
                                     
                                     <div class="ticket-action-row">
                                         <a href="ical.php?event_id=<?php echo $event['event_id']; ?>" class="btn-ticket-action" title="Add to Calendar">
                                             📅
                                         </a>
                                         <button type="button" 
                                                 class="btn-ticket-action btn-view-setlist" 
                                                 data-id="<?php echo $event['event_id']; ?>"
                                                 data-artist="<?php echo htmlspecialchars($event['artist_name']); ?>"
                                                 data-date="<?php echo htmlspecialchars($event['start_time']); ?>"
                                                 data-venue="<?php echo htmlspecialchars($event['venue_name']); ?>"
                                                 data-city="<?php echo htmlspecialchars($event['city_name']); ?>"
                                                 title="View Setlist">
                                             🎵
                                         </button>
                                         <button type="button" 
                                                 class="btn-ticket-action btn-interested-toggle" 
                                                 data-id="<?php echo $event['event_id']; ?>"
                                                 data-artist="<?php echo htmlspecialchars($event['artist_name']); ?>"
                                                 data-venue="<?php echo htmlspecialchars($event['venue_name']); ?>"
                                                 data-city="<?php echo htmlspecialchars($event['city_name']); ?>"
                                                 data-start="<?php echo htmlspecialchars($event['start_time']); ?>"
                                                 data-tags="<?php echo htmlspecialchars($event['tags'] ?? ''); ?>"
                                                 title="Mark as Interested">
                                             ☆
                                         </button>
                                      </div>
                                </div>
                                <!-- Audio Preview Drawer -->
                                <div class="audio-drawer" style="display: none;"></div>
                                
                                <!-- Artist Insights Drawer -->
                                <div class="insights-drawer-wrapper">
                                    <div class="insights-drawer"></div>
                                </div>
                            </article>
                        <?php endforeach; ?>

                    </div>
                <?php endforeach; ?>

                <div id="interested-view" class="calendar-view"></div>

            <?php endif; ?>
        </section>
    </main>

    <footer style="text-align: center; padding: 2rem 1rem; border-top: 1px solid rgba(255,255,255,0.05); margin-top: 3rem;">
        <p style="font-size: 0.8rem; color: var(--text-muted);">
            <?php echo htmlspecialchars($activeMarketConfig['title']); ?> &copy; <?php echo date('Y'); ?>.
        </p>
    </footer>

    <script id="venue-data" type="application/json"><?php echo json_encode($venuesList, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT); ?></script>
    <script id="genre-buckets-data" type="application/json"><?php echo json_encode($genreBuckets, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT); ?></script>
    <script type="module" src="assets/js/app.js?v=9"></script>
</body>
</html>
