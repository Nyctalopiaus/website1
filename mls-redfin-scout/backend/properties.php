<?php
/**
 * MLS & Redfin Property Scout - Property Data Pipeline
 * Listing list/sync/update/delete, deep-scrape status, and local photo caching. Requires
 * backend/bootstrap.php to already be included (uses $pdo and MEDIA_DIR set up there).
 */

/**
 * Guards against a specific bad response Matrix's media host sometimes returns for the
 * *first* photo slot: HTTP 200, Content-Type reported as an "image/*" type, but a body that's
 * actually a tiny CoreLogic UI icon (an SVG, saved with a .jpg extension since the content-type
 * check alone let it through). A real listing photo is always a multi-KB binary image and never
 * starts with '<' — SVG/XML/HTML error bodies do. Used both when accepting a fresh download and
 * when deciding whether an already-cached file on disk is trustworthy enough to skip re-fetching.
 */
function looksLikeRealPhotoBody(string $body): bool {
    if (strlen($body) < 1024) return false;
    $prefix = ltrim(substr($body, 0, 16));
    if ($prefix === '' || $prefix[0] === '<') return false;
    $imageInfo = @getimagesizefromstring($body);
    return $imageInfo !== false && $imageInfo[0] >= 100 && $imageInfo[1] >= 100;
}

function hasUsableCachedPhoto(string $relativeUrl): bool {
    if (strpos($relativeUrl, 'media/') !== 0) return false;
    $path = MEDIA_DIR . '/' . basename($relativeUrl);
    if (!is_file($path) || @filesize($path) < 1024) return false;
    $imageInfo = @getimagesize($path);
    return $imageInfo !== false && $imageInfo[0] >= 100 && $imageInfo[1] >= 100;
}

function requireScrapeToken(PDO $pdo): void {
    $token = trim((string)($_SERVER['HTTP_X_SCOUT_TOKEN'] ?? ''));
    if ($token === '') {
        http_response_code(401);
        echo json_encode(['error' => 'A valid scrape token is required.']);
        exit;
    }

    $stmt = $pdo->prepare('SELECT user_id FROM scrape_tokens WHERE token_hash = :token_hash AND expires_at > CURRENT_TIMESTAMP LIMIT 1');
    $stmt->execute([':token_hash' => hash('sha256', $token)]);
    $userId = $stmt->fetchColumn();
    if (!$userId) {
        http_response_code(401);
        echo json_encode(['error' => 'The scrape token is invalid or expired.']);
        exit;
    }

    $GLOBALS['scrape_token_user_id'] = (int)$userId;
}

function getScrapeTokenUsername(PDO $pdo): ?string {
    $userId = (int)($GLOBALS['scrape_token_user_id'] ?? 0);
    if ($userId <= 0) return null;
    $stmt = $pdo->prepare('SELECT username FROM users WHERE id = :user_id LIMIT 1');
    $stmt->execute([':user_id' => $userId]);
    $username = $stmt->fetchColumn();
    return $username === false ? null : (string)$username;
}

function recordScrapeRunEvent(PDO $pdo, string $message, $context): void {
    $userId = (int)($GLOBALS['scrape_token_user_id'] ?? 0);
    if ($userId <= 0) return;
    $metrics = is_array($context) ? $context : [];
    if ($message === 'Deep scrape started') {
        $pdo->prepare("UPDATE scrape_runs SET status = 'interrupted', completed_at = CURRENT_TIMESTAMP, error_message = 'A newer scrape began before this run completed.' WHERE initiated_by_user_id = :user_id AND status = 'running'")
            ->execute([':user_id' => $userId]);
        $pdo->prepare("INSERT INTO scrape_runs (initiated_by_user_id, status, metrics_json) VALUES (:user_id, 'running', :metrics)")
            ->execute([':user_id' => $userId, ':metrics' => json_encode($metrics, JSON_INVALID_UTF8_SUBSTITUTE)]);
        return;
    }

    $status = null;
    $error = '';
    if ($message === 'Deep scrape complete') $status = 'completed';
    elseif (str_starts_with($message, 'Deep scrape crashed') || str_starts_with($message, 'Deep scrape stopped') || str_starts_with($message, 'Deep scrape aborted')) {
        $status = 'failed';
        $error = $message;
    }
    if ($status === null) return;

    $stmt = $pdo->prepare("UPDATE scrape_runs SET status = :status, completed_at = CURRENT_TIMESTAMP, metrics_json = :metrics, error_message = :error WHERE id = (SELECT id FROM scrape_runs WHERE initiated_by_user_id = :user_id AND status = 'running' ORDER BY id DESC LIMIT 1)");
    $stmt->execute([':status' => $status, ':metrics' => json_encode($metrics, JSON_INVALID_UTF8_SUBSTITUTE), ':error' => $error, ':user_id' => $userId]);
}

function handleGetScrapeRuns(PDO $pdo) {
    $stmt = $pdo->query("SELECT sr.id, sr.status, sr.started_at, sr.completed_at, sr.metrics_json, sr.error_message, u.username AS initiated_by FROM scrape_runs sr JOIN users u ON sr.initiated_by_user_id = u.id ORDER BY sr.id DESC LIMIT 100");
    $runs = $stmt->fetchAll(PDO::FETCH_ASSOC);
    foreach ($runs as &$run) {
        $run['metrics'] = json_decode($run['metrics_json'] ?? '{}', true) ?: [];
        unset($run['metrics_json']);
    }
    echo json_encode(['success' => true, 'runs' => $runs]);
}

function repairInvalidPrimaryPreviews(PDO $pdo): void {
    $listings = $pdo->query("SELECT mls_id, main_image_url, gallery_images FROM properties WHERE main_image_url LIKE 'media/%'");
    $update = $pdo->prepare("UPDATE properties SET main_image_url = :url, updated_at = CURRENT_TIMESTAMP WHERE mls_id = :mls_id");

    while ($listing = $listings->fetch(PDO::FETCH_ASSOC)) {
        if (hasUsableCachedPhoto((string)$listing['main_image_url'])) continue;

        $gallery = json_decode($listing['gallery_images'] ?? '[]', true);
        if (!is_array($gallery)) continue;
        foreach ($gallery as $photoUrl) {
            if (is_string($photoUrl) && hasUsableCachedPhoto($photoUrl)) {
                $update->execute([':url' => $photoUrl, ':mls_id' => $listing['mls_id']]);
                break;
            }
        }
    }
}

/**
 * Host allowlist for the server-side image fetcher below. `sync`/`client_log` are intentionally
 * unauthenticated (the bookmarklet runs on matrix.recolorado.com's origin and can't carry a
 * session cookie), which means anyone can POST a sync payload — without this check, a caller
 * could supply any `main_image_url`/`gallery_images` URL (including internal/private addresses)
 * and this server would curl it and save the response under MEDIA_DIR (SSRF). Only Matrix's own
 * media/portal hosts are trusted here.
 *
 * Note: CURLOPT_FOLLOWLOCATION is still enabled below, so a malicious redirect chain starting on
 * an allowed host could theoretically hop off it — CURLOPT_MAXREDIRS keeps that bounded, but this
 * isn't a full redirect-target allowlist. Good enough for the current threat model; revisit if
 * this ever needs to be airtight.
 */
function isAllowedMediaHost(string $url): bool {
    $host = parse_url($url, PHP_URL_HOST) ?: '';
    return preg_match('/(^|\.)recolorado\.com$/i', $host) === 1;
}

/**
 * Downloads and caches listing photos locally, concurrently. Matrix's media URLs only load
 * when the requesting page's origin is matrix.recolorado.com itself (confirmed: the same URL
 * returns HTTP 200 either way, but decodes to a real image only when the Referer matches) —
 * so this dashboard can never hotlink them directly, no matter how fresh the URL is. Instead
 * we fetch the bytes here, server-side, where we control the Referer header, and save them
 * under MEDIA_DIR. Uses curl_multi so caching 50-100 listings in one sync doesn't mean
 * 50-100 sequential round trips.
 *
 * @param array<string,string> $urlsByMlsId  mls_id => original (matrixmedia) image URL
 * @return array<string,string>              mls_id => cached relative URL (e.g. "media/1532514.jpg"),
 *                                            present only for downloads that succeeded
 */
function cacheListingImages(array $urlsByMlsId): array {
    if (empty($urlsByMlsId) || !function_exists('curl_multi_init')) {
        return [];
    }

    if (!is_dir(MEDIA_DIR)) {
        mkdir(MEDIA_DIR, 0755, true);
    }

    $headers = [
        'Referer: https://matrix.recolorado.com/',
        'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
    ];

    $multi = curl_multi_init();
    $handles = [];

    foreach ($urlsByMlsId as $mlsId => $url) {
        $safeId = preg_replace('/[^A-Za-z0-9_-]/', '', (string)$mlsId);
        if ($safeId === '' || empty($url)) continue;

        if (strpos($url, '/') === 0) {
            $url = 'https://matrix.recolorado.com' . $url;
        }

        if (!isAllowedMediaHost($url)) continue;

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS => 3,
            CURLOPT_CONNECTTIMEOUT => 6,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_HTTPHEADER => $headers
        ]);
        curl_multi_add_handle($multi, $ch);
        $handles[$safeId] = $ch;
    }

    if (empty($handles)) {
        curl_multi_close($multi);
        return [];
    }

    $running = null;
    do {
        curl_multi_exec($multi, $running);
        if ($running > 0) curl_multi_select($multi);
    } while ($running > 0);

    $results = [];
    foreach ($handles as $safeId => $ch) {
        $body = curl_multi_getcontent($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE) ?: '';

        // Guard against non-image responses (and Matrix's fake-200 SVG-icon-as-.jpg response)
        if ($body !== false && $httpCode === 200 && (strpos($contentType, 'image/') === 0 || strlen($body) >= 100) && looksLikeRealPhotoBody($body)) {
            $ext = 'jpg';
            if (strpos($contentType, 'png') !== false) $ext = 'png';
            elseif (strpos($contentType, 'webp') !== false) $ext = 'webp';
            elseif (strpos($contentType, 'gif') !== false) $ext = 'gif';

            $filePath = MEDIA_DIR . '/' . $safeId . '.' . $ext;
            if (file_put_contents($filePath, $body) !== false) {
                $results[$safeId] = 'media/' . $safeId . '.' . $ext;
            }
        }

        curl_multi_remove_handle($multi, $ch);
        if (PHP_VERSION_ID < 80000) @curl_close($ch);
    }

    curl_multi_close($multi);
    return $results;
}

/**
 * Multi-photo version of cacheListingImages() for the deep-scrape gallery feature. Keys are
 * composite "mlsId::index" strings (not bare mls_id) so every photo in a listing's gallery gets
 * its own concurrent download slot and its own cache-hit check, instead of the old single-photo
 * behavior that only ever fetched (and only ever remembered) one image per listing. Files are
 * saved as "{safeId}_{index}.{ext}" — a deliberate naming change from the old "{safeId}.{ext}"
 * scheme; any image cached under the old name before this feature shipped is left in place and
 * simply treated as index 0 by the caller's glob-based cache check (see handleSync()).
 *
 * @param array<string,string> $urlsByKey  "mlsId::index" => original (matrixmedia) image URL
 * @return array<string,string>            "mlsId::index" => cached relative URL, present only
 *                                          for downloads that succeeded
 */
