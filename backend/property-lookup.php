<?php
/**
 * Shared Redfin property lookup + 7-day cache, used by mortgage-calculator
 * and homeward. Consolidates what used to be two separate, drifting
 * implementations (mortgage-calculator/mls-proxy.php and
 * homeward/api/mls-proxy.php + homeward/api/property-cache.php) into one
 * scrape + one cache, so the same property looked up from either site only
 * ever costs one Scrape.do call per 7-day window instead of up to four
 * (each site had its own short-lived + long-lived cache).
 *
 * NOTE ON SCRAPE.DO BUDGET: this account is on a 1,000-pull/month plan
 * shared across every project that reads SCRAPE_DO_TOKEN from
 * /home/nyctltlc/api.env (see MEMORY.md for current usage). This file's
 * whole job is to avoid spending a pull on a lookup we've already paid
 * for in the last 7 days — DO NOT add any code path here (test, cron,
 * warmup, etc.) that calls this endpoint with force=1 or against
 * synthetic/looped URLs. Any change to the parsing logic should be
 * validated with backend/tests/run-tests.php (fixture HTML, no network)
 * instead of a live request.
 *
 * Request:  GET ?url=<redfin property URL>[&force=1]
 * Response: canonical JSON with RAW (numeric, not display-formatted) values:
 *   {
 *     redfinId, url, address,
 *     price, propertyTaxRate, hoaFee,
 *     beds, baths, sqft, lotSqFt, lotSizeLabel, yearBuilt,
 *     photoUrl,
 *     cached, cacheAgeDays, error
 *   }
 * Callers are responsible for formatting these for display (e.g.
 * "$450,000", "0.25 Acres") — the cache stores raw values so any consumer
 * can use them directly in calculations, not just for display.
 */

require __DIR__ . '/lib/multi-site-parser.php';

// This endpoint never reads or sets a session/cookie, so credentialed CORS
// is never appropriate here (Access-Control-Allow-Credentials is
// intentionally never sent) — a plain reflected/wildcard origin is safe
// since there's nothing origin-specific for a browser to leak by reading
// the response.
if (isset($_SERVER['HTTP_ORIGIN'])) {
    header("Access-Control-Allow-Origin: {$_SERVER['HTTP_ORIGIN']}");
    header("Access-Control-Max-Age: 86400");
} else {
    header("Access-Control-Allow-Origin: *");
}
if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    if (isset($_SERVER['HTTP_ACCESS_CONTROL_REQUEST_METHOD'])) {
        header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
    }
    if (isset($_SERVER['HTTP_ACCESS_CONTROL_REQUEST_HEADERS'])) {
        header("Access-Control-Allow-Headers: {$_SERVER['HTTP_ACCESS_CONTROL_REQUEST_HEADERS']}, Content-Type");
    }
    exit(0);
}

header('Content-Type: application/json');

$REQUEST_START_TIME = microtime(true);

// Raised alongside the curl timeout below (was implicitly capped by
// PHP's default 30s max_execution_time, which would have killed a
// render=true request before curl's own timeout ever got a chance to).
// Keep this above CURLOPT_TIMEOUT (65s, see section 6) with margin for
// the DB reads/writes around it. @-suppressed: some shared-hosting
// configs disable set_time_limit(); if so this is a no-op and the host's
// own ini limit still applies.
@set_time_limit(85);

// ---------------------------------------------------------------------
// Config / constants
// ---------------------------------------------------------------------
define('POSITIVE_CACHE_TTL_SECONDS', 7 * 24 * 60 * 60);   // 7 days — a full, successfully parsed record
define('NEGATIVE_CACHE_TTL_SECONDS', 60 * 60);             // 1 hour — "page loaded but nothing parsed"
define('RATE_LIMIT_WINDOW_SECONDS', 5 * 60);                // 5 minutes
define('RATE_LIMIT_MAX_SCRAPES_PER_WINDOW', 12);             // per IP, only counts requests that actually hit Scrape.do

// ---------------------------------------------------------------------
// Logging — every request writes one line to data/property-lookup.log
// with a timestamp, what happened, and enough context to debug a "why
// didn't this fill in" report without needing to reproduce it live.
// Best-effort only (@-suppressed): a logging failure (e.g. disk full,
// permissions) must never break the actual lookup response.
// ---------------------------------------------------------------------
define('LOG_DIR', __DIR__ . '/data');
define('LOG_FILE', LOG_DIR . '/property-lookup.log');
define('LOG_MAX_BYTES', 5 * 1024 * 1024); // 5MB — rotate to .log.1 (one backup kept) past this

