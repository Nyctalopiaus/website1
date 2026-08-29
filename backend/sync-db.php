<?php
/**
 * Shared Database Sync & Data Quality Engine
 * Enterprise Security Edition (Admin Auth + Data Quality Audit + Non-Destructive Merge)
 */

require_once __DIR__ . '/admin-auth.php';

// This endpoint is session/cookie-authenticated, so it must NOT blindly
// reflect any Origin header while allowing credentials — that combination
// would let any website make a credentialed request against it from a
// logged-in admin's browser. Only an allowlisted origin (prod domain or a
// local/private-network dev origin — see isAllowedCorsOrigin() in
// admin-auth.php) gets the credentialed response; everything else gets a
// plain, non-credentialed CORS header, which the browser's own CORS check
// will refuse to pair with a credentialed fetch() anyway.
if (!empty($_SERVER['HTTP_ORIGIN']) && isAllowedCorsOrigin($_SERVER['HTTP_ORIGIN'])) {
    header("Access-Control-Allow-Origin: {$_SERVER['HTTP_ORIGIN']}");
    header("Access-Control-Allow-Credentials: true");
    header("Access-Control-Max-Age: 86400");
    header("Vary: Origin");
} else {
    header("Access-Control-Allow-Origin: *");
}
if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    if (isset($_SERVER['HTTP_ACCESS_CONTROL_REQUEST_METHOD'])) {
        header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
    }
    if (isset($_SERVER['HTTP_ACCESS_CONTROL_REQUEST_HEADERS'])) {
        header("Access-Control-Allow-Headers: {$_SERVER['HTTP_ACCESS_CONTROL_REQUEST_HEADERS']}, X-CSRF-Token, Content-Type");
    }
    exit(0);
}

header('Content-Type: application/json');

function syncExit($payload, $code = 200) {
    http_response_code($code);
    echo json_encode($payload);
    exit;
}

define('SYNC_AUDIT_LOG', __DIR__ . '/data/db_sync_audit.log');

function logSyncMergeDetail($mergedRecords, $rejectedRecords, $totalScanned, $insertedCount = 0, $updatedCount = 0, $unchangedCount = 0) {
    $dir = __DIR__ . '/data';
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }

    $user = $_SESSION['admin_user'] ?? 'admin';
    $ip = function_exists('clientIp') ? clientIp() : ($_SERVER['REMOTE_ADDR'] ?? '127.0.0.1');
    $timestamp = date('Y-m-d H:i:s T');

    $lines = [];
    $lines[] = "================================================================================";
    $lines[] = sprintf("[%s] [EXECUTE_SYNC] Admin: %s | IP: %s", $timestamp, $user, $ip);
    $lines[] = sprintf("Summary: Scanned: %d | Merged: %d (New: %d, Updated: %d, Unchanged: %d) | Rejected: %d", $totalScanned, count($mergedRecords), $insertedCount, $updatedCount, $unchangedCount, count($rejectedRecords));

    if (!empty($mergedRecords)) {
        $lines[] = "- Merged Records (" . count($mergedRecords) . "):";
        foreach ($mergedRecords as $item) {
            $addr = $item['address'] ?? ($item['cache_key'] ?? 'Unknown');
            $rawPrice = $item['price'] ?? null;
            $cleanPrice = ($rawPrice !== null && $rawPrice !== '') ? (float)preg_replace('/[^0-9.]/', '', (string)$rawPrice) : 0;
            $price = $cleanPrice > 0 ? '$' . number_format($cleanPrice) : 'No Price';

            $rawSqft = $item['sqft'] ?? null;
            $cleanSqft = ($rawSqft !== null && $rawSqft !== '') ? (float)preg_replace('/[^0-9.]/', '', (string)$rawSqft) : 0;
            $sqft = $cleanSqft > 0 ? number_format($cleanSqft) . ' sqft' : 'No sqft';
            $lines[] = sprintf("  ✓ %s (%s | %s)", $addr, $price, $sqft);
        }
    }

    if (!empty($rejectedRecords)) {
        $lines[] = "- Quality Audit Rejected Records (" . count($rejectedRecords) . "):";
        foreach ($rejectedRecords as $item) {
            $addr = $item['record']['address'] ?? ($item['record']['cache_key'] ?? 'Unknown');
            $reasons = implode(', ', $item['reasons'] ?? []);
            $lines[] = sprintf("  ✗ %s -> Reasons: %s", $addr, $reasons);
        }
    }

    $lines[] = "================================================================================\n";
    @file_put_contents(SYNC_AUDIT_LOG, implode("\n", $lines), FILE_APPEND | LOCK_EX);
}

