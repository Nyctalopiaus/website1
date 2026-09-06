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
require_once __DIR__ . '/collections.php';

$action = $_GET['action'] ?? $_POST['action'] ?? 'list';

switch ($action) {
    case 'check_auth':
        handleCheckAuth($pdo);
        break;

    case 'login':
        handleLogin($pdo);
        break;

    case 'logout':
        handleLogout();
        break;

    case 'create_scrape_token':
        requireRealtorOrAdmin();
        requireCsrf();
        handleCreateScrapeToken($pdo);
        break;

    case 'list_collections':
        handleListCollections($pdo);
        break;

    case 'save_collection':
        handleSaveCollection($pdo);
        break;

    case 'get_collection':
        handleGetCollection($pdo);
        break;

    case 'add_to_collection':
        handleAddItemsToCollection($pdo);
        break;

    case 'delete_collection':
        handleDeleteCollection($pdo);
        break;

    case 'update_profile':
        requireAuth();
        requireCsrf();
        handleUpdateProfile($pdo);
        break;

    case 'get_notifications':
        handleGetNotifications($pdo);
        break;

    case 'get_client_matrix':
        handleGetClientMatrix($pdo);
        break;

    case 'get_realtor_overview':
        requireRealtorOrAdmin();
        handleGetRealtorOverview($pdo);
        break;

    case 'get_client_activity':
        requireRealtorOrAdmin();
        handleGetClientActivity($pdo);
        break;

    case 'get_my_showings':
        requireAuth();
        handleGetMyShowings($pdo);
        break;

    case 'save_realtor_notes':
        handleSaveRealtorNotes($pdo);
        break;

    case 'update_client_pipeline':
        handleUpdateClientPipeline($pdo);
        break;

    case 'save_showing_itinerary':
        requireRealtorOrAdmin();
        requireCsrf();
        handleSaveShowingItinerary($pdo);
        break;

    case 'list_global_property_visibility':
        requireRealtorOrAdmin();
        handleListGlobalPropertyVisibility($pdo);
        break;

    case 'update_global_property_visibility':
        requireRealtorOrAdmin();
        requireCsrf();
        handleUpdateGlobalPropertyVisibility($pdo);
        break;

    case 'get_property_activity':
        requireAuth();
        handleGetPropertyActivity($pdo);
        break;

    case 'get_property_messages':
        handleGetPropertyMessages($pdo);
        break;

    case 'send_property_message':
        handleSendPropertyMessage($pdo);
        break;

    case 'mark_notification_read':
        handleMarkNotificationRead($pdo);
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

    case 'update_user_role':
        handleUpdateUserRole($pdo);
        break;

    case 'get_saved_filters':
        requireAuth();
        handleGetSavedFilters($pdo);
        break;

    case 'save_filter':
        requireAuth();
        requireCsrf();
        handleSaveFilter($pdo);
        break;

    case 'delete_filter':
        requireAuth();
        requireCsrf();
        handleDeleteFilter($pdo);
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
        requireScrapeToken($pdo);
        handleSync($pdo);
        break;

    case 'scrape_status':
        requireScrapeToken($pdo);
        handleScrapeStatus($pdo);
        break;

    case 'client_log':
        requireScrapeToken($pdo);
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

    case 'get_preferences':
        requireAuth();
        handleGetPreferences($pdo);
        break;

    case 'update_preferences':
        requireAuth();
        requireCsrf();
        handleUpdatePreferences($pdo);
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

    case 'admin_retry_listing_images':
        requireAdmin();
        requireCsrf();
        handleAdminRetryListingImages($pdo);
        break;

    case 'get_scrape_runs':
        requireAdmin();
        handleGetScrapeRuns($pdo);
        break;

    case 'admin_update_property_address':
        requireAdmin();
        requireCsrf();
        handleAdminUpdatePropertyAddress($pdo);
        break;

    default:
        http_response_code(400);
        echo json_encode(['error' => 'Invalid action']);
        break;
}

