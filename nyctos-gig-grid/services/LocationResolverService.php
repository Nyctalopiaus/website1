<?php
/**
 * Location Resolver Service - Venue Whitelist & Market City Centroid Resolver
 */

class LocationResolverService {
    private $db;

    public function __construct($dbConnection = null) {
        $this->db = $dbConnection;
    }

    public function normalizeMarketKey($market) {
        $m = strtolower(trim((string)$market));
        if (in_array($m, ['front-range', 'frontrange', 'colorado', 'co', 'denver-boulder', 'springs-pueblo', 'ft-collins-north', 'west-slope'], true)) return 'colorado';
        if (in_array($m, ['california', 'socal', 'norcal', 'ca', 'southern-california', 'la'], true)) return 'california';
        if (in_array($m, ['texas', 'tx'], true)) return 'texas';
        if (in_array($m, ['uk', 'gb', 'great britain', 'united kingdom', 'england'], true)) return 'england';
        if (in_array($m, ['scotland', 'uk-scotland'], true)) return 'scotland';
        if ($m === 'wales') return 'wales';
        if (in_array($m, ['ireland', 'republic of ireland', 'northern ireland', 'ie'], true)) return 'ireland';
        return $m !== '' ? $m : 'colorado';
    }

    public function getMarketSearchCentroids() {
        return [
            'colorado'   => ['lat' => 39.7392, 'lon' => -104.9903, 'radius' => 60],
            'california' => ['lat' => 34.0522, 'lon' => -118.2437, 'radius' => 60],
            'england'    => ['lat' => 51.5074, 'lon' => -0.1278,   'radius' => 120],
            'scotland'   => ['lat' => 55.8642, 'lon' => -4.2518,   'radius' => 120],
            'wales'      => ['lat' => 51.4816, 'lon' => -3.1791,   'radius' => 120],
            'ireland'    => ['lat' => 53.3498, 'lon' => -6.2603,   'radius' => 120],
            'texas'      => [
                ['lat' => 30.2672, 'lon' => -97.7431, 'radius' => 120],
                ['lat' => 32.7767, 'lon' => -96.7970, 'radius' => 120],
                ['lat' => 29.7604, 'lon' => -95.3698, 'radius' => 120],
                ['lat' => 29.4241, 'lon' => -98.4936, 'radius' => 120]
            ]
        ];
    }

    public function loadVenueWhitelist($marketKey) {
        $mKey = $this->normalizeMarketKey($marketKey);
        $legacyKey = ($mKey === 'colorado') ? 'front-range' : (($mKey === 'california') ? 'socal' : $mKey);
        $venues = [];
        if ($this->db) {
            try {
                $stmt = $this->db->prepare("SELECT venue_name, city, aliases FROM venues WHERE market = :m OR market = :legacy_m OR market = 'all'");
                $stmt->execute([':m' => $mKey, ':legacy_m' => $legacyKey]);
                while ($row = $stmt->fetch(\PDO::FETCH_ASSOC)) {
                    $vName = strtolower(trim($row['venue_name']));
                    $venues[$vName] = $row['city'] ?? '';
                    if (!empty($row['aliases'])) {
                        $aliases = explode(',', strtolower($row['aliases']));
                        foreach ($aliases as $a) {
                            $a = trim($a);
                            if ($a !== '') $venues[$a] = $row['city'] ?? '';
                        }
                    }
                }
            } catch (\PDOException $e) {
                // Fallback to static defaults
            }
        }
        return $venues;
    }

    public function resolveTargetVenue($rawVenueName, $marketKey) {
        $clean = strtolower(trim((string)$rawVenueName));
        if ($clean === '') return null;

        $whitelist = $this->loadVenueWhitelist($marketKey);
        foreach ($whitelist as $vPattern => $city) {
            if ($vPattern !== '' && strpos($clean, $vPattern) !== false) {
                return ['matched_name' => $vPattern, 'city' => $city];
            }
        }
        return null;
    }

    public function isEventInMarketRegion($event, $marketKey) {
        $mKey = $this->normalizeMarketKey($marketKey);
        $vName = strtolower(trim((string)($event['venue_name'] ?? '')));
        
        $target = $this->resolveTargetVenue($vName, $mKey);
        return ($target !== null);
    }
}
