<?php
/**
 * PROTOTYPE — not wired into the sync pipeline yet.
 *
 * Why this exists: both of Bandsintown's public REST endpoints (the location-search
 * endpoint AND the artists/{name}/events fallback this app was using) now return
 * HTTP 403 for every request, regardless of app_id. See project memory
 * "nyctos_gig_grid_bandsintown_outage" for the full diagnosis.
 *
 * What this does instead: Bandsintown's own public city pages
 * (https://www.bandsintown.com/c/{city-slug}) are NOT blocked and render real,
 * current show listings. Confirmed live (2026-08-28) via a real browser against
 * both a US city (Denver, CO) and a UK city (London) — both loaded cleanly and
 * both pages embed a <script type="application/ld+json"> block containing an
 * array of schema.org MusicEvent objects (the markup Bandsintown ships for
 * Google's benefit), e.g.:
 *
 *   {
 *     "@type": "MusicEvent",
 *     "name": "Charli xcx @ Richfield Avenue - Reading, United Kingdom",
 *     "startDate": "2026-08-28T09:30:00",
 *     "location": { "name": "Richfield Avenue - Reading, United Kingdom", ... },
 *     "performer": { "name": "Charli xcx" },
 *     "offers": { "url": "https://www.bandsintown.com/e/...-charli-xcx-...", ... },
 *     "organizer": { "name": "Charli xcx", "url": "https://www.bandsintown.com/a/289995-charli-xcx" }
 *   }
 *
 * This is far more useful than the old artist-by-artist approach: one request per
 * MARKET CITY (7-ish) instead of one request per registered artist (5,241/day),
 * and it surfaces shows from artists who were never manually added to
 * approved_artists at all.
 *
 * IMPORTANT — the one thing this file cannot confirm on its own: the city page
 * loaded cleanly in a real, JS-capable browser, but the network log for that load
 * also showed Cloudflare's bot-challenge platform scripts
 * (cdn-cgi/challenge-platform/...) executing in the background. A real browser
 * passes that automatically; a bare PHP curl request (no JS engine) MIGHT be
 * challenged/blocked the same way the two REST endpoints now are, or it might
 * sail through if Cloudflare's rule here only targets suspicious traffic
 * patterns rather than every non-browser client. There was no way to test a raw
 * HTTP request against bandsintown.com from the sandbox this was written in (no
 * outbound network access to arbitrary hosts), so **the first real test has to
 * happen from the production server**, which already has working outbound access
 * for Ticketmaster/Eventbrite/etc.
 *
 * How to test:
 *   php services/BandsintownCityScraperPrototype.php "Denver,CO"
 *   php services/BandsintownCityScraperPrototype.php "London,UK"
 *
 * Run it for one city per market and see what prints. Three outcomes:
 *   1. Prints a list of real events -> approach works, worth building out fully.
 *   2. "BLOCKED" diagnostic (Cloudflare challenge / interstitial detected) ->
 *      this path needs a real browser (headless Chrome/Playwright) rather than
 *      curl, which is a much bigger lift — worth knowing before investing further.
 *   3. Curl error / non-200 for another reason -> log it, might just need
 *      different headers.
 */

function bandsintownCitySlug(string $cityState): string {
    // Accepts "Denver,CO" or "London,UK" or just "London" and builds a
    // best-guess slug. Bandsintown's own site redirects loose slugs to their
    // canonical form (e.g. "london-uk" -> "london-united-kingdom"), so this
    // doesn't need to be perfect — curl just needs to follow the redirect.
    $parts = array_map('trim', explode(',', $cityState));
    $slug = strtolower(implode('-', array_filter($parts)));
    $slug = preg_replace('/[^a-z0-9\-]+/', '-', $slug);
    $slug = preg_replace('/-+/', '-', $slug);
    return trim($slug, '-');
}

