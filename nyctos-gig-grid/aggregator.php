<?php
/**
 * Aggregator Module - sync runner and action router.
 */
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/services/VenueScraper.php';
require_once __DIR__ . '/services/EventAggregator.php';
require_once __DIR__ . '/services/ArtistDetailsService.php';
require_once __DIR__ . '/services/SetlistService.php';
require_once __DIR__ . '/services/SyncService.php';
require_once __DIR__ . '/actions/common.php';
require_once __DIR__ . '/actions/sync.php';
require_once __DIR__ . '/actions/logbook.php';
require_once __DIR__ . '/actions/setlist.php';
require_once __DIR__ . '/actions/log-js-error.php';

applyApiResponseHeaders();

set_time_limit(180);

function getAggregatorActionTokenFromRequest() {
    $headerToken = $_SERVER['HTTP_X_ACTION_TOKEN'] ?? '';
    if ($headerToken !== '') {
        return trim($headerToken);
    }

    $requestToken = $_POST['token'] ?? $_GET['token'] ?? '';
    return trim((string)$requestToken);
}

function denyAggregatorAccess($message = 'Forbidden') {
    if (!headers_sent()) {
        header('Content-Type: application/json');
        http_response_code(403);
    }
    echo json_encode(['status' => 'error', 'message' => $message]);
    exit;
}

function requireAggregatorTokenIfConfigured() {
    if (!defined('AGGREGATOR_ACTION_TOKEN') || AGGREGATOR_ACTION_TOKEN === '') {
        return;
    }

    $provided = getAggregatorActionTokenFromRequest();
    if ($provided === '' || !hash_equals(AGGREGATOR_ACTION_TOKEN, $provided)) {
        denyAggregatorAccess('Unauthorized action token.');
    }
}

$isCli = (php_sapi_name() === 'cli');
$cliSync = false;
if (isset($argv) && in_array('--cli-sync', $argv)) {
    $cliSync = true;
    $isCli = true;
}

if ($cliSync) {
    handleSyncRequest($isCli);
}

$isWebSyncAttempt = isset($_GET['sync']) || (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'POST' && (($_GET['action'] ?? '') === 'sync'));
if ($isWebSyncAttempt) {
    if (!defined('ALLOW_WEB_SYNC') || ALLOW_WEB_SYNC !== true) {
        denyAggregatorAccess('Web-triggered sync is disabled. Use CLI sync.');
    }

    $retryAfter = 0;
    if (isRateLimited('web-sync', 1, 3600, $retryAfter)) {
        jsonRateLimitResponse('Sync requests are rate limited. Try again later.', $retryAfter);
    }

    requireAggregatorTokenIfConfigured();
    handleSyncRequest(false);
}

$action = $_GET['action'] ?? '';

if ($action === 'log_js_error') {
    $retryAfter = 0;
    if (isRateLimited('log-js-error', 12, 600, $retryAfter)) {
        jsonRateLimitResponse('JavaScript error reporting is rate limited.', $retryAfter);
    }
    handleLogJsError();
}

if ($action === 'add_to_logbook' && isset($_POST['event_id'])) {
    requireAggregatorTokenIfConfigured();
    $retryAfter = 0;
    if (isRateLimited('logbook-add', 15, 600, $retryAfter)) {
        jsonRateLimitResponse('Logbook updates are rate limited.', $retryAfter);
    }
    handleAddToLogbook();
}

if ($action === 'remove_from_logbook' && isset($_POST['event_id'])) {
    requireAggregatorTokenIfConfigured();
    $retryAfter = 0;
    if (isRateLimited('logbook-remove', 15, 600, $retryAfter)) {
        jsonRateLimitResponse('Logbook updates are rate limited.', $retryAfter);
    }
    handleRemoveFromLogbook();
}

if ($action === 'get_setlist' && (isset($_GET['event_id']) || isset($_POST['event_id']))) {
    $retryAfter = 0;
    if (isRateLimited('get-setlist', 20, 300, $retryAfter)) {
        jsonRateLimitResponse('Setlist lookups are rate limited.', $retryAfter);
    }
    handleGetSetlist();
}
