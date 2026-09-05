/**
 * MLS & Redfin Property Scout - Self-Contained Bookmarklet Engine Builder
 * Generates 100% inline bookmarklet executable directly on HTTPS Matrix MLS & Redfin pages.
 */
function getBookmarkletCode(apiUrl) {
    const engineCode = `/**
 * MLS & Redfin Property Scout - Bookmarklet Engine
 * High-performance DOM parser for Matrix REColorado and Redfin property pages.
 */
(function() {
    'use strict';

    const CONFIG = {
        API_URL: window.SCOUT_API_URL || (window.location.origin.includes('nycto.ninja') 
            ? 'https://nycto.ninja/mls-redfin-scout/backend/api.php' 
            : 'http://127.0.0.1:8888/mls-redfin-scout/backend/api.php'),
        AUTO_POPUP_REDFIN: true
    };

    function notify(msg, isError = false) {
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
            \`;
            document.body.appendChild(toast);
        }
        toast.innerText = msg;
        toast.style.opacity = '1';
        setTimeout(() => { toast.style.opacity = '0'; }, 4000);
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

        // 7. Multiline search for (Me) comments, quoted strings, and inline JSON scripts
        const pageText = (block || document.body).innerText || '';
        const meBlockMatches = pageText.match(/(?:Me|\\(Me\\))[\\s\\r\\n]*(?:\\d{2}\\/\\d{2}\\/\\d{4})?[\\s\\r\\n]*["“]?([^"”\\r\\n]{3,1000})["”]?/ig);
        if (meBlockMatches) {
            meBlockMatches.forEach(m => candidateTexts.push(m));
        }

        const quoteMatches = pageText.match(/["“]([^"”\\r\\n]{3,1000})["”]/g);
        if (quoteMatches) {
            quoteMatches.forEach(q => {
                const cleanQ = q.replace(/^["“]|["”]$/g, '').trim();
                if (cleanQ && cleanQ.length > 3) candidateTexts.push(cleanQ);
            });
        }

        const scripts = Array.from(document.querySelectorAll('script'));
        scripts.forEach(s => {
            const st = s.textContent || '';
            if (st.includes('Note') || st.includes('note')) {
                const matches = st.match(/"(?:ClientNote|Note|portalNote|userNote|comment|text)"\\s*:\\s*"([^"]+)"/ig);
                if (matches) {
                    matches.forEach(m => {
                        const val = m.replace(/^"[^"]+"\\s*:\\s*"/, '').replace(/"$/, '').trim();
                        if (val) candidateTexts.push(val);
                    });
                }
            }
        });

        // 8. Clean and evaluate candidates
        for (let txt of candidateTexts) {
            if (!txt) continue;
            let clean = txt.trim();

            clean = clean.replace(/^(\\(Me\\)|Me)\\s*(\\d{2}\\/\\d{2}\\/\\d{4})?\\s*/i, '').trim();
            clean = clean.replace(/^(Client\\s+)?Notes?:\\s*/i, '').trim();
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
                clean.length < 2
            ) {
                continue;
            }

            return clean;
        }

        return '';
    }

    function scrapeMatrixPortal() {
        notify('🔍 Scraping properties from Matrix page...');

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

        if (blocks.length === 0) {
            notify('⚠️ No properties found on current view — make sure you\\'re viewing Matrix search results.', true);
            return;
        }

        const listings = [];

        blocks.forEach(block => {
            const text = block.innerText || '';
            if (!text.includes('Listing ID') && !text.includes('MLS#') && !text.includes('MLS ID') && !text.includes('Bed')) return;

            let mlsId = '';
            const mlsMatch = text.match(/Listing ID:\\s*(\\d+)/i) || text.match(/MLS#:\\s*(\\d+)/i) || text.match(/MLS\\s*ID:\\s*(\\d+)/i) || text.match(/MLS#\\s*(\\d+)/i) || text.match(/MLS:\\s*(\\d+)/i);
            if (mlsMatch) mlsId = mlsMatch[1];
            if (!mlsId) {
                const keyAttr = block.querySelector('[data-key]');
                if (keyAttr) mlsId = keyAttr.getAttribute('data-key');
            }
            if (!mlsId) return;

            let price = 0;
            const priceMatch = text.match(/\\$([0-9,]+)/);
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
                    return t && t !== mlsId && /^\\d+\\s+[A-Za-z]/.test(t);
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

            const cityZipMatch = text.match(/(?:^|[\\r\\n])\\s*([A-Za-z][A-Za-z ]*),\\s*(CO|Colorado)\\s*(\\d{5})/i) || text.match(/([A-Za-z][A-Za-z ]*),\\s*(CO|Colorado)\\s*(\\d{5})/i);
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

            const bedsMatch = text.match(/(\\d+)\\s*Beds/i);
            const beds = bedsMatch ? cleanInt(bedsMatch[1]) : 0;

            const bathsMatch = text.match(/([\\d\\.]+)\\s*Baths/i) || text.match(/Baths:\\s*([\\d\\.]+)/i);
            const baths = bathsMatch ? cleanNumber(bathsMatch[1]) : 0;

            const sqftTotalMatch = text.match(/([0-9,]+)\\s*SqFt Total/i);
            const sqftTotal = sqftTotalMatch ? cleanInt(sqftTotalMatch[1]) : 0;

            const sqftFinMatch = text.match(/([0-9,]+)\\s*SqFt Fin/i);
            const sqftFin = sqftFinMatch ? cleanInt(sqftFinMatch[1]) : sqftTotal;

            const yearMatch = text.match(/Built in\\s*(\\d{4})/i) || text.match(/Year Built:\\s*(\\d{4})/i);
            const yearBuilt = yearMatch ? cleanInt(yearMatch[1]) : 0;

            const acreMatch = text.match(/([\\d\\.]+)\\s*Acres/i);
            const lotAcres = acreMatch ? cleanNumber(acreMatch[1]) : 0;

            const lotSqftMatch = text.match(/([0-9,]+)\\s*SqFt(?!\\s*Total|\\s*Fin)/i);
            const lotSqft = lotSqftMatch ? cleanInt(lotSqftMatch[1]) : Math.round(lotAcres * 43560);

            const schoolMatch = text.match(/([A-Za-z0-9\\s\\-]+)\\s*School District/i);
            const schoolDistrict = schoolMatch ? schoolMatch[1].trim() : '';

            const parkingMatch = text.match(/(\\d+)\\s*Parking Total/i);
            const parkingTotal = parkingMatch ? cleanInt(parkingMatch[1]) : 0;

            const garageMatch = text.match(/(\\d+)\\s*Garage Spaces/i);
            const garageSpaces = garageMatch ? cleanInt(garageMatch[1]) : 0;

            const hoaMatch = text.match(/Annual HOA Fee\\s*\\$([0-9,.]+)/i) || text.match(/HOA Fee:\\s*\\$([0-9,.]+)/i);
            const hoaFee = hoaMatch ? cleanNumber(hoaMatch[1]) : 0;

            const taxMatch = text.match(/Annual Tax\\s*\\$([0-9,.]+)/i);
            const annualTax = taxMatch ? cleanNumber(taxMatch[1]) : 0;

            const taxYearMatch = text.match(/Annual Tax.*?\\/(\\d{4})/i);
            const taxYear = taxYearMatch ? cleanInt(taxYearMatch[1]) : new Date().getFullYear();

            const listDateMatch = text.match(/List Date:\\s*(\\d{2}\\/\\d{2}\\/\\d{2,4})/i);
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

            const imgEl = block.querySelector('img[src*="Photo"], img[src*="photo"], .display-photo img, img');
            const mainImg = imgEl ? imgEl.src : '';

            listings.push({
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
                gallery_images: mainImg ? [mainImg] : [],
                matrix_review_status: matrixReviewStatus,
                portal_notes: portalNotes
            });
        });

        if (listings.length === 0) {
            notify('⚠️ Could not parse listing details from page DOM.', true);
            return;
        }

        const favsCount = listings.filter(l => l.favorite || l.matrix_review_status === 'favorite').length;
        syncToBackend(listings, () => {
            notify(\`✅ Synced \${listings.length} listings (\${favsCount} favorites)\`);
        });
    }

    function syncToBackend(payload, callback) {
        const dataStr = JSON.stringify({ properties: payload });

        fetch(CONFIG.API_URL + '?action=sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: dataStr
        })
        .then(res => res.json())
        .then(data => {
            if (data.success && callback) callback(data);
            else if (!data.success) {
                notify('❌ Sync failed: ' + (data.error || 'Server error'), true);
            }
        })
        .catch(err => {
            console.warn('Scout fetch error:', err);
            notify('❌ Network error syncing to Scout server: ' + err.message, true);
        });
    }

    const hostname = window.location.hostname;
    if (hostname.includes('recolorado.com') || hostname.includes('matrix')) {
        scrapeMatrixPortal();
    } else {
        notify('ℹ️ Run this bookmarklet while viewing Matrix MLS or Redfin listing pages.');
    }
})();
`;
    const wrapper = `(function(){ window.SCOUT_API_URL='` + apiUrl + `'; ` + engineCode + `})();`;
    return 'javascript:' + encodeURIComponent(wrapper);
}

function getConsoleSnippetCode(apiUrl) {
    return getBookmarkletCode(apiUrl).replace(/^javascript:/, '');
}
