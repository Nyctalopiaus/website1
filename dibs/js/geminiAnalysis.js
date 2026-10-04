/**
 * Gemini-written property analysis for the detail modal's AI Analysis section.
 *
 * Same connection as certforge: the browser calls the Gemini API directly with the user's own
 * key, which is stored PIN-encrypted in this browser and shared with certforge (never sent to
 * the Dibs server). The site-wide CSP already allows generativelanguage.googleapis.com.
 *
 * The prompt is a fact sheet built from what Dibs has already collected for the listing (MLS
 * fields, public remarks, recorded price changes, RentCast comps and price score, the buyer's
 * own notes, and the other tracked listings in the same ZIP), and Gemini is given Google Search
 * so it can add public-record context such as prior sale price. Only ever runs from a button.
 */
import { CONFIG, state } from './state.js';
import { apiFetch } from './api.js';
import { getCompScore } from './properties.js';

// One Gemini key for every nycto.ninja app (the model choice is per app). These are certforge's storage names and vault format
// (js/vault.js there) on purpose: the apps share an origin, so they share localStorage, and a
// key saved in either app works in the other. Keep the two in step if the format ever changes.
const VAULT_STORAGE = 'certforge_ai_gemini_vault_v1';             // localStorage: { salt, iv, cipherText } (base64)
const SESSION_KEY_STORAGE = 'certforge_ai_gemini_session_key_v1'; // sessionStorage: key unlocked for this tab
const LEGACY_KEY_STORAGE = 'certforge_ai_gemini_key_v1';          // localStorage: old unencrypted key (read only)
const MODEL_STORAGE = 'dibs_ai_gemini_model_v1';                  // Dibs-only: certforge's quiz helpers want a cheaper model than this does
const VAULT_PBKDF2_ITERATIONS = 200000;                           // certforge's AI_VAULT_PBKDF2_ITERATIONS
export const GEMINI_DEFAULT_MODEL = 'gemini-3.8-flash';
export const GEMINI_MODEL_SUGGESTIONS = ['gemini-3.8-flash', 'gemini-3.1-pro-preview', 'gemini-3.6-flash', 'gemini-3.5-flash-lite'];
export const GEMINI_MIN_PIN_LENGTH = 4;

function read(store, key) {
    try { return store.getItem(key) || ''; } catch (e) { return ''; }
}

export function getGeminiModel() {
    return read(localStorage, MODEL_STORAGE).trim() || GEMINI_DEFAULT_MODEL;
}

export function setGeminiModel(model) {
    const value = String(model || '').trim();
    try {
        if (value && value !== GEMINI_DEFAULT_MODEL) localStorage.setItem(MODEL_STORAGE, value);
        else localStorage.removeItem(MODEL_STORAGE);
    } catch (e) { /* the default model is used */ }
}

function getUsableGeminiKey() {
    return read(sessionStorage, SESSION_KEY_STORAGE).trim() || read(localStorage, LEGACY_KEY_STORAGE).trim();
}

/** 'ready' = a key can be used now; 'locked' = an encrypted key is saved but needs its PIN; 'none'. */
export function getGeminiKeyState() {
    if (getUsableGeminiKey()) return 'ready';
    return read(localStorage, VAULT_STORAGE) ? 'locked' : 'none';
}

/** For the AI Setup modal: the usable state plus how the key is stored. */
export function getGeminiKeyInfo() {
    return { state: getGeminiKeyState(), hasVault: !!read(localStorage, VAULT_STORAGE), hasLegacy: !!read(localStorage, LEGACY_KEY_STORAGE) };
}

/** Forget the unlocked key for this tab; the encrypted copy stays and needs the PIN again. */
export function lockGeminiKey() {
    try { sessionStorage.removeItem(SESSION_KEY_STORAGE); } catch (e) { /* nothing to lock */ }
}

/** Delete the saved key entirely (certforge shares it, so it is removed there too). */
export function removeGeminiKey() {
    try {
        sessionStorage.removeItem(SESSION_KEY_STORAGE);
        localStorage.removeItem(VAULT_STORAGE);
        localStorage.removeItem(LEGACY_KEY_STORAGE);
    } catch (e) { /* storage unavailable: nothing was saved */ }
}

function bufToBase64(buf) {
    let binary = '';
    new Uint8Array(buf).forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary);
}

