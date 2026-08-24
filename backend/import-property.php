<?php
/**
 * Ingestion endpoint for property imports submitted from client browsers
 * (via the "Import to Nycto.ninja" bookmarklet or extension).
 *
 * Accepts POST JSON or Form POST: { "url": "https://...", "html": "<!DOCTYPE html>..." }
 * Validates domain & scheme, parses the HTML using multi-site-parser.php,
 * and writes a 7-day positive cache row to backend/data/property_cache.db.
 *
 * Supports both JSON response (for extensions/AJAX) and styled HTML popup
 * response (for HTML Form POSTs submitted by the bookmarklet).
 */

require_once __DIR__ . '/lib/multi-site-parser.php';

// CORS handling — allow cross-origin requests from redfin.com, zillow.com, realtor.com, etc.
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

define('POSITIVE_CACHE_TTL_SECONDS', 7 * 24 * 60 * 60);

function isJsonRequest() {
    if (!empty($_SERVER['HTTP_ACCEPT']) && strpos($_SERVER['HTTP_ACCEPT'], 'application/json') !== false) {
        return true;
    }
    if (!empty($_SERVER['CONTENT_TYPE']) && strpos($_SERVER['CONTENT_TYPE'], 'application/json') !== false) {
        return true;
    }
    return false;
}

