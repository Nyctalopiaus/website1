<?php
/**
 * Single source of truth for per-tool metadata shared by generate_sitemap.php
 * and soar_monitor.php, so renaming a tool means updating one entry here
 * instead of keeping two separate hardcoded arrays in sync by hand.
 *
 * Key = the tool's current folder slug. Only tools that actually appear in the
 * sitemap and/or the status monitor need an entry — most tools (private ones,
 * unlaunched betas, and `status` itself) have none.
 */
return [
    'threatpulse' => [
        'app_name' => "Nycto's ThreatPulse",
        'sitemap' => ['changefreq' => 'hourly', 'priority' => '0.9'],
    ],
    'nyctos-gig-grid' => [
        'app_name' => "Nycto's Gig Grid",
        'sitemap' => ['changefreq' => 'daily', 'priority' => '0.9', 'check_db' => true],
    ],
    'fitstack' => [
        'app_name' => 'Fitstack',
        'sitemap' => ['changefreq' => 'weekly', 'priority' => '0.9'],
    ],
    'certforge' => [
        'app_name' => 'Certforge',
        'sitemap' => ['changefreq' => 'monthly', 'priority' => '0.9'],
    ],
    'housenomics' => [
        'app_name' => 'Housenomics',
        'sitemap' => ['changefreq' => 'weekly', 'priority' => '0.9'],
    ],
    'open-road-advisor' => [
        'app_name' => 'Open Road Advisor',
        'sitemap' => ['changefreq' => 'weekly', 'priority' => '0.9'],
    ],
    'greener-grass' => [
        'app_name' => 'Greener Grass',
        'sitemap' => ['changefreq' => 'weekly', 'priority' => '0.9'],
    ],
    'sunset-clause' => [
        'app_name' => 'Sunset Clause',
        'sitemap' => ['changefreq' => 'weekly', 'priority' => '0.9'],
    ],
    'homeward' => [
        'app_name' => 'Homeward',
        'sitemap' => ['changefreq' => 'weekly', 'priority' => '0.9'],
    ],
    'door-scout' => [
        'app_name' => 'DoorScout',
    ],
];
