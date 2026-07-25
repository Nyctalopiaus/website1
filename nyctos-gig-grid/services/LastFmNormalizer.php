<?php
/**
 * Last.fm Genre Normalization, Source Tracking, and Override Pipeline
 */

require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../genre_buckets.php';
require_once __DIR__ . '/../genre_overrides.php';
require_once __DIR__ . '/../ignored_tags.php';

class LastFmNormalizer {
    private PDO $db;
    private array $genreOverrides;
    private $logger;
    private int $requestDelayUs = 250000; // 250ms micro-sleep (4 requests/sec max)
    private int $emptyTagsRetrySeconds = 604800; // 7 days

    public function __construct(PDO $db, array $genreOverrides = [], ?callable $logger = null) {
        $this->db = $db;
        $this->genreOverrides = !empty($genreOverrides) ? $genreOverrides : getGenreOverridesNormalized();
        $this->logger = $logger;
    }

    private function log(string $message): void {
        if ($this->logger !== null) {
            call_user_func($this->logger, $message);
        } else {
            echo "[" . date('Y-m-d H:i:s') . "] [LastFmNormalizer] " . $message . "\n";
        }
    }

    private function isLikelyLineupName(string $artistName): bool {
        $name = trim($artistName);
        if ($name === '') {
            return false;
        }

        $lower = strtolower($name);
        if (preg_match('/\bw\//', $lower) || preg_match('/\bwith\b/', $lower) || strpos($name, ',') !== false) {
            return true;
        }

        $ampCount = substr_count($name, '&');
        if ($ampCount >= 2) {
            return true;
        }

        if ($ampCount === 1) {
            // Preserve common single-band patterns like "X & The Y".
            if (preg_match('/\s&\s(the|les|los|la)\b/i', $name)) {
                return false;
            }
            return true;
        }

        return false;
    }

    private function splitLineupArtists(string $artistName): array {
        $parts = preg_split('/\s+(?:and|with)\s+|\s+w\/\s+|\s*&\s*|\s*,\s*/i', $artistName);
        $artists = [];
        foreach ($parts as $part) {
            $clean = trim((string)$part);
            if ($clean === '') {
                continue;
            }
            if (!in_array($clean, $artists, true)) {
                $artists[] = $clean;
            }
        }
        return $artists;
    }

    private function extractTopTagsFromLastFmResponse(array $data): array {
        $tagsList = [];
        if (!empty($data['toptags']['tag']) && is_array($data['toptags']['tag'])) {
            foreach ($data['toptags']['tag'] as $t) {
                if (isset($t['name']) && trim((string)$t['name']) !== '') {
                    $tagsList[] = trim((string)$t['name']);
                    if (count($tagsList) >= 6) {
                        break;
                    }
                }
            }
        }
        return $tagsList;
    }

