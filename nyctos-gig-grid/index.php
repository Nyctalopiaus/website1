<?php
/**
 * Frontend Interface - Nycto's Gig Grid
 */
header_remove('X-Powered-By');
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/genre_buckets.php';
require_once __DIR__ . '/ignored_tags.php';

if (!headers_sent()) {
    header("Content-Security-Policy: default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'self'; form-action 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com https://*.mzstatic.com; connect-src 'self' https://api.open-meteo.com https://itunes.apple.com; media-src 'self' https://*.itunes.apple.com https://*.apple.com https://*.mzstatic.com; upgrade-insecure-requests");
    header('X-Content-Type-Options: nosniff');
    header('X-Frame-Options: SAMEORIGIN');
    header('Referrer-Policy: strict-origin-when-cross-origin');
    header('Permissions-Policy: geolocation=(), microphone=(), camera=()');
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('Pragma: no-cache');
    header('Expires: 0');
}

$db = getDbConnection();
$genreBuckets = getGenreBucketConfig();
$ignoredTags = getIgnoredTagsNormalized();

$allowedMarkets = ['front-range', 'socal', 'scotland'];
$marketAliases = [
    'california' => 'socal',
    'southern-california' => 'socal',
    'southern california' => 'socal',
    'ca' => 'socal',
    'frontrange' => 'front-range'
];
$requestedMarketRaw = strtolower(trim((string)($_GET['market'] ?? $_COOKIE['market'] ?? 'front-range')));
$requestedMarket = $marketAliases[$requestedMarketRaw] ?? $requestedMarketRaw;
if (!in_array($requestedMarket, $allowedMarkets, true)) {
    $requestedMarket = 'front-range';
}
$activeMarket = $requestedMarket;
if (($_COOKIE['market'] ?? null) !== $activeMarket) {
    setcookie('market', $activeMarket, time() + (86400 * 30), '/');
}

