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

    $allowedMarkets = ['colorado', 'california', 'texas', 'uk'];
    $marketAliases = [
        'co' => 'colorado',
        'ca' => 'california',
        'tx' => 'texas',
        'uk' => 'uk',
        'united kingdom' => 'uk',
        'england' => 'uk',
        'scotland' => 'uk',
        'wales' => 'uk',
        'ireland' => 'uk'
    ];

    $requestedMarketRaw = strtolower(trim((string)($_GET['market'] ?? 'colorado')));
    $requestedMarket = $marketAliases[$requestedMarketRaw] ?? $requestedMarketRaw;
    if (!in_array($requestedMarket, $allowedMarkets, true)) {
        $requestedMarket = 'colorado';
    }
    $activeMarket = $requestedMarket;

    $allowedCountries = ['england', 'ireland', 'scotland', 'wales'];
    $requestedCountryRaw = strtolower(trim((string)($_GET['region'] ?? 'scotland')));
    if (!in_array($requestedCountryRaw, $allowedCountries, true)) {
        $requestedCountryRaw = 'scotland';
    }
    $activeCountry = $activeMarket === 'uk' ? $requestedCountryRaw : '';

    $month = trim((string)($_GET['month'] ?? ''));
    if (!preg_match('/^\d{4}-\d{2}$/', $month)) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Invalid or missing month parameter.']);
        exit;
    }

    $offset = max(0, (int)($_GET['offset'] ?? 0));
    $limit = max(1, min(50, (int)($_GET['limit'] ?? 8)));

    if ($activeMarket === 'uk') {
        $stmt = $db->prepare("\n            SELECT e.*, v.city AS city_name\n            FROM events e\n            JOIN venues v ON e.venue_name = v.venue_name\n            JOIN market_cities mc ON v.city = mc.city_name\n            WHERE e.market = :market\n              AND LOWER(TRIM(mc.region)) = :country_filter\n              AND strftime('%Y-%m', e.start_time) = :month\n              AND e.start_time >= datetime('now', '-4 hours')\n            ORDER BY e.start_time ASC\n        ");
        $stmt->execute([
            ':market' => $activeMarket,
            ':country_filter' => $activeCountry,
            ':month' => $month
        ]);
    } else {
        $stmt = $db->prepare("\n            SELECT e.*, COALESCE(v.city, '') AS city_name\n            FROM events e\n            LEFT JOIN venues v ON e.venue_name = v.venue_name\n            WHERE e.market = :market\n              AND strftime('%Y-%m', e.start_time) = :month\n              AND e.start_time >= datetime('now', '-4 hours')\n            ORDER BY e.start_time ASC\n        ");
        $stmt->execute([
            ':market' => $activeMarket,
            ':month' => $month
        ]);
    }
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
