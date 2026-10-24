<?php
/**
 * Agent activity feed + client engagement scores (action=get_agent_feed).
 *
 * One stream across all of an agent's clients, built from what Dibs already records:
 *   property_activity  client verdicts, notes, questions, messages; price/status changes
 *   fit_alerts         Perfect Matches that were sent (backend/brief.php)
 *   property_messages  agent messages and whether the client answered
 *   showing_itinerary  tours
 * plus derived items: Heating (3+ favorites in 72h), Cooling (engagement down 25+ in a week),
 * and Quiet (searching/touring client inactive 7+ days).
 *
 * Engagement (0-100), from the blueprint:
 *   E = 0.30 R + 0.25 V + 0.20 D + 0.15 T + 0.10 M
 *   R recency (100 today -> 0 at 14 days), V verdicts in 7 days (10 = 100), D notes/questions/
 *   messages in 14 days (5 = 100), T tours in 30 days (2 = 100), M share of agent messages answered
 *   within 48h. T and M are left out (weights renormalized) for clients with no tours / no agent
 *   messages yet, so a new client isn't punished for what hasn't happened.
 * The same formula run as of 7 days ago gives the trend.
 */

const FEED_DAYS = 14;
const FEED_MAX_ITEMS = 80;
const FEED_VERDICT_TYPES = ['favorite_updated', 'rating_updated', 'client_visibility_updated'];
const FEED_DEPTH_TYPES = ['client_note_updated', 'client_question_updated', 'property_message_sent'];

function feedTs(?string $s): ?int {
    if (!$s) return null;
    $t = strtotime($s . (preg_match('/[zZ]|[+-]\d\d:?\d\d$/', $s) ? '' : ' UTC'));
    return $t === false ? null : $t;
}

function feedIso(int $t): string {
    return gmdate('c', $t);
}

/** Clients this login may see, matching get_client_matrix's scoping. */
function feedClients(PDO $pdo): array {
    $me = (int)$_SESSION['user_id'];
    $isAdmin = !empty($_SESSION['is_admin']) || ($_SESSION['role'] ?? '') === 'admin';
    $sql = "SELECT id, username, full_name, pipeline_stage, last_login, created_at FROM users WHERE role = 'client'";
    $params = [];
    if (!$isAdmin) { $sql .= " AND (realtor_id = :rid OR id = :rid)"; $params[':rid'] = $me; }
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $out = [];
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $c) $out[(int)$c['id']] = $c;
    return $out;
}

function feedPlaceholders(array $ids, string $prefix, array &$params): string {
    $names = [];
    foreach (array_values($ids) as $i => $id) { $names[] = ":{$prefix}{$i}"; $params[":{$prefix}{$i}"] = $id; }
    return implode(',', $names);
}

/** Engagement at time $at from preloaded per-client data. Returns [score, parts]. */
function feedEngagement(array $d, int $at, ?int $lastLogin): array {
    $actions = array_filter($d['actions'], fn($a) => $a['t'] <= $at);
    $lastAction = $actions ? max(array_column($actions, 't')) : null;
    $last = max($lastAction ?? 0, ($lastLogin !== null && $lastLogin <= $at) ? $lastLogin : 0);
    $parts = [];
    $parts['R'] = $last ? max(0, 100 * (1 - (($at - $last) / 86400) / 14)) : 0;
    $parts['V'] = min(100, 10 * count(array_filter($actions, fn($a) => in_array($a['type'], FEED_VERDICT_TYPES, true) && $a['t'] > $at - 7 * 86400)));
    $parts['D'] = min(100, 20 * count(array_filter($actions, fn($a) => in_array($a['type'], FEED_DEPTH_TYPES, true) && $a['t'] > $at - 14 * 86400)));
    if ($d['has_tours']) {
        $parts['T'] = min(100, 50 * count(array_filter($d['tours'], fn($t) => $t <= $at && $t > $at - 30 * 86400)));
    }
    $agentMsgs = array_filter($d['agent_msgs'], fn($t) => $t <= $at && $t > $at - 30 * 86400);
    if ($agentMsgs) {
        $answered = 0;
        foreach ($agentMsgs as $t) {
            foreach ($d['client_msgs'] as $c) { if ($c > $t && $c <= $t + 48 * 3600 && $c <= $at) { $answered++; break; } }
        }
        $parts['M'] = 100 * $answered / count($agentMsgs);
    }
    $weights = ['R' => 0.30, 'V' => 0.25, 'D' => 0.20, 'T' => 0.15, 'M' => 0.10];
    $sum = 0; $wsum = 0;
    foreach ($parts as $k => $v) { $sum += $weights[$k] * $v; $wsum += $weights[$k]; }
    return [(int)round($sum / $wsum), array_map(fn($v) => (int)round($v), $parts)];
}