function respondPayload($payload, $httpCode = 200) {
    if (isJsonRequest()) {
        header('Content-Type: application/json');
        http_response_code($httpCode);
        echo json_encode($payload);
        exit;
    }

    // HTML Popup Response for Form POSTs
    http_response_code($httpCode);
    header('Content-Type: text/html; charset=utf-8');
    
    $isSuccess = !empty($payload['success']);
    $url = isset($payload['url']) ? $payload['url'] : '';
    $address = isset($payload['address']) ? $payload['address'] : 'Property Listing';
    $price = isset($payload['price']) && $payload['price'] ? '$' . number_format($payload['price']) : '';
    $provider = isset($payload['provider']) ? ucfirst($payload['provider']) : 'Listing';
    $error = isset($payload['error']) ? $payload['error'] : 'Unknown error occurred.';

    $beds = isset($payload['beds']) && $payload['beds'] ? $payload['beds'] . ' bd' : '';
    $baths = isset($payload['baths']) && $payload['baths'] ? $payload['baths'] . ' ba' : '';
    $sqft = isset($payload['sqft']) && $payload['sqft'] ? number_format($payload['sqft']) . ' sqft' : '';
    $specs = implode(' • ', array_filter([$beds, $baths, $sqft]));

    $calcUrl = 'https://nycto.ninja/mortgage-calculator/?url=' . urlencode($url);
    $homewardUrl = 'https://nycto.ninja/homeward/?url=' . urlencode($url);
    ?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.5">
    <title><?= $isSuccess ? 'Imported to Nycto.ninja' : 'Import Error' ?></title>
    <style>
        * { box-sizing: border-box; }
        body { background: #080a0f; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 1.25rem; }
        .card { background: #0f172a; border: 1px solid #334155; border-radius: 14px; padding: 1.75rem; max-width: 420px; width: 100%; text-align: center; box-shadow: 0 20px 35px rgba(0,0,0,0.6); }
        .badge { display: inline-block; background: rgba(16,185,129,0.15); color: #34d399; font-weight: 700; font-size: 0.75rem; padding: 0.3rem 0.85rem; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 0.85rem; border: 1px solid rgba(16,185,129,0.3); }
        .badge-error { background: rgba(239,68,68,0.15); color: #f87171; border-color: rgba(239,68,68,0.3); }
        h2 { margin: 0 0 0.4rem; font-size: 1.15rem; color: #f8fafc; font-weight: 600; line-height: 1.35; }
        .price { font-size: 1.65rem; font-weight: 800; color: #38bdf8; margin: 0.4rem 0; letter-spacing: -0.01em; }
        .specs { font-size: 0.85rem; color: #94a3b8; margin-bottom: 1.25rem; font-weight: 500; }
        .error-msg { font-size: 0.85rem; color: #f87171; margin: 0.75rem 0 1.25rem; line-height: 1.5; }
        .btn-group { display: flex; gap: 0.5rem; margin-bottom: 0.5rem; }
        .btn { display: block; width: 100%; background: linear-gradient(135deg, #0ea5e9, #0284c7); color: #080a0f; font-weight: 700; text-decoration: none; padding: 0.65rem 0.75rem; border-radius: 8px; font-size: 0.825rem; transition: filter 0.2s, transform 0.1s; text-align: center; }
        .btn-secondary { background: linear-gradient(135deg, #6366f1, #4f46e5); color: #ffffff; }
        .btn:hover { filter: brightness(1.1); }
        .btn:active { transform: translateY(1px); }
        .footer-note { font-size: 0.725rem; color: #64748b; margin-top: 1rem; }
    </style>
</head>
<body>
    <div class="card">
        <?php if ($isSuccess): ?>
            <div class="badge">✓ Cached to Nycto.ninja (<?= htmlspecialchars($provider) ?>)</div>
            <h2><?= htmlspecialchars($address) ?></h2>
            <?php if ($price): ?><div class="price"><?= htmlspecialchars($price) ?></div><?php endif; ?>
            <?php if ($specs): ?><div class="specs"><?= htmlspecialchars($specs) ?></div><?php endif; ?>
            <div class="btn-group">
                <a href="<?= htmlspecialchars($calcUrl) ?>" target="_blank" class="btn">Calculator →</a>
                <a href="<?= htmlspecialchars($homewardUrl) ?>" target="_blank" class="btn btn-secondary">Homeward →</a>
            </div>
            <div class="footer-note">📋 Saved to shared 7-day cache! Closing window in 4s...</div>
            <script>
            try {
                localStorage.setItem('nycto_recent_imported_property', JSON.stringify({
                    url: <?= json_encode($url) ?>,
                    address: <?= json_encode($address) ?>,
                    price: <?= json_encode(isset($payload['price']) ? $payload['price'] : null) ?>,
                    provider: <?= json_encode($provider) ?>,
                    ts: Date.now()
                }));
            } catch(e) {}
            setTimeout(function(){ window.close(); }, 4000);
            </script>
        <?php else: ?>
            <div class="badge badge-error">❌ Import Failed</div>
            <h2>Could not import listing</h2>
            <div class="error-msg"><?= htmlspecialchars($error) ?></div>
            <button type="button" onclick="window.close()" class="btn" style="background:#334155;color:#f8fafc;">Close Window</button>
        <?php endif; ?>
    </div>
</body>
</html>
    <?php
    exit;
}

// 1. Input Extraction
$rawBody = file_get_contents('php://input');
$body = @json_decode($rawBody, true) ?: [];

$url = isset($body['url']) ? trim($body['url']) : (isset($_POST['url']) ? trim($_POST['url']) : (isset($_GET['url']) ? trim($_GET['url']) : ''));
$rawHtml = isset($body['html']) ? $body['html'] : (isset($_POST['html']) ? $_POST['html'] : '');

$html = $rawHtml;
if (!empty($rawHtml)) {
    $decoded = @base64_decode($rawHtml, true);
    if ($decoded !== false && preg_match('/<html|<body|<head|<script|<title|__NEXT_DATA__/i', $decoded)) {
        $html = $decoded;
    }
}

if (empty($url) || !preg_match('/^https?:\/\//i', $url)) {
    respondPayload(['error' => 'Missing or invalid property URL. Must start with http:// or https://'], 400);
}

if (!isAllowedImportUrl($url)) {
    respondPayload(['error' => 'This import endpoint only accepts listing pages from Redfin, Zillow, Realtor.com, or Homes.com.'], 400);
}

if (empty($html)) {
    respondPayload(['error' => 'Missing HTML page content payload.'], 400);
}

// 2. Derive Cache Key
$provider = detectProviderDomain($url);
$redfinId = extractRedfinId($url);
$fallbackAddress = parseAddressFromRedfinUrl($url);

if ($redfinId) {
    $cacheKey = 'rid_' . $redfinId;
} else {
    $addrKeyStr = $fallbackAddress ?: $url;
    $cacheKey = 'addr_' . normalizeAddressKey($addrKeyStr);
}

// 3. Parse HTML
$parsed = parsePropertyHtmlByUrl($html, $url, $fallbackAddress);

if (!$parsed['foundSomething']) {
    respondPayload(['error' => 'Could not extract valid property details from the provided page HTML.', 'cached' => false], 422);
}

// 4. Update SQLite Database Cache (property_cache.db)
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

// Migration: ensure year_built column exists
$hasYearBuiltColumn = false;
$cols = $db->query('PRAGMA table_info(property_cache)');
while ($col = $cols->fetchArray(SQLITE3_ASSOC)) {
    if ($col['name'] === 'year_built') { $hasYearBuiltColumn = true; break; }
}
if (!$hasYearBuiltColumn) {
    $db->exec('ALTER TABLE property_cache ADD COLUMN year_built REAL');
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

// Clear any negative cache entry for this key
$db->exec('CREATE TABLE IF NOT EXISTS property_cache_negative (cache_key TEXT PRIMARY KEY, url TEXT, reason TEXT, created_at INTEGER, expires_at INTEGER)');
$clearNeg = $db->prepare('DELETE FROM property_cache_negative WHERE cache_key = :key');
$clearNeg->bindValue(':key', $cacheKey, SQLITE3_TEXT);
$clearNeg->execute();

respondPayload([
    'success' => true,
    'provider' => $provider,
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
    'cached' => true,
    'cacheAgeDays' => 0,
]);
