<?php
/**
 * Nycto's MLS Property Scout - "My Home": each user's own house, so listings can be compared
 * against what they'd be selling.
 *
 * One row per user in my_homes (table created in bootstrap.php). The owner reads and edits it;
 * the owner's realtor (users.realtor_id) and admins can read it by passing ?client_id=.
 * RentCast: fill_my_home (property record -> empty fields) and check_my_home_value (value estimate
 * + comps) each cost one lookup. They go through comps.php's rolling cap and canLookupComps(), are
 * logged in comps_api_calls, and the value result is stored in property_comps under "home:<user_id>".
 *
 * Expects backend/bootstrap.php (for $pdo, logEvent(), clientErrorMessage()) and auth.php.
 */

const MY_HOME_TEXT_FIELDS = [
    'address', 'city', 'state', 'zip', 'levels', 'property_type', 'garage_notes',
    'basement', 'fence', 'driveway_facing', 'main_image_url', 'ai_notes',
];
const MY_HOME_NUM_FIELDS = [
    'latitude', 'longitude', 'beds', 'baths', 'sqft_total', 'sqft_finished', 'lot_sqft',
    'year_built', 'garage_spaces', 'hoa_fee', 'annual_tax', 'tax_year', 'my_price',
    'mortgage_payoff', 'mortgage_rate', 'mortgage_pi', 'sell_cost_pct', 'extra_cash',
];
const MY_HOME_TEXT_MAX = 200;
const MY_HOME_NOTES_MAX = 40000;
const MY_HOME_COMPS_MAX = 30;

function myHomeIsAdmin(): bool {
    $role = $_SESSION['role'] ?? (!empty($_SESSION['is_admin']) ? 'admin' : 'client');
    return !empty($_SESSION['is_admin']) || $role === 'admin';
}

/**
 * Whose home this request is about. No client_id (or your own id) means your own. Reading
 * someone else's needs admin, or being the realtor that client is assigned to. Writes are owner-only.
 * Returns null after sending a 403.
 */
function resolveMyHomeOwner(PDO $pdo, bool $forWrite): ?int {
    $me = (int)($_SESSION['user_id'] ?? 0);
    $clientId = (int)($_GET['client_id'] ?? 0);
    if ($clientId <= 0 || $clientId === $me) return $me;
    if (!$forWrite) {
        if (myHomeIsAdmin()) return $clientId;
        $stmt = $pdo->prepare('SELECT 1 FROM users WHERE id = :id AND realtor_id = :me');
        $stmt->execute([':id' => $clientId, ':me' => $me]);
        if ($stmt->fetchColumn()) return $clientId;
    }
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => $forWrite ? 'Only the owner can edit this home.' : 'Not your client.']);
    return null;
}

function formatMyHome(array $row): array {
    $out = ['user_id' => (int)$row['user_id']];
    foreach (MY_HOME_TEXT_FIELDS as $f) $out[$f] = $row[$f] ?? null;
    foreach (MY_HOME_NUM_FIELDS as $f) $out[$f] = isset($row[$f]) && $row[$f] !== '' ? $row[$f] + 0 : null;
    $comps = json_decode((string)($row['my_comps_json'] ?? '[]'), true);
    $out['my_comps'] = is_array($comps) ? $comps : [];
    $out['updated_at'] = $row['updated_at'] ?? null;
    return $out;
}

function handleGetMyHome(PDO $pdo) {
    try {
        $ownerId = resolveMyHomeOwner($pdo, false);
        if ($ownerId === null) return;
        $stmt = $pdo->prepare('SELECT * FROM my_homes WHERE user_id = :id');
        $stmt->execute([':id' => $ownerId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        echo json_encode([
            'success' => true,
            'home' => $row ? formatMyHome($row) : null,
            'comps' => loadPropertyComps($pdo, myHomeCompsKey($ownerId)),
            'can_edit' => $ownerId === (int)$_SESSION['user_id'],
            'can_lookup' => $ownerId === (int)$_SESSION['user_id'] && canLookupComps(),
            'usage' => compsLookupUsage($pdo),
        ], JSON_INVALID_UTF8_SUBSTITUTE);
    } catch (Throwable $t) {
        logEvent($pdo, 'system', 'error', 'get_my_home failed: ' . $t->getMessage());
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => clientErrorMessage($t)]);
    }
}

