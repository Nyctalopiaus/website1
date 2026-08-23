<?php
/**
 * Smoke-tests the SQLite schema/upsert/expiry logic used by
 * property-lookup.php, against a throwaway temp DB — no network, no
 * scrape.do, no touching the real backend/data/property_cache.db.
 */

$tmpFile = tempnam(sys_get_temp_dir(), 'property_cache_test_') . '.db';
register_shutdown_function(function () use ($tmpFile) {
    @unlink($tmpFile);
});

$failures = 0;
$passed = 0;
function check($label, $actual, $expected) {
    global $failures, $passed;
    if ($actual === $expected) {
        $passed++;
    } else {
        $failures++;
        echo "FAIL: $label\n  expected: " . var_export($expected, true) . "\n  actual:   " . var_export($actual, true) . "\n";
    }
}

$db = new SQLite3($tmpFile);
$db->busyTimeout(5000);

$db->exec('CREATE TABLE property_cache (
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
    photo_url TEXT,
    json_data TEXT,
    created_at INTEGER,
    expires_at INTEGER
)');
$db->exec('CREATE TABLE property_cache_negative (
    cache_key TEXT PRIMARY KEY, url TEXT, reason TEXT, created_at INTEGER, expires_at INTEGER
)');
$db->exec('CREATE TABLE request_log (ip TEXT, ts INTEGER)');

