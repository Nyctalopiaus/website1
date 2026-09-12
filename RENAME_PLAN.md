# Site Rename Plan — nycto.ninja

Handoff doc for Claude Code (or whoever executes this) to rename 7 of the site's
15 tool folders from generic/descriptive names to branded ones, on both the
local `vm_code` repo and production (`nycto.ninja`, Namecheap/cPanel, root
`/home/nyctltlc/public_html/`, reached over SSH).

Names were picked and collision-checked (general web search, not a formal
trademark registry) in a separate planning conversation. **Nothing has been
changed yet** — this file is the spec to execute against.

## Scope

Rename these 7. Do **not** touch anything else — `homeward`, `door-scout`,
`threatpulse`, `open-road-advisor`, `nyctos-gig-grid` already have real names,
and `game-rating-log`, `crypto-game`, `status` are explicitly out of scope for
this pass (internal-only for now, or delete candidates).

| # | Old slug | New slug | New display name | Public? |
|---|---|---|---|---|
| 1 | `mortgage-calculator` | `housenomics` | Housenomics | Yes — homepage card + sitemap |
| 2 | `rent-vs-sell` | `sunk-or-swim` | Sunk or Swim | Yes — homepage card + sitemap |
| 3 | `retirement-forecaster` | `sunset-clause` | Sunset Clause | Yes — homepage card + sitemap |
| 4 | `relocation-assessment` | `greener-grass` | Greener Grass | Yes — homepage card + sitemap |
| 5 | `cism-training` | `certforge` | Certforge | Yes — homepage card + sitemap |
| 6 | `hf-model-matcher` | `fitstack` | Fitstack | Yes — homepage card + sitemap + **has a hardcoded canonical/og:url tag** |
| 7 | `mls-redfin-scout` | `dibs` | Dibs | **No** — private, login-gated, excluded from robots.txt, no homepage card |

Suggested copy for each (current copy has no meta description on 4 of these 7 —
add one where noted):

- **Housenomics** — `<title>Housenomics — Full Housing Cost Calculator</title>`. Meta description exists today; keep the substance, swap the name in: *"Housenomics — a comprehensive calculator to estimate your true monthly housing cost: 15 vs. 30-year mortgages side-by-side, PMI/taxes/insurance escrow, HOA fees, DTI affordability, live rate sync, and one-click Redfin property parsing."*
- **Sunk or Swim** — `<title>Sunk or Swim — Rent vs. Sell Calculator</title>`. Meta description exists today; keep the substance: *"Sunk or Swim — decide whether it's financially better to rent out your departing house or sell it when you move, with a head-to-head wealth comparison, cash flow analysis, and Section 121 tax rules."*
- **Sunset Clause** — `<title>Sunset Clause — Retirement Forecaster</title>`. No meta description exists today — add: *"Sunset Clause — a long-term retirement savings projection tool with interactive charts, KPIs, and scenario simulation."*
- **Greener Grass** — `<title>Greener Grass — Relocation Analytics</title>`. No meta description exists today — add: *"Greener Grass — real-time relocation analytics: climate comparisons, transit-radius scoring, and geocoded neighborhood data to test whether a new city actually beats your current one."*
- **Certforge** — `<title>Certforge — CISM Exam Trainer</title>`. No meta description exists today — add: *"Certforge — a CISM certification exam trainer with a quiz simulator, flashcards, bookmarks, and attempt tracking."*
- **Fitstack** — `<title>Fitstack — Hardware-Aware AI Model Discovery</title>`. Meta description exists today; keep the substance: *"Fitstack — discover the best local or hosted AI models on Hugging Face that actually run on your specific VRAM & RAM setup, without OOM errors."*
- **Dibs** — `<title>Dibs — Private Property Scout</title>`. Internal tool, no public meta description needed.

These are drafts — adjust wording to taste, the point is the name swap and not
losing the existing description's substance.

## Pre-flight

1. Work from a clean git state in the local repo (commit or stash anything in
   progress first).
2. Run a full-repo grep for all 7 old slugs to catch anything this plan's
   research pass missed — don't rely solely on the checklist below:
   ```
   grep -rn "mortgage-calculator\|rent-vs-sell\|retirement-forecaster\|relocation-assessment\|cism-training\|hf-model-matcher\|mls-redfin-scout" \
     --include="*.php" --include="*.html" --include="*.js" --include="*.json" --include="*.xml" --include="*.txt" --include="*.md" .
   ```
   Review every hit before touching it — some may be comments or unrelated
   text, not every match needs a change.

## Per-tool steps (repeat for each of the 7)

Using `mortgage-calculator` → `housenomics` as the worked example:

1. **Move the folder, preserving git history:**
   ```
   git mv mortgage-calculator housenomics
   ```
2. **Inside the moved folder's `index.html`:** update `<title>`, add/update the
   meta description (see copy above), and — **only for `fitstack`** — update
   the hardcoded `<link rel="canonical" href="https://nycto.ninja/hf-model-matcher/">`
   and `<meta property="og:url" content="https://nycto.ninja/hf-model-matcher/">`
   tags to the new URL. No other tool in this batch has these tags.
