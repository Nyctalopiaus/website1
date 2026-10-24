<?php
/**
 * Ghost Town — shared helpers.
 *
 * Secrets: WIGLE_API_NAME / WIGLE_API_TOKEN are read from api.env, same
 * convention as backend/property-lookup.php. Lookup order:
 *   1. <Website1>/api.env  (local dev — sits OUTSIDE vm_code, so it never syncs)
 *   2. /home/nyctltlc/api.env (production)
 *
 * Data: the SQLite cache lives OUTSIDE the web root for the same reason:
 *   local: <Website1>/ghost-town-data/ghost-town.sqlite
 *   prod:  /home/nyctltlc/ghost-town-data/ghost-town.sqlite
 * Override with GHOST_TOWN_DB in api.env if needed.
 *
 * Quota guard: anything that spends WiGLE queries (fetch.php) only runs from
 * localhost, or with header X-Ghost-Key matching GHOST_TOWN_ADMIN_KEY.
 * Without that key set, production refuses all fetches — on purpose.
 */

// Warnings/deprecations go to the error log, never into the JSON body.
ini_set('display_errors', '0');
ini_set('log_errors', '1');
header('Content-Type: application/json');
header('X-Content-Type-Options: nosniff');

function loadApiEnv() {
    $candidates = [dirname(__DIR__, 3) . '/api.env', '/home/nyctltlc/api.env'];
    foreach ($candidates as $envPath) {
        if (!is_readable($envPath)) continue;
        foreach (file($envPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
            $line = trim($line);
            if ($line === '' || $line[0] === '#' || strpos($line, '=') === false) continue;
            list($name, $value) = array_map('trim', explode('=', $line, 2));
            $value = trim($value, "\"'");
            if ($name !== '' && getenv($name) === false) putenv("$name=$value");
        }
    }
}
loadApiEnv();

function jsonExit($payload, $code = 200) {
    http_response_code($code);
    echo json_encode($payload);
    exit;
}

function requireExtensions() {
    $missing = [];
    if (!extension_loaded('curl')) $missing[] = 'curl';
    if (!extension_loaded('pdo_sqlite')) $missing[] = 'pdo_sqlite';
    if ($missing) {
        jsonExit(['error' => 'PHP extension(s) not enabled: ' . implode(', ', $missing)
            . '. Uncomment extension=' . implode(' / extension=', $missing) . ' in php.ini and restart.'], 500);
    }
}
requireExtensions();

function db() {
    static $pdo = null;
    if ($pdo) return $pdo;
    $path = getenv('GHOST_TOWN_DB') ?: dirname(__DIR__, 3) . '/ghost-town-data/ghost-town.sqlite';
    $dir = dirname($path);
    if (!is_dir($dir) && !mkdir($dir, 0750, true)) jsonExit(['error' => "Cannot create data dir $dir"], 500);
    $pdo = new PDO('sqlite:' . $path);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $pdo->exec('PRAGMA journal_mode=WAL');
    $pdo->exec('
        CREATE TABLE IF NOT EXISTS zips (
            zip TEXT PRIMARY KEY, lat REAL NOT NULL, lon REAL NOT NULL,
            label TEXT, fetched_at INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS areas (
            id INTEGER PRIMARY KEY AUTOINCREMENT, zip TEXT NOT NULL, radius_km REAL NOT NULL,
            lat1 REAL NOT NULL, lat2 REAL NOT NULL, lon1 REAL NOT NULL, lon2 REAL NOT NULL,
            created_at INTEGER NOT NULL, UNIQUE(zip, radius_km));
        CREATE TABLE IF NOT EXISTS area_progress (
            area_id INTEGER NOT NULL, type TEXT NOT NULL,
            cursor TEXT, total INTEGER, fetched INTEGER NOT NULL DEFAULT 0,
            complete INTEGER NOT NULL DEFAULT 0, updated_at INTEGER,
            PRIMARY KEY (area_id, type));
        CREATE TABLE IF NOT EXISTS points (
            type TEXT NOT NULL, netid TEXT NOT NULL,
            lat REAL NOT NULL, lon REAL NOT NULL, name TEXT,
            firsttime INTEGER, lasttime INTEGER, encryption TEXT,
            PRIMARY KEY (type, netid));
        CREATE INDEX IF NOT EXISTS idx_points_geo ON points(type, lat, lon);
        CREATE TABLE IF NOT EXISTS quota_log (
            day TEXT PRIMARY KEY, queries INTEGER NOT NULL DEFAULT 0, hit_limit INTEGER NOT NULL DEFAULT 0);
    ');
    return $pdo;
}

function isLocalRequest() {
    $ip = $_SERVER['REMOTE_ADDR'] ?? '';
    return in_array($ip, ['127.0.0.1', '::1'], true);
}

function requireQuotaPermission() {
    if (isLocalRequest()) return;
    $key = getenv('GHOST_TOWN_ADMIN_KEY');
    $given = $_SERVER['HTTP_X_GHOST_KEY'] ?? '';
    if (!$key || !hash_equals($key, $given)) jsonExit(['error' => 'Fetching is restricted.'], 403);
}

/** GET a URL, returns [httpCode, decodedJsonOrNull, rawBody]. */
function httpGetJson($url, array $headers = [], $userpwd = null) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 45,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_HTTPHEADER => array_merge(['Accept: application/json'], $headers),
        CURLOPT_USERAGENT => 'GhostTown/0.1 (+https://nycto.ninja/)',
    ]);
    if ($userpwd) {
        curl_setopt($ch, CURLOPT_HTTPAUTH, CURLAUTH_BASIC);
        curl_setopt($ch, CURLOPT_USERPWD, $userpwd);
    }
    $body = curl_exec($ch);
    if ($body === false) {
        return [0, null, curl_error($ch)];
    }
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    return [$code, json_decode($body, true), $body];
}

function wigleCredentials() {
    $name = getenv('WIGLE_API_NAME');
    $token = getenv('WIGLE_API_TOKEN');
    if (!$name || !$token) jsonExit(['error' => 'WIGLE_API_NAME / WIGLE_API_TOKEN missing from api.env'], 500);
    return "$name:$token";
}

const WIGLE_ENDPOINTS = [
    'wifi'      => 'https://api.wigle.net/api/v2/network/search',
    'bluetooth' => 'https://api.wigle.net/api/v2/bluetooth/search',
    'cell'      => 'https://api.wigle.net/api/v2/cell/search',
];

function logQuery($hitLimit = false) {
    $day = gmdate('Y-m-d');
    $st = db()->prepare('INSERT INTO quota_log(day, queries, hit_limit) VALUES (?, 1, ?)
        ON CONFLICT(day) DO UPDATE SET queries = queries + 1, hit_limit = MAX(hit_limit, excluded.hit_limit)');
    $st->execute([$day, $hitLimit ? 1 : 0]);
}

function quotaToday() {
    $st = db()->prepare('SELECT queries, hit_limit FROM quota_log WHERE day = ?');
    $st->execute([gmdate('Y-m-d')]);
    return $st->fetch() ?: ['queries' => 0, 'hit_limit' => 0];
}

function toEpoch($v) {
    if ($v === null || $v === '') return null;
    $t = strtotime((string)$v);
    return $t === false ? null : $t;
}
