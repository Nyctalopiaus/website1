<?php

function normalizeArtistForGenreOverride($name) {
    $normalized = strtolower(trim((string)$name));
    $normalized = preg_replace('/[^a-z0-9]+/i', ' ', $normalized);
    $normalized = preg_replace('/\s+/', ' ', $normalized);
    return trim($normalized);
}

function getGenreOverridesNormalized() {
    static $cached = null;

    if ($cached !== null) {
        return $cached;
    }

    $filePath = __DIR__ . '/genre_overrides.txt';
    if (!file_exists($filePath)) {
        $cached = [];
        return $cached;
    }

    $lines = file($filePath, FILE_IGNORE_NEW_LINES);
    if ($lines === false) {
        $cached = [];
        return $cached;
    }

    $allowed = ['metal' => true, 'extreme' => true, 'punk' => true, 'indie' => true];
    $overrides = [];

    foreach ($lines as $line) {
        $trimmed = trim($line);
        if ($trimmed === '' || strpos($trimmed, '#') === 0) {
            continue;
        }

        $parts = preg_split('/\s*=\s*|\s*:\s*/', $trimmed, 2);
        if (!is_array($parts) || count($parts) !== 2) {
            continue;
        }

        $artistRaw = trim($parts[0]);
        $genreRaw = strtolower(trim($parts[1]));

        if ($artistRaw === '' || !isset($allowed[$genreRaw])) {
            continue;
        }

        $normalizedArtist = normalizeArtistForGenreOverride($artistRaw);
        if ($normalizedArtist === '') {
            continue;
        }

        $overrides[$normalizedArtist] = $genreRaw;
    }

    $cached = $overrides;
    return $cached;
}

function resolveArtistGenreOverride($artistName, $overrides = null) {
    if ($overrides === null) {
        $overrides = getGenreOverridesNormalized();
    }

    if (empty($overrides)) {
        return null;
    }

    $fullName = normalizeArtistForGenreOverride($artistName);
    if ($fullName !== '' && isset($overrides[$fullName])) {
        return $overrides[$fullName];
    }

    $parts = preg_split('/(\s+and\s+|\s*&\s*|\s*\/\s*|\s*,\s*|\s+with\s+|\s+w\/\s*)/i', (string)$artistName);
    foreach ($parts as $part) {
        $candidate = normalizeArtistForGenreOverride($part);
        if ($candidate !== '' && isset($overrides[$candidate])) {
            return $overrides[$candidate];
        }
    }

    return null;
}
