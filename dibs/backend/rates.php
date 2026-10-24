<?php
/**
 * Nycto's MLS Property Scout - Mortgage rate tracking.
 *
 * Two sources, shown side by side in the Rates panel:
 *   - Market rates from FRED (St. Louis Fed). Fetched at most every RATES_REFRESH_HOURS, only
 *     when someone opens the app, and saved one row per series per observation date in
 *     mortgage_rates, so the trend lines are Dibs' own history.
 *       30-yr / 15-yr fixed: Freddie Mac PMMS (weekly, Thursdays) - the "headline" rate.
 *       FHA / VA 30-yr:      Optimal Blue mortgage market indices (daily, business days).
 *   - Lender quotes the user types in (rate_quotes), one row per quote, never overwritten.
 *
 * API key (free, https://fred.stlouisfed.org/docs/api/api_key.html), first match wins:
 *   FRED_API_KEY in the PHP environment, or a FRED_API_KEY=... line in the same api.env files
 *   comps.php reads for RENTCAST_API_KEY. Without a key, market rates are simply empty and
 *   lender quotes still work.
 *
 * Expects backend/bootstrap.php (for $pdo, logEvent()) and auth.php.
 */

const RATES_REFRESH_HOURS = 12;
const RATES_RETRY_MINUTES = 60;   // after a failed fetch, wait this long before trying again
const RATES_HISTORY_DAYS = 400;   // first fetch backfills ~13 months so the trends start full

const RATE_SERIES = [
    '30yr' => ['series' => 'MORTGAGE30US',   'label' => '30-Yr Fixed', 'source' => 'Freddie Mac PMMS (weekly)'],
    '15yr' => ['series' => 'MORTGAGE15US',   'label' => '15-Yr Fixed', 'source' => 'Freddie Mac PMMS (weekly)'],
    'fha'  => ['series' => 'OBMMIFHA30YF',   'label' => 'FHA 30-Yr',   'source' => 'Optimal Blue (daily)'],
    'va'   => ['series' => 'OBMMIVA30YF',    'label' => 'VA 30-Yr',    'source' => 'Optimal Blue (daily)'],
];

function getDibsEnvSecret(string $name): string {
    foreach ([getenv($name), $_SERVER[$name] ?? null, $_ENV[$name] ?? null] as $env) {
        if (is_string($env) && trim($env) !== '') return trim($env);
    }
    $envFiles = ['/home/nyctltlc/api.env'];
    $override = getenv('DIBS_ENV_FILE');
    if (is_string($override) && trim($override) !== '') array_unshift($envFiles, trim($override));
    foreach ([__DIR__, dirname(__DIR__), dirname(__DIR__, 2), dirname(__DIR__, 3)] as $dir) {
        $envFiles[] = $dir . '/api.env';
    }
    $pattern = '/^\s*(?:export\s+)?' . preg_quote($name, '/') . '\s*=\s*(.*?)\s*$/';
    foreach ($envFiles as $envFile) {
        if (!@is_file($envFile) || !@is_readable($envFile)) continue;
        foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [] as $line) {
            if (preg_match($pattern, $line, $m)) {
                $value = trim($m[1], "\"' \t");
                if ($value !== '') return $value;
            }
        }
    }
    return '';
}

function ensureRatesTables(PDO $pdo): void {
    $pdo->exec("CREATE TABLE IF NOT EXISTS mortgage_rates (
        series_id TEXT NOT NULL,
        obs_date TEXT NOT NULL,
        rate REAL NOT NULL,
        fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (series_id, obs_date)
    )");
    $pdo->exec("CREATE TABLE IF NOT EXISTS mortgage_rate_fetches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        ok INTEGER NOT NULL DEFAULT 0,
        message TEXT
    )");
    $pdo->exec("CREATE TABLE IF NOT EXISTS rate_quotes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        loan_type TEXT NOT NULL,
        rate REAL NOT NULL,
        points REAL,
        lender TEXT DEFAULT '',
        quoted_on TEXT NOT NULL,
        note TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )");
    $pdo->exec("CREATE INDEX IF NOT EXISTS idx_rate_quotes_user ON rate_quotes(user_id, quoted_on DESC)");
}

