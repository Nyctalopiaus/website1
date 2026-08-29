<?php
if (session_status() === PHP_SESSION_NONE) {
    ini_set('session.cookie_httponly', 1);
    session_start();
}

if (empty($_SESSION['is_admin'])) {
    header('Location: admin.php');
    exit;
}

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';

if (empty($_SESSION['csrf_token'])) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}

$db = getDbConnection();

$statusMsg = '';
$statusType = 'info';
$simulationReport = null;

function h($val) {
    return htmlspecialchars((string)$val, ENT_QUOTES, 'UTF-8');
}

function parseIdList($inputArr) {
    if (!is_array($inputArr)) {
        return [];
    }
    $ids = [];
    foreach ($inputArr as $raw) {
        $id = (int)$raw;
        if ($id > 0) {
            $ids[$id] = true;
        }
    }
    return array_keys($ids);
}

function getQaBatchTemplates() {
    return [
        'resolve_obvious_out_of_scope' => [
            'label' => 'Resolve Obvious Out-of-Scope',
            'description' => 'Resolves rows only when location text strongly indicates non-CO/CA/TX regions.',
        ],
        'reassign_strong_signals' => [
            'label' => 'Reassign Strong Signals',
            'description' => 'Reassigns rows only when geo bounds or city/address signals are high confidence.',
        ],
        'high_conf_full_pass' => [
            'label' => 'High-Confidence Full Pass',
            'description' => 'Reassign strong-signal rows and resolve obvious out-of-scope rows in one pass.',
        ],
    ];
}

function makeInClause(array $ids, $prefix = 'p') {
    $ph = [];
    $bind = [];
    foreach ($ids as $i => $id) {
        $key = ':' . $prefix . $i;
        $ph[] = $key;
        $bind[$key] = (int)$id;
    }
    return ['sql' => implode(',', $ph), 'bind' => $bind];
}

/**
 * Looks up coordinates for a free-text address/venue query via OpenStreetMap's Nominatim
 * search API. No API key required, but Nominatim's usage policy requires a real identifying
 * User-Agent and caps at ~1 request/second — both are fine here since this only ever fires
 * on a single admin click from the Venue Review tab's "Regen. Maps link" button, never in bulk.
 * Returns ['lat' => float, 'lng' => float] on success, or null if the lookup found nothing or
 * failed (network error, timeout, bad response) — callers should treat null as "couldn't
 * geocode, leave whatever coordinates were already there" rather than a hard failure.
 */
function geocodeAddress($query) {
    $query = trim((string)$query);
    if ($query === '') {
        return null;
    }
    $url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' . urlencode($query);
    try {
        $resp = fetchHttpResource($url, [
            'timeout' => 6,
            'user_agent' => 'NyctosGigGrid/1.0 (admin venue geocoding)',
        ]);
    } catch (Throwable $e) {
        return null;
    }
    if (($resp['status'] ?? 0) !== 200 || empty($resp['body'])) {
        return null;
    }
    $data = json_decode($resp['body'], true);
    if (!is_array($data) || empty($data[0]['lat']) || empty($data[0]['lon'])) {
        return null;
    }
    return ['lat' => (float)$data[0]['lat'], 'lng' => (float)$data[0]['lon']];
}

function inferMarketFromCoords($lat, $lng) {
    if ($lat === null || $lng === null) {
        return null;
    }
    $lat = (float)$lat;
    $lng = (float)$lng;
    if ($lat >= 36.0 && $lat <= 42.5 && $lng >= -110.5 && $lng <= -101.5) {
        return 'colorado';
    }
    if ($lat >= 32.0 && $lat <= 42.5 && $lng >= -125.0 && $lng <= -114.0) {
        return 'california';
    }
    if ($lat >= 25.0 && $lat <= 37.5 && $lng >= -107.0 && $lng <= -93.0) {
        return 'texas';
    }
    return null;
}

function containsRegionToken($blob, $token) {
    return preg_match('/(^|[^A-Z])' . preg_quote($token, '/') . '([^A-Z]|$)/', $blob) === 1;
}

function inferOutOfScopeBucket(array $row) {
    $address = strtoupper((string)($row['address'] ?? ''));
    $city = strtoupper((string)($row['city'] ?? ''));
    $venue = strtoupper((string)($row['venue_name'] ?? ''));
    $blob = $address . ' ' . $city . ' ' . $venue;

    if (strpos($blob, ' ARIZONA') !== false || containsRegionToken($blob, 'AZ')) {
        return 'Arizona';
    }
    if (strpos($blob, ' MISSOURI') !== false || containsRegionToken($blob, 'MO')) {
        return 'Missouri';
    }
    if (strpos($blob, ' ILLINOIS') !== false || containsRegionToken($blob, 'IL')) {
        return 'Illinois';
    }
    if (strpos($blob, ' WASHINGTON') !== false || containsRegionToken($blob, 'WA')) {
        return 'Washington';
    }
    if (strpos($blob, ' OREGON') !== false || containsRegionToken($blob, 'OR')) {
        return 'Oregon';
    }
    if (strpos($blob, ' NEW YORK') !== false || containsRegionToken($blob, 'NY')) {
        return 'New York';
    }
    if (strpos($blob, ' ALBERTA') !== false || strpos($blob, ' CALGARY') !== false) {
        return 'Canada/Alberta';
    }
    if (strpos($blob, ' THAILAND') !== false || strpos($blob, 'กรุงเทพ') !== false || strpos($blob, 'ประเทศไทย') !== false) {
        return 'Thailand';
    }
    if (strpos($blob, ' PORTUGAL') !== false || strpos($blob, 'PORTIM') !== false) {
        return 'Portugal';
    }
    if (strpos($blob, ' CYPRUS') !== false || strpos($blob, 'ΛΕΜΕΣ') !== false) {
        return 'Cyprus';
    }

    return null;
}

function normalizeMarketKeyForQa($market) {
    $m = strtolower(trim((string)$market));
    if ($m === 'front-range' || $m === 'frontrange' || $m === 'co' || $m === 'colorado') {
        return 'colorado';
    }
    if ($m === 'socal' || $m === 'ca' || $m === 'california') {
        return 'california';
    }
    if ($m === 'tx' || $m === 'texas') {
        return 'texas';
    }
    if ($m === 'uk' || $m === 'united kingdom' || $m === 'gb') {
        return 'england';
    }
    if ($m === 'england' || $m === 'scotland' || $m === 'wales' || $m === 'ireland') {
        return $m;
    }
    return $m;
}

function inferMarketFromTextSignalsDetailed(PDO $db, array $row) {
    static $cityToMarkets = null;

    if ($cityToMarkets === null) {
        $cityToMarkets = [];
        $stmt = $db->query("SELECT LOWER(TRIM(city_name)) AS city_name, LOWER(TRIM(market)) AS market_key FROM market_cities WHERE is_active = 1");
        if ($stmt !== false) {
            foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
                $city = trim((string)($r['city_name'] ?? ''));
                $market = normalizeMarketKeyForQa($r['market_key'] ?? '');
                if ($city === '' || $market === '') {
                    continue;
                }
                if (!isset($cityToMarkets[$city])) {
                    $cityToMarkets[$city] = [];
                }
                $cityToMarkets[$city][$market] = true;
            }
        }
    }

    $city = strtolower(trim((string)($row['city'] ?? '')));
    $city = preg_replace('/\s+/', ' ', $city);
    $cityBase = trim((string)preg_replace('/,\s*[a-z]{2}$/i', '', $city));

    if ($city !== '' && isset($cityToMarkets[$city])) {
        $markets = array_keys($cityToMarkets[$city]);
        if (count($markets) === 1 && in_array($markets[0], ['colorado', 'california', 'texas'], true)) {
            return ['market' => $markets[0], 'source' => 'city_map_exact'];
        }
    }

    if ($cityBase !== '' && isset($cityToMarkets[$cityBase])) {
        $markets = array_keys($cityToMarkets[$cityBase]);
        if (count($markets) === 1 && in_array($markets[0], ['colorado', 'california', 'texas'], true)) {
            return ['market' => $markets[0], 'source' => 'city_map_base'];
        }
    }

    $address = strtoupper((string)($row['address'] ?? ''));
    $cityRaw = strtoupper((string)($row['city'] ?? ''));
    $venue = strtoupper((string)($row['venue_name'] ?? ''));
    $blob = $address . ' ' . $cityRaw . ' ' . $venue;

    if (preg_match('/(^|[^A-Z])(CO|COLORADO)([^A-Z]|$)/', $blob)) {
        return ['market' => 'colorado', 'source' => 'text_token'];
    }
    if (preg_match('/(^|[^A-Z])(CA|CALIFORNIA)([^A-Z]|$)/', $blob)) {
        return ['market' => 'california', 'source' => 'text_token'];
    }
    if (preg_match('/(^|[^A-Z])(TX|TEXAS)([^A-Z]|$)/', $blob)) {
        return ['market' => 'texas', 'source' => 'text_token'];
    }

    return ['market' => null, 'source' => 'none'];
}

function inferMarketFromTextSignals(PDO $db, array $row) {
    $detail = inferMarketFromTextSignalsDetailed($db, $row);
    return $detail['market'] ?? null;
}

function calculateQaDecision(PDO $db, array $row) {
    $currentMarket = normalizeMarketKeyForQa($row['market'] ?? $row['current_market'] ?? '');
    $coordMarket = inferMarketFromCoords($row['latitude'] ?? null, $row['longitude'] ?? null);
    $textInference = inferMarketFromTextSignalsDetailed($db, $row);
    $textMarket = $textInference['market'] ?? null;
    $outOfScope = inferOutOfScopeBucket($row);

    if (in_array($coordMarket, ['colorado', 'california', 'texas'], true) && $coordMarket !== $currentMarket) {
        return [
            'action' => 'reassign',
            'target_market' => $coordMarket,
            'confidence' => 95,
            'reason' => 'Geo bounds strongly indicate ' . strtoupper($coordMarket)
        ];
    }

    if (in_array($textMarket, ['colorado', 'california', 'texas'], true) && $textMarket !== $currentMarket) {
        $confidence = ($textInference['source'] ?? '') === 'text_token' ? 90 : 88;
        return [
            'action' => 'reassign',
            'target_market' => $textMarket,
            'confidence' => $confidence,
            'reason' => 'City/address inference points to ' . strtoupper($textMarket)
        ];
    }

    if ($outOfScope !== null && !in_array($coordMarket, ['colorado', 'california', 'texas'], true) && !in_array($textMarket, ['colorado', 'california', 'texas'], true)) {
        return [
            'action' => 'resolve_out_of_scope',
            'target_market' => null,
            'confidence' => 92,
            'reason' => 'Location text indicates out-of-scope region: ' . $outOfScope
        ];
    }

    return [
        'action' => 'skip',
        'target_market' => null,
        'confidence' => 0,
        'reason' => 'No safe high-confidence action'
    ];
}

/**
 * Same "most complete" survivor heuristic used by SyncService.php's merge passes: prefer a
 * row with price data, then a ticket URL, then more populated secondary fields, then the
 * oldest row. Kept local (rather than shared) since it's a small, self-contained sort and
 * this page already needs its own copy of the coalesce/re-pointing logic below.
 */
function pickMergeSurvivor(array $rows) {
    usort($rows, function ($a, $b) {
        $score = function ($r) {
            $s = 0;
            $s += ($r['price_min'] !== null) ? 2 : 0;
            $s += (!empty($r['ticket_url'])) ? 1 : 0;
            $s += strlen((string)($r['tags'] ?? '')) + strlen((string)($r['ticket_status_code'] ?? '')) + strlen((string)($r['availability_tag'] ?? ''));
            return $s;
        };
        $sa = $score($a);
        $sb = $score($b);
        if ($sa !== $sb) {
            return $sb <=> $sa;
        }
        return strcmp((string)($a['created_at'] ?? ''), (string)($b['created_at'] ?? ''));
    });
    return $rows;
}

$tabRaw = (string)($_GET['tab'] ?? 'market');
$tab = in_array($tabRaw, ['double_bills', 'venues'], true) ? $tabRaw : 'market';