    private function resolveTagsForSingleArtist(string $artistName, string $apiKey): string {
        $artistName = trim($artistName);
        if ($artistName === '') {
            return '';
        }

        $cacheStmt = $this->db->prepare("SELECT tags, checked_at FROM artist_genre_cache WHERE LOWER(artist_name) = LOWER(:artist)");
        $cacheStmt->execute([':artist' => $artistName]);
        $cacheRow = $cacheStmt->fetch(PDO::FETCH_ASSOC);
        if (!empty($cacheRow)) {
            $cachedTags = trim((string)($cacheRow['tags'] ?? ''));
            if ($cachedTags !== '') {
                return $cachedTags;
            }

            $checkedAtTs = isset($cacheRow['checked_at']) ? strtotime((string)$cacheRow['checked_at']) : false;
            if ($checkedAtTs !== false && (time() - $checkedAtTs) < $this->emptyTagsRetrySeconds) {
                $this->log("[LASTFM CACHE] Skipping API for '{$artistName}' (recent empty-tag lookup).");
                return '';
            }
        }

        if (empty($apiKey)) {
            return '';
        }

        $this->log("[LASTFM API PACING] Enforcing 250ms pacing delay before querying Last.fm for '{$artistName}'...");
        usleep($this->requestDelayUs);

        $url = "https://ws.audioscrobbler.com/2.0/?method=artist.gettoptags&artist=" . rawurlencode($artistName) . "&api_key=" . urlencode($apiKey) . "&format=json";

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_USERAGENT, 'NyctosGigGrid/2.0 ( contact@nycto.ninja )');
        curl_setopt($ch, CURLOPT_TIMEOUT, 8);
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode === 429) {
            $this->log("[RATE-LIMIT 429] Last.fm rate limit hit for '{$artistName}'.");
            return '';
        }
        if ($httpCode !== 200 || empty($response)) {
            $this->log("[WARN] Last.fm API returned HTTP {$httpCode} for '{$artistName}'.");
            return '';
        }

        $data = json_decode($response, true);
        $tagsList = $this->extractTopTagsFromLastFmResponse(is_array($data) ? $data : []);
        if (empty($tagsList)) {
            $cacheSave = $this->db->prepare("INSERT OR REPLACE INTO artist_genre_cache (artist_name, is_metal, tags, checked_at) VALUES (:artist, 0, '', CURRENT_TIMESTAMP)");
            $cacheSave->execute([':artist' => $artistName]);
            return '';
        }

        $tagsStr = implode(', ', $tagsList);
        $cacheSave = $this->db->prepare("INSERT OR REPLACE INTO artist_genre_cache (artist_name, is_metal, tags, checked_at) VALUES (:artist, 1, :tags, CURRENT_TIMESTAMP)");
        $cacheSave->execute([':artist' => $artistName, ':tags' => $tagsStr]);
        return $tagsStr;
    }

    /**
     * Map a string of tags to a bucket configured in genre_buckets.php
     */
    public function mapTagsToBucket(string $tagsStr): string {
        $parts = preg_split('/[|,]/', strtolower($tagsStr));
        $tags = array_filter(array_map('trim', $parts));
        if (empty($tags)) {
            return 'all';
        }

        $buckets = getGenreBucketConfig();

        // Check each bucket in priority order
        foreach ($buckets as $bKey => $bConfig) {
            if ($bKey === 'all' || empty($bConfig['tags'])) {
                continue;
            }
            foreach ($tags as $tag) {
                if (in_array($tag, $bConfig['tags'], true)) {
                    return $bKey;
                }
            }
        }

        return 'all';
    }

    private function artistNeedsNormalization(string $artistName): bool {
        $stmt = $this->db->prepare("\n            SELECT COUNT(*)\n            FROM events\n            WHERE LOWER(artist_name) = LOWER(:artist)\n              AND genre_locked = 0\n              AND (\n                  lastfm_normalized_at IS NULL\n                  OR LOWER(COALESCE(genre_source, '')) <> 'lastfm'\n                  OR TRIM(COALESCE(tags, '')) = ''\n              )\n        ");
        $stmt->execute([':artist' => $artistName]);
        return ((int)$stmt->fetchColumn()) > 0;
    }

    /**
     * Normalizes event genres for all distinct un-locked artists in the database.
     */
    public function normalizeAllEvents(): int {
        $this->log("Starting Last.fm genre normalization pipeline...");

        // Fetch only artists with at least one unlocked row that still needs normalization.
        $stmt = $this->db->query("\n            SELECT DISTINCT artist_name\n            FROM events\n            WHERE TRIM(COALESCE(artist_name, '')) <> ''\n              AND genre_locked = 0\n              AND (\n                  lastfm_normalized_at IS NULL\n                  OR LOWER(COALESCE(genre_source, '')) <> 'lastfm'\n                  OR TRIM(COALESCE(tags, '')) = ''\n              )\n        ");
        $artists = $stmt->fetchAll(PDO::FETCH_COLUMN);

        if (empty($artists)) {
            $this->log("No eligible artists found for Last.fm normalization.");
            return 0;
        }

        $normalizedCount = 0;
        $apiKey = LASTFM_API_KEY;

        foreach ($artists as $artistName) {
            $artistName = trim((string)$artistName);
            if ($artistName === '') {
                continue;
            }

            // 1. Check Manual Overrides first
            $overrideGenre = resolveArtistGenreOverride($artistName, $this->genreOverrides);
            if ($overrideGenre !== null) {
                $this->log("[OVERRIDE PROTECTED] Artist '{$artistName}' locked to '{$overrideGenre}' (manual override). Skipping API.");
                $updateStmt = $this->db->prepare("UPDATE events SET genre = :genre, genre_source = 'manual', genre_locked = 1 WHERE LOWER(artist_name) = LOWER(:artist)");
                $updateStmt->execute([':genre' => $overrideGenre, ':artist' => $artistName]);
                continue;
            }

            // Check if any event for this artist is explicitly genre_locked = 1
            $checkLockStmt = $this->db->prepare("SELECT COUNT(*) FROM events WHERE LOWER(artist_name) = LOWER(:artist) AND genre_locked = 1");
            $checkLockStmt->execute([':artist' => $artistName]);
            if ((int)$checkLockStmt->fetchColumn() > 0) {
                $this->log("[OVERRIDE PROTECTED] Artist '{$artistName}' has locked events (genre_locked = 1). Skipping API.");
                $updateStmt = $this->db->prepare("UPDATE events SET genre_source = 'manual', genre_locked = 1 WHERE LOWER(artist_name) = LOWER(:artist) AND genre_locked = 1");
                $updateStmt->execute([':artist' => $artistName]);
                continue;
            }

            if (!$this->artistNeedsNormalization($artistName)) {
                $this->log("[SKIP] Artist '{$artistName}' already normalized and unlocked rows are up to date.");
                continue;
            }

            // If this row is likely a combined lineup string, normalize component artists first.
            if ($this->isLikelyLineupName($artistName)) {
                $lineupArtists = $this->splitLineupArtists($artistName);
                if (count($lineupArtists) > 1) {
                    $collectedTags = [];
                    foreach ($lineupArtists as $lineupArtist) {
                        $resolvedTags = $this->resolveTagsForSingleArtist($lineupArtist, (string)$apiKey);
                        if ($resolvedTags === '') {
                            continue;
                        }

                        foreach (explode(',', $resolvedTags) as $tag) {
                            $cleanTag = trim($tag);
                            if ($cleanTag !== '' && !in_array($cleanTag, $collectedTags, true)) {
                                $collectedTags[] = $cleanTag;
                            }
                        }
                    }

                    if (!empty($collectedTags)) {
                        $lineupTagsStr = implode(', ', array_slice($collectedTags, 0, 6));
                        $lineupBucket = $this->mapTagsToBucket($lineupTagsStr);
                        $updateStmt = $this->db->prepare("UPDATE events SET genre = :genre, tags = :tags, genre_source = 'lastfm', lastfm_normalized_at = CURRENT_TIMESTAMP WHERE LOWER(artist_name) = LOWER(:artist) AND genre_locked = 0");
                        $updateStmt->execute([':genre' => $lineupBucket, ':tags' => $lineupTagsStr, ':artist' => $artistName]);
                        $this->log("[LINEUP NORMALIZATION] '{$artistName}' mapped via component artists -> '{$lineupBucket}' [Tags: {$lineupTagsStr}]");
                        $normalizedCount++;
                        continue;
                    }

                    $this->log("[INFO] No community tags returned from Last.fm for lineup '{$artistName}'. Retaining existing genre.");
                    continue;
                }
            }

            // 2. Local Database & Cache Check First
            $cacheStmt = $this->db->prepare("SELECT tags, checked_at FROM artist_genre_cache WHERE LOWER(artist_name) = LOWER(:artist)");
            $cacheStmt->execute([':artist' => $artistName]);
            $cacheRow = $cacheStmt->fetch(PDO::FETCH_ASSOC);

            if (!empty($cacheRow) && !empty($cacheRow['tags'])) {
                $cachedTags = $cacheRow['tags'];
                $newBucket = $this->mapTagsToBucket($cachedTags);
                
                // Update events from local cache
                $updateStmt = $this->db->prepare("UPDATE events SET genre = :genre, tags = COALESCE(NULLIF(tags, ''), :tags), genre_source = 'lastfm', lastfm_normalized_at = CURRENT_TIMESTAMP WHERE LOWER(artist_name) = LOWER(:artist) AND genre_locked = 0");
                $updateStmt->execute([':genre' => $newBucket, ':tags' => $cachedTags, ':artist' => $artistName]);

                $this->log("[LOCAL CACHE HIT] Artist '{$artistName}' mapped via cached tags ('{$cachedTags}') -> '{$newBucket}'. Bypassing API.");
                $normalizedCount++;
                continue;
            }

            if (!empty($cacheRow)) {
                $cachedTags = trim((string)($cacheRow['tags'] ?? ''));
                $checkedAtTs = isset($cacheRow['checked_at']) ? strtotime((string)$cacheRow['checked_at']) : false;
                if ($cachedTags === '' && $checkedAtTs !== false && (time() - $checkedAtTs) < $this->emptyTagsRetrySeconds) {
                    $this->log("[LASTFM CACHE] Artist '{$artistName}' recently returned no tags. Skipping API retry this run.");
                    continue;
                }
            }

            // If Last.fm API Key is missing, skip HTTP fetching
            if (empty($apiKey)) {
                $this->log("[WARN] LASTFM_API_KEY is not configured. Skipping external Last.fm API calls.");
                break;
            }

            // 3. Strict Rate Limiting / Micro-sleep Pacing
            $this->log("[LASTFM API PACING] Enforcing 250ms pacing delay before querying Last.fm for '{$artistName}'...");
            usleep($this->requestDelayUs);

            $url = "https://ws.audioscrobbler.com/2.0/?method=artist.gettoptags&artist=" . rawurlencode($artistName) . "&api_key=" . urlencode($apiKey) . "&format=json";

            $ch = curl_init();
            curl_setopt($ch, CURLOPT_URL, $url);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_USERAGENT, 'NyctosGigGrid/2.0 ( contact@nycto.ninja )');
            curl_setopt($ch, CURLOPT_TIMEOUT, 8);
            $response = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            // 4. Rate-Limit & Error Fallback Logic
            if ($httpCode === 429) {
                $this->log("[RATE-LIMIT 429] Last.fm rate limit hit for '{$artistName}'. Falling back to original aggregator genre. Will retry next run.");
                continue;
            }

            if ($httpCode !== 200 || empty($response)) {
                $this->log("[WARN] Last.fm API returned HTTP {$httpCode} for '{$artistName}'. Retaining existing aggregator genre.");
                continue;
            }

            $data = json_decode($response, true);
            $tagsList = [];
            if (!empty($data['toptags']['tag']) && is_array($data['toptags']['tag'])) {
                foreach ($data['toptags']['tag'] as $t) {
                    if (isset($t['name']) && trim($t['name']) !== '') {
                        $tagsList[] = trim($t['name']);
                        if (count($tagsList) >= 6) {
                            break;
                        }
                    }
                }
            }

            if (empty($tagsList)) {
                $this->log("[INFO] No community tags returned from Last.fm for '{$artistName}'. Retaining existing genre.");
                // Cache empty result to avoid hitting API repeatedly
                $cacheSave = $this->db->prepare("INSERT OR REPLACE INTO artist_genre_cache (artist_name, is_metal, tags, checked_at) VALUES (:artist, 0, '', CURRENT_TIMESTAMP)");
                $cacheSave->execute([':artist' => $artistName]);
                continue;
            }

            $tagsStr = implode(', ', $tagsList);
            $newBucket = $this->mapTagsToBucket($tagsStr);

            // Update artist_genre_cache
            $cacheSave = $this->db->prepare("INSERT OR REPLACE INTO artist_genre_cache (artist_name, is_metal, tags, checked_at) VALUES (:artist, 1, :tags, CURRENT_TIMESTAMP)");
            $cacheSave->execute([':artist' => $artistName, ':tags' => $tagsStr]);

            // Get old genre for logging
            $oldGenreStmt = $this->db->prepare("SELECT genre, source FROM events WHERE LOWER(artist_name) = LOWER(:artist) LIMIT 1");
            $oldGenreStmt->execute([':artist' => $artistName]);
            $oldRow = $oldGenreStmt->fetch(PDO::FETCH_ASSOC);
            $oldGenre = $oldRow['genre'] ?? 'Unknown';
            $oldSource = $oldRow['source'] ?? 'ticketmaster';

            // Update events
            $updateStmt = $this->db->prepare("UPDATE events SET genre = :genre, tags = :tags, genre_source = 'lastfm', lastfm_normalized_at = CURRENT_TIMESTAMP WHERE LOWER(artist_name) = LOWER(:artist) AND genre_locked = 0");
            $updateStmt->execute([':genre' => $newBucket, ':tags' => $tagsStr, ':artist' => $artistName]);

            $this->log("[GENRE NORMALIZATION] Artist '{$artistName}': '{$oldGenre}' ({$oldSource}) -> '{$newBucket}' (lastfm) [Tags: {$tagsStr}]");
            $normalizedCount++;
        }

        $this->log("Completed Last.fm genre normalization. Processed {$normalizedCount} artist updates.");
        return $normalizedCount;
    }
}
