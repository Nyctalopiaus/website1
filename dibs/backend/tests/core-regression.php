<?php
if (php_sapi_name() !== 'cli') {
    http_response_code(403);
    exit('Forbidden');
}

$dbPath = __DIR__ . '/../../data/properties.db';
if (!is_file($dbPath)) {
    fwrite(STDERR, "FAIL: properties database not found\n");
    exit(1);
}

$pdo = new PDO('sqlite:' . $dbPath, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
$pdo->exec('PRAGMA foreign_keys = ON');
$failures = [];

function expect(bool $condition, string $message, array &$failures): void {
    if (!$condition) {
        $failures[] = $message;
    }
}

$foreignKeyIssues = $pdo->query('PRAGMA foreign_key_check')->fetchAll(PDO::FETCH_ASSOC);
expect(count($foreignKeyIssues) === 0, 'foreign key integrity check found orphaned records', $failures);

$visibilityColumns = $pdo->query('PRAGMA table_info(property_visibility)')->fetchAll(PDO::FETCH_COLUMN, 1);
foreach (['mls_id', 'is_hidden', 'lifecycle_status', 'hidden_reason', 'hidden_by_user_id', 'hidden_at'] as $column) {
    expect(in_array($column, $visibilityColumns, true), "property_visibility.$column is missing", $failures);
}

$activityColumns = $pdo->query('PRAGMA table_info(property_activity)')->fetchAll(PDO::FETCH_COLUMN, 1);
foreach (['mls_id', 'actor_user_id', 'subject_user_id', 'activity_type', 'visibility', 'message', 'created_at'] as $column) {
    expect(in_array($column, $activityColumns, true), "property_activity.$column is missing", $failures);
}

$itineraryColumns = $pdo->query('PRAGMA table_info(showing_itinerary)')->fetchAll(PDO::FETCH_COLUMN, 1);
foreach (['client_id', 'mls_id', 'showing_time', 'access_notes', 'feedback', 'updated_by_user_id', 'updated_at'] as $column) {
    expect(in_array($column, $itineraryColumns, true), "showing_itinerary.$column is missing", $failures);
}

$invalidActivityVisibility = (int)$pdo->query("SELECT COUNT(*) FROM property_activity WHERE visibility NOT IN ('public', 'shared', 'realtor', 'admin')")->fetchColumn();
expect($invalidActivityVisibility === 0, 'property_activity contains an invalid visibility value', $failures);

$invalidItineraryRows = (int)$pdo->query('SELECT COUNT(*) FROM showing_itinerary si LEFT JOIN users u ON si.client_id = u.id LEFT JOIN properties p ON si.mls_id = p.mls_id WHERE u.id IS NULL OR u.role != \'client\' OR p.mls_id IS NULL')->fetchColumn();
expect($invalidItineraryRows === 0, 'showing_itinerary contains an invalid client or property reference', $failures);

$clientAdminFlags = (int)$pdo->query("SELECT COUNT(*) FROM users WHERE role = 'client' AND COALESCE(is_admin, 0) != 0")->fetchColumn();
expect($clientAdminFlags === 0, 'a client account has admin access enabled', $failures);

$invalidClientAssignments = (int)$pdo->query("SELECT COUNT(*) FROM users c LEFT JOIN users r ON c.realtor_id = r.id WHERE c.role = 'client' AND c.realtor_id IS NOT NULL AND (r.id IS NULL OR r.role NOT IN ('realtor', 'admin'))")->fetchColumn();
expect($invalidClientAssignments === 0, 'a client has an invalid realtor assignment', $failures);

$validLifecycleStatuses = ['active', 'under_contract', 'sold', 'withdrawn', 'archived'];
$visibilityRecords = $pdo->query('SELECT mls_id, is_hidden, lifecycle_status FROM property_visibility')->fetchAll(PDO::FETCH_ASSOC);
foreach ($visibilityRecords as $record) {
    expect(in_array($record['lifecycle_status'], $validLifecycleStatuses, true), "MLS {$record['mls_id']} has an invalid lifecycle status", $failures);
    if (!(int)$record['is_hidden']) {
        expect($record['lifecycle_status'] === 'active', "visible MLS {$record['mls_id']} is not active", $failures);
    }
}

$properties = $pdo->query('SELECT mls_id, main_image_url, raw_mls_json FROM properties')->fetchAll(PDO::FETCH_ASSOC);
expect(count($properties) > 0, 'no properties are available', $failures);
foreach ($properties as $property) {
    $url = (string)($property['main_image_url'] ?? '');
    expect($url !== '', "MLS {$property['mls_id']} has no primary preview URL", $failures);
    if (strpos($url, 'media/') === 0) {
        $path = __DIR__ . '/../..' . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $url);
        $image = is_file($path) ? @getimagesize($path) : false;
        expect($image !== false && $image[0] >= 100 && $image[1] >= 100, "MLS {$property['mls_id']} has an invalid primary preview", $failures);
    }
    $rawMls = json_decode($property['raw_mls_json'] ?? '{}', true) ?: [];
    expect(!array_key_exists('matrix_review_status', $rawMls), "MLS {$property['mls_id']} exposes shared review status", $failures);
    expect(!array_key_exists('portal_notes', $rawMls), "MLS {$property['mls_id']} exposes shared portal notes", $failures);
}

$collections = $pdo->query('SELECT id, mls_ids_json FROM collections')->fetchAll(PDO::FETCH_ASSOC);
foreach ($collections as $collection) {
    $mlsIds = json_decode($collection['mls_ids_json'] ?? '[]', true);
    expect(is_array($mlsIds), "playlist {$collection['id']} has invalid MLS IDs JSON", $failures);
    foreach ($mlsIds ?: [] as $mlsId) {
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM properties WHERE mls_id = :mls_id');
        $stmt->execute([':mls_id' => (string)$mlsId]);
        expect((int)$stmt->fetchColumn() === 1, "playlist {$collection['id']} references missing MLS $mlsId", $failures);
    }
}

if ($failures) {
    fwrite(STDERR, "FAIL\n- " . implode("\n- ", $failures) . "\n");
    exit(1);
}

echo 'PASS: ' . count($properties) . " properties, " . count($collections) . " playlists\n";