function logEvent($level, $message, $context = []) {
    global $REQUEST_START_TIME;
    if (!is_dir(LOG_DIR)) {
        @mkdir(LOG_DIR, 0755, true);
    }
    // Cheap size-based rotation so this can't grow unbounded on a
    // long-lived box. Not a full rotation scheme — just enough that one
    // backup survives to look at while the active file stays small.
    if (@filesize(LOG_FILE) > LOG_MAX_BYTES) {
        @rename(LOG_FILE, LOG_DIR . '/property-lookup.log.1');
    }

    $context['elapsedMs'] = round((microtime(true) - $REQUEST_START_TIME) * 1000);
    $ctxParts = [];
    foreach ($context as $k => $v) {
        if (is_bool($v)) $v = $v ? 'true' : 'false';
        elseif ($v === null) $v = 'null';
        elseif (is_array($v)) $v = json_encode($v);
        // Strip newlines/control chars from attacker-influenced values
        // (e.g. rawUrl) before they go into the log line — otherwise a
        // crafted request param could inject fake log lines that look
        // like separate, unrelated log entries.
        $v = preg_replace('/[\x00-\x1F\x7F]+/', ' ', (string)$v);
        $ctxParts[] = "$k=$v";
    }
    $line = sprintf(
        '[%s] [%s] [pid:%d] %s %s%s',
        date('Y-m-d H:i:s'),
        $level,
        getmypid(),
        $message,
        implode(' ', $ctxParts),
        PHP_EOL
    );
    @file_put_contents(LOG_FILE, $line, FILE_APPEND | LOCK_EX);
}

// ---------------------------------------------------------------------
// Env / credentials (same convention as the rest of the site)
// ---------------------------------------------------------------------
function loadApiEnv($path = null) {
    $candidatePaths = array_filter([
        $path,
        __DIR__ . '/api.env',
        dirname(__DIR__) . '/api.env',
        '/home/nyctltlc/api.env',
    ]);
    foreach ($candidatePaths as $envPath) {
        if (!is_readable($envPath)) continue;
        foreach (file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
            $line = trim($line);
            if ($line === '' || $line[0] === '#' || strpos($line, '=') === false) continue;
            list($name, $value) = array_map('trim', explode('=', $line, 2));
            $value = trim($value, "\"'");
            if ($name !== '' && getenv($name) === false) {
                putenv("$name=$value");
            }
        }
    }
}
loadApiEnv();

function jsonExit($payload, $httpCode = 200) {
    http_response_code($httpCode);
    echo json_encode($payload);
    exit;
}

function clientIp() {
    // Best-effort — shared hosting behind a CDN/proxy may set X-Forwarded-For;
    // fall back to REMOTE_ADDR. This is only used for a soft rate limit, not
    // a security control, so a spoofed header just means the limit is looser
    // for that caller, not a bypass of anything sensitive.
    if (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
        $parts = explode(',', $_SERVER['HTTP_X_FORWARDED_FOR']);
        return trim($parts[0]);
    }
    return isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '0.0.0.0';
}

// ---------------------------------------------------------------------
// 1. Input
// ---------------------------------------------------------------------
$url = isset($_GET['url']) ? trim($_GET['url']) : '';
$isDirectDev = (isset($_GET['mode']) && $_GET['mode'] === 'dev') || (isset($_GET['direct']) && $_GET['direct'] === '1');

logEvent('INFO', 'request_received', [
    'ip' => clientIp(),
    'rawUrl' => $url,
    'force' => (isset($_GET['force']) && $_GET['force'] === '1'),
    'devMode' => $isDirectDev,
]);

if (!empty($url) && !preg_match('/^https?:\/\//i', $url)) {
    $url = 'https://' . $url;
}

if (empty($url) || filter_var($url, FILTER_VALIDATE_URL) === false || !preg_match('/^https?:\/\//i', $url)) {
    logEvent('WARN', 'rejected_invalid_url', ['ip' => clientIp(), 'rawUrl' => $url]);
    jsonExit(['error' => 'Invalid or missing URL parameter. Ensure it starts with https:// or http://'], 400);
}

if (!isAllowedImportUrl($url)) {
    logEvent('WARN', 'rejected_unsafe_url', ['ip' => clientIp(), 'url' => $url]);
    jsonExit(['error' => 'This tool supports property pages from Redfin, Zillow, Realtor.com, and Homes.com.'], 400);
}

