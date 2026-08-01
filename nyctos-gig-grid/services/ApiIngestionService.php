<?php
/**
 * API Ingestion Service - Ticketmaster, Bandsintown & Eventbrite API Fetchers
 */

class ApiIngestionService {
    private $logger;

    public function __construct($loggerCallback = null) {
        $this->logger = $loggerCallback;
    }

    private function log($msg) {
        if (is_callable($this->logger)) {
            call_user_func($this->logger, $msg);
        }
    }

    public function fetchTicketmaster($marketKey, $centroid) {
        $apiKey = defined('TICKETMASTER_API_KEY') ? TICKETMASTER_API_KEY : '';
        if (empty($apiKey)) {
            $this->log("⚠️ Ticketmaster API key not configured. Skipping.");
            return [];
        }

        $events = [];
        $points = isset($centroid[0]) && is_array($centroid[0]) ? $centroid : [$centroid];

        foreach ($points as $pt) {
            $lat = $pt['lat'] ?? 39.7392;
            $lon = $pt['lon'] ?? -104.9903;
            $radius = $pt['radius'] ?? 60;

            $url = "https://app.ticketmaster.com/discovery/v2/events.json?apikey=" . urlencode($apiKey) . "&latlong={$lat},{$lon}&radius={$radius}&unit=miles&classificationName=music&size=200";

        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_URL => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_USERAGENT => 'NyctosGigGrid/3.0'
        ]);
        $response = curl_exec($ch);
        curl_close($ch);

            if ($response) {
                $data = json_decode($response, true);
                if (isset($data['_embedded']['events']) && is_array($data['_embedded']['events'])) {
                    foreach ($data['_embedded']['events'] as $e) {
                        $events[] = [
                            'source' => 'ticketmaster',
                            'raw' => $e
                        ];
                    }
                }
            }
        }

        $this->log("🎟️ Ticketmaster fetched " . count($events) . " events for market '{$marketKey}'.");
        return $events;
    }

    public function fetchBandsintown($marketKey) {
        $appId = defined('BANDSINTOWN_APP_ID') ? BANDSINTOWN_APP_ID : 'nycto_gig_grid';
        $this->log("🎸 Bandsintown fetcher initialized for market '{$marketKey}'.");
        return [];
    }

    public function fetchEventbrite($marketKey, $centroid) {
        $token = defined('EVENTBRITE_API_TOKEN') ? EVENTBRITE_API_TOKEN : '';
        if (empty($token)) {
            $this->log("⚠️ Eventbrite API token not configured. Skipping.");
            return [];
        }
        $this->log("🎫 Eventbrite fetcher initialized for market '{$marketKey}'.");
        return [];
    }
}
