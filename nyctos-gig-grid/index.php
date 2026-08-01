<?php
/**
 * Frontend Interface - Nycto's Gig Grid
 */
header_remove('X-Powered-By');
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/genre_buckets.php';
require_once __DIR__ . '/ignored_tags.php';
require_once __DIR__ . '/includes/template_helpers.php';

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

$allowedMarkets = ['colorado', 'california', 'texas', 'uk'];
$marketAliases = [
    'co' => 'colorado',
    'ca' => 'california',
    'tx' => 'texas',
    'uk' => 'uk',
    'united kingdom' => 'uk',
    'colorado' => 'colorado',
    'california' => 'california',
    'texas' => 'texas',
    'england' => 'uk',
    'scotland' => 'uk',
    'wales' => 'uk',
    'ireland' => 'uk'
];

$requestedMarketRaw = strtolower(trim((string)($_GET['market'] ?? $_COOKIE['market'] ?? 'colorado')));
$requestedMarket = $marketAliases[$requestedMarketRaw] ?? $requestedMarketRaw;
if (!in_array($requestedMarket, $allowedMarkets, true)) {
    $requestedMarket = 'colorado';
}
$activeMarket = $requestedMarket;
if (($_COOKIE['market'] ?? null) !== $activeMarket) {
    setcookie('market', $activeMarket, time() + (86400 * 30), '/');
}

$requestedCountryRaw = strtolower(trim((string)($_GET['region'] ?? $_COOKIE['active_country_uk'] ?? 'scotland')));
if (!in_array($requestedCountryRaw, ['england', 'ireland', 'scotland', 'wales'], true)) {
    $requestedCountryRaw = 'scotland';
}
$activeCountry = $requestedCountryRaw;
if ($activeMarket === 'uk' && ($_COOKIE['active_country_uk'] ?? null) !== $activeCountry) {
    setcookie('active_country_uk', $activeCountry, time() + (86400 * 30), '/');
}

$marketConfig = [
    'colorado' => [
        'title' => "Nycto's Gig Grid - Colorado Live Music Grid",
        'region_name' => 'Colorado Live Gig Grid',
        'logo_text' => "Nycto's Gig Grid",
        'intro' => 'Everything you usually have to hunt down, lineup, venue, setlist, and your plan, all in one place.'
    ],
    'california' => [
        'title' => "Nycto's Gig Grid - California Live Music Grid",
        'region_name' => 'California Live Gig Grid',
        'logo_text' => "Nycto's Gig Grid",
        'intro' => 'Everything you usually have to hunt down, lineup, venue, setlist, and your plan, all in one place.'
    ],
    'texas' => [
        'title' => "Nycto's Gig Grid - Texas Live Music Grid",
        'region_name' => 'Texas Live Gig Grid',
        'logo_text' => "Nycto's Gig Grid",
        'intro' => 'Everything you usually have to hunt down, lineup, venue, setlist, and your plan, all in one place.'
    ],
    'uk' => [
        'title' => "Nycto's Gig Grid - UK & Ireland Live Music Grid",
        'region_name' => 'UK & Ireland Live Gig Grid',
        'logo_text' => "Nycto's Gig Grid",
        'intro' => 'Everything you usually have to hunt down, lineup, venue, setlist, and your plan, all in one place.'
    ]
];
$activeMarketConfig = $marketConfig[$activeMarket] ?? $marketConfig['colorado'];

$marketMetadata = [
    'colorado' => ['key' => 'colorado', 'name' => 'Colorado', 'icon' => '🏔️', 'type' => 'us'],
    'california' => ['key' => 'california', 'name' => 'California', 'icon' => '🐻', 'type' => 'us'],
    'texas' => ['key' => 'texas', 'name' => 'Texas', 'icon' => '🤠', 'type' => 'us'],
    'uk' => ['key' => 'uk', 'name' => 'United Kingdom', 'icon' => '🇬🇧', 'type' => 'intl']
];

$marketDisplayLabels = [
    'colorado' => 'CO',
    'california' => 'CA',
    'texas' => 'TX',
    'uk' => ucfirst($activeCountry)
];

