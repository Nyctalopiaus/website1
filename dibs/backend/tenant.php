<?php
/**
 * Brokerages (tenants). See the project doc claude/brokerage-spec.md.
 *
 * Each brokerage has its own SQLite database; data/platform.db only lists the brokerages.
 * A brokerage is picked by its URL path, /dibs/b/<slug>/... (Apache/LiteSpeed rewrite in
 * dibs/.htaccess; dev-router.php does the same for PHP's built-in server). The plain /dibs/
 * URL is brokerage #1, the original install, whose database stays at data/properties.db, so
 * every existing link, QR code and bookmarklet keeps working.
 *
 * A signed-in session is bound to one brokerage. A session used on another brokerage's URL is
 * signed out there (see bootstrap.php), so one brokerage's login never reaches another's data.
 */

/** Slugs: lowercase letters, digits and dashes, 2-40 characters, starting with a letter or digit. */
const DIBS_SLUG_PATTERN = '[a-z0-9][a-z0-9-]{1,39}';

function dibsPlatformDb(string $dataDir): PDO {
    static $pdo = null;
    if ($pdo) return $pdo;
    $pdo = new PDO('sqlite:' . $dataDir . '/platform.db');
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
    $pdo->exec("CREATE TABLE IF NOT EXISTS brokerages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL DEFAULT '',
        db_file TEXT NOT NULL,                    -- relative to data/
        status TEXT NOT NULL DEFAULT 'active',    -- active | readonly | suspended | closed
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )");
    // Brokerage #1 is the original install; its database stays where it has always been.
    $pdo->exec("INSERT OR IGNORE INTO brokerages (id, slug, name, db_file) VALUES (1, 'main', '', 'properties.db')");
    return $pdo;
}

/** The brokerage slug in this request's URL, or null for the plain /dibs/ URL. */
function dibsSlugFromRequest(): ?string {
    // SCRIPT_NAME is the real script after the rewrite (/dibs/backend/api.php), so the app's base
    // path is two levels up; REQUEST_URI is what the browser asked for (/dibs/b/<slug>/backend/api.php).
    $base = rtrim(str_replace('\\', '/', dirname(dirname($_SERVER['SCRIPT_NAME'] ?? '/'))), '/');
    $path = (string)(parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH) ?: '');
    if (preg_match('#^' . preg_quote($base, '#') . '/b/(' . DIBS_SLUG_PATTERN . ')(/|$)#', $path, $m)) return $m[1];
    return null;
}

/**
 * The brokerage for this request: {id, slug, name, status, db_path}. Ends the request with a
 * 404 for an unknown slug and a 410 for a closed brokerage.
 */
function dibsResolveBrokerage(string $dataDir): array {
    $slug = dibsSlugFromRequest();
    $p = dibsPlatformDb($dataDir);
    if ($slug === null) {
        $row = $p->query('SELECT * FROM brokerages WHERE id = 1')->fetch();
    } else {
        $st = $p->prepare('SELECT * FROM brokerages WHERE slug = :s');
        $st->execute([':s' => $slug]);
        $row = $st->fetch();
    }
    $stop = function (int $code, string $msg) {
        http_response_code($code);
        echo json_encode(['success' => false, 'error' => $msg]);
        exit;
    };
    if (!$row) $stop(404, 'There is no brokerage at this address.');
    if ($row['status'] === 'closed') $stop(410, 'This brokerage is no longer on Dibs.');
    // The file name comes from the platform database, but check it anyway: never a path outside data/.
    $file = (string)$row['db_file'];
    if (!preg_match('#^(brokerages/)?[a-z0-9][a-z0-9_-]*\.db$#', $file)) $stop(500, 'Brokerage is misconfigured.');
    if ($file !== 'properties.db' && !is_dir($dataDir . '/brokerages')) mkdir($dataDir . '/brokerages', 0755, true);
    return [
        'id' => (int)$row['id'],
        'slug' => (string)$row['slug'],
        'name' => (string)$row['name'],
        'status' => (string)$row['status'],
        'db_path' => $dataDir . '/' . $file,
    ];
}

/** Call right after a successful sign-in, with the session already regenerated. */
function dibsBindSessionToBrokerage(): void {
    $_SESSION['brokerage_id'] = DIBS_BROKERAGE_ID;
}