function fetchBandsintownCityPage(string $citySlug): array {
    $url = "https://www.bandsintown.com/c/{$citySlug}";

    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 5,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        CURLOPT_HTTPHEADER => [
            'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language: en-US,en;q=0.9',
        ],
    ]);
    $html = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $effectiveUrl = curl_getinfo($ch, CURLINFO_EFFECTIVE_URL);
    $curlError = curl_error($ch);
    curl_close($ch);

    if ($html === false) {
        return ['ok' => false, 'reason' => "curl error: {$curlError}", 'httpCode' => $httpCode];
    }

    // Cloudflare challenge/interstitial pages are short and carry a specific
    // title/body instead of real content. NOTE: a real, fully-served
    // bandsintown.com page also references cdn-cgi/challenge-platform (their
    // passive bot-fingerprinting script tag loads on every page, success or
    // not) — so that string alone is NOT a reliable signal and is deliberately
    // NOT checked here. Rely on the interstitial's actual wording plus size:
    // a real city page render is well over 50KB; Cloudflare's block/challenge
    // pages are a few KB.
    $looksChallenged = (
        stripos($html, 'Just a moment') !== false ||
        stripos($html, 'Attention Required') !== false ||
        stripos($html, 'Checking your browser') !== false ||
        $httpCode === 403 ||
        $httpCode === 503 ||
        strlen($html) < 20000
    );

    if ($looksChallenged) {
        return [
            'ok' => false,
            'reason' => 'BLOCKED — response looks like a Cloudflare challenge/interstitial page, not real content',
            'httpCode' => $httpCode,
            'effectiveUrl' => $effectiveUrl,
            'htmlLength' => strlen($html),
        ];
    }

    if ($httpCode !== 200) {
        return ['ok' => false, 'reason' => "non-200 response", 'httpCode' => $httpCode, 'effectiveUrl' => $effectiveUrl];
    }

    return ['ok' => true, 'html' => $html, 'httpCode' => $httpCode, 'effectiveUrl' => $effectiveUrl];
}

/**
 * Pulls every schema.org MusicEvent out of the page's JSON-LD blocks.
 */
function extractMusicEventsFromHtml(string $html): array {
    $doc = new DOMDocument();
    libxml_use_internal_errors(true);
    $doc->loadHTML($html);
    libxml_clear_errors();

    $xpath = new DOMXPath($doc);
    $scripts = $xpath->query('//script[@type="application/ld+json"]');

    $events = [];
    foreach ($scripts as $script) {
        $decoded = json_decode($script->textContent, true);
        if (!is_array($decoded)) {
            continue;
        }
        // Some pages embed a single object, some an array — normalize to a list.
        $items = (isset($decoded['@type'])) ? [$decoded] : $decoded;
        foreach ($items as $item) {
            if (is_array($item) && ($item['@type'] ?? null) === 'MusicEvent') {
                $events[] = $item;
            }
        }
    }
    return $events;
}

function mapMusicEventToRow(array $e, string $marketCityLabel): ?array {
    $artist = $e['performer']['name'] ?? null;
    $venue = $e['location']['name'] ?? null;
    $startDate = $e['startDate'] ?? null;
    $ticketUrl = $e['offers']['url'] ?? ($e['url'] ?? null);

    if (!$artist || !$venue || !$startDate) {
        return null;
    }

    $ts = strtotime($startDate);
    if ($ts === false) {
        return null;
    }

    return [
        'artist_name' => $artist,
        'venue_name' => $venue,
        'start_time' => date('Y-m-d H:i:s', $ts),
        'ticket_url' => $ticketUrl,
        'source_city' => $marketCityLabel, // the city page this came from, NOT necessarily the event's own city
        'bandsintown_artist_url' => $e['organizer']['url'] ?? null,
    ];
}

// --- CLI entry point ---
if (php_sapi_name() === 'cli' && basename(__FILE__) === basename($argv[0] ?? '')) {
    $cityArg = $argv[1] ?? null;
    if (!$cityArg) {
        fwrite(STDERR, "Usage: php BandsintownCityScraperPrototype.php \"City,ST\"\n");
        exit(1);
    }

    $slug = bandsintownCitySlug($cityArg);
    echo "Fetching city slug: {$slug}\n";

    $result = fetchBandsintownCityPage($slug);

    if (!$result['ok']) {
        echo "FAILED: {$result['reason']}\n";
        echo "  HTTP code: " . ($result['httpCode'] ?? 'n/a') . "\n";
        if (isset($result['effectiveUrl'])) {
            echo "  Effective URL after redirects: {$result['effectiveUrl']}\n";
        }
        exit(1);
    }

    echo "Fetched OK ({$result['httpCode']}), effective URL: {$result['effectiveUrl']}\n";
    $events = extractMusicEventsFromHtml($result['html']);
    echo "Found " . count($events) . " MusicEvent entries in JSON-LD.\n\n";

    $rows = [];
    foreach ($events as $e) {
        $row = mapMusicEventToRow($e, $cityArg);
        if ($row) {
            $rows[] = $row;
        }
    }

    echo "Mapped " . count($rows) . " usable rows. First 10:\n";
    foreach (array_slice($rows, 0, 10) as $r) {
        echo "  [{$r['start_time']}] {$r['artist_name']} @ {$r['venue_name']}\n";
        echo "     ticket_url: {$r['ticket_url']}\n";
    }
}
