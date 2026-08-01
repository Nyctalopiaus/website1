<?php
/**
 * Admin Review Panel & Live Show Rule Manager
 * Enterprise Security Edition (BCRYPT + CSRF + Session Hardening)
 */

if (session_status() === PHP_SESSION_NONE) {
    ini_set('session.cookie_httponly', 1);
    session_start();
}

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';

// Generate CSRF token if not set
if (empty($_SESSION['csrf_token'])) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}

function logAdminSecurityEvent($eventType, $details = '') {
    $ip = $_SERVER['HTTP_CF_CONNECTING_IP'] ?? $_SERVER['HTTP_X_FORWARDED_FOR'] ?? $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
    if (strpos($ip, ',') !== false) {
        $ip = trim(explode(',', $ip)[0]);
    }
    $ua = $_SERVER['HTTP_USER_AGENT'] ?? 'Unknown';
    $entry = sprintf("[%s] [%s] IP: %s | %s | UA: %s\n", date('Y-m-d H:i:s'), $eventType, $ip, $details, $ua);

    $baseDir = __DIR__;
    $targetFiles = [
        $baseDir . '/cache/security_audit.log',
        $baseDir . '/logs/security_audit.log'
    ];
    foreach ($targetFiles as $file) {
        $dir = dirname($file);
        if (!is_dir($dir)) {
            @mkdir($dir, 0755, true);
        }
        @file_put_contents($file, $entry, FILE_APPEND | LOCK_EX);
    }
}

$loginError = '';

// Handle Admin Login POST
if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['admin_action']) && $_POST['admin_action'] === 'login') {
    $username = trim((string)($_POST['username'] ?? ''));
    $submittedToken = $_POST['csrf_token'] ?? '';
    if (!hash_equals($_SESSION['csrf_token'], $submittedToken)) {
        $loginError = 'Security token validation failed.';
        logAdminSecurityEvent('FAILED_LOGIN_CSRF', 'CSRF token mismatch for username: ' . $username);
    } else {
        $password = (string)($_POST['password'] ?? '');

        // Rate limiting check (max 5 failed attempts per 15 mins)
        $failedAttempts = $_SESSION['admin_login_fails'] ?? 0;
        $lastFailTime = $_SESSION['admin_last_fail_time'] ?? 0;
        if ($failedAttempts >= 5 && (time() - $lastFailTime) < 900) {
            $loginError = 'Too many failed login attempts. Please wait 15 minutes.';
            logAdminSecurityEvent('FAILED_LOGIN_RATE_LIMITED', 'Rate limit blocked attempt for username: ' . $username);
        } else {
            $db = getDbConnection();
            $stmt = $db->prepare("SELECT * FROM admin_users WHERE username = :user LIMIT 1");
            $stmt->execute([':user' => $username]);
            $adminUser = $stmt->fetch();

            if ($adminUser && password_verify($password, $adminUser['password_hash'])) {
                session_regenerate_id(true);
                $_SESSION['is_admin'] = true;
                $_SESSION['admin_user'] = $adminUser['username'];
                $_SESSION['admin_login_fails'] = 0;
                $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
                logAdminSecurityEvent('SUCCESSFUL_LOGIN', 'Admin authenticated: ' . $adminUser['username']);
                header("Location: admin.php");
                exit;
            } else {
                $_SESSION['admin_login_fails'] = ($failedAttempts + 1);
                $_SESSION['admin_last_fail_time'] = time();
                $loginError = 'Invalid admin credentials.';
                logAdminSecurityEvent('FAILED_LOGIN_INVALID_CREDENTIALS', 'Invalid password attempt for username: ' . $username);
            }
        }
    }
}

// Handle Logout
if (isset($_GET['action']) && $_GET['action'] === 'logout') {
    unset($_SESSION['is_admin'], $_SESSION['admin_user']);
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_destroy();
    }
    header("Location: index.php");
    exit;
}

// Render Login Page if not authenticated
if (empty($_SESSION['is_admin'])) {
    ?>
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Admin Login // Nycto's Gig Grid</title>
        <link rel="stylesheet" href="styles.css" />
        <style>
            body { display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #0a0b0d; color: #f0f0f0; font-family: 'Inter', sans-serif; margin: 0; }
            .login-card { background: #14161a; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; padding: 2.5rem; width: 100%; max-width: 400px; box-shadow: 0 20px 50px rgba(0,0,0,0.8); text-align: center; }
            .login-title { font-size: 1.5rem; font-weight: 700; margin-bottom: 0.5rem; color: var(--accent-orange, #ff5500); }
            .login-subtitle { font-size: 0.85rem; color: #a0a0a0; margin-bottom: 1.5rem; }
            .form-group { margin-bottom: 1.25rem; text-align: left; }
            .form-group label { display: block; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.05em; color: #888; margin-bottom: 0.4rem; }
            .form-group input { width: 100%; padding: 0.75rem; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 6px; color: #fff; box-sizing: border-box; outline: none; }
            .form-group input:focus { border-color: var(--accent-orange, #ff5500); }
            .btn-login { width: 100%; padding: 0.85rem; background: var(--accent-orange, #ff5500); border: none; border-radius: 6px; color: #fff; font-weight: 700; cursor: pointer; font-size: 0.95rem; margin-top: 0.5rem; }
            .btn-login:hover { opacity: 0.9; }
            .error-banner { background: rgba(255, 68, 68, 0.15); border: 1px solid rgba(255, 68, 68, 0.4); color: #ff6b6b; padding: 0.75rem; border-radius: 6px; font-size: 0.85rem; margin-bottom: 1.25rem; }
        </style>
    </head>
    <body>
        <div class="login-card">
            <div class="login-title">🔐 Admin Authentication</div>
            <div class="login-subtitle">Nycto's Gig Grid Live Show Management</div>
            <?php if (!empty($loginError)): ?>
                <div class="error-banner"><?php echo htmlspecialchars($loginError); ?></div>
            <?php endif; ?>
            <form method="POST" action="admin.php?key=nycto">
                <input type="hidden" name="admin_action" value="login" />
                <input type="hidden" name="csrf_token" value="<?php echo htmlspecialchars($_SESSION['csrf_token']); ?>" />
                <div class="form-group">
                    <label for="username">Username</label>
                    <input type="text" id="username" name="username" required autofocus autocomplete="username" />
                </div>
                <div class="form-group">
                    <label for="password">Password</label>
                    <input type="password" id="password" name="password" required autocomplete="current-password" />
                </div>
                <button type="submit" class="btn-login">Verify Credentials 🚀</button>
            </form>
        </div>
    </body>
    </html>
    <?php
    exit;
}

// Authenticated Admin Execution
$isAdmin = true;
$adminCsrfToken = htmlspecialchars($_SESSION['csrf_token'] ?? '');
require __DIR__ . '/index.php';
?>
<meta name="csrf-token" content="<?php echo $adminCsrfToken; ?>" />
<script type="module" src="assets/js/admin.js?v=<?php echo filemtime(__DIR__ . '/assets/js/admin.js'); ?>"></script>
