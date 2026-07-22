<?php

function handleSyncRequest(bool $isCli = false) {
    if (!$isCli) {
        header('Content-Type: application/json');
    } else {
        echo "[CLI SYNC] Initializing aggregator processes...\n";
    }

    $aggregator = new EventAggregator();
    $tmCount = $aggregator->fetchTicketmaster();
    $bitCount = $aggregator->fetchBandsintown();
    $db = getDbConnection();

    $scrapedCount = importScrapedVenueEvents($aggregator, $db);
    $ignoredRemoved = $aggregator->purgeIgnoredEvents();
    persistLastSyncTimestamp();
    $setlistFetched = backfillMissingSetlists($aggregator);

    if ($isCli) {
        echo "[CLI SYNC] Aggregator process completed successfully!\n";
        echo "Ticketmaster events: $tmCount\n";
        echo "Bandsintown events: $bitCount\n";
        echo "Scraped events: $scrapedCount\n";
        echo "Ignored events removed: $ignoredRemoved\n";
        echo "[SETLIST SYNC] Checked and cached $setlistFetched past setlists.\n";
        exit;
    }

    jsonResponse([
        'status' => 'success',
        'ticketmaster_events' => $tmCount,
        'bandsintown_events' => $bitCount,
        'scraped_events' => $scrapedCount,
        'ignored_removed' => $ignoredRemoved,
        'setlists_cached' => $setlistFetched,
        'logs' => $aggregator->getLogs()
    ]);
}