function base64ToBytes(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

async function deriveVaultKey(pin, salt) {
    const baseKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: VAULT_PBKDF2_ITERATIONS, hash: 'SHA-256' },
        baseKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

function rememberUnlockedKey(apiKey) {
    try { sessionStorage.setItem(SESSION_KEY_STORAGE, apiKey); } catch (e) { /* asked for again next time */ }
}

/** Decrypts the saved key with the PIN and keeps it unlocked for this browser tab. */
export async function unlockGeminiVault(pin) {
    let stored;
    try { stored = JSON.parse(read(localStorage, VAULT_STORAGE)); } catch (e) { stored = null; }
    if (!stored || !stored.salt || !stored.iv || !stored.cipherText) throw new Error('No saved Gemini key was found in this browser.');
    const key = await deriveVaultKey(pin, base64ToBytes(stored.salt));
    let apiKey;
    try {
        apiKey = new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(stored.iv) }, key, base64ToBytes(stored.cipherText)));
    } catch (e) {
        throw new Error('Incorrect PIN.');
    }
    rememberUnlockedKey(apiKey);
}

/** Encrypts the key with the PIN (AES-GCM, PBKDF2) and saves it for every app on this site. */
export async function saveGeminiVault(pin, apiKey) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveVaultKey(pin, salt);
    const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(apiKey));
    try {
        localStorage.setItem(VAULT_STORAGE, JSON.stringify({ salt: bufToBase64(salt), iv: bufToBase64(iv), cipherText: bufToBase64(cipherBuf) }));
        localStorage.removeItem(LEGACY_KEY_STORAGE);
    } catch (e) {
        throw new Error('This browser would not store the key (storage is blocked or full).');
    }
    rememberUnlockedKey(apiKey);
}

// ---- Fact sheet ---------------------------------------------------------------------------

const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const money = v => num(v) ? '$' + Math.round(num(v)).toLocaleString('en-US') : 'unknown';
const has = v => v !== null && v !== undefined && String(v).trim() !== '';

function parseDate(value) {
    const s = String(value || '').trim();
    let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
    if (m) return new Date(m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]), Number(m[1]) - 1, Number(m[2]));
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return null;
}

const isoDay = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function daysOnMarket(p) {
    const listed = parseDate(p.list_date);
    if (!listed) return null;
    const days = Math.floor((Date.now() - listed.getTime()) / 86400000);
    return days >= 0 ? days : null;
}

