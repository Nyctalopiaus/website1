<?php
/**
 * Nycto's MLS Property Scout - Comparable listings ("comps") via RentCast.
 *
 * One endpoint, check_comps, called only from the "Check Comps" button in the detail view.
 * Nothing here runs automatically: the RentCast free Developer plan allows 50 requests a month
 * and bills for anything beyond that, so every lookup is a deliberate click, results are stored
 * per listing and reused, and a rolling cap below refuses to go past the allowance.
 *
 * Expects backend/bootstrap.php (for $pdo, logEvent(), clientErrorMessage()) and auth.php.
 *
 * API key, first match wins:
 *   1. RENTCAST_API_KEY in the PHP process environment (only there if the web server or PHP-FPM
 *      is configured to pass it in - PHP does not read .env files by itself);
 *   2. a RENTCAST_API_KEY=... line in the shared api.env the other nycto.ninja apps use
 *      (/home/nyctltlc/api.env, same default as nyctos-gig-grid's config.php; override the path
 *      with a DIBS_ENV_FILE environment variable), or an api.env in backend/, the Dibs folder,
 *      or up to two folders above it (handy for local dev);
 *   3. backend/rentcast_key.php containing just:  <?php return 'your-key-here';
 * Keep api.env out of any folder the web server serves, or block it there - unlike the .php
 * option, a .env file is sent as plain text to anyone who requests its URL.
 */

// RentCast's free plan is 50 requests per billing month. The billing month isn't necessarily the
// calendar month, so the cap is enforced over a rolling 31 days: that can never exceed 50 in any
// billing period, whatever day it starts on.
const COMPS_LOOKUP_CAP = 50;
const COMPS_LOOKUP_WINDOW_DAYS = 31;
const COMPS_PER_LOOKUP = 15;

function getRentcastApiKey(): string {
    foreach ([getenv('RENTCAST_API_KEY'), $_SERVER['RENTCAST_API_KEY'] ?? null, $_ENV['RENTCAST_API_KEY'] ?? null] as $env) {
        if (is_string($env) && trim($env) !== '') return trim($env);
    }
    $envFiles = ['/home/nyctltlc/api.env'];
    $override = getenv('DIBS_ENV_FILE');
    if (is_string($override) && trim($override) !== '') array_unshift($envFiles, trim($override));
    foreach ([__DIR__, dirname(__DIR__), dirname(__DIR__, 2), dirname(__DIR__, 3)] as $dir) {
        $envFiles[] = $dir . '/api.env';
    }
    foreach ($envFiles as $envFile) {
        if (!@is_file($envFile) || !@is_readable($envFile)) continue;
        foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
            if (preg_match('/^\s*(?:export\s+)?RENTCAST_API_KEY\s*=\s*(.*?)\s*$/', $line, $m)) {
                $value = trim($m[1], "\"' \t");
                if ($value !== '') return $value;
            }
        }
    }
    $file = __DIR__ . '/rentcast_key.php';
    if (is_file($file)) {
        $key = include $file;
        if (is_string($key)) return trim($key);
    }
    return '';
}

function compsLookupUsage(PDO $pdo): array {
    $used = (int)$pdo->query("SELECT COUNT(*) FROM comps_api_calls WHERE called_at >= datetime('now', '-" . COMPS_LOOKUP_WINDOW_DAYS . " days')")->fetchColumn();
    return ['used' => $used, 'cap' => COMPS_LOOKUP_CAP, 'window_days' => COMPS_LOOKUP_WINDOW_DAYS];
}

if (!function_exists('rentcastValueRequest')) {
    /**
     * One GET to RentCast's value-estimate endpoint, which returns the estimate and the comps it
     * was built from in a single request.
     * @return array{http:int, body:?array, error:string}
     */
    function rentcastValueRequest(string $apiKey, array $params): array {
        $ch = curl_init('https://api.rentcast.io/v1/avm/value?' . http_build_query($params));
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 8,
            CURLOPT_TIMEOUT => 25,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_HTTPHEADER => ['Accept: application/json', 'X-Api-Key: ' . $apiKey]
        ]);
        $raw = curl_exec($ch);
        $http = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $error = $raw === false ? curl_error($ch) : '';
        if (PHP_VERSION_ID < 80000) @curl_close($ch);
        $body = is_string($raw) ? json_decode($raw, true) : null;
        return ['http' => $http, 'body' => is_array($body) ? $body : null, 'error' => $error];
    }
}

