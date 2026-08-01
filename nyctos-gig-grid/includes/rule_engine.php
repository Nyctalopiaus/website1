<?php
/**
 * Dynamic Rule Engine Helper Module
 */

function loadLinesFromTextFile($filename) {
    $filePath = __DIR__ . '/../' . $filename;
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

function getAdminIgnoredPromos() {
    static $cache = null;
    if ($cache === null) {
        $lines = loadLinesFromTextFile('ignored_promos.txt');
        $cache = !empty($lines) ? $lines : ['club level', 'vip package', 'suite level', 'parking pass', 'fast pass', 'official platinum', 'lexus club'];
    }
    return $cache;
}

function appendRuleToTextFile($filename, $ruleText) {
    $filePath = __DIR__ . '/../' . $filename;
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