function median(values) {
    const sorted = values.filter(v => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
    if (!sorted.length) return 0;
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function rawMls(p) {
    if (p.raw_mls_json && typeof p.raw_mls_json === 'object') return p.raw_mls_json;
    try { return JSON.parse(p.raw_mls_json || '{}') || {}; } catch (e) { return {}; }
}

const psf = p => {
    const sqft = num(p.sqft_finished) || num(p.sqft_total);
    return num(p.price) && sqft ? num(p.price) / sqft : 0;
};

function listingLines(p, activity, searchAvailable) {
    const raw = rawMls(p);
    const interior = raw.interior && typeof raw.interior === 'object' ? raw.interior : {};
    const dom = daysOnMarket(p);
    const lines = [];
    const add = (label, value) => { if (has(value)) lines.push(`- ${label}: ${value}`); };

    add('Address', [p.address, p.city, p.state, p.zip].filter(has).join(', '));
    add('MLS #', p.mls_id);
    add('MLS status', p.status);
    add('Current list price', money(p.price) + (psf(p) ? ` (${money(psf(p))}/sq ft finished)` : ''));
    add('List date', has(p.list_date) ? `${p.list_date}${dom !== null ? ` (${dom} days on market as of today)` : ''}` : '');
    if (searchAvailable) {
        add('Price history', 'left out on purpose. Look up the full list-price history since the list date and use that.');
    }
    add('Beds / baths', `${p.beds || '?'} / ${p.baths || '?'}`);
    add('Square feet', `${num(p.sqft_total) || '?'} total, ${num(p.sqft_finished) || '?'} finished`);
    add('Above grade sq ft', num(interior.sqft_above_grade) ? `${interior.sqft_above_grade}${num(p.price) ? ` (${money(num(p.price) / num(interior.sqft_above_grade))}/sq ft above grade)` : ''}` : '');
    add('Basement sq ft', has(interior.sqft_below_grade_total) ? `${interior.sqft_below_grade_total} total, ${interior.sqft_below_grade_finished || 0} finished` : '');
    add('Levels', p.levels);
    add('Property type', p.property_type);
    add('Year built', num(p.year_built) ? `${p.year_built} (${new Date().getFullYear() - num(p.year_built)} years old)` : '');
    add('Lot', num(p.lot_sqft) ? `${num(p.lot_sqft).toLocaleString('en-US')} sq ft${has(p.lot_acres) ? ` (${p.lot_acres} acres)` : ''}` : '');
    add('Garage / parking', `${p.garage_spaces || '?'} garage spaces, ${p.parking_total || '?'} total parking`);
    add('School district', p.school_district);
    add('HOA', num(p.hoa_fee) ? `fee of $${p.hoa_fee} on the listing (billing frequency not recorded in Dibs; confirm monthly vs. annual)` : (String(p.hoa_exists) === '1' ? 'yes, fee not recorded' : 'none recorded'));
    add('Property tax', num(p.annual_tax) ? `${money(p.annual_tax)} per year${has(p.tax_year) ? ` (${p.tax_year})` : ''}` : '');

    // With search on, Gemini looks the price history up live, so the partial record from Dibs
    // sync dates is left out rather than risk it being read as the whole story. It is only the
    // fallback when a run has no search.
    if (!searchAvailable) {
        const tracked = has(p.created_at) ? String(p.created_at).slice(0, 10) : '';
        const listed = parseDate(p.list_date);
        const gap = tracked && listed ? Math.round((parseDate(tracked).getTime() - listed.getTime()) / 86400000) : null;
        lines.push(`- Price history: PARTIAL. Dibs only began tracking this listing${tracked ? ` on ${tracked}` : ''}${gap !== null && gap > 0 ? `, ${gap} days after it was listed` : ''}. Anything before that is not recorded.`);
        if (num(p.original_price) && Math.abs(num(p.original_price) - num(p.price)) >= 1) {
            lines.push(`    - Price when Dibs first saw it: ${money(p.original_price)} (not necessarily the original list price)`);
        }
        (activity || []).filter(a => /price|status/i.test(String(a.activity_type || ''))).slice().reverse()
            .forEach(a => lines.push(`    - Seen by Dibs on ${String(a.created_at || '').slice(0, 10)}: ${a.message}`));
    }
    return lines;
}

function compsLines(p) {
    const score = getCompScore(p);
    if (!score) return ['Comps have not been checked in Dibs for this listing, so there is no price score. Say so, and reason about value from the local listings below and from what you find.'];
    const lines = [
        `- Dibs price score: ${score.score}/100 (higher is a better price for the buyer; 50 means in line with comps). List price is ${score.pctText}.`,
        `- Comp-based value: ${money(score.estimate)}${num(p.comp_range_low) && num(p.comp_range_high) ? `, likely range ${money(p.comp_range_low)} to ${money(p.comp_range_high)}` : ''}.`,
        `- Source: RentCast automated valuation${has(p.comp_fetched_at) ? `, checked ${String(p.comp_fetched_at).slice(0, 10)}` : ''}. These are listing-based comps, not appraiser-selected sold comps.`
    ];
    const comps = Array.isArray(p.comps) ? p.comps : [];
    if (comps.length) {
        lines.push('', '| Comp address | Price | Bd/Ba | Sq ft | $/sq ft | Built | Distance | Status | Days on market | Match |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
        comps.slice(0, 15).forEach(c => {
            const sqft = num(c.squareFootage);
            const status = String(c.status || '').toLowerCase() === 'active' ? 'Active' : `Off market${has(c.removedDate) ? ' ' + String(c.removedDate).slice(0, 10) : ''}`;
            lines.push(`| ${c.formattedAddress || ''} | ${money(c.price)} | ${c.bedrooms ?? '?'}/${c.bathrooms ?? '?'} | ${sqft || '?'} | ${num(c.price) && sqft ? money(num(c.price) / sqft) : '?'} | ${c.yearBuilt ?? '?'} | ${c.distance != null ? num(c.distance).toFixed(2) + ' mi' : '?'} | ${status} | ${c.daysOnMarket ?? '?'} | ${c.correlation != null ? Math.round(num(c.correlation) * 100) + '%' : '?'} |`);
        });
    }
    return lines;
}

function localContextLines(p) {
    const all = (state.allProperties || []).filter(o => String(o.mls_id) !== String(p.mls_id) && num(o.price) > 0);
    let peers = all.filter(o => has(p.zip) && String(o.zip) === String(p.zip));
    let scope = `ZIP ${p.zip}`;
    if (peers.length < 4) {
        peers = all.filter(o => has(p.city) && String(o.city).toLowerCase() === String(p.city).toLowerCase());
        scope = String(p.city || 'the same city');
    }
    if (peers.length < 2) return ['Dibs is not tracking enough other listings near this one to give local context.'];

    const active = peers.filter(o => String(o.status || '').trim().toLowerCase() === 'active');
    const years = peers.map(o => num(o.year_built)).filter(y => y > 1800);
    const medianDom = Math.round(median(active.map(o => daysOnMarket(o) ?? 0)));
    const dom = daysOnMarket(p);
    const lines = [
        `Other listings Dibs is tracking in ${scope}: ${peers.length} (${active.length} active). These all match the buyer's saved MLS searches, so they are a slice of the market, not all of it.`,
        `- Median list price per finished sq ft: ${money(median(peers.map(psf)))} (this home: ${money(psf(p))})`,
        `- Median days on market among the active ones: ${medianDom || 'unknown'} (this home: ${dom ?? 'unknown'}${medianDom && dom ? `, about ${(dom / medianDom).toFixed(1)} times the median` : ''})`,
        years.length ? `- Year built: median ${Math.round(median(years))}, range ${Math.min(...years)} to ${Math.max(...years)} (this home: ${p.year_built || 'unknown'})` : ''
    ].filter(Boolean);

    const target = num(p.sqft_finished) || num(p.sqft_total);
    const nearest = peers.slice().sort((a, b) =>
        Math.abs((num(a.sqft_finished) || num(a.sqft_total)) - target) - Math.abs((num(b.sqft_finished) || num(b.sqft_total)) - target)).slice(0, 10);
    lines.push('', 'Closest in size:', '', '| Address | Status | Price | Sq ft | $/sq ft | Built | Days on market |', '| --- | --- | --- | --- | --- | --- | --- |');
    nearest.forEach(o => lines.push(`| ${o.address || ''} | ${o.status || ''} | ${money(o.price)} | ${num(o.sqft_finished) || num(o.sqft_total) || '?'} | ${psf(o) ? money(psf(o)) : '?'} | ${o.year_built || '?'} | ${daysOnMarket(o) ?? '?'} |`));
    return lines;
}

function buyerLines(p) {
    const lines = [];
    const tags = Array.isArray(p.tags) ? p.tags : [];
    if (has(p.user_notes)) lines.push(`- Buyer's notes: ${String(p.user_notes).trim()}`);
    if (tags.length) lines.push(`- Buyer's reaction tags: ${tags.join(', ')}`);
    if (has(p.realtor_notes)) lines.push(`- Buyer's questions for the realtor: ${String(p.realtor_notes).trim()}`);
    const mlsNotes = Array.isArray(p.mls_notes) ? p.mls_notes : [];
    mlsNotes.slice(0, 10).forEach(n => {
        const text = typeof n === 'string' ? n : (n && (n.text || n.note || n.body || n.message)) || '';
        if (has(text)) lines.push(`- Note on the MLS portal${n && n.author ? ` (${n.author})` : ''}: ${String(text).trim()}`);
    });
    return lines.length ? lines : ['The buyer has not recorded any notes on this listing.'];
}

function buildSystemPrompt(searchAvailable) {
    const research = searchAvailable
        ? `Use Google Search before you write. Look these up, in this order:
1. The listing's full price history since it was first listed: every list-price change with its date, from listing sites such as Zillow, Redfin, Realtor.com or Homes.com. This live history is the authority on price changes; the fact sheet deliberately leaves price history out.
2. The last recorded sale: date and price, from public records or the listing sites.
3. Whether the home has been offered for rent, or listed and withdrawn before.
4. The subdivision and builder, what the HOA covers, and any metro-district or special-district tax.
5. What competes with it nearby, including new construction, with real prices.
If a search comes up empty, say you could not find it. Never fill the gap with a guess.`
        : `You cannot search the web in this run. Work only from the fact sheet. Do not say or imply that you checked public records, listing sites or anything else. Do not quote any price, date, fee, sale or nearby development that is not in the fact sheet. Where the analysis needs something the fact sheet lacks (the full price history, what the seller paid, rental history, metro-district taxes), write "not checked" and put it in the verify list. The price changes in the fact sheet only cover the period this app has tracked the listing, so never describe them as the full price history.`;

    return `You are a sharp, candid buyer's-side real estate analyst. You are writing for a home buyer who is deciding whether this listing deserves a showing or an offer. Be specific and skeptical on the buyer's behalf; never write like a listing agent, and do not repeat the listing's marketing language as if it were fact.

You get a fact sheet from the buyer's own tracking app (Dibs). Treat its numbers as accurate, but remember that an automated comp value is only as good as the square footage behind it.

${research}

Write the analysis in Markdown. Every section starts with a "## " heading, in this order:

## Bottom line
Lead with the verdict in one sentence, then the single biggest concern and what the buyer should do next. Three sentences at most.

## Why it hasn't sold
Use this heading when the home has been listed well beyond the local median; make it the centerpiece of the analysis. Give the most likely reasons as a numbered list, strongest first, each tied to specific evidence. Start with the dated price history (launch price, each cut, how far apart) and what that pattern signals. If the home is still fresh, title the section "## Time on market" instead and keep it to a few sentences.

## Price and comps
Use the Dibs price score and comp table if present; if comps were not checked, say so plainly. Give the price per finished square foot and per above-grade square foot, and compare both with the comps and the other tracked listings. If the remarks describe the basement as unfinished, semi-finished or otherwise non-standard while the square footage counts it as finished, say so and discount the comp-based value and price score accordingly. If the price score says bargain but the home has sat far longer than its neighbours, do not take the score at face value: explain what buyers are seeing that the comp model is not.

## Seller's position
What they paid and when, a rough break-even after typical selling costs (about 5 to 6 percent), and how much room that leaves them to negotiate. If you do not have the purchase price, say so in one sentence and skip the arithmetic.

## The home itself
Layout, finish and condition flags you can infer from the remarks and the numbers (for example a non-standard basement, a second kitchen that may not be permitted, rental use, an odd bed/bath mix, a small lot). Tie in the buyer's own notes if there are any.

## Age and big-ticket items
Given the year built, which components are likely at or near end of life (roof, furnace, AC, water heater, windows) and a typical replacement cost for each. Credit anything the remarks say was recently replaced. Put the home's age in the context of the neighborhood's.

## HOA, taxes and carrying costs
The HOA fee and what it covers, any metro-district or special-district levy, the tax bill, and anything unusual.

## Neighborhood and competition
What the buyer could get instead at this price nearby, using the tracked listings and what you found.

## Negotiation angle
A reasoned offer range and which concessions to ask for (price, closing credits, rate buydown, repairs), tied to the evidence above, including the seller's break-even when known.

## Verify before you act
A short bullet list of the specific things to confirm with the realtor, the HOA, the county, or at a showing.

Rules:
- Keep numbers honest. State fact-sheet figures and anything you found as fact. Mark anything you are inferring or estimating in the sentence itself ("likely", "typically", "I could not confirm"). Never invent a price, date or fee.
- Missing from the fact sheet does not mean absent. Never write that there is no metro district, special assessment, rental restriction or similar unless you confirmed it.
- Any claim about what other homes or new builds cost must come from the fact sheet or from a source you found.
- If a section has nothing reliable to say, write one sentence saying what is unknown rather than padding it.
- Do not comment on the people who live in the area or on demographics; stick to the property, prices, costs and physical surroundings.
- Use short paragraphs and bullet lists, and at most two small tables. Aim for 700 to 1,100 words.
- Output only the Markdown analysis: no preamble, no closing offer of further help.`;
}

export function buildPropertyAnalysisPrompt(p, activity, searchAvailable = true) {
    const raw = rawMls(p);
    const remarks = String(raw.description || p.description || '').trim();
    const userPrompt = [
        `Today's date: ${isoDay(new Date())}`,
        '',
        '# Listing facts (from the MLS, via Dibs)',
        ...listingLines(p, activity, searchAvailable),
        '',
        '# Public remarks from the listing',
        remarks || '(none captured)',
        '',
        '# Comps and price score (from Dibs)',
        ...compsLines(p),
        '',
        '# Local context (from Dibs)',
        ...localContextLines(p),
        '',
        "# The buyer's own input",
        ...buyerLines(p),
        '',
        'Write the analysis now.'
    ].join('\n');
    return { systemPrompt: buildSystemPrompt(searchAvailable), userPrompt };
}

// ---- Gemini call --------------------------------------------------------------------------

async function callGemini(apiKey, model, systemPrompt, userPrompt, useSearch) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const body = {
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: { maxOutputTokens: 65536, temperature: 0.4 }
    };
    if (useSearch) body.tools = [{ google_search: {} }];

    let response;
    try {
        response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
            body: JSON.stringify(body)
        });
    } catch (err) {
        throw new Error(`Could not reach the Gemini API: ${err?.message || err}`);
    }

    if (!response.ok) {
        let message = `Gemini API error (${response.status})`;
        try {
            const errData = await response.json();
            if (errData.error?.message) message = errData.error.message;
        } catch (e) { /* keep the default message */ }
        const error = new Error(message);
        error.status = response.status;
        throw error;
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    const text = (candidate?.content?.parts || []).filter(part => !part.thought && typeof part.text === 'string').map(part => part.text).join('').trim();
    if (!text) throw new Error('Gemini returned an empty response. Try again.');

    const seen = new Set();
    const sources = [];
    (candidate?.groundingMetadata?.groundingChunks || []).forEach(chunk => {
        const uri = chunk?.web?.uri;
        if (!uri || !/^https?:\/\//i.test(uri) || seen.has(uri)) return;
        seen.add(uri);
        sources.push({ uri, title: String(chunk.web.title || 'Source').replace(/[\[\]]/g, '') });
    });
    return { text, sources, cutOff: candidate?.finishReason === 'MAX_TOKENS' };
}

async function fetchActivity(mlsId) {
    try {
        const data = await apiFetch(CONFIG.API_URL + '?action=get_property_activity&mls_id=' + encodeURIComponent(mlsId));
        return Array.isArray(data?.activity) ? data.activity : [];
    } catch (e) {
        return []; // the analysis is still useful without the recorded price changes
    }
}

/** Returns the finished Markdown for the listing. Throws with a user-readable message. */
export async function generatePropertyAnalysis(p) {
    const apiKey = getUsableGeminiKey();
    const model = getGeminiModel();
    if (!apiKey) throw new Error('Unlock or add your Gemini API key first.');

    const activity = await fetchActivity(p.mls_id);

    let result;
    let searched = true;
    let searchError = '';
    let searchQuota = false;
    try {
        const prompt = buildPropertyAnalysisPrompt(p, activity, true);
        result = await callGemini(apiKey, model, prompt.systemPrompt, prompt.userPrompt, true);
    } catch (err) {
        // Search grounding isn't on every key: Google only offers it on the paid tier for
        // Gemini 3 models. A request the API rejected (4xx) gets one retry without search, using
        // the prompt written for that case; anything else (network, 5xx) is reported as-is.
        if (!(err.status >= 400 && err.status < 500)) throw err;
        searched = false;
        // First sentence only: the API appends help links that add nothing in the note.
        searchError = String(err.message || '').replace(/[\r\n*_`\[\]"]+/g, ' ').replace(/\s+/g, ' ').trim()
            .split(/(?<=[.!?])\s/)[0].slice(0, 200);
        searchQuota = err.status === 429 || /quota|billing/i.test(searchError);
        const prompt = buildPropertyAnalysisPrompt(p, activity, false);
        result = await callGemini(apiKey, model, prompt.systemPrompt, prompt.userPrompt, false);
    }

    const stamp = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    const parts = [
        `*Written by Gemini (${model}) on ${stamp} from Dibs data${searched ? ' and a web search' : ''}. Verify anything you plan to act on.*`
    ];
    if (!searched) {
        parts.push('*Web search was not available for this run, so there is no live price history, prior sale price or other lookup here: this is a first pass from Dibs data only.'
            + (searchError ? ` Gemini's reason: ${searchError}` : '')
            + (searchQuota
                ? ' That is the free tier: it has no search allowance on Gemini 3 models, so the key needs a Google project with billing turned on.*'
                : ' Search on Gemini 3 models needs an API key on the paid tier (a project with billing turned on).*'));
    }
    parts.push(result.text);
    if (result.cutOff) parts.push('*The response was cut off before it finished. Regenerate to try again.*');
    if (result.sources.length) {
        parts.push('## Sources\n' + result.sources.slice(0, 12).map(s => `- [${s.title}](${s.uri})`).join('\n'));
    }
    return parts.join('\n\n');
}
