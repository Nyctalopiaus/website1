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

set_time_limit(180);

$isCli = (php_sapi_name() === 'cli');
$cliSync = false;
if (isset($argv) && in_array('--cli-sync', $argv)) {
    $cliSync = true;
    $isCli = true;
}

if ($cliSync || isset($_GET['sync']) || (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'POST' && (($_GET['action'] ?? '') === 'sync'))) {
    handleSyncRequest($isCli);
}

$action = $_GET['action'] ?? '';

if ($action === 'log_js_error') {
    handleLogJsError();
}

if ($action === 'add_to_logbook' && isset($_POST['event_id'])) {
    handleAddToLogbook();
}

if ($action === 'remove_from_logbook' && isset($_POST['event_id'])) {
    handleRemoveFromLogbook();
}

if ($action === 'get_setlist' && (isset($_GET['event_id']) || isset($_POST['event_id']))) {
    handleGetSetlist();
}
