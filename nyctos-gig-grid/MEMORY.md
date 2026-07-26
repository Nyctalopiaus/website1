# Nycto's Gig Grid - Project Memory & Architecture Guide

This document acts as persistent project memory for AI assistants (Antigravity, Claude Code, AGY) to maintain codebase context, deployment rules, and venue scraper prompt templates across coding sessions.

---

## 📌 Core Business Rules & Policies

1. **Past Shows Policy (NO BACKFILL)**:
   - **Never backfill past shows.** Scrapers and database ingestion pipelines must strictly track current and future upcoming shows only.

2. **Temporary Script Auto-Cleanup Policy**:
   - **Step 6 Rule**: Always clean up and remove any temporary inspection, search, or test scripts (`.py`, `.js`) created during verification or debugging sessions.

3. **Multi-Region Navigation**:
   - The UI supports multi-region selection toggling per market (e.g. *Denver/Boulder*, *Springs/Pueblo*, *Ft Collins/North*, *West Slope*) without altering the visual header layout.

4. **Bandsintown Public API Route**:
   - Bandsintown public location search (`/events/search?location=...`) returns HTTP 403 Forbidden.
   - All Bandsintown ingestion routes through `fetchBandsintownFallback()`, which queries registered artists concurrently in rate-limited batches of 35.

---

## 🏛️ System Architecture & File Sitemap

| File / Folder | Role & Description |
| :--- | :--- |
| [`index.php`](file:///c:/Users/joshu/OneDrive/Documents/AI%20Projects/Website1/vm_code/nyctos-gig-grid/index.php) | Primary frontend calendar view, residency calculator, multi-artist line-up parser, and UI renderer. |
| [`gigs.db`](file:///c:/Users/joshu/OneDrive/Documents/AI%20Projects/Website1/vm_code/nyctos-gig-grid/gigs.db) | Primary SQLite database (`events`, `metal_artists`, `venues`, `artist_genre_cache`, `event_price_history`, `event_setlists`). |
| [`db/connection.php`](file:///c:/Users/joshu/OneDrive/Documents/AI%20Projects/Website1/vm_code/nyctos-gig-grid/db/connection.php) | PDO SQLite connection with 30s busy timeout, WAL mode, and `executeWithRetry()` helper for lock resilience. |
| [`services/EventAggregator.php`](file:///c:/Users/joshu/OneDrive/Documents/AI%20Projects/Website1/vm_code/nyctos-gig-grid/services/EventAggregator.php) | Core ingestion engine (Ticketmaster API, Bandsintown Fallback, venue resolution, status merging, metric logging). |
| [`services/SyncService.php`](file:///c:/Users/joshu/OneDrive/Documents/AI%20Projects/Website1/vm_code/nyctos-gig-grid/services/SyncService.php) | Orchestrates sync runs, database maintenance, expired show purging, and `last_sync.txt` timestamp writes. |
| [`services/SyncReportService.php`](file:///c:/Users/joshu/OneDrive/Documents/AI%20Projects/Website1/vm_code/nyctos-gig-grid/services/SyncReportService.php) | Generates structured HTML and plain-text email execution reports. |
| [`services/VenueScraper.php`](file:///c:/Users/joshu/OneDrive/Documents/AI%20Projects/Website1/vm_code/nyctos-gig-grid/services/VenueScraper.php) | Custom DOM & Do303 scrapers for local indie venues (Globe Hall, Hi-Dive, Skylark Lounge, Cervantes, Larimer Lounge). |
| [`services/LastFmNormalizer.php`](file:///c:/Users/joshu/OneDrive/Documents/AI%20Projects/Website1/vm_code/nyctos-gig-grid/services/LastFmNormalizer.php) | Normalizes event genres into 8 bucket categories using Last.fm top tags & local genre cache. |
| [`aggregator.php`](file:///c:/Users/joshu/OneDrive/Documents/AI%20Projects/Website1/vm_code/nyctos-gig-grid/aggregator.php) | Entry point for CLI/cPanel cron sync execution and API action routing. |
| [`assets/js/filters.js`](file:///c:/Users/joshu/OneDrive/Documents/AI%20Projects/Website1/vm_code/nyctos-gig-grid/assets/js/filters.js) | Client-side search, genre bucket filtering, multi-region toggles, and month auto-switch logic. |
| [`cache/last_sync.txt`](file:///c:/Users/joshu/OneDrive/Documents/AI%20Projects/Website1/vm_code/nyctos-gig-grid/cache/last_sync.txt) | Plain-text timestamp updated after each successful sync. |

---

## 📋 Standard Venue Scraper Prompt Template

When adding a new venue to `services/VenueScraper.php`, follow this 6-step prompt template:

```markdown
URL: <venue_url>
Venue Name (Optional): <venue_name>
City (Optional): <city_name>

Instructions:
1. Fetch and inspect the live HTML and network structure for this venue URL.
2. Check if the page uses JSON-LD schema (<script type="application/ld+json">), an embedded ticketing widget (AXS, Ticketmaster, Eventbrite, Dice, Seetickets), an API endpoint, or standard HTML event cards.
3. Identify the exact selectors/keys for:
   - Artist / Show Title
   - Date & Time
   - Ticket Link / Event URL
4. Update `services/VenueScraper.php` (or `EventAggregator.php`) in `nyctos-gig-grid` with the scraper rules for this venue.
5. Run a live test to verify that upcoming events are extracted and formatted properly for `gigs.db`.
6. Clean up and remove any temporary inspection or test scripts created during verification.
```

---

## ⚙️ Server & Deployment Reference

- **Remote Web Root**: `/home/nyctltlc/public_html/nyctos-gig-grid`
- **Cron Command**: `/usr/local/bin/php /home/nyctltlc/public_html/nyctos-gig-grid/aggregator.php`