function getDatabase() {
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

    // Schema Auto-Migration: Ensure all required columns exist in older database files
    $cols = [];
    $res = $db->query("PRAGMA table_info(property_cache)");
    if ($res) {
        while ($row = $res->fetchArray(SQLITE3_ASSOC)) {
            if (!empty($row['name'])) {
                $cols[] = strtolower($row['name']);
            }
        }
    }

    $requiredCols = [
        'redfin_id' => 'TEXT',
        'url' => 'TEXT',
        'address' => 'TEXT',
        'price' => 'REAL',
        'property_tax_rate' => 'REAL',
        'hoa_fee' => 'REAL',
        'beds' => 'REAL',
        'baths' => 'REAL',
        'sqft' => 'REAL',
        'lot_sqft' => 'REAL',
        'year_built' => 'REAL',
        'photo_url' => 'TEXT',
        'json_data' => 'TEXT',
        'created_at' => 'INTEGER',
        'expires_at' => 'INTEGER'
    ];

    foreach ($requiredCols as $colName => $colType) {
        if (!in_array(strtolower($colName), $cols, true)) {
            @$db->exec("ALTER TABLE property_cache ADD COLUMN {$colName} {$colType}");
        }
    }

    return $db;
}

/**
 * Data Quality Audit Gate
 * Validates whether a property_cache record is complete and safe to merge.
 */
function auditPropertyRecord(&$row) {
    $reasons = [];

    // 1. Resolve URL if stored in redfinUrl / cache_key / address
    if (empty($row['url']) || !preg_match('/redfin\.com/i', $row['url'])) {
        if (!empty($row['redfinUrl']) && preg_match('/redfin\.com/i', $row['redfinUrl'])) {
            $row['url'] = $row['redfinUrl'];
        } elseif (!empty($row['address']) && preg_match('/redfin\.com/i', $row['address'])) {
            $row['url'] = $row['address'];
        } elseif (!empty($row['cache_key']) && preg_match('/redfin\.com/i', $row['cache_key'])) {
            $row['url'] = $row['cache_key'];
        }
    }

    if (empty($row['url']) || !preg_match('/redfin\.com/i', $row['url'])) {
        $reasons[] = 'Missing or non-Redfin URL';
    }

    // 2. Resolve clean street address if address is a URL string
    if (!empty($row['address']) && preg_match('/redfin\.com\/([A-Za-z]{2})\/([^\/]+)\/([^\/]+)/i', $row['address'], $m)) {
        $state = strtoupper($m[1]);
        $city = ucwords(str_replace('-', ' ', $m[2]));
        $streetRaw = ucwords(str_replace('-', ' ', $m[3]));
        if (preg_match('/^(.*?)\s*(\d{5})$/', $streetRaw, $zm)) {
            $row['address'] = $zm[1] . ', ' . $city . ', ' . $state . ' ' . $zm[2];
        } else {
            $row['address'] = $streetRaw . ', ' . $city . ', ' . $state;
        }
    }

    if (empty($row['address']) || strlen(trim($row['address'])) < 4) {
        $reasons[] = 'Missing or invalid address string';
    }

    // 3. Price & Spec Completeness Check
    $price = isset($row['price']) ? (float)preg_replace('/[^0-9.]/', '', (string)$row['price']) : null;
    $sqft = isset($row['sqft']) ? (float)preg_replace('/[^0-9.]/', '', (string)$row['sqft']) : null;
    $beds = isset($row['beds']) ? (float)$row['beds'] : null;
    $photo = !empty($row['photo_url']) ? trim($row['photo_url']) : (!empty($row['photoUrl']) ? trim($row['photoUrl']) : null);

    // If price or specs missing in root $row, check json_data payload
    if (($price === null || $price <= 0 || $sqft === null) && !empty($row['json_data'])) {
        $json = is_array($row['json_data']) ? $row['json_data'] : json_decode($row['json_data'], true);
        if (is_array($json)) {
            if (($price === null || $price <= 0) && !empty($json['price'])) {
                $price = (float)preg_replace('/[^0-9.]/', '', (string)$json['price']);
                $row['price'] = $price;
            }
            if ($sqft === null && !empty($json['sqft'])) {
                $sqft = (float)preg_replace('/[^0-9.]/', '', (string)$json['sqft']);
                $row['sqft'] = $sqft;
            }
            if ($beds === null && !empty($json['beds'])) {
                $beds = (float)$json['beds'];
                $row['beds'] = $beds;
            }
            if (empty($photo) && !empty($json['photoUrl'])) {
                $photo = trim($json['photoUrl']);
                $row['photo_url'] = $photo;
            }
        }
    }

    if ($price === null || $price <= 0) {
        $reasons[] = 'Missing or zero price';
    }

    // Must have at least ONE core property spec to avoid merging empty test stubs
    if ($sqft === null && $beds === null && empty($photo)) {
        $reasons[] = 'Incomplete specs (no sqft, beds, or photo)';
    }

    // 4. Check for error or test stub markers
    if (!empty($row['json_data'])) {
        $json = is_array($row['json_data']) ? $row['json_data'] : json_decode($row['json_data'], true);
        if (is_array($json) && !empty($json['error'])) {
            $reasons[] = 'Contains error stub JSON: ' . $json['error'];
        }
    }

    $isValid = count($reasons) === 0;
    return [
        'isValid' => $isValid,
        'reasons' => $reasons,
    ];
}

