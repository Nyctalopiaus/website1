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

    public function __construct() {
        $this->db = getDbConnection();
        $this->ignoredArtists = getIgnoredArtistsNormalized();
        $this->genreOverrides = getGenreOverridesNormalized();
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

        $signals = $this->collectGenreSignals($artistName, $eventTags);

        $buckets = getGenreBucketConfig();
        $extremeKeywords = $buckets['extreme']['keywords'];
        $punkKeywords = $buckets['punk']['keywords'];
        $indieKeywords = $buckets['indie']['keywords'];

        foreach ($extremeKeywords as $keyword) {
            if (strpos($signals, strtolower($keyword)) !== false) {
                return 'extreme';
            }
        }

        foreach ($punkKeywords as $keyword) {
            if (strpos($signals, strtolower($keyword)) !== false) {
                return 'punk';
            }
        }

        foreach ($indieKeywords as $keyword) {
            if (strpos($signals, strtolower($keyword)) !== false) {
                return 'indie';
            }
        }

        // Catch-all bucket: anything not explicitly classified elsewhere lives under Rock & Metal.
        return 'metal';
    }

    private function isCatchAllGenre($genre) {
        $normalized = strtolower(trim((string)$genre));
        return $normalized === 'metal' || $normalized === 'rock' || $normalized === '';
    }

    /**
     * Checks if the venue exists in the target Front Range venue whitelist
     */
    public function isTargetVenue($venueName) {
        $cleanVenue = strtolower(trim($venueName));
        foreach (COLORADO_VENUES as $whitelisted) {
            if ($cleanVenue === $whitelisted || strpos($cleanVenue, $whitelisted) !== false) {
                return true;
            }
        }
        return false;
    }

    /**
     * Creates a unique deduplication key based on venue and start date
     */
    public function generateDedupeKey($artistName, $venueName, $startTimeStr) {
        // Parse date (ignore precise times to catch offsets/timezone shifts)
        $date = date('Y-m-d', strtotime($startTimeStr));
        
        // Clean artist name (remove punctuation, lower case)
        $cleanArtist = preg_replace('/[^a-z0-9]/', '', strtolower($artistName));
        
        // Clean strings (remove punctuation, lower case)
        $cleanVenue = preg_replace('/[^a-z0-9]/', '', strtolower($venueName));
        $cleanVenue = str_replace('theatre', 'theater', $cleanVenue);
        
        $wordsToRemove = ['the', 'amphitheater', 'theater', 'musichall', 'music', 'hall', 'auditorium', 'ballroom', 'stadium', 'center', 'arena'];
        foreach ($wordsToRemove as $w) {
            $cleanVenue = str_replace($w, '', $cleanVenue);
        }
        
        // Normalize venue variations by mapping them back to whitelisted keywords
        foreach (COLORADO_VENUES as $whitelisted) {
            $cleanWhite = preg_replace('/[^a-z0-9]/', '', strtolower($whitelisted));
            $cleanWhite = str_replace('theatre', 'theater', $cleanWhite);
            foreach ($wordsToRemove as $w) {
                $cleanWhite = str_replace($w, '', $cleanWhite);
            }
            if (!empty($cleanWhite) && (strpos($cleanVenue, $cleanWhite) !== false || strpos($cleanWhite, $cleanVenue) !== false)) {
                $cleanVenue = $cleanWhite;
                break;
            }
        }
        
        return md5($cleanArtist . '_' . $cleanVenue . '_' . $date);
    }

    /**
     * 1. Ingestion: Ticketmaster Discovery API
     */
    public function fetchTicketmaster() {
        $this->log("Starting Ticketmaster API query...");
        $apiKey = TICKETMASTER_API_KEY;
        $totalIngested = 0;
        
        // Fetch up to 3 pages of size 150 to get a more complete list of upcoming Colorado shows
        for ($page = 0; $page < 3; $page++) {
            if ($page > 0) {
                usleep(250000); // Polite rate-limiting sleep (250ms)
            }
            // Query music events within 100 miles of Denver coordinates, filtering by Rock (KnvZfZ7vAeA), Metal (KnvZfZ7vAvt) and Alternative (KnvZfZ7vAAE) genres
            $url = "https://app.ticketmaster.com/discovery/v2/events.json?apikey=" . urlencode($apiKey) . "&latlong=39.7392,-104.9903&radius=100&unit=miles&classificationName=music&genreId=KnvZfZ7vAvt,KnvZfZ7vAAE,KnvZfZ7vAeA&size=150&page=" . $page;
            
            $ch = curl_init();
            curl_setopt($ch, CURLOPT_URL, $url);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_USERAGENT, 'MetalCalendarAggregator/1.0');
            curl_setopt($ch, CURLOPT_TIMEOUT, 15);
            $response = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            if ($httpCode !== 200) {
                $this->log("[ERROR] Ticketmaster API query returned HTTP code " . $httpCode . " on page " . $page);
                continue;
            }

            $data = json_decode($response, true);
            if (empty($data['_embedded']['events'])) {
                continue;
            }

            foreach ($data['_embedded']['events'] as $event) {
                // Validate venue
                $venueName = $event['_embedded']['venues'][0]['name'] ?? 'Unknown Venue';
                if (!$this->isTargetVenue($venueName)) {
                    continue; // Skip venues outside our approved list
                }

                // Find city
                $city = $event['_embedded']['venues'][0]['city']['name'] ?? '';

                // Find artist name
                $artistName = $event['_embedded']['attractions'][0]['name'] ?? $event['name'];
                if ($this->isIgnoredArtistName($artistName)) {
                    $this->log("[IGNORE] Skipped blocked artist '{$artistName}' from Ticketmaster.");
                    continue;
                }
                
                // Format start time
                $startTime = $event['dates']['start']['dateTime'] ?? $event['dates']['start']['localDate'] . 'T19:00:00Z';
                $startTimeSql = date('Y-m-d H:i:s', strtotime($startTime));
                
                $ticketUrl = $event['url'] ?? null;

                // Public-facing flow: all ingested events are auto-approved, while
                // genre/tag enrichment still improves filter quality.
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

                // Parse standard ticket prices
                $priceMin = null;
                $priceMax = null;
                if (!empty($event['priceRanges']) && is_array($event['priceRanges'])) {
                    foreach ($event['priceRanges'] as $pr) {
                        if (isset($pr['min'])) {
                            if ($priceMin === null || $pr['min'] < $priceMin) {
                                $priceMin = $pr['min'];
                            }
                        }
                        if (isset($pr['max'])) {
                            if ($priceMax === null || $pr['max'] > $priceMax) {
                                $priceMax = $pr['max'];
                            }
                        }
                    }
                }

                // Insert or merge event
                $this->saveEvent([
                    'event_id' => $this->generateDedupeKey($artistName, $venueName, $startTimeSql),
                    'artist_name' => $artistName,
                    'venue_name' => $venueName,
                    'city_name' => $city,
                    'start_time' => $startTimeSql,
                    'ticket_url' => $ticketUrl,
                    'status' => $status,
                    'source' => 'Ticketmaster',
                    'tags' => $subGenre,
                    'price_min' => $priceMin,
                    'price_max' => $priceMax
                ]);
                $totalIngested++;
            }
        }

        $this->log("Processed " . $totalIngested . " music events from Ticketmaster.");
        return $totalIngested;
    }

    /**
     * 2. Ingestion: Bandsintown API (Discovery-First Geographic Search)
     */
    public function fetchBandsintown() {
        $this->log("Starting discovery-first Bandsintown API query by location...");
        $appId = BANDSINTOWN_APP_ID;
        $eventsCount = 0;
        
        // Search by location (Denver, CO) with a radius of 100 miles (which covers Colorado Springs to Fort Collins)
        $url = "https://rest.bandsintown.com/events/search?location=" . urlencode("Denver,CO") . "&radius=100&date=upcoming&app_id=" . urlencode($appId);
        
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_USERAGENT, 'FrontRangeMetalPassport/2.0');
        curl_setopt($ch, CURLOPT_TIMEOUT, 12);
        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode !== 200) {
            $this->log("[WARN] Bandsintown location search API returned HTTP code " . $httpCode . ". Falling back to concurrent artist-registry search...");
            return $this->fetchBandsintownFallback();
        }

        $events = json_decode($response, true);
        if (!is_array($events)) {
            $this->log("[WARN] Bandsintown response is invalid. Falling back to concurrent artist-registry search...");
            return $this->fetchBandsintownFallback();
        }

        foreach ($events as $event) {
            $venueName = $event['venue']['name'] ?? 'Unknown Venue';
            
            // Enforce target venue validation check
            if (!$this->isTargetVenue($venueName)) {
                continue; // Skip venues outside our corridor list
            }

            // Extract artist and city details
            $artistName = $event['artist']['name'] ?? ($event['lineup'][0] ?? 'Unknown Artist');
            if ($this->isIgnoredArtistName($artistName)) {
                $this->log("[IGNORE] Skipped blocked artist '{$artistName}' from Bandsintown.");
                continue;
            }
            $city = $event['venue']['city'] ?? '';
            $startTime = $event['datetime'];
            $startTimeSql = date('Y-m-d H:i:s', strtotime($startTime));
            
            $ticketUrl = $event['url'] ?? $event['offers'][0]['url'] ?? null;

            // Auto-classify artist (MusicBrainz fallback classification)
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
                'event_id' => $this->generateDedupeKey($artistName, $venueName, $startTimeSql),
                'artist_name' => $artistName,
                'venue_name' => $venueName,
                'city_name' => $city,
                'start_time' => $startTimeSql,
                'ticket_url' => $ticketUrl,
                'status' => $status,
                'source' => 'Bandsintown'
            ]);
            $eventsCount++;
        }

        $this->log("Processed " . $eventsCount . " music events from Bandsintown location search.");
        return $eventsCount;
    }

    /**
     * Fallback for Bandsintown API: Queries all registered metal artists concurrently using curl_multi.
     */
    public function fetchBandsintownFallback() {
        $this->log("[FALLBACK] Querying Bandsintown events by artist registry concurrently...");
        
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
        
        // Execute the handles concurrently
        $running = null;
        do {
            curl_multi_exec($mh, $running);
            curl_multi_select($mh);
        } while ($running > 0);
        
        $eventsCount = 0;
        
        // Retrieve responses
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
                // Must be Colorado state
                $region = $event['venue']['region'] ?? '';
                if (strtolower($region) !== 'co' && strtolower($region) !== 'colorado') {
                    continue;
                }
                
                $venueName = $event['venue']['name'] ?? 'Unknown Venue';
                if (!$this->isTargetVenue($venueName)) {
                    continue;
                }
                
                $city = $event['venue']['city'] ?? '';
                $startTime = $event['datetime'];
                $startTimeSql = date('Y-m-d H:i:s', strtotime($startTime));
                if ($this->isIgnoredArtistName($artist)) {
                    $this->log("[IGNORE] Skipped blocked artist '{$artist}' from Bandsintown fallback.");
                    continue;
                }
                
                $ticketUrl = $event['url'] ?? $event['offers'][0]['url'] ?? null;
                $status = 'Approved'; // Since they are in our metal_artists registry!
                
                $this->saveEvent([
                    'event_id' => $this->generateDedupeKey($artist, $venueName, $startTimeSql),
                    'artist_name' => $artist,
                    'venue_name' => $venueName,
                    'city_name' => $city,
                    'start_time' => $startTimeSql,
                    'ticket_url' => $ticketUrl,
                    'status' => $status,
                    'source' => 'Bandsintown'
                ]);
                $eventsCount++;
            }
        }
        curl_multi_close($mh);
        $this->log("Processed " . $eventsCount . " events via concurrent Bandsintown fallback search.");
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

    /**
     * Deduplication & Storage logic
     */
    public function saveEvent($event) {
        if ($this->isIgnoredArtistName($event['artist_name'] ?? '')) {
            $this->log("[IGNORE] Did not save blocked artist '{$event['artist_name']}'.");
            return false;
        }

        // Fallback to venue price estimates if price_min is missing or null
        $priceMin = isset($event['price_min']) ? $event['price_min'] : null;
        $priceMax = isset($event['price_max']) ? $event['price_max'] : null;
        
        if ($priceMin === null) {
            $estimated = $this->estimatePriceRange($event['venue_name']);
            $priceMin = $estimated['min'];
            $priceMax = $estimated['max'];
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
            $mergedPriceMin = isset($event['price_min']) && $event['price_min'] !== null ? $event['price_min'] : $existing['price_min'];
            $mergedPriceMax = isset($event['price_max']) && $event['price_max'] !== null ? $event['price_max'] : $existing['price_max'];
            if ($mergedPriceMin === null) {
                $mergedPriceMin = $priceMin;
                $mergedPriceMax = $priceMax;
            }
            
            $stmtUpdate = $this->db->prepare("UPDATE events SET 
                artist_name = :artist,
                venue_name = :venue,
                city_name = :city,
                start_time = :start,
                ticket_url = :url,
                status = :status,
                source = :source,
                genre = :genre,
                tags = :tags,
                price_min = :price_min,
                price_max = :price_max
                WHERE event_id = :id");
                
            $stmtUpdate->execute([
                ':artist' => $event['artist_name'],
                ':venue' => $event['venue_name'],
                ':city' => $event['city_name'],
                ':start' => $event['start_time'],
                ':url' => $mergedUrl,
                ':status' => $mergedStatus,
                ':source' => $mergedSource,
                ':genre' => $mergedGenre,
                ':tags' => $mergedTags,
                ':price_min' => $mergedPriceMin,
                ':price_max' => $mergedPriceMax,
                ':id' => $event['event_id']
            ]);
        } else {
            // New entry insert
            $stmtInsert = $this->db->prepare("INSERT INTO events (
                event_id, artist_name, venue_name, city_name, start_time, ticket_url, status, source, genre, tags, price_min, price_max
            ) VALUES (
                :id, :artist, :venue, :city, :start, :url, :status, :source, :genre, :tags, :price_min, :price_max
            )");
            
            $stmtInsert->execute([
                ':id' => $event['event_id'],
                ':artist' => $event['artist_name'],
                ':venue' => $event['venue_name'],
                ':city' => $event['city_name'],
                ':start' => $event['start_time'],
                ':url' => $event['ticket_url'],
                ':status' => $event['status'],
                ':source' => $event['source'],
                ':genre' => $genre,
                ':tags' => $tagsStr,
                ':price_min' => $priceMin,
                ':price_max' => $priceMax
            ]);
        }

        return true;
    }
}