function feedPlace(array $row): string {
    $addr = trim((string)($row['address'] ?? ''));
    return $addr !== '' ? $addr : ('MLS #' . ($row['mls_id'] ?? ''));
}

function handleGetAgentFeed(PDO $pdo) {
    requireRealtorOrAdmin();
    $clients = feedClients($pdo);
    $now = time();
    if (!$clients) { echo json_encode(['success' => true, 'clients' => [], 'items' => []]); return; }

    $ids = array_keys($clients);
    $since = gmdate('Y-m-d H:i:s', $now - 37 * 86400);   // 30-day windows, evaluated now and 7 days ago
    $feedSince = $now - FEED_DAYS * 86400;
    $name = fn($cid) => $clients[$cid]['full_name'] ?: $clients[$cid]['username'];
    $data = [];
    foreach ($ids as $id) $data[$id] = ['actions' => [], 'tours' => [], 'has_tours' => false, 'agent_msgs' => [], 'client_msgs' => []];
    $items = [];

    // Client actions (the client is both actor and subject).
    $params = [':since' => $since];
    $in = feedPlaceholders($ids, 'c', $params);
    $stmt = $pdo->prepare("SELECT a.subject_user_id AS cid, a.activity_type, a.message, a.details_json, a.created_at, a.mls_id, p.address
        FROM property_activity a LEFT JOIN properties p ON p.mls_id = a.mls_id
        WHERE a.subject_user_id IN ($in) AND a.actor_user_id = a.subject_user_id AND a.created_at >= :since
        ORDER BY a.created_at DESC");
    $stmt->execute($params);
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $cid = (int)$r['cid']; $t = feedTs($r['created_at']);
        if ($t === null) continue;
        $data[$cid]['actions'][] = ['type' => $r['activity_type'], 't' => $t, 'saved' => strncmp((string)$r['message'], 'Saved', 5) === 0];
        if ($t < $feedSince) continue;
        $place = feedPlace($r);
        $verb = null; $attention = false; $icon = 'activity';
        switch ($r['activity_type']) {
            case 'favorite_updated':
                [$verb, $icon] = strncmp((string)$r['message'], 'Saved', 5) === 0 ? ['favorited', 'heart'] : ['unfavorited', 'heart-off']; break;
            case 'rating_updated':
                $rating = json_decode((string)$r['details_json'], true)['rating'] ?? null;
                [$verb, $icon] = [$rating ? "rated $rating\u{2605}" : 'rated', 'star']; break;
            case 'client_visibility_updated':
                [$verb, $icon] = strncmp((string)$r['message'], 'Marked', 6) === 0 ? ['passed on', 'thumbs-down'] : ['restored', 'rotate-ccw']; break;
            case 'client_note_updated':
                [$verb, $icon] = ['added a note on', 'notebook-pen']; break;
            case 'client_question_updated':
                [$verb, $icon, $attention] = ['asked a question about', 'circle-help', true]; break;
            case 'property_message_sent':
                [$verb, $icon, $attention] = ['messaged you about', 'message-square', true]; break;
        }
        if ($verb === null) continue;
        $items[] = ['kind' => 'client_action', 'icon' => $icon, 'client_id' => $cid, 'client_name' => $name($cid), 'mls_id' => $r['mls_id'],
            'text' => "{$name($cid)} $verb $place", 'at' => feedIso($t), 'attention' => $attention, 'action' => 'listing'];
    }

    // Price drops and status changes on listings a client favorited or kept as a possibility.
    $params = [':since' => gmdate('Y-m-d H:i:s', $feedSince)];
    $in = feedPlaceholders($ids, 'c', $params);
    $stmt = $pdo->prepare("SELECT m.user_id AS cid, a.activity_type, a.message, a.details_json, a.created_at, a.mls_id, p.address
        FROM property_activity a
        JOIN user_metadata m ON m.mls_id = a.mls_id AND (m.favorite = 1 OR m.possibility = 1)
        LEFT JOIN properties p ON p.mls_id = a.mls_id
        WHERE m.user_id IN ($in) AND a.activity_type IN ('price_reduced', 'listing_status_changed') AND a.created_at >= :since");
    $stmt->execute($params);
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $cid = (int)$r['cid']; $t = feedTs($r['created_at']);
        if ($t === null) continue;
        $place = feedPlace($r);
        if ($r['activity_type'] === 'price_reduced') {
            $text = "Price drop on {$name($cid)}'s pick: $place \u{2014} " . rtrim((string)$r['message'], '.');
            $icon = 'trending-down';
        } else {
            $status = json_decode((string)$r['details_json'], true)['status'] ?? 'a new status';
            $text = "$place, one of {$name($cid)}'s picks, is now $status";
            $icon = 'refresh-cw';
        }
        $items[] = ['kind' => 'listing_change', 'icon' => $icon, 'client_id' => $cid, 'client_name' => $name($cid), 'mls_id' => $r['mls_id'],
            'text' => $text, 'at' => feedIso($t), 'attention' => true, 'action' => 'listing'];
    }

    // Perfect Matches that were sent.
    $exists = $pdo->query("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'fit_alerts'")->fetchColumn();
    if ($exists) {
        $params = [':since' => gmdate('Y-m-d H:i:s', $feedSince)];
        $in = feedPlaceholders($ids, 'c', $params);
        $stmt = $pdo->prepare("SELECT f.user_id AS cid, f.listing_id AS mls_id, f.score, f.created_at, p.address
            FROM fit_alerts f LEFT JOIN properties p ON p.mls_id = f.listing_id
            WHERE f.user_id IN ($in) AND f.delivery = 'notified' AND f.created_at >= :since");
        $stmt->execute($params);
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
            $cid = (int)$r['cid']; $t = feedTs($r['created_at']);
            if ($t === null) continue;
            $items[] = ['kind' => 'perfect_match', 'icon' => 'sparkles', 'client_id' => $cid, 'client_name' => $name($cid), 'mls_id' => $r['mls_id'],
                'text' => "Perfect Match for {$name($cid)}: " . feedPlace($r) . " ({$r['score']} Fit)", 'at' => feedIso($t), 'attention' => true, 'action' => 'listing'];
        }
    }

    // Tours and messages, for the engagement score.
    $params = [':since' => $since];
    $in = feedPlaceholders($ids, 'c', $params);
    $stmt = $pdo->prepare("SELECT client_id, updated_at, TRIM(showing_time) != '' AS booked FROM showing_itinerary WHERE client_id IN ($in)");
    $stmt->execute(array_diff_key($params, [':since' => 1]));
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $cid = (int)$r['client_id'];
        if (!$r['booked']) continue;
        $data[$cid]['has_tours'] = true;
        if (($t = feedTs($r['updated_at'])) !== null) $data[$cid]['tours'][] = $t;
    }
    $stmt = $pdo->prepare("SELECT user_id, sender_role, created_at FROM property_messages WHERE user_id IN ($in) AND created_at >= :since");
    $stmt->execute($params);
    foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $r) {
        if (($t = feedTs($r['created_at'])) === null) continue;
        $data[(int)$r['user_id']][$r['sender_role'] === 'realtor' ? 'agent_msgs' : 'client_msgs'][] = $t;
    }

    // Engagement per client, plus derived feed items.
    $out = [];
    foreach ($clients as $cid => $c) {
        $lastLogin = feedTs($c['last_login']);
        [$score, $parts] = feedEngagement($data[$cid], $now, $lastLogin);
        [$prev] = feedEngagement($data[$cid], $now - 7 * 86400, $lastLogin);
        $favs72 = count(array_filter($data[$cid]['actions'], fn($a) => $a['type'] === 'favorite_updated' && $a['saved'] && $a['t'] > $now - 72 * 3600));
        $lastSeen = max($lastLogin ?? 0, ...array_merge([0], array_column($data[$cid]['actions'], 't')));
        $daysQuiet = $lastSeen ? (int)floor(($now - $lastSeen) / 86400) : null;
        $created = feedTs($c['created_at']);
        $trend = 'steady';
        if ($created && $created > $now - 7 * 86400) $trend = 'new';
        elseif ($favs72 >= 3) $trend = 'heating';
        elseif ($prev >= 40 && $prev - $score >= 25) $trend = 'cooling';

        $out[] = ['id' => $cid, 'name' => $name($cid), 'stage' => $c['pipeline_stage'] ?: 'searching', 'score' => $score, 'prev' => $prev,
            'trend' => $trend, 'days_quiet' => $daysQuiet, 'parts' => $parts];

        $searching = in_array($c['pipeline_stage'] ?: 'searching', ['searching', 'touring'], true);
        if ($trend === 'heating') {
            $items[] = ['kind' => 'heating', 'icon' => 'flame', 'client_id' => $cid, 'client_name' => $name($cid), 'mls_id' => null,
                'text' => "{$name($cid)} is heating up: $favs72 favorites in the last 3 days", 'at' => feedIso($now), 'attention' => true, 'action' => 'client'];
        } elseif ($trend === 'cooling' && $searching) {
            $items[] = ['kind' => 'cooling', 'icon' => 'snowflake', 'client_id' => $cid, 'client_name' => $name($cid), 'mls_id' => null,
                'text' => "{$name($cid)} is cooling off: engagement $prev \u{2192} $score this week", 'at' => feedIso($now), 'attention' => true, 'action' => 'client'];
        }
        if ($searching && $daysQuiet !== null && $daysQuiet >= 7) {
            $items[] = ['kind' => 'quiet', 'icon' => 'moon', 'client_id' => $cid, 'client_name' => $name($cid), 'mls_id' => null,
                'text' => "{$name($cid)} hasn't been active in $daysQuiet days", 'at' => feedIso($now), 'attention' => true, 'action' => 'client'];
        }
    }

    // Derived items first (they're about right now), then newest first.
    usort($items, function ($a, $b) {
        $da = in_array($a['kind'], ['heating', 'cooling', 'quiet'], true); $db = in_array($b['kind'], ['heating', 'cooling', 'quiet'], true);
        if ($da !== $db) return $da ? -1 : 1;
        return strcmp($b['at'], $a['at']);
    });
    usort($out, fn($a, $b) => $b['score'] <=> $a['score']);

    // Toggling a favorite back and forth logs one line per click: keep only the newest of each.
    $seen = [];
    $items = array_values(array_filter($items, function ($i) use (&$seen) {
        if (isset($seen[$i['text']])) return false;
        return $seen[$i['text']] = true;
    }));

    echo json_encode(['success' => true, 'generated_at' => feedIso($now), 'clients' => $out,
        'items' => array_slice($items, 0, FEED_MAX_ITEMS)], JSON_INVALID_UTF8_SUBSTITUTE);
}
