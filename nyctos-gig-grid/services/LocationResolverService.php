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
        if ($m === 'texas' || $m === 'tx') return 'texas';
        if ($m === 'uk' || $m === 'scotland' || $m === 'gb' || $m === 'uk-scotland') return 'uk';
        if ($m === 'california' || $m === 'socal' || $m === 'ca' || $m === 'southern-california') return 'california';
        return 'colorado';
    }

    public function getMarketSearchCentroids() {
        return [
            'colorado'   => ['lat' => 39.7392, 'lon' => -104.9903, 'radius' => 60],
            'california' => ['lat' => 34.0522, 'lon' => -118.2437, 'radius' => 60],
            'uk'         => ['lat' => 55.8642, 'lon' => -4.2518,   'radius' => 120],
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
        $legacyKey = ($mKey === 'colorado') ? 'front-range' : (($mKey === 'california') ? 'socal' : (($mKey === 'uk') ? 'scotland' : $mKey));
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
