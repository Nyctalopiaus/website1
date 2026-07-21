<?php
/**
 * Configuration Settings for Metal Concert Calendar
 */

$localConfigPath = __DIR__ . '/config.local.php';
if (file_exists($localConfigPath)) {
    require_once $localConfigPath;
}

$envFilePath = getenv('METAL_CALENDAR_ENV_FILE');
if ($envFilePath === false || trim($envFilePath) === '') {
    $envFilePath = '/home/nyctltlc/api.env';
}

$GLOBALS['METAL_CALENDAR_FILE_ENV'] = [];
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

            $GLOBALS['METAL_CALENDAR_FILE_ENV'][$key] = $value;
        }
    }
}

if (!function_exists('cfgEnv')) {
    function cfgEnv($name, $default = '') {
        $value = getenv($name);
        if ($value !== false && $value !== '') {
            return $value;
        }

        $fileEnv = $GLOBALS['METAL_CALENDAR_FILE_ENV'] ?? [];
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
    define('BANDSINTOWN_APP_ID', cfgEnv('BANDSINTOWN_APP_ID', 'metal_calendar'));
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
    'moxi'
];

// Target scraping definitions for independent venues
const SCRAPER_TARGETS = [
    [
        'venue_name' => 'The Black Sheep',
        'venue_url' => 'https://www.blacksheeprocks.com/events',
        'selector' => '//div[contains(@class, "event-card")]'
    ],
    [
        'venue_name' => 'Bluebird Theater',
        'venue_url' => 'https://www.bluebirdtheater.net/events',
        'selector' => '//div[contains(@class, "event-list")]'
    ],
    [
        'venue_name' => 'Ogden Theatre',
        'venue_url' => 'https://www.ogdentheatre.com/events',
        'selector' => '//div[contains(@class, "event-list")]'
    ],
    [
        'venue_name' => 'Gothic Theatre',
        'venue_url' => 'https://www.gothictheatre.com/events',
        'selector' => '//div[contains(@class, "event-list")]'
    ],
    [
        'venue_name' => 'Mission Ballroom',
        'venue_url' => 'https://www.missionballroom.com/events',
        'selector' => '//div[contains(@class, "event-list")]'
    ],
    [
        'venue_name' => 'Fiddler\'s Green Amphitheatre',
        'venue_url' => 'https://www.fiddlersgreenamp.com/events',
        'selector' => '//div[contains(@class, "event-list")]'
    ],
    [
        'venue_name' => 'Red Rocks Amphitheatre',
        'venue_url' => 'https://www.redrocksonline.com/events',
        'selector' => '//div[contains(@class, "event-list")]'
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


