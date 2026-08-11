<?php
/**
 * Aggregator Module - sync runner and action router.
 */

// Global error logging for sync execution debugging
ini_set('display_errors', 1);
error_reporting(E_ALL);

register_shutdown_function(function() {
    $error = error_get_last();
    if ($error !== null && in_array($error['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR, E_USER_ERROR])) {
        $logDir = __DIR__ . '/logs/cron-sync-log';
        if (!is_dir($logDir)) @mkdir($logDir, 0755, true);
        $logMsg = "[" . date('Y-m-d H:i:s') . "] FATAL ERROR: " . $error['message'] . " in " . $error['file'] . " on line " . $error['line'] . "\n";
        @file_put_contents($logDir . '/sync_fatal_errors.log', $logMsg, FILE_APPEND);
    }
});

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/db/connection.php';
require_once __DIR__ . '/actions/common.php';
require_once __DIR__ . '/services/VenueScraper.php';
require_once __DIR__ . '/services/EventAggregator.php';
require_once __DIR__ . '/services/ArtistDetailsService.php';
require_once __DIR__ . '/services/SetlistService.php';
require_once __DIR__ . '/services/SyncService.php';
require_once __DIR__ . '/actions/sync.php';
require_once __DIR__ . '/actions/setlist.php';
require_once __DIR__ . '/actions/log-js-error.php';

@set_time_limit(0);

$isCli = (php_sapi_name() === 'cli' || empty($_SERVER['REMOTE_ADDR']));
$argvList = $_SERVER['argv'] ?? $GLOBALS['argv'] ?? $argv ?? [];
if (empty($argvList) && file_exists('/proc/self/cmdline')) {
    $rawCmd = @file_get_contents('/proc/self/cmdline');
    if (!empty($rawCmd)) {
        $argvList = explode("\0", $rawCmd);
    }
}

$cliSync = false;
$targetMarket = null;

foreach ($argvList as $arg) {
    if (strpos($arg, 'cli-sync') !== false) {
        $cliSync = true;
    }
    if (preg_match('/(?:--)?market=([a-z0-9_-]+)/i', $arg, $matches)) {
        $targetMarket = strtolower(trim($matches[1]));
    }
}

if ($cliSync || ($isCli && empty($_GET['action']) && !isset($_GET['sync']))) {
    handleSyncRequest(true, $targetMarket);
    exit;
}

applyApiResponseHeaders();

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

if ($action === 'get_setlist' && isset($_GET['event_id'])) {
    $retryAfter = 0;
    if (isRateLimited('get-setlist', 60, 600, $retryAfter)) {
        jsonRateLimitResponse('Setlist lookups are rate limited.', $retryAfter);
    }
    handleGetSetlist();
}

jsonErrorResponse('Invalid action specified.');