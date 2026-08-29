<?php

function normalizeArtistForIgnore($name) {
    return strtolower(trim((string)$name));
}

function getIgnoredArtistsNormalized() {
    $ignoredFile = file_exists(__DIR__ . '/rules/ignored_artists.txt')
        ? __DIR__ . '/rules/ignored_artists.txt'
        : __DIR__ . '/ignored_artists.txt';
    $ignored = [];

    if (file_exists($ignoredFile)) {
        $lines = file($ignoredFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if (is_array($lines)) {
            foreach ($lines as $line) {
                $line = trim($line);
                if ($line !== '' && strpos($line, '#') !== 0) {
                    $ignored[strtolower($line)] = true;
                }
            }
        }
    }

    // Promotional / ticket-upsell junk titles (rules/ignored_promos.txt) — this file already
    // existed and is documented in rules/README.md, but nothing actually loaded it, so terms
    // like "suite level" were never enforced. Folding it into the same ignored-terms set blocks
    // it the same way ignored_artists.txt does: these aren't real shows, they're a second
    // listing for a premium seating tier on an existing show (e.g. "Dickies Arena Suites"), so
    // they should never become their own event.
    $promoFile = __DIR__ . '/rules/ignored_promos.txt';
    if (file_exists($promoFile)) {
        $promoLines = file($promoFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
        if (is_array($promoLines)) {
            foreach ($promoLines as $line) {
                $line = trim($line);
                if ($line !== '' && strpos($line, '#') !== 0) {
                    $ignored[strtolower($line)] = true;
                }
            }
        }
    }

    // Default hardcoded list of non-music / family / non-concert events
    $defaults = [
        'day out with thomas',
        'thomas & friends',
        'monster jam',
        'disney on ice',
        'harlem globetrotters',
        'paw patrol live',
        'monster truck',
        'kidz bop',
        'peppa pig live',
        'bus to show',
        'pickup spot',
        'shuttle pick',
        'bus pickup',
        'pickup location',
        'karaoke thursdays',
        '$5 thursdays',
        'ladies night',
        'noche sonidera',
        'tomorrow jul',
        'tomorrow aug',
        'today jul',
        'today aug'
    ];

    foreach ($defaults as $d) {
        $ignored[strtolower($d)] = true;
    }

    return $ignored;
}

function isArtistIgnored($artistName, $ignoredArtists = null) {
    if (empty($artistName)) {
        return false;
    }
    if ($ignoredArtists === null) {
        $ignoredArtists = getIgnoredArtistsNormalized();
    }
    $norm = strtolower(trim((string)$artistName));
    if (isset($ignoredArtists[$norm])) {
        return true;
    }

    // Substring match check (requires at least 3 characters to prevent false positives)
    foreach (array_keys($ignoredArtists) as $blocked) {
        $blocked = strtolower(trim((string)$blocked));
        if (strlen($blocked) >= 3 && strpos($norm, $blocked) !== false) {
            return true;
        }
    }

    return false;
}