3. **Root `index.html` (homepage):** update the card's launch link
   (`href="mortgage-calculator/"` → `href="housenomics/"`) and the
   `<h2 class="project-title font-display">` text to the new display name.
   **Skip this step for `dibs`** — mls-redfin-scout has no homepage card, it's
   private/unlinked.
4. **`scripts/generate_sitemap.php`:** find the array entry for this tool and
   update its `'loc'` and `'dir'` values to the new slug. This script runs
   nightly via cron and regenerates `sitemap.xml` from this hardcoded array —
   editing `sitemap.xml` directly instead of this file will just get
   overwritten at the next midnight run. **`mls-redfin-scout`/`dibs` has no
   entry here to begin with — nothing to change.**
   (Note: `sitemap.php` at the repo root is a *different*, unrelated dynamic
   sitemap specific to `nyctos-gig-grid` — don't confuse the two.)
5. **`robots.txt`** — only for `mls-redfin-scout` → `dibs`: change
   `Disallow: /mls-redfin-scout/` to `Disallow: /dibs/`.
6. **`MEMORY.md`** — update this tool's row in the master directory table
   (folder name + route column) so the doc doesn't describe a folder that no
   longer exists.
7. **Status monitoring** — grep `scripts/soar_monitor.php` for an `app_key` (or
   similar identifier) matching the old slug and update it to the new slug.
   `status/data/status-data.json` tags every monitored check by folder slug
   (e.g. `"app_key": "open-road-advisor"`); if this tool has an entry, its
   generator needs to know the new name or that row silently stops matching
   anything. (Status itself is out of scope for renaming — this is only about
   keeping its data about the *other* tools accurate.)
8. **Cross-links** — confirmed one: `relocation-assessment/index.html` (now
   `greener-grass/index.html`) hardcodes `href="../mortgage-calculator/"` —
   update to `href="../housenomics/"`. Since both sides of this link are being
   renamed in this pass, double check it after both moves are done.
9. **301 redirect** — add one line per renamed tool to the root `.htaccess`,
   placed after the existing `.git`/`.svn` block near the top so it takes
   priority over the generic rewrite rules further down:
   ```
   RewriteRule ^mortgage-calculator/?(.*)$ /housenomics/$1 [R=301,L]
   ```
   Optional but recommended even for `dibs`/`mls-redfin-scout` for
   consistency, even though it has no public bookmarks or search presence to
   protect.

## After all 7 are done locally

- Regenerate `sitemap.xml` once (run `scripts/generate_sitemap.php` manually,
  or just let the existing daily cron pick it up — no new cron job needed).
- Re-run the pre-flight grep for all 7 old slugs — it should now only turn up
  the `.htaccess` redirect lines (expected) and this file itself.
- Commit — one commit per tool is easiest to review/revert; a single combined
  commit is fine too if preferred.

## Deploying to production (SSH)

Production root: `/home/nyctltlc/public_html/` on Namecheap shared hosting
(cPanel, user `nyctltlc`). The local repo is **not** auto-synced to prod (a
`sync.ffs_db` FreeFileSync database at the repo root suggests manual syncing
has been the process) — so prod needs the same changes applied separately,
not just a local git commit.

1. **Back up first:** `tar -czf ~/backup-prerename-$(date +%Y%m%d).tar.gz public_html`
   over SSH, before changing anything live. Keep it until the rename is
   confirmed stable.
2. **Check for prod-only files before moving each folder.** Diff the
   production folder's contents against the local repo for each of the 7 —
   things like `cache/`, `logs/`, `data/`, `.db` files, or a `config.local.php`
   may exist only on the server (not committed to git) and must move *with*
   the folder, not get left behind or dropped.
3. **Apply the same moves + edits on prod** — however you get the renamed
   state onto the server (push the renamed local repo and pull on prod, or
   apply the `mv`/edits directly over SSH), the critical rule is: **the
   `.htaccess` redirect must go live in the same step as the folder move, not
   after.** Never leave a window where the old URL 404s because the folder
   moved but the redirect isn't there yet.
4. **Verify each renamed tool:**
   ```
   curl -I https://nycto.ninja/housenomics/        # expect 200
   curl -I https://nycto.ninja/mortgage-calculator/ # expect 301 -> /housenomics/
   ```
   Repeat for all 7 new/old slug pairs.
5. Confirm `sitemap.xml` on prod reflects the new slugs (either from the
   manual regen or the next midnight cron run).
6. If any of the 7 had a status-monitoring entry, confirm it reports under the
   new `app_key` on the status page.
7. None of these 7 tools touch the shared Node backend
   (`backend/server.js`) — no service restart is needed for this change.

## Rollback

- **Local:** `git revert`/`git reset` to the pre-rename commit(s).
- **Prod:** restore from the `backup-prerename-*.tar.gz` taken in step 1 above
  if anything breaks post-deploy.

## Explicitly out of scope this round

`game-rating-log`, `crypto-game`, `status` — do not rename, move, or delete
these as part of this task even if they turn up in the pre-flight grep.
