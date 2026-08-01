# 📋 Rules & Filters Directory

This directory contains all user-editable configuration text files for filtering, cleaning, and overriding gig data.

---

### 📁 Rule Files Reference:

1. **`ignored_artists.txt`**
   - **Purpose**: Block specific artists or non-music events (e.g. Disney on Ice, Paw Patrol).
   - **Format**: One artist or event title per line.

2. **`artist_splits.txt`**
   - **Purpose**: Custom performer name splitting rules for multi-artist lineup titles.
   - **Format**: `Artist A & Artist B` or custom delimiter rules.

3. **`genre_overrides.txt`**
   - **Purpose**: Override an artist's genre mapping for frontend filter buttons.
   - **Format**: `Artist Name=genre_bucket` (e.g. `Metallica=metal`).

4. **`ignored_tags.txt`**
   - **Purpose**: Block specific sub-genres or tags from triggering filter matches.
   - **Format**: One tag per line.

5. **`ignored_promos.txt`**
   - **Purpose**: Block promotional keywords or tour sponsor prefix strings from event titles.
   - **Format**: One promo keyword per line.

6. **`event_titles.txt`**
   - **Purpose**: Custom event title cleaning and replacement rules.
   - **Format**: `Original Title => Clean Title`.

7. **`special_events.txt`**
   - **Purpose**: Rules for special event categories.
   - **Format**: One rule per line.

8. **`venue_cities.txt`**
   - **Purpose**: Custom venue-to-city mapping overrides.
   - **Format**: `Venue Name => City Name`.
