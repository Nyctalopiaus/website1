<?php
/**
 * Agent schedule: one calendar across all of an agent's clients.
 *
 *   get_agent_schedule   realtor/admin: showings and time blocks for a date range
 *   save_agent_event     realtor/admin: create or update a time block (meeting, closing, personal…)
 *   delete_agent_event   realtor/admin: remove one of their own time blocks
 *
 * Showings come from the clients' tours (showing_itinerary). A stop's time is, in order:
 *   1. showing_time: a time the agent booked on the client's Tour tab ("booked")
 *   2. planned_start/planned_end: the Tour Planner's window on the tour date ("planned")
 * Confirmed and requested (pending) stops are included; a stop with neither time is "unscheduled".
 * All times are Colorado wall-clock strings 'YYYY-MM-DD HH:MM'.
 *
 * Scoping matches the agent feed: a realtor sees their assigned clients, an admin all clients.
 * Time blocks are always the signed-in agent's own.
 */

const SCHEDULE_EVENT_KINDS = [
    'client_meeting' => 'Client meeting',
    'listing_appt' => 'Listing appointment',
    'inspection' => 'Inspection',
    'appraisal' => 'Appraisal',
    'closing' => 'Closing',
    'office' => 'Office / admin',
    'personal' => 'Personal',
    'other' => 'Other',
];

/** 'YYYY-MM-DD HH:MM' from 'YYYY-MM-DD HH:MM[:SS]' or 'YYYY-MM-DDTHH:MM', or '' when not a real date/time. */
function scheduleLocalTime($v): string {
    if (!is_string($v) || !preg_match('/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::\d{2})?$/', trim($v), $m)) return '';
    if (!checkdate((int)$m[2], (int)$m[3], (int)$m[1]) || (int)$m[4] > 23 || (int)$m[5] > 59) return '';
    return "{$m[1]}-{$m[2]}-{$m[3]} {$m[4]}:{$m[5]}";
}

function scheduleAddMinutes(string $t, int $mins): string {
    $d = DateTime::createFromFormat('Y-m-d H:i', $t, new DateTimeZone('UTC'));
    if (!$d) return '';
    $d->modify(($mins >= 0 ? '+' : '') . $mins . ' minutes');
    return $d->format('Y-m-d H:i');
}

function scheduleValidDate($v): string {
    if (!is_string($v) || !preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $v, $m) || !checkdate((int)$m[2], (int)$m[3], (int)$m[1])) return '';
    return $v;
}

function scheduleIsAdmin(): bool {
    return !empty($_SESSION['is_admin']) || ($_SESSION['role'] ?? '') === 'admin';
}

/** Clients this agent may see, as id => row. */
function scheduleClients(PDO $pdo): array {
    $sql = "SELECT id, username, full_name FROM users WHERE role = 'client'";
    $params = [];
    if (!scheduleIsAdmin()) { $sql .= " AND realtor_id = :rid"; $params[':rid'] = (int)$_SESSION['user_id']; }
    $stmt = $pdo->prepare($sql . " ORDER BY COALESCE(NULLIF(full_name, ''), username) COLLATE NOCASE");
    $stmt->execute($params);
    $out = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $c) $out[(int)$c['id']] = $c;
    return $out;
}

