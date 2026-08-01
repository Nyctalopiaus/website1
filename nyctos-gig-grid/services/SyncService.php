<?php

function ensureSyncCacheDir() {
    $cacheDir = __DIR__ . '/../cache/scrapers';
    if (!is_dir($cacheDir)) {
        mkdir($cacheDir, 0755, true);
    }
    $files = glob($cacheDir . '/*.json');
    if ($files) {
        $now = time();
        foreach ($files as $f) {
            if (is_file($f) && ($now - filemtime($f)) > 604800) {
                @unlink($f);
            }
        }
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

    $scrapedEvents = $scraper->scrape($target['venue_url'], $target['selector'], $aggregator);
    foreach ($scraper->getLogs() as $logMsg) {
        $aggregator->log("[SCRAPER] " . $logMsg);
    }
    if (!empty($scrapedEvents)) {
        file_put_contents($cacheFile, json_encode($scrapedEvents));
    }

    return $scrapedEvents;
}

function importScrapedVenueEvents(EventAggregator $aggregator, PDO $db, ?string $targetMarket = null) {
    $scrapedCount = 0;
    $cacheDir = ensureSyncCacheDir();

    // Query active scraped_venues from database table
    $dbTargets = [];
    try {
        $sqlV = "SELECT venue_name, scrape_url AS venue_url, xpath_container AS selector FROM scraped_venues WHERE is_active = 1";
        $paramsV = [];
        if (!empty($targetMarket) && strtolower($targetMarket) !== 'all') {
            $mLow = strtolower(trim($targetMarket));
            $marketGroup = [$mLow];
            if ($mLow === 'colorado') {
                $marketGroup = ['colorado', 'front-range'];
            } elseif ($mLow === 'california') {
                $marketGroup = ['california', 'socal', 'norcal'];
            } elseif ($mLow === 'uk') {
                $marketGroup = ['uk', 'scotland', 'england', 'wales', 'ireland'];
            }
            $inClause = implode(',', array_map(function($i) { return ":m{$i}"; }, array_keys($marketGroup)));
            $sqlV .= " AND LOWER(market) IN ({$inClause})";
            foreach ($marketGroup as $i => $mk) {
                $paramsV[":m{$i}"] = $mk;
            }
        }
        $stmtV = $db->prepare($sqlV);
        $stmtV->execute($paramsV);
        $dbTargets = $stmtV->fetchAll(PDO::FETCH_ASSOC);
    } catch (Exception $e) {
        $dbTargets = [];
    }

    if (!empty($targetMarket) && strtolower($targetMarket) !== 'all') {
        $targetsToUse = $dbTargets;
    } else {
        $targetsToUse = !empty($dbTargets) ? $dbTargets : (defined('SCRAPER_TARGETS') ? SCRAPER_TARGETS : []);
    }

    foreach ($targetsToUse as $target) {
        $scraper = new VenueScraper($db);
        $venueUrl = $target['venue_url'] ?? ($target['scrape_url'] ?? '');
        $venueName = trim((string)($target['venue_name'] ?? 'Unknown Venue'));
        $targetConfig = [
            'venue_name' => $venueName,
            'venue_url' => $venueUrl,
            'selector' => $target['selector'] ?? "//div[contains(@class, 'event')]"
        ];
        $sourceName = 'VenueScraper: ' . $venueName;
        $cacheFile = $cacheDir . '/' . md5($venueUrl) . '.json';
        $cacheTTL = 604800; // 7 days

        $isCached = (file_exists($cacheFile) && (time() - filemtime($cacheFile)) < $cacheTTL);
        $scrapedEvents = loadScrapedEventsForTarget($targetConfig, $cacheDir, $aggregator, $scraper);

        $eventsForThisVenue = 0;
        $venueMarket = 'front-range';
        foreach ($scrapedEvents as $event) {
            $resolvedVenue = $aggregator->resolveTargetVenue($event['venue_name'] ?? $venueName);
            if (!$resolvedVenue) {
                continue;
            }
            $venueMarket = $resolvedVenue['market'] ?? 'front-range';

            $isMetal = $aggregator->isMetalArtist($event['artist_name']);
            if (!$isMetal) {
                $isMetal = $aggregator->fetchArtistGenreMetadata($event['artist_name']);
                if ($isMetal) {
                    $approvedNames = $aggregator->seedApprovedArtistNames($event['artist_name']);
                    $aggregator->recordAutoApprovedArtists($approvedNames);
                    $aggregator->log("[ENRICHMENT] Auto-approving performer(s) '" . implode("', '", $approvedNames) . "' via MusicBrainz genre match.");
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
                'doors_time' => $event['doors_time'] ?? null,
                'ticket_url' => $event['ticket_url'],
                'status' => $status,
                'source' => $sourceName,
                'market' => $resolvedVenue['market']
            ]);
            $scrapedCount++;
            $eventsForThisVenue++;
        }

        $scraperLogs = $scraper->getLogs();
        $hasWarn = false;
        $proxyUsed = false;
        foreach ($scraperLogs as $log) {
            $aggregator->log('[SCRAPER] ' . $log);
            $logLower = strtolower((string)$log);
            if (strpos($logLower, '[proxy]') !== false) {
                $proxyUsed = true;
            }
            if (strpos($logLower, '[warn]') !== false || strpos($logLower, 'fallback') !== false || strpos($logLower, 'failed') !== false) {
                $aggregator->recordScraperDropout($log);
                $hasWarn = true;
            }
        }

        if ($isCached) {
            $runStatus = 'CACHED';
            $runDetails = "Loaded {$eventsForThisVenue} events from local JSON cache (< 7d)";
        } elseif ($hasWarn) {
            $runStatus = 'WARN';
            $runDetails = "Scraped {$eventsForThisVenue} events (simulation fallback)";
        } elseif ($proxyUsed) {
            $runStatus = 'SUCCESS';
            $runDetails = "Live scraped {$eventsForThisVenue} events (Scrape.do proxy)";
        } else {
            $runStatus = 'SUCCESS';
            $runDetails = "Live scraped {$eventsForThisVenue} events";
        }

        $aggregator->recordSourceRun($sourceName, $runStatus, $runDetails, 'Venue Scraper', $venueMarket);
    }

    return $scrapedCount;
}

function persistLastSyncTimestamp() {
    $nowStr = date('Y-m-d H:i:s');
    $targets = [
        __DIR__ . '/../cache',
        dirname(__DIR__) . '/cache'
    ];

    $writeCount = 0;
    foreach (array_unique($targets) as $dir) {
        if (!is_dir($dir)) {
            @mkdir($dir, 0755, true);
        }

        $path = rtrim($dir, '/\\') . '/last_sync.txt';
        $written = @file_put_contents($path, $nowStr, LOCK_EX);
        if ($written !== false) {
            $writeCount++;
        }
    }

    if ($writeCount === 0) {
        error_log('[SYNC TIMESTAMP] Failed to update last_sync.txt');
    }
}

function backfillMissingSetlists(EventAggregator $aggregator) {
    $setlistFetched = 0;

    try {
        $db = getDbConnection();
        $pastEvents = $db->query("
            SELECT e.event_id, e.artist_name, e.start_time, v.city
            FROM events e
            INNER JOIN venues v ON e.venue_id = v.venue_id
            LEFT JOIN event_setlists s ON e.event_id = s.event_id
            WHERE (e.is_approved = 1 OR e.status = 'Approved')
              AND e.start_time < datetime('now', 'localtime')
              AND s.event_id IS NULL
            ORDER BY e.start_time DESC
            LIMIT 10
        ")->fetchAll();

        foreach ($pastEvents as $pastEvent) {
            $result = fetchSetlistFromSetlistFm($pastEvent['artist_name'], $pastEvent['start_time'], $pastEvent['city'] ?? '');
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

        $cutoffDate = date('Y-m-d H:i:s', strtotime('-' . max(1, $retentionDays) . ' days'));

        $soonOldRows = $db->prepare("SELECT source, COALESCE(NULLIF(TRIM(market), ''), 'front-range') AS market_key, COUNT(*) AS cnt FROM events WHERE start_time < :cutoff GROUP BY source, market_key");
        $soonOldRows->execute([':cutoff' => $cutoffDate]);
        $purgeBreakdown = $soonOldRows->fetchAll(PDO::FETCH_ASSOC);

        $purgeStmt = $db->prepare("DELETE FROM events WHERE start_time < :cutoff");
        $purgeStmt->execute([':cutoff' => $cutoffDate]);
        $result['events_purged'] = (int)$purgeStmt->rowCount();

        foreach ($purgeBreakdown as $row) {
            $rawSources = array_filter(array_map('trim', explode(',', (string)($row['source'] ?? 'unknown'))));
            if (empty($rawSources)) {
                $rawSources = ['unknown'];
            }
            $marketKey = (string)($row['market_key'] ?? 'front-range');
            $count = (int)($row['cnt'] ?? 0);
            foreach ($rawSources as $sourceName) {
                $aggregator->recordPurgedCount($sourceName, $marketKey, $count);
            }
        }

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