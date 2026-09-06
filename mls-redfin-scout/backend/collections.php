<?php
/**
 * MLS & Redfin Property Scout - Curated Collections & Playlists Handler
 * Handles CRUD and share-link endpoints for Realtor curated property playlists.
 * Requires backend/bootstrap.php to already be included.
 */

function handleListCollections(PDO $pdo) {
    requireAuth();
    $userId = (int)$_SESSION['user_id'];
    $role = $_SESSION['role'] ?? 'client';
    $isAdmin = ($_SESSION['username'] ?? '') === 'admin' || !empty($_SESSION['is_admin']);

    if ($role === 'realtor' || $isAdmin) {
        $stmt = $pdo->prepare("
            SELECT c.*, 
                   r.username as realtor_username, COALESCE(r.full_name, r.username) as realtor_display_name,
                   u.username as client_username, COALESCE(u.full_name, u.username) as client_display_name
            FROM collections c
            LEFT JOIN users r ON c.realtor_id = r.id
            LEFT JOIN users u ON c.client_id = u.id
            WHERE c.realtor_id = :user_id OR c.client_id = :user_id OR :is_admin = 1
            ORDER BY c.updated_at DESC
        ");
        $stmt->execute([':user_id' => $userId, ':is_admin' => $isAdmin ? 1 : 0]);
    } else {
        $stmt = $pdo->prepare("
            SELECT c.*, 
                   r.username as realtor_username, COALESCE(r.full_name, r.username) as realtor_display_name,
                   u.username as client_username, COALESCE(u.full_name, u.username) as client_display_name
            FROM collections c
            LEFT JOIN users r ON c.realtor_id = r.id
            LEFT JOIN users u ON c.client_id = u.id
            WHERE c.client_id = :user_id
            ORDER BY c.updated_at DESC
        ");
        $stmt->execute([':user_id' => $userId]);
    }

    $rows = $stmt->fetchAll();
    $visibilityStmt = $pdo->prepare("SELECT COUNT(*) FROM properties p LEFT JOIN property_visibility v ON p.mls_id = v.mls_id WHERE p.mls_id = :mls_id AND COALESCE(v.is_hidden, 0) = 0");
    foreach ($rows as &$row) {
        $row['id'] = (int)$row['id'];
        $row['realtor_id'] = (int)$row['realtor_id'];
        $row['client_id'] = $row['client_id'] ? (int)$row['client_id'] : null;
        $row['mls_ids'] = json_decode($row['mls_ids_json'] ?? '[]', true) ?: [];
        $visibleMlsIds = [];
        foreach ($row['mls_ids'] as $mlsId) {
            $visibilityStmt->execute([':mls_id' => (string)$mlsId]);
            if ((int)$visibilityStmt->fetchColumn() === 1) {
                $visibleMlsIds[] = $mlsId;
            }
        }
        $row['item_count'] = count($visibleMlsIds);
        $row['hidden_item_count'] = count($row['mls_ids']) - $row['item_count'];
    }

    echo json_encode(['success' => true, 'collections' => $rows]);
}

function handleSaveCollection(PDO $pdo) {
    requireAuth();
    requireCsrf();

    $role = $_SESSION['role'] ?? 'client';
    $isAdmin = ($_SESSION['username'] ?? '') === 'admin' || !empty($_SESSION['is_admin']);

    if ($role !== 'realtor' && !$isAdmin) {
        http_response_code(403);
        echo json_encode(['error' => 'Forbidden. Realtor or Admin privileges required to curate playlists.']);
        return;
    }

    $input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
    $collectionId = !empty($input['id']) ? (int)$input['id'] : null;
    $title = trim((string)($input['title'] ?? ''));
    $description = trim((string)($input['description'] ?? ''));
    $clientId = !empty($input['client_id']) ? (int)$input['client_id'] : null;
    $mlsIds = is_array($input['mls_ids'] ?? null) ? $input['mls_ids'] : [];

    if (empty($title)) {
        http_response_code(400);
        echo json_encode(['error' => 'Playlist title is required.']);
        return;
    }

    $realtorId = (int)$_SESSION['user_id'];
    $mlsIdsJson = json_encode(array_values(array_unique(array_filter($mlsIds))));

    if ($collectionId) {
        $stmtCheck = $pdo->prepare("SELECT realtor_id, share_token, mls_ids_json FROM collections WHERE id = :id");
        $stmtCheck->execute([':id' => $collectionId]);
        $existing = $stmtCheck->fetch();

        if (!$existing) {
            http_response_code(404);
            echo json_encode(['error' => 'Collection playlist not found.']);
            return;
        }

        if ($existing['realtor_id'] !== $realtorId && !$isAdmin) {
            http_response_code(403);
            echo json_encode(['error' => 'Forbidden. You cannot modify another realtor\'s playlist.']);
            return;
        }

        $targetMlsIdsJson = is_array($input['mls_ids'] ?? null)
            ? json_encode(array_values(array_unique(array_filter($input['mls_ids']))))
            : ($existing['mls_ids_json'] ?? '[]');

        $stmt = $pdo->prepare("
            UPDATE collections 
            SET title = :title, description = :description, client_id = :client_id, mls_ids_json = :mls_ids_json, updated_at = CURRENT_TIMESTAMP
            WHERE id = :id
        ");
        $stmt->execute([
            ':title' => $title,
            ':description' => $description,
            ':client_id' => $clientId,
            ':mls_ids_json' => $targetMlsIdsJson,
            ':id' => $collectionId
        ]);

        echo json_encode(['success' => true, 'id' => $collectionId, 'share_token' => $existing['share_token']]);
    } else {
        $shareToken = 'pl_' . bin2hex(random_bytes(8));
        $stmt = $pdo->prepare("
            INSERT INTO collections (realtor_id, client_id, title, description, share_token, mls_ids_json)
            VALUES (:realtor_id, :client_id, :title, :description, :share_token, :mls_ids_json)
        ");
        $stmt->execute([
            ':realtor_id' => $realtorId,
            ':client_id' => $clientId,
            ':title' => $title,
            ':description' => $description,
            ':share_token' => $shareToken,
            ':mls_ids_json' => $mlsIdsJson
        ]);

        logEvent($pdo, 'system', 'info', "Created curated playlist '{$title}' with share token {$shareToken}");

        if ($clientId > 0) {
            $agentName = !empty($_SESSION['full_name']) ? $_SESSION['full_name'] : $_SESSION['username'];
            createNotification(
                $pdo,
                $clientId,
                'playlist',
                "⭐ Curated Playlist: {$title}",
                "Your Realtor {$agentName} created a curated playlist for you.",
                '#playlists'
            );
        }

        echo json_encode([
            'success' => true,
            'id' => (int)$pdo->lastInsertId(),
            'share_token' => $shareToken
        ]);
    }
}

function handleGetCollection(PDO $pdo) {
    $id = !empty($_GET['id']) ? (int)$_GET['id'] : null;
    $token = trim((string)($_GET['token'] ?? ''));

    if (!$id && !$token) {
        http_response_code(400);
        echo json_encode(['error' => 'Collection ID or share token required.']);
        return;
    }

    if ($token) {
        $stmt = $pdo->prepare("
            SELECT c.*, 
                   r.username as realtor_username, COALESCE(r.full_name, r.username) as realtor_display_name, r.email as realtor_email, r.phone as realtor_phone,
                   u.username as client_username, COALESCE(u.full_name, u.username) as client_display_name
            FROM collections c
            LEFT JOIN users r ON c.realtor_id = r.id
            LEFT JOIN users u ON c.client_id = u.id
            WHERE c.share_token = :token LIMIT 1
        ");
        $stmt->execute([':token' => $token]);
    } else {
        requireAuth();
        $stmt = $pdo->prepare("
            SELECT c.*, 
                   r.username as realtor_username, COALESCE(r.full_name, r.username) as realtor_display_name, r.email as realtor_email, r.phone as realtor_phone,
                   u.username as client_username, COALESCE(u.full_name, u.username) as client_display_name
            FROM collections c
            LEFT JOIN users r ON c.realtor_id = r.id
            LEFT JOIN users u ON c.client_id = u.id
            WHERE c.id = :id LIMIT 1
        ");
        $stmt->execute([':id' => $id]);
    }

    $col = $stmt->fetch();
    if (!$col) {
        http_response_code(404);
        echo json_encode(['error' => 'Curated playlist not found.']);
        return;
    }

    $mlsIds = json_decode($col['mls_ids_json'] ?? '[]', true) ?: [];

    // Fetch corresponding properties
    $properties = [];
    if (!empty($mlsIds)) {
        $metaUserId = !empty($col['client_id']) ? (int)$col['client_id'] : ($_SESSION['user_id'] ?? null);
        if (!$metaUserId) {
            $metaUserId = $pdo->query("SELECT id FROM users WHERE username = 'jhankins'")->fetchColumn() ?: 1;
        }
        $metaUserId = (int)$metaUserId;

        $inClause = implode(',', array_fill(0, count($mlsIds), '?'));
        $queryParams = array_merge([$metaUserId], $mlsIds);

        $pStmt = $pdo->prepare("
            SELECT p.*, r.redfin_url, r.redfin_estimate, r.walk_score, r.transit_score, r.bike_score, r.price_per_sqft,
                   COALESCE(u.favorite, 0) as favorite, COALESCE(u.hidden, 0) as hidden, COALESCE(u.rating, 0) as rating,
                   COALESCE(u.user_notes, '') as user_notes, COALESCE(u.realtor_notes, '') as realtor_notes
            FROM properties p
            LEFT JOIN redfin_data r ON p.mls_id = r.mls_id
            LEFT JOIN user_metadata u ON p.mls_id = u.mls_id AND u.user_id = ?
            LEFT JOIN property_visibility v ON p.mls_id = v.mls_id
            WHERE p.mls_id IN ($inClause) AND COALESCE(v.is_hidden, 0) = 0
        ");
        $pStmt->execute($queryParams);
        $properties = $pStmt->fetchAll();

        $propertiesByMlsId = [];
        foreach ($properties as $property) {
            $propertiesByMlsId[(string)$property['mls_id']] = $property;
        }
        $properties = [];
        foreach ($mlsIds as $mlsId) {
            $key = (string)$mlsId;
            if (isset($propertiesByMlsId[$key])) {
                $properties[] = $propertiesByMlsId[$key];
            }
        }

        foreach ($properties as &$p) {
            $p['gallery_images'] = json_decode($p['gallery_images'] ?? '[]', true) ?: [];
            $p['price'] = (float)$p['price'];
            $p['beds'] = (int)$p['beds'];
            $p['baths'] = (float)$p['baths'];
            $p['sqft_finished'] = (int)$p['sqft_finished'];
            $p['favorite'] = (int)$p['favorite'];
            $p['rating'] = (int)$p['rating'];
        }
    }

    echo json_encode([
        'success' => true,
        'collection' => [
            'id' => (int)$col['id'],
            'realtor_id' => (int)$col['realtor_id'],
            'realtor_name' => $col['realtor_display_name'],
            'realtor_email' => $col['realtor_email'] ?? '',
            'realtor_phone' => $col['realtor_phone'] ?? '',
            'client_name' => $col['client_display_name'],
            'title' => $col['title'],
            'description' => $col['description'],
            'share_token' => $col['share_token'],
            'item_count' => count($properties),
            'hidden_item_count' => count($mlsIds) - count($properties),
            'created_at' => $col['created_at'],
            'items' => $properties,
            'properties' => $properties
        ]
    ]);
}

function handleAddItemsToCollection(PDO $pdo) {
    requireRealtorOrAdmin();
    requireCsrf();

    $input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
    $collectionId = (int)($input['collection_id'] ?? 0);
    $mlsIds = is_array($input['mls_ids'] ?? null) ? $input['mls_ids'] : [];

    if ($collectionId <= 0 || empty($mlsIds)) {
        http_response_code(400);
        echo json_encode(['error' => 'Collection ID and MLS IDs are required.']);
        return;
    }

    $stmtCheck = $pdo->prepare("SELECT realtor_id, client_id, title, mls_ids_json FROM collections WHERE id = :id");
    $stmtCheck->execute([':id' => $collectionId]);
    $existing = $stmtCheck->fetch();

    if (!$existing) {
        http_response_code(404);
        echo json_encode(['error' => 'Playlist not found.']);
        return;
    }

    $currentUserId = (int)$_SESSION['user_id'];
    $isAdmin = !empty($_SESSION['is_admin']) || ($_SESSION['role'] ?? '') === 'admin';
    if (!$isAdmin && (int)$existing['realtor_id'] !== $currentUserId) {
        http_response_code(403);
        echo json_encode(['error' => 'Forbidden. You cannot edit another realtor\'s playlist.']);
        return;
    }

    $currentMlsIds = json_decode($existing['mls_ids_json'] ?? '[]', true) ?: [];
    $updatedMlsIds = array_values(array_unique(array_merge($currentMlsIds, $mlsIds)));
    $addedMlsIds = array_values(array_diff(array_map('strval', $updatedMlsIds), array_map('strval', $currentMlsIds)));

    $stmt = $pdo->prepare("UPDATE collections SET mls_ids_json = :json, updated_at = CURRENT_TIMESTAMP WHERE id = :id");
    $stmt->execute([':json' => json_encode($updatedMlsIds), ':id' => $collectionId]);

    foreach ($addedMlsIds as $mlsId) {
        $visibility = !empty($existing['client_id']) ? 'shared' : 'realtor';
        $message = "Added to curated playlist '{$existing['title']}'.";
        recordPropertyActivity($pdo, $mlsId, 'playlist_added', $visibility, $message, ['playlist_id' => $collectionId, 'playlist_title' => $existing['title']], $existing['client_id'] ? (int)$existing['client_id'] : null);
    }

    echo json_encode(['success' => true, 'id' => $collectionId, 'total_items' => count($updatedMlsIds), 'added_items' => count($addedMlsIds)]);
}

function handleDeleteCollection(PDO $pdo) {
    requireAuth();
    requireCsrf();

    $input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
    $collectionId = (int)($input['id'] ?? 0);

    if ($collectionId <= 0) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid collection ID.']);
        return;
    }

    $realtorId = (int)$_SESSION['user_id'];
    $isAdmin = ($_SESSION['username'] ?? '') === 'admin' || !empty($_SESSION['is_admin']);

    $stmtCheck = $pdo->prepare("SELECT realtor_id FROM collections WHERE id = :id");
    $stmtCheck->execute([':id' => $collectionId]);
    $existing = $stmtCheck->fetch();

    if (!$existing) {
        http_response_code(404);
        echo json_encode(['error' => 'Playlist not found.']);
        return;
    }

    if ($existing['realtor_id'] !== $realtorId && !$isAdmin) {
        http_response_code(403);
        echo json_encode(['error' => 'Forbidden. You cannot delete another realtor\'s playlist.']);
        return;
    }

    $stmtDel = $pdo->prepare("DELETE FROM collections WHERE id = :id");
    $stmtDel->execute([':id' => $collectionId]);

    echo json_encode(['success' => true, 'id' => $collectionId]);
}
