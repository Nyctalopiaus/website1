<?php
/**
 * MLS & Redfin Property Scout - Auth & User Administration
 * CSRF/session guards, login/logout, and user CRUD (list/create/change-password/delete),
 * plus login-attempt logging. Requires backend/bootstrap.php to already be included
 * (uses $pdo and $_SESSION set up there).
 */

if (!function_exists('verifyCsrfToken')) {
    function verifyCsrfToken(): bool {
        $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? $_POST['csrf_token'] ?? '';
        if (empty($token) || empty($_SESSION['csrf_token'])) {
            return false;
        }
        return hash_equals($_SESSION['csrf_token'], $token);
    }
}

if (!function_exists('requireAuth')) {
    function requireAuth() {
        if (empty($_SESSION['user_id'])) {
            http_response_code(401);
            echo json_encode(['error' => 'Unauthenticated access. Please log in.']);
            exit;
        }
    }
}

if (!function_exists('requireAdmin')) {
    function requireAdmin() {
        requireAuth();
        if (($_SESSION['username'] ?? '') !== 'admin') {
            http_response_code(403);
            echo json_encode(['error' => 'Forbidden. Admin privileges required.']);
            exit;
        }
    }
}

if (!function_exists('requireCsrf')) {
    function requireCsrf() {
        if (!verifyCsrfToken()) {
            http_response_code(403);
            echo json_encode(['error' => 'Security token validation failed (CSRF mismatch).']);
            exit;
        }
    }
}

function logLoginAttempt(PDO $pdo, string $username, bool $success, string $reason = '') {
    $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
    $ua = $_SERVER['HTTP_USER_AGENT'] ?? 'Unknown';
    $timestamp = date('Y-m-d H:i:s');
    $statusStr = $success ? 'SUCCESS' : 'FAILURE';

    // 1. Insert into SQLite login_attempts table
    try {
        $stmt = $pdo->prepare("INSERT INTO login_attempts (username, status, reason, ip_address, user_agent, timestamp) VALUES (:username, :status, :reason, :ip, :ua, CURRENT_TIMESTAMP)");
        $stmt->execute([
            ':username' => $username ?: '(empty)',
            ':status' => $statusStr,
            ':reason' => $reason,
            ':ip' => $ip,
            ':ua' => $ua
        ]);
    } catch (Exception $e) {}

    // 2. Append to data/login_attempts.log file
    $logDir = __DIR__ . '/../data';
    if (!is_dir($logDir)) {
        @mkdir($logDir, 0755, true);
    }
    $logFile = $logDir . '/login_attempts.log';
    $logLine = sprintf("[%s] [%s] User: '%s' | IP: %s | Reason: %s | UA: %s\n",
        $timestamp,
        $statusStr,
        $username ?: '(empty)',
        $ip,
        $reason ?: 'Authentication Verified',
        $ua
    );
    @file_put_contents($logFile, $logLine, FILE_APPEND | LOCK_EX);
}

function handleLogin(PDO $pdo) {
    $input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
    $username = trim((string)($input['username'] ?? ''));
    $password = (string)($input['password'] ?? '');

    if (empty($username) || empty($password)) {
        logLoginAttempt($pdo, $username, false, 'Missing username or password fields');
        http_response_code(400);
        echo json_encode(['error' => 'Username and password are required.']);
        return;
    }

    $stmt = $pdo->prepare("SELECT * FROM users WHERE username = :username LIMIT 1");
    $stmt->execute([':username' => $username]);
    $user = $stmt->fetch();

    if (!$user) {
        logLoginAttempt($pdo, $username, false, 'Username not found in database');
        http_response_code(401);
        echo json_encode(['error' => 'Invalid username or password.']);
        return;
    }

    if (!password_verify($password, $user['password_hash'])) {
        logLoginAttempt($pdo, $username, false, 'Password mismatch');
        http_response_code(401);
        echo json_encode(['error' => 'Invalid username or password.']);
        return;
    }

    // Success
    session_regenerate_id(true);
    $_SESSION['user_id'] = $user['id'];
    $_SESSION['username'] = $user['username'];
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));

    $updateStmt = $pdo->prepare("UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = :id");
    $updateStmt->execute([':id' => $user['id']]);

    logLoginAttempt($pdo, $username, true, 'Authentication successful');

    echo json_encode([
        'success' => true,
        'username' => $user['username'],
        'csrf_token' => $_SESSION['csrf_token']
    ]);
}

function handleLogout() {
    $_SESSION = [];
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_destroy();
    }
    echo json_encode(['success' => true]);
}