function handleSaveMyHome(PDO $pdo) {
    try {
        $ownerId = resolveMyHomeOwner($pdo, true);
        if ($ownerId === null) return;
        $data = json_decode(dibsRequestBody(), true);
        if (!is_array($data)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Expected a JSON object.']);
            return;
        }

        $values = [];
        foreach (MY_HOME_TEXT_FIELDS as $f) {
            if (!array_key_exists($f, $data)) continue;
            $v = trim((string)($data[$f] ?? ''));
            $max = $f === 'ai_notes' ? MY_HOME_NOTES_MAX : MY_HOME_TEXT_MAX;
            $values[$f] = $v === '' ? null : mb_substr($v, 0, $max);
        }
        foreach (MY_HOME_NUM_FIELDS as $f) {
            if (!array_key_exists($f, $data)) continue;
            $raw = $data[$f];
            if ($raw === null || $raw === '') { $values[$f] = null; continue; }
            $clean = str_replace([',', '$', '%', ' '], '', (string)$raw);
            $num = is_numeric($clean) ? $clean + 0 : null;
            if ($num === null || $num < -1e9 || $num > 1e9) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => "Field $f must be a number."]);
                return;
            }
            $values[$f] = $num;
        }
        if (array_key_exists('my_comps', $data)) {
            $comps = is_array($data['my_comps']) ? array_slice(array_values(array_filter($data['my_comps'], 'is_array')), 0, MY_HOME_COMPS_MAX) : [];
            $values['my_comps_json'] = json_encode($comps);
        }
        if (!$values) {
            echo json_encode(['success' => false, 'error' => 'Nothing to save.']);
            return;
        }

        // Upsert: make sure the row exists, then update only the fields that were sent.
        $pdo->prepare('INSERT OR IGNORE INTO my_homes (user_id) VALUES (:id)')->execute([':id' => $ownerId]);
        $sets = [];
        $params = [':id' => $ownerId];
        foreach ($values as $col => $v) {
            $sets[] = "$col = :$col";
            $params[":$col"] = $v;
        }
        $sets[] = 'updated_at = CURRENT_TIMESTAMP';
        $pdo->prepare('UPDATE my_homes SET ' . implode(', ', $sets) . ' WHERE user_id = :id')->execute($params);

        $stmt = $pdo->prepare('SELECT * FROM my_homes WHERE user_id = :id');
        $stmt->execute([':id' => $ownerId]);
        echo json_encode(['success' => true, 'home' => formatMyHome($stmt->fetch(PDO::FETCH_ASSOC)), 'can_edit' => true]);
    } catch (Throwable $t) {
        logEvent($pdo, 'system', 'error', 'save_my_home failed: ' . $t->getMessage());
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => clientErrorMessage($t)]);
    }
}

function myHomeCompsKey(int $userId): string {
    return 'home:' . $userId;
}

/** One GET to a RentCast endpoint (e.g. 'properties', 'avm/value'). */
function myHomeRentcastGet(string $apiKey, string $path, array $params): array {
    $ch = curl_init('https://api.rentcast.io/v1/' . $path . '?' . http_build_query($params));
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_TIMEOUT => 25,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_HTTPHEADER => ['Accept: application/json', 'X-Api-Key: ' . $apiKey],
    ]);
    $raw = curl_exec($ch);
    $http = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = $raw === false ? curl_error($ch) : '';
    if (PHP_VERSION_ID < 80000) @curl_close($ch);
    $body = is_string($raw) ? json_decode($raw, true) : null;
    return ['http' => $http, 'body' => is_array($body) ? $body : null, 'error' => $error];
}

/**
 * Shared gate for both RentCast actions: owner only, the lookup login only, key present, under the
 * cap, and a saved address. Returns [home row, api key, address] or null after sending an error.
 */
function myHomeLookupGate(PDO $pdo): ?array {
    $ownerId = (int)($_SESSION['user_id'] ?? 0);
    if (!canLookupComps()) {
        http_response_code(403);
        echo json_encode(['success' => false, 'error' => 'Only ' . COMPS_LOOKUP_USERNAME . ' can run RentCast lookups.']);
        return null;
    }
    $apiKey = getRentcastApiKey();
    if ($apiKey === '') {
        http_response_code(503);
        echo json_encode(['success' => false, 'error' => 'RentCast is not set up yet: add the API key on the server.']);
        return null;
    }
    $usage = compsLookupUsage($pdo);
    if ($usage['used'] >= COMPS_LOOKUP_CAP) {
        http_response_code(429);
        echo json_encode(['success' => false, 'error' => 'RentCast lookup limit reached: ' . COMPS_LOOKUP_CAP . ' in the last ' . COMPS_LOOKUP_WINDOW_DAYS . ' days.', 'usage' => $usage]);
        return null;
    }
    $stmt = $pdo->prepare('SELECT * FROM my_homes WHERE user_id = :id');
    $stmt->execute([':id' => $ownerId]);
    $home = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$home || trim((string)$home['address']) === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Save your street address on My Home first.']);
        return null;
    }
    $address = implode(', ', array_filter(array_map('trim', [
        (string)$home['address'], (string)$home['city'], (string)($home['state'] ?: 'CO'), (string)$home['zip'],
    ]), 'strlen'));
    return [$home, $apiKey, $address, $usage];
}

