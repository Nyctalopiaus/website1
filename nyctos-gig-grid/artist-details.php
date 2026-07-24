<?php
/**
 * Artist Details Endpoint - Last.fm proxy and cache lookup
 */
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/actions/common.php';
require_once __DIR__ . '/services/ArtistDetailsService.php';

header('Content-Type: application/json');
applyApiResponseHeaders();

$artistName = trim($_GET['artist'] ?? $_POST['artist'] ?? '');
if (empty($artistName)) {
    echo json_encode(['status' => 'error', 'message' => 'Artist name is required.']);
    exit;
}

try {
    $details = fetchArtistDetails($artistName);
    echo json_encode(['status' => 'success', 'data' => $details]);
} catch (Exception $e) {
    logServerException('artist-details', $e);
    echo json_encode(['status' => 'error', 'message' => 'Unable to load artist details right now.']);
}
