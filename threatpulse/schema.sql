-- ThreatPulse Database Schema (SQLite)

CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,                       -- SHA-256 hash of canonical URL
    title TEXT NOT NULL,                        -- Cleaned display title
    normalized_title TEXT NOT NULL,             -- Normalized string for fuzzy matching (lowercase, no punctuation/stopwords)
    source_id TEXT NOT NULL,                    -- Feed identifier from config
    source_name TEXT NOT NULL,                  -- Human readable source name
    category_id TEXT NOT NULL,                  -- Category identifier (active_threats, platform_infrastructure, engineering_homelab)
    category_name TEXT NOT NULL,                -- Human readable category name
    link TEXT NOT NULL,                         -- Clean canonical URL (tracking params stripped)
    published_at TEXT NOT NULL,                 -- ISO 8601 UTC timestamp
    summary TEXT NOT NULL,                      -- Clean plain-text excerpt (HTML & scripts stripped, 2-3 sentences max)
    tags TEXT NOT NULL DEFAULT '[]',            -- JSON array of extracted tags/CVEs
    secondary_sources TEXT NOT NULL DEFAULT '[]', -- JSON array of related duplicate coverage sources
    due_date TEXT,                              -- CISA KEV mandated federal remediation deadline (ISO 8601), NULL for non-KEV items
    cvss_score REAL,                            -- NVD CVSS base score (0.0-10.0) for the item's primary CVE, NULL if not yet enriched/no CVE
    cvss_severity TEXT,                         -- NVD CVSS qualitative severity (LOW/MEDIUM/HIGH/CRITICAL), NULL if not yet enriched/no CVE
    epss_score REAL,                            -- FIRST.org EPSS exploit probability (0.0-1.0) for the item's primary CVE, NULL if not yet enriched/no CVE
    epss_percentile REAL,                       -- FIRST.org EPSS percentile rank (0.0-1.0) relative to all scored CVEs, NULL if not yet enriched/no CVE
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_published_at ON items(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_category_id ON items(category_id);
CREATE INDEX IF NOT EXISTS idx_normalized_title ON items(normalized_title);

-- Phase 3: structured atomic indicators (hashes/URLs/domains/IPs) from abuse.ch's Community
-- APIs (URLhaus, ThreatFox, MalwareBazaar) and the OTX API v2. Deliberately a separate table
-- from `items`: IOCs are a different content shape (no title/summary/severity concept) and are
-- rendered in their own dedicated "IOC Watch" view rather than the news kanban, per design.
CREATE TABLE IF NOT EXISTS ioc_items (
    id TEXT PRIMARY KEY,                        -- SHA-256 hash of "ioc_type:ioc_value" (lowercased)
    ioc_type TEXT NOT NULL,                     -- hash_md5 | hash_sha1 | hash_sha256 | url | domain | ip
    ioc_value TEXT NOT NULL,                    -- the raw indicator value
    malware_family TEXT,                        -- analyst-tagged family/campaign name, if reported
    confidence_score REAL NOT NULL DEFAULT 0,   -- computed 0-100 (see fetcher.py score_ioc_confidence())
    confidence_label TEXT NOT NULL DEFAULT 'Low', -- High | Medium | Low, derived from confidence_score
    native_confidence REAL,                     -- ThreatFox's own analyst-submitted confidence_level (0-100), NULL if not provided
    first_seen TEXT NOT NULL,                   -- ISO 8601 UTC, earliest report across all sources
    last_seen TEXT NOT NULL,                    -- ISO 8601 UTC, most recent report across all sources (drives freshness decay)
    source_count INTEGER NOT NULL DEFAULT 1,    -- number of distinct feeds that have reported this indicator (corroboration signal)
    sources TEXT NOT NULL DEFAULT '[]',         -- JSON array of source feed ids that reported this indicator
    reference TEXT,                             -- link to the source's analyst-facing report page, if any
    -- GreyNoise Community API cross-reference (IP-type indicators only; requires GREYNOISE_API_KEY).
    -- Weekly-budgeted (free Community tier is 50 lookups/week) -- these stay NULL until an IP is
    -- actually checked, and once set feed back into confidence_score via score_ioc_confidence().
    greynoise_classification TEXT,              -- 'malicious' | 'benign' | 'unknown', NULL if never checked
    greynoise_riot INTEGER,                     -- 1 if GreyNoise's RIOT dataset flags this as a known business service, else 0/NULL
    greynoise_checked_at TEXT,                  -- ISO 8601 UTC of the last GreyNoise lookup, NULL if never checked
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_ioc_last_seen ON ioc_items(last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_ioc_confidence_label ON ioc_items(confidence_label);
CREATE INDEX IF NOT EXISTS idx_ioc_type ON ioc_items(ioc_type);
-- NOTE: no CREATE INDEX on greynoise_checked_at here. This whole script runs unconditionally via
-- executescript() on every startup (see init_db()), and CREATE TABLE IF NOT EXISTS is a no-op on
-- an already-existing ioc_items table -- so on any pre-existing DB from before the GreyNoise
-- columns were added, a CREATE INDEX referencing greynoise_checked_at here would crash init_db()
-- outright (column doesn't exist yet; IF NOT EXISTS only guards the index name, not the column).
-- The index is created safely in fetcher.py's migration-guard block instead, after the ALTER
-- TABLE that guarantees the column actually exists first.
