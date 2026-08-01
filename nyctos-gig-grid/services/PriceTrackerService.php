<?php
/**
 * Price Tracker Service - Ticket Prices & Status Codes Engine
 */

class PriceTrackerService {
    private $db;

    public function __construct($dbConnection = null) {
        $this->db = $dbConnection;
    }

    public function normalizeTicketStatusCode($code) {
        $c = strtolower(trim((string)$code));
        if ($c === 'onsale' || $c === 'available') return 'onsale';
        if ($c === 'offsale' || $c === 'cancelled' || $c === 'canceled') return 'offsale';
        if ($c === 'soldout' || $c === 'sold_out') return 'soldout';
        if ($c === 'resale') return 'resale';
        return 'unknown';
    }

    public function deriveAvailabilityTagFromStatus($status) {
        $norm = $this->normalizeTicketStatusCode($status);
        if ($norm === 'onsale') return 'On Sale';
        if ($norm === 'soldout') return 'Sold Out';
        if ($norm === 'offsale') return 'Off Sale';
        if ($norm === 'resale') return 'Resale Available';
        return '';
    }

    public function estimatePriceRange($rawPrices) {
        if (empty($rawPrices)) return ['min' => null, 'max' => null];

        $min = null;
        $max = null;

        if (is_array($rawPrices)) {
            foreach ($rawPrices as $p) {
                if (isset($p['min'])) {
                    $v = (float)$p['min'];
                    if ($min === null || $v < $min) $min = $v;
                }
                if (isset($p['max'])) {
                    $v = (float)$p['max'];
                    if ($max === null || $v > $max) $max = $v;
                }
            }
        }

        return ['min' => $min, 'max' => $max];
    }

    public function hasPriceDropped($oldMin, $newMin) {
        if ($oldMin === null || $newMin === null) return false;
        return ($newMin < $oldMin);
    }

    public function recordPriceSnapshot($eventId, $priceMin, $priceMax) {
        if (!$this->db || empty($eventId)) return false;
        try {
            $stmt = $this->db->prepare("INSERT INTO event_price_history (event_id, price_min, price_max, recorded_at) VALUES (:id, :min, :max, CURRENT_TIMESTAMP)");
            return $stmt->execute([
                ':id' => $eventId,
                ':min' => $priceMin,
                ':max' => $priceMax
            ]);
        } catch (\PDOException $e) {
            return false;
        }
    }
}
