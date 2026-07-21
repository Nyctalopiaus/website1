<?php

function normalizeArtistForIgnore($name) {
    $normalized = strtolower(trim((string)$name));
    $normalized = preg_replace('/[^a-z0-9]+/i', ' ', $normalized);
    $normalized = preg_replace('/\s+/', ' ', $normalized);
    return trim($normalized);
}

function getIgnoredArtistsNormalized() {
    static $cached = null;

    if ($cached !== null) {
        return $cached;
    }

    $filePath = __DIR__ . '/ignored_artists.txt';
    if (!file_exists($filePath)) {
        $cached = [];
        return $cached;
    }

    $lines = file($filePath, FILE_IGNORE_NEW_LINES);
    if ($lines === false) {
        $cached = [];
        return $cached;
    }

    $ignored = [];
    foreach ($lines as $line) {
        $trimmed = trim($line);
        if ($trimmed === '' || strpos($trimmed, '#') === 0) {
            continue;
        }

        $normalized = normalizeArtistForIgnore($trimmed);
        if ($normalized !== '') {
            $ignored[$normalized] = true;
        }
    }

    $cached = $ignored;
    return $cached;
}

function isArtistIgnored($artistName, $ignoredArtists = null) {
    if ($ignoredArtists === null) {
        $ignoredArtists = getIgnoredArtistsNormalized();
    }

    if (empty($ignoredArtists)) {
        return false;
    }

    $fullName = normalizeArtistForIgnore($artistName);
    if ($fullName !== '' && isset($ignoredArtists[$fullName])) {
        return true;
    }

    $parts = preg_split('/(\s+and\s+|\s*&\s*|\s*\/\s*|\s*,\s*|\s+with\s+|\s+w\/\s*)/i', (string)$artistName);
    foreach ($parts as $part) {
        $candidate = normalizeArtistForIgnore($part);
        if ($candidate !== '' && isset($ignoredArtists[$candidate])) {
            return true;
        }
    }

    return false;
}