// --- Market tab: batch action POST handler ---
if ($_SERVER['REQUEST_METHOD'] === 'POST' && (($_POST['admin_action'] ?? '') === 'dq_batch')) {
    $postedCsrf = (string)($_POST['csrf_token'] ?? '');
    if (!hash_equals((string)$_SESSION['csrf_token'], $postedCsrf)) {
        $statusType = 'error';
        $statusMsg = 'CSRF validation failed. Refresh and try again.';
    } else {
        $batchAction = trim((string)($_POST['batch_action'] ?? ''));
        $templateKey = trim((string)($_POST['template_key'] ?? ''));
        $templates = getQaBatchTemplates();
        $selectedIds = parseIdList($_POST['selected_flags'] ?? []);

        if (empty($selectedIds)) {
            $statusType = 'warn';
            $statusMsg = 'No rows selected.';
        } else {
            $in = makeInClause($selectedIds, 'f');
            try {
                $db->beginTransaction();

                if ($batchAction === 'resolve') {
                    $sql = "UPDATE data_quality_event_flags SET resolved = 1 WHERE id IN ({$in['sql']})";
                    $stmt = $db->prepare($sql);
                    foreach ($in['bind'] as $k => $v) {
                        $stmt->bindValue($k, $v, PDO::PARAM_INT);
                    }
                    $stmt->execute();
                    $statusType = 'success';
                    $statusMsg = 'Resolved ' . $stmt->rowCount() . ' flagged rows.';
                } elseif ($batchAction === 'reopen') {
                    $sql = "UPDATE data_quality_event_flags SET resolved = 0 WHERE id IN ({$in['sql']})";
                    $stmt = $db->prepare($sql);
                    foreach ($in['bind'] as $k => $v) {
                        $stmt->bindValue($k, $v, PDO::PARAM_INT);
                    }
                    $stmt->execute();
                    $statusType = 'success';
                    $statusMsg = 'Re-opened ' . $stmt->rowCount() . ' flagged rows.';
                } elseif (in_array($batchAction, ['reassign_colorado', 'reassign_california', 'reassign_texas'], true)) {
                    $targetMarket = str_replace('reassign_', '', $batchAction);

                    $sqlEventIds = "SELECT DISTINCT event_id FROM data_quality_event_flags WHERE id IN ({$in['sql']})";
                    $stmtEventIds = $db->prepare($sqlEventIds);
                    foreach ($in['bind'] as $k => $v) {
                        $stmtEventIds->bindValue($k, $v, PDO::PARAM_INT);
                    }
                    $stmtEventIds->execute();
                    $eventIds = [];
                    foreach ($stmtEventIds->fetchAll(PDO::FETCH_COLUMN) as $eid) {
                        $eid = trim((string)$eid);
                        if ($eid !== '') {
                            $eventIds[] = $eid;
                        }
                    }

                    $eventsUpdated = 0;
                    if (!empty($eventIds)) {
                        $stmtUpdateOne = $db->prepare('UPDATE events SET market = :target_market WHERE event_id = :event_id');
                        foreach ($eventIds as $eid) {
                            $stmtUpdateOne->execute([
                                ':target_market' => $targetMarket,
                                ':event_id' => $eid
                            ]);
                            $eventsUpdated += $stmtUpdateOne->rowCount();
                        }
                    }

                    $sqlResolveFlags = "UPDATE data_quality_event_flags SET resolved = 1, inferred_market = :target_market WHERE id IN ({$in['sql']})";
                    $stmtResolveFlags = $db->prepare($sqlResolveFlags);
                    $stmtResolveFlags->bindValue(':target_market', $targetMarket, PDO::PARAM_STR);
                    foreach ($in['bind'] as $k => $v) {
                        $stmtResolveFlags->bindValue($k, $v, PDO::PARAM_INT);
                    }
                    $stmtResolveFlags->execute();

                    $statusType = 'success';
                    $statusMsg = 'Reassigned ' . $eventsUpdated . ' events to ' . strtoupper($targetMarket) . ' and resolved ' . $stmtResolveFlags->rowCount() . ' flags.';
                } elseif ($batchAction === 'reassign_inferred') {
                    $sqlFlagRows = "
                        SELECT
                            f.id,
                            f.event_id,
                            COALESCE(
                                NULLIF(TRIM(f.inferred_market), ''),
                                CASE
                                    WHEN v.latitude BETWEEN 36.0 AND 42.5 AND v.longitude BETWEEN -110.5 AND -101.5 THEN 'colorado'
                                    WHEN v.latitude BETWEEN 32.0 AND 42.5 AND v.longitude BETWEEN -125.0 AND -114.0 THEN 'california'
                                    WHEN v.latitude BETWEEN 25.0 AND 37.5 AND v.longitude BETWEEN -107.0 AND -93.0 THEN 'texas'
                                    ELSE NULL
                                END
                            ) AS inferred_market_calc
                        FROM data_quality_event_flags f
                        LEFT JOIN events e ON e.event_id = f.event_id
                        LEFT JOIN venues v ON e.venue_name = v.venue_name
                        WHERE f.id IN ({$in['sql']})
                    ";
                    $stmtFlagRows = $db->prepare($sqlFlagRows);
                    foreach ($in['bind'] as $k => $v) {
                        $stmtFlagRows->bindValue($k, $v, PDO::PARAM_INT);
                    }
                    $stmtFlagRows->execute();
                    $rows = $stmtFlagRows->fetchAll(PDO::FETCH_ASSOC);

                    $stmtUpdateEvent = $db->prepare('UPDATE events SET market = :target_market WHERE event_id = :event_id');
                    $stmtResolveOne = $db->prepare('UPDATE data_quality_event_flags SET resolved = 1, inferred_market = :target_market WHERE id = :id');

                    $eventsUpdated = 0;
                    $flagsResolved = 0;
                    $skipped = 0;

                    foreach ($rows as $r) {
                        $flagId = (int)($r['id'] ?? 0);
                        $eventId = trim((string)($r['event_id'] ?? ''));
                        $target = strtolower(trim((string)($r['inferred_market_calc'] ?? '')));

                        if ($flagId <= 0 || $eventId === '' || !in_array($target, ['colorado', 'california', 'texas'], true)) {
                            $skipped++;
                            continue;
                        }

                        $stmtUpdateEvent->execute([
                            ':target_market' => $target,
                            ':event_id' => $eventId
                        ]);
                        $eventsUpdated += $stmtUpdateEvent->rowCount();

                        $stmtResolveOne->execute([
                            ':target_market' => $target,
                            ':id' => $flagId
                        ]);
                        $flagsResolved += $stmtResolveOne->rowCount();
                    }

                    $statusType = 'success';
                    $statusMsg = 'Auto-reassigned ' . $eventsUpdated . ' events by inferred market, resolved ' . $flagsResolved . ' flags, skipped ' . $skipped . ' ambiguous rows.';
                } elseif ($batchAction === 'reassign_text_inferred') {
                    $sqlFlagRows = "
                        SELECT
                            f.id,
                            f.event_id,
                            f.current_market,
                            e.market,
                            e.venue_name,
                            v.city,
                            v.address,
                            v.latitude,
                            v.longitude
                        FROM data_quality_event_flags f
                        LEFT JOIN events e ON e.event_id = f.event_id
                        LEFT JOIN venues v ON e.venue_name = v.venue_name
                        WHERE f.id IN ({$in['sql']})
                    ";
                    $stmtFlagRows = $db->prepare($sqlFlagRows);
                    foreach ($in['bind'] as $k => $v) {
                        $stmtFlagRows->bindValue($k, $v, PDO::PARAM_INT);
                    }
                    $stmtFlagRows->execute();
                    $rows = $stmtFlagRows->fetchAll(PDO::FETCH_ASSOC);

                    $stmtUpdateEvent = $db->prepare('UPDATE events SET market = :target_market WHERE event_id = :event_id');
                    $stmtResolveOne = $db->prepare('UPDATE data_quality_event_flags SET resolved = 1, inferred_market = :target_market WHERE id = :id');

                    $eventsUpdated = 0;
                    $flagsResolved = 0;
                    $skipped = 0;
                    $noChange = 0;

                    foreach ($rows as $r) {
                        $flagId = (int)($r['id'] ?? 0);
                        $eventId = trim((string)($r['event_id'] ?? ''));
                        if ($flagId <= 0 || $eventId === '') {
                            $skipped++;
                            continue;
                        }

                        $coordInferred = inferMarketFromCoords($r['latitude'] ?? null, $r['longitude'] ?? null);
                        if ($coordInferred !== null) {
                            // This action is dedicated to text/city inference for ambiguous rows.
                            $skipped++;
                            continue;
                        }

                        $target = inferMarketFromTextSignals($db, $r);
                        if (!in_array($target, ['colorado', 'california', 'texas'], true)) {
                            $skipped++;
                            continue;
                        }

                        $currentEventMarket = normalizeMarketKeyForQa($r['market'] ?? $r['current_market'] ?? '');
                        if ($currentEventMarket === $target) {
                            $noChange++;
                            continue;
                        }

                        $stmtUpdateEvent->execute([
                            ':target_market' => $target,
                            ':event_id' => $eventId
                        ]);
                        $eventsUpdated += $stmtUpdateEvent->rowCount();

                        $stmtResolveOne->execute([
                            ':target_market' => $target,
                            ':id' => $flagId
                        ]);
                        $flagsResolved += $stmtResolveOne->rowCount();
                    }

                    $statusType = 'success';
                    $statusMsg = 'Auto-reassigned ' . $eventsUpdated . ' events via city/address inference, resolved ' . $flagsResolved . ' flags, skipped ' . $skipped . ' rows, left ' . $noChange . ' unchanged.';
                } elseif ($batchAction === 'auto_triage_high_conf' || $batchAction === 'simulate_rules' || $batchAction === 'apply_template') {
                    if ($batchAction === 'apply_template' && !isset($templates[$templateKey])) {
                        throw new RuntimeException('Choose a valid saved template.');
                    }

                    $sqlFlagRows = "
                        SELECT
                            f.id,
                            f.event_id,
                            f.current_market,
                            e.market,
                            e.source,
                            e.artist_name,
                            e.venue_name,
                            v.city,
                            v.address,
                            v.latitude,
                            v.longitude
                        FROM data_quality_event_flags f
                        LEFT JOIN events e ON e.event_id = f.event_id
                        LEFT JOIN venues v ON e.venue_name = v.venue_name
                        WHERE f.id IN ({$in['sql']})
                    ";
                    $stmtFlagRows = $db->prepare($sqlFlagRows);
                    foreach ($in['bind'] as $k => $v) {
                        $stmtFlagRows->bindValue($k, $v, PDO::PARAM_INT);
                    }
                    $stmtFlagRows->execute();
                    $rows = $stmtFlagRows->fetchAll(PDO::FETCH_ASSOC);

                    $summary = [
                        'reassign' => 0,
                        'resolve_out_of_scope' => 0,
                        'skip' => 0,
                    ];
                    $previewRows = [];

                    $stmtUpdateEvent = $db->prepare('UPDATE events SET market = :target_market WHERE event_id = :event_id');
                    $stmtResolveOne = $db->prepare('UPDATE data_quality_event_flags SET resolved = 1, inferred_market = :target_market WHERE id = :id');
                    $stmtResolveOutOfScope = $db->prepare('UPDATE data_quality_event_flags SET resolved = 1 WHERE id = :id');

                    $templateReassignOnly = ($batchAction === 'apply_template' && $templateKey === 'reassign_strong_signals');
                    $templateResolveOnly = ($batchAction === 'apply_template' && $templateKey === 'resolve_obvious_out_of_scope');

                    $eventsUpdated = 0;
                    $flagsResolved = 0;

                    foreach ($rows as $r) {
                        $decision = calculateQaDecision($db, $r);
                        $summary[$decision['action']] = ($summary[$decision['action']] ?? 0) + 1;

                        if (count($previewRows) < 40) {
                            $previewRows[] = [
                                'flag_id' => (int)($r['id'] ?? 0),
                                'event_id' => (string)($r['event_id'] ?? ''),
                                'artist_name' => (string)($r['artist_name'] ?? ''),
                                'venue_name' => (string)($r['venue_name'] ?? ''),
                                'city' => (string)($r['city'] ?? ''),
                                'action' => $decision['action'],
                                'target_market' => (string)($decision['target_market'] ?? ''),
                                'confidence' => (int)($decision['confidence'] ?? 0),
                                'reason' => (string)($decision['reason'] ?? ''),
                            ];
                        }

                        if ($batchAction === 'simulate_rules') {
                            continue;
                        }

                        $flagId = (int)($r['id'] ?? 0);
                        $eventId = trim((string)($r['event_id'] ?? ''));
                        if ($flagId <= 0 || $eventId === '') {
                            continue;
                        }

                        if ($decision['action'] === 'reassign' && in_array($decision['target_market'], ['colorado', 'california', 'texas'], true) && !$templateResolveOnly) {
                            $stmtUpdateEvent->execute([
                                ':target_market' => $decision['target_market'],
                                ':event_id' => $eventId
                            ]);
                            $eventsUpdated += $stmtUpdateEvent->rowCount();

                            $stmtResolveOne->execute([
                                ':target_market' => $decision['target_market'],
                                ':id' => $flagId
                            ]);
                            $flagsResolved += $stmtResolveOne->rowCount();
                        } elseif ($decision['action'] === 'resolve_out_of_scope' && !$templateReassignOnly) {
                            $stmtResolveOutOfScope->execute([
                                ':id' => $flagId
                            ]);
                            $flagsResolved += $stmtResolveOutOfScope->rowCount();
                        }
                    }

                    $simulationReport = [
                        'selected_count' => count($rows),
                        'summary' => $summary,
                        'preview_rows' => $previewRows,
                    ];

                    if ($batchAction === 'simulate_rules') {
                        $statusType = 'warn';
                        $statusMsg = 'Simulation complete. Reassign: ' . $summary['reassign'] . ', resolve as out-of-scope: ' . $summary['resolve_out_of_scope'] . ', skip: ' . $summary['skip'] . '. No database changes were applied.';
                    } elseif ($batchAction === 'apply_template') {
                        $templateLabel = (string)$templates[$templateKey]['label'];
                        $statusType = 'success';
                        $statusMsg = 'Template "' . $templateLabel . '" applied. Reassigned ' . $eventsUpdated . ' events, resolved ' . $flagsResolved . ' flags, skipped ' . $summary['skip'] . ' rows.';
                    } else {
                        $statusType = 'success';
                        $statusMsg = 'High-confidence triage complete. Reassigned ' . $eventsUpdated . ' events and resolved ' . $flagsResolved . ' flags. Skipped ' . $summary['skip'] . ' rows.';
                    }
                } else {
                    $statusType = 'error';
                    $statusMsg = 'Invalid batch action.';
                }

                $db->commit();
            } catch (Throwable $e) {
                if ($db->inTransaction()) {
                    $db->rollBack();
                }
                $statusType = 'error';
                $statusMsg = 'Batch action failed: ' . $e->getMessage();
            }
        }
    }
}

