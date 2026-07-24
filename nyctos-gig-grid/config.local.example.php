<?php
/**
 * Local non-committed secret overrides.
 * Copy this file to `config.local.php` and fill values.
 */

define('TICKETMASTER_API_KEY', 'replace_me');
define('BANDSINTOWN_APP_ID', 'js_nyctos_gig_grid');
define('SCRAPE_DO_TOKEN', 'replace_me_or_blank');
define('SETLIST_FM_API_KEY', 'replace_me');
define('LASTFM_API_KEY', 'replace_me_or_blank');

define('SMTP_HOST', 'localhost');
define('SMTP_PORT', 25);
define('SMTP_USERNAME', 'ConcertPassport@nycto.ninja');
define('SMTP_PASSWORD', 'replace_me_or_blank');
define('SMTP_ENCRYPTION', '');

// Security hardening toggles
define('ALLOW_WEB_SYNC', false); // Keep false in production; use CLI cron.
define('AGGREGATOR_ACTION_TOKEN', 'replace_with_long_random_token');
