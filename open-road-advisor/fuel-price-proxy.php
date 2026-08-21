<?php
// Same-origin proxy for gas price lookups, following the exact convention
// already established by mortgage-calculator/rates-proxy.php and
// mls-proxy.php: credentials live server-side in /home/nyctltlc/api.env,
// never in front-end JS, and this script is the only thing that talks to
// the upstream API. Called by advisor.js as: fuel-price-proxy.php?state=CO&grade=regular
//
// Data source: EIA (U.S. Energy Information Administration) Open Data API —
// free, official, licensed government data. Deliberately NOT GasBuddy: real
// per-station GasBuddy prices require scraping past Cloudflare bot defenses
// and violate their ToS (see project discussion). EIA trades exact
// per-station precision for a source that's legal, stable, and free.
header('Content-Type: application/json');

// ---- Shared credential loading (same helper as mls-proxy.php) ----
function loadApiEnv($path) {
    if (!is_readable($path)) return;
    foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#' || strpos($line, '=') === false) continue;
        list($name, $value) = array_map('trim', explode('=', $line, 2));
        $value = trim($value, "\"'");
        if ($name !== '' && getenv($name) === false) {
            putenv("$name=$value");
        }
    }
}
loadApiEnv('/home/nyctltlc/api.env');

define('EIA_API_KEY', getenv('EIA_API_KEY') ?: '');

// ---------------------------------------------------------------------------
// EIA legacy series-ID table.
//
// EIA's v2 API accepts old v1 series IDs directly via GET /v2/seriesid/{id},
// which is what this file uses (simpler than the v2 facet/route discovery
// flow). IDs below follow the "Gasoline and Diesel Fuel Update" convention:
//   Product codes: EPMR = regular gasoline, EPMP = premium gasoline,
//                  EPD2D = No. 2 diesel.
//   Area codes:    NUS = US average, R10..R50 = PADD 1-5, SCA/SCO/SFL/SMA/
//                  SMN/SNY/SOH/STX/SWA = the handful of individual states
//                  EIA reports weekly (CA, CO, FL, MA, MN, NY, OH, TX, WA).
//
// IMPORTANT — these were reconstructed from EIA's public documentation
// pages, not confirmed against a live authenticated request (no API key was
// available while building this). Once EIA_API_KEY is set in api.env, check
// the `debugSeriesId` field this proxy returns and cross-check any area that
// keeps landing on "national" against
// https://www.eia.gov/opendata/browser/petroleum/pri/gnd — adjust the tables
// below if a tier's series ID is wrong. A wrong/missing ID just fails that
// one tier and falls through to the next broader one (state -> PADD ->
// national -> hardcoded estimate), so a bad ID here degrades gracefully
// rather than breaking the fuel-price feature.
//
// Also worth knowing going in: EIA's premium/midgrade series are largely
// national-only (no state or PADD breakdown), per EIA's own retail price
// tables. Regular and diesel have real PADD-level (and a few states')
// granularity. So "Premium Unleaded" will often resolve at the national
// tier even when regular resolves at the state tier for the same stop —
// that's expected, not a bug, and is exactly the gap the front end's
// "may not reflect regional variation" note is meant to cover.
// ---------------------------------------------------------------------------

$PRODUCT_CODES = [
    'regular' => 'EPMR',
    'premium' => 'EPMP',
    'diesel'  => 'EPD2D',
];

$SERIES_PREFIX = [
    'regular' => 'EMM',
    'premium' => 'EMM',
    'diesel'  => 'EMD',
];

// State -> individual EIA area code, for the small set of states EIA reports
// on individually in the weekly survey. Everything else falls through to PADD.
$STATE_AREA_CODE = [
    'CA' => 'SCA', 'CO' => 'SCO', 'FL' => 'SFL', 'MA' => 'SMA',
    'MN' => 'SMN', 'NY' => 'SNY', 'OH' => 'SOH', 'TX' => 'STX', 'WA' => 'SWA',
];