function handleGetAgentSchedule(PDO $pdo) {
    requireRealtorOrAdmin();
    $from = scheduleValidDate($_GET['from'] ?? '') ?: date('Y-m-d');
    $days = max(1, min(14, (int)($_GET['days'] ?? 7)));
    $rangeStart = "$from 00:00";
    $rangeEnd = scheduleAddMinutes($rangeStart, $days * 1440);
    $clients = scheduleClients($pdo);
    $name = fn($cid) => isset($clients[$cid]) ? ($clients[$cid]['full_name'] ?: $clients[$cid]['username']) : '';

    $showings = [];
    $unscheduled = [];
    if ($clients) {
        $params = [];
        $names = [];
        foreach (array_keys($clients) as $i => $id) { $names[] = ":c$i"; $params[":c$i"] = $id; }
        $in = implode(',', $names);
        $stmt = $pdo->prepare("
            SELECT si.client_id, si.mls_id, si.status, si.showing_time, si.planned_start, si.planned_end,
                   COALESCE(si.duration_mins, 20) AS duration_mins, si.access_notes, si.sort_order,
                   p.address, p.city, p.zip, p.price, p.latitude, p.longitude, p.status AS listing_status
            FROM showing_itinerary si JOIN properties p ON p.mls_id = si.mls_id
            WHERE si.client_id IN ($in) AND si.status IN ('confirmed', 'pending')
            ORDER BY si.client_id, si.sort_order");
        $stmt->execute($params);
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $cid = (int)$r['client_id'];
            $booked = scheduleLocalTime($r['showing_time'] ?? '');
            if ($booked !== '') {
                [$start, $end, $source] = [$booked, scheduleAddMinutes($booked, max(5, (int)$r['duration_mins'])), 'booked'];
            } elseif (($ps = scheduleLocalTime($r['planned_start'] ?? '')) !== '' && ($pe = scheduleLocalTime($r['planned_end'] ?? '')) !== '') {
                [$start, $end, $source] = [$ps, $pe, 'planned'];
            } else {
                [$start, $end, $source] = ['', '', 'none'];
            }
            $row = [
                'client_id' => $cid,
                'client_name' => $name($cid),
                'mls_id' => $r['mls_id'],
                'status' => $r['status'],
                'address' => $r['address'],
                'city' => $r['city'],
                'zip' => $r['zip'],
                'price' => $r['price'] !== null ? (float)$r['price'] : null,
                'lat' => $r['latitude'] !== null ? (float)$r['latitude'] : null,
                'lng' => $r['longitude'] !== null ? (float)$r['longitude'] : null,
                'listing_status' => $r['listing_status'],
                'access_notes' => (string)$r['access_notes'],
                'start' => $start,
                'end' => $end,
                'source' => $source,
            ];
            if ($start === '') { if ($r['status'] === 'confirmed') $unscheduled[] = $row; continue; }
            if ($start < $rangeEnd && $end > $rangeStart) $showings[] = $row;
        }
    }

    $ev = $pdo->prepare("SELECT id, kind, title, start_at, end_at, client_id, location, notes
        FROM agent_events WHERE agent_id = :aid AND start_at < :re AND end_at > :rs ORDER BY start_at");
    $ev->execute([':aid' => (int)$_SESSION['user_id'], ':re' => $rangeEnd, ':rs' => $rangeStart]);
    $events = [];
    foreach ($ev->fetchAll(PDO::FETCH_ASSOC) as $e) {
        $cid = $e['client_id'] !== null ? (int)$e['client_id'] : null;
        $events[] = [
            'event_id' => (int)$e['id'],
            'kind' => $e['kind'],
            'kind_label' => SCHEDULE_EVENT_KINDS[$e['kind']] ?? 'Other',
            'title' => $e['title'],
            'start' => $e['start_at'],
            'end' => $e['end_at'],
            'client_id' => $cid,
            'client_name' => $cid ? $name($cid) : '',
            'location' => $e['location'],
            'notes' => $e['notes'],
        ];
    }

    echo json_encode([
        'success' => true,
        'from' => $from,
        'days' => $days,
        'showings' => $showings,
        'unscheduled' => $unscheduled,
        'events' => $events,
        'kinds' => SCHEDULE_EVENT_KINDS,
        'clients' => array_values(array_map(fn($c) => ['client_id' => (int)$c['id'], 'client_name' => $c['full_name'] ?: $c['username']], $clients)),
    ], JSON_INVALID_UTF8_SUBSTITUTE);
}

function handleSaveAgentEvent(PDO $pdo) {
    requireRealtorOrAdmin();
    $data = json_decode(dibsRequestBody(), true) ?: [];
    $me = (int)$_SESSION['user_id'];
    $eventId = (int)($data['event_id'] ?? 0);
    $kind = (string)($data['kind'] ?? '');
    $start = scheduleLocalTime($data['start'] ?? '');
    $mins = (int)($data['duration_mins'] ?? 0);
    $title = tourText($data['title'] ?? '', 80);
    $location = tourText($data['location'] ?? '', 200);
    $notes = tourText($data['notes'] ?? '', 500);
    $clientId = !empty($data['client_id']) ? (int)$data['client_id'] : null;

    $fail = function (string $msg) { http_response_code(400); echo json_encode(['error' => $msg]); };
    if (!isset(SCHEDULE_EVENT_KINDS[$kind])) return $fail('Choose a type.');
    if ($start === '') return $fail('Choose a date and start time.');
    if (!in_array($mins, [15, 30, 45, 60, 90, 120, 180, 240, 480], true)) return $fail('Choose a length.');
    if ($clientId !== null && !isset(scheduleClients($pdo)[$clientId])) return $fail('That client is not assigned to you.');
    if ($title === '') $title = SCHEDULE_EVENT_KINDS[$kind];
    $end = scheduleAddMinutes($start, $mins);

    if ($eventId) {
        $upd = $pdo->prepare("UPDATE agent_events SET kind = :k, title = :t, start_at = :s, end_at = :e, client_id = :c,
            location = :l, notes = :n, updated_at = CURRENT_TIMESTAMP WHERE id = :id AND agent_id = :aid");
        $upd->execute([':k' => $kind, ':t' => $title, ':s' => $start, ':e' => $end, ':c' => $clientId, ':l' => $location, ':n' => $notes, ':id' => $eventId, ':aid' => $me]);
        if (!$upd->rowCount()) { http_response_code(404); echo json_encode(['error' => 'That time block no longer exists.']); return; }
    } else {
        $pdo->prepare("INSERT INTO agent_events (agent_id, kind, title, start_at, end_at, client_id, location, notes)
            VALUES (:aid, :k, :t, :s, :e, :c, :l, :n)")
            ->execute([':aid' => $me, ':k' => $kind, ':t' => $title, ':s' => $start, ':e' => $end, ':c' => $clientId, ':l' => $location, ':n' => $notes]);
        $eventId = (int)$pdo->lastInsertId();
    }
    echo json_encode(['success' => true, 'event_id' => $eventId]);
}

function handleDeleteAgentEvent(PDO $pdo) {
    requireRealtorOrAdmin();
    $data = json_decode(dibsRequestBody(), true) ?: [];
    $del = $pdo->prepare("DELETE FROM agent_events WHERE id = :id AND agent_id = :aid");
    $del->execute([':id' => (int)($data['event_id'] ?? 0), ':aid' => (int)$_SESSION['user_id']]);
    echo json_encode(['success' => (bool)$del->rowCount()]);
}
