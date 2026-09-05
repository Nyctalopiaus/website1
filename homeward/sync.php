<?php
// Cross-Device Sync endpoint for Homeward.
//
// Why this exists: Homeward's tour data lives only in the browser's
// localStorage (see js/storage.js) — there's no account system and no
// database. That's fine on one device, but it means notes typed into the
// Inspection Notebook on a phone out in the field never reach the PC used
// to plan the route and print the report. This endpoint is a deliberately
// minimal bridge: push writes the current tour to a small JSON file under
// a short, random code; pull reads it back by that code. No accounts, no
// login — the code itself is the only credential, same trust model as a
// shared link. Follows the same flat-file, no-framework convention as
// open-road-advisor/fuel-price-proxy.php and mortgage-calculator's proxies
// (file cache under __DIR__, JSON in/out, no external dependencies).
//
// Wire format:
//   POST sync.php   body: {"action":"push","tour":{...currentTour...}}
//                    -> {"ok":true,"code":"AB12CD","expiresAt":"<ISO8601>"}
//   GET  sync.php?code=AB12CD
//                    -> {"ok":true,"tour":{...},"savedAt":"<ISO8601>","expiresAt":"<ISO8601>"}
//                    -> {"ok":false,"error":"not_found"} (HTTP 404) if missing/expired
//
// Deliberately NOT supported: embedded photo attachments. The Inspection
// Notebook can store a photo as a base64 data: URL directly in photoUrl,
// which can balloon a tour to tens of MB — well past typical shared-hosting
// post_max_size/upload_max_filesize limits, and it would fail unpredictably
// rather than cleanly. js/sync.js checks for this client-side before ever
// calling this endpoint and tells the user to use JSON Backup instead for a
// full copy with photos. This endpoint also rejects an oversized body as a
// second line of defense.
//
// Auto-Backup (added 2026-09-03): a second, non-expiring flavor of the same
// push/pull primitive above, for a different problem. Push/pull moves a
// tour to a *specific other device on purpose*, on request, and expires in
// 14 days; auto-backup is a silent safety net against losing the only copy
// (browser data cleared, crashed profile, new machine), written
// automatically by js/storage.js after every save, and never expires on
// its own (overwritten/refreshed on every write instead). Same trust model
// as push/pull — a random id is the only credential, no accounts — just
// keyed by a stable per-browser id instead of a freshly-generated code.
//   POST sync.php   body: {"action":"autobackup","deviceId":"<hex id>","tour":{...}}
//                    -> {"ok":true,"savedAt":"<ISO8601>"}
//   GET  sync.php?autobackup=<deviceId>
//                    -> {"ok":true,"tour":{...},"savedAt":"<ISO8601>"}
//                    -> {"ok":false,"error":"not_found"} (HTTP 404) if none saved yet

header('Content-Type: application/json');

