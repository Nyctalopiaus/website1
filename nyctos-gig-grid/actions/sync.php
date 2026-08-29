<?php

require_once __DIR__ . '/../services/EventAggregator.php';
require_once __DIR__ . '/../services/SyncReportService.php';

function syncCliLog(string $message, bool $isCli = false): void {
    if (!$isCli) {
        return;
    }
    echo '[' . date('Y-m-d H:i:s T') . '] ' . $message . "\n";
}

function handleSyncRequest(bool $isCli = false, ?string $targetMarket = null) {
    $syncStartedAt = microtime(true);

    if (!$isCli) {
        header('Content-Type: application/json');
    } else {
        $mLog = !empty($targetMarket) ? " (Target Market: {$targetMarket})" : "";
        syncCliLog('[CLI SYNC] Initializing aggregator processes' . $mLog . '...', true);
    }

    @set_time_limit(0);

    try {
        syncCliLog('[DEBUG] Instantiating EventAggregator...', $isCli);
        $aggregator = new EventAggregator();
        
        $aggregator->log('[DEBUG] Calling fetchTicketmaster...');
        $tmCount = $aggregator->fetchTicketmaster($targetMarket);
        
        $aggregator->log('[DEBUG] Calling fetchBandsintown...');
        $bitCount = $aggregator->fetchBandsintown($targetMarket);

        $aggregator->log('[DEBUG] Calling fetchEventbrite...');
        $ebCount = $aggregator->fetchEventbrite($targetMarket);
        
        $db = getDbConnection();
        
        $aggregator->log('[DEBUG] Calling importScrapedVenueEvents...');
        $scrapedCount = importScrapedVenueEvents($aggregator, $db, $targetMarket);
        
        $aggregator->log('[DEBUG] Calling purgeIgnoredEvents...');
        $ignoredRemoved = $aggregator->purgeIgnoredEvents();

        $aggregator->log('[DEBUG] Calling reconcileEventLocations...');
        $reconciledCount = $aggregator->reconcileEventLocations();

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
            'duplicate_groups_merged' => 0,
            'duplicate_rows_removed' => 0,
            'ticket_id_groups_merged' => 0,
            'ticket_id_rows_removed' => 0,
            'double_bill_groups_flagged' => 0,
        ];
        $retentionDays = defined('EVENT_RETENTION_DAYS') ? (int)EVENT_RETENTION_DAYS : 4;
        try {
            $aggregator->log('[DEBUG] Running DB maintenance...');
            $maintenance = runDatabaseMaintenance($aggregator, $retentionDays);
        } catch (Throwable $e) {
            $aggregator->log('[MAINTENANCE ERROR] DB maintenance warning: ' . $e->getMessage());
        }

        $runtimeSeconds = microtime(true) - $syncStartedAt;
        $reportData = $aggregator->getRunReportData([
            'runtime_seconds' => $runtimeSeconds,
            'success' => true,
        ]);

        $configuredMarkets = !empty($targetMarket) ? [$targetMarket] : $aggregator->getConfiguredMarkets();
        if (!empty($configuredMarkets)) {
            $reportData['execution']['markets_processed'] = $configuredMarkets;
            $reportData['execution']['markets_processed_count'] = count($configuredMarkets);
        }

        $aggregator->log(sprintf(
            '[SYNC REPORT] Runtime=%s | Markets=%d | Status=%s',
            formatSyncRuntime((float)$reportData['execution']['runtime_seconds']),
            (int)$reportData['execution']['markets_processed_count'],
            !empty($reportData['execution']['success']) ? 'SUCCESS' : 'FAILED'
        ));

        $emailSent = sendSyncReportEmail($reportData, function($msg) use ($aggregator) {
            $aggregator->log($msg);
        });

        if ($emailSent) {
            $aggregator->log('[SYNC REPORT] Post-run report email sent successfully.');
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
            syncCliLog("[MAINTENANCE] Merged {$maintenance['duplicate_groups_merged']} duplicate event group(s), removing {$maintenance['duplicate_rows_removed']} redundant row(s).", true);
            syncCliLog("[MAINTENANCE] Merged {$maintenance['ticket_id_groups_merged']} same-ticket-listing group(s), removing {$maintenance['ticket_id_rows_removed']} redundant row(s).", true);
            syncCliLog("[MAINTENANCE] Flagged {$maintenance['double_bill_groups_flagged']} new possible-double-bill group(s) for review.", true);
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
            'duplicate_groups_merged' => $maintenance['duplicate_groups_merged'],
            'duplicate_rows_removed' => $maintenance['duplicate_rows_removed'],
            'ticket_id_groups_merged' => $maintenance['ticket_id_groups_merged'],
            'ticket_id_rows_removed' => $maintenance['ticket_id_rows_removed'],
            'double_bill_groups_flagged' => $maintenance['double_bill_groups_flagged'],
            'sync_report' => $reportData,
            'logs' => $aggregator->getLogs()
        ]);
    } catch (Throwable $t) {
        $msg = "[FATAL EXCEPTION IN SYNC] " . $t->getMessage() . " in " . $t->getFile() . ":" . $t->getLine();
        syncCliLog($msg, $isCli);

        $fallbackReport = [
            'execution' => [
                'started_at' => date('c', (int)$syncStartedAt),
                'ended_at' => date('c'),
                'runtime_seconds' => microtime(true) - $syncStartedAt,
                'markets_processed' => [],
                'markets_processed_count' => 0,
                'success' => false,
            ],
            'ingestion' => [],
            'enrichment' => [
                'musicbrainz_auto_approved_count' => 0,
                'musicbrainz_auto_approved_artists' => [],
                'genre_bucket_distribution' => [],
                'unknown_tags_write_count' => 0,
                'unknown_tags_written' => [],
            ],
            'errors' => [
                'http_non_200' => [],
                'connection_failures' => [],
                'scraper_dropouts' => [],
                'warnings' => [],
                'fatal' => [$msg],
            ],
        ];

        sendSyncReportEmail($fallbackReport, function($line) use ($isCli) {
            syncCliLog($line, $isCli);
        });

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
