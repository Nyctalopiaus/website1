<?php
/**
 * Platform console backend (brokerage step 5, claude/brokerage-spec.md). Used by platform.html.
 * Separate from the brokerages: its accounts live in data/platform.db, never in a brokerage's
 * database, and a platform sign-in gives no access inside any brokerage.
 *
 *   me                    who's signed in to the console (and whether an owner exists yet)
 *   adopt_owner           one time only: makes the signed-in "admin" account of brokerage #1 the
 *                         platform owner (same username and password; no password is typed here)
 *   login / logout
 *   list_brokerages       every brokerage with status, user counts, listings, last sign-in
 *   create_brokerage      {slug, name, contact_email, admin_username, admin_name, admin_password}
 *   set_status            {id, status: active|readonly|suspended|closed}
 *   audit                 the console's own log
 *   list_services         outside services Dibs uses: what for, plan, cost, renewal, and whether
 *                         its API key is configured on the server (never the key itself)
 *   save_service          {id?, name, category, ...}; refuses anything that looks like a secret
 *   delete_service        {id}
 *   change_password       {current, new}
 *   get_pricing / save_pricing   seat price (monthly, yearly) and trial length
 *   set_plan              {id, plan: trial|monthly|annual|comped}; comped = free
 * Billing (claude/billing-spec.md) keeps its state here in "billing"; Stripe isn't connected yet.
 */
define('IS_LOCAL_ENV', in_array($_SERVER['SERVER_NAME'] ?? '', ['localhost', '127.0.0.1'], true));
ini_set('display_errors', IS_LOCAL_ENV ? 1 : 0);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Frame-Options: DENY');

if (session_status() === PHP_SESSION_NONE) {
    @ini_set('session.cookie_httponly', 1);
    @ini_set('session.cookie_samesite', 'Strict');
    if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') @ini_set('session.cookie_secure', 1);
    session_start();
}
if (empty($_SESSION['platform_csrf'])) $_SESSION['platform_csrf'] = bin2hex(random_bytes(32));

require_once __DIR__ . '/tenant.php';
const PLATFORM_RESERVED_SLUGS = ['main', 'platform', 'admin', 'api', 'www', 'b', 'backend', 'media', 'data', 'assets', 'js', 'dibs', 'test-isolation'];
const PLATFORM_STATUSES = ['active', 'readonly', 'suspended', 'closed'];

$dataDir = __DIR__ . '/../data';
$pdo = dibsPlatformDb($dataDir);
$pdo->exec("CREATE TABLE IF NOT EXISTS platform_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME
)");
$pdo->exec("CREATE TABLE IF NOT EXISTS platform_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at DATETIME DEFAULT CURRENT_TIMESTAMP,
    username TEXT,
    action TEXT NOT NULL,
    detail TEXT DEFAULT '',
    ip TEXT
)");

// Outside services (Services & costs in the console). Keys and passwords are never stored here:
// key_env_name is only the NAME of the setting in api.env, so the console can say whether it's set.
$pdo->exec("CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'other',
    purpose TEXT DEFAULT '',
    provider_url TEXT DEFAULT '',
    account_ref TEXT DEFAULT '',
    key_env_name TEXT DEFAULT '',
    plan TEXT DEFAULT '',
    cost_amount REAL DEFAULT NULL,
    cost_period TEXT DEFAULT 'month',
    cost_notes TEXT DEFAULT '',
    renewal_date TEXT DEFAULT '',
    status TEXT DEFAULT 'active',
    notes TEXT DEFAULT '',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)");
