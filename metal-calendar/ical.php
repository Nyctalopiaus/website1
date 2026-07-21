<?php
/**
 * iCalendar (.ics) Export Endpoint
 */
require_once __DIR__ . '/db.php';

$eventId = $_GET['event_id'] ?? '';
if (empty($eventId)) {
    header('HTTP/1.1 400 Bad Request');
    die("Event ID is required");
}

$db = getDbConnection();
$stmt = $db->prepare("SELECT * FROM events WHERE event_id = :id");
$stmt->execute([':id' => $eventId]);
$event = $stmt->fetch();

if (!$event) {
    header('HTTP/1.1 404 Not Found');
    die("Event not found");
}

// Format clean filename from artist name
$cleanArtist = preg_replace('/[^a-zA-Z0-9_-]/', '', $event['artist_name']);
$filename = "concert-" . (empty($cleanArtist) ? "event" : $cleanArtist) . ".ics";

// Set correct iCalendar headers
header('Content-Type: text/calendar; charset=utf-8');
header('Content-Disposition: attachment; filename="' . $filename . '"');

// Format dates in UTC (iCalendar standard is YYYYMMDDTHHMMSSZ)
$timestamp = strtotime($event['start_time']);
$dtStart = gmdate('Ymd\THis\Z', $timestamp);
// Block 3 hours for the concert event block
$dtEnd = gmdate('Ymd\THis\Z', $timestamp + 10800);

// Helper to escape values for iCalendar formatting
function escapeIcs($str) {
    if ($str === null) return '';
    $str = str_replace('\\', '\\\\', $str);
    $str = str_replace(',', '\,', $str);
    $str = str_replace(';', '\;', $str);
    $str = str_replace("\n", '\\n', $str);
    $str = str_replace("\r", '', $str);
    return $str;
}

echo "BEGIN:VCALENDAR\r\n";
echo "VERSION:2.0\r\n";
echo "PRODID:-//Front Range Metal Passport//Concert Calendar//EN\r\n";
echo "CALSCALE:GREGORIAN\r\n";
echo "BEGIN:VEVENT\r\n";
echo "UID:" . $event['event_id'] . "@frontrangemetalpassport\r\n";
echo "DTSTAMP:" . gmdate('Ymd\THis\Z') . "\r\n";
echo "DTSTART:" . $dtStart . "\r\n";
echo "DTEND:" . $dtEnd . "\r\n";
echo "SUMMARY:" . escapeIcs($event['artist_name'] . " @ " . $event['venue_name']) . "\r\n";
echo "LOCATION:" . escapeIcs($event['venue_name'] . ", " . $event['city_name'] . ", CO") . "\r\n";
echo "DESCRIPTION:" . escapeIcs("Concert Details:\nArtist: " . $event['artist_name'] . "\nVenue: " . $event['venue_name'] . "\nTicket Link: " . ($event['ticket_url'] ?? 'N/A')) . "\r\n";
echo "END:VEVENT\r\n";
echo "END:VCALENDAR\r\n";
