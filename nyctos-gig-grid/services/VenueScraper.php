<?php

/** Venue scraping service */
class VenueScraper {
    private $logs = [];
    private $db = null;

    public function __construct(PDO $db = null) {
        $this->db = $db;
    }

    public function scrapeFromDatabase(PDO $db = null, $aggregator = null) {
        $pdo = $db ?: $this->db;
        if (!$pdo) return [];

        $stmt = $pdo->prepare("SELECT * FROM scraped_venues WHERE is_active = 1");
        $stmt->execute();
        $venues = $stmt->fetchAll(PDO::FETCH_ASSOC);

        $allEvents = [];
        $stmtUpdate = $pdo->prepare("UPDATE scraped_venues SET last_scraped_at = CURRENT_TIMESTAMP WHERE id = :id");

        foreach ($venues as $v) {
            $scrapeUrl = $v['scrape_url'];
            $selector = $v['xpath_container'] ?: "//div[contains(@class, 'event') or contains(@class, 'show')]";
            $events = $this->scrape($scrapeUrl, $selector, $aggregator);

            if (!empty($events)) {
                foreach ($events as &$ev) {
                    if (empty($ev['venue_name']) || $ev['venue_name'] === 'Unknown Venue') {
                        $ev['venue_name'] = $v['venue_name'];
                    }
                    if (!empty($v['city_name'])) {
                        $ev['city_name'] = $v['city_name'];
                    }
                    if (!empty($v['market'])) {
                        $ev['market'] = $v['market'];
                    }
                }
                unset($ev);
                $allEvents = array_merge($allEvents, $events);
                $stmtUpdate->execute([':id' => $v['id']]);
            }
        }

        return $allEvents;
    }

    public function scrape($url, $selector, $aggregator = null) {
        if (strpos($url, 'etix.com/ticket/o/6122') !== false || strpos($url, 'cervantes') !== false) {
            $this->logs[] = "[REDIRECT] eTix outlet page requires cookie session. Routing to Cervantes Masterpiece & Other Side live calendar...";
            $url = 'https://cervantesmasterpiece.com/events/';
        }
        if (strpos($url, 'hi-dive.com') !== false) {
            $this->logs[] = "[REDIRECT] Hi-Dive embeds dynamic Dice JS widget. Routing to live venue calendar...";
            $url = 'https://do303.com/venues/hi-dive';
        }
        if (strpos($url, 'skylarklounge.com') !== false) {
            $this->logs[] = "[REDIRECT] Skylark Lounge static site contains legacy archive. Routing to live Do303 venue calendar...";
            $url = 'https://do303.com/venues/the-skylark-lounge';
        }
        $this->logs[] = "Initializing scraping process for URL: " . $url;
        
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 6);
        curl_setopt($ch, CURLOPT_TIMEOUT, 12);
        
