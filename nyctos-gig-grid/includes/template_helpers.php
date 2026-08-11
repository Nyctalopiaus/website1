<?php
/**
 * Template Presentation Helper Functions
 */

if (!function_exists('buildMarketLink')) {
    function buildMarketLink($marketKey, $regionKey = null, $preserveMonth = true) {
        $params = [];
        if ($preserveMonth && isset($_GET['month']) && !empty($_GET['month'])) {
            $params['month'] = $_GET['month'];
        }
        $params['market'] = $marketKey;
        if ($regionKey !== null && $regionKey !== '') {
            $params['region'] = $regionKey;
        }
        $scriptName = basename($_SERVER['SCRIPT_NAME'] ?? 'index.php');
        if ($scriptName !== 'admin.php' && $scriptName !== 'index.php') {
            $scriptName = 'index.php';
        }
        return $scriptName . '?' . http_build_query($params);
    }
}

if (!function_exists('formatMonthName')) {
    function formatMonthName($yearMonthStr) {
        $date = strtotime($yearMonthStr . "-01");
        return date('F Y', $date);
    }
}

require_once __DIR__ . '/rule_engine.php';

if (!function_exists('resolveEventCardCity')) {
    function resolveEventCardCity($event) {
        $vName = strtolower(trim((string)($event['venue_name'] ?? '')));

        // Manual venue city overrides should always win.
        $overrides = getAdminVenueCities();
        foreach ($overrides as $vPattern => $cOverride) {
            if ($vPattern !== '' && strpos($vName, $vPattern) !== false) {
                return $cOverride;
            }
        }

        // Prefer explicit city fields when present.
        $candidateCity = trim((string)($event['city_name'] ?? $event['city'] ?? ''));
        if ($candidateCity !== '') {
            return ucwords(strtolower($candidateCity));
        }

        // Optional fallback from address if available: "street, city, ..."
        $address = trim((string)($event['address'] ?? ''));
        if ($address !== '' && strpos($address, ',') !== false) {
            $parts = array_map('trim', explode(',', $address));
            if (count($parts) >= 2 && $parts[1] !== '') {
                return ucwords(strtolower($parts[1]));
            }
        }

        // If no city can be determined, return empty so UI renders market suffix only.
        return '';
    }
}

if (!function_exists('getEventDateDetails')) {
    function getEventDateDetails($dateTimeStr) {
        $timestamp = strtotime($dateTimeStr);
        return [
            'day' => date('d', $timestamp),
            'month_abbr' => date('M', $timestamp),
            'weekday' => date('D', $timestamp),
            'time' => date('g:i A', $timestamp)
        ];
    }
}

if (!function_exists('buildGoogleCalendarUrl')) {
    function buildGoogleCalendarUrl($event, $resolvedCity = '') {
        $artist = trim((string)($event['artist_name'] ?? 'Concert'));
        $venue = trim((string)($event['venue_name'] ?? ''));
        $title = $artist . ($venue !== '' ? ' @ ' . $venue : '');

        $startTime = strtotime($event['start_time'] ?? 'now');
        if ($startTime === false) {
            $startTime = time();
        }
        $endTime = $startTime + (3 * 3600);

        $startUtc = gmdate('Ymd\THis\Z', $startTime);
        $endUtc = gmdate('Ymd\THis\Z', $endTime);

        $locationParts = array_filter([$venue, $resolvedCity]);
        $location = implode(', ', $locationParts);

        $detailsParts = ["Live Show: " . $artist];
        if (!empty($venue)) {
            $detailsParts[] = "Venue: " . $venue;
        }
        if (!empty($event['ticket_url'])) {
            $detailsParts[] = "Tickets: " . $event['ticket_url'];
        }
        $details = implode("\n", $detailsParts);

        return 'https://calendar.google.com/calendar/render?' . http_build_query([
            'action' => 'TEMPLATE',
            'text' => $title,
            'dates' => $startUtc . '/' . $endUtc,
            'details' => $details,
            'location' => $location
        ]);
    }
}

if (!function_exists('buildOutlookCalendarUrl')) {
    function buildOutlookCalendarUrl($event, $resolvedCity = '') {
        $artist = trim((string)($event['artist_name'] ?? 'Concert'));
        $venue = trim((string)($event['venue_name'] ?? ''));
        $title = $artist . ($venue !== '' ? ' @ ' . $venue : '');

        $startTime = strtotime($event['start_time'] ?? 'now');
        if ($startTime === false) {
            $startTime = time();
        }
        $endTime = $startTime + (3 * 3600);

        $startIso = date('Y-m-d\TH:i:s\Z', $startTime);
        $endIso = date('Y-m-d\TH:i:s\Z', $endTime);

        $locationParts = array_filter([$venue, $resolvedCity]);
        $location = implode(', ', $locationParts);

        $detailsParts = ["Live Show: " . $artist];
        if (!empty($venue)) {
            $detailsParts[] = "Venue: " . $venue;
        }
        if (!empty($event['ticket_url'])) {
            $detailsParts[] = "Tickets: " . $event['ticket_url'];
        }
        $details = implode("\n", $detailsParts);

        return 'https://outlook.live.com/calendar/0/deeplink/compose?' . http_build_query([
            'path' => '/calendar/action/compose',
            'rru' => 'addevent',
            'subject' => $title,
            'startdt' => $startIso,
            'enddt' => $endIso,
            'body' => $details,
            'location' => $location
        ]);
    }
}

