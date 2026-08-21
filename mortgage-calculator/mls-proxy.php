<?php
// Load shared API credentials from the server-side env file (never web-accessible,
// never committed with real values). Matches the convention used elsewhere on this
// account: /home/nyctltlc/api.env holds KEY=VALUE lines, one per line.
function loadApiEnv($path) {
    if (!is_readable($path)) return;
    foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#' || strpos($line, '=') === false) continue;
        list($name, $value) = array_map('trim', explode('=', $line, 2));
        $value = trim($value, "\"'");
        if ($name !== '' && getenv($name) === false) {
            putenv("$name=$value");
        }
    }
}
loadApiEnv('/home/nyctltlc/api.env');

// 1. Get and sanitize the URL parameter
$url = isset($_GET['url']) ? trim($_GET['url']) : '';

// Auto-prepend https:// if the user passed a domain name or path without http(s)://
if (!empty($url) && !preg_match('/^https?:\/\//i', $url)) {
    $url = 'https://' . $url;
}

// 2. Validate that it is a real URL starting with https:// or http://
if (empty($url) || filter_var($url, FILTER_VALIDATE_URL) === false || !preg_match('/^https?:\/\//i', $url)) {
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Invalid or missing URL parameter. Ensure it starts with https:// or http://']);
    exit;
}

// 3. Restrict fetches to redfin.com only. This proxy exists to read one
// specific Redfin property page on the visitor's behalf; without this check
// it's an open URL fetcher (SSRF) that anyone could point at internal
// services, cloud metadata endpoints, or other unrelated sites using this
// server as cover.
function isSafeRedfinUrl($candidateUrl) {
    $parts = parse_url($candidateUrl);
    if (!$parts || empty($parts['scheme']) || empty($parts['host'])) return false;
    if (!in_array(strtolower($parts['scheme']), ['http', 'https'], true)) return false;

    $host = strtolower($parts['host']);
    if ($host !== 'redfin.com' && substr($host, -11) !== '.redfin.com') {
        return false;
    }

    // Resolve the hostname and reject if any address is private/reserved/
    // loopback (defends against DNS rebinding pointing "redfin.com" at an
    // internal IP via a compromised or misconfigured DNS response).
    $ips = @gethostbynamel($host);
    if ($ips === false || empty($ips)) return false;
    foreach ($ips as $ip) {
        if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false) {
            return false;
        }
    }
    return true;
}

if (!isSafeRedfinUrl($url)) {
    header('Content-Type: application/json');
    echo json_encode(['error' => 'This tool only fetches property pages from redfin.com. Please paste a Redfin property page URL.']);
    exit;
}

// 3b. Short-lived response cache. Scrape.do calls are the slow/costly part of
// this proxy (proxy hop + Redfin render), so if we've already fetched this
// exact URL recently, serve that instead of scraping again. Cache lives
// outside the webroot (system temp dir) so cached property data is never
// directly web-accessible. Only successful lookups are cached — errors and
// blocks are never cached so a retry can immediately try again live.
define('MLS_CACHE_TTL_SECONDS', 20 * 60); // 20 minutes

function mlsCachePath($url) {
    $dir = sys_get_temp_dir() . '/mortgage_calc_mls_cache';
    if (!is_dir($dir)) {
        @mkdir($dir, 0700, true);
    }
    return $dir . '/' . sha1($url) . '.json';
}

function mlsCacheRead($url) {
    $path = mlsCachePath($url);
    if (is_readable($path) && (filemtime($path) > time() - MLS_CACHE_TTL_SECONDS)) {
        $contents = file_get_contents($path);
        if ($contents !== false && $contents !== '') {
            return $contents;
        }
    }
    return null;
}

function mlsCacheWrite($url, $contents) {
    $path = mlsCachePath($url);
    // Write to a temp file then rename so a concurrent read never sees a
    // partially-written cache file.
    $tmpPath = $path . '.' . getmypid() . '.tmp';
    if (@file_put_contents($tmpPath, $contents) !== false) {
        @rename($tmpPath, $path);
    }
}

