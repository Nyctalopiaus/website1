/**
 * "Compare to my house": one listing side by side with My Home (js/myHome.js), with the
 * change for each row and what the move does to the monthly payment and cash at closing.
 *
 * Monthly cost uses compare.js's monthlyCost(), so the panel and the compare matrix agree.
 * The down payment is My Home's net proceeds + extra cash, or extra cash only with
 * "Buy before selling" on (then both mortgages are carried until the home sells).
 */
import { state } from './state.js';
import { cleanDisplayAddress, escapeHtml, ensureFullRaw } from './properties.js';
import { showToast } from './toast.js';
import { getMarketRate, loadMortgageRates } from './rates.js';
import { monthlyCost, loadPaySettings, currentRate } from './compare.js';
import { myHomeSaleMath, myHomeMonthly, loadMyHome, openMyHomeModal } from './myHome.js';
import { buildRankingFactSheet, generateGeminiJson, getGeminiKeyState, unlockGeminiVault } from './geminiAnalysis.js';

const esc = v => escapeHtml(String(v ?? ''));
const SETTINGS_KEY = 'dibs_home_compare_v1';
const DEFAULTS = { rate: null, buyFirst: false, minDownPct: 5 };
let currentMls = null;

function loadSettings() {
    try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; } catch (e) { return { ...DEFAULTS }; }
}
function saveSettings(s) {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); } catch (e) { /* per-browser convenience only */ }
}

const num = v => (v === null || v === undefined || v === '' || isNaN(Number(v))) ? null : Number(v);
const usd = v => v === null ? '—' : (v < 0 ? '−$' : '$') + Math.round(Math.abs(v)).toLocaleString();
const int = v => v === null ? '—' : Math.round(v).toLocaleString();
const lotSqft = p => num(p.lot_sqft) ?? (num(p.lot_acres) !== null ? Math.round(p.lot_acres * 43560) : null);

/** Signed change cell. good: 'up' = an increase is good, 'down' = a decrease is good, null = neutral. */
function deltaHtml(a, b, fmt, good, withPct = false) {
    if (a === null || b === null) return '<span class="hc-delta">—</span>';
    const d = b - a;
    if (Math.abs(d) < 0.005) return '<span class="hc-delta">same</span>';
    const cls = !good ? '' : ((d > 0) === (good === 'up') ? 'is-good' : 'is-bad');
    const pct = withPct && a ? ` (${d > 0 ? '+' : '−'}${Math.abs(d / a * 100).toFixed(1)}%)` : '';
    const body = fmt(Math.abs(d));
    return `<span class="hc-delta ${cls}">${d > 0 ? '+' : '−'}${body.replace(/^−/, '')}${pct}</span>`;
}

function row(label, a, b, fmt, good, opts = {}) {
    return `<tr${opts.cls ? ` class="${opts.cls}"` : ''}><th scope="row">${esc(label)}</th>
        <td>${a === null ? '—' : fmt(a)}</td><td>${b === null ? '—' : fmt(b)}</td>
        <td>${deltaHtml(a, b, fmt, good, opts.pct)}</td></tr>`;
}
function textRow(label, a, b) {
    return `<tr><th scope="row">${esc(label)}</th><td>${esc(a || '—')}</td><td>${esc(b || '—')}</td><td></td></tr>`;
}

/** Every number the panel (and the Gemini write-up) works from. */
function computeMove(p, h, s) {
    const sale = myHomeSaleMath(h);
    const now = myHomeMonthly(h);
    const pay = loadPaySettings();
    const rate = num(s.rate) || currentRate(pay);
    const price = num(p.price);
    const available = s.buyFirst ? (num(h.extra_cash) || 0) : (sale.downPayment ?? null);
    const downUsed = available === null || price === null ? null : Math.min(Math.max(0, available), price);
    const next = price && rate && downUsed !== null ? monthlyCost(p, { rate, downAmount: downUsed }) : null;
    const cashLeft = available !== null && price !== null ? Math.max(0, available - price) : null;
    const minDown = price !== null ? price * (num(s.minDownPct) ?? 5) / 100 : null;
    const vsMin = available !== null && minDown !== null ? available - minDown : null;
    const myPpsf = num(h.my_price) && num(h.sqft_finished) ? h.my_price / h.sqft_finished : null;
    const ppsf = price && num(p.sqft_finished) ? price / p.sqft_finished : null;
    return { sale, now, rate, price, available, downUsed, next, cashLeft, minDown, vsMin, myPpsf, ppsf };
}

