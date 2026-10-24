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
import { apiFetch, logClientEvent } from './api.js';
import { getCompScore } from './properties.js';
import { loadPaySettings, monthlyCost, currentRate } from './compare.js';

// One Gemini key for every nycto.ninja app (the model choice is per app). These are certforge's storage names and vault format
// (js/vault.js there) on purpose: the apps share an origin, so they share localStorage, and a
// key saved in either app works in the other. Keep the two in step if the format ever changes.
const VAULT_STORAGE = 'certforge_ai_gemini_vault_v1';             // localStorage: { salt, iv, cipherText } (base64)
const SESSION_KEY_STORAGE = 'certforge_ai_gemini_session_key_v1'; // sessionStorage: key unlocked for this tab
const LEGACY_KEY_STORAGE = 'certforge_ai_gemini_key_v1';          // localStorage: old unencrypted key (read only)
const MODEL_STORAGE = 'dibs_ai_gemini_model_v1';                  // Dibs-only: certforge's quiz helpers want a cheaper model than this does
const VAULT_PBKDF2_ITERATIONS = 200000;                           // certforge's AI_VAULT_PBKDF2_ITERATIONS
const schemaRejectedModels = new Set(); // models that answered HTTP 400 to a responseSchema this page load
let jsonSeedBump = 0; // raised each time a JSON reply could not be read; see generateGeminiJson()
const GEMINI_JSON_SEED = 20261005; // fixed, so re-running the same ranking prompt tends to give the same answer
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

// Comps for fair value come only from RentCast (the buyer's rule): its off-market homes within
// this share of the subject's finished sq ft. Actives are shown as competition, never as comps.
const COMP_SQFT_TOLERANCE = 0.20;

