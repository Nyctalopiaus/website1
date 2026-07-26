<?php

/** Event aggregation service */
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../db/connection.php';
require_once __DIR__ . '/../db/schema.php';
require_once __DIR__ . '/../actions/common.php';
require_once __DIR__ . '/../genre_buckets.php';
require_once __DIR__ . '/../genre_overrides.php';
require_once __DIR__ . '/../ignored_tags.php';

class EventAggregator {
    private $db;
    private $logs = [];
    private $genreOverrides = [];
    private $venuesByMarket = [];
    private $runMetrics = [];

    public function __construct() {
        $this->db = getDbConnection();
        ensureDatabaseSchema($this->db);
        $this->genreOverrides = getGenreOverridesNormalized();
        $this->loadVenueWhitelist();
        $this->initRunMetrics();
    }

    private function initRunMetrics() {
        $this->runMetrics = [
            'started_at' => date('c'),
            'markets_processed' => [],
            'ingestion' => [],
            'enrichment' => [
                'musicbrainz_auto_approved_artists' => [],
                'unknown_tags_written' => [],
                'unknown_tags_write_count' => 0,
            ],
            'errors' => [
                'http_non_200' => [],
                'connection_failures' => [],
                'scraper_dropouts' => [],
                'warnings' => [],
                'fatal' => [],
            ],
        ];
    }

    private function normalizeSourceKey($source) {
        $clean = trim((string)$source);
        return $clean !== '' ? $clean : 'unknown';
    }

    private function ensureIngestionBucket($source, $market) {
        $sourceKey = $this->normalizeSourceKey($source);
        $marketKey = $this->normalizeMarketKey($market) ?? 'front-range';

        if (!isset($this->runMetrics['ingestion'][$sourceKey])) {
            $this->runMetrics['ingestion'][$sourceKey] = [];
        }
        if (!isset($this->runMetrics['ingestion'][$sourceKey][$marketKey])) {
            $this->runMetrics['ingestion'][$sourceKey][$marketKey] = [
                'added' => 0,
                'updated' => 0,
                'purged' => 0,
            ];
        }

        $this->runMetrics['markets_processed'][$marketKey] = true;
        return [$sourceKey, $marketKey];
    }

    private function bumpIngestionCount($source, $market, $field, $delta = 1) {
        if (!in_array($field, ['added', 'updated', 'purged'], true)) {
            return;
        }

        list($sourceKey, $marketKey) = $this->ensureIngestionBucket($source, $market);
        $this->runMetrics['ingestion'][$sourceKey][$marketKey][$field] += (int)$delta;
    }

    public function recordPurgedCount($source, $market, $delta = 1) {
        $this->bumpIngestionCount($source, $market, 'purged', $delta);
    }

    public function recordAutoApprovedArtists(array $names) {
        foreach ($names as $name) {
            $clean = trim((string)$name);
            if ($clean === '') {
                continue;
            }
            $this->runMetrics['enrichment']['musicbrainz_auto_approved_artists'][strtolower($clean)] = $clean;
        }
    }

    private function appendUniqueError(&$bucket, $entry) {
        if (empty($entry)) {
            return;
        }
        if (!in_array($entry, $bucket, true)) {
            $bucket[] = $entry;
        }
    }

    public function recordHttpNon200($source, $market, $httpCode, $context) {
        $entry = sprintf('%s | market=%s | http=%s | %s', $this->normalizeSourceKey($source), $this->normalizeMarketKey($market) ?? 'unknown', (string)$httpCode, trim((string)$context));
        $this->appendUniqueError($this->runMetrics['errors']['http_non_200'], $entry);
    }

    public function recordConnectionFailure($source, $market, $context) {
        $entry = sprintf('%s | market=%s | %s', $this->normalizeSourceKey($source), $this->normalizeMarketKey($market) ?? 'unknown', trim((string)$context));
        $this->appendUniqueError($this->runMetrics['errors']['connection_failures'], $entry);
    }

    public function recordScraperDropout($context) {
        $this->appendUniqueError($this->runMetrics['errors']['scraper_dropouts'], trim((string)$context));
    }

    private function parseLogForErrorBuckets($msg) {
        $text = trim((string)$msg);
        if ($text === '') {
            return;
        }

        $lower = strtolower($text);

        if (strpos($lower, '[fatal') !== false) {
            $this->appendUniqueError($this->runMetrics['errors']['fatal'], $text);
        }

        if (strpos($lower, '[warn') !== false || strpos($lower, '[error') !== false) {
            $this->appendUniqueError($this->runMetrics['errors']['warnings'], $text);
        }

        if ((strpos($lower, 'http code') !== false || preg_match('/\bhttp\s+\d{3}\b/i', $text)) &&
            strpos($lower, 'http 200') === false &&
            strpos($lower, 'http code 200') === false) {
            $this->appendUniqueError($this->runMetrics['errors']['http_non_200'], $text);
        }

        if (strpos($lower, 'failed connection handle') !== false ||
            strpos($lower, 'curl error') !== false ||
            strpos($lower, 'request failed') !== false ||
            strpos($lower, 'failed to load html') !== false) {
            $this->appendUniqueError($this->runMetrics['errors']['connection_failures'], $text);
        }

        if (strpos($lower, '[scraper]') !== false &&
            (strpos($lower, 'fallback') !== false || strpos($lower, 'failed') !== false || strpos($lower, 'dropout') !== false)) {
            $this->appendUniqueError($this->runMetrics['errors']['scraper_dropouts'], $text);
        }
    }

    public function log($msg) {
        $formatted = "[" . date('Y-m-d H:i:s') . "] " . $msg;
        $this->logs[] = $formatted;
        $this->parseLogForErrorBuckets($msg);
        if (php_sapi_name() === 'cli' || empty($_SERVER['REMOTE_ADDR'])) {
            echo $formatted . "\n";
        }
    }

    public function getLogs() {
        return $this->logs;
    }

    public function buildGenreBucketDistribution() {
        $rows = $this->db->query("SELECT market, genre, COUNT(*) AS count_total FROM events GROUP BY market, genre ORDER BY market ASC, count_total DESC")->fetchAll(PDO::FETCH_ASSOC);
        $dist = [];
        foreach ($rows as $row) {
            $market = $this->normalizeMarketKey($row['market'] ?? null) ?? 'front-range';
            if (!isset($dist[$market])) {
                $dist[$market] = [];
            }
            $dist[$market][(string)$row['genre']] = (int)$row['count_total'];
        }
        return $dist;
    }

    public function getRunReportData(array $context = []) {
        $runtimeSeconds = (float)($context['runtime_seconds'] ?? 0.0);
        $success = (bool)($context['success'] ?? false);
        $marketsProcessed = array_keys($this->runMetrics['markets_processed']);
        sort($marketsProcessed);

        return [
            'execution' => [
                'started_at' => $this->runMetrics['started_at'],
                'ended_at' => date('c'),
                'runtime_seconds' => $runtimeSeconds,
                'markets_processed' => $marketsProcessed,
                'markets_processed_count' => count($marketsProcessed),
                'success' => $success,
            ],
            'ingestion' => $this->runMetrics['ingestion'],
            'enrichment' => [
                'musicbrainz_auto_approved_count' => count($this->runMetrics['enrichment']['musicbrainz_auto_approved_artists']),
                'musicbrainz_auto_approved_artists' => array_values($this->runMetrics['enrichment']['musicbrainz_auto_approved_artists']),
                'genre_bucket_distribution' => $this->buildGenreBucketDistribution(),
                'unknown_tags_write_count' => (int)$this->runMetrics['enrichment']['unknown_tags_write_count'],
                'unknown_tags_written' => array_values($this->runMetrics['enrichment']['unknown_tags_written']),
            ],
            'errors' => $this->runMetrics['errors'],
        ];
    }

    public function seedApprovedArtistNames($artistName) {
        $names = $this->splitPerformerNames($artistName);
        if (empty($names)) {
            $fallback = trim((string)$artistName);
            $names = $fallback !== '' ? [$fallback] : [];
        }

        if (empty($names)) {
            return [];
        }

        $stmtSeed = $this->db->prepare("INSERT OR IGNORE INTO metal_artists (artist_name) VALUES (:name)");
        foreach ($names as $name) {
            $stmtSeed->execute([':name' => $name]);
        }

        return $names;
    }