// Optional cache bypass (?force=1) — lets the UI offer an "overwrite cache"
// action for a lookup that's stuck on a stale or wrong value (e.g. a page-
// parsing bug that got fixed, or the underlying home price actually
// changed) without waiting out the full TTL. A forced request still WRITES
// a fresh cache entry below on success, so this doesn't disable caching —
// it just skips the read for this one request.
$forceRefresh = isset($_GET['force']) && $_GET['force'] === '1';

if (!$forceRefresh) {
    $cached = mlsCacheRead($url);
    if ($cached !== null) {
        header('Content-Type: application/json');
        header('X-MLS-Cache: hit');
        echo $cached;
        exit;
    }
}

// Scrape.do / ScraperAPI credentials are read from the environment (see
// loadApiEnv() above), never hardcoded here. Set SCRAPE_DO_TOKEN and/or
// SCRAPER_API_KEY in /home/nyctltlc/api.env. If neither is set, this proxy
// falls back to a direct request (mobile User-Agent) below.
define('SCRAPE_DO_TOKEN', getenv('SCRAPE_DO_TOKEN') ?: '');
define('SCRAPER_API_KEY', getenv('SCRAPER_API_KEY') ?: '');

$ch = curl_init();

// Security settings applied to every branch below: verify TLS certificates
// properly (previously disabled, which allowed MITM tampering of the fetched
// page), and restrict both the initial request and any redirect Redfin sends
// back to plain http/https, capped at a handful of hops. rates-proxy.php
// already does default cert verification successfully on this host via
// file_get_contents, so this should work the same way here.
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 2);
curl_setopt($ch, CURLOPT_PROTOCOLS, CURLPROTO_HTTP | CURLPROTO_HTTPS);
curl_setopt($ch, CURLOPT_REDIR_PROTOCOLS, CURLPROTO_HTTP | CURLPROTO_HTTPS);
curl_setopt($ch, CURLOPT_MAXREDIRS, 5);

if (defined('SCRAPE_DO_TOKEN') && !empty(SCRAPE_DO_TOKEN)) {
    // Route request through Scrape.do (HTTPS)
    $apiUrl = "https://api.scrape.do?token=" . SCRAPE_DO_TOKEN . "&url=" . urlencode($url);
    curl_setopt($ch, CURLOPT_URL, $apiUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 15); // Wait up to 15 seconds to connect
    curl_setopt($ch, CURLOPT_TIMEOUT, 60);        // Wait up to 60 seconds for full download
} elseif (defined('SCRAPER_API_KEY') && !empty(SCRAPER_API_KEY)) {
    // Route request through ScraperAPI (HTTPS)
    $apiUrl = "https://api.scraperapi.com?api_key=" . SCRAPER_API_KEY . "&url=" . urlencode($url);
    curl_setopt($ch, CURLOPT_URL, $apiUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 15); // Wait up to 15 seconds to connect
    curl_setopt($ch, CURLOPT_TIMEOUT, 60);        // Wait up to 60 seconds for full download
} else {
    // Standard direct cURL request (mimicking mobile browser)
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    // Mobile User-Agent to mimic iPhone/Safari to bypass WAF blocks
    curl_setopt($ch, CURLOPT_USERAGENT, "Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1");
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 10);

    // Emulate basic mobile browser headers to prevent blocks
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language: en-US,en;q=0.9',
        'Referer: https://www.google.com/',
        'Upgrade-Insecure-Requests: 1',
        'DNT: 1'
    ]);
}

$html = curl_exec($ch);

