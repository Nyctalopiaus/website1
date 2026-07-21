<?php
/**
 * Configuration Settings for Metal Concert Calendar
 */

// Force America/Denver timezone for consistent date formatting across APIs
date_default_timezone_set('America/Denver');

// API Credentials
define('TICKETMASTER_API_KEY', '8zZhK2lQ9qlRXs7GeF3UYz9OoBNCASYf'); // User's developer key
define('BANDSINTOWN_APP_ID', 'metal_calendar'); // Default app_id, replace if needed

// Optional: Paste your free Scrape.do token below to bypass Cloudflare/WAF blocks on venue sites.
define('SCRAPE_DO_TOKEN', '337712a748d749be9b10e4f63e36e52a0609bb22cd1');

// Setlist.fm API key (Register free at https://www.setlist.fm/settings/api)
define('SETLIST_FM_API_KEY', 'Daz7fWnHMCq1D-CzNOT5Xdjwk0hmuj6MXGsu');

// Last.fm API Key for artist biographies and tags retrieval
define('LASTFM_API_KEY', '');


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
define('SMTP_HOST', 'localhost'); // Namecheap local SMTP relay server
define('SMTP_PORT', 25);           // Port 25 is standard for localhost non-secure cPanel relay
define('SMTP_USERNAME', 'ConcertPassport@nycto.ninja');
define('SMTP_PASSWORD', '');       // Configure if external SMTP server is used
define('SMTP_ENCRYPTION', '');     // 'ssl', 'tls', or empty for local port 25 relay