$marketConfig = [
    'front-range' => [
        'title' => "Nycto's Gig Grid - Colorado Live Music Grid",
        'region_name' => 'Colorado Live Gig Grid',
        'logo_text' => "Nycto's Gig Grid",
        'intro' => 'Everything you usually have to hunt down, lineup, venue, setlist, and your plan, all in one place.'
    ],
    'socal' => [
        'title' => "Nycto's Gig Grid - California Live Music Grid",
        'region_name' => 'California Live Gig Grid',
        'logo_text' => "Nycto's Gig Grid",
        'intro' => 'Everything you usually have to hunt down, lineup, venue, setlist, and your plan, all in one place.'
    ],
    'scotland' => [
        'title' => "Nycto's Gig Grid - UK Live Music Grid",
        'region_name' => 'UK Live Gig Grid',
        'logo_text' => "Nycto's Gig Grid",
        'intro' => 'Everything you usually have to hunt down, lineup, venue, setlist, and your plan, all in one place.'
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

$marketDisplayLabels = [
    'front-range' => '🏔️ Colorado',
    'socal' => '🌴 California',
    'scotland' => '🇬🇧 UK',
];

$marketCardCounts = array_fill_keys($allowedMarkets, 0);
$marketCountsStmt = $db->query(
    "
    SELECT COALESCE(NULLIF(TRIM(market), ''), 'front-range') AS market_key,
           COUNT(DISTINCT LOWER(TRIM(venue_name)) || '|' || date(start_time)) AS grouped_card_count
    FROM events
    WHERE status = 'Approved'
    GROUP BY market_key
    "
);
if ($marketCountsStmt !== false) {
    foreach ($marketCountsStmt->fetchAll(PDO::FETCH_ASSOC) as $countRow) {
        $marketKey = strtolower(trim((string)($countRow['market_key'] ?? 'front-range')));
        if (!array_key_exists($marketKey, $marketCardCounts)) {
            continue;
        }
        $marketCardCounts[$marketKey] = (int)($countRow['grouped_card_count'] ?? 0);
    }
}

// Fetch unique months containing upcoming events in the SQLite database.
$monthsStmt = $db->prepare("
    SELECT DISTINCT strftime('%Y-%m', start_time) AS event_month 
    FROM events 
    WHERE market = :market
      AND start_time >= datetime('now', '-4 hours') 
    ORDER BY event_month ASC
");
$monthsStmt->execute([':market' => $activeMarket]);
$activeMonths = $monthsStmt->fetchAll(PDO::FETCH_COLUMN);

// Group events by month.
$eventsByMonth = [];
foreach ($activeMonths as $month) {
    $stmt = $db->prepare("
        SELECT e.*, COALESCE(sv.city_name, '') AS city_name
        FROM events e
        LEFT JOIN scraped_venues sv ON (e.venue_id = sv.id OR LOWER(TRIM(e.venue_name)) = LOWER(TRIM(sv.venue_name)))
        WHERE e.market = :market
          AND strftime('%Y-%m', e.start_time) = :month 
          AND e.start_time >= datetime('now', '-4 hours') 
        ORDER BY e.start_time ASC
");
    $stmt->execute([
        ':market' => $activeMarket,
        ':month' => $month
    ]);
    $events = $stmt->fetchAll();
    if (!empty($events)) {
        $eventsByMonth[$month] = $events;
    }
}

$activeMonths = array_keys($eventsByMonth);

$allActiveBucketTags = [];
foreach ($genreBuckets as $bKey => $bConfig) {
    if (!empty($bConfig['tags'])) {
        foreach ($bConfig['tags'] as $t) {
            $allActiveBucketTags[strtolower($t)] = true;
        }
    }
}



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

function resolveEventCardCity($event) {
    $cName = trim((string)($event['city_name'] ?? $event['city'] ?? ''));
    if ($cName !== '') return ucwords(strtolower($cName));
    $vName = strtolower(trim((string)($event['venue_name'] ?? '')));
    if (strpos($vName, 'red rocks') !== false) return 'Morrison';
    if (strpos($vName, 'fiddler') !== false) return 'Greenwood Village';
    if (strpos($vName, 'gothic') !== false) return 'Englewood';
    if (strpos($vName, 'mission ballroom') !== false || strpos($vName, 'ogden') !== false || strpos($vName, 'bluebird') !== false || strpos($vName, 'cervantes') !== false || strpos($vName, 'summit') !== false || strpos($vName, 'marquis') !== false) return 'Denver';
    if (strpos($vName, 'boulder') !== false || strpos($vName, 'fox theatre') !== false) return 'Boulder';
    return ucwords($vName);
}

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
    $lastSyncTime = trim((string) file_get_contents($lastSyncFile));
    $timestamp = strtotime($lastSyncTime);
    if ($timestamp === false) {
        $timestamp = @filemtime($lastSyncFile);
    }
    if ($timestamp !== false) {
        $lastSyncText = date('M j, g:i A', (int) $timestamp);
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title><?php echo htmlspecialchars($activeMarketConfig['title']); ?> // Live Show Intelligence</title>
    <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🤘</text></svg>" />
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
    <link rel="stylesheet" href="styles.css?v=<?php echo filemtime(__DIR__ . '/styles.css'); ?>" />
</head>
<body data-market="<?php echo htmlspecialchars($activeMarket); ?>">

    <!-- Dynamic Ingestion Loading Screen -->
    <div id="sync-overlay" class="sync-overlay">
        <span class="loader"></span>
        <h3 class="sync-overlay-title">Syncing Stage Data...</h3>
        <p class="sync-overlay-subtitle">Fetching raw schedules from Ticketmaster & Bandsintown APIs...</p>
        <div id="sync-logs" class="sync-logs"></div>
        <button id="btn-close-sync" class="btn-action sync-close-button">Close &amp; Refresh</button>
    </div>

    <!-- Venue Information Popup Modal -->
    <div id="venue-modal" class="sync-overlay modal-overlay">
        <div class="modal-content modal-card modal-card-venue">
            <button id="btn-close-venue" class="modal-close-button" type="button">&times;</button>
            
            <h2 id="venue-modal-name" class="modal-title modal-title-venue">Venue Name</h2>
            
            <div class="modal-field">
                <label class="modal-label">📍 Address / Location:</label>
                <div id="venue-modal-address" class="modal-field-value">Address</div>
            </div>
            
            <div class="modal-actions modal-actions-right modal-actions-spacious">
                <a id="venue-modal-maps" href="#" target="_blank" class="btn-tickets btn-tickets-compact">
                    🗺️ Google Maps (New Tab)
                </a>
            </div>
        </div>
    </div>


    <!-- Setlist.fm Popup Modal -->
    <div id="setlist-modal" class="sync-overlay modal-overlay">
        <div class="modal-content modal-card modal-card-setlist">
            <button id="btn-close-setlist" class="modal-close-button" type="button">&times;</button>
            
            <h2 id="setlist-modal-title" class="modal-title modal-title-setlist">Concert Setlist</h2>
            <div id="setlist-modal-meta" class="setlist-modal-meta">Artist // Date // Venue</div>
            
            <div id="setlist-songs-container">
                <!-- Songs will be populated here -->
            </div>
            
            <div class="setlist-modal-footnote">
                Provided by <a href="https://www.setlist.fm" target="_blank" class="setlist-source-link">setlist.fm</a>
            </div>
        </div>
    </div>

    <!-- Email Interested Shows Modal -->
    <div id="email-modal" class="sync-overlay modal-overlay">
        <div class="modal-content modal-card modal-card-email">
            <button id="btn-close-email" class="modal-close-button" type="button">&times;</button>
            
            <h2 class="modal-title">Email Interested Shows</h2>
            
            <!-- Explicit Modal Privacy Notice -->
            <div class="modal-privacy-notice">
                <span class="modal-privacy-icon">🔒</span>
                <div>
                    <strong class="modal-privacy-heading">100% Private & Dispatch-Only</strong>
                    Your email address is used for this one-time dispatch only. It is not stored in our database, nor will it ever be shared or used for marketing.
                </div>
            </div>
            
            <div id="email-error" class="modal-alert modal-alert-error"></div>
            <div id="email-success" class="modal-alert modal-alert-success"></div>
            
            <form id="email-form">
                <div class="form-field-lg">
                    <label class="form-label-upper">Your Email Address</label>
                    <input type="email" id="email-input-field" class="form-input-dark" required placeholder="name@domain.com" />
                </div>
                
                <div class="modal-actions modal-actions-right">
                    <button type="button" id="btn-cancel-email" class="btn-tickets secondary btn-tickets-compact">Cancel</button>
                    <button type="submit" id="btn-submit-email" class="btn-tickets btn-tickets-compact btn-tickets-highlight">
                        ✉️ Send Interested Shows
                    </button>
                </div>
            </form>
        </div>
    </div>

    <!-- Contact Nycto Modal Window -->
    <div id="contact-modal" class="sync-overlay modal-overlay">
        <div class="modal-content modal-card modal-card-contact">
            <button id="btn-close-contact" type="button" class="modal-close-button">&times;</button>
            
            <h2 class="modal-title modal-title-with-icon">
                <span>📧</span> Contact Nycto
            </h2>
            <p class="modal-subtext">Got feedback, a missing venue, or site suggestion? Drop a message below!</p>
            
            <form id="contact-form" onsubmit="return false;">
                <div class="form-field-md">
                    <label class="form-label-upper form-label-tight">Topic / What is this about?</label>
                    <select id="contact-subject" class="filter-select form-select-full">
                        <option value="Site Functionality / Feature Request">💡 Site Functionality / Feature Request</option>
                        <option value="Missing Band / Artist">🎸 Missing Band / Artist</option>
                        <option value="Missing Venue">📍 Missing Venue</option>
                        <option value="Data Error / Wrong Show Info">⚠️ Data Error / Wrong Show Info</option>
                        <option value="Other / General Feedback">💬 Other / General Feedback</option>
                    </select>
                </div>
                
                <div class="form-field-md">
                    <label class="form-label-upper form-label-tight">Your Email (Optional, if you'd like a reply)</label>
                    <input type="email" id="contact-email" class="form-input-dark form-input-md" placeholder="name@example.com" />
                </div>
                
                <div class="form-field-stack">
                    <div class="form-field-head">
                        <label class="form-label-upper form-label-tight">Message</label>
                        <span id="contact-char-count" class="contact-char-count">0 / 500</span>
                    </div>
                    <textarea id="contact-message" maxlength="500" rows="4" class="form-textarea-dark" placeholder="Type your message here..."></textarea>
                </div>
                
                <div id="contact-status-msg" class="contact-status-msg"></div>
                
                <div class="modal-actions modal-actions-right">
                    <button type="button" id="btn-submit-contact" class="btn-tickets btn-tickets-compact btn-tickets-highlight btn-submit-contact">
                        Send Message 🚀
                    </button>
                </div>
            </form>
        </div>
    </div>

    <!-- Feature Overview Modal -->
    <div id="features-modal" class="sync-overlay modal-overlay">
        <div class="modal-content feature-modal-content">
            <button id="btn-close-features" class="modal-close-button" aria-label="Close feature overview">&times;</button>

            <h2 class="feature-modal-title">What Nycto's Gig Grid Can Do</h2>
            <p class="feature-modal-intro">A fast, live-music calendar built to help you find shows, compare options, and move from discovery to planning without jumping between five tabs.</p>

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
    <header class="container header header-compact">
        <div class="header-nav">
            <a href="../index.html" class="btn-back">← Back to Lab</a>
            <a href="../" class="logo">
                <span class="logo-icon">🤘</span>
                <span class="logo-text"><?php echo htmlspecialchars($activeMarketConfig['logo_text']); ?></span>
            </a>
            <button type="button" id="btn-toggle-intro" class="btn-info-badge" title="Show market info & quick start">
                <span>ℹ️</span> <span>Info</span>
            </button>
        </div>
        <div class="controls-group">
            <button type="button" id="btn-open-features" class="privacy-feature-button" title="View site features">
                <span class="privacy-feature-button-icon">◌</span>
                <span>Features</span>
            </button>
        </div>
    </header>

    <main class="container">
        <!-- Collapsible Info & Quick Start Drawer -->
        <div id="intro-drawer" class="intro-drawer-panel hidden">
            <div class="intro-drawer-inner">
                <p class="intro-drawer-copy"><?php echo htmlspecialchars($activeMarketConfig['intro']); ?></p>
                <div class="quick-start-strip" aria-label="Quick start">
                    <span class="quick-start-label">Quick Start</span>
                    <span class="quick-start-step">1) Pick a market</span>
                    <span class="quick-start-step">2) Search or filter</span>
                    <span class="quick-start-step">3) Star and email interested shows</span>
                </div>
            </div>
        </div>

        <!-- Tightened Unified Sticky Controls Wrapper -->
        <div class="sticky-controls-wrapper" style="width: 100%; box-sizing: border-box;">
            <!-- Row 1: Market Tabs (Left) + Month Selection (Far Right Edge) -->
            <div class="controls-row-primary" style="display: flex; align-items: center; justify-content: space-between; width: 100%; gap: 0.75rem; margin-bottom: 0.5rem; flex-wrap: nowrap;">
                <nav class="header-market-switcher" style="margin: 0; flex: 0 0 auto;" aria-label="Market selector">
                    <a href="<?php echo htmlspecialchars($marketLinks['front-range']); ?>" class="header-market-link <?php echo $activeMarket === 'front-range' ? 'active' : ''; ?>" <?php echo $activeMarket === 'front-range' ? 'aria-current="page"' : ''; ?>><?php echo htmlspecialchars($marketDisplayLabels['front-range'] . ' (' . $marketCardCounts['front-range'] . ')'); ?></a>
                    <a href="<?php echo htmlspecialchars($marketLinks['socal']); ?>" class="header-market-link <?php echo $activeMarket === 'socal' ? 'active' : ''; ?>" <?php echo $activeMarket === 'socal' ? 'aria-current="page"' : ''; ?>><?php echo htmlspecialchars($marketDisplayLabels['socal'] . ' (' . $marketCardCounts['socal'] . ')'); ?></a>
                    <a href="<?php echo htmlspecialchars($marketLinks['scotland']); ?>" class="header-market-link <?php echo $activeMarket === 'scotland' ? 'active' : ''; ?>" <?php echo $activeMarket === 'scotland' ? 'aria-current="page"' : ''; ?>><?php echo htmlspecialchars($marketDisplayLabels['scotland'] . ' (' . $marketCardCounts['scotland'] . ')'); ?></a>
                </nav>

                <div class="month-select-controls" style="margin-left: auto; flex: 0 0 auto;">
                    <select id="month-dropdown-select">
                        <?php if (empty($activeMonths)): ?>
                            <option value="empty-view">No Shows Found</option>
                        <?php else: ?>
                            <?php foreach ($activeMonths as $index => $month): ?>
                                <option value="month-<?php echo $month; ?>" <?php echo $index === 0 ? 'selected' : ''; ?>>
                                    📅 <?php echo formatMonthName($month); ?>
                                </option>
                            <?php endforeach; ?>
                            <option id="interested-dropdown-option" value="interested-view">⭐ Interested Shows (0)</option>
                        <?php endif; ?>
                    </select>
                </div>
            </div>

            <!-- Row 2: Region Toggles (Left) + Venue Select + Genre Select (Far Right) -->
            <div class="controls-row-secondary" style="display: flex; align-items: center; justify-content: space-between; width: 100%; gap: 0.5rem; margin-bottom: 0.5rem; flex-wrap: nowrap;">
                <div class="region-controls" style="display: flex; align-items: center; gap: 0.35rem; flex: 0 0 auto;">
                    <button class="region-btn active" data-region="all">All</button>
                    <?php if ($activeMarket === 'front-range'): ?>
                        <button class="region-btn" data-region="denver">Denver / Boulder</button>
                        <button class="region-btn" data-region="springs">Springs / Pueblo</button>
                        <button class="region-btn" data-region="north">Ft Collins / North</button>
                        <button class="region-btn" data-region="west">West Slope / Grand Junction</button>
                    <?php elseif ($activeMarket === 'socal'): ?>
                        <button class="region-btn" data-region="norcal">NorCal / Bay Area</button>
                        <button class="region-btn" data-region="la">Los Angeles</button>
                        <button class="region-btn" data-region="oc">Orange County</button>
                        <button class="region-btn" data-region="sd">San Diego</button>
                    <?php elseif ($activeMarket === 'scotland'): ?>
                        <button class="region-btn" data-region="scotland">Scotland</button>
                        <button class="region-btn" data-region="england">England</button>
                        <button class="region-btn" data-region="wales">Wales</button>
                        <button class="region-btn" data-region="ireland">Ireland</button>
                    <?php endif; ?>
                </div>

                <div class="dropdown-filters-group" style="display: flex; align-items: center; gap: 0.5rem; margin-left: auto; flex: 0 0 auto;">
                    <div class="dropdown-wrapper">
                        <button id="venue-dropdown-toggle">
                            <span id="venue-selected-count">All Venues</span>
                            <span class="dropdown-caret-sm">▼</span>
                        </button>
                        <div id="venue-dropdown-menu">
                            <div class="venue-dropdown-header">
                                <input type="text" id="venue-search-input" placeholder="🔍 Search venues..." />
                                <div class="venue-dropdown-actions">
                                    <button type="button" id="btn-venue-select-all">Select All</button>
                                    <button type="button" id="btn-venue-clear-all">Clear All</button>
                                </div>
                            </div>
                            <div id="venue-checkboxes-list"></div>
                        </div>
                    </div>

                    <div class="genre-filter-group">
                        <select id="genre-select">
                            <?php foreach ($genreBuckets as $bucketKey => $bucket): ?>
                                <option value="<?php echo htmlspecialchars($bucketKey); ?>"><?php echo htmlspecialchars($bucket['label']); ?></option>
                            <?php endforeach; ?>
                        </select>
                        <button type="button" id="genre-help-trigger" class="genre-help-trigger" aria-label="Genre filter help" title="Genre info & definitions">?</button>
                        <div id="genre-help-panel" class="genre-help-panel" role="note" aria-live="polite">
                            <div id="genre-help-title" class="genre-help-title"><?php echo htmlspecialchars($genreBuckets['all']['label']); ?></div>
                            <div id="genre-help-text" class="genre-help-text"><?php echo htmlspecialchars($genreBuckets['all']['title']); ?></div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Row 3: Full-width Search Input (Left) + Compact Action Buttons (Right) -->
            <div class="controls-row-actions" style="display: flex; align-items: center; justify-content: space-between; width: 100%; gap: 0.75rem; margin-top: 0.4rem; flex-wrap: nowrap;">
                <div class="search-input-wrap" style="flex: 1 1 auto; width: 100%; max-width: none; min-width: 150px; margin-right: 0.5rem;">
                    <input type="text" id="artist-search-input" style="width: 100%; height: 36px; box-sizing: border-box;" placeholder="🔍 Search band, venue, subgenre..." />
                    <button type="button" id="btn-clear-search" aria-label="Clear search" title="Clear search">&times;</button>
                </div>

                <div class="filter-actions-group" style="display: flex; align-items: center; gap: 0.45rem; flex: 0 0 auto; margin-left: auto;">
                    <button type="button" id="btn-interested-filter" class="btn-premium-filter btn-premium-filter--secondary">
                        <span class="btn-premium-filter-icon">⭐</span>
                        <span class="btn-premium-filter-label">Interested</span>
                    </button>
                    <button type="button" id="btn-email-passport" class="btn-premium-filter btn-premium-filter--secondary" title="Email interested shows (100% Private & Dispatch-Only)">
                        <span class="btn-premium-filter-icon">✉️</span>
                        <span class="btn-premium-filter-label">Email</span>
                    </button>
                    <button type="button" id="btn-reset-ignored" class="btn-premium-filter btn-premium-filter--secondary btn-reset-ignored" title="Reset ignored shows">
                        <span class="btn-premium-filter-icon">🔄</span>
                        <span class="btn-premium-filter-label" id="reset-ignored-label">Reset Ignored (0)</span>
                    </button>
                </div>
            </div>

            <!-- Compact Live Filter Summary Line -->
            <div id="live-filter-summary" class="live-filter-summary live-filter-summary-compact" role="status" aria-live="polite">
                <span class="summary-chip summary-chip-market" id="summary-market">Market: <?php echo htmlspecialchars($marketDisplayLabels[$activeMarket] ?? 'Colorado'); ?></span>
                <span class="summary-chip" id="summary-results">Visible shows: 0</span>
                <span class="summary-chip" id="summary-filters">Filters: default</span>
                <span class="privacy-inline-badge" title="Your data is processed locally. Emails are used for one-time dispatch only.">🔒 100% Private</span>
            </div>
        </div>

        <!-- Calendar Events Listings -->
        <section class="events-content">
            <?php if (empty($activeMonths)): ?>
                <div id="empty-view" class="calendar-view active">
                    <div class="no-events">
                        <div class="no-events-icon">🤘</div>
                        <h3 class="no-events-title">The Stage is Dark</h3>
                        <p class="no-events-copy">No upcoming shows are loaded. Click the "Sync Live Gigs" button in the corner to trigger the aggregator script.</p>
                    </div>
                </div>
            <?php else: ?>
                <?php 
                // Helper to split multi-artist names
                function splitArtistListNames($artistNameStr) {
                    $junkPatterns = '/(club level|vip package|suite level|parking pass|fast pass|official platinum|lexus club)/i';
                    $parts = preg_split('/\s*(&|w\/|with|,)\s*/i', (string)$artistNameStr);
                    $artists = [];
                    foreach ($parts as $p) {
                        $clean = trim($p);
                        if ($clean !== '' && !preg_match($junkPatterns, $clean) && !in_array($clean, $artists, true)) {
                            $artists[] = $clean;
                        }
                    }
                    return !empty($artists) ? $artists : [trim((string)$artistNameStr)];
                }

                // Pre-calculate multi-day artist residencies (same artist at same venue across 2+ distinct dates)
                $residencyCounts = [];
                foreach ($eventsByMonth as $mMonth => $mEvents) {
                    foreach ($mEvents as $mEv) {
                        $mArtists = splitArtistListNames($mEv['artist_name']);
                        foreach ($mArtists as $mArt) {
                            $aKey = strtolower(trim($mArt));
                            $vKey = strtolower(trim((string)$mEv['venue_name']));
                            $dKey = date('Y-m-d', strtotime($mEv['start_time']));
                            $comboKey = $aKey . '||' . $vKey;
                            
                            if (!isset($residencyCounts[$comboKey])) {
                                $residencyCounts[$comboKey] = [];
                            }
                            if (!in_array($dKey, $residencyCounts[$comboKey], true)) {
                                $residencyCounts[$comboKey][] = $dKey;
                            }
                        }
                    }
                }
                ?>
                <!-- Approved Month Event Listings (Default strict mode applies to this calendar container) -->
                <?php foreach ($activeMonths as $index => $month): ?>
                    <div id="month-<?php echo $month; ?>" class="calendar-view strict-mode <?php echo $index === 0 ? 'active' : ''; ?>">
                        <?php 
                        // Group events by venue + date for co-headliners/lineups
                        $groupedEvents = [];
                        foreach ($eventsByMonth[$month] as $eventItem) {
                            $dateKey = date('Y-m-d', strtotime($eventItem['start_time']));
                            $timeKey = date('H:i', strtotime($eventItem['start_time']));
                            $venueKey = strtolower(trim((string)$eventItem['venue_name']));
                            $eventGenre = strtolower((string)($eventItem['genre'] ?? 'all'));
                            
                            if ($eventGenre === 'special_event' || ($timeKey !== '00:00' && $timeKey !== '12:00')) {
                                $groupKey = $venueKey . '_' . $dateKey . '_' . $timeKey . '_' . md5($eventItem['artist_name']);
                            } else {
                                $groupKey = $venueKey . '_' . $dateKey;
                            }
                            $eventTags = filterIgnoredTagsArray(
                                splitNormalizedTags($eventItem['tags'] ?? ''),
                                $ignoredTags
                            );
                            $eventArtists = splitArtistListNames($eventItem['artist_name']);
                            
                            if (!isset($groupedEvents[$groupKey])) {
                                $groupedEvents[$groupKey] = [
                                    'primary' => $eventItem,
                                    'artists' => $eventArtists,
                                    'events' => [$eventItem],
                                    'tags' => $eventTags,
                                ];
                            } else {
                                foreach ($eventArtists as $aName) {
                                    if (!in_array($aName, $groupedEvents[$groupKey]['artists'], true)) {
                                        $groupedEvents[$groupKey]['artists'][] = $aName;
                                    }
                                }
                                $groupedEvents[$groupKey]['events'][] = $eventItem;
                                foreach ($eventTags as $t) {
                                    if (!in_array($t, $groupedEvents[$groupKey]['tags'], true)) {
                                        $groupedEvents[$groupKey]['tags'][] = $t;
                                    }
                                }
                            }
                        }

                        $cardIndex = 0;
                        $inDeferredTemplate = false;
                        foreach ($groupedEvents as $group): 
                            $cardIndex++;
                            if ($cardIndex === 16) {
                                $inDeferredTemplate = true;
                                echo '<template class="deferred-cards-template">';
                            }
                            $event = $group['primary'];
                            $dateInfo = getEventDateDetails($event['start_time']);
                            $ticketUrl = $event['ticket_url'];
                            $isCoheadliner = count($group['artists']) > 1;
                            $availabilityTag = trim((string)($event['availability_tag'] ?? ''));
                            $combinedTagsStr = implode(', ', $group['tags']);
                            $searchBlob = strtolower(trim(implode(' ', array_filter([
                                implode(' ', $group['artists']),
                                (string)($event['artist_name'] ?? ''),
                                (string)($event['venue_name'] ?? ''),
                                (string)($event['city_name'] ?? ''),
                                $combinedTagsStr
                            ]))));

                            // Check for Multi-Day Stand / Residency
                            $isMultiDayResidency = false;
                            $residencyNightCount = 0;
                            foreach ($group['artists'] as $artName) {
                                $comboKey = strtolower(trim($artName)) . '||' . strtolower(trim((string)$event['venue_name']));
                                if (isset($residencyCounts[$comboKey]) && count($residencyCounts[$comboKey]) > 1) {
                                    $isMultiDayResidency = true;
                                    $residencyNightCount = max($residencyNightCount, count($residencyCounts[$comboKey]));
                                }
                            }
                            $groupEventIdsStr = implode(',', array_column($group['events'], 'event_id'));
                        ?>
                            <article class="event-card" data-status="Approved" data-event-ids="<?php echo htmlspecialchars($groupEventIdsStr); ?>" data-city="<?php echo htmlspecialchars(resolveEventCardCity($event)); ?>" data-venue="<?php echo htmlspecialchars(strtolower($event['venue_name'])); ?>" data-genre="<?php echo htmlspecialchars(strtolower($event['genre'] ?? 'all')); ?>" data-tags="<?php echo htmlspecialchars(strtolower($combinedTagsStr)); ?>" data-search="<?php echo htmlspecialchars($searchBlob); ?>" id="card-<?php echo $event['event_id']; ?>">
                                <!-- Left Stub -->
                                <div class="date-stub">
                                    <div class="date-block-vertical">
                                        <span class="date-month"><?php echo $dateInfo['month_abbr']; ?></span>
                                        <span class="date-day"><?php echo $dateInfo['day']; ?></span>
                                        <span class="date-weekday"><?php echo $dateInfo['weekday']; ?></span>
                                    </div>
                                    <?php if ($availabilityTag !== ''): ?>
                                        <span class="event-availability-tag" title="Ticket availability status from source feed."><?php echo htmlspecialchars($availabilityTag); ?></span>
                                    <?php endif; ?>
                                    <button type="button" class="btn-ignore-event" data-event-ids="<?php echo htmlspecialchars($groupEventIdsStr); ?>" title="Hide this show from your view">
                                        <span class="btn-ignore-icon">🚫</span>
                                        <span class="btn-ignore-text">Ignore</span>
                                    </button>
                                </div>

                                <!-- Center Info -->
                                <div class="event-info">
                                    <?php 
                                        $eventTitleBanner = null;
                                        $filteredArtists = [];
                                        $eventGenre = strtolower((string)($event['genre'] ?? 'all'));
                                        $isSpecialEvent = ($eventGenre === 'special_event');

                                        foreach ($group['artists'] as $artName) {
                                            $aLower = strtolower(trim($artName));
                                            if (strpos($aLower, 'yoga') !== false || strpos($aLower, 'film on the rocks') !== false || strpos($aLower, 'nasa') !== false || strpos($aLower, 'run the rocks') !== false) {
                                                $isSpecialEvent = true;
                                            }
                                            if (in_array($aLower, ['k-love live', 'k-love live at red rocks', 'reggae on the rocks', 'run the rocks', 'film on the rocks', 'yoga on the rocks'], true)) {
                                                if (!$eventTitleBanner) {
                                                    $eventTitleBanner = strtoupper(trim($artName));
                                                }
                                            } else {
                                                $filteredArtists[] = $artName;
                                            }
                                        }

                                        if (empty($filteredArtists) && $eventTitleBanner) {
                                            $filteredArtists[] = $eventTitleBanner;
                                            $eventTitleBanner = null;
                                        }
                                    ?>

                                    <?php if ($eventTitleBanner): ?>
                                        <div class="event-title-badge">
                                            <span class="event-title-icon">🎟️</span> <span class="event-title-text"><?php echo htmlspecialchars($eventTitleBanner); ?></span>
                                        </div>
                                    <?php endif; ?>
                                    <?php if ($isCoheadliner): ?>
                                        <div class="artist-list">
                                            <?php foreach ($filteredArtists as $artIndex => $artName): ?>
                                                <?php if ($artIndex === 0): ?>
                                                    <div class="artist-line headliner-line">
                                                        <h2 class="artist-name"><?php echo htmlspecialchars($artName); ?></h2>
                                                        <?php if (!$isSpecialEvent): ?>
                                                        <div class="artist-line-actions inline-actions">
                                                            <button type="button" class="btn-listen" data-artist="<?php echo htmlspecialchars($artName); ?>">
                                                                🎧 Listen
                                                            </button>
                                                            <button type="button" class="btn-insights" data-artist="<?php echo htmlspecialchars($artName); ?>">
                                                                ℹ️ Artist Bio
                                                            </button>
                                                            <div class="artist-links-dropdown">
                                                                <button type="button" class="btn-links-toggle" data-artist="<?php echo htmlspecialchars($artName); ?>">
                                                                    🌐 Links <span class="dropdown-caret">▼</span>
                                                                </button>
                                                                <div class="links-popover">
                                                                    <a href="https://open.spotify.com/search/<?php echo rawurlencode($artName); ?>" target="_blank" rel="noopener noreferrer" class="link-item spotify">
                                                                        <span class="link-icon">🟢</span> Spotify
                                                                    </a>
                                                                    <a href="https://www.youtube.com/results?search_query=<?php echo rawurlencode($artName); ?>" target="_blank" rel="noopener noreferrer" class="link-item youtube">
                                                                        <span class="link-icon">🔴</span> YouTube
                                                                    </a>
                                                                    <a href="https://music.apple.com/us/search?term=<?php echo rawurlencode($artName); ?>" target="_blank" rel="noopener noreferrer" class="link-item applemusic">
                                                                        <span class="link-icon">🔵</span> Apple Music
                                                                    </a>
                                                                    <a href="https://www.last.fm/music/<?php echo rawurlencode($artName); ?>" target="_blank" rel="noopener noreferrer" class="link-item lastfm">
                                                                        <span class="link-icon">🟠</span> Last.fm
                                                                    </a>
                                                                    <a href="https://www.pandora.com/search/<?php echo rawurlencode($artName); ?>/all" target="_blank" rel="noopener noreferrer" class="link-item pandora">
                                                                        <span class="link-icon">🟣</span> Pandora
                                                                    </a>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <?php endif; ?>
                                                    </div>
                                                <?php else: ?>
                                                    <div class="artist-line supporting-line">
                                                        <span class="supporting-artist-name"><?php echo htmlspecialchars($artName); ?></span>
                                                        <?php if (!$isSpecialEvent): ?>
                                                        <div class="artist-line-actions inline-actions">
                                                            <button type="button" class="btn-listen" data-artist="<?php echo htmlspecialchars($artName); ?>">
                                                                🎧 Listen
                                                            </button>
                                                            <button type="button" class="btn-insights" data-artist="<?php echo htmlspecialchars($artName); ?>">
                                                                ℹ️ Artist Bio
                                                            </button>
                                                            <div class="artist-links-dropdown">
                                                                <button type="button" class="btn-links-toggle" data-artist="<?php echo htmlspecialchars($artName); ?>">
                                                                    🌐 Links <span class="dropdown-caret">▼</span>
                                                                </button>
                                                                <div class="links-popover">
                                                                    <a href="https://open.spotify.com/search/<?php echo rawurlencode($artName); ?>" target="_blank" rel="noopener noreferrer" class="link-item spotify">
                                                                        <span class="link-icon">🟢</span> Spotify
                                                                    </a>
                                                                    <a href="https://www.youtube.com/results?search_query=<?php echo rawurlencode($artName); ?>" target="_blank" rel="noopener noreferrer" class="link-item youtube">
                                                                        <span class="link-icon">🔴</span> YouTube
                                                                    </a>
                                                                    <a href="https://music.apple.com/us/search?term=<?php echo rawurlencode($artName); ?>" target="_blank" rel="noopener noreferrer" class="link-item applemusic">
                                                                        <span class="link-icon">🔵</span> Apple Music
                                                                    </a>
                                                                    <a href="https://www.last.fm/music/<?php echo rawurlencode($artName); ?>" target="_blank" rel="noopener noreferrer" class="link-item lastfm">
                                                                        <span class="link-icon">🟠</span> Last.fm
                                                                    </a>
                                                                    <a href="https://www.pandora.com/search/<?php echo rawurlencode($artName); ?>/all" target="_blank" rel="noopener noreferrer" class="link-item pandora">
                                                                        <span class="link-icon">🟣</span> Pandora
                                                                    </a>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <?php endif; ?>
                                                    </div>
                                                <?php endif; ?>
                                            <?php endforeach; ?>
                                        </div>
                                    <?php else: ?>
                                        <?php $singleArt = $filteredArtists[0] ?? 'Unknown Artist'; ?>
                                        <div class="artist-list">
                                            <div class="artist-line headliner-line">
                                                <h2 class="artist-name"><?php echo htmlspecialchars($singleArt); ?></h2>
                                                <?php if (!$isSpecialEvent): ?>
                                                <div class="artist-line-actions inline-actions">
                                                    <button type="button" class="btn-listen" data-artist="<?php echo htmlspecialchars($singleArt); ?>">
                                                        🎧 Listen
                                                    </button>
                                                    <button type="button" class="btn-insights" data-artist="<?php echo htmlspecialchars($singleArt); ?>">
                                                        ℹ️ Artist Bio
                                                    </button>
                                                    <div class="artist-links-dropdown">
                                                        <button type="button" class="btn-links-toggle" data-artist="<?php echo htmlspecialchars($singleArt); ?>">
                                                            🌐 Links <span class="dropdown-caret">▼</span>
                                                        </button>
                                                        <div class="links-popover">
                                                            <a href="https://open.spotify.com/search/<?php echo rawurlencode($singleArt); ?>" target="_blank" rel="noopener noreferrer" class="link-item spotify">
                                                                <span class="link-icon">🟢</span> Spotify
                                                            </a>
                                                            <a href="https://www.youtube.com/results?search_query=<?php echo rawurlencode($singleArt); ?>" target="_blank" rel="noopener noreferrer" class="link-item youtube">
                                                                <span class="link-icon">🔴</span> YouTube
                                                            </a>
                                                            <a href="https://music.apple.com/us/search?term=<?php echo rawurlencode($singleArt); ?>" target="_blank" rel="noopener noreferrer" class="link-item applemusic">
                                                                <span class="link-icon">🔵</span> Apple Music
                                                            </a>
                                                            <a href="https://www.last.fm/music/<?php echo rawurlencode($singleArt); ?>" target="_blank" rel="noopener noreferrer" class="link-item lastfm">
                                                                <span class="link-icon">🟠</span> Last.fm
                                                            </a>
                                                            <a href="https://www.pandora.com/search/<?php echo rawurlencode($singleArt); ?>/all" target="_blank" rel="noopener noreferrer" class="link-item pandora">
                                                                <span class="link-icon">🟣</span> Pandora
                                                            </a>
                                                        </div>
                                                    </div>
                                                </div>
                                                <?php endif; ?>
                                            </div>
                                        </div>
                                    <?php endif; ?>
                                     <div class="tags-row tags-row-spaced">
                                         <?php if ($isCoheadliner): ?>
                                             <span class="badge-price-alert alert-drop badge-shared-lineup" title="Multiple bands performing on the same stage tonight!">
                                                 🔥 Shared Lineup (<?php echo count($group['artists']); ?> Bands)
                                             </span>
                                         <?php endif; ?>

                                         <?php if ($isMultiDayResidency): ?>
                                             <span class="badge-price-alert alert-drop badge-multi-day" title="This artist is performing multiple nights at this venue!">
                                                 🗓️ Multi-Day Event! (<?php echo $residencyNightCount; ?> Nights)
                                             </span>
                                         <?php endif; ?>

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
                                         
                                         <?php if (!empty($group['tags'])): ?>
                                             <?php foreach ($group['tags'] as $tag): 
                                                 $tag = trim($tag);
                                                 if (empty($tag)) continue;
                                             ?>
                                                 <span class="tag-pill"><?php echo htmlspecialchars($tag); ?></span>
                                             <?php endforeach; ?>
                                         <?php endif; ?>
                                     </div>
                                    <div class="venue-row">
                                        <span>📍</span>
                                        <strong class="clickable-venue" data-venue-name="<?php echo htmlspecialchars($event['venue_name']); ?>"><?php echo htmlspecialchars($event['venue_name']); ?></strong> 
                                        <span class="venue-location-text">// <?php echo htmlspecialchars(formatMarketLocation(resolveEventCardCity($event), $event['market'] ?? $activeMarket)); ?></span>
                                    </div>
                                    <div class="time-row time-row-wrap">
                                        <span>⏱️</span>
                                        <span>Show starts at <?php echo $dateInfo['time']; ?></span>
                                        <span class="weather-container" data-venue="<?php echo htmlspecialchars($event['venue_name']); ?>" data-start="<?php echo htmlspecialchars($event['start_time']); ?>" data-is-outdoor="<?php echo isOutdoorVenue($event['venue_name']) ? '1' : '0'; ?>"></span>
                                    </div>
                                    <?php if (!empty($group['tags'])): ?>
                                        <div class="subgenre-source-note">
                                            *Subgenre tags auto-imported from Last.fm / Ticketmaster / Bandsintown
                                        </div>
                                    <?php endif; ?>
                                </div>

                                <div class="ticket-stub">
                                    <?php
                                        $ticketLinks = [];
                                        $addedUrls = [];

                                        if (!empty($event['venue_url']) && !in_array($event['venue_url'], $addedUrls, true)) {
                                            $ticketLinks[] = ['url' => $event['venue_url'], 'icon' => '🏢', 'name' => 'Venue Direct'];
                                            $addedUrls[] = $event['venue_url'];
                                        }
                                        if (!empty($event['ticketmaster_url']) && !in_array($event['ticketmaster_url'], $addedUrls, true)) {
                                            $ticketLinks[] = ['url' => $event['ticketmaster_url'], 'icon' => '🎫', 'name' => 'Ticketmaster'];
                                            $addedUrls[] = $event['ticketmaster_url'];
                                        }
                                        if (!empty($event['eventbrite_url']) && !in_array($event['eventbrite_url'], $addedUrls, true)) {
                                            $ticketLinks[] = ['url' => $event['eventbrite_url'], 'icon' => '🎟️', 'name' => 'Eventbrite'];
                                            $addedUrls[] = $event['eventbrite_url'];
                                        }
                                        if (!empty($event['bandsintown_url']) && !in_array($event['bandsintown_url'], $addedUrls, true)) {
                                            $ticketLinks[] = ['url' => $event['bandsintown_url'], 'icon' => '🎸', 'name' => 'Bandsintown'];
                                            $addedUrls[] = $event['bandsintown_url'];
                                        }
                                        if (!empty($ticketUrl) && !in_array($ticketUrl, $addedUrls, true)) {
                                            $ticketLinks[] = ['url' => $ticketUrl, 'icon' => '🎟️', 'name' => 'Primary Tickets'];
                                            $addedUrls[] = $ticketUrl;
                                        }
                                        if (empty($ticketLinks)) {
                                            $searchUrl = "https://www.google.com/search?q=" . urlencode($event['artist_name'] . ' concert ' . $event['venue_name']);
                                            $ticketLinks[] = ['url' => $searchUrl, 'icon' => '🔍', 'name' => 'Search Tickets'];
                                        }
                                    ?>
                                    <div class="artist-links-dropdown" style="width: 100%;">
                                        <button type="button" class="btn-tickets secondary btn-links-toggle" style="width: 100% !important; display: flex; justify-content: space-between; align-items: center; box-sizing: border-box; padding: 0.5rem 0.35rem; font-size: 0.76rem; font-weight: 700; letter-spacing: 0;">
                                            <span>🎟️</span>
                                            <span>GET TICKETS</span>
                                            <span class="dropdown-caret" style="font-size: 0.65rem;">▼</span>
                                        </button>
                                        <div class="links-popover" style="width: 100%; min-width: 100%; box-sizing: border-box;">
                                            <?php foreach ($ticketLinks as $link): ?>
                                                <a href="<?php echo htmlspecialchars($link['url']); ?>" target="_blank" rel="noopener noreferrer" class="link-item">
                                                    <span class="link-icon"><?php echo $link['icon']; ?></span> <?php echo htmlspecialchars($link['name']); ?>
                                                </a>
                                            <?php endforeach; ?>
                                        </div>
                                    </div>
                                     
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
                                                 data-tags="<?php echo htmlspecialchars($combinedTagsStr); ?>"
                                                 title="Mark as Interested">
                                             ☆
                                         </button>
                                      </div>
                                </div>
                                <!-- Audio Preview Drawer -->
                                <div class="audio-drawer"></div>
                                
                                <!-- Artist Insights Drawer -->
                                <div class="insights-drawer-wrapper">
                                    <div class="insights-drawer"></div>
                                </div>
                            </article>
                        <?php endforeach; ?>
                        <?php if ($inDeferredTemplate): ?>
                            </template>
                        <?php endif; ?>

                    </div>
                <?php endforeach; ?>

                <div id="interested-view" class="calendar-view"></div>

            <?php endif; ?>
        </section>
    </main>

    <footer class="site-footer">
        <button type="button" id="btn-open-contact" class="site-footer-contact-btn">
            📧 <span>Contact Nycto</span>
        </button>
        <span class="sync-status">
            <span class="sync-status-dot"></span>
            Last Sync: <?php echo htmlspecialchars($lastSyncText); ?>
        </span>
        <p class="site-footer-copy">
            <?php echo htmlspecialchars($activeMarketConfig['title']); ?> &copy; <?php echo date('Y'); ?>.
        </p>
    </footer>

    <script id="venue-data" type="application/json"><?php echo json_encode($venuesList, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT); ?></script>
    <script id="genre-buckets-data" type="application/json"><?php echo json_encode($genreBuckets, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT); ?></script>
    <script type="module" src="assets/js/app.js?v=<?php echo filemtime(__DIR__ . '/assets/js/app.js'); ?>"></script>
</body>
</html>
