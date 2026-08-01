<?php

function handleGetSetlist() {
    $eventId = $_GET['event_id'] ?? $_POST['event_id'] ?? '';
    $db = getDbConnection();

    $stmtEvent = $db->prepare("
        SELECT e.artist_name, e.start_time, COALESCE(sv.city_name, v.city, '') AS city 
        FROM events e 
        LEFT JOIN scraped_venues sv ON (e.venue_id = sv.id OR LOWER(TRIM(e.venue_name)) = LOWER(TRIM(sv.venue_name)))
        LEFT JOIN venues v ON (e.venue_id = v.venue_id OR LOWER(TRIM(e.venue_name)) = LOWER(TRIM(v.venue_name)))
        WHERE e.event_id = :id
    ");
    $stmtEvent->execute([':id' => $eventId]);
    $event = $stmtEvent->fetch();
    if (!$event) {
        jsonResponse(['status' => 'error', 'message' => 'Event not found in database.']);
    }

    $parts = preg_split('/\s*(&|w\/|with|,)\s*/i', (string)$event['artist_name']);
    $artists = [];
    foreach ($parts as $p) {
        $clean = trim($p);
        if ($clean !== '' && !in_array($clean, $artists, true)) {
            $artists[] = $clean;
        }
    }
    if (empty($artists)) {
        $artists = [trim((string)$event['artist_name'])];
    }
    $isSharedLineup = count($artists) > 1;

    try {
        $stmtCache = $db->prepare("SELECT setlist_json FROM event_setlists WHERE event_id = :id");
        $stmtCache->execute([':id' => $eventId]);
        $cached = $stmtCache->fetchColumn();
        if ($cached !== false) {
            $decoded = json_decode($cached, true);
            $hasCachedSongs = false;
            if (isset($decoded['acts']) && is_array($decoded['acts'])) {
                foreach ($decoded['acts'] as $act) {
                    if (!empty($act['songs'])) {
                        $hasCachedSongs = true;
                        break;
                    }
                }
            } else if (is_array($decoded) && count($decoded) > 0) {
                $hasCachedSongs = true;
            }

            if ($hasCachedSongs) {
                if (isset($decoded['acts'])) {
                    jsonResponse(['status' => 'success', 'acts' => $decoded['acts']]);
                } else if (is_array($decoded) && !$isSharedLineup) {
                    jsonResponse(['status' => 'success', 'songs' => $decoded]);
                }
            }
        }

        $acts = [];
        $allSongs = [];
        $shouldCacheAll = true;

        foreach ($artists as $artist) {
            $result = fetchSetlistFromSetlistFm($artist, $event['start_time'], $event['city'] ?? '');
            $songs = $result['songs'] ?? [];
            if (!$result['should_cache']) {
                $shouldCacheAll = false;
            }
            $acts[] = [
                'artist' => $artist,
                'songs' => $songs
            ];
            foreach ($songs as $s) {
                $allSongs[] = $s;
            }
        }

        if ($shouldCacheAll && !empty($allSongs)) {
            $cachePayload = json_encode(['acts' => $acts]);
            $stmtInsert = $db->prepare("INSERT OR REPLACE INTO event_setlists (event_id, setlist_json) VALUES (:id, :json)");
            $stmtInsert->execute([
                ':id' => $eventId,
                ':json' => $cachePayload
            ]);
        }

        jsonResponse([
            'status' => 'success',
            'acts' => $acts,
            'songs' => $allSongs
        ]);
    } catch (Exception $e) {
        logServerException('setlist', $e);
        jsonResponse(['status' => 'error', 'message' => 'Unable to load the setlist right now.']);
    }
}
