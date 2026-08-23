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

require __DIR__ . '/lib/property-parser.php';

if (isset($_SERVER['HTTP_ORIGIN'])) {
    header("Access-Control-Allow-Origin: {$_SERVER['HTTP_ORIGIN']}");
    header("Access-Control-Allow-Credentials: true");
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

if (!isSafeRedfinUrl($url)) {
    logEvent('WARN', 'rejected_unsafe_url', ['ip' => clientIp(), 'url' => $url]);
    jsonExit(['error' => 'This tool only fetches property pages from redfin.com. Please paste a Redfin property page URL.'], 400);
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
    return [
        'redfinId' => $row['redfin_id'],
        'url' => $row['url'],
        'address' => $row['address'],
        'price' => $row['price'] !== null ? (float)$row['price'] : null,
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

    // Negative cache: a recent scrape found nothing parseable on this exact
    // page. Don't burn another Scrape.do call re-fetching a page we just
    // confirmed doesn't parse — return the same error without scraping
    // again until the short negative TTL expires (or the caller forces).
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

    // Neither cache had a usable row — this is what actually triggers the
    // live Scrape.do call below. staleRowFound/staleNegRowFound flag a row
    // that existed but had already expired (as opposed to never having
    // been cached at all), which is useful to see when eyeballing why a
    // property that "should" be cached is scraping again.
    logEvent('INFO', 'cache_miss', [
        'cacheKey' => $cacheKey, 'url' => $url,
        'staleRowFound' => (bool)$row, 'staleNegRowFound' => (bool)$negRow,
    ]);
} else {
    logEvent('INFO', 'cache_skipped_force', ['cacheKey' => $cacheKey, 'url' => $url]);
}

// ---------------------------------------------------------------------
// 4b. In-flight dedup lock. We're now committed to a live scrape unless
// someone else already started one for this exact property. TTL (90s) is
// set above CURLOPT_TIMEOUT (65s) + set_time_limit() (85s) below, so a
// legitimately-still-running request's lock never expires out from under
// it. register_shutdown_function() releases the lock on every exit path
// — a normal jsonExit()/exit, a PHP fatal error, or the script hitting
// max_execution_time — so a crashed worker can't leave a lock stuck for
// its full 90s TTL under normal conditions; the TTL sweep below is just
// the backstop for the rare case a host force-kills the process outright
// (e.g. OOM), which bypasses shutdown functions entirely.
// ---------------------------------------------------------------------
define('IN_FLIGHT_LOCK_TTL_SECONDS', 90);

$lockNow = time();
$db->exec('DELETE FROM in_flight_lookup WHERE expires_at < ' . $lockNow);

$lockStmt = $db->prepare('SELECT * FROM in_flight_lookup WHERE cache_key = :key');
$lockStmt->bindValue(':key', $cacheKey, SQLITE3_TEXT);
$existingLock = $lockStmt->execute()->fetchArray(SQLITE3_ASSOC);

if ($existingLock && $existingLock['expires_at'] > $lockNow) {
    logEvent('WARN', 'dedup_in_flight_skip', [
        'cacheKey' => $cacheKey, 'url' => $url,
        'lockAgeSec' => ($lockNow - $existingLock['started_at']),
    ]);
    jsonExit([
        'error' => 'A lookup for this property is already in progress (started ' .
            ($lockNow - $existingLock['started_at']) . 's ago). Please wait a moment and try again.',
        'inFlight' => true,
    ], 200);
}

$lockStmt2 = $db->prepare('INSERT OR REPLACE INTO in_flight_lookup (cache_key, started_at, expires_at) VALUES (:key, :started, :expires)');
$lockStmt2->bindValue(':key', $cacheKey, SQLITE3_TEXT);
$lockStmt2->bindValue(':started', $lockNow, SQLITE3_INTEGER);
$lockStmt2->bindValue(':expires', $lockNow + IN_FLIGHT_LOCK_TTL_SECONDS, SQLITE3_INTEGER);
$lockStmt2->execute();

register_shutdown_function(function () use ($db, $cacheKey) {
    $del = $db->prepare('DELETE FROM in_flight_lookup WHERE cache_key = :key');
    $del->bindValue(':key', $cacheKey, SQLITE3_TEXT);
    $del->execute();
    logEvent('INFO', 'dedup_lock_released', ['cacheKey' => $cacheKey]);
});

// ---------------------------------------------------------------------
// 5. Rate limit — only applies to requests that reach this point, i.e.
// requests about to spend a real Scrape.do credit (cache miss or forced
// refresh). Normal cache hits above never touch this.
// ---------------------------------------------------------------------
$ip = clientIp();
$windowStart = time() - RATE_LIMIT_WINDOW_SECONDS;
$countStmt = $db->prepare('SELECT COUNT(*) AS n FROM request_log WHERE ip = :ip AND ts > :windowStart');
$countStmt->bindValue(':ip', $ip, SQLITE3_TEXT);
$countStmt->bindValue(':windowStart', $windowStart, SQLITE3_INTEGER);
$recentCount = (int)($countStmt->execute()->fetchArray(SQLITE3_ASSOC)['n'] ?? 0);

if ($recentCount >= RATE_LIMIT_MAX_SCRAPES_PER_WINDOW) {
    logEvent('WARN', 'rate_limited', ['ip' => $ip, 'recentCount' => $recentCount, 'url' => $url]);
    jsonExit(['error' => 'Too many property lookups from this connection in a short time. Please wait a few minutes and try again.'], 429);
}

$logStmt = $db->prepare('INSERT INTO request_log (ip, ts) VALUES (:ip, :ts)');
$logStmt->bindValue(':ip', $ip, SQLITE3_TEXT);
$logStmt->bindValue(':ts', time(), SQLITE3_INTEGER);
$logStmt->execute();

// ---------------------------------------------------------------------
// 6. Scrape.do / ScraperAPI fetch. Always request headless rendering
// (render=true) — mortgage-calculator's old proxy skipped this for a
// cheaper call, but that only ever got it price/HOA/tax; homeward needs
// beds/baths/sqft/photo too, which need the rendered page. One shared
// scrape has to satisfy the richer of the two consumers.
// ---------------------------------------------------------------------
define('SCRAPE_DO_TOKEN', getenv('SCRAPE_DO_TOKEN') ?: '');
define('SCRAPER_API_KEY', getenv('SCRAPER_API_KEY') ?: '');

$ch = curl_init();
curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 2);
curl_setopt($ch, CURLOPT_PROTOCOLS, CURLPROTO_HTTP | CURLPROTO_HTTPS);
curl_setopt($ch, CURLOPT_REDIR_PROTOCOLS, CURLPROTO_HTTP | CURLPROTO_HTTPS);
curl_setopt($ch, CURLOPT_MAXREDIRS, 5);

// Timeout budget — history, most recent fix first:
// 2026-08-22c: root cause wasn't "needs more time" after all. Switched the
// scrape.do request from render=true (headless Chrome rendering, +timeout
// param) to super=true (residential-IP proxy, NO headless browser).
// Redfin's anti-bot layer was almost certainly fingerprinting Scrape.do's
// headless Chrome session specifically — a plain fetch through a
// residential IP reads as a normal browser request and doesn't trip it.
// This also confirms render=true was never actually necessary for most of
// what homeward needs: a successful super=true pull on 9454 Wolfe Pl
// returned price/hoaFee/photoUrl/beds/baths/lotSqFt in ~4s (vs. the 30-60s+
// render=true was taking, and often still failing). Only sqft came back
// null on that same successful pull — that's a backend/lib/property-parser.php
// gap (the raw page's markup apparently doesn't expose it the same way
// beds/baths do), not a scrape-method problem; worth a fixture-driven look
// separately.
// 2026-08-22b (superseded by the above): logs showed curlErrno 28 ("0
// bytes received") at 30002ms, then — after bumping curl's timeout —
// Scrape.do itself returning HTTP 502 at 45670ms, meaning its OWN
// render=true renderer was giving up right at the `timeout` param we were
// passing it. Read as "this listing's render just needs longer" and the
// budget was widened accordingly (30s->50s->65s curl / none->45s->60s
// Scrape.do timeout param). That diagnosis was wrong: no amount of extra
// time was going to help a request that was actually being fingerprinted,
// not merely running slow.
// Nesting still matters for whichever provider branch actually fires
// (scrape.do below is fast now — ~15s ceiling is generous; the scraperapi
// fallback branch still uses the old render=true+65s approach and hasn't
// been revisited, since scrape.do is the one actually configured/in use —
// see SCRAPE_DO_TOKEN vs SCRAPER_API_KEY below):
//   innermost curl timeout (15s scrape.do / 65s scraperapi fallback)
//   < PHP set_time_limit() above (85s) — script isn't killed mid-write
//   < caller's fetch AbortController (see js/property-links.js, 75s)
// These outer two are sized to the scraperapi fallback's larger 65s, not
// scrape.do's fast path — don't shrink them without also revisiting that
// fallback branch, or a request that legitimately falls back to it could
// get killed by set_time_limit()/the client abort before curl's own
// timeout ever decides "too slow".

if ($isDirectDev) {
    $provider = 'direct (dev mode)';
    $pythonCmd = 'python ' . escapeshellarg(__DIR__ . '/lib/fetch_direct.py') . ' ' . escapeshellarg($url);
    $pythonOutput = @shell_exec($pythonCmd);
    if (!empty($pythonOutput)) {
        $pyData = @json_decode($pythonOutput, true);
        if (is_array($pyData) && isset($pyData['status'])) {
            $httpCode = (int)$pyData['status'];
            $html = isset($pyData['content']) ? $pyData['content'] : '';
            $htmlBytes = strlen($html);
            logEvent('INFO', 'scrape_completed', ['provider' => $provider, 'url' => $url, 'httpCode' => $httpCode, 'htmlBytes' => $htmlBytes]);
            goto check_response_status;
        }
    }
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_USERAGENT, "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36");
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
    curl_setopt($ch, CURLOPT_TIMEOUT, 15);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language: en-US,en;q=0.9',
        'Referer: https://www.google.com/',
        'Upgrade-Insecure-Requests: 1',
        'DNT: 1'
    ]);
} elseif (defined('SCRAPE_DO_TOKEN') && !empty(SCRAPE_DO_TOKEN)) {
    $provider = 'scrape.do';
    // super=true (residential proxy) instead of render=true (headless
    // Chrome) — see the timeout-budget comment above for why. Redfin's own
    // server-rendered HTML already embeds most of what we need, so the
    // headless render wasn't just slow, it was actively counterproductive.
    $apiUrl = "https://api.scrape.do?token=" . SCRAPE_DO_TOKEN . "&super=true&url=" . urlencode($url);
    curl_setopt($ch, CURLOPT_URL, $apiUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
    curl_setopt($ch, CURLOPT_TIMEOUT, 15);
} elseif (defined('SCRAPER_API_KEY') && !empty(SCRAPER_API_KEY)) {
    $provider = 'scraperapi';
    $apiUrl = "https://api.scraperapi.com?api_key=" . SCRAPER_API_KEY . "&render=true&url=" . urlencode($url);
    curl_setopt($ch, CURLOPT_URL, $apiUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 10);
    curl_setopt($ch, CURLOPT_TIMEOUT, 65);
} else {
    $provider = 'direct';
    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_USERAGENT, "Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1");
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
    curl_setopt($ch, CURLOPT_TIMEOUT, 15);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language: en-US,en;q=0.9',
        'Referer: https://www.google.com/',
        'Upgrade-Insecure-Requests: 1',
        'DNT: 1'
    ]);
}

