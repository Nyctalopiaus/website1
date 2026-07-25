<?php

function normalizeArtistForIgnore($name) {
    return strtolower(trim((string)$name));
}

function getIgnoredArtistsNormalized() {
    $ignoredFile = __DIR__ . '/ignored_artists.txt';
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
        'peppa pig live'
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

    // Substring match check
    foreach (array_keys($ignoredArtists) as $blocked) {
        if ($blocked !== '' && strpos($norm, $blocked) !== false) {
            return true;
        }
    }

    return false;
}
