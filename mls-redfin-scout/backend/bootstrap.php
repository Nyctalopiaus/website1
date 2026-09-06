<?php
/**
 * MLS & Redfin Property Scout - Backend Bootstrap
 * Session/CORS setup, SQLite connection, schema creation and migrations.
 * Included by api.php before auth.php and properties.php.
 */

// Local dev (PHP's built-in server on 127.0.0.1/localhost) shows real error detail; production
// (nycto.ninja) does not. Exception messages/stack traces are still fully captured either way —
// see logEvent()/runMigration() below and the catch blocks in properties.php/auth.php, which log
// full detail regardless of this flag. This only controls what's echoed back to an HTTP caller.
define('IS_LOCAL_ENV', in_array($_SERVER['SERVER_NAME'] ?? '', ['localhost', '127.0.0.1'], true));

ini_set('display_errors', IS_LOCAL_ENV ? 1 : 0);
ini_set('display_startup_errors', IS_LOCAL_ENV ? 1 : 0);
error_reporting(E_ALL);

/**
 * Returns a message safe to echo to an HTTP client: the real exception message on local dev,
 * a generic one in production (full detail always still goes to logEvent()/event_log).
 */
function clientErrorMessage(Throwable $t): string {
    return IS_LOCAL_ENV ? $t->getMessage() : 'An unexpected error occurred. Check the event log for details.';
}

// Start session securely
if (session_status() === PHP_SESSION_NONE) {
    @ini_set('session.cookie_httponly', 1);
    @ini_set('session.cookie_samesite', 'Lax');
    if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
        @ini_set('session.cookie_secure', 1);
    }
    session_start();
}

if (empty($_SESSION['csrf_token'])) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}

