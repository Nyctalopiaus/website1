<?php
/**
 * MLS & Redfin Property Scout - Backend API Router
 * Handles SQLite persistence for scraped MLS listings, Redfin enrichment, notes, tags, and favorites.
 * Bootstraps the DB/session (bootstrap.php), loads auth/user-admin handlers (auth.php) and the
 * property data pipeline (properties.php), then dispatches on $action. Public endpoint and
 * action names are unchanged from before the split.
 */
require_once __DIR__ . '/bootstrap.php';
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/properties.php';

$action = $_GET['action'] ?? $_POST['action'] ?? 'list';

switch ($action) {
    case 'check_auth':
        echo json_encode([
            'authenticated' => !empty($_SESSION['user_id']),
            'username' => $_SESSION['username'] ?? null,
            'csrf_token' => $_SESSION['csrf_token'] ?? ''
        ]);
        break;

    case 'login':
        handleLogin($pdo);
        break;

    case 'logout':
        handleLogout();
        break;

    case 'list_users':
        handleListUsers($pdo);
        break;

    case 'create_user':
        handleCreateUser($pdo);
        break;

    case 'change_password':
        handleChangePassword($pdo);
        break;

    case 'delete_user':
        handleDeleteUser($pdo);
        break;

    case 'view_login_logs':
        handleViewLoginLogs($pdo);
        break;

    case 'view_event_log':
        handleViewEventLog($pdo);
        break;

    case 'list':
        requireAuth();
        handleList($pdo);
        break;

    case 'sync':
        handleSync($pdo);
        break;

    case 'scrape_status':
        handleScrapeStatus($pdo);
        break;

    case 'client_log':
        handleClientLog($pdo);
        break;

    case 'update_user_data':
        requireAuth();
        requireCsrf();
        handleUpdateUserData($pdo);
        break;

    case 'update_coordinates':
        requireAuth();
        requireCsrf();
        handleUpdateCoordinates($pdo);
        break;

    case 'delete':
        requireAuth();
        requireCsrf();
        handleDeleteProperty($pdo);
        break;

    case 'admin_cleanup_preview':
        requireAdmin();
        handleAdminCleanupPreview($pdo);
        break;

    case 'admin_cleanup_execute':
        requireAdmin();
        requireCsrf();
        handleAdminCleanupExecute($pdo);
        break;

    default:
        http_response_code(400);
        echo json_encode(['error' => 'Invalid action']);
        break;
}
