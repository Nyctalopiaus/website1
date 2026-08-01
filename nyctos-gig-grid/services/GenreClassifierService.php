<?php
/**
 * Genre Classifier Service - Last.fm & Subgenre Bucket Classification Engine
 */

class GenreClassifierService {
    private $db;

    public function __construct($dbConnection = null) {
        $this->db = $dbConnection;
    }

    public function isMetalArtist($artistName) {
        $norm = strtolower(trim((string)$artistName));
        if ($norm === '') return false;
        
        if (!$this->db) return false;
        try {
            $stmt = $this->db->prepare("SELECT COUNT(*) FROM metal_artists WHERE LOWER(artist_name) = :name");
            $stmt->execute([':name' => $norm]);
            return ($stmt->fetchColumn() > 0);
        } catch (\PDOException $e) {
            return false;
        }
    }

    public function fetchArtistGenreMetadata($artistName) {
        $cleanArtist = trim((string)$artistName);
        if ($cleanArtist === '') {
            return ['tags' => [], 'source' => 'lastfm_empty'];
        }

        // Check DB cache first
        if ($this->db) {
            try {
                $stmt = $this->db->prepare("SELECT tags, source FROM artist_genre_cache WHERE LOWER(artist_name) = LOWER(:artist) LIMIT 1");
                $stmt->execute([':artist' => $cleanArtist]);
                $cache = $stmt->fetch(\PDO::FETCH_ASSOC);
                if ($cache) {
                    $tags = array_filter(array_map('trim', explode(',', strtolower((string)$cache['tags']))));
                    return ['tags' => $tags, 'source' => $cache['source'] ?? 'cache'];
                }
            } catch (\PDOException $e) {
                // Continue to Last.fm API
            }
        }

        $apiKey = defined('LASTFM_API_KEY') ? LASTFM_API_KEY : '';
        if (empty($apiKey)) {
            return ['tags' => [], 'source' => 'missing_api_key'];
        }

        $url = 'https://ws.audioscrobbler.com/2.0/?method=artist.gettoptags&artist=' . urlencode($cleanArtist) . '&api_key=' . urlencode($apiKey) . '&format=json';
        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 6,
            CURLOPT_USERAGENT => 'NyctosGigGrid/3.0'
        ]);
        $response = curl_exec($ch);
        curl_close($ch);

        $tags = [];
        if ($response) {
            $data = json_decode($response, true);
            if (isset($data['toptags']['tag']) && is_array($data['toptags']['tag'])) {
                foreach (array_slice($data['toptags']['tag'], 0, 10) as $t) {
                    if (isset($t['name'])) {
                        $tags[] = strtolower(trim($t['name']));
                    }
                }
            }
        }

        // Cache result in DB
        if ($this->db) {
            try {
                $stmt = $this->db->prepare("INSERT OR REPLACE INTO artist_genre_cache (artist_name, tags, source, cached_at) VALUES (:artist, :tags, 'lastfm', CURRENT_TIMESTAMP)");
                $stmt->execute([
                    ':artist' => $cleanArtist,
                    ':tags' => implode(',', $tags)
                ]);
            } catch (\PDOException $e) {
                // Ignore cache write errors
            }
        }

        return ['tags' => $tags, 'source' => 'lastfm'];
    }

    public function collectGenreSignals($tags) {
        $signals = [];
        if (is_array($tags)) {
            foreach ($tags as $t) {
                $t = strtolower(trim((string)$t));
                if ($t !== '') {
                    $signals[$t] = ($signals[$t] ?? 0) + 1;
                }
            }
        }
        return $signals;
    }

    public function determineGenreBucket($signals) {
        if (empty($signals)) return 'all';

        $bucketsFile = __DIR__ . '/../genre_buckets.php';
        $genreBuckets = file_exists($bucketsFile) ? (require $bucketsFile) : [];
        if (!is_array($genreBuckets)) return 'all';

        $bucketScores = [];
        foreach ($genreBuckets as $bucketKey => $bucketDef) {
            $score = 0;
            $bTags = array_map('strtolower', $bucketDef['tags'] ?? []);
            foreach ($signals as $sigTag => $count) {
                if (in_array($sigTag, $bTags, true)) {
                    $score += $count;
                }
            }
            if ($score > 0) {
                $bucketScores[$bucketKey] = $score;
            }
        }

        if (empty($bucketScores)) return 'all';
        arsort($bucketScores);
        return key($bucketScores);
    }
}
