<?php
/**
 * GET points.php?area_id=1&types=wifi,bluetooth
 * Returns cached points inside the area box. No WiGLE quota used.
 * Compact rows: [lat, lon, lasttimeEpochOrNull, typeIndex] with types[] as the index key.
 */
require __DIR__ . '/lib.php';

$areaId = (int)($_GET['area_id'] ?? 0);
$types = array_values(array_intersect(
    explode(',', $_GET['types'] ?? 'wifi'), array_keys(WIGLE_ENDPOINTS)));
if (!$types) jsonExit(['error' => 'No valid types.'], 400);

$pdo = db();
$st = $pdo->prepare('SELECT * FROM areas WHERE id = ?');
$st->execute([$areaId]);
$area = $st->fetch();
if (!$area) jsonExit(['error' => 'Unknown area.'], 404);

$rows = [];
$st = $pdo->prepare('SELECT lat, lon, lasttime FROM points
    WHERE type = ? AND lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?');
foreach ($types as $idx => $type) {
    $st->execute([$type, $area['lat1'], $area['lat2'], $area['lon1'], $area['lon2']]);
    foreach ($st->fetchAll(PDO::FETCH_NUM) as $p) {
        $rows[] = [round($p[0], 6), round($p[1], 6), $p[2] === null ? null : (int)$p[2], $idx];
    }
}

jsonExit(['types' => $types, 'points' => $rows]);