function handleGetSavedFilters(PDO $pdo) {
    requireAuth();
    $userId = (int)$_SESSION['user_id'];
    $role = $_SESSION['role'] ?? 'client';
    $isPrimaryAdmin = ($_SESSION['username'] ?? '') === 'admin';

    if ($role === 'realtor' || $role === 'admin' || $isPrimaryAdmin) {
        $stmt = $pdo->prepare("
            SELECT f.*, u.username as owner_username, c.username as creator_username
            FROM saved_filters f
            JOIN users u ON f.user_id = u.id
            JOIN users c ON f.created_by_user_id = c.id
            WHERE f.user_id = :user_id 
               OR f.created_by_user_id = :user_id 
               OR f.target_user_id = :user_id 
               OR u.realtor_id = :user_id
               OR :is_admin = 1
            ORDER BY f.updated_at DESC
        ");
        $stmt->execute([':user_id' => $userId, ':is_admin' => ($role === 'admin' || $isPrimaryAdmin) ? 1 : 0]);
        $rows = $stmt->fetchAll();

        foreach ($rows as &$r) {
            $r['id'] = (int)$r['id'];
            $r['user_id'] = (int)$r['user_id'];
            $r['created_by_user_id'] = (int)$r['created_by_user_id'];
            $r['target_user_id'] = $r['target_user_id'] ? (int)$r['target_user_id'] : null;
            $r['is_shared'] = (int)$r['is_shared'];
            
            if ($r['user_id'] !== $userId) {
                $initials = getUserInitials($r['owner_username']);
                $r['display_name'] = "[{$initials}] " . $r['name'];
            } else {
                $r['display_name'] = $r['name'];
            }
        }
    } else {
        $stmt = $pdo->prepare("
            SELECT f.*, u.username as owner_username, c.username as creator_username
            FROM saved_filters f
            JOIN users u ON f.user_id = u.id
            JOIN users c ON f.created_by_user_id = c.id
            WHERE f.user_id = :user_id OR f.target_user_id = :user_id
            ORDER BY f.updated_at DESC
        ");
        $stmt->execute([':user_id' => $userId]);
        $rows = $stmt->fetchAll();

        foreach ($rows as &$r) {
            $r['id'] = (int)$r['id'];
            $r['user_id'] = (int)$r['user_id'];
            $r['created_by_user_id'] = (int)$r['created_by_user_id'];
            $r['target_user_id'] = $r['target_user_id'] ? (int)$r['target_user_id'] : null;
            $r['is_shared'] = (int)$r['is_shared'];
            if ($r['created_by_user_id'] !== $userId) {
                $r['display_name'] = "⭐ [Agent Shared] " . $r['name'];
            } else {
                $r['display_name'] = $r['name'];
            }
        }
    }

    echo json_encode(['success' => true, 'filters' => $rows]);
}

function handleSaveFilter(PDO $pdo) {
    requireAuth();
    requireCsrf();
    $input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
    $userId = (int)$_SESSION['user_id'];

    $filterId = !empty($input['id']) ? (int)$input['id'] : null;
    $name = trim((string)($input['name'] ?? ''));
    $filterData = $input['filter_json'] ?? $input['filters'] ?? null;
    $targetUserId = !empty($input['target_user_id']) ? (int)$input['target_user_id'] : null;
    $isShared = !empty($input['is_shared']) ? 1 : ($targetUserId ? 1 : 0);

    if (empty($name)) {
        http_response_code(400);
        echo json_encode(['error' => 'Filter name is required.']);
        return;
    }

    $filterJson = is_string($filterData) ? $filterData : json_encode($filterData);

    if ($filterId) {
        $stmtCheck = $pdo->prepare("SELECT user_id, created_by_user_id FROM saved_filters WHERE id = :id");
        $stmtCheck->execute([':id' => $filterId]);
        $existing = $stmtCheck->fetch();

        if (!$existing) {
            http_response_code(404);
            echo json_encode(['error' => 'Saved filter not found.']);
            return;
        }

        if ($existing['user_id'] !== $userId && $existing['created_by_user_id'] !== $userId && $_SESSION['role'] !== 'admin') {
            http_response_code(403);
            echo json_encode(['error' => 'You do not have permission to modify this saved filter.']);
            return;
        }

        $stmt = $pdo->prepare("
            UPDATE saved_filters 
            SET name = :name, filter_json = :json, is_shared = :is_shared, target_user_id = :target_user_id, updated_at = CURRENT_TIMESTAMP
            WHERE id = :id
        ");
        $stmt->execute([
            ':name' => $name,
            ':json' => $filterJson,
            ':is_shared' => $isShared,
            ':target_user_id' => $targetUserId,
            ':id' => $filterId
        ]);

        echo json_encode(['success' => true, 'id' => $filterId, 'name' => $name]);
    } else {
        $ownerUserId = $targetUserId ?: $userId;
        $stmt = $pdo->prepare("
            INSERT INTO saved_filters (user_id, created_by_user_id, name, filter_json, is_shared, target_user_id)
            VALUES (:user_id, :created_by, :name, :json, :is_shared, :target_user_id)
        ");
        $stmt->execute([
            ':user_id' => $ownerUserId,
            ':created_by' => $userId,
            ':name' => $name,
            ':json' => $filterJson,
            ':is_shared' => $isShared,
            ':target_user_id' => $targetUserId
        ]);

        echo json_encode(['success' => true, 'id' => (int)$pdo->lastInsertId(), 'name' => $name]);
    }
}

function handleDeleteFilter(PDO $pdo) {
    requireAuth();
    requireCsrf();
    $input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
    $filterId = (int)($input['id'] ?? 0);
    $userId = (int)$_SESSION['user_id'];

    if ($filterId <= 0) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid filter ID specified.']);
        return;
    }

    $stmtCheck = $pdo->prepare("SELECT user_id, created_by_user_id FROM saved_filters WHERE id = :id");
    $stmtCheck->execute([':id' => $filterId]);
    $existing = $stmtCheck->fetch();

    if (!$existing) {
        http_response_code(404);
        echo json_encode(['error' => 'Saved filter not found.']);
        return;
    }

    if ($existing['user_id'] !== $userId && $existing['created_by_user_id'] !== $userId && $_SESSION['role'] !== 'admin') {
        http_response_code(403);
        echo json_encode(['error' => 'You do not have permission to delete this saved filter.']);
        return;
    }

    $stmtDel = $pdo->prepare("DELETE FROM saved_filters WHERE id = :id");
    $stmtDel->execute([':id' => $filterId]);

    echo json_encode(['success' => true, 'id' => $filterId]);
}

function handleGetPreferences(PDO $pdo) {
    requireAuth();
    $userId = (int)$_SESSION['user_id'];

    $stmt = $pdo->prepare("SELECT active_view, current_sort, compare_list_json, active_filters_json FROM user_preferences WHERE user_id = :user_id");
    $stmt->execute([':user_id' => $userId]);
    $prefs = $stmt->fetch();

    if (!$prefs) {
        $prefs = [
            'active_view' => 'grid',
            'current_sort' => 'price-desc',
            'compare_list_json' => '[]',
            'active_filters_json' => '{}'
        ];
    }

    $prefs['compare_list'] = json_decode($prefs['compare_list_json'] ?? '[]', true) ?: [];
    $prefs['active_filters'] = json_decode($prefs['active_filters_json'] ?? '{}', true) ?: (object)[];
    unset($prefs['compare_list_json'], $prefs['active_filters_json']);

    echo json_encode(['success' => true, 'preferences' => $prefs]);
}

function handleUpdatePreferences(PDO $pdo) {
    requireAuth();
    requireCsrf();
    $userId = (int)$_SESSION['user_id'];
    $input = json_decode(file_get_contents('php://input'), true) ?? $_POST;

    $stmtFetch = $pdo->prepare("SELECT active_view, current_sort, compare_list_json, active_filters_json FROM user_preferences WHERE user_id = :user_id");
    $stmtFetch->execute([':user_id' => $userId]);
    $existing = $stmtFetch->fetch() ?: [
        'active_view' => 'grid',
        'current_sort' => 'price-desc',
        'compare_list_json' => '[]',
        'active_filters_json' => '{}'
    ];

    $activeView = isset($input['active_view']) ? (string)$input['active_view'] : $existing['active_view'];
    $currentSort = isset($input['current_sort']) ? (string)$input['current_sort'] : $existing['current_sort'];
    $compareListJson = isset($input['compare_list']) ? json_encode($input['compare_list']) : $existing['compare_list_json'];
    $activeFiltersJson = isset($input['active_filters']) ? json_encode($input['active_filters']) : $existing['active_filters_json'];

    $stmtUpsert = $pdo->prepare("
        INSERT INTO user_preferences (user_id, active_view, current_sort, compare_list_json, active_filters_json, updated_at)
        VALUES (:user_id, :active_view, :current_sort, :compare_list_json, :active_filters_json, CURRENT_TIMESTAMP)
        ON CONFLICT(user_id) DO UPDATE SET
            active_view = excluded.active_view,
            current_sort = excluded.current_sort,
            compare_list_json = excluded.compare_list_json,
            active_filters_json = excluded.active_filters_json,
            updated_at = CURRENT_TIMESTAMP
    ");
    $stmtUpsert->execute([
        ':user_id' => $userId,
        ':active_view' => $activeView,
        ':current_sort' => $currentSort,
        ':compare_list_json' => $compareListJson,
        ':active_filters_json' => $activeFiltersJson
    ]);

    echo json_encode(['success' => true]);
}

function handleGetNotifications(PDO $pdo) {
    requireAuth();
    $userId = (int)$_SESSION['user_id'];
    $stmt = $pdo->prepare("
        SELECT id, type, title, message, link_url, is_read, created_at
        FROM notifications
        WHERE user_id = :user_id
        ORDER BY id DESC LIMIT 50
    ");
    $stmt->execute([':user_id' => $userId]);
    $notifications = $stmt->fetchAll();

    $unreadCount = 0;
    foreach ($notifications as &$n) {
        $n['id'] = (int)$n['id'];
        $n['is_read'] = (int)$n['is_read'];
        if (!$n['is_read']) $unreadCount++;
    }

    echo json_encode([
        'success' => true,
        'unread_count' => $unreadCount,
        'notifications' => $notifications
    ]);
}

function handleMarkNotificationRead(PDO $pdo) {
    requireAuth();
    requireCsrf();
    $input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
    $userId = (int)$_SESSION['user_id'];
    $notificationId = (int)($input['notification_id'] ?? 0);
    $markAll = !empty($input['mark_all']);

    if ($markAll) {
        $stmt = $pdo->prepare("UPDATE notifications SET is_read = 1 WHERE user_id = :user_id");
        $stmt->execute([':user_id' => $userId]);
    } else if ($notificationId > 0) {
        $stmt = $pdo->prepare("UPDATE notifications SET is_read = 1 WHERE id = :id AND user_id = :user_id");
        $stmt->execute([':id' => $notificationId, ':user_id' => $userId]);
    }

    echo json_encode(['success' => true]);
}
