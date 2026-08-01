<?php
/**
 * API Endpoint: Save Admin Review Rules (Enterprise CSRF & Session Security)
 */
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

header('Content-Type: application/json');

// Session Authentication Check
if (empty($_SESSION['is_admin'])) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'Forbidden: Authentication required']);
    exit;
}

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../includes/rule_engine.php';

$input = json_decode(file_get_contents('php://input'), true) ?? $_POST;

// CSRF Token Validation
$submittedToken = $input['csrf_token'] ?? $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
$sessionToken = $_SESSION['csrf_token'] ?? '';
if (empty($sessionToken) || !hash_equals($sessionToken, $submittedToken)) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'Invalid or missing CSRF security token']);
    exit;
}

$action = trim((string)($input['action'] ?? ''));
$value = trim((string)($input['value'] ?? ''));

if (empty($action) || empty($value)) {
    echo json_encode(['success' => false, 'error' => 'Missing action or value']);
    exit;
}

$success = false;

switch ($action) {
    case 'add_event_title':
        $success = appendRuleToTextFile('event_titles.txt', $value);
        break;
    case 'add_special_event':
        $success = appendRuleToTextFile('special_events.txt', $value);
        break;
    case 'add_ignored_artist':
        $success = appendRuleToTextFile('ignored_artists.txt', $value);
        break;
    case 'add_artist_split':
        $success = appendRuleToTextFile('artist_splits.txt', $value);
        break;
    case 'add_venue_city':
        $venue = trim((string)($input['venue'] ?? ''));
        if (!empty($venue)) {
            $rule = strtolower($venue) . '=' . $value;
            $success = appendRuleToTextFile('venue_cities.txt', $rule);
        }
        break;
    case 'add_venue_region':
        $venue = trim((string)($input['venue'] ?? ''));
        if (!empty($venue)) {
            $rule = strtolower($venue) . '=' . $value;
            $success = appendRuleToTextFile('venue_regions.txt', $rule);
        }
        break;
    case 'override_genre':
        $eventId = trim((string)($input['event_id'] ?? ''));
        if (!empty($eventId)) {
            $db = getDbConnection();
            $stmt = $db->prepare("UPDATE events SET genre = :genre, genre_locked = 1 WHERE event_id = :id");
            $success = $stmt->execute([':genre' => $value, ':id' => $eventId]);
        }
        break;
    case 'override_event_title':
        $eventId = trim((string)($input['event_id'] ?? ''));
        if (!empty($eventId)) {
            $rule = $eventId . '=' . $value;
            $success = appendRuleToTextFile('event_title_overrides.txt', $rule);
        }
        break;
    case 'override_event_artists':
        $eventId = trim((string)($input['event_id'] ?? ''));
        if (!empty($eventId)) {
            $rule = $eventId . '=' . $value;
            $success = appendRuleToTextFile('event_artist_overrides.txt', $rule);
        }
        break;
    case 'make_headliner':
        $eventId = trim((string)($input['event_id'] ?? ''));
        if (!empty($eventId)) {
            $db = getDbConnection();
            $stmtSelect = $db->prepare("SELECT artist_name FROM events WHERE event_id = :id");
            $stmtSelect->execute([':id' => $eventId]);
            $rawArtistStr = $stmtSelect->fetchColumn();

            if ($rawArtistStr) {
                require_once __DIR__ . '/../includes/template_helpers.php';
                $artists = splitArtistListNames($rawArtistStr);

                $targetArtist = $value;
                $newOrder = [$targetArtist];

                foreach ($artists as $a) {
                    if (strtolower(trim($a)) !== strtolower(trim($targetArtist))) {
                        $newOrder[] = $a;
                    }
                }

                $newArtistStr = implode(' & ', $newOrder);
                $stmtUpdate = $db->prepare("UPDATE events SET artist_name = :artStr WHERE event_id = :id");
                $success = $stmtUpdate->execute([':artStr' => $newArtistStr, ':id' => $eventId]);
            }
        }
        break;
    default:
        echo json_encode(['success' => false, 'error' => 'Unknown action']);
        exit;
}

if ($success) {
    echo json_encode(['success' => true, 'action' => $action, 'value' => $value]);
} else {
    echo json_encode(['success' => false, 'error' => 'Failed to save rule']);
}
