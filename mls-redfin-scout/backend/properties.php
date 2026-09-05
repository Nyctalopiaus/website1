<?php
/**
 * MLS & Redfin Property Scout - Property Data Pipeline
 * Listing list/sync/update/delete, deep-scrape status, and local photo caching. Requires
 * backend/bootstrap.php to already be included (uses $pdo and MEDIA_DIR set up there).
 */

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

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_CONNECTTIMEOUT => 6,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_SSL_VERIFYPEER => false,
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

        // Guard against non-image responses
        if ($body !== false && $httpCode === 200 && (strpos($contentType, 'image/') === 0 || strlen($body) >= 100)) {
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

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_CONNECTTIMEOUT => 6,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_SSL_VERIFYPEER => false,
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

        if ($body !== false && $httpCode === 200 && (strpos($contentType, 'image/') === 0 || strlen($body) >= 100)) {
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
            LEFT JOIN user_metadata u ON p.mls_id = u.mls_id
            ORDER BY p.updated_at DESC
        ");
        $stmt->execute();
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
        echo json_encode(['success' => false, 'error' => $t->getMessage(), 'file' => $t->getFile(), 'line' => $t->getLine()]);
    }
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

    $stmtUserMetaInit = $pdo->prepare("
        INSERT OR IGNORE INTO user_metadata (mls_id) VALUES (:mls_id)
    ");

    foreach ($properties as $item) {
        $mlsId = trim($item['mls_id'] ?? '');
        if (empty($mlsId)) {
            $skippedCount++;
            logEvent($pdo, 'sync', 'warn', 'Skipped sync item with missing mls_id', null, $item);
            continue;
        }

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
                ':raw_mls_json' => json_encode($item, JSON_INVALID_UTF8_SUBSTITUTE),
                ':latitude' => (isset($item['latitude']) && (float)$item['latitude'] >= 24 && (float)$item['latitude'] <= 50) ? (float)$item['latitude'] : null,
                ':longitude' => (isset($item['longitude']) && (float)$item['longitude'] >= -125 && (float)$item['longitude'] <= -65) ? (float)$item['longitude'] : null,
                // full_scrape_completed_at only advances forward (COALESCE in the ON CONFLICT
                // branch above) — a plain refresh pass (Part 1/3) never sends full_scrape=true,
                // so it can never erase a previously-completed deep scrape.
                ':full_scrape_completed_at' => !empty($item['full_scrape']) ? date('Y-m-d H:i:s') : null
            ]);
            $syncedCount++;
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

        // Initialize user metadata record and sync matrix portal review status/notes
        $matrixReview = $item['matrix_review_status'] ?? 'none';
        $portalNotes = trim($item['portal_notes'] ?? '');

        $stmtUserMetaInit->execute([':mls_id' => $mlsId]);

        $updateParts = [];
        $updateParams = [':mls_id' => $mlsId];

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
            $sqlUser = "UPDATE user_metadata SET " . implode(', ', $updateParts) . " WHERE mls_id = :mls_id";
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

                if ($existing) {
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
                if (preg_match('/_(\d+)\.[^.]+$/', $path, $m)) {
                    $existingByMls[$mlsId][(int)$m[1]] = 'media/' . basename($path);
                }
            }
            if (empty($existingByMls[$mlsId])) {
                $legacy = glob(MEDIA_DIR . '/' . $safeId . '.*');
                if ($legacy) {
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

        logEvent($pdo, 'sync', 'info', "Sync batch complete: {$syncedCount} synced, {$skippedCount} skipped", null, ['total_items' => count($properties)]);

        echo json_encode(['success' => true, 'synced_count' => $syncedCount]);
    } catch (Throwable $t) {
        http_response_code(500);
        logEvent($pdo, 'sync', 'error', 'handleSync failed: ' . $t->getMessage(), null, ['file' => $t->getFile(), 'line' => $t->getLine()]);
        echo json_encode(['success' => false, 'error' => $t->getMessage()]);
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
        $stmt = $pdo->query("SELECT mls_id FROM properties WHERE full_scrape_completed_at IS NOT NULL");
        $completed = $stmt->fetchAll(PDO::FETCH_COLUMN);
        echo json_encode(['success' => true, 'completed' => array_values($completed)]);
    } catch (Throwable $t) {
        http_response_code(500);
        logEvent($pdo, 'system', 'error', 'handleScrapeStatus failed: ' . $t->getMessage());
        echo json_encode(['success' => false, 'error' => $t->getMessage()]);
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

    if ($message === '') {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'message is required']);
        return;
    }

    logEvent($pdo, $source, $level, $message, $mlsId, $context);
    echo json_encode(['success' => true]);
}

function handleUpdateUserData(PDO $pdo) {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);

    $mlsId = trim($data['mls_id'] ?? '');
    if (empty($mlsId)) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing mls_id']);
        exit;
    }

    // Ensure row exists
    $pdo->prepare("INSERT OR IGNORE INTO user_metadata (mls_id) VALUES (:mls_id)")->execute([':mls_id' => $mlsId]);

    $fields = [];
    $params = [':mls_id' => $mlsId];

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
        $sql = "UPDATE user_metadata SET " . implode(', ', $fields) . " WHERE mls_id = :mls_id";
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
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
