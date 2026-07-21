<?php

function handleAddToLogbook() {
    $eventId = $_POST['event_id'] ?? '';
    $rating = isset($_POST['rating']) ? intval($_POST['rating']) : 5;
    $notes = trim($_POST['journal_notes'] ?? '');
    $media = trim($_POST['media_urls'] ?? '[]');
    $rating = max(1, min(5, $rating));

    $db = getDbConnection();
    try {
        $stmt = $db->prepare("INSERT OR REPLACE INTO attended_log (event_id, rating, journal_notes, media_urls) VALUES (:event_id, :rating, :notes, :media)");
        $stmt->execute([
            ':event_id' => $eventId,
            ':rating' => $rating,
            ':notes' => $notes,
            ':media' => $media
        ]);
        jsonResponse(['status' => 'success', 'message' => 'Show added to logbook archive.']);
    } catch (Exception $e) {
        jsonResponse(['status' => 'error', 'message' => $e->getMessage()]);
    }
}

function handleRemoveFromLogbook() {
    $eventId = $_POST['event_id'] ?? '';
    $db = getDbConnection();
    try {
        $stmt = $db->prepare("DELETE FROM attended_log WHERE event_id = :id");
        $stmt->execute([':id' => $eventId]);
        jsonResponse(['status' => 'success', 'message' => 'Show removed from logbook.']);
    } catch (Exception $e) {
        jsonResponse(['status' => 'error', 'message' => $e->getMessage()]);
    }
}
