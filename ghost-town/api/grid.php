<?php
/**
 * Count-based scan on ONE fixed, global grid — so a cell is never paid for twice,
 * whatever zip/radius you loaded it from.
 *
 * Lattice: base cell = 0.0045° lat × 0.0058° lon (~500 m square around 40°N).
 * Sizes are multiples (1 = ~500 m, 2 = ~1 km, 4 = ~2 km) and nest exactly:
 *   r_m = floor(lat / (0.0045*m)),  so each m-cell = the 4 (m/2)-cells inside it.
 * A coarse count is derived for free when all its children are counted.
 *
 * Per cell we ask WiGLE only for totalResults (resultsPerPage=1 → 1 query):
 *   years=0 → all-time networks;  years=N → updated within the last N years.
 *
 * GET  grid.php?area_id=1&size=2&types=wifi            → grid + known counts (no quota)
 * POST grid.php  area_id, size, types, years(1..6), max → counts missing cells, returns grid
 */
require __DIR__ . '/lib.php';

const BASE_DLAT = 0.0045;
const BASE_DLON = 0.0058;
const MULTS = [1, 2, 4];
const REFRESH_AFTER = 90 * 86400;   // counts younger than this are never re-queried

$in = $_SERVER['REQUEST_METHOD'] === 'POST' ? $_POST : $_GET;
$areaId = (int)($in['area_id'] ?? 0);
$m = (int)($in['size'] ?? 2);
$types = array_values(array_intersect(explode(',', $in['types'] ?? 'wifi'), array_keys(WIGLE_ENDPOINTS)));
if (!in_array($m, MULTS, true)) jsonExit(['error' => 'Unknown cell size.'], 400);
if (!$types) jsonExit(['error' => 'No valid types.'], 400);

$pdo = db();
$pdo->exec('CREATE TABLE IF NOT EXISTS lattice_counts (
    m INTEGER NOT NULL, r INTEGER NOT NULL, c INTEGER NOT NULL,
    type TEXT NOT NULL, years INTEGER NOT NULL, count INTEGER NOT NULL, fetched_at INTEGER NOT NULL,
    PRIMARY KEY (m, r, c, type, years))');

$st = $pdo->prepare('SELECT * FROM areas WHERE id = ?');
$st->execute([$areaId]);
$area = $st->fetch();
if (!$area) jsonExit(['error' => 'Unknown area.'], 404);

$dLat = BASE_DLAT * $m;
$dLon = BASE_DLON * $m;
$r0 = (int)floor($area['lat1'] / $dLat); $r1 = (int)floor($area['lat2'] / $dLat);
$c0 = (int)floor($area['lon1'] / $dLon); $c1 = (int)floor($area['lon2'] / $dLon);
$cells = [];
for ($r = $r0; $r <= $r1; $r++) {
    for ($c = $c0; $c <= $c1; $c++) {
        $cells[] = ['r' => $r, 'c' => $c,
            'lat1' => $r * $dLat, 'lat2' => ($r + 1) * $dLat,
            'lon1' => $c * $dLon, 'lon2' => ($c + 1) * $dLon];
    }
}

