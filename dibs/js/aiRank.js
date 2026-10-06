/**
 * AI Ranking: the toolbar button beside the view switcher. Sends every home in the current
 * filter to Gemini in one request and shows which is the best purchase, and why, in its own modal.
 *
 * Each home goes in as a fact sheet built from everything Dibs holds for it: the MLS fields, the
 * public remarks, the comps price score, the buyer's notes, tags and review status, and the AI
 * Analysis saved on the card. There is no web search in this call; the per-home lookups already
 * live in those saved analyses. Uses the same PIN-locked Gemini key as the card analysis, and
 * only ever runs from the button. Finished rankings are kept in this browser's local storage (the
 * last few, per signed-in user), so the same homes and priorities show the saved ranking again,
 * even after a reload, until "rank again" is used.
 */
import { state } from './state.js';
import { cleanDisplayAddress, escapeHtml, getCompScore, NO_PHOTO_IMG } from './properties.js';
import { showToast } from './toast.js';
import { logClientEvent } from './api.js';
import {
    buildRankingFactSheet, generateGeminiJson, getGeminiKeyState, getGeminiModel, unlockGeminiVault
} from './geminiAnalysis.js';

const MAX_HOMES = 30;             // one request; past this the answer gets shallow and slow
const PROMPT_ANALYSIS_CHARS = 240000; // shared budget for the saved AI analyses across all homes
const PRIORITIES_STORAGE = 'dibs_ai_rank_priorities_v1';
const RESULTS_STORAGE = 'dibs_ai_rank_results_v1';
const MAX_SAVED_RESULTS = 5;      // most recent first; the oldest drops off
const VERDICTS = ['Top pick', 'Strong contender', 'Worth a look', 'Long shot', 'Pass'];

let view = 'idle';      // idle | unlock | nokey | toomany | loading | result | error
let pending = [];       // homes the next run will use
let running = null;     // { signature, count, startedAt } while a request is out
let last = null;        // { signature, homes, data, model, at, priorities, filteredTotal }
let errorMessage = '';
let timer = null;

const esc = v => escapeHtml(String(v ?? ''));
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const money = v => num(v) ? '$' + Math.round(num(v)).toLocaleString('en-US') : '';
// Gemini sometimes fills a "list of sentences" field with objects; flatten those to their text, not "[object Object]".
const flat = v => v == null ? '' : Array.isArray(v) ? v.map(flat).filter(Boolean).join(', ')
    : typeof v === 'object' ? Object.values(v).map(flat).filter(Boolean).join(': ') : String(v);
