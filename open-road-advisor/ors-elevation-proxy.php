<?php
// Same-origin proxy for the denser Elevation Profile chart, following the
// exact convention already established by ors-directions-proxy.php /
// fuel-price-proxy.php: credentials live server-side in
// /home/nyctltlc/api.env, never in front-end JS, and this script is the only
// thing that talks to the upstream API. Called by advisor.js as:
//   ors-elevation-proxy.php?coords=lon1,lat1;lon2,lat2;...
//
// Data source: OpenRouteService (ORS) Elevation "line" service
// (POST /elevation/line), which takes a LineString of 2D points and returns
// the same line with a third (elevation, meters) coordinate added to each
// point — SRTM-derived, 90m resolution. advisor.js calls this with a
// decimated set of points sampled evenly along the *already-fetched* route
// polyline (independent of which routing source drew that polyline), so this
// is purely an elevation enrichment step and never affects route selection.
//
// NOTE: the exact response envelope for /elevation/line (Feature vs. bare
// geometry vs. FeatureCollection) was not confirmed against a live
// authenticated request while building this (no ORS key was available in the
// build environment). The parsing below tries the plausible shapes in order;
// if ORS's real response doesn't match any of them, this proxy fails
// cleanly and advisor.js just keeps its existing (sparser, per-waypoint)
// elevation chart rather than breaking the scan. If the denser chart never
// appears, check this endpoint directly and adjust the extraction logic to
// match whatever shape actually comes back.
header('Content-Type: application/json');

// ---- Shared credential loading (same helper as the other proxies) ----
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

define('ORS_API_KEY', getenv('ORS_API_KEY') ?: '');

function failWith($message, $httpCode = 502) {
    http_response_code($httpCode);
    echo json_encode(['error' => $message]);
    exit;
}

if (empty(ORS_API_KEY)) {
    failWith('ORS_API_KEY not configured on server.', 503);
}

// ---- Input validation ----
// Same "lon,lat;lon,lat;..." convention as ors-directions-proxy.php.
$coordsParam = isset($_GET['coords']) ? trim($_GET['coords']) : '';
if ($coordsParam === '') {
    failWith('Missing coords parameter.', 400);
}

$pairs = explode(';', $coordsParam);
$coordinates = [];
foreach ($pairs as $pair) {
    $parts = explode(',', trim($pair));
    if (count($parts) !== 2 || !is_numeric($parts[0]) || !is_numeric($parts[1])) {
        failWith('Malformed coords parameter.', 400);
    }
    $coordinates[] = [(float) $parts[0], (float) $parts[1]];
}

if (count($coordinates) < 2) {
    failWith('At least two coordinate pairs are required.', 400);
}

// Hard cap independent of whatever advisor.js sends, so a bug on the front
// end can't turn into an oversized upstream request.
if (count($coordinates) > 500) {
    failWith('Too many coordinate pairs (max 500).', 400);
}

// ---- Call OpenRouteService ----
$body = json_encode([
    'format_in' => 'geojson',
    'format_out' => 'geojson',
    'geometry' => [
        'type' => 'LineString',
        'coordinates' => $coordinates,
    ],
    'dataset' => 'srtm',
]);

$options = [
    'http' => [
        'method' => 'POST',
        'header' => implode("\r\n", [
            'Content-Type: application/json; charset=utf-8',
            'Accept: application/json',
            'Authorization: ' . ORS_API_KEY,
            'User-Agent: open-road-advisor/1.0',
        ]) . "\r\n",
        'content' => $body,
        'timeout' => 15,
        'ignore_errors' => true, // so we can read ORS's error body on failure
    ],
];
$context = stream_context_create($options);
$raw = @file_get_contents('https://api.openrouteservice.org/elevation/line', false, $context);

if ($raw === false) {
    failWith('Unable to reach OpenRouteService elevation service.', 502);
}

$statusCode = 502;
if (isset($http_response_header) && is_array($http_response_header) && count($http_response_header) > 0) {
    if (preg_match('/^HTTP\/\S+\s+(\d+)/', $http_response_header[0], $m)) {
        $statusCode = (int) $m[1];
    }
}

$json = json_decode($raw, true);

if ($statusCode < 200 || $statusCode >= 300 || !is_array($json)) {
    $orsMessage = null;
    if (is_array($json) && isset($json['error'])) {
        $orsMessage = is_array($json['error']) ? ($json['error']['message'] ?? null) : $json['error'];
    }
    failWith('OpenRouteService elevation request failed' . ($orsMessage ? (': ' . $orsMessage) : '.'), 502);
}

// Try the plausible response shapes, most-specific first: a GeoJSON Feature
// wrapping the geometry, a bare geometry object, or a FeatureCollection.
$coords3d = null;
if (isset($json['geometry']['coordinates'])) {
    $coords3d = $json['geometry']['coordinates'];
} elseif (isset($json['coordinates'])) {
    $coords3d = $json['coordinates'];
} elseif (isset($json['features'][0]['geometry']['coordinates'])) {
    $coords3d = $json['features'][0]['geometry']['coordinates'];
}

if (!is_array($coords3d) || count($coords3d) === 0 || !isset($coords3d[0][2])) {
    failWith('OpenRouteService elevation response did not include elevation data.', 502);
}

// Return just [lon, lat, elevationMeters] triples — advisor.js re-derives
// cumulative distance itself from lon/lat, same as it already does for the
// route polyline.
$out = array_map(function ($c) {
    return [$c[0], $c[1], $c[2]];
}, $coords3d);

echo json_encode(['coordinates' => $out]);
