<?php
/**
 * Paged event cards API
 * Returns grouped event card HTML chunks for incremental loading.
 */
header_remove('X-Powered-By');
header('Content-Type: application/json; charset=UTF-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db.php';
require_once __DIR__ . '/../ignored_tags.php';
require_once __DIR__ . '/../includes/template_helpers.php';

try {
    $db = getDbConnection();
    $ignoredTags = getIgnoredTagsNormalized();

    $allowedMarkets = ['colorado', 'california', 'texas', 'england', 'scotland', 'wales', 'ireland'];
    $marketAliases = [
        'co' => 'colorado',
        'ca' => 'california',
        'tx' => 'texas',
        'uk' => 'england',
        'gb' => 'england',
        'great britain' => 'england',
        'united kingdom' => 'england',
        'england' => 'england',
        'scotland' => 'scotland',
        'wales' => 'wales',
        'ireland' => 'ireland',
        'republic of ireland' => 'ireland',
        'northern ireland' => 'ireland',
        'ie' => 'ireland'
    ];

    $requestedMarketRaw = strtolower(trim((string)($_GET['market'] ?? 'colorado')));
    $requestedMarket = $marketAliases[$requestedMarketRaw] ?? $requestedMarketRaw;
    if (!in_array($requestedMarket, $allowedMarkets, true)) {
        $requestedMarket = 'colorado';
    }
    $activeMarket = $requestedMarket;

    $activeCountry = in_array($activeMarket, ['england', 'scotland', 'wales', 'ireland'], true) ? $activeMarket : '';

    $marketGeoBounds = [
        'colorado' => ['min_lat' => 36.0, 'max_lat' => 42.5, 'min_lng' => -110.5, 'max_lng' => -101.5],
        'california' => ['min_lat' => 32.0, 'max_lat' => 42.5, 'min_lng' => -125.0, 'max_lng' => -114.0],
        'texas' => ['min_lat' => 25.0, 'max_lat' => 37.5, 'min_lng' => -107.0, 'max_lng' => -93.0],
    ];
    $activeGeoBounds = $marketGeoBounds[$activeMarket] ?? null;

    $month = trim((string)($_GET['month'] ?? ''));
    if (!preg_match('/^\d{4}-\d{2}$/', $month)) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Invalid or missing month parameter.']);
        exit;
    }

    $monthDate = DateTime::createFromFormat('!Y-m', $month);
    if (!$monthDate) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Invalid month value.']);
        exit;
    }
    $monthStart = $monthDate->format('Y-m-01 00:00:00');
    $nextMonthStart = (clone $monthDate)->modify('+1 month')->format('Y-m-01 00:00:00');

    $offset = max(0, (int)($_GET['offset'] ?? 0));
    $limit = max(1, min(50, (int)($_GET['limit'] ?? 8)));

    $stmt = $db->prepare("\n        SELECT e.*, COALESCE(v.city, '') AS city_name\n        FROM events e\n        LEFT JOIN venues v ON e.venue_name = v.venue_name\n        WHERE e.market = :market\n          AND e.start_time >= :month_start\n          AND e.start_time < :next_month_start\n          AND e.start_time >= datetime('now', '-4 hours')\n          AND (\n                :geo_enabled = 0\n                OR v.latitude IS NULL\n                OR v.longitude IS NULL\n                OR (\n                    v.latitude BETWEEN :min_lat AND :max_lat\n                    AND v.longitude BETWEEN :min_lng AND :max_lng\n                )\n              )\n        ORDER BY e.start_time ASC\n    ");
    $geoEnabled = $activeGeoBounds ? 1 : 0;
    $stmt->execute([
        ':market' => $activeMarket,
        ':month_start' => $monthStart,
        ':next_month_start' => $nextMonthStart,
        ':geo_enabled' => $geoEnabled,
        ':min_lat' => $activeGeoBounds['min_lat'] ?? 0,
        ':max_lat' => $activeGeoBounds['max_lat'] ?? 0,
        ':min_lng' => $activeGeoBounds['min_lng'] ?? 0,
        ':max_lng' => $activeGeoBounds['max_lng'] ?? 0
    ]);
    $events = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $groupedEvents = [];
    foreach ($events as $eventItem) {
        $dateKey = date('Y-m-d', strtotime((string)$eventItem['start_time']));
        $timeKey = date('H:i', strtotime((string)$eventItem['start_time']));
        $venueKey = strtolower(trim((string)$eventItem['venue_name']));
        $eventGenre = strtolower((string)($eventItem['genre'] ?? 'all'));

        if ($eventGenre === 'special_event' || ($timeKey !== '00:00' && $timeKey !== '12:00')) {
            $groupKey = $venueKey . '_' . $dateKey . '_' . $timeKey . '_' . md5((string)$eventItem['artist_name']);
        } else {
            $groupKey = $venueKey . '_' . $dateKey;
        }

        $eventTags = filterIgnoredTagsArray(
            splitNormalizedTags($eventItem['tags'] ?? ''),
            $ignoredTags
        );
        $eventArtists = splitArtistListNames((string)$eventItem['artist_name']);

        if (!isset($groupedEvents[$groupKey])) {
            $groupedEvents[$groupKey] = [
                'primary' => $eventItem,
                'artists' => $eventArtists,
                'events' => [$eventItem],
                'tags' => $eventTags,
            ];
        } else {
            foreach ($eventArtists as $aName) {
                if (!in_array($aName, $groupedEvents[$groupKey]['artists'], true)) {
                    $groupedEvents[$groupKey]['artists'][] = $aName;
                }
            }
            $groupedEvents[$groupKey]['events'][] = $eventItem;
            foreach ($eventTags as $t) {
                if (!in_array($t, $groupedEvents[$groupKey]['tags'], true)) {
                    $groupedEvents[$groupKey]['tags'][] = $t;
                }
            }
        }
    }

    $residencyCounts = [];
    foreach ($groupedEvents as $group) {
        foreach ($group['events'] as $groupEvent) {
            $artists = splitArtistListNames((string)$groupEvent['artist_name']);
            foreach ($artists as $artist) {
                $artistKey = strtolower(trim((string)$artist));
                $venueKey = strtolower(trim((string)$groupEvent['venue_name']));
                $dateKey = date('Y-m-d', strtotime((string)$groupEvent['start_time']));
                $comboKey = $artistKey . '||' . $venueKey;
                if (!isset($residencyCounts[$comboKey])) {
                    $residencyCounts[$comboKey] = [];
                }
                if (!in_array($dateKey, $residencyCounts[$comboKey], true)) {
                    $residencyCounts[$comboKey][] = $dateKey;
                }
            }
        }
    }

    $groupList = array_values($groupedEvents);
    $totalGroups = count($groupList);
    $slice = array_slice($groupList, $offset, $limit);

    $isAdmin = false;

    ob_start();
    foreach ($slice as $group) {
        include __DIR__ . '/../templates/event_card.php';
    }
    $html = ob_get_clean();

    $loadedCount = count($slice);
    $nextOffset = $offset + $loadedCount;

    echo json_encode([
        'status' => 'ok',
        'html' => $html,
        'loaded_count' => $loadedCount,
        'next_offset' => $nextOffset,
        'total_groups' => $totalGroups,
        'has_more' => $nextOffset < $totalGroups
    ], JSON_UNESCAPED_SLASHES);
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Failed to load event chunk.'
    ]);
}