const text = (v, max = 600) => flat(v).replace(/\*\*|`/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
const list = (v, max) => (Array.isArray(v) ? v : []).map(item => text(item, 300)).filter(Boolean).slice(0, max);

function getPriorities() {
    try { return (localStorage.getItem(PRIORITIES_STORAGE) || '').trim(); } catch (e) { return ''; }
}

function setPriorities(value) {
    try {
        if (value) localStorage.setItem(PRIORITIES_STORAGE, value);
        else localStorage.removeItem(PRIORITIES_STORAGE);
    } catch (e) { /* priorities just won't be remembered */ }
}

const signatureOf = (homes, priorities) => homes.map(p => String(p.mls_id)).sort().join(',') + '|' + priorities;

// ---- Prompt -------------------------------------------------------------------------------

const SYSTEM_PROMPT = `You are a sharp, candid buyer's-side real estate analyst. A home buyer has narrowed a search to a shortlist and wants to know which home is the best purchase, in what order the rest follow, and why.

You get one fact sheet per home from the buyer's own tracking app (Dibs). Treat its numbers as accurate. Some homes include an "AI analysis saved on this home": an earlier write-up that may contain looked-up price history, prior sale and neighborhood findings. Use it as evidence, but weigh it against the hard numbers and do not simply repeat its verdict.

How to judge "best purchase", in this order:
1. Value for the price: list price against the comp-based value and price score where one exists, price per finished square foot against the other homes here, and what the money buys (space, lot, age, condition, garage).
2. Fit with what the buyer has said: their stated priorities if given, then their notes, reaction tags and review status. A home the buyer has flagged a problem with should drop.
3. Negotiation leverage: days on market, price cuts, and anything suggesting a motivated seller.
4. Ongoing cost and risk: HOA, property tax, metro-district taxes, age of the home and its big-ticket systems, and anything in the remarks or saved analysis that hints at a problem.
5. Resale: location, school district, and anything that narrows the future buyer pool.

Rules:
- Rank every home you were given exactly once. Do not drop any and do not invent any. Use each home's mls_id exactly as written.
- Compare the homes against each other. Say what specifically puts one above the next; cite the numbers.
- Be skeptical on the buyer's behalf. Never repeat listing marketing language as fact.
- Work only from the fact sheets. You cannot search the web in this run. Never state a price, date, fee or fact that is not in a fact sheet. If something important is missing for a home (no comps checked, no HOA amount, no saved analysis), say so in data_gaps and let it lower your confidence rather than guessing.
- The score is 0 to 100 for how good a purchase the home is for this buyer at its current list price. Spread the scores so the gaps between homes mean something.
- Plain text only inside every string: no Markdown, no bullet characters, no line breaks.
- Every array holds plain strings only: one complete sentence or point per item, never a nested object or array.

Answer with one JSON object and nothing else, in exactly this shape:
{
  "summary": "2 to 4 sentences: which home is the best purchase, the main reason, and how clear the margin over the runner-up is",
  "ranking": [
    {
      "mls_id": "as given",
      "rank": 1,
      "score": 0,
      "verdict": "one of: ${VERDICTS.join(' | ')}",
      "headline": "the case for or against this home in 12 words or fewer",
      "why": "2 to 4 sentences on why it sits at this rank compared with the homes around it",
      "strengths": ["up to 4 short, specific points"],
      "risks": ["up to 4 short, specific points"],
      "offer_strategy": "1 or 2 sentences on how to approach price and terms, or an empty string for a home you would pass on",
      "verify": ["up to 3 things to confirm before making an offer"]
    }
  ],
  "tradeoffs": ["3 to 5 sentences on the trade-offs between homes that decided the order"],
  "data_gaps": ["missing information that limited this ranking, naming the home; an empty array if none"]
}`;

function buildUserPrompt(homes, priorities) {
    const budget = Math.max(3000, Math.min(16000, Math.floor(PROMPT_ANALYSIS_CHARS / homes.length)));
    const today = new Date();
    const parts = [
        `Today's date: ${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`,
        `Homes to rank: ${homes.length}`,
        '',
        "# The buyer's stated priorities",
        priorities || '(none given; infer what matters from the notes, tags and review status on each home)',
        ''
    ];
    // Fixed order (by MLS id), so the grid's current sort never changes the prompt, and with it the answer.
    const ordered = homes.slice().sort((a, b) => String(a.mls_id).localeCompare(String(b.mls_id), 'en', { numeric: true }));
    ordered.forEach((p, index) => {
        parts.push(`# Home ${index + 1} of ${homes.length} (mls_id: ${p.mls_id})`, buildRankingFactSheet(p, budget), '');
    });
    parts.push(`Rank all ${homes.length} homes now.`);
    return parts.join('\n');
}

/** Keeps only homes that were sent, once each, in rank order; anything Gemini skipped goes last. */
function normalizeResult(data, homes) {
    const byId = new Map(homes.map(p => [String(p.mls_id), p]));
    const seen = new Set();
    const rows = (Array.isArray(data?.ranking) ? data.ranking : [])
        .filter(row => {
            const id = String(row?.mls_id ?? '');
            if (!byId.has(id) || seen.has(id)) return false;
            seen.add(id);
            return true;
        })
        .sort((a, b) => (num(a.rank) || 999) - (num(b.rank) || 999) || num(b.score) - num(a.score))
        .map((row, index) => ({
            p: byId.get(String(row.mls_id)),
            rank: index + 1,
            score: Math.max(0, Math.min(100, Math.round(num(row.score)))),
            verdict: VERDICTS.find(v => v.toLowerCase() === text(row.verdict).toLowerCase()) || text(row.verdict, 30) || 'Worth a look',
            headline: text(row.headline, 160),
            why: text(row.why, 1200),
            strengths: list(row.strengths, 4),
            risks: list(row.risks, 4),
            offer: text(row.offer_strategy, 500),
            verify: list(row.verify, 3)
        }));
    if (!rows.length) throw new Error('Gemini did not return a ranking for these homes. Try again.');
    return {
        summary: text(data.summary, 1200),
        rows,
        skipped: homes.filter(p => !seen.has(String(p.mls_id))),
        tradeoffs: list(data.tradeoffs, 5),
        gaps: list(data.data_gaps, 8)
    };
}

