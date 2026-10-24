<?php
/**
 * Client invitations: an agent invites a client by name and email; the client opens a single-use,
 * expiring link (join.html#t=<token>), picks a username and password, and is logged in already
 * assigned to that agent.
 *
 * Security:
 *  - The token is 32 random bytes; only its SHA-256 hash is stored, so the database alone can't
 *    rebuild a working link. The full link is shown to the agent once, at creation.
 *  - The link carries the token after "#", so it never reaches server logs or Referer headers.
 *  - Single use, 7-day expiry, revocable. Acceptance claims the invite atomically, so two
 *    simultaneous submissions can't both create accounts.
 *  - The joiner must type the email the invite was sent to. Without outbound email this is not
 *    proof of ownership; it stops casual forwarding. Real email verification comes with email.
 *  - Public endpoints (check/accept) are rate-limited per IP; creation is capped per agent per day.
 */

const INVITE_DAYS = 7;
const INVITE_MAX_PER_DAY = 50;
const INVITE_PUBLIC_MAX_PER_HOUR = 30;

function invitesMigrate(PDO $pdo): void {
    runMigration($pdo, "CREATE TABLE IF NOT EXISTS client_invites (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token_hash TEXT NOT NULL UNIQUE,
        realtor_id INTEGER NOT NULL,
        full_name TEXT NOT NULL,
        email TEXT NOT NULL,
        created_by INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        accepted_at TEXT,
        accepted_user_id INTEGER,
        revoked_at TEXT
    )", 'client_invites');
    runMigration($pdo, "CREATE TABLE IF NOT EXISTS invite_attempts (ip TEXT NOT NULL, at TEXT NOT NULL)", 'invite_attempts');
}
invitesMigrate($pdo);

function inviteNow(int $offset = 0): string {
    return gmdate('Y-m-d H:i:s', time() + $offset);
}

function inviteFail(int $code, string $message): void {
    http_response_code($code);
    echo json_encode(['success' => false, 'error' => $message]);
}

function inviteIsAdmin(): bool {
    return !empty($_SESSION['is_admin']) || ($_SESSION['role'] ?? '') === 'admin';
}

/** Per-IP limit for the public endpoints. Returns false (and responds 429) when over. */
function inviteRateOk(PDO $pdo): bool {
    $ip = substr((string)($_SERVER['REMOTE_ADDR'] ?? 'unknown'), 0, 64);
    $pdo->prepare("DELETE FROM invite_attempts WHERE at < :old")->execute([':old' => inviteNow(-86400)]);
    $count = $pdo->prepare("SELECT COUNT(*) FROM invite_attempts WHERE ip = :ip AND at >= :since");
    $count->execute([':ip' => $ip, ':since' => inviteNow(-3600)]);
    if ((int)$count->fetchColumn() >= INVITE_PUBLIC_MAX_PER_HOUR) {
        inviteFail(429, 'Too many attempts. Please wait a while and try again.');
        return false;
    }
    $pdo->prepare("INSERT INTO invite_attempts (ip, at) VALUES (:ip, :at)")->execute([':ip' => $ip, ':at' => inviteNow()]);
    return true;
}

/** Looks up a usable invite by raw token. Returns [invite|null, reason]. */
function inviteFind(PDO $pdo, $token): array {
    if (!is_string($token) || !preg_match('/^[a-f0-9]{64}$/', $token)) return [null, 'This invite link is not valid.'];
    $stmt = $pdo->prepare("SELECT i.*, COALESCE(NULLIF(u.full_name, ''), u.username) AS agent_name
        FROM client_invites i LEFT JOIN users u ON u.id = i.realtor_id WHERE i.token_hash = :h");
    $stmt->execute([':h' => hash('sha256', $token)]);
    $inv = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$inv) return [null, 'This invite link is not valid.'];
    if ($inv['revoked_at']) return [null, 'This invite was cancelled. Ask your agent for a new one.'];
    if ($inv['accepted_at']) return [null, 'This invite has already been used. Sign in instead.'];
    if ($inv['expires_at'] <= inviteNow()) return [null, 'This invite has expired. Ask your agent for a new one.'];
    return [$inv, ''];
}

function inviteMaskEmail(string $email): string {
    [$user, $domain] = array_pad(explode('@', $email, 2), 2, '');
    return mb_substr($user, 0, 1) . str_repeat("\u{2022}", max(2, min(6, mb_strlen($user) - 1))) . '@' . $domain;
}

function inviteStatus(array $i): string {
    if ($i['accepted_at']) return 'accepted';
    if ($i['revoked_at']) return 'revoked';
    return $i['expires_at'] <= inviteNow() ? 'expired' : 'pending';
}

// ------------------------------------------------------------------ agent endpoints