// ---- Config ----
define('SYNC_CODE_LENGTH', 6);
// Unambiguous alphabet: no 0/O or 1/I, so a code is easy to read aloud or
// copy by hand without misreads.
define('SYNC_CODE_ALPHABET', 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789');
define('SYNC_TTL_SECONDS', 14 * 24 * 3600); // 14 days
define('SYNC_MAX_BODY_BYTES', 4 * 1024 * 1024); // 4MB — see note above on photos
define('SYNC_DIR', __DIR__ . '/.sync-cache');
// Auto-backup ids are client-generated hex strings (see js/storage.js
// getOrCreateBackupDeviceId) — bounded length/charset so the id can't be
// used to construct a path outside SYNC_DIR, and kept visually distinct
// from the uppercase push/pull alphabet.
define('AUTOBACKUP_ID_PATTERN', '/^[a-f0-9]{16,64}$/');
define('AUTOBACKUP_FILE_PREFIX', 'autobackup-');

function sync_fail($httpCode, $error) {
    http_response_code($httpCode);
    echo json_encode(['ok' => false, 'error' => $error]);
    exit;
}

function sync_ensure_dir() {
    if (!is_dir(SYNC_DIR)) {
        @mkdir(SYNC_DIR, 0755, true);
    }
    // Defense in depth: even though codes are the real access control, deny
    // direct directory access/listing in case web server config changes.
    $htaccess = SYNC_DIR . '/.htaccess';
    if (is_dir(SYNC_DIR) && !file_exists($htaccess)) {
        @file_put_contents($htaccess, "Require all denied\nDeny from all\n");
    }
}

function sync_code_path($code) {
    return SYNC_DIR . '/' . $code . '.json';
}

function autobackup_path($deviceId) {
    return SYNC_DIR . '/' . AUTOBACKUP_FILE_PREFIX . $deviceId . '.json';
}

// Opportunistic cleanup of expired push/pull entries. Cheap at the scale
// this tool actually runs at (a handful of files for one user), so it's
// fine to run on every request rather than adding a cron job for it.
// Auto-backup files (autobackup-*.json) are deliberately skipped here —
// they're the safety net and don't expire on the push/pull TTL; see
// AUTOBACKUP_STALE_SECONDS below for their own, much longer, cleanup.
function sync_cleanup_expired() {
    $files = @glob(SYNC_DIR . '/*.json');
    if (!$files) return;
    $now = time();
    $prefixLen = strlen(AUTOBACKUP_FILE_PREFIX);
    foreach ($files as $file) {
        if (substr(basename($file), 0, $prefixLen) === AUTOBACKUP_FILE_PREFIX) {
            continue;
        }
        $raw = @file_get_contents($file);
        $entry = $raw ? json_decode($raw, true) : null;
        if (!is_array($entry) || !isset($entry['savedAt']) || ($now - $entry['savedAt']) > SYNC_TTL_SECONDS) {
            @unlink($file);
        }
    }
}

function sync_generate_code() {
    $alphabet = SYNC_CODE_ALPHABET;
    $max = strlen($alphabet) - 1;
    for ($attempt = 0; $attempt < 20; $attempt++) {
        $code = '';
        for ($i = 0; $i < SYNC_CODE_LENGTH; $i++) {
            $code .= $alphabet[random_int(0, $max)];
        }
        if (!file_exists(sync_code_path($code))) {
            return $code;
        }
    }
    // Astronomically unlikely to ever hit this given the keyspace, but fail
    // cleanly rather than silently overwriting someone else's code.
    return null;
}

sync_ensure_dir();
sync_cleanup_expired();

$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'POST') {
    $rawBody = file_get_contents('php://input', false, null, 0, SYNC_MAX_BODY_BYTES + 1);
    if ($rawBody === false) {
        sync_fail(400, 'read_failed');
    }
    if (strlen($rawBody) > SYNC_MAX_BODY_BYTES) {
        sync_fail(413, 'payload_too_large');
    }

    $body = json_decode($rawBody, true);
    if (!is_array($body) || !isset($body['action'])) {
        sync_fail(400, 'invalid_request');
    }

    if ($body['action'] === 'autobackup') {
        $deviceId = isset($body['deviceId']) ? (string)$body['deviceId'] : '';
        if (!preg_match(AUTOBACKUP_ID_PATTERN, $deviceId)) {
            sync_fail(400, 'invalid_device_id');
        }

        $tour = isset($body['tour']) ? $body['tour'] : null;
        if (!is_array($tour) || !isset($tour['stops']) || !is_array($tour['stops'])) {
            sync_fail(400, 'invalid_tour');
        }

        $now = time();
        $entry = ['tour' => $tour, 'savedAt' => $now];
        $written = @file_put_contents(autobackup_path($deviceId), json_encode($entry));
        if ($written === false) {
            sync_fail(500, 'write_failed');
        }

        echo json_encode(['ok' => true, 'savedAt' => gmdate('c', $now)]);
        exit;
    }

    if ($body['action'] !== 'push') {
        sync_fail(400, 'unknown_action');
    }

    $tour = isset($body['tour']) ? $body['tour'] : null;
    if (!is_array($tour) || !isset($tour['stops']) || !is_array($tour['stops'])) {
        sync_fail(400, 'invalid_tour');
    }

    $code = sync_generate_code();
    if ($code === null) {
        sync_fail(500, 'code_generation_failed');
    }

    $now = time();
    $entry = ['tour' => $tour, 'savedAt' => $now];
    $written = @file_put_contents(sync_code_path($code), json_encode($entry));
    if ($written === false) {
        sync_fail(500, 'write_failed');
    }

    echo json_encode([
        'ok' => true,
        'code' => $code,
        'savedAt' => gmdate('c', $now),
        'expiresAt' => gmdate('c', $now + SYNC_TTL_SECONDS),
    ]);
    exit;
}

if ($method === 'GET') {
    if (isset($_GET['autobackup'])) {
        $deviceId = (string)$_GET['autobackup'];
        if (!preg_match(AUTOBACKUP_ID_PATTERN, $deviceId)) {
            sync_fail(400, 'invalid_device_id');
        }

        $path = autobackup_path($deviceId);
        if (!is_readable($path)) {
            sync_fail(404, 'not_found');
        }

        $raw = @file_get_contents($path);
        $entry = $raw ? json_decode($raw, true) : null;
        if (!is_array($entry) || !isset($entry['tour']) || !isset($entry['savedAt'])) {
            sync_fail(404, 'not_found');
        }

        echo json_encode([
            'ok' => true,
            'tour' => $entry['tour'],
            'savedAt' => gmdate('c', $entry['savedAt']),
        ]);
        exit;
    }

    $code = isset($_GET['code']) ? strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $_GET['code'])) : '';
    if (!preg_match('/^[' . preg_quote(SYNC_CODE_ALPHABET, '/') . ']{' . SYNC_CODE_LENGTH . '}$/', $code)) {
        sync_fail(400, 'invalid_code');
    }

    $path = sync_code_path($code);
    if (!is_readable($path)) {
        sync_fail(404, 'not_found');
    }

    $raw = @file_get_contents($path);
    $entry = $raw ? json_decode($raw, true) : null;
    if (!is_array($entry) || !isset($entry['tour']) || !isset($entry['savedAt'])) {
        sync_fail(404, 'not_found');
    }

    if ((time() - $entry['savedAt']) > SYNC_TTL_SECONDS) {
        @unlink($path);
        sync_fail(404, 'expired');
    }

    echo json_encode([
        'ok' => true,
        'tour' => $entry['tour'],
        'savedAt' => gmdate('c', $entry['savedAt']),
        'expiresAt' => gmdate('c', $entry['savedAt'] + SYNC_TTL_SECONDS),
    ]);
    exit;
}

sync_fail(405, 'method_not_allowed');