    public function isIgnoredArtistName($artistName) {
        require_once __DIR__ . '/../ignored_artists.php';
        return isArtistIgnored($artistName);
    }

    public function purgeIgnoredEvents() {
        require_once __DIR__ . '/../ignored_artists.php';
        $ignored = getIgnoredArtistsNormalized();
        if (empty($ignored)) {
            return 0;
        }

        $purgedCount = 0;
        $stmt = $this->db->query("SELECT event_id, artist_name, source, market FROM events");
        $events = $stmt->fetchAll();

        foreach ($events as $e) {
            if (isArtistIgnored($e['artist_name'], $ignored)) {
                $market = $this->normalizeMarketKey($e['market'] ?? null) ?? 'front-range';
                $sources = array_filter(array_map('trim', explode(',', (string)($e['source'] ?? 'unknown'))));
                if (empty($sources)) {
                    $sources = ['unknown'];
                }
                foreach ($sources as $sourceName) {
                    $this->recordPurgedCount($sourceName, $market, 1);
                }

                $del = $this->db->prepare("DELETE FROM events WHERE event_id = :id");
                $del->execute([':id' => $e['event_id']]);
                $purgedCount++;
            }
        }

        if ($purgedCount > 0) {
            $this->log("[PURGE] Deleted {$purgedCount} ignored events from database.");
        }

        return $purgedCount;
    }

    /**
     * Checks if an artist exists in our local approved-artist lookup list. Supports co-headlining splits.
     */
    public function isMetalArtist($artistName) {
        $parts = $this->splitPerformerNames($artistName);
        foreach ($parts as $part) {
            $part = trim($part);
            if (empty($part)) continue;
            $stmt = $this->db->prepare("SELECT COUNT(*) FROM metal_artists WHERE LOWER(artist_name) = LOWER(:name)");
            $stmt->execute([':name' => $part]);
            if ($stmt->fetchColumn() > 0) {
                return true;
            }
        }
        return false;
    }