// ---- Saved rankings (local storage) -------------------------------------------------------

function readSaved() {
    try {
        const saved = JSON.parse(localStorage.getItem(RESULTS_STORAGE) || '[]');
        return Array.isArray(saved) ? saved : [];
    } catch (e) { return []; }
}

/** Stores a finished ranking by home id (not the home objects), replacing any earlier one for the same homes and priorities. */
function saveResult(r) {
    const user = String(state.user || '');
    const entry = {
        user, signature: r.signature, model: r.model, priorities: r.priorities, filteredTotal: r.filteredTotal, at: r.at.toISOString(),
        summary: r.summary, tradeoffs: r.tradeoffs, gaps: r.gaps,
        rows: r.rows.map(({ p, ...row }) => ({ ...row, id: String(p.mls_id) }))
    };
    let saved = [entry, ...readSaved().filter(e => !(e.user === user && e.signature === r.signature))].slice(0, MAX_SAVED_RESULTS);
    while (saved.length) {
        try { localStorage.setItem(RESULTS_STORAGE, JSON.stringify(saved)); return; }
        catch (e) { saved = saved.slice(0, -1); } // storage full: let go of the oldest and try again
    }
}

/** The saved ranking for exactly these homes and priorities, rebuilt around the current home objects, or null. */
function loadResult(homes, priorities) {
    const signature = signatureOf(homes, priorities);
    const user = String(state.user || '');
    const entry = readSaved().find(e => e && e.user === user && e.signature === signature);
    if (!entry || !Array.isArray(entry.rows)) return null;
    const byId = new Map(homes.map(p => [String(p.mls_id), p]));
    const rows = entry.rows.filter(row => byId.has(String(row.id))).map(({ id, ...row }) => ({ ...row, p: byId.get(String(id)) }));
    const at = new Date(entry.at);
    if (!rows.length || isNaN(at.getTime())) return null;
    const ranked = new Set(rows.map(row => String(row.p.mls_id)));
    return {
        signature, homes, model: entry.model, priorities, filteredTotal: num(entry.filteredTotal) || homes.length, at,
        summary: entry.summary || '', rows, skipped: homes.filter(p => !ranked.has(String(p.mls_id))),
        tradeoffs: Array.isArray(entry.tradeoffs) ? entry.tradeoffs : [], gaps: Array.isArray(entry.gaps) ? entry.gaps : []
    };
}

// ---- Run ----------------------------------------------------------------------------------

function isOpen() {
    return !!document.getElementById('modal-ai-rank')?.classList.contains('active');
}

async function run(homes) {
    if (running) { view = 'loading'; render(); return; }
    const priorities = getPriorities();
    const signature = signatureOf(homes, priorities);
    const filteredTotal = (state.filteredProperties || []).length;
    running = { signature, count: homes.length, startedAt: Date.now() };
    view = 'loading';
    render();
    clearInterval(timer);
    timer = setInterval(() => {
        const el = document.getElementById('ai-rank-elapsed');
        if (el && running) el.textContent = `${Math.round((Date.now() - running.startedAt) / 1000)}s`;
    }, 1000);

    try {
        const { data, model } = await generateGeminiJson(SYSTEM_PROMPT, buildUserPrompt(homes, priorities));
        last = { signature, homes, model, priorities, filteredTotal, at: new Date(), ...normalizeResult(data, homes) };
        saveResult(last);
        view = 'result';
        if (!isOpen()) showToast('AI ranking is ready. Open AI Ranking to see it.', 'success');
    } catch (err) {
        errorMessage = err?.message || 'The ranking could not be completed.';
        view = 'error';
        // The modal shows this once and then it's gone; keep a copy in the event log.
        logClientEvent('error', 'AI ranking failed: ' + errorMessage, {
            homes: homes.length,
            seconds: Math.round((Date.now() - running.startedAt) / 1000),
            model: getGeminiModel(),
            http_status: err?.status ?? null,
            has_priorities: !!priorities
        });
        if (!isOpen()) showToast('AI ranking failed: ' + errorMessage, 'error');
    } finally {
        running = null;
        clearInterval(timer);
    }
    render();
}