function isAllowedScoutCorsOrigin(string $origin): bool {
    $host = strtolower((string)(parse_url($origin, PHP_URL_HOST) ?: ''));
    return in_array($host, ['nycto.ninja', 'www.nycto.ninja', 'localhost', '127.0.0.1', 'matrix.recolorado.com'], true);
}

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('Pragma: no-cache');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-CSRF-Token, X-Scout-Token, Access-Control-Request-Private-Network');
if ($origin !== '' && isAllowedScoutCorsOrigin($origin)) {
    header("Access-Control-Allow-Origin: $origin");
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Allow-Private-Network: true');
}

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
function logEvent(PDO $pdo, string $source, string $level, string $message, ?string $mlsId = null, $context = null, ?string $username = null) {
    try {
        if ($username === null && isset($_SESSION['username'])) {
            $username = $_SESSION['username'];
        }
        $contextStr = null;
        if ($context !== null) {
            $contextStr = is_string($context) ? $context : json_encode($context, JSON_PARTIAL_OUTPUT_ON_ERROR | JSON_INVALID_UTF8_SUBSTITUTE);
        }
        if ($contextStr !== null && strlen($contextStr) > 4000) {
            $contextStr = substr($contextStr, 0, 4000);
        }
        $stmt = $pdo->prepare("INSERT INTO event_log (source, level, mls_id, message, context_json, username, timestamp) VALUES (:source, :level, :mls_id, :message, :context, :username, CURRENT_TIMESTAMP)");
        $stmt->execute([
            ':source' => $source,
            ':level' => $level,
            ':mls_id' => $mlsId,
            ':message' => function_exists('mb_substr') ? mb_substr($message, 0, 2000) : substr($message, 0, 2000),
            ':context' => $contextStr,
            ':username' => $username
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

function purgeUserScopedMlsJson(PDO $pdo): void {
    $rows = $pdo->query('SELECT mls_id, raw_mls_json FROM properties WHERE raw_mls_json IS NOT NULL AND raw_mls_json != \'\'')->fetchAll();
    $update = $pdo->prepare('UPDATE properties SET raw_mls_json = :raw_mls_json WHERE mls_id = :mls_id');
    foreach ($rows as $row) {
        $raw = json_decode($row['raw_mls_json'], true);
        if (!is_array($raw) || (!array_key_exists('matrix_review_status', $raw) && !array_key_exists('portal_notes', $raw))) continue;
        unset($raw['matrix_review_status'], $raw['portal_notes']);
        $update->execute([':raw_mls_json' => json_encode($raw, JSON_INVALID_UTF8_SUBSTITUTE), ':mls_id' => $row['mls_id']]);
    }
}

try {
    $pdo = new PDO('sqlite:' . $dbPath);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $pdo->exec('PRAGMA foreign_keys = ON');

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
            user_id INTEGER NOT NULL,
            mls_id TEXT NOT NULL,
            favorite INTEGER DEFAULT 0,
            hidden INTEGER DEFAULT 0,
            rating INTEGER DEFAULT 0,
            user_notes TEXT DEFAULT '',
            realtor_notes TEXT DEFAULT '',
            realtor_private_notes TEXT DEFAULT '',
            tags_json TEXT DEFAULT '[]',
            shared_with_realtor INTEGER DEFAULT 0,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, mls_id),
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (mls_id) REFERENCES properties(mls_id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS property_visibility (
            mls_id TEXT PRIMARY KEY,
            is_hidden INTEGER NOT NULL DEFAULT 0,
            lifecycle_status TEXT NOT NULL DEFAULT 'active',
            hidden_reason TEXT DEFAULT '',
            hidden_by_user_id INTEGER,
            hidden_at DATETIME,
            FOREIGN KEY (mls_id) REFERENCES properties(mls_id) ON DELETE CASCADE,
            FOREIGN KEY (hidden_by_user_id) REFERENCES users(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS property_activity (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            mls_id TEXT NOT NULL,
            actor_user_id INTEGER,
            subject_user_id INTEGER,
            activity_type TEXT NOT NULL,
            visibility TEXT NOT NULL DEFAULT 'public',
            message TEXT NOT NULL,
            details_json TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (mls_id) REFERENCES properties(mls_id) ON DELETE CASCADE,
            FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL,
            FOREIGN KEY (subject_user_id) REFERENCES users(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS scrape_tokens (
            token_hash TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            expires_at DATETIME NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS scrape_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            initiated_by_user_id INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'running',
            started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            completed_at DATETIME,
            metrics_json TEXT DEFAULT '{}',
            error_message TEXT DEFAULT '',
            FOREIGN KEY (initiated_by_user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS user_preferences (
            user_id INTEGER PRIMARY KEY,
            active_view TEXT DEFAULT 'grid',
            current_sort TEXT DEFAULT 'price-desc',
            compare_list_json TEXT DEFAULT '[]',
            active_filters_json TEXT DEFAULT '{}',
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
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
            context_json TEXT,
            username TEXT
        );

        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            type TEXT NOT NULL,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            link_url TEXT DEFAULT '',
            is_read INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS property_messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            realtor_id INTEGER NOT NULL,
            mls_id TEXT NOT NULL,
            sender_role TEXT NOT NULL,
            message TEXT NOT NULL,
            is_read INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (realtor_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (mls_id) REFERENCES properties(mls_id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS showing_itinerary (
            client_id INTEGER NOT NULL,
            mls_id TEXT NOT NULL,
            showing_time TEXT DEFAULT '',
            access_notes TEXT DEFAULT '',
            feedback TEXT DEFAULT '',
            updated_by_user_id INTEGER,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (client_id, mls_id),
            FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (mls_id) REFERENCES properties(mls_id) ON DELETE CASCADE,
            FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
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
    runMigration($pdo, "ALTER TABLE user_metadata ADD COLUMN realtor_private_notes TEXT DEFAULT ''", 'user_metadata.realtor_private_notes');
    runMigration($pdo, "ALTER TABLE event_log ADD COLUMN username TEXT", 'event_log.username');
    // Role-based admin and realtor assignment columns
    runMigration($pdo, "ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0", 'users.is_admin');
    runMigration($pdo, "ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'client'", 'users.role');
    runMigration($pdo, "ALTER TABLE users ADD COLUMN realtor_id INTEGER DEFAULT NULL", 'users.realtor_id');
    // User profile detail & branding columns
    runMigration($pdo, "ALTER TABLE users ADD COLUMN full_name TEXT DEFAULT ''", 'users.full_name');
    runMigration($pdo, "ALTER TABLE users ADD COLUMN email TEXT DEFAULT ''", 'users.email');
    runMigration($pdo, "ALTER TABLE users ADD COLUMN phone TEXT DEFAULT ''", 'users.phone');
    runMigration($pdo, "ALTER TABLE users ADD COLUMN avatar_url TEXT DEFAULT ''", 'users.avatar_url');
    runMigration($pdo, "ALTER TABLE users ADD COLUMN brokerage_name TEXT DEFAULT ''", 'users.brokerage_name');
    // Client Pipeline & Search Criteria columns
    runMigration($pdo, "ALTER TABLE users ADD COLUMN pipeline_stage TEXT DEFAULT 'searching'", 'users.pipeline_stage');
    runMigration($pdo, "ALTER TABLE users ADD COLUMN target_min_price REAL DEFAULT NULL", 'users.target_min_price');
    runMigration($pdo, "ALTER TABLE users ADD COLUMN target_max_price REAL DEFAULT NULL", 'users.target_max_price');
    runMigration($pdo, "ALTER TABLE users ADD COLUMN target_cities TEXT DEFAULT ''", 'users.target_cities');
    runMigration($pdo, "ALTER TABLE users ADD COLUMN target_beds INTEGER DEFAULT NULL", 'users.target_beds');
    runMigration($pdo, "ALTER TABLE users ADD COLUMN target_timeline TEXT DEFAULT ''", 'users.target_timeline');
    runMigration($pdo, "ALTER TABLE users ADD COLUMN must_haves TEXT DEFAULT ''", 'users.must_haves');
    runMigration($pdo, "ALTER TABLE users ADD COLUMN deal_breakers TEXT DEFAULT ''", 'users.deal_breakers');
    runMigration($pdo, "ALTER TABLE users ADD COLUMN last_active_at DATETIME", 'users.last_active_at');

    // Dynamic migration: Migrate single-tenant user_metadata (no user_id) to multi-tenant (user_id, mls_id) compound primary key
    try {
        $metaCols = $pdo->query("PRAGMA table_info(user_metadata)")->fetchAll();
        $hasUserId = false;
        foreach ($metaCols as $col) {
            if (($col['name'] ?? '') === 'user_id') {
                $hasUserId = true;
                break;
            }
        }
        if (!$hasUserId) {
            $targetUserId = $pdo->query("SELECT id FROM users WHERE username = 'jhankins'")->fetchColumn();
            if (!$targetUserId) {
                $targetUserId = $pdo->query("SELECT id FROM users ORDER BY id ASC LIMIT 1")->fetchColumn();
            }
            $targetUserId = (int)($targetUserId ?: 1);

            $pdo->beginTransaction();
            $pdo->exec("
                CREATE TABLE user_metadata_v2 (
                    user_id INTEGER NOT NULL,
                    mls_id TEXT NOT NULL,
                    favorite INTEGER DEFAULT 0,
                    hidden INTEGER DEFAULT 0,
                    rating INTEGER DEFAULT 0,
                    user_notes TEXT DEFAULT '',
                    realtor_notes TEXT DEFAULT '',
                    tags_json TEXT DEFAULT '[]',
                    shared_with_realtor INTEGER DEFAULT 0,
                    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (user_id, mls_id),
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY (mls_id) REFERENCES properties(mls_id) ON DELETE CASCADE
                );
            ");
            $stmtMigrate = $pdo->prepare("
                INSERT INTO user_metadata_v2 (user_id, mls_id, favorite, hidden, rating, user_notes, realtor_notes, tags_json, shared_with_realtor, updated_at)
                SELECT :target_user_id, mls_id, favorite, hidden, rating, user_notes, realtor_notes, tags_json, shared_with_realtor, updated_at
                FROM user_metadata
            ");
            $stmtMigrate->execute([':target_user_id' => $targetUserId]);
            $pdo->exec("DROP TABLE user_metadata");
            $pdo->exec("ALTER TABLE user_metadata_v2 RENAME TO user_metadata");
            $pdo->commit();
            logEvent($pdo, 'system', 'info', "Migrated legacy user_metadata to multi-tenant schema assigned to user_id $targetUserId");
        }
    } catch (Throwable $t) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        logEvent($pdo, 'system', 'error', 'user_metadata multi-tenant migration failed: ' . $t->getMessage());
    }

    // Create saved_filters table for server-backed saved filters and preset sharing
    runMigration($pdo, "CREATE TABLE IF NOT EXISTS saved_filters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        created_by_user_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        filter_json TEXT NOT NULL,
        is_shared INTEGER DEFAULT 0,
        target_user_id INTEGER DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE
    )", 'create_saved_filters_table');

    // Create collections table for curated playlists
    runMigration($pdo, "CREATE TABLE IF NOT EXISTS collections (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        realtor_id INTEGER NOT NULL,
        client_id INTEGER DEFAULT NULL,
        title TEXT NOT NULL,
        description TEXT DEFAULT '',
        share_token TEXT UNIQUE NOT NULL,
        mls_ids_json TEXT DEFAULT '[]',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (realtor_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE SET NULL
    )", 'create_collections_table');

    // Backfill/guarantee: primary admin and admins have role = 'admin'
    try {
        $pdo->exec("UPDATE users SET is_admin = 1, role = 'admin' WHERE username = 'admin' AND (is_admin IS NULL OR is_admin != 1 OR role != 'admin')");
        $pdo->exec("UPDATE users SET role = 'admin' WHERE is_admin = 1 AND (role IS NULL OR role = '' OR role = 'client')");
        $pdo->exec("UPDATE users SET role = 'client' WHERE role IS NULL OR role = ''");
    } catch (Throwable $t) {}

    // Ensure log tables exist on legacy databases
    runMigration($pdo, "CREATE TABLE IF NOT EXISTS login_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT,
        status TEXT,
        reason TEXT,
        ip_address TEXT,
        user_agent TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )", 'create_login_attempts_table');

    runMigration($pdo, "CREATE TABLE IF NOT EXISTS event_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        source TEXT,
        level TEXT,
        mls_id TEXT,
        message TEXT,
        context_json TEXT,
        username TEXT
    )", 'create_event_log_table');

    // Performance indices for property search, filtering, and saved filters
    runMigration($pdo, "CREATE INDEX IF NOT EXISTS idx_properties_price ON properties(price)", 'idx_properties_price');
    runMigration($pdo, "CREATE INDEX IF NOT EXISTS idx_properties_status ON properties(status)", 'idx_properties_status');
    runMigration($pdo, "CREATE INDEX IF NOT EXISTS idx_properties_sqft ON properties(sqft_finished)", 'idx_properties_sqft');
    runMigration($pdo, "CREATE INDEX IF NOT EXISTS idx_metadata_favorite ON user_metadata(favorite)", 'idx_metadata_favorite');
    runMigration($pdo, "CREATE INDEX IF NOT EXISTS idx_metadata_shared ON user_metadata(shared_with_realtor)", 'idx_metadata_shared');
    runMigration($pdo, "CREATE INDEX IF NOT EXISTS idx_metadata_user_mls ON user_metadata(user_id, mls_id)", 'idx_metadata_user_mls');
    runMigration($pdo, "CREATE INDEX IF NOT EXISTS idx_property_visibility_hidden ON property_visibility(is_hidden)", 'property_visibility.is_hidden');
    runMigration($pdo, "CREATE INDEX IF NOT EXISTS idx_property_activity_mls_created ON property_activity(mls_id, created_at DESC)", 'property_activity.mls_id_created');
    runMigration($pdo, "ALTER TABLE property_activity ADD COLUMN subject_user_id INTEGER", 'property_activity.subject_user_id');
    runMigration($pdo, "CREATE INDEX IF NOT EXISTS idx_property_activity_subject ON property_activity(subject_user_id, created_at DESC)", 'property_activity.subject_created');
    runMigration($pdo, "ALTER TABLE property_visibility ADD COLUMN lifecycle_status TEXT NOT NULL DEFAULT 'active'", 'property_visibility.lifecycle_status');
    runMigration($pdo, "CREATE INDEX IF NOT EXISTS idx_scrape_tokens_expiry ON scrape_tokens(expires_at)", 'scrape_tokens.expires_at');
    runMigration($pdo, "CREATE INDEX IF NOT EXISTS idx_scrape_runs_user_started ON scrape_runs(initiated_by_user_id, started_at DESC)", 'scrape_runs.user_started');
    runMigration($pdo, "CREATE INDEX IF NOT EXISTS idx_user_preferences_id ON user_preferences(user_id)", 'idx_user_preferences_id');
    runMigration($pdo, "CREATE INDEX IF NOT EXISTS idx_saved_filters_user_id ON saved_filters(user_id)", 'idx_saved_filters_user_id');
    runMigration($pdo, "CREATE INDEX IF NOT EXISTS idx_saved_filters_target ON saved_filters(target_user_id)", 'idx_saved_filters_target');
    runMigration($pdo, "CREATE INDEX IF NOT EXISTS idx_users_realtor ON users(realtor_id)", 'idx_users_realtor');
    runMigration($pdo, "CREATE INDEX IF NOT EXISTS idx_login_attempts_time ON login_attempts(timestamp)", 'idx_login_attempts_time');
    runMigration($pdo, "CREATE INDEX IF NOT EXISTS idx_event_log_time ON event_log(timestamp)", 'idx_event_log_time');
    runMigration($pdo, "CREATE INDEX IF NOT EXISTS idx_event_log_source ON event_log(source)", 'idx_event_log_source');
    runMigration($pdo, "CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read)", 'idx_notifications_user');
    runMigration($pdo, "CREATE INDEX IF NOT EXISTS idx_showing_itinerary_client ON showing_itinerary(client_id, updated_at DESC)", 'showing_itinerary.client_updated');

    purgeUserScopedMlsJson($pdo);

    // Seed default admin user if users table is empty
    $userCount = (int)($pdo->query("SELECT COUNT(*) FROM users")->fetchColumn() ?: 0);
    if ($userCount === 0) {
        $defaultPassword = password_hash('ScoutPass2026!', PASSWORD_BCRYPT);
        $stmtSeed = $pdo->prepare("INSERT INTO users (username, password_hash, is_admin, role) VALUES (:username, :hash, 1, 'admin')");
        $stmtSeed->execute([':username' => 'admin', ':hash' => $defaultPassword]);
    }
} catch (Exception $e) {
    http_response_code(500);
    error_log('mls-redfin-scout DB connection failed: ' . $e->getMessage());
    echo json_encode(['error' => IS_LOCAL_ENV ? ('Database connection failed: ' . $e->getMessage()) : 'Database connection failed.']);
    exit;
}

/**
 * Creates an in-app notification for a specified user.
 */
function createNotification(PDO $pdo, int $userId, string $type, string $title, string $message, string $linkUrl = '') {
    if ($userId <= 0) return;
    try {
        $stmt = $pdo->prepare("
            INSERT INTO notifications (user_id, type, title, message, link_url)
            VALUES (:user_id, :type, :title, :message, :link_url)
        ");
        $stmt->execute([
            ':user_id' => $userId,
            ':type' => $type,
            ':title' => $title,
            ':message' => $message,
            ':link_url' => $linkUrl
        ]);
    } catch (Throwable $e) {
        logEvent($pdo, 'system', 'error', 'createNotification failed: ' . $e->getMessage());
    }
}