if (curl_errno($ch)) {
    header('Content-Type: application/json');
    echo json_encode(['error' => 'cURL Error: ' . curl_error($ch)]);
} else {
    header('Content-Type: application/json');
    
    // Check the HTTP status code to identify blocks, challenges, or 404s
    $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    if ($http_code === 403 || $http_code === 202 || $http_code === 405) {
        echo json_encode(['error' => 'Connection blocked or challenged by Redfin (HTTP ' . $http_code . '). Please enter the details manually.']);
        curl_close($ch);
        exit;
    } elseif ($http_code === 404) {
        echo json_encode(['error' => 'Property page not found (HTTP 404). Please verify the URL.']);
        curl_close($ch);
        exit;
    } elseif ($http_code !== 200) {
        echo json_encode(['error' => 'Failed to retrieve page. Server returned HTTP Status ' . $http_code]);
        curl_close($ch);
        exit;
    }
    
    // Parse Redfin properties (compatible with the new React Server Components layout)
    $address = "";
    $price = null;
    $hoa_fee = 0;
    $property_tax = null;

    // 1. Extract Address from <title> tag
    if (preg_match('/<title>(.*?)<\/title>/i', $html, $title_matches)) {
        $title = $title_matches[1];
        $parts = explode('|', $title);
        $address = trim($parts[0]);
    }

    // 2. Extract Listing Price. For an active listing this is straightforward
    // (listingPrice). For an off-market home — the case when this proxy is
    // used for the "Have a house to sell?" value lookup, since that home
    // usually isn't listed for sale — Redfin instead shows an automated value
    // estimate under a different JSON key.
    //
    // IMPORTANT ORDERING NOTE (found 2026-08-20, via a real off-market URL):
    // the generic "price" key is NOT safe to check second. An off-market
    // page embeds multiple unrelated JSON blobs (sale-history events, nearby
    // comps, etc.) that can also contain a bare "price" field — on the test
    // URL this matched a 2009 historical sale price ($217,888) instead of
    // the current value shown on the page ($495,520). The correct key for
    // Redfin's own current-value estimate is "redfin_estimate", confirmed
    // present in the raw page JSON. Specific/confirmed keys now come before
    // the generic "price" fallback, which is demoted to last resort.
    if (preg_match('/\\\\?"listingPrice\\\\?"\s*:\s*([0-9.]+)/', $html, $price_matches)) {
        $price = floatval($price_matches[1]);
    } elseif (preg_match('/\\\\?"redfin_estimate\\\\?"\s*:\s*([0-9.]+)/', $html, $price_matches)) {
        $price = floatval($price_matches[1]);
    } elseif (preg_match('/\\\\?"avmValue\\\\?"\s*:\s*([0-9.]+)/', $html, $price_matches)) {
        $price = floatval($price_matches[1]);
    } elseif (preg_match('/\\\\?"estimatedValue\\\\?"\s*:\s*([0-9.]+)/', $html, $price_matches)) {
        $price = floatval($price_matches[1]);
    } elseif (preg_match('/\\\\?"predictedValue\\\\?"\s*:\s*([0-9.]+)/', $html, $price_matches)) {
        $price = floatval($price_matches[1]);
    } elseif (preg_match('/"price"\s*:\s*([0-9.]+)/', $html, $price_matches)) {
        // Last resort — too generic to trust first; see note above.
        $price = floatval($price_matches[1]);
    }

    // 3. Extract HOA Dues
    if (preg_match('/\\\\?"monthlyHoaDues\\\\?"\s*:\s*([0-9.]+)/', $html, $hoa_matches)) {
        $hoa_fee = floatval($hoa_matches[1]);
    }

    // 4. Extract Tax Rate
    if (preg_match('/\\\\?"propertyTaxRate\\\\?"\s*:\s*([0-9.]+)/', $html, $tax_matches)) {
        $property_tax = floatval($tax_matches[1]);
    }

    // If we successfully resolved at least a price, return our compiled JSON block
    if ($price !== null) {
        $responseJson = json_encode([
            'price' => $price,
            'address' => $address,
            'hoa_fee' => $hoa_fee,
            'property_tax' => $property_tax
        ]);
        mlsCacheWrite($url, $responseJson);
        echo $responseJson;
    } else {
        // Fallback: Legacy __NEXT_DATA__ block extraction
        if (preg_match('/id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s', $html, $matches)) {
            mlsCacheWrite($url, $matches[1]);
            echo $matches[1];
        } else {
            echo json_encode(['error' => 'Could not find property data on the provided page.']);
        }
    }
}
curl_close($ch);
?>