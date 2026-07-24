<?php

/** Artist details lookup service */
function fetchArtistDetails($artistName) {
    $db = getDbConnection();
    
    // 1. Check SQLite Cache
    try {
        $stmt = $db->prepare("SELECT bio_summary, top_tags, last_updated FROM artist_details_cache WHERE LOWER(artist_name) = LOWER(:name)");
        $stmt->execute([':name' => $artistName]);
        $cached = $stmt->fetch();
    } catch (Exception $e) {
        $cached = false;
    }
    
    $cacheTTL = 7 * 86400; // 7 days
    if ($cached !== false) {
        $lastUpdated = strtotime($cached['last_updated']);
        if ((time() - $lastUpdated) < $cacheTTL) {
            $cachedBio = trim($cached['bio_summary']);
            if ($cachedBio === 'NONE' || empty($cachedBio) || strpos($cachedBio, '<a href') === 0 || trim(strip_tags($cachedBio)) === '') {
                return [
                    'bio_summary' => "No bio summary available for " . htmlspecialchars($artistName) . " yet.",
                    'top_tags' => array_filter(array_map('trim', explode(',', $cached['top_tags'])))
                ];
            }
            return [
                'bio_summary' => $cachedBio,
                'top_tags' => array_filter(array_map('trim', explode(',', $cached['top_tags'])))
            ];
        }
    }
    
    // 2. Fetch from Last.fm API if configured
    $apiKey = defined('LASTFM_API_KEY') ? LASTFM_API_KEY : '';
    $bio = '';
    $tags = [];
    
    if (!empty($apiKey)) {
        $url = "https://ws.audioscrobbler.com/2.0/?method=artist.getinfo&artist=" . urlencode($artistName) . "&api_key=" . urlencode($apiKey) . "&format=json";

        $result = fetchHttpResource($url, [
            'timeout' => 6,
            'user_agent' => 'MetalConcertCalendar/1.0 (contact@nycto.ninja)'
        ]);

        if ($result['status'] === 200 && !empty($result['body'])) {
            $response = $result['body'];
            $data = json_decode($response, true);
            if (isset($data['artist'])) {
                $artistData = $data['artist'];
                if (isset($artistData['bio']['summary'])) {
                    $rawBio = trim($artistData['bio']['summary']);
                    // Strip Last.fm "Read more on Last.fm" anchor tags
                    $cleanBio = trim(preg_replace('/<a\s+href="[^"]*">Read more on Last\.fm<\/a>\.?/i', '', $rawBio));
                    $plainBio = trim(strip_tags($cleanBio));
                    if (!empty($plainBio) && strtolower($plainBio) !== 'read more on last.fm') {
                        $bio = $cleanBio;
                    }
                }
                if (isset($artistData['tags']['tag']) && is_array($artistData['tags']['tag'])) {
                    foreach ($artistData['tags']['tag'] as $t) {
                        if (isset($t['name'])) {
                            $tags[] = trim($t['name']);
                        }
                    }
                }
            }
        }
    }
    
    // 3. Fallback: Query Wikipedia Search + Page Summary APIs (Keyless, free & extremely accurate)
    if (empty($bio)) {
        $searchQuery = $artistName . " band";
        $searchUrl = "https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=" . urlencode($searchQuery) . "&utf8=1&format=json";

        $searchResult = fetchHttpResource($searchUrl, [
            'timeout' => 6,
            'user_agent' => 'MetalPassport/1.0 (contact@nycto.ninja)'
        ]);

        if ($searchResult['status'] === 200 && !empty($searchResult['body'])) {
            $searchResponse = $searchResult['body'];
            $searchData = json_decode($searchResponse, true);
            $results = $searchData['query']['search'] ?? [];
            
            $bestTitle = null;
            $musicKeywords = ["band", "group", "musician", "singer", "rapper", "duo", "trio", "project", "metal", "rock", "punk", "music", "composer", "pop", "hip", "artist", "orchestra", "act", "guitarist"];
            $lowerArtist = strtolower($artistName);
            
            // Phase 1: Look for explicit parenthetical helpers containing the artist name
            foreach ($results as $r) {
                $title = $r['title'] ?? '';
                $titleLower = strtolower($title);
                if (strpos($titleLower, $lowerArtist) !== false && strpos($titleLower, '(') !== false && strpos($titleLower, ')') !== false) {
                    $hasMusicTerm = false;
                    foreach (["band", "musician", "singer", "group", "duo", "trio", "project", "swedish band", "american band"] as $term) {
                        if (strpos($titleLower, $term) !== false) {
                            $hasMusicTerm = true;
                            break;
                        }
                    }
                    if ($hasMusicTerm) {
                        $bestTitle = $title;
                        break;
                    }
                }
            }
            
            // Phase 2: Look for title that contains the exact artist name and matches music keywords in title/snippet
            if (empty($bestTitle)) {
                foreach ($results as $r) {
                    $title = $r['title'] ?? '';
                    $titleLower = strtolower($title);
                    $snippet = strtolower($r['snippet'] ?? '');
                    if (strpos($titleLower, $lowerArtist) !== false) {
                        $hasMusicTerm = false;
                        foreach ($musicKeywords as $kw) {
                            if (strpos($snippet, $kw) !== false || strpos($titleLower, $kw) !== false) {
                                $hasMusicTerm = true;
                                break;
                            }
                        }
                        if ($hasMusicTerm) {
                            $bestTitle = $title;
                            break;
                        }
                    }
                }
            }
            
            // Phase 3: Fallback to first result ONLY if it contains the artist name
            if (empty($bestTitle) && !empty($results)) {
                $firstTitle = $results[0]['title'] ?? '';
                if (strpos(strtolower($firstTitle), $lowerArtist) !== false) {
                    $bestTitle = $firstTitle;
                }
            }
            
            if (!empty($bestTitle)) {
                // Fetch page summary
                $summaryUrl = "https://en.wikipedia.org/api/rest_v1/page/summary/" . urlencode(str_replace(' ', '_', $bestTitle));

                $summaryResult = fetchHttpResource($summaryUrl, [
                    'timeout' => 6,
                    'user_agent' => 'MetalPassport/1.0 (contact@nycto.ninja)'
                ]);

                if ($summaryResult['status'] === 200 && !empty($summaryResult['body'])) {
                    $summaryResponse = $summaryResult['body'];
                    $summaryData = json_decode($summaryResponse, true);
                    $pageType = $summaryData['type'] ?? '';
                    $description = strtolower($summaryData['description'] ?? '');
                    
                    // Music keyword checks
                    $isMusic = false;
                    foreach ($musicKeywords as $kw) {
                        if (strpos($description, $kw) !== false) {
                            $isMusic = true;
                            break;
                        }
                    }
                    
                    if ($pageType !== 'disambiguation' && strpos($description, 'disambiguation') === false && $isMusic) {
                        $bio = $summaryData['extract'] ?? '';
                        
                        // Style tags mapping
                        if (strpos($description, 'metalcore') !== false) {
                            $tags[] = 'metalcore';
                        } elseif (strpos($description, 'metal') !== false) {
                            $tags[] = 'metal';
                        }
                        if (strpos($description, 'rock') !== false) {
                            $tags[] = 'rock';
                        }
                        if (strpos($description, 'punk') !== false) {
                            $tags[] = 'punk';
                        }
                        if (strpos($description, 'alternative') !== false) {
                            $tags[] = 'alternative';
                        }
                        if (strpos($description, 'indie') !== false) {
                            $tags[] = 'indie';
                        }
                        if (strpos($description, 'pop') !== false) {
                            $tags[] = 'pop';
                        }
                    }
                }
            }
        }
    }
    
    // 4. Handle Empty/Failure State
    if (empty($bio)) {
        // Cache as 'NONE' so we don't spam requests on repeat clicks
        try {
            $stmtSave = $db->prepare("INSERT OR REPLACE INTO artist_details_cache (artist_name, bio_summary, top_tags, last_updated) VALUES (:name, 'NONE', '', CURRENT_TIMESTAMP)");
            $stmtSave->execute([':name' => $artistName]);
        } catch (Exception $e) {}
        return [
            'bio_summary' => "No bio summary available for " . htmlspecialchars($artistName) . " yet.",
            'top_tags' => $tags
        ];
    }
    
    // Fallback tags from events metadata
    if (empty($tags)) {
        try {
            $stmtTags = $db->prepare("SELECT tags FROM events WHERE LOWER(artist_name) = LOWER(:name) AND tags IS NOT NULL LIMIT 1");
            $stmtTags->execute([':name' => $artistName]);
            $eventTags = $stmtTags->fetchColumn();
            if ($eventTags) {
                $tags = array_filter(array_map('trim', explode(',', $eventTags)));
            }
        } catch (Exception $e) {}
    }
    
    if (empty($tags)) {
        $tags = ["music"];
    }
    
    // Cache positive result
    $tagsStr = implode(',', $tags);
    try {
        $stmtSave = $db->prepare("INSERT OR REPLACE INTO artist_details_cache (artist_name, bio_summary, top_tags, last_updated) VALUES (:name, :bio, :tags, CURRENT_TIMESTAMP)");
        $stmtSave->execute([
            ':name' => $artistName,
            ':bio' => $bio,
            ':tags' => $tagsStr
        ]);
    } catch (Exception $e) {}
    
    return [
        'bio_summary' => $bio,
        'top_tags' => $tags
    ];
}