if (!function_exists('splitArtistListNames')) {
    function splitArtistListNames($artistNameStr) {
        $ignoredPromos = getAdminIgnoredPromos();
        $quotedPromos = array_map(function($p) { return preg_quote($p, '/'); }, $ignoredPromos);
        $junkRegex = '/(' . implode('|', $quotedPromos) . ')/i';

        $customSplits = loadLinesFromTextFile('artist_splits.txt');
        $splitPatterns = ['&', 'w\/', 'with', ',', '\|', '\bft\.\s*', '\bfeat\.\s*', '\bfeaturing\s*', '\s+[\-\x{2013}\x{2014}]\s+'];
        foreach ($customSplits as $cs) {
            $splitPatterns[] = preg_quote($cs, '/');
        }
        $splitRegex = '/\s*(' . implode('|', array_unique($splitPatterns)) . ')\s*/iu';

        $parts = preg_split($splitRegex, (string)$artistNameStr);
        $artists = [];
        $delims = array_merge(['&', 'w/', 'with', ',', '|', 'ft.', 'feat.', 'featuring', '-', '–', '—'], array_map('strtolower', $customSplits));
        foreach ($parts as $p) {
            $clean = trim($p);
            $clean = preg_replace('/^(and|with|w\/)\s+/i', '', $clean);
            if ($clean !== '' && !preg_match($junkRegex, $clean) && !in_array(strtolower($clean), $delims, true) && !in_array($clean, $artists, true)) {
                $artists[] = $clean;
            }
        }
        return !empty($artists) ? $artists : [trim((string)$artistNameStr)];
    }
}

if (!function_exists('renderEventCard')) {
    function renderEventCard($event, $genreBuckets = []) {
        if (!is_array($event)) {
            return;
        }

        $eventRow = $event;
        if (empty($eventRow['artist_name']) && !empty($eventRow['band_name'])) {
            $eventRow['artist_name'] = $eventRow['band_name'];
        }
        if (empty($eventRow['event_id'])) {
            $eventRow['event_id'] = md5(json_encode($eventRow));
        }

        $artistOverrides = function_exists('getAdminEventArtistOverrides') ? getAdminEventArtistOverrides() : [];
        $titleOverrides = function_exists('getAdminEventTitleOverrides') ? getAdminEventTitleOverrides() : [];
        $hasArtistOverride = false;
        $hasTitleOverride = false;

        if (!empty($eventRow['event_id']) && isset($artistOverrides[$eventRow['event_id']])) {
            $overrideArtists = trim((string)$artistOverrides[$eventRow['event_id']]);
            if ($overrideArtists !== '') {
                $eventRow['artist_name'] = $overrideArtists;
                $hasArtistOverride = true;
            }
        }

        if (!empty($eventRow['event_id']) && isset($titleOverrides[$eventRow['event_id']])) {
            $overrideTitle = trim((string)$titleOverrides[$eventRow['event_id']]);
            if ($overrideTitle !== '') {
                $eventRow['artist_name'] = $overrideTitle;
                $hasTitleOverride = true;
            }
        }

        if ($hasTitleOverride) {
            $artists = [(string)($eventRow['artist_name'] ?? 'Unknown Artist')];
        } elseif ($hasArtistOverride) {
            $rawOverride = (string)($eventRow['artist_name'] ?? '');
            if (strpos($rawOverride, '||') !== false) {
                $artists = array_values(array_filter(array_map('trim', explode('||', $rawOverride))));
            } else {
                $artists = array_values(array_filter(array_map('trim', explode('&', $rawOverride))));
            }
        } else {
            $artists = splitArtistListNames((string)($eventRow['artist_name'] ?? 'Unknown Artist'));
        }
        $tags = [];
        $tagsRaw = (string)($eventRow['tags'] ?? '');
        if ($tagsRaw !== '') {
            $tags = array_values(array_filter(array_map('trim', explode(',', strtolower($tagsRaw)))));
        }

        $group = [
            'primary' => $eventRow,
            'artists' => !empty($artists) ? $artists : ['Unknown Artist'],
            'events' => [$eventRow],
            'tags' => $tags,
        ];

        $residencyCounts = [];
        $activeMarket = strtolower((string)($eventRow['market'] ?? ($_GET['market'] ?? 'colorado')));
        $ignoredTags = function_exists('getIgnoredTagsNormalized') ? getIgnoredTagsNormalized() : [];
        // Allow card-level admin tools whenever an authenticated admin session is active
        // or when admin.php explicitly sets the page context flag.
        $isAdmin = !empty($GLOBALS['isAdmin']);
        if (!$isAdmin && session_status() === PHP_SESSION_ACTIVE) {
            $isAdmin = !empty($_SESSION['is_admin']);
        }

        include __DIR__ . '/../templates/event_card.php';
    }
}
