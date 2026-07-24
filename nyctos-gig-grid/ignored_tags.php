<?php
/**
 * Ignored/Excluded Tags Helper
 */

require_once __DIR__ . '/genre_buckets.php';

function normalizeTagForIgnore($tag) {
    $normalized = strtolower(trim((string)$tag));
    $normalized = preg_replace('/\s+/', ' ', $normalized);
    return trim($normalized);
}

function getIgnoredTagsNormalized() {
    static $cached = null;

    if ($cached !== null) {
        return $cached;
    }

    $filePath = __DIR__ . '/ignored_tags.txt';
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

        $normalized = normalizeTagForIgnore($trimmed);
        if ($normalized !== '') {
            $ignored[$normalized] = true;
        }
    }

    $cached = $ignored;
    return $cached;
}

function isTagIgnored($tag, array $ignoredTags = null) {
    if ($ignoredTags === null) {
        $ignoredTags = getIgnoredTagsNormalized();
    }

    if (empty($ignoredTags)) {
        return false;
    }

    $normalized = normalizeTagForIgnore($tag);
    if (isset($ignoredTags[$normalized])) {
        return true;
    }

    // Support automatic singular / plural matching (e.g. female vocalists vs female vocalist)
    if (substr($normalized, -1) === 's') {
        $singular = substr($normalized, 0, -1);
        if (isset($ignoredTags[$singular])) {
            return true;
        }
    } else {
        $plural = $normalized . 's';
        if (isset($ignoredTags[$plural])) {
            return true;
        }
    }

    return false;
}

function splitNormalizedTags($tagsStr) {
    $parts = preg_split('/[|,]/', strtolower((string)$tagsStr));
    $tags = array_filter(array_map('trim', $parts));
    return array_values(array_unique($tags));
}

function filterIgnoredTagsArray(array $tags, array $ignoredTags = null) {
    if ($ignoredTags === null) {
        $ignoredTags = getIgnoredTagsNormalized();
    }

    if (empty($tags)) {
        return [];
    }

    $visible = [];
    foreach ($tags as $tag) {
        $normalized = normalizeTagForIgnore($tag);
        if ($normalized === '') {
            continue;
        }
        if (isTagIgnored($normalized, $ignoredTags)) {
            continue;
        }
        $visible[] = $normalized;
    }

    return array_values(array_unique($visible));
}

function filterIgnoredTagsFromString($tagsStr, array $ignoredTags = null) {
    $tags = splitNormalizedTags($tagsStr);
    $visible = filterIgnoredTagsArray($tags, $ignoredTags);
    return implode(', ', $visible);
}

/**
 * Option A Exclusion Rule:
 * Returns TRUE (hide event) if:
 * 1. The event has NO tag matching an active bucket in genre_buckets.php, AND
 * 2. At least ONE of the event's tags exists in ignored_tags.txt (or singular/plural form).
 */
function areAllTagsIgnored($tagsStr, array $ignoredTags = null) {
    if (empty($tagsStr)) {
        return false;
    }

    if ($ignoredTags === null) {
        $ignoredTags = getIgnoredTagsNormalized();
    }

    if (empty($ignoredTags)) {
        return false;
    }

    $parts = preg_split('/[|,]/', strtolower($tagsStr));
    $tags = array_filter(array_map('trim', $parts));
    if (empty($tags)) {
        return false;
    }

    // 1. If ANY tag matches an active bucket in genre_buckets.php, the event IS ALLOWED.
    $buckets = getGenreBucketConfig();
    foreach ($buckets as $bucket) {
        if (!empty($bucket['tags'])) {
            foreach ($tags as $tag) {
                if (in_array($tag, $bucket['tags'], true)) {
                    return false; // Allowed! Bucket match takes precedence.
                }
            }
        }
    }

    // 2. Since NO bucket matched, if AT LEAST ONE tag is in ignored_tags.txt, HIDE the event.
    foreach ($tags as $tag) {
        if (isTagIgnored($tag, $ignoredTags)) {
            return true; // Excluded tag matched -> HIDE!
        }
    }

    return false;
}