function myHomeRentcastError(PDO $pdo, array $result, string $what) {
    $body = $result['body'];
    $apiMessage = is_array($body) ? (string)($body['message'] ?? ($body['error'] ?? '')) : '';
    $detail = $apiMessage !== '' ? $apiMessage : ($result['error'] !== '' ? $result['error'] : 'HTTP ' . $result['http']);
    logEvent($pdo, 'system', 'warn', "My Home $what failed: $detail", null, ['http' => $result['http']]);
    http_response_code(502);
    echo json_encode(['success' => false, 'error' => "RentCast could not $what: $detail", 'usage' => compsLookupUsage($pdo)], JSON_INVALID_UTF8_SUBSTITUTE);
}

/** POST. One RentCast property-record lookup; fills only fields that are still empty. */
function handleFillMyHome(PDO $pdo) {
    try {
        $gate = myHomeLookupGate($pdo);
        if ($gate === null) return;
        [$home, $apiKey, $address] = $gate;
        $ownerId = (int)$home['user_id'];

        $result = myHomeRentcastGet($apiKey, 'properties', ['address' => $address, 'limit' => 1]);
        $pdo->prepare('INSERT INTO comps_api_calls (mls_id, user_id, http_code) VALUES (:k, :u, :h)')
            ->execute([':k' => myHomeCompsKey($ownerId), ':u' => $ownerId, ':h' => $result['http']]);
        $rec = $result['http'] === 200 && is_array($result['body']) ? ($result['body'][0] ?? null) : null;
        if (!is_array($rec)) {
            if ($result['http'] === 200) $result['body'] = ['message' => 'no record found for this address'];
            myHomeRentcastError($pdo, $result, 'find this address');
            return;
        }

        // Latest year of property tax RentCast has.
        $tax = null; $taxYear = null;
        foreach ((array)($rec['propertyTaxes'] ?? []) as $year => $t) {
            $y = (int)($t['year'] ?? $year);
            if (is_array($t) && isset($t['total']) && ($taxYear === null || $y > $taxYear)) { $taxYear = $y; $tax = (float)$t['total']; }
        }
        $features = is_array($rec['features'] ?? null) ? $rec['features'] : [];
        $candidates = [
            'city' => $rec['city'] ?? null,
            'state' => $rec['state'] ?? null,
            'zip' => $rec['zipCode'] ?? null,
            'latitude' => $rec['latitude'] ?? null,
            'longitude' => $rec['longitude'] ?? null,
            'property_type' => $rec['propertyType'] ?? null,
            'beds' => $rec['bedrooms'] ?? null,
            'baths' => $rec['bathrooms'] ?? null,
            'sqft_finished' => $rec['squareFootage'] ?? null,
            'lot_sqft' => $rec['lotSize'] ?? null,
            'year_built' => $rec['yearBuilt'] ?? null,
            'garage_spaces' => $features['garageSpaces'] ?? null,
            'levels' => isset($features['floorCount']) ? $features['floorCount'] . ' story' : null,
            'hoa_fee' => $rec['hoa']['fee'] ?? null,
            'annual_tax' => $tax,
            'tax_year' => $taxYear,
        ];
        $filled = [];
        $sets = [];
        $params = [':id' => $ownerId];
        foreach ($candidates as $col => $v) {
            if ($v === null || $v === '' || $v === 0) continue;
            if ($home[$col] !== null && $home[$col] !== '') continue; // never overwrite what's already entered
            $sets[] = "$col = :$col";
            $params[":$col"] = $v;
            $filled[] = $col;
        }
        if ($sets) {
            $sets[] = 'updated_at = CURRENT_TIMESTAMP';
            $pdo->prepare('UPDATE my_homes SET ' . implode(', ', $sets) . ' WHERE user_id = :id')->execute($params);
        }
        $stmt = $pdo->prepare('SELECT * FROM my_homes WHERE user_id = :id');
        $stmt->execute([':id' => $ownerId]);
        logEvent($pdo, 'system', 'info', 'My Home fill: ' . count($filled) . ' fields', null, ['filled' => $filled]);
        echo json_encode([
            'success' => true,
            'home' => formatMyHome($stmt->fetch(PDO::FETCH_ASSOC)),
            'filled' => $filled,
            'last_sale' => ['date' => $rec['lastSaleDate'] ?? null, 'price' => $rec['lastSalePrice'] ?? null],
            'usage' => compsLookupUsage($pdo),
        ], JSON_INVALID_UTF8_SUBSTITUTE);
    } catch (Throwable $t) {
        logEvent($pdo, 'system', 'error', 'fill_my_home failed: ' . $t->getMessage());
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => clientErrorMessage($t)]);
    }
}

