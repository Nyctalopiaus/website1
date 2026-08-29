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

/**
 * Recurring safety net for duplicate events: merges any rows that share the same
 * resolved venue, calendar date, and (trimmed, case-insensitive) artist name. This is
 * intentionally a strict, exact-match criterion — unlike EventAggregator's ingestion-time
 * fuzzy matching, this runs unattended on every sync, so it only acts on cases with
 * effectively no false-positive risk. It exists to catch whatever occasionally slips past
 * both ingestion-time checks (see services/EventAggregator.php saveEvent()) rather than to
 * replace them.
 *
 * For each duplicate group, the "best" row is kept (preferring one with price data, a
 * ticket URL, and more populated fields overall) and the others are merged into it: their
 * `source` values are unioned in, empty fields on the survivor are backfilled from them,
 * and any event_price_history / attended_log / event_setlists / data_quality_event_flags
 * rows pointing at a merged-away event_id are re-pointed to the survivor before that row
 * is deleted, so no price history or attended-show data is lost in the merge.
 *
 * Safe to call against any events table, live or a standalone copy — it only touches the
 * `$db` connection it's given and runs entirely inside one transaction.
 */
function mergeDuplicateEvents(PDO $db, ?callable $log = null): array {
    $result = [
        'duplicate_groups_merged' => 0,
        'duplicate_rows_removed' => 0,
    ];
    $logFn = $log ?? function ($msg) {};

    $coalesceFields = [
        'ticket_url', 'ticketmaster_url', 'eventbrite_url', 'bandsintown_url', 'venue_url',
        'price_min', 'price_max', 'doors_time', 'tags', 'ticket_status_code', 'availability_tag',
    ];

    try {
        $db->beginTransaction();

        $groups = $db->query("
            SELECT venue_id, DATE(start_time) AS event_date, LOWER(TRIM(artist_name)) AS artist_key, COUNT(*) AS cnt
            FROM events
            WHERE venue_id IS NOT NULL
            GROUP BY venue_id, event_date, artist_key
            HAVING cnt > 1
        ")->fetchAll(PDO::FETCH_ASSOC);

        if (!empty($groups)) {
            $selectGroupStmt = $db->prepare("
                SELECT * FROM events
                WHERE venue_id = :venue_id AND DATE(start_time) = :edate AND LOWER(TRIM(artist_name)) = :akey
                ORDER BY
                    CASE WHEN price_min IS NOT NULL THEN 0 ELSE 1 END,
                    CASE WHEN ticket_url IS NOT NULL AND ticket_url != '' THEN 0 ELSE 1 END,
                    (LENGTH(COALESCE(tags,'')) + LENGTH(COALESCE(ticket_status_code,'')) + LENGTH(COALESCE(availability_tag,''))) DESC,
                    created_at ASC
            ");

            foreach ($groups as $g) {
                $selectGroupStmt->execute([
                    ':venue_id' => $g['venue_id'],
                    ':edate' => $g['event_date'],
                    ':akey' => $g['artist_key'],
                ]);
                $rows = $selectGroupStmt->fetchAll(PDO::FETCH_ASSOC);
                $selectGroupStmt->closeCursor();
                if (count($rows) < 2) {
                    continue;
                }

                $canonical = array_shift($rows);
                $canonicalId = $canonical['event_id'];

                $sourceParts = array_filter(array_map('trim', explode(',', (string)$canonical['source'])));
                foreach ($rows as $loser) {
                    foreach (array_filter(array_map('trim', explode(',', (string)$loser['source']))) as $s) {
                        if ($s !== '' && !in_array($s, $sourceParts, true)) {
                            $sourceParts[] = $s;
                        }
                    }
                }
                $mergedSource = implode(',', $sourceParts);

                $updates = [':source' => $mergedSource];
                $setSql = ['source = :source'];
                foreach ($coalesceFields as $f) {
                    if ($canonical[$f] === null || $canonical[$f] === '') {
                        foreach ($rows as $loser) {
                            if (isset($loser[$f]) && $loser[$f] !== null && $loser[$f] !== '') {
                                $updates[":$f"] = $loser[$f];
                                $setSql[] = "$f = :$f";
                                break;
                            }
                        }
                    }
                }
                // Union boolean flags rather than overwrite: sold-out/low-ticket status from
                // any source is meaningful even if the survivor's own row didn't carry it.
                $soldOut = (int)$canonical['sold_out_flag'];
                $lowTicket = (int)$canonical['low_ticket_flag'];
                foreach ($rows as $loser) {
                    $soldOut = max($soldOut, (int)$loser['sold_out_flag']);
                    $lowTicket = max($lowTicket, (int)$loser['low_ticket_flag']);
                }
                $updates[':sold_out_flag'] = $soldOut;
                $updates[':low_ticket_flag'] = $lowTicket;
                $setSql[] = 'sold_out_flag = :sold_out_flag';
                $setSql[] = 'low_ticket_flag = :low_ticket_flag';

                $updates[':id'] = $canonicalId;
                $db->prepare('UPDATE events SET ' . implode(', ', $setSql) . ' WHERE event_id = :id')->execute($updates);

                foreach ($rows as $loser) {
                    $loserId = $loser['event_id'];

                    // Re-point child rows to the survivor before deleting the loser event —
                    // event_price_history and attended_log cascade-delete on events (ON DELETE
                    // CASCADE, foreign_keys=ON), so this must happen first or that data is lost.
                    $db->prepare('UPDATE event_price_history SET event_id = :new WHERE event_id = :old')
                        ->execute([':new' => $canonicalId, ':old' => $loserId]);

                    // attended_log.event_id and event_setlists.event_id are each unique/PK, so
                    // only move the loser's row over if the survivor doesn't already have one;
                    // otherwise just drop the now-redundant loser row.
                    $db->prepare('UPDATE attended_log SET event_id = :new WHERE event_id = :old AND NOT EXISTS (SELECT 1 FROM attended_log WHERE event_id = :new2)')
                        ->execute([':new' => $canonicalId, ':old' => $loserId, ':new2' => $canonicalId]);
                    $db->prepare('DELETE FROM attended_log WHERE event_id = :old')->execute([':old' => $loserId]);

                    $db->prepare('UPDATE event_setlists SET event_id = :new WHERE event_id = :old AND NOT EXISTS (SELECT 1 FROM event_setlists WHERE event_id = :new2)')
                        ->execute([':new' => $canonicalId, ':old' => $loserId, ':new2' => $canonicalId]);
                    $db->prepare('DELETE FROM event_setlists WHERE event_id = :old')->execute([':old' => $loserId]);

                    $db->prepare('UPDATE data_quality_event_flags SET event_id = :new WHERE event_id = :old')
                        ->execute([':new' => $canonicalId, ':old' => $loserId]);

                    $db->prepare('DELETE FROM events WHERE event_id = :id')->execute([':id' => $loserId]);
                    $result['duplicate_rows_removed']++;
                }

                $result['duplicate_groups_merged']++;
            }
        }

        $db->commit();

        if ($result['duplicate_groups_merged'] > 0) {
            $logFn("[DEDUPE MAINTENANCE] Merged {$result['duplicate_groups_merged']} duplicate event group(s), removing {$result['duplicate_rows_removed']} redundant row(s).");
        }
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        $logFn('[DEDUPE MAINTENANCE ERROR] Duplicate merge pass failed: ' . $e->getMessage());
    }

    return $result;
}

/**
 * Second duplicate-merge pass, complementary to mergeDuplicateEvents() above: that function
 * only catches rows that already agree on artist_name. This one catches rows that are
 * provably the *same vendor ticket listing* (same terminal ticket_url ID — see
 * EventAggregator::extractTicketingId()) on the same calendar date even when the artist_name
 * text differs too much to match on its own — a branded show title vs. its lineup, or two
 * different co-bill members each captured as "the" artist on separate scrapes of the same
 * page. saveEvent()'s ingestion-time Layer 4 check prevents new instances of this; this pass
 * cleans up whatever already exists (historical data, or anything that slipped past
 * ingestion because it went through a code path other than saveEvent()).
 *
 * Requires the same calendar date in addition to a matching ticket ID: production data
 * included rows with a stale/reused ticket_url pointing at an unrelated date (see
 * extractTicketingId()'s docblock), so ID equality alone isn't a safe merge trigger.
 *
 * Artist names are combined via EventAggregator::mergePerformerNames() rather than the
 * survivor simply keeping its own — that's what turns "Kingdom Collapse" + "Another Shade of
 * Hate" (two rows, same ticket listing) into one row billed as both, instead of silently
 * dropping whichever side didn't survive.
 */
function mergeSameTicketingIdEvents(PDO $db, EventAggregator $aggregator, ?callable $log = null): array {
    $result = [
        'ticket_id_groups_merged' => 0,
        'ticket_id_rows_removed' => 0,
    ];
    $logFn = $log ?? function ($msg) {};

    $coalesceFields = [
        'ticket_url', 'ticketmaster_url', 'eventbrite_url', 'bandsintown_url', 'venue_url',
        'price_min', 'price_max', 'doors_time', 'tags', 'ticket_status_code', 'availability_tag',
    ];

    $groups = [];
    try {
        $rows = $db->query("SELECT * FROM events WHERE ticket_url IS NOT NULL AND ticket_url != ''")->fetchAll(PDO::FETCH_ASSOC);
        foreach ($rows as $row) {
            $ticketId = $aggregator->extractTicketingId($row['ticket_url']);
            if ($ticketId === null) {
                continue;
            }
            $eventDate = substr((string)$row['start_time'], 0, 10);
            $groupKey = $eventDate . '|' . $ticketId;
            $groups[$groupKey][] = $row;
        }
    } catch (Throwable $e) {
        $logFn('[DEDUPE MAINTENANCE ERROR] Same-ticket-ID merge pass failed to load candidates: ' . $e->getMessage());
        return $result;
    }

    // Each group commits independently (rather than one transaction around the whole pass):
    // the merged artist_name occasionally collides with idx_events_dedupe_backstop (a
    // *different*, unrelated row already sitting at that venue_id+date+artist combo) — a rare
    // edge case, but with one shared transaction a single such collision would roll back every
    // other group's already-good merge in the same run. Isolating per group means one skipped
    // collision costs only that group, logged and left for the next run / manual review.
    foreach ($groups as $groupRows) {
        if (count($groupRows) < 2) {
            continue;
        }

        try {
            $db->beginTransaction();

            // Same "most complete" survivor heuristic as mergeDuplicateEvents(): price data,
            // then a ticket URL, then more populated secondary fields, then the oldest row.
            usort($groupRows, function ($a, $b) {
                $score = function ($r) {
                    $s = 0;
                    $s += ($r['price_min'] !== null) ? 2 : 0;
                    $s += (!empty($r['ticket_url'])) ? 1 : 0;
                    $s += strlen((string)($r['tags'] ?? '')) + strlen((string)($r['ticket_status_code'] ?? '')) + strlen((string)($r['availability_tag'] ?? ''));
                    return $s;
                };
                $sa = $score($a);
                $sb = $score($b);
                if ($sa !== $sb) {
                    return $sb <=> $sa;
                }
                return strcmp((string)($a['created_at'] ?? ''), (string)($b['created_at'] ?? ''));
            });

            $canonical = array_shift($groupRows);
            $canonicalId = $canonical['event_id'];

            $mergedArtist = $canonical['artist_name'];
            foreach ($groupRows as $loser) {
                $mergedArtist = $aggregator->mergePerformerNames($mergedArtist, $loser['artist_name']);
            }

            $sourceParts = array_filter(array_map('trim', explode(',', (string)$canonical['source'])));
            foreach ($groupRows as $loser) {
                foreach (array_filter(array_map('trim', explode(',', (string)$loser['source']))) as $s) {
                    if ($s !== '' && !in_array($s, $sourceParts, true)) {
                        $sourceParts[] = $s;
                    }
                }
            }
            $mergedSource = implode(',', $sourceParts);

            $updates = [':source' => $mergedSource, ':artist_name' => $mergedArtist];
            $setSql = ['source = :source', 'artist_name = :artist_name'];
            foreach ($coalesceFields as $f) {
                if ($canonical[$f] === null || $canonical[$f] === '') {
                    foreach ($groupRows as $loser) {
                        if (isset($loser[$f]) && $loser[$f] !== null && $loser[$f] !== '') {
                            $updates[":$f"] = $loser[$f];
                            $setSql[] = "$f = :$f";
                            break;
                        }
                    }
                }
            }
            $soldOut = (int)$canonical['sold_out_flag'];
            $lowTicket = (int)$canonical['low_ticket_flag'];
            foreach ($groupRows as $loser) {
                $soldOut = max($soldOut, (int)$loser['sold_out_flag']);
                $lowTicket = max($lowTicket, (int)$loser['low_ticket_flag']);
            }
            $updates[':sold_out_flag'] = $soldOut;
            $updates[':low_ticket_flag'] = $lowTicket;
            $setSql[] = 'sold_out_flag = :sold_out_flag';
            $setSql[] = 'low_ticket_flag = :low_ticket_flag';

            $updates[':id'] = $canonicalId;
            $db->prepare('UPDATE events SET ' . implode(', ', $setSql) . ' WHERE event_id = :id')->execute($updates);

            foreach ($groupRows as $loser) {
                $loserId = $loser['event_id'];

                $db->prepare('UPDATE event_price_history SET event_id = :new WHERE event_id = :old')
                    ->execute([':new' => $canonicalId, ':old' => $loserId]);

                $db->prepare('UPDATE attended_log SET event_id = :new WHERE event_id = :old AND NOT EXISTS (SELECT 1 FROM attended_log WHERE event_id = :new2)')
                    ->execute([':new' => $canonicalId, ':old' => $loserId, ':new2' => $canonicalId]);
                $db->prepare('DELETE FROM attended_log WHERE event_id = :old')->execute([':old' => $loserId]);

                $db->prepare('UPDATE event_setlists SET event_id = :new WHERE event_id = :old AND NOT EXISTS (SELECT 1 FROM event_setlists WHERE event_id = :new2)')
                    ->execute([':new' => $canonicalId, ':old' => $loserId, ':new2' => $canonicalId]);
                $db->prepare('DELETE FROM event_setlists WHERE event_id = :old')->execute([':old' => $loserId]);

                $db->prepare('UPDATE data_quality_event_flags SET event_id = :new WHERE event_id = :old')
                    ->execute([':new' => $canonicalId, ':old' => $loserId]);
                $db->prepare('UPDATE data_quality_double_bill_flags SET event_id = :new WHERE event_id = :old')
                    ->execute([':new' => $canonicalId, ':old' => $loserId]);

                $db->prepare('DELETE FROM events WHERE event_id = :id')->execute([':id' => $loserId]);
                $result['ticket_id_rows_removed']++;
            }

            $db->commit();
            $result['ticket_id_groups_merged']++;
        } catch (Throwable $e) {
            if ($db->inTransaction()) {
                $db->rollBack();
            }
            $logFn('[DEDUPE MAINTENANCE WARN] Skipped one same-ticket-ID group (' . ($canonical['event_id'] ?? '?') . '): ' . $e->getMessage());
        }
    }

    if ($result['ticket_id_groups_merged'] > 0) {
        $logFn("[DEDUPE MAINTENANCE] Merged {$result['ticket_id_groups_merged']} same-ticket-listing group(s), removing {$result['ticket_id_rows_removed']} redundant row(s).");
    }

    return $result;
}

/**
 * Flags — but does not auto-merge — groups of events sharing the same resolved venue and
 * exact start_time under different artist_name text. Auto-merging these is unsafe: an audit
 * of production data found that the majority of such collisions are NOT duplicates at all,
 * they're a false-collision artifact of venues whose feed/scraper doesn't capture a real
 * per-event time and so defaults most of that venue's listings to one fixed time-of-day (e.g.
 * one club's events were 64% "12:30" regardless of the actual show) — two genuinely unrelated
 * shows on the same date there share venue+time purely because neither has a real time. This
 * function skips a venue's dominant time-of-day (>=30% of its own events) for exactly that
 * reason. What's left is a mix of real co-headline/double-bill tours (each artist legitimately
 * has their own feed listing for one show) and still-possible coincidences at larger venues —
 * distinguishing those needs a human, hence the review queue in
 * admin_double_bills.php rather than an automatic merge.
 *
 * Idempotent across runs: a group already flagged (in any resolved state) is never
 * re-flagged, so a group a human already reviewed and dismissed won't keep reappearing.
 */
function flagPossibleDoubleBills(PDO $db, ?callable $log = null): array {
    $result = ['double_bill_groups_flagged' => 0];
    $logFn = $log ?? function ($msg) {};

    try {
        $todRows = $db->query("
            SELECT venue_id, strftime('%H:%M', start_time) AS tod, COUNT(*) AS cnt
            FROM events
            WHERE venue_id IS NOT NULL
            GROUP BY venue_id, tod
        ")->fetchAll(PDO::FETCH_ASSOC);

        $venueTotals = [];
        $venueDominant = []; // venue_id => ['tod' => ..., 'cnt' => ...]
        foreach ($todRows as $r) {
            $vid = (int)$r['venue_id'];
            $cnt = (int)$r['cnt'];
            $venueTotals[$vid] = ($venueTotals[$vid] ?? 0) + $cnt;
            if (!isset($venueDominant[$vid]) || $cnt > $venueDominant[$vid]['cnt']) {
                $venueDominant[$vid] = ['tod' => $r['tod'], 'cnt' => $cnt];
            }
        }

        $groups = $db->query("
            SELECT venue_id, start_time, COUNT(*) AS cnt
            FROM events
            WHERE venue_id IS NOT NULL
            GROUP BY venue_id, start_time
            HAVING COUNT(DISTINCT artist_name) > 1
        ")->fetchAll(PDO::FETCH_ASSOC);

        $existsStmt = $db->prepare("SELECT COUNT(*) FROM data_quality_double_bill_flags WHERE group_key = :gk");
        $membersStmt = $db->prepare("SELECT event_id, artist_name, venue_name FROM events WHERE venue_id = :vid AND start_time = :st");
        $insertStmt = $db->prepare("
            INSERT INTO data_quality_double_bill_flags (group_key, event_id, venue_id, venue_name, start_time, artist_name, reason)
            VALUES (:group_key, :event_id, :venue_id, :venue_name, :start_time, :artist_name, 'possible_double_bill')
        ");

        foreach ($groups as $g) {
            $vid = (int)$g['venue_id'];
            $startTime = $g['start_time'];
            $tod = substr((string)$startTime, 11, 5);

            $dominant = $venueDominant[$vid] ?? null;
            $total = $venueTotals[$vid] ?? 0;
            if ($dominant !== null && $total > 0 && $dominant['tod'] === $tod && ($dominant['cnt'] / $total) >= 0.3) {
                continue; // placeholder-time venue — same-time collision isn't a duplicate signal here
            }

            $groupKey = $vid . '|' . $startTime;
            $existsStmt->execute([':gk' => $groupKey]);
            if ((int)$existsStmt->fetchColumn() > 0) {
                continue; // already flagged (and possibly already reviewed) previously
            }

            $membersStmt->execute([':vid' => $vid, ':st' => $startTime]);
            $members = $membersStmt->fetchAll(PDO::FETCH_ASSOC);
            if (count($members) < 2) {
                continue;
            }

            foreach ($members as $m) {
                $insertStmt->execute([
                    ':group_key' => $groupKey,
                    ':event_id' => $m['event_id'],
                    ':venue_id' => $vid,
                    ':venue_name' => $m['venue_name'],
                    ':start_time' => $startTime,
                    ':artist_name' => $m['artist_name'],
                ]);
            }
            $result['double_bill_groups_flagged']++;
        }

        if ($result['double_bill_groups_flagged'] > 0) {
            $logFn("[DEDUPE MAINTENANCE] Flagged {$result['double_bill_groups_flagged']} new possible-double-bill group(s) for review.");
        }
    } catch (Throwable $e) {
        $logFn('[MAINTENANCE ERROR] Possible-double-bill flagging pass failed: ' . $e->getMessage());
    }

    return $result;
}

/**
 * Scans events in the database and purges any out-of-market shows that were mistakenly ingested.
 * Also cleans up orphaned double-bill flags after purging.
 */
function purgeInvalidMarketEvents(PDO $db, EventAggregator $aggregator, ?callable $log = null): array {
    $result = [
        'invalid_events_purged' => 0,
        'double_bill_flags_auto_resolved' => 0
    ];
    $logFn = $log ?? function ($msg) {};

    try {
        // city_name was dropped from events (db/schema.php) in favor of venues.city, joined via venue_id.
        $events = $db->query("
            SELECT e.event_id, e.artist_name, e.venue_name, v.city AS city_name, e.market, e.ticket_url, e.bandsintown_url, e.ticketmaster_url, e.eventbrite_url, e.venue_url
            FROM events e
            LEFT JOIN venues v ON v.venue_id = e.venue_id
        ")->fetchAll(PDO::FETCH_ASSOC);

        $toPurge = [];
        foreach ($events as $e) {
            $m = $e['market'] ?? 'colorado';
            $city = $e['city_name'] ?? '';
            $urls = ($e['ticket_url'] ?? '') . ' ' . ($e['bandsintown_url'] ?? '') . ' ' . ($e['ticketmaster_url'] ?? '') . ' ' . ($e['eventbrite_url'] ?? '') . ' ' . ($e['venue_url'] ?? '');
            
            // Check region via EventAggregator
            $isValid = $aggregator->isEventInMarketRegion($m, $city, '', '');

            // Extra string inspection for out-of-scope state indications in ticket URLs or city text.
            // The 2-letter state-code segment must sit directly in front of the URL's date
            // segment (how these ticket URLs actually encode location, e.g. "...-ks-08-15-2026")
            // rather than a bare "\b-xx-\b" match, which false-positives on artist/tour names
            // that happen to contain a state code as a substring (e.g. "Ma Vie" -> "-ma-",
            // "Keb' Mo'" -> "-mo-", "Tommy WÁ" -> "-wa-", "Matt Pond PA" -> "-pa-", "Guns or
            // Roses" -> "-or-") and was purging legitimate events once this pass actually ran.
            if ($isValid && (preg_match('/\b(misouri|missouri)\b/i', $urls)
                || preg_match('/\-(mo|oh|ks|ma|nc|pa|fl|ut|ne|ny|wa|or|az|il)\-\d{1,2}\-\d{1,2}\-\d{4}\b/i', $urls))) {
                $isValid = false;
            }

            if (!$isValid) {
                $toPurge[] = $e['event_id'];
            }
        }

        if (!empty($toPurge)) {
            $db->beginTransaction();
            $inClause = implode(',', array_fill(0, count($toPurge), '?'));
            
            // Remove from child tables
            foreach (['event_price_history', 'attended_log', 'event_setlists', 'data_quality_event_flags'] as $tbl) {
                $stmt = $db->prepare("DELETE FROM {$tbl} WHERE event_id IN ({$inClause})");
                $stmt->execute($toPurge);
            }

            $stmtDel = $db->prepare("DELETE FROM events WHERE event_id IN ({$inClause})");
            $stmtDel->execute($toPurge);
            $result['invalid_events_purged'] = count($toPurge);

            $db->commit();
            $logFn("[MAINTENANCE] Purged {$result['invalid_events_purged']} out-of-market/poisoned event(s).");
        }

        // Auto-resolve orphaned double bill flags with < 2 live events
        $flagRows = $db->query("
            SELECT f.id, f.group_key, f.event_id, e.artist_name
            FROM data_quality_double_bill_flags f
            LEFT JOIN events e ON e.event_id = f.event_id
            WHERE f.resolved = 0
        ")->fetchAll(PDO::FETCH_ASSOC);

        $groups = [];
        foreach ($flagRows as $r) {
            $groups[$r['group_key']][] = $r;
        }

        $staleGroupKeys = [];
        foreach ($groups as $gk => $rows) {
            $liveCount = count(array_filter($rows, function ($r) { return $r['artist_name'] !== null; }));
            if ($liveCount < 2) {
                $staleGroupKeys[] = $gk;
            }
        }

        if (!empty($staleGroupKeys)) {
            $in = implode(',', array_fill(0, count($staleGroupKeys), '?'));
            $stmtRes = $db->prepare("UPDATE data_quality_double_bill_flags SET resolved = 1, resolution = 'auto_resolved_purged', resolved_at = CURRENT_TIMESTAMP WHERE group_key IN ({$in})");
            $stmtRes->execute($staleGroupKeys);
            $result['double_bill_flags_auto_resolved'] = count($staleGroupKeys);
            $logFn("[MAINTENANCE] Auto-resolved {$result['double_bill_flags_auto_resolved']} stale double-bill flag group(s).");
        }
    } catch (Throwable $e) {
        if ($db->inTransaction()) {
            $db->rollBack();
        }
        $logFn('[MAINTENANCE ERROR] Purge invalid market events pass failed: ' . $e->getMessage());
    }

    return $result;
}

function purgeDeadTicketUrls(PDO $db, EventAggregator $aggregator, int $batchSize = 50, ?callable $log = null): array {
    $logFn = $log ?? function ($msg) use ($aggregator) { $aggregator->log($msg); };
    $stats = [
        'dead_urls_checked' => 0,
        'dead_urls_cleared' => 0,
    ];

    $cutoffCheck = date('Y-m-d H:i:s', strtotime('-3 days'));
    $nowStr = date('Y-m-d H:i:s');

    $stmt = $db->prepare("
        SELECT event_id, artist_name, venue_name, ticket_url
        FROM events
        WHERE ticket_url IS NOT NULL AND TRIM(ticket_url) != ''
          AND start_time >= DATE('now', '-1 day')
          AND (last_url_checked_at IS NULL OR last_url_checked_at < :cutoff)
        ORDER BY last_url_checked_at ASC, start_time ASC
        LIMIT :limit
    ");
    $stmt->bindValue(':cutoff', $cutoffCheck);
    $stmt->bindValue(':limit', (int)$batchSize, PDO::PARAM_INT);
    $stmt->execute();
    $candidates = $stmt->fetchAll(PDO::FETCH_ASSOC);

    if (empty($candidates)) {
        return $stats;
    }

    $logFn("[MAINTENANCE] Checking " . count($candidates) . " upcoming event ticket URLs for dead links...");

    $mh = curl_multi_init();
    $curlHandles = [];

    foreach ($candidates as $idx => $cand) {
        $url = trim($cand['ticket_url']);
        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS => 5,
            CURLOPT_TIMEOUT => 6,
            CURLOPT_CONNECTTIMEOUT => 4,
            CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            CURLOPT_RANGE => '0-4096',
        ]);
        curl_multi_add_handle($mh, $ch);
        $curlHandles[$idx] = [
            'ch' => $ch,
            'event' => $cand,
        ];
    }

    $active = null;
    do {
        $mrc = curl_multi_exec($mh, $active);
    } while ($mrc == CURLM_CALL_MULTI_PERFORM);

    while ($active && $mrc == CURLM_OK) {
        if (curl_multi_select($mh) != -1) {
            do {
                $mrc = curl_multi_exec($mh, $active);
            } while ($mrc == CURLM_CALL_MULTI_PERFORM);
        } else {
            usleep(10000);
        }
    }

    $stmtOk = $db->prepare("UPDATE events SET last_url_checked_at = :now, url_status = 'ok' WHERE event_id = :id");
    $stmtDead = $db->prepare("
        UPDATE events 
        SET last_url_checked_at = :now, 
            url_status = 'dead_404', 
            ticket_url = NULL,
            ticketmaster_url = CASE WHEN ticketmaster_url = :url THEN NULL ELSE ticketmaster_url END,
            eventbrite_url = CASE WHEN eventbrite_url = :url THEN NULL ELSE eventbrite_url END,
            bandsintown_url = CASE WHEN bandsintown_url = :url THEN NULL ELSE bandsintown_url END
        WHERE event_id = :id
    ");

    foreach ($curlHandles as $item) {
        $ch = $item['ch'];
        $cand = $item['event'];
        $stats['dead_urls_checked']++;

        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $body = curl_multi_getcontent($ch);
        curl_multi_remove_handle($mh, $ch);
        @curl_close($ch);

        $isDead = false;
        $reason = '';

        if ($httpCode === 404 || $httpCode === 410) {
            $isDead = true;
            $reason = "HTTP {$httpCode}";
        } elseif ($httpCode >= 200 && $httpCode < 400 && !empty($body)) {
            $bodyLower = strtolower($body);
            if (
                strpos($bodyLower, 'cannot be located') !== false ||
                strpos($bodyLower, 'page you\'re looking for cannot be located') !== false ||
                strpos($bodyLower, 'event no longer exists') !== false ||
                strpos($bodyLower, 'this event has been removed') !== false
            ) {
                $isDead = true;
                $reason = "Soft-404 text in HTML";
            }
        }

        if ($isDead) {
            $stmtDead->execute([
                ':now' => $nowStr,
                ':url' => $cand['ticket_url'],
                ':id' => $cand['event_id'],
            ]);
            $stats['dead_urls_cleared']++;
            $logFn("[DEAD LINK] Cleared dead ticket URL ({$reason}) for '{$cand['artist_name']}' @ '{$cand['venue_name']}': {$cand['ticket_url']}");
        } else {
            $stmtOk->execute([
                ':now' => $nowStr,
                ':id' => $cand['event_id'],
            ]);
        }
    }

    curl_multi_close($mh);
    $logFn("[MAINTENANCE] Checked {$stats['dead_urls_checked']} ticket URLs; cleared {$stats['dead_urls_cleared']} dead links.");
    return $stats;
}

function runDatabaseMaintenance(EventAggregator $aggregator, int $retentionDays = 4): array {
    $result = [
        'events_purged' => 0,
        'orphan_setlists_removed' => 0,
        'duplicate_groups_merged' => 0,
        'duplicate_rows_removed' => 0,
        'ticket_id_groups_merged' => 0,
        'ticket_id_rows_removed' => 0,
        'double_bill_groups_flagged' => 0,
        'invalid_events_purged' => 0,
        'double_bill_flags_auto_resolved' => 0,
        'dead_urls_checked' => 0,
        'dead_urls_cleared' => 0,
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

    try {
        $dedupeResult = mergeDuplicateEvents($db, function ($msg) use ($aggregator) {
            $aggregator->log($msg);
        });
        $result['duplicate_groups_merged'] = $dedupeResult['duplicate_groups_merged'];
        $result['duplicate_rows_removed'] = $dedupeResult['duplicate_rows_removed'];
    } catch (Throwable $e) {
        $aggregator->log('[MAINTENANCE ERROR] Duplicate merge pass failed: ' . $e->getMessage());
    }

    try {
        $ticketIdResult = mergeSameTicketingIdEvents($db, $aggregator, function ($msg) use ($aggregator) {
            $aggregator->log($msg);
        });
        $result['ticket_id_groups_merged'] = $ticketIdResult['ticket_id_groups_merged'];
        $result['ticket_id_rows_removed'] = $ticketIdResult['ticket_id_rows_removed'];
    } catch (Throwable $e) {
        $aggregator->log('[MAINTENANCE ERROR] Same-ticket-ID merge pass failed: ' . $e->getMessage());
    }

    try {
        $purgeResult = purgeInvalidMarketEvents($db, $aggregator, function ($msg) use ($aggregator) {
            $aggregator->log($msg);
        });
        $result['invalid_events_purged'] = $purgeResult['invalid_events_purged'];
        $result['double_bill_flags_auto_resolved'] = $purgeResult['double_bill_flags_auto_resolved'];
    } catch (Throwable $e) {
        $aggregator->log('[MAINTENANCE ERROR] Out-of-market events purge pass failed: ' . $e->getMessage());
    }

    try {
        $deadUrlResult = purgeDeadTicketUrls($db, $aggregator, 50, function ($msg) use ($aggregator) {
            $aggregator->log($msg);
        });
        $result['dead_urls_checked'] = $deadUrlResult['dead_urls_checked'];
        $result['dead_urls_cleared'] = $deadUrlResult['dead_urls_cleared'];
    } catch (Throwable $e) {
        $aggregator->log('[MAINTENANCE ERROR] Dead ticket URL cleanup pass failed: ' . $e->getMessage());
    }

    // Runs last, after both merge passes above have had a chance to resolve same-listing
    // duplicates on their own — anything still sharing venue+time under different artist
    // names at this point genuinely needs a human look rather than an automatic merge.
    try {
        $doubleBillResult = flagPossibleDoubleBills($db, function ($msg) use ($aggregator) {
            $aggregator->log($msg);
        });
        $result['double_bill_groups_flagged'] = $doubleBillResult['double_bill_groups_flagged'];
    } catch (Throwable $e) {
        $aggregator->log('[MAINTENANCE ERROR] Possible-double-bill flagging pass failed: ' . $e->getMessage());
    }

    return $result;
}