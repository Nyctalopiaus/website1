<?php

function handleGetSetlist() {
    $eventId = $_GET['event_id'] ?? $_POST['event_id'] ?? '';
    $db = getDbConnection();

    $stmtEvent = $db->prepare("SELECT artist_name, start_time, city_name FROM events WHERE event_id = :id");
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
            if (isset($decoded['acts'])) {
                jsonResponse(['status' => 'success', 'acts' => $decoded['acts']]);
            } else if (is_array($decoded) && !$isSharedLineup) {
                jsonResponse(['status' => 'success', 'songs' => $decoded]);
            }
        }

        $acts = [];
        $allSongs = [];
        $shouldCacheAll = true;

        foreach ($artists as $artist) {
            $result = fetchSetlistFromSetlistFm($artist, $event['start_time'], $event['city_name']);
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

        if ($shouldCacheAll) {
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
