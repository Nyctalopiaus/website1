<?php

function handleGetSetlist() {
    $eventId = $_GET['event_id'] ?? $_POST['event_id'] ?? '';
    $db = getDbConnection();

    try {
        $stmtCache = $db->prepare("SELECT setlist_json FROM event_setlists WHERE event_id = :id");
        $stmtCache->execute([':id' => $eventId]);
        $cached = $stmtCache->fetchColumn();
        if ($cached !== false) {
            jsonResponse(['status' => 'success', 'songs' => json_decode($cached, true)]);
        }

        $stmtEvent = $db->prepare("SELECT artist_name, start_time, city_name FROM events WHERE event_id = :id");
        $stmtEvent->execute([':id' => $eventId]);
        $event = $stmtEvent->fetch();
        if (!$event) {
            jsonResponse(['status' => 'error', 'message' => 'Event not found in database.']);
        }

        $result = fetchSetlistFromSetlistFm($event['artist_name'], $event['start_time'], $event['city_name']);
        $songs = $result['songs'];

        if ($result['should_cache']) {
            $songsJson = json_encode($songs);
            $stmtInsert = $db->prepare("INSERT OR REPLACE INTO event_setlists (event_id, setlist_json) VALUES (:id, :json)");
            $stmtInsert->execute([
                ':id' => $eventId,
                ':json' => $songsJson
            ]);
        }

        jsonResponse(['status' => 'success', 'songs' => $songs]);
    } catch (Exception $e) {
        logServerException('setlist', $e);
        jsonResponse(['status' => 'error', 'message' => 'Unable to load the setlist right now.']);
    }
}