function renderBody(p, h, s) {
    const { sale, now, rate, price, available, downUsed, next, cashLeft, minDown, vsMin, myPpsf, ppsf } = computeMove(p, h, s);
    const market = getMarketRate('30yr');

    const table = `
        <table class="hc-table">
            <thead><tr><th></th><th><i data-lucide="house"></i> My Home</th><th>${esc(cleanDisplayAddress(p.address, p.mls_id))}</th><th>Change</th></tr></thead>
            <tbody>
                ${row('Price', num(h.my_price), price, usd, null, { pct: true })}
                ${row('$ / finished sq ft', myPpsf, ppsf, usd, 'down')}
                ${row('Finished sq ft', num(h.sqft_finished), num(p.sqft_finished), int, 'up', { pct: true })}
                ${row('Total sq ft', num(h.sqft_total), num(p.sqft_total), int, 'up')}
                ${row('Beds', num(h.beds), num(p.beds), int, 'up')}
                ${row('Baths', num(h.baths), num(p.baths), v => String(+v.toFixed(1)), 'up')}
                ${row('Garage spaces', num(h.garage_spaces), num(p.garage_spaces), int, 'up')}
                ${textRow('Garage notes', h.garage_notes, '')}
                ${row('Lot sq ft', num(h.lot_sqft), lotSqft(p), int, 'up')}
                ${row('Year built', num(h.year_built), num(p.year_built), v => String(Math.round(v)), 'up')}
                ${textRow('Driveway faces', h.driveway_facing, p.facing)}
                ${row('HOA / month', num(h.hoa_fee) ?? 0, num(p.hoa_fee) ?? 0, usd, 'down')}
                ${row('Property tax / month', num(h.annual_tax) !== null ? h.annual_tax / 12 : null, num(p.annual_tax) !== null ? p.annual_tax / 12 : null, usd, 'down')}
                ${row('Mortgage rate %', num(h.mortgage_rate), rate || null, v => v.toFixed(2) + '%', 'down')}
                ${row('Principal & interest / month', now ? now.pi : null, next ? next.pi : null, usd, 'down')}
                ${row('Monthly total (P&I + tax + HOA)', now ? now.total : null, next ? next.total : null, usd, 'down', { cls: 'hc-total' })}
            </tbody>
        </table>`;

    const money = `
        <div class="hc-money">
            <div><span>${s.buyFirst ? 'Down payment (extra cash only)' : 'Down payment (net proceeds + extra cash)'}</span><b>${usd(available)}</b></div>
            <div><span>New loan</span><b>${price !== null && downUsed !== null ? usd(price - downUsed) : '—'}</b></div>
            <div><span>vs. ${num(s.minDownPct) ?? 5}% minimum down</span><b class="${vsMin === null ? '' : vsMin >= 0 ? 'is-good' : 'is-bad'}">${vsMin === null ? '—' : (vsMin >= 0 ? usd(vsMin) + ' to spare' : usd(-vsMin) + ' short')}</b></div>
            ${cashLeft ? `<div><span>Cash left after paying in full</span><b class="is-good">${usd(cashLeft)}</b></div>` : ''}
            ${s.buyFirst && now && next ? `<div><span>Carrying both until yours sells</span><b class="is-bad">${usd(now.total + next.total)}/mo</b></div>` : ''}
        </div>`;

    const missing = [];
    if (num(h.my_price) === null) missing.push('your price');
    if (num(h.mortgage_payoff) === null) missing.push('payoff balance');
    if (num(h.mortgage_pi) === null) missing.push('current P&I');

    return `
        <div class="hc-controls">
            <label>New rate <input type="number" id="hc-rate" min="0" max="20" step="0.001" value="${num(s.rate) ?? ''}" placeholder="${rate ? rate.toFixed(2) : 'e.g. 6.25'}"> %</label>
            <label>Minimum down <input type="number" id="hc-min-down" min="0" max="100" step="0.5" value="${num(s.minDownPct) ?? 5}"> %</label>
            <label class="hc-check"><input type="checkbox" id="hc-buy-first" ${s.buyFirst ? 'checked' : ''}> Buy before selling</label>
            <span class="hc-note">${num(s.rate) ? 'Using your rate.' : market ? `Blank = compare-matrix rate or today's 30-yr (${market.toFixed(2)}%).` : 'Market rate not loaded; enter a rate.'} 30-yr fixed; excludes insurance &amp; PMI.</span>
        </div>
        ${missing.length ? `<p class="hc-missing"><i data-lucide="info"></i> Add ${missing.join(', ')} on <a href="#" data-hc="edit-home">My Home</a> to fill in the money rows.</p>` : ''}
        ${table}
        ${money}
        <h3 class="my-home-section-title"><i data-lucide="sparkles"></i> What changes if I move</h3>
        <div id="hc-ai">${aiSectionHtml(p, h)}</div>
        <div class="my-home-actions"><button type="button" class="btn btn-secondary" data-hc="edit-home"><i data-lucide="pencil"></i> Edit my home</button></div>`;
}


// ---- Gemini "What changes if I move" (no web search needed: it reasons over the numbers above) ----
const AI_STORAGE = 'dibs_home_compare_ai_v1';
const MAX_SAVED_AI = 20;
let aiBusy = false;
let aiError = '';

const AI_SCHEMA = {
    type: 'OBJECT',
    properties: {
        headline: { type: 'STRING' },
        verdict: { type: 'STRING', enum: ['Clear upgrade', 'Upgrade with trade-offs', 'Sideways move', 'Step back'] },
        gains: { type: 'ARRAY', items: { type: 'STRING' } },
        losses: { type: 'ARRAY', items: { type: 'STRING' } },
        money: { type: 'STRING' },
        questions: { type: 'ARRAY', items: { type: 'STRING' } },
    },
    required: ['headline', 'verdict', 'gains', 'losses', 'money', 'questions'],
};

function loadAiResults() {
    try { const v = JSON.parse(localStorage.getItem(AI_STORAGE) || '{}'); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; }
}
function saveAiResult(mlsId, result) {
    try {
        const all = loadAiResults();
        all[mlsId] = result;
        const keys = Object.keys(all).sort((a, b) => String(all[b].at).localeCompare(String(all[a].at)));
        keys.slice(MAX_SAVED_AI).forEach(k => delete all[k]);
        localStorage.setItem(AI_STORAGE, JSON.stringify(all));
    } catch (e) { /* saved per browser as a convenience only */ }
}

function homeFactLines(h) {
    const f = (label, v, suffix = '') => (v === null || v === undefined || v === '') ? null : `- ${label}: ${v}${suffix}`;
    return [
        f('Address', [h.address, h.city, h.state, h.zip].filter(Boolean).join(', ')),
        f('Beds / baths', h.beds != null || h.baths != null ? `${h.beds ?? '?'} / ${h.baths ?? '?'}` : null),
        f('Finished sq ft', h.sqft_finished), f('Total sq ft', h.sqft_total), f('Lot sq ft', h.lot_sqft),
        f('Year built', h.year_built), f('Type', h.property_type), f('Levels', h.levels),
        f('Garage spaces', h.garage_spaces), f('Garage notes', h.garage_notes), f('Basement', h.basement),
        f('Fence', h.fence), f('Driveway faces', h.driveway_facing),
        f('HOA per month', h.hoa_fee != null ? usd(Number(h.hoa_fee)) : null),
        f('Annual property tax', h.annual_tax != null ? usd(Number(h.annual_tax)) : null),
        f("Owner's price for it", h.my_price != null ? usd(Number(h.my_price)) : null),
        state.myHomeComps?.comp_estimate ? f('RentCast value', `${usd(state.myHomeComps.comp_estimate)} (range ${usd(state.myHomeComps.comp_range_low)}–${usd(state.myHomeComps.comp_range_high)})`) : null,
        h.ai_notes ? `- Owner's notes / CMA:\n${String(h.ai_notes).slice(0, 3000)}` : null,
    ].filter(Boolean);
}