/** Decides what the modal shows for the homes in the filter right now, and starts a run if it can. */
function start(force = false) {
    const priorityInput = document.getElementById('ai-rank-priorities-input');
    if (priorityInput) setPriorities(String(priorityInput.value || '').trim());
    const filtered = (state.filteredProperties || []).slice();
    if (running) { view = 'loading'; render(); return; }
    if (filtered.length < 2) {
        showToast(filtered.length ? 'Ranking needs at least two homes in the current filter.' : 'No homes match the current filter.', 'error');
        if (!last) closeModal();
        else { view = 'result'; render(); }
        return;
    }
    pending = filtered.slice(0, MAX_HOMES);
    if (!force) {
        const priorities = getPriorities();
        const saved = last && last.signature === signatureOf(pending, priorities) ? last : loadResult(pending, priorities);
        if (saved) { last = saved; view = 'result'; render(); return; }
    }

    const keyState = getGeminiKeyState();
    if (keyState === 'none') view = 'nokey';
    else if (keyState === 'locked') view = 'unlock';
    else if (filtered.length > MAX_HOMES && !force) view = 'toomany';
    else { run(pending); return; }
    render();
}

// ---- Rendering ----------------------------------------------------------------------------

function verdictTone(verdict, score) {
    const v = verdict.toLowerCase();
    if (v === 'top pick') return 'top';
    if (v === 'strong contender') return 'good';
    if (v === 'pass') return 'pass';
    if (v === 'long shot') return 'weak';
    if (v === 'worth a look') return 'fair';
    return score >= 75 ? 'good' : (score >= 50 ? 'fair' : 'weak');
}

function factsLine(p) {
    const sqft = num(p.sqft_finished) || num(p.sqft_total);
    const comp = getCompScore(p);
    return [
        money(p.price),
        p.beds ? `${p.beds} bd` : '',
        p.baths ? `${p.baths} ba` : '',
        sqft ? `${sqft.toLocaleString('en-US')} sq ft` : '',
        sqft && num(p.price) ? `${money(num(p.price) / sqft)}/sq ft` : '',
        num(p.year_built) ? `Built ${p.year_built}` : '',
        comp ? `Price score ${comp.score}` : ''
    ].filter(Boolean).map(esc).join('<span class="ai-rank-dot">&middot;</span>');
}

function bulletsHtml(title, icon, tone, items) {
    if (!items.length) return '';
    return `<div class="ai-rank-col ai-rank-col--${tone}">
            <div class="ai-rank-col-title"><i data-lucide="${icon}"></i> ${title}</div>
            <ul>${items.map(item => `<li>${esc(item)}</li>`).join('')}</ul>
        </div>`;
}

function rowHtml(row) {
    const p = row.p;
    const id = esc(p.mls_id);
    const tone = verdictTone(row.verdict, row.score);
    const cityLine = [p.city, p.state].filter(Boolean).join(', ') + (p.zip ? ' ' + p.zip : '');
    return `<details class="ai-rank-item ai-rank-item--${tone}" ${row.rank <= 3 ? 'open' : ''}>
        <summary>
            <span class="ai-rank-num">${row.rank}</span>
            <img class="ai-rank-thumb" src="${esc(p.main_image_url || NO_PHOTO_IMG)}" alt="">
            <span class="ai-rank-id">
                <span class="ai-rank-address">${esc(cleanDisplayAddress(p.address, p.mls_id))}</span>
                <span class="ai-rank-city">${esc(cityLine)}</span>
                <span class="ai-rank-facts">${factsLine(p)}</span>
            </span>
            <span class="ai-rank-score">
                <span class="ai-rank-score-top"><span class="ai-rank-score-num">${row.score}</span><span class="ai-rank-score-of">/100</span></span>
                <span class="ai-rank-verdict">${esc(row.verdict)}</span>
            </span>
            <i data-lucide="chevron-down" class="ai-rank-chevron"></i>
        </summary>
        <div class="ai-rank-detail">
            ${row.headline ? `<p class="ai-rank-headline">${esc(row.headline)}</p>` : ''}
            ${row.why ? `<p class="ai-rank-why">${esc(row.why)}</p>` : ''}
            <div class="ai-rank-cols">
                ${bulletsHtml('Strengths', 'circle-check', 'good', row.strengths)}
                ${bulletsHtml('Risks', 'triangle-alert', 'risk', row.risks)}
            </div>
            ${row.offer ? `<div class="ai-rank-line"><span class="ai-rank-line-label"><i data-lucide="handshake"></i> Offer approach</span><span>${esc(row.offer)}</span></div>` : ''}
            ${row.verify.length ? `<div class="ai-rank-line"><span class="ai-rank-line-label"><i data-lucide="search-check"></i> Verify first</span><span>${row.verify.map(esc).join('<span class="ai-rank-dot">&middot;</span>')}</span></div>` : ''}
            <div class="ai-rank-item-actions">
                <button type="button" class="btn btn-secondary btn-compact" data-ai-rank="details" data-mls="${id}"><i data-lucide="external-link"></i> Open Listing</button>
            </div>
        </div>
    </details>`;
}