function cacheListingImagesMulti(array $urlsByKey): array {
    if (empty($urlsByKey) || !function_exists('curl_multi_init')) {
        return [];
    }

    if (!is_dir(MEDIA_DIR)) {
        mkdir(MEDIA_DIR, 0755, true);
    }

    $headers = [
        'Referer: https://matrix.recolorado.com/',
        'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'
    ];

    $multi = curl_multi_init();
    $handles = [];

    foreach ($urlsByKey as $key => $url) {
        if (empty($url)) continue;
        [$mlsId, $idx] = array_pad(explode('::', (string)$key, 2), 2, '0');
        $safeId = preg_replace('/[^A-Za-z0-9_-]/', '', (string)$mlsId);
        $safeIdx = preg_replace('/[^0-9]/', '', (string)$idx);
        if ($safeId === '') continue;
        $safeKey = $safeId . '::' . ($safeIdx === '' ? '0' : $safeIdx);

        if (strpos($url, '/') === 0) {
            $url = 'https://matrix.recolorado.com' . $url;
        }

        if (!isAllowedMediaHost($url)) continue;

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS => 3,
            CURLOPT_CONNECTTIMEOUT => 6,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_SSL_VERIFYPEER => true,
            CURLOPT_HTTPHEADER => $headers
        ]);
        curl_multi_add_handle($multi, $ch);
        $handles[$safeKey] = $ch;
    }

    if (empty($handles)) {
        curl_multi_close($multi);
        return [];
    }

    $running = null;
    do {
        curl_multi_exec($multi, $running);
        if ($running > 0) curl_multi_select($multi);
    } while ($running > 0);

    $results = [];
    foreach ($handles as $safeKey => $ch) {
        $body = curl_multi_getcontent($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE) ?: '';

        if ($body !== false && $httpCode === 200 && (strpos($contentType, 'image/') === 0 || strlen($body) >= 100) && looksLikeRealPhotoBody($body)) {
            $ext = 'jpg';
            if (strpos($contentType, 'png') !== false) $ext = 'png';
            elseif (strpos($contentType, 'webp') !== false) $ext = 'webp';
            elseif (strpos($contentType, 'gif') !== false) $ext = 'gif';

            [$safeId, $safeIdx] = explode('::', $safeKey, 2);
            $fileName = $safeId . '_' . $safeIdx . '.' . $ext;
            $filePath = MEDIA_DIR . '/' . $fileName;
            if (file_put_contents($filePath, $body) !== false) {
                $results[$safeKey] = 'media/' . $fileName;
            }
        }

        curl_multi_remove_handle($multi, $ch);
        if (PHP_VERSION_ID < 80000) @curl_close($ch);
    }

    curl_multi_close($multi);
    return $results;
}

