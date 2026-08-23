<?php
/**
 * RETIRED 2026-08-22 — superseded by the shared /backend/property-lookup.php
 * endpoint's own server-side 7-day cache (used by both mortgage-calculator
 * and homeward). homeward's client-side cache (js/storage.js) now keeps a
 * local-only per-browser mirror and no longer round-trips here. See
 * MEMORY.md for the full history and the current Scrape.do budget status.
 *
 * This stub intentionally does nothing but report where to go — it does
 * NOT read/write data/property_cache.db (that file is leftover data, not
 * actively used by anything anymore).
 */

header('Content-Type: application/json');
http_response_code(410);
echo json_encode([
    'error' => 'This endpoint has been retired. The shared /backend/property-lookup.php endpoint now handles server-side caching (see MEMORY.md).',
    'supersededBy' => '/backend/property-lookup.php',
]);
