<?php
/**
 * POST fetch.php  area_id=1 type=wifi|bluetooth|cell pages=1..10
 * Pulls the next N pages of WiGLE search results for an area, resuming from
 * the saved cursor, and caches every point. Each page = 1 WiGLE query.
 * Stops early (and remembers where it was) on the daily limit (HTTP 429).
 */
require __DIR__ . '/lib.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') jsonExit(['error' => 'POST only.'], 405);
requireQuotaPermission();

$areaId = (int)($_POST['area_id'] ?? 0);
$type = $_POST['type'] ?? '';
$pages = max(1, min(10, (int)($_POST['pages'] ?? 1)));
if (!isset(WIGLE_ENDPOINTS[$type])) jsonExit(['error' => 'Unknown type.'], 400);

$pdo = db();
$st = $pdo->prepare('SELECT * FROM areas WHERE id = ?');
$st->execute([$areaId]);
$area = $st->fetch();
if (!$area) jsonExit(['error' => 'Unknown area.'], 404);

$pdo->prepare('INSERT OR IGNORE INTO area_progress(area_id, type) VALUES (?, ?)')->execute([$areaId, $type]);
$st = $pdo->prepare('SELECT * FROM area_progress WHERE area_id = ? AND type = ?');
$st->execute([$areaId, $type]);
$prog = $st->fetch();
if ($prog['complete']) jsonExit(['progress' => $prog, 'quota' => quotaToday(), 'message' => 'Already complete.']);

$auth = wigleCredentials();
$perPage = 100;
$upsert = $pdo->prepare('INSERT INTO points(type, netid, lat, lon, name, firsttime, lasttime, encryption)
    VALUES (?,?,?,?,?,?,?,?)
    ON CONFLICT(type, netid) DO UPDATE SET lat=excluded.lat, lon=excluded.lon, name=excluded.name,
        firsttime=excluded.firsttime, lasttime=MAX(COALESCE(lasttime,0), COALESCE(excluded.lasttime,0)),
        encryption=excluded.encryption');
$saveProg = $pdo->prepare('UPDATE area_progress SET cursor=?, total=?, fetched=?, complete=?, updated_at=?
    WHERE area_id=? AND type=?');

$cursor = $prog['cursor'];
$total = $prog['total'];
$fetched = (int)$prog['fetched'];
$complete = 0;
$stopReason = null;
$pagesDone = 0;

for ($i = 0; $i < $pages; $i++) {
    $params = [
        'onlymine' => 'false',
        'latrange1' => $area['lat1'], 'latrange2' => $area['lat2'],
        'longrange1' => $area['lon1'], 'longrange2' => $area['lon2'],
        'resultsPerPage' => $perPage,
    ];
    if ($cursor) $params['searchAfter'] = $cursor;

    [$code, $json, $raw] = httpGetJson(WIGLE_ENDPOINTS[$type] . '?' . http_build_query($params), [], $auth);

    if ($code === 429) { logQuery(true); $stopReason = 'Daily WiGLE query limit reached — resume tomorrow.'; break; }
    logQuery();
    if ($code === 401) { $stopReason = 'WiGLE rejected the API credentials.'; break; }
    if ($code !== 200 || !is_array($json) || empty($json['success'])) {
        $msg = is_array($json) ? ($json['message'] ?? $json['error'] ?? '') : substr((string)$raw, 0, 200);
        $stopReason = "WiGLE error (HTTP $code) $msg";
        break;
    }

    $results = $json['results'] ?? [];
    $pdo->beginTransaction();
    foreach ($results as $r) {
        $netid = $r['netid'] ?? $r['id'] ?? null;
        $lat = $r['trilat'] ?? null;
        $lon = $r['trilong'] ?? null;
        if ($netid === null || $lat === null || $lon === null) continue;
        $upsert->execute([
            $type, (string)$netid, (float)$lat, (float)$lon,
            $r['ssid'] ?? $r['name'] ?? null,
            toEpoch($r['firsttime'] ?? null),
            toEpoch($r['lasttime'] ?? $r['lastupdt'] ?? null),
            $r['encryption'] ?? null,
        ]);
    }
    $pdo->commit();

    $pagesDone++;
    $fetched += count($results);
    $total = $json['totalResults'] ?? $total;
    $cursor = $json['searchAfter'] ?? $json['search_after'] ?? null;
    if (!$cursor || count($results) < $perPage) { $complete = 1; $cursor = null; }
    $saveProg->execute([$cursor, $total, $fetched, $complete, time(), $areaId, $type]);
    if ($complete) break;
}

jsonExit([
    'progress' => ['type' => $type, 'total' => $total, 'fetched' => $fetched, 'complete' => $complete],
    'pagesDone' => $pagesDone,
    'stopReason' => $stopReason,
    'quota' => quotaToday(),
]);