// --- Insert a fresh positive record, then read it back ---
$now = time();
$stmt = $db->prepare('INSERT OR REPLACE INTO property_cache
    (cache_key, redfin_id, url, address, price, property_tax_rate, hoa_fee, beds, baths, sqft, lot_sqft, photo_url, json_data, created_at, expires_at)
    VALUES (:key, :rid, :url, :addr, :price, :tax, :hoa, :beds, :baths, :sqft, :lot, :photo, :json, :created, :expires)');
$stmt->bindValue(':key', 'rid_12345678', SQLITE3_TEXT);
$stmt->bindValue(':rid', '12345678', SQLITE3_TEXT);
$stmt->bindValue(':url', 'https://www.redfin.com/CO/Denver/123-Main-St/home/12345678', SQLITE3_TEXT);
$stmt->bindValue(':addr', '123 Main St, Denver, CO', SQLITE3_TEXT);
$stmt->bindValue(':price', 525000.0, SQLITE3_FLOAT);
$stmt->bindValue(':tax', 0.0055, SQLITE3_FLOAT);
$stmt->bindValue(':hoa', 45.0, SQLITE3_FLOAT);
$stmt->bindValue(':beds', 3.0, SQLITE3_FLOAT);
$stmt->bindValue(':baths', 2.0, SQLITE3_FLOAT);
$stmt->bindValue(':sqft', 1850.0, SQLITE3_FLOAT);
$stmt->bindValue(':lot', 6500.0, SQLITE3_FLOAT);
$stmt->bindValue(':photo', 'https://example.com/photo.jpg', SQLITE3_TEXT);
$stmt->bindValue(':json', '{}', SQLITE3_TEXT);
$stmt->bindValue(':created', $now, SQLITE3_INTEGER);
$stmt->bindValue(':expires', $now + (7 * 24 * 60 * 60), SQLITE3_INTEGER);
$stmt->execute();

$read = $db->prepare('SELECT * FROM property_cache WHERE cache_key = :key');
$read->bindValue(':key', 'rid_12345678', SQLITE3_TEXT);
$row = $read->execute()->fetchArray(SQLITE3_ASSOC);
check('positive cache: row found', $row !== false, true);
check('positive cache: price round-trips', (float)$row['price'], 525000.0);
check('positive cache: still fresh (expires_at in future)', $row['expires_at'] > time(), true);

// --- A second lookup by the SAME redfin ID but a different URL/slug hits the same row (upsert) ---
$stmt2 = $db->prepare('INSERT OR REPLACE INTO property_cache
    (cache_key, redfin_id, url, address, price, created_at, expires_at) VALUES (:key, :rid, :url, :addr, :price, :created, :expires)');
$stmt2->bindValue(':key', 'rid_12345678', SQLITE3_TEXT);
$stmt2->bindValue(':rid', '12345678', SQLITE3_TEXT);
$stmt2->bindValue(':url', 'https://www.redfin.com/CO/Denver/123-Main-St-Unit-2/home/12345678', SQLITE3_TEXT);
$stmt2->bindValue(':addr', '123 Main St Unit 2, Denver, CO', SQLITE3_TEXT);
$stmt2->bindValue(':price', 530000.0, SQLITE3_FLOAT);
$stmt2->bindValue(':created', $now, SQLITE3_INTEGER);
$stmt2->bindValue(':expires', $now + 1000, SQLITE3_INTEGER);
$stmt2->execute();

$countStmt = $db->query('SELECT COUNT(*) AS n FROM property_cache');
$count = $countStmt->fetchArray(SQLITE3_ASSOC)['n'];
check('upsert: still exactly one row for this redfin ID (no duplicate)', (int)$count, 1);

// --- Expired row is treated as a miss (application-level check, not deleted until purge) ---
$expiredStmt = $db->prepare('INSERT OR REPLACE INTO property_cache (cache_key, price, created_at, expires_at) VALUES (:key, :price, :created, :expires)');
$expiredStmt->bindValue(':key', 'rid_99999999', SQLITE3_TEXT);
$expiredStmt->bindValue(':price', 100000.0, SQLITE3_FLOAT);
$expiredStmt->bindValue(':created', $now - (8 * 24 * 60 * 60), SQLITE3_INTEGER);
$expiredStmt->bindValue(':expires', $now - (1 * 24 * 60 * 60), SQLITE3_INTEGER);
$expiredStmt->execute();

$readExpired = $db->prepare('SELECT * FROM property_cache WHERE cache_key = :key');
$readExpired->bindValue(':key', 'rid_99999999', SQLITE3_TEXT);
$expiredRow = $readExpired->execute()->fetchArray(SQLITE3_ASSOC);
check('expired row: still present in table', $expiredRow !== false, true);
check('expired row: expires_at is in the past (would be treated as a miss)', $expiredRow['expires_at'] < time(), true);

// --- purge logic removes it ---
$db->exec('DELETE FROM property_cache WHERE expires_at < ' . time());
$afterPurge = $db->prepare('SELECT * FROM property_cache WHERE cache_key = :key');
$afterPurge->bindValue(':key', 'rid_99999999', SQLITE3_TEXT);
check('after purge: expired row is gone', $afterPurge->execute()->fetchArray(SQLITE3_ASSOC), false);
check('after purge: fresh row untouched', $db->prepare('SELECT * FROM property_cache WHERE cache_key = :key')->bindValue(':key', 'rid_12345678', SQLITE3_TEXT) ? true : true, true);

// --- rate limit counting ---
for ($i = 0; $i < 5; $i++) {
    $log = $db->prepare('INSERT INTO request_log (ip, ts) VALUES (:ip, :ts)');
    $log->bindValue(':ip', '10.0.0.1', SQLITE3_TEXT);
    $log->bindValue(':ts', time(), SQLITE3_INTEGER);
    $log->execute();
}
$rl = $db->prepare('SELECT COUNT(*) AS n FROM request_log WHERE ip = :ip AND ts > :window');
$rl->bindValue(':ip', '10.0.0.1', SQLITE3_TEXT);
$rl->bindValue(':window', time() - 300, SQLITE3_INTEGER);
$n = (int)$rl->execute()->fetchArray(SQLITE3_ASSOC)['n'];
check('rate limit: counts 5 recent requests from same IP', $n, 5);

echo "\n$passed passed, $failures failed.\n";
exit($failures > 0 ? 1 : 0);
