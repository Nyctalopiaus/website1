<?php
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

/**
 * MLS & Redfin Property Scout - Backend Bootstrap
 * Session/CORS setup, SQLite connection, schema creation and migrations.
 * Included by api.php before auth.php and properties.php.
 */

// Start session securely
if (session_status() === PHP_SESSION_NONE) {
    @ini_set('session.cookie_httponly', 1);
    @ini_set('session.cookie_samesite', 'Strict');
    if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
        @ini_set('session.cookie_secure', 1);
    }
    session_start();
}

if (empty($_SESSION['csrf_token'])) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}

$origin = $_SERVER['HTTP_ORIGIN'] ?? '*';
header('Content-Type: application/json; charset=utf-8');
header("Access-Control-Allow-Origin: $origin");
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-CSRF-Token');
header('Access-Control-Allow-Credentials: true');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$dbDir = __DIR__ . '/../data';
if (!is_dir($dbDir)) {
    mkdir($dbDir, 0755, true);
}

$dbPath = $dbDir . '/properties.db';

// Local cache for listing photos.
define('MEDIA_DIR', __DIR__ . '/../media');

/**
 * General-purpose event log, alongside the older login_attempts table (which stays as-is).
 * source: 'sync' | 'scrape' | 'client' | 'system'. level: 'info' | 'warn' | 'error'.
 * Used for everything that used to be either silently swallowed (empty catch blocks on
 * migrations and per-item sync skips) or only ever visible in a browser console that closes
 * with the tab it ran in (the bookmarklet, which runs on the MLS portal's own origin).
 * Never throws — logging must not be able to break the caller's actual work.
 */
function logEvent(PDO $pdo, string $source, string $level, string $message, ?string $mlsId = null, $context = null) {
    try {
        $contextStr = null;
        if ($context !== null) {
            $contextStr = is_string($context) ? $context : json_encode($context, JSON_PARTIAL_OUTPUT_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE);
        }
        if ($contextStr !== null && strlen($contextStr) > 4000) {
            $contextStr = substr($contextStr, 0, 4000);
        }
        $stmt = $pdo->prepare("INSERT INTO event_log (source, level, mls_id, message, context_json, timestamp) VALUES (:source, :level, :mls_id, :message, :context, CURRENT_TIMESTAMP)");
        $stmt->execute([
            ':source' => $source,
            ':level' => $level,
            ':mls_id' => $mlsId,
            ':message' => mb_substr($message, 0, 2000),
            ':context' => $contextStr
        ]);

        // Cheap retention: trim on write instead of a scheduled job (there's no cron in this
        // PHP-built-in-server setup). Runs roughly every 50 writes, not every one.
        if (random_int(1, 50) === 1) {
            $pdo->exec("DELETE FROM event_log WHERE id NOT IN (SELECT id FROM event_log ORDER BY id DESC LIMIT 5000)");
        }
    } catch (Throwable $t) {
        // Logging must never break the caller.
    }
}

/**
 * Runs one schema migration, logging anything that isn't the expected "column/index already
 * exists" case. Replaces the old pattern of `try { $pdo->exec(...) } catch (Exception $e) {}`,
 * which swallowed real migration failures with no trace anywhere.
 */
function runMigration(PDO $pdo, string $sql, string $label) {
    try {
        $pdo->exec($sql);
    } catch (Exception $e) {
        $msg = $e->getMessage();
        if (stripos($msg, 'duplicate column') === false && stripos($msg, 'already exists') === false) {
            logEvent($pdo, 'system', 'error', "Migration failed ($label): " . $msg);
        }
    }
}

