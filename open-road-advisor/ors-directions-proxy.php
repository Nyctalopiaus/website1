<?php
// Same-origin proxy for the optional Scenic Route / Avoid Tolls / Avoid
// Ferries routing preferences, following the exact convention already
// established by fuel-price-proxy.php / mls-proxy.php / rates-proxy.php:
// credentials live server-side in /home/nyctltlc/api.env, never in front-end
// JS, and this script is the only thing that talks to the upstream API.
// Called by advisor.js as:
//   ors-directions-proxy.php?coords=lon1,lat1;lon2,lat2;...&avoid=highways,tollways,ferries
//
// Data source: OpenRouteService (ORS) Directions API, driving-car profile,
// with options.avoid_features set from the `avoid` param (any of highways,
// tollways, ferries — validated against that whitelist below). Per ORS
// support staff
// (https://ask.openrouteservice.org/t/avoid-highways-motorways-has-no-effect/7826),
// "highways" only excludes ways tagged highway=motorway / motorway_link in
// OpenStreetMap — i.e. interstates/freeways — NOT trunk/primary/secondary
// roads, so US/state highways stay eligible when Scenic Route is the only
// preference checked. That was deliberately the whole point of that feature:
// skip interstates, keep scenic state highways.
//
// Deliberately NOT the default route source: the plain OSRM call in
// advisor.js stays untouched and is still what runs when none of these
// checkboxes are checked. This proxy is only hit when at least one routing
// preference is on, and advisor.js falls back to OSRM if this proxy errors
// out (missing key, ORS down, rate-limited, etc.) so a bad/missing
// ORS_API_KEY degrades gracefully rather than breaking route planning.
header('Content-Type: application/json');

// ---- Shared credential loading (same helper as fuel-price-proxy.php) ----
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
    // No key configured yet — fail clearly so advisor.js can fall back to
    // OSRM instead of hanging on a request that can never succeed.
    failWith('ORS_API_KEY not configured on server.', 503);
}

// ---- Input validation ----
// Expected format mirrors the OSRM URL style already used elsewhere in this
// project: "lon,lat;lon,lat;..." with at least two waypoints.
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

// `avoid` is a comma-separated list of ORS avoid_features values. Only these
// three are meaningful for the driving-car profile (fords/steps apply to
// other profiles), so anything else is silently dropped rather than passed
// through to ORS unchecked.
$ALLOWED_AVOID_FEATURES = ['highways', 'tollways', 'ferries'];
$avoidParam = isset($_GET['avoid']) ? trim($_GET['avoid']) : '';
$requestedAvoid = $avoidParam === '' ? [] : array_map('trim', explode(',', $avoidParam));
$avoidFeatures = array_values(array_intersect($requestedAvoid, $ALLOWED_AVOID_FEATURES));

if (count($avoidFeatures) === 0) {
    failWith('No valid avoid features specified.', 400);
}

// ---- Call OpenRouteService ----
$body = json_encode([
    'coordinates' => $coordinates,
    'options' => [
        'avoid_features' => $avoidFeatures,
    ],
]);

$options = [
    'http' => [
        'method' => 'POST',
        'header' => implode("\r\n", [
            'Content-Type: application/json; charset=utf-8',
            'Accept: application/geo+json; charset=utf-8',
            'Authorization: ' . ORS_API_KEY,
            'User-Agent: open-road-advisor/1.0',
        ]) . "\r\n",
        'content' => $body,
        'timeout' => 15,
        'ignore_errors' => true, // so we can read ORS's error body on failure
    ],
];
$context = stream_context_create($options);
$raw = @file_get_contents('https://api.openrouteservice.org/v2/directions/driving-car/geojson', false, $context);

if ($raw === false) {
    failWith('Unable to reach OpenRouteService.', 502);
}

// Inspect the HTTP status ORS actually returned (available via
// $http_response_header once file_get_contents has run).
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
    failWith('OpenRouteService request failed' . ($orsMessage ? (': ' . $orsMessage) : '.'), 502);
}

$features = $json['features'] ?? null;
if (!is_array($features) || count($features) === 0 || !isset($features[0]['geometry']['coordinates'])) {
    failWith('OpenRouteService returned no route.', 502);
}

$geometryCoords = $features[0]['geometry']['coordinates'];
// Drop any elevation component so downstream code always sees plain [lon,lat]
// pairs, matching what the OSRM branch of advisor.js already expects.
$latLonOnly = array_map(function ($c) {
    return [$c[0], $c[1]];
}, $geometryCoords);

// Normalize to the same shape advisor.js already parses from OSRM
// (routeJson.routes[0].geometry.coordinates), so the front end needs only an
// extra URL branch, not a second response-parsing path.
echo json_encode([
    'routes' => [
        [
            'geometry' => [
                'type' => 'LineString',
                'coordinates' => $latLonOnly,
            ],
        ],
    ],
    'source' => 'ORS-avoid-' . implode('-', $avoidFeatures),
]);
