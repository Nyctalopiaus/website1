<?php

/** Event aggregation service */
require_once __DIR__ . '/../genre_buckets.php';
require_once __DIR__ . '/../ignored_artists.php';
require_once __DIR__ . '/../genre_overrides.php';

class EventAggregator {
    private $db;
    private $logs = [];
    private $ignoredArtists = [];
    private $genreOverrides = [];
    private $venuesByMarket = [];

    public function __construct() {
        $this->db = getDbConnection();
        $this->ignoredArtists = getIgnoredArtistsNormalized();
        $this->genreOverrides = getGenreOverridesNormalized();
        $this->loadVenueWhitelist();
    }

    public function log($msg) {
        $this->logs[] = "[" . date('H:i:s') . "] " . $msg;
    }

    public function getLogs() {
        return $this->logs;
    }

    public function isIgnoredArtistName($artistName) {
        return isArtistIgnored($artistName, $this->ignoredArtists);
    }

    public function purgeIgnoredEvents() {
        if (empty($this->ignoredArtists)) {
            return 0;
        }

        $removed = 0;
        $stmtSelect = $this->db->query("SELECT event_id, artist_name FROM events");
        $stmtDelete = $this->db->prepare("DELETE FROM events WHERE event_id = :id");

        foreach ($stmtSelect->fetchAll(PDO::FETCH_ASSOC) as $row) {
            if (!$this->isIgnoredArtistName($row['artist_name'] ?? '')) {
                continue;
            }

            $stmtDelete->execute([':id' => $row['event_id']]);
            $removed++;
        }

        if ($removed > 0) {
            $this->log("[IGNORE] Removed {$removed} stored events that match ignored artists.");
        }

        return $removed;
    }

