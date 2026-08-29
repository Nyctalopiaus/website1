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

    // Comma-separated alternate spellings/names for a venue (e.g. "The Boileroom, Guildford"
    // as an alt name on canonical venue "Boileroom"). Populated by admin_data_quality.php's
    // Venue Review tab, both from manual edits and automatically when merging a duplicate
    // venue. Also consumed by EventAggregator.php's loadVenueWhitelist() so a future scrape
    // matching an alt name resolves to the canonical venue instead of creating a new row.
    try {
        @$db->exec("ALTER TABLE venues ADD COLUMN alternate_names TEXT");
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
        doors_time DATETIME,
        last_url_checked_at DATETIME,
        url_status TEXT DEFAULT 'unknown'
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
        "ALTER TABLE events ADD COLUMN doors_time DATETIME",
        "ALTER TABLE events ADD COLUMN last_url_checked_at DATETIME",
        "ALTER TABLE events ADD COLUMN url_status TEXT DEFAULT 'unknown'"
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

    // Defense-in-depth against duplicate events: EventAggregator's dedupe-key and fuzzy-match
    // logic (services/EventAggregator.php) is the primary line of defense and should always
    // catch a repeat before it reaches this INSERT. This index is the backstop for whatever
    // slips past both of those checks (a race, a code path that bypasses saveEvent()) — it
    // turns a silent duplicate insert into a catchable constraint violation instead.
    // Scoped to venue_id IS NOT NULL because events without a resolved venue link have no
    // canonical identity to key on and must keep relying on the free-text fuzzy match.
    // NOTE: this will fail to create (silently, see try/catch) if duplicate rows already
    // exist in the table — run a one-time dedupe pass before/alongside deploying this if so.
    try {
        $db->exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_events_dedupe_backstop
            ON events(venue_id, DATE(start_time), LOWER(TRIM(artist_name)))
            WHERE venue_id IS NOT NULL");
    } catch (PDOException $e) {
    }

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

    // Possible-double-bill review queue: rows sharing the same venue + exact start_time but
    // under different artist_name text, where a support-act-vs-headliner or co-headline split
    // across sources may have produced two events for what's really one show. Unlike
    // data_quality_event_flags (a single event per flag row), a double-bill candidate is a
    // *group* of 2+ events, so every event in the group gets its own row sharing group_key —
    // see flagPossibleDoubleBills() in services/SyncService.php for how groups are detected
    // (deliberately conservative: it skips venues whose events default to one generic
    // time-of-day, since that's a false-collision risk, not a duplicate signal) and
    // admin_double_bills.php for how a group is reviewed and merged or dismissed.
    $db->exec("CREATE TABLE IF NOT EXISTS data_quality_double_bill_flags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_key TEXT NOT NULL,
        event_id TEXT NOT NULL,
        venue_id INTEGER,
        venue_name TEXT,
        start_time DATETIME,
        artist_name TEXT,
        reason TEXT NOT NULL DEFAULT 'possible_double_bill',
        flagged_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        resolved INTEGER NOT NULL DEFAULT 0,
        resolution TEXT,
        resolved_at DATETIME
    )");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_dbbf_group_key ON data_quality_double_bill_flags(group_key)");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_dbbf_resolved ON data_quality_double_bill_flags(resolved)");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_dbbf_event_id ON data_quality_double_bill_flags(event_id)");

    // Possible-duplicate-venue review queue for admin_data_quality.php's Venue Review tab.
    // group_key is the sorted, comma-joined venue_ids of a cluster of venues that share an
    // address, share coordinates, or share a simplifyVenueName()-normalized name (see the
    // connected-components grouping in admin_data_quality.php) — deterministic given the same
    // membership, so a group Josh dismisses as "not actually a duplicate" stays dismissed
    // across page loads. venue_ids duplicates group_key's ids as its own column so a row
    // remains self-describing even if group_key's format ever changes.
    $db->exec("CREATE TABLE IF NOT EXISTS data_quality_venue_dupe_flags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_key TEXT NOT NULL,
        venue_ids TEXT NOT NULL,
        flagged_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        resolved INTEGER NOT NULL DEFAULT 0,
        resolution TEXT,
        resolved_at DATETIME
    )");
    $db->exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_dqvdf_group_key ON data_quality_venue_dupe_flags(group_key)");
    $db->exec("CREATE INDEX IF NOT EXISTS idx_dqvdf_resolved ON data_quality_venue_dupe_flags(resolved)");
}