function handleList(PDO $pdo) {
    try {
        repairInvalidPrimaryPreviews($pdo);
        $currentUserId = $_SESSION['user_id'] ?? null;
        if (!$currentUserId && isset($_GET['user_id'])) {
            $currentUserId = (int)$_GET['user_id'];
        }
        if (!$currentUserId && isset($_GET['username'])) {
            $stmtUser = $pdo->prepare("SELECT id FROM users WHERE username = :un");
            $stmtUser->execute([':un' => $_GET['username']]);
            $currentUserId = $stmtUser->fetchColumn() ?: null;
        }
        if (!$currentUserId) {
            $currentUserId = $pdo->query("SELECT id FROM users WHERE username = 'jhankins'")->fetchColumn();
            if (!$currentUserId) {
                $currentUserId = $pdo->query("SELECT id FROM users ORDER BY id ASC LIMIT 1")->fetchColumn() ?: 0;
            }
        }
        $currentUserId = (int)$currentUserId;

        $stmt = $pdo->prepare("
            SELECT
                p.*,
                r.redfin_url, r.redfin_estimate, r.walk_score, r.transit_score, r.bike_score,
                r.price_per_sqft, r.days_on_redfin, r.climate_risk_json, r.school_ratings_json, r.raw_redfin_json,
                COALESCE(u.favorite, 0) as favorite,
                COALESCE(u.hidden, 0) as hidden,
                COALESCE(u.rating, 0) as rating,
                COALESCE(u.user_notes, '') as user_notes,
                COALESCE(u.realtor_notes, '') as realtor_notes,
                COALESCE(u.tags_json, '[]') as tags_json,
                COALESCE(u.shared_with_realtor, 0) as shared_with_realtor
            FROM properties p
            LEFT JOIN redfin_data r ON p.mls_id = r.mls_id
            LEFT JOIN user_metadata u ON p.mls_id = u.mls_id AND u.user_id = :user_id
            LEFT JOIN property_visibility v ON p.mls_id = v.mls_id
            WHERE COALESCE(v.is_hidden, 0) = 0
            ORDER BY p.updated_at DESC
        ");
        $stmt->execute([':user_id' => $currentUserId]);
        $rows = $stmt->fetchAll();

        foreach ($rows as &$row) {
            $row['gallery_images'] = json_decode($row['gallery_images'] ?? '[]', true) ?: [];
            $row['climate_risk_json'] = json_decode($row['climate_risk_json'] ?? '{}', true) ?: [];
            $row['school_ratings_json'] = json_decode($row['school_ratings_json'] ?? '[]', true) ?: [];
            $row['tags_json'] = json_decode($row['tags_json'] ?? '[]', true) ?: [];
            $row['price'] = (float)$row['price'];
            $row['beds'] = (int)$row['beds'];
            $row['baths'] = (float)$row['baths'];
            $row['sqft_total'] = (int)$row['sqft_total'];
            $row['sqft_finished'] = (int)$row['sqft_finished'];
            $row['lot_sqft'] = (int)$row['lot_sqft'];
            $row['lot_acres'] = (float)$row['lot_acres'];
            $row['year_built'] = (int)$row['year_built'];
            $row['hoa_fee'] = (float)$row['hoa_fee'];
            $row['annual_tax'] = (float)$row['annual_tax'];
            $row['favorite'] = (int)$row['favorite'];
            $row['hidden'] = (int)$row['hidden'];
            $row['shared_with_realtor'] = (int)$row['shared_with_realtor'];
            $row['raw_mls_json'] = json_decode($row['raw_mls_json'] ?? '{}', true) ?: null;
        }

        $json = json_encode(['success' => true, 'properties' => $rows], JSON_INVALID_UTF8_SUBSTITUTE);
        if ($json === false) {
            echo json_encode(['success' => false, 'error' => 'json_encode_error: ' . json_last_error_msg()]);
        } else {
            echo $json;
        }
    } catch (Throwable $t) {
        http_response_code(500);
        logEvent($pdo, 'system', 'error', 'handleList failed: ' . $t->getMessage(), null, ['file' => $t->getFile(), 'line' => $t->getLine()]);
        echo json_encode(['success' => false, 'error' => clientErrorMessage($t)]);
    }
}

function handleListGlobalPropertyVisibility(PDO $pdo) {
    $stmt = $pdo->query("
         SELECT p.mls_id, p.address, p.city, p.state, p.zip, p.price, p.status,
             v.is_hidden, COALESCE(v.lifecycle_status, 'active') AS lifecycle_status, COALESCE(v.hidden_reason, '') AS hidden_reason,
               v.hidden_at, u.username AS hidden_by
        FROM properties p
        LEFT JOIN property_visibility v ON p.mls_id = v.mls_id
        LEFT JOIN users u ON v.hidden_by_user_id = u.id
        ORDER BY COALESCE(v.is_hidden, 0) DESC, p.updated_at DESC
    ");
    echo json_encode(['success' => true, 'properties' => $stmt->fetchAll()]);
}

function recordPropertyActivity(PDO $pdo, string $mlsId, string $activityType, string $visibility, string $message, array $details = [], ?int $subjectUserId = null): void {
    $stmt = $pdo->prepare('INSERT INTO property_activity (mls_id, actor_user_id, subject_user_id, activity_type, visibility, message, details_json) VALUES (:mls_id, :actor_user_id, :subject_user_id, :activity_type, :visibility, :message, :details_json)');
    $stmt->execute([
        ':mls_id' => $mlsId,
        ':actor_user_id' => $_SESSION['user_id'] ?? ($GLOBALS['scrape_token_user_id'] ?? null),
        ':subject_user_id' => $subjectUserId,
        ':activity_type' => $activityType,
        ':visibility' => $visibility,
        ':message' => $message,
        ':details_json' => $details ? json_encode($details, JSON_INVALID_UTF8_SUBSTITUTE) : null
    ]);
}

function handleGetPropertyActivity(PDO $pdo) {
    $mlsId = trim((string)($_GET['mls_id'] ?? ''));
    if ($mlsId === '') {
        http_response_code(400);
        echo json_encode(['error' => 'A property is required.']);
        return;
    }
    $role = $_SESSION['role'] ?? 'client';
    $isAdmin = !empty($_SESSION['is_admin']) || $role === 'admin';
    if ($isAdmin) {
        $stmt = $pdo->prepare("SELECT a.id, a.activity_type, a.visibility, a.message, a.created_at, u.username AS actor_username FROM property_activity a LEFT JOIN users u ON a.actor_user_id = u.id WHERE a.mls_id = :mls_id ORDER BY a.created_at DESC, a.id DESC LIMIT 100");
        $stmt->execute([':mls_id' => $mlsId]);
    } elseif ($role === 'realtor') {
        $stmt = $pdo->prepare("SELECT a.id, a.activity_type, a.visibility, a.message, a.created_at, u.username AS actor_username FROM property_activity a LEFT JOIN users u ON a.actor_user_id = u.id WHERE a.mls_id = :mls_id AND (a.visibility IN ('public', 'realtor') OR (a.visibility = 'shared' AND a.subject_user_id IN (SELECT id FROM users WHERE realtor_id = :realtor_id))) ORDER BY a.created_at DESC, a.id DESC LIMIT 100");
        $stmt->execute([':mls_id' => $mlsId, ':realtor_id' => (int)$_SESSION['user_id']]);
    } else {
        $stmt = $pdo->prepare("SELECT a.id, a.activity_type, a.visibility, a.message, a.created_at, u.username AS actor_username FROM property_activity a LEFT JOIN users u ON a.actor_user_id = u.id WHERE a.mls_id = :mls_id AND (a.visibility = 'public' OR (a.visibility = 'shared' AND a.subject_user_id = :user_id)) ORDER BY a.created_at DESC, a.id DESC LIMIT 100");
        $stmt->execute([':mls_id' => $mlsId, ':user_id' => (int)$_SESSION['user_id']]);
    }
    echo json_encode(['success' => true, 'activity' => $stmt->fetchAll()]);
}

function handleUpdateGlobalPropertyVisibility(PDO $pdo) {
    $input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
    $mlsId = trim((string)($input['mls_id'] ?? ''));
    $isHidden = !empty($input['is_hidden']) ? 1 : 0;
    $reason = trim((string)($input['reason'] ?? ''));
    $lifecycleStatus = strtolower(trim((string)($input['lifecycle_status'] ?? ($isHidden ? 'archived' : 'active'))));
    $allowedStatuses = ['active', 'under_contract', 'sold', 'withdrawn', 'archived'];

    if ($mlsId === '') {
        http_response_code(400);
        echo json_encode(['error' => 'A property is required.']);
        return;
    }
    if (!in_array($lifecycleStatus, $allowedStatuses, true)) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid lifecycle status.']);
        return;
    }

    $exists = $pdo->prepare('SELECT 1 FROM properties WHERE mls_id = :mls_id');
    $exists->execute([':mls_id' => $mlsId]);
    if (!$exists->fetchColumn()) {
        http_response_code(404);
        echo json_encode(['error' => 'Property not found.']);
        return;
    }

    if ($isHidden) {
        $stmt = $pdo->prepare('INSERT INTO property_visibility (mls_id, is_hidden, lifecycle_status, hidden_reason, hidden_by_user_id, hidden_at) VALUES (:mls_id, 1, :lifecycle_status, :reason, :user_id, CURRENT_TIMESTAMP) ON CONFLICT(mls_id) DO UPDATE SET is_hidden = 1, lifecycle_status = excluded.lifecycle_status, hidden_reason = excluded.hidden_reason, hidden_by_user_id = excluded.hidden_by_user_id, hidden_at = CURRENT_TIMESTAMP');
        $stmt->execute([':mls_id' => $mlsId, ':lifecycle_status' => $lifecycleStatus, ':reason' => $reason, ':user_id' => (int)$_SESSION['user_id']]);
        $statusLabel = ucwords(str_replace('_', ' ', $lifecycleStatus));
        recordPropertyActivity($pdo, $mlsId, 'lifecycle_updated', 'public', "Listing marked $statusLabel and removed from active views.", ['lifecycle_status' => $lifecycleStatus]);
        if ($reason !== '') {
            recordPropertyActivity($pdo, $mlsId, 'lifecycle_reason', 'realtor', 'Internal lifecycle reason recorded.', ['reason' => $reason]);
        }
        logEvent($pdo, 'system', 'info', 'Property globally hidden by realtor', $mlsId, ['lifecycle_status' => $lifecycleStatus, 'reason' => $reason]);
    } else {
        $stmt = $pdo->prepare("UPDATE property_visibility SET is_hidden = 0, lifecycle_status = 'active', hidden_reason = '', hidden_by_user_id = NULL, hidden_at = NULL WHERE mls_id = :mls_id");
        $stmt->execute([':mls_id' => $mlsId]);
        recordPropertyActivity($pdo, $mlsId, 'lifecycle_restored', 'public', 'Listing restored to active views.', ['lifecycle_status' => 'active']);
        logEvent($pdo, 'system', 'info', 'Property restored to all users by realtor', $mlsId);
    }

    echo json_encode(['success' => true, 'mls_id' => $mlsId, 'is_hidden' => (bool)$isHidden]);
}

function handleSync(PDO $pdo) {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);

    if (!$data && isset($_POST['payload'])) {
        $data = json_decode($_POST['payload'], true);
    }

    if (!$data) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid JSON payload']);
        exit;
    }

    $properties = isset($data['properties']) ? $data['properties'] : [$data];

    // Loose abuse guard: this endpoint is intentionally unauthenticated (the bookmarklet can't
    // carry a session cookie from matrix.recolorado.com's origin), so cap batch size rather than
    // trust an anonymous caller's payload to stay reasonable. A real deep-scrape run tops out
    // around a few dozen listings; 300 leaves generous headroom without being unbounded.
    if (is_array($properties) && count($properties) > 300) {
        logEvent($pdo, 'sync', 'warn', 'Sync payload rejected: too many items', null, ['count' => count($properties)]);
        http_response_code(413);
        echo json_encode(['error' => 'Too many items in one sync request']);
        exit;
    }

    $syncedCount = 0;
    $skippedCount = 0;

    try {

    $stmtProp = $pdo->prepare("
        INSERT INTO properties (
            mls_id, address, city, state, zip, price, status, beds, baths, levels,
            sqft_total, sqft_finished, lot_sqft, lot_acres, year_built, property_type,
            school_district, parking_total, garage_spaces, hoa_exists, hoa_fee,
            annual_tax, tax_year, list_date, mls_url, main_image_url, gallery_images,
            raw_mls_json, latitude, longitude, full_scrape_completed_at, price_checked_at, updated_at
        ) VALUES (
            :mls_id, :address, :city, :state, :zip, :price, :status, :beds, :baths, :levels,
            :sqft_total, :sqft_finished, :lot_sqft, :lot_acres, :year_built, :property_type,
            :school_district, :parking_total, :garage_spaces, :hoa_exists, :hoa_fee,
            :annual_tax, :tax_year, :list_date, :mls_url, :main_image_url, :gallery_images,
            :raw_mls_json, :latitude, :longitude, :full_scrape_completed_at, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        )
        ON CONFLICT(mls_id) DO UPDATE SET
            address = excluded.address,
            city = excluded.city,
            state = excluded.state,
            zip = excluded.zip,
            price = excluded.price,
            status = excluded.status,
            beds = excluded.beds,
            baths = excluded.baths,
            levels = excluded.levels,
            sqft_total = excluded.sqft_total,
            sqft_finished = excluded.sqft_finished,
            lot_sqft = excluded.lot_sqft,
            lot_acres = excluded.lot_acres,
            year_built = excluded.year_built,
            property_type = excluded.property_type,
            school_district = excluded.school_district,
            parking_total = excluded.parking_total,
            garage_spaces = excluded.garage_spaces,
            hoa_exists = excluded.hoa_exists,
            hoa_fee = excluded.hoa_fee,
            annual_tax = excluded.annual_tax,
            tax_year = excluded.tax_year,
            list_date = excluded.list_date,
            mls_url = excluded.mls_url,
            main_image_url = excluded.main_image_url,
            gallery_images = excluded.gallery_images,
            raw_mls_json = excluded.raw_mls_json,
            latitude = COALESCE(excluded.latitude, properties.latitude),
            longitude = COALESCE(excluded.longitude, properties.longitude),
            full_scrape_completed_at = COALESCE(excluded.full_scrape_completed_at, properties.full_scrape_completed_at),
            price_checked_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
    ");

    $stmtRedfin = $pdo->prepare("
        INSERT INTO redfin_data (
            mls_id, redfin_url, redfin_estimate, walk_score, transit_score, bike_score,
            price_per_sqft, days_on_redfin, climate_risk_json, school_ratings_json,
            raw_redfin_json, updated_at
        ) VALUES (
            :mls_id, :redfin_url, :redfin_estimate, :walk_score, :transit_score, :bike_score,
            :price_per_sqft, :days_on_redfin, :climate_risk_json, :school_ratings_json,
            :raw_redfin_json, CURRENT_TIMESTAMP
        )
        ON CONFLICT(mls_id) DO UPDATE SET
            redfin_url = COALESCE(excluded.redfin_url, redfin_url),
            redfin_estimate = COALESCE(excluded.redfin_estimate, redfin_estimate),
            walk_score = COALESCE(excluded.walk_score, walk_score),
            transit_score = COALESCE(excluded.transit_score, transit_score),
            bike_score = COALESCE(excluded.bike_score, bike_score),
            price_per_sqft = COALESCE(excluded.price_per_sqft, price_per_sqft),
            days_on_redfin = COALESCE(excluded.days_on_redfin, days_on_redfin),
            climate_risk_json = COALESCE(excluded.climate_risk_json, climate_risk_json),
            school_ratings_json = COALESCE(excluded.school_ratings_json, school_ratings_json),
            raw_redfin_json = COALESCE(excluded.raw_redfin_json, raw_redfin_json),
            updated_at = CURRENT_TIMESTAMP
    ");

    // Resolve target user account for imported matrix review statuses and notes
    $syncUsername = trim($data['username'] ?? $data['target_username'] ?? '');
    $targetUserId = null;
    if (!empty($syncUsername)) {
        $stmtFindUser = $pdo->prepare("SELECT id FROM users WHERE username = :un");
        $stmtFindUser->execute([':un' => $syncUsername]);
        $targetUserId = $stmtFindUser->fetchColumn() ?: null;
    }
    if (!$targetUserId && !empty($data['target_user_id'])) {
        $targetUserId = (int)$data['target_user_id'];
    }
    if (!$targetUserId && !empty($_SESSION['user_id'])) {
        $targetUserId = (int)$_SESSION['user_id'];
    }
    if (!$targetUserId) {
        $targetUserId = $pdo->query("SELECT id FROM users WHERE username = 'jhankins'")->fetchColumn();
        if (!$targetUserId) {
            $targetUserId = $pdo->query("SELECT id FROM users ORDER BY id ASC LIMIT 1")->fetchColumn() ?: 1;
        }
        $targetUserId = (int)$targetUserId;
    }

    $stmtUserMetaInit = $pdo->prepare("
        INSERT OR IGNORE INTO user_metadata (user_id, mls_id) VALUES (:user_id, :mls_id)
    ");

    foreach ($properties as $item) {
        $mlsId = trim($item['mls_id'] ?? '');
        if (empty($mlsId)) {
            $skippedCount++;
            logEvent($pdo, 'sync', 'warn', 'Skipped sync item with missing mls_id', null, $item);
            continue;
        }

        $sharedMlsData = $item;
        unset($sharedMlsData['matrix_review_status'], $sharedMlsData['portal_notes']);
        $incomingStatus = trim((string)($item['status'] ?? 'Active'));
        $existingPropertyStmt = $pdo->prepare('SELECT status FROM properties WHERE mls_id = :mls_id');
        $existingPropertyStmt->execute([':mls_id' => $mlsId]);
        $existingStatus = $existingPropertyStmt->fetchColumn();
        $isNewProperty = $existingStatus === false;

        // Upsert MLS property details if present
        if (isset($item['address']) || isset($item['price'])) {
            $stmtProp->execute([
                ':mls_id' => $mlsId,
                ':address' => $item['address'] ?? '',
                ':city' => $item['city'] ?? '',
                ':state' => $item['state'] ?? 'CO',
                ':zip' => $item['zip'] ?? '',
                ':price' => (float)($item['price'] ?? 0),
                ':status' => $item['status'] ?? 'Active',
                ':beds' => (int)($item['beds'] ?? 0),
                ':baths' => (float)($item['baths'] ?? 0),
                ':levels' => $item['levels'] ?? '',
                ':sqft_total' => (int)($item['sqft_total'] ?? 0),
                ':sqft_finished' => (int)($item['sqft_finished'] ?? 0),
                ':lot_sqft' => (int)($item['lot_sqft'] ?? 0),
                ':lot_acres' => (float)($item['lot_acres'] ?? 0),
                ':year_built' => (int)($item['year_built'] ?? 0),
                ':property_type' => $item['property_type'] ?? '',
                ':school_district' => $item['school_district'] ?? '',
                ':parking_total' => (int)($item['parking_total'] ?? 0),
                ':garage_spaces' => (int)($item['garage_spaces'] ?? 0),
                ':hoa_exists' => isset($item['hoa_fee']) && $item['hoa_fee'] > 0 ? 1 : 0,
                ':hoa_fee' => (float)($item['hoa_fee'] ?? 0),
                ':annual_tax' => (float)($item['annual_tax'] ?? 0),
                ':tax_year' => (int)($item['tax_year'] ?? date('Y')),
                ':list_date' => $item['list_date'] ?? date('Y-m-d'),
                ':mls_url' => $item['mls_url'] ?? '',
                ':main_image_url' => $item['main_image_url'] ?? '',
                ':gallery_images' => json_encode($item['gallery_images'] ?? [], JSON_INVALID_UTF8_SUBSTITUTE),
                ':raw_mls_json' => json_encode($sharedMlsData, JSON_INVALID_UTF8_SUBSTITUTE),
                ':latitude' => (isset($item['latitude']) && (float)$item['latitude'] >= 24 && (float)$item['latitude'] <= 50) ? (float)$item['latitude'] : null,
                ':longitude' => (isset($item['longitude']) && (float)$item['longitude'] >= -125 && (float)$item['longitude'] <= -65) ? (float)$item['longitude'] : null,
                ':full_scrape_completed_at' => !empty($item['full_scrape']) ? date('Y-m-d H:i:s') : null
            ]);
            $syncedCount++;
            if ($isNewProperty) {
                recordPropertyActivity($pdo, $mlsId, 'listing_imported', 'public', 'Listing added from Matrix MLS.');
            } elseif (strcasecmp(trim((string)$existingStatus), $incomingStatus) !== 0) {
                recordPropertyActivity($pdo, $mlsId, 'listing_status_changed', 'public', "MLS status changed from " . trim((string)$existingStatus) . " to $incomingStatus.", ['previous_status' => $existingStatus, 'status' => $incomingStatus]);
            }
        }

        // Upsert Redfin data if present
        if (isset($item['redfin_url']) || isset($item['walk_score']) || isset($item['redfin_estimate'])) {
            $stmtRedfin->execute([
                ':mls_id' => $mlsId,
                ':redfin_url' => $item['redfin_url'] ?? null,
                ':redfin_estimate' => isset($item['redfin_estimate']) ? (float)$item['redfin_estimate'] : null,
                ':walk_score' => isset($item['walk_score']) ? (int)$item['walk_score'] : null,
                ':transit_score' => isset($item['transit_score']) ? (int)$item['transit_score'] : null,
                ':bike_score' => isset($item['bike_score']) ? (int)$item['bike_score'] : null,
                ':price_per_sqft' => isset($item['price_per_sqft']) ? (float)$item['price_per_sqft'] : null,
                ':days_on_redfin' => isset($item['days_on_redfin']) ? (int)$item['days_on_redfin'] : null,
                ':climate_risk_json' => isset($item['climate_risk']) ? json_encode($item['climate_risk'], JSON_INVALID_UTF8_SUBSTITUTE) : null,
                ':school_ratings_json' => isset($item['school_ratings']) ? json_encode($item['school_ratings'], JSON_INVALID_UTF8_SUBSTITUTE) : null,
                ':raw_redfin_json' => json_encode($item['raw_redfin'] ?? $item, JSON_INVALID_UTF8_SUBSTITUTE)
            ]);
        }

        // Initialize user metadata record for target user and sync matrix portal review status/notes
        $matrixReview = $item['matrix_review_status'] ?? 'none';
        $portalNotes = trim($item['portal_notes'] ?? '');

        $stmtUserMetaInit->execute([':user_id' => $targetUserId, ':mls_id' => $mlsId]);

        $updateParts = [];
        $updateParams = [':user_id' => $targetUserId, ':mls_id' => $mlsId];

        if ($matrixReview === 'dislike') {
            $updateParts[] = "hidden = 1";
            $updateParts[] = "favorite = 0";
        } else if ($matrixReview === 'favorite') {
            $updateParts[] = "favorite = 1";
            $updateParts[] = "hidden = 0";
        } else if ($matrixReview === 'possibility') {
            $updateParts[] = "rating = 3";
            $updateParts[] = "hidden = 0";
            $updateParts[] = "favorite = 0";
        } else if ($matrixReview === 'none') {
            $updateParts[] = "favorite = 0";
            $updateParts[] = "hidden = 0";
        }

        if ($portalNotes !== '') {
            $updateParts[] = "user_notes = :user_notes";
            $updateParams[':user_notes'] = $portalNotes;
        }

        if (!empty($updateParts)) {
            $updateParts[] = "updated_at = CURRENT_TIMESTAMP";
            $sqlUser = "UPDATE user_metadata SET " . implode(', ', $updateParts) . " WHERE user_id = :user_id AND mls_id = :mls_id";
            $pdo->prepare($sqlUser)->execute($updateParams);
        }
    }

    // Cache listing photos locally (see cacheListingImagesMulti()). Each item may carry a full
    // gallery_images array (deep-scrape payloads) or just a single main_image_url (regular
    // refresh payloads); either way we cache every photo we haven't already cached, keyed by
    // "mlsId::index" so a gallery of N photos gets N independent cache-hit checks instead of
    // collapsing to one image per listing like the old single-photo logic did. An mls_id whose
    // index-0 photo was cached under the pre-gallery naming scheme ("{safeId}.ext", no "_0"
    // suffix) is recognized as already-cached for index 0 so existing cached images aren't
    // re-downloaded after this upgrade.
    $photoFetchJobs = [];      // "mlsId::idx" => remote url, for photos not yet cached
    $existingByMls = [];       // mls_id => [idx => local relative url, ...] already on disk
    foreach ($properties as $item) {
        $mlsId = trim($item['mls_id'] ?? '');
        if (empty($mlsId)) continue;

        $safeId = preg_replace('/[^A-Za-z0-9_-]/', '', $mlsId);
        if ($safeId === '') continue;

        $hasExplicitGallery = isset($item['gallery_images']) && is_array($item['gallery_images']) && !empty($item['gallery_images']);

        if ($hasExplicitGallery) {
            // Deep-scrape payload: the sent gallery is authoritative for this listing.
            foreach (array_values($item['gallery_images']) as $idx => $url) {
                if (empty($url)) continue;

                $existing = glob(MEDIA_DIR . '/' . $safeId . '_' . $idx . '.*');
                if (!$existing && $idx === 0) {
                    // Legacy pre-gallery filename, no "_0" suffix.
                    $existing = glob(MEDIA_DIR . '/' . $safeId . '.*');
                }

                // A cached file only counts as a cache hit if it's a real photo — a previous
                // sync may have cached Matrix's fake-200 SVG-icon response for this slot (see
                // looksLikeRealPhotoBody()), and without this check that bad file would be
                // treated as "already have it" forever, even across a fresh deep scrape with
                // the correct URL in hand.
                if ($existing && @filesize($existing[0]) >= 1024) {
                    $existingByMls[$mlsId][$idx] = 'media/' . basename($existing[0]);
                    continue;
                }

                $photoFetchJobs[$mlsId . '::' . $idx] = $url;
            }
        } else {
            // Regular refresh payload (no gallery_images sent): never shrink a gallery a prior
            // deep scrape already built. Preserve every photo already cached on disk for this
            // mls_id, and only fetch index 0 (main_image_url) if it isn't cached yet.
            foreach (glob(MEDIA_DIR . '/' . $safeId . '_*.*') as $path) {
                if (preg_match('/_(\d+)\.[^.]+$/', $path, $m) && @filesize($path) >= 1024) {
                    $existingByMls[$mlsId][(int)$m[1]] = 'media/' . basename($path);
                }
            }
            if (empty($existingByMls[$mlsId])) {
                $legacy = glob(MEDIA_DIR . '/' . $safeId . '.*');
                if ($legacy && @filesize($legacy[0]) >= 1024) {
                    $existingByMls[$mlsId][0] = 'media/' . basename($legacy[0]);
                }
            }

            $mainUrl = $item['main_image_url'] ?? '';
            if (!empty($mainUrl) && empty($existingByMls[$mlsId][0])) {
                $photoFetchJobs[$mlsId . '::0'] = $mainUrl;
            }
        }
    }

    $newlyCached = empty($photoFetchJobs) ? [] : cacheListingImagesMulti($photoFetchJobs);

    // Merge freshly-downloaded photos with whatever was already on disk, then write back
    // main_image_url (index 0), the full gallery array, and photo_count for each listing that
    // has at least one cached photo.
    $byMls = $existingByMls;
    foreach ($newlyCached as $key => $localUrl) {
        [$mlsId, $idx] = explode('::', $key, 2);
        $byMls[$mlsId][(int)$idx] = $localUrl;
    }

    if (!empty($byMls)) {
        $stmtImg = $pdo->prepare("UPDATE properties SET main_image_url = :url, gallery_images = :gallery, photo_count = :count WHERE mls_id = :mls_id");
        foreach ($byMls as $cachedMlsId => $photosByIdx) {
            ksort($photosByIdx);
            $galleryUrls = array_values($photosByIdx);
            $stmtImg->execute([
                ':url' => $galleryUrls[0],
                ':gallery' => json_encode($galleryUrls, JSON_INVALID_UTF8_SUBSTITUTE),
                ':count' => count($galleryUrls),
                ':mls_id' => $cachedMlsId
            ]);
        }
    }

        $syncUser = getScrapeTokenUsername($pdo) ?? ($_SESSION['username'] ?? null);
        logEvent($pdo, 'scrape', 'info', "Scrape sync batch complete: {$syncedCount} property listing(s) ingested from Matrix", null, ['total_items' => count($properties)], $syncUser);
        logEvent($pdo, 'sync', 'info', "Sync batch complete: {$syncedCount} synced, {$skippedCount} skipped", null, ['total_items' => count($properties)], $syncUser);

        echo json_encode(['success' => true, 'synced_count' => $syncedCount]);
    } catch (Throwable $t) {
        http_response_code(500);
        $syncUser = getScrapeTokenUsername($pdo) ?? ($_SESSION['username'] ?? null);
        logEvent($pdo, 'sync', 'error', 'handleSync failed: ' . $t->getMessage(), null, ['file' => $t->getFile(), 'line' => $t->getLine()], $syncUser);
        echo json_encode(['success' => false, 'error' => clientErrorMessage($t)]);
    }
}

/**
 * Powers the deep-scrape bookmarklet's dedupe check: it asks this once at the start of a run so
 * it can skip the expensive detail+photo walk for listings already fully captured, while still
 * always re-checking notes for every listing regardless of this list (per product decision — the
 * agent may add her own notes at any time, unlike beds/baths/photos which are effectively static).
 * No auth required, matching 'sync' — the bookmarklet calls this unauthenticated from the MLS
 * portal page, same as it POSTs sync payloads.
 */
function handleScrapeStatus(PDO $pdo) {
    try {
        $stmt = $pdo->query("SELECT mls_id, main_image_url FROM properties WHERE full_scrape_completed_at IS NOT NULL");
        $completed = [];
        while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
            if (hasUsableCachedPhoto((string)($row['main_image_url'] ?? ''))) {
                $completed[] = $row['mls_id'];
            }
        }
        echo json_encode(['success' => true, 'completed' => array_values($completed)]);
    } catch (Throwable $t) {
        http_response_code(500);
        logEvent($pdo, 'system', 'error', 'handleScrapeStatus failed: ' . $t->getMessage());
        echo json_encode(['success' => false, 'error' => clientErrorMessage($t)]);
    }
}

/**
 * Receives log events from the bookmarklet (source='scrape', running on the MLS portal's own
 * origin, with no persistent storage of its own) and from the main app's global error handlers
 * (source='client'). No auth required, matching 'sync'/'scrape_status' — same trust model, and
 * the bookmarklet can't carry a session cookie for a different origin anyway. Everything lands
 * in the same event_log table logEvent() writes to, so it shows up alongside sync/system events.
 */
function handleClientLog(PDO $pdo) {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true) ?? [];

    $source = in_array($data['source'] ?? '', ['scrape', 'client'], true) ? $data['source'] : 'client';
    $level = in_array($data['level'] ?? '', ['info', 'warn', 'error'], true) ? $data['level'] : 'info';
    $message = trim((string)($data['message'] ?? ''));
    $mlsId = (isset($data['mls_id']) && $data['mls_id'] !== '' && $data['mls_id'] !== null) ? (string)$data['mls_id'] : null;
    $context = $data['context'] ?? null;
    $clientUser = getScrapeTokenUsername($pdo) ?? ($_SESSION['username'] ?? null);

    if ($message === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'message is required']);
        return;
    }

    logEvent($pdo, $source, $level, $message, $mlsId, $context, $clientUser);
    if ($source === 'scrape') {
        recordScrapeRunEvent($pdo, $message, $context);
    }
    echo json_encode(['success' => true]);
}