/** Shapes a stored property_comps row the way the list endpoint and check_comps both return it. */
function formatPropertyComps(array $row): array {
    $comps = json_decode($row['comps_json'] ?? '[]', true);
    $subject = json_decode($row['subject_json'] ?? 'null', true);
    return [
        'comp_estimate' => (float)$row['estimate'],
        'comp_range_low' => (float)$row['range_low'],
        'comp_range_high' => (float)$row['range_high'],
        // SQLite CURRENT_TIMESTAMP is UTC.
        'comp_fetched_at' => !empty($row['fetched_at']) ? str_replace(' ', 'T', (string)$row['fetched_at']) . 'Z' : null,
        'comps' => is_array($comps) ? $comps : [],
        'comp_subject' => is_array($subject) ? $subject : null,
    ];
}

function loadPropertyComps(PDO $pdo, string $mlsId): ?array {
    $stmt = $pdo->prepare('SELECT estimate, range_low, range_high, fetched_at, comps_json, subject_json FROM property_comps WHERE mls_id = :mls_id');
    $stmt->execute([':mls_id' => $mlsId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ? formatPropertyComps($row) : null;
}

/**
 * POST {mls_id, force?}. Returns the stored comps for a listing, calling RentCast only when there
 * are none yet or force is set (the "Refresh" button). Each RentCast request is recorded in
 * comps_api_calls, which is what the rolling cap counts.
 */
function handleCheckComps(PDO $pdo) {
    try {
        $data = json_decode(file_get_contents('php://input'), true) ?: [];
        $mlsId = trim((string)($data['mls_id'] ?? ''));
        $force = !empty($data['force']);
        if ($mlsId === '') {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'mls_id is required.']);
            return;
        }

        $stmt = $pdo->prepare('SELECT mls_id, address, city, state, zip, price, beds, baths, sqft_finished, sqft_total, raw_mls_json FROM properties WHERE mls_id = :mls_id');
        $stmt->execute([':mls_id' => $mlsId]);
        $property = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$property) {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Listing not found.']);
            return;
        }

        if (!$force) {
            $existing = loadPropertyComps($pdo, $mlsId);
            if ($existing) {
                echo json_encode(['success' => true, 'cached' => true, 'comps' => $existing, 'usage' => compsLookupUsage($pdo)], JSON_INVALID_UTF8_SUBSTITUTE);
                return;
            }
        }

        $apiKey = getRentcastApiKey();
        if ($apiKey === '') {
            http_response_code(503);
            echo json_encode(['success' => false, 'error' => 'RentCast is not set up yet: add the API key on the server (backend/rentcast_key.php).']);
            return;
        }

        $usage = compsLookupUsage($pdo);
        if ($usage['used'] >= COMPS_LOOKUP_CAP) {
            http_response_code(429);
            echo json_encode(['success' => false, 'error' => 'Comps lookup limit reached: ' . COMPS_LOOKUP_CAP . ' lookups in the last ' . COMPS_LOOKUP_WINDOW_DAYS . ' days. Try again once older lookups age out.', 'usage' => $usage]);
            return;
        }

        $address = implode(', ', array_filter(array_map('trim', [
            (string)$property['address'], (string)$property['city'], (string)($property['state'] ?: 'CO'), (string)$property['zip']
        ]), 'strlen'));
        if (trim((string)$property['address']) === '') {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'This listing has no street address to look up.']);
            return;
        }

        $userId = (int)($_SESSION['user_id'] ?? 0);
        $logCall = $pdo->prepare('INSERT INTO comps_api_calls (mls_id, user_id, http_code) VALUES (:mls_id, :user_id, :http_code)');

        // First ask with the address alone, so RentCast values the home from its own record of
        // it - the same data source its comps come from.
        $result = rentcastValueRequest($apiKey, ['address' => $address, 'compCount' => COMPS_PER_LOOKUP]);
        $logCall->execute([':mls_id' => $mlsId, ':user_id' => $userId, ':http_code' => $result['http']]);

        // If RentCast has no record of the home (400/404), retry once with the MLS's own
        // beds/baths/square footage instead of leaving the listing permanently un-checkable.
        if (in_array($result['http'], [400, 404], true) && ($usage['used'] + 1) < COMPS_LOOKUP_CAP) {
            $raw = json_decode($property['raw_mls_json'] ?? '{}', true) ?: [];
            $sqft = (int)($raw['interior']['sqft_above_grade'] ?? 0) ?: ((int)$property['sqft_finished'] ?: (int)$property['sqft_total']);
            $params = ['address' => $address, 'compCount' => COMPS_PER_LOOKUP, 'lookupSubjectAttributes' => 'false'];
            if ((int)$property['beds'] > 0) $params['bedrooms'] = (int)$property['beds'];
            if ((float)$property['baths'] > 0) $params['bathrooms'] = (float)$property['baths'];
            if ($sqft > 0) $params['squareFootage'] = $sqft;
            if (count($params) > 3) {
                $result = rentcastValueRequest($apiKey, $params);
                $logCall->execute([':mls_id' => $mlsId, ':user_id' => $userId, ':http_code' => $result['http']]);
            }
        }

        $body = $result['body'];
        $estimate = (float)($body['price'] ?? 0);
        if ($result['http'] !== 200 || $estimate <= 0) {
            $apiMessage = is_array($body) ? (string)($body['message'] ?? ($body['error'] ?? '')) : '';
            $detail = $apiMessage !== '' ? $apiMessage : ($result['error'] !== '' ? $result['error'] : 'HTTP ' . $result['http']);
            logEvent($pdo, 'system', 'warn', 'Comps lookup failed: ' . $detail, $mlsId, ['http' => $result['http']]);
            http_response_code(502);
            echo json_encode(['success' => false, 'error' => 'RentCast could not value this home: ' . $detail, 'usage' => compsLookupUsage($pdo)], JSON_INVALID_UTF8_SUBSTITUTE);
            return;
        }

        // Keep only the fields the UI shows, so the listing payload stays small.
        $compFields = ['formattedAddress', 'price', 'bedrooms', 'bathrooms', 'squareFootage', 'lotSize', 'yearBuilt', 'status', 'listingType', 'listedDate', 'removedDate', 'daysOnMarket', 'distance', 'daysOld', 'correlation'];
        $comps = [];
        foreach ((array)($body['comparables'] ?? []) as $comp) {
            if (!is_array($comp)) continue;
            $comps[] = array_intersect_key($comp, array_flip($compFields));
        }
        $subject = is_array($body['subjectProperty'] ?? null)
            ? array_intersect_key($body['subjectProperty'], array_flip(['formattedAddress', 'propertyType', 'bedrooms', 'bathrooms', 'squareFootage', 'lotSize', 'yearBuilt', 'lastSaleDate', 'lastSalePrice']))
            : null;

        $save = $pdo->prepare("
            INSERT INTO property_comps (mls_id, estimate, range_low, range_high, comps_json, subject_json, list_price_at_fetch, fetched_at, fetched_by_user_id)
            VALUES (:mls_id, :estimate, :range_low, :range_high, :comps_json, :subject_json, :list_price, CURRENT_TIMESTAMP, :user_id)
            ON CONFLICT(mls_id) DO UPDATE SET
                estimate = excluded.estimate, range_low = excluded.range_low, range_high = excluded.range_high,
                comps_json = excluded.comps_json, subject_json = excluded.subject_json,
                list_price_at_fetch = excluded.list_price_at_fetch, fetched_at = CURRENT_TIMESTAMP,
                fetched_by_user_id = excluded.fetched_by_user_id
        ");
        $save->execute([
            ':mls_id' => $mlsId,
            ':estimate' => $estimate,
            ':range_low' => (float)($body['priceRangeLow'] ?? 0),
            ':range_high' => (float)($body['priceRangeHigh'] ?? 0),
            ':comps_json' => json_encode($comps, JSON_INVALID_UTF8_SUBSTITUTE),
            ':subject_json' => json_encode($subject, JSON_INVALID_UTF8_SUBSTITUTE),
            ':list_price' => (float)$property['price'],
            ':user_id' => $userId
        ]);

        logEvent($pdo, 'system', 'info', 'Comps lookup: ' . count($comps) . ' comps', $mlsId, ['estimate' => $estimate, 'list_price' => (float)$property['price']]);
        echo json_encode(['success' => true, 'cached' => false, 'comps' => loadPropertyComps($pdo, $mlsId), 'usage' => compsLookupUsage($pdo)], JSON_INVALID_UTF8_SUBSTITUTE);
    } catch (Throwable $t) {
        http_response_code(500);
        logEvent($pdo, 'system', 'error', 'handleCheckComps failed: ' . $t->getMessage(), null, ['file' => $t->getFile(), 'line' => $t->getLine()]);
        echo json_encode(['success' => false, 'error' => clientErrorMessage($t)]);
    }
}
