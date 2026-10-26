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
            (SELECT COUNT(*) FROM users c WHERE c.role = 'client' AND c.realtor_id = u.id) AS client_count
        FROM users u WHERE u.role = 'realtor' ORDER BY (COALESCE(u.status, 'active') = 'active') DESC, name COLLATE NOCASE")->fetchAll(PDO::FETCH_ASSOC);
    $clients = $pdo->query("SELECT id, public_id, COALESCE(NULLIF(full_name, ''), username) AS name, realtor_id FROM users
        WHERE role = 'client' AND realtor_id IS NOT NULL ORDER BY name COLLATE NOCASE")->fetchAll(PDO::FETCH_ASSOC);
    $byAgent = [];
    // Only public ids leave the server (sequential ids are refused on the way back in).
    foreach ($clients as $c) $byAgent[(int)$c['realtor_id']][] = ['id' => $c['public_id'], 'name' => $c['name']];
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
    $clients = $pdo->prepare("SELECT id, COALESCE(NULLIF(full_name, ''), username) AS name FROM users WHERE role = 'client' AND realtor_id = :a");
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

brokerageMigrate($pdo);
