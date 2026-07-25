<?php

require_once __DIR__ . '/../services/EventAggregator.php';

function syncCliLog(string $message, bool $isCli = false): void {
    if (!$isCli) {
        return;
    }
    echo '[' . date('Y-m-d H:i:s') . '] ' . $message . "\n";
}

function handleSyncRequest(bool $isCli = false) {
    if (!$isCli) {
        header('Content-Type: application/json');
    } else {
        syncCliLog('[CLI SYNC] Initializing aggregator processes...', true);
    }

    @set_time_limit(600);

    try {
        syncCliLog('[DEBUG] Instantiating EventAggregator...', $isCli);
        $aggregator = new EventAggregator();
        
        $aggregator->log('[DEBUG] Calling fetchTicketmaster...');
        $tmCount = $aggregator->fetchTicketmaster();
        
        $aggregator->log('[DEBUG] Calling fetchBandsintown...');
        $bitCount = $aggregator->fetchBandsintown();
        
        $db = getDbConnection();
        
        $aggregator->log('[DEBUG] Calling importScrapedVenueEvents...');
        $scrapedCount = importScrapedVenueEvents($aggregator, $db);
        
        $aggregator->log('[DEBUG] Calling purgeIgnoredEvents...');
        $ignoredRemoved = $aggregator->purgeIgnoredEvents();

        // Persist last sync timestamp immediately after ingestion completes
        $aggregator->log('[DEBUG] Persisting last sync timestamp...');
        persistLastSyncTimestamp();

        $lastFmNormalizedCount = 0;
        try {
            require_once __DIR__ . '/../services/LastFmNormalizer.php';
            $normalizer = new LastFmNormalizer($db, [], function($msg) use ($aggregator) {
                $aggregator->log($msg);
            });
            
            $aggregator->log('[DEBUG] Calling LastFmNormalizer...');
            $lastFmNormalizedCount = $normalizer->normalizeAllEvents();
        } catch (Throwable $e) {
            $aggregator->log('[LAST.FM ERROR] Normalization pipeline warning: ' . $e->getMessage());
        }

        $setlistFetched = 0;
        try {
            $aggregator->log('[DEBUG] Backfilling setlists...');
            $setlistFetched = backfillMissingSetlists($aggregator);
        } catch (Throwable $e) {
            $aggregator->log('[SETLIST ERROR] Setlist backfill warning: ' . $e->getMessage());
        }

        $maintenance = [
            'events_purged' => 0,
            'orphan_setlists_removed' => 0,
        ];
        try {
            $retentionDays = defined('EVENT_RETENTION_DAYS') ? (int)EVENT_RETENTION_DAYS : 4;
            $aggregator->log('[DEBUG] Running DB maintenance...');
            $maintenance = runDatabaseMaintenance($aggregator, $retentionDays);
        } catch (Throwable $e) {
            $aggregator->log('[MAINTENANCE ERROR] DB maintenance warning: ' . $e->getMessage());
        }

        $aggregator->log('[SYNC COMPLETE] Sync completed successfully.');

        if ($isCli) {
            syncCliLog('[CLI SYNC] Aggregator process completed successfully!', true);
            syncCliLog("Ticketmaster events: $tmCount", true);
            syncCliLog("Bandsintown events: $bitCount", true);
            syncCliLog("Scraped events: $scrapedCount", true);
            syncCliLog("Ignored events removed: $ignoredRemoved", true);
            syncCliLog("[LAST.FM NORMALIZER] Normalized $lastFmNormalizedCount artist genres.", true);
            syncCliLog("[SETLIST SYNC] Checked and cached $setlistFetched past setlists.", true);
            syncCliLog("[MAINTENANCE] Purged {$maintenance['events_purged']} events older than {$retentionDays} days and removed {$maintenance['orphan_setlists_removed']} orphaned setlists.", true);
            syncCliLog('[CLI SYNC] Sync completed successfully.', true);
            exit;
        }

        jsonResponse([
            'status' => 'success',
            'ticketmaster_events' => $tmCount,
            'bandsintown_events' => $bitCount,
            'scraped_events' => $scrapedCount,
            'ignored_removed' => $ignoredRemoved,
            'lastfm_normalized' => $lastFmNormalizedCount,
            'setlists_cached' => $setlistFetched,
            'events_purged' => $maintenance['events_purged'],
            'orphan_setlists_removed' => $maintenance['orphan_setlists_removed'],
            'logs' => $aggregator->getLogs()
        ]);
    } catch (Throwable $t) {
        $msg = "[FATAL EXCEPTION IN SYNC] " . $t->getMessage() . " in " . $t->getFile() . ":" . $t->getLine();
        syncCliLog($msg, $isCli);
        if ($isCli) {
            syncCliLog($t->getTraceAsString(), true);
        }
        if (!$isCli) {
            jsonErrorResponse($msg);
        }
    }
}

if (basename(__FILE__) === basename($_SERVER['SCRIPT_FILENAME'] ?? '')) {
    $isCli = (php_sapi_name() === 'cli' || empty($_SERVER['REMOTE_ADDR']));
    handleSyncRequest($isCli);
}
