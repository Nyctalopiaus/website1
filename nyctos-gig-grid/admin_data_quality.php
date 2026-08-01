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

$recentMonths = max(1, (int)($_GET['months'] ?? 18));
$maxRows = max(50, min(3000, (int)($_GET['limit'] ?? 1000)));
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
    if ($m === 'uk' || $m === 'england' || $m === 'scotland' || $m === 'wales' || $m === 'ireland') {
        return 'uk';
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
            margin-bottom: 0.95rem;
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
        .dq-table-wrap { overflow: auto; }
        table.dq-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 0.79rem;
            min-width: 1280px;
            border: 1px solid var(--dq-border-soft);
            border-radius: 12px;
            overflow: hidden;
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
            background: linear-gradient(180deg, rgba(31, 45, 76, 0.92), rgba(21, 31, 53, 0.92));
            position: sticky;
            top: 0;
            z-index: 1;
            font-weight: 700;
            letter-spacing: 0.02em;
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
        .dq-batch {
            display: flex;
            flex-wrap: wrap;
            gap: 0.58rem;
            align-items: center;
            margin-top: 0.65rem;
            position: sticky;
            top: 0;
            z-index: 2;
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
        @media (max-width: 900px) {
            body { padding: 0.85rem; }
            .dq-head { gap: 0.45rem; }
            .dq-batch { top: 0.2rem; }
            .dq-kpi { font-size: 0.84rem; }
        }
    </style>
</head>
<body>
<div class="dq-wrap">
    <div class="dq-hero">
        <div>
            <h1 class="dq-hero-title">Data Quality Command Center</h1>
            <p class="dq-hero-sub">Review and resolve market mismatches with simulation-first workflows and high-confidence automation.</p>
        </div>
        <div class="dq-muted">Last refresh context: <?php echo (int)$recentMonths; ?> month window</div>
    </div>

    <div class="dq-head">
        <a href="admin.php" class="btn-premium-filter btn-premium-filter--secondary" style="text-decoration:none;">Back to Admin</a>
        <a href="admin_data_quality.php?months=<?php echo (int)$recentMonths; ?>&limit=<?php echo (int)$maxRows; ?>" class="btn-premium-filter btn-premium-filter--secondary" style="text-decoration:none;">Refresh</a>
        <a href="admin_data_quality.php?months=6&limit=1000" class="btn-premium-filter btn-premium-filter--secondary" style="text-decoration:none;">Last 6 Months</a>
        <a href="admin_data_quality.php?months=18&limit=1000" class="btn-premium-filter btn-premium-filter--secondary" style="text-decoration:none;">Last 18 Months</a>
    </div>

    <?php if ($statusMsg !== ''): ?>
        <div class="dq-status <?php echo $statusType === 'success' ? 'dq-status-success' : ($statusType === 'error' ? 'dq-status-error' : 'dq-status-warn'); ?>">
            <?php echo h($statusMsg); ?>
        </div>
    <?php endif; ?>

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

    <div class="dq-card dq-table-wrap">
        <form method="POST" action="admin_data_quality.php?months=<?php echo (int)$recentMonths; ?>&limit=<?php echo (int)$maxRows; ?>">
            <input type="hidden" name="admin_action" value="dq_batch" />
            <input type="hidden" name="csrf_token" value="<?php echo h($_SESSION['csrf_token']); ?>" />

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
                </form>
    </div>
</div>
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
</body>
</html>