        $html = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        // If direct fetch is blocked (403, 405, 503, 0) and we have a proxy token:
        if (($httpCode === 403 || $httpCode === 405 || $httpCode === 503 || $httpCode === 0) && defined('SCRAPE_DO_TOKEN') && !empty(SCRAPE_DO_TOKEN)) {
            $this->logs[] = "[PROXY] Direct access blocked (HTTP " . $httpCode . "). Routing through Scrape.do proxy...";
            
            $proxyUrl = "https://api.scrape.do?token=" . urlencode(SCRAPE_DO_TOKEN) . "&url=" . urlencode($url);
            $ch = curl_init();
            curl_setopt($ch, CURLOPT_URL, $proxyUrl);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
            curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 5);
            curl_setopt($ch, CURLOPT_TIMEOUT, 10);
            $html = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            $curlError = curl_error($ch);
            curl_close($ch);
        }

        if (empty($html) || $httpCode !== 200) {
            $this->logs[] = "[WARN] Failed to load HTML from " . $url . " (HTTP " . $httpCode . "). Returning empty event list.";
            if ($aggregator !== null) {
                if ($httpCode !== 200 && $httpCode > 0) {
                    $aggregator->recordHttpNon200('VenueScraper', null, $httpCode, "URL: {$url}");
                }
                if ($html === false || $httpCode === 0 || !empty($curlError)) {
                    $aggregator->recordConnectionFailure('VenueScraper', null, "URL: {$url} {$curlError}");
                }
            }
            return [];
        }

        // --- REAL LIVE HTML SCRAPING & PARSING BLOCK ---
        $this->logs[] = "Successfully loaded live HTML. Parsing elements matching selector: " . $selector;
        
        $dom = new DOMDocument();
        @$dom->loadHTML($html);
        $xpath = new DOMXPath($dom);
        
        // Dedicated parser for Do303 venue feeds (Hi-Dive, Skylark Lounge)
        if (strpos($url, 'do303.com') !== false) {
            preg_match_all('/<a[^>]+href="(\/events\/(20\d\d)\/(\d+)\/(\d+)[^"]*)"[^>]*>(.*?)<\/a>/s', $html, $matches, PREG_SET_ORDER);
            $events = [];
            $seenPaths = [];
            foreach ($matches as $m) {
                $eventPath = $m[1];
                $year = $m[2];
                $month = str_pad($m[3], 2, '0', STR_PAD_LEFT);
                $day = str_pad($m[4], 2, '0', STR_PAD_LEFT);
                
                if (isset($seenPaths[$eventPath])) continue;
                $seenPaths[$eventPath] = true;
                
                $fullText = strip_tags($m[5]);
                $cleanTitle = trim(preg_replace('/\s+/', ' ', $fullText));
                if (empty($cleanTitle) || strlen($cleanTitle) < 2) continue;
                
                $timeSql = "{$year}-{$month}-{$day} 19:00:00";
                $eventUrl = 'https://do303.com' . $eventPath;
                $venueName = $this->getVenueNameFromUrl($url);
                
                $events[] = [
                    'artist_name' => $cleanTitle,
                    'venue_name' => $venueName,
                    'city_name' => 'Denver',
                    'start_time' => $timeSql,
                    'doors_time' => $this->extractDoorsTime($fullText, $timeSql),
                    'ticket_url' => $eventUrl,
                    'source' => 'VenueScraper: ' . $venueName
                ];
            }
            if (!empty($events)) {
                $this->logs[] = "[DO303] Extracted " . count($events) . " live events for " . $this->getVenueNameFromUrl($url);
                return $events;
            }
        }

        // Dedicated parser for Club Vinyl / Nightclub feeds
        if (strpos($url, 'vinylnightclub.com') !== false) {
            preg_match_all('/<div[^>]*class="[^"]*event-card[^"]*"[^>]*>(.*?)<\/div>\s*<\/div>/is', $html, $cardBlocks);
            $events = [];
            foreach ($cardBlocks[1] ?? [] as $block) {
                if (preg_match('/<h[1-4][^>]*>(.*?)<\/h[1-4]>/is', $block, $tm)) {
                    $artistName = trim(strip_tags($tm[1]));
                    $startIso = date('Y-m-d H:i:s');
                    $events[] = [
                        'artist_name' => $artistName,
                        'venue_name' => 'Club Vinyl',
                        'city_name' => 'Denver',
                        'start_time' => $startIso,
                        'doors_time' => $this->extractDoorsTime($block, $startIso),
                        'ticket_url' => $url,
                        'source' => 'VenueScraper: Club Vinyl'
                    ];
                }
            }
            if (!empty($events)) {
                $this->logs[] = "[CLUB-VINYL] Extracted " . count($events) . " live events for Club Vinyl";
                return $events;
            }
        }

        // Dedicated parser for Meow Wolf Denver (Next.js __NEXT_DATA__)
        if (strpos($url, 'meowwolf.com') !== false) {
            if (preg_match('/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s', $html, $m)) {
                $jsonData = json_decode($m[1], true);
                $events = [];
                $rawEvents = $jsonData['props']['pageProps']['events'] ?? $jsonData['props']['pageProps']['initialEvents'] ?? [];
                foreach ($rawEvents as $ev) {
                    $artistName = $ev['title'] ?? $ev['name'] ?? null;
                    $startDate = $ev['startDate'] ?? $ev['date'] ?? null;
                    $ticketUrl = $ev['url'] ?? $ev['ticketUrl'] ?? $url;
                    if (strpos($ticketUrl, 'http') !== 0) {
                        $ticketUrl = 'https://meowwolf.com' . $ticketUrl;
                    }

                    if (empty($artistName) || empty($startDate)) continue;

                    $parsedTs = strtotime($startDate);
                    if ($parsedTs === false) continue;

                    $startIso = date('Y-m-d H:i:s', $parsedTs);

                    $events[] = [
                        'artist_name' => $artistName,
                        'venue_name' => 'Meow Wolf Denver',
                        'city_name' => 'Denver',
                        'start_time' => $startIso,
                        'doors_time' => $this->extractDoorsTime(json_encode($ev), $startIso),
                        'ticket_url' => $ticketUrl,
                        'source' => 'VenueScraper: Meow Wolf Denver'
                    ];
                }

                if (!empty($events)) {
                    $this->logs[] = "[MEOW-WOLF] Extracted " . count($events) . " live events for Meow Wolf Denver";
                    return $events;
                }
            }
        }

        // Dedicated parser for 7th Circle Music Collective DIY posts
        if (strpos($url, '7thcirclemusiccollective.org') !== false) {
            preg_match_all('/<div[^>]*class="[^"]*post-container[^"]*"[^>]*>(.*?)<\/div>\s*<\/div>/is', $html, $postBlocks);
            $events = [];
            $currentYear = date('Y');

            foreach ($postBlocks[1] ?? [] as $block) {
                if (!preg_match('/<a[^>]+href=["](\/posts\/\d+)["]/i', $block, $lm)) continue;
                $postUrl = 'https://www.7thcirclemusiccollective.org' . $lm[1];

                if (!preg_match('/<p[^>]*class="event-title"[^>]*>(.*?)<\/p>/is', $block, $tm)) continue;
                $rawTitle = strip_tags($tm[1]);
                $cleanTitle = html_entity_decode(trim(preg_replace('/\s+/', ' ', str_replace('&nbsp;', ' ', $rawTitle))));
                $cleanTitle = rtrim($cleanTitle, ',');

                if (empty($cleanTitle)) continue;

                $dateNum = '';
                $dateMonth = '';
                if (preg_match('/<div[^>]*class="date-overlay"[^>]*>(.*?)<\/div>/is', $block, $dm)) {
                    if (preg_match('/<span[^>]*class="date"[^>]*>(.*?)<\/span>/is', $dm[1], $nm)) $dateNum = trim(strip_tags($nm[1]));
                    if (preg_match('/<span[^>]*class="month"[^>]*>(.*?)<\/span>/is', $dm[1], $mm)) $dateMonth = trim(strip_tags($mm[1]));
                }
                if (empty($dateNum) || empty($dateMonth)) continue;

                $timeStr = "7:00 PM";
                if (preg_match('/<p[^>]*class="time"[^>]*>(.*?)<\/p>/is', $block, $tmm)) {
                    $tClean = trim(strip_tags($tmm[1]));
                    if (!empty($tClean)) $timeStr = $tClean;
                }

                $timestamp = strtotime("{$dateMonth} {$dateNum} {$currentYear} {$timeStr}");
                if ($timestamp === false) {
                    $timestamp = strtotime("{$dateMonth} {$dateNum} {$currentYear} 19:00:00");
                }
                if ($timestamp === false) continue;

                $startIso = date('Y-m-d H:i:s', $timestamp);

                $events[] = [
                    'artist_name' => $cleanTitle,
                    'venue_name' => '7th Circle Music Collective',
                    'city_name' => 'Denver',
                    'start_time' => $startIso,
                    'doors_time' => $this->extractDoorsTime($block, $startIso),
                    'ticket_url' => $postUrl,
                    'source' => 'VenueScraper: 7th Circle Music Collective'
                ];
            }

            if (!empty($events)) {
                $this->logs[] = "[7TH-CIRCLE] Extracted " . count($events) . " live events for 7th Circle Music Collective";
                return $events;
            }
        }

        // Dedicated parser for RHP venue feeds (Globe Hall, Larimer Lounge, Lost Lake, Goosetown Tavern)
        if (strpos($url, 'globehall.com') !== false || strpos($url, 'larimerlounge.com') !== false || strpos($url, 'lost-lake.com') !== false || strpos($url, 'goosetowntavern.com') !== false) {
            $blocks = explode('rhpSingleEvent', $html);
            $events = [];
            $venueName = $this->getVenueNameFromUrl($url);

            foreach ($blocks as $idx => $block) {
                if ($idx === 0) continue;
                
                $linkMatch = null;
                if (preg_match('/<a[^>]+id\s*=\s*"eventTitle"[^>]+href\s*=\s*"([^"]+)"[^>]*title\s*=\s*"([^"]+)"/i', $block, $lm)) {
                    $linkMatch = $lm;
                } elseif (preg_match('/<a[^>]+class\s*=\s*"[^"]*url[^"]*"[^>]+href\s*=\s*"([^"]+)"[^>]*title\s*=\s*"([^"]+)"/i', $block, $lm)) {
                    $linkMatch = $lm;
                }
                if (!$linkMatch) continue;

                $ticketUrl = html_entity_decode(trim($linkMatch[1]));
                $rawTitle = html_entity_decode(trim($linkMatch[2]));

                if (preg_match('/href\s*=\s*"([^"]*etix\.com\/ticket\/p\/[^"]+)"/i', $block, $etixMatch)) {
                    $ticketUrl = html_entity_decode(trim($etixMatch[1]));
                }

                $rawDate = '';
                if (preg_match('/<div[^>]+id\s*=\s*"eventDate"[^>]*>\s*([^<]+)\s*<\/div>/i', $block, $dm)) {
                    $rawDate = trim($dm[1]);
                } elseif (preg_match('/<div[^>]+class\s*=\s*"[^"]*rhp-event__date[^"]*"[^>]*>\s*([^<]+)\s*<\/div>/i', $block, $dm)) {
                    $rawDate = trim($dm[1]);
                }

                $artistName = trim(preg_replace('/\s+/', ' ', $rawTitle));
                if (empty($artistName) || empty($rawDate)) continue;

                $year = date('Y');
                $timestamp = strtotime("{$rawDate} {$year}");
                if ($timestamp !== false && $timestamp < strtotime('today - 30 days')) {
                    $timestamp = strtotime("{$rawDate} " . ($year + 1));
                }
                if ($timestamp === false) {
                    continue;
                }

                $startIso = date('Y-m-d', $timestamp) . ' 19:00:00';

                $events[] = [
                    'artist_name' => $artistName,
                    'venue_name' => $venueName,
                    'city_name' => 'Denver',
                    'start_time' => $startIso,
                    'doors_time' => $this->extractDoorsTime($block, $startIso),
                    'ticket_url' => $ticketUrl,
                    'source' => 'VenueScraper: ' . $venueName
                ];
            }

            if (!empty($events)) {
                $this->logs[] = "[RHP] Extracted " . count($events) . " live events for " . $venueName;
                return $events;
            }
        }

        // Generic DOM Parser fallback for HTML feeds
        $elements = $xpath->query($selector);
        $events = [];
        
        if ($elements && $elements->length > 0) {
            foreach ($elements as $el) {
                $artistName = '';
                $startTime = '';
                $ticketUrl = $url;
                
                $titleNode = $xpath->query('.//h3[contains(@class, "title")]|.//div[contains(@class, "title")]|.//h2', $el);
                if ($titleNode && $titleNode->length > 0) {
                    $artistName = trim($titleNode->item(0)->textContent);
                }
                
                $dateNode = $xpath->query('.//span[contains(@class, "date")]|.//div[contains(@class, "date")]|.//time', $el);
                if ($dateNode && $dateNode->length > 0) {
                    $startTime = trim($dateNode->item(0)->textContent);
                }
                
                $linkNode = $xpath->query('.//a[contains(@class, "tickets")]|.//a[contains(@href, "tickets")]|.//a', $el);
                if ($linkNode && $linkNode->length > 0) {
                    $ticketUrl = $linkNode->item(0)->getAttribute('href');
                    if (strpos($ticketUrl, 'http') !== 0) {
                        $ticketUrl = $url;
                    }
                }
                
                if (!empty($artistName) && !empty($startTime)) {
                    $timeSql = date('Y-m-d H:i:s', strtotime($startTime));
                    $resolvedVenueName = $this->getVenueNameFromUrl($ticketUrl);
                    if ($resolvedVenueName === 'Unknown Venue' || $resolvedVenueName === "Cervantes' Other Side") {
                        $testFallback = $this->getVenueNameFromUrl($url);
                        if ($testFallback !== 'Unknown Venue') {
                            $resolvedVenueName = $testFallback;
                        }
                    }
                    $events[] = [
                        'artist_name' => $artistName,
                        'venue_name' => $resolvedVenueName,
                        'city_name' => 'Denver',
                        'start_time' => $timeSql,
                        'doors_time' => $this->extractDoorsTime($el->textContent ?? '', $timeSql),
                        'ticket_url' => $ticketUrl,
                        'source' => 'VenueScraper: ' . $resolvedVenueName
                    ];
                }
            }
        }
        
        if (empty($events)) {
            $this->logs[] = "[INFO] No valid events parsed from " . $url . ". Returning empty event list.";
            return [];
        }
        
        return $events;
    }

    private function extractDoorsTime($textBlock, $startIso = null) {
        $times = $this->extractEventTimes($textBlock, $startIso);
        return $times['doors_time'];
    }

    private function extractEventTimes($textBlock, $startIso = null) {
        $doorsIso = null;
        $showIso = $startIso;

        if (empty($textBlock)) {
            return ['doors_time' => null, 'start_time' => $startIso];
        }

        $datePart = !empty($startIso) ? date('Y-m-d', strtotime($startIso)) : date('Y-m-d');

        if (preg_match('/doors?\s*(?:open)?\s*(?:at|:)?\s*(\d{1,2}(?::\d{2})?\s*(?:[ap]\.?m\.?)?)/i', $textBlock, $m)) {
            $ts = strtotime($datePart . ' ' . trim($m[1]));
            if ($ts !== false) {
                $doorsIso = date('Y-m-d H:i:s', $ts);
            }
        }

        if (preg_match('/shows?\s*(?:starts?)?\s*(?:at|:)?\s*(\d{1,2}(?::\d{2})?\s*(?:[ap]\.?m\.?)?)/i', $textBlock, $m)) {
            $ts = strtotime($datePart . ' ' . trim($m[1]));
            if ($ts !== false) {
                $showIso = date('Y-m-d H:i:s', $ts);
            }
        }

        $timeOnly = (!empty($showIso) && strpos($showIso, ' ') !== false) ? explode(' ', $showIso)[1] : '';
        if (empty($showIso) || $timeOnly === '00:00:00' || $timeOnly === '12:00:00') {
            if (preg_match('/(?:sessions?\s+(?:from|at)|all\s+sessions?|starts?\s+at|from)\s*(\d{1,2}(?::\d{2})?)\s*(?:-\s*|\s*to\s*)?(?:\d{1,2}(?::\d{2})?)?\s*([ap]\.?m\.?)/i', $textBlock, $m)) {
                $ts = strtotime($datePart . ' ' . trim($m[1]) . ' ' . str_replace('.', '', strtoupper($m[2])));
                if ($ts !== false) {
                    $showIso = date('Y-m-d H:i:s', $ts);
                }
            } elseif (preg_match('/(\d{1,2}(?::\d{2})?)\s*(?:-\s*|\s*to\s*)(?:\d{1,2}(?::\d{2})?)\s*([ap]\.?m\.?)/i', $textBlock, $m)) {
                $ts = strtotime($datePart . ' ' . trim($m[1]) . ' ' . str_replace('.', '', strtoupper($m[2])));
                if ($ts !== false) {
                    $showIso = date('Y-m-d H:i:s', $ts);
                }
            }
        }

        if (!empty($doorsIso) && !empty($showIso) && strtotime($doorsIso) === strtotime($showIso)) {
            $doorsIso = null;
        }

        return ['doors_time' => $doorsIso, 'start_time' => $showIso];
    }

        
    /**
     * Parse Red Rocks detail page table (<table class="event-info--table">)
     */
    private function fetchRedRocksDetailTimes($eventUrl) {
        if (empty($eventUrl) || strpos($eventUrl, 'redrocksonline.com/events/') === false) {
            return ['start_time' => null, 'doors_time' => null];
        }

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $eventUrl);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
        curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 4);
        curl_setopt($ch, CURLOPT_TIMEOUT, 6);
        $html = curl_exec($ch);
        curl_close($ch);

        if (empty($html)) {
            return ['start_time' => null, 'doors_time' => null];
        }

        $startStr = null;
        $doorsStr = null;

        if (preg_match('/<table[^>]*class="[^"]*event-info--table[^"]*"[^>]*>.*?<tbody>\s*<tr>\s*<td>(.*?)<\/td>\s*<td>(.*?)<\/td>\s*<td>(.*?)<\/td>/is', $html, $m)) {
            $startStr = trim($m[2]);
            $doorsStr = trim($m[3]);
        } elseif (preg_match('/<th>\s*Start Time\s*<\/th>.*?<td>\s*([^<]+)\s*<\/td>/is', $html, $m)) {
            $startStr = trim($m[1]);
            if (preg_match('/<th>\s*Doors Time\s*<\/th>.*?<td>\s*([^<]+)\s*<\/td>/is', $html, $dm)) {
                $doorsStr = trim($dm[1]);
            }
        }

        return ['start_time' => $startStr, 'doors_time' => $doorsStr];
    }


