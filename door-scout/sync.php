<?php
// Cross-Device Sync endpoint for DoorScout.
// Flat-file, no-database endpoint allowing PC and mobile browsers to sync route sessions
// and door inspiration notes via a short 6-character code.

header('Content-Type: application/json');

define('SYNC_CODE_LENGTH', 6);
define('SYNC_CODE_ALPHABET', 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789');
define('SYNC_TTL_SECONDS', 14 * 24 * 3600); // 14 days
define('SYNC_MAX_BODY_BYTES', 4 * 1024 * 1024); // 4MB
define('SYNC_DIR', __DIR__ . '/.sync-cache');

function sync_fail($httpCode, $error) {
    http_response_code($httpCode);
    echo json_encode(['ok' => false, 'error' => $error]);
    exit;
}

function sync_ensure_dir() {
    if (!is_dir(SYNC_DIR)) {
        @mkdir(SYNC_DIR, 0755, true);
    }
    $htaccess = SYNC_DIR . '/.htaccess';
    if (is_dir(SYNC_DIR) && !file_exists($htaccess)) {
        @file_put_contents($htaccess, "Require all denied\nDeny from all\n");
    }
}

function sync_generate_code() {
    $alpha = SYNC_CODE_ALPHABET;
    $len = strlen($alpha);
    $code = '';
    for ($i = 0; $i < SYNC_CODE_LENGTH; $i++) {
        $code .= $alpha[random_int(0, $len - 1)];
    }
    return $code;
}

function sync_clean_old_files() {
    if (!is_dir(SYNC_DIR)) return;
    $now = time();
    $files = glob(SYNC_DIR . '/*.json');
    if ($files === false) return;
    foreach ($files as $file) {
        if (($now - filemtime($file)) > SYNC_TTL_SECONDS) {
            @unlink($file);
        }
    }
}

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'POST') {
    $rawInput = file_get_contents('php://input');
    if (strlen($rawInput) > SYNC_MAX_BODY_BYTES) {
        sync_fail(413, 'payload_too_large');
    }

    $data = json_decode($rawInput, true);
    if (!is_array($data) || ($data['action'] ?? '') !== 'push') {
        sync_fail(400, 'invalid_request');
    }

    $tour = $data['tour'] ?? null;
    if (!is_array($tour)) {
        sync_fail(400, 'missing_tour_data');
    }

    sync_ensure_dir();
    sync_clean_old_files();

    $code = sync_generate_code();
    $attempts = 0;
    while (file_exists(SYNC_DIR . '/' . $code . '.json') && $attempts < 10) {
        $code = sync_generate_code();
        $attempts++;
    }

    $now = time();
    $record = [
        'code' => $code,
        'savedAt' => date('c', $now),
        'expiresAt' => date('c', $now + SYNC_TTL_SECONDS),
        'tour' => $tour
    ];

    $filePath = SYNC_DIR . '/' . $code . '.json';
    if (file_put_contents($filePath, json_encode($record, JSON_PRETTY_PRINT)) === false) {
        sync_fail(500, 'write_failed');
    }

    echo json_encode([
        'ok' => true,
        'code' => $code,
        'savedAt' => $record['savedAt'],
        'expiresAt' => $record['expiresAt']
    ]);
    exit;
}

if ($method === 'GET') {
    $code = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $_GET['code'] ?? ''));
    if (strlen($code) !== SYNC_CODE_LENGTH) {
        sync_fail(400, 'invalid_code');
    }

    sync_ensure_dir();
    $filePath = SYNC_DIR . '/' . $code . '.json';
    if (!file_exists($filePath)) {
        sync_fail(404, 'not_found');
    }

    $raw = file_get_contents($filePath);
    $record = json_decode($raw, true);
    if (!is_array($record) || !isset($record['tour'])) {
        sync_fail(500, 'corrupt_file');
    }

    $expiresAt = strtotime($record['expiresAt'] ?? '1970-01-01');
    if (time() > $expiresAt) {
        @unlink($filePath);
        sync_fail(404, 'expired');
    }

    echo json_encode([
        'ok' => true,
        'tour' => $record['tour'],
        'savedAt' => $record['savedAt'] ?? null,
        'expiresAt' => $record['expiresAt'] ?? null
    ]);
    exit;
}

sync_fail(405, 'method_not_allowed');
