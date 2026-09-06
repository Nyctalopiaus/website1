/**
 * MLS & Redfin Property Scout - Self-Contained Bookmarklet Engine Builder
 * Generates 100% inline bookmarklet executable directly on HTTPS Matrix MLS & Redfin pages.
 */
function getEngineCode() {
    // NOTE: this has to be String.raw (not a plain template literal) so that regex escapes
    // like \d, \s, \b, \w below survive as literal backslash+letter instead of being "cooked"
    // by the JS parser — \d/\s/\w aren't real escape sequences so cooking silently drops their
    // backslash, and \b/\n/\r ARE real escape sequences so cooking turns them into an actual
    // backspace/newline/CR character sitting inside a regex literal, which is a syntax error.
    // The one thing String.raw can't do is produce a literal backtick or `${` from an escaped
    // source sequence (raw mode keeps the backslash instead of stripping it), so the nested
    // template literals inside the engine below still use \` and \${ escapes as written, and
    // the two .replace() calls after the raw extraction below strip those backslashes back out.
    const raw = String.raw`/**
 * MLS & Redfin Property Scout - Bookmarklet Engine
 * High-performance DOM parser for Matrix REColorado and Redfin property pages.
 */
(function() {
    'use strict';

    const CONFIG = {
        API_URL: window.SCOUT_API_URL || (window.location.origin.includes('nycto.ninja')
            ? 'https://nycto.ninja/mls-redfin-scout/backend/api.php'
            : 'http://127.0.0.1:8888/backend/api.php'),
        USER: window.SCOUT_USER || null,
        SCRAPE_TOKEN: window.SCOUT_SCRAPE_TOKEN || null,
        // 'deep' = walk every listing into full detail view, one at a time, capturing fresh notes
        // always and a full photo gallery once per listing.
        MODE: window.SCOUT_MODE || 'deep',
        AUTO_POPUP_REDFIN: true
    };

    let toastTimeout = null;
    function notify(msg, isError = false, persistent = false) {
        let toast = document.getElementById('scout-toast-popup');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'scout-toast-popup';
            toast.style.cssText = \`
                position: fixed; top: 20px; right: 20px; z-index: 999999;
                padding: 14px 20px; background: \${isError ? '#ef4444' : '#10b981'};
                color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                font-size: 14px; font-weight: 600; border-radius: 8px;
                box-shadow: 0 10px 25px rgba(0,0,0,0.3); transition: all 0.3s ease;
                max-width: 450px; word-break: break-word; line-height: 1.4;
            \`;
            document.body.appendChild(toast);
        }
        toast.innerText = msg;
        toast.style.background = isError ? '#ef4444' : '#10b981';
        toast.style.opacity = '1';
        if (toastTimeout) { clearTimeout(toastTimeout); toastTimeout = null; }
        if (!persistent) {
            toastTimeout = setTimeout(() => { toast.style.opacity = '0'; }, 6000);
        }
    }

    function getEffectiveApiUrl() {
        let url = CONFIG.API_URL || '';
        // Only upgrade http:// to https:// for remote servers (e.g. nycto.ninja).
        // Leave 127.0.0.1 / localhost as http:// since local dev servers run plain HTTP.
        if (window.location.protocol === 'https:' && url.startsWith('http://')) {
            if (!url.includes('127.0.0.1') && !url.includes('localhost')) {
                url = url.replace(/^http:\/\//i, 'https://');
            }
        }
        return url;
    }

    // Fire-and-forget beacon to backend/api.php's action=client_log, since the bookmarklet has
    // no storage of its own and runs on the MLS portal's origin — a console.warn here is only
    // ever seen if DevTools happens to be open on this exact tab at this exact moment (which is
    // exactly how the old cleanInt ReferenceError went unnoticed for as long as it did). Never
    // throws and never blocks the scrape — a failed log beacon must not affect scraping itself.
    function logToServer(level, message, mlsId, context) {
        try {
            fetch(getEffectiveApiUrl() + '?action=client_log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Scout-Token': CONFIG.SCRAPE_TOKEN || '' },
                body: JSON.stringify({
                    source: 'scrape',
                    level: level,
                    message: String(message).slice(0, 2000),
                    mls_id: mlsId || null,
                    context: context || null,
                    username: CONFIG.USER || null
                }),
                keepalive: true
            }).catch(() => {});
        } catch (e) {
            // logging must never break the scrape
        }
    }

    const cleanNumber = (str) => {
        if (!str) return 0;
        const n = parseFloat(str.replace(/[^0-9.]/g, ''));
        return isNaN(n) ? 0 : n;
    };

    // Was referenced 8x below (beds, sqft, year built, parking, garage, tax year) but never
    // defined — every scrape threw "cleanInt is not defined" as soon as it hit a beds match,
    // aborting scrapeMatrixPortal() before it ever reached syncToBackend().
    const cleanInt = (str) => {
        if (!str) return 0;
        const n = parseInt(String(str).replace(/[^0-9]/g, ''), 10);
        return isNaN(n) ? 0 : n;
    };

    function extractMatrixNotes(block, mlsId) {
        let candidateTexts = [];

        // 1. Lightweight targeted search for "Notes for" headers and containers
        const headers = Array.from((block || document).querySelectorAll('h1, h2, h3, h4, .panel-heading, .box-header, font, b, strong, header, [class*="heading" i], [class*="header" i]'));
        for (let header of headers) {
            const htxt = (header.innerText || header.textContent || '').trim();
            if (htxt.includes('Notes for you and your agent') || htxt.includes('Notes for')) {
                const parent = header.closest('div, section, td, table, fieldset') || header.parentElement;
                if (parent) {
                    const txt = (parent.innerText || parent.textContent || '').trim();
                    if (txt) candidateTexts.unshift(txt);
                }
            }
        }

        // 1b. REColorado current "mtx" notes widget (Matrix skin as of 2026) — most reliable source.
        // Real saved note text lives in <p class="mtx-section"> rows inside .mtx-listingNotesWidget /
        // .mtx-notes, which none of the legacy "j-portalNote*" / "d-note*" selectors below match.
        const mtxNoteEls = Array.from((block || document).querySelectorAll(
            '.mtx-listingNotesWidget-noteRow .mtx-section, .mtx-listingNotesWidget .mtx-section, .mtx-notes .mtx-section'
        ));
        const mtxNoteTexts = mtxNoteEls.map(el => (el.innerText || el.textContent || '').trim()).filter(Boolean);
        if (mtxNoteTexts.length) candidateTexts.unshift(mtxNoteTexts.join(' | '));

        // 2. Scan for note history / message thread containers
        const historyContainers = Array.from((block || document).querySelectorAll(
            '.j-portalNoteHistory, .j-portalNotesList, .notes-history, [class*="noteHistory" i], [class*="note-item" i], [class*="NoteItem" i], [class*="portal-note" i], [class*="ClientNote" i], [id*="NotesHistory" i]'
        ));
        historyContainers.forEach(container => {
            const txt = (container.innerText || container.textContent || '').trim();
            if (txt) candidateTexts.push(txt);
        });

        // 3. Textarea and Text input values (NOT bare input[type="hidden"] — that sweeps in
        // unrelated CSRF/session tokens on the page, which was clobbering the real note)
        const inputs = Array.from((block || document).querySelectorAll('textarea, input[type="text"], [name*="Note" i], [id*="Note" i]'));
        inputs.forEach(el => {
            if (el.value && typeof el.value === 'string') candidateTexts.push(el.value);
        });

        // 4. Specific note elements inside block
        const noteElems = Array.from((block || document).querySelectorAll(
            '.display-notes, [id*="ClientNote" i], [id*="clientnote" i], .portal-note-text, .notesBox, .d-notes, .d-noteText, .j-portalNote, .j-portalNoteText, .c-listing-note, .c-note-content, [class*="NoteText" i], [class*="clientNote" i], [class*="portalNote" i]'
        ));
        noteElems.forEach(el => {
            if (el.value && typeof el.value === 'string') candidateTexts.push(el.value);
            if (el.innerText && typeof el.innerText === 'string') candidateTexts.push(el.innerText);
            if (el.textContent && typeof el.textContent === 'string') candidateTexts.push(el.textContent);
        });

        // 5. Attributes on blue chat bubble icons & note links
        const noteIcons = Array.from((block || document).querySelectorAll(
            '.j-portalNoteIcon, [class*="note" i], [id*="note" i], [title*="note" i], [data-note]'
        ));
        noteIcons.forEach(el => {
            ['title', 'data-note', 'data-content', 'data-title', 'data-original-title', 'data-tooltip', 'aria-label'].forEach(attr => {
                if (el.hasAttribute && el.hasAttribute(attr)) {
                    const val = el.getAttribute(attr);
                    if (val && typeof val === 'string') candidateTexts.push(val);
                }
            });
        });

        // 6. Document-wide search for notes associated with this mlsId
        if (mlsId) {
            const globalNodes = Array.from(document.querySelectorAll(
                \`[id*="\${mlsId}"][id*="note" i], [data-key="\${mlsId}"] [class*="note" i], [data-mls="\${mlsId}"] [class*="note" i]\`
            ));
            globalNodes.forEach(el => {
                if (el.value) candidateTexts.push(el.value);
                if (el.innerText) candidateTexts.push(el.innerText);
                ['title', 'data-note', 'data-content'].forEach(attr => {
                    const val = el.getAttribute(attr);
                    if (val) candidateTexts.push(val);
                });
            });
        }

        // 7. Multiline search for (Me) comments and inline JSON scripts
        // Tightened per the false-positive documented in bookmarklet-notes-extraction.md (MLS
        // 7950162, "881 S **Me**mphis Way" matched as a fake note): \b word boundaries so this
        // only matches a standalone "Me"/"(Me)" token, not "me" as a mid-word substring, and the
        // capture length is cut from 1000 to 300 — a real personal note is a short phrase, not a
        // paragraph, and this fallback (used when no proper .mtx-listingNotesWidget row exists)
        // was otherwise capturing the listing's full marketing remarks/description as a "note"
        // on ordinary listings that don't have one at all — confirmed live at scale (Sept 2026).
        const pageText = (block || document.body).innerText || '';
        const meBlockMatches = pageText.match(/\b(?:Me|\(Me\))\b[\s\r\n]*(?:\d{2}\/\d{2}\/\d{4})?[\s\r\n]*["“]?([^"”\r\n]{3,300})["”]?/ig);
        if (meBlockMatches) {
            meBlockMatches.forEach(m => candidateTexts.push(m));
        }

        const scripts = Array.from(document.querySelectorAll('script'));
        scripts.forEach(s => {
            const st = s.textContent || '';
            if (st.includes('Note') || st.includes('note')) {
                const matches = st.match(/"(?:ClientNote|Note|portalNote|userNote|comment|text)"\s*:\s*"([^"]+)"/ig);
                if (matches) {
                    matches.forEach(m => {
                        const val = m.replace(/^"[^"]+"\s*:\s*"/, '').replace(/"$/, '').trim();
                        if (val) candidateTexts.push(val);
                    });
                }
            }
        });

        // 8. Clean and evaluate candidates
        for (let txt of candidateTexts) {
            if (!txt) continue;
            let clean = txt.trim();

            clean = clean.replace(/^(\(Me\)|Me)\s*(\d{2}\/\d{2}\/\d{4})?\s*/i, '').trim();
            clean = clean.replace(/^(Client\s+)?Notes?:\s*/i, '').trim();
            clean = clean.replace(/^["“](.*)["”]$/, '$1').trim();

            const lower = clean.toLowerCase();
            if (
                !clean ||
                lower === 'add note...' ||
                lower === 'add note' ||
                lower === 'notes' ||
                lower === 'note' ||
                lower === 'client note' ||
                lower === 'click to add note' ||
                lower === 'notes for you and your agent' ||
                lower === 'no notes' ||
                lower === 'save as favorite' ||
                lower === 'dislike' ||
                lower === 'possibility' ||
                lower === 'favorite' ||
                clean.length < 2 ||
                // A real personal note is a short phrase (every confirmed example in
                // bookmarklet-notes-extraction.md is under 100 chars); a multi-sentence block
                // this long is almost certainly the listing's public-remarks/marketing
                // description caught by one of the broader fallback selectors above, not an
                // actual saved note. Caps false positives regardless of which selector matched.
                clean.length > 400
            ) {
                continue;
            }

            return clean;
        }

        return '';
    }

    /**
     * Author-attributed version of extractMatrixNotes(), used by the deep scrape walker (notes
     * are re-checked on every deep-scrape pass, per product decision — the agent may reply after
     * Josh's first pass, and who-said-what should be preserved when that happens).
     *
     * CONFIRMED LIVE (Sept 2026, against a real "Me" note): each row's message lives in
     * <p class="mtx-section"> (with literal wrapping quote marks, stripped below) inside the
     * .col-xs-9 column, and its author label lives in a sibling <div class="mtx-author"> inside
     * the .col-xs-3/.col-xs-pull-9 column — e.g. <div class="mtx-author mtx-mega">Me</div>.
     * STILL UNCONFIRMED: what an agent's own reply looks like here — every real example seen so
     * far is Josh's own single "Me" note, so a genuine multi-author thread has never been observed.
     * This function stays defensive for that reason: if a row has no author column (or an empty
     * one), it degrades to the flat join(' | ') behavior rather than silently losing content, and
     * it flags anything unusual (more than one row, or an unrecognized/missing author) via the
     * multiAuthor return field so the calling code can surface it in the run's summary toast —
     * that flag is the mechanism for catching a real multi-author example the first time one
     * actually appears, and for confirming or correcting this logic against it.
     */
    function extractMatrixNotesDetailed(block, mlsId) {
        const scope = block || document;
        const rows = Array.from(scope.querySelectorAll('.mtx-listingNotesWidget-noteRow'));

        if (rows.length === 0) {
            return { text: '', rowCount: 0, multiAuthor: false, authors: [] };
        }

        const entries = [];
        const authorsSeen = new Set();
        let attributionLooksReliable = true;

        rows.forEach(row => {
            // Prefer the specific .mtx-section message paragraph over its parent .col-xs-9 column
            // (confirmed live: the column also contains the note's date, e.g. "08/25/2026", which
            // would otherwise get prepended to every note) — the .col-xs-9 fallback only matters
            // if a future markup variant drops the .mtx-section wrapper.
            const messageCol = row.querySelector('.mtx-section') || row.querySelector('.col-xs-9') || row;
            let text = (messageCol.innerText || messageCol.textContent || '').trim();
            // Confirmed live: note text is stored with literal wrapping quote marks, e.g. a note
            // reading "Split rail fence" — strip them, matching extractMatrixNotes()'s own cleanup.
            text = text.replace(/^["“](.*)["”]$/, '$1').trim();
            if (!text) return;

            let author = '';
            // Confirmed live: the author label lives in .mtx-author inside the sibling .col-xs-3
            // column (e.g. <div class="col-xs-3 col-xs-pull-9"><div class="mtx-author mtx-mega">Me</div></div>).
            const authorCol = row.querySelector('.mtx-author') || row.querySelector('.col-xs-3');
            if (authorCol) {
                author = (authorCol.innerText || authorCol.textContent || '').trim();
            }
            if (!author) {
                attributionLooksReliable = false;
                author = 'Unknown';
            }

            authorsSeen.add(author);
            entries.push({ author, text });
        });

        if (entries.length === 0) {
            const text = extractMatrixNotes(block, mlsId);
            return { text, rowCount: rows.length, multiAuthor: rows.length > 1, authors: [] };
        }

        const formatted = attributionLooksReliable
            ? entries.map(e => \`\${e.author}: \${e.text}\`).join(' | ')
            : entries.map(e => e.text).join(' | ');

        const multiAuthor = !attributionLooksReliable || authorsSeen.size > 1 || rows.length > 1;

        return {
            text: formatted,
            rowCount: rows.length,
            multiAuthor,
            authors: Array.from(authorsSeen)
        };
    }

    /**
     * Captures whatever gallery photos are currently rendered in the DOM for the single expanded
     * listing. This function is a single DOM snapshot (whatever's currently loaded), which on its
     * own only captures a handful of pre-loaded images near the current position, NOT the full
     * gallery for listings with more than ~5 photos — confirmed live (Sept 2026): a 32-photo
     * listing had only 5 images in the DOM before any carousel clicking. Kept as the low-level
     * scan primitive that walkPhotoGallery() below calls after each click, and as a fallback for
     * when no carousel/counter is present at all. Scans the whole document rather than just one
     * block, since only one listing is ever expanded at a time in this mode, so there's no
     * cross-listing contamination risk. Dedupes by the URL's Number= param (0-based photo index,
     * confirmed shared across a listing's real gallery photos) so the same photo isn't counted
     * twice if it appears as both a thumbnail and a main viewer image.
     */
    function extractGalleryImages(scope) {
        const root = scope || document;
        const imgs = Array.from(root.querySelectorAll('img[src*="GetMedia.ashx"], img[src*="matrixmedia"]'));
        const seen = new Map();

        imgs.forEach(img => {
            const src = img.currentSrc || img.src || img.getAttribute('src') || '';
            if (!src) return;
            const numMatch = src.match(/[?&]Number=(\d+)/i);
            const num = numMatch ? parseInt(numMatch[1], 10) : seen.size;
            if (!seen.has(num)) seen.set(num, src);
        });

        return Array.from(seen.keys()).sort((a, b) => a - b).map(k => seen.get(k));
    }

    /**
     * Walks the full photo carousel for whichever listing is currently expanded, clicking
     * button.nav.right repeatedly and re-scanning after each click, so galleries larger than the
     * carousel's pre-loaded window (confirmed to be only ~5 images) get fully captured rather than
     * silently truncated. Progress is tracked via the counter element that reads e.g. "7 / 32"
     * (confirmed live: a leaf element with class "count" inside a ".bar" container, text matching
     * /^\d+\s*\/\s*\d+$/ — deliberately NOT matched against the whole page text, since strings like
     * "3/4" (a baths value) elsewhere on the page also match a loose slash-number pattern).
     * Confirmed live that images accumulate in the DOM as you click forward rather than being
     * evicted (index 0 is still present after reaching index 7), so accumulating via
     * extractGalleryImages() after each click is safe.
     *
     * CONFIRMED LIVE (Sept 2026): button.nav.right periodically goes disabled="disabled" for an
     * extended stretch mid-gallery (observed on a real 32-photo listing, stuck for over 10+
     * seconds around photo 13) — almost certainly the carousel lazy-loading its next batch of
     * images rather than a real end-of-gallery or broken state, since it reliably re-enables on
     * its own given enough time. An earlier version of this function gave up after one ~3s
     * non-advancing poll, which would have silently truncated the gallery right at that stall
     * (13 of 32 photos, in the observed case) — the exact kind of partial-capture bug this
     * function exists to prevent. It now explicitly waits for the button to become enabled again
     * (up to stallTimeoutMs) before each click, rather than treating "not advancing yet" as
     * "done" — real end-of-gallery is detected separately, via counter.cur reaching counter.total.
     * Verified live end-to-end against a real 32-photo listing: all 32 unique indices (0-31)
     * captured, no gaps, no duplicates, pushing cleanly through the observed stall.
     */
    async function walkPhotoGallery(pollMs = 150, advanceTimeoutMs = 5000, stallTimeoutMs = 25000) {
        const countEls = () => Array.from(document.querySelectorAll('.count')).find(
            el => /^\s*\d+\s*\/\s*\d+\s*$/.test(el.textContent || '')
        );
        const getCounter = () => {
            const el = countEls();
            if (!el) return null;
            const m = el.textContent.match(/(\d+)\s*\/\s*(\d+)/);
            return m ? { cur: parseInt(m[1], 10), total: parseInt(m[2], 10) } : null;
        };


        let counter = getCounter();
        const navRight = document.querySelector('button.nav.right');
        if (!counter || !navRight) {
            // No carousel/counter found (e.g. a listing with zero or one photo) — fall back to a
            // plain single-shot scan rather than looping on nothing.
            return extractGalleryImages(document);
        }

        const maxClicks = counter.total + 2; // small safety margin, not unbounded
        let clicks = 0;
        while (counter.cur < counter.total && clicks < maxClicks) {
            // Wait out a temporarily-disabled next button (lazy-load stall) rather than giving up —
            // confirmed live this can persist 10+ seconds and then recover on its own.
            const becameEnabled = await waitUntil(() => !navRight.disabled, stallTimeoutMs);
            if (!becameEnabled) break; // genuinely stuck (not just a lazy-load pause) — stop here

            navRight.click();
            clicks++;
            const prevCur = counter.cur;
            const advanced = await waitUntil(() => {
                const c = getCounter();
                if (c && c.cur !== prevCur) { counter = c; return true; }
                return false;
            }, advanceTimeoutMs);
            if (!advanced) {
                // Counter didn't move — if the button is now disabled, loop back around and wait
                // it out (handled at the top of the loop); if it's still enabled and just not
                // advancing, that's a real stall, so stop rather than clicking forever.
                if (!navRight.disabled) break;
            }
        }

        return extractGalleryImages(document);
    }

    function findListingBlocks() {
        let rawBlocks = Array.from(document.querySelectorAll(
            '.multiLineDisplay, .d-wrapperTable, [id^="Display_"], .d-displayRow, .d-displayCore, .d-mega, [data-key], tr.d-displayRow, .portal-card, .c-listing-card, .d-single, .portal-detail'
        ));

        // Filter out outer page form/body elements if specific listing containers exist
        let blocks = rawBlocks.filter(b => b.id !== 'form1' && b.tagName !== 'FORM' && b.tagName !== 'BODY');

        if (blocks.length === 0) {
            const allElems = Array.from(document.querySelectorAll('div, td, table, section'));
            blocks = allElems.filter(el => {
                const txt = el.innerText || '';
                return (txt.includes('Listing ID') || txt.includes('MLS#') || txt.includes('MLS ID')) && (txt.includes('Bed') || txt.includes('$'));
            });
        }

        return blocks;
    }

    /**
     * Parses one listing block into the payload shape expected by /backend/api.php's sync
     * endpoint, or returns null if the block doesn't actually look like a listing. Factored out
     * of the old inline scrapeMatrixPortal() forEach so the same field-extraction logic can be
     * reused by the deep-scrape walker (one block at a time) as well as the quick scan (many
     * blocks at once).
     *
     * Deliberately omits gallery_images: leaving it unset lets the backend's dedupe logic treat
     * this as a "regular refresh" payload and preserve whatever fuller gallery a deep scrape may
     * have already captured for this mls_id, instead of clobbering it down to a single guessed
     * image. Only the deep-scrape walker (which actually looked at every rendered photo via
     * extractGalleryImages()) sets gallery_images explicitly.
     */
    function parseListingBlock(block) {
        const text = block.innerText || '';
        if (!text.includes('Listing ID') && !text.includes('MLS#') && !text.includes('MLS ID') && !text.includes('Bed')) return null;

        let mlsId = '';
        const mlsMatch = text.match(/Listing ID:\s*(\d+)/i) || text.match(/MLS#:\s*(\d+)/i) || text.match(/MLS\s*ID:\s*(\d+)/i) || text.match(/MLS#\s*(\d+)/i) || text.match(/MLS:\s*(\d+)/i);
        if (mlsMatch) mlsId = mlsMatch[1];
        if (!mlsId) {
            const keyAttr = block.querySelector('[data-key]');
            if (keyAttr) mlsId = keyAttr.getAttribute('data-key');
        }
        if (!mlsId) return null;

        let price = 0;
        const priceMatch = text.match(/\$([0-9,]+)/);
        if (priceMatch) price = cleanNumber(priceMatch[1]);

        let address = '', city = '', state = 'CO', zip = '';
        const addrElem = block.querySelector('.d-displayAddress, .portal-address, h1, h2, [id*="Address"], [class*="Address"]');
        if (addrElem && addrElem.innerText.trim() && /[A-Za-z]/.test(addrElem.innerText)) {
            const cand = addrElem.innerText.trim();
            if (cand !== mlsId && cand.length > 3) address = cand;
        }
        if (!address) {
            const links = Array.from(block.querySelectorAll('a'));
            const addrLink = links.find(a => {
                const t = a.innerText.trim();
                return t && t !== mlsId && /^\d+\s+[A-Za-z]/.test(t);
            });
            if (addrLink) address = addrLink.innerText.trim();
        }
        if (!address) {
            const addrCandidates = Array.from(block.querySelectorAll('a[href*="javascript:__doPostBack"], a[href*="DisplayCore"]'));
            const addrLink = addrCandidates.find(a => {
                const t = a.innerText.trim();
                return t && t !== mlsId && /[A-Za-z]/.test(t);
            });
            if (addrLink && addrLink.innerText.trim()) {
                address = addrLink.innerText.trim();
            }
        }
        if (!address) {
            // Confirmed live: the full single-listing detail view renders the address as plain
            // text (a <span class="formula ..."> — not a link, unlike the list-row view), so none
            // of the selectors above find it there. Fall back to the address's position in the
            // text itself: it's always the line immediately before the "City, ST ZIP" line, in
            // both the list-row and detail views.
            const addrLineMatch = text.match(/(?:^|\n)\s*(\d+[^\n]{2,60}?)\s*\n\s*[A-Za-z][A-Za-z .]*,\s*(?:CO|Colorado)\s*\d{5}/i);
            if (addrLineMatch) address = addrLineMatch[1].trim();
        }

        const cityZipMatch = text.match(/(?:^|[\r\n])\s*([A-Za-z][A-Za-z ]*),\s*(CO|Colorado)\s*(\d{5})/i) || text.match(/([A-Za-z][A-Za-z ]*),\s*(CO|Colorado)\s*(\d{5})/i);
        if (cityZipMatch) {
            city = cityZipMatch[1].trim();
            state = cityZipMatch[2].trim();
            zip = cityZipMatch[3].trim();
        }

        let status = 'Active';
        if (text.includes('Pending')) status = 'Pending';
        else if (text.includes('Closed')) status = 'Closed';
        else if (text.includes('Leased')) status = 'Leased';
        else if (text.includes('Withdrawn')) status = 'Withdrawn';

        const bedsMatch = text.match(/(\d+)\s*Beds/i);
        const beds = bedsMatch ? cleanInt(bedsMatch[1]) : 0;

        const bathsMatch = text.match(/([\d\.]+)\s*Baths/i) || text.match(/Baths:\s*([\d\.]+)/i);
        const baths = bathsMatch ? cleanNumber(bathsMatch[1]) : 0;

        // Confirmed live (Sept 2026) that the full single-listing detail view uses different label
        // text/layout than the compact list-row view for several fields below — e.g. detail view
        // shows "Area (SqFt) Total" with the value on the FOLLOWING line, vs. the list view's
        // inline "2,580SqFt Total". Each of these fields now tries the original list-view pattern
        // first, then a detail-view fallback, so both views extract correctly.
        const sqftTotalMatch = text.match(/([0-9,]+)\s*SqFt Total/i) || text.match(/Area\s*\(SqFt\)\s*Total\s*([0-9,]+)/i);
        const sqftTotal = sqftTotalMatch ? cleanInt(sqftTotalMatch[1]) : 0;

        const sqftFinMatch = text.match(/([0-9,]+)\s*(?:SqFt Fin(?!ished)|Living\s*Area\s*\(SqFt\s*Fin\))/i) || text.match(/Living\s*Area\s*\(SqFt\s*Fin\)\s*([0-9,]+)/i);
        const sqftFin = sqftFinMatch ? cleanInt(sqftFinMatch[1]) : sqftTotal;

        const yearMatch = text.match(/Built in\s*(\d{4})/i) || text.match(/Year Built:?\s*\n?\s*(\d{4})/i);
        const yearBuilt = yearMatch ? cleanInt(yearMatch[1]) : 0;

        // Detail view uses "Lot Size Acres"/"Lot Size SqFt" (still glued directly to the number,
        // e.g. "0.20Lot Size Acres") rather than the list view's bare "0.19Acres" — confirmed live.
        // "Built inYYYY0.19Acres" glues the 4-digit year directly to the acreage with no
        // separator — the generic pattern below would greedily swallow both. Try the
        // year-anchored pattern first so the acreage is captured cleanly.
        const acreMatch = text.match(/Built in\d{4}([\d.]+)\s*Acres/i) || text.match(/([\d\.]+)\s*Acres/i) || text.match(/([\d\.]+)\s*Lot Size Acres/i);
        const lotAcres = acreMatch ? cleanNumber(acreMatch[1]) : 0;

        const lotSqftMatch = text.match(/([0-9,]+)\s*SqFt(?!\s*Total|\s*Fin)/i) || text.match(/([0-9,]+)\s*Lot Size SqFt/i);
        const lotSqft = lotSqftMatch ? cleanInt(lotSqftMatch[1]) : Math.round(lotAcres * 43560);

        // IMPORTANT: the capture group deliberately excludes newlines (using literal spaces, not
        // \s, inside the character class) and is length-bounded. A block's innerText can be very
        // large in the full detail view (it includes the entire specs table, not just a compact
        // card), so an earlier version of this regex using a greedy \s-inclusive class matched
        // backward across many unrelated lines and captured garbage like "CO 80018\nArapahoeCounty\n..."
        // instead of just "Adams-Arapahoe 28J" — confirmed live as a real bug, not hypothetical.
        const schoolMatch = text.match(/([A-Za-z0-9][A-Za-z0-9 \-]{0,40}?)\s*School District/i);
        let schoolDistrict = schoolMatch ? schoolMatch[1].trim() : '';
        // List view can glue a lot-sqft prefix onto the front of the match (e.g. the comma in
        // "8,276SqFt..." blocks the regex from matching further back, so "276SqFtAdams-Arapahoe 28J"
        // gets captured instead of "Adams-Arapahoe 28J") — strip any leading digit/comma run
        // followed by SqFt or Acres regardless of where the match actually started.
        schoolDistrict = schoolDistrict.replace(/^[\d,.]*\s*(?:SqFt|Acres)\s*/i, '').trim();

        const parkingMatch = text.match(/(\d+)\s*Parking Total/i) || text.match(/Parking Total\s*\n?\s*(\d+)/i);
        const parkingTotal = parkingMatch ? cleanInt(parkingMatch[1]) : 0;

        const garageMatch = text.match(/(\d+)\s*Garage Spaces/i);
        const garageSpaces = garageMatch ? cleanInt(garageMatch[1]) : 0;

        // BUG FIX (found while investigating why "Top Picks" showed implausible HOA figures like
        // $576-$1680/mo against a DB where 5+ favorited listings all had inflated hoa_fee values,
        // 5-15x Josh's original Redfin export for the same addresses): "Annual HOA Fee" and "Total
        // Annual HOA Fees" are explicitly annual dollar amounts on Matrix, but the raw matched
        // number was being stored straight into hoa_fee (a monthly figure everywhere else in the
        // app - card badges, filters, the export CSV) with no /12 conversion. Only the plain "HOA
        // Fee:" label is treated as already-monthly, since there's no evidence that one is annual.
        const hoaAnnualMatch = text.match(/Annual HOA Fee\s*\$([0-9,.]+)/i) || text.match(/Total Annual HOA Fees\s*\$([0-9,.]+)/i);
        const hoaMonthlyMatch = text.match(/HOA Fee:\s*\$([0-9,.]+)/i);
        const hoaFee = hoaAnnualMatch ? Math.round((cleanNumber(hoaAnnualMatch[1]) / 12) * 100) / 100
            : (hoaMonthlyMatch ? cleanNumber(hoaMonthlyMatch[1]) : 0);

        const taxMatch = text.match(/Annual Tax\s*\$([0-9,.]+)/i) || text.match(/Tax Annual Amount\s*\$([0-9,.]+)/i);
        const annualTax = taxMatch ? cleanNumber(taxMatch[1]) : 0;

        const taxYearMatch = text.match(/Annual Tax.*?\/(\d{4})/i) || text.match(/Tax Year\s*\n?\s*(\d{4})/i);
        const taxYear = taxYearMatch ? cleanInt(taxYearMatch[1]) : new Date().getFullYear();

        const listDateMatch = text.match(/List Date:\s*(\d{2}\/\d{2}\/\d{2,4})/i) || text.match(/Listing Contract Date:?\s*\n?\s*(\d{2}\/\d{2}\/\d{2,4})/i);
        const listDate = listDateMatch ? listDateMatch[1] : new Date().toISOString().split('T')[0];

        const pageText = (document.body.innerText || '').toLowerCase();
        const isDislikePage = pageText.includes('disliked listings') || pageText.includes('dislikes (');
        const isFavoritePage = pageText.includes('favorite listings') || pageText.includes('favorites (');
        const isPossibilityPage = pageText.includes('possibility listings') || pageText.includes('possibilities (');

        let matrixReviewStatus = isFavoritePage ? 'favorite' : (isDislikePage ? 'dislike' : (isPossibilityPage ? 'possibility' : 'none'));

        const bucketIcon = block.querySelector('.j-portalBucketSelectorIcon');
        if (bucketIcon) {
            const bucketCls = bucketIcon.className.toString();
            const bucketTitle = (bucketIcon.title || bucketIcon.getAttribute('title') || '').toLowerCase();
            if (bucketCls.includes('bucketDislikes') || bucketTitle === 'dislike') {
                matrixReviewStatus = 'dislike';
            } else if (bucketCls.includes('bucketPossibilities') || bucketTitle === 'possibility') {
                matrixReviewStatus = 'possibility';
            } else if (bucketCls.includes('bucketFavorite') || bucketTitle === 'favorite') {
                matrixReviewStatus = 'favorite';
            } else if (bucketCls.includes('bucketNone') || bucketTitle === 'save as favorite') {
                matrixReviewStatus = 'none';
            }
        }

        const foundFavorite = matrixReviewStatus === 'favorite';

        const portalNotes = extractMatrixNotes(block, mlsId);

        // Matches extractGalleryImages()'s selector below rather than the old generic
        // 'img[src*="Photo"], img[src*="photo"], .display-photo img, img' chain, whose final
        // bare 'img' fallback was grabbing whatever <img> happened to be first in the row block
        // when the more specific selectors missed — confirmed live to be a small UI icon (e.g.
        // Matrix/images/icons/icon-map-blue.svg), not the listing thumbnail, for a large share
        // of listings. That bad "photo" URL got cached server-side as this listing's main image
        // (see backend/properties.php's looksLikeRealPhotoBody(), which now rejects it, and the
        // notes in properties-fix history for the corrupted-index-0 symptom this caused). Only
        // accept an <img> whose src is an actual Matrix media asset; leave main_image_url empty
        // (clean placeholder) rather than fall back to an arbitrary icon.
        const imgEl = block.querySelector('img[src*="GetMedia.ashx"], img[src*="matrixmedia"], .display-photo img');
        const mainImg = (imgEl && !/\/icons?\//i.test(imgEl.src)) ? imgEl.src : '';

        return {
            mls_id: mlsId,
            favorite: (matrixReviewStatus === 'favorite' || foundFavorite || isFavoritePage) ? 1 : 0,
            address: address,
            city: city,
            state: state,
            zip: zip,
            price: price,
            status: status,
            beds: beds,
            baths: baths,
            sqft_total: sqftTotal,
            sqft_finished: sqftFin,
            lot_acres: lotAcres,
            lot_sqft: lotSqft,
            year_built: yearBuilt,
            school_district: schoolDistrict,
            parking_total: parkingTotal,
            garage_spaces: garageSpaces,
            hoa_fee: hoaFee,
            annual_tax: annualTax,
            tax_year: taxYear,
            list_date: listDate,
            mls_url: window.location.href,
            main_image_url: mainImg,
            matrix_review_status: matrixReviewStatus,
            portal_notes: portalNotes
        };
    }

    function scrapeMatrixPortal(onDone) {
        notify('🔍 Scraping properties from Matrix page...');
        logToServer('info', 'Quick scrape started', null, { url: window.location.href });

        const blocks = findListingBlocks();

        if (blocks.length === 0) {
            notify('⚠️ No properties found on current view — make sure you\'re viewing Matrix search results.', true);
            logToServer('warn', 'Quick scrape found no listing blocks on page', null, { url: window.location.href });
            if (onDone) onDone([]);
            return;
        }

        const listings = blocks.map(parseListingBlock).filter(Boolean);

        if (listings.length === 0) {
            notify('⚠️ Could not parse listing details from page DOM.', true);
            logToServer('warn', 'Quick scrape found blocks but parsed zero listings', null, { url: window.location.href, blockCount: blocks.length });
            if (onDone) onDone([]);
            return;
        }

        const favsCount = listings.filter(l => l.favorite || l.matrix_review_status === 'favorite').length;
        syncToBackend(listings, (result) => {
            if (result && result.success) {
                notify(\`✅ Synced \${listings.length} listings (\${favsCount} favorites)\`);
            }
            if (onDone) onDone(listings);
        });
    }

    // callback always fires (success AND failure) so callers — especially the deep-scrape walker,
    // which awaits this per listing — never hang on a single failed sync. On failure the error
    // toast is already shown here; callers just get {success:false, ...} back to log/skip.
    function syncToBackend(payload, callback) {
        const dataStr = JSON.stringify({ properties: payload, username: CONFIG.USER || null });

        fetch(getEffectiveApiUrl() + '?action=sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Scout-Token': CONFIG.SCRAPE_TOKEN || '' },
            body: dataStr
        })
        .then(res => res.json())
        .then(data => {
            if (!data.success) {
                notify('❌ Sync failed: ' + (data.error || 'Server error'), true);
                logToServer('error', 'Sync failed (server responded success:false): ' + (data.error || 'unknown'), payload.length === 1 ? payload[0].mls_id : null, { count: payload.length });
            }
            if (callback) callback(data);
        })
        .catch(err => {
            console.warn('Scout fetch error:', err);
            notify('❌ Network error syncing to Scout server: ' + err.message, true);
            logToServer('error', 'Sync network error: ' + err.message, payload.length === 1 ? payload[0].mls_id : null, { count: payload.length });
            if (callback) callback({ success: false, error: err.message });
        });
    }

    // Asks the backend which mls_ids already have a completed full (photo) scrape, so the deep
    // walker can skip straight past the expensive photo work for them and only re-check notes.
    function fetchScrapeStatus(callback) {
        fetch(getEffectiveApiUrl() + '?action=scrape_status', { headers: { 'X-Scout-Token': CONFIG.SCRAPE_TOKEN || '' } })
            .then(res => res.json())
            .then(data => {
                const completed = (data && data.success && Array.isArray(data.completed)) ? data.completed.map(String) : [];
                callback(new Set(completed));
            })
            .catch(err => {
                console.warn('Scout scrape_status fetch error:', err);
                logToServer('warn', 'scrape_status fetch error: ' + err.message);
                callback(new Set());
            });
    }

        const waitUntil = async (predicate, timeoutMs, pollMs = 150) => {
        for (let waited = 0; waited < timeoutMs; waited += pollMs) {
            if (predicate()) return true;
            await delay(pollMs);
        }
        return predicate();
    };

    function findFirstDetailLinkOnPage() {
        const blocks = findListingBlocks();
        for (const b of blocks) {
            const addrElem = b.querySelector('.d-displayAddress, .portal-address, [id*="Address"], [class*="Address"]');
            if (addrElem && addrElem.tagName === 'A') return addrElem;
            const linkInAddr = addrElem ? addrElem.querySelector('a') : null;
            if (linkInAddr) return linkInAddr;

            const links = Array.from(b.querySelectorAll('a'));
            const addrLink = links.find(a => {
                const t = a.innerText.trim();
                return t && /^\d+\s+[A-Za-z]/.test(t);
            });
            if (addrLink) return addrLink;

            const postBackLink = links.find(a => a.href && (a.href.includes('__doPostBack') || a.href.includes('DisplayCore') || a.href.includes('javascript:')));
            if (postBackLink) return postBackLink;
        }
        return null;
    }

function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Confirmed live (Sept 2026): the full single-listing detail view's position indicator
    // matches /\d+ of \d+/ in the page text (e.g. "28 of 57") and updates after each next/prev
    // click. Returns null if no such indicator is present (e.g. not currently in detail view).
    function getCounterInfo() {
        const m = (document.body.innerText || '').match(/\b(\d+)\s+of\s+(\d+)\b/);
        return m ? { cur: parseInt(m[1], 10), total: parseInt(m[2], 10) } : null;
    }

    // Polls (every 250ms, confirmed a ~1s settle time is typical for the in-place AJAX postback,
    // though page/chunk boundary postbacks on Matrix can take 5-8s) until counter changes from prevCur.
    async function waitForCounterChange(prevCur, timeoutMs = 15000) {
        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            await delay(250);
            const c = getCounterInfo();
            if (c && c.cur !== prevCur) return c;
        }
        return null;
    }

    /**
     * Deep-scrape walker (Part 2/3 of the plan in claude/full-detail-scrape-plan.md). Requires a
     * single listing already open in full detail view (with the listing-level prev/next arrows
     * present) — that's the entry point the plan describes ("via whatever's currently expanded").
     *
     * For every listing reached via the "next" arrow (a.glyphicon-chevron-right, confirmed live —
     * NOTE: its href's Redisplay|,,N postback argument is a per-page position index, NOT a fixed
     * constant, so the class name is the only stable way to find it):
     *   - Always re-extracts and syncs notes (extractMatrixNotesDetailed) — cheap, and the only
     *     way to pick up anything the agent may have added since the last run.
     *   - Only if this mls_id has no full_scrape_completed_at yet (per /backend/api.php's
     *     scrape_status endpoint): also captures whatever gallery photos are currently rendered
     *     (extractGalleryImages — v1 does not automate the photo carousel's own next/prev, see
     *     plan doc open question #3) and marks full_scrape:true so the backend sets
     *     full_scrape_completed_at and this listing's photo work is never repeated.
     *   - Syncs immediately after each listing (not batched), so partial progress survives an
     *     interruption and one bad listing can't sink the whole run.
     *
     * Termination is defensive rather than relying on knowing the exact counter boundary behavior
     * (unconfirmed — see plan doc open question #2, wrap-to-1 vs. inert): every visited position
     * number is tracked, and the walk stops the moment a position repeats, in addition to the
     * ordinary "no next arrow" and "counter never changed" stopping conditions.
     */
    async function deepScrapeMatrixPortal() {
        notify('🔎 Starting deep scrape — this walks every listing and may take a while...');
        logToServer('info', 'Deep scrape started', null, { url: window.location.href });

        scrapeMatrixPortal(async () => {
            let hasNav = !!document.querySelector('a.glyphicon-chevron-right') || !!getCounterInfo();
            if (!hasNav) {
                const firstLink = findFirstDetailLinkOnPage();
                if (firstLink) {
                    notify('🔄 Opening first listing from search page...', false, true);
                    firstLink.click();
                    const loaded = await waitUntil(() => !!document.querySelector('a.glyphicon-chevron-right') || !!getCounterInfo(), 10000);
                    if (!loaded) {
                        notify('⚠️ Clicked first listing but detail view did not load. Try opening one listing manually.', true, true);
                        logToServer('warn', 'Deep scrape auto-open failed — detail view did not load in 10s', null, { url: window.location.href });
                        return;
                    }
                    hasNav = true;
                } else {
                    notify('⚠️ Deep scrape needs a listing detail view or search page with clickable listings.', true, true);
                    logToServer('warn', 'Deep scrape aborted — no listing link found on list page', null, { url: window.location.href });
                    return;
                }
            }

            let completedSet = new Set();
            await new Promise(resolve => fetchScrapeStatus(set => { completedSet = set; resolve(); }));

            const visitedPositions = new Set();
            const multiAuthorFlags = [];
            let processedCount = 0;
            let fullScrapeCount = 0;
            let failedSyncCount = 0;
            let reachedFinalListing = false;
            const MAX_ITER = 500; // safety cap independent of the "X of Y" counter, in case it's ever absent/unreliable
            let iter = 0;
            let keepGoing = true;

            while (keepGoing && iter < MAX_ITER) {
                iter++;

                let blocks = findListingBlocks();
                let listing = null;
                let matchedBlock = null;
                for (const b of blocks) {
                    const parsed = parseListingBlock(b);
                    if (parsed) { listing = parsed; matchedBlock = b; break; }
                }

                // If DOM is mid-render, give it up to 5 seconds to settle
                if (!listing) {
                    await waitUntil(() => {
                        blocks = findListingBlocks();
                        for (const b of blocks) {
                            const parsed = parseListingBlock(b);
                            if (parsed) { listing = parsed; matchedBlock = b; return true; }
                        }
                        return false;
                    }, 5000);
                }

                if (!listing) {
                    notify('⚠️ Deep scrape stopped — could not find a listing detail block on this page.', true);
                    logToServer('error', 'Deep scrape stopped — no listing detail block found', null, { iter, processedCount });
                    break;
                }

                const counter = getCounterInfo();
                if (counter) {
                    if (visitedPositions.has(counter.cur)) {
                        logToServer('info', 'Deep scrape reached previously visited position, stopping', null, { position: counter.cur, processedCount });
                        break;
                    }
                    visitedPositions.add(counter.cur);
                }

                const notesInfo = extractMatrixNotesDetailed(matchedBlock, listing.mls_id);
                listing.portal_notes = notesInfo.text;
                if (notesInfo.multiAuthor) multiAuthorFlags.push(listing.mls_id);

                const alreadyFullyScraped = completedSet.has(String(listing.mls_id));
                let photoNote = '';

                if (!alreadyFullyScraped) {
                    // walkPhotoGallery() clicks through the full carousel rather than just
                    // snapshotting whatever's pre-loaded (confirmed live: a plain snapshot can
                    // miss the large majority of a listing's photos — see its doc comment).
                    const gallery = await walkPhotoGallery();
                    if (gallery.length) {
                        listing.gallery_images = gallery;
                        listing.main_image_url = gallery[0];
                    }
                    listing.full_scrape = true;
                    fullScrapeCount++;
                    photoNote = \`, \${gallery.length} photos\`;
                }

                processedCount++;
                const posLabel = counter ? \`\${counter.cur} of \${counter.total}\` : \`#\${processedCount}\`;
                const addrLabel = listing.address ? \` — \${listing.address}\` : '';
                notify(\`Ingesting address \${posLabel}\${addrLabel} (\${alreadyFullyScraped ? 'notes re-checked' : 'full scrape' + photoNote})\`, false, true);

                const syncResult = await new Promise(resolve => syncToBackend([listing], resolve));
                if (!syncResult || !syncResult.success) {
                    failedSyncCount++;
                    console.warn('Scout deep-scrape: sync failed for', listing.mls_id, syncResult);
                    logToServer('error', 'Deep-scrape sync failed for listing', listing.mls_id, { syncResult: syncResult, posLabel: posLabel });
                } else if (notesInfo.multiAuthor) {
                    logToServer('warn', 'Multi-author (or unattributed) note row detected', listing.mls_id, { rowCount: notesInfo.rowCount, authors: notesInfo.authors });
                }

                if (counter && counter.cur >= counter.total) {
                    reachedFinalListing = true;
                    logToServer('info', 'Deep scrape reached final listing', null, { processedCount, position: counter.cur, total: counter.total });
                    break;
                }

                // Find next listing chevron button (wait up to 4s if DOM is updating)
                let nextLink = document.querySelector('a.glyphicon-chevron-right');
                if (!nextLink) {
                    const found = await waitUntil(() => !!document.querySelector('a.glyphicon-chevron-right'), 4000);
                    if (found) nextLink = document.querySelector('a.glyphicon-chevron-right');
                }

                if (!nextLink) {
                    logToServer('info', 'Deep scrape: no next chevron link found, walk complete', null, { processedCount });
                    break;
                }

                const prevCur = counter ? counter.cur : null;
                nextLink.click();

                if (prevCur !== null) {
                    // Wait up to 15 seconds for counter to change (handles cross-page boundary postbacks)
                    let changed = await waitForCounterChange(prevCur, 15000);
                    if (!changed) {
                        // Retry clicking next once more if button is still present
                        const retryNext = document.querySelector('a.glyphicon-chevron-right');
                        if (retryNext) {
                            retryNext.click();
                            changed = await waitForCounterChange(prevCur, 10000);
                        }
                    }
                    if (!changed) {
                        logToServer('info', 'Deep scrape: counter did not change after postback wait, stopping', null, { prevCur, processedCount });
                        keepGoing = false;
                    } else if (visitedPositions.has(changed.cur)) {
                        logToServer('info', 'Deep scrape: counter looped back to visited position, stopping', null, { newCur: changed.cur, processedCount });
                        keepGoing = false;
                    }
                } else {
                    await delay(1500);
                }
            }

            let summary = reachedFinalListing
                ? \`✅ Deep scrape complete — \${processedCount} listing(s) visited, \${fullScrapeCount} fully scraped\`
                : \`⚠️ Deep scrape stopped — \${processedCount} listing(s) visited, \${fullScrapeCount} fully scraped\`;
            if (failedSyncCount) {
                summary += \`. \${failedSyncCount} listing sync\${failedSyncCount === 1 ? '' : 's'} failed — check the event log\`;
            }
            if (multiAuthorFlags.length) {
                summary += \`. ⚠️ \${multiAuthorFlags.length} listing(s) had multi-author notes — check: \${multiAuthorFlags.join(', ')}\`;
            }
            notify(summary, failedSyncCount > 0 || !reachedFinalListing, true);
            logToServer('info', 'Deep scrape complete', null, {
                processedCount, fullScrapeCount, failedSyncCount, reachedFinalListing, multiAuthorFlags, url: window.location.href
            });
        });
    }

    const hostname = window.location.hostname;
    if (hostname.includes('recolorado.com') || hostname.includes('matrix')) {
        // Wrapped so a future bug of the same shape as the old undefined-cleanInt crash — which
        // threw synchronously mid-scrape with zero durable record anywhere — gets reported to the
        // server and surfaced as a toast instead of silently aborting with nothing to go on.
        try {
            if (CONFIG.MODE === 'deep') {
                deepScrapeMatrixPortal().catch(err => {
                    logToServer('error', 'Deep scrape crashed: ' + (err && err.message), null, { stack: err && err.stack, url: window.location.href });
                    notify('❌ Deep scrape crashed: ' + (err && err.message), true);
                });
            } else {
                scrapeMatrixPortal();
            }
        } catch (err) {
            logToServer('error', 'Scrape crashed: ' + (err && err.message), null, { stack: err && err.stack, url: window.location.href });
            notify('❌ Scrape crashed: ' + (err && err.message), true);
        }
    } else {
        notify('ℹ️ Run this bookmarklet while viewing Matrix MLS or Redfin listing pages.');
    }
})();
`;
    // Undo the backslash that String.raw preserved in front of the engine's own \` and \${
    // escapes (used for its nested template literals), now that raw extraction is done and
    // those no longer need to protect anything from this function's own template literal.
    return raw.replace(/\\`/g, '`').replace(/\\\$\{/g, '${');
}

function cleanJsForBookmarklet(jsCode) {
    return jsCode
        .split(/[\r\n]+/)
        .map(line => line.replace(/^\s*\/\/.*$/, '').replace(/\s+\/\/.*/, ''))
        .filter(Boolean)
        .join(' ');
}

function getBookmarkletCode(apiUrl, username, scrapeToken) {
    const cleanEngine = cleanJsForBookmarklet(getEngineCode());
    const userPart = username ? `window.SCOUT_USER='` + username + `'; ` : '';
    const tokenPart = scrapeToken ? `window.SCOUT_SCRAPE_TOKEN='` + scrapeToken + `'; ` : '';
    const wrapper = `(function(){ window.SCOUT_API_URL='` + apiUrl + `'; ` + userPart + tokenPart + `window.SCOUT_MODE='deep'; ` + cleanEngine + `})();`;
    return 'javascript:' + wrapper;
}

function getDeepScrapeBookmarkletCode(apiUrl, username, scrapeToken) {
    return getBookmarkletCode(apiUrl, username, scrapeToken);
}

function getConsoleSnippetCode(apiUrl, username, scrapeToken) {
    return getBookmarkletCode(apiUrl, username, scrapeToken).replace(/^javascript:/, '');
}

function getDeepScrapeConsoleSnippetCode(apiUrl, username, scrapeToken) {
    return getConsoleSnippetCode(apiUrl, username, scrapeToken);
}
