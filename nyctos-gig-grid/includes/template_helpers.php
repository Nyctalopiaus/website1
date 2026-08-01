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
        $cName = trim((string)($event['city_name'] ?? $event['city'] ?? ''));
        if ($cName !== '') return ucwords(strtolower($cName));
        $vName = strtolower(trim((string)($event['venue_name'] ?? '')));

        // Check text file overrides from venue_cities.txt
        $overrides = getAdminVenueCities();
        foreach ($overrides as $vPattern => $cOverride) {
            if ($vPattern !== '' && strpos($vName, $vPattern) !== false) {
                return $cOverride;
            }
        }

        return ucwords($vName);
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

        $artists = splitArtistListNames((string)($eventRow['artist_name'] ?? 'Unknown Artist'));
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
        $isAdmin = false;

        include __DIR__ . '/../templates/event_card.php';
    }
}
