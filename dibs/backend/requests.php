<?php
/**
 * Showing requests: tour stops a client added (status 'pending') waiting for their agent.
 *
 *   list_showing_requests     realtor/admin: pending stops for every client they can see, grouped by client
 *   respond_showing_requests  realtor/admin: confirm, or mark "can't schedule" with an optional note,
 *                             one or more of one client's pending stops
 *
 * Scoping matches the agent feed: a realtor sees their assigned clients, an admin sees all clients.
 */

/** Clients this login may act for, as id => row. */
function showingRequestClients(PDO $pdo): array {
    $me = (int)$_SESSION['user_id'];
    $isAdmin = !empty($_SESSION['is_admin']) || ($_SESSION['role'] ?? '') === 'admin';
    $sql = "SELECT id, username, full_name FROM users WHERE role = 'client'";
    $params = [];
    if (!$isAdmin) { $sql .= " AND realtor_id = :rid"; $params[':rid'] = $me; }
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $out = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $c) $out[(int)$c['id']] = $c;
    return $out;
}

function handleListShowingRequests(PDO $pdo) {
    requireRealtorOrAdmin();
    $clients = showingRequestClients($pdo);
    if (!$clients) { echo json_encode(['success' => true, 'total' => 0, 'clients' => []]); return; }

    $params = [];
    $names = [];
    foreach (array_keys($clients) as $i => $id) { $names[] = ":c$i"; $params[":c$i"] = $id; }
    $in = implode(',', $names);
    $stmt = $pdo->prepare("
        SELECT si.client_id, si.mls_id, si.sort_order, si.updated_at,
               p.address, p.city, p.price, p.beds, p.baths, p.sqft_finished, p.main_image_url, p.status AS listing_status
        FROM showing_itinerary si JOIN properties p ON p.mls_id = si.mls_id
        WHERE si.client_id IN ($in) AND si.status = 'pending'
        ORDER BY si.client_id, si.sort_order, si.updated_at");
    $stmt->execute($params);

    $groups = [];
    $total = 0;
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $cid = (int)$r['client_id'];
        if (!isset($groups[$cid])) {
            $c = $clients[$cid];
            $groups[$cid] = ['client_id' => $cid, 'client_name' => $c['full_name'] ?: $c['username'], 'latest' => '', 'homes' => []];
        }
        $groups[$cid]['homes'][] = [
            'mls_id' => $r['mls_id'],
            'address' => $r['address'],
            'city' => $r['city'],
            'price' => $r['price'] !== null ? (float)$r['price'] : null,
            'beds' => $r['beds'],
            'baths' => $r['baths'],
            'sqft' => $r['sqft_finished'],
            'image' => $r['main_image_url'],
            'listing_status' => $r['listing_status'],
            'requested_at' => $r['updated_at'],
        ];
        if ((string)$r['updated_at'] > $groups[$cid]['latest']) $groups[$cid]['latest'] = (string)$r['updated_at'];
        $total++;
    }
    $groups = array_values($groups);
    usort($groups, fn($a, $b) => strcmp($b['latest'], $a['latest']));
    echo json_encode(['success' => true, 'total' => $total, 'clients' => $groups]);
}

function handleRespondShowingRequests(PDO $pdo) {
    requireRealtorOrAdmin();
    $data = json_decode(dibsRequestBody(), true) ?: [];
    $clientId = (int)($data['client_id'] ?? 0);
    $decision = (string)($data['decision'] ?? '');
    $note = tourText($data['note'] ?? '', 300);
    $clients = showingRequestClients($pdo);

    if (!isset($clients[$clientId])) {
        http_response_code(403);
        echo json_encode(['error' => 'This client is not assigned to you.']);
        return;
    }
    if (!in_array($decision, ['confirm', 'unavailable'], true)) {
        http_response_code(400);
        echo json_encode(['error' => 'Choose Confirm or Can\'t schedule.']);
        return;
    }
    $mlsIds = [];
    foreach (array_slice(is_array($data['mls_ids'] ?? null) ? $data['mls_ids'] : [], 0, 100) as $m) {
        if ($v = tourValidMls($m)) $mlsIds[$v] = true;
    }
    if (!$mlsIds) {
        http_response_code(400);
        echo json_encode(['error' => 'No homes selected.']);
        return;
    }

    $status = $decision === 'confirm' ? 'confirmed' : 'unavailable';
    $me = (int)$_SESSION['user_id'];
    // Only stops still pending change, so a double click or a stale list can't undo a later decision.
    $upd = $pdo->prepare("UPDATE showing_itinerary
        SET status = :st, status_reason = :rsn, updated_by_user_id = :uid, updated_at = CURRENT_TIMESTAMP
        WHERE client_id = :cid AND mls_id = :mid AND status = 'pending'");
    $done = [];
    $pdo->beginTransaction();
    try {
        foreach (array_keys($mlsIds) as $mid) {
            $upd->execute([':st' => $status, ':rsn' => $status === 'unavailable' ? $note : '', ':uid' => $me, ':cid' => $clientId, ':mid' => $mid]);
            if ($upd->rowCount()) {
                $done[] = $mid;
                recordPropertyActivity($pdo, $mid, 'tour_stop_status_updated', 'shared',
                    $status === 'confirmed' ? 'Showing confirmed by your agent.' : ('Your agent can\'t schedule this showing' . ($note !== '' ? ": $note" : '.')),
                    ['status' => $status], $clientId);
            }
        }
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        http_response_code(500);
        echo json_encode(['error' => 'Could not save. Nothing was changed.']);
        return;
    }
    echo json_encode(['success' => true, 'status' => $status, 'updated' => $done, 'skipped' => count($mlsIds) - count($done)]);
}