// ---------------------------------------------------------------------
// 2. Cache key: Redfin's own numeric property ID when we can find one
// (stable even if the listing slug/address text changes later), falling
// back to a normalized address string extracted from the URL when no ID
// is present.
// ---------------------------------------------------------------------
$redfinId = extractRedfinId($url);
$fallbackAddress = parseAddressFromRedfinUrl($url);
$cacheKey = $redfinId ? ('rid_' . $redfinId) : ('addr_' . normalizeAddressKey($fallbackAddress ?: $url));

// ---------------------------------------------------------------------
// 3. Database (SQLite, lives outside anything with an unprotected
// extension — site-wide .htaccess already blocks .db directly, this just
// keeps it tidy in its own subfolder).
// ---------------------------------------------------------------------
function getDb() {
    $dir = __DIR__ . '/data';
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    $db = new SQLite3($dir . '/property_cache.db');
    $db->busyTimeout(5000);

    $db->exec('CREATE TABLE IF NOT EXISTS property_cache (
        cache_key TEXT PRIMARY KEY,
        redfin_id TEXT,
        url TEXT,
        address TEXT,
        price REAL,
        property_tax_rate REAL,
        hoa_fee REAL,
        beds REAL,
        baths REAL,
        sqft REAL,
        lot_sqft REAL,
        year_built REAL,
        photo_url TEXT,
        json_data TEXT,
        created_at INTEGER,
        expires_at INTEGER
    )');

    // Migration: year_built added 2026-08-22, after property_cache already
    // existed in production with rows from before this field existed.
    // CREATE TABLE IF NOT EXISTS above only takes effect for a brand-new DB
    // file — an existing table needs an explicit ALTER TABLE to pick up a
    // new column. Guarded by checking PRAGMA table_info first since SQLite
    // has no "ADD COLUMN IF NOT EXISTS" and re-running ALTER TABLE ADD
    // COLUMN on a column that already exists throws. Runs once (cheap
    // PRAGMA query) then never again per DB file, since the column exists
    // on every call after the first.
    $hasYearBuiltColumn = false;
    $cols = $db->query('PRAGMA table_info(property_cache)');
    while ($col = $cols->fetchArray(SQLITE3_ASSOC)) {
        if ($col['name'] === 'year_built') { $hasYearBuiltColumn = true; break; }
    }
    if (!$hasYearBuiltColumn) {
        $db->exec('ALTER TABLE property_cache ADD COLUMN year_built REAL');
    }

    $db->exec('CREATE TABLE IF NOT EXISTS property_cache_negative (
        cache_key TEXT PRIMARY KEY,
        url TEXT,
        reason TEXT,
        created_at INTEGER,
        expires_at INTEGER
    )');

    $db->exec('CREATE TABLE IF NOT EXISTS request_log (
        ip TEXT,
        ts INTEGER
    )');

    // 2026-08-22: added after logs showed 3 concurrent requests for the
    // SAME property (same cache_key) within under a minute, each one
    // missing cache and firing its own live Scrape.do call — the
    // Auto-Detect buttons don't disable themselves while a fetch is in
    // flight, so a second click (or a second tab/device) just started a
    // second paid render on top of the first. This table makes the
    // server itself the backstop, not just the button state.
    $db->exec('CREATE TABLE IF NOT EXISTS in_flight_lookup (
        cache_key TEXT PRIMARY KEY,
        started_at INTEGER,
        expires_at INTEGER
    )');

    return $db;
}

function purgeExpired($db) {
    $now = time();
    $db->exec("DELETE FROM property_cache WHERE expires_at < $now");
    $db->exec("DELETE FROM property_cache_negative WHERE expires_at < $now");
    // request_log rows older than the rate-limit window are noise; sweep
    // generously (1 hour) rather than exactly, this table is only ever
    // read via a bounded COUNT() query so stale rows cost a little disk,
    // not correctness.
    $cutoff = $now - 3600;
    $db->exec("DELETE FROM request_log WHERE ts < $cutoff");
}