logEvent('INFO', 'scrape_started', ['provider' => $provider, 'cacheKey' => $cacheKey, 'url' => $url]);

$html = curl_exec($ch);

if (curl_errno($ch)) {
    $err = curl_error($ch);
    $errno = curl_errno($ch);
    curl_close($ch);
    logEvent('ERROR', 'curl_error', ['provider' => $provider, 'url' => $url, 'curlErrno' => $errno, 'curlError' => $err]);
    jsonExit(['error' => 'cURL Error: ' . $err], 502);
}

$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$htmlBytes = is_string($html) ? strlen($html) : 0;
@curl_close($ch);

check_response_status:

// A short, single-line preview of whatever body came back on a
// non-success response — the actual wording (a Scrape.do error JSON, a
// Redfin challenge page, a proxy's own HTML error page) is what tells you
// WHICH layer failed without having to reproduce it live.
function bodySnippet($html, $len = 500) {
    if (!is_string($html) || $html === '') return '';
    $snippet = preg_replace('/\s+/', ' ', trim($html));
    if (function_exists('mb_substr')) {
        return mb_substr($snippet, 0, $len);
    }
    return substr($snippet, 0, $len);
}

if ($httpCode === 502) {
    // Per Scrape.do's docs: 502 = "render didn't finish in time, please
    // retry" and does NOT consume a credit — distinct from a real block
    // or a dead proxy, so it gets its own branch/message rather than
    // falling into the generic scrape_bad_status case below.
    logEvent('WARN', 'scrape_timeout_502', [
        'provider' => $provider, 'url' => $url, 'htmlBytes' => $htmlBytes,
        'bodySnippet' => bodySnippet($html),
    ]);
    jsonExit(['error' => 'Property lookup timed out rendering the page. This did not use up a lookup credit — please try Auto-Detect again.', 'retryable' => true], 200);
} elseif ($httpCode === 403 || $httpCode === 202 || $httpCode === 405) {
    logEvent('WARN', 'scrape_blocked', [
        'provider' => $provider, 'url' => $url, 'httpCode' => $httpCode, 'htmlBytes' => $htmlBytes,
        'bodySnippet' => bodySnippet($html),
    ]);
    jsonExit([
        'error' => 'Connection challenged or rate-limited by Redfin (HTTP ' . $httpCode . ').',
        'rateLimited' => true,
        'retryable' => true,
        'recommendedDelaySec' => 6
    ], 200);
} elseif ($httpCode === 404) {
    logEvent('WARN', 'scrape_404', ['provider' => $provider, 'url' => $url, 'bodySnippet' => bodySnippet($html)]);
    jsonExit(['error' => 'Property page not found (HTTP 404). Please verify the URL.'], 200);
} elseif ($httpCode !== 200) {
    logEvent('ERROR', 'scrape_bad_status', [
        'provider' => $provider, 'url' => $url, 'httpCode' => $httpCode, 'htmlBytes' => $htmlBytes,
        'bodySnippet' => bodySnippet($html),
    ]);
    jsonExit(['error' => 'Failed to retrieve page. Server returned HTTP Status ' . $httpCode], 200);
}

