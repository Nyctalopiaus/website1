<?php
/**
 * Dynamic Rule Engine Helper Module
 */

function loadLinesFromTextFile($filename) {
    $filePath = file_exists(__DIR__ . '/../rules/' . $filename)
        ? __DIR__ . '/../rules/' . $filename
        : __DIR__ . '/../' . $filename;
    $items = [];
    if (file_exists($filePath)) {
        $lines = file($filePath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if (is_array($lines)) {
            foreach ($lines as $line) {
                $line = trim($line);
                if ($line !== '' && strpos($line, '#') !== 0) {
                    $items[] = $line;
                }
            }
        }
    }
    return $items;
}

function getAdminEventTitles() {
    static $cache = null;
    if ($cache === null) {
        $lines = loadLinesFromTextFile('event_titles.txt');
        $cache = [];
        foreach ($lines as $l) {
            $cache[strtolower($l)] = $l;
        }
    }
    return $cache;
}

function getAdminEventTitleOverrides() {
    static $cache = null;
    if ($cache === null) {
        $lines = loadLinesFromTextFile('event_title_overrides.txt');
        $cache = [];
        foreach ($lines as $l) {
            if (strpos($l, '=') === false) {
                continue;
            }
            list($eventId, $title) = explode('=', $l, 2);
            $eventId = trim((string)$eventId);
            $title = trim((string)$title);
            if ($eventId !== '' && $title !== '') {
                $cache[$eventId] = $title;
            }
        }
    }
    return $cache;
}

function getAdminEventArtistOverrides() {
    static $cache = null;
    if ($cache === null) {
        $lines = loadLinesFromTextFile('event_artist_overrides.txt');
        $cache = [];
        foreach ($lines as $l) {
            if (strpos($l, '=') === false) {
                continue;
            }
            list($eventId, $artistStr) = explode('=', $l, 2);
            $eventId = trim((string)$eventId);
            $artistStr = trim((string)$artistStr);
            if ($eventId !== '' && $artistStr !== '') {
                $cache[$eventId] = $artistStr;
            }
        }
    }
    return $cache;
}

function getAdminSpecialEvents() {
    static $cache = null;
    if ($cache === null) {
        $lines = loadLinesFromTextFile('special_events.txt');
        $cache = [];
        foreach ($lines as $l) {
            $cache[strtolower($l)] = true;
        }
    }
    return $cache;
}

function getAdminVenueCities() {
    static $cache = null;
    if ($cache === null) {
        $lines = loadLinesFromTextFile('venue_cities.txt');
        $cache = [];
        foreach ($lines as $l) {
            if (strpos($l, '=') !== false) {
                list($v, $c) = explode('=', $l, 2);
                $cache[strtolower(trim($v))] = trim($c);
            }
        }
    }
    return $cache;
}

function getAdminVenueRegions() {
    static $cache = null;
    if ($cache === null) {
        $lines = loadLinesFromTextFile('venue_regions.txt');
        $cache = [];
        foreach ($lines as $l) {
            if (strpos($l, '=') !== false) {
                list($v, $r) = explode('=', $l, 2);
                $cache[strtolower(trim($v))] = strtolower(trim($r));
            }
        }
    }
    return $cache;
}

function getAdminIgnoredPromos() {
    static $cache = null;
    if ($cache === null) {
        $lines = loadLinesFromTextFile('ignored_promos.txt');
        $cache = !empty($lines) ? $lines : ['club level', 'vip package', 'suite level', 'parking pass', 'fast pass', 'official platinum', 'lexus club'];
    }
    return $cache;
}

function appendRuleToTextFile($filename, $ruleText) {
    $rulesDir = __DIR__ . '/../rules';
    if (!is_dir($rulesDir)) {
        @mkdir($rulesDir, 0755, true);
    }
    $filePath = is_dir($rulesDir) ? ($rulesDir . '/' . $filename) : (__DIR__ . '/../' . $filename);
    $ruleText = trim($ruleText);
    if ($ruleText === '') return false;

    $existing = loadLinesFromTextFile($filename);
    $existingLower = array_map('strtolower', $existing);
    if (in_array(strtolower($ruleText), $existingLower, true)) {
        return true; // Already exists
    }

    $entry = "\n" . $ruleText;
    return @file_put_contents($filePath, $entry, FILE_APPEND | LOCK_EX) !== false;
}