function prioritiesHtml() {
    return `<label class="ai-rank-priorities">
            <span>What matters most to you? <em>Optional. Used on the next run and remembered in this browser.</em></span>
            <input type="text" id="ai-rank-priorities-input" class="input-text" maxlength="400" autocomplete="off" value="${esc(getPriorities())}" placeholder="e.g. extra-wide garage, finished basement, under $700K, short commute to DTC">
        </label>`;
}

function resultHtml() {
    const r = last;
    const current = (state.filteredProperties || []).slice(0, MAX_HOMES);
    const stale = r.signature !== signatureOf(current, getPriorities());
    const withAnalysis = r.homes.filter(p => String(p.ai_analysis || '').trim()).length;
    const withComps = r.homes.filter(p => getCompScore(p)).length;
    const stamp = r.at.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
    const top = r.rows[0];

    return `<div class="ai-rank-meta">
            <span><i data-lucide="home"></i> ${r.homes.length} homes ranked${r.filteredTotal > r.homes.length ? ` (first ${r.homes.length} of ${r.filteredTotal} in the filter)` : ''}</span>
            <span><i data-lucide="bot"></i> ${withAnalysis} with a saved AI analysis</span>
            <span><i data-lucide="scale"></i> ${withComps} with comps</span>
            <span><i data-lucide="clock"></i> ${esc(stamp)} &middot; ${esc(r.model)}</span>
        </div>
        ${r.priorities ? `<div class="ai-rank-used-priorities"><strong>Priorities given:</strong> ${esc(r.priorities)}</div>` : ''}
        ${stale ? `<div class="ai-rank-notice"><i data-lucide="info"></i><span>Your filter or priorities have changed since this ranking was made. Run it again to rank the homes showing now.</span></div>` : ''}
        <div class="ai-rank-summary">
            <div class="ai-rank-summary-label"><i data-lucide="trophy"></i> Best purchase</div>
            <div class="ai-rank-summary-pick">${esc(cleanDisplayAddress(top.p.address, top.p.mls_id))}<span>${esc(money(top.p.price))}</span></div>
            ${r.summary ? `<p>${esc(r.summary)}</p>` : ''}
        </div>
        <div class="ai-rank-list">${r.rows.map(rowHtml).join('')}</div>
        ${r.skipped.length ? `<div class="ai-rank-notice"><i data-lucide="info"></i><span>Gemini left ${r.skipped.length === 1 ? 'one home' : r.skipped.length + ' homes'} out of its answer: ${r.skipped.map(p => esc(cleanDisplayAddress(p.address, p.mls_id))).join(', ')}. Run it again to include ${r.skipped.length === 1 ? 'it' : 'them'}.</span></div>` : ''}
        ${r.tradeoffs.length ? `<div class="ai-rank-section"><div class="ai-rank-section-title"><i data-lucide="git-compare"></i> What decided the order</div><ul>${r.tradeoffs.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>` : ''}
        ${r.gaps.length ? `<div class="ai-rank-section ai-rank-section--muted"><div class="ai-rank-section-title"><i data-lucide="circle-help"></i> Missing information</div><ul>${r.gaps.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>` : ''}
        <div class="ai-rank-footer">
            ${prioritiesHtml()}
            <div class="ai-rank-footer-actions">
                <button type="button" class="btn btn-secondary" data-ai-rank="copy"><i data-lucide="clipboard"></i> Copy as Text</button>
                <button type="button" class="btn btn-secondary" data-ai-rank="pdf"><i data-lucide="file-down"></i> Export PDF</button>
                <button type="button" class="btn btn-gold" data-ai-rank="rerun"><i data-lucide="refresh-cw"></i> Run Again</button>
            </div>
            <div class="comps-note">Written by Gemini from the data in Dibs, with no web search in this step. Homes without comps or a saved AI analysis are ranked on less evidence. Verify anything you plan to act on.</div>
        </div>`;
}

function bodyHtml() {
    if (view === 'loading') {
        const count = running ? running.count : pending.length;
        return `<div class="ai-rank-state">
                <div class="ai-rank-spinner"></div>
                <h3>Gemini is comparing ${count} homes</h3>
                <p>Reading each home's listing details, comps, your notes and saved AI analysis, then ranking them against each other. This usually takes under a minute. <span id="ai-rank-elapsed"></span></p>
                <p class="comps-note">You can close this and keep browsing; the ranking will be here when you come back.</p>
            </div>`;
    }
    if (view === 'unlock') {
        return `<div class="ai-rank-state">
                <i data-lucide="lock" class="ai-rank-state-icon"></i>
                <h3>Unlock your Gemini key</h3>
                <p>Your key is saved in this browser, locked with your PIN. It stays unlocked until you close this tab.</p>
                <div class="ai-rank-unlock">
                    <input type="password" id="ai-rank-pin" class="input-text" autocomplete="off" placeholder="Vault PIN">
                    <button type="button" class="btn btn-gold" data-ai-rank="unlock"><i data-lucide="lock-open"></i> Unlock &amp; Rank ${pending.length} Homes</button>
                </div>
            </div>`;
    }
    if (view === 'nokey') {
        return `<div class="ai-rank-state">
                <i data-lucide="key-round" class="ai-rank-state-icon"></i>
                <h3>Add a Gemini API key first</h3>
                <p>AI Ranking uses the same Gemini key as the AI Analysis on each card. Add it once in AI Setup, then come back here.</p>
                <button type="button" class="btn btn-gold" data-ai-rank="setup"><i data-lucide="settings"></i> Open AI Setup</button>
            </div>`;
    }
    if (view === 'toomany') {
        const total = (state.filteredProperties || []).length;
        return `<div class="ai-rank-state">
                <i data-lucide="list-filter" class="ai-rank-state-icon"></i>
                <h3>${total} homes match the current filter</h3>
                <p>A ranking is sharpest on a shortlist, so one run covers up to ${MAX_HOMES} homes. Narrow the filter, or rank the first ${MAX_HOMES} in the order they are sorted now.</p>
                <div class="ai-rank-unlock">
                    <button type="button" class="btn btn-secondary" data-ai-rank="close">Narrow the Filter</button>
                    <button type="button" class="btn btn-gold" data-ai-rank="first"><i data-lucide="sparkles"></i> Rank the First ${MAX_HOMES}</button>
                </div>
            </div>`;
    }
    if (view === 'error') {
        return `<div class="ai-rank-state">
                <i data-lucide="triangle-alert" class="ai-rank-state-icon ai-rank-state-icon--error"></i>
                <h3>The ranking did not finish</h3>
                <p>${esc(errorMessage)}</p>
                <div class="ai-rank-unlock">
                    ${last ? `<button type="button" class="btn btn-secondary" data-ai-rank="show-last">Show the Last Ranking</button>` : ''}
                    <button type="button" class="btn btn-gold" data-ai-rank="rerun"><i data-lucide="refresh-cw"></i> Try Again</button>
                </div>
            </div>`;
    }
    return last ? resultHtml() : '';
}

function render() {
    const body = document.getElementById('ai-rank-body');
    if (!body) return;
    body.innerHTML = bodyHtml();
    if (window.lucide) window.lucide.createIcons();
    if (view === 'unlock') document.getElementById('ai-rank-pin')?.focus();
}

// ---- Copy ---------------------------------------------------------------------------------

function resultAsText() {
    const r = last;
    const lines = [`AI RANKING: ${r.homes.length} homes (${r.at.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}, ${r.model})`, ''];
    if (r.summary) lines.push(r.summary, '');
    r.rows.forEach(row => {
        const p = row.p;
        lines.push(`${row.rank}. ${cleanDisplayAddress(p.address, p.mls_id)}, ${p.city || ''} | ${money(p.price)} | ${row.score}/100 | ${row.verdict}`);
        if (row.headline) lines.push(`   ${row.headline}`);
        if (row.why) lines.push(`   ${row.why}`);
        row.strengths.forEach(s => lines.push(`   + ${s}`));
        row.risks.forEach(s => lines.push(`   - ${s}`));
        if (row.offer) lines.push(`   Offer approach: ${row.offer}`);
        if (row.verify.length) lines.push(`   Verify first: ${row.verify.join('; ')}`);
        lines.push('');
    });
    if (r.tradeoffs.length) lines.push('What decided the order:', ...r.tradeoffs.map(t => `- ${t}`), '');
    if (r.gaps.length) lines.push('Missing information:', ...r.gaps.map(t => `- ${t}`), '');
    return lines.join('\n').trim();
}

/**
 * PDF by way of the browser's own print dialog ("Save as PDF"), so the text stays selectable and
 * no PDF library is needed. The body class switches on the print rules in styles.css that show
 * only this modal; every home is expanded for the printout and put back afterwards.
 */
function exportPdf() {
    const modal = document.getElementById('modal-ai-rank');
    if (!modal || !last) return;
    const closed = Array.from(modal.querySelectorAll('.ai-rank-item:not([open])'));
    const title = document.title;
    const restore = () => {
        window.removeEventListener('afterprint', restore);
        document.body.classList.remove('ai-rank-printing');
        closed.forEach(item => { item.open = false; });
        document.title = title;
    };
    const day = `${last.at.getFullYear()}-${String(last.at.getMonth() + 1).padStart(2, '0')}-${String(last.at.getDate()).padStart(2, '0')}`;
    closed.forEach(item => { item.open = true; });
    document.body.classList.add('ai-rank-printing');
    document.title = `Dibs AI Ranking ${day}`; // browsers offer the page title as the PDF's file name
    window.addEventListener('afterprint', restore);
    window.print();
}

// ---- Modal wiring -------------------------------------------------------------------------

function openModal() {
    const modal = document.getElementById('modal-ai-rank');
    if (!modal) return;
    modal.classList.add('active');
    start();
}

function closeModal() {
    document.getElementById('modal-ai-rank')?.classList.remove('active');
}

async function unlockAndRun() {
    const pin = document.getElementById('ai-rank-pin')?.value || '';
    if (!pin) { showToast('Enter your vault PIN.', 'error'); return; }
    try {
        await unlockGeminiVault(pin);
    } catch (err) {
        showToast(err?.message || 'That PIN did not unlock the key.', 'error');
        return;
    }
    start(true);
}

function handleAction(action, el) {
    if (action === 'close') closeModal();
    else if (action === 'unlock') unlockAndRun();
    else if (action === 'first' || action === 'rerun') start(true);
    else if (action === 'pdf') exportPdf();
    else if (action === 'show-last') { view = 'result'; render(); }
    else if (action === 'setup') {
        closeModal();
        if (typeof window.openAiSetupModal === 'function') window.openAiSetupModal();
    } else if (action === 'details') {
        closeModal();
        if (typeof window.openDetailModal === 'function') window.openDetailModal(el.dataset.mls);
    } else if (action === 'copy' && last) {
        navigator.clipboard.writeText(resultAsText())
            .then(() => showToast('Ranking copied', 'success'))
            .catch(() => showToast('Could not copy to the clipboard', 'error'));
    }
}

document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest('#btn-ai-rank')) { openModal(); return; }
    if (target.closest('#modal-ai-rank-close') || target.id === 'modal-ai-rank') { closeModal(); return; }
    const actionEl = target.closest('[data-ai-rank]');
    if (actionEl && actionEl.closest('#modal-ai-rank')) handleAction(actionEl.dataset.aiRank, actionEl);
});

document.addEventListener('keydown', event => {
    if (event.key === 'Enter' && event.target?.id === 'ai-rank-pin') {
        event.preventDefault();
        unlockAndRun();
    }
});

document.addEventListener('change', event => {
    if (event.target?.id === 'ai-rank-priorities-input') setPriorities(String(event.target.value || '').trim());
});