logEvent('INFO', 'scrape_response_ok', ['provider' => $provider, 'url' => $url, 'httpCode' => $httpCode, 'htmlBytes' => $htmlBytes]);

// ---------------------------------------------------------------------
// 7. Parse (see backend/lib/property-parser.php) and store/respond.
// ---------------------------------------------------------------------
$parsed = parsePropertyHtml($html, $fallbackAddress);

if (!$parsed['foundSomething']) {
    // Negative-cache this exact page for a short window so a temporary
    // Redfin layout change or an off-market page we can't parse doesn't
    // get hit with another paid scrape every time someone looks it up
    // again in the next hour. Deliberately a SEPARATE table from
    // property_cache, so a page that fails to parse today never clobbers
    // a good record fetched on a previous, successful pull.
    $now = time();
    $stmt = $db->prepare('INSERT OR REPLACE INTO property_cache_negative (cache_key, url, reason, created_at, expires_at) VALUES (:key, :url, :reason, :created_at, :expires_at)');
    $stmt->bindValue(':key', $cacheKey, SQLITE3_TEXT);
    $stmt->bindValue(':url', $url, SQLITE3_TEXT);
    $stmt->bindValue(':reason', 'Could not find property data on the provided page.', SQLITE3_TEXT);
    $stmt->bindValue(':created_at', $now, SQLITE3_INTEGER);
    $stmt->bindValue(':expires_at', $now + NEGATIVE_CACHE_TTL_SECONDS, SQLITE3_INTEGER);
    $stmt->execute();

    logEvent('WARN', 'parse_failed', ['cacheKey' => $cacheKey, 'url' => $url, 'htmlBytes' => $htmlBytes]);
    jsonExit(['error' => 'Could not find property data on the provided page.', 'cached' => false]);
}