function fredObservations(string $apiKey, string $seriesId, string $start): array {
    $url = 'https://api.stlouisfed.org/fred/series/observations?' . http_build_query([
        'series_id' => $seriesId, 'api_key' => $apiKey, 'file_type' => 'json', 'observation_start' => $start
    ]);
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 6,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_HTTPHEADER => ['Accept: application/json']
    ]);
    $raw = curl_exec($ch);
    $http = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = $raw === false ? curl_error($ch) : '';
    if (PHP_VERSION_ID < 80000) @curl_close($ch);
    if ($raw === false || $http !== 200) {
        // Never include $url in the message: it carries the API key.
        throw new RuntimeException("FRED $seriesId failed (HTTP $http" . ($error ? ", $error" : '') . ')');
    }
    $body = json_decode($raw, true);
    $out = [];
    foreach (($body['observations'] ?? []) as $o) {
        $v = $o['value'] ?? '.';
        if ($v === '.' || !is_numeric($v)) continue; // FRED marks missing days with "."
        $out[] = ['date' => (string)$o['date'], 'rate' => (float)$v];
    }
    return $out;
}

/** Refreshes market rates from FRED if they're stale. Never throws; failures are logged. */
function refreshMortgageRatesIfStale(PDO $pdo, string $apiKey): void {
    $lastOk = $pdo->query("SELECT MAX(fetched_at) FROM mortgage_rate_fetches WHERE ok = 1")->fetchColumn();
    $lastTry = $pdo->query("SELECT MAX(fetched_at) FROM mortgage_rate_fetches")->fetchColumn();
    $now = time();
    if ($lastOk && ($now - strtotime($lastOk . ' UTC')) < RATES_REFRESH_HOURS * 3600) return;
    if ($lastTry && $lastTry !== $lastOk && ($now - strtotime($lastTry . ' UTC')) < RATES_RETRY_MINUTES * 60) return;

    $upsert = $pdo->prepare("INSERT INTO mortgage_rates (series_id, obs_date, rate) VALUES (:s, :d, :r)
        ON CONFLICT(series_id, obs_date) DO UPDATE SET rate = excluded.rate, fetched_at = CURRENT_TIMESTAMP");
    $latestStmt = $pdo->prepare("SELECT MAX(obs_date) FROM mortgage_rates WHERE series_id = :s");
    $errors = [];
    $added = 0;
    foreach (RATE_SERIES as $cfg) {
        $sid = $cfg['series'];
        try {
            $latestStmt->execute([':s' => $sid]);
            $latest = $latestStmt->fetchColumn();
            // Re-pull the last couple of weeks too: FRED occasionally revises recent values.
            $start = $latest ? date('Y-m-d', strtotime($latest . ' -14 days')) : date('Y-m-d', strtotime('-' . RATES_HISTORY_DAYS . ' days'));
            $obs = fredObservations($apiKey, $sid, $start);
            $pdo->beginTransaction();
            foreach ($obs as $o) {
                $upsert->execute([':s' => $sid, ':d' => $o['date'], ':r' => $o['rate']]);
                $added++;
            }
            $pdo->commit();
        } catch (Throwable $t) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            $errors[] = $t->getMessage();
        }
    }
    $ok = count($errors) < count(RATE_SERIES) ? 1 : 0; // partial success still counts as fresh
    $msg = $errors ? implode('; ', $errors) : "$added observations";
    $pdo->prepare("INSERT INTO mortgage_rate_fetches (ok, message) VALUES (:ok, :m)")->execute([':ok' => $ok, ':m' => substr($msg, 0, 1000)]);
    if ($errors) logEvent($pdo, 'rates', $ok ? 'warn' : 'error', 'Mortgage rate refresh: ' . substr($msg, 0, 500));
}

/** Rate on the latest observation on or before $date, for week/month-ago comparisons. */
function rateAsOf(array $points, string $date): ?float {
    $best = null;
    foreach ($points as $p) {
        if ($p['date'] <= $date) $best = $p['rate']; else break;
    }
    return $best;
}

