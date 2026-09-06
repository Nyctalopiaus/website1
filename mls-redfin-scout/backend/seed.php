<?php
/**
 * Fixture Data Seeder for MLS & Redfin Property Scout
 *
 * CLI-only by design: this has no auth of its own and upserts fixture rows straight into
 * properties.db. It's meant for `php backend/seed.php` during local setup, never for a web
 * request. (Found reachable in production over plain HTTP on 2026-09-06 — this guard is the
 * fix; see claude/security-hardening-plan.md.)
 */
if (php_sapi_name() !== 'cli') {
    http_response_code(403);
    exit('Forbidden');
}

$dbDir = __DIR__ . '/../data';
if (!is_dir($dbDir)) mkdir($dbDir, 0755, true);

$pdo = new PDO('sqlite:' . $dbDir . '/properties.db');
$pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

// Ensure tables exist
$pdo->exec("
    CREATE TABLE IF NOT EXISTS properties (
        mls_id TEXT PRIMARY KEY, address TEXT, city TEXT, state TEXT, zip TEXT, price REAL, status TEXT, beds INTEGER, baths REAL, levels TEXT, sqft_total INTEGER, sqft_finished INTEGER, lot_sqft INTEGER, lot_acres REAL, year_built INTEGER, property_type TEXT, school_district TEXT, parking_total INTEGER, garage_spaces INTEGER, hoa_exists INTEGER, hoa_fee REAL, annual_tax REAL, tax_year INTEGER, list_date TEXT, mls_url TEXT, main_image_url TEXT, gallery_images TEXT, raw_mls_json TEXT, latitude REAL, longitude REAL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS redfin_data (
        mls_id TEXT PRIMARY KEY, redfin_url TEXT, redfin_estimate REAL, walk_score INTEGER, transit_score INTEGER, bike_score INTEGER, price_per_sqft REAL, days_on_redfin INTEGER, climate_risk_json TEXT, school_ratings_json TEXT, raw_redfin_json TEXT, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS user_metadata (
        mls_id TEXT PRIMARY KEY, favorite INTEGER DEFAULT 0, hidden INTEGER DEFAULT 0, rating INTEGER DEFAULT 0, user_notes TEXT DEFAULT '', realtor_notes TEXT DEFAULT '', tags_json TEXT DEFAULT '[]', shared_with_realtor INTEGER DEFAULT 0, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
");

try { $pdo->exec("ALTER TABLE properties ADD COLUMN latitude REAL"); } catch (Exception $e) {}
try { $pdo->exec("ALTER TABLE properties ADD COLUMN longitude REAL"); } catch (Exception $e) {}

$sampleListings = [
    [
        'mls_id' => '9532741',
        'address' => '18351 E Grand Avenue',
        'city' => 'Aurora',
        'state' => 'CO',
        'zip' => '80015',
        'latitude' => 39.6465,
        'longitude' => -104.7735,
        'price' => 500000,
        'status' => 'Active',
        'beds' => 5,
        'baths' => 3,
        'levels' => 'One',
        'sqft_total' => 2566,
        'sqft_finished' => 2507,
        'lot_acres' => 0.18,
        'lot_sqft' => 7841,
        'year_built' => 1983,
        'property_type' => 'Single Family Residence/House',
        'school_district' => 'Cherry Creek 5',
        'parking_total' => 3,
        'garage_spaces' => 2,
        'hoa_exists' => 0,
        'hoa_fee' => 0,
        'annual_tax' => 2392,
        'tax_year' => 2025,
        'list_date' => '2026-07-31',
        'mls_url' => 'https://matrix.recolorado.com/Matrix/Public/Portal.aspx?L=1&k=2343995XHKSS&p=CS-3939147-0#1',
        'main_image_url' => 'https://matrixmedia.recolorado.com/mediaserver/GetMedia.ashx?Key=2055951235&TableID=9&Type=1&Number=0&Size=2&exk=5de545effc0bd4483c0ee0b81634ac22',
        'walk_score' => 45,
        'redfin_estimate' => 512000,
        'user_notes' => '',
        'realtor_notes' => '',
        'favorite' => 0,
        'hidden' => 0,
        'shared_with_realtor' => 0,
        'raw_mls_json' => [
            'matrix_review_status' => 'none'
        ]
    ],
    [
        'mls_id' => '8697142',
        'address' => '554 S Kittredge Way',
        'city' => 'Aurora',
        'state' => 'CO',
        'zip' => '80017',
        'latitude' => 39.7061,
        'longitude' => -104.7938,
        'price' => 505000,
        'status' => 'Active',
        'beds' => 4,
        'baths' => 4,
        'levels' => 'Multi/Split',
        'sqft_total' => 2893,
        'sqft_finished' => 2745,
        'lot_acres' => 0.21,
        'lot_sqft' => 8930,
        'year_built' => 1981,
        'property_type' => 'Single Family Residence/House',
        'school_district' => 'Adams-Arapahoe 28J',
        'parking_total' => 3,
        'garage_spaces' => 3,
        'hoa_exists' => 0,
        'hoa_fee' => 0,
        'annual_tax' => 3428,
        'tax_year' => 2025,
        'list_date' => '2026-08-15',
        'mls_url' => 'https://matrix.recolorado.com/Matrix/Public/Portal.aspx?L=1&k=2343995XHKSS&p=CS-3939147-0#1',
        'main_image_url' => 'https://matrixmedia.recolorado.com/mediaserver/GetMedia.ashx?Key=2056198627&TableID=9&Type=1&Number=0&Size=2&exk=8815ef848699f081bdf968475c0d9ff',
        'walk_score' => 52,
        'redfin_estimate' => 498000,
        'user_notes' => '',
        'realtor_notes' => '',
        'favorite' => 0,
        'shared_with_realtor' => 0
    ],
    [
        'mls_id' => '1532514',
        'address' => '2380 S Waco Court',
        'city' => 'Aurora',
        'state' => 'CO',
        'zip' => '80013',
        'latitude' => 39.6738,
        'longitude' => -104.7770,
        'price' => 524900,
        'status' => 'Active',
        'beds' => 4,
        'baths' => 3,
        'levels' => 'Two',
        'sqft_total' => 3520,
        'sqft_finished' => 3027,
        'lot_acres' => 0.22,
        'lot_sqft' => 9670,
        'year_built' => 1992,
        'property_type' => 'Single Family Residence/House',
        'school_district' => 'Adams-Arapahoe 28J',
        'parking_total' => 3,
        'garage_spaces' => 3,
        'hoa_exists' => 1,
        'hoa_fee' => 2280,
        'annual_tax' => 3822,
        'tax_year' => 2025,
        'list_date' => '2026-04-28',
        'mls_url' => 'https://matrix.recolorado.com/Matrix/Public/Portal.aspx?L=1&k=2343995XHKSS&p=CS-3939147-0#1',
        'main_image_url' => 'https://matrixmedia.recolorado.com/mediaserver/GetMedia.ashx?Key=2053755606&TableID=9&Type=1&Number=0&Size=2&exk=4d5a4ba12538d5d9974642bac190656e',
        'walk_score' => 61,
        'redfin_estimate' => 535000,
        'user_notes' => '',
        'realtor_notes' => '',
        'favorite' => 0,
        'hidden' => 0,
        'shared_with_realtor' => 0,
        'raw_mls_json' => [
            'matrix_review_status' => 'none'
        ]
    ]
];

foreach ($sampleListings as $item) {
    $rawMlsJson = isset($item['raw_mls_json']) ? json_encode($item['raw_mls_json']) : null;
    $stmtProp = $pdo->prepare("
        INSERT INTO properties (mls_id, address, city, state, zip, latitude, longitude, price, status, beds, baths, levels, sqft_total, sqft_finished, lot_sqft, lot_acres, year_built, property_type, school_district, parking_total, garage_spaces, hoa_exists, hoa_fee, annual_tax, tax_year, list_date, mls_url, main_image_url, raw_mls_json)
        VALUES (:mls_id, :address, :city, :state, :zip, :latitude, :longitude, :price, :status, :beds, :baths, :levels, :sqft_total, :sqft_finished, :lot_sqft, :lot_acres, :year_built, :property_type, :school_district, :parking_total, :garage_spaces, :hoa_exists, :hoa_fee, :annual_tax, :tax_year, :list_date, :mls_url, :main_image_url, :raw_mls_json)
        ON CONFLICT(mls_id) DO UPDATE SET price=excluded.price, status=excluded.status, latitude=COALESCE(excluded.latitude, latitude), longitude=COALESCE(excluded.longitude, longitude), raw_mls_json=COALESCE(excluded.raw_mls_json, raw_mls_json)
    ");
    $stmtProp->execute([
        ':mls_id' => $item['mls_id'],
        ':address' => $item['address'],
        ':city' => $item['city'],
        ':state' => $item['state'],
        ':zip' => $item['zip'],
        ':latitude' => $item['latitude'],
        ':longitude' => $item['longitude'],
        ':price' => $item['price'],
        ':status' => $item['status'],
        ':beds' => $item['beds'],
        ':baths' => $item['baths'],
        ':levels' => $item['levels'],
        ':sqft_total' => $item['sqft_total'],
        ':sqft_finished' => $item['sqft_finished'],
        ':lot_sqft' => $item['lot_sqft'],
        ':lot_acres' => $item['lot_acres'],
        ':year_built' => $item['year_built'],
        ':property_type' => $item['property_type'],
        ':school_district' => $item['school_district'],
        ':parking_total' => $item['parking_total'],
        ':garage_spaces' => $item['garage_spaces'],
        ':hoa_exists' => $item['hoa_exists'],
        ':hoa_fee' => $item['hoa_fee'],
        ':annual_tax' => $item['annual_tax'],
        ':tax_year' => $item['tax_year'],
        ':list_date' => $item['list_date'],
        ':mls_url' => $item['mls_url'],
        ':main_image_url' => $item['main_image_url'],
        ':raw_mls_json' => $rawMlsJson
    ]);
    $stmtProp->execute([
        ':mls_id' => $item['mls_id'],
        ':address' => $item['address'],
        ':city' => $item['city'],
        ':state' => $item['state'],
        ':zip' => $item['zip'],
        ':price' => $item['price'],
        ':status' => $item['status'],
        ':beds' => $item['beds'],
        ':baths' => $item['baths'],
        ':levels' => $item['levels'],
        ':sqft_total' => $item['sqft_total'],
        ':sqft_finished' => $item['sqft_finished'],
        ':lot_sqft' => $item['lot_sqft'],
        ':lot_acres' => $item['lot_acres'],
        ':year_built' => $item['year_built'],
        ':property_type' => $item['property_type'],
        ':school_district' => $item['school_district'],
        ':parking_total' => $item['parking_total'],
        ':garage_spaces' => $item['garage_spaces'],
        ':hoa_exists' => $item['hoa_exists'],
        ':hoa_fee' => $item['hoa_fee'],
        ':annual_tax' => $item['annual_tax'],
        ':tax_year' => $item['tax_year'],
        ':list_date' => $item['list_date'],
        ':mls_url' => $item['mls_url'],
        ':main_image_url' => $item['main_image_url'],
        ':raw_mls_json' => $rawMlsJson
    ]);

    $stmtRf = $pdo->prepare("
        INSERT INTO redfin_data (mls_id, walk_score, redfin_estimate)
        VALUES (:mls_id, :walk_score, :redfin_estimate)
        ON CONFLICT(mls_id) DO UPDATE SET walk_score=excluded.walk_score, redfin_estimate=excluded.redfin_estimate
    ");
    $stmtRf->execute([
        ':mls_id' => $item['mls_id'],
        ':walk_score' => $item['walk_score'],
        ':redfin_estimate' => $item['redfin_estimate']
    ]);

    $stmtUser = $pdo->prepare("
        INSERT INTO user_metadata (mls_id, favorite, hidden, user_notes, realtor_notes, shared_with_realtor)
        VALUES (:mls_id, :favorite, :hidden, :user_notes, :realtor_notes, :shared_with_realtor)
        ON CONFLICT(mls_id) DO UPDATE SET favorite=excluded.favorite, hidden=excluded.hidden, user_notes=excluded.user_notes, realtor_notes=excluded.realtor_notes, shared_with_realtor=excluded.shared_with_realtor
    ");
    $stmtUser->execute([
        ':mls_id' => $item['mls_id'],
        ':favorite' => $item['favorite'],
        ':hidden' => $item['hidden'] ?? 0,
        ':user_notes' => $item['user_notes'] ?? '',
        ':realtor_notes' => $item['realtor_notes'] ?? '',
        ':shared_with_realtor' => $item['shared_with_realtor']
    ]);
}

echo "Successfully seeded " . count($sampleListings) . " properties into SQLite database!\n";
