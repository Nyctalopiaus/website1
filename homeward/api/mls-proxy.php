<?php
/**
 * RETIRED 2026-08-22 — superseded by the shared /backend/property-lookup.php
 * endpoint (used by both mortgage-calculator and homeward), which
 * consolidates what used to be separate per-site Redfin scrape caches into
 * one 7-day cache so the same property only ever costs one Scrape.do pull
 * across both sites. See MEMORY.md for the full history and the current
 * Scrape.do budget status.
 *
 * This stub intentionally does NOT scrape or proxy anything — it just
 * tells any leftover caller where to go. js/property-links.js already
 * points at /backend/property-lookup.php; if you're seeing this response,
 * something is still calling this old path directly and should be
 * updated instead.
 */

header('Content-Type: application/json');
http_response_code(410);
echo json_encode([
    'error' => 'This endpoint has been retired. Use /backend/property-lookup.php instead (see MEMORY.md).',
    'supersededBy' => '/backend/property-lookup.php',
]);