// includeScore: the AI Ranking fact sheet keeps RentCast's automated value and the price score.
// The single-home analysis leaves both out (Oct 2026): Gemini kept "reconciling" its comp-grid
// fair value toward RentCast's number, pulling it $10K-$70K low on 5 of 6 homes.
function compsLines(p, { includeScore = true } = {}) {
    const score = getCompScore(p);
    if (!score) return ['RentCast comps have not been checked in Dibs for this listing, so there is no comp pool. Do not estimate a fair value: write "not found — run Check Comps in Dibs first" for it and for the suggested offer range, and do not pick comps of your own.'];
    const lines = includeScore ? [
        `- Dibs price score: ${score.score}/100 (higher is a better price for the buyer; 50 means in line with comps). List price is ${score.pctText}.`,
        `- Comp-based value: ${money(score.estimate)}${num(p.comp_range_low) && num(p.comp_range_high) ? `, likely range ${money(p.comp_range_low)} to ${money(p.comp_range_high)}` : ''}.`,
        `- Source: RentCast automated valuation${has(p.comp_fetched_at) ? `, checked ${String(p.comp_fetched_at).slice(0, 10)}` : ''}. These are listing-based comps, not appraiser-selected sold comps.`
    ] : [`- Comps from RentCast${has(p.comp_fetched_at) ? `, pulled ${String(p.comp_fetched_at).slice(0, 10)}` : ''}. Fair value comes only from the comp grid you build from the comp pool below; no other valuation is given here, so do not look one up or blend one in.`];
    const comps = (Array.isArray(p.comps) ? p.comps : [])
        .slice().sort((a, b) => (num(b.correlation) || 0) - (num(a.correlation) || 0));
    // Size-match on RentCast's own square footage for this home: RentCast reports one county-record
    // figure (sometimes including an unfinished basement), so comparing its comps to Dibs' finished
    // sq ft mixes bases (Oct 2026: 5344 S Haleyville is 4,825 in RentCast vs 3,267 finished in Dibs).
    let subject = p.comp_subject;
    if (typeof subject === 'string') { try { subject = JSON.parse(subject); } catch (e) { subject = null; } }
    const target = num(subject && subject.squareFootage) || num(p.sqft_total) || num(p.sqft_finished);
    const isActive = c => String(c.status || '').toLowerCase() === 'active';
    const sizeOk = c => !target || !num(c.squareFootage) || Math.abs(num(c.squareFootage) - target) / target <= COMP_SQFT_TOLERANCE;
    const row = c => {
        const sqft = num(c.squareFootage);
        const status = isActive(c) ? 'Active' : `Off market${has(c.removedDate) ? ' ' + String(c.removedDate).slice(0, 10) : ''}`;
        return `| ${c.formattedAddress || ''} | ${money(c.price)} | ${c.bedrooms ?? '?'}/${c.bathrooms ?? '?'} | ${sqft || '?'} | ${num(c.price) && sqft ? money(num(c.price) / sqft) : '?'} | ${c.yearBuilt ?? '?'} | ${c.distance != null ? num(c.distance).toFixed(2) + ' mi' : '?'} | ${status} | ${c.daysOnMarket ?? '?'} | ${c.correlation != null ? Math.round(num(c.correlation) * 100) + '%' : '?'} |`;
    };
    const head = ['| Address | RentCast price | Bd/Ba | Sq ft | $/sq ft | Built | Distance | Status | Days on market | Match |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |'];
    const pool = comps.filter(c => !isActive(c) && sizeOk(c));
    const competing = comps.filter(isActive);
    const tooDifferent = comps.filter(c => !isActive(c) && !sizeOk(c));

    lines.push('', `## Comp pool (RentCast, off-market, within ${Math.round(COMP_SQFT_TOLERANCE * 100)}% of this home's ${target || '?'} sq ft as RentCast records it; best match first)`);
    if (pool.length) {
        lines.push('These are the ONLY homes that may be used as comps or in the fair value. "RentCast price" is the last asking price when the listing came down, not a confirmed sale price. RentCast\'s "Sq ft" is a county-record figure that may include an unfinished basement, so it is only used here to pick similar-sized homes: for the $/sq ft math, look up each comp\'s above-grade finished square footage and its finished basement square footage separately.', '', ...head, ...pool.map(row));
    } else {
        lines.push('None: RentCast returned no off-market homes close enough in size. Do not estimate a fair value; say so, and suggest re-running Check Comps later.');
    }
    if (competing.length) {
        lines.push('', '## Competing active listings (RentCast) — for context only, never comps', '', ...head, ...competing.map(row));
    }
    if (tooDifferent.length) {
        lines.push('', `Left out of the comp pool for size (more than ${Math.round(COMP_SQFT_TOLERANCE * 100)}% off): ${tooDifferent.map(c => `${c.formattedAddress || '?'} (${num(c.squareFootage) || '?'} sq ft)`).join('; ')}.`);
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
        `Other listings Dibs is tracking in ${scope}: ${peers.length} (${active.length} active). These all match the buyer's saved MLS searches, so they are a slice of the market, not all of it. They are asking prices for market context only: never use them as comps or in the fair value.`,
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

/**
 * What this buyer must have. The listing data rarely states either one, so the prompt asks the
 * model to dig for evidence (listing-site feature fields, floor plans, photos the buyer attaches)
 * and grade how sure it is, rather than assume.
 */
// The buyer's own targets (Oct 2026, from Josh). These drive the verdict, Pros/Cons and the
// negotiation advice; they never change fair value, which is the market's number.
const BUYER_TARGETS = {
    maxPrice: 750000,
    psfTargetLow: 200, psfTargetHigh: 225,   // $ per finished sq ft
    monthlyIdeal: 4000, monthlyMax: 4200,    // new home's P&I + tax + HOA
    maxAnnualTax: 5000,
    maxHoaMonthly: 100,
    fixerPriceCeiling: 600000                // needing updates is easier to accept below this
};

function buyerProfileLines(p) {
    const t = BUYER_TARGETS;
    const price = num(p.price);
    const finished = num(p.sqft_finished) || num(p.sqft_total);
    const psf = price && finished ? Math.round(price / finished) : null;
    const lines = [
        '- Who: one person living alone. The buyer will sell his current home with a bridge loan when the market picks up, around April, so he carries both homes until then.',
        `- Budget: ${money(t.maxPrice)} is the absolute top.`,
        `- Price target: $${t.psfTargetLow} to $${t.psfTargetHigh} per finished sq ft or less. This home: ${psf ? `$${psf} per finished sq ft (${money(price)} / ${finished} sq ft from the MLS)` : 'unknown'}. Above the target, a Tour or Offer verdict needs a stated reason: either the home is a near-perfect fit, or there is concrete evidence the seller will come down (cuts, long days on market, a failed contract, large equity, vacant). Name which.`,
        '- Basement: unfinished is fine (storage only). It is never a con by itself. It IS a con if the listing counts unfinished space in its finished sq ft: then say so, recompute $ per finished sq ft on the true finished space, and judge that against the price target.'
    ];
    let pay = null;
    try { pay = monthlyCost(p, loadPaySettings()); } catch (e) { pay = null; }
    if (pay) {
        const s = loadPaySettings();
        const rate = currentRate(s);
        lines.push(`- Monthly cost for this home (Dibs, ${rate}% 30-yr, ${s.downAmount != null ? money(s.downAmount) + ' down' : (Number(s.downPct) || 0) + '% down'}): ${money(pay.total)} = ${money(pay.pi)} P&I + ${money(pay.tax)} tax + ${money(pay.hoa)} HOA. Target: ${money(t.monthlyIdeal)} or less is ideal, ${money(t.monthlyMax)} is the most he wants. Use this figure; do not recompute the payment. Put it in Bottom line or Cons when it is over the target.`);
    } else {
        lines.push(`- Monthly cost: Dibs has no rate set, so it is not computed. His target is ${money(t.monthlyIdeal)} or less a month (P&I + tax + HOA), ${money(t.monthlyMax)} at most; say that the buyer should check it.`);
    }
    lines.push(
        `- Taxes: under ${money(t.maxAnnualTax)} a year is the goal (this home: ${num(p.annual_tax) ? money(p.annual_tax) : 'unknown'}).`,
        `- HOA: as little as possible, under ${money(t.maxHoaMonthly)} a month; no HOA at all is a real plus. A metro district is not a deal-breaker by itself: judge it through the total tax + HOA cost.`,
        '- Deal-breaker: backing onto or directly beside a busy road, highway, rail line or high-voltage power lines. If the map, photos or remarks show it, the verdict is Pass.',
        `- Condition: updating is acceptable when the price reflects it. Below about ${money(t.fixerPriceCeiling)} needed work is easier to accept because it leaves money for renovations; above that, count it more heavily.`,
        '- Garage use: a workshop with tools, plus storage. Depth, room for a workbench and electrical (outlets, 240V) matter, not just the number of spaces.',
        '- Pluses: a bigger lot (with low-maintenance landscaping preferred over a lot of lawn), backing to open space or a greenbelt, a dedicated office or den, an open floor plan.',
        '- Bedrooms: 3 or more is plenty. Extra bedrooms add nothing for this buyer, so never count them as a pro.',
        '- These targets shape the verdict, Pros, Cons, Bottom line and Negotiation angle only. They never change the fair value.'
    );
    return lines;
}

const BUYER_MUST_HAVES = [
    {
        label: 'Garage',
        need: 'Garage space for three cars, or an extra-wide 2-car garage (roughly 24 ft wide or more). The buyer needs the space, not a third door: a tandem 3-car, a 3-car behind two doors, or one wide door all qualify. Only a standard 2-car (about 20 ft wide or less, roughly 400 to 450 sq ft) fails.',
        lookFor: 'listing-site feature fields (garage spaces, "Oversized", "Tandem", garage dimensions or square footage, "workshop"), the remarks, a floor plan, and garage photos (overall width and depth, not the number of doors)'
    },
    {
        label: 'Privacy fence',
        need: 'A 6 ft privacy fence around the backyard (solid wood, vinyl or composite). Split-rail, chain-link, wrought iron or a 4 ft fence does not qualify.',
        lookFor: 'listing-site fencing fields ("Fencing: Full / Privacy / Wood"), the remarks, and backyard photos (fence height against the house, doors or people; whether it is solid or see-through; whether it encloses the whole yard)'
    }
];

function mustHaveLines(p) {
    // The buyer only marks a home Favorite or Consideration after confirming the fence himself from photos,
    // so for those the general fence requirement is replaced by the confirmation (no conflicting lines).
    const fenceConfirmed = Number(p.favorite) === 1 || Number(p.possibility) === 1;
    const lines = BUYER_MUST_HAVES.filter(m => !(fenceConfirmed && m.label === 'Privacy fence'))
        .map(m => `- ${m.label}: ${m.need} Evidence to look for: ${m.lookFor}.`);
    if (fenceConfirmed) {
        lines.push('- Privacy fence: CONFIRMED by the buyer from his own review of the listing photos (a 6 ft privacy fence is required before he marks a home a Favorite or Consideration). Report it as "Yes (confirmed by buyer)", do not question it, and leave it out of the verify list.');
    }
    lines.push(`- What Dibs already has: ${p.garage_spaces || '?'} garage spaces on the MLS record (3 or more spaces qualifies, tandem included; a 2-space garage needs evidence it is oversized).`);
    if (has(p.facing)) lines.push(`- Driveway faces: ${p.facing} (recorded by the buyer; south-facing helps snow melt).`);
    else lines.push('- Driveway direction: not recorded. The buyer prefers a south-facing driveway for snow melt; mention it if a source or photo shows it, otherwise leave it out.');
    return lines;
}

function buildSystemPrompt(searchAvailable) {
    const research = searchAvailable
        ? `Use Google Search before you write. Look these up, in this order:
1. The listing's full price history since it was first listed: every list-price change with its date, from listing sites such as Zillow, Redfin, Realtor.com or Homes.com. This live history is the authority on price changes; the fact sheet deliberately leaves price history out.
2. The listing's "facts and features" on those sites, for the buyer's must-haves: garage type, size or dimensions, "oversized" or "tandem", and fencing type and height.
3. The last recorded sale: date and price, from public records or the listing sites.
4. Whether the home has been offered for rent, or listed and withdrawn before.
5. For every home in the fact sheet's "Comp pool" (and only those): whether it actually sold, the sold price and date, the garage (number of spaces, oversized or tandem) and whether the basement is finished. Do not search for or use any other comps.
6. The subdivision and builder, what the HOA covers, and any metro-district or special-district tax.
If a search comes up empty, say you could not find it. Never fill the gap with a guess.`
        : `You cannot search the web in this run. Work only from the fact sheet. Do not say or imply that you checked public records, listing sites or anything else. Do not quote any price, date, fee, sale or nearby development that is not in the fact sheet. Where the analysis needs something the fact sheet lacks (the full price history, what the seller paid, rental history, metro-district taxes, sold comps), write "not checked" and put it in the verify list. The price changes in the fact sheet only cover the period this app has tracked the listing, so never describe them as the full price history.`;

    return `You are a sharp, candid buyer's-side real estate analyst. You are writing for a home buyer who is deciding whether this listing deserves a showing or an offer. Be specific and skeptical on the buyer's behalf, but fair: give real credit where the home is strong. Never write like a listing agent, and do not repeat the listing's marketing language as if it were fact.

You get a fact sheet from the buyer's own tracking app (Dibs). Treat its numbers as accurate, but remember that an automated comp value is only as good as the square footage behind it. If the buyer attached photos or a floor plan, use them, especially for the must-haves, and say which image showed what.

${research}

Write the analysis in Markdown. Use exactly these "## " headings, in this order, so analyses of different homes can be compared side by side:

## At a glance
A two-column table (Item | Value) with exactly these rows, in this order: Verdict (one of Tour, Offer, Watch, Pass), Fair value estimate, Suggested offer range, Days on market, Price change since first listed (dollars and percent, with the number of cuts), Seller paid (price and date), Garage, Privacy fence. For Garage and Privacy fence give Yes, Likely, Unclear or No plus three to six words of evidence. Write "not found" for anything you could not establish. A must-have that is a clear No should normally make the verdict Pass.

## Bottom line
The verdict and why in one sentence, then the single biggest concern and what the buyer should do next. Three sentences at most.

## Must-haves
One short paragraph per must-have: Yes, Likely, Unclear or No; the specific evidence (which listing field, remark, floor plan or photo, with the source); and how sure you are. If it is Unclear, say exactly what to ask the listing agent or look at in the photos to settle it.

## Pros
Three to six bullets, strongest first, each specific to this home (not generic to the area).

## Cons
Three to six bullets, most serious first, each tied to evidence.

## Why it hasn't sold
Use this heading only when the home has been listed well beyond the local median. Give the most likely reasons as a numbered list, strongest first, each tied to specific evidence. Start with the dated price history (launch price, each cut, how far apart) and what that pattern signals. If the home is still fresh, title the section "## Time on market" instead and keep it to two or three sentences: do not invent reasons it has not sold.

## Price and comps
Comps come only from the fact sheet's "Comp pool" (RentCast). Never add a comp of your own, and never use the competing active listings or the other Dibs listings as comps. Never list the subject home as a comp, and never give a comp this home's MLS number.
First state this home's above-grade finished sq ft and its finished basement sq ft (0 if unfinished or none), with the source. Every comp must be measured the same way: above-grade finished sq ft only, never a total that includes the basement.
A table of every home in the comp pool, in the fact sheet's order: Address | Sold? | Sold date | Sold price | Above-grade finished sq ft | $/above-grade sq ft | Basement (finished sq ft, or "unfinished") | Garage | Source. Use the confirmed sold price where you found one and name its source; if you could not confirm a sale, write "not confirmed" and leave that home out of the math (say so under the table). Then give this home's price per finished and per above-grade square foot against the confirmed sales. You may mention the competing active listings in one sentence as competition, but not in the math.
Before the math, drop any confirmed comp whose above-grade finished sq ft is more than 25% larger or smaller than this home's, and list the dropped ones under the table with their above-grade size; RentCast matched on total size, which can pair a home with a large unfinished basement against much larger finished homes. If fewer than two remain, there is no fair value (see step 3).
Work out the fair value estimate from the confirmed sales alone, the way an appraiser does: adjust each comp to this home, one comp at a time, then take the median. Show it as a table plus a short list.
1. Pick the adjustment rates first and state each one with its basis, before applying any: a $ per above-grade finished sq ft rate for size differences (use a typical marginal rate for this area, well below the comps' average $/sq ft, since extra space adds less than average space), a $ per sq ft rate for finished basement space, and flat amounts for garage spaces and for documented condition or upgrade differences. Use the same rates for every comp.
2. An adjustment grid: one row per confirmed comp with its sold price, then one column per adjustment (above-grade size difference, basement finish difference, garage, condition), then the adjusted price. Each cell is that comp's difference from this home times the stated rate: if the comp is better, adjust its price down; if worse, up. Adjust for a garage or basement difference only when you found that comp's garage or basement; "unknown" is not a difference. Adjust only for things the market pays for. The buyer's own must-haves and preferences (driveway direction, fence height, garage width beyond a normal 3-car) never change fair value; they belong in Must-haves, Pros, Cons and the verdict. Never add a lump "market" or "size" adjustment that is not one of the rated columns.
3. Fair value = the median of the adjusted comp prices, rounded to the nearest $5,000. This number goes in the At a glance table, exactly as computed. There is no step after this: no reconciling, weighting, blending, second look or extra deduction against any other number, comp or opinion. If something about this home is not captured by the grid, it belongs in Cons or the Negotiation angle, never in fair value. If fewer than two sales are confirmed, do not estimate a fair value: write "not enough confirmed RentCast sales" in its place and in the At a glance table.
4. Sanity check: name the single most similar comp (fewest and smallest adjustments) and its adjusted price. If fair value is more than 5% away from it, explain why in one or two sentences.
Do not use this home's list price, its price cuts, how long it has been listed or the seller's equity anywhere in steps 1 to 3. Fair value must be what the same evidence supports at any list price: if the list price changed and the comps did not, the fair value does not change either. Only after you have the number, compare it to the list price and say whether the home is priced above, at or below it. Being at or below fair value is a perfectly good result: say so plainly instead of hunting for a reason to go lower. If the remarks describe the basement as unfinished, semi-finished or otherwise non-standard while the square footage counts it as finished, say so and discount the comp-based value accordingly. If fair value comes out well above the list price but the home has sat far longer than its neighbours or lost a contract, say plainly that the market is not agreeing with the comps and give the most likely reasons; do not change the fair value for it.

## Seller's position
What they paid and when, a rough break-even after typical selling costs (about 5 to 6 percent), and how much room that leaves them to negotiate. If you do not have the purchase price, say so in one sentence and skip the arithmetic.

## Age and big-ticket items
Only the components the listing does not say were replaced and that are likely at or near end of life for the year built, each with a typical replacement cost. Credit anything the remarks say is new. Keep it to a short list; skip generic advice.

## HOA, taxes and carrying costs
The HOA fee and what it covers, any metro-district or special-district levy, the tax bill, and anything unusual.

## Negotiation angle
A reasoned offer range and which concessions to ask for (price, closing credits, rate buydown, repairs), tied to the evidence above, including the seller's break-even when known. Build the range around the fair value from "Price and comps", not around the list price. Market conditions such as days on market and the seller's equity may move the opening offer, but say by how much and why, and never present that as a change to fair value. If the list price is already at or below fair value, say that offering at or near list is reasonable. The suggested offer range must agree with what you write: if you say offering near list is reasonable, the range must reach the list price. Weigh the buyer's targets (price per finished sq ft, monthly cost) and any concrete seller motivation here.

## Verify before you act
A short bullet list of the specific things to confirm with the realtor, the HOA, the county, or at a showing. Include the garage width and fence height whenever either is not a clear Yes.

Rules:
- Do not be biased low or high. The buyer needs an accurate number, not a discount for its own sake: an estimate pushed below what the comps support is as wrong as one pushed above it.
- Keep numbers honest. State fact-sheet figures and anything you found as fact. Mark anything you are inferring or estimating in the sentence itself ("likely", "typically", "I could not confirm"). Never invent a price, date, fee or comp.
- Missing from the fact sheet does not mean absent. Never write that there is no metro district, special assessment, rental restriction or similar unless you confirmed it. Likewise never call a garage oversized or a fence 6 ft without evidence.
- Any claim about what other homes or new builds cost must come from the fact sheet or from a source you found.
- If a section has nothing reliable to say, write one sentence saying what is unknown rather than padding it.
- Do not comment on the people who live in the area or on demographics; stick to the property, prices, costs and physical surroundings.
- Use short paragraphs and bullet lists. Aim for 800 to 1,300 words.
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
        '# Comps (from Dibs)',
        ...compsLines(p, { includeScore: false }),
        '',
        '# Local context (from Dibs)',
        ...localContextLines(p),
        '',
        "# The buyer's must-haves",
        ...mustHaveLines(p),
        '',
        "# The buyer's targets and preferences",
        ...buyerProfileLines(p),
        '',
        "# The buyer's own input",
        ...buyerLines(p),
        '',
        'Write the analysis now.'
    ].join('\n');
    return { systemPrompt: buildSystemPrompt(searchAvailable), userPrompt };
}

/**
 * The same prompt as generatePropertyAnalysis(), as one block of text to paste into the Gemini
 * app (which searches the web on the free tier and accepts attached photos). No API key needed.
 */
export async function buildCopyablePrompt(p) {
    const activity = await fetchActivity(p.mls_id);
    const { systemPrompt, userPrompt } = buildPropertyAnalysisPrompt(p, activity, true);
    return `${systemPrompt}\n\n---\n\n${userPrompt}`;
}

// ---- Gemini call --------------------------------------------------------------------------

async function callGemini(apiKey, model, systemPrompt, userPrompt, useSearch, extraConfig = {}) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const body = {
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: { maxOutputTokens: 65536, temperature: 0.4, ...extraConfig }
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
    return { text, sources, cutOff: candidate?.finishReason === 'MAX_TOKENS', finishReason: candidate?.finishReason || '' };
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

// ---- Building blocks for the multi-home ranking (js/aiRank.js) -----------------------------

const RAW_SKIP_KEYS = /photo|image|gallery|thumb|url|href|html|description|remarks|latitude|longitude|^lat$|^lng$|^lon$/i;

/** Every filled-in MLS field that isn't already a named line on the fact sheet, flattened. */
function otherMlsLines(p, maxChars) {
    const lines = [];
    let used = 0;
    const walk = (value, path, depth) => {
        if (used >= maxChars || depth > 3 || value === null || value === undefined) return;
        if (Array.isArray(value)) {
            const flat = value.filter(v => v !== null && typeof v !== 'object' && has(v)).map(String);
            if (flat.length) walk(flat.join(', '), path, depth);
            return;
        }
        if (typeof value === 'object') {
            Object.keys(value).forEach(key => { if (!RAW_SKIP_KEYS.test(key)) walk(value[key], path ? `${path}.${key}` : key, depth + 1); });
            return;
        }
        if (!has(value) || !path) return;
        const line = `- ${path.replace(/_/g, ' ')}: ${String(value).replace(/\s+/g, ' ').trim().slice(0, 300)}`;
        used += line.length;
        if (used <= maxChars) lines.push(line);
    };
    walk(rawMls(p), '', 0);
    return lines;
}

/**
 * One home's fact sheet for a prompt that compares several homes: the same listing, comps and
 * buyer lines the single-home analysis uses (without the per-comp table), every other filled-in
 * MLS field, and the AI Analysis already saved on the card, trimmed to analysisBudget characters.
 */
export function buildRankingFactSheet(p, analysisBudget = 8000) {
    const raw = rawMls(p);
    const remarks = String(raw.description || p.description || '').replace(/\s+/g, ' ').trim();
    const comps = compsLines(p);
    const compsEnd = comps.indexOf('');
    const review = p.hidden ? 'disliked / hidden' : (p.favorite ? 'favorite' : (num(p.possibility) === 1 ? 'possibility' : 'not reviewed'));
    // The saved write-up's link list is noise here, and its lookups are already in the prose.
    let analysis = String(p.ai_analysis || '').replace(/\n##\s+Sources[\s\S]*$/i, '').trim();
    const trimmed = analysis.length > analysisBudget;
    if (trimmed) analysis = analysis.slice(0, analysisBudget);
    const other = otherMlsLines(p, 2500);

    return [
        ...listingLines(p, [], false),
        `- Buyer's review status: ${review}${num(p.rating) ? `, rated ${p.rating} of 5` : ''}`,
        '',
        '### Public remarks',
        remarks ? remarks.slice(0, 1800) : '(none captured)',
        '',
        '### Comps and price score',
        ...(compsEnd === -1 ? comps : comps.slice(0, compsEnd)),
        '',
        "### Buyer's own input",
        ...buyerLines(p),
        ...(other.length ? ['', '### Other MLS fields on file', ...other] : []),
        '',
        '### AI analysis saved on this home in Dibs',
        analysis ? analysis + (trimmed ? '\n[trimmed for length]' : '') : '(none saved for this home)'
    ].join('\n');
}

let lastJsonIssue = null; // why the most recent parseJsonObject() call failed; see generateGeminiJson()

/** True when the quote at text[i] ends a JSON string, going by what follows it. */
function quoteClosesString(text, i) {
    let j = i + 1;
    while (j < text.length && /\s/.test(text[j])) j++;
    const next = text[j];
    if (next === undefined || next === '}' || next === ']' || next === ':') return true;
    if (next !== ',') return false;
    // After a comma, a real string end is followed by the next key or value; a comma that is
    // just punctuation inside the sentence is followed by more words.
    j++;
    while (j < text.length && /\s/.test(text[j])) j++;
    return /^(?:["{\[\d-]|true\b|false\b|null\b)/.test(text.slice(j, j + 6));
}

/**
 * Copies the first complete {...} out of text, starting at `start`, escaping raw line breaks and
 * tabs inside strings. `lenient` also repairs what Gemini most often gets wrong in long prose:
 * a double quote inside a string that was not escaped (an inch mark, a quoted phrase), a
 * backslash before a character JSON has no escape for, and stray control characters.
 * Returns null when the object never closes.
 */
function scanJsonObject(text, start, lenient) {
    let out = '', depth = 0, inString = false;
    for (let i = start; i < text.length; i++) {
        const ch = text[i];
        if (inString) {
            if (ch === '\\') {
                const next = text[i + 1];
                if (next === undefined) break;
                out += (lenient && !'"\\/bfnrtu'.includes(next)) ? next : ch + next;
                i++;
                continue;
            }
            if (ch === '"') {
                if (lenient && !quoteClosesString(text, i)) { out += '\\"'; continue; }
                inString = false;
                out += ch;
                continue;
            }
            out += ch === '\n' ? '\\n' : ch === '\r' ? '\\r' : ch === '\t' ? '\\t' : (lenient && ch < ' ') ? ' ' : ch;
            continue;
        }
        out += ch;
        if (ch === '"') inString = true;
        else if (ch === '{' || ch === '[') depth++;
        else if ((ch === '}' || ch === ']') && --depth === 0) return out;
    }
    return null;
}

/**
 * Reads the first complete JSON object out of a model reply. Tolerates what Gemini gets wrong in practice:
 * code fences, chatter before or after, a second copy of the object, raw line breaks inside strings,
 * trailing commas, and (on a second, lenient pass) unescaped quotes and bad escapes inside strings. Returns null when there is no complete object (for example the reply stopped part-way).
 */
function parseJsonObject(raw) {
    lastJsonIssue = null;
    const text = String(raw || '').replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
    const start = text.indexOf('{');
    if (start < 0) { lastJsonIssue = { reason: 'no_object' }; return null; }
    let issue = null;
    // Strict first, so a reply that is already valid JSON is never touched by the repairs.
    for (const lenient of [false, true]) {
        const out = scanJsonObject(text, start, lenient);
        if (out === null) { issue = issue || { reason: 'incomplete' }; continue; }
        for (const candidate of [out, out.replace(/,(\s*[}\]])/g, '$1')]) {
            try {
                const data = JSON.parse(candidate);
                if (data && typeof data === 'object') return data;
            } catch (e) {
                if (!issue || issue.reason === 'incomplete') {
                    const pos = Number((String(e.message).match(/position (\d+)/) || [])[1]);
                    issue = { reason: 'syntax', error: String(e.message).slice(0, 200) };
                    if (Number.isFinite(pos)) issue.near = candidate.slice(Math.max(0, pos - 120), pos + 120);
                }
            }
        }
    }
    lastJsonIssue = issue || { reason: 'unknown' };
    return null;
}

/**
 * One no-search Gemini request that must answer with a single JSON object. Throws with a readable message.
 * The seed is fixed so the same prompt tends to give the same answer. An unreadable reply moves to the next
 * seed (and stays there for this page load), because repeating the same seed would repeat the same bad reply;
 * it is retried once here before giving up.
 */
export async function generateGeminiJson(systemPrompt, userPrompt, schema = null) {
    const apiKey = getUsableGeminiKey();
    const model = getGeminiModel();
    if (!apiKey) throw new Error('Unlock or add your Gemini API key first.');
    let finishReason = '';
    for (let attempt = 0; attempt < 2; attempt++) {
        // With a schema Gemini is held to that exact shape while it writes, which is what stops
        // malformed JSON at the source. A model that refuses the schema (HTTP 400) is asked again
        // without it, and not offered one again on this page load.
        const useSchema = !!schema && !schemaRejectedModels.has(model);
        const config = { responseMimeType: 'application/json', temperature: 0.3, seed: GEMINI_JSON_SEED + jsonSeedBump };
        if (useSchema) config.responseSchema = schema;
        let result;
        try {
            result = await callGemini(apiKey, model, systemPrompt, userPrompt, false, config);
        } catch (err) {
            if (useSchema && err.status === 400) {
                schemaRejectedModels.add(model);
                logClientEvent('warn', 'Gemini refused the JSON schema; retrying without it', { model, error: String(err.message || '').slice(0, 300) });
                attempt--;
                continue;
            }
            throw err;
        }
        if (result.cutOff) throw new Error('Gemini ran out of room before it finished. Narrow the filters to fewer homes and try again.');
        const data = parseJsonObject(result.text);
        if (data) return { data, model };
        jsonSeedBump++;
        finishReason = result.finishReason || '';
        const issue = lastJsonIssue || {};
        console.warn(`[Dibs] Gemini reply was not readable JSON (attempt ${attempt + 1}, finishReason ${finishReason || 'none'}, ${result.text.length} chars, ${issue.reason || 'unknown'}). Start and end of the reply:`, result.text.slice(0, 1500), '...', result.text.slice(-1500));
        // Same thing to the event log, with the spot the parser choked on, so a failure can be
        // diagnosed later without the browser console it happened in.
        logClientEvent('warn', `Gemini JSON reply was not readable (attempt ${attempt + 1} of 2): ${issue.reason || 'unknown'}`, {
            model, schema: useSchema, finish_reason: finishReason || 'none', chars: result.text.length,
            parse_error: issue.error || null, near_error: issue.near || null,
            reply_start: result.text.slice(0, 300), reply_end: result.text.slice(-300)
        });
    }
    if ((lastJsonIssue || {}).reason === 'incomplete') {
        throw new Error(`Gemini's reply stopped part-way through${finishReason ? ` (finish reason: ${finishReason})` : ''}. Try again, or narrow the filter to fewer homes.`);
    }
    throw new Error('Gemini sent back a response Dibs could not read. Try again.');
}