function moveLines(m, s, h) {
    const pct = v => v === null ? 'unknown' : v.toFixed(2) + '%';
    return [
        `- Scenario: ${s.buyFirst ? 'buy this home BEFORE selling (down payment from extra cash only; both mortgages carried until the current home sells)' : 'sell the current home first and put the net proceeds toward this one'}`,
        `- Owner's current mortgage rate: ${pct(num(h.mortgage_rate))}; rate assumed for the new loan: ${pct(m.rate || null)} (30-yr fixed)`,
        `- Net proceeds from selling (after payoff and ${num(h.sell_cost_pct) ?? 7}% selling costs): ${usd(m.sale.net ?? null)}`,
        `- Down payment available: ${usd(m.available)}; new loan: ${m.price !== null && m.downUsed !== null ? usd(m.price - m.downUsed) : 'unknown'}`,
        `- Down payment vs ${num(s.minDownPct) ?? 5}% minimum: ${m.vsMin === null ? 'unknown' : (m.vsMin >= 0 ? usd(m.vsMin) + ' to spare' : usd(-m.vsMin) + ' short')}`,
        `- Monthly cost now (P&I + tax + HOA): ${m.now ? usd(m.now.total) : 'unknown'}`,
        `- Monthly cost after the move (P&I + tax + HOA): ${m.next ? usd(m.next.total) : 'unknown'}`,
        s.buyFirst && m.now && m.next ? `- Carrying both until the current home sells: ${usd(m.now.total + m.next.total)} per month` : null,
        '- All monthly figures exclude insurance and PMI.',
    ].filter(Boolean);
}

