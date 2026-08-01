<?php
/**
 * Configuration Settings for Nycto's Gig Grid
 */

$localConfigPath = __DIR__ . '/config.local.php';
if (file_exists($localConfigPath)) {
    require_once $localConfigPath;
}

$envFilePath = getenv('NYCTOS_GIG_GRID_ENV_FILE');
if ($envFilePath === false || trim($envFilePath) === '') {
    $envFilePath = '/home/nyctltlc/api.env';
}

$GLOBALS['NYCTOS_GIG_GRID_FILE_ENV'] = [];
if (is_readable($envFilePath)) {
    $lines = file($envFilePath, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    if (is_array($lines)) {
        foreach ($lines as $line) {
            $trimmed = trim($line);
            if ($trimmed === '' || strpos($trimmed, '#') === 0) {
                continue;
            }

            $parts = explode('=', $trimmed, 2);
            if (count($parts) !== 2) {
                continue;
            }

            $key = trim($parts[0]);
            $value = trim($parts[1]);
            if ($key === '') {
                continue;
            }

            $hasDoubleQuotes = strlen($value) >= 2 && $value[0] === '"' && $value[strlen($value) - 1] === '"';
            $hasSingleQuotes = strlen($value) >= 2 && $value[0] === "'" && $value[strlen($value) - 1] === "'";
            if ($hasDoubleQuotes || $hasSingleQuotes) {
                $value = substr($value, 1, strlen($value) - 2);
            }

            $GLOBALS['NYCTOS_GIG_GRID_FILE_ENV'][$key] = $value;
        }
    }
}

if (!function_exists('cfgEnv')) {
    function cfgEnv($name, $default = '') {
        $value = getenv($name);
        if ($value !== false && $value !== '') {
            return $value;
        }

        $fileEnv = $GLOBALS['NYCTOS_GIG_GRID_FILE_ENV'] ?? [];
        if (isset($fileEnv[$name]) && $fileEnv[$name] !== '') {
            return $fileEnv[$name];
        }

        return $default;
    }
}

// Force America/Denver timezone for consistent date formatting across APIs
date_default_timezone_set('America/Denver');

// API Credentials
if (!defined('TICKETMASTER_API_KEY')) {
    define('TICKETMASTER_API_KEY', cfgEnv('TICKETMASTER_API_KEY', ''));
}
if (!defined('BANDSINTOWN_APP_ID')) {
    define('BANDSINTOWN_APP_ID', cfgEnv('BANDSINTOWN_APP_ID', 'js_nyctos_gig_grid'));
}

// Optional: Paste your free Scrape.do token below to bypass Cloudflare/WAF blocks on venue sites.
if (!defined('SCRAPE_DO_TOKEN')) {
    define('SCRAPE_DO_TOKEN', cfgEnv('SCRAPE_DO_TOKEN', ''));
}

// Setlist.fm API key (Register free at https://www.setlist.fm/settings/api)
if (!defined('SETLIST_FM_API_KEY')) {
    define('SETLIST_FM_API_KEY', cfgEnv('SETLIST_FM_API_KEY', ''));
}

// Last.fm API Key for artist biographies and tags retrieval
if (!defined('LASTFM_API_KEY')) {
    define('LASTFM_API_KEY', cfgEnv('LASTFM_API_KEY', ''));
}


// Database Configuration
if (!defined('DB_PATH')) {
    define('DB_PATH', __DIR__ . '/gigs.db');
}

// Colorado Front Range Approved Target Venues
// Lowercase names of target venues to prevent string mismatch data losses
const COLORADO_VENUES = [
    'bluebird theater',
    'bluebird',
    'ogden theatre',
    'ogden',
    'gothic theatre',
    'gothic',
    'red rocks amphitheatre',
    'red rocks',
    'red rocks amphitheater',
    'fiddler\'s green amphitheatre',
    'fiddler\'s green',
    'fiddlers green',
    'summit music hall',
    'summit',
    'marquis theater',
    'marquis',
    'fillmore auditorium',
    'fillmore',
    'the black sheep',
    'black sheep',
    'aggie theatre',
    'aggie',
    'washington\'s',
    'washingtons',
    'boulder theater',
    'fox theatre',
    'fox theater',
    'mission ballroom',
    'oriental theater',
    'oriental',
    'globe hall',
    'larimer lounge',
    'hi-dive',
    'ball arena',
    'the junkyard',
    'junkyard',
    'denver coliseum',
    'bellco theatre',
    'bellco',
    'red rocks amphitheatre',
    'red rocks',
    'red rocks park and amphitheatre',
    'mishawaka amphitheatre',
    'mishawaka',
    'the mishawaka',
    'sunshine studios live',
    'sunshine studios',
    'cervantes\' masterpiece ballroom',
    'cervantes',
    'cervantes masterpiece ballroom',
    'blue arena',
    'budweiser events center',
    'surfside 7',
    'moxi theater',
    'moxi',
    'goosetown tavern',
    'goosetown',
    'ante up',
    'ante up denver',
    '7th circle music collective',
    '7th circle',
    '7th circle diy',
    'hq',
    'hq denver',
    'meow wolf denver',
    'meow wolf',
    'the oriental theater',
    'oriental theater',
    'the federal theatre',
    'federal theatre',
    'the armory',
    'armory fort collins',
    'armory foco',
    'bohemian live music',
    'washingtons',
    'washingtons fort collins',
    'washingtons foco',
    'club vinyl',
    'vinyl denver',
    'vinyl nightclub'
];

// Target scraping definitions for independent venues
const SCRAPER_TARGETS = [
    [
        'venue_name' => 'The Black Sheep',
        'venue_url' => 'https://www.blacksheeprocks.com/',
        'selector' => '//div[contains(@class, "event-card")]|//div[contains(@class, "event")]|//article'
    ],
    [
        'venue_name' => 'Bluebird Theater',
        'venue_url' => 'https://www.bluebirdtheater.net/events',
        'selector' => '//div[contains(@class, "event-list")]|//div[contains(@class, "event")]|//article'
    ],
    [
        'venue_name' => 'Ogden Theatre',
        'venue_url' => 'https://www.ogdentheatre.com/events',
        'selector' => '//div[contains(@class, "event-list")]|//div[contains(@class, "event")]|//article'
    ],
    [
        'venue_name' => 'Gothic Theatre',
        'venue_url' => 'https://www.gothictheatre.com/events',
        'selector' => '//div[contains(@class, "event-list")]|//div[contains(@class, "event")]|//article'
    ],
    [
        'venue_name' => 'Mission Ballroom',
        'venue_url' => 'https://www.missionballroom.com/events',
        'selector' => '//div[contains(@class, "event-list")]|//div[contains(@class, "event")]|//article'
    ],
    [
        'venue_name' => 'Fiddler\'s Green Amphitheatre',
        'venue_url' => 'https://www.fiddlersgreenamp.com/events',
        'selector' => '//div[contains(@class, "event-list")]|//div[contains(@class, "event")]|//article'
    ],
    [
        'venue_name' => 'Red Rocks Amphitheatre',
        'venue_url' => 'https://www.redrocksonline.com/events',
        'selector' => '//div[contains(@class, "event-list")]|//div[contains(@class, "event")]|//article'
    ],
    [
        'venue_name' => 'Globe Hall',
        'venue_url' => 'https://globehall.com/events/',
        'selector' => '//a[contains(@id, "eventTitle")]'
    ],
    [
        'venue_name' => 'Larimer Lounge',
        'venue_url' => 'https://larimerlounge.com/events/',
        'selector' => '//a[contains(@id, "eventTitle")]'
    ],
    [
        'venue_name' => 'Lost Lake',
        'venue_url' => 'https://lost-lake.com/events/',
        'selector' => '//a[contains(@id, "eventTitle")]'
    ],
    [
        'venue_name' => 'Goosetown Tavern',
        'venue_url' => 'https://goosetowntavern.com/calendar/',
        'selector' => '//a[contains(@id, "eventTitle")]'
    ],
    [
        'venue_name' => 'Cervantes\' Masterpiece Ballroom & Other Side',
        'venue_url' => 'https://cervantesmasterpiece.com/events/',
        'selector' => '//div[contains(@class, "event")]|//article'
    ],
    [
        'venue_name' => 'Hi-Dive',
        'venue_url' => 'https://do303.com/venues/hi-dive',
        'selector' => '//a[contains(@href, "/events/")]'
    ],
    [
        'venue_name' => 'The Skylark Lounge',
        'venue_url' => 'https://do303.com/venues/the-skylark-lounge',
        'selector' => '//a[contains(@href, "/events/")]'
    ],
    [
        'venue_name' => 'Marquis Theater',
        'venue_url' => 'https://www.marquisdenver.com/shows',
        'selector' => '//div[contains(@class, "event")]|//article|//a[contains(@href, "ticketmaster.com")]|//a[contains(@href, "livenation.com")]'
    ],
    [
        'venue_name' => 'Ante Up',
        'venue_url' => 'https://www.anteupdenver.com/events-1',
        'selector' => '//a[contains(@href, "/events/")]'
    ],
    [
        'venue_name' => '7th Circle Music Collective',
        'venue_url' => 'https://www.7thcirclemusiccollective.org/',
        'selector' => '//div[contains(@class, "post-container")]'
    ],
    [
        'venue_name' => 'HQ',
        'venue_url' => 'https://hqdenver.com/',
        'selector' => '//script[contains(@type, "ld+json")]'
    ],
    [
        'venue_name' => 'Meow Wolf Denver',
        'venue_url' => 'https://tickets.meowwolf.com/events/denver/',
        'selector' => '//script[@id="__NEXT_DATA__"]'
    ],
    [
        'venue_name' => 'La Rumba',
        'venue_url' => 'https://larumbadenver.com/events-schedule/',
        'selector' => '//div[contains(@class, "tw-section")]'
    ],
    [
        'venue_name' => 'The Oriental Theater',
        'venue_url' => 'https://www.theorientaltheater.com/events',
        'selector' => '//script[contains(@type, "ld+json")]'
    ],
    [
        'venue_name' => 'The Federal Theatre',
        'venue_url' => 'https://thefederaltheatre.com/',
        'selector' => '//script[contains(@type, "ld+json")]'
    ],
    [
        'venue_name' => 'Moxi Theater',
        'venue_url' => 'https://moxitheater.com/events',
        'selector' => '//script[contains(@type, "ld+json")]'
    ],
    [
        'venue_name' => 'The Armory',
        'venue_url' => 'https://bohemianlivemusic.org/events/',
        'selector' => '//script[contains(@type, "ld+json")]|//div[contains(@class, "event")]|//article'
    ],
    [
        'venue_name' => 'Washington\'s',
        'venue_url' => 'https://washingtonsfoco.com/events/',
        'selector' => '//script[contains(@type, "ld+json")]|//div[contains(@class, "event")]|//article'
    ],
    [
        'venue_name' => 'Club Vinyl',
        'venue_url' => 'https://vinylnightclub.com/upcoming-denver-colorado-nightlife-club-events-shows-concerts-near-me/',
        'selector' => '//a[contains(@href, "/event/")]'
    ]
];

// SMTP Mail Server Settings for Concert Passport email dispatch
if (!defined('SMTP_HOST')) {
    define('SMTP_HOST', cfgEnv('SMTP_HOST', 'localhost'));
}
if (!defined('SMTP_PORT')) {
    define('SMTP_PORT', (int)cfgEnv('SMTP_PORT', '25'));
}
if (!defined('SMTP_USERNAME')) {
    define('SMTP_USERNAME', cfgEnv('SMTP_USERNAME', 'ConcertPassport@nycto.ninja'));
}
if (!defined('SMTP_PASSWORD')) {
    define('SMTP_PASSWORD', cfgEnv('SMTP_PASSWORD', ''));
}
if (!defined('SMTP_ENCRYPTION')) {
    define('SMTP_ENCRYPTION', cfgEnv('SMTP_ENCRYPTION', ''));
}

if (!defined('ALLOW_WEB_SYNC')) {
    $allowWebSyncRaw = strtolower(trim((string)cfgEnv('ALLOW_WEB_SYNC', '0')));
    define('ALLOW_WEB_SYNC', in_array($allowWebSyncRaw, ['1', 'true', 'yes', 'on'], true));
}

if (!defined('AGGREGATOR_ACTION_TOKEN')) {
    define('AGGREGATOR_ACTION_TOKEN', cfgEnv('AGGREGATOR_ACTION_TOKEN', ''));
}

if (!defined('EVENT_RETENTION_DAYS')) {
    $retentionRaw = (int)cfgEnv('EVENT_RETENTION_DAYS', '4');
    define('EVENT_RETENTION_DAYS', max(1, $retentionRaw));
}

if (!defined('SYNC_REPORT_EMAIL_TO')) {
    define('SYNC_REPORT_EMAIL_TO', cfgEnv('SYNC_REPORT_EMAIL_TO', ''));
}

if (!defined('SYNC_REPORT_EMAIL_FROM')) {
    define('SYNC_REPORT_EMAIL_FROM', cfgEnv('SYNC_REPORT_EMAIL_FROM', SMTP_USERNAME));
}

if (!defined('SYNC_REPORT_EMAIL_FROM_NAME')) {
    define('SYNC_REPORT_EMAIL_FROM_NAME', cfgEnv('SYNC_REPORT_EMAIL_FROM_NAME', "Nycto's Gig Grid"));
}

if (!defined('SYNC_REPORT_EMAIL_SUBJECT_PREFIX')) {
    define('SYNC_REPORT_EMAIL_SUBJECT_PREFIX', cfgEnv('SYNC_REPORT_EMAIL_SUBJECT_PREFIX', '[Nycto Sync]'));
}

if (!defined('SYNC_REPORT_EMAIL_ENABLED')) {
    $reportEnabledRaw = strtolower(trim((string)cfgEnv('SYNC_REPORT_EMAIL_ENABLED', SYNC_REPORT_EMAIL_TO !== '' ? '1' : '0')));
    define('SYNC_REPORT_EMAIL_ENABLED', in_array($reportEnabledRaw, ['1', 'true', 'yes', 'on'], true));
}

if (!function_exists('getMarketLocationSuffix')) {
    function getMarketLocationSuffix($market, $cityName = '') {
        $normalized = strtolower(trim((string)$market));
        switch ($normalized) {
            case 'texas':
                return 'TX';
            case 'california':
            case 'socal':
                return 'CA';
            case 'uk':
            case 'scotland':
                $cLower = strtolower(trim((string)$cityName));
                if ($cLower === '') return 'England';

                $scottishKeywords = ['glasgow', 'edinburgh', 'dundee', 'aberdeen', 'stirling', 'perth', 'falkirk', 'paisley', 'inverness', 'kinross', 'dunfermline', 'bathgate', 'highlands', 'scotland', 'orkney', 'greenock', 'ayr', 'kilmarnock', 'inverurie', 'fort william', 'elgin', 'dumfries', 'arbroath', 'st andrews', 'kirkcaldy', 'motherwell', 'hamilton', 'coatbridge', 'livingston', 'glenrothes', 'cumbernauld', 'irvine', 'caird', 'strathaven', 'galashiels', 'hawick', 'kelso', 'selkirk', 'peebles', 'dumbarton', 'helensburgh', 'oban', 'campbeltown', 'wick', 'thurso', 'lerwick', 'stornoway'];
                $welshKeywords = ['cardiff', 'swansea', 'newport', 'wrexham', 'wales', 'abertillery', 'merthyr tydfil', 'llandudno', 'bangor', 'rhyl', 'aberystwyth', 'bridgend', 'barry', 'neath', 'port talbot', 'cwmbran', 'pontypridd', 'caerphilly', 'llanelli', 'colwyn bay'];
                $irishKeywords = ['belfast', 'dublin', 'cork', 'galway', 'limerick', 'derry', 'londonderry', 'ireland', 'kilkenny', 'waterford', 'drogheda', 'dundalk', 'sligo', 'wexford', 'athlone', 'letterkenny', 'killarney', 'tralee', 'bray', 'navan', 'ennis', 'carlow'];

                foreach ($scottishKeywords as $kw) {
                    if (strpos($cLower, $kw) !== false) return 'Scotland';
                }
                foreach ($welshKeywords as $kw) {
                    if (strpos($cLower, $kw) !== false) return 'Wales';
                }
                foreach ($irishKeywords as $kw) {
                    if (strpos($cLower, $kw) !== false) return 'Ireland';
                }
                return 'England';
            case 'colorado':
            case 'front-range':
            default:
                return 'CO';
        }
    }
}

if (!function_exists('formatMarketLocation')) {
    function formatMarketLocation($cityName, $market) {
        $city = trim((string)$cityName);
        $suffix = trim((string)getMarketLocationSuffix($market, $city));
        if ($city === '') {
            return $suffix;
        }
        if ($suffix === '') {
            return $city;
        }
        return $city . ', ' . $suffix;
    }
}

if (!function_exists('isOutdoorVenue')) {
    function isOutdoorVenue($venueName) {
        $name = strtolower(trim((string)$venueName));
        if ($name === '') return false;
        $outdoorKeywords = [
            'amphitheatre', 'amphitheater', 'park', 'field', 'gardens', 
            'fairgrounds', 'ranch', 'pavilion', 'junkyard', 'patio', 
            'outdoor', 'stadium', 'bowl'
        ];
        foreach ($outdoorKeywords as $kw) {
            if (strpos($name, $kw) !== false) {
                return true;
            }
        }
        return false;
    }
}