private function getVenueNameFromUrl($url) {
        if (strpos($url, 'vinylnightclub') !== false) return 'Club Vinyl';
        if (strpos($url, 'washingtonsfoco') !== false || strpos($url, 'washingtons') !== false) return "Washington's";
        if (strpos($url, 'bohemianlivemusic') !== false || strpos($url, 'armoryfoco') !== false) return 'The Armory';
        if (strpos($url, 'moxitheater') !== false || strpos($url, 'moxi') !== false) return 'Moxi Theater';
        if (strpos($url, 'thefederaltheatre') !== false || strpos($url, 'federaltheatre') !== false) return 'The Federal Theatre';
        if (strpos($url, 'theorientaltheater') !== false || strpos($url, 'orientaltheater') !== false) return 'The Oriental Theater';
        if (strpos($url, 'larumba') !== false) return 'La Rumba';
        if (strpos($url, 'meowwolf') !== false) return 'Meow Wolf Denver';
        if (strpos($url, 'hqdenver') !== false || strpos($url, 'hq-denver') !== false) return 'HQ';
        if (strpos($url, '7thcircle') !== false) return '7th Circle Music Collective';
        if (strpos($url, 'anteup') !== false) return 'Ante Up';
        if (strpos($url, 'marquis') !== false) return 'Marquis Theater';
        if (strpos($url, 'goosetown') !== false) return 'Goosetown Tavern';
        if (strpos($url, 'larimerlounge') !== false) return 'Larimer Lounge';
        if (strpos($url, 'lost-lake') !== false || strpos($url, 'lostlake') !== false) return 'Lost Lake';
        if (strpos($url, 'cervantesother-side') !== false) return "Cervantes' Other Side";
        if (strpos($url, 'cervantesmasterpiece-ballroom') !== false) return "Cervantes' Masterpiece Ballroom";
        if (strpos($url, 'cervantesand-the-other-side-dual-venue') !== false) return "Cervantes' and The Other Side - DUAL VENUE";
        if (strpos($url, 'cervantes') !== false || strpos($url, '6122') !== false) return "Cervantes' Other Side";
        if (strpos($url, 'hi-dive') !== false) return 'Hi-Dive';
        if (strpos($url, 'skylarklounge') !== false) return 'The Skylark Lounge';
        if (strpos($url, 'globehall') !== false) return 'Globe Hall';
        if (strpos($url, 'blacksheeprocks') !== false) return 'The Black Sheep';
        if (strpos($url, 'bluebirdtheater') !== false) return 'Bluebird Theater';
        if (strpos($url, 'ogdentheatre') !== false) return 'Ogden Theatre';
        if (strpos($url, 'gothictheatre') !== false) return 'Gothic Theatre';
        if (strpos($url, 'missionballroom') !== false) return 'Mission Ballroom';
        if (strpos($url, 'fiddlersgreen') !== false) return "Fiddler's Green Amphitheatre";
        if (strpos($url, 'redrocksonline') !== false) return 'Red Rocks Amphitheatre';
        return 'Unknown Venue';
    }

    public function getLogs() {
        return $this->logs;
    }
}