function handleCreateInvite(PDO $pdo) {
    requireRealtorOrAdmin();
    $in = json_decode(dibsRequestBody(), true) ?: [];
    $me = (int)$_SESSION['user_id'];

    $name = trim(preg_replace('/\s+/u', ' ', preg_replace("/[^\p{L}\p{N} '\x{2019}\-.]/u", '', strip_tags((string)($in['full_name'] ?? '')))));
    $email = strtolower(trim((string)($in['email'] ?? '')));
    if (mb_strlen($name) < 2 || mb_strlen($name) > 80) { inviteFail(400, "Enter the client's name (2 to 80 characters)."); return; }
    if (strlen($email) > 254 || !filter_var($email, FILTER_VALIDATE_EMAIL)) { inviteFail(400, 'Enter a valid email address.'); return; }

    // Clients are only ever assigned to a realtor. Realtors invite to themselves; an admin must
    // pick a realtor account (never an admin, including the built-in "admin" login).
    $realtorId = $me;
    if (inviteIsAdmin()) {
        $chk = $pdo->prepare("SELECT id FROM users WHERE id = :id AND role = 'realtor' AND COALESCE(is_admin, 0) = 0 AND username != 'admin'");
        $chk->execute([':id' => (int)($in['realtor_id'] ?? 0)]);
        if (!$chk->fetchColumn()) { inviteFail(400, 'Choose a realtor from the list.'); return; }
        $realtorId = (int)$in['realtor_id'];
    }

    $exists = $pdo->prepare("SELECT 1 FROM users WHERE LOWER(email) = :e");
    $exists->execute([':e' => $email]);
    if ($exists->fetchColumn()) { inviteFail(409, 'Someone with this email already has a Dibs account.'); return; }

    $recent = $pdo->prepare("SELECT COUNT(*) FROM client_invites WHERE created_by = :me AND created_at >= :since");
    $recent->execute([':me' => $me, ':since' => inviteNow(-86400)]);
    if ((int)$recent->fetchColumn() >= INVITE_MAX_PER_DAY) { inviteFail(429, 'Daily invite limit reached. Try again tomorrow.'); return; }

    // One live invite per email: a new one replaces any pending one.
    $pdo->prepare("UPDATE client_invites SET revoked_at = :now WHERE LOWER(email) = :e AND accepted_at IS NULL AND revoked_at IS NULL")
        ->execute([':now' => inviteNow(), ':e' => $email]);

    $token = bin2hex(random_bytes(32));
    $stmt = $pdo->prepare("INSERT INTO client_invites (token_hash, realtor_id, full_name, email, created_by, created_at, expires_at)
        VALUES (:h, :r, :n, :e, :by, :now, :exp)");
    $stmt->execute([':h' => hash('sha256', $token), ':r' => $realtorId, ':n' => $name, ':e' => $email, ':by' => $me,
        ':now' => inviteNow(), ':exp' => inviteNow(INVITE_DAYS * 86400)]);
    logEvent($pdo, 'auth', 'info', 'Client invite created', null, ['invite_id' => (int)$pdo->lastInsertId(), 'realtor_id' => $realtorId], $_SESSION['username'] ?? null);

    // The raw token is returned only here; the browser builds the link (join.html#t=...).
    echo json_encode(['success' => true, 'token' => $token, 'full_name' => $name, 'email' => $email,
        'expires_at' => gmdate('c', time() + INVITE_DAYS * 86400)]);
}

function handleListInvites(PDO $pdo) {
    requireRealtorOrAdmin();
    $sql = "SELECT i.id, i.full_name, i.email, i.created_at, i.expires_at, i.accepted_at, i.revoked_at,
            COALESCE(NULLIF(u.full_name, ''), u.username) AS agent_name
        FROM client_invites i LEFT JOIN users u ON u.id = i.realtor_id";
    $params = [];
    if (!inviteIsAdmin()) { $sql .= " WHERE i.realtor_id = :me OR i.created_by = :me"; $params[':me'] = (int)$_SESSION['user_id']; }
    $sql .= " ORDER BY i.id DESC LIMIT 100";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $rows = array_map(function ($i) {
        return ['id' => (int)$i['id'], 'full_name' => $i['full_name'], 'email' => $i['email'], 'agent_name' => $i['agent_name'],
            'status' => inviteStatus($i), 'created_at' => gmdate('c', strtotime($i['created_at'] . ' UTC')),
            'expires_at' => gmdate('c', strtotime($i['expires_at'] . ' UTC'))];
    }, $stmt->fetchAll(PDO::FETCH_ASSOC));
    echo json_encode(['success' => true, 'invites' => $rows]);
}

function handleRevokeInvite(PDO $pdo) {
    requireRealtorOrAdmin();
    $in = json_decode(dibsRequestBody(), true) ?: [];
    $sql = "UPDATE client_invites SET revoked_at = :now WHERE id = :id AND accepted_at IS NULL AND revoked_at IS NULL";
    $params = [':now' => inviteNow(), ':id' => (int)($in['id'] ?? 0)];
    if (!inviteIsAdmin()) { $sql .= " AND (realtor_id = :me OR created_by = :me)"; $params[':me'] = (int)$_SESSION['user_id']; }
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    if ($stmt->rowCount() !== 1) { inviteFail(404, 'That invite is not pending, or is not yours.'); return; }
    echo json_encode(['success' => true]);
}

// ------------------------------------------------------------------ public endpoints (join.html)

function handleCheckInvite(PDO $pdo) {
    if (!inviteRateOk($pdo)) return;
    [$inv, $reason] = inviteFind($pdo, $_GET['t'] ?? '');
    if (!$inv) { inviteFail(410, $reason); return; }
    echo json_encode(['success' => true, 'first_name' => explode(' ', $inv['full_name'])[0], 'agent_name' => $inv['agent_name'] ?: 'Your agent',
        'email_hint' => inviteMaskEmail($inv['email']), 'expires_at' => gmdate('c', strtotime($inv['expires_at'] . ' UTC'))]);
}

function handleAcceptInvite(PDO $pdo) {
    if (!inviteRateOk($pdo)) return;
    $in = json_decode(dibsRequestBody(), true) ?: [];
    [$inv, $reason] = inviteFind($pdo, $in['token'] ?? '');
    if (!$inv) { inviteFail(410, $reason); return; }

    $email = strtolower(trim((string)($in['email'] ?? '')));
    $username = strtolower(trim((string)($in['username'] ?? '')));
    $password = (string)($in['password'] ?? '');
    if (!hash_equals($inv['email'], $email)) { inviteFail(400, "That isn't the email this invite was sent to."); return; }
    if (!preg_match('/^[a-z0-9._-]{3,40}$/', $username)) { inviteFail(400, 'Usernames are 3 to 40 characters: letters, numbers, dots, dashes or underscores.'); return; }
    if (dibsIsReservedUsername($username)) { inviteFail(400, 'That username is reserved. Choose another.'); return; }
    if (strlen($password) < 10 || strlen($password) > 200) { inviteFail(400, 'Use a password of at least 10 characters.'); return; }
    if (strcasecmp($password, $username) === 0 || stripos($password, 'password') !== false) { inviteFail(400, 'Choose a password that is harder to guess.'); return; }

    $taken = $pdo->prepare("SELECT 1 FROM users WHERE LOWER(username) = :u");
    $taken->execute([':u' => $username]);
    if ($taken->fetchColumn()) { inviteFail(409, 'That username is taken. Try another.'); return; }

    try {
        $pdo->beginTransaction();
        // Claim the invite first: only one submission can win.
        $claim = $pdo->prepare("UPDATE client_invites SET accepted_at = :now WHERE id = :id AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at > :now");
        $claim->execute([':now' => inviteNow(), ':id' => $inv['id']]);
        if ($claim->rowCount() !== 1) { $pdo->rollBack(); inviteFail(410, 'This invite is no longer valid.'); return; }

        $ins = $pdo->prepare("INSERT INTO users (username, password_hash, is_admin, role, realtor_id, full_name, email)
            VALUES (:u, :h, 0, 'client', :r, :n, :e)");
        $ins->execute([':u' => $username, ':h' => password_hash($password, PASSWORD_BCRYPT), ':r' => $inv['realtor_id'],
            ':n' => $inv['full_name'], ':e' => $inv['email']]);
        $userId = (int)$pdo->lastInsertId();
        $pdo->prepare("UPDATE client_invites SET accepted_user_id = :u WHERE id = :id")->execute([':u' => $userId, ':id' => $inv['id']]);
        $pdo->commit();
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        logEvent($pdo, 'auth', 'error', 'Invite acceptance failed: ' . $e->getMessage());
        inviteFail(500, 'Something went wrong creating your account. Please try again.');
        return;
    }

    // Sign the new client in, the same way handleLogin does.
    session_regenerate_id(true);
    $_SESSION['user_id'] = $userId;
    $_SESSION['username'] = $username;
    $_SESSION['is_admin'] = 0;
    $_SESSION['role'] = 'client';
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
    $pdo->prepare("UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = :id")->execute([':id' => $userId]);
    logEvent($pdo, 'auth', 'info', 'Client joined from invite', null, ['invite_id' => (int)$inv['id'], 'user_id' => $userId], $username);

    if (!empty($inv['realtor_id'])) {
        createNotification($pdo, (int)$inv['realtor_id'], 'client_joined', 'Client joined Dibs',
            "{$inv['full_name']} accepted your invite and is now in your client roster.", '#realtor');
    }
    echo json_encode(['success' => true]);
}