/** POST. One RentCast value estimate + comps for the home (a second only if RentCast has no record). */
function handleCheckMyHomeValue(PDO $pdo) {
    try {
        $gate = myHomeLookupGate($pdo);
        if ($gate === null) return;
        [$home, $apiKey, $address, $usage] = $gate;
        $ownerId = (int)$home['user_id'];
        $key = myHomeCompsKey($ownerId);
        $logCall = $pdo->prepare('INSERT INTO comps_api_calls (mls_id, user_id, http_code) VALUES (:k, :u, :h)');

        $result = myHomeRentcastGet($apiKey, 'avm/value', ['address' => $address, 'compCount' => COMPS_PER_LOOKUP]);
        $logCall->execute([':k' => $key, ':u' => $ownerId, ':h' => $result['http']]);
        // No RentCast record of the home: retry once with what's entered on My Home.
        if (in_array($result['http'], [400, 404], true) && ($usage['used'] + 1) < COMPS_LOOKUP_CAP) {
            $params = ['address' => $address, 'compCount' => COMPS_PER_LOOKUP, 'lookupSubjectAttributes' => 'false'];
            if ((int)$home['beds'] > 0) $params['bedrooms'] = (int)$home['beds'];
            if ((float)$home['baths'] > 0) $params['bathrooms'] = (float)$home['baths'];
            if ((int)$home['sqft_finished'] > 0) $params['squareFootage'] = (int)$home['sqft_finished'];
            if (count($params) > 3) {
                $result = myHomeRentcastGet($apiKey, 'avm/value', $params);
                $logCall->execute([':k' => $key, ':u' => $ownerId, ':h' => $result['http']]);
            }
        }
        $body = $result['body'];
        $estimate = (float)($body['price'] ?? 0);
        if ($result['http'] !== 200 || $estimate <= 0) {
            myHomeRentcastError($pdo, $result, 'value your home');
            return;
        }

        $compFields = ['formattedAddress', 'price', 'bedrooms', 'bathrooms', 'squareFootage', 'lotSize', 'yearBuilt', 'status', 'listingType', 'listedDate', 'removedDate', 'daysOnMarket', 'distance', 'daysOld', 'correlation'];
        $comps = [];
        foreach ((array)($body['comparables'] ?? []) as $comp) {
            if (is_array($comp)) $comps[] = array_intersect_key($comp, array_flip($compFields));
        }
        $subject = is_array($body['subjectProperty'] ?? null)
            ? array_intersect_key($body['subjectProperty'], array_flip(['formattedAddress', 'propertyType', 'bedrooms', 'bathrooms', 'squareFootage', 'lotSize', 'yearBuilt', 'lastSaleDate', 'lastSalePrice']))
            : null;
        $pdo->prepare("
            INSERT INTO property_comps (mls_id, estimate, range_low, range_high, comps_json, subject_json, list_price_at_fetch, fetched_at, fetched_by_user_id)
            VALUES (:k, :estimate, :low, :high, :comps, :subject, :price, CURRENT_TIMESTAMP, :u)
            ON CONFLICT(mls_id) DO UPDATE SET
                estimate = excluded.estimate, range_low = excluded.range_low, range_high = excluded.range_high,
                comps_json = excluded.comps_json, subject_json = excluded.subject_json,
                list_price_at_fetch = excluded.list_price_at_fetch, fetched_at = CURRENT_TIMESTAMP,
                fetched_by_user_id = excluded.fetched_by_user_id
        ")->execute([
            ':k' => $key,
            ':estimate' => $estimate,
            ':low' => (float)($body['priceRangeLow'] ?? 0),
            ':high' => (float)($body['priceRangeHigh'] ?? 0),
            ':comps' => json_encode($comps, JSON_INVALID_UTF8_SUBSTITUTE),
            ':subject' => json_encode($subject, JSON_INVALID_UTF8_SUBSTITUTE),
            ':price' => (float)($home['my_price'] ?? 0),
            ':u' => $ownerId,
        ]);
        logEvent($pdo, 'system', 'info', 'My Home value: ' . count($comps) . ' comps', null, ['estimate' => $estimate]);
        echo json_encode(['success' => true, 'comps' => loadPropertyComps($pdo, $key), 'usage' => compsLookupUsage($pdo)], JSON_INVALID_UTF8_SUBSTITUTE);
    } catch (Throwable $t) {
        logEvent($pdo, 'system', 'error', 'check_my_home_value failed: ' . $t->getMessage());
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => clientErrorMessage($t)]);
    }
}