if ((int)$pdo->query("SELECT COUNT(*) FROM services")->fetchColumn() === 0) {
    $seed = [
        ['Web hosting (nycto.ninja server)', 'hosting', 'Runs the site: PHP, the SQLite databases and listing photos. SSH on port 21098.', '', '', '', '', null, 'month', 'Fill in the provider, plan and price from your hosting bill.', 'active'],
        ['Domain: nycto.ninja', 'domain', 'The site address.', '', '', '', '', null, 'year', 'Fill in the registrar and renewal date.', 'active'],
        ['RentCast API', 'data', 'Comps and value estimates (Check Comps, My Home value).', 'https://www.rentcast.io/api', '', 'RENTCAST_API_KEY', 'Free: 50 lookups a month', 0, 'month', 'Paid plans if lookups grow past the free tier.', 'active'],
        ['FRED (St. Louis Fed) API', 'data', 'Market mortgage rates (30-yr, 15-yr, FHA, VA).', 'https://fred.stlouisfed.org/docs/api/fred/', '', 'FRED_API_KEY', 'Free', 0, 'free', '', 'active'],
        ['Google Gemini API', 'ai', 'AI analysis, AI Ranking, Compare to my house.', 'https://ai.google.dev/', '', '', 'Each user brings their own key (stored encrypted in their browser)', null, 'usage', 'Costs land on each user\'s own Google account, not Dibs. Would become a Dibs cost if Dibs supplies the key.', 'active'],
        ['REColorado Matrix MLS', 'mls', 'Listings, captured with the bookmarklet through an agent\'s own MLS login.', 'https://matrix.recolorado.com/', '', '', 'Agent\'s MLS membership', 0, 'free', 'No cost to Dibs today. A licensed RESO Web API feed (per brokerage) would be a real monthly cost.', 'active'],
        ['OpenStreetMap tiles and Nominatim', 'maps', 'Map tiles and address lookup.', 'https://operations.osmfoundation.org/policies/', '', '', 'Free (usage policy limits)', 0, 'free', 'Heavy use needs a paid tile/geocoding provider.', 'active'],
        ['Esri World Imagery', 'maps', 'Satellite map layer.', 'https://www.esri.com/', '', '', 'Free tier', 0, 'free', 'Check the terms before commercial launch.', 'active'],
        ['OSRM routing (public demo server)', 'maps', 'Drive times and route lines in the Tour Planner.', 'https://project-osrm.org/', '', '', 'Free demo server', 0, 'free', 'Not meant for production traffic; plan a paid or self-hosted router before launch.', 'active'],
        ['US Census Geocoder', 'maps', 'Address to map location.', 'https://geocoding.geo.census.gov/', '', '', 'Free', 0, 'free', '', 'active'],
        ['CDNs and fonts (cdnjs, unpkg, jsDelivr, Google Fonts)', 'libraries', 'Script libraries (Leaflet, jsPDF, pdf.js) and fonts.', '', '', '', 'Free', 0, 'free', '', 'active'],
        ['Stripe', 'payments', 'Brokerage subscriptions: checkout, card billing, invoices.', 'https://stripe.com/', '', 'STRIPE_SECRET_KEY', 'Pay as you go', null, 'usage', '2.9% + $0.30 per charge, +0.7% Billing, +0.5% if Stripe Tax is on.', 'planned'],
        ['Email sending', 'email', 'Invites, alerts and receipts by email (none yet).', '', '', '', '', null, 'month', 'Not chosen yet.', 'planned'],
    ];
    $ins = $pdo->prepare("INSERT INTO services (name, category, purpose, provider_url, account_ref, key_env_name, plan, cost_amount, cost_period, cost_notes, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    foreach ($seed as $r) $ins->execute($r);
}
// Billing state per brokerage (Stripe fields stay empty until Stripe is connected) and pricing.
$pdo->exec("CREATE TABLE IF NOT EXISTS billing (
    brokerage_id INTEGER PRIMARY KEY,
    plan TEXT DEFAULT 'trial',               -- trial | monthly | annual | comped
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    stripe_status TEXT,
    seats_billed INTEGER DEFAULT 0,
    trial_ends_at DATETIME,
    current_period_end DATETIME,
    grace_until DATETIME,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)");
$pdo->exec("CREATE TABLE IF NOT EXISTS stripe_events (event_id TEXT PRIMARY KEY, type TEXT, received_at DATETIME DEFAULT CURRENT_TIMESTAMP, handled INTEGER DEFAULT 0)");
$pdo->exec("CREATE TABLE IF NOT EXISTS platform_settings (key TEXT PRIMARY KEY, value TEXT)");
$pdo->exec("INSERT OR IGNORE INTO platform_settings (key, value) VALUES ('seat_price_monthly', '39'), ('seat_price_yearly', '390'), ('trial_days', '14')");
// Brokerage #1 (the original install) is free.
$pdo->exec("INSERT OR IGNORE INTO billing (brokerage_id, plan) VALUES (1, 'comped')");
const BILLING_PLANS = ['trial', 'monthly', 'annual', 'comped'];
function pSetting(PDO $pdo, string $k, string $default = ''): string {
    $st = $pdo->prepare("SELECT value FROM platform_settings WHERE key = :k");
    $st->execute([':k' => $k]);
    $v = $st->fetchColumn();
    return $v === false ? $default : (string)$v;
}

const SERVICE_CATEGORIES = ['hosting', 'domain', 'data', 'mls', 'ai', 'maps', 'payments', 'email', 'libraries', 'tools', 'other'];
const SERVICE_PERIODS = ['month', 'year', 'usage', 'one-time', 'free'];
const SERVICE_STATUSES = ['active', 'planned', 'cancelled'];

/** Whether a setting is present in the environment or the shared api.env (true/false only). */
function pEnvConfigured(string $name): bool {
    if (!preg_match('/^[A-Z][A-Z0-9_]{2,60}$/', $name)) return false;
    foreach ([getenv($name), $_SERVER[$name] ?? null, $_ENV[$name] ?? null] as $env) if (is_string($env) && trim($env) !== '') return true;
    $files = ['/home/nyctltlc/api.env'];
    $override = getenv('DIBS_ENV_FILE');
    if (is_string($override) && trim($override) !== '') array_unshift($files, trim($override));
    foreach ([__DIR__, dirname(__DIR__), dirname(__DIR__, 2), dirname(__DIR__, 3)] as $dir) $files[] = $dir . '/api.env';
    $pattern = '/^\s*(?:export\s+)?' . preg_quote($name, '/') . '\s*=\s*(.*?)\s*$/';
    foreach ($files as $f) {
        if (!@is_file($f) || !@is_readable($f)) continue;
        foreach (file($f, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
            if (preg_match($pattern, $line, $m) && trim($m[1], "\"' \t") !== '') return true;
        }
    }
    return false;
}

/** True if a value looks like a key, token or password (never stored in the services list). */
function pLooksSecret(string $v): bool {
    return (bool)preg_match('/\b(sk|rk|pk|whsec)_(live|test)?_?[A-Za-z0-9]{8,}|(api[_ -]?key|secret|token|passw(or)?d)\s*[:=]|\b[A-Za-z0-9_\-]{32,}\b/i', $v);
}

function pOut(array $data, int $code = 200): void { http_response_code($code); echo json_encode($data); exit; }
function pFail(int $code, string $msg): void { pOut(['success' => false, 'error' => $msg], $code); }
function pBody(): array { return json_decode((string)file_get_contents('php://input'), true) ?: []; }
function pAudit(PDO $pdo, string $action, string $detail = ''): void {
    $pdo->prepare("INSERT INTO platform_audit (username, action, detail, ip) VALUES (:u, :a, :d, :ip)")
        ->execute([':u' => $_SESSION['platform_username'] ?? null, ':a' => $action, ':d' => mb_substr($detail, 0, 500), ':ip' => substr((string)($_SERVER['REMOTE_ADDR'] ?? ''), 0, 64)]);
}
function pRequireOwner(): void { if (empty($_SESSION['platform_user_id'])) pFail(401, 'Sign in to the platform console.'); }
function pRequirePost(): void {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') pFail(405, 'Use POST.');
    if (!hash_equals($_SESSION['platform_csrf'], (string)($_SERVER['HTTP_X_CSRF_TOKEN'] ?? ''))) pFail(403, 'Security check failed. Reload the page.');
}

/** Read-only look into a brokerage's database for the overview. */
function pBrokerageStats(string $dataDir, array $b): array {
    $path = $dataDir . '/' . $b['db_file'];
    $out = ['users' => 0, 'agents' => 0, 'clients' => 0, 'admins' => 0, 'listings' => 0, 'last_login' => null, 'display_name' => '', 'initialized' => false];
    if (!is_file($path)) return $out;
    try {
        $db = new PDO('sqlite:' . $path, null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $out['initialized'] = true;
        foreach ($db->query("SELECT role, COALESCE(is_admin, 0) AS a, COUNT(*) AS n, MAX(last_login) AS ll FROM users GROUP BY role, a") as $r) {
            $out['users'] += (int)$r['n'];
            if ($r['role'] === 'realtor') $out['agents'] += (int)$r['n'];
            if ($r['role'] === 'client') $out['clients'] += (int)$r['n'];
            if ((int)$r['a'] === 1) $out['admins'] += (int)$r['n'];
            if ($r['ll'] && (!$out['last_login'] || $r['ll'] > $out['last_login'])) $out['last_login'] = $r['ll'];
        }
        $out['listings'] = (int)$db->query("SELECT COUNT(*) FROM properties")->fetchColumn();
        try { $out['display_name'] = (string)$db->query("SELECT name FROM brokerage_settings WHERE id = 1")->fetchColumn(); } catch (Throwable $e) {}
    } catch (Throwable $e) { /* not set up yet */ }
    return $out;
}

$action = (string)($_GET['action'] ?? '');
switch ($action) {
    case 'me': {
        $hasOwner = (int)$pdo->query("SELECT COUNT(*) FROM platform_users")->fetchColumn() > 0;
        pOut(['success' => true, 'signed_in' => !empty($_SESSION['platform_user_id']), 'username' => $_SESSION['platform_username'] ?? null,
            'has_owner' => $hasOwner, 'csrf' => $_SESSION['platform_csrf']]);
    }

    case 'adopt_owner': {
        pRequirePost();
        if ((int)$pdo->query("SELECT COUNT(*) FROM platform_users")->fetchColumn() > 0) pFail(409, 'The platform owner is already set up. Sign in instead.');
        // Must be signed in to brokerage #1 as its built-in administrator account (role admin).
        if (empty($_SESSION['user_id']) || (int)($_SESSION['brokerage_id'] ?? 1) !== 1) pFail(403, 'First sign in to Dibs (at /dibs/) with the "admin" account, then come back.');
        $main = new PDO('sqlite:' . $dataDir . '/properties.db', null, null, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC]);
        $st = $main->prepare("SELECT username, password_hash FROM users WHERE id = :id AND COALESCE(is_admin, 0) = 1 AND role = 'admin'");
        $st->execute([':id' => (int)$_SESSION['user_id']]);
        $u = $st->fetch();
        if (!$u) pFail(403, 'Only the administrator account (role Administrator, not a realtor or client) can become the platform owner.');
        $pdo->prepare("INSERT INTO platform_users (username, password_hash) VALUES (:u, :h)")->execute([':u' => $u['username'], ':h' => $u['password_hash']]);
        session_regenerate_id(true);
        $_SESSION['platform_user_id'] = (int)$pdo->lastInsertId();
        $_SESSION['platform_username'] = $u['username'];
        $_SESSION['platform_csrf'] = bin2hex(random_bytes(32));
        pAudit($pdo, 'adopt_owner', 'Platform owner created from brokerage #1 admin account');
        pOut(['success' => true, 'username' => $u['username'], 'csrf' => $_SESSION['platform_csrf']]);
    }

    case 'login': {
        pRequirePost();
        $in = pBody();
        $ip = substr((string)($_SERVER['REMOTE_ADDR'] ?? ''), 0, 64);
        $recent = $pdo->prepare("SELECT COUNT(*) FROM platform_audit WHERE action = 'login_failed' AND ip = :ip AND at >= datetime('now', '-15 minutes')");
        $recent->execute([':ip' => $ip]);
        if ((int)$recent->fetchColumn() >= 8) pFail(429, 'Too many attempts. Wait 15 minutes.');
        $st = $pdo->prepare("SELECT id, username, password_hash FROM platform_users WHERE username = :u");
        $st->execute([':u' => trim((string)($in['username'] ?? ''))]);
        $u = $st->fetch();
        if (!$u || !password_verify((string)($in['password'] ?? ''), $u['password_hash'])) {
            pAudit($pdo, 'login_failed', 'username: ' . mb_substr((string)($in['username'] ?? ''), 0, 60));
            pFail(401, 'Wrong username or password.');
        }
        session_regenerate_id(true);
        $_SESSION['platform_user_id'] = (int)$u['id'];
        $_SESSION['platform_username'] = $u['username'];
        $_SESSION['platform_csrf'] = bin2hex(random_bytes(32));
        $pdo->prepare("UPDATE platform_users SET last_login = CURRENT_TIMESTAMP WHERE id = :id")->execute([':id' => $u['id']]);
        pAudit($pdo, 'login');
        pOut(['success' => true, 'username' => $u['username'], 'csrf' => $_SESSION['platform_csrf']]);
    }

    case 'logout': {
        pRequirePost();
        pAudit($pdo, 'logout');
        unset($_SESSION['platform_user_id'], $_SESSION['platform_username']);
        pOut(['success' => true]);
    }

    case 'list_brokerages': {
        pRequireOwner();
        $rows = $pdo->query("SELECT b.id, b.slug, b.name, b.db_file, b.status, b.contact_email, b.notes, b.created_at,
                (b.setup_admin_hash IS NOT NULL) AS setup_pending, COALESCE(bl.plan, 'trial') AS plan, bl.trial_ends_at, bl.stripe_status
            FROM brokerages b LEFT JOIN billing bl ON bl.brokerage_id = b.id ORDER BY b.id")->fetchAll();
        $monthly = (float)pSetting($pdo, 'seat_price_monthly', '39');
        $yearly = (float)pSetting($pdo, 'seat_price_yearly', '390');
        $out = [];
        $mrr = 0.0;
        foreach ($rows as $b) {
            $stats = pBrokerageStats($dataDir, $b);
            $seats = max(1, (int)$stats['agents']);
            $value = $b['plan'] === 'monthly' ? $seats * $monthly : ($b['plan'] === 'annual' ? $seats * $yearly / 12 : 0);
            if ($b['status'] === 'active') $mrr += $value;
            $out[] = ['id' => (int)$b['id'], 'slug' => $b['slug'], 'name' => $b['name'], 'status' => $b['status'],
                'contact_email' => $b['contact_email'], 'created_at' => $b['created_at'], 'setup_pending' => (bool)$b['setup_pending'],
                'plan' => $b['plan'], 'trial_ends_at' => $b['trial_ends_at'], 'stripe_status' => $b['stripe_status'],
                'monthly_value' => round($value, 2), 'stats' => $stats];
        }
        pOut(['success' => true, 'brokerages' => $out, 'mrr' => round($mrr, 2)]);
    }

    case 'create_brokerage': {
        pRequireOwner();
        pRequirePost();
        $in = pBody();
        $slug = strtolower(trim((string)($in['slug'] ?? '')));
        $name = mb_substr(trim(strip_tags((string)($in['name'] ?? ''))), 0, 120);
        $email = strtolower(trim((string)($in['contact_email'] ?? '')));
        $adminUser = strtolower(trim((string)($in['admin_username'] ?? '')));
        $adminName = mb_substr(trim(strip_tags((string)($in['admin_name'] ?? ''))), 0, 80);
        $pass = (string)($in['admin_password'] ?? '');
        if (!preg_match('/^' . DIBS_SLUG_PATTERN . '$/', $slug) || substr($slug, -1) === '-') pFail(400, 'Address name: 2 to 40 lowercase letters, digits or dashes, starting with a letter or digit.');
        if (in_array($slug, PLATFORM_RESERVED_SLUGS, true)) pFail(400, 'That address name is reserved. Pick another.');
        if (mb_strlen($name) < 2) pFail(400, 'Enter the brokerage name.');
        if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) pFail(400, 'Enter a valid contact email or leave it blank.');
        if (!preg_match('/^[a-z0-9._-]{3,40}$/', $adminUser)) pFail(400, "The admin's username: 3 to 40 letters, digits, dots, dashes or underscores.");
        if (mb_strlen($adminName) < 2) pFail(400, "Enter the admin's full name.");
        if (strlen($pass) < 12) pFail(400, "Use a starting password of at least 12 characters. They'll change it after signing in.");
        $exists = $pdo->prepare("SELECT 1 FROM brokerages WHERE slug = :s");
        $exists->execute([':s' => $slug]);
        if ($exists->fetchColumn()) pFail(409, 'A brokerage already uses that address name.');
        $file = 'brokerages/' . $slug . '.db';
        if (is_file($dataDir . '/' . $file)) pFail(409, 'A database file for that name already exists on the server. Pick another name.');
        $pdo->prepare("INSERT INTO brokerages (slug, name, db_file, status, contact_email, setup_admin_username, setup_admin_hash, setup_admin_name)
            VALUES (:s, :n, :f, 'active', :e, :au, :ah, :an)")
            ->execute([':s' => $slug, ':n' => $name, ':f' => $file, ':e' => $email, ':au' => $adminUser, ':ah' => password_hash($pass, PASSWORD_BCRYPT), ':an' => $adminName]);
        $newId = (int)$pdo->lastInsertId();
        $trialDays = max(0, min(90, (int)pSetting($pdo, 'trial_days', '14')));
        $pdo->prepare("INSERT OR REPLACE INTO billing (brokerage_id, plan, trial_ends_at) VALUES (:id, 'trial', datetime('now', :d))")
            ->execute([':id' => $newId, ':d' => "+$trialDays days"]);
        pAudit($pdo, 'create_brokerage', "$slug ($name), first admin $adminUser, $trialDays-day trial");
        // The browser then opens /dibs/b/<slug>/backend/api.php once, which creates the database
        // and this first account.
        pOut(['success' => true, 'slug' => $slug]);
    }

    case 'set_status': {
        pRequireOwner();
        pRequirePost();
        $in = pBody();
        $id = (int)($in['id'] ?? 0);
        $status = (string)($in['status'] ?? '');
        if (!in_array($status, PLATFORM_STATUSES, true)) pFail(400, 'Pick a status from the list.');
        if ($id === 1 && $status !== 'active') pFail(400, "Brokerage #1 is the original install; keep it active.");
        $st = $pdo->prepare("UPDATE brokerages SET status = :s WHERE id = :id");
        $st->execute([':s' => $status, ':id' => $id]);
        if ($st->rowCount() !== 1) pFail(404, 'That brokerage was not found.');
        pAudit($pdo, 'set_status', "brokerage $id -> $status");
        pOut(['success' => true]);
    }

    case 'list_services': {
        pRequireOwner();
        $rows = $pdo->query("SELECT * FROM services ORDER BY (status = 'cancelled'), category, name")->fetchAll();
        $monthly = 0.0; $yearly = 0.0;
        foreach ($rows as &$r) {
            $r['id'] = (int)$r['id'];
            $r['cost_amount'] = $r['cost_amount'] !== null ? (float)$r['cost_amount'] : null;
            $r['key_configured'] = $r['key_env_name'] !== '' ? pEnvConfigured($r['key_env_name']) : null;
            if ($r['status'] === 'active' && $r['cost_amount'] !== null) {
                if ($r['cost_period'] === 'month') $monthly += $r['cost_amount'];
                if ($r['cost_period'] === 'year') $yearly += $r['cost_amount'];
            }
        }
        unset($r);
        pOut(['success' => true, 'services' => $rows, 'categories' => SERVICE_CATEGORIES, 'periods' => SERVICE_PERIODS, 'statuses' => SERVICE_STATUSES,
            'totals' => ['monthly' => round($monthly, 2), 'yearly' => round($yearly, 2), 'per_month_all_in' => round($monthly + $yearly / 12, 2)]]);
    }

    case 'save_service': {
        pRequireOwner();
        pRequirePost();
        $in = pBody();
        $t = fn($k, $max) => mb_substr(trim(preg_replace('/[\x00-\x1F\x7F]+/u', ' ', strip_tags((string)($in[$k] ?? '')))), 0, $max);
        $f = ['name' => $t('name', 120), 'category' => (string)($in['category'] ?? 'other'), 'purpose' => $t('purpose', 300),
            'provider_url' => $t('provider_url', 300), 'account_ref' => $t('account_ref', 120), 'key_env_name' => strtoupper($t('key_env_name', 60)),
            'plan' => $t('plan', 160), 'cost_period' => (string)($in['cost_period'] ?? 'month'), 'cost_notes' => $t('cost_notes', 300),
            'renewal_date' => $t('renewal_date', 10), 'status' => (string)($in['status'] ?? 'active'), 'notes' => $t('notes', 1000)];
        if (mb_strlen($f['name']) < 2) pFail(400, 'Enter a name.');
        if (!in_array($f['category'], SERVICE_CATEGORIES, true)) pFail(400, 'Pick a category from the list.');
        if (!in_array($f['cost_period'], SERVICE_PERIODS, true)) pFail(400, 'Pick how it\'s billed from the list.');
        if (!in_array($f['status'], SERVICE_STATUSES, true)) pFail(400, 'Pick a status from the list.');
        if ($f['provider_url'] !== '' && !preg_match('#^https://#i', $f['provider_url'])) pFail(400, 'The website must start with https://');
        if ($f['key_env_name'] !== '' && !preg_match('/^[A-Z][A-Z0-9_]{2,60}$/', $f['key_env_name'])) pFail(400, 'The key setting name is like RENTCAST_API_KEY: capital letters, digits and underscores.');
        if ($f['renewal_date'] !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $f['renewal_date'])) pFail(400, 'Use the date picker for the renewal date.');
        foreach (['purpose', 'account_ref', 'plan', 'cost_notes', 'notes'] as $k) {
            if (pLooksSecret($f[$k])) pFail(400, 'That looks like a key, token or password. Don\'t store secrets here: put keys in api.env and only enter the setting name.');
        }
        $cost = $in['cost_amount'] ?? null;
        $f['cost_amount'] = ($cost === null || $cost === '') ? null : (is_numeric($cost) && $cost >= 0 && $cost < 1000000 ? round((float)$cost, 2) : pFail(400, 'Enter the cost as a number.'));
        $id = (int)($in['id'] ?? 0);
        $cols = array_keys($f);
        if ($id > 0) {
            $st = $pdo->prepare("UPDATE services SET " . implode(', ', array_map(fn($c) => "$c = :$c", $cols)) . ", updated_at = CURRENT_TIMESTAMP WHERE id = :id");
            $st->execute(array_merge(array_combine(array_map(fn($c) => ":$c", $cols), array_values($f)), [':id' => $id]));
            if ($st->rowCount() !== 1) pFail(404, 'That service was not found.');
        } else {
            $pdo->prepare("INSERT INTO services (" . implode(', ', $cols) . ") VALUES (" . implode(', ', array_map(fn($c) => ":$c", $cols)) . ")")
                ->execute(array_combine(array_map(fn($c) => ":$c", $cols), array_values($f)));
            $id = (int)$pdo->lastInsertId();
        }
        pAudit($pdo, 'save_service', $f['name']);
        pOut(['success' => true, 'id' => $id]);
    }

    case 'delete_service': {
        pRequireOwner();
        pRequirePost();
        $in = pBody();
        $st = $pdo->prepare("DELETE FROM services WHERE id = :id");
        $st->execute([':id' => (int)($in['id'] ?? 0)]);
        if ($st->rowCount() !== 1) pFail(404, 'That service was not found.');
        pAudit($pdo, 'delete_service', 'id ' . (int)$in['id']);
        pOut(['success' => true]);
    }

    case 'change_password': {
        pRequireOwner();
        pRequirePost();
        $in = pBody();
        $st = $pdo->prepare("SELECT password_hash FROM platform_users WHERE id = :id");
        $st->execute([':id' => (int)$_SESSION['platform_user_id']]);
        $hash = (string)$st->fetchColumn();
        if (!password_verify((string)($in['current'] ?? ''), $hash)) { pAudit($pdo, 'password_change_failed'); pFail(400, 'Your current password is wrong.'); }
        $new = (string)($in['new'] ?? '');
        if (strlen($new) < 14) pFail(400, 'Use a new password of at least 14 characters.');
        if (strcasecmp($new, (string)$_SESSION['platform_username']) === 0 || password_verify($new, $hash)) pFail(400, 'Choose a different password.');
        $pdo->prepare("UPDATE platform_users SET password_hash = :h WHERE id = :id")->execute([':h' => password_hash($new, PASSWORD_BCRYPT), ':id' => (int)$_SESSION['platform_user_id']]);
        session_regenerate_id(true);
        pAudit($pdo, 'change_password');
        pOut(['success' => true]);
    }

    case 'get_pricing': {
        pRequireOwner();
        pOut(['success' => true, 'seat_price_monthly' => (float)pSetting($pdo, 'seat_price_monthly', '39'),
            'seat_price_yearly' => (float)pSetting($pdo, 'seat_price_yearly', '390'), 'trial_days' => (int)pSetting($pdo, 'trial_days', '14')]);
    }

    case 'save_pricing': {
        pRequireOwner();
        pRequirePost();
        $in = pBody();
        $m = $in['seat_price_monthly'] ?? null; $y = $in['seat_price_yearly'] ?? null; $t = $in['trial_days'] ?? null;
        if (!is_numeric($m) || $m < 0 || $m > 1000) pFail(400, 'Enter the monthly seat price (0 to 1000).');
        if (!is_numeric($y) || $y < 0 || $y > 10000) pFail(400, 'Enter the yearly seat price (0 to 10000).');
        if (!in_array((int)$t, [0, 7, 14, 21, 30, 45, 60], true)) pFail(400, 'Pick a trial length from the list.');
        $set = $pdo->prepare("INSERT OR REPLACE INTO platform_settings (key, value) VALUES (:k, :v)");
        $set->execute([':k' => 'seat_price_monthly', ':v' => (string)round((float)$m, 2)]);
        $set->execute([':k' => 'seat_price_yearly', ':v' => (string)round((float)$y, 2)]);
        $set->execute([':k' => 'trial_days', ':v' => (string)(int)$t]);
        pAudit($pdo, 'save_pricing', "monthly $m, yearly $y, trial $t days");
        pOut(['success' => true]);
    }

    case 'set_plan': {
        pRequireOwner();
        pRequirePost();
        $in = pBody();
        $id = (int)($in['id'] ?? 0);
        $plan = (string)($in['plan'] ?? '');
        if (!in_array($plan, BILLING_PLANS, true)) pFail(400, 'Pick a plan from the list.');
        $exists = $pdo->prepare("SELECT 1 FROM brokerages WHERE id = :id");
        $exists->execute([':id' => $id]);
        if (!$exists->fetchColumn()) pFail(404, 'That brokerage was not found.');
        $pdo->prepare("INSERT INTO billing (brokerage_id, plan) VALUES (:id, :p) ON CONFLICT(brokerage_id) DO UPDATE SET plan = excluded.plan, updated_at = CURRENT_TIMESTAMP")
            ->execute([':id' => $id, ':p' => $plan]);
        pAudit($pdo, 'set_plan', "brokerage $id -> $plan");
        pOut(['success' => true]);
    }

    case 'audit': {
        pRequireOwner();
        $rows = $pdo->query("SELECT at, username, action, detail, ip FROM platform_audit ORDER BY id DESC LIMIT 100")->fetchAll();
        pOut(['success' => true, 'entries' => $rows]);
    }

    default:
        pFail(400, 'Unknown action.');
}
