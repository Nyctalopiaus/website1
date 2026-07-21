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
        start_time DATETIME NOT NULL,
        ticket_url TEXT,
        status TEXT NOT NULL DEFAULT 'Approved',
        source TEXT NOT NULL,
        genre TEXT NOT NULL DEFAULT 'Metal',
        tags TEXT,
        price_min REAL,
        price_max REAL
    )");

    foreach ([
        "ALTER TABLE events ADD COLUMN genre TEXT NOT NULL DEFAULT 'Metal'",
        "ALTER TABLE events ADD COLUMN tags TEXT",
        "ALTER TABLE events ADD COLUMN price_min REAL",
        "ALTER TABLE events ADD COLUMN price_max REAL"
    ] as $sql) {
        try {
            @$db->exec($sql);
        } catch (PDOException $e) {
        }
    }

    $db->exec("CREATE INDEX IF NOT EXISTS idx_events_time ON events(start_time)");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_events_status ON events(status)");

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
        address TEXT NOT NULL,
        city TEXT NOT NULL,
        capacity TEXT,
        maps_url TEXT NOT NULL
    )");
    $db->exec("CREATE TABLE IF NOT EXISTS artist_details_cache (
        artist_name TEXT PRIMARY KEY,
        bio_summary TEXT,
        top_tags TEXT,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
    )");
}
