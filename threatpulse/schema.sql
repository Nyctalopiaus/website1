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
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_published_at ON items(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_category_id ON items(category_id);
CREATE INDEX IF NOT EXISTS idx_normalized_title ON items(normalized_title);