    /**
     * Checks if an artist exists in our local metal lookup list. Support co-headlining splits.
     */
    public function isMetalArtist($artistName) {
        $parts = preg_split('/(\s+and\s+|\s*&\s*|\s*\/\s*|\s*,\s*)/i', $artistName);
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
        $parts = preg_split('/(\s+and\s+|\s*&\s*|\s*\/\s*|\s*,\s*)/i', $artistName);
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
            curl_setopt($ch, CURLOPT_USERAGENT, 'FrontRangeMetalPassport/2.0 ( contact@nycto.ninja )');
            curl_setopt($ch, CURLOPT_TIMEOUT, 5);
            $response = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            if ($httpCode !== 200) {
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

        $parts = preg_split('/(\s+and\s+|\s*&\s*|\s*\/\s*|\s*,\s*)/i', $artistName);
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
        $extremeTags = $buckets['extreme']['tags'] ?? [];
        $punkTags = $buckets['punk']['tags'] ?? [];
        $indieTags = $buckets['indie']['tags'] ?? [];
        $metalTags = $buckets['metal']['tags'] ?? [];

        foreach ($tags as $tag) {
            if (in_array($tag, $extremeTags)) {
                return 'extreme';
            }
        }

        foreach ($tags as $tag) {
            if (in_array($tag, $punkTags)) {
                return 'punk';
            }
        }

        foreach ($tags as $tag) {
            if (in_array($tag, $indieTags)) {
                return 'indie';
            }
        }

        foreach ($tags as $tag) {
            if (in_array($tag, $metalTags)) {
                return 'metal';
            }
        }

        return 'metal';
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
            }
        }
    }

    private function isCatchAllGenre($genre) {
        $normalized = strtolower(trim((string)$genre));
        return $normalized === 'metal' || $normalized === 'rock' || $normalized === '';
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
                'ticketmaster_latlong' => '39.7392,-104.9903',
                'ticketmaster_radius' => 100,
                'ticketmaster_unit' => 'miles',
                'bandsintown_location' => 'Denver,CO',
                'bandsintown_radius' => 100
            ],
            [
                'market' => 'socal',
                'ticketmaster_latlong' => '34.0522,-118.2437',
                'ticketmaster_radius' => 140,
                'ticketmaster_unit' => 'miles',
                'bandsintown_location' => 'Los Angeles,CA',
                'bandsintown_radius' => 140
            ],
            [
                'market' => 'scotland',
                'ticketmaster_latlong' => '55.8642,-4.2518',
                'ticketmaster_radius' => 140,
                'ticketmaster_unit' => 'miles',
                'bandsintown_location' => 'Glasgow,Scotland',
                'bandsintown_radius' => 140
            ]
        ];
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

    /**
     * Returns matched venue + market context or null.
     */
    public function resolveTargetVenue($venueName, $marketHint = null) {
        $cleanVenue = strtolower(trim((string)$venueName));
        if ($cleanVenue === '') {
            return null;
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
                } elseif (strpos($cleanVenue, $candidate) !== false || strpos($candidate, $cleanVenue) !== false) {
                    $score = 800 + min(strlen($candidate), strlen($cleanVenue));
                } elseif ($cleanSimple !== '' && $candidateSimple !== '' && ($cleanSimple === $candidateSimple || strpos($cleanSimple, $candidateSimple) !== false || strpos($candidateSimple, $cleanSimple) !== false)) {
                    $score = 600 + min(strlen($candidateSimple), strlen($cleanSimple));
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
        $cleanArtist = preg_replace('/[^a-z0-9]/', '', strtolower((string)$artistName));

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

            for ($page = 0; $page < 3; $page++) {
                if ($page > 0) {
                    usleep(250000);
                }

                $url = "https://app.ticketmaster.com/discovery/v2/events.json?apikey=" . urlencode($apiKey)
                    . "&latlong=" . urlencode($profile['ticketmaster_latlong'])
                    . "&radius=" . urlencode((string)$profile['ticketmaster_radius'])
                    . "&unit=" . urlencode($profile['ticketmaster_unit'])
                    . "&classificationName=music&genreId=KnvZfZ7vAvt,KnvZfZ7vAAE,KnvZfZ7vAeA&size=150&page=" . $page;

                $ch = curl_init();
                curl_setopt($ch, CURLOPT_URL, $url);
                curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
                curl_setopt($ch, CURLOPT_USERAGENT, 'MetalCalendarAggregator/1.0');
                curl_setopt($ch, CURLOPT_TIMEOUT, 15);
                $response = curl_exec($ch);
                $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
                curl_close($ch);

                if ($httpCode !== 200) {
                    $this->log("[ERROR] Ticketmaster API query returned HTTP code {$httpCode} on page {$page} for {$marketKey}");
                    continue;
                }

                $data = json_decode($response, true);
                if (empty($data['_embedded']['events'])) {
                    continue;
                }

                foreach ($data['_embedded']['events'] as $event) {
                    $rawVenueName = $event['_embedded']['venues'][0]['name'] ?? 'Unknown Venue';
                    $resolvedVenue = $this->resolveTargetVenue($rawVenueName, $marketKey);
                    if ($resolvedVenue === null) {
                        continue;
                    }

                    $venueName = $resolvedVenue['venue_name'];
                    $market = $resolvedVenue['market'];
                    $city = $event['_embedded']['venues'][0]['city']['name'] ?? '';

                    $artistName = $event['_embedded']['attractions'][0]['name'] ?? $event['name'];
                    if ($this->isIgnoredArtistName($artistName)) {
                        $this->log("[IGNORE] Skipped blocked artist '{$artistName}' from Ticketmaster.");
                        continue;
                    }

                    $startTime = $event['dates']['start']['dateTime'] ?? (($event['dates']['start']['localDate'] ?? '') . 'T19:00:00Z');
                    $startTimeSql = date('Y-m-d H:i:s', strtotime($startTime));
                    $ticketUrl = $event['url'] ?? null;

                    $isMetal = $this->isMetalArtist($artistName);
                    if (!$isMetal) {
                        $isMetal = $this->fetchArtistGenreMetadata($artistName);
                        if ($isMetal) {
                            $this->log("[ENRICHMENT] Auto-approving band '{$artistName}' via MusicBrainz genre match.");
                            $stmtSeed = $this->db->prepare("INSERT OR IGNORE INTO metal_artists (artist_name) VALUES (:name)");
                            $stmtSeed->execute([':name' => $artistName]);
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
                        'market' => $market
                    ]);
                    $marketIngested++;
                    $totalIngested++;
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
        $this->log("Starting discovery-first Bandsintown API query by location...");
        $appId = BANDSINTOWN_APP_ID;
        $totalEventsCount = 0;

        foreach ($this->getMarketIngestionProfiles() as $profile) {
            $marketKey = $profile['market'];
            $marketEventsCount = 0;

            $url = "https://rest.bandsintown.com/events/search?location=" . urlencode($profile['bandsintown_location'])
                . "&radius=" . urlencode((string)$profile['bandsintown_radius'])
                . "&date=upcoming&app_id=" . urlencode($appId);

            $ch = curl_init();
            curl_setopt($ch, CURLOPT_URL, $url);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_USERAGENT, 'FrontRangeMetalPassport/2.0');
            curl_setopt($ch, CURLOPT_TIMEOUT, 12);
            $response = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            if ($httpCode !== 200) {
                $this->log("[WARN] Bandsintown location search returned HTTP {$httpCode} for {$marketKey}. Falling back to artist-registry search...");
                $fallbackCount = $this->fetchBandsintownFallback($marketKey);
                $totalEventsCount += $fallbackCount;
                continue;
            }

            $events = json_decode($response, true);
            if (!is_array($events)) {
                $this->log("[WARN] Bandsintown response invalid for {$marketKey}. Falling back to artist-registry search...");
                $fallbackCount = $this->fetchBandsintownFallback($marketKey);
                $totalEventsCount += $fallbackCount;
                continue;
            }

            foreach ($events as $event) {
                $rawVenueName = $event['venue']['name'] ?? 'Unknown Venue';
                $resolvedVenue = $this->resolveTargetVenue($rawVenueName, $marketKey);
                if ($resolvedVenue === null) {
                    continue;
                }

                $venueName = $resolvedVenue['venue_name'];
                $market = $resolvedVenue['market'];
                $artistName = $event['artist']['name'] ?? ($event['lineup'][0] ?? 'Unknown Artist');
                if ($this->isIgnoredArtistName($artistName)) {
                    $this->log("[IGNORE] Skipped blocked artist '{$artistName}' from Bandsintown.");
                    continue;
                }

                $city = $event['venue']['city'] ?? '';
                $startTime = $event['datetime'];
                $startTimeSql = date('Y-m-d H:i:s', strtotime($startTime));
                $ticketUrl = $event['url'] ?? $event['offers'][0]['url'] ?? null;

                $isMetal = $this->isMetalArtist($artistName);
                if (!$isMetal) {
                    $isMetal = $this->fetchArtistGenreMetadata($artistName);
                    if ($isMetal) {
                        $this->log("[ENRICHMENT] Auto-approving band '{$artistName}' via MusicBrainz genre match.");
                        $stmtSeed = $this->db->prepare("INSERT OR IGNORE INTO metal_artists (artist_name) VALUES (:name)");
                        $stmtSeed->execute([':name' => $artistName]);
                    }
                }
                $status = 'Approved';

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
                $marketEventsCount++;
                $totalEventsCount++;
            }

            $this->log("[BANDSINTOWN] Processed {$marketEventsCount} events for {$marketKey} via location search.");
        }

        $this->log("Processed {$totalEventsCount} music events from Bandsintown location search.");
        return $totalEventsCount;
    }

    /**
     * Fallback for Bandsintown API: Queries all registered metal artists concurrently using curl_multi.
     */
    public function fetchBandsintownFallback($marketHint = null) {
        $marketLabel = $this->normalizeMarketKey($marketHint) ?? 'all-markets';
        $this->log("[FALLBACK] Querying Bandsintown events by artist registry concurrently for {$marketLabel}...");

        $artists = $this->db->query("SELECT artist_name FROM metal_artists")->fetchAll(PDO::FETCH_COLUMN);
        $appId = BANDSINTOWN_APP_ID;

        $mh = curl_multi_init();
        $handles = [];

        foreach ($artists as $artist) {
            $url = "https://rest.bandsintown.com/artists/" . rawurlencode($artist) . "/events?app_id=" . urlencode($appId);
            $ch = curl_init();
            curl_setopt($ch, CURLOPT_URL, $url);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_USERAGENT, 'FrontRangeMetalPassport/2.0');
            curl_setopt($ch, CURLOPT_TIMEOUT, 6);

            curl_multi_add_handle($mh, $ch);
            $handles[$artist] = $ch;
        }

        $running = null;
        do {
            curl_multi_exec($mh, $running);
            curl_multi_select($mh);
        } while ($running > 0);

        $eventsCount = 0;

        foreach ($handles as $artist => $ch) {
            $response = curl_multi_getcontent($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_multi_remove_handle($mh, $ch);
            curl_close($ch);

            if ($httpCode !== 200 || empty($response)) {
                continue;
            }

            $events = json_decode($response, true);
            if (!is_array($events)) {
                continue;
            }

            foreach ($events as $event) {
                $rawVenueName = $event['venue']['name'] ?? 'Unknown Venue';
                $resolvedVenue = $this->resolveTargetVenue($rawVenueName, $marketHint);
                if ($resolvedVenue === null) {
                    continue;
                }

                $venueName = $resolvedVenue['venue_name'];
                $market = $resolvedVenue['market'];
                $city = $event['venue']['city'] ?? '';
                $startTime = $event['datetime'];
                $startTimeSql = date('Y-m-d H:i:s', strtotime($startTime));

                if ($this->isIgnoredArtistName($artist)) {
                    $this->log("[IGNORE] Skipped blocked artist '{$artist}' from Bandsintown fallback.");
                    continue;
                }

                $ticketUrl = $event['url'] ?? $event['offers'][0]['url'] ?? null;
                $status = 'Approved';

                $this->saveEvent([
                    'event_id' => $this->generateDedupeKey($artist, $venueName, $startTimeSql, $market),
                    'artist_name' => $artist,
                    'venue_name' => $venueName,
                    'city_name' => $city,
                    'start_time' => $startTimeSql,
                    'ticket_url' => $ticketUrl,
                    'status' => $status,
                    'source' => 'Bandsintown',
                    'market' => $market
                ]);
                $eventsCount++;
            }
        }
        curl_multi_close($mh);
        $this->log("Processed {$eventsCount} events via concurrent Bandsintown fallback search for {$marketLabel}.");
        return $eventsCount;
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

        // Fallback to venue price estimates if price_min is missing or null
        $priceMin = isset($event['price_min']) ? $this->normalizePriceValue($event['price_min']) : null;
        $priceMax = isset($event['price_max']) ? $this->normalizePriceValue($event['price_max']) : null;
        $incomingLowTicketFlag = $this->extractLowTicketFlag($event, 0);
        
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
        
        $parts = preg_split('/(\s+and\s+|\s*&\s*|\s*\/\s*|\s*,\s*)/i', $event['artist_name']);
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
            $mergedGenre = $genre;
            $existingGenre = strtolower(trim((string)($existing['genre'] ?? '')));
            if ($this->isCatchAllGenre($genre) && !$this->isCatchAllGenre($existingGenre)) {
                // Prevent regressions when a later source lacks enough metadata and falls back to catch-all.
                $mergedGenre = $existingGenre;
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
            
            // 4. Merge tags (if existing is empty, use new ones; else merge)
            $mergedTags = $existing['tags'];
            if (empty($mergedTags)) {
                $mergedTags = $tagsStr;
            }

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
                price_min = :price_min,
                price_max = :price_max,
                price_last_changed_at = :price_last_changed_at,
                price_dropped_flag = :price_dropped_flag,
                price_drop_amount = :price_drop_amount,
                price_drop_detected_at = :price_drop_detected_at,
                low_ticket_flag = :low_ticket_flag
                WHERE event_id = :id");
                
            $stmtUpdate->execute([
                ':artist' => $event['artist_name'],
                ':venue' => $event['venue_name'],
                ':city' => $event['city_name'],
                ':market' => $mergedMarket,
                ':start' => $event['start_time'],
                ':url' => $mergedUrl,
                ':status' => $mergedStatus,
                ':source' => $mergedSource,
                ':genre' => $mergedGenre,
                ':tags' => $mergedTags,
                ':price_min' => $mergedPriceMin,
                ':price_max' => $mergedPriceMax,
                ':price_last_changed_at' => $priceLastChangedAt,
                ':price_dropped_flag' => $priceDropFlag,
                ':price_drop_amount' => $priceDropAmount,
                ':price_drop_detected_at' => $priceDropDetectedAt,
                ':low_ticket_flag' => $lowTicketFlag,
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
        } else {
            // New entry insert
            $stmtInsert = $this->db->prepare("INSERT INTO events (
                event_id, artist_name, venue_name, city_name, market, start_time, ticket_url, status, source, genre, tags, price_min, price_max,
                price_last_changed_at, price_dropped_flag, price_drop_amount, price_drop_detected_at, low_ticket_flag
            ) VALUES (
                :id, :artist, :venue, :city, :market, :start, :url, :status, :source, :genre, :tags, :price_min, :price_max,
                :price_last_changed_at, :price_dropped_flag, :price_drop_amount, :price_drop_detected_at, :low_ticket_flag
            )");
            
            $initialChangedAt = ($priceMin !== null || $priceMax !== null) ? date('Y-m-d H:i:s') : null;
            $stmtInsert->execute([
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
                ':price_min' => $priceMin,
                ':price_max' => $priceMax,
                ':price_last_changed_at' => $initialChangedAt,
                ':price_dropped_flag' => 0,
                ':price_drop_amount' => null,
                ':price_drop_detected_at' => null,
                ':low_ticket_flag' => $incomingLowTicketFlag
            ]);

            $this->recordPriceSnapshot(
                $event['event_id'],
                $priceMin,
                $priceMax,
                $event['source'] ?? null,
                0.0,
                false
            );
        }

        return true;
    }
}
