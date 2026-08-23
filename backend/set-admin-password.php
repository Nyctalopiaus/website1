<?php
/**
 * Command-Line Admin Password Management Utility
 * Usage: php backend/set-admin-password.php <new-password> [username]
 */

if (php_sapi_name() !== 'cli') {
    die("This utility can only be executed from the command line.\n");
}

require_once __DIR__ . '/admin-auth.php';

$newPassword = $argv[1] ?? null;
$username = $argv[2] ?? 'admin';

if (empty($newPassword)) {
    echo "Usage: php backend/set-admin-password.php <new-password> [username]\n";
    echo "Example: php backend/set-admin-password.php MyNewSecretPass123 admin\n";
    exit(1);
}

$res = updateAdminPassword($newPassword, $username);
if ($res['success']) {
    echo "✅ Success: Site admin password for '$username' updated successfully in " . ADMIN_USERS_DB . "\n";
    exit(0);
} else {
    echo "❌ Error: " . ($res['error'] ?? 'Failed to update password.') . "\n";
    exit(1);
}
