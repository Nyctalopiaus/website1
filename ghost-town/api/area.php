<?php
/**
 * GET area.php?zip=80401&radius=3
 * Geocodes a US zip (Nominatim, cached forever in SQLite — no WiGLE quota used),
 * builds a square box of +/- radius km around its center, and returns the area
 * plus per-type fetch progress and today's WiGLE query count.
 */
require __DIR__ . '/lib.php';

$zip = trim($_GET['zip'] ?? '');
$radius = (float)($_GET['radius'] ?? 3);
if (!preg_match('/^\d{5}$/', $zip)) jsonExit(['error' => 'Enter a 5-digit US zip code.'], 400);
if ($radius < 0.5 || $radius > 15) jsonExit(['error' => 'Radius must be between 0.5 and 15 km.'], 400);
$radius = round($radius, 1);

$pdo = db();
$st = $pdo->prepare('SELECT * FROM zips WHERE zip = ?');
$st->execute([$zip]);
$z = $st->fetch();

if (!$z) {
    $url = 'https://nominatim.openstreetmap.org/search?' . http_build_query([
        'postalcode' => $zip, 'country' => 'us', 'format' => 'json', 'limit' => 1,
    ]);
    [$code, $json] = httpGetJson($url);
    if ($code !== 200 || !is_array($json)) jsonExit(['error' => "Zip lookup failed (HTTP $code)."], 502);
    if (!$json) jsonExit(['error' => "Zip $zip not found."], 404);
    $z = [
        'zip' => $zip, 'lat' => (float)$json[0]['lat'], 'lon' => (float)$json[0]['lon'],
        'label' => $json[0]['display_name'] ?? $zip, 'fetched_at' => time(),
    ];
    $pdo->prepare('INSERT INTO zips(zip, lat, lon, label, fetched_at) VALUES (?,?,?,?,?)')
        ->execute(array_values($z));
}

$dLat = $radius / 111.32;
$dLon = $radius / (111.32 * cos(deg2rad($z['lat'])));
$pdo->prepare('INSERT OR IGNORE INTO areas(zip, radius_km, lat1, lat2, lon1, lon2, created_at) VALUES (?,?,?,?,?,?,?)')
    ->execute([$zip, $radius, $z['lat'] - $dLat, $z['lat'] + $dLat, $z['lon'] - $dLon, $z['lon'] + $dLon, time()]);

$st = $pdo->prepare('SELECT * FROM areas WHERE zip = ? AND radius_km = ?');
$st->execute([$zip, $radius]);
$area = $st->fetch();

$st = $pdo->prepare('SELECT type, total, fetched, complete, updated_at FROM area_progress WHERE area_id = ?');
$st->execute([$area['id']]);
$progress = [];
foreach ($st->fetchAll() as $row) $progress[$row['type']] = $row;

jsonExit([
    'area' => $area + ['center' => [$z['lat'], $z['lon']], 'label' => $z['label']],
    'progress' => $progress,
    'quota' => quotaToday(),
]);