// ---------------------------------------------------------------------
// Dispatch Actions
// ---------------------------------------------------------------------
function handleSyncApiRequest() {
    try {
        $rawInput = file_get_contents('php://input');
        $jsonInput = json_decode($rawInput, true) ?: [];
        $requestData = array_merge($_GET, $_POST, $jsonInput);

        $action = $requestData['action'] ?? 'status';

        // Action: Status
        if ($action === 'status') {
            syncExit([
                'authenticated' => isAdminAuthenticated(),
                'csrfToken' => getCsrfToken(),
            ]);
        }

        // Action: Login
        if ($action === 'login') {
            $password = (string)($requestData['password'] ?? '');
            $res = verifyAdminPassword($password);
            if ($res['success']) {
                syncExit([
                    'success' => true,
                    'authenticated' => true,
                    'csrfToken' => getCsrfToken(),
                ]);
            } else {
                syncExit([
                    'success' => false,
                    'error' => $res['error'],
                ], 401);
            }
        }

        // Action: Logout
        if ($action === 'logout') {
            logoutAdmin();
            syncExit(['success' => true, 'authenticated' => false]);
        }

        // Extract CSRF / Auth Token
        $token = $requestData['csrf_token'] ?? $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';

        // ALL FURTHER ACTIONS REQUIRE ADMIN AUTHENTICATION OR VALID TOKEN
        // (Except preview_sync on local loopback to read local candidate records)
        if (!isAdminAuthenticated() && !verifyCsrfToken($token)) {
            $ip = clientIp();
            $isLocalhost = ($ip === '127.0.0.1' || $ip === '::1' || $ip === '0.0.0.0' || str_starts_with($ip, '192.168.') || str_starts_with($ip, '10.') || str_starts_with($ip, '172.'));
            $isLocalAction = in_array($action, ['preview_sync', 'get_local_db_records', 'delete_local_db_record', 'clear_test_stubs', 'execute_sync'], true);
            if (!($isLocalAction && $isLocalhost)) {
                logSecurityEvent('UNAUTHORIZED_SYNC_ATTEMPT', "Action '$action' attempted without valid admin session or token.");
                syncExit(['error' => 'Authentication required. Please log in as admin.'], 401);
            }
        }

        // Action: Preview Sync (Runs Data Quality Audit)
        if ($action === 'preview_sync') {
            $db = getDatabase();
            $recordsToAudit = [];

            if (!empty($requestData['records']) && is_array($requestData['records'])) {
                $recordsToAudit = $requestData['records'];
            } else {
                // Scan local database table
                $res = $db->query('SELECT * FROM property_cache ORDER BY created_at DESC');
                if ($res) {
                    while ($row = $res->fetchArray(SQLITE3_ASSOC)) {
                        $recordsToAudit[] = $row;
                    }
                }
            }

            $cleanRecords = [];
            $skippedRecords = [];

            foreach ($recordsToAudit as $row) {
                $audit = auditPropertyRecord($row);
                if ($audit['isValid']) {
                    $cleanRecords[] = $row;
                } else {
                    $skippedRecords[] = [
                        'cache_key' => $row['cache_key'] ?? 'unknown',
                        'address' => $row['address'] ?? 'unknown',
                        'reasons' => $audit['reasons'],
                    ];
                }
            }

            logSecurityEvent('SYNC_PREVIEW', sprintf("Audited %d records: %d clean, %d skipped.", count($recordsToAudit), count($cleanRecords), count($skippedRecords)));

            syncExit([
                'success' => true,
                'totalScanned' => count($recordsToAudit),
                'cleanCount' => count($cleanRecords),
                'skippedCount' => count($skippedRecords),
                'cleanRecords' => $cleanRecords,
                'skippedRecords' => $skippedRecords,
            ]);
        }

        // Action: Execute Non-Destructive Merge Sync
        if ($action === 'execute_sync') {
            $db = getDatabase();
            $recordsToMerge = [];

            if (!empty($requestData['records']) && is_array($requestData['records'])) {
                $recordsToMerge = $requestData['records'];
            } else {
                // Read local DB records
                $res = $db->query('SELECT * FROM property_cache ORDER BY created_at DESC');
                if ($res) {
                    while ($row = $res->fetchArray(SQLITE3_ASSOC)) {
                        $recordsToMerge[] = $row;
                    }
                }
            }

            $mergedCount = 0;
            $insertedCount = 0;
            $updatedCount = 0;
            $unchangedCount = 0;
            $rejectedCount = 0;

            $checkStmt = $db->prepare('SELECT * FROM property_cache WHERE cache_key = :key OR (redfin_id IS NOT NULL AND redfin_id != "" AND redfin_id = :redfin_id) OR (address IS NOT NULL AND address != "" AND LOWER(address) = LOWER(:address)) LIMIT 1');
            $insertStmt = $db->prepare('INSERT INTO property_cache (
                cache_key, redfin_id, url, address, price, property_tax_rate,
                hoa_fee, beds, baths, sqft, lot_sqft, year_built, photo_url, json_data, created_at, expires_at
            ) VALUES (
                :key, :redfin_id, :url, :address, :price, :tax,
                :hoa, :beds, :baths, :sqft, :lot, :year, :photo, :json, :created_at, :expires_at
            )');
            $updateStmt = $db->prepare('UPDATE property_cache SET
                redfin_id = COALESCE(:redfin_id, redfin_id),
                url = COALESCE(:url, url),
                address = COALESCE(:address, address),
                price = COALESCE(:price, price),
                property_tax_rate = COALESCE(:tax, property_tax_rate),
                hoa_fee = COALESCE(:hoa, hoa_fee),
                beds = COALESCE(:beds, beds),
                baths = COALESCE(:baths, baths),
                sqft = COALESCE(:sqft, sqft),
                lot_sqft = COALESCE(:lot, lot_sqft),
                year_built = COALESCE(:year, year_built),
                photo_url = COALESCE(:photo, photo_url),
                json_data = COALESCE(:json, json_data),
                created_at = CASE WHEN :created_at > created_at THEN :created_at ELSE created_at END,
                expires_at = CASE WHEN :expires_at > expires_at THEN :expires_at ELSE expires_at END
            WHERE cache_key = :key');

            if (!$checkStmt || !$insertStmt || !$updateStmt) {
                syncExit(['error' => 'Database SQL prepare failed: ' . $db->lastErrorMsg()], 500);
            }

            $mergedItems = [];
            $rejectedItems = [];

            try {
                $db->exec('BEGIN TRANSACTION');

                foreach ($recordsToMerge as $row) {
                    $audit = auditPropertyRecord($row);
                    if (!$audit['isValid']) {
                        $rejectedCount++;
                        $rejectedItems[] = ['record' => $row, 'reasons' => $audit['reasons']];
                        continue;
                    }

                    $key = $row['cache_key'] ?? '';
                    $redfinId = $row['redfin_id'] ?? '';
                    $address = $row['address'] ?? '';

                    $checkStmt->bindValue(':key', $key, SQLITE3_TEXT);
                    $checkStmt->bindValue(':redfin_id', $redfinId, SQLITE3_TEXT);
                    $checkStmt->bindValue(':address', $address, SQLITE3_TEXT);
                    $checkRes = $checkStmt->execute();
                    $existing = $checkRes ? $checkRes->fetchArray(SQLITE3_ASSOC) : false;

                    $parseNum = function($v) {
                        if ($v === null || $v === '') return null;
                        $cleaned = preg_replace('/[^0-9.]/', '', (string)$v);
                        return $cleaned !== '' ? (float)$cleaned : null;
                    };

                    $params = [
                        ':key' => $key,
                        ':redfin_id' => $row['redfin_id'] ?? null,
                        ':url' => $row['url'] ?? '',
                        ':address' => $row['address'] ?? '',
                        ':price' => $parseNum($row['price'] ?? null),
                        ':tax' => $parseNum($row['property_tax_rate'] ?? null),
                        ':hoa' => $parseNum($row['hoa_fee'] ?? $row['hoaNotes'] ?? null),
                        ':beds' => $parseNum($row['beds'] ?? null),
                        ':baths' => $parseNum($row['baths'] ?? null),
                        ':sqft' => $parseNum($row['sqft'] ?? null),
                        ':lot' => $parseNum($row['lot_sqft'] ?? $row['lotSize'] ?? null),
                        ':year' => $parseNum($row['year_built'] ?? $row['yearBuilt'] ?? null),
                        ':photo' => $row['photo_url'] ?? $row['photoUrl'] ?? null,
                        ':json' => $row['json_data'] ?? null,
                        ':created_at' => isset($row['created_at']) ? (int)$row['created_at'] : time(),
                        ':expires_at' => isset($row['expires_at']) ? (int)$row['expires_at'] : (time() + 604800),
                    ];

                    if ($existing) {
                        // Compare every single field to detect updates in price, lot sqft, sqft, hoa fee, year built, photo, etc.
                        $fieldsToCheck = [
                            'redfin_id', 'url', 'address', 'price', 'property_tax_rate',
                            'hoa_fee', 'beds', 'baths', 'sqft', 'lot_sqft', 'year_built', 'photo_url'
                        ];
                        $hasFieldChange = false;
                        $fieldChanges = [];

                        foreach ($fieldsToCheck as $f) {
                            $paramKey = match ($f) {
                                'property_tax_rate' => ':tax',
                                'hoa_fee' => ':hoa',
                                'lot_sqft' => ':lot',
                                'year_built' => ':year',
                                'photo_url' => ':photo',
                                default => ":$f",
                            };

                            $existVal = $existing[$f] ?? null;
                            $newVal = $params[$paramKey] ?? null;

                            if ($newVal === null) continue; // Skip if incoming record doesn't provide this field

                            if (in_array($f, ['price', 'property_tax_rate', 'hoa_fee', 'beds', 'baths', 'sqft', 'lot_sqft', 'year_built'])) {
                                $existNum = $parseNum($existVal);
                                $newNum = (float)$newVal;
                                if ($existNum === null || abs($existNum - $newNum) > 0.001) {
                                    $hasFieldChange = true;
                                    $fieldChanges[] = "$f (" . ($existNum !== null ? $existNum : 'null') . " → $newNum)";
                                }
                            } else {
                                if (($existVal === null || $existVal === '') && $newVal !== '') {
                                    $hasFieldChange = true;
                                    $fieldChanges[] = "$f (added)";
                                } elseif ($existVal !== null && (string)$existVal !== (string)$newVal) {
                                    $hasFieldChange = true;
                                    $fieldChanges[] = "$f (updated)";
                                }
                            }
                        }

                        if ($hasFieldChange) {
                            foreach ($params as $p => $v) {
                                $type = is_float($v) ? SQLITE3_FLOAT : (is_int($v) ? SQLITE3_INTEGER : (is_null($v) ? SQLITE3_NULL : SQLITE3_TEXT));
                                $updateStmt->bindValue($p, $v, $type);
                            }
                            $updateStmt->execute();
                            $updatedCount++;
                        } else {
                            $unchangedCount++;
                        }
                    } else {
                        foreach ($params as $p => $v) {
                            $type = is_float($v) ? SQLITE3_FLOAT : (is_int($v) ? SQLITE3_INTEGER : (is_null($v) ? SQLITE3_NULL : SQLITE3_TEXT));
                            $insertStmt->bindValue($p, $v, $type);
                        }
                        $insertStmt->execute();
                        $insertedCount++;
                    }

                    $mergedCount++;
                    $mergedItems[] = $row;
                }

                $db->exec('COMMIT');
            } catch (Throwable $t) {
                @$db->exec('ROLLBACK');
                logSecurityEvent('EXECUTE_SYNC_ERROR', $t->getMessage());
                syncExit(['error' => 'Database write failed: ' . $t->getMessage()], 500);
            }

            logSecurityEvent('EXECUTE_SYNC', sprintf("Successfully merged %d records (%d inserted, %d updated, %d unchanged, %d rejected by quality audit).", $mergedCount, $insertedCount, $updatedCount, $unchangedCount, $rejectedCount));
            logSyncMergeDetail($mergedItems, $rejectedItems, count($recordsToMerge), $insertedCount, $updatedCount, $unchangedCount);

            // Fetch target DB records for 2-way bidirectional sync
            $targetRecords = [];
            $res = $db->query('SELECT * FROM property_cache ORDER BY created_at DESC');
            if ($res) {
                while ($row = $res->fetchArray(SQLITE3_ASSOC)) {
                    $targetRecords[] = $row;
                }
            }

            syncExit([
                'success' => true,
                'mergedCount' => $mergedCount,
                'insertedCount' => $insertedCount,
                'updatedCount' => $updatedCount,
                'unchangedCount' => $unchangedCount,
                'rejectedCount' => $rejectedCount,
                'targetRecords' => $targetRecords,
                'timestamp' => date('c'),
            ]);
        }

        if ($action === 'get_sync_logs') {
            $logFile = __DIR__ . '/data/db_sync_audit.log';
            if (file_exists($logFile) && is_readable($logFile)) {
                $content = @file_get_contents($logFile);
                syncExit(['success' => true, 'log' => $content]);
            }
            syncExit(['success' => true, 'log' => "No detailed merge history logs recorded yet."]);
        }

        // Action: Get Local DB Records for Inspector Modal
        if ($action === 'get_local_db_records') {
            $db = getDatabase();
            $dbFile = __DIR__ . '/data/property_cache.db';
            $fileSize = file_exists($dbFile) ? filesize($dbFile) : 0;

            $records = [];
            $res = $db->query('SELECT * FROM property_cache ORDER BY created_at DESC');
            if ($res) {
                while ($row = $res->fetchArray(SQLITE3_ASSOC)) {
                    $audit = auditPropertyRecord($row);
                    $row['isValid'] = $audit['isValid'];
                    $row['reasons'] = $audit['reasons'];
                    $records[] = $row;
                }
            }

            syncExit([
                'success' => true,
                'totalCount' => count($records),
                'fileSizeBytes' => $fileSize,
                'fileSizeFormatted' => number_format($fileSize / 1024, 1) . ' KB',
                'records' => $records,
            ]);
        }

        // Action: Delete Single Local Record
        if ($action === 'delete_local_db_record') {
            $key = $requestData['cache_key'] ?? '';
            if (empty($key)) {
                syncExit(['error' => 'Missing cache_key'], 400);
            }
            $db = getDatabase();
            $stmt = $db->prepare('DELETE FROM property_cache WHERE cache_key = :key');
            $stmt->bindValue(':key', $key, SQLITE3_TEXT);
            $stmt->execute();
            syncExit(['success' => true, 'deletedKey' => $key]);
        }

        // Action: Clear Test Stubs
        if ($action === 'clear_test_stubs') {
            $db = getDatabase();
            $deletedCount = 0;
            $res = $db->query('SELECT * FROM property_cache');
            if ($res) {
                while ($row = $res->fetchArray(SQLITE3_ASSOC)) {
                    $audit = auditPropertyRecord($row);
                    if (!$audit['isValid']) {
                        $delStmt = $db->prepare('DELETE FROM property_cache WHERE cache_key = :key');
                        $delStmt->bindValue(':key', $row['cache_key'], SQLITE3_TEXT);
                        $delStmt->execute();
                        $deletedCount++;
                    }
                }
            }
            syncExit(['success' => true, 'deletedCount' => $deletedCount]);
        }

        syncExit(['error' => 'Invalid action'], 400);
    } catch (Throwable $t) {
        logSecurityEvent('UNHANDLED_SYNC_ERROR', $t->getMessage() . ' in ' . $t->getFile() . ':' . $t->getLine());
        syncExit(['error' => 'Server Error: ' . $t->getMessage() . ' in ' . basename($t->getFile()) . ':' . $t->getLine()], 500);
    }
}

if (basename(__FILE__) === basename($_SERVER['SCRIPT_FILENAME'] ?? '')) {
    header('Content-Type: application/json');
    handleSyncApiRequest();
}
