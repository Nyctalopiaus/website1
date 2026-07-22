<?php
/**
 * Compatibility router for legacy dispatcher requests.
 */

$action = $_GET['action'] ?? '';

if ($action === 'get_artist_details') {
    require __DIR__ . '/artist-details.php';
    exit;
}

require __DIR__ . '/email-passport.php';