function handleUpdateUserData(PDO $pdo) {
    requireAuth();
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    if (!$data && isset($_POST['mls_id'])) {
        $data = $_POST;
    }

    $mlsId = trim($data['mls_id'] ?? '');
    if (empty($mlsId)) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing mls_id']);
        exit;
    }

    $userId = (int)$_SESSION['user_id'];
    $role = $_SESSION['role'] ?? 'client';

    // Ensure row exists
    $pdo->prepare("INSERT OR IGNORE INTO user_metadata (user_id, mls_id) VALUES (:user_id, :mls_id)")
        ->execute([':user_id' => $userId, ':mls_id' => $mlsId]);
    $currentStmt = $pdo->prepare('SELECT favorite, hidden, rating, user_notes, realtor_notes FROM user_metadata WHERE user_id = :user_id AND mls_id = :mls_id');
    $currentStmt->execute([':user_id' => $userId, ':mls_id' => $mlsId]);
    $current = $currentStmt->fetch(PDO::FETCH_ASSOC) ?: [];
    $favoriteChanged = array_key_exists('favorite', $data) && (int)$data['favorite'] !== (int)($current['favorite'] ?? 0);
    $hiddenChanged = array_key_exists('hidden', $data) && (int)$data['hidden'] !== (int)($current['hidden'] ?? 0);
    $ratingChanged = array_key_exists('rating', $data) && (int)$data['rating'] !== (int)($current['rating'] ?? 0);
    $userNotesChanged = array_key_exists('user_notes', $data) && (string)$data['user_notes'] !== (string)($current['user_notes'] ?? '');
    $realtorNotesChanged = array_key_exists('realtor_notes', $data) && (string)$data['realtor_notes'] !== (string)($current['realtor_notes'] ?? '');

    $fields = [];
    $params = [':user_id' => $userId, ':mls_id' => $mlsId];

    if (isset($data['favorite'])) {
        $fields[] = "favorite = :favorite";
        $params[':favorite'] = (int)$data['favorite'];
    }
    if (isset($data['hidden'])) {
        $fields[] = "hidden = :hidden";
        $params[':hidden'] = (int)$data['hidden'];
    }
    if (isset($data['rating'])) {
        $fields[] = "rating = :rating";
        $params[':rating'] = (int)$data['rating'];
    }
    if (isset($data['user_notes'])) {
        $fields[] = "user_notes = :user_notes";
        $params[':user_notes'] = $data['user_notes'];
    }
    if (isset($data['realtor_notes'])) {
        $fields[] = "realtor_notes = :realtor_notes";
        $params[':realtor_notes'] = $data['realtor_notes'];
    }
    if (isset($data['tags'])) {
        $fields[] = "tags_json = :tags_json";
        $params[':tags_json'] = json_encode($data['tags']);
    }
    if (isset($data['shared_with_realtor'])) {
        $fields[] = "shared_with_realtor = :shared_with_realtor";
        $params[':shared_with_realtor'] = (int)$data['shared_with_realtor'];
    }

    if (!empty($fields)) {
        $fields[] = "updated_at = CURRENT_TIMESTAMP";
        $sql = "UPDATE user_metadata SET " . implode(', ', $fields) . " WHERE user_id = :user_id AND mls_id = :mls_id";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);

        if ($favoriteChanged) {
            recordPropertyActivity($pdo, $mlsId, 'favorite_updated', 'shared', !empty($data['favorite']) ? 'Saved as a favorite.' : 'Removed from favorites.', [], $userId);
        }
        if ($ratingChanged) {
            $rating = (int)$data['rating'];
            $message = $rating === 3 ? 'Marked as a possibility.' : ($rating > 0 ? "Updated rating to $rating out of 5." : 'Cleared property rating.');
            recordPropertyActivity($pdo, $mlsId, 'rating_updated', 'shared', $message, ['rating' => $rating], $userId);
        }
        if ($hiddenChanged) {
            recordPropertyActivity($pdo, $mlsId, 'client_visibility_updated', 'shared', !empty($data['hidden']) ? 'Marked as passed.' : 'Restored to the client list.', [], $userId);
        }
        if ($userNotesChanged) {
            recordPropertyActivity($pdo, $mlsId, 'client_note_updated', 'shared', trim((string)$data['user_notes']) === '' ? 'Cleared a personal note.' : 'Added or updated a personal note.', [], $userId);
        }
        if ($realtorNotesChanged && $role === 'client') {
            recordPropertyActivity($pdo, $mlsId, 'client_question_updated', 'shared', trim((string)$data['realtor_notes']) === '' ? 'Cleared a question for the realtor.' : 'Added or updated a question for the realtor.', [], $userId);
        }

        // Notification Triggers
        $userName = !empty($_SESSION['full_name']) ? $_SESSION['full_name'] : $_SESSION['username'];
        $assignedRealtorId = 0;
        if ($role === 'client') {
            $uStmt = $pdo->prepare("SELECT realtor_id FROM users WHERE id = :id LIMIT 1");
            $uStmt->execute([':id' => $userId]);
            $assignedRealtorId = (int)($uStmt->fetchColumn() ?: 0);
        }
        if (isset($data['realtor_notes']) && trim((string)$data['realtor_notes']) !== '' && ($role === 'realtor' || $role === 'admin')) {
            $cStmt = $pdo->prepare("SELECT id FROM users WHERE realtor_id = :realtor_id");
            $cStmt->execute([':realtor_id' => $userId]);
            $clients = $cStmt->fetchAll();
            foreach ($clients as $c) {
                createNotification(
                    $pdo,
                    (int)$c['id'],
                    'realtor_note',
                    "💬 Agent Showing Feedback Added",
                    "Realtor {$userName} added showing feedback on MLS #{$mlsId}",
                    "#detail-{$mlsId}"
                );
            }
        }
        if ($favoriteChanged && (int)$data['favorite'] === 1 && $role === 'client') {
            if ($assignedRealtorId > 0) {
                createNotification(
                    $pdo,
                    $assignedRealtorId,
                    'favorite',
                    "⭐ Client Liked Property",
                    "Client {$userName} liked property MLS #{$mlsId}",
                    "#detail-{$mlsId}"
                );
            }
        }
        if ($ratingChanged && (int)$data['rating'] === 3 && $role === 'client' && $assignedRealtorId > 0) {
            createNotification($pdo, $assignedRealtorId, 'consideration', 'Client Considering Property', "Client {$userName} marked MLS #{$mlsId} for consideration", "#detail-{$mlsId}");
        }
        if ($hiddenChanged && (int)$data['hidden'] === 1 && $role === 'client' && $assignedRealtorId > 0) {
            createNotification($pdo, $assignedRealtorId, 'passed_property', 'Client Passed on Property', "Client {$userName} passed on MLS #{$mlsId}", "#detail-{$mlsId}");
        }
        if ($realtorNotesChanged && trim((string)$data['realtor_notes']) !== '' && $role === 'client' && $assignedRealtorId > 0) {
            createNotification($pdo, $assignedRealtorId, 'client_question', 'New Client Question', "Client {$userName} added a question for MLS #{$mlsId}", "#detail-{$mlsId}");
        }
    }

    echo json_encode(['success' => true, 'mls_id' => $mlsId]);
}