    public function fetchArtistGenreMetadata($artistName) {
        $parts = $this->splitPerformerNames($artistName);
        $allMetal = false;
        
        foreach ($parts as $part) {
            $part = trim($part);
            if (empty($part)) continue;

            // 1. Check local artist_genre_cache first
            $stmtCache = $this->db->prepare("SELECT is_metal FROM artist_genre_cache WHERE LOWER(artist_name) = LOWER(:name)");
            $stmtCache->execute([':name' => strtolower($part)]);
            $cachedVal = $stmtCache->fetchColumn();
            
            if ($cachedVal !== false) {
                if ($cachedVal == 1) {
                    $allMetal = true;
                }
                continue;
            }

            // 2. Query MusicBrainz API
            $url = "https://musicbrainz.org/ws/2/artist/?query=artist:" . urlencode($part) . "&fmt=json";
            
            $ch = curl_init();
            curl_setopt($ch, CURLOPT_URL, $url);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_USERAGENT, 'NyctosGigGrid/2.0 ( contact@nycto.ninja )');
            curl_setopt($ch, CURLOPT_TIMEOUT, 5);
            $response = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $curlError = curl_error($ch);
            curl_close($ch);

            if ($response === false || $httpCode === 0) {
                $this->recordConnectionFailure('MusicBrainz', 'all', "artist='{$part}' {$curlError}");
                continue;
            }

            if ($httpCode !== 200) {
                $this->recordHttpNon200('MusicBrainz', 'all', $httpCode, "artist='{$part}'");
                continue;
            }

            $data = json_decode($response, true);
            $isMetalThisPart = 0;
            $matchedTags = [];
            if (!empty($data['artists'][0]['tags'])) {
                $metalKeywords = ['metal', 'deathcore', 'metalcore', 'grindcore', 'hardcore', 'sludge', 'screamo', 'doom metal', 'black metal', 'death metal', 'thrash metal'];
                $rockKeywords = ['rock', 'grunge', 'hard rock', 'alternative', 'indie', 'post-rock'];
                
                // First check metal keywords
                foreach ($data['artists'][0]['tags'] as $tag) {
                    $tagName = strtolower($tag['name']);
                    foreach ($metalKeywords as $keyword) {
                        if (strpos($tagName, $keyword) !== false) {
                            $isMetalThisPart = 1; // Metal
                            break 2;
                        }
                    }
                }
                
                // If not metal, check rock keywords
                if ($isMetalThisPart === 0) {
                    foreach ($data['artists'][0]['tags'] as $tag) {
                        $tagName = strtolower($tag['name']);
                        foreach ($rockKeywords as $keyword) {
                            if (strpos($tagName, $keyword) !== false) {
                                $isMetalThisPart = 2; // Rock
                                break 2;
                            }
                        }
                    }
                }

                // Extract up to 2 descriptor tags matching the keywords
                $allKeywords = array_merge($metalKeywords, $rockKeywords);
                foreach ($data['artists'][0]['tags'] as $tag) {
                    $tagName = strtolower($tag['name']);
                    foreach ($allKeywords as $kw) {
                        if (strpos($tagName, $kw) !== false) {
                            $prettyTag = ucwords(str_replace('-', ' ', $tagName));
                            if (strtolower($prettyTag) === 'post hardcore') {
                                $prettyTag = 'Post-Hardcore';
                            }
                            if (!in_array($prettyTag, $matchedTags)) {
                                $matchedTags[] = $prettyTag;
                            }
                            break;
                        }
                    }
                    if (count($matchedTags) >= 2) {
                        break;
                    }
                }
            }
            $tagsStr = implode(', ', $matchedTags);
            
            // Save query result in local cache table to protect future runs
            $stmtSaveCache = $this->db->prepare("INSERT OR REPLACE INTO artist_genre_cache (artist_name, is_metal, tags) VALUES (:name, :val, :tags)");
            $stmtSaveCache->execute([':name' => $part, ':val' => $isMetalThisPart, ':tags' => $tagsStr]);
            
            if ($isMetalThisPart == 1 || $isMetalThisPart == 2) {
                $allMetal = true;
            }
            
            // Limit rate calls to prevent HTTP 503s
            usleep(250000); 
        }
        return $allMetal;
    }

    private function collectGenreSignals($artistName, $eventTags = null) {
        $signals = [];

        if (!empty($eventTags)) {
            $signals[] = strtolower($eventTags);
        }

        $parts = $this->splitPerformerNames($artistName);
        foreach ($parts as $part) {
            $part = trim($part);
            if ($part === '') {
                continue;
            }

            $signals[] = strtolower($part);

            $stmtCache = $this->db->prepare("SELECT tags FROM artist_genre_cache WHERE LOWER(artist_name) = LOWER(:name)");
            $stmtCache->execute([':name' => strtolower($part)]);
            $cachedTags = $stmtCache->fetchColumn();
            if (!empty($cachedTags)) {
                $signals[] = strtolower($cachedTags);
            }
        }

        return implode(' | ', array_filter($signals));
    }

    private function determineGenreBucket($artistName, $eventTags = null) {
        $overrideGenre = resolveArtistGenreOverride($artistName, $this->genreOverrides);
        if ($overrideGenre !== null) {
            return $overrideGenre;
        }

        // Log any unknown/unmapped tags
        if (!empty($eventTags)) {
            $this->logUnknownTags($eventTags);
        }

        $signals = $this->collectGenreSignals($artistName, $eventTags);
        $parts = preg_split('/[|,]/', strtolower($signals));
        $tags = array_filter(array_map('trim', $parts));

        $buckets = getGenreBucketConfig();
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

    private function logUnknownTags($tagsStr) {
        if (empty($tagsStr)) {
            return;
        }

        $buckets = getGenreBucketConfig();
        $knownTags = [];
        foreach ($buckets as $key => $bucket) {
            if (!empty($bucket['tags'])) {
                foreach ($bucket['tags'] as $t) {
                    $knownTags[strtolower($t)] = true;
                }
            }
        }

        $parts = array_filter(array_map('trim', explode(',', $tagsStr)));
        if (empty($parts)) {
            return;
        }

        $cacheDir = __DIR__ . '/../cache';
        if (!is_dir($cacheDir)) {
            mkdir($cacheDir, 0775, true);
        }
        $logPath = $cacheDir . '/unknown_genres.txt';

        $existing = [];
        if (file_exists($logPath)) {
            $lines = file($logPath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
            if (is_array($lines)) {
                foreach ($lines as $line) {
                    $existing[strtolower(trim($line))] = true;
                }
            }
        }

        foreach ($parts as $part) {
            $normalizedPart = strtolower($part);
            if (empty($part) || isset($knownTags[$normalizedPart]) || in_array($normalizedPart, ['metal', 'rock', 'punk', 'indie', 'extreme'])) {
                continue;
            }
            if (!isset($existing[$normalizedPart])) {
                $existing[$normalizedPart] = true;
                file_put_contents($logPath, $part . "\n", FILE_APPEND | LOCK_EX);
                $this->runMetrics['enrichment']['unknown_tags_write_count'] += 1;
                $this->runMetrics['enrichment']['unknown_tags_written'][$normalizedPart] = $part;
            }
        }
    }

    private function isCatchAllGenre($genre) {
        $normalized = strtolower(trim((string)$genre));
        return $normalized === 'all' || $normalized === 'uncategorized' || $normalized === '';
    }

    private function normalizeMarketKey($market) {
        $normalized = strtolower(trim((string)$market));
        if ($normalized === '') {
            return null;
        }

        $aliases = [
            'frontrange' => 'front-range',
            'front-range' => 'front-range',
            'colorado' => 'front-range',
            'co' => 'front-range',
            'socal' => 'socal',
            'california' => 'socal',
            'ca' => 'socal',
            'southern-california' => 'socal',
            'southern california' => 'socal',
            'la' => 'socal',
            'scotland' => 'scotland',
            'uk-scotland' => 'scotland'
        ];

        return $aliases[$normalized] ?? $normalized;
    }

    private function getMarketIngestionProfiles() {
        return [
            [
                'market' => 'front-range',
                'stateCode' => 'CO',
                'points' => [
                    ['latlong' => '39.7392,-104.9903', 'radius' => 120, 'unit' => 'miles'],
                    ['latlong' => '38.8339,-104.8214', 'radius' => 90, 'unit' => 'miles'],
                    ['latlong' => '39.0639,-108.5506', 'radius' => 100, 'unit' => 'miles'],
                    ['latlong' => '40.5853,-105.0844', 'radius' => 80, 'unit' => 'miles']
                ],
                'bandsintown_locations' => ['Denver,CO', 'Colorado Springs,CO', 'Fort Collins,CO', 'Grand Junction,CO']
            ],
            [
                'market' => 'socal',
                'stateCode' => 'CA',
                'points' => [
                    ['latlong' => '34.0522,-118.2437', 'radius' => 120, 'unit' => 'miles'],
                    ['latlong' => '37.7749,-122.4194', 'radius' => 120, 'unit' => 'miles'],
                    ['latlong' => '32.7157,-117.1611', 'radius' => 80, 'unit' => 'miles'],
                    ['latlong' => '38.5816,-121.4944', 'radius' => 100, 'unit' => 'miles'],
                    ['latlong' => '35.2828,-120.6596', 'radius' => 90, 'unit' => 'miles'],
                    ['latlong' => '40.5865,-122.3917', 'radius' => 100, 'unit' => 'miles']
                ],
                'bandsintown_locations' => ['Los Angeles,CA', 'San Francisco,CA', 'San Diego,CA', 'Sacramento,CA', 'San Luis Obispo,CA', 'Redding,CA']
            ],
            [
                'market' => 'scotland',
                'marketId' => '207',
                'points' => [
                    ['latlong' => '55.8642,-4.2518', 'radius' => 120, 'unit' => 'miles'],
                    ['latlong' => '55.9533,-3.1883', 'radius' => 100, 'unit' => 'miles'],
                    ['latlong' => '57.1497,-2.0943', 'radius' => 90, 'unit' => 'miles'],
                    ['latlong' => '57.4778,-4.2247', 'radius' => 100, 'unit' => 'miles']
                ],
                'bandsintown_locations' => ['Glasgow,Scotland', 'Edinburgh,Scotland', 'Aberdeen,Scotland', 'Inverness,Scotland']
            ]
        ];
    }

    public function getConfiguredMarkets() {
        $keys = [];
        foreach ($this->getMarketIngestionProfiles() as $profile) {
            $market = $this->normalizeMarketKey($profile['market'] ?? null);
            if ($market !== null) {
                $keys[$market] = true;
            }
        }
        $markets = array_keys($keys);
        sort($markets);
        return $markets;
    }

    private function simplifyVenueName($venueName) {
        $clean = preg_replace('/[^a-z0-9]/', '', strtolower((string)$venueName));
        $clean = str_replace('theatre', 'theater', $clean);

        $wordsToRemove = ['the', 'amphitheater', 'theater', 'musichall', 'music', 'hall', 'auditorium', 'ballroom', 'stadium', 'center', 'arena'];
        foreach ($wordsToRemove as $w) {
            $clean = str_replace($w, '', $clean);
        }

        return $clean;
    }

    /**
     * Split a multi-performer label into stable performer tokens.
     */
    private function splitPerformerNames($artistName) {
        $input = trim((string)$artistName);
        if ($input === '') {
            return [];
        }

        $parts = preg_split('/\s+(?:and|with)\s+|\s+w\/\s+|\s*&\s*|\s*,\s*|\s+\+\s+/i', $input);
        $names = [];
        foreach ($parts as $part) {
            $clean = trim((string)$part);
            if ($clean === '') {
                continue;
            }
            if (!in_array($clean, $names, true)) {
                $names[] = $clean;
            }
        }

        return !empty($names) ? $names : [$input];
    }

    /**
     * Preserve all known performers by unioning two performer strings.
     */
    private function mergePerformerNames($existingArtist, $incomingArtist) {
        $existingParts = $this->splitPerformerNames($existingArtist);
        $incomingParts = $this->splitPerformerNames($incomingArtist);

        if (empty($existingParts)) {
            return trim((string)$incomingArtist);
        }
        if (empty($incomingParts)) {
            return trim((string)$existingArtist);
        }

        $merged = [];
        foreach (array_merge($existingParts, $incomingParts) as $name) {
            if (!in_array($name, $merged, true)) {
                $merged[] = $name;
            }
        }

        return implode(' & ', $merged);
    }

    private function normalizeTicketStatusCode($statusCode) {
        $normalized = strtolower(trim((string)$statusCode));
        return $normalized !== '' ? $normalized : null;
    }

    private function availabilitySeverity($statusCode) {
        $code = $this->normalizeTicketStatusCode($statusCode);
        $weights = [
            'cancelled' => 5,
            'postponed' => 4,
            'rescheduled' => 3,
            'onsale' => 2,
            'offsale' => 1
        ];

        return $weights[$code] ?? 0;
    }

    private function deriveAvailabilityTagFromStatus($statusCode) {
        $code = $this->normalizeTicketStatusCode($statusCode);
        if ($code === null || $code === 'onsale') {
            return null;
        }

        $labels = [
            'cancelled' => 'Cancelled',
            'postponed' => 'Postponed',
            'rescheduled' => 'Rescheduled',
            'offsale' => 'Off Sale'
        ];

        return $labels[$code] ?? null;
    }

    private function mergeTicketStatusCode($existingStatus, $incomingStatus) {
        $existing = $this->normalizeTicketStatusCode($existingStatus);
        $incoming = $this->normalizeTicketStatusCode($incomingStatus);

        if ($incoming === null) {
            return $existing;
        }
        if ($existing === null) {
            return $incoming;
        }

        // Active onsale takes priority over offsale to prevent false offsale badges
        if (($existing === 'onsale' || $incoming === 'onsale') && 
            $existing !== 'cancelled' && $incoming !== 'cancelled' &&
            $existing !== 'postponed' && $incoming !== 'postponed' &&
            $existing !== 'rescheduled' && $incoming !== 'rescheduled') {
            return 'onsale';
        }

        return $this->availabilitySeverity($incoming) >= $this->availabilitySeverity($existing) ? $incoming : $existing;
    }

    private function loadVenueWhitelist() {
        $this->venuesByMarket = [];

        try {
            $rows = $this->db->query("SELECT venue_name, COALESCE(NULLIF(TRIM(market), ''), 'front-range') AS market FROM venues")->fetchAll(PDO::FETCH_ASSOC);
            foreach ($rows as $row) {
                $market = $this->normalizeMarketKey($row['market'] ?? 'front-range') ?? 'front-range';
                $name = trim((string)($row['venue_name'] ?? ''));
                if ($name === '') {
                    continue;
                }

                if (!isset($this->venuesByMarket[$market])) {
                    $this->venuesByMarket[$market] = [];
                }

                $nameLower = strtolower($name);
                if (!isset($this->venuesByMarket[$market][$nameLower])) {
                    $this->venuesByMarket[$market][$nameLower] = [
                        'name' => $name,
                        'name_lower' => $nameLower,
                        'name_simple' => $this->simplifyVenueName($name)
                    ];
                }
            }
        } catch (Exception $e) {
            // Fallback for pre-migration databases.
            foreach (COLORADO_VENUES as $venue) {
                $name = trim((string)$venue);
                if ($name === '') {
                    continue;
                }

                $nameLower = strtolower($name);
                if (!isset($this->venuesByMarket['front-range'])) {
                    $this->venuesByMarket['front-range'] = [];
                }
                if (!isset($this->venuesByMarket['front-range'][$nameLower])) {
                    $this->venuesByMarket['front-range'][$nameLower] = [
                        'name' => $name,
                        'name_lower' => $nameLower,
                        'name_simple' => $this->simplifyVenueName($name)
                    ];
                }
            }
        }
    }

    public function isEventInMarketRegion($market, $city = '', $region = '', $country = '') {
        $marketNorm = $this->normalizeMarketKey($market);
        $regionNorm = strtolower(trim((string)$region));
        $countryNorm = strtolower(trim((string)$country));

        // 1. Country validation
        if ($countryNorm !== '') {
            if ($marketNorm === 'front-range' || $marketNorm === 'socal') {
                if (!in_array($countryNorm, ['united states', 'us', 'usa', 'united states of america'], true)) {
                    return false;
                }
            } elseif ($marketNorm === 'scotland') {
                if (!in_array($countryNorm, ['united kingdom', 'uk', 'gb', 'scotland', 'great britain', 'england', 'wales'], true)) {
                    return false;
                }
            }
        }

        $cityNorm = strtolower(trim((string)$city));

        // 2. Region / State & City validation
        if ($marketNorm === 'front-range') {
            if ($regionNorm !== '' && !in_array($regionNorm, ['co', 'colorado', 'co.'], true)) {
                return false;
            }
        } elseif ($marketNorm === 'socal') {
            if ($regionNorm !== '' && !in_array($regionNorm, ['ca', 'california', 'ca.'], true)) {
                return false;
            }
        } elseif ($marketNorm === 'scotland') {
            if ($regionNorm !== '' && in_array($regionNorm, ['co', 'colorado', 'ca', 'california', 'wa', 'washington', 'or', 'oregon', 'tx', 'texas', 'mo', 'missouri', 'ne', 'nebraska', 'il', 'illinois', 'ny', 'new york'], true)) {
                return false;
            }
            if (preg_match('/\b(seattle|denver|omaha|kansas city|kansas|nashville|chicago|los angeles|san francisco|austin|portland|dallas|houston|atlanta|miami)\b/i', $cityNorm)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Returns matched venue + market context or null.
     */
    public function resolveTargetVenue($venueName, $marketHint = null, $locationHint = null) {
        $cleanVenue = strtolower(trim((string)$venueName));
        if ($cleanVenue === '') {
            return null;
        }

        if (is_array($locationHint)) {
            $city = $locationHint['city'] ?? '';
            $region = $locationHint['region'] ?? '';
            $country = $locationHint['country'] ?? '';
            if ($marketHint !== null && !$this->isEventInMarketRegion($marketHint, $city, $region, $country)) {
                return null;
            }
        }

        if (empty($this->venuesByMarket)) {
            $this->loadVenueWhitelist();
        }

        $hintMarket = $this->normalizeMarketKey($marketHint);
        $marketsToCheck = $hintMarket !== null ? [$hintMarket] : array_keys($this->venuesByMarket);
        $cleanSimple = $this->simplifyVenueName($cleanVenue);

        $best = null;
        $bestScore = -1;

        foreach ($marketsToCheck as $market) {
            if (empty($this->venuesByMarket[$market])) {
                continue;
            }

            foreach ($this->venuesByMarket[$market] as $entry) {
                $score = -1;
                $candidate = $entry['name_lower'];
                $candidateSimple = $entry['name_simple'];

                if ($cleanVenue === $candidate) {
                    $score = 1000 + strlen($candidate);
                } elseif (strlen($candidate) >= 6 && (strpos($cleanVenue, $candidate) !== false || strpos($candidate, $cleanVenue) !== false)) {
                    $lenDiff = abs(strlen($cleanVenue) - strlen($candidate));
                    if ($lenDiff <= 10) {
                        $score = 800 + min(strlen($candidate), strlen($cleanVenue)) - $lenDiff;
                    }
                } elseif ($cleanSimple !== '' && $candidateSimple !== '') {
                    if ($cleanSimple === $candidateSimple) {
                        $score = 700 + strlen($candidateSimple);
                    } elseif (strlen($candidateSimple) >= 6 && strlen($cleanSimple) >= 6) {
                        if (strpos($cleanSimple, $candidateSimple) !== false || strpos($candidateSimple, $cleanSimple) !== false) {
                            $lenDiff = abs(strlen($cleanSimple) - strlen($candidateSimple));
                            if ($lenDiff <= 8) {
                                $score = 600 + min(strlen($candidateSimple), strlen($cleanSimple)) - $lenDiff;
                            }
                        }
                    }
                }

                if ($score > $bestScore) {
                    $bestScore = $score;
                    $best = [
                        'market' => $market,
                        'venue_name' => $entry['name']
                    ];
                }
            }
        }

        if ($best === null && is_array($locationHint)) {
            $city = trim($locationHint['city'] ?? '');
            $region = strtoupper(trim($locationHint['region'] ?? ''));
            $country = strtoupper(trim($locationHint['country'] ?? ''));

            $targetMarket = null;
            if ($region === 'CO' || strtolower($region) === 'colorado') {
                $targetMarket = 'front-range';
            } elseif ($region === 'CA' || strtolower($region) === 'california') {
                $targetMarket = 'socal';
            } elseif (in_array($country, ['GB', 'UK', 'SCOTLAND', 'GREAT BRITAIN', 'UNITED KINGDOM'], true) || in_array(strtolower($region), ['scotland'], true)) {
                $targetMarket = 'scotland';
            }

            if ($targetMarket !== null) {
                try {
                    $vKey = preg_replace('/[^a-z0-9]/', '', strtolower($venueName));
                    $mapsUrl = 'https://www.google.com/maps/search/?api=1&query=' . urlencode($venueName . ' ' . $city);
                    $stmtInsert = $this->db->prepare("INSERT OR IGNORE INTO venues (venue_key, venue_name, address, city, maps_url, market) VALUES (:key, :name, :address, :city, :maps_url, :market)");
                    $stmtInsert->execute([
                        ':key' => $vKey,
                        ':name' => $venueName,
                        ':address' => !empty($city) ? $city : 'Address N/A',
                        ':city' => !empty($city) ? $city : 'Unknown',
                        ':maps_url' => $mapsUrl,
                        ':market' => $targetMarket
                    ]);
                } catch (Exception $e) {}

                $best = [
                    'market' => $targetMarket,
                    'venue_name' => $venueName
                ];
            }
        }

        return $best;
    }

    /**
     * Checks if the venue exists in the target venue whitelist.
     */
    public function isTargetVenue($venueName, $marketHint = null) {
        return $this->resolveTargetVenue($venueName, $marketHint) !== null;
    }

    /**
     * Creates a unique deduplication key based on venue and start date.
     */
    public function generateDedupeKey($artistName, $venueName, $startTimeStr, $marketHint = null) {
        $date = date('Y-m-d', strtotime($startTimeStr));
        // Isolate primary headliner so events from different feeds (single vs multi-artist) produce identical deduplication keys
        $parts = $this->splitPerformerNames($artistName);
        $primaryArtist = trim($parts[0] ?? $artistName);
        $cleanArtist = preg_replace('/[^a-z0-9]/', '', strtolower($primaryArtist));

        $resolvedVenue = $this->resolveTargetVenue($venueName, $marketHint);
        $venueForKey = $resolvedVenue ? $resolvedVenue['venue_name'] : $venueName;
        $cleanVenue = $this->simplifyVenueName($venueForKey);

        return md5($cleanArtist . '_' . $cleanVenue . '_' . $date);
    }

    /**
     * 1. Ingestion: Ticketmaster Discovery API
     */
    public function fetchTicketmaster() {
        $this->log("Starting Ticketmaster API query...");
        $apiKey = TICKETMASTER_API_KEY;
        $totalIngested = 0;

        foreach ($this->getMarketIngestionProfiles() as $profile) {
            $marketKey = $profile['market'];
            $marketIngested = 0;
            $this->log("[TICKETMASTER] Querying market '{$marketKey}'...");

            $queries = [];
            if (!empty($profile['stateCode'])) {
                $queries[] = 'stateCode=' . urlencode($profile['stateCode']);
            }
            if (!empty($profile['marketId'])) {
                $queries[] = 'marketId=' . urlencode($profile['marketId']);
            }
            if (!empty($profile['points'])) {
                foreach ($profile['points'] as $pt) {
                    $queries[] = 'latlong=' . urlencode($pt['latlong']) . '&radius=' . urlencode((string)$pt['radius']) . '&unit=' . urlencode($pt['unit'] ?? 'miles');
                }
            }

            foreach ($queries as $qParam) {
                for ($page = 0; $page < 5; $page++) {
                    if ($page > 0) {
                        usleep(200000);
                    }

                    $url = "https://app.ticketmaster.com/discovery/v2/events.json?apikey=" . urlencode($apiKey)
                        . "&" . $qParam
                        . "&classificationName=music&size=100&page=" . $page;

                $ch = curl_init();
                curl_setopt($ch, CURLOPT_URL, $url);
                curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
                if (defined('CURLOPT_ENCODING')) {
                    curl_setopt($ch, CURLOPT_ENCODING, 'gzip, deflate');
                }
                curl_setopt($ch, CURLOPT_USERAGENT, 'NyctosGigGridAggregator/1.0');
                curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 10);
                curl_setopt($ch, CURLOPT_TIMEOUT, 30);
                $response = curl_exec($ch);
                $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
                $curlError = curl_error($ch);
                curl_close($ch);

                if ($response === false || $httpCode === 0) {
                    $this->log("[ERROR] Ticketmaster failed connection handle on page {$page} for {$marketKey}: {$curlError}");
                    $this->recordConnectionFailure('Ticketmaster', $marketKey, "page={$page} {$curlError}");
                    continue;
                }

                if ($httpCode !== 200) {
                    $this->log("[ERROR] Ticketmaster API query returned HTTP code {$httpCode} on page {$page} for {$marketKey}");
                    $this->recordHttpNon200('Ticketmaster', $marketKey, $httpCode, "page={$page}");
                    continue;
                }

                $data = json_decode($response, true);
                if (empty($data['_embedded']['events'])) {
                    continue;
                }

                foreach ($data['_embedded']['events'] as $event) {
                    $rawVenueName = $event['_embedded']['venues'][0]['name'] ?? 'Unknown Venue';
                    $locationHint = [
                        'city' => $event['_embedded']['venues'][0]['city']['name'] ?? '',
                        'region' => $event['_embedded']['venues'][0]['state']['stateCode'] ?? '',
                        'country' => $event['_embedded']['venues'][0]['country']['name'] ?? ($event['_embedded']['venues'][0]['country']['countryCode'] ?? '')
                    ];
                    $resolvedVenue = $this->resolveTargetVenue($rawVenueName, $marketKey, $locationHint);
                    if ($resolvedVenue === null) {
                        continue;
                    }

                    $venueName = $resolvedVenue['venue_name'];
                    $market = $resolvedVenue['market'];
                    $city = $event['_embedded']['venues'][0]['city']['name'] ?? '';

                    // Preserve full co-headliners/openers if multiple attractions exist or if title includes "w/" / "with"
                    $attractions = $event['_embedded']['attractions'] ?? [];
                    $attNames = [];
                    foreach ($attractions as $att) {
                        $attName = trim((string)($att['name'] ?? ''));
                        if ($attName === '' || $this->isIgnoredArtistName($attName)) {
                            continue;
                        }
                        if (!in_array($attName, $attNames, true)) {
                            $attNames[] = $attName;
                        }
                    }

                    $artistName = !empty($attNames)
                        ? implode(' & ', $attNames)
                        : (($attractions[0]['name'] ?? '') !== '' ? trim((string)$attractions[0]['name']) : (string)$event['name']);

                    if (preg_match('/\b(w\/|with)\b/i', (string)$event['name'])) {
                        $nameDerived = $this->splitPerformerNames((string)$event['name']);
                        if (!empty($nameDerived)) {
                            foreach ($nameDerived as $candidate) {
                                if ($candidate !== '' && !$this->isIgnoredArtistName($candidate) && !in_array($candidate, $attNames, true)) {
                                    $attNames[] = $candidate;
                                }
                            }
                            if (!empty($attNames)) {
                                $artistName = implode(' & ', $attNames);
                            }
                        }
                    }

                    if ($this->isIgnoredArtistName($artistName)) {
                        $this->log("[IGNORE] Skipped blocked artist '{$artistName}' from Ticketmaster.");
                        continue;
                    }

                    $startTime = $event['dates']['start']['dateTime'] ?? (($event['dates']['start']['localDate'] ?? '') . 'T19:00:00Z');
                    $startTimeSql = date('Y-m-d H:i:s', strtotime($startTime));
                    $ticketUrl = $event['url'] ?? null;
                    $ticketStatusCode = $this->normalizeTicketStatusCode($event['dates']['status']['code'] ?? null);
                    $availabilityTag = $this->deriveAvailabilityTagFromStatus($ticketStatusCode);
                    $soldOutFlag = ($ticketStatusCode === 'offsale') ? 1 : 0;

                    $isMetal = $this->isMetalArtist($artistName);
                    if (!$isMetal) {
                        $isMetal = $this->fetchArtistGenreMetadata($artistName);
                        if ($isMetal) {
                            $approvedNames = $this->seedApprovedArtistNames($artistName);
                            $this->recordAutoApprovedArtists($approvedNames);
                            $this->log("[ENRICHMENT] Auto-approving performer(s) '" . implode("', '", $approvedNames) . "' via MusicBrainz genre match.");
                        }
                    }
                    $status = 'Approved';

                    $subGenre = $event['classifications'][0]['subGenre']['name'] ?? '';
                    if ($subGenre === 'Undefined') {
                        $subGenre = '';
                    }

                    $priceMin = null;
                    $priceMax = null;
                    if (!empty($event['priceRanges']) && is_array($event['priceRanges'])) {
                        foreach ($event['priceRanges'] as $pr) {
                            if (isset($pr['min']) && ($priceMin === null || $pr['min'] < $priceMin)) {
                                $priceMin = $pr['min'];
                            }
                            if (isset($pr['max']) && ($priceMax === null || $pr['max'] > $priceMax)) {
                                $priceMax = $pr['max'];
                            }
                        }
                    }

                    $this->saveEvent([
                        'event_id' => $this->generateDedupeKey($artistName, $venueName, $startTimeSql, $market),
                        'artist_name' => $artistName,
                        'venue_name' => $venueName,
                        'city_name' => $city,
                        'start_time' => $startTimeSql,
                        'ticket_url' => $ticketUrl,
                        'status' => $status,
                        'source' => 'Ticketmaster',
                        'tags' => $subGenre,
                        'price_min' => $priceMin,
                        'price_max' => $priceMax,
                        'ticket_status_code' => $ticketStatusCode,
                        'availability_tag' => $availabilityTag,
                        'sold_out_flag' => $soldOutFlag,
                        'market' => $market
                    ]);
                    $marketIngested++;
                    $totalIngested++;
                }
            }
        }

            $this->log("[TICKETMASTER] Processed {$marketIngested} events for {$marketKey}.");
        }

        $this->log("Processed {$totalIngested} music events from Ticketmaster.");
        return $totalIngested;
    }

    /**
     * 2. Ingestion: Bandsintown API (Discovery-First Geographic Search)
     */
    public function fetchBandsintown() {
        $this->log("[BANDSINTOWN] Public location search endpoint is deprecated by provider (HTTP 403). Routing seamlessly to registered artist ingestion pipeline...");
        return $this->fetchBandsintownFallback();
    }

    /**
     * Fallback for Bandsintown API: Queries all registered metal artists concurrently using curl_multi.
     */
    public function fetchBandsintownFallback($marketHint = null) {
        $marketLabel = $this->normalizeMarketKey($marketHint) ?? 'all-markets';
        $this->log("[FALLBACK] Querying Bandsintown events by artist registry concurrently for {$marketLabel}...");

        $artists = $this->db->query("SELECT artist_name FROM metal_artists")->fetchAll(PDO::FETCH_COLUMN);
        $appId = BANDSINTOWN_APP_ID;
        $totalIngestedCount = 0;

        // Batch into chunks of 35 parallel handles to prevent socket exhaustion & rate limiting
        $artistChunks = array_chunk($artists, 35);

        foreach ($artistChunks as $chunkIndex => $chunk) {
            $mh = curl_multi_init();
            $handles = [];

            foreach ($chunk as $artist) {
                $url = "https://rest.bandsintown.com/artists/" . rawurlencode($artist) . "/events?app_id=" . urlencode($appId);
                $ch = curl_init();
                curl_setopt($ch, CURLOPT_URL, $url);
                curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
                curl_setopt($ch, CURLOPT_USERAGENT, 'NyctosGigGrid/2.0');
                curl_setopt($ch, CURLOPT_TIMEOUT, 8);

                curl_multi_add_handle($mh, $ch);
                $handles[$artist] = $ch;
            }

            $running = null;
            do {
                curl_multi_exec($mh, $running);
                curl_multi_select($mh, 0.1);
            } while ($running > 0);

            foreach ($handles as $artist => $ch) {
                $response = curl_multi_getcontent($ch);
                $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
                $curlError = curl_error($ch);
                curl_multi_remove_handle($mh, $ch);
                curl_close($ch);

                if ($httpCode !== 200 || empty($response)) {
                    if ($response === false || $httpCode === 0) {
                        $this->recordConnectionFailure('Bandsintown', $marketHint, "fallback artist='{$artist}' {$curlError}");
                    } else {
                        $this->recordHttpNon200('Bandsintown', $marketHint, $httpCode, "fallback artist='{$artist}'");
                    }
                    continue;
                }

                $events = json_decode($response, true);
                if (!is_array($events)) {
                    continue;
                }

                foreach ($events as $event) {
                    $rawVenueName = $event['venue']['name'] ?? 'Unknown Venue';
                    $locationHint = [
                        'city' => $event['venue']['city'] ?? '',
                        'region' => $event['venue']['region'] ?? '',
                        'country' => $event['venue']['country'] ?? ''
                    ];
                    $resolvedVenue = $this->resolveTargetVenue($rawVenueName, $marketHint, $locationHint);
                    if ($resolvedVenue === null) {
                        continue;
                    }

                    $venueName = $resolvedVenue['venue_name'];
                    $market = $resolvedVenue['market'];
                    $lineup = $event['lineup'] ?? [];
                    $artistName = $artist;
                    if (!empty($lineup) && is_array($lineup)) {
                        $validArtists = [];
                        foreach ($lineup as $act) {
                            $actTrim = trim($act);
                            if (!empty($actTrim) && !$this->isIgnoredArtistName($actTrim)) {
                                $validArtists[] = $actTrim;
                            }
                        }
                        if (!empty($validArtists)) {
                            $artistName = implode(' & ', array_unique($validArtists));
                        }
                    }

                    if ($this->isIgnoredArtistName($artistName)) {
                        $this->log("[IGNORE] Skipped blocked artist '{$artistName}' from Bandsintown fallback.");
                        continue;
                    }

                    $startTime = $event['datetime'] ?? null;
                    if (empty($startTime)) {
                        continue;
                    }
                    $parsedTimestamp = strtotime($startTime);
                    if ($parsedTimestamp === false) {
                        continue;
                    }
                    $startTimeSql = date('Y-m-d H:i:s', $parsedTimestamp);

                    $ticketUrl = $event['url'] ?? $event['offers'][0]['url'] ?? null;
                    $status = 'Approved';
                    $city = !empty($event['venue']['city']) ? $event['venue']['city'] : ($locationHint['city'] ?? 'Denver');

                    $this->saveEvent([
                        'event_id' => $this->generateDedupeKey($artistName, $venueName, $startTimeSql, $market),
                        'artist_name' => $artistName,
                        'venue_name' => $venueName,
                        'city_name' => $city,
                        'start_time' => $startTimeSql,
                        'ticket_url' => $ticketUrl,
                        'status' => $status,
                        'source' => 'Bandsintown',
                        'market' => $market
                    ]);
                    $totalIngestedCount++;
                }
            }

            curl_multi_close($mh);
            usleep(50000); // 50ms pause between chunks to respect rate limits
        }

        $this->log("Processed {$totalIngestedCount} events via concurrent Bandsintown fallback search for {$marketLabel}.");
        return $totalIngestedCount;
    }

    private function estimatePriceRange($venueName) {
        $venueLower = strtolower($venueName);
        
        // Tier 3: Premium ($50+)
        if (strpos($venueLower, 'ball arena') !== false || 
            strpos($venueLower, "fiddler's green") !== false || 
            strpos($venueLower, 'fiddlers green') !== false) {
            return ['min' => 55.00, 'max' => 150.00];
        }
        
        // Tier 2: Moderate ($30 - $60)
        if (strpos($venueLower, 'red rocks') !== false || 
            strpos($venueLower, 'mission ballroom') !== false || 
            strpos($venueLower, 'fillmore') !== false ||
            strpos($venueLower, 'bellco') !== false) {
            return ['min' => 39.50, 'max' => 85.00];
        }
        
        // Tier 1 (Low-Mid): Club/Theater ($20 - $35)
        if (strpos($venueLower, 'bluebird') !== false || 
            strpos($venueLower, 'ogden') !== false || 
            strpos($venueLower, 'gothic') !== false || 
            strpos($venueLower, 'summit') !== false || 
            strpos($venueLower, 'cervantes') !== false || 
            strpos($venueLower, 'blue arena') !== false || 
            strpos($venueLower, 'mishawaka') !== false) {
            return ['min' => 25.00, 'max' => 45.00];
        }
        
        // Tier 1 (Low): Small Clubs ($15 - $25)
        if (strpos($venueLower, 'marquis') !== false || 
            strpos($venueLower, 'black sheep') !== false || 
            strpos($venueLower, 'sunshine') !== false || 
            strpos($venueLower, 'surfside') !== false || 
            strpos($venueLower, 'moxi') !== false || 
            strpos($venueLower, 'junkyard') !== false) {
            return ['min' => 18.00, 'max' => 30.00];
        }
        
        // Default Fallback
        return ['min' => 20.00, 'max' => 40.00];
    }

    private function normalizePriceValue($value) {
        if ($value === null || $value === '') {
            return null;
        }

        if (!is_numeric($value)) {
            return null;
        }

        return round((float)$value, 2);
    }

    private function hasPriceDropped($previousMin, $nextMin) {
        if ($previousMin === null || $nextMin === null) {
            return false;
        }

        return ($nextMin + 0.009) < $previousMin;
    }

    private function hasPriceChanged($previousMin, $previousMax, $nextMin, $nextMax) {
        if ($previousMin === null && $nextMin !== null) {
            return true;
        }
        if ($previousMin !== null && $nextMin === null) {
            return true;
        }
        if ($previousMax === null && $nextMax !== null) {
            return true;
        }
        if ($previousMax !== null && $nextMax === null) {
            return true;
        }

        $minChanged = $previousMin !== null && $nextMin !== null && abs($previousMin - $nextMin) > 0.009;
        $maxChanged = $previousMax !== null && $nextMax !== null && abs($previousMax - $nextMax) > 0.009;
        return $minChanged || $maxChanged;
    }

    private function extractLowTicketFlag($event, $fallback = 0) {
        foreach (['low_ticket_warning', 'low_ticket_flag', 'low_inventory'] as $key) {
            if (!array_key_exists($key, $event)) {
                continue;
            }

            $raw = $event[$key];
            if (is_bool($raw)) {
                return $raw ? 1 : 0;
            }

            if (is_numeric($raw)) {
                return ((int)$raw) > 0 ? 1 : 0;
            }

            $str = strtolower(trim((string)$raw));
            if (in_array($str, ['1', 'true', 'yes', 'low', 'limited', 'few', 'few left'], true)) {
                return 1;
            }
            if (in_array($str, ['0', 'false', 'no', 'normal', 'ok', 'available'], true)) {
                return 0;
            }
        }

        return ((int)$fallback) > 0 ? 1 : 0;
    }

    private function recordPriceSnapshot($eventId, $priceMin, $priceMax, $source, $dropAmount = 0.0, $dropDetected = false) {
        if ($priceMin === null && $priceMax === null) {
            return;
        }

        $stmtHistory = $this->db->prepare("INSERT INTO event_price_history (
            event_id, observed_price_min, observed_price_max, price_source, drop_amount, drop_detected
        ) VALUES (
            :event_id, :price_min, :price_max, :price_source, :drop_amount, :drop_detected
        )");

        $stmtHistory->execute([
            ':event_id' => $eventId,
            ':price_min' => $priceMin,
            ':price_max' => $priceMax,
            ':price_source' => $source,
            ':drop_amount' => $dropAmount,
            ':drop_detected' => $dropDetected ? 1 : 0
        ]);
    }

    /**
     * Deduplication & Storage logic
     */
    public function saveEvent($event) {
        if ($this->isIgnoredArtistName($event['artist_name'] ?? '')) {
            $this->log("[IGNORE] Did not save blocked artist '{$event['artist_name']}'.");
            return false;
        }

        $incomingMarket = $this->normalizeMarketKey($event['market'] ?? null);
        if ($incomingMarket === null) {
            $resolvedVenue = $this->resolveTargetVenue($event['venue_name'] ?? '', null);
            $incomingMarket = $resolvedVenue['market'] ?? 'front-range';
        }

        $event['city_name'] = !empty(trim((string)($event['city_name'] ?? ''))) ? trim((string)$event['city_name']) : 'Denver';

        // Fallback to venue price estimates if price_min is missing or null
        $priceMin = isset($event['price_min']) ? $this->normalizePriceValue($event['price_min']) : null;
        $priceMax = isset($event['price_max']) ? $this->normalizePriceValue($event['price_max']) : null;
        $incomingLowTicketFlag = $this->extractLowTicketFlag($event, 0);
        $incomingTicketStatusCode = $this->normalizeTicketStatusCode($event['ticket_status_code'] ?? null);
        $incomingAvailabilityTag = trim((string)($event['availability_tag'] ?? ''));
        if ($incomingAvailabilityTag === '') {
            $incomingAvailabilityTag = $this->deriveAvailabilityTagFromStatus($incomingTicketStatusCode);
        }
        $incomingSoldOutFlag = isset($event['sold_out_flag'])
            ? ((int)$event['sold_out_flag'] > 0 ? 1 : 0)
            : (($incomingTicketStatusCode === 'offsale') ? 1 : 0);
        
        if ($priceMin === null) {
            $estimated = $this->estimatePriceRange($event['venue_name']);
            $priceMin = $this->normalizePriceValue($estimated['min']);
            $priceMax = $this->normalizePriceValue($estimated['max']);
        }
        
        // Determine one of the 4 frontend filter buckets. Any uncategorized show safely
        // maps into the Rock & Metal catch-all (`metal`) so nothing falls through.
        $genre = $this->determineGenreBucket($event['artist_name'], $event['tags'] ?? null);

        // Construct tags dynamically from event input or artist cache
        $tags = [];
        if (!empty($event['tags'])) {
            $tags[] = $event['tags'];
        }
        
        $parts = $this->splitPerformerNames($event['artist_name']);
        foreach ($parts as $part) {
            $part = trim($part);
            if (empty($part)) continue;
            $stmtCache = $this->db->prepare("SELECT tags FROM artist_genre_cache WHERE LOWER(artist_name) = LOWER(:name)");
            $stmtCache->execute([':name' => strtolower($part)]);
            $cachedTags = $stmtCache->fetchColumn();
            if (!empty($cachedTags)) {
                $cTags = explode(',', $cachedTags);
                foreach ($cTags as $ct) {
                    $ct = trim($ct);
                    if (!empty($ct) && !in_array($ct, $tags)) {
                        $tags[] = $ct;
                    }
                }
            }
        }
        $tags = array_slice($tags, 0, 2);
        $tagsStr = !empty($tags) ? implode(', ', $tags) : null;

        // Check if event already exists
        $stmt = $this->db->prepare("SELECT * FROM events WHERE event_id = :id");
        $stmt->execute([':id' => $event['event_id']]);
        $existing = $stmt->fetch();

        if ($existing) {
            $existingLocked = (int)($existing['genre_locked'] ?? 0);
            $existingGenreSource = strtolower(trim((string)($existing['genre_source'] ?? '')));

            if ($existingLocked === 1 || $existingGenreSource === 'manual') {
                $mergedGenre = $existing['genre'];
                $mergedTags = $existing['tags'];
                $mergedGenreSource = 'manual';
                $mergedGenreLocked = 1;
            } elseif ($existingGenreSource === 'lastfm') {
                $mergedGenre = $existing['genre'];
                $mergedTags = $existing['tags'];
                $mergedGenreSource = 'lastfm';
                $mergedGenreLocked = 0;
            } else {
                $mergedGenre = $genre;
                $existingGenre = strtolower(trim((string)($existing['genre'] ?? '')));
                if ($this->isCatchAllGenre($genre) && !$this->isCatchAllGenre($existingGenre)) {
                    $mergedGenre = $existingGenre;
                }
                $mergedTags = !empty($existing['tags']) ? $existing['tags'] : $tagsStr;
                $mergedGenreSource = strtolower($event['source'] ?? 'ticketmaster');
                $mergedGenreLocked = 0;
            }

            // Deduplication merge logic:
            // 1. Keep status 'Approved' if either is approved
            $mergedStatus = 'Approved';
            
            // 2. Keep the ticket URL that is longer/more valid
            $mergedUrl = (strlen($event['ticket_url'] ?? '') > strlen($existing['ticket_url'] ?? '')) ? $event['ticket_url'] : $existing['ticket_url'];
            
            // 3. Merge and deduplicate sources to prevent repeat names
            $sources = array_filter(array_map('trim', explode(',', $existing['source'])));
            if (!in_array($event['source'], $sources)) {
                $sources[] = $event['source'];
            }
            $mergedSource = implode(',', $sources);

            // 4. Merge artist name: union performer lists so support acts are retained across sources.
            $existingArtist = $existing['artist_name'];
            $incomingArtist = $event['artist_name'];
            $mergedArtist = $this->mergePerformerNames($existingArtist, $incomingArtist);

            // 5. Merge prices
            $existingPriceMin = $this->normalizePriceValue($existing['price_min'] ?? null);
            $existingPriceMax = $this->normalizePriceValue($existing['price_max'] ?? null);

            $mergedPriceMin = isset($event['price_min']) && $event['price_min'] !== null
                ? $this->normalizePriceValue($event['price_min'])
                : $existingPriceMin;
            $mergedPriceMax = isset($event['price_max']) && $event['price_max'] !== null
                ? $this->normalizePriceValue($event['price_max'])
                : $existingPriceMax;
            if ($mergedPriceMin === null) {
                $mergedPriceMin = $priceMin;
                $mergedPriceMax = $priceMax;
            }

            $priceChanged = $this->hasPriceChanged($existingPriceMin, $existingPriceMax, $mergedPriceMin, $mergedPriceMax);
            $dropDetected = $this->hasPriceDropped($existingPriceMin, $mergedPriceMin);

            $priceDropFlag = (int)($existing['price_dropped_flag'] ?? 0);
            $priceDropAmount = $existing['price_drop_amount'] ?? null;
            $priceDropDetectedAt = $existing['price_drop_detected_at'] ?? null;

            if ($dropDetected) {
                $priceDropFlag = 1;
                $priceDropAmount = round($existingPriceMin - $mergedPriceMin, 2);
                $priceDropDetectedAt = date('Y-m-d H:i:s');
            } elseif ($priceChanged && $existingPriceMin !== null && $mergedPriceMin !== null && $mergedPriceMin > $existingPriceMin) {
                // Price increased: clear stale drop alert.
                $priceDropFlag = 0;
                $priceDropAmount = null;
                $priceDropDetectedAt = null;
            }

            $priceLastChangedAt = $priceChanged ? date('Y-m-d H:i:s') : ($existing['price_last_changed_at'] ?? null);
            $lowTicketFlag = $this->extractLowTicketFlag($event, (int)($existing['low_ticket_flag'] ?? 0));
            $existingMarket = $this->normalizeMarketKey($existing['market'] ?? null) ?? 'front-range';
            $mergedMarket = $incomingMarket ?: $existingMarket;
            $existingTicketStatusCode = $this->normalizeTicketStatusCode($existing['ticket_status_code'] ?? null);
            $mergedTicketStatusCode = $this->mergeTicketStatusCode($existingTicketStatusCode, $incomingTicketStatusCode);
            $mergedAvailabilityTag = null;
            if ($this->availabilitySeverity($incomingTicketStatusCode) >= $this->availabilitySeverity($existingTicketStatusCode)) {
                $mergedAvailabilityTag = $incomingAvailabilityTag;
            }
            if ($mergedAvailabilityTag === null || trim((string)$mergedAvailabilityTag) === '') {
                $mergedAvailabilityTag = trim((string)($existing['availability_tag'] ?? ''));
            }
            if ($mergedAvailabilityTag === '') {
                $mergedAvailabilityTag = $this->deriveAvailabilityTagFromStatus($mergedTicketStatusCode);
            }
            $existingSoldOutFlag = (int)($existing['sold_out_flag'] ?? 0);
            $mergedSoldOutFlag = ($mergedTicketStatusCode === 'offsale' || $incomingSoldOutFlag === 1 || $existingSoldOutFlag === 1) ? 1 : 0;
            
            $stmtUpdate = $this->db->prepare("UPDATE events SET 
                artist_name = :artist,
                venue_name = :venue,
                city_name = :city,
                market = :market,
                start_time = :start,
                ticket_url = :url,
                status = :status,
                source = :source,
                genre = :genre,
                tags = :tags,
                genre_source = :genre_source,
                genre_locked = :genre_locked,
                price_min = :price_min,
                price_max = :price_max,
                price_last_changed_at = :price_last_changed_at,
                price_dropped_flag = :price_dropped_flag,
                price_drop_amount = :price_drop_amount,
                price_drop_detected_at = :price_drop_detected_at,
                low_ticket_flag = :low_ticket_flag,
                ticket_status_code = :ticket_status_code,
                availability_tag = :availability_tag,
                sold_out_flag = :sold_out_flag
                WHERE event_id = :id");
                
            executeWithRetry($stmtUpdate, [
                ':artist' => $mergedArtist,
                ':venue' => $event['venue_name'],
                ':city' => $event['city_name'],
                ':market' => $mergedMarket,
                ':start' => $event['start_time'],
                ':url' => $mergedUrl,
                ':status' => $mergedStatus,
                ':source' => $mergedSource,
                ':genre' => $mergedGenre,
                ':tags' => $mergedTags,
                ':genre_source' => $mergedGenreSource,
                ':genre_locked' => $mergedGenreLocked,
                ':price_min' => $mergedPriceMin,
                ':price_max' => $mergedPriceMax,
                ':price_last_changed_at' => $priceLastChangedAt,
                ':price_dropped_flag' => $priceDropFlag,
                ':price_drop_amount' => $priceDropAmount,
                ':price_drop_detected_at' => $priceDropDetectedAt,
                ':low_ticket_flag' => $lowTicketFlag,
                ':ticket_status_code' => $mergedTicketStatusCode,
                ':availability_tag' => $mergedAvailabilityTag,
                ':sold_out_flag' => $mergedSoldOutFlag,
                ':id' => $event['event_id']
            ]);

            if ($priceChanged) {
                $this->recordPriceSnapshot(
                    $event['event_id'],
                    $mergedPriceMin,
                    $mergedPriceMax,
                    $event['source'] ?? null,
                    $dropDetected ? (float)$priceDropAmount : 0.0,
                    $dropDetected
                );
            }

            $this->bumpIngestionCount($event['source'] ?? 'unknown', $mergedMarket, 'updated', 1);
        } else {
            // New entry insert
            $isManualOverride = (resolveArtistGenreOverride($event['artist_name'], $this->genreOverrides) !== null);
            $initialGenreSource = $isManualOverride ? 'manual' : strtolower($event['source'] ?? 'ticketmaster');
            $initialGenreLocked = $isManualOverride ? 1 : 0;

            $stmtInsert = $this->db->prepare("INSERT INTO events (
                event_id, artist_name, venue_name, city_name, market, start_time, ticket_url, status, source, genre, tags, genre_source, genre_locked, price_min, price_max,
                price_last_changed_at, price_dropped_flag, price_drop_amount, price_drop_detected_at, low_ticket_flag, ticket_status_code, availability_tag, sold_out_flag
            ) VALUES (
                :id, :artist, :venue, :city, :market, :start, :url, :status, :source, :genre, :tags, :genre_source, :genre_locked, :price_min, :price_max,
                :price_last_changed_at, :price_dropped_flag, :price_drop_amount, :price_drop_detected_at, :low_ticket_flag, :ticket_status_code, :availability_tag, :sold_out_flag
            )");
            
            $initialChangedAt = ($priceMin !== null || $priceMax !== null) ? date('Y-m-d H:i:s') : null;
            executeWithRetry($stmtInsert, [
                ':id' => $event['event_id'],
                ':artist' => $event['artist_name'],
                ':venue' => $event['venue_name'],
                ':city' => $event['city_name'],
                ':market' => $incomingMarket,
                ':start' => $event['start_time'],
                ':url' => $event['ticket_url'],
                ':status' => $event['status'],
                ':source' => $event['source'],
                ':genre' => $genre,
                ':tags' => $tagsStr,
                ':genre_source' => $initialGenreSource,
                ':genre_locked' => $initialGenreLocked,
                ':price_min' => $priceMin,
                ':price_max' => $priceMax,
                ':price_last_changed_at' => $initialChangedAt,
                ':price_dropped_flag' => 0,
                ':price_drop_amount' => null,
                ':price_drop_detected_at' => null,
                ':low_ticket_flag' => $incomingLowTicketFlag,
                ':ticket_status_code' => $incomingTicketStatusCode,
                ':availability_tag' => ($incomingAvailabilityTag !== '' ? $incomingAvailabilityTag : $this->deriveAvailabilityTagFromStatus($incomingTicketStatusCode)),
                ':sold_out_flag' => $incomingSoldOutFlag
            ]);

            $this->recordPriceSnapshot(
                $event['event_id'],
                $priceMin,
                $priceMax,
                $event['source'] ?? null,
                0.0,
                false
            );

            $this->bumpIngestionCount($event['source'] ?? 'unknown', $incomingMarket, 'added', 1);
        }

        return true;
    }
}