function handleListUsers(PDO $pdo) {
    requireAdmin();
    $stmt = $pdo->query("SELECT id, username, created_at, last_login FROM users ORDER BY id ASC");
    $users = $stmt->fetchAll();
    echo json_encode(['success' => true, 'users' => $users]);
}

function handleCreateUser(PDO $pdo) {
    requireAdmin();
    requireCsrf();
    $input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
    $username = trim((string)($input['username'] ?? ''));
    $password = (string)($input['password'] ?? '');

    if (empty($username) || empty($password)) {
        http_response_code(400);
        echo json_encode(['error' => 'Username and password are required.']);
        return;
    }

    if (strlen($username) < 3) {
        http_response_code(400);
        echo json_encode(['error' => 'Username must be at least 3 characters long.']);
        return;
    }

    $checkStmt = $pdo->prepare("SELECT COUNT(*) FROM users WHERE username = :username");
    $checkStmt->execute([':username' => $username]);
    if ((int)$checkStmt->fetchColumn() > 0) {
        http_response_code(400);
        echo json_encode(['error' => 'User with this username already exists.']);
        return;
    }

    $hash = password_hash($password, PASSWORD_BCRYPT);
    $stmt = $pdo->prepare("INSERT INTO users (username, password_hash) VALUES (:username, :hash)");
    $stmt->execute([':username' => $username, ':hash' => $hash]);

    echo json_encode(['success' => true, 'user_id' => $pdo->lastInsertId(), 'username' => $username]);
}

function handleChangePassword(PDO $pdo) {
    requireAuth();
    requireCsrf();
    $input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
    $targetUserId = (int)($input['user_id'] ?? $_SESSION['user_id']);
    $newPassword = (string)($input['new_password'] ?? '');

    if ($targetUserId !== (int)$_SESSION['user_id']) {
        requireAdmin();
    }

    if (empty($newPassword) || strlen($newPassword) < 4) {
        http_response_code(400);
        echo json_encode(['error' => 'Password must be at least 4 characters long.']);
        return;
    }

    $hash = password_hash($newPassword, PASSWORD_BCRYPT);
    $stmt = $pdo->prepare("UPDATE users SET password_hash = :hash WHERE id = :id");
    $stmt->execute([':hash' => $hash, ':id' => $targetUserId]);

    echo json_encode(['success' => true]);
}

function handleDeleteUser(PDO $pdo) {
    requireAdmin();
    requireCsrf();
    $input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
    $targetUserId = (int)($input['user_id'] ?? 0);

    if ($targetUserId <= 0) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid user ID specified.']);
        return;
    }

    $stmtCheck = $pdo->prepare("SELECT username FROM users WHERE id = :id LIMIT 1");
    $stmtCheck->execute([':id' => $targetUserId]);
    $user = $stmtCheck->fetch();

    if (!$user) {
        http_response_code(404);
        echo json_encode(['error' => 'Target user not found.']);
        return;
    }

    if ($user['username'] === 'admin') {
        http_response_code(400);
        echo json_encode(['error' => 'Primary admin account cannot be deleted.']);
        return;
    }

    $stmtDel = $pdo->prepare("DELETE FROM users WHERE id = :id");
    $stmtDel->execute([':id' => $targetUserId]);

    echo json_encode(['success' => true]);
}

function handleViewLoginLogs(PDO $pdo) {
    requireAdmin();
    $stmt = $pdo->query("SELECT id, username, status, reason, ip_address, user_agent, timestamp FROM login_attempts ORDER BY id DESC LIMIT 100");
    $logs = $stmt->fetchAll();
    echo json_encode(['success' => true, 'logs' => $logs]);
}

/**
 * Views the general event_log (sync/scrape/client/system) — the counterpart to
 * handleViewLoginLogs above, which only ever covered auth. Optional ?source= filter so Josh can
 * pull just 'scrape' (bookmarklet) events, for example, instead of everything.
 */
function handleViewEventLog(PDO $pdo) {
    requireAdmin();
    $source = $_GET['source'] ?? '';
    if ($source !== '' && in_array($source, ['sync', 'scrape', 'client', 'system'], true)) {
        $stmt = $pdo->prepare("SELECT id, timestamp, source, level, mls_id, message, context_json FROM event_log WHERE source = :source ORDER BY id DESC LIMIT 200");
        $stmt->execute([':source' => $source]);
    } else {
        $stmt = $pdo->query("SELECT id, timestamp, source, level, mls_id, message, context_json FROM event_log ORDER BY id DESC LIMIT 200");
    }
    $logs = $stmt->fetchAll();
    echo json_encode(['success' => true, 'logs' => $logs]);
}