function handleDeleteProperty(PDO $pdo) {
    $mlsId = trim($_GET['mls_id'] ?? $_POST['mls_id'] ?? '');
    if (empty($mlsId)) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing mls_id']);
        exit;
    }

    $pdo->prepare("DELETE FROM properties WHERE mls_id = :mls_id")->execute([':mls_id' => $mlsId]);
    $pdo->prepare("DELETE FROM redfin_data WHERE mls_id = :mls_id")->execute([':mls_id' => $mlsId]);
    $pdo->prepare("DELETE FROM user_metadata WHERE mls_id = :mls_id")->execute([':mls_id' => $mlsId]);

    echo json_encode(['success' => true, 'deleted_mls_id' => $mlsId]);
}

function handleUpdateCoordinates(PDO $pdo) {
    $input = file_get_contents('php://input');
    $data = json_decode($input, true);
    if (!$data || !isset($data['mls_id']) || !isset($data['latitude']) || !isset($data['longitude'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid parameters for update_coordinates']);
        exit;
    }

    $lat = (float)$data['latitude'];
    $lng = (float)$data['longitude'];

    if ($lat < 24 || $lat > 50 || $lng < -125 || $lng > -65) {
        http_response_code(400);
        echo json_encode(['error' => 'Coordinates out of valid bounds']);
        exit;
    }

    $stmt = $pdo->prepare("UPDATE properties SET latitude = :lat, longitude = :lng, updated_at = CURRENT_TIMESTAMP WHERE mls_id = :mls_id");
    $stmt->execute([
        ':lat' => $lat,
        ':lng' => $lng,
        ':mls_id' => trim($data['mls_id'])
    ]);

    echo json_encode(['success' => true, 'mls_id' => trim($data['mls_id'])]);
}

/**
 * Preview property and media cleanup candidates for Admin.
 * Returns non-Active listings, media file counts/sizes on disk, orphan media files, and DB status summary.
 */
function handleAdminCleanupPreview(PDO $pdo) {
    requireAdmin();
    try {
        // Status counts for overview
        $statusStmt = $pdo->query("SELECT status, COUNT(*) as cnt FROM properties GROUP BY status ORDER BY cnt DESC");
        $statusCounts = [];
        while ($row = $statusStmt->fetch()) {
            $st = $row['status'] ?: 'Unknown';
            $statusCounts[$st] = (int)$row['cnt'];
        }

        // Fetch all DB MLS IDs to cross-reference against media files
        $allMlsIds = $pdo->query("SELECT mls_id FROM properties")->fetchAll(PDO::FETCH_COLUMN);
        $safeToMlsMap = [];
        foreach ($allMlsIds as $mid) {
            $sId = preg_replace('/[^A-Za-z0-9_-]/', '', (string)$mid);
            if ($sId !== '') {
                $safeToMlsMap[$sId] = (string)$mid;
            }
        }

        // Fetch off-market / non-Active properties
        $stmt = $pdo->query("
            SELECT
                p.mls_id, p.address, p.city, p.state, p.zip, p.price, p.status,
                p.main_image_url, p.gallery_images, p.photo_count, p.updated_at,
                MAX(COALESCE(u.favorite, 0)) as favorite,
                MAX(COALESCE(u.rating, 0)) as rating,
                GROUP_CONCAT(u.user_notes, ' ') as user_notes,
                GROUP_CONCAT(u.realtor_notes, ' ') as realtor_notes
            FROM properties p
            LEFT JOIN user_metadata u ON p.mls_id = u.mls_id
            WHERE LOWER(p.status) != 'active' OR p.status IS NULL
            GROUP BY p.mls_id
            ORDER BY p.status ASC, p.updated_at DESC
        ");
        $offMarketRows = $stmt->fetchAll();

        // Index off-market properties by mls_id for media stats enrichment
        $propertiesMap = [];
        foreach ($offMarketRows as $row) {
            $mId = (string)$row['mls_id'];
            $propertiesMap[$mId] = [
                'mls_id' => $mId,
                'address' => $row['address'] ?? '',
                'city' => $row['city'] ?? '',
                'state' => $row['state'] ?? 'CO',
                'zip' => $row['zip'] ?? '',
                'price' => (float)($row['price'] ?? 0),
                'status' => $row['status'] ?? 'Unknown',
                'main_image_url' => $row['main_image_url'] ?? '',
                'favorite' => (int)$row['favorite'],
                'rating' => (int)$row['rating'],
                'user_notes' => $row['user_notes'] ?? '',
                'realtor_notes' => $row['realtor_notes'] ?? '',
                'has_notes' => (!empty($row['user_notes']) || !empty($row['realtor_notes'])),
                'is_protected' => ((int)$row['favorite'] === 1 || !empty($row['user_notes']) || !empty($row['realtor_notes'])),
                'photo_count_db' => (int)($row['photo_count'] ?? 0),
                'media_files_count' => 0,
                'media_bytes' => 0,
                'updated_at' => $row['updated_at'] ?? ''
            ];
        }

        // Scan media directory
        $mediaFilesCountTotal = 0;
        $mediaBytesTotal = 0;
        $activePhotosCount = 0;
        $activePhotosBytes = 0;
        $orphansBySafeId = [];

        if (is_dir(MEDIA_DIR)) {
            $dirFiles = scandir(MEDIA_DIR);
            foreach ($dirFiles as $file) {
                if ($file === '.' || $file === '..') continue;
                $filePath = MEDIA_DIR . '/' . $file;
                if (!is_file($filePath)) continue;

                $size = (int)filesize($filePath);
                $mediaFilesCountTotal++;
                $mediaBytesTotal += $size;

                // Extract base MLS ID (e.g. "1654482" from "1654482_10.jpg" or "1654482.jpg")
                $baseName = pathinfo($file, PATHINFO_FILENAME);
                $fileSafeId = explode('_', $baseName)[0];

                if ($fileSafeId !== '' && isset($safeToMlsMap[$fileSafeId])) {
                    $realMlsId = $safeToMlsMap[$fileSafeId];
                    if (isset($propertiesMap[$realMlsId])) {
                        $propertiesMap[$realMlsId]['media_files_count']++;
                        $propertiesMap[$realMlsId]['media_bytes'] += $size;
                    } else {
                        // Belongs to an Active listing in database (not an orphan)
                        $activePhotosCount++;
                        $activePhotosBytes += $size;
                    }
                } else {
                    // True orphan media file (MLS ID not in properties table at all)
                    $orphanKey = $fileSafeId ?: $file;
                    if (!isset($orphansBySafeId[$orphanKey])) {
                        $orphansBySafeId[$orphanKey] = [
                            'safe_id' => $orphanKey,
                            'file_count' => 0,
                            'total_bytes' => 0,
                            'sample_file' => $file
                        ];
                    }
                    $orphansBySafeId[$orphanKey]['file_count']++;
                    $orphansBySafeId[$orphanKey]['total_bytes'] += $size;
                }
            }
        }

        $propertiesList = array_values($propertiesMap);
        $orphansList = array_values($orphansBySafeId);

        $offMarketPhotosCount = 0;
        $offMarketPhotosBytes = 0;
        foreach ($propertiesList as $p) {
            $offMarketPhotosCount += $p['media_files_count'];
            $offMarketPhotosBytes += $p['media_bytes'];
        }

        $orphanFilesCount = 0;
        $orphanBytes = 0;
        foreach ($orphansList as $o) {
            $orphanFilesCount += $o['file_count'];
            $orphanBytes += $o['total_bytes'];
        }

        $imageIssues = [];
        $imageStmt = $pdo->query('SELECT mls_id, main_image_url FROM properties');
        while ($imageRow = $imageStmt->fetch(PDO::FETCH_ASSOC)) {
            if (!hasUsableCachedPhoto((string)($imageRow['main_image_url'] ?? ''))) {
                $imageIssues[] = (string)$imageRow['mls_id'];
            }
        }
        $missingAddressRows = $pdo->query("SELECT mls_id, address, city, state, zip, updated_at FROM properties WHERE address IS NULL OR TRIM(address) = '' OR LOWER(TRIM(address)) = 'address unavailable' ORDER BY updated_at DESC")->fetchAll(PDO::FETCH_ASSOC);
        $missingAddressCount = count($missingAddressRows);

        echo json_encode([
            'success' => true,
            'summary' => [
                'total_properties_in_db' => count($allMlsIds),
                'off_market_count' => count($propertiesList),
                'off_market_photos_count' => $offMarketPhotosCount,
                'off_market_photos_bytes' => $offMarketPhotosBytes,
                'active_photos_count' => $activePhotosCount,
                'active_photos_bytes' => $activePhotosBytes,
                'orphan_files_count' => $orphanFilesCount,
                'orphan_bytes' => $orphanBytes,
                'total_media_files' => $mediaFilesCountTotal,
                'total_media_bytes' => $mediaBytesTotal,
                'invalid_primary_preview_count' => count($imageIssues),
                'invalid_primary_preview_mls_ids' => $imageIssues,
                'missing_address_count' => $missingAddressCount,
                'missing_address_listings' => $missingAddressRows,
                'status_counts' => $statusCounts
            ],
            'properties' => $propertiesList,
            'orphans' => $orphansList
        ]);
    } catch (Throwable $t) {
        http_response_code(500);
        logEvent($pdo, 'system', 'error', 'handleAdminCleanupPreview failed: ' . $t->getMessage());
        echo json_encode(['success' => false, 'error' => clientErrorMessage($t)]);
    }
}

/**
 * Executes property and/or media cleanup action for Admin.
 * Deletes files from media/ and removes DB rows or clears image fields.
 */
function handleAdminCleanupExecute(PDO $pdo) {
    requireAdmin();
    requireCsrf();

    $input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
    $targetMlsIds = is_array($input['target_mls_ids'] ?? null) ? $input['target_mls_ids'] : [];
    $cleanupMode = in_array($input['cleanup_mode'] ?? '', ['full_delete', 'media_only'], true) ? $input['cleanup_mode'] : 'full_delete';
    $cleanOrphans = !empty($input['clean_orphans']);

    if (empty($targetMlsIds) && !$cleanOrphans) {
        http_response_code(400);
        echo json_encode(['error' => 'No target properties or orphan cleanup specified.']);
        return;
    }

    $deletedPropsCount = 0;
    $deletedFilesCount = 0;
    $freedBytes = 0;

    try {
        $realMediaDir = realpath(MEDIA_DIR);

        // 1. Process target MLS IDs
        if (!empty($targetMlsIds)) {
            $stmtDelProp = $pdo->prepare("DELETE FROM properties WHERE mls_id = :mls_id");
            $stmtDelRedfin = $pdo->prepare("DELETE FROM redfin_data WHERE mls_id = :mls_id");
            $stmtDelUserMeta = $pdo->prepare("DELETE FROM user_metadata WHERE mls_id = :mls_id");
            $stmtClearMedia = $pdo->prepare("UPDATE properties SET main_image_url = '', gallery_images = '[]', photo_count = 0, updated_at = CURRENT_TIMESTAMP WHERE mls_id = :mls_id");

            foreach ($targetMlsIds as $mlsId) {
                $mlsId = trim((string)$mlsId);
                $safeId = preg_replace('/[^A-Za-z0-9_-]/', '', $mlsId);
                if ($safeId === '') continue;

                // Remove files from disk
                if ($realMediaDir && is_dir($realMediaDir)) {
                    $patterns = [
                        $realMediaDir . '/' . $safeId . '.*',
                        $realMediaDir . '/' . $safeId . '_*.*'
                    ];
                    foreach ($patterns as $pat) {
                        foreach (glob($pat) as $filePath) {
                            if (is_file($filePath) && strpos(realpath($filePath), $realMediaDir) === 0) {
                                $sz = (int)filesize($filePath);
                                if (@unlink($filePath)) {
                                    $deletedFilesCount++;
                                    $freedBytes += $sz;
                                }
                            }
                        }
                    }
                }

                // Process DB updates
                if ($cleanupMode === 'full_delete') {
                    $stmtDelProp->execute([':mls_id' => $mlsId]);
                    $stmtDelRedfin->execute([':mls_id' => $mlsId]);
                    $stmtDelUserMeta->execute([':mls_id' => $mlsId]);
                    $deletedPropsCount++;
                } else if ($cleanupMode === 'media_only') {
                    $stmtClearMedia->execute([':mls_id' => $mlsId]);
                    $deletedPropsCount++;
                }
            }
        }

        // 2. Clean orphans if requested
        if ($cleanOrphans && $realMediaDir && is_dir($realMediaDir)) {
            $allMlsIds = $pdo->query("SELECT mls_id FROM properties")->fetchAll(PDO::FETCH_COLUMN);
            $knownSafeMap = [];
            foreach ($allMlsIds as $mid) {
                $sId = preg_replace('/[^A-Za-z0-9_-]/', '', (string)$mid);
                if ($sId !== '') $knownSafeMap[$sId] = true;
            }

            $dirFiles = scandir($realMediaDir);
            foreach ($dirFiles as $file) {
                if ($file === '.' || $file === '..') continue;
                $filePath = $realMediaDir . '/' . $file;
                if (!is_file($filePath)) continue;

                $baseName = pathinfo($file, PATHINFO_FILENAME);
                $fileSafeId = explode('_', $baseName)[0];

                if ($fileSafeId === '' || !isset($knownSafeMap[$fileSafeId])) {
                    if (strpos(realpath($filePath), $realMediaDir) === 0) {
                        $sz = (int)filesize($filePath);
                        if (@unlink($filePath)) {
                            $deletedFilesCount++;
                            $freedBytes += $sz;
                        }
                    }
                }
            }
        }

        $logMsg = sprintf(
            "Admin cleanup executed: %d properties processed (%s), %d files deleted, %s freed",
            $deletedPropsCount,
            $cleanupMode,
            $deletedFilesCount,
            formatBytesForLog($freedBytes)
        );
        logEvent($pdo, 'system', 'info', $logMsg, null, [
            'mode' => $cleanupMode,
            'clean_orphans' => $cleanOrphans,
            'target_count' => count($targetMlsIds),
            'deleted_files' => $deletedFilesCount,
            'freed_bytes' => $freedBytes
        ]);

        echo json_encode([
            'success' => true,
            'deleted_properties_count' => $deletedPropsCount,
            'deleted_files_count' => $deletedFilesCount,
            'freed_bytes' => $freedBytes
        ]);
    } catch (Throwable $t) {
        http_response_code(500);
        logEvent($pdo, 'system', 'error', 'handleAdminCleanupExecute failed: ' . $t->getMessage());
        echo json_encode(['success' => false, 'error' => clientErrorMessage($t)]);
    }
}

function handleAdminRetryListingImages(PDO $pdo) {
    $input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
    $mlsIds = is_array($input['mls_ids'] ?? null) ? $input['mls_ids'] : [];
    if (empty($mlsIds)) {
        http_response_code(400);
        echo json_encode(['error' => 'Select at least one listing to retry.']);
        return;
    }

    $stmt = $pdo->prepare('UPDATE properties SET full_scrape_completed_at = NULL, updated_at = CURRENT_TIMESTAMP WHERE mls_id = :mls_id');
    $updated = 0;
    foreach ($mlsIds as $mlsId) {
        $stmt->execute([':mls_id' => trim((string)$mlsId)]);
        $updated += $stmt->rowCount();
    }
    logEvent($pdo, 'system', 'info', 'Listings marked for image re-scrape', null, ['mls_ids' => $mlsIds]);
    echo json_encode(['success' => true, 'marked_count' => $updated]);
}

function handleAdminUpdatePropertyAddress(PDO $pdo) {
    $input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
    $mlsId = trim((string)($input['mls_id'] ?? ''));
    $address = trim((string)($input['address'] ?? ''));
    $city = trim((string)($input['city'] ?? ''));
    $state = strtoupper(trim((string)($input['state'] ?? '')));
    $zip = trim((string)($input['zip'] ?? ''));
    if ($mlsId === '' || $address === '' || strtolower($address) === 'address unavailable' || strlen($address) > 300 || strlen($city) > 100 || !preg_match('/^[A-Z]{2}$/', $state) || !preg_match('/^\d{5}(?:-\d{4})?$/', $zip)) {
        http_response_code(400);
        echo json_encode(['error' => 'Enter a valid address, two-letter state, and ZIP code.']);
        return;
    }
    $stmt = $pdo->prepare('UPDATE properties SET address = :address, city = :city, state = :state, zip = :zip, updated_at = CURRENT_TIMESTAMP WHERE mls_id = :mls_id');
    $stmt->execute([':address' => $address, ':city' => $city, ':state' => $state, ':zip' => $zip, ':mls_id' => $mlsId]);
    if ($stmt->rowCount() !== 1) {
        http_response_code(404);
        echo json_encode(['error' => 'Property not found.']);
        return;
    }
    recordPropertyActivity($pdo, $mlsId, 'address_corrected', 'public', 'Listing address was corrected by an administrator.');
    logEvent($pdo, 'system', 'info', 'Property address corrected', $mlsId, ['city' => $city, 'state' => $state, 'zip' => $zip]);
    echo json_encode(['success' => true, 'mls_id' => $mlsId]);
}

function formatBytesForLog(int $bytes): string {
    if ($bytes >= 1048576) {
        return number_format($bytes / 1048576, 2) . ' MB';
    } elseif ($bytes >= 1024) {
        return number_format($bytes / 1024, 1) . ' KB';
    }
    return $bytes . ' B';
}

/**
 * Realtor Command Center API Handlers
 */

function handleGetClientMatrix(PDO $pdo) {
    requireRealtorOrAdmin();
    $currentUserId = (int)$_SESSION['user_id'];
    $role = $_SESSION['role'] ?? 'realtor';
    $isAdmin = !empty($_SESSION['is_admin']) || $role === 'admin';

    $targetClientId = isset($_GET['client_id']) ? (int)$_GET['client_id'] : 0;

    // Fetch assigned clients list for this realtor (or all clients for admin)
    if ($isAdmin) {
        $stmtClients = $pdo->prepare("SELECT id, username, full_name, email, phone, avatar_url, role, pipeline_stage, target_min_price, target_max_price, target_cities, target_beds, target_timeline, must_haves, deal_breakers, last_active_at, created_at FROM users WHERE role = 'client' ORDER BY id DESC");
        $stmtClients->execute();
    } else {
        $stmtClients = $pdo->prepare("SELECT id, username, full_name, email, phone, avatar_url, role, pipeline_stage, target_min_price, target_max_price, target_cities, target_beds, target_timeline, must_haves, deal_breakers, last_active_at, created_at FROM users WHERE role = 'client' AND (realtor_id = :rid OR id = :rid) ORDER BY id DESC");
        $stmtClients->execute([':rid' => $currentUserId]);
    }
    $clients = $stmtClients->fetchAll(PDO::FETCH_ASSOC);

    if (empty($clients)) {
        echo json_encode([
            'success' => true,
            'clients' => [],
            'selected_client' => null,
            'matrix' => ['loved' => [], 'shortlisted' => [], 'disliked' => [], 'in_discussion' => [], 'unreviewed' => []]
        ]);
        return;
    }

    $selectedClient = null;
    if ($targetClientId > 0) {
        foreach ($clients as $c) {
            if ((int)$c['id'] === $targetClientId) {
                $selectedClient = $c;
                break;
            }
        }
    }
    if (!$selectedClient) {
        $selectedClient = $clients[0];
    }

    $clientId = (int)$selectedClient['id'];

    // Fetch all properties with client metadata & redfin enrichment
    $stmtMeta = $pdo->prepare("
        SELECT p.*, r.redfin_estimate, r.walk_score, r.transit_score, r.bike_score, r.days_on_redfin,
               COALESCE(m.favorite, 0) as favorite,
               COALESCE(m.hidden, 0) as hidden,
               COALESCE(m.rating, 0) as rating,
               COALESCE(m.user_notes, '') as user_notes,
               COALESCE(m.realtor_notes, '') as realtor_notes,
               COALESCE(m.realtor_private_notes, '') as realtor_private_notes,
               COALESCE(m.shared_with_realtor, 0) as shared_with_realtor,
               m.tags_json, m.updated_at as meta_updated_at
        FROM properties p
        LEFT JOIN user_metadata m ON p.mls_id = m.mls_id AND m.user_id = :cid
        LEFT JOIN redfin_data r ON p.mls_id = r.mls_id
        LEFT JOIN showing_itinerary si ON p.mls_id = si.mls_id AND si.client_id = :itinerary_client_id
        LEFT JOIN property_visibility v ON p.mls_id = v.mls_id
        WHERE COALESCE(v.is_hidden, 0) = 0
        ORDER BY p.created_at DESC
    ");
    $stmtMeta->execute([':cid' => $clientId, ':itinerary_client_id' => $clientId]);
    $metaProps = $stmtMeta->fetchAll(PDO::FETCH_ASSOC);

    // Fetch properties that have message threads between client & realtor
    $stmtMsgProps = $pdo->prepare("
        SELECT DISTINCT p.mls_id
        FROM property_messages pm
        JOIN properties p ON pm.mls_id = p.mls_id
        LEFT JOIN property_visibility v ON p.mls_id = v.mls_id
        WHERE (pm.user_id = :cid OR pm.realtor_id = :cid) AND COALESCE(v.is_hidden, 0) = 0
    ");
    $stmtMsgProps->execute([':cid' => $clientId]);
    $discussionMlsIds = $stmtMsgProps->fetchAll(PDO::FETCH_COLUMN);
    $discussionMlsSet = array_flip($discussionMlsIds ?: []);

    $loved = [];
    $shortlisted = [];
    $disliked = [];
    $inDiscussion = [];
    $unreviewed = [];

    foreach ($metaProps as $p) {
        // Decode gallery images JSON if needed
        if (!empty($p['gallery_images']) && is_string($p['gallery_images'])) {
            try { $p['gallery_images'] = json_decode($p['gallery_images'], true); } catch(Throwable $t) {}
        }
        if (!empty($p['tags_json']) && is_string($p['tags_json'])) {
            try { $p['tags_json'] = json_decode($p['tags_json'], true); } catch(Throwable $t) {}
        }

        if (isset($discussionMlsSet[$p['mls_id']])) {
            $p['has_messages'] = true;
        }

        if (!empty($p['hidden']) || (!empty($p['rating']) && (int)$p['rating'] <= 2 && (int)$p['rating'] > 0)) {
            $disliked[] = $p;
        } elseif (!empty($p['favorite'])) {
            $loved[] = $p;
        } elseif (!empty($p['shared_with_realtor']) || (!empty($p['rating']) && (int)$p['rating'] >= 3) || !empty($p['user_notes'])) {
            $shortlisted[] = $p;
        } else {
            $unreviewed[] = $p;
        }

        if (isset($discussionMlsSet[$p['mls_id']])) {
            $inDiscussion[] = $p;
        }
    }

    echo json_encode([
        'success' => true,
        'clients' => $clients,
        'selected_client' => $selectedClient,
        'matrix' => [
            'loved' => $loved,
            'shortlisted' => $shortlisted,
            'disliked' => $disliked,
            'in_discussion' => $inDiscussion,
            'unreviewed' => $unreviewed
        ]
    ]);
}

function handleGetRealtorOverview(PDO $pdo) {
    requireRealtorOrAdmin();
    $currentUserId = (int)$_SESSION['user_id'];
    $isAdmin = !empty($_SESSION['is_admin']) || ($_SESSION['role'] ?? '') === 'admin';
    $clientClause = $isAdmin ? "role = 'client'" : "role = 'client' AND realtor_id = :realtor_id";

    $clientStmt = $pdo->prepare("SELECT COUNT(*) FROM users WHERE $clientClause");
    $params = $isAdmin ? [] : [':realtor_id' => $currentUserId];
    $clientStmt->execute($params);
    $clientCount = (int)$clientStmt->fetchColumn();

    $reviewStmt = $pdo->prepare("SELECT COUNT(*) FROM properties p JOIN users c ON $clientClause LEFT JOIN property_visibility v ON p.mls_id = v.mls_id LEFT JOIN user_metadata m ON m.user_id = c.id AND m.mls_id = p.mls_id WHERE COALESCE(v.is_hidden, 0) = 0 AND (m.user_id IS NULL OR (COALESCE(m.favorite, 0) = 0 AND COALESCE(m.hidden, 0) = 0 AND COALESCE(m.rating, 0) = 0))");
    $reviewStmt->execute($params);
    $reviewNeeded = (int)$reviewStmt->fetchColumn();

    $showingStmt = $pdo->prepare("SELECT COUNT(*) FROM showing_itinerary si JOIN users c ON si.client_id = c.id WHERE $clientClause AND TRIM(si.showing_time) != ''");
    $showingStmt->execute($params);
    $showingCount = (int)$showingStmt->fetchColumn();

    $unreadStmt = $pdo->prepare('SELECT COUNT(*) FROM notifications WHERE user_id = :user_id AND is_read = 0');
    $unreadStmt->execute([':user_id' => $currentUserId]);

    echo json_encode(['success' => true, 'overview' => ['active_clients' => $clientCount, 'homes_awaiting_review' => $reviewNeeded, 'scheduled_showings' => $showingCount, 'unread_notifications' => (int)$unreadStmt->fetchColumn()]]);
}

function handleGetClientActivity(PDO $pdo) {
    requireRealtorOrAdmin();
    $clientId = (int)($_GET['client_id'] ?? 0);
    if ($clientId <= 0) {
        http_response_code(400);
        echo json_encode(['error' => 'A client is required.']);
        return;
    }

    $currentUserId = (int)$_SESSION['user_id'];
    $isAdmin = !empty($_SESSION['is_admin']) || ($_SESSION['role'] ?? '') === 'admin';
    if (!$isAdmin) {
        $assignment = $pdo->prepare("SELECT 1 FROM users WHERE id = :client_id AND role = 'client' AND realtor_id = :realtor_id");
        $assignment->execute([':client_id' => $clientId, ':realtor_id' => $currentUserId]);
        if (!$assignment->fetchColumn()) {
            http_response_code(403);
            echo json_encode(['error' => 'Forbidden. This client is not assigned to you.']);
            return;
        }
    }

    $stmt = $pdo->prepare("SELECT a.id, a.activity_type, a.message, a.created_at, p.address, p.city, p.state, p.zip, p.mls_id FROM property_activity a JOIN properties p ON a.mls_id = p.mls_id WHERE a.subject_user_id = :client_id AND a.visibility IN ('shared', 'realtor') ORDER BY a.created_at DESC, a.id DESC LIMIT 100");
    $stmt->execute([':client_id' => $clientId]);
    echo json_encode(['success' => true, 'activity' => $stmt->fetchAll()]);
}

function handleSaveRealtorNotes(PDO $pdo) {
    requireRealtorOrAdmin();
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true) ?: $_POST;

    $clientId = (int)($data['client_id'] ?? 0);
    $mlsId = trim($data['mls_id'] ?? '');
    $realtorNotes = trim($data['realtor_notes'] ?? '');

    if ($clientId <= 0 || empty($mlsId)) {
        http_response_code(400);
        echo json_encode(['error' => 'client_id and mls_id are required']);
        return;
    }

    $currentUserId = (int)$_SESSION['user_id'];
    $isAdmin = !empty($_SESSION['is_admin']) || ($_SESSION['role'] ?? '') === 'admin';
    if (!$isAdmin) {
        $assignment = $pdo->prepare("SELECT 1 FROM users WHERE id = :client_id AND role = 'client' AND realtor_id = :realtor_id");
        $assignment->execute([':client_id' => $clientId, ':realtor_id' => $currentUserId]);
        if (!$assignment->fetchColumn()) {
            http_response_code(403);
            echo json_encode(['error' => 'Forbidden. This client is not assigned to you.']);
            return;
        }
    }

    $stmtCheck = $pdo->prepare("SELECT user_id FROM user_metadata WHERE user_id = :cid AND mls_id = :mid");
    $stmtCheck->execute([':cid' => $clientId, ':mid' => $mlsId]);
    $exists = $stmtCheck->fetch();

    if ($exists) {
        $stmtUpd = $pdo->prepare("UPDATE user_metadata SET realtor_private_notes = :rnotes, updated_at = CURRENT_TIMESTAMP WHERE user_id = :cid AND mls_id = :mid");
        $stmtUpd->execute([':rnotes' => $realtorNotes, ':cid' => $clientId, ':mid' => $mlsId]);
    } else {
        $stmtIns = $pdo->prepare("INSERT INTO user_metadata (user_id, mls_id, realtor_private_notes, updated_at) VALUES (:cid, :mid, :rnotes, CURRENT_TIMESTAMP)");
        $stmtIns->execute([':cid' => $clientId, ':mid' => $mlsId, ':rnotes' => $realtorNotes]);
    }

    recordPropertyActivity($pdo, $mlsId, 'realtor_private_note_updated', 'realtor', 'Realtor updated a private note.', [], $clientId);
    echo json_encode(['success' => true, 'mls_id' => $mlsId, 'realtor_private_notes' => $realtorNotes]);
}

function handleUpdateClientPipeline(PDO $pdo) {
    requireRealtorOrAdmin();
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true) ?: $_POST;

    $clientId = (int)($data['client_id'] ?? 0);
    $stage = trim($data['pipeline_stage'] ?? 'searching');
    $minPrice = isset($data['target_min_price']) && $data['target_min_price'] !== '' ? (float)$data['target_min_price'] : null;
    $maxPrice = isset($data['target_max_price']) && $data['target_max_price'] !== '' ? (float)$data['target_max_price'] : null;
    $cities = trim($data['target_cities'] ?? '');
    $beds = isset($data['target_beds']) && $data['target_beds'] !== '' ? (int)$data['target_beds'] : null;
    $allowedStages = ['searching', 'touring', 'offer', 'contract', 'closed'];

    if ($clientId <= 0) {
        http_response_code(400);
        echo json_encode(['error' => 'client_id is required']);
        return;
    }
    if (!in_array($stage, $allowedStages, true)) {
        http_response_code(400);
        echo json_encode(['error' => 'Invalid pipeline stage.']);
        return;
    }

    $currentUserId = (int)$_SESSION['user_id'];
    $isAdmin = !empty($_SESSION['is_admin']) || ($_SESSION['role'] ?? '') === 'admin';
    if (!$isAdmin) {
        $assignment = $pdo->prepare("SELECT 1 FROM users WHERE id = :client_id AND role = 'client' AND realtor_id = :realtor_id");
        $assignment->execute([':client_id' => $clientId, ':realtor_id' => $currentUserId]);
        if (!$assignment->fetchColumn()) {
            http_response_code(403);
            echo json_encode(['error' => 'Forbidden. This client is not assigned to you.']);
            return;
        }
    }

    $stmt = $pdo->prepare("UPDATE users SET pipeline_stage = :stage, target_min_price = :min_p, target_max_price = :max_p, target_cities = :cities, target_beds = :beds WHERE id = :cid");
    $stmt->execute([
        ':stage' => $stage,
        ':min_p' => $minPrice,
        ':max_p' => $maxPrice,
        ':cities' => $cities,
        ':beds' => $beds,
        ':cid' => $clientId
    ]);

    $clientStmt = $pdo->prepare('SELECT username FROM users WHERE id = :client_id');
    $clientStmt->execute([':client_id' => $clientId]);
    $clientUsername = $clientStmt->fetchColumn() ?: (string)$clientId;
    logEvent($pdo, 'system', 'info', 'Client pipeline stage updated', null, ['client' => $clientUsername, 'pipeline_stage' => $stage]);

    echo json_encode(['success' => true, 'client_id' => $clientId, 'pipeline_stage' => $stage]);
}

function handleSaveShowingItinerary(PDO $pdo) {
    requireRealtorOrAdmin();
    $data = json_decode(file_get_contents('php://input'), true) ?? $_POST;
    $clientId = (int)($data['client_id'] ?? 0);
    $mlsId = trim((string)($data['mls_id'] ?? ''));
    $showingTime = trim((string)($data['showing_time'] ?? ''));
    $accessNotes = trim((string)($data['access_notes'] ?? ''));
    $feedback = trim((string)($data['feedback'] ?? ''));

    if ($clientId <= 0 || $mlsId === '') {
        http_response_code(400);
        echo json_encode(['error' => 'A client and property are required.']);
        return;
    }
    if ($showingTime !== '') {
        $dateTime = DateTime::createFromFormat('Y-m-d\TH:i', $showingTime) ?: DateTime::createFromFormat('Y-m-d H:i:s', $showingTime);
        if (!$dateTime) {
            http_response_code(400);
            echo json_encode(['error' => 'Enter a valid showing date and time.']);
            return;
        }
        $showingTime = $dateTime->format('Y-m-d H:i:s');
    }
    if (strlen($showingTime) > 100 || strlen($accessNotes) > 2000 || strlen($feedback) > 2000) {
        http_response_code(400);
        echo json_encode(['error' => 'Itinerary details are too long.']);
        return;
    }

    $currentUserId = (int)$_SESSION['user_id'];
    $isAdmin = !empty($_SESSION['is_admin']) || ($_SESSION['role'] ?? '') === 'admin';
    if (!$isAdmin) {
        $assignment = $pdo->prepare("SELECT 1 FROM users WHERE id = :client_id AND role = 'client' AND realtor_id = :realtor_id");
        $assignment->execute([':client_id' => $clientId, ':realtor_id' => $currentUserId]);
        if (!$assignment->fetchColumn()) {
            http_response_code(403);
            echo json_encode(['error' => 'Forbidden. This client is not assigned to you.']);
            return;
        }
    }

    $stmt = $pdo->prepare('INSERT INTO showing_itinerary (client_id, mls_id, showing_time, access_notes, feedback, updated_by_user_id, updated_at) VALUES (:client_id, :mls_id, :showing_time, :access_notes, :feedback, :user_id, CURRENT_TIMESTAMP) ON CONFLICT(client_id, mls_id) DO UPDATE SET showing_time = excluded.showing_time, access_notes = excluded.access_notes, feedback = excluded.feedback, updated_by_user_id = excluded.updated_by_user_id, updated_at = CURRENT_TIMESTAMP');
    $stmt->execute([':client_id' => $clientId, ':mls_id' => $mlsId, ':showing_time' => $showingTime, ':access_notes' => $accessNotes, ':feedback' => $feedback, ':user_id' => $currentUserId]);
    recordPropertyActivity($pdo, $mlsId, 'showing_itinerary_updated', 'realtor', 'Realtor updated showing itinerary details.', [], $clientId);
    echo json_encode(['success' => true, 'client_id' => $clientId, 'mls_id' => $mlsId]);
}

function handleGetMyShowings(PDO $pdo) {
    $userId = (int)$_SESSION['user_id'];
    $role = $_SESSION['role'] ?? 'client';
    if ($role !== 'client') {
        http_response_code(403);
        echo json_encode(['error' => 'This endpoint is available to client accounts only.']);
        return;
    }
    $stmt = $pdo->prepare("SELECT si.mls_id, si.showing_time, si.updated_at, p.address, p.city, p.state, p.zip FROM showing_itinerary si JOIN properties p ON si.mls_id = p.mls_id LEFT JOIN property_visibility v ON p.mls_id = v.mls_id WHERE si.client_id = :client_id AND TRIM(si.showing_time) != '' AND COALESCE(v.is_hidden, 0) = 0 ORDER BY si.showing_time ASC, si.updated_at DESC");
    $stmt->execute([':client_id' => $userId]);
    echo json_encode(['success' => true, 'showings' => $stmt->fetchAll()]);
}

function handleGetPropertyMessages(PDO $pdo) {
    requireAuth();
    $currentUserId = (int)$_SESSION['user_id'];
    $role = $_SESSION['role'] ?? 'client';
    $isAdmin = !empty($_SESSION['is_admin']) || $role === 'admin';
    $clientId = isset($_GET['client_id']) ? (int)$_GET['client_id'] : $currentUserId;
    $mlsId = isset($_GET['mls_id']) ? trim($_GET['mls_id']) : '';

    if ($role === 'client') {
        $clientId = $currentUserId;
        $stmtClient = $pdo->prepare('SELECT realtor_id FROM users WHERE id = :client_id');
        $stmtClient->execute([':client_id' => $clientId]);
        $realtorId = (int)($stmtClient->fetchColumn() ?: 0);
    } elseif (!$isAdmin) {
        $assignment = $pdo->prepare("SELECT 1 FROM users WHERE id = :client_id AND role = 'client' AND realtor_id = :realtor_id");
        $assignment->execute([':client_id' => $clientId, ':realtor_id' => $currentUserId]);
        if (!$assignment->fetchColumn()) {
            http_response_code(403);
            echo json_encode(['error' => 'Forbidden. This client is not assigned to you.']);
            return;
        }
        $realtorId = $currentUserId;
    }

    $sql = "
        SELECT pm.*, u_sender.username as sender_name, u_sender.full_name as sender_full_name, u_sender.avatar_url as sender_avatar, p.address as property_address
        FROM property_messages pm
        JOIN users u_sender ON pm.user_id = u_sender.id
        LEFT JOIN properties p ON pm.mls_id = p.mls_id
        WHERE pm.user_id = :cid
    ";
    $params = [':cid' => $clientId];

    if (!$isAdmin) {
        $sql .= ' AND pm.realtor_id = :realtor_id';
        $params[':realtor_id'] = $realtorId;
    }

    if (!empty($mlsId)) {
        $sql .= " AND pm.mls_id = :mid";
        $params[':mid'] = $mlsId;
    }

    $sql .= " ORDER BY pm.created_at ASC";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $messages = $stmt->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode(['success' => true, 'messages' => $messages]);
}

function handleSendPropertyMessage(PDO $pdo) {
    requireAuth();
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true) ?: $_POST;

    $currentUserId = (int)$_SESSION['user_id'];
    $role = $_SESSION['role'] ?? 'client';
    $isAdmin = !empty($_SESSION['is_admin']) || $role === 'admin';
    $senderRole = ($role === 'realtor' || !empty($_SESSION['is_admin'])) ? 'realtor' : 'client';

    $mlsId = trim($data['mls_id'] ?? '');
    $message = trim($data['message'] ?? '');
    $clientId = (int)($data['client_id'] ?? ($role === 'client' ? $currentUserId : 0));
    $realtorId = (int)($data['realtor_id'] ?? 0);

    if (empty($mlsId) || empty($message)) {
        http_response_code(400);
        echo json_encode(['error' => 'mls_id and message are required']);
        return;
    }

    if ($role === 'client') {
        $stmtClient = $pdo->prepare("SELECT realtor_id FROM users WHERE id = :cid");
        $stmtClient->execute([':cid' => $currentUserId]);
        $realtorId = (int)($stmtClient->fetchColumn() ?: 1);
    } else {
        if ($clientId <= 0) {
            http_response_code(400);
            echo json_encode(['error' => 'A client is required.']);
            return;
        }
        if (!$isAdmin) {
            $assignment = $pdo->prepare("SELECT 1 FROM users WHERE id = :client_id AND role = 'client' AND realtor_id = :realtor_id");
            $assignment->execute([':client_id' => $clientId, ':realtor_id' => $currentUserId]);
            if (!$assignment->fetchColumn()) {
                http_response_code(403);
                echo json_encode(['error' => 'Forbidden. This client is not assigned to you.']);
                return;
            }
        }
        $realtorId = $currentUserId;
    }

    $stmtIns = $pdo->prepare("INSERT INTO property_messages (user_id, realtor_id, mls_id, sender_role, message, created_at) VALUES (:cid, :rid, :mid, :srole, :msg, CURRENT_TIMESTAMP)");
    $stmtIns->execute([
        ':cid' => $clientId,
        ':rid' => $realtorId,
        ':mid' => $mlsId,
        ':srole' => $senderRole,
        ':msg' => $message
    ]);
    $msgId = (int)$pdo->lastInsertId();

    $recipientId = ($senderRole === 'realtor') ? $clientId : $realtorId;
    $senderName = $_SESSION['username'] ?? 'User';
    $stmtNotif = $pdo->prepare("INSERT INTO notifications (user_id, type, title, message, link_url, created_at) VALUES (:uid, 'property_message', :title, :msg, :link, CURRENT_TIMESTAMP)");
    $stmtNotif->execute([
        ':uid' => $recipientId,
        ':title' => "New message regarding " . $mlsId,
        ':msg' => "{$senderName}: \"{$message}\"",
        ':link' => "#realtor"
    ]);

    recordPropertyActivity($pdo, $mlsId, 'property_message_sent', 'shared', $senderRole === 'realtor' ? 'Realtor added a message.' : 'Sent a message to realtor.', [], $clientId);

    echo json_encode(['success' => true, 'message_id' => $msgId]);
}