// --- Out-of-Market Purge POST handler ---
if ($_SERVER['REQUEST_METHOD'] === 'POST' && (($_POST['admin_action'] ?? '') === 'purge_out_of_market')) {
    $postedCsrf = (string)($_POST['csrf_token'] ?? '');
    if (!hash_equals((string)$_SESSION['csrf_token'], $postedCsrf)) {
        $statusType = 'error';
        $statusMsg = 'CSRF validation failed. Refresh and try again.';
    } else {
        try {
            require_once __DIR__ . '/services/EventAggregator.php';
            require_once __DIR__ . '/services/SyncService.php';
            $aggregator = new EventAggregator($db);
            $purgeRes = purgeInvalidMarketEvents($db, $aggregator);
            $statusType = 'success';
            $statusMsg = "Purge complete: Removed {$purgeRes['invalid_events_purged']} out-of-market event(s) and auto-resolved {$purgeRes['double_bill_flags_auto_resolved']} stale double-bill flag(s).";
        } catch (Throwable $e) {
            $statusType = 'error';
            $statusMsg = 'Purge failed: ' . $e->getMessage();
        }
    }
}

// --- Double-bill tab: group action POST handler ---
if ($_SERVER['REQUEST_METHOD'] === 'POST' && (($_POST['admin_action'] ?? '') === 'db_group_action')) {
    $postedCsrf = (string)($_POST['csrf_token'] ?? '');
    if (!hash_equals((string)$_SESSION['csrf_token'], $postedCsrf)) {
        $statusType = 'error';
        $statusMsg = 'CSRF validation failed. Refresh and try again.';
    } else {
        $groupAction = trim((string)($_POST['group_action'] ?? ''));
        $groupKey = trim((string)($_POST['group_key'] ?? ''));

        if ($groupKey === '') {
            $statusType = 'error';
            $statusMsg = 'Missing group.';
        } elseif ($groupAction === 'dismiss') {
            try {
                $stmt = $db->prepare("UPDATE data_quality_double_bill_flags SET resolved = 1, resolution = 'dismissed', resolved_at = CURRENT_TIMESTAMP WHERE group_key = :gk");
                $stmt->execute([':gk' => $groupKey]);
                $statusType = 'success';
                $statusMsg = 'Dismissed group (' . $stmt->rowCount() . ' flag row(s)) as not a duplicate.';
            } catch (Throwable $e) {
                $statusType = 'error';
                $statusMsg = 'Dismiss failed: ' . $e->getMessage();
            }
        } elseif ($groupAction === 'reopen') {
            try {
                $stmt = $db->prepare("UPDATE data_quality_double_bill_flags SET resolved = 0, resolution = NULL, resolved_at = NULL WHERE group_key = :gk");
                $stmt->execute([':gk' => $groupKey]);
                $statusType = 'success';
                $statusMsg = 'Re-opened group (' . $stmt->rowCount() . ' flag row(s)).';
            } catch (Throwable $e) {
                $statusType = 'error';
                $statusMsg = 'Reopen failed: ' . $e->getMessage();
            }
        } elseif ($groupAction === 'merge') {
            $eventIds = array_values(array_filter(array_map('trim', (array)($_POST['event_ids'] ?? []))));
            if (count($eventIds) < 2) {
                $statusType = 'warn';
                $statusMsg = 'Select at least two events in the group to merge.';
            } else {
                try {
                    require_once __DIR__ . '/services/EventAggregator.php';
                    $aggregator = new EventAggregator();

                    $db->beginTransaction();

                    $in = [];
                    $bind = [];
                    foreach ($eventIds as $i => $eid) {
                        $key = ':eid' . $i;
                        $in[] = $key;
                        $bind[$key] = $eid;
                    }
                    $stmtRows = $db->prepare('SELECT * FROM events WHERE event_id IN (' . implode(',', $in) . ')');
                    $stmtRows->execute($bind);
                    $rows = $stmtRows->fetchAll(PDO::FETCH_ASSOC);

                    if (count($rows) < 2) {
                        $db->rollBack();
                        $statusType = 'warn';
                        $statusMsg = 'Fewer than two of the selected events still exist (already merged elsewhere?). Refresh and try again.';
                    } else {
                        $rows = pickMergeSurvivor($rows);
                        $canonical = array_shift($rows);
                        $canonicalId = $canonical['event_id'];

                        $mergedArtist = $canonical['artist_name'];
                        foreach ($rows as $loser) {
                            $mergedArtist = $aggregator->mergePerformerNames($mergedArtist, $loser['artist_name']);
                        }

                        $sourceParts = array_filter(array_map('trim', explode(',', (string)$canonical['source'])));
                        foreach ($rows as $loser) {
                            foreach (array_filter(array_map('trim', explode(',', (string)$loser['source']))) as $s) {
                                if ($s !== '' && !in_array($s, $sourceParts, true)) {
                                    $sourceParts[] = $s;
                                }
                            }
                        }
                        $mergedSource = implode(',', $sourceParts);

                        $coalesceFields = ['ticket_url', 'ticketmaster_url', 'eventbrite_url', 'bandsintown_url', 'venue_url', 'price_min', 'price_max', 'doors_time', 'tags', 'ticket_status_code', 'availability_tag'];
                        $updates = [':source' => $mergedSource, ':artist_name' => $mergedArtist];
                        $setSql = ['source = :source', 'artist_name = :artist_name'];
                        foreach ($coalesceFields as $f) {
                            if ($canonical[$f] === null || $canonical[$f] === '') {
                                foreach ($rows as $loser) {
                                    if (isset($loser[$f]) && $loser[$f] !== null && $loser[$f] !== '') {
                                        $updates[":$f"] = $loser[$f];
                                        $setSql[] = "$f = :$f";
                                        break;
                                    }
                                }
                            }
                        }
                        $soldOut = (int)$canonical['sold_out_flag'];
                        $lowTicket = (int)$canonical['low_ticket_flag'];
                        foreach ($rows as $loser) {
                            $soldOut = max($soldOut, (int)$loser['sold_out_flag']);
                            $lowTicket = max($lowTicket, (int)$loser['low_ticket_flag']);
                        }
                        $updates[':sold_out_flag'] = $soldOut;
                        $updates[':low_ticket_flag'] = $lowTicket;
                        $setSql[] = 'sold_out_flag = :sold_out_flag';
                        $setSql[] = 'low_ticket_flag = :low_ticket_flag';
                        $updates[':id'] = $canonicalId;
                        $db->prepare('UPDATE events SET ' . implode(', ', $setSql) . ' WHERE event_id = :id')->execute($updates);

                        foreach ($rows as $loser) {
                            $loserId = $loser['event_id'];
                            $db->prepare('UPDATE event_price_history SET event_id = :new WHERE event_id = :old')->execute([':new' => $canonicalId, ':old' => $loserId]);
                            $db->prepare('UPDATE attended_log SET event_id = :new WHERE event_id = :old AND NOT EXISTS (SELECT 1 FROM attended_log WHERE event_id = :new2)')->execute([':new' => $canonicalId, ':old' => $loserId, ':new2' => $canonicalId]);
                            $db->prepare('DELETE FROM attended_log WHERE event_id = :old')->execute([':old' => $loserId]);
                            $db->prepare('UPDATE event_setlists SET event_id = :new WHERE event_id = :old AND NOT EXISTS (SELECT 1 FROM event_setlists WHERE event_id = :new2)')->execute([':new' => $canonicalId, ':old' => $loserId, ':new2' => $canonicalId]);
                            $db->prepare('DELETE FROM event_setlists WHERE event_id = :old')->execute([':old' => $loserId]);
                            $db->prepare('UPDATE data_quality_event_flags SET event_id = :new WHERE event_id = :old')->execute([':new' => $canonicalId, ':old' => $loserId]);
                            $db->prepare('UPDATE data_quality_double_bill_flags SET event_id = :new WHERE event_id = :old')->execute([':new' => $canonicalId, ':old' => $loserId]);
                            $db->prepare('DELETE FROM events WHERE event_id = :id')->execute([':id' => $loserId]);
                        }

                        // The whole group is considered reviewed once a merge decision is made,
                        // even for member rows the reviewer left unchecked (they were looked at
                        // and judged not part of this show, which is itself a resolution).
                        $db->prepare("UPDATE data_quality_double_bill_flags SET resolved = 1, resolution = 'merged', resolved_at = CURRENT_TIMESTAMP WHERE group_key = :gk")->execute([':gk' => $groupKey]);

                        $db->commit();
                        $statusType = 'success';
                        $statusMsg = 'Merged ' . count($rows) . ' event(s) into "' . $mergedArtist . '" (event_id ' . $canonicalId . ').';
                    }
                } catch (Throwable $e) {
                    if ($db->inTransaction()) {
                        $db->rollBack();
                    }
                    $statusType = 'error';
                    $statusMsg = 'Merge failed: ' . $e->getMessage();
                }
            }
        } else {
            $statusType = 'error';
            $statusMsg = 'Invalid action.';
        }
    }
}

