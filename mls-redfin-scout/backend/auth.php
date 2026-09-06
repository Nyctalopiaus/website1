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
        $isPrimaryAdmin = ($_SESSION['username'] ?? '') === 'admin';
        $role = $_SESSION['role'] ?? ($_SESSION['is_admin'] ? 'admin' : 'client');
        if (!$isPrimaryAdmin && empty($_SESSION['is_admin']) && $role !== 'admin') {
            http_response_code(403);
            echo json_encode(['error' => 'Forbidden. Admin privileges required.']);
            exit;
        }
    }
}

if (!function_exists('requireRealtorOrAdmin')) {
    function requireRealtorOrAdmin() {
        requireAuth();
        $isPrimaryAdmin = ($_SESSION['username'] ?? '') === 'admin';
        $role = $_SESSION['role'] ?? ($_SESSION['is_admin'] ? 'admin' : 'client');
        if (!$isPrimaryAdmin && empty($_SESSION['is_admin']) && $role !== 'admin' && $role !== 'realtor') {
            http_response_code(403);
            echo json_encode(['error' => 'Forbidden. Realtor or Admin privileges required.']);
            exit;
        }
    }
}

if (!function_exists('getUserInitials')) {
    function getUserInitials(string $username): string {
        $clean = preg_replace('/[^a-zA-Z0-9\s_]/', '', $username);
        $parts = preg_split('/[\s_]+/', trim($clean));
        if (count($parts) >= 2) {
            return strtoupper(substr($parts[0], 0, 1) . substr($parts[1], 0, 1));
        }
        if (strlen($clean) >= 2) {
            return strtoupper(substr($clean, 0, 2));
        }
        return strtoupper(substr($username, 0, 2) ?: 'US');
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

function handleCheckAuth(PDO $pdo) {
    if (empty($_SESSION['user_id'])) {
        echo json_encode(['authenticated' => false]);
        return;
    }
    $stmt = $pdo->prepare("SELECT id, username, full_name, email, phone, avatar_url, brokerage_name, role, is_admin, realtor_id, target_min_price, target_max_price, target_cities, target_beds, target_timeline, must_haves, deal_breakers, created_at, last_login FROM users WHERE id = :id LIMIT 1");
    $stmt->execute([':id' => $_SESSION['user_id']]);
    $user = $stmt->fetch();
    if (!$user) {
        $_SESSION = [];
        echo json_encode(['authenticated' => false]);
        return;
    }
    $userRole = ($user['username'] === 'admin') ? 'admin' : ($user['role'] ?? ($_SESSION['is_admin'] ? 'admin' : 'client'));
    $isAdmin = ($user['username'] === 'admin') ? 1 : (int)($user['is_admin'] ?? 0);

    $realtorName = null;
    $realtorAvatar = null;
    $realtorBrokerage = null;
    if ($user['realtor_id']) {
        $rStmt = $pdo->prepare("SELECT username, full_name, avatar_url, brokerage_name FROM users WHERE id = :id LIMIT 1");
        $rStmt->execute([':id' => $user['realtor_id']]);
        $rUser = $rStmt->fetch();
        if ($rUser) {
            $realtorName = !empty($rUser['full_name']) ? $rUser['full_name'] : $rUser['username'];
            $realtorAvatar = $rUser['avatar_url'] ?? '';
            $realtorBrokerage = $rUser['brokerage_name'] ?? '';
        }
    }

    $assignedClients = [];
    if ($userRole === 'realtor') {
        $cStmt = $pdo->prepare("SELECT id, username, COALESCE(full_name, '') as full_name, COALESCE(email, '') as email, COALESCE(avatar_url, '') as avatar_url FROM users WHERE realtor_id = :realtor_id ORDER BY id ASC");
        $cStmt->execute([':realtor_id' => $user['id']]);
        $assignedClients = $cStmt->fetchAll();
    }

    $displayName = !empty($user['full_name']) ? $user['full_name'] : $user['username'];

    echo json_encode([
        'authenticated' => true,
        'user_id' => (int)$user['id'],
        'username' => $user['username'],
        'full_name' => $user['full_name'] ?? '',
        'email' => $user['email'] ?? '',
        'phone' => $user['phone'] ?? '',
        'avatar_url' => $user['avatar_url'] ?? '',
        'brokerage_name' => $user['brokerage_name'] ?? '',
        'role' => $userRole,
        'is_admin' => $isAdmin,
        'realtor_id' => $user['realtor_id'] ? (int)$user['realtor_id'] : null,
        'realtor_name' => $realtorName,
        'realtor_avatar' => $realtorAvatar,
        'realtor_brokerage' => $realtorBrokerage,
        'target_min_price' => $user['target_min_price'],
        'target_max_price' => $user['target_max_price'],
        'target_cities' => $user['target_cities'] ?? '',
        'target_beds' => $user['target_beds'],
        'target_timeline' => $user['target_timeline'] ?? '',
        'must_haves' => $user['must_haves'] ?? '',
        'deal_breakers' => $user['deal_breakers'] ?? '',
        'assigned_clients' => $assignedClients,
        'created_at' => $user['created_at'],
        'last_login' => $user['last_login'],
        'initials' => getUserInitials($displayName),
        'csrf_token' => $_SESSION['csrf_token'] ?? ''
    ]);
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
    $_SESSION['is_admin'] = ($user['username'] === 'admin') ? 1 : (int)($user['is_admin'] ?? 0);
    $userRole = ($user['username'] === 'admin') ? 'admin' : ($user['role'] ?? ($_SESSION['is_admin'] ? 'admin' : 'client'));
    $_SESSION['role'] = $userRole;
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));

    $updateStmt = $pdo->prepare("UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = :id");
    $updateStmt->execute([':id' => $user['id']]);

    logLoginAttempt($pdo, $username, true, 'Authentication successful');

    $realtorName = null;
    if ($user['realtor_id']) {
        $rStmt = $pdo->prepare("SELECT username, full_name FROM users WHERE id = :id LIMIT 1");
        $rStmt->execute([':id' => $user['realtor_id']]);
        $rUser = $rStmt->fetch();
        if ($rUser) {
            $realtorName = !empty($rUser['full_name']) ? $rUser['full_name'] : $rUser['username'];
        }
    }

    $assignedClients = [];
    if ($userRole === 'realtor') {
        $cStmt = $pdo->prepare("SELECT id, username, COALESCE(full_name, '') as full_name, COALESCE(email, '') as email FROM users WHERE realtor_id = :realtor_id ORDER BY id ASC");
        $cStmt->execute([':realtor_id' => $user['id']]);
        $assignedClients = $cStmt->fetchAll();
    }

    $displayName = !empty($user['full_name']) ? $user['full_name'] : $user['username'];

    echo json_encode([
        'success' => true,
        'user_id' => (int)$user['id'],
        'username' => $user['username'],
        'full_name' => $user['full_name'] ?? '',
        'email' => $user['email'] ?? '',
        'phone' => $user['phone'] ?? '',
        'role' => $userRole,
        'is_admin' => $_SESSION['is_admin'],
        'realtor_id' => $user['realtor_id'] ? (int)$user['realtor_id'] : null,
        'realtor_name' => $realtorName,
        'target_min_price' => $user['target_min_price'],
        'target_max_price' => $user['target_max_price'],
        'target_cities' => $user['target_cities'] ?? '',
        'target_beds' => $user['target_beds'],
        'target_timeline' => $user['target_timeline'] ?? '',
        'must_haves' => $user['must_haves'] ?? '',
        'deal_breakers' => $user['deal_breakers'] ?? '',
        'assigned_clients' => $assignedClients,
        'created_at' => $user['created_at'],
        'last_login' => date('Y-m-d H:i:s'),
        'initials' => getUserInitials($displayName),
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

function handleCreateScrapeToken(PDO $pdo) {
    $token = bin2hex(random_bytes(32));
    $tokenHash = hash('sha256', $token);
    $userId = (int)$_SESSION['user_id'];

    $pdo->prepare('DELETE FROM scrape_tokens WHERE expires_at <= CURRENT_TIMESTAMP OR user_id = :user_id')
        ->execute([':user_id' => $userId]);
    $stmt = $pdo->prepare("INSERT INTO scrape_tokens (token_hash, user_id, expires_at) VALUES (:token_hash, :user_id, datetime('now', '+30 days'))");
    $stmt->execute([':token_hash' => $tokenHash, ':user_id' => $userId]);

    echo json_encode(['success' => true, 'token' => $token, 'expires_in_days' => 30]);
}

function handleListUsers(PDO $pdo) {
    requireRealtorOrAdmin();
    $isAdmin = !empty($_SESSION['is_admin']) || ($_SESSION['role'] ?? '') === 'admin';
    if ($isAdmin) {
        $stmt = $pdo->query("SELECT id, username, COALESCE(full_name, '') as full_name, COALESCE(email, '') as email, COALESCE(phone, '') as phone, created_at, last_login, COALESCE(is_admin, 0) as is_admin, COALESCE(role, 'client') as role, realtor_id FROM users ORDER BY id ASC");
        $users = $stmt->fetchAll();
    } else {
        $stmt = $pdo->prepare("SELECT id, username, COALESCE(full_name, '') as full_name, COALESCE(email, '') as email, COALESCE(phone, '') as phone, created_at, last_login, COALESCE(is_admin, 0) as is_admin, COALESCE(role, 'client') as role, realtor_id FROM users WHERE id = :realtor_id OR (role = 'client' AND realtor_id = :realtor_id) ORDER BY id ASC");
        $stmt->execute([':realtor_id' => (int)$_SESSION['user_id']]);
        $users = $stmt->fetchAll();
    }
    foreach ($users as &$u) {
        $u['is_admin'] = ($u['username'] === 'admin') ? 1 : (int)$u['is_admin'];
        if ($u['username'] === 'admin') $u['role'] = 'admin';
        $u['initials'] = getUserInitials($u['full_name'] ?: $u['username']);
    }
    echo json_encode(['success' => true, 'users' => $users]);
}

function handleCreateUser(PDO $pdo) {
    requireRealtorOrAdmin();
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

    if (strlen($password) < 8) {
        http_response_code(400);
        echo json_encode(['error' => 'Password must be at least 8 characters long.']);
        return;
    }

    $checkStmt = $pdo->prepare("SELECT COUNT(*) FROM users WHERE username = :username");
    $checkStmt->execute([':username' => $username]);
    if ((int)$checkStmt->fetchColumn() > 0) {
        http_response_code(400);
        echo json_encode(['error' => 'User with this username already exists.']);
        return;
    }

    $role = trim((string)($input['role'] ?? 'client'));
    if (!in_array($role, ['admin', 'realtor', 'client'], true)) {
        $role = 'client';
    }
    $currentUserId = (int)$_SESSION['user_id'];
    $isCurrentAdmin = !empty($_SESSION['is_admin']) || ($_SESSION['role'] ?? '') === 'admin';
    if (!$isCurrentAdmin) {
        if ($role !== 'client') {
            http_response_code(403);
            echo json_encode(['error' => 'Realtors can create client accounts only.']);
            return;
        }
        $requestedRealtorId = !empty($input['realtor_id']) ? (int)$input['realtor_id'] : $currentUserId;
        if ($requestedRealtorId !== $currentUserId) {
            http_response_code(403);
            echo json_encode(['error' => 'Realtors can assign new clients only to themselves.']);
            return;
        }
        $realtorId = $currentUserId;
    } else {
        $realtorId = !empty($input['realtor_id']) ? (int)$input['realtor_id'] : null;
    }
    $isAdmin = $isCurrentAdmin && ($role === 'admin' || !empty($input['is_admin'])) ? 1 : 0;

    $hash = password_hash($password, PASSWORD_BCRYPT);
    $stmt = $pdo->prepare("INSERT INTO users (username, password_hash, is_admin, role, realtor_id) VALUES (:username, :hash, :is_admin, :role, :realtor_id)");
    $stmt->execute([':username' => $username, ':hash' => $hash, ':is_admin' => $isAdmin, ':role' => $role, ':realtor_id' => $realtorId]);
    logEvent($pdo, 'system', 'info', 'User account created', null, ['username' => $username, 'role' => $role, 'realtor_id' => $realtorId]);

    echo json_encode([
        'success' => true,
        'user_id' => $pdo->lastInsertId(),
        'username' => $username,
        'role' => $role,
        'is_admin' => $isAdmin,
        'realtor_id' => $realtorId
    ]);
}

function handleUpdateUserRole(PDO $pdo) {
    requireAdmin();
    requireCsrf();
    $input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
    $targetUserId = (int)($input['user_id'] ?? 0);
    $role = trim((string)($input['role'] ?? ''));

    if ($targetUserId <= 0) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid user ID specified.']);
        return;
    }

    $stmtCheck = $pdo->prepare("SELECT username, role FROM users WHERE id = :id LIMIT 1");
    $stmtCheck->execute([':id' => $targetUserId]);
    $user = $stmtCheck->fetch();

    if (!$user) {
        http_response_code(404);
        echo json_encode(['error' => 'Target user not found.']);
        return;
    }

    if ($user['username'] === 'admin') {
        http_response_code(400);
        echo json_encode(['error' => 'The primary admin account\'s role cannot be changed.']);
        return;
    }

    if ($role && !in_array($role, ['admin', 'realtor', 'client'], true)) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid role specified. Must be admin, realtor, or client.']);
        return;
    }

    if (!$role) {
        $role = !empty($input['is_admin']) ? 'admin' : 'client';
    }

    $isAdmin = ($role === 'admin') ? 1 : 0;
    $realtorId = isset($input['realtor_id']) ? ($input['realtor_id'] ? (int)$input['realtor_id'] : null) : null;

    if ($targetUserId === (int)$_SESSION['user_id'] && $role !== 'admin') {
        http_response_code(400);
        echo json_encode(['error' => 'You cannot demote your own admin access.']);
        return;
    }

    if ($realtorId !== null) {
        $stmt = $pdo->prepare("UPDATE users SET is_admin = :is_admin, role = :role, realtor_id = :realtor_id WHERE id = :id");
        $stmt->execute([':is_admin' => $isAdmin, ':role' => $role, ':realtor_id' => $realtorId, ':id' => $targetUserId]);
    } else {
        $stmt = $pdo->prepare("UPDATE users SET is_admin = :is_admin, role = :role WHERE id = :id");
        $stmt->execute([':is_admin' => $isAdmin, ':role' => $role, ':id' => $targetUserId]);
    }

    logEvent($pdo, 'system', 'info', 'User role or assignment updated', null, ['username' => $user['username'], 'role' => $role, 'realtor_id' => $realtorId]);

    echo json_encode(['success' => true, 'user_id' => $targetUserId, 'role' => $role, 'is_admin' => $isAdmin]);
}

function handleUpdateProfile(PDO $pdo) {
    requireAuth();
    requireCsrf();
    $input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
    $userId = (int)$_SESSION['user_id'];

    $fullName = trim((string)($input['full_name'] ?? ''));
    $email = trim((string)($input['email'] ?? ''));
    $phone = trim((string)($input['phone'] ?? ''));
    $avatarUrl = trim((string)($input['avatar_url'] ?? ''));
    $brokerageName = trim((string)($input['brokerage_name'] ?? ''));
    $targetMinPrice = isset($input['target_min_price']) && $input['target_min_price'] !== '' ? (float)$input['target_min_price'] : null;
    $targetMaxPrice = isset($input['target_max_price']) && $input['target_max_price'] !== '' ? (float)$input['target_max_price'] : null;
    $targetCities = trim((string)($input['target_cities'] ?? ''));
    $targetBeds = isset($input['target_beds']) && $input['target_beds'] !== '' ? (int)$input['target_beds'] : null;
    $targetTimeline = trim((string)($input['target_timeline'] ?? ''));
    $mustHaves = trim((string)($input['must_haves'] ?? ''));
    $dealBreakers = trim((string)($input['deal_breakers'] ?? ''));

    // Input sanitization & bounds checking
    if (strlen($fullName) > 100) {
        http_response_code(400);
        echo json_encode(['error' => 'Full name cannot exceed 100 characters.']);
        return;
    }

    if (!empty($email)) {
        if (strlen($email) > 255 || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            http_response_code(400);
            echo json_encode(['error' => 'Please enter a valid email address.']);
            return;
        }
    }

    if (strlen($phone) > 30) {
        http_response_code(400);
        echo json_encode(['error' => 'Phone number cannot exceed 30 characters.']);
        return;
    }

    if (strlen($avatarUrl) > 1000) {
        http_response_code(400);
        echo json_encode(['error' => 'Avatar URL cannot exceed 1000 characters.']);
        return;
    }

    if (strlen($brokerageName) > 150) {
        http_response_code(400);
        echo json_encode(['error' => 'Brokerage name cannot exceed 150 characters.']);
        return;
    }
    if ($targetMinPrice !== null && ($targetMinPrice < 0 || $targetMinPrice > 100000000) || $targetMaxPrice !== null && ($targetMaxPrice < 0 || $targetMaxPrice > 100000000) || $targetMinPrice !== null && $targetMaxPrice !== null && $targetMinPrice > $targetMaxPrice) {
        http_response_code(400);
        echo json_encode(['error' => 'Enter a valid price range.']);
        return;
    }
    if (strlen($targetCities) > 500 || strlen($targetTimeline) > 100 || strlen($mustHaves) > 2000 || strlen($dealBreakers) > 2000 || $targetBeds !== null && ($targetBeds < 0 || $targetBeds > 20)) {
        http_response_code(400);
        echo json_encode(['error' => 'Enter valid search preferences.']);
        return;
    }

    $stmt = $pdo->prepare("UPDATE users SET full_name = :full_name, email = :email, phone = :phone, avatar_url = :avatar_url, brokerage_name = :brokerage_name WHERE id = :id");
    $stmt->execute([
        ':full_name' => $fullName,
        ':email' => $email,
        ':phone' => $phone,
        ':avatar_url' => $avatarUrl,
        ':brokerage_name' => $brokerageName,
        ':id' => $userId
    ]);

    if (($_SESSION['role'] ?? 'client') === 'client') {
        $prefsStmt = $pdo->prepare('UPDATE users SET target_min_price = :min_price, target_max_price = :max_price, target_cities = :cities, target_beds = :beds, target_timeline = :timeline, must_haves = :must_haves, deal_breakers = :deal_breakers WHERE id = :id');
        $prefsStmt->execute([':min_price' => $targetMinPrice, ':max_price' => $targetMaxPrice, ':cities' => $targetCities, ':beds' => $targetBeds, ':timeline' => $targetTimeline, ':must_haves' => $mustHaves, ':deal_breakers' => $dealBreakers, ':id' => $userId]);
    }

    logEvent($pdo, 'system', 'info', "User profile updated for '{$_SESSION['username']}'");

    $displayName = $fullName ?: $_SESSION['username'];

    echo json_encode([
        'success' => true,
        'full_name' => $fullName,
        'email' => $email,
        'phone' => $phone,
        'avatar_url' => $avatarUrl,
        'brokerage_name' => $brokerageName,
        'target_min_price' => $targetMinPrice,
        'target_max_price' => $targetMaxPrice,
        'target_cities' => $targetCities,
        'target_beds' => $targetBeds,
        'target_timeline' => $targetTimeline,
        'must_haves' => $mustHaves,
        'deal_breakers' => $dealBreakers,
        'initials' => getUserInitials($displayName)
    ]);
}

function handleChangePassword(PDO $pdo) {
    requireAuth();
    requireCsrf();
    $input = json_decode(file_get_contents('php://input'), true) ?? $_POST;

    // Non-admin users are strictly forced to target only their own session user ID
    $isSelf = !isset($input['user_id']) || ((int)$input['user_id'] === (int)$_SESSION['user_id']);

    if (!$isSelf) {
        requireAdmin();
        $targetUserId = (int)$input['user_id'];
    } else {
        $targetUserId = (int)$_SESSION['user_id'];
    }

    $currentPassword = (string)($input['current_password'] ?? '');
    $newPassword = (string)($input['new_password'] ?? '');

    // For self-service password changes, verify current password if provided or required
    if ($isSelf && empty($input['admin_override'])) {
        if (empty($currentPassword)) {
            http_response_code(400);
            echo json_encode(['error' => 'Current password is required to update your password.']);
            return;
        }

        $stmtUser = $pdo->prepare("SELECT password_hash FROM users WHERE id = :id LIMIT 1");
        $stmtUser->execute([':id' => $targetUserId]);
        $user = $stmtUser->fetch();

        if (!$user || !password_verify($currentPassword, $user['password_hash'])) {
            http_response_code(401);
            echo json_encode(['error' => 'Current password is incorrect.']);
            return;
        }
    }

    if (empty($newPassword) || strlen($newPassword) < 8) {
        http_response_code(400);
        echo json_encode(['error' => 'New password must be at least 8 characters long.']);
        return;
    }

    $hash = password_hash($newPassword, PASSWORD_BCRYPT);
    $stmt = $pdo->prepare("UPDATE users SET password_hash = :hash WHERE id = :id");
    $stmt->execute([':hash' => $hash, ':id' => $targetUserId]);

    logEvent($pdo, 'system', 'info', "Password updated for user ID #{$targetUserId} by '{$_SESSION['username']}'");

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
    if ($source === 'login') {
        $stmt = $pdo->query("SELECT id, timestamp, 'login' AS source, status AS level, '' AS mls_id, (username || ' - ' || reason || ' (IP: ' || ip_address || ')') AS message, user_agent AS context_json, username FROM login_attempts ORDER BY id DESC LIMIT 200");
    } else if ($source !== '' && in_array($source, ['sync', 'scrape', 'client', 'system'], true)) {
        $stmt = $pdo->prepare("SELECT id, timestamp, source, level, mls_id, message, context_json, username FROM event_log WHERE source = :source ORDER BY id DESC LIMIT 200");
        $stmt->execute([':source' => $source]);
    } else {
        $stmt = $pdo->query("
            SELECT id, timestamp, source, level, mls_id, message, context_json, username FROM (
                SELECT id, timestamp, source, level, mls_id, message, context_json, username FROM event_log
                UNION ALL
                SELECT id, timestamp, 'login' AS source, status AS level, '' AS mls_id, (username || ' - ' || reason || ' (IP: ' || ip_address || ')') AS message, user_agent AS context_json, username FROM login_attempts
            ) ORDER BY timestamp DESC LIMIT 200
        ");
    }
    $logs = $stmt->fetchAll();
    echo json_encode(['success' => true, 'logs' => $logs]);
}