// State -> PADD region area code.
$STATE_PADD_CODE = [
    // PADD 1 - East Coast
    'CT'=>'R10','DE'=>'R10','FL'=>'R10','GA'=>'R10','ME'=>'R10','MD'=>'R10',
    'MA'=>'R10','NH'=>'R10','NJ'=>'R10','NY'=>'R10','NC'=>'R10','PA'=>'R10',
    'RI'=>'R10','SC'=>'R10','VT'=>'R10','VA'=>'R10','WV'=>'R10','DC'=>'R10',
    // PADD 2 - Midwest
    'ND'=>'R20','SD'=>'R20','NE'=>'R20','KS'=>'R20','OK'=>'R20','MN'=>'R20',
    'IA'=>'R20','MO'=>'R20','WI'=>'R20','IL'=>'R20','IN'=>'R20','MI'=>'R20',
    'OH'=>'R20','KY'=>'R20','TN'=>'R20',
    // PADD 3 - Gulf Coast
    'NM'=>'R30','TX'=>'R30','AR'=>'R30','LA'=>'R30','MS'=>'R30','AL'=>'R30',
    // PADD 4 - Rocky Mountain
    'MT'=>'R40','ID'=>'R40','WY'=>'R40','UT'=>'R40','CO'=>'R40',
    // PADD 5 - West Coast
    'WA'=>'R50','OR'=>'R50','CA'=>'R50','NV'=>'R50','AZ'=>'R50','AK'=>'R50','HI'=>'R50',
];

$VALID_GRADES = ['regular', 'premium', 'diesel'];

// ---- Input validation ----
$requestedGrade = isset($_GET['grade']) ? strtolower(trim($_GET['grade'])) : 'regular';
if (!in_array($requestedGrade, $VALID_GRADES, true)) {
    $requestedGrade = 'regular';
}

$state = isset($_GET['state']) ? strtoupper(trim($_GET['state'])) : '';
if (!preg_match('/^[A-Z]{2}$/', $state)) {
    $state = '';
}

// ---- Simple file cache. EIA updates this data weekly, so a same-day cache
// avoids hammering EIA (and burning the free key's rate limit) on every
// stop of every route a visitor plans. ----
$cacheDir = __DIR__ . '/.cache';
$cacheFile = $cacheDir . '/fuel_prices.json';
$cacheTtlSeconds = 86400;

function readCache($cacheFile) {
    if (!is_readable($cacheFile)) return [];
    $raw = @file_get_contents($cacheFile);
    $data = @json_decode($raw, true);
    return is_array($data) ? $data : [];
}

function writeCache($cacheDir, $cacheFile, $cache) {
    if (!is_dir($cacheDir)) {
        @mkdir($cacheDir, 0755, true);
    }
    if (is_dir($cacheDir)) {
        @file_put_contents($cacheFile, json_encode($cache));
    }
}

$cache = readCache($cacheFile);

// Fetches one EIA legacy series ID via the v2 seriesid shortcut. Returns
// ['price' => float, 'period' => 'YYYY-MM-DD'|null] or null if unavailable.
function fetchEiaSeries($seriesId, $apiKey) {
    if (empty($apiKey)) return null;

    $url = 'https://api.eia.gov/v2/seriesid/' . rawurlencode($seriesId) . '?api_key=' . urlencode($apiKey);
    $options = [
        'http' => [
            'header' => "User-Agent: open-road-advisor/1.0\r\n",
            'timeout' => 8,
        ],
    ];
    $context = stream_context_create($options);
    $raw = @file_get_contents($url, false, $context);
    if ($raw === false) return null;

    $json = json_decode($raw, true);
    if (!is_array($json) || empty($json['response']['data'][0])) return null;

    $row = $json['response']['data'][0];
    if (!isset($row['value']) || !is_numeric($row['value'])) return null;

    return [
        'price' => (float) $row['value'],
        'period' => isset($row['period']) ? $row['period'] : null,
    ];
}

