<?php

function ensureSyncCacheDir() {
    $cacheDir = __DIR__ . '/../cache';
    if (!is_dir($cacheDir)) {
        mkdir($cacheDir, 0755, true);
    }
    return $cacheDir;
}

function loadScrapedEventsForTarget(array $target, string $cacheDir, EventAggregator $aggregator, VenueScraper $scraper) {
    $cacheFile = $cacheDir . '/' . md5($target['venue_url']) . '.json';
    $cacheTTL = 604800;

    if (file_exists($cacheFile) && (time() - filemtime($cacheFile)) < $cacheTTL) {
        $aggregator->log("[CACHE] Loading shows for '{$target['venue_name']}' from local JSON cache.");
        return json_decode(file_get_contents($cacheFile), true) ?: [];
    }

    $scrapedEvents = $scraper->scrape($target['venue_url'], $target['selector']);
    if (!empty($scrapedEvents)) {
        file_put_contents($cacheFile, json_encode($scrapedEvents));
    }

    return $scrapedEvents;
}

function importScrapedVenueEvents(EventAggregator $aggregator, PDO $db) {
    $scrapedCount = 0;
    $scraper = new VenueScraper();
    $cacheDir = ensureSyncCacheDir();

    foreach (SCRAPER_TARGETS as $target) {
        $scrapedEvents = loadScrapedEventsForTarget($target, $cacheDir, $aggregator, $scraper);

        foreach ($scrapedEvents as $event) {
            $resolvedVenue = $aggregator->resolveTargetVenue($event['venue_name']);
            if (!$resolvedVenue) {
                continue;
            }

            $isMetal = $aggregator->isMetalArtist($event['artist_name']);
            if (!$isMetal) {
                $isMetal = $aggregator->fetchArtistGenreMetadata($event['artist_name']);
                if ($isMetal) {
                    $aggregator->log("[ENRICHMENT] Auto-approving band '{$event['artist_name']}' via MusicBrainz genre match.");
                    $stmtSeed = $db->prepare("INSERT OR IGNORE INTO metal_artists (artist_name) VALUES (:name)");
                    $stmtSeed->execute([':name' => $event['artist_name']]);
                }
            }

            $status = 'Approved';
            $eventId = $aggregator->generateDedupeKey($event['artist_name'], $resolvedVenue['venue_name'], $event['start_time'], $resolvedVenue['market']);

            $aggregator->saveEvent([
                'event_id' => $eventId,
                'artist_name' => $event['artist_name'],
                'venue_name' => $resolvedVenue['venue_name'],
                'city_name' => $event['city_name'],
                'start_time' => $event['start_time'],
                'ticket_url' => $event['ticket_url'],
                'status' => $status,
                'source' => $event['source'],
                'market' => $resolvedVenue['market']
            ]);
            $scrapedCount++;
        }

        foreach ($scraper->getLogs() as $log) {
            $aggregator->log('[SCRAPER] ' . $log);
        }
    }

    return $scrapedCount;
}

function persistLastSyncTimestamp() {
    $nowStr = date('Y-m-d H:i:s');
    $targets = [];

    // Primary app cache directory.
    $targets[] = __DIR__ . '/../cache';

    // Sync to sibling domain cache directories if running in multi-domain environment.
    $targets[] = dirname(__DIR__, 2) . '/metal-calendar/cache';
    $targets[] = dirname(__DIR__, 2) . '/nyctos-gig-grid/cache';

    $writeCount = 0;
    foreach (array_unique($targets) as $dir) {
        if (!is_dir($dir)) {
            // Only auto-create directories under this project root.
            if (strpos($dir, realpath(__DIR__ . '/..')) === 0) {
                if (!mkdir($dir, 0775, true) && !is_dir($dir)) {
                    error_log('[SYNC TIMESTAMP] Failed to create cache directory: ' . $dir);
                    continue;
                }
            } else {
                continue;
            }
        }

        $path = rtrim($dir, '/\\') . '/last_sync.txt';
        $written = file_put_contents($path, $nowStr, LOCK_EX);
        if ($written === false) {
            error_log('[SYNC TIMESTAMP] Failed to write last_sync.txt at: ' . $path);
            continue;
        }
        $writeCount++;
    }

    if ($writeCount === 0) {
        error_log('[SYNC TIMESTAMP] No last_sync.txt locations were updated.');
    }
}

function backfillMissingSetlists(EventAggregator $aggregator) {
    $setlistFetched = 0;

    try {
        $db = getDbConnection();
        $pastEvents = $db->query("
            SELECT e.event_id, e.artist_name, e.start_time, e.city_name
            FROM events e
            LEFT JOIN event_setlists s ON e.event_id = s.event_id
            WHERE e.status = 'Approved'
              AND e.start_time < datetime('now', 'localtime')
              AND s.event_id IS NULL
            ORDER BY e.start_time DESC
            LIMIT 10
        ")->fetchAll();

        foreach ($pastEvents as $pastEvent) {
            $result = fetchSetlistFromSetlistFm($pastEvent['artist_name'], $pastEvent['start_time'], $pastEvent['city_name']);
            $songsJson = json_encode($result['songs']);

            $stmtCacheInsert = $db->prepare("INSERT OR REPLACE INTO event_setlists (event_id, setlist_json) VALUES (:id, :json)");
            $stmtCacheInsert->execute([
                ':id' => $pastEvent['event_id'],
                ':json' => $songsJson
            ]);
            $setlistFetched++;
            usleep(500000);
        }
    } catch (Exception $e) {
        $aggregator->log('[SETLIST ERROR] Seeding setlist cache failed: ' . $e->getMessage());
    }

    return $setlistFetched;
}

function runDatabaseMaintenance(EventAggregator $aggregator, int $retentionDays = 4): array {
    $result = [
        'events_purged' => 0,
        'orphan_setlists_removed' => 0,
    ];

    try {
        $db = getDbConnection();
        $db->beginTransaction();

        $purgeStmt = $db->prepare("DELETE FROM events WHERE start_time < datetime('now', :window)");
        $purgeStmt->execute([':window' => '-' . max(1, $retentionDays) . ' days']);
        $result['events_purged'] = (int)$purgeStmt->rowCount();

        // event_setlists has no FK; remove orphan rows explicitly after event purge.
        $orphanStmt = $db->exec("DELETE FROM event_setlists WHERE event_id NOT IN (SELECT event_id FROM events)");
        $result['orphan_setlists_removed'] = (int)$orphanStmt;

        $db->commit();

        $aggregator->log("[MAINTENANCE] Purged {$result['events_purged']} events older than {$retentionDays} days.");
        $aggregator->log("[MAINTENANCE] Removed {$result['orphan_setlists_removed']} orphaned setlist cache rows.");
    } catch (Throwable $e) {
        if (isset($db) && $db->inTransaction()) {
            $db->rollBack();
        }
        $aggregator->log('[MAINTENANCE ERROR] Event retention cleanup failed: ' . $e->getMessage());
    }

    return $result;
}