function rowToResponse($row, $cached, $cacheAgeDays) {
    $provider = null;
    $rentalEstimate = null;
    if (!empty($row['json_data'])) {
        $json = @json_decode($row['json_data'], true);
        if (isset($json['provider'])) $provider = $json['provider'];
        if (isset($json['rentalEstimate']) && $json['rentalEstimate'] !== null) {
            $rentalEstimate = (float)$json['rentalEstimate'];
        }
    }
    if (!$provider && !empty($row['url'])) {
        $provider = detectProviderDomain($row['url']);
    }
    return [
        'redfinId' => $row['redfin_id'],
        'url' => $row['url'],
        'address' => $row['address'],
        'provider' => $provider ?: 'generic',
        'price' => $row['price'] !== null ? (float)$row['price'] : null,
        'rentalEstimate' => $rentalEstimate,
        'propertyTaxRate' => $row['property_tax_rate'] !== null ? (float)$row['property_tax_rate'] : null,
        'hoaFee' => $row['hoa_fee'] !== null ? (float)$row['hoa_fee'] : null,
        'beds' => $row['beds'] !== null ? (float)$row['beds'] : null,
        'baths' => $row['baths'] !== null ? (float)$row['baths'] : null,
        'sqft' => $row['sqft'] !== null ? (float)$row['sqft'] : null,
        'lotSqFt' => $row['lot_sqft'] !== null ? (float)$row['lot_sqft'] : null,
        'lotSizeLabel' => lotSizeLabel($row['lot_sqft']),
        'yearBuilt' => isset($row['year_built']) && $row['year_built'] !== null ? (int)$row['year_built'] : null,
        'photoUrl' => $row['photo_url'],
        'cached' => $cached,
        'cacheAgeDays' => $cacheAgeDays,
    ];
}

$db = getDb();
purgeExpired($db);

$forceRefresh = isset($_GET['force']) && $_GET['force'] === '1';

// ---------------------------------------------------------------------
// 4. Positive cache lookup
// ---------------------------------------------------------------------
if (!$forceRefresh) {
    $stmt = $db->prepare('SELECT * FROM property_cache WHERE cache_key = :key');
    $stmt->bindValue(':key', $cacheKey, SQLITE3_TEXT);
    $row = $stmt->execute()->fetchArray(SQLITE3_ASSOC);

    // Fallback: match by street address if looking up via a different provider URL
    if (!$row && !empty($fallbackAddress) && strlen($fallbackAddress) > 5) {
        $streetMatch = $fallbackAddress;
        if (preg_match('/^(\d+\s+[a-z0-9\s]+?)(?:,|\s+[a-z]+(?:\s+[a-z]{2})?(?:\s+\d{5})?|$)/i', $fallbackAddress, $stM)) {
            $streetMatch = trim($stM[1]);
        } else {
            $streetMatch = preg_replace('/,.*$/', '', $fallbackAddress);
        }

        if (strlen($streetMatch) > 5) {
            $fuzzyStmt = $db->prepare('SELECT * FROM property_cache WHERE address LIKE :addrPattern AND expires_at > :now LIMIT 1');
            $fuzzyStmt->bindValue(':addrPattern', '%' . $streetMatch . '%', SQLITE3_TEXT);
            $fuzzyStmt->bindValue(':now', time(), SQLITE3_INTEGER);
            $row = $fuzzyStmt->execute()->fetchArray(SQLITE3_ASSOC);
        }
    }

    if ($row && $row['expires_at'] > time()) {
        $ageDays = round((time() - $row['created_at']) / 86400, 1);
        header('X-Property-Cache: HIT-7DAY');
        logEvent('INFO', 'cache_hit_positive', [
            'cacheKey' => $cacheKey, 'url' => $url, 'ageDays' => $ageDays,
            'hasPrice' => ($row['price'] !== null), 'hasHoa' => ($row['hoa_fee'] !== null),
            'hasPhoto' => !empty($row['photo_url']), 'hasSqft' => ($row['sqft'] !== null),
            'hasYearBuilt' => (isset($row['year_built']) && $row['year_built'] !== null),
        ]);
        jsonExit(rowToResponse($row, true, $ageDays));
    }

    // Negative cache check
    $negStmt = $db->prepare('SELECT * FROM property_cache_negative WHERE cache_key = :key');
    $negStmt->bindValue(':key', $cacheKey, SQLITE3_TEXT);
    $negRow = $negStmt->execute()->fetchArray(SQLITE3_ASSOC);
    if ($negRow && $negRow['expires_at'] > time()) {
        header('X-Property-Cache: HIT-NEGATIVE');
        logEvent('WARN', 'cache_hit_negative', [
            'cacheKey' => $cacheKey, 'url' => $url, 'reason' => $negRow['reason'],
        ]);
        jsonExit(['error' => $negRow['reason'], 'cached' => false, 'recentlyFailed' => true], 200);
    }
}

// Neither cache had a usable row — return 200 cache miss instructing user to import via Bookmarklet
logEvent('INFO', 'cache_miss_no_scrape', [
    'cacheKey' => $cacheKey, 'url' => $url,
    'staleRowFound' => (bool)$row, 'staleNegRowFound' => (bool)$negRow,
]);
jsonExit([
    'error' => 'Property not found in cache. Click the 🔖 Bookmarklet button while viewing the listing page in your browser to import it to Nycto.ninja!',
    'cached' => false
], 200);