// Tries state -> PADD -> national for one grade, using (and populating) the
// file cache. Returns an assoc array with price/period/area/areaLabel/
// seriesId, or null if every tier came back empty.
function resolvePrice($grade, $state, $apiKey, &$cache, $cacheTtl, $productCodes, $seriesPrefix, $stateAreaCode, $statePaddCode) {
    $prefix = $seriesPrefix[$grade];
    $product = $productCodes[$grade];

    $tiers = [];
    if ($state !== '' && isset($stateAreaCode[$state])) {
        $tiers[] = ['area' => 'state', 'code' => $stateAreaCode[$state], 'label' => $state];
    }
    if ($state !== '' && isset($statePaddCode[$state])) {
        $tiers[] = ['area' => 'padd', 'code' => $statePaddCode[$state], 'label' => 'PADD region (' . $state . ')'];
    }
    $tiers[] = ['area' => 'national', 'code' => 'NUS', 'label' => 'U.S. average'];

    foreach ($tiers as $tier) {
        $seriesId = "PET.{$prefix}_{$product}_PTE_{$tier['code']}_DPG.W";

        if (isset($cache[$seriesId]) && (time() - $cache[$seriesId]['fetchedAt']) < $cacheTtl) {
            $hit = $cache[$seriesId];
            return [
                'price' => $hit['price'], 'period' => $hit['period'],
                'area' => $tier['area'], 'areaLabel' => $tier['label'], 'seriesId' => $seriesId,
            ];
        }

        $result = fetchEiaSeries($seriesId, $apiKey);
        if ($result !== null) {
            $cache[$seriesId] = [
                'price' => $result['price'], 'period' => $result['period'], 'fetchedAt' => time(),
            ];
            return [
                'price' => $result['price'], 'period' => $result['period'],
                'area' => $tier['area'], 'areaLabel' => $tier['label'], 'seriesId' => $seriesId,
            ];
        }
    }

    return null;
}

$resolved = resolvePrice($requestedGrade, $state, EIA_API_KEY, $cache, $cacheTtlSeconds, $PRODUCT_CODES, $SERIES_PREFIX, $STATE_AREA_CODE, $STATE_PADD_CODE);

$usedFallbackGrade = false;
if ($resolved === null && $requestedGrade !== 'regular') {
    // Requested grade had no data anywhere in the area chain (or EIA_API_KEY
    // is missing/invalid) — fall back to regular for this stop, and say so.
    $resolved = resolvePrice('regular', $state, EIA_API_KEY, $cache, $cacheTtlSeconds, $PRODUCT_CODES, $SERIES_PREFIX, $STATE_AREA_CODE, $STATE_PADD_CODE);
    if ($resolved !== null) {
        $usedFallbackGrade = true;
    }
}

writeCache($cacheDir, $cacheFile, $cache);

if ($resolved === null) {
    // Total failure (no API key configured yet, EIA unreachable, or every
    // tier — including national regular — came back empty). Return a
    // clearly-marked hardcoded estimate so the front end still has a number
    // to compute a trip cost with, same fallback pattern rates-proxy.php uses.
    echo json_encode([
        'price' => 3.50,
        'period' => null,
        'grade' => 'regular',
        'requestedGrade' => $requestedGrade,
        'usedFallbackGrade' => $requestedGrade !== 'regular',
        'area' => 'default',
        'areaLabel' => 'National default estimate',
        'source' => 'default_estimate',
    ]);
    exit;
}

echo json_encode([
    'price' => round($resolved['price'], 3),
    'period' => $resolved['period'],
    'grade' => $usedFallbackGrade ? 'regular' : $requestedGrade,
    'requestedGrade' => $requestedGrade,
    'usedFallbackGrade' => $usedFallbackGrade,
    'area' => $resolved['area'],
    'areaLabel' => $resolved['areaLabel'],
    'source' => 'EIA',
    'debugSeriesId' => $resolved['seriesId'],
]);
