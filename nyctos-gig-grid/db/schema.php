<?php

function ensureDatabaseSchema(PDO $db) {
    $db->exec("CREATE TABLE IF NOT EXISTS approved_artists (
        artist_id INTEGER PRIMARY KEY AUTOINCREMENT,
        artist_name TEXT UNIQUE NOT NULL
    )");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_artist_name ON approved_artists(artist_name)");

    $db->exec("CREATE TABLE IF NOT EXISTS venues (
        venue_id INTEGER PRIMARY KEY AUTOINCREMENT,
        venue_key TEXT UNIQUE NOT NULL,
        venue_name TEXT NOT NULL,
        market TEXT NOT NULL DEFAULT 'front-range',
        address TEXT NOT NULL,
        city TEXT NOT NULL,
        latitude REAL,
        longitude REAL,
        capacity TEXT,
        maps_url TEXT NOT NULL,
        is_outdoor INTEGER NOT NULL DEFAULT 0
    )");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_venues_market_name ON venues(market, venue_name)");
    $db->exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_venues_key ON venues(venue_key)");

    $db->exec("CREATE TABLE IF NOT EXISTS market_cities (
        city_id INTEGER PRIMARY KEY AUTOINCREMENT,
        market TEXT NOT NULL,
        region TEXT NOT NULL,
        city_name TEXT NOT NULL,
        state_code TEXT,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        default_radius_miles INTEGER NOT NULL DEFAULT 30,
        is_active INTEGER NOT NULL DEFAULT 1
    )");
    $db->exec("CREATE TABLE IF NOT EXISTS scraped_venues (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        venue_name TEXT NOT NULL,
        city_name TEXT NOT NULL DEFAULT 'Denver',
        market TEXT NOT NULL DEFAULT 'front-range',
        scrape_url TEXT NOT NULL,
        parser_type TEXT NOT NULL,
        xpath_container TEXT DEFAULT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        last_scraped_at DATETIME DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_scraped_venues_active ON scraped_venues(is_active, market)");

    // Auto-migrate production venues table if venue_id column is missing
    try {
        $venueCols = [];
        $stmtV = $db->query("PRAGMA table_info(venues)");
        if ($stmtV !== false) {
            foreach ($stmtV->fetchAll(PDO::FETCH_ASSOC) as $c) {
                $venueCols[] = $c['name'];
            }
        }
        if (!empty($venueCols) && !in_array('venue_id', $venueCols, true)) {
            $db->exec("CREATE TABLE venues_v3 (
                venue_id INTEGER PRIMARY KEY AUTOINCREMENT,
                venue_key TEXT UNIQUE NOT NULL,
                venue_name TEXT NOT NULL,
                market TEXT NOT NULL DEFAULT 'front-range',
                address TEXT NOT NULL,
                city TEXT NOT NULL,
                latitude REAL,
                longitude REAL,
                capacity TEXT,
                maps_url TEXT NOT NULL,
                is_outdoor INTEGER NOT NULL DEFAULT 0
            )");
            $db->exec("INSERT INTO venues_v3 (venue_key, venue_name, market, address, city, latitude, longitude, capacity, maps_url, is_outdoor)
                SELECT venue_key, venue_name, market, address, city, latitude, longitude, capacity, maps_url, COALESCE(is_outdoor, 0)
                FROM venues ORDER BY venue_name ASC");
            $db->exec("DROP TABLE venues");
            $db->exec("ALTER TABLE venues_v3 RENAME TO venues");
            $db->exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_venues_key ON venues(venue_key)");
            $db->exec("CREATE INDEX IF NOT EXISTS idx_venues_market_name ON venues(market, venue_name)");
        }
    } catch (PDOException $e) {
    }

    $db->exec("CREATE TABLE IF NOT EXISTS events (
        event_id TEXT PRIMARY KEY,
        artist_name TEXT NOT NULL,
        venue_id INTEGER REFERENCES venues(venue_id),
        venue_name TEXT NOT NULL,
        market TEXT NOT NULL DEFAULT 'front-range',
        start_time DATETIME NOT NULL,
        ticket_url TEXT,
        status TEXT NOT NULL DEFAULT 'Approved',
        source TEXT NOT NULL,
        genre TEXT NOT NULL DEFAULT 'all',
        tags TEXT,
        lastfm_normalized_at DATETIME,
        price_min REAL,
        price_max REAL,
        price_last_changed_at DATETIME,
        price_dropped_flag INTEGER NOT NULL DEFAULT 0,
        price_drop_amount REAL,
        price_drop_detected_at DATETIME,
        low_ticket_flag INTEGER NOT NULL DEFAULT 0,
        ticket_status_code TEXT,
        availability_tag TEXT,
        sold_out_flag INTEGER NOT NULL DEFAULT 0,
        is_approved INTEGER NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        ticketmaster_url TEXT,
        eventbrite_url TEXT,
        bandsintown_url TEXT,
        venue_url TEXT,
        doors_time DATETIME
    )");

    foreach ([
        "ALTER TABLE events ADD COLUMN venue_id INTEGER REFERENCES venues(venue_id)",
        "ALTER TABLE events ADD COLUMN is_approved INTEGER NOT NULL DEFAULT 1",
        "ALTER TABLE events ADD COLUMN created_at DATETIME",
        "ALTER TABLE events ADD COLUMN genre TEXT NOT NULL DEFAULT 'all'",
        "ALTER TABLE events ADD COLUMN tags TEXT",
        "ALTER TABLE events ADD COLUMN price_min REAL",
        "ALTER TABLE events ADD COLUMN price_max REAL",
        "ALTER TABLE events ADD COLUMN price_last_changed_at DATETIME",
        "ALTER TABLE events ADD COLUMN price_dropped_flag INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE events ADD COLUMN price_drop_amount REAL",
        "ALTER TABLE events ADD COLUMN price_drop_detected_at DATETIME",
        "ALTER TABLE events ADD COLUMN low_ticket_flag INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE events ADD COLUMN market TEXT NOT NULL DEFAULT 'front-range'",
        "ALTER TABLE events ADD COLUMN genre_source TEXT DEFAULT 'ticketmaster'",
        "ALTER TABLE events ADD COLUMN genre_locked INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE events ADD COLUMN ticketmaster_url TEXT",
        "ALTER TABLE events ADD COLUMN eventbrite_url TEXT",
        "ALTER TABLE events ADD COLUMN bandsintown_url TEXT",
        "ALTER TABLE events ADD COLUMN venue_url TEXT",
        "ALTER TABLE events ADD COLUMN lastfm_normalized_at DATETIME",
        "ALTER TABLE events ADD COLUMN ticket_status_code TEXT",
        "ALTER TABLE events ADD COLUMN availability_tag TEXT",
        "ALTER TABLE events ADD COLUMN sold_out_flag INTEGER NOT NULL DEFAULT 0",
        "ALTER TABLE events ADD COLUMN doors_time DATETIME"
    ] as $sql) {
        try {
            @$db->exec($sql);
        } catch (PDOException $e) {
        }
    }

    try {
        @$db->exec("ALTER TABLE events DROP COLUMN city_name");
        @$db->exec("ALTER TABLE events DROP COLUMN state_code");
    } catch (PDOException $e) {
    }

    $db->exec("CREATE INDEX IF NOT EXISTS idx_events_venue_id ON events(venue_id)");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_events_is_approved ON events(is_approved)");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at)");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_events_appr_time ON events(is_approved, start_time)");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_events_time ON events(start_time)");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_events_status ON events(status)");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_events_market_time ON events(market, start_time)");

    // Reconcile and link events.venue_id against canonical venues table
    try {
        $db->exec("UPDATE events
            SET venue_id = (SELECT venue_id FROM venues WHERE LOWER(venues.venue_name) = LOWER(events.venue_name) LIMIT 1)
            WHERE venue_id IS NULL OR venue_id = 0");

        $db->exec("UPDATE events
            SET is_approved = CASE WHEN venue_id IS NOT NULL AND venue_id > 0 THEN 1 ELSE 0 END");

        // Backfill vendor URL columns for existing records
        $db->exec("UPDATE events SET bandsintown_url = ticket_url WHERE (bandsintown_url IS NULL OR bandsintown_url = '') AND (ticket_url LIKE '%bandsintown.com%' OR source LIKE '%Bandsintown%')");
        $db->exec("UPDATE events SET ticketmaster_url = ticket_url WHERE (ticketmaster_url IS NULL OR ticketmaster_url = '') AND (ticket_url LIKE '%ticketmaster.com%' OR ticket_url LIKE '%livenation.com%' OR source LIKE '%Ticketmaster%')");
        $db->exec("UPDATE events SET eventbrite_url = ticket_url WHERE (eventbrite_url IS NULL OR eventbrite_url = '') AND (ticket_url LIKE '%eventbrite.com%' OR source LIKE '%Eventbrite%')");
        $db->exec("UPDATE events SET venue_url = ticket_url WHERE (venue_url IS NULL OR venue_url = '') AND source LIKE '%VenueScraper%'");
    } catch (PDOException $e) {
    }

    $db->exec("CREATE TABLE IF NOT EXISTS event_price_history (
        history_id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL,
        observed_price_min REAL,
        observed_price_max REAL,
        price_source TEXT,
        observed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        drop_amount REAL DEFAULT 0,
        drop_detected INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY(event_id) REFERENCES events(event_id) ON DELETE CASCADE
    )");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_price_history_event_id ON event_price_history(event_id)");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_price_history_observed_at ON event_price_history(observed_at)");

    $db->exec("CREATE TABLE IF NOT EXISTS attended_log (
        log_id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT UNIQUE NOT NULL,
        rating INTEGER CHECK(rating >= 1 AND rating <= 5),
        journal_notes TEXT,
        media_urls TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(event_id) REFERENCES events(event_id) ON DELETE CASCADE
    )");

    $db->exec("CREATE TABLE IF NOT EXISTS artist_genre_cache (
        artist_name TEXT PRIMARY KEY,
        is_metal INTEGER NOT NULL,
        tags TEXT,
        checked_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )");

    try {
        @$db->exec("ALTER TABLE artist_genre_cache ADD COLUMN tags TEXT");
        @$db->exec("ALTER TABLE artist_genre_cache ADD COLUMN source TEXT DEFAULT 'musicbrainz'");
    } catch (PDOException $e) {
    }

    $db->exec("CREATE TABLE IF NOT EXISTS event_setlists (
        event_id TEXT PRIMARY KEY,
        setlist_json TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )");

    $db->exec("CREATE TABLE IF NOT EXISTS artist_details_cache (
        artist_name TEXT PRIMARY KEY,
        bio_summary TEXT,
        top_tags TEXT,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
    )");
}
