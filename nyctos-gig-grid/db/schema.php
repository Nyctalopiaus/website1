<?php

function ensureDatabaseSchema(PDO $db) {
    $db->exec("CREATE TABLE IF NOT EXISTS metal_artists (
        artist_id INTEGER PRIMARY KEY AUTOINCREMENT,
        artist_name TEXT UNIQUE NOT NULL
    )");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_artist_name ON metal_artists(artist_name)");

    $db->exec("CREATE TABLE IF NOT EXISTS events (
        event_id TEXT PRIMARY KEY,
        artist_name TEXT NOT NULL,
        venue_name TEXT NOT NULL,
        city_name TEXT NOT NULL,
        market TEXT NOT NULL DEFAULT 'front-range',
        start_time DATETIME NOT NULL,
        ticket_url TEXT,
        status TEXT NOT NULL DEFAULT 'Approved',
        source TEXT NOT NULL,
        genre TEXT NOT NULL DEFAULT 'Metal',
        tags TEXT,
        price_min REAL,
        price_max REAL,
        price_last_changed_at DATETIME,
        price_dropped_flag INTEGER NOT NULL DEFAULT 0,
        price_drop_amount REAL,
        price_drop_detected_at DATETIME,
        low_ticket_flag INTEGER NOT NULL DEFAULT 0,
        ticket_status_code TEXT,
        availability_tag TEXT,
        sold_out_flag INTEGER NOT NULL DEFAULT 0
    )");

    foreach ([
        "ALTER TABLE events ADD COLUMN genre TEXT NOT NULL DEFAULT 'Metal'",
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
        "ALTER TABLE events ADD COLUMN ticket_status_code TEXT",
        "ALTER TABLE events ADD COLUMN availability_tag TEXT",
        "ALTER TABLE events ADD COLUMN sold_out_flag INTEGER NOT NULL DEFAULT 0"
    ] as $sql) {
        try {
            @$db->exec($sql);
        } catch (PDOException $e) {
        }
    }

    $db->exec("CREATE INDEX IF NOT EXISTS idx_events_time ON events(start_time)");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_events_status ON events(status)");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_events_market_time ON events(market, start_time)");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_events_genre_locked ON events(genre_locked)");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_events_genre_source ON events(genre_source)");

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

    $db->exec("CREATE TABLE IF NOT EXISTS venues (
        venue_key TEXT PRIMARY KEY,
        venue_name TEXT NOT NULL,
        market TEXT NOT NULL DEFAULT 'front-range',
        address TEXT NOT NULL,
        city TEXT NOT NULL,
        latitude REAL,
        longitude REAL,
        capacity TEXT,
        maps_url TEXT NOT NULL
    )");
    foreach ([
        "ALTER TABLE venues ADD COLUMN market TEXT NOT NULL DEFAULT 'front-range'",
        "ALTER TABLE venues ADD COLUMN latitude REAL",
        "ALTER TABLE venues ADD COLUMN longitude REAL"
    ] as $sql) {
        try {
            @$db->exec($sql);
        } catch (PDOException $e) {
        }
    }
    $db->exec("CREATE INDEX IF NOT EXISTS idx_venues_market_name ON venues(market, venue_name)");
    $db->exec("CREATE TABLE IF NOT EXISTS artist_details_cache (
        artist_name TEXT PRIMARY KEY,
        bio_summary TEXT,
        top_tags TEXT,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
    )");
}