// --- Venue Review tab: edit / merge / dismiss POST handler ---
if ($_SERVER['REQUEST_METHOD'] === 'POST' && (($_POST['admin_action'] ?? '') === 'venue_action')) {
    $postedCsrf = (string)($_POST['csrf_token'] ?? '');
    if (!hash_equals((string)$_SESSION['csrf_token'], $postedCsrf)) {
        $statusType = 'error';
        $statusMsg = 'CSRF validation failed. Refresh and try again.';
    } else {
        require_once __DIR__ . '/db/schema.php';
        require_once __DIR__ . '/actions/common.php';
        ensureDatabaseSchema($db);

        $venueSubAction = trim((string)($_POST['venue_sub_action'] ?? ''));

        if ($venueSubAction === 'save_venue') {
            $venueId = (int)($_POST['venue_id'] ?? 0);
            $venueName = trim((string)($_POST['venue_name'] ?? ''));
            $market = trim((string)($_POST['market'] ?? ''));
            $address = trim((string)($_POST['address'] ?? ''));
            $city = trim((string)($_POST['city'] ?? ''));
            $latRaw = trim((string)($_POST['latitude'] ?? ''));
            $lngRaw = trim((string)($_POST['longitude'] ?? ''));
            $latitude = $latRaw === '' ? null : (float)$latRaw;
            $longitude = $lngRaw === '' ? null : (float)$lngRaw;
            $capacity = trim((string)($_POST['capacity'] ?? ''));
            $mapsUrl = trim((string)($_POST['maps_url'] ?? ''));
            $isOutdoor = !empty($_POST['is_outdoor']) ? 1 : 0;
            $alternateNames = trim((string)($_POST['alternate_names'] ?? ''));
            $regenerateMaps = !empty($_POST['regenerate_maps']);

            if ($venueId <= 0 || $venueName === '' || $market === '' || $city === '') {
                $statusType = 'error';
                $statusMsg = 'Venue name, market, and city are required.';
            } else {
                $geocodeNote = '';
                if ($regenerateMaps) {
                    $mapsUrl = 'https://www.google.com/maps/search/?api=1&query=' . urlencode($venueName . ' ' . $city);

                    // Prefer the street address for the geocode lookup (more precise); fall back
                    // to venue name + city if no address is on file yet.
                    $geocodeQuery = $address !== '' ? $address : trim($venueName . ', ' . $city);
                    $geocoded = geocodeAddress($geocodeQuery);
                    if ($geocoded !== null) {
                        $latitude = $geocoded['lat'];
                        $longitude = $geocoded['lng'];
                        $geocodeNote = ' Geocoded to ' . round($latitude, 4) . ', ' . round($longitude, 4) . '.';
                    } else {
                        $geocodeNote = ' Could not find coordinates for that address — left latitude/longitude as entered.';
                    }
                }
                try {
                    $stmt = $db->prepare("
                        UPDATE venues SET
                            venue_name = :name, market = :market, address = :address, city = :city,
                            latitude = :lat, longitude = :lng, capacity = :capacity, maps_url = :maps_url,
                            is_outdoor = :outdoor, alternate_names = :alt_names
                        WHERE venue_id = :id
                    ");
                    $stmt->execute([
                        ':name' => $venueName,
                        ':market' => $market,
                        ':address' => $address,
                        ':city' => $city,
                        ':lat' => $latitude,
                        ':lng' => $longitude,
                        ':capacity' => $capacity !== '' ? $capacity : null,
                        ':maps_url' => $mapsUrl,
                        ':outdoor' => $isOutdoor,
                        ':alt_names' => $alternateNames !== '' ? $alternateNames : null,
                        ':id' => $venueId,
                    ]);
                    $statusType = 'success';
                    $statusMsg = 'Saved venue "' . $venueName . '".' . $geocodeNote;
                } catch (Throwable $e) {
                    $statusType = 'error';
                    $statusMsg = 'Save failed: ' . $e->getMessage();
                }
            }
        } elseif ($venueSubAction === 'dismiss_group') {
            $groupKey = trim((string)($_POST['group_key'] ?? ''));
            if ($groupKey === '') {
                $statusType = 'error';
                $statusMsg = 'Missing group.';
            } else {
                $stmt = $db->prepare("UPDATE data_quality_venue_dupe_flags SET resolved = 1, resolution = 'dismissed', resolved_at = CURRENT_TIMESTAMP WHERE group_key = :gk");
                $stmt->execute([':gk' => $groupKey]);
                $statusType = 'success';
                $statusMsg = 'Dismissed group as not a duplicate.';
            }
        } elseif ($venueSubAction === 'merge_group') {
            $groupKey = trim((string)($_POST['group_key'] ?? ''));
            $survivorId = (int)($_POST['survivor_id'] ?? 0);
            $memberIds = parseIdList($_POST['member_ids'] ?? []);

            if ($groupKey === '' || $survivorId <= 0 || count($memberIds) < 2 || !in_array($survivorId, $memberIds, true)) {
                $statusType = 'error';
                $statusMsg = 'Choose a valid survivor venue among the group members.';
            } else {
                try {
                    $db->beginTransaction();

                    $in = makeInClause($memberIds, 'v');
                    $stmtRows = $db->prepare("SELECT * FROM venues WHERE venue_id IN ({$in['sql']})");
                    foreach ($in['bind'] as $k => $v) {
                        $stmtRows->bindValue($k, $v, PDO::PARAM_INT);
                    }
                    $stmtRows->execute();
                    $rows = $stmtRows->fetchAll(PDO::FETCH_ASSOC);
                    $byId = [];
                    foreach ($rows as $r) {
                        $byId[(int)$r['venue_id']] = $r;
                    }

                    if (!isset($byId[$survivorId]) || count($byId) < 2) {
                        $db->rollBack();
                        $statusType = 'warn';
                        $statusMsg = 'Fewer than two of the selected venues still exist (already merged elsewhere?). Refresh and try again.';
                    } else {
                        $survivor = $byId[$survivorId];
                        $loserIds = array_values(array_filter(array_keys($byId), function ($id) use ($survivorId) {
                            return $id !== $survivorId;
                        }));

                        $eventsRepointed = 0;
                        $altNameParts = [];
                        if (!empty($survivor['alternate_names'])) {
                            foreach (explode(',', $survivor['alternate_names']) as $a) {
                                $a = trim($a);
                                if ($a !== '') {
                                    $altNameParts[] = $a;
                                }
                            }
                        }

                        $coalesce = [
                            'address' => $survivor['address'] ?? '',
                            'city' => $survivor['city'] ?? '',
                            'latitude' => $survivor['latitude'] ?? null,
                            'longitude' => $survivor['longitude'] ?? null,
                            'capacity' => $survivor['capacity'] ?? null,
                            'maps_url' => $survivor['maps_url'] ?? '',
                        ];

                        // Repoint one event row at a time (rather than a blanket UPDATE ... WHERE
                        // venue_id = :old) because idx_events_dedupe_backstop is a UNIQUE index on
                        // (venue_id, DATE(start_time), LOWER(TRIM(artist_name))). Two duplicate venue
                        // rows for the same physical venue very often each picked up their own copy
                        // of the same real show, so repointing a loser's event can collide with an
                        // identical event the survivor already has. When that happens the loser's
                        // event isn't a new show to keep — it's the same show already present on the
                        // survivor — so we discard that one event row instead of failing the whole
                        // merge.
                        $eventsDiscarded = 0;
                        $stmtLoserEvents = $db->prepare('SELECT event_id FROM events WHERE venue_id = :old');
                        $stmtRepointOne = $db->prepare('UPDATE events SET venue_id = :new, venue_name = :new_name WHERE event_id = :eid');
                        $stmtDeleteEvent = $db->prepare('DELETE FROM events WHERE event_id = :eid');
                        foreach ($loserIds as $loserId) {
                            $loser = $byId[$loserId];

                            $stmtLoserEvents->execute([':old' => $loserId]);
                            $loserEventIds = $stmtLoserEvents->fetchAll(PDO::FETCH_COLUMN);
                            foreach ($loserEventIds as $eventId) {
                                try {
                                    $stmtRepointOne->execute([
                                        ':new' => $survivorId,
                                        ':new_name' => $survivor['venue_name'],
                                        ':eid' => $eventId,
                                    ]);
                                    $eventsRepointed++;
                                } catch (PDOException $e) {
                                    // PDO/SQLite leaves a statement that threw mid-execute() unable to
                                    // run again until its cursor is explicitly closed.
                                    $stmtRepointOne->closeCursor();
                                    if (strpos($e->getMessage(), 'UNIQUE constraint failed') === false) {
                                        throw $e;
                                    }
                                    // Same venue + date + artist already exists under the survivor —
                                    // this loser row is a duplicate of a show the survivor already has.
                                    $stmtDeleteEvent->execute([':eid' => $eventId]);
                                    $stmtDeleteEvent->closeCursor();
                                    $eventsDiscarded++;
                                }
                            }

                            $loserName = trim((string)($loser['venue_name'] ?? ''));
                            if ($loserName !== '' && strcasecmp($loserName, $survivor['venue_name']) !== 0 && !in_array($loserName, $altNameParts, true)) {
                                $altNameParts[] = $loserName;
                            }
                            if (!empty($loser['alternate_names'])) {
                                foreach (explode(',', $loser['alternate_names']) as $a) {
                                    $a = trim($a);
                                    if ($a !== '' && strcasecmp($a, $survivor['venue_name']) !== 0 && !in_array($a, $altNameParts, true)) {
                                        $altNameParts[] = $a;
                                    }
                                }
                            }

                            foreach (['address', 'city', 'maps_url'] as $f) {
                                if (trim((string)$coalesce[$f]) === '' && !empty($loser[$f])) {
                                    $coalesce[$f] = $loser[$f];
                                }
                            }
                            if ($coalesce['latitude'] === null && $loser['latitude'] !== null) {
                                $coalesce['latitude'] = $loser['latitude'];
                                $coalesce['longitude'] = $loser['longitude'];
                            }
                            if (empty($coalesce['capacity']) && !empty($loser['capacity'])) {
                                $coalesce['capacity'] = $loser['capacity'];
                            }
                        }

                        $stmtUpdateSurvivor = $db->prepare("
                            UPDATE venues SET
                                address = :address, city = :city, latitude = :lat, longitude = :lng,
                                capacity = :capacity, maps_url = :maps_url, alternate_names = :alt_names
                            WHERE venue_id = :id
                        ");
                        $stmtUpdateSurvivor->execute([
                            ':address' => $coalesce['address'],
                            ':city' => $coalesce['city'],
                            ':lat' => $coalesce['latitude'],
                            ':lng' => $coalesce['longitude'],
                            ':capacity' => $coalesce['capacity'],
                            ':maps_url' => $coalesce['maps_url'],
                            ':alt_names' => !empty($altNameParts) ? implode(', ', $altNameParts) : null,
                            ':id' => $survivorId,
                        ]);

                        $inLosers = makeInClause($loserIds, 'l');
                        $stmtDeleteLosers = $db->prepare("DELETE FROM venues WHERE venue_id IN ({$inLosers['sql']})");
                        foreach ($inLosers['bind'] as $k => $v) {
                            $stmtDeleteLosers->bindValue($k, $v, PDO::PARAM_INT);
                        }
                        $stmtDeleteLosers->execute();

                        $db->prepare("UPDATE data_quality_venue_dupe_flags SET resolved = 1, resolution = 'merged', resolved_at = CURRENT_TIMESTAMP WHERE group_key = :gk")->execute([':gk' => $groupKey]);

                        $db->commit();
                        $statusType = 'success';
                        $statusMsg = 'Merged ' . count($loserIds) . ' venue(s) into "' . $survivor['venue_name'] . '" (' . $eventsRepointed . ' event(s) repointed'
                            . ($eventsDiscarded > 0 ? ', ' . $eventsDiscarded . ' duplicate event(s) discarded' : '') . ').';
                    }
                } catch (Throwable $e) {
                    if ($db->inTransaction()) {
                        $db->rollBack();
                    }
                    $statusType = 'error';
                    $statusMsg = 'Merge failed: ' . $e->getMessage();
                }
            }
        } else {
            $statusType = 'error';
            $statusMsg = 'Invalid venue action.';
        }
    }
}

// --- Market tab: load flagged rows ---
if ($tab === 'market') {
    $recentMonths = max(1, (int)($_GET['months'] ?? 18));
    $maxRows = max(50, min(3000, (int)($_GET['limit'] ?? 1000)));

    $summarySql = "
        SELECT
            lower(trim(current_market)) AS market,
            COUNT(*) AS flagged_count
        FROM data_quality_event_flags
        WHERE reason = 'out_of_market_geo'
          AND resolved = 0
        GROUP BY lower(trim(current_market))
        ORDER BY market ASC
    ";

    $countSql = "
        SELECT COUNT(*)
        FROM data_quality_event_flags f
        LEFT JOIN events e ON e.event_id = f.event_id
        WHERE f.reason = 'out_of_market_geo'
          AND f.resolved = 0
          AND (
            e.start_time IS NULL
            OR (
              e.start_time >= datetime('now', '-4 hours')
              AND e.start_time >= datetime('now', '-' || :months || ' months')
            )
          )
    ";

    $detailsSql = "
        SELECT
            f.id AS flag_id,
            f.current_market,
            COALESCE(
                NULLIF(TRIM(f.inferred_market), ''),
                CASE
                    WHEN v.latitude BETWEEN 36.0 AND 42.5 AND v.longitude BETWEEN -110.5 AND -101.5 THEN 'colorado'
                    WHEN v.latitude BETWEEN 32.0 AND 42.5 AND v.longitude BETWEEN -125.0 AND -114.0 THEN 'california'
                    WHEN v.latitude BETWEEN 25.0 AND 37.5 AND v.longitude BETWEEN -107.0 AND -93.0 THEN 'texas'
                    ELSE NULL
                END
            ) AS inferred_market,
            f.flagged_at,
            e.event_id,
            e.market,
            e.start_time,
            e.artist_name,
            e.venue_name,
            v.city,
            v.latitude,
            v.longitude,
            e.source,
            e.ticket_url,
            e.bandsintown_url,
            e.ticketmaster_url,
            e.eventbrite_url,
            e.venue_url
            FROM data_quality_event_flags f
            LEFT JOIN events e ON e.event_id = f.event_id
        LEFT JOIN venues v ON e.venue_name = v.venue_name
            WHERE f.reason = 'out_of_market_geo'
                AND f.resolved = 0
                AND (
                    e.start_time IS NULL
                    OR (
                        e.start_time >= datetime('now', '-4 hours')
                        AND e.start_time >= datetime('now', '-' || :months || ' months')
                    )
          )
            ORDER BY e.start_time ASC, f.id DESC
        LIMIT :max_rows
    ";

    $summaryStmt = $db->prepare($summarySql);
    $summaryStmt->execute();
    $summaryRows = $summaryStmt->fetchAll(PDO::FETCH_ASSOC);

    $countStmt = $db->prepare($countSql);
    $countStmt->bindValue(':months', $recentMonths, PDO::PARAM_INT);
    $countStmt->execute();
    $totalFlagged = (int)$countStmt->fetchColumn();

    $detailsStmt = $db->prepare($detailsSql);
    $detailsStmt->bindValue(':months', $recentMonths, PDO::PARAM_INT);
    $detailsStmt->bindValue(':max_rows', $maxRows, PDO::PARAM_INT);
    $detailsStmt->execute();
    $detailsRows = $detailsStmt->fetchAll(PDO::FETCH_ASSOC);
}

// --- Double-bill tab: load unresolved groups ---
if ($tab === 'double_bills') {
    $maxGroups = max(20, min(1000, (int)($_GET['db_limit'] ?? 250)));

    $flagRows = $db->query("
        SELECT
            f.id AS flag_id, f.group_key, f.event_id, f.flagged_at,
            e.artist_name, e.venue_name, e.start_time, e.source, e.ticket_url,
            e.price_min, e.price_max, e.market
        FROM data_quality_double_bill_flags f
        LEFT JOIN events e ON e.event_id = f.event_id
        WHERE f.resolved = 0
        ORDER BY f.start_time ASC, f.group_key ASC, f.id ASC
    ")->fetchAll(PDO::FETCH_ASSOC);

    $groups = [];
    foreach ($flagRows as $r) {
        $groups[$r['group_key']][] = $r;
    }

    // Self-heal: a group can end up with 0-1 live members if its events were already merged away
    // by something else (a normal sync's Layer 1-4 matching, or the same-ticket-ID maintenance
    // pass) between flagging and this page load. Nothing left to review — auto-resolve rather
    // than show a broken/singleton "group".
    $staleGroupKeys = [];
    foreach ($groups as $gk => $rows) {
        $liveCount = count(array_filter($rows, function ($r) { return $r['artist_name'] !== null; }));
        if ($liveCount < 2) {
            $staleGroupKeys[] = $gk;
            unset($groups[$gk]);
        }
    }
    if (!empty($staleGroupKeys)) {
        $in = [];
        $bind = [];
        foreach ($staleGroupKeys as $i => $gk) {
            $key = ':gk' . $i;
            $in[] = $key;
            $bind[$key] = $gk;
        }
        $db->prepare("UPDATE data_quality_double_bill_flags SET resolved = 1, resolution = 'auto_resolved_elsewhere', resolved_at = CURRENT_TIMESTAMP WHERE group_key IN (" . implode(',', $in) . ")")->execute($bind);
    }

    $groups = array_slice($groups, 0, $maxGroups, true);

    $recentResolved = $db->query("
        SELECT group_key, resolution, MAX(resolved_at) AS resolved_at, COUNT(*) AS n
        FROM data_quality_double_bill_flags
        WHERE resolved = 1 AND resolution IN ('dismissed', 'merged')
        GROUP BY group_key, resolution
        ORDER BY resolved_at DESC
        LIMIT 30
    ")->fetchAll(PDO::FETCH_ASSOC);
}

// --- Venue Review tab: load bad-address rows and/or possible-duplicate groups ---
if ($tab === 'venues') {
    require_once __DIR__ . '/db/schema.php';
    ensureDatabaseSchema($db);

    $venueView = (($_GET['venue_view'] ?? 'address') === 'duplicates') ? 'duplicates' : 'address';
    $venueLimit = max(50, min(3000, (int)($_GET['venue_limit'] ?? 300)));
    $venueDupLimit = max(20, min(1000, (int)($_GET['venue_dup_limit'] ?? 300)));

    $venueBadAddressCount = (int)$db->query("
        SELECT COUNT(*) FROM venues
        WHERE (address IS NULL OR TRIM(address) = '') OR latitude IS NULL OR longitude IS NULL
    ")->fetchColumn();

    $venueBadAddressRows = [];
    if ($venueView === 'address') {
        $stmt = $db->prepare("
            SELECT
                v.venue_id, v.venue_name, v.market, v.address, v.city, v.latitude, v.longitude,
                v.capacity, v.maps_url, v.is_outdoor, v.alternate_names,
                (SELECT COUNT(*) FROM events e WHERE e.venue_id = v.venue_id) AS event_count
            FROM venues v
            WHERE (v.address IS NULL OR TRIM(v.address) = '') OR v.latitude IS NULL OR v.longitude IS NULL
            ORDER BY event_count DESC, v.venue_name ASC
            LIMIT :lim
        ");
        $stmt->bindValue(':lim', $venueLimit, PDO::PARAM_INT);
        $stmt->execute();
        $venueBadAddressRows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    }

    // Possible-duplicate detection: connected components over three signals (shared normalized
    // address, shared rounded coordinates, shared simplifyVenueName()-normalized name) so a
    // venue linked to another cluster member by *any* signal joins one group, rather than
    // producing overlapping per-signal listings for what's really one cluster. Runs regardless
    // of $venueView so the tab-nav count badge and the "Missing/Bad Address" sub-view's own
    // "possible duplicates" count both stay accurate without a second, separate query.
    require_once __DIR__ . '/services/EventAggregator.php';
    $aggregator = new EventAggregator();

    $allVenues = $db->query("SELECT venue_id, venue_name, address, latitude, longitude FROM venues")->fetchAll(PDO::FETCH_ASSOC);
    $venueEventCounts = [];
    foreach ($db->query("SELECT venue_id, COUNT(*) AS c FROM events WHERE venue_id IS NOT NULL GROUP BY venue_id") as $r) {
        $venueEventCounts[(int)$r['venue_id']] = (int)$r['c'];
    }

    $vParent = [];
    foreach ($allVenues as $v) {
        $vParent[(int)$v['venue_id']] = (int)$v['venue_id'];
    }
    $vFind = function ($x) use (&$vParent, &$vFind) {
        while ($vParent[$x] !== $x) {
            $x = $vParent[$x];
        }
        return $x;
    };
    $vUnion = function ($a, $b) use (&$vParent, $vFind) {
        $ra = $vFind($a);
        $rb = $vFind($b);
        if ($ra !== $rb) {
            $vParent[$rb] = $ra;
        }
    };

    $vBySignal = ['address' => [], 'coord' => [], 'name' => []];
    foreach ($allVenues as $v) {
        $vid = (int)$v['venue_id'];
        $addrNorm = strtolower(trim((string)$v['address']));
        if ($addrNorm !== '') {
            $vBySignal['address'][$addrNorm][] = $vid;
        }
        if ($v['latitude'] !== null && $v['longitude'] !== null) {
            $coordKey = round((float)$v['latitude'], 4) . '|' . round((float)$v['longitude'], 4);
            $vBySignal['coord'][$coordKey][] = $vid;
        }
        $simpleName = $aggregator->simplifyVenueName((string)$v['venue_name']);
        if ($simpleName !== '') {
            $vBySignal['name'][$simpleName][] = $vid;
        }
    }
    foreach ($vBySignal as $signalGroups) {
        foreach ($signalGroups as $ids) {
            if (count($ids) < 2) {
                continue;
            }
            for ($i = 1; $i < count($ids); $i++) {
                $vUnion($ids[0], $ids[$i]);
            }
        }
    }

    $vComponents = [];
    $venueById = [];
    foreach ($allVenues as $v) {
        $vid = (int)$v['venue_id'];
        $venueById[$vid] = $v;
        $vComponents[$vFind($vid)][] = $vid;
    }

    $venueDupCandidates = [];
    foreach ($vComponents as $ids) {
        if (count($ids) < 2) {
            continue;
        }
        sort($ids);
        $venueDupCandidates[implode(',', $ids)] = $ids;
    }

    if (!empty($venueDupCandidates)) {
        $stmtInsFlag = $db->prepare("INSERT OR IGNORE INTO data_quality_venue_dupe_flags (group_key, venue_ids) VALUES (:gk, :vids)");
        foreach ($venueDupCandidates as $gk => $ids) {
            $stmtInsFlag->execute([':gk' => $gk, ':vids' => implode(',', $ids)]);
        }
    }

    $venueOpenGroupKeys = [];
    foreach ($db->query("SELECT group_key FROM data_quality_venue_dupe_flags WHERE resolved = 0") as $r) {
        $venueOpenGroupKeys[$r['group_key']] = true;
    }

    $venueDupGroupCount = 0;
    $venueDupGroups = [];
    foreach ($venueDupCandidates as $gk => $ids) {
        if (!isset($venueOpenGroupKeys[$gk])) {
            continue;
        }
        $venueDupGroupCount++;

        if ($venueView === 'duplicates' && count($venueDupGroups) < $venueDupLimit) {
            $members = [];
            foreach ($ids as $vid) {
                $v = $venueById[$vid];
                $completeness = (trim((string)$v['address']) !== '' ? 1 : 0) + (($v['latitude'] !== null && $v['longitude'] !== null) ? 1 : 0);
                $members[] = [
                    'venue_id' => $vid,
                    'venue_name' => $v['venue_name'],
                    'address' => $v['address'],
                    'latitude' => $v['latitude'],
                    'longitude' => $v['longitude'],
                    'event_count' => $venueEventCounts[$vid] ?? 0,
                    'completeness' => $completeness,
                ];
            }
            usort($members, function ($a, $b) {
                if ($a['completeness'] !== $b['completeness']) {
                    return $b['completeness'] <=> $a['completeness'];
                }
                if ($a['event_count'] !== $b['event_count']) {
                    return $b['event_count'] <=> $a['event_count'];
                }
                return strlen((string)$a['venue_name']) <=> strlen((string)$b['venue_name']);
            });
            $venueDupGroups[] = [
                'group_key' => $gk,
                'members' => $members,
                'suggested_survivor' => $members[0]['venue_id'],
            ];
        }
    }
}

?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Admin Data Quality Review</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="styles.css?v=<?php echo filemtime(__DIR__ . '/styles.css'); ?>" />
    <style>
        :root {
            --dq-bg: #070b13;
            --dq-bg-2: #0d1422;
            --dq-panel: rgba(16, 23, 37, 0.8);
            --dq-panel-strong: rgba(12, 18, 30, 0.95);
            --dq-border: rgba(173, 194, 255, 0.22);
            --dq-border-soft: rgba(173, 194, 255, 0.12);
            --dq-text: #e6edf9;
            --dq-muted: #9aabc7;
            --dq-accent: #73e0b7;
            --dq-accent-2: #89b4ff;
            --dq-warning: #ffd081;
            --dq-danger: #ff9d9d;
            --dq-radius: 14px;
            --dq-shadow: 0 12px 38px rgba(2, 6, 15, 0.52);
        }
        * { box-sizing: border-box; }
        body {
            margin: 0;
            font-family: 'Manrope', 'Segoe UI', sans-serif;
            color: var(--dq-text);
            background:
                radial-gradient(circle at 8% 4%, rgba(115, 224, 183, 0.16), transparent 34%),
                radial-gradient(circle at 92% 0%, rgba(137, 180, 255, 0.16), transparent 28%),
                linear-gradient(155deg, var(--dq-bg), var(--dq-bg-2));
            min-height: 100vh;
            padding: 1.35rem;
        }
        .dq-wrap { max-width: 1500px; margin: 0 auto; }
        .dq-head {
            display: flex;
            gap: 0.7rem;
            align-items: center;
            flex-wrap: wrap;
            margin-bottom: 0.9rem;
        }
        .dq-hero {
            background: linear-gradient(130deg, rgba(17, 30, 53, 0.88), rgba(14, 23, 38, 0.86));
            border: 1px solid var(--dq-border);
            border-radius: calc(var(--dq-radius) + 2px);
            box-shadow: var(--dq-shadow);
            padding: 1rem 1.1rem;
            margin-bottom: 0.7rem;
            display: flex;
            flex-wrap: wrap;
            gap: 0.85rem;
            align-items: baseline;
            justify-content: space-between;
        }
        .dq-hero-title {
            margin: 0;
            font-size: clamp(1.15rem, 2vw, 1.55rem);
            letter-spacing: 0.01em;
            font-weight: 800;
        }
        .dq-hero-sub {
            margin: 0.3rem 0 0;
            font-size: 0.88rem;
            color: var(--dq-muted);
        }
        .dq-tabs {
            display: flex;
            gap: 0.5rem;
            flex-wrap: wrap;
            margin-bottom: 0.9rem;
        }
        .dq-tab {
            display: inline-flex;
            align-items: center;
            gap: 0.4rem;
            padding: 0.55rem 0.9rem;
            border-radius: 10px;
            border: 1px solid var(--dq-border-soft);
            background: rgba(16, 23, 37, 0.6);
            color: var(--dq-muted);
            text-decoration: none;
            font-weight: 700;
            font-size: 0.86rem;
        }
        .dq-tab:hover { color: var(--dq-text); border-color: var(--dq-border); }
        .dq-tab.active {
            color: #08150f;
            background: var(--dq-accent);
            border-color: var(--dq-accent);
        }
        .dq-tab-count {
            display: inline-block;
            padding: 0.05rem 0.4rem;
            border-radius: 999px;
            font-size: 0.72rem;
            background: rgba(255, 255, 255, 0.18);
        }
        .dq-tab.active .dq-tab-count { background: rgba(8, 21, 15, 0.22); }
        .dq-card {
            background: linear-gradient(160deg, var(--dq-panel), var(--dq-panel-strong));
            border: 1px solid var(--dq-border-soft);
            border-radius: var(--dq-radius);
            padding: 0.95rem 1rem;
            margin-bottom: 0.95rem;
            box-shadow: var(--dq-shadow);
            backdrop-filter: blur(4px);
        }
        .dq-summary-grid {
            display: grid;
            gap: 0.75rem;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
        }
        .dq-kpi { font-size: 0.9rem; color: var(--dq-muted); line-height: 1.45; }
        .dq-kpi strong { color: var(--dq-text); }
        .dq-table-wrap {
            overflow: auto;
            max-height: min(68vh, 820px);
            min-height: 320px;
        }
        table.dq-table {
            width: 100%;
            border-collapse: separate;
            border-spacing: 0;
            font-size: 0.79rem;
            min-width: 1280px;
            border: 1px solid var(--dq-border-soft);
            border-radius: 12px;
        }
        .dq-table th, .dq-table td {
            border-bottom: 1px solid rgba(154, 171, 199, 0.14);
            padding: 0.48rem 0.52rem;
            vertical-align: top;
            text-align: left;
        }
        .dq-table tbody tr:nth-child(odd) { background: rgba(154, 171, 199, 0.035); }
        .dq-table tbody tr:hover { background: rgba(137, 180, 255, 0.09); }
        .dq-table th {
            color: #e9f0ff;
            background: linear-gradient(180deg, rgba(31, 45, 76, 0.98), rgba(21, 31, 53, 0.98));
            position: sticky;
            top: 0;
            z-index: 10;
            font-weight: 700;
            letter-spacing: 0.02em;
            box-shadow: 0 1px 0 rgba(173, 194, 255, 0.22);
        }
        .dq-muted { color: var(--dq-muted); }
        .dq-link { color: #b9cbff; text-decoration: none; word-break: break-all; border-bottom: 1px dotted rgba(185, 203, 255, 0.65); }
        .dq-link:hover { color: #d7e2ff; border-bottom-color: rgba(215, 226, 255, 0.9); }
        .dq-pill {
            display: inline-block;
            padding: 0.16rem 0.45rem;
            border-radius: 999px;
            font-size: 0.7rem;
            font-weight: 700;
            border: 1px solid rgba(115, 224, 183, 0.5);
            color: #c6ffe9;
            background: rgba(115, 224, 183, 0.1);
        }
        .dq-status { margin-bottom: 0.82rem; border-radius: 10px; padding: 0.7rem 0.84rem; font-size: 0.84rem; border: 1px solid transparent; }
        .dq-status { white-space: pre-line; }
        .dq-status-success { background: rgba(16, 185, 129, 0.1); border-color: rgba(16, 185, 129, 0.35); color: #a7f3d0; }
        .dq-status-error { background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.35); color: #fecaca; }
        .dq-status-warn { background: rgba(245, 158, 11, 0.1); border-color: rgba(245, 158, 11, 0.35); color: #fde68a; }
        .dq-toolbar-card {
            position: sticky;
            top: 0.6rem;
            z-index: 3;
            padding: 0.7rem;
        }
        .dq-batch {
            display: flex;
            flex-wrap: wrap;
            gap: 0.58rem;
            align-items: center;
            padding: 0.62rem;
            border-radius: 10px;
            background: rgba(8, 12, 21, 0.82);
            border: 1px solid var(--dq-border-soft);
        }
        .dq-select {
            background: rgba(9, 13, 21, 0.95);
            border: 1px solid rgba(173, 194, 255, 0.32);
            color: #f3f7ff;
            border-radius: 8px;
            padding: 0.47rem 0.56rem;
            font-size: 0.8rem;
            min-height: 2.15rem;
        }
        .dq-checkbox-col { width: 30px; }
        .dq-row-check { transform: scale(1.05); accent-color: #73e0b7; }
        .dq-selected-count {
            font-size: 0.8rem;
            color: #d9e3f6;
            padding: 0.35rem 0.58rem;
            border: 1px solid rgba(173, 194, 255, 0.35);
            border-radius: 8px;
            background: rgba(173, 194, 255, 0.09);
            font-weight: 600;
        }
        .dq-preview-table { width: 100%; border-collapse: collapse; font-size: 0.78rem; margin-top: 0.5rem; }
        .dq-preview-table th, .dq-preview-table td { border-bottom: 1px solid rgba(255,255,255,0.08); padding: 0.35rem 0.45rem; text-align: left; }
        .dq-preview-table th { color: #e2e8f0; }
        .dq-preview-action { font-weight: 700; }
        .dq-suggest-pill { display: inline-block; padding: 0.12rem 0.4rem; border-radius: 999px; font-size: 0.72rem; border: 1px solid rgba(255,255,255,0.24); }
        .dq-suggest-reassign { color: #a7f3d0; border-color: rgba(16, 185, 129, 0.45); }
        .dq-suggest-outscope { color: #fde68a; border-color: rgba(245, 158, 11, 0.45); }
        .dq-suggest-skip { color: #cbd5e1; border-color: rgba(148, 163, 184, 0.45); }
        .db-group { background: linear-gradient(160deg, var(--dq-panel), var(--dq-panel-strong)); border: 1px solid var(--dq-border-soft); border-radius: var(--dq-radius); padding: 0.85rem 1rem; margin-bottom: 0.85rem; box-shadow: var(--dq-shadow); }
        .db-group-head { display: flex; flex-wrap: wrap; gap: 0.6rem; align-items: baseline; justify-content: space-between; margin-bottom: 0.55rem; }
        .db-group-title { font-weight: 700; font-size: 0.98rem; }
        .db-group-meta { font-size: 0.78rem; color: var(--dq-muted); }
        table.db-members { width: 100%; border-collapse: collapse; font-size: 0.82rem; margin-bottom: 0.6rem; }
        .db-members th, .db-members td { border-bottom: 1px solid rgba(154, 171, 199, 0.14); padding: 0.4rem 0.5rem; text-align: left; vertical-align: top; }
        .db-members th { color: #e9f0ff; font-weight: 700; font-size: 0.74rem; text-transform: uppercase; letter-spacing: 0.03em; }
        .db-actions { display: flex; gap: 0.55rem; flex-wrap: wrap; align-items: center; }
        .db-check { transform: scale(1.05); accent-color: #73e0b7; margin-right: 0.4rem; }
        .db-resolved-table { width: 100%; border-collapse: collapse; font-size: 0.78rem; }
        .db-resolved-table th, .db-resolved-table td { border-bottom: 1px solid rgba(154, 171, 199, 0.14); padding: 0.35rem 0.5rem; text-align: left; }
        .db-resolved-table th { color: #e9f0ff; }
        .db-tag-merged { color: #a7f3d0; }
        .db-tag-dismissed { color: #fde68a; }
        details.db-resolved-wrap summary { cursor: pointer; font-weight: 700; color: var(--dq-text); padding: 0.2rem 0; }
        .vr-list-wrap { display: flex; flex-direction: column; gap: 0; }
        .vr-edit-row {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
            gap: 0.55rem 0.7rem;
            align-items: end;
            padding: 0.85rem 0.2rem;
            border-bottom: 1px solid rgba(154, 171, 199, 0.14);
        }
        .vr-list-wrap .vr-edit-row:last-child { border-bottom: none; }
        .vr-field { display: flex; flex-direction: column; gap: 0.25rem; min-width: 0; }
        .vr-field label { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; color: var(--dq-muted); }
        .vr-field input[type="text"] {
            background: rgba(12, 18, 32, 0.55);
            border: 1px solid var(--dq-border-soft);
            border-radius: 8px;
            padding: 0.4rem 0.5rem;
            color: var(--dq-text);
            font-size: 0.84rem;
            width: 100%;
        }
        .vr-field input[type="text"]:focus { outline: none; border-color: rgba(115, 224, 183, 0.6); }
        .vr-field-name { grid-column: span 2; }
        .vr-field-wide { grid-column: span 2; }
        .vr-field-narrow { flex-direction: row; align-items: center; }
        .vr-field-narrow label { text-transform: none; font-size: 0.78rem; font-weight: 600; letter-spacing: normal; display: flex; align-items: center; gap: 0.35rem; }
        .vr-field-meta { font-size: 0.78rem; justify-content: center; }
        .vr-field-save { align-items: stretch; }
        .vr-field-save .btn-premium-filter { width: 100%; }
        .vr-dup-group { background: linear-gradient(160deg, var(--dq-panel), var(--dq-panel-strong)); border: 1px solid var(--dq-border-soft); border-radius: var(--dq-radius); padding: 0.85rem 1rem; margin-bottom: 0.85rem; box-shadow: var(--dq-shadow); }
        table.vr-dup-table { width: 100%; border-collapse: collapse; font-size: 0.82rem; margin-bottom: 0.6rem; }
        .vr-dup-table th, .vr-dup-table td { border-bottom: 1px solid rgba(154, 171, 199, 0.14); padding: 0.4rem 0.5rem; text-align: left; vertical-align: top; }
        .vr-dup-table th { color: #e9f0ff; font-weight: 700; font-size: 0.74rem; text-transform: uppercase; letter-spacing: 0.03em; }
        .vr-merge-btn, .vr-dismiss-btn {}
        @media (max-width: 900px) {
            .vr-edit-row { grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); }
            .vr-field-name, .vr-field-wide { grid-column: span 2; }
        }
        @media (max-width: 900px) {
            body { padding: 0.85rem; }
            .dq-head { gap: 0.45rem; }
            .dq-toolbar-card { top: 0.2rem; }
            .dq-table-wrap { max-height: 55vh; }
            .dq-kpi { font-size: 0.84rem; }
        }
    </style>
</head>
<body>
<div class="dq-wrap">
    <div class="dq-hero">
        <div>
            <h1 class="dq-hero-title">Data Quality Command Center</h1>
            <?php if ($tab === 'market'): ?>
                <p class="dq-hero-sub">Review and resolve market mismatches with simulation-first workflows and high-confidence automation.</p>
            <?php elseif ($tab === 'double_bills'): ?>
                <p class="dq-hero-sub">Events sharing the same venue and exact time under different artist names — flagged for a human decision, never auto-merged.</p>
            <?php else: ?>
                <p class="dq-hero-sub">Venues missing a proper address, and venues that look like duplicate entries for the same physical place.</p>
            <?php endif; ?>
        </div>
        <?php if ($tab === 'market'): ?>
            <div class="dq-muted">Last refresh context: <?php echo (int)$recentMonths; ?> month window</div>
        <?php elseif ($tab === 'double_bills'): ?>
            <div class="dq-muted"><?php echo number_format(count($groups)); ?> group(s) awaiting review</div>
        <?php else: ?>
            <div class="dq-muted"><?php echo number_format($venueBadAddressCount); ?> bad address &middot; <?php echo number_format($venueDupGroupCount); ?> possible duplicate group(s)</div>
        <?php endif; ?>
    </div>

    <div class="dq-tabs">
        <a href="admin_data_quality.php?tab=market" class="dq-tab<?php echo $tab === 'market' ? ' active' : ''; ?>">
            Market Mismatch
            <?php if ($tab === 'market'): ?><span class="dq-tab-count"><?php echo number_format($totalFlagged); ?></span><?php endif; ?>
        </a>
        <a href="admin_data_quality.php?tab=double_bills" class="dq-tab<?php echo $tab === 'double_bills' ? ' active' : ''; ?>">
            Double-Bill Review
            <?php if ($tab === 'double_bills'): ?><span class="dq-tab-count"><?php echo number_format(count($groups)); ?></span><?php endif; ?>
        </a>
        <a href="admin_data_quality.php?tab=venues" class="dq-tab<?php echo $tab === 'venues' ? ' active' : ''; ?>">
            Venue Review
            <?php if ($tab === 'venues'): ?><span class="dq-tab-count"><?php echo number_format($venueBadAddressCount + $venueDupGroupCount); ?></span><?php endif; ?>
        </a>
    </div>

    <div class="dq-head">
        <a href="admin.php" class="btn-premium-filter btn-premium-filter--secondary" style="text-decoration:none;">Back to Admin</a>
        <?php if ($tab === 'market'): ?>
            <a href="admin_data_quality.php?tab=market&months=<?php echo (int)$recentMonths; ?>&limit=<?php echo (int)$maxRows; ?>" class="btn-premium-filter btn-premium-filter--secondary" style="text-decoration:none;">Refresh</a>
            <a href="admin_data_quality.php?tab=market&months=6&limit=1000" class="btn-premium-filter btn-premium-filter--secondary" style="text-decoration:none;">Last 6 Months</a>
            <a href="admin_data_quality.php?tab=market&months=18&limit=1000" class="btn-premium-filter btn-premium-filter--secondary" style="text-decoration:none;">Last 18 Months</a>
        <?php elseif ($tab === 'double_bills'): ?>
            <a href="admin_data_quality.php?tab=double_bills&db_limit=<?php echo (int)$maxGroups; ?>" class="btn-premium-filter btn-premium-filter--secondary" style="text-decoration:none;">Refresh</a>
            <form method="POST" action="admin_data_quality.php?tab=double_bills" style="display:inline;" onsubmit="return confirm('Purge all out-of-market/poisoned events from the database and resolve orphaned flags?');">
                <input type="hidden" name="csrf_token" value="<?php echo h($_SESSION['csrf_token']); ?>">
                <input type="hidden" name="admin_action" value="purge_out_of_market">
                <button type="submit" class="btn-premium-filter btn-premium-filter--danger">Purge Out-of-Market Events</button>
            </form>
        <?php else: ?>
            <a href="admin_data_quality.php?tab=venues&venue_view=address" class="btn-premium-filter <?php echo $venueView === 'address' ? 'btn-premium-filter--primary' : 'btn-premium-filter--secondary'; ?>" style="text-decoration:none;">Missing/Bad Address (<?php echo number_format($venueBadAddressCount); ?>)</a>
            <a href="admin_data_quality.php?tab=venues&venue_view=duplicates" class="btn-premium-filter <?php echo $venueView === 'duplicates' ? 'btn-premium-filter--primary' : 'btn-premium-filter--secondary'; ?>" style="text-decoration:none;">Possible Duplicates (<?php echo number_format($venueDupGroupCount); ?>)</a>
        <?php endif; ?>
    </div>

    <?php if ($statusMsg !== ''): ?>
        <div class="dq-status <?php echo $statusType === 'success' ? 'dq-status-success' : ($statusType === 'error' ? 'dq-status-error' : 'dq-status-warn'); ?>">
            <?php echo h($statusMsg); ?>
        </div>
    <?php endif; ?>

    <?php if ($tab === 'market'): ?>

    <div class="dq-summary-grid">
        <div class="dq-card">
            <div class="dq-kpi"><strong>Unresolved Flagged Events:</strong> <?php echo number_format($totalFlagged); ?></div>
            <div class="dq-kpi">Outside geo bounds for assigned US market and hidden by runtime guard.</div>
        </div>
        <div class="dq-card">
            <div class="dq-kpi"><strong>Showing Rows:</strong> <?php echo number_format(count($detailsRows)); ?></div>
            <div class="dq-kpi"><strong>Window:</strong> last <?php echo (int)$recentMonths; ?> months</div>
            <div class="dq-kpi"><strong>Row Cap:</strong> <?php echo number_format($maxRows); ?></div>
        </div>
        <div class="dq-card">
            <div class="dq-kpi" style="margin-bottom:0.45rem;"><strong>Market Summary</strong></div>
            <?php if (empty($summaryRows)): ?>
                <div class="dq-muted">No flagged records in this window.</div>
            <?php else: ?>
                <?php foreach ($summaryRows as $row): ?>
                    <div class="dq-kpi"><span class="dq-pill"><?php echo h(strtoupper($row['market'] ?? '')); ?></span> <?php echo number_format((int)($row['flagged_count'] ?? 0)); ?> flagged</div>
                <?php endforeach; ?>
            <?php endif; ?>
        </div>
    </div>

    <form method="POST" action="admin_data_quality.php?tab=market&months=<?php echo (int)$recentMonths; ?>&limit=<?php echo (int)$maxRows; ?>">
        <input type="hidden" name="admin_action" value="dq_batch" />
        <input type="hidden" name="csrf_token" value="<?php echo h($_SESSION['csrf_token']); ?>" />

        <div class="dq-card dq-toolbar-card">
            <div class="dq-batch">
                <label for="batch-action" class="dq-kpi"><strong>Batch Action:</strong></label>
                <select id="batch-action" name="batch_action" class="dq-select" required>
                    <option value="">Select action...</option>
                    <option value="apply_template">Apply Saved Template</option>
                    <option value="simulate_rules">Simulate Selected (Dry Run Only)</option>
                    <option value="auto_triage_high_conf">Auto-Triage Selected (High Confidence)</option>
                    <option value="resolve">Approve / Resolve Selected</option>
                    <option value="reopen">Re-open Selected</option>
                    <option value="reassign_inferred">Auto-Reassign Selected (Use Inferred)</option>
                    <option value="reassign_text_inferred">Auto-Reassign Selected (Use City/Address Inference)</option>
                    <option value="reassign_colorado">Reassign Selected -> Colorado</option>
                    <option value="reassign_california">Reassign Selected -> California</option>
                    <option value="reassign_texas">Reassign Selected -> Texas</option>
                </select>
                <select id="template-key" name="template_key" class="dq-select">
                    <option value="">Choose template...</option>
                    <?php foreach (getQaBatchTemplates() as $tplKey => $tpl): ?>
                        <option value="<?php echo h($tplKey); ?>"><?php echo h($tpl['label']); ?></option>
                    <?php endforeach; ?>
                </select>
                <button type="submit" class="btn-premium-filter btn-premium-filter--primary">Apply to Selected</button>
                <button type="button" id="dq-select-all" class="btn-premium-filter btn-premium-filter--secondary">Select All</button>
                <button type="button" id="dq-clear-all" class="btn-premium-filter btn-premium-filter--secondary">Clear Selection</button>
                <button type="button" id="dq-select-reassign" class="btn-premium-filter btn-premium-filter--secondary">Select Suggested Reassign</button>
                <button type="button" id="dq-select-outscope" class="btn-premium-filter btn-premium-filter--secondary">Select Suggested Out-of-Scope</button>
                <span id="dq-selected-count" class="dq-selected-count">Selected: 0</span>
            </div>
            <div class="dq-kpi dq-muted" style="margin-top:0.4rem;">
                Saved Templates: Resolve Obvious Out-of-Scope | Reassign Strong Signals | High-Confidence Full Pass.
            </div>
        </div>

        <?php if (!empty($simulationReport)): ?>
            <div class="dq-card" style="margin-top:0.8rem;">
                <div class="dq-kpi"><strong>Simulation Preview</strong> (selected <?php echo number_format((int)$simulationReport['selected_count']); ?>)</div>
                <div class="dq-kpi">Reassign: <strong><?php echo number_format((int)($simulationReport['summary']['reassign'] ?? 0)); ?></strong> | Resolve Out-of-Scope: <strong><?php echo number_format((int)($simulationReport['summary']['resolve_out_of_scope'] ?? 0)); ?></strong> | Skip: <strong><?php echo number_format((int)($simulationReport['summary']['skip'] ?? 0)); ?></strong></div>
                <?php if (!empty($simulationReport['preview_rows'])): ?>
                    <table class="dq-preview-table">
                        <thead>
                        <tr>
                            <th>Flag</th>
                            <th>Event</th>
                            <th>Artist</th>
                            <th>Venue</th>
                            <th>City</th>
                            <th>Action</th>
                            <th>Target</th>
                            <th>Confidence</th>
                            <th>Reason</th>
                        </tr>
                        </thead>
                        <tbody>
                        <?php foreach ($simulationReport['preview_rows'] as $row): ?>
                            <tr>
                                <td><?php echo (int)($row['flag_id'] ?? 0); ?></td>
                                <td class="dq-muted"><?php echo h($row['event_id'] ?? ''); ?></td>
                                <td><?php echo h($row['artist_name'] ?? ''); ?></td>
                                <td><?php echo h($row['venue_name'] ?? ''); ?></td>
                                <td><?php echo h($row['city'] ?? ''); ?></td>
                                <td class="dq-preview-action"><?php echo h(strtoupper((string)($row['action'] ?? ''))); ?></td>
                                <td><?php echo !empty($row['target_market']) ? h(strtoupper((string)$row['target_market'])) : '<span class="dq-muted">-</span>'; ?></td>
                                <td><?php echo (int)($row['confidence'] ?? 0); ?></td>
                                <td class="dq-muted"><?php echo h($row['reason'] ?? ''); ?></td>
                            </tr>
                        <?php endforeach; ?>
                        </tbody>
                    </table>
                <?php endif; ?>
            </div>
        <?php endif; ?>

        <div class="dq-card dq-table-wrap">
        <table class="dq-table">
            <thead>
                <tr>
                    <th class="dq-checkbox-col"><input type="checkbox" id="dq-master-check" /></th>
                    <th>Flag ID</th>
                    <th>Flagged At</th>
                    <th>Flag Market</th>
                    <th>Inferred</th>
                    <th>Suggested Action</th>
                    <th>Start Time</th>
                    <th>Market</th>
                    <th>Event ID</th>
                    <th>Artist</th>
                    <th>Venue</th>
                    <th>City</th>
                    <th>Latitude</th>
                    <th>Longitude</th>
                    <th>Source</th>
                    <th>Top Ticket URL</th>
                </tr>
            </thead>
            <tbody>
            <?php if (empty($detailsRows)): ?>
                <tr><td colspan="16" class="dq-muted">No unresolved flagged events found.</td></tr>
            <?php else: ?>
                <?php foreach ($detailsRows as $row): ?>
                    <?php
                        $bestUrl = $row['ticket_url'] ?: ($row['bandsintown_url'] ?: ($row['ticketmaster_url'] ?: ($row['eventbrite_url'] ?: ($row['venue_url'] ?: ''))));
                        $decision = calculateQaDecision($db, $row);
                        $suggestAction = (string)($decision['action'] ?? 'skip');
                        $suggestClass = 'dq-suggest-skip';
                        if ($suggestAction === 'reassign') {
                            $suggestClass = 'dq-suggest-reassign';
                        } elseif ($suggestAction === 'resolve_out_of_scope') {
                            $suggestClass = 'dq-suggest-outscope';
                        }
                    ?>
                    <tr>
                        <td class="dq-checkbox-col">
                            <input
                                class="dq-row-check"
                                type="checkbox"
                                name="selected_flags[]"
                                value="<?php echo (int)($row['flag_id'] ?? 0); ?>"
                                data-suggested-action="<?php echo h($suggestAction); ?>"
                            />
                        </td>
                        <td><?php echo (int)($row['flag_id'] ?? 0); ?></td>
                        <td class="dq-muted"><?php echo h($row['flagged_at'] ?? ''); ?></td>
                        <td><?php echo h(strtoupper((string)($row['current_market'] ?? ''))); ?></td>
                        <td><?php echo !empty($row['inferred_market']) ? h(strtoupper((string)$row['inferred_market'])) : '<span class="dq-muted">N/A</span>'; ?></td>
                        <td>
                            <span class="dq-suggest-pill <?php echo h($suggestClass); ?>">
                                <?php echo h(strtoupper(str_replace('_', ' ', $suggestAction))); ?>
                            </span>
                            <div class="dq-muted">Conf <?php echo (int)($decision['confidence'] ?? 0); ?></div>
                        </td>
                        <td><?php echo h($row['start_time'] ?? ''); ?></td>
                        <td><?php echo h(strtoupper((string)($row['market'] ?? ''))); ?></td>
                        <td class="dq-muted"><?php echo h($row['event_id'] ?? ''); ?></td>
                        <td><?php echo h($row['artist_name'] ?? ''); ?></td>
                        <td><?php echo h($row['venue_name'] ?? ''); ?></td>
                        <td><?php echo h($row['city'] ?? ''); ?></td>
                        <td><?php echo h($row['latitude'] ?? ''); ?></td>
                        <td><?php echo h($row['longitude'] ?? ''); ?></td>
                        <td><?php echo h($row['source'] ?? ''); ?></td>
                        <td>
                            <?php if (!empty($bestUrl)): ?>
                                <a class="dq-link" href="<?php echo h($bestUrl); ?>" target="_blank" rel="noopener noreferrer">Open Link</a>
                            <?php else: ?>
                                <span class="dq-muted">No URL</span>
                            <?php endif; ?>
                        </td>
                    </tr>
                <?php endforeach; ?>
            <?php endif; ?>
            </tbody>
        </table>
        </div>
    </form>

    <script>
    (() => {
        const master = document.getElementById('dq-master-check');
        const rowChecks = Array.from(document.querySelectorAll('.dq-row-check'));
        const btnSelectAll = document.getElementById('dq-select-all');
        const btnClearAll = document.getElementById('dq-clear-all');
        const btnSelectReassign = document.getElementById('dq-select-reassign');
        const btnSelectOutscope = document.getElementById('dq-select-outscope');
        const selectedCountNode = document.getElementById('dq-selected-count');
        const form = document.querySelector('form');
        const actionSelect = document.getElementById('batch-action');
        const templateSelect = document.getElementById('template-key');

        const syncMaster = () => {
            if (!master) return;
            const checkedCount = rowChecks.filter(cb => cb.checked).length;
            master.checked = rowChecks.length > 0 && checkedCount === rowChecks.length;
            master.indeterminate = checkedCount > 0 && checkedCount < rowChecks.length;
            if (selectedCountNode) {
                selectedCountNode.textContent = `Selected: ${checkedCount}`;
            }
        };

        if (master) {
            master.addEventListener('change', () => {
                rowChecks.forEach(cb => { cb.checked = master.checked; });
                syncMaster();
            });
        }

        rowChecks.forEach(cb => cb.addEventListener('change', syncMaster));

        if (btnSelectAll) {
            btnSelectAll.addEventListener('click', () => {
                rowChecks.forEach(cb => { cb.checked = true; });
                syncMaster();
            });
        }

        if (btnClearAll) {
            btnClearAll.addEventListener('click', () => {
                rowChecks.forEach(cb => { cb.checked = false; });
                syncMaster();
            });
        }

        if (btnSelectReassign) {
            btnSelectReassign.addEventListener('click', () => {
                rowChecks.forEach(cb => {
                    cb.checked = cb.dataset.suggestedAction === 'reassign';
                });
                syncMaster();
            });
        }

        if (btnSelectOutscope) {
            btnSelectOutscope.addEventListener('click', () => {
                rowChecks.forEach(cb => {
                    cb.checked = cb.dataset.suggestedAction === 'resolve_out_of_scope';
                });
                syncMaster();
            });
        }

        if (form) {
            form.addEventListener('submit', (event) => {
                const checkedCount = rowChecks.filter(cb => cb.checked).length;
                if (checkedCount === 0) {
                    event.preventDefault();
                    alert('Select at least one row.');
                    return;
                }

                const actionVal = actionSelect ? actionSelect.value : '';
                if (!actionVal) {
                    event.preventDefault();
                    alert('Choose a batch action.');
                    return;
                }

                if (actionVal === 'reassign_inferred') {
                    const ok = confirm(`Auto-reassign ${checkedCount} selected row(s) using inferred market and resolve those flags? Ambiguous rows will be skipped.`);
                    if (!ok) {
                        event.preventDefault();
                    }
                    return;
                }

                if (actionVal === 'apply_template') {
                    const templateVal = templateSelect ? templateSelect.value : '';
                    if (!templateVal) {
                        event.preventDefault();
                        alert('Choose a saved template first.');
                        return;
                    }
                    const label = templateSelect.options[templateSelect.selectedIndex]?.text || templateVal;
                    const ok = confirm(`Apply template "${label}" to ${checkedCount} selected row(s)?`);
                    if (!ok) {
                        event.preventDefault();
                    }
                    return;
                }

                if (actionVal === 'simulate_rules') {
                    const ok = confirm(`Run dry-run simulation for ${checkedCount} selected row(s)? This will preview actions with confidence and make no DB changes.`);
                    if (!ok) {
                        event.preventDefault();
                    }
                    return;
                }

                if (actionVal === 'auto_triage_high_conf') {
                    const ok = confirm(`Apply high-confidence triage to ${checkedCount} selected row(s)? This may reassign markets and resolve obvious out-of-scope rows.`);
                    if (!ok) {
                        event.preventDefault();
                    }
                    return;
                }

                if (actionVal === 'reassign_text_inferred') {
                    const ok = confirm(`Auto-reassign ${checkedCount} selected row(s) using city/address inference and resolve only successful matches?`);
                    if (!ok) {
                        event.preventDefault();
                    }
                    return;
                }

                if (actionVal.startsWith('reassign_')) {
                    const target = actionVal.replace('reassign_', '').toUpperCase();
                    const ok = confirm(`Reassign ${checkedCount} event(s) to ${target} and resolve selected flags?`);
                    if (!ok) {
                        event.preventDefault();
                    }
                }
            });
        }

        syncMaster();
    })();
    </script>

    <?php elseif ($tab === 'double_bills'): ?>

    <?php if (empty($groups)): ?>
        <div class="dq-card dq-muted">Nothing waiting on review right now. New candidates show up here automatically as part of every sync's maintenance pass.</div>
    <?php else: ?>
        <?php foreach ($groups as $groupKey => $members): ?>
            <?php $first = $members[0]; ?>
            <div class="db-group">
                <div class="db-group-head">
                    <div class="db-group-title"><?php echo h($first['venue_name'] ?? '(unknown venue)'); ?> &mdash; <?php echo h($first['start_time'] ?? ''); ?></div>
                    <div class="db-group-meta">Flagged <?php echo h($first['flagged_at'] ?? ''); ?> &middot; <?php echo h(strtoupper((string)($first['market'] ?? ''))); ?></div>
                </div>
                <form method="POST" action="admin_data_quality.php?tab=double_bills&db_limit=<?php echo (int)$maxGroups; ?>">
                    <input type="hidden" name="admin_action" value="db_group_action" />
                    <input type="hidden" name="csrf_token" value="<?php echo h($_SESSION['csrf_token']); ?>" />
                    <input type="hidden" name="group_key" value="<?php echo h($groupKey); ?>" />
                    <table class="db-members">
                        <thead>
                            <tr>
                                <th></th>
                                <th>Artist</th>
                                <th>Source</th>
                                <th>Price</th>
                                <th>Ticket Link</th>
                            </tr>
                        </thead>
                        <tbody>
                        <?php foreach ($members as $m): ?>
                            <tr>
                                <td><input class="db-check" type="checkbox" name="event_ids[]" value="<?php echo h($m['event_id']); ?>" checked /></td>
                                <td><?php echo h($m['artist_name'] ?? ''); ?></td>
                                <td class="dq-muted"><?php echo h($m['source'] ?? ''); ?></td>
                                <td class="dq-muted"><?php echo ($m['price_min'] !== null) ? '$' . h($m['price_min']) . ($m['price_max'] !== null && $m['price_max'] != $m['price_min'] ? '&ndash;$' . h($m['price_max']) : '') : '&mdash;'; ?></td>
                                <td>
                                    <?php if (!empty($m['ticket_url'])): ?>
                                        <a class="dq-link" href="<?php echo h($m['ticket_url']); ?>" target="_blank" rel="noopener noreferrer">Open</a>
                                    <?php else: ?>
                                        <span class="dq-muted">No URL</span>
                                    <?php endif; ?>
                                </td>
                            </tr>
                        <?php endforeach; ?>
                        </tbody>
                    </table>
                    <div class="db-actions">
                        <button type="submit" name="group_action" value="merge" class="btn-premium-filter btn-premium-filter--primary db-merge-btn">Merge Checked Into One Show</button>
                        <button type="submit" name="group_action" value="dismiss" class="btn-premium-filter btn-premium-filter--secondary db-dismiss-btn">Not a Duplicate &mdash; Dismiss</button>
                    </div>
                </form>
            </div>
        <?php endforeach; ?>
    <?php endif; ?>

    <?php if (!empty($recentResolved)): ?>
        <details class="db-resolved-wrap dq-card">
            <summary>Recently resolved (<?php echo count($recentResolved); ?>)</summary>
            <table class="db-resolved-table">
                <thead><tr><th>Resolved At</th><th>Resolution</th><th>Flag Rows</th><th></th></tr></thead>
                <tbody>
                <?php foreach ($recentResolved as $r): ?>
                    <tr>
                        <td class="dq-muted"><?php echo h($r['resolved_at'] ?? ''); ?></td>
                        <td class="<?php echo $r['resolution'] === 'merged' ? 'db-tag-merged' : 'db-tag-dismissed'; ?>"><?php echo h(strtoupper((string)$r['resolution'])); ?></td>
                        <td class="dq-muted"><?php echo (int)$r['n']; ?></td>
                        <td>
                            <?php if ($r['resolution'] === 'dismissed'): ?>
                            <form method="POST" action="admin_data_quality.php?tab=double_bills&db_limit=<?php echo (int)$maxGroups; ?>" style="display:inline;">
                                <input type="hidden" name="admin_action" value="db_group_action" />
                                <input type="hidden" name="csrf_token" value="<?php echo h($_SESSION['csrf_token']); ?>" />
                                <input type="hidden" name="group_key" value="<?php echo h($r['group_key']); ?>" />
                                <button type="submit" name="group_action" value="reopen" class="btn-premium-filter btn-premium-filter--secondary" style="font-size:0.72rem;padding:0.25rem 0.5rem;">Re-open</button>
                            </form>
                            <?php endif; ?>
                        </td>
                    </tr>
                <?php endforeach; ?>
                </tbody>
            </table>
        </details>
    <?php endif; ?>

    <script>
    (() => {
        document.querySelectorAll('form').forEach((form) => {
            form.addEventListener('submit', (event) => {
                const submitter = event.submitter;
                const action = submitter ? submitter.value : '';
                if (action === 'merge') {
                    const checked = form.querySelectorAll('input[name="event_ids[]"]:checked').length;
                    if (checked < 2) {
                        event.preventDefault();
                        alert('Check at least two events to merge.');
                        return;
                    }
                    if (!confirm(`Merge ${checked} checked event(s) into one show? This combines their artist names, ticket info, and history.`)) {
                        event.preventDefault();
                    }
                } else if (action === 'dismiss') {
                    if (!confirm('Dismiss this group as not a duplicate? It will stop appearing here.')) {
                        event.preventDefault();
                    }
                }
            });
        });
    })();
    </script>

    <?php else: ?>

    <?php if ($venueView === 'address'): ?>

        <?php if (empty($venueBadAddressRows)): ?>
            <div class="dq-card dq-muted">No venues are missing an address or coordinates right now.</div>
        <?php else: ?>
            <div class="dq-kpi dq-muted" style="margin-bottom:0.6rem;">
                Showing <?php echo number_format(count($venueBadAddressRows)); ?> of <?php echo number_format($venueBadAddressCount); ?> venues missing address/coordinates. Fix a venue below and click Save &mdash; it drops off this list automatically once it has both an address and coordinates.
            </div>
            <div class="dq-card vr-list-wrap">
                <?php foreach ($venueBadAddressRows as $row): ?>
                    <form method="POST" action="admin_data_quality.php?tab=venues&venue_view=address&venue_limit=<?php echo (int)$venueLimit; ?>" class="vr-edit-row">
                        <input type="hidden" name="admin_action" value="venue_action" />
                        <input type="hidden" name="venue_sub_action" value="save_venue" />
                        <input type="hidden" name="csrf_token" value="<?php echo h($_SESSION['csrf_token']); ?>" />
                        <input type="hidden" name="venue_id" value="<?php echo (int)$row['venue_id']; ?>" />

                        <div class="vr-field vr-field-name">
                            <label>Name</label>
                            <input type="text" name="venue_name" value="<?php echo h($row['venue_name'] ?? ''); ?>" required />
                        </div>
                        <div class="vr-field">
                            <label>Market</label>
                            <input type="text" name="market" value="<?php echo h($row['market'] ?? ''); ?>" required />
                        </div>
                        <div class="vr-field vr-field-wide">
                            <label>Address</label>
                            <input type="text" name="address" value="<?php echo h($row['address'] ?? ''); ?>" placeholder="Street, city, region, postcode" />
                        </div>
                        <div class="vr-field">
                            <label>City</label>
                            <input type="text" name="city" value="<?php echo h($row['city'] ?? ''); ?>" required />
                        </div>
                        <div class="vr-field">
                            <label>Latitude</label>
                            <input type="text" name="latitude" value="<?php echo h($row['latitude'] ?? ''); ?>" placeholder="e.g. 39.7392" />
                        </div>
                        <div class="vr-field">
                            <label>Longitude</label>
                            <input type="text" name="longitude" value="<?php echo h($row['longitude'] ?? ''); ?>" placeholder="e.g. -104.9903" />
                        </div>
                        <div class="vr-field">
                            <label>Capacity</label>
                            <input type="text" name="capacity" value="<?php echo h($row['capacity'] ?? ''); ?>" />
                        </div>
                        <div class="vr-field vr-field-wide">
                            <label>Maps URL</label>
                            <input type="text" name="maps_url" value="<?php echo h($row['maps_url'] ?? ''); ?>" />
                        </div>
                        <div class="vr-field vr-field-wide">
                            <label>Alternate Names <span class="dq-muted">(comma-separated)</span></label>
                            <input type="text" name="alternate_names" value="<?php echo h($row['alternate_names'] ?? ''); ?>" placeholder="e.g. The Boileroom, Guildford" />
                        </div>
                        <div class="vr-field vr-field-narrow">
                            <label><input type="checkbox" name="is_outdoor" value="1" <?php echo !empty($row['is_outdoor']) ? 'checked' : ''; ?> /> Outdoor</label>
                        </div>
                        <div class="vr-field vr-field-narrow">
                            <label><input type="checkbox" name="regenerate_maps" value="1" /> Regen. Maps + Geocode</label>
                        </div>
                        <div class="vr-field vr-field-meta dq-muted">
                            <?php echo (int)($row['event_count'] ?? 0); ?> event(s)
                        </div>
                        <div class="vr-field vr-field-save">
                            <button type="submit" class="btn-premium-filter btn-premium-filter--primary">Save</button>
                        </div>
                    </form>
                <?php endforeach; ?>
            </div>
        <?php endif; ?>

    <?php else: ?>

        <?php if (empty($venueDupGroups)): ?>
            <div class="dq-card dq-muted">No possible duplicate venues waiting on review right now.</div>
        <?php else: ?>
            <?php foreach ($venueDupGroups as $group): ?>
                <div class="vr-dup-group">
                    <form method="POST" action="admin_data_quality.php?tab=venues&venue_view=duplicates&venue_dup_limit=<?php echo (int)$venueDupLimit; ?>">
                        <input type="hidden" name="admin_action" value="venue_action" />
                        <input type="hidden" name="csrf_token" value="<?php echo h($_SESSION['csrf_token']); ?>" />
                        <input type="hidden" name="group_key" value="<?php echo h($group['group_key']); ?>" />
                        <table class="vr-dup-table">
                            <thead>
                                <tr>
                                    <th>Survivor</th>
                                    <th>Venue</th>
                                    <th>Address</th>
                                    <th>Lat/Long</th>
                                    <th>Events</th>
                                </tr>
                            </thead>
                            <tbody>
                            <?php foreach ($group['members'] as $m): ?>
                                <tr>
                                    <td>
                                        <input type="radio" name="survivor_id" value="<?php echo (int)$m['venue_id']; ?>" <?php echo $m['venue_id'] === $group['suggested_survivor'] ? 'checked' : ''; ?> />
                                        <input type="hidden" name="member_ids[]" value="<?php echo (int)$m['venue_id']; ?>" />
                                    </td>
                                    <td><?php echo h($m['venue_name'] ?? ''); ?> <span class="dq-muted">#<?php echo (int)$m['venue_id']; ?></span></td>
                                    <td class="dq-muted"><?php echo !empty($m['address']) ? h($m['address']) : '—'; ?></td>
                                    <td class="dq-muted"><?php echo ($m['latitude'] !== null && $m['longitude'] !== null) ? h(round((float)$m['latitude'], 4) . ', ' . round((float)$m['longitude'], 4)) : '—'; ?></td>
                                    <td class="dq-muted"><?php echo (int)$m['event_count']; ?></td>
                                </tr>
                            <?php endforeach; ?>
                            </tbody>
                        </table>
                        <div class="db-actions">
                            <button type="submit" name="venue_sub_action" value="merge_group" class="btn-premium-filter btn-premium-filter--primary vr-merge-btn">Merge Selected Into Survivor</button>
                            <button type="submit" name="venue_sub_action" value="dismiss_group" class="btn-premium-filter btn-premium-filter--secondary vr-dismiss-btn">Not a Duplicate &mdash; Dismiss</button>
                        </div>
                    </form>
                </div>
            <?php endforeach; ?>
        <?php endif; ?>

    <?php endif; ?>

    <script>
    (() => {
        document.querySelectorAll('.vr-dup-group form').forEach((form) => {
            form.addEventListener('submit', (event) => {
                const submitter = event.submitter;
                const action = submitter ? submitter.value : '';
                if (action === 'dismiss_group') {
                    if (!confirm('Dismiss this group as not a duplicate? It will stop appearing here.')) {
                        event.preventDefault();
                    }
                    return;
                }
                if (action === 'merge_group') {
                    const survivor = form.querySelector('input[name="survivor_id"]:checked');
                    if (!survivor) {
                        event.preventDefault();
                        alert('Pick which venue should survive the merge.');
                        return;
                    }
                    if (!confirm('Merge this group into the selected survivor? Their events will be repointed and the other venue row(s) deleted.')) {
                        event.preventDefault();
                    }
                }
            });
        });
    })();
    </script>
    <script>
    (() => {
        // Restore scroll position after form submission & page reload
        const savedScrollPos = sessionStorage.getItem('dq_scroll_pos');
        if (savedScrollPos !== null) {
            sessionStorage.removeItem('dq_scroll_pos');
            const scrollTarget = parseInt(savedScrollPos, 10);
            const restoreScroll = () => {
                window.scrollTo({ top: scrollTarget, behavior: 'instant' });
            };
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', restoreScroll);
            } else {
                restoreScroll();
            }
            requestAnimationFrame(() => {
                setTimeout(restoreScroll, 50);
            });
        }

        // Save current scroll position whenever any form on the page is submitted
        document.addEventListener('submit', (e) => {
            setTimeout(() => {
                if (!e.defaultPrevented) {
                    sessionStorage.setItem('dq_scroll_pos', window.scrollY);
                }
            }, 0);
        });
    })();
    </script>

    <?php endif; ?>
</div>
</body>
</html>
