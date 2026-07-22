<?php

/** Setlist lookup service */
function parseSongsFromSetlistFmResponse($setlist) {
    $songs = [];
    if (!empty($setlist['sets']['set']) && is_array($setlist['sets']['set'])) {
        foreach ($setlist['sets']['set'] as $set) {
            if (!empty($set['song']) && is_array($set['song'])) {
                foreach ($set['song'] as $song) {
                    if (!empty($song['name'])) {
                        $songs[] = $song['name'];
                    }
                }
            }
        }
    }
    return $songs;
}

function fetchSetlistFromSetlistFm($artist, $date, $city) {
    $apiKey = defined('SETLIST_FM_API_KEY') ? SETLIST_FM_API_KEY : '';
    if (empty($apiKey)) {
        // Return mocked setlists for developers/testing if key is not configured
        $artistLower = strtolower($artist);
        $mockSongs = [];
        if (strpos($artistLower, 'motionless') !== false) {
            $mockSongs = ["Meltdown", "Sign of Life", "Voices", "Reincarnate", "Cyberhex", "Another Life", "Masterpiece", "Slaughterhouse", "Eternally Yours"];
        } else if (strpos($artistLower, 'strokes') !== false) {
            $mockSongs = ["Last Nite", "Reptilia", "Someday", "The Adults Are Talking", "Hard to Explain", "Is This It", "Juicebox", "Ode to the Mets"];
        } else if (strpos($artistLower, 'lucero') !== false) {
            $mockSongs = ["Texas & Tennessee", "Nights Like These", "Chain Link Fence", "My Best Girl", "Sweet Little Girl", "Bikeriders"];
        } else {
            $mockSongs = [
                "Intro / Opening Theme",
                "Welcome to the Show",
                "Hit Single A",
                "Heavy Riff Anthem",
                "Acoustic Ballad",
                "Blast Beat Destruction",
                "Crowd Singalong",
                "Encore: Greatest Hits Medley"
            ];
        }
        return [
            'songs' => $mockSongs,
            'should_cache' => true
        ];
    }

    $songs = [];
    $shouldCache = false;

    // 1. Try to find the exact setlist for this show
    $formattedDate = date('d-m-Y', strtotime($date));
    $url = "https://api.setlist.fm/rest/1.0/search/setlists?artistName=" . urlencode($artist) . "&date=" . urlencode($formattedDate) . "&cityName=" . urlencode($city);

    $result = fetchHttpResource($url, [
        'timeout' => 12,
        'user_agent' => 'MetalConcertCalendar/1.0',
        'headers' => [
            'Accept: application/json',
            'x-api-key: ' . $apiKey
        ]
    ]);

    $response = $result['body'];
    $httpCode = $result['status'];

    if ($httpCode === 200 || $httpCode === 404) {
        $shouldCache = true;
    }
    
    if ($httpCode === 200 && !empty($response)) {
        $data = json_decode($response, true);
        if (!empty($data['setlist']) && is_array($data['setlist'])) {
            $songs = parseSongsFromSetlistFmResponse($data['setlist'][0]);
        }
    }
    
    // 2. Fallback: Search for the most recent past setlist for this artist
    if (empty($songs)) {
        $url = "https://api.setlist.fm/rest/1.0/search/setlists?artistName=" . urlencode($artist) . "&p=1";

        $fallbackResult = fetchHttpResource($url, [
            'timeout' => 12,
            'user_agent' => 'MetalConcertCalendar/1.0',
            'headers' => [
                'Accept: application/json',
                'x-api-key: ' . $apiKey
            ]
        ]);

        $response = $fallbackResult['body'];
        $httpCodeFallback = $fallbackResult['status'];

        if ($httpCodeFallback === 200 || $httpCodeFallback === 404) {
            $shouldCache = true;
        }
        
        if ($httpCodeFallback === 200 && !empty($response)) {
            $data = json_decode($response, true);
            if (!empty($data['setlist']) && is_array($data['setlist'])) {
                foreach ($data['setlist'] as $sl) {
                    $candidateSongs = parseSongsFromSetlistFmResponse($sl);
                    if (!empty($candidateSongs)) {
                        $refCity = !empty($sl['venue']['city']['name']) ? $sl['venue']['city']['name'] : 'Unknown City';
                        $refState = !empty($sl['venue']['city']['stateCode']) ? $sl['venue']['city']['stateCode'] : '';
                        $refStateText = !empty($refState) ? ", " . $refState : "";
                        $refVenue = !empty($sl['venue']['name']) ? $sl['venue']['name'] : '';
                        $refDateRaw = !empty($sl['eventDate']) ? $sl['eventDate'] : '';
                        
                        $refDateFormatted = '';
                        if (!empty($refDateRaw)) {
                            // Setlist.fm eventDate is dd-MM-yyyy. Reformat to yyyy-MM-dd so strtotime parses reliably.
                            $dateParts = explode('-', $refDateRaw);
                            if (count($dateParts) === 3) {
                                $refDateRaw = $dateParts[2] . '-' . $dateParts[1] . '-' . $dateParts[0];
                            }
                            $refDateFormatted = date('M j, Y', strtotime($refDateRaw));
                        }
                        
                        $bannerText = "\xE2\x9C\xA8 Expected Tour Setlist (from " . $refVenue . " in " . $refCity . $refStateText . " on " . $refDateFormatted . ")";
                        $songs = array_merge([$bannerText], $candidateSongs);
                        break;
                    }
                }
            }
        }
    }
    
    return [
        'songs' => $songs,
        'should_cache' => $shouldCache
    ];
}
