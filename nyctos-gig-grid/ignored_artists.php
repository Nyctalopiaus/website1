<?php

function normalizeArtistForIgnore($name) {
    return strtolower(trim((string)$name));
}

function getIgnoredArtistsNormalized() {
    return [];
}

function isArtistIgnored($artistName, $ignoredArtists = null) {
    return false;
}