try {
    $pdo = new PDO('sqlite:' . $dbPath);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);

    // Initialize Schema
    $pdo->exec("
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_login DATETIME
        );

        CREATE TABLE IF NOT EXISTS properties (
            mls_id TEXT PRIMARY KEY,
            address TEXT,
            city TEXT,
            state TEXT,
            zip TEXT,
            price REAL,
            status TEXT,
            beds INTEGER,
            baths REAL,
            levels TEXT,
            sqft_total INTEGER,
            sqft_finished INTEGER,
            lot_sqft INTEGER,
            lot_acres REAL,
            year_built INTEGER,
            property_type TEXT,
            school_district TEXT,
            parking_total INTEGER,
            garage_spaces INTEGER,
            hoa_exists INTEGER,
            hoa_fee REAL,
            annual_tax REAL,
            tax_year INTEGER,
            list_date TEXT,
            mls_url TEXT,
            main_image_url TEXT,
            gallery_images TEXT,
            raw_mls_json TEXT,
            latitude REAL,
            longitude REAL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS redfin_data (
            mls_id TEXT PRIMARY KEY,
            redfin_url TEXT,
            redfin_estimate REAL,
            walk_score INTEGER,
            transit_score INTEGER,
            bike_score INTEGER,
            price_per_sqft REAL,
            days_on_redfin INTEGER,
            climate_risk_json TEXT,
            school_ratings_json TEXT,
            raw_redfin_json TEXT,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (mls_id) REFERENCES properties(mls_id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS user_metadata (
            mls_id TEXT PRIMARY KEY,
            favorite INTEGER DEFAULT 0,
            hidden INTEGER DEFAULT 0,
            rating INTEGER DEFAULT 0,
            user_notes TEXT DEFAULT '',
            realtor_notes TEXT DEFAULT '',
            tags_json TEXT DEFAULT '[]',
            shared_with_realtor INTEGER DEFAULT 0,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (mls_id) REFERENCES properties(mls_id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS login_attempts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT,
            status TEXT,
            reason TEXT,
            ip_address TEXT,
            user_agent TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS event_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            source TEXT,
            level TEXT,
            mls_id TEXT,
            message TEXT,
            context_json TEXT
        );
    ");

    // Dynamic migrations for existing databases
    runMigration($pdo, "ALTER TABLE properties ADD COLUMN latitude REAL", 'properties.latitude');
    runMigration($pdo, "ALTER TABLE properties ADD COLUMN longitude REAL", 'properties.longitude');
    // Deep-scrape dedupe: full_scrape_completed_at gates the expensive per-listing detail+photo
    // walk (NULL = never fully captured); photo_count/price_checked_at are informational.
    runMigration($pdo, "ALTER TABLE properties ADD COLUMN full_scrape_completed_at DATETIME", 'properties.full_scrape_completed_at');
    runMigration($pdo, "ALTER TABLE properties ADD COLUMN photo_count INTEGER DEFAULT 0", 'properties.photo_count');
    runMigration($pdo, "ALTER TABLE properties ADD COLUMN price_checked_at DATETIME", 'properties.price_checked_at');

    // Performance indices for property search and filtering
    runMigration($pdo, "CREATE INDEX IF NOT EXISTS idx_properties_price ON properties(price)", 'idx_properties_price');
    runMigration($pdo, "CREATE INDEX IF NOT EXISTS idx_properties_status ON properties(status)", 'idx_properties_status');
    runMigration($pdo, "CREATE INDEX IF NOT EXISTS idx_properties_sqft ON properties(sqft_finished)", 'idx_properties_sqft');
    runMigration($pdo, "CREATE INDEX IF NOT EXISTS idx_metadata_favorite ON user_metadata(favorite)", 'idx_metadata_favorite');
    runMigration($pdo, "CREATE INDEX IF NOT EXISTS idx_metadata_shared ON user_metadata(shared_with_realtor)", 'idx_metadata_shared');
    runMigration($pdo, "CREATE INDEX IF NOT EXISTS idx_login_attempts_time ON login_attempts(timestamp)", 'idx_login_attempts_time');
    runMigration($pdo, "CREATE INDEX IF NOT EXISTS idx_event_log_time ON event_log(timestamp)", 'idx_event_log_time');
    runMigration($pdo, "CREATE INDEX IF NOT EXISTS idx_event_log_source ON event_log(source)", 'idx_event_log_source');

    // Seed default admin user if users table is empty
    $userCount = (int)($pdo->query("SELECT COUNT(*) FROM users")->fetchColumn() ?: 0);
    if ($userCount === 0) {
        $defaultPassword = password_hash('ScoutPass2026!', PASSWORD_BCRYPT);
        $stmtSeed = $pdo->prepare("INSERT INTO users (username, password_hash) VALUES (:username, :hash)");
        $stmtSeed->execute([':username' => 'admin', ':hash' => $defaultPassword]);
    }
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'Database connection failed: ' . $e->getMessage()]);
    exit;
}
