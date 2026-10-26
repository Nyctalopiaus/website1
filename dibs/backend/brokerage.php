<?php
/**
 * Brokerage settings and the agent roster (step 3 of claude/brokerage-spec.md).
 *
 *   get_brokerage_settings     signed-in users: the office's name, phone, address, logo, defaults
 *   save_brokerage_settings    brokerage admin (CSRF)
 *   list_agents                brokerage admin: realtors with status, client counts, last login
 *   deactivate_agent           brokerage admin (CSRF): {agent_id, assignments: {client_id: realtor_id}}
 *                              every one of the agent's clients must be reassigned to an active realtor
 *   reactivate_agent           brokerage admin (CSRF): {agent_id}
 *
 * The brokerage logo is uploaded through branding.php (kind=brokerage_logo). A deactivated user
 * can't sign in, and an existing session is ended on its next request (requireAuth in auth.php).
 */

function brokerageMigrate(PDO $pdo): void {
    runMigration($pdo, "CREATE TABLE IF NOT EXISTS brokerage_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        name TEXT NOT NULL DEFAULT '',
        office_phone TEXT NOT NULL DEFAULT '',
        office_address TEXT NOT NULL DEFAULT '',
        logo_url TEXT NOT NULL DEFAULT '',
        sell_cost_pct REAL NOT NULL DEFAULT 7,
        showing_minutes INTEGER NOT NULL DEFAULT 30,
        buffer_minutes INTEGER NOT NULL DEFAULT 10,
        share_calendars INTEGER NOT NULL DEFAULT 0,
        updated_by INTEGER,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )", 'brokerage_settings');
    runMigration($pdo, "ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'", 'users.status');
    runMigration($pdo, "ALTER TABLE users ADD COLUMN deactivated_at DATETIME DEFAULT NULL", 'users.deactivated_at');
    runMigration($pdo, "ALTER TABLE client_invites ADD COLUMN invite_role TEXT NOT NULL DEFAULT 'client'", 'client_invites.invite_role');
    $pdo->exec("INSERT OR IGNORE INTO brokerage_settings (id) VALUES (1)");
}

function brokerageSettings(PDO $pdo): array {
    $row = $pdo->query('SELECT * FROM brokerage_settings WHERE id = 1')->fetch(PDO::FETCH_ASSOC) ?: [];
    return [
        'name' => (string)($row['name'] ?? ''),
        'office_phone' => (string)($row['office_phone'] ?? ''),
        'office_address' => (string)($row['office_address'] ?? ''),
        'logo_url' => (string)($row['logo_url'] ?? ''),
        'sell_cost_pct' => (float)($row['sell_cost_pct'] ?? 7),
        'showing_minutes' => (int)($row['showing_minutes'] ?? 30),
        'buffer_minutes' => (int)($row['buffer_minutes'] ?? 10),
        'share_calendars' => !empty($row['share_calendars']),
        'slug' => defined('DIBS_BROKERAGE_SLUG') ? DIBS_BROKERAGE_SLUG : 'main',
    ];
}

function brokerageIsAdmin(): bool {
    return !empty($_SESSION['is_admin']) || ($_SESSION['role'] ?? '') === 'admin';
}

function brokerageFail(int $code, string $msg): void {
    http_response_code($code);
    echo json_encode(['success' => false, 'error' => $msg]);
}

function handleGetBrokerageSettings(PDO $pdo) {
    requireAuth();
    echo json_encode(['success' => true, 'settings' => brokerageSettings($pdo), 'can_edit' => brokerageIsAdmin()]);
}

