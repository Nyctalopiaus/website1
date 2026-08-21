# Server-Wide Lab Memory & Multi-Project Directory

This document serves as persistent master memory for AI assistants (Antigravity, AGY, Claude Code) working across all web application projects in this server ecosystem.

---

## 🌐 Server Ecosystem Overview

**Production Domain:** [https://nycto.ninja/](https://nycto.ninja/) — this is where the contents of this `vm_code` folder are published live. Reference this URL for local dev testing comparisons and when debugging production issues.

**Hosting:** Namecheap shared hosting, managed via cPanel (user `nyctltlc`). Cron jobs are configured through cPanel's "Cron Jobs" tool (see schedule below).

All applications are hosted under your public web root (`/home/nyctltlc/public_html/`). The site root itself (`index.html`, `app.js`, `styles.css`) is the "Nycto's Project Lab" landing page — a card-grid launcher linking out to each tool below, with a retro 3D-tilt/synth-chime UI effect.

| Application Folder | Domain / Route | Core Purpose | Tech Stack |
| :--- | :--- | :--- | :--- |
| **`nyctos-gig-grid`** | `/nyctos-gig-grid/` | Local concert calendar — multi-source ingestion (Ticketmaster API, Bandsintown fallback, custom Do303/venue DOM scrapers for Globe Hall, Hi-Dive, Skylark, Cervantes, Larimer Lounge), Last.fm genre normalization, price tracking, setlists. Has its own detailed `MEMORY.md`. | PHP (self-contained), SQLite (`gigs.db`), cron sync via `aggregator.php`. |
| **`relocation-assessment`** | `/relocation-assessment/` | Real-time relocation analytics dashboard — climate, transit radius scoring, geocoding. | Vanilla JS, Open-Meteo API, Leaflet JS, Nominatim geocoding. |
| **`open-road-advisor`** | `/open-road-advisor/` | Road trip route planning and stop recommendations. | Vanilla JS. Weather/routing/telemetry data comes from public APIs (Open-Meteo, OSRM) called directly from the browser — no data is posted to or stored by the shared backend. |
| **`mortgage-calculator`** | `/mortgage-calculator/` (titled "Nycto's Housing Cost Calculator") | Mortgage/interest calculators, amortization schedule, MLS listing scraper. | Vanilla JS + its own PHP proxies (`mls-proxy.php`, `rates-proxy.php`) for public rate/listing data only. Calculator inputs are localStorage-only — see `storage.js` header comment; do NOT add a server sync for them. |
| **`retirement-forecaster`** | `/retirement-forecaster/` | Long-term retirement savings projection tool with charts/KPIs. | Vanilla JS (chart.js-style modules: `charts.js`, `kpi.js`, `simulation.js`). No network calls; fully client-side. |
| **`cism-training`** | `/cism-training/` (titled "CISM Exam Trainer Console") | CISM security certification exam prep — quiz simulator, flashcards, bookmarks, attempt tracking. | Vanilla JS front end. All progress/bookmarks/attempts are localStorage-only; the question/flashcard seed is loaded from a static `backend/cism_seed.json` file, not an API. |
| **`crypto-game`** | `/crypto-game/` (titled "Interactive Cryptographic Matrix") | Interactive web-based crypto simulation game. | Vanilla JS. |
| **`game-rating-log`** | `/game-rating-log/` (titled "Handheld Gaming Log") | Personal video game backlog and rating tracker. Has a `CONVENTIONS.md` with strict coding rules (vanilla JS only, no frameworks, `textContent` over `innerHTML`, no placeholder diffs). | Vanilla JS; localStorage-only — see `app.js` header comment; do NOT add a server sync for this data. |
| **`threatpulse`** | `/threatpulse/` | Security & tech intelligence dashboard — high-signal, distraction-free security advisory and technical news feed. Ingests RSS/Atom/JSON feeds, dedupes via URL hashing + fuzzy title matching (48h window), extracts CVEs/severity tags. | Python fetcher (`fetcher.py`, feedparser/BeautifulSoup/lxml) writing to SQLite + a static `data/feed.json`, consumed by a vanilla JS front end. Self-contained (does not use the shared Node backend). |
| **`hf-model-matcher`** | `/hf-model-matcher/` | Hardware-aware AI discovery engine — recommends Hugging Face models that fit a user's VRAM/RAM without OOM errors. | Python **FastAPI** backend (`backend/main.py`, `hardware.py`, `hf_client.py`, `engine.py`) + vanilla JS front end. Self-contained, separate from the shared Node backend. |
| **`status`** | `/status/` | Outbound Connection & Infrastructure Status page — site-wide uptime/status dashboard for the Nycto Lab. | Vanilla JS, local `data/monitoring.db` (SQLite) + `status-data.json`. |

### ⚙️ Shared Backend Service (`/backend/`)

A single Node.js/Express API (`nycto-project-lab-backend`) lives at `/home/nyctltlc/public_html/backend/server.js` — i.e. inside the same `public_html` web root as everything else, not a separate `/var/www/html` path. It runs as a **cPanel "Setup Node.js App" (CloudLinux Node.js Selector, Passenger-backed) application**, not a systemd service — `systemctl` is not available/relevant here. The app root registered with the selector is `public_html` (confirmed by the `~/nodevenv/public_html/` virtualenv folder it creates). Note: `backend/nycto-backend.service` is a **stale/incorrect leftover file** (references `/var/www/html/backend`, a `nycto` user, and `systemctl restart`, none of which apply to this host) — it isn't used and should be deleted; don't follow its instructions.

To restart it over SSH, use the CloudLinux selector CLI if available:
```
cloudlinux-selector restart --json --interpreter node --user nyctltlc --app-root public_html
```
If that command isn't permitted for this account, use cPanel → "Setup Node.js App" → the app → **Restart** button instead (or touch `public_html/tmp/restart.txt` if the app has a `tmp/` folder, which triggers a Passenger-style restart). Always confirm a restart actually took effect with a quick `curl` against a known route rather than assuming the command succeeded.

It is intentionally **stateless and holds no SQLite database** — it only proxies public, non-personal data:

- `/api/rates` (GET) → live 30/15-yr mortgage rates from FRED, used as a fallback source (mortgage-calculator's primary rate source is its own `rates-proxy.php`).

Uses `express` and `cors` only (per `backend/package.json`).

**Removed 2026-08-18 (security fix):** this backend used to also duplicate `/mortgage-calculator/mls-proxy.php` (public MLS/Redfin listing lookup proxy), but that copy had a Scrape.do API token **hardcoded in plaintext** and no host allowlist/SSRF protection (it would fetch any `?url=` a caller supplied). The route was deleted from `server.js`. The real, hardened implementation is the PHP file `mortgage-calculator/mls-proxy.php`, which restricts fetches to `redfin.com`, rejects DNS-rebinding to private/reserved IPs, verifies TLS, and reads its `SCRAPE_DO_TOKEN`/`SCRAPER_API_KEY` from `/home/nyctltlc/api.env` via `getenv()` — that file already serves this exact URL path in production. **The leaked token should be rotated at Scrape.do**, and the new token set as `SCRAPE_DO_TOKEN` in `/home/nyctltlc/api.env` (this key is already read by both `mortgage-calculator/mls-proxy.php` and `nyctos-gig-grid/config.php`, so it may already exist there — just needs updating to the new value). Do not re-add an mls-proxy route to `server.js` without porting the same allowlist/DNS-rebind/getenv() pattern.

**History / do not regress:** this backend used to also expose `/api/games`, `/api/calculator`, and `/api/cism/questions|flashcards|attempts|bookmarks`, backed by a shared SQLite database (`backend/database.sqlite`) with no per-user or per-session scoping — every visitor's game log, calculator inputs, and CISM progress were stored in one global table and visible to any other visitor via GET, directly contradicting the "100% Private / Local Storage" claims shown in those tools' own UI. Those routes, their tables, and the `sqlite3` dependency were removed (see `game-rating-log/app.js` and `mortgage-calculator/storage.js` header comments for the equivalent front-end history). The leftover `backend/database.sqlite` file itself (the actual collected data, at `/home/nyctltlc/public_html/backend/database.sqlite` on production) required a separate manual cleanup pass on the server — removing the code doesn't delete data already on disk. Don't confuse it with `/home/nyctltlc/database.db` (unrelated, sits directly in the home dir, out of scope) or `public_html/threatpulse/database.db` (ThreatPulse's own legitimate feed cache, not user data). An orphaned `/api/telemetry/analyze` route for `open-road-advisor` was also removed — that tool never called it; its telemetry data has always come from public weather/routing APIs called directly from the browser. If a future feature genuinely needs server-side persistence, it must be scoped per-authenticated-user and the corresponding front end's privacy notice must be rewritten to accurately describe it — don't quietly add a shared, unauthenticated table again.

Note: `nyctos-gig-grid`, `threatpulse`, and `hf-model-matcher` are **not** on this shared backend — they run their own PHP or Python services independently.

### 🧰 Root-Level Utility Scripts (`/scripts/`)

- `generate_sitemap.php` — regenerates `sitemap.xml`, logs to `scripts/logs/`.
- `soar_monitor.php` — security orchestration/automated response monitor.

### ⏰ Production Cron Schedule (cPanel, Namecheap)

All times are server-local (cron table time, not confirmed timezone). Configured via cPanel → Cron Jobs.

**`nyctos-gig-grid` market syncs** — daily, staggered between 4:05–4:30 AM, each calling `aggregator.php cli-sync market=<region>` and logging to `nyctos-gig-grid/logs/cron_sync_log/cron_<region>_sync.log`:

| Time | Market |
| :--- | :--- |
| 4:05 AM | `texas` |
| 4:05 AM | `england` |
| 4:10 AM | `scotland` |
| 4:10 AM | `wales` |
| 4:15 AM | `ireland` |
| 4:20 AM | `colorado` |
| 4:30 AM | `california` |

**Other scheduled jobs:**

| Schedule | Command | Purpose |
| :--- | :--- | :--- |
| Hourly (`0 * * * *`) | `scripts/soar_monitor.php` | Security orchestration/automated response monitor. |
| Daily at midnight (`0 0 * * *`) | `scripts/generate_sitemap.php` | Regenerates `sitemap.xml`; errors logged to `scripts/logs/cron_errors.log`. |
| Every 30 min (`*/30 * * * *`) | `flock -n /tmp/threatpulse_fetcher.lock python3 threatpulse/fetcher.py` | Refreshes ThreatPulse feed data; lock-guarded to prevent overlapping runs; logs to `threatpulse/fetcher.log`. |

Note: the `nyctos-gig-grid` market list here (Texas, England, Scotland, Wales, Ireland, Colorado, California) is broader than the "Denver/Boulder, Springs/Pueblo, Ft Collins/North, West Slope" regions mentioned in that project's own `MEMORY.md` — worth reconciling if the region list has since expanded, or flag if this looks stale.

---

## ✨ Design Philosophy & UX Bar

**Standing directive across every project on this site: maintain an ultra-premium feel for users.** This isn't cosmetic polish for its own sake — it's a bar every UI decision (new feature, bug fix, or refactor) should be checked against, on par with the security and mobile-responsiveness policies below.

In practice, on this codebase that has meant things like: a consistent minimalist, modern dark-mode aesthetic with clean spacing and no visual clutter (per `game-rating-log/CONVENTIONS.md`); tasteful micro-interactions (the landing page's 3D card tilt + retro synth chimes, ThreatPulse's animated ticker); and no visible rough edges — broken/orphaned markup, dead controls, janky load behavior, or inconsistent styling between projects should be treated as bugs against this bar, not just cosmetic nitpicks. When in doubt on a UI call (spacing, motion, loading states, empty states, error states), default to the more refined, deliberate option rather than the fastest one.

---

## 🛡️ Server-Wide Security & Engineering Policies

1. **Clean Codebase Policy (No Leftover Scratch Scripts)**:
   - Always remove temporary inspection or debug scripts (`.py`, `.js`) after completing a task or verification pass.

2. **Security & Content Security Policy**:
   - Web applications enforce strict HTTP security headers (`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`).
   - Prevent direct public access to sensitive files (`.db`, `.log`, `.env`, `.py`, `.sh`) and version control directories (`.git`, `.svn`, `.hg`) via `.htaccess`. Never hardcode API keys/tokens in committed source — read them from `/home/nyctltlc/api.env` via `getenv()`/`cfgEnv()` per the existing convention in `nyctos-gig-grid/config.php` and `mortgage-calculator/mls-proxy.php`.

3. **Responsive & Mobile Optimization**:
   - All tools must feature fluid responsive mobile views optimized for touch screens and mobile viewports.

4. **Privacy-First Operations**:
   - Web applications avoid third-party user tracking, user account mandates, or persistent cookie profiling.

---

## 📂 Sub-Project Specific Memory Files

- **`nyctos-gig-grid/MEMORY.md`**: Detailed database schema, venue prompt templates, Bandsintown API rules, and cPanel sync cron configurations.