const AI_SYSTEM = `You help a homeowner decide whether selling their current home and buying a specific listing is worth it.
Work only from the facts given. Do not invent numbers, sales, schools or neighborhood details that are not in the facts; if something important is unknown, say so in questions.
Compare the two homes directly: what the owner gains and gives up in space, garage, lot, age, layout, costs and location facts that are given.
Weigh the monthly payment change and the rate change heavily - giving up a low rate is a real cost.
Respect the buyer's stated must-haves and deal breakers.
Be concrete and short: each gain/loss is one sentence with numbers where they exist. "money" is 2-3 sentences on the financial effect of the move. "questions" are things to check before deciding (at most 5).
Reply as JSON with: headline, verdict (one of: Clear upgrade, Upgrade with trade-offs, Sideways move, Step back), gains[], losses[], money, questions[].`;

function aiSectionHtml(p, h) {
    const saved = loadAiResults()[p.mls_id];
    const keyState = getGeminiKeyState();
    let controls;
    if (aiBusy) {
        controls = '<p class="my-home-note"><i data-lucide="loader"></i> Gemini is comparing the two homes…</p>';
    } else if (keyState === 'none') {
        controls = `<p class="my-home-note">Uses the same Gemini key as AI Analysis. <button type="button" class="btn btn-secondary" data-hc="ai-setup"><i data-lucide="settings"></i> Open AI Setup</button></p>`;
    } else if (keyState === 'locked') {
        controls = `<div class="hc-ai-unlock"><input type="password" id="hc-ai-pin" placeholder="Gemini PIN" autocomplete="current-password">
            <button type="button" class="btn btn-gold" data-hc="ai-unlock"><i data-lucide="lock-open"></i> Unlock &amp; ${saved ? 'Re-run' : 'Ask Gemini'}</button></div>`;
    } else {
        controls = `<button type="button" class="btn btn-gold" data-hc="ai-run"><i data-lucide="sparkles"></i> ${saved ? 'Re-run with current numbers' : 'Ask Gemini what changes'}</button>`;
    }
    const err = aiError ? `<p class="hc-ai-error">${esc(aiError)}</p>` : '';
    if (!saved) return controls + err;
    const r = saved.result || {};
    const list = (items, cls) => (items || []).length ? `<ul class="${cls}">${items.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="my-home-note">None noted.</p>';
    const when = saved.at ? new Date(saved.at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
    return `
        <div class="hc-ai-result">
            <div class="hc-ai-head"><span class="hc-ai-verdict">${esc(r.verdict || '')}</span><b>${esc(r.headline || '')}</b></div>
            <div class="hc-ai-cols">
                <div><h4>You gain</h4>${list(r.gains, 'hc-ai-gains')}</div>
                <div><h4>You give up</h4>${list(r.losses, 'hc-ai-losses')}</div>
            </div>
            <h4>The money</h4><p>${esc(r.money || '')}</p>
            ${(r.questions || []).length ? `<h4>Check before deciding</h4>${list(r.questions, 'hc-ai-questions')}` : ''}
            <p class="my-home-note">Gemini ${esc(saved.model || '')}${when ? ' · ' + esc(when) : ''}${saved.buyFirst ? ' · buy-before-selling scenario' : ''}. Re-run after changing numbers.</p>
        </div>
        ${controls}${err}`;
}

async function runAi() {
    const p = state.allProperties.find(x => String(x.mls_id) === String(currentMls));
    const h = state.myHome;
    if (!p || !h || aiBusy) return;
    const s = loadSettings();
    const m = computeMove(p, h, s);
    await ensureFullRaw([p]);
    const userPrompt = [
        '## Current home (the one they would sell)', ...homeFactLines(h), '',
        '## The listing they are considering', buildRankingFactSheet(p, 4000), '',
        '## The move, as computed by Dibs', ...moveLines(m, s, h),
    ].join('\n');
    aiBusy = true; aiError = '';
    renderAi(p, h);
    try {
        const { data, model } = await generateGeminiJson(AI_SYSTEM, userPrompt, AI_SCHEMA);
        saveAiResult(p.mls_id, { result: data, model, at: new Date().toISOString(), buyFirst: !!s.buyFirst });
    } catch (e) {
        aiError = e?.message || 'Gemini did not answer.';
    } finally {
        aiBusy = false;
        renderAi(p, h);
    }
}

function renderAi(p, h) {
    const el = document.getElementById('hc-ai');
    if (!el || String(currentMls) !== String(p.mls_id)) return;
    el.innerHTML = aiSectionHtml(p, h);
    if (window.lucide) window.lucide.createIcons();
}

async function unlockAndRunAi() {
    const pin = document.getElementById('hc-ai-pin')?.value || '';
    try {
        await unlockGeminiVault(pin);
    } catch (e) {
        showToast(e?.message || 'That PIN did not unlock the key.', 'error');
        return;
    }
    runAi();
}

function render() {
    const body = document.getElementById('home-compare-body');
    const p = state.allProperties.find(x => String(x.mls_id) === String(currentMls));
    if (!body || !p || !state.myHome) return;
    body.innerHTML = renderBody(p, state.myHome, loadSettings());
    if (window.lucide) window.lucide.createIcons();
}

/** Opens the panel for one listing. Without a saved home, opens My Home instead. */
export async function openHomeCompare(mlsId, event) {
    if (event) event.stopPropagation();
    const home = state.myHome || await loadMyHome();
    if (!home || !home.address) {
        showToast('Add your home first, then compare.', 'warning');
        openMyHomeModal();
        return;
    }
    currentMls = mlsId;
    const modal = document.getElementById('modal-home-compare');
    if (!modal) return;
    render();
    modal.classList.add('active');
    if (getMarketRate('30yr') === null) {
        loadMortgageRates().then(() => { if (modal.classList.contains('active')) render(); });
    }
}

function closeModal() {
    document.getElementById('modal-home-compare')?.classList.remove('active');
}

window.openHomeCompare = openHomeCompare;

document.addEventListener('click', event => {
    const t = event.target;
    if (!(t instanceof Element)) return;
    if (t.closest('#modal-home-compare-close') || t.id === 'modal-home-compare') { closeModal(); return; }
    const ai = t.closest('[data-hc^="ai-"]');
    if (ai && ai.closest('#modal-home-compare')) {
        if (ai.dataset.hc === 'ai-run') runAi();
        else if (ai.dataset.hc === 'ai-unlock') unlockAndRunAi();
        else if (ai.dataset.hc === 'ai-setup' && typeof window.openAiSetupModal === 'function') { closeModal(); window.openAiSetupModal(); }
        return;
    }
    const a = t.closest('[data-hc="edit-home"]');
    if (a && a.closest('#modal-home-compare')) {
        event.preventDefault();
        closeModal();
        openMyHomeModal();
    }
});

document.addEventListener('change', event => {
    const t = event.target;
    if (!(t instanceof Element) || !t.closest('#home-compare-body')) return;
    const s = loadSettings();
    if (t.id === 'hc-rate') s.rate = num(t.value);
    else if (t.id === 'hc-min-down') s.minDownPct = num(t.value) ?? 5;
    else if (t.id === 'hc-buy-first') s.buyFirst = t.checked;
    else return;
    saveSettings(s);
    render();
});

document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && document.getElementById('modal-home-compare')?.classList.contains('active')) closeModal();
    if (event.key === 'Enter' && event.target instanceof Element && event.target.id === 'hc-ai-pin') unlockAndRunAi();
});