function handleGetMortgageRates(PDO $pdo) {
    try {
        ensureRatesTables($pdo);
        $apiKey = getDibsEnvSecret('FRED_API_KEY');
        if ($apiKey !== '') refreshMortgageRatesIfStale($pdo, $apiKey);

        $since = date('Y-m-d', strtotime('-' . RATES_HISTORY_DAYS . ' days'));
        $stmt = $pdo->prepare("SELECT obs_date, rate FROM mortgage_rates WHERE series_id = :s AND obs_date >= :since ORDER BY obs_date ASC");
        $series = [];
        foreach (RATE_SERIES as $type => $cfg) {
            $stmt->execute([':s' => $cfg['series'], ':since' => $since]);
            $points = array_map(fn($r) => ['date' => $r['obs_date'], 'rate' => (float)$r['rate']], $stmt->fetchAll(PDO::FETCH_ASSOC));
            $latest = $points ? end($points) : null;
            $weekAgo = $latest ? rateAsOf($points, date('Y-m-d', strtotime($latest['date'] . ' -7 days'))) : null;
            $monthAgo = $latest ? rateAsOf($points, date('Y-m-d', strtotime($latest['date'] . ' -1 month'))) : null;
            $series[] = [
                'type' => $type,
                'label' => $cfg['label'],
                'source' => $cfg['source'],
                'series_id' => $cfg['series'],
                'latest' => $latest,
                'change_1w' => ($latest && $weekAgo !== null) ? round($latest['rate'] - $weekAgo, 3) : null,
                'change_1m' => ($latest && $monthAgo !== null) ? round($latest['rate'] - $monthAgo, 3) : null,
                'points' => $points,
            ];
        }

        $userId = (int)($_SESSION['user_id'] ?? 0);
        $q = $pdo->prepare("SELECT id, loan_type, rate, points, lender, quoted_on, note FROM rate_quotes WHERE user_id = :u ORDER BY quoted_on DESC, id DESC LIMIT 100");
        $q->execute([':u' => $userId]);
        $quotes = array_map(function ($r) {
            $r['id'] = (int)$r['id'];
            $r['rate'] = (float)$r['rate'];
            $r['points'] = $r['points'] === null ? null : (float)$r['points'];
            return $r;
        }, $q->fetchAll(PDO::FETCH_ASSOC));

        $lastOk = $pdo->query("SELECT MAX(fetched_at) FROM mortgage_rate_fetches WHERE ok = 1")->fetchColumn();
        echo json_encode([
            'success' => true,
            'key_configured' => $apiKey !== '',
            'last_refreshed' => $lastOk ?: null,
            'series' => $series,
            'quotes' => $quotes,
        ]);
    } catch (Throwable $t) {
        logEvent($pdo, 'rates', 'error', 'handleGetMortgageRates failed: ' . $t->getMessage());
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => clientErrorMessage($t)]);
    }
}

function handleSaveRateQuote(PDO $pdo) {
    try {
        ensureRatesTables($pdo);
        $data = json_decode(dibsRequestBody(), true) ?: [];
        $userId = (int)($_SESSION['user_id'] ?? 0);
        $type = (string)($data['loan_type'] ?? '');
        $rate = $data['rate'] ?? null;
        $points = $data['points'] ?? null;
        $quotedOn = trim((string)($data['quoted_on'] ?? ''));
        if ($quotedOn === '') $quotedOn = date('Y-m-d');

        if (!array_key_exists($type, RATE_SERIES)) return rateQuoteError('Pick a loan type.');
        if (!is_numeric($rate) || (float)$rate <= 0 || (float)$rate >= 20) return rateQuoteError('Rate must be a percentage between 0 and 20.');
        if ($points !== null && $points !== '' && (!is_numeric($points) || abs((float)$points) > 10)) return rateQuoteError('Points must be a number between -10 and 10.');
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $quotedOn) || !strtotime($quotedOn)) return rateQuoteError('Quote date must be YYYY-MM-DD.');

        $stmt = $pdo->prepare("INSERT INTO rate_quotes (user_id, loan_type, rate, points, lender, quoted_on, note) VALUES (:u, :t, :r, :p, :l, :d, :n)");
        $stmt->execute([
            ':u' => $userId, ':t' => $type, ':r' => round((float)$rate, 3),
            ':p' => ($points === null || $points === '') ? null : round((float)$points, 3),
            ':l' => substr(trim((string)($data['lender'] ?? '')), 0, 80),
            ':d' => $quotedOn,
            ':n' => substr(trim((string)($data['note'] ?? '')), 0, 300),
        ]);
        echo json_encode(['success' => true, 'id' => (int)$pdo->lastInsertId()]);
    } catch (Throwable $t) {
        logEvent($pdo, 'rates', 'error', 'handleSaveRateQuote failed: ' . $t->getMessage());
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => clientErrorMessage($t)]);
    }
}

function handleDeleteRateQuote(PDO $pdo) {
    try {
        ensureRatesTables($pdo);
        $data = json_decode(dibsRequestBody(), true) ?: [];
        $stmt = $pdo->prepare("DELETE FROM rate_quotes WHERE id = :id AND user_id = :u");
        $stmt->execute([':id' => (int)($data['id'] ?? 0), ':u' => (int)($_SESSION['user_id'] ?? 0)]);
        echo json_encode(['success' => $stmt->rowCount() > 0]);
    } catch (Throwable $t) {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => clientErrorMessage($t)]);
    }
}

function rateQuoteError(string $msg) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => $msg]);
}