function handleSaveBrokerageSettings(PDO $pdo) {
    requireAdmin();
    requireCsrf();
    $in = json_decode(dibsRequestBody(), true) ?: [];
    $text = fn($v, $max) => mb_substr(trim(preg_replace('/[\x00-\x1F\x7F]+/u', ' ', strip_tags((string)$v))), 0, $max);
    $name = $text($in['name'] ?? '', 120);
    $phone = $text($in['office_phone'] ?? '', 40);
    $address = $text($in['office_address'] ?? '', 200);
    if ($phone !== '' && !preg_match('/^[0-9 ()+.\-x]{7,40}$/i', $phone)) return brokerageFail(400, 'Enter the office phone with digits, spaces, dashes or parentheses.');
    $sell = $in['sell_cost_pct'] ?? 7;
    if (!is_numeric($sell) || $sell < 0 || $sell > 15) return brokerageFail(400, 'Selling cost must be between 0 and 15%.');
    $show = (int)($in['showing_minutes'] ?? 30);
    if (!in_array($show, [15, 20, 30, 45, 60, 90], true)) return brokerageFail(400, 'Pick a showing length from the list.');
    $buf = (int)($in['buffer_minutes'] ?? 10);
    if (!in_array($buf, [0, 5, 10, 15, 20, 30], true)) return brokerageFail(400, 'Pick a buffer from the list.');
    $share = !empty($in['share_calendars']) ? 1 : 0;

    $pdo->prepare("UPDATE brokerage_settings SET name = :n, office_phone = :p, office_address = :a, sell_cost_pct = :s,
            showing_minutes = :sm, buffer_minutes = :b, share_calendars = :sc, updated_by = :u, updated_at = CURRENT_TIMESTAMP WHERE id = 1")
        ->execute([':n' => $name, ':p' => $phone, ':a' => $address, ':s' => round((float)$sell, 2), ':sm' => $show, ':b' => $buf,
            ':sc' => $share, ':u' => (int)$_SESSION['user_id']]);
    logEvent($pdo, 'system', 'info', 'Brokerage settings updated', null, ['name' => $name]);
    echo json_encode(['success' => true, 'settings' => brokerageSettings($pdo)]);
}

/** Realtors in this brokerage, with their client counts. */
function handleListAgents(PDO $pdo) {
    requireAdmin();
    $rows = $pdo->query("SELECT u.id, u.public_id, u.username, COALESCE(NULLIF(u.full_name, ''), u.username) AS name, COALESCE(u.email, '') AS email,
            COALESCE(u.is_admin, 0) AS is_admin, COALESCE(u.status, 'active') AS status, u.deactivated_at, u.last_login,
            (SELECT COUNT(*) FROM users c WHERE c.role = 'client' AND c.realtor_id = u.id AND COALESCE(c.status, 'active') = 'active') AS client_count
        FROM users u WHERE u.role = 'realtor' ORDER BY (COALESCE(u.status, 'active') = 'active') DESC, name COLLATE NOCASE")->fetchAll(PDO::FETCH_ASSOC);
    $clients = $pdo->query("SELECT id, public_id, COALESCE(NULLIF(full_name, ''), username) AS name, realtor_id FROM users
        WHERE role = 'client' AND realtor_id IS NOT NULL AND COALESCE(status, 'active') = 'active' ORDER BY name COLLATE NOCASE")->fetchAll(PDO::FETCH_ASSOC);
    $byAgent = [];
    // Only public ids leave the server (sequential ids are refused on the way back in).
    $pendingRel = function_exists('brokeragePendingReleases') ? brokeragePendingReleases($pdo) : [];
    foreach ($clients as $c) $byAgent[(int)$c['realtor_id']][] = ['id' => $c['public_id'], 'name' => $c['name'], 'release' => $pendingRel[(int)$c['id']] ?? null];
    $out = [];
    foreach ($rows as $r) {
        $out[] = [
            'id' => $r['public_id'], 'username' => $r['username'], 'name' => $r['name'], 'email' => $r['email'],
            'is_admin' => (int)$r['is_admin'] === 1, 'status' => $r['status'], 'deactivated_at' => $r['deactivated_at'],
            'last_login' => $r['last_login'], 'client_count' => (int)$r['client_count'],
            'roster' => $byAgent[(int)$r['id']] ?? [],
            'is_you' => (int)$r['id'] === (int)$_SESSION['user_id'],
        ];
    }
    echo json_encode(['success' => true, 'agents' => $out]);
}

function handleDeactivateAgent(PDO $pdo) {
    requireAdmin();
    requireCsrf();
    $in = json_decode(dibsRequestBody(), true) ?: [];
    $agentId = (int)dibsUserIdFromRef($pdo, (string)($in['agent_id'] ?? ''), 'agent_id');
    $me = (int)$_SESSION['user_id'];
    if ($agentId <= 0) return brokerageFail(400, 'Pick an agent.');
    if ($agentId === $me) return brokerageFail(400, "You can't deactivate your own account.");
    $agent = $pdo->prepare("SELECT id, username, COALESCE(NULLIF(full_name, ''), username) AS name, COALESCE(status, 'active') AS status FROM users WHERE id = :id AND role = 'realtor'");
    $agent->execute([':id' => $agentId]);
    $agent = $agent->fetch(PDO::FETCH_ASSOC);
    if (!$agent) return brokerageFail(404, 'That agent was not found.');
    if ($agent['status'] !== 'active') return brokerageFail(400, 'That agent is already deactivated.');
    if (dibsIsLastAdmin($pdo, $agentId)) return brokerageFail(400, 'This is the only admin account. Make someone else an admin first.');

    // Every client must go to an active realtor other than the one leaving.
    $clients = $pdo->prepare("SELECT id, COALESCE(NULLIF(full_name, ''), username) AS name FROM users WHERE role = 'client' AND realtor_id = :a AND COALESCE(status, 'active') = 'active'");
    $clients->execute([':a' => $agentId]);
    $clients = $clients->fetchAll(PDO::FETCH_ASSOC);
    // {client public id: new realtor public id}
    $assign = [];
    foreach ((is_array($in['assignments'] ?? null) ? $in['assignments'] : []) as $k => $v) {
        $assign[(int)dibsUserIdFromRef($pdo, (string)$k, 'client_id')] = (int)dibsUserIdFromRef($pdo, (string)$v, 'realtor_id');
    }
    $active = $pdo->prepare("SELECT COALESCE(NULLIF(full_name, ''), username) FROM users WHERE id = :id AND role = 'realtor' AND COALESCE(status, 'active') = 'active' AND id != :a");
    $plan = [];
    foreach ($clients as $c) {
        $to = $assign[(int)$c['id']] ?? 0;
        $active->execute([':id' => (int)$to, ':a' => $agentId]);
        $toName = $active->fetchColumn();
        if (!$toName) return brokerageFail(400, "Choose a new agent for {$c['name']}.");
        $plan[] = ['client_id' => (int)$c['id'], 'client' => $c['name'], 'to' => (int)$to, 'to_name' => $toName];
    }

    try {
        $pdo->beginTransaction();
        $move = $pdo->prepare("UPDATE users SET realtor_id = :to WHERE id = :c AND realtor_id = :a");
        foreach ($plan as $p) $move->execute([':to' => $p['to'], ':c' => $p['client_id'], ':a' => $agentId]);
        // Pending client invites from the departing agent can't be accepted any more.
        $pdo->prepare("UPDATE client_invites SET revoked_at = :now WHERE realtor_id = :a AND accepted_at IS NULL AND revoked_at IS NULL")
            ->execute([':now' => gmdate('Y-m-d H:i:s'), ':a' => $agentId]);
        $pdo->prepare("UPDATE users SET status = 'deactivated', deactivated_at = CURRENT_TIMESTAMP WHERE id = :a")->execute([':a' => $agentId]);
        // Their bookmarklet tokens stop working too.
        $pdo->prepare("DELETE FROM scrape_tokens WHERE user_id = :a")->execute([':a' => $agentId]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        logEvent($pdo, 'system', 'error', 'Agent deactivation failed: ' . $e->getMessage());
        return brokerageFail(500, 'Could not deactivate the agent. Nothing was changed.');
    }

    foreach ($plan as $p) {
        createNotification($pdo, $p['client_id'], 'agent_changed', 'Your agent has changed',
            "{$p['to_name']} is now your agent in Dibs. Your favorites, notes and tour history are all still here.", '#grid');
        createNotification($pdo, $p['to'], 'client_assigned', 'New client assigned',
            "{$p['client']} was reassigned to you from {$agent['name']}. Their history in Dibs comes with them.", '#realtor');
    }
    logEvent($pdo, 'system', 'info', 'Agent deactivated', null, ['agent' => $agent['username'], 'reassigned' => count($plan)]);
    echo json_encode(['success' => true, 'reassigned' => count($plan)]);
}

function handleReactivateAgent(PDO $pdo) {
    requireAdmin();
    requireCsrf();
    $in = json_decode(dibsRequestBody(), true) ?: [];
    $agentId = (int)dibsUserIdFromRef($pdo, (string)($in['agent_id'] ?? ''), 'agent_id');
    $st = $pdo->prepare("UPDATE users SET status = 'active', deactivated_at = NULL WHERE id = :id AND role = 'realtor' AND status = 'deactivated'");
    $st->execute([':id' => $agentId]);
    if ($st->rowCount() !== 1) return brokerageFail(404, 'That agent is not deactivated.');
    logEvent($pdo, 'system', 'info', 'Agent reactivated', null, ['agent_id' => $agentId]);
    echo json_encode(['success' => true]);
}

// ------------------------------------------------------------------ client release (step 4)
//
//   request_client_release   brokerage admin (CSRF): {client_id, agent_name, new_brokerage, note}
//   cancel_client_release    brokerage admin (CSRF): {release_id}
//   get_my_release           client: the pending release offer, if any
//   respond_client_release   client (CSRF): {release_id, decision: go|stay, close_account}
//   export_my_data           client: everything the client entered, for download
//
// Releasing a client means offering them the choice to follow a departing agent. Nothing moves
// until the client agrees. Agreeing gives them a download of their own data (never the
// brokerage's private notes) and the choice to close their account here. Moving the account to
// the agent's new brokerage on Dibs comes with step 5.

function brokerageReleaseMigrate(PDO $pdo): void {
    runMigration($pdo, "CREATE TABLE IF NOT EXISTS client_releases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id INTEGER NOT NULL,
        agent_name TEXT NOT NULL DEFAULT '',
        new_brokerage TEXT NOT NULL DEFAULT '',
        note TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'pending',      -- pending | accepted | declined | cancelled
        closed_account INTEGER NOT NULL DEFAULT 0,
        requested_by INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        decided_at DATETIME DEFAULT NULL,
        FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE
    )", 'client_releases');
}

function handleRequestClientRelease(PDO $pdo) {
    requireAdmin();
    requireCsrf();
    $in = json_decode(dibsRequestBody(), true) ?: [];
    $clientId = (int)($in['client_id'] ?? 0);   // translated from the public id by dibsRequestBody
    $text = fn($v, $max) => mb_substr(trim(preg_replace('/[\x00-\x1F\x7F]+/u', ' ', strip_tags((string)$v))), 0, $max);
    $agentName = $text($in['agent_name'] ?? '', 80);
    $newBrokerage = $text($in['new_brokerage'] ?? '', 120);
    $note = $text($in['note'] ?? '', 500);
    $c = $pdo->prepare("SELECT id, COALESCE(NULLIF(full_name, ''), username) AS name FROM users WHERE id = :id AND role = 'client' AND COALESCE(status, 'active') = 'active'");
    $c->execute([':id' => $clientId]);
    $client = $c->fetch(PDO::FETCH_ASSOC);
    if (!$client) return brokerageFail(404, 'That client was not found.');
    if (mb_strlen($agentName) < 2) return brokerageFail(400, "Enter the agent's name.");
    $open = $pdo->prepare("SELECT 1 FROM client_releases WHERE client_id = :c AND status = 'pending'");
    $open->execute([':c' => $clientId]);
    if ($open->fetchColumn()) return brokerageFail(409, 'This client already has a release waiting for their answer.');
    $pdo->prepare("INSERT INTO client_releases (client_id, agent_name, new_brokerage, note, requested_by) VALUES (:c, :a, :b, :n, :u)")
        ->execute([':c' => $clientId, ':a' => $agentName, ':b' => $newBrokerage, ':n' => $note, ':u' => (int)$_SESSION['user_id']]);
    createNotification($pdo, $clientId, 'release_offer', 'A choice about your agent',
        "$agentName is moving" . ($newBrokerage !== '' ? " to $newBrokerage" : '') . '. Open Dibs to choose whether to go with them.', '#grid');
    logEvent($pdo, 'system', 'info', 'Client release offered', null, ['client_id' => $clientId, 'agent' => $agentName]);
    echo json_encode(['success' => true]);
}

function handleCancelClientRelease(PDO $pdo) {
    requireAdmin();
    requireCsrf();
    $in = json_decode(dibsRequestBody(), true) ?: [];
    $st = $pdo->prepare("UPDATE client_releases SET status = 'cancelled', decided_at = CURRENT_TIMESTAMP WHERE id = :id AND status = 'pending'");
    $st->execute([':id' => (int)($in['release_id'] ?? 0)]);
    if ($st->rowCount() !== 1) return brokerageFail(404, 'That release is not waiting for an answer.');
    echo json_encode(['success' => true]);
}

/** Pending release offers by client id (for the roster). */
function brokeragePendingReleases(PDO $pdo): array {
    $out = [];
    foreach ($pdo->query("SELECT id, client_id, agent_name, new_brokerage, created_at FROM client_releases WHERE status = 'pending'")->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $out[(int)$r['client_id']] = ['release_id' => (int)$r['id'], 'agent_name' => $r['agent_name'], 'new_brokerage' => $r['new_brokerage'], 'created_at' => $r['created_at']];
    }
    return $out;
}

function handleGetMyRelease(PDO $pdo) {
    requireAuth();
    $st = $pdo->prepare("SELECT id, agent_name, new_brokerage, note, created_at FROM client_releases WHERE client_id = :c AND status = 'pending' ORDER BY id DESC LIMIT 1");
    $st->execute([':c' => (int)$_SESSION['user_id']]);
    $r = $st->fetch(PDO::FETCH_ASSOC);
    $settings = brokerageSettings($pdo);
    echo json_encode(['success' => true, 'release' => $r ? [
        'release_id' => (int)$r['id'], 'agent_name' => $r['agent_name'], 'new_brokerage' => $r['new_brokerage'],
        'note' => $r['note'], 'created_at' => $r['created_at'], 'brokerage_name' => $settings['name'],
    ] : null]);
}

function handleRespondClientRelease(PDO $pdo) {
    requireAuth();
    requireCsrf();
    $in = json_decode(dibsRequestBody(), true) ?: [];
    $me = (int)$_SESSION['user_id'];
    $decision = ($in['decision'] ?? '') === 'go' ? 'accepted' : (($in['decision'] ?? '') === 'stay' ? 'declined' : '');
    if ($decision === '') return brokerageFail(400, 'Choose whether to go with your agent or stay.');
    $close = $decision === 'accepted' && !empty($in['close_account']);
    $st = $pdo->prepare("UPDATE client_releases SET status = :s, closed_account = :c, decided_at = CURRENT_TIMESTAMP WHERE id = :id AND client_id = :me AND status = 'pending'");
    $st->execute([':s' => $decision, ':c' => $close ? 1 : 0, ':id' => (int)($in['release_id'] ?? 0), ':me' => $me]);
    if ($st->rowCount() !== 1) return brokerageFail(404, 'That choice is no longer open.');
    $row = $pdo->prepare("SELECT agent_name, requested_by FROM client_releases WHERE id = :id");
    $row->execute([':id' => (int)$in['release_id']]);
    $rel = $row->fetch(PDO::FETCH_ASSOC);
    $name = $pdo->prepare("SELECT COALESCE(NULLIF(full_name, ''), username) FROM users WHERE id = :id");
    $name->execute([':id' => $me]);
    $clientName = (string)$name->fetchColumn();
    if (!empty($rel['requested_by'])) {
        createNotification($pdo, (int)$rel['requested_by'], 'release_answer', $decision === 'accepted' ? 'Client is leaving' : 'Client is staying',
            $decision === 'accepted'
                ? "$clientName chose to go with {$rel['agent_name']}" . ($close ? ' and closed their account.' : ' and kept their account for now.')
                : "$clientName chose to stay with the brokerage.", '#realtor');
    }
    logEvent($pdo, 'system', 'info', 'Client release answered', null, ['client_id' => $me, 'decision' => $decision, 'closed' => $close]);
    if ($close) {
        // The data was offered for download before this call; the account stops working now.
        $pdo->prepare("UPDATE users SET status = 'closed', deactivated_at = CURRENT_TIMESTAMP WHERE id = :id AND role = 'client'")->execute([':id' => $me]);
        $_SESSION = [];
    }
    echo json_encode(['success' => true, 'decision' => $decision, 'closed' => $close]);
}

/**
 * Everything the signed-in client entered in Dibs, for their own download: decisions, ratings,
 * notes they wrote, notes their agent shared, tour scores and results, Top Picks, My Home, brief
 * and saved searches. Never the brokerage's private notes or agent-only brief criteria.
 */
function handleExportMyData(PDO $pdo) {
    requireAuth();
    $me = (int)$_SESSION['user_id'];
    $u = $pdo->prepare("SELECT username, full_name, email, phone, role, created_at FROM users WHERE id = :id");
    $u->execute([':id' => $me]);
    $user = $u->fetch(PDO::FETCH_ASSOC) ?: [];

    $h = $pdo->prepare("SELECT m.mls_id, p.address, p.city, p.zip, p.price, p.status, p.beds, p.baths, p.sqft_finished, p.year_built, p.mls_url,
            COALESCE(m.favorite, 0) AS favorite, COALESCE(m.possibility, 0) AS possibility, COALESCE(m.hidden, 0) AS passed,
            COALESCE(m.rating, 0) AS rating, COALESCE(m.user_notes, '') AS my_notes, COALESCE(m.realtor_notes, '') AS agent_shared_notes,
            COALESCE(m.toured, 0) AS toured, m.toured_at, COALESCE(m.tour_notes, '') AS tour_notes, m.pick_rank, m.tour_scores_json, m.updated_at
        FROM user_metadata m JOIN properties p ON p.mls_id = m.mls_id
        WHERE m.user_id = :id AND (m.favorite = 1 OR m.possibility = 1 OR m.hidden = 1 OR m.rating > 0 OR m.toured = 1
            OR COALESCE(m.user_notes, '') != '' OR COALESCE(m.tour_notes, '') != '' OR COALESCE(m.realtor_notes, '') != '')
        ORDER BY (m.pick_rank IS NULL), m.pick_rank, p.address");
    $h->execute([':id' => $me]);
    $homes = [];
    foreach ($h->fetchAll(PDO::FETCH_ASSOC) as $r) {
        $r['tour_scores'] = json_decode($r['tour_scores_json'] ?? 'null', true) ?: null;
        unset($r['tour_scores_json']);
        foreach (['my_notes', 'agent_shared_notes', 'tour_notes'] as $k) $r[$k] = trim(html_entity_decode(strip_tags(preg_replace('#<br\s*/?>|</(p|div|li)>#i', "\n", (string)$r[$k])), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
        $homes[] = $r;
    }
    $t = $pdo->prepare("SELECT tour_date, impressions, followups_json, top3_json, updated_at FROM tour_debriefs WHERE client_id = :id ORDER BY tour_date");
    $t->execute([':id' => $me]);
    $tours = array_map(fn($r) => ['tour_date' => $r['tour_date'], 'impressions' => $r['impressions'],
        'followups' => json_decode($r['followups_json'] ?: '[]', true) ?: [], 'top3' => json_decode($r['top3_json'] ?: '[]', true) ?: [],
        'updated_at' => $r['updated_at']], $t->fetchAll(PDO::FETCH_ASSOC));
    $mh = $pdo->prepare("SELECT * FROM my_homes WHERE user_id = :id");
    $mh->execute([':id' => $me]);
    $myHome = $mh->fetch(PDO::FETCH_ASSOC) ?: null;
    if ($myHome) unset($myHome['user_id']);
    $brief = null;
    if (function_exists('briefLoad')) {
        $loaded = briefLoad($pdo, $me);
        $brief = $loaded['brief'] ?? null;
        if (is_array($brief) && isset($brief['criteria'])) $brief['criteria'] = array_values(array_filter($brief['criteria'], fn($c) => ($c['visibility'] ?? '') !== 'agent_only'));
    }
    $sf = $pdo->prepare("SELECT name, filter_json, created_at FROM saved_filters WHERE user_id = :id ORDER BY name");
    $sf->execute([':id' => $me]);
    $searches = array_map(fn($r) => ['name' => $r['name'], 'filters' => json_decode($r['filter_json'] ?: '{}', true), 'created_at' => $r['created_at']], $sf->fetchAll(PDO::FETCH_ASSOC));

    logEvent($pdo, 'system', 'info', 'Client exported their data', null, ['homes' => count($homes)]);
    echo json_encode(['success' => true, 'exported_at' => gmdate('c'), 'brokerage' => brokerageSettings($pdo)['name'],
        'account' => $user, 'homes' => $homes, 'tours' => $tours, 'my_home' => $myHome, 'brief' => $brief, 'saved_searches' => $searches],
        JSON_INVALID_UTF8_SUBSTITUTE | JSON_PRETTY_PRINT);
}

/**
 * Billing tab (read-only for now; claude/billing-spec.md): this brokerage's plan, trial, seats and
 * what it would cost. The state lives in data/platform.db (set from the platform console).
 */
function handleBillingStatus(PDO $pdo) {
    requireAdmin();
    $seats = (int)$pdo->query("SELECT COUNT(*) FROM users WHERE role = 'realtor' AND COALESCE(status, 'active') = 'active'")->fetchColumn();
    $out = ['plan' => 'trial', 'trial_ends_at' => null, 'seats' => $seats, 'price_monthly' => 39.0, 'price_yearly' => 390.0, 'payments_connected' => false];
    try {
        $p = dibsPlatformDb(__DIR__ . '/../data');
        $b = $p->prepare("SELECT plan, trial_ends_at, stripe_status FROM billing WHERE brokerage_id = :id");
        $b->execute([':id' => DIBS_BROKERAGE_ID]);
        if ($row = $b->fetch()) { $out['plan'] = $row['plan']; $out['trial_ends_at'] = $row['trial_ends_at']; $out['payments_connected'] = !empty($row['stripe_status']); }
        foreach ($p->query("SELECT key, value FROM platform_settings")->fetchAll() as $s) {
            if ($s['key'] === 'seat_price_monthly') $out['price_monthly'] = (float)$s['value'];
            if ($s['key'] === 'seat_price_yearly') $out['price_yearly'] = (float)$s['value'];
        }
    } catch (Throwable $e) { /* billing not set up yet: defaults */ }
    if (DIBS_BROKERAGE_ID === 1 && $out['plan'] === 'trial' && !$out['trial_ends_at']) $out['plan'] = 'comped';
    echo json_encode(['success' => true, 'billing' => $out]);
}

brokerageMigrate($pdo);
brokerageReleaseMigrate($pdo);
