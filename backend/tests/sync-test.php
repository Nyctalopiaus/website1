<?php
/**
 * Automated Unit Tests for Admin Auth, Data Quality Filter, and DB Merge Sync
 */

require_once __DIR__ . '/../admin-auth.php';
require_once __DIR__ . '/../sync-db.php';

function assertTest($condition, $msg) {
    if (!$condition) {
        echo "❌ FAIL: $msg\n";
        exit(1);
    }
    echo "✅ PASS: $msg\n";
}

echo "=== Running Data Quality Audit & Sync Engine Unit Tests ===\n";

// Test 1: Data Quality Filter - Valid Record
$validRecord = [
    'cache_key' => 'rid_12345',
    'url' => 'https://www.redfin.com/CO/Denver/123-Main-St/home/12345',
    'address' => '123 Main St, Denver, CO 80202',
    'price' => 550000,
    'beds' => 3,
    'baths' => 2,
    'sqft' => 1800,
    'photo_url' => 'https://ssl.cdn-redfin.com/photo/1.jpg',
    'json_data' => json_encode(['price' => 550000]),
];
$res1 = auditPropertyRecord($validRecord);
assertTest($res1['isValid'] === true, 'Complete property record passes quality audit');

// Test 2: Data Quality Filter - Missing Price
$noPriceRecord = [
    'cache_key' => 'rid_12346',
    'url' => 'https://www.redfin.com/CO/Denver/456-Oak-St/home/12346',
    'address' => '456 Oak St, Denver, CO 80202',
    'price' => null,
    'sqft' => 1200,
];
$res2 = auditPropertyRecord($noPriceRecord);
assertTest($res2['isValid'] === false, 'Record with missing price fails quality audit');

// Test 3: Data Quality Filter - Incomplete Specs (No sqft, beds, or photo)
$noSpecsRecord = [
    'cache_key' => 'rid_12347',
    'url' => 'https://www.redfin.com/CO/Denver/789-Pine-St/home/12347',
    'address' => '789 Pine St, Denver, CO 80202',
    'price' => 300000,
    'sqft' => null,
    'beds' => null,
    'photo_url' => '',
];
$res3 = auditPropertyRecord($noSpecsRecord);
assertTest($res3['isValid'] === false, 'Record with no specs (sqft/beds/photo) fails quality audit');

// Test 4: Data Quality Filter - Error Stub JSON
$errorStubRecord = [
    'cache_key' => 'rid_12348',
    'url' => 'https://www.redfin.com/CO/Denver/101-Elm-St/home/12348',
    'address' => '101 Elm St, Denver, CO 80202',
    'price' => 400000,
    'sqft' => 1500,
    'json_data' => json_encode(['error' => 'Connection blocked or challenged by Redfin']),
];
$res4 = auditPropertyRecord($errorStubRecord);
assertTest($res4['isValid'] === false, 'Error stub record fails quality audit');

// Test 5: Admin Auth Verification
$validAuth = verifyAdminPassword('admin123');
assertTest($validAuth['success'] === true, 'Default admin password authenticates successfully');

$invalidAuth = verifyAdminPassword('wrongpassword');
assertTest($invalidAuth['success'] === false, 'Invalid admin password is rejected');

echo "\nAll Data Quality & Admin Auth Unit Tests Passed Successfully!\n";
