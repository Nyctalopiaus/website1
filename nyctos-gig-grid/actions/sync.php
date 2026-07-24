<?php

require_once __DIR__ . '/../services/EventAggregator.php';

function handleSyncRequest(bool $isCli = false) {
    if (!$isCli) {
        header('Content-Type: application/json');
    } else {
        echo "[CLI SYNC] Initializing aggregator processes...\n";
    }

    @set_time_limit(600);

    try {
        echo "[DEBUG] Instantiating EventAggregator...\n";
        $aggregator = new EventAggregator();
        
        echo "[DEBUG] Calling fetchTicketmaster...\n";
        $tmCount = $aggregator->fetchTicketmaster();
        
        echo "[DEBUG] Calling fetchBandsintown...\n";
        $bitCount = $aggregator->fetchBandsintown();
        
        $db = getDbConnection();
        
        echo "[DEBUG] Calling importScrapedVenueEvents...\n";
        $scrapedCount = importScrapedVenueEvents($aggregator, $db);
        
        echo "[DEBUG] Calling purgeIgnoredEvents...\n";
        $ignoredRemoved = $aggregator->purgeIgnoredEvents();

        // Persist last sync timestamp immediately after ingestion completes
        echo "[DEBUG] Persisting last sync timestamp...\n";
        persistLastSyncTimestamp();

        $lastFmNormalizedCount = 0;
        try {
            require_once __DIR__ . '/../services/LastFmNormalizer.php';
            $normalizer = new LastFmNormalizer($db, [], function($msg) use ($aggregator) {
                $aggregator->log($msg);
            });
            
            echo "[DEBUG] Calling LastFmNormalizer...\n";
            $lastFmNormalizedCount = $normalizer->normalizeAllEvents();
        } catch (Throwable $e) {
            $aggregator->log('[LAST.FM ERROR] Normalization pipeline warning: ' . $e->getMessage());
        }

        $setlistFetched = 0;
        try {
            echo "[DEBUG] Backfilling setlists...\n";
            $setlistFetched = backfillMissingSetlists($aggregator);
        } catch (Throwable $e) {
            $aggregator->log('[SETLIST ERROR] Setlist backfill warning: ' . $e->getMessage());
        }

        if ($isCli) {
            echo "[CLI SYNC] Aggregator process completed successfully!\n";
            echo "Ticketmaster events: $tmCount\n";
            echo "Bandsintown events: $bitCount\n";
            echo "Scraped events: $scrapedCount\n";
            echo "Ignored events removed: $ignoredRemoved\n";
            echo "[LAST.FM NORMALIZER] Normalized $lastFmNormalizedCount artist genres.\n";
            echo "[SETLIST SYNC] Checked and cached $setlistFetched past setlists.\n";
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
            'logs' => $aggregator->getLogs()
        ]);
    } catch (Throwable $t) {
        $msg = "[FATAL EXCEPTION IN SYNC] " . $t->getMessage() . " in " . $t->getFile() . ":" . $t->getLine();
        echo $msg . "\n" . $t->getTraceAsString() . "\n";
        if (!$isCli) {
            jsonErrorResponse($msg);
        }
    }
}

if (basename(__FILE__) === basename($_SERVER['SCRIPT_FILENAME'] ?? '')) {
    $isCli = (php_sapi_name() === 'cli' || empty($_SERVER['REMOTE_ADDR']));
    handleSyncRequest($isCli);
}