/** Load every stored count (all sizes) inside the base-cell range covering this grid. */
function loadStored($pdo, $m, $r0, $r1, $c0, $c1, $minFetched = 0) {
    $st = $pdo->prepare('SELECT m, r, c, type, years, count FROM lattice_counts
        WHERE r * m BETWEEN CAST(? AS INTEGER) AND CAST(? AS INTEGER) AND c * m BETWEEN CAST(? AS INTEGER) AND CAST(? AS INTEGER) AND fetched_at >= ?');
    $st->execute([$r0 * $m, ($r1 + 1) * $m - 1, $c0 * $m, ($c1 + 1) * $m - 1, $minFetched]);
    $out = [];
    foreach ($st->fetchAll() as $row) $out["{$row['m']}:{$row['r']}:{$row['c']}"][$row['type']][(int)$row['years']] = (int)$row['count'];
    return $out;
}

/** Direct count, or the sum of the 4 child cells (recursively); null if unknown. */
function countFor(&$stored, $m, $r, $c, $type, $y) {
    $direct = $stored["$m:$r:$c"][$type][$y] ?? null;
    if ($direct !== null) return $direct;
    if ($m === 1) return null;
    $h = intdiv($m, 2);
    $sum = 0;
    foreach ([[0, 0], [0, 1], [1, 0], [1, 1]] as [$dr, $dc]) {
        $v = countFor($stored, $h, $r * 2 + $dr, $c * 2 + $dc, $type, $y);
        if ($v === null) return null;
        $sum += $v;
    }
    return $sum;
}

function gridCounts(&$stored, $cells, $m, $types, $yearsList) {
    $out = [];
    foreach ($cells as $cell) {
        foreach ($types as $t) {
            foreach ($yearsList as $y) {
                $v = countFor($stored, $m, $cell['r'], $cell['c'], $t, $y);
                if ($v !== null) $out["{$cell['r']}_{$cell['c']}"][$t][$y] = $v;
            }
        }
    }
    return $out;
}

$stored = loadStored($pdo, $m, $r0, $r1, $c0, $c1);
$stopReason = null;
$queriesUsed = 0;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    requireQuotaPermission();
    $years = (int)($in['years'] ?? 4);
    if ($years < 1 || $years > 6) jsonExit(['error' => 'Years must be 1–6.'], 400);
    $max = max(1, min(25, (int)($in['max'] ?? 10)));
    $auth = wigleCredentials();
    // within=m:r:c → only count cells inside that (larger) parent cell — drill-down.
    $work = $cells;
    if (!empty($in['within']) && preg_match('/^(\d+):(-?\d+):(-?\d+)$/', $in['within'], $w)) {
        [$pm, $pr, $pc] = [(int)$w[1], (int)$w[2], (int)$w[3]];
        $work = array_values(array_filter($cells, fn($cl) =>
            (int)floor($cl['r'] * $m / $pm) === $pr && (int)floor($cl['c'] * $m / $pm) === $pc));
    }
    // refresh=1: treat counts older than 90 days as missing so they get re-counted.
    if (!empty($in['refresh'])) $stored = loadStored($pdo, $m, $r0, $r1, $c0, $c1, time() - REFRESH_AFTER);
    $save = $pdo->prepare('INSERT OR REPLACE INTO lattice_counts VALUES (?,?,?,?,?,?,?)');
    $cutoff = date('Ymd', strtotime("-$years years"));

    $done = 0;
    foreach ([0, $years] as $y) {
        foreach ($types as $type) {
            foreach ($work as $cell) {
                if ($done >= $max || $stopReason) break 3;
                [$r, $c] = [$cell['r'], $cell['c']];
                if (countFor($stored, $m, $r, $c, $type, $y) !== null) continue;
                if ($y > 0 && countFor($stored, $m, $r, $c, $type, 0) === 0) {
                    // Nothing ever recorded here → nothing recent either. Free.
                    $save->execute([$m, $r, $c, $type, $y, 0, time()]);
                    $stored["$m:$r:$c"][$type][$y] = 0;
                    continue;
                }
                $params = [
                    'onlymine' => 'false', 'resultsPerPage' => 1,
                    'latrange1' => $cell['lat1'], 'latrange2' => $cell['lat2'],
                    'longrange1' => $cell['lon1'], 'longrange2' => $cell['lon2'],
                ];
                if ($y > 0) $params['lastupdt'] = $cutoff;
                [$code, $json, $raw] = httpGetJson(WIGLE_ENDPOINTS[$type] . '?' . http_build_query($params), [], $auth);
                if ($code === 429) { logQuery(true); $stopReason = 'Daily WiGLE query limit reached — resume tomorrow.'; break 3; }
                logQuery();
                $queriesUsed++; $done++;
                if ($code !== 200 || !is_array($json) || empty($json['success'])) {
                    $msg = is_array($json) ? ($json['message'] ?? $json['error'] ?? '') : substr((string)$raw, 0, 200);
                    $stopReason = "WiGLE error (HTTP $code) $msg";
                    break 3;
                }
                $n = (int)($json['totalResults'] ?? 0);
                $save->execute([$m, $r, $c, $type, $y, $n, time()]);
                $stored["$m:$r:$c"][$type][$y] = $n;
            }
        }
    }
}

// Everything stored (old or not) is shown; report how much is due for refresh.
$stored = loadStored($pdo, $m, $r0, $r1, $c0, $c1);
$st = $pdo->prepare('SELECT COUNT(*) n, MIN(fetched_at) oldest FROM lattice_counts
    WHERE r * m BETWEEN CAST(? AS INTEGER) AND CAST(? AS INTEGER) AND c * m BETWEEN CAST(? AS INTEGER) AND CAST(? AS INTEGER) AND fetched_at < ?');
$st->execute([$r0 * $m, ($r1 + 1) * $m - 1, $c0 * $m, ($c1 + 1) * $m - 1, time() - REFRESH_AFTER]);
$due = $st->fetch();

jsonExit([
    'refreshDue' => (int)$due['n'], 'oldestDue' => $due['oldest'] ? (int)$due['oldest'] : null,
    'size' => $m, 'types' => $types, 'cells' => $cells,
    'counts' => gridCounts($stored, $cells, $m, $types, range(0, 6)),
    'queriesUsed' => $queriesUsed, 'stopReason' => $stopReason, 'quota' => quotaToday(),
]);