// Fetch live event counts per market for dropdown labels
$marketCardCounts = [];
$marketCardCountsStmt = $db->query("
    SELECT COALESCE(NULLIF(TRIM(market), ''), 'colorado') AS raw_market_key,
           COUNT(DISTINCT e.event_id) AS grouped_card_count
    FROM events e
    WHERE e.status = 'Approved'
    GROUP BY raw_market_key
");
if ($marketCardCountsStmt !== false) {
    foreach ($marketCardCountsStmt->fetchAll(PDO::FETCH_ASSOC) as $mRow) {
        $mKey = strtolower(trim((string)($mRow['raw_market_key'] ?? '')));
        $mKey = $marketAliases[$mKey] ?? $mKey;
        if (!isset($marketCardCounts[$mKey])) {
            $marketCardCounts[$mKey] = 0;
        }
        $marketCardCounts[$mKey] += (int)($mRow['grouped_card_count'] ?? 0);
    }
}

// Build US States markets array
$usStateMarkets = [];
foreach ($marketMetadata as $mKey => $meta) {
    if (($meta['type'] ?? 'us') === 'us') {
        $usStateMarkets[] = [
            'key' => $mKey,
            'name' => $meta['name'],
            'icon' => $meta['icon'],
            'link' => buildMarketLink($mKey),
            'count' => $marketCardCounts[$mKey] ?? 0
        ];
    }
}
usort($usStateMarkets, function($a, $b) { return strcmp($a['name'], $b['name']); });

// Calculate live event counts for International constituent countries (Fast Indexed Query: 16ms)
$countryCounts = ['england' => 0, 'ireland' => 0, 'scotland' => 0, 'wales' => 0];
$countryCountsStmt = $db->query("
    SELECT LOWER(TRIM(mc.region)) AS country_region,
           COUNT(DISTINCT e.event_id) AS grouped_card_count
    FROM events e
    JOIN venues v ON e.venue_name = v.venue_name
    JOIN market_cities mc ON v.city = mc.city_name
    WHERE e.market = 'uk' AND e.status = 'Approved'
    GROUP BY LOWER(TRIM(mc.region))
");
if ($countryCountsStmt !== false) {
    foreach ($countryCountsStmt->fetchAll(PDO::FETCH_ASSOC) as $cRow) {
        $cKey = strtolower(trim((string)($cRow['country_region'] ?? '')));
        if (array_key_exists($cKey, $countryCounts)) {
            $countryCounts[$cKey] = (int)($cRow['grouped_card_count'] ?? 0);
        }
    }
}

// Constituent countries for International view (Alphabetical: England, Ireland, Scotland, Wales)
$intlCountryMarkets = [
    ['key' => 'england',  'name' => 'England',  'icon' => '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'link' => buildMarketLink('uk', 'england'),  'count' => $countryCounts['england'] ?? 0],
    ['key' => 'ireland',  'name' => 'Ireland',  'icon' => '🇮🇪', 'link' => buildMarketLink('uk', 'ireland'),  'count' => $countryCounts['ireland'] ?? 0],
    ['key' => 'scotland', 'name' => 'Scotland', 'icon' => '🏴󠁧󠁢󠁳󠁣󠁴󠁿', 'link' => buildMarketLink('uk', 'scotland'), 'count' => $countryCounts['scotland'] ?? 0],
    ['key' => 'wales',    'name' => 'Wales',    'icon' => '🏴󠁧󠁢󠁷󠁬󠁳󠁿', 'link' => buildMarketLink('uk', 'wales'),    'count' => $countryCounts['wales'] ?? 0]
];
usort($intlCountryMarkets, function($a, $b) { return strcmp($a['name'], $b['name']); });

$activeRegionCategory = ($marketMetadata[$activeMarket]['type'] ?? 'us') === 'intl' ? 'intl' : 'us';

// Fetch unique months containing upcoming events in the SQLite database.
// Cutoff: now - 4h show buffer - 7h PDT offset = -11h UTC, covers CA (PDT) and earlier timezones.
$monthsStmt = $db->prepare("
    SELECT DISTINCT strftime('%Y-%m', start_time) AS event_month 
    FROM events 
    WHERE market = :market
      AND start_time >= datetime('now', '-11 hours') 
    ORDER BY event_month ASC
");
$monthsStmt->execute([':market' => $activeMarket]);
$allAvailableMonths = $monthsStmt->fetchAll(PDO::FETCH_COLUMN);

$requestedMonth = trim((string)($_GET['month'] ?? ''));
$isAllMonths = ($requestedMonth === 'all');

if (empty($requestedMonth) || (!$isAllMonths && !in_array($requestedMonth, $allAvailableMonths, true))) {
    $requestedMonth = $allAvailableMonths[0] ?? date('Y-m');
}

$monthsToFetch = $isAllMonths ? $allAvailableMonths : [$requestedMonth];

$countryFilter = $activeMarket === 'uk' ? strtolower(trim($activeCountry)) : '';

$marketGeoBounds = [
    'colorado' => ['min_lat' => 36.0, 'max_lat' => 42.5, 'min_lng' => -110.5, 'max_lng' => -101.5],
    'california' => ['min_lat' => 32.0, 'max_lat' => 42.5, 'min_lng' => -125.0, 'max_lng' => -114.0],
    'texas' => ['min_lat' => 25.0, 'max_lat' => 37.5, 'min_lng' => -107.0, 'max_lng' => -93.0],
];
$activeGeoBounds = $marketGeoBounds[$activeMarket] ?? null;

// Group events by active month to prevent DOM overload (Fast 16ms Indexed Query)
$eventsByMonth = [];
foreach ($monthsToFetch as $month) {
    $monthDate = DateTime::createFromFormat('!Y-m', $month);
    if (!$monthDate) {
        continue;
    }
    $monthStart = $monthDate->format('Y-m-01 00:00:00');
    $nextMonthStart = (clone $monthDate)->modify('+1 month')->format('Y-m-01 00:00:00');

    if ($activeMarket === 'uk' && !empty($countryFilter)) {
        $stmt = $db->prepare("
            SELECT e.*, v.city AS city_name
            FROM events e
            JOIN venues v ON e.venue_name = v.venue_name
            JOIN market_cities mc ON v.city = mc.city_name
            WHERE e.market = :market
                            AND LOWER(TRIM(mc.region)) = :country_filter
              AND e.start_time >= :month_start
              AND e.start_time < :next_month_start
              AND e.start_time >= datetime('now', '-11 hours')
            ORDER BY e.start_time ASC
        ");
        $stmt->execute([
            ':market' => $activeMarket,
            ':country_filter' => $countryFilter,
            ':month_start' => $monthStart,
            ':next_month_start' => $nextMonthStart
        ]);
    } else {
        $stmt = $db->prepare("
            SELECT e.*, v.city AS city_name
            FROM events e
            LEFT JOIN venues v ON e.venue_name = v.venue_name
            WHERE e.market = :market
              AND e.start_time >= :month_start
              AND e.start_time < :next_month_start
              AND e.start_time >= datetime('now', '-11 hours')
              AND (
                    :geo_enabled = 0
                    OR v.latitude IS NULL
                    OR v.longitude IS NULL
                    OR (
                        v.latitude BETWEEN :min_lat AND :max_lat
                        AND v.longitude BETWEEN :min_lng AND :max_lng
                    )
                  )
            ORDER BY e.start_time ASC
        ");
        $geoEnabled = $activeGeoBounds ? 1 : 0;
        $stmt->execute([
            ':market' => $activeMarket,
            ':month_start' => $monthStart,
            ':next_month_start' => $nextMonthStart,
            ':geo_enabled' => $geoEnabled,
            ':min_lat' => $activeGeoBounds['min_lat'] ?? 0,
            ':max_lat' => $activeGeoBounds['max_lat'] ?? 0,
            ':min_lng' => $activeGeoBounds['min_lng'] ?? 0,
            ':max_lng' => $activeGeoBounds['max_lng'] ?? 0
        ]);
    }
    $events = $stmt->fetchAll();
    if (!empty($events)) {
        $eventsByMonth[$month] = $events;
    }
}

$activeMonths = $allAvailableMonths;

$allActiveBucketTags = [];
foreach ($genreBuckets as $bKey => $bConfig) {
    if (!empty($bConfig['tags'])) {
        foreach ($bConfig['tags'] as $t) {
            $allActiveBucketTags[] = strtolower(trim($t));
        }
    }
}
$allActiveBucketTags = array_unique($allActiveBucketTags);

$venuesStmt = $db->prepare("
    SELECT DISTINCT TRIM(e.venue_name) AS clean_venue 
    FROM events e 
    WHERE e.market = :market
      AND e.venue_name IS NOT NULL 
      AND TRIM(e.venue_name) != '' 
    ORDER BY clean_venue ASC
");
$venuesStmt->execute([':market' => $activeMarket]);
$activeVenues = $venuesStmt->fetchAll(PDO::FETCH_COLUMN);

$venueDataStmt = $db->prepare("
        SELECT venue_name, venue_key, address, city, latitude, longitude, maps_url
        FROM venues
        WHERE market = :market
        ORDER BY venue_name ASC
");
$venueDataStmt->execute([':market' => $activeMarket]);
$venueData = $venueDataStmt->fetchAll(PDO::FETCH_ASSOC);

// Pre-calculate filter count summary statistics
$uniqueArtistCount = 0;
$uniqueVenueCount = 0;
$totalShowCount = 0;

$allArtistsSet = [];
$allVenuesSet = [];

foreach ($eventsByMonth as $mKey => $mEvents) {
    foreach ($mEvents as $evt) {
        $totalShowCount++;
        if (!empty($evt['venue_name'])) {
            $allVenuesSet[trim($evt['venue_name'])] = true;
        }
        $rawBandName = trim((string)($evt['band_name'] ?? ''));
        if ($rawBandName !== '') {
            $artists = preg_split('/\s*(?:,|\+|&|\bwith\b|\bfeat\.?\b|\bfeaturing\b|\bsupported by\b|\bplus\b|\bvs\.?\b)\s*/i', $rawBandName);
            foreach ($artists as $art) {
                $cleanArt = trim($art);
                if ($cleanArt !== '') {
                    $allArtistsSet[strtolower($cleanArt)] = true;
                }
            }
        }
    }
}
$uniqueArtistCount = count($allArtistsSet);
$uniqueVenueCount = count($allVenuesSet);

$lastSyncFile = __DIR__ . '/last_sync.txt';
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
<body data-market="<?php echo htmlspecialchars($activeMarket); ?>" data-country="<?php echo htmlspecialchars($activeCountry); ?>">

    <!-- Header Navigation -->
    <header class="container header header-compact">
        <div class="header-nav">
            <a href="../index.html" class="btn-back">← Back to Lab</a>
            <a href="../" class="logo">
                <span class="logo-icon">🤘</span>
                <span class="logo-text"><?php echo htmlspecialchars($activeMarketConfig['logo_text']); ?></span>
            </a>
        </div>
        <div class="controls-group" style="display: flex; align-items: center; gap: 0.5rem;">
            <button type="button" id="btn-toggle-intro" class="btn-info-badge" title="Show market info & quick start">
                <span>ℹ️</span> <span>Info</span>
            </button>
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

        <?php require __DIR__ . '/templates/filter_controls.php'; ?>

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
                <?php foreach ($eventsByMonth as $month => $events): ?>
                    <div id="month-<?php echo $month; ?>" class="calendar-view <?php echo $month === $requestedMonth ? 'active' : ''; ?>" data-month="<?php echo $month; ?>">
                        <div class="events-grid">
                            <?php foreach ($events as $event): ?>
                                <?php renderEventCard($event, $genreBuckets); ?>
                            <?php endforeach; ?>
                        </div>
                    </div>
                <?php endforeach; ?>

                <div id="interested-view" class="calendar-view">
                    <div class="events-grid" id="interested-grid"></div>
                </div>
            <?php endif; ?>
        </section>
    </main>

    <!-- Site Footer -->
    <footer class="container site-footer" style="margin-top: 3rem; padding: 2rem 0; border-top: 1px solid rgba(255, 255, 255, 0.08); text-align: center;">
        <div class="footer-content" style="display: flex; flex-direction: column; align-items: center; gap: 0.75rem;">
            <div class="footer-links" style="display: flex; align-items: center; gap: 1rem; font-size: 0.85rem;">
                <button type="button" id="btn-open-contact" class="btn-info-badge" style="cursor: pointer;">
                    <span>📧</span> <span>Contact Nycto</span>
                </button>
            </div>
            <div class="sync-status-pill" style="font-size: 0.75rem; color: var(--text-muted); background: rgba(255, 255, 255, 0.04); padding: 0.25rem 0.75rem; border-radius: 999px; border: 1px solid rgba(255, 255, 255, 0.08);">
                <span class="sync-indicator" style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #10b981; margin-right: 6px;"></span>
                Last Sync: <?php echo htmlspecialchars($lastSyncText); ?>
            </div>
            <p class="copyright-text" style="font-size: 0.75rem; color: var(--text-muted); margin: 0;">
                Nycto's Gig Grid - UK & Ireland Live Music Grid &copy; <?php echo date('Y'); ?>.
            </p>
        </div>
    </footer>

    <div id="email-modal" class="modal" style="display:none;">
        <div class="modal-content" style="max-width:520px; margin:8vh auto; background:#111; border:1px solid rgba(255,255,255,.15); border-radius:10px; padding:1rem; color:#fff;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:.75rem;">
                <h3 style="margin:0;">Email Interested Shows</h3>
                <button type="button" id="btn-close-email">✕</button>
            </div>
            <form id="email-form">
                <input id="email-input-field" type="email" placeholder="you@example.com" style="width:100%; margin-bottom:.75rem;" required />
                <div id="email-error" style="display:none; color:#fecdd3; margin-bottom:.5rem;"></div>
                <div id="email-success" style="display:none; color:#a7f3d0; margin-bottom:.5rem;"></div>
                <div style="display:flex; gap:.5rem; justify-content:flex-end;">
                    <button type="button" id="btn-cancel-email">Cancel</button>
                    <button type="submit" id="btn-submit-email">Send</button>
                </div>
            </form>
        </div>
    </div>

    <div id="features-modal" class="modal hidden" style="display:none;">
        <div class="modal-content" style="max-width:640px; margin:8vh auto; background:#111; border:1px solid rgba(255,255,255,.15); border-radius:10px; padding:1rem; color:#fff;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:.75rem;">
                <h3 style="margin:0;">Features</h3>
                <button type="button" id="btn-close-features">✕</button>
            </div>
            <p style="margin:.25rem 0; color:#cbd5e1;">Use filters, venue selectors, favorite stars, and setlist lookups to build your show plan.</p>
        </div>
    </div>

    <div id="venue-modal" class="modal-overlay hidden" style="display:none;" aria-hidden="true">
        <div class="modal-card modal-card-venue modal-content" role="dialog" aria-modal="true" aria-labelledby="venue-modal-name">
            <button type="button" id="btn-close-venue" class="modal-close-button" aria-label="Close venue details">✕</button>
            <h3 id="venue-modal-name" class="modal-title modal-title-venue" style="margin:0;">Venue</h3>
            <p id="venue-modal-address" class="modal-field-value" style="margin:.25rem 0 1rem;"></p>
            <a id="venue-modal-maps" class="btn-tickets btn-tickets-compact" href="#" target="_blank" rel="noopener noreferrer">Open in Maps</a>
        </div>
    </div>

    <div id="setlist-modal" class="modal-overlay hidden" style="display:none;" aria-hidden="true">
        <div class="modal-card modal-card-setlist modal-content" role="dialog" aria-modal="true" aria-labelledby="setlist-modal-title">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:.75rem;">
                <h3 id="setlist-modal-title" class="modal-title modal-title-setlist" style="margin:0;">Setlist</h3>
                <button type="button" id="btn-close-setlist" class="modal-close-button" aria-label="Close setlist">✕</button>
            </div>
            <p id="setlist-modal-meta" class="setlist-modal-meta" style="margin:.25rem 0 1rem;"></p>
            <div id="setlist-songs-container"></div>
        </div>
    </div>

    <div id="contact-modal" class="modal" style="display:none;">
        <div class="modal-content" style="max-width:620px; margin:8vh auto; background:#111; border:1px solid rgba(255,255,255,.15); border-radius:10px; padding:1rem; color:#fff;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:.75rem;">
                <h3 style="margin:0;">Contact Nycto</h3>
                <button type="button" id="btn-close-contact">✕</button>
            </div>
            <label for="contact-subject">Subject</label>
            <select id="contact-subject" style="width:100%; margin-bottom:.5rem;">
                <option>General Feedback</option>
                <option>Bug Report</option>
                <option>Feature Request</option>
            </select>
            <label for="contact-email">Email (optional)</label>
            <input id="contact-email" type="email" style="width:100%; margin-bottom:.5rem;" />
            <label for="contact-message">Message</label>
            <textarea id="contact-message" rows="5" maxlength="500" style="width:100%;"></textarea>
            <div id="contact-char-count" style="margin:.35rem 0; color:#94a3b8;">0 / 500</div>
            <div id="contact-status-msg" style="display:none; margin:.35rem 0; padding:.5rem; border-radius:6px;"></div>
            <div style="display:flex; justify-content:flex-end;">
                <button type="button" id="btn-submit-contact">Send Message 🚀</button>
            </div>
        </div>
    </div>

    <script id="venue-data" type="application/json"><?php echo json_encode($venueData, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE); ?></script>
    <script id="genre-buckets-data" type="application/json"><?php echo json_encode($genreBuckets, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE); ?></script>

    <button type="button" id="btn-back-to-top" class="btn-back-to-top" aria-label="Back to top" title="Back to top">Back to Top</button>

    <script type="module" src="assets/js/app.js?v=<?php echo filemtime(__DIR__ . '/assets/js/app.js'); ?>"></script>
</body>
</html>