$now = time();
$expiresAt = $now + POSITIVE_CACHE_TTL_SECONDS;
$jsonData = json_encode(array_merge($parsed, ['redfinId' => $redfinId, 'url' => $url]));

$stmt = $db->prepare('INSERT OR REPLACE INTO property_cache
    (cache_key, redfin_id, url, address, price, property_tax_rate, hoa_fee, beds, baths, sqft, lot_sqft, year_built, photo_url, json_data, created_at, expires_at)
    VALUES (:key, :redfin_id, :url, :address, :price, :tax, :hoa, :beds, :baths, :sqft, :lot, :year, :photo, :json, :created_at, :expires_at)');
$stmt->bindValue(':key', $cacheKey, SQLITE3_TEXT);
$stmt->bindValue(':redfin_id', $redfinId, SQLITE3_TEXT);
$stmt->bindValue(':url', $url, SQLITE3_TEXT);
$stmt->bindValue(':address', $parsed['address'], SQLITE3_TEXT);
$stmt->bindValue(':price', $parsed['price'], SQLITE3_FLOAT);
$stmt->bindValue(':tax', $parsed['propertyTaxRate'], SQLITE3_FLOAT);
$stmt->bindValue(':hoa', $parsed['hoaFee'], SQLITE3_FLOAT);
$stmt->bindValue(':beds', $parsed['beds'], SQLITE3_FLOAT);
$stmt->bindValue(':baths', $parsed['baths'], SQLITE3_FLOAT);
$stmt->bindValue(':sqft', $parsed['sqft'], SQLITE3_FLOAT);
$stmt->bindValue(':lot', $parsed['lotSqFt'], SQLITE3_FLOAT);
$stmt->bindValue(':year', $parsed['yearBuilt'], SQLITE3_FLOAT);
$stmt->bindValue(':photo', $parsed['photoUrl'], SQLITE3_TEXT);
$stmt->bindValue(':json', $jsonData, SQLITE3_TEXT);
$stmt->bindValue(':created_at', $now, SQLITE3_INTEGER);
$stmt->bindValue(':expires_at', $expiresAt, SQLITE3_INTEGER);
$stmt->execute();

// Clear any stale negative-cache entry for this key now that we have a
// good record — otherwise a future request could theoretically still see
// an old negative row if it somehow outlived this write.
$clearNeg = $db->prepare('DELETE FROM property_cache_negative WHERE cache_key = :key');
$clearNeg->bindValue(':key', $cacheKey, SQLITE3_TEXT);
$clearNeg->execute();

logEvent('INFO', 'scrape_success', [
    'cacheKey' => $cacheKey, 'url' => $url,
    'hasPrice' => ($parsed['price'] !== null), 'hasHoa' => ($parsed['hoaFee'] !== null),
    'hasPhoto' => !empty($parsed['photoUrl']), 'hasBeds' => ($parsed['beds'] !== null),
    'hasBaths' => ($parsed['baths'] !== null), 'hasSqft' => ($parsed['sqft'] !== null),
    'hasLotSqFt' => ($parsed['lotSqFt'] !== null), 'hasYearBuilt' => ($parsed['yearBuilt'] !== null),
]);

header('X-Property-Cache: MISS-SCRAPED');
jsonExit([
    'redfinId' => $redfinId,
    'url' => $url,
    'address' => $parsed['address'],
    'price' => $parsed['price'],
    'propertyTaxRate' => $parsed['propertyTaxRate'],
    'hoaFee' => $parsed['hoaFee'],
    'beds' => $parsed['beds'],
    'baths' => $parsed['baths'],
    'sqft' => $parsed['sqft'],
    'lotSqFt' => $parsed['lotSqFt'],
    'lotSizeLabel' => lotSizeLabel($parsed['lotSqFt']),
    'yearBuilt' => $parsed['yearBuilt'],
    'photoUrl' => $parsed['photoUrl'],
    'cached' => false,
    'cacheAgeDays' => 0,
]);
