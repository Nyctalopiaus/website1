# Server-Wide Lab Memory & Multi-Project Directory

This document serves as persistent master memory for AI assistants (Antigravity, AGY, Claude Code) working across all web application projects in this server ecosystem.

---

## 🌐 Server Ecosystem Overview

All applications are hosted under your public web root (`/home/nyctltlc/public_html/`):

| Application Folder | Domain / Route | Core Purpose & Tech Stack |
| :--- | :--- | :--- |
| **`nyctos-gig-grid`** | `/nyctos-gig-grid/` | Local concert calendar, multi-source ingestion engine (Ticketmaster, Bandsintown, venue scrapers), SQLite, Last.fm enrichment. |
| **`relocation-assessment`** | `/relocation-assessment/` | Real-time relocation analytics dashboard, Open-Meteo, Leaflet JS, Nominatim geocoding, transit radius scoring. |
| **`open-road-advisor`** | `/open-road-advisor/` | Road trip route planning and stop recommendations. |
| **`mortgage-calculator`** | `/mortgage-calculator/` | Financial mortgage and interest calculation tools. |
| **`retirement-forecaster`** | `/retirement-forecaster/` | Long-term retirement savings projection tool. |
| **`cism-training`** | `/cism-training/` | Information security exam preparation and quiz simulator. |
| **`crypto-game`** | `/crypto-game/` | Interactive web-based crypto simulation game. |
| **`game-rating-log`** | `/game-rating-log/` | Personal video game backlog and rating tracker. |

---

## 🛡️ Server-Wide Security & Engineering Policies

1. **Clean Codebase Policy (No Leftover Scratch Scripts)**:
   - Always remove temporary inspection or debug scripts (`.py`, `.js`) after completing a task or verification pass.

2. **Security & Content Security Policy**:
   - Web applications enforce strict HTTP security headers (`X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`).
   - Prevent direct public access to sensitive files (`.db`, `.log`, `.env`, `.py`, `.sh`) via `.htaccess`.

3. **Responsive & Mobile Optimization**:
   - All tools must feature fluid responsive mobile views optimized for touch screens and mobile viewports.

4. **Privacy-First Operations**:
   - Web applications avoid third-party user tracking, user account mandates, or persistent cookie profiling.

---

## 📂 Sub-Project Specific Memory Files

- **`nyctos-gig-grid/MEMORY.md`**: Detailed database schema, venue prompt templates, Bandsintown API rules, and cPanel sync cron configurations.
