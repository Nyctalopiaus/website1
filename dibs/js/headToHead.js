/**
 * Head-to-Head: two homes, every collected field, A / Draw / B per field, weighted total.
 * Spec: claude/head-to-head-spec.md.
 *   Step 1  screen, automatic picks, overrides, why notes, total.
 *   Step 2  global weights saved on the server (h2h_get_weights / h2h_save_weights) + weights editor.
 *   Step 3  repair estimate per home (user_metadata) + adjusted true cost.
 *   Step 4  saved comparisons (h2h_list / h2h_get / h2h_save / h2h_delete): a snapshot of both homes'
 *           values, the picks, the weights used and the score. Reopening shows the snapshot plus
 *           "What changed since"; "Update to current values" switches back to live data.
 *   Step 5  Gemini tie-breaker: one call with the free key (no web search) on the comparison as it
 *           stands; the write-up is saved on the comparison (h2h_save_gemini).
 */
import { state } from './state.js';
import { apiFetch } from './api.js';
import { cleanDisplayAddress, escapeHtml, NO_PHOTO_IMG, ensureFullRaw } from './properties.js';
import { showToast } from './toast.js';
import { loadMortgageRates, getMarketRate } from './rates.js';
import { SECTIONS, buildFields, readField, autoPick, diffText, loadPaySettings } from './h2hFields.js';
import { generateGeminiJson, getGeminiKeyState, unlockGeminiVault } from './geminiAnalysis.js';

const esc = v => escapeHtml(String(v ?? ''));
const OLD_WEIGHTS_KEY = 'dibs_h2h_weights'; // step 1 kept weights in the browser; moved to the server once
// Fields worth calling out in "What changed since" when a saved comparison is reopened.
const CHANGE_KEYS = ['price', 'annual_tax', 'hoa', 'dom', 'price_cut', 'vs_comps', 'repair', 'adj_cost',
    'tour_overall', 'tour_layout', 'tour_condition', 'tour_location', 'tour_value', 'tour_live_here', 'rank'];

/*
 * S = {
 *   mode: 'live' | 'snapshot', id, title, verdict, savedAt, changes,
 *   a, b,            live: property objects; snapshot: saved header info
 *   ctx, fields, rows, picks, weights (this comparison's weight overrides),
 *   filter, showEmpty, collapsed, showWeights, dirty
 * }
 */
let S = null;
let weightsCache = null; // the buyer's global weight overrides, loaded once per page
let saveTimer = null;
let view = 'compare';    // 'compare' | 'list'

const cleanWeights = w => {
    const out = {};
    if (w && typeof w === 'object') Object.keys(w).forEach(k => { const n = Number(w[k]); if (Number.isInteger(n) && n >= 0 && n <= 3) out[k] = n; });
    return out;
};
const findProp = id => (state.allProperties || []).find(p => String(p.mls_id) === String(id)) || null;
const post = (action, body) => apiFetch(`backend/api.php?action=${action}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

// ---------------------------------------------------------------- weights (global profile)

async function loadWeights() {
    if (weightsCache) return { ...weightsCache };
    let server = null;
    try {
        const res = await apiFetch('backend/api.php?action=h2h_get_weights');
        if (res && res.success) server = cleanWeights(res.weights);
    } catch (e) { /* fall back to defaults below */ }
    let local = {};
    try { local = cleanWeights(JSON.parse(localStorage.getItem(OLD_WEIGHTS_KEY) || '{}')); } catch (e) {}
    if (server && !Object.keys(server).length && Object.keys(local).length) {
        weightsCache = local; // carry step-1 browser weights over to the server
        if (await pushWeights(local)) { try { localStorage.removeItem(OLD_WEIGHTS_KEY); } catch (e) {} }
    } else {
        weightsCache = server || local;
        if (server && Object.keys(local).length) { try { localStorage.removeItem(OLD_WEIGHTS_KEY); } catch (e) {} }
    }
    return { ...weightsCache };
}

async function pushWeights(w) {
    try { const res = await post('h2h_save_weights', { weights: w }); return !!(res && res.success); } catch (e) { return false; }
}

/** The global profile saves shortly after the last change, so a run of picker changes is one request. */
function saveGlobalWeights() {
    clearTimeout(saveTimer);
    setWeightStatus('Saving…');
    saveTimer = setTimeout(async () => {
        const ok = await pushWeights(weightsCache || {});
        setWeightStatus(ok ? 'Weights saved' : 'Could not save weights');
        if (!ok) showToast('Could not save your weights. Check your connection and try again.', 'warning');
    }, 700);
}
function setWeightStatus(t) {
    const el = document.getElementById('h2h-weight-status');
    if (el) el.textContent = t;
}
const weightOf = f => { const w = Number(S.weights[f.key]); return Number.isInteger(w) && w >= 0 && w <= 3 ? w : f.w; };

// ---------------------------------------------------------------- modal + loading

function ensureModal() {
    let m = document.getElementById('modal-h2h');
    if (m) return m;
    m = document.createElement('div');
    m.className = 'modal-overlay';
    m.id = 'modal-h2h';
    m.innerHTML = `
        <div class="modal-content h2h-modal" role="dialog" aria-labelledby="h2h-title">
            <button class="modal-close" aria-label="Close" data-h2h="close"><i data-lucide="x"></i></button>
            <div class="h2h-titlebar">
                <h2 id="h2h-title" class="h2h-title"><i data-lucide="swords"></i> Head-to-Head</h2>
                <button type="button" class="h2h-chip" data-h2h="list"><i data-lucide="folder-open"></i> Saved comparisons</button>
            </div>
            <div id="h2h-body"><p class="my-home-loading">Loading…</p></div>
        </div>`;
    document.body.appendChild(m);
    m.addEventListener('click', onClick);
    m.addEventListener('change', onChange);
    m.addEventListener('input', onInput);
    m.addEventListener('mousedown', e => { if (e.target === m) close(); });
    return m;
}
function showModal(msg) {
    const m = ensureModal();
    m.classList.add('active');
    document.getElementById('h2h-body').innerHTML = `<p class="my-home-loading">${esc(msg)}</p>`;
    if (window.lucide) window.lucide.createIcons();
}

/** Tour scores live with Top Picks (ranked + unranked toured favorites). */
async function loadTourScores() {
    const out = {};
    try {
        const res = await apiFetch('backend/api.php?action=get_top_picks');
        if (res && res.success) [...(res.ranked || []), ...(res.unranked || [])].forEach(h => {
            if (h && h.tour_scores) out[String(h.mls_id)] = h.tour_scores;
        });
    } catch (e) { /* tour rows just show "not listed" */ }
    return out;
}

async function liveContext(a, b) {
    const [tourScores] = await Promise.all([
        loadTourScores(),
        ensureFullRaw([a, b]),
        getMarketRate('30yr') === null ? loadMortgageRates().catch(() => {}) : null,
    ]);
    return { pay: loadPaySettings(), tourScores };
}

const blankState = () => ({ mode: 'live', id: null, title: '', verdict: '', savedAt: null, changes: null,
    picks: {}, weights: {}, filter: 'all', showEmpty: false, collapsed: new Set(['More MLS details']), showWeights: false, dirty: false,
    gemini: null, aiBusy: false, aiError: '' });

export async function openHeadToHead(mlsA, mlsB) {
    if (S && S.dirty && !window.confirm('You have unsaved changes in the open comparison. Discard them?')) return;
    const a = findProp(mlsA), b = findProp(mlsB);
    if (!a || !b || a === b) { showToast('Pick two different homes for Head-to-Head', 'warning'); return; }
    view = 'compare';
    showModal('Loading both homes…');
    const [ctx, weights] = await Promise.all([liveContext(a, b), loadWeights()]);
    S = { ...blankState(), a, b, ctx, weights };
    compute();
    render();
}

// ---------------------------------------------------------------- rows

/** Live: read every field for both homes. Snapshot: rebuild rows from the saved values. Keeps the buyer's own picks. */
function compute() {
    if (S.mode === 'snapshot') {
        S.rows = (S.snap.rows || []).map(r => ({
            f: { key: r.key, label: r.label, section: r.section, sub: r.sub, type: r.type, unscored: !!r.unscored, long: !!r.long, w: r.w, better: r.better },
            ra: r.a || { value: null, text: null }, rb: r.b || { value: null, text: null }, auto: r.auto ?? null,
        }));
        S.fields = S.rows.map(r => r.f);
    } else {
        S.fields = buildFields(S.a, S.b);
        S.rows = S.fields.map(f => {
            const ra = readField(f, S.a, S.ctx), rb = readField(f, S.b, S.ctx);
            return { f, ra, rb, auto: f.unscored ? null : autoPick(f, ra.value, rb.value) };
        });
    }
    S.rows.forEach(r => {
        const cur = S.picks[r.f.key];
        if (!cur || cur.by !== 'user') S.picks[r.f.key] = { pick: r.auto, by: 'auto', why: cur?.why || '' };
    });
}

function pickOf(r) { return S.picks[r.f.key]?.pick ?? null; }

function score() {
    const tot = { A: 0, B: 0, undecided: 0, decided: 0 };
    const bySec = {};
    S.rows.forEach(r => {
        if (r.f.unscored) return;
        const w = weightOf(r.f);
        if (!w) return;
        if (r.ra.text === null && r.rb.text === null) return;
        const s = (bySec[r.f.section] ||= { A: 0, B: 0, undecided: 0 });
        const p = pickOf(r);
        if (!p) { tot.undecided++; s.undecided++; return; }
        tot.decided++;
        const add = p === 'A' ? [w, 0] : p === 'B' ? [0, w] : [w / 2, w / 2];
        tot.A += add[0]; tot.B += add[1]; s.A += add[0]; s.B += add[1];
    });
    return { tot, bySec };
}

const pts = v => (Math.round(v * 10) / 10).toString();

// ---------------------------------------------------------------- render

function headerCard(p, side) {
    const addr = cleanDisplayAddress(p.address, p.mls_id);
    const status = p.status && p.status !== 'Active' ? ` · ${esc(p.status)}` : '';
    const rank = p.pick_rank ? ` · Top Pick #${esc(p.pick_rank)}` : '';
    const hasRepair = !(p.repair_estimate === null || p.repair_estimate === undefined || p.repair_estimate === '');
    const repairVal = hasRepair ? Math.round(Number(p.repair_estimate)).toLocaleString() : '';
    const repair = S.mode === 'snapshot'
        ? `<div class="h2h-repair">Repairs / updates: ${hasRepair ? '$' + esc(repairVal) : 'not entered'}${p.repair_note ? ` · ${esc(p.repair_note)}` : ''}</div>`
        : `<div class="h2h-repair">
            <label>Repairs / updates $<input type="text" inputmode="numeric" maxlength="12" data-h2h="repair" data-mls="${esc(p.mls_id)}" value="${esc(repairVal)}" placeholder="0 if none"></label>
            <input type="text" maxlength="300" class="h2h-repair-note" data-h2h="repair_note" data-mls="${esc(p.mls_id)}" value="${esc(p.repair_note || '')}" placeholder="what for (roof, paint…)">
        </div>`;
    return `<div class="h2h-home h2h-home-${side}">
        <span class="h2h-side-tag">${side}</span>
        <img src="${esc(p.main_image_url || NO_PHOTO_IMG)}" alt="${esc(addr || 'Property photo')}" referrerpolicy="no-referrer">
        <div><div class="h2h-home-addr">${esc(addr)}</div>
        <div class="h2h-home-sub">${esc(p.city || '')} · ${p.price ? '$' + Math.round(p.price).toLocaleString() : ''}${status}${rank}</div>
        ${repair}</div>
    </div>`;
}

function rowVisible(r) {
    const empty = r.ra.text === null && r.rb.text === null;
    if (empty && !S.showEmpty) return false;
    const p = pickOf(r);
    switch (S.filter) {
        case 'diff': return !(r.ra.text && r.rb.text && String(r.ra.text).toLowerCase() === String(r.rb.text).toLowerCase());
        case 'undecided': return !r.f.unscored && weightOf(r.f) > 0 && !p && !empty;
        case 'A': return p === 'A';
        case 'B': return p === 'B';
        default: return true;
    }
}

function valueCell(rd, side, long) {
    if (rd.text === null) return `<div class="h2h-val h2h-val-${side} is-missing">not listed</div>`;
    return `<div class="h2h-val h2h-val-${side}${long ? ' is-long' : ''}">${esc(rd.text)}</div>`;
}

function rowHtml(r) {
    const k = esc(r.f.key);
    const label = `<div class="h2h-label">${esc(r.f.label)}${r.f.sub ? `<span class="h2h-label-sub">${esc(r.f.sub)}</span>` : ''}</div>`;
    if (r.f.unscored) {
        return `<div class="h2h-row is-unscored">${label}${valueCell(r.ra, 'a', r.f.long)}<div class="h2h-mid"></div>${valueCell(r.rb, 'b', r.f.long)}</div>`;
    }
    const pk = S.picks[r.f.key] || {};
    const p = pk.pick ?? null;
    const w = weightOf(r.f);
    const btn = (val, text) => `<button type="button" class="h2h-pick${p === val ? ' is-on' : ''}" data-h2h="pick" data-key="${k}" data-val="${val}" aria-pressed="${p === val}">${text}</button>`;
    const d = diffText(r.f, r.ra, r.rb);
    return `<div class="h2h-row${p === 'A' ? ' wins-a' : p === 'B' ? ' wins-b' : p === 'D' ? ' is-draw' : ''}${w === 0 ? ' is-weight0' : ''}">
        ${label}
        ${valueCell(r.ra, 'a')}
        <div class="h2h-mid">
            <div class="h2h-picks">${btn('A', 'A')}${btn('D', 'Draw')}${btn('B', 'B')}</div>
            <div class="h2h-meta">
                ${d ? `<span class="h2h-diff">${esc(d)}</span>` : ''}
                ${pk.by === 'user' ? `<span class="h2h-byyou">set by you · <button type="button" class="h2h-link" data-h2h="reset" data-key="${k}">reset</button></span>` : ''}
                <label class="h2h-weight" title="How much this field counts (0 = not scored)">wt <select data-h2h="weight" data-key="${k}">${[0, 1, 2, 3].map(n => `<option value="${n}"${n === w ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
            </div>
            <input type="text" class="h2h-why" maxlength="200" placeholder="why…" data-h2h="why" data-key="${k}" value="${esc(pk.why || '')}">
        </div>
        ${valueCell(r.rb, 'b')}
    </div>`;
}

/** Weights editor: every field for this pair, grouped by section, 0-3 each. */
function weightsPanelHtml() {
    const groups = SECTIONS.map(sec => {
        const rows = S.rows.filter(r => r.f.section === sec && !r.f.unscored);
        if (!rows.length) return '';
        const changed = rows.filter(r => weightOf(r.f) !== r.f.w).length;
        return `<details class="h2h-wgroup"${sec === 'More MLS details' ? '' : ' open'}>
            <summary>${esc(sec)} <span class="h2h-sec-count">${rows.length}${changed ? ` · ${changed} changed` : ''}</span></summary>
            <div class="h2h-wgrid">${rows.map(r => {
                const w = weightOf(r.f);
                return `<div class="h2h-wrow${w !== r.f.w ? ' is-changed' : ''}"><span>${esc(r.f.label)}${r.f.sub ? ` <small>${esc(r.f.sub)}</small>` : ''}</span>
                    <span class="h2h-wseg" role="group" aria-label="Weight for ${esc(r.f.label)}">${[0, 1, 2, 3].map(n =>
                        `<button type="button" class="${n === w ? 'is-on' : ''}" data-h2h="wset" data-key="${esc(r.f.key)}" data-val="${n}" aria-pressed="${n === w}">${n}</button>`).join('')}</span></div>`;
            }).join('')}</div></details>`;
    }).join('');
    return `<div class="h2h-weights">
        <div class="h2h-weights-head"><b>Weights</b> <span>0 = not scored · 3 = matters most. Changes here also become your default for new comparisons.</span>
            <span id="h2h-weight-status" class="h2h-weight-status"></span>
            <button type="button" class="h2h-chip" data-h2h="wreset">Reset all to defaults</button>
            <button type="button" class="h2h-chip is-on" data-h2h="weights">Done</button></div>
        ${groups}
    </div>`;
}

const fmtDate = s => { if (!s) return ''; const d = new Date(String(s).replace(' ', 'T') + (String(s).includes('Z') ? '' : 'Z')); return isNaN(d) ? '' : d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); };

function snapshotBanner() {
    if (S.mode !== 'snapshot') return '';
    const ch = S.changes;
    let list;
    if (ch === null) list = '<span>Checking for changes…</span>';
    else if (ch === false) list = '<span>One or both homes are no longer in your list, so current values can’t be checked.</span>';
    else if (!ch.length) list = '<span>Nothing tracked has changed since you saved.</span>';
    else list = `<ul>${ch.map(c => `<li><b>${c.side}</b> ${esc(c.label)}: ${esc(c.then ?? 'not listed')} → <b>${esc(c.now ?? 'not listed')}</b></li>`).join('')}</ul>`;
    return `<div class="h2h-snapshot">
        <div class="h2h-snapshot-head"><i data-lucide="history"></i> Saved ${esc(fmtDate(S.savedAt))}. You’re viewing the values as they were then.
            ${ch && ch !== false ? `<button type="button" class="h2h-chip is-on" data-h2h="refresh">Update to current values</button>` : ''}
            <button type="button" class="h2h-chip" data-h2h="rescore">Rescore with my current weights</button></div>
        <div class="h2h-snapshot-changes"><b>What changed since:</b> ${list}</div>
    </div>`;
}

function footerHtml() {
    const defTitle = `${cleanDisplayAddress(S.a.address, S.a.mls_id)} vs ${cleanDisplayAddress(S.b.address, S.b.mls_id)}`;
    return `<div class="h2h-footer">
        <label class="h2h-f-title">Title <input type="text" maxlength="120" data-h2h="title" value="${esc(S.title)}" placeholder="${esc(defTitle)}"></label>
        <label class="h2h-f-verdict">Your verdict <textarea maxlength="4000" rows="3" data-h2h="verdict" placeholder="Where you landed and why…">${esc(S.verdict)}</textarea></label>
        <div class="h2h-gemini" id="h2h-gemini">${geminiHtml()}</div>
        <div class="h2h-f-actions">
            ${S.id ? `<span class="h2h-f-saved">${S.dirty ? 'Unsaved changes' : 'Saved ' + esc(fmtDate(S.updatedAt || S.savedAt))}</span>` : ''}
            ${S.id ? `<button type="button" class="btn btn-secondary" data-h2h="delete"><i data-lucide="trash-2"></i> Delete</button>` : ''}
            <button type="button" class="btn btn-primary" data-h2h="save"><i data-lucide="save"></i> ${S.id ? 'Save changes' : 'Save comparison'}</button>
        </div>
    </div>`;
}

function render() {
    if (view === 'list') return; // the list renders itself
    const { tot, bySec } = score();
    const sum = tot.A + tot.B;
    const pctA = sum ? Math.round(tot.A / sum * 100) : 0;
    const leader = tot.A > tot.B ? 'A leads' : tot.B > tot.A ? 'B leads' : 'Even';
    const secLine = SECTIONS.filter(s => bySec[s] && (bySec[s].A || bySec[s].B))
        .map(s => `<span class="h2h-sec-score">${esc(s)} <b>A ${pts(bySec[s].A)} – ${pts(bySec[s].B)} B</b></span>`).join('');
    const chip = (val, text) => `<button type="button" class="h2h-chip${S.filter === val ? ' is-on' : ''}" data-h2h="filter" data-val="${val}">${text}</button>`;

    const sections = SECTIONS.map(sec => {
        const rows = S.rows.filter(r => r.f.section === sec && rowVisible(r));
        if (!rows.length) return '';
        const open = !S.collapsed.has(sec);
        const sc = bySec[sec];
        return `<section class="h2h-section">
            <button type="button" class="h2h-sec-head" data-h2h="toggle" data-sec="${esc(sec)}" aria-expanded="${open}">
                <i data-lucide="${open ? 'chevron-down' : 'chevron-right'}"></i> ${esc(sec)} <span class="h2h-sec-count">${rows.length}</span>
                ${sc && (sc.A || sc.B) ? `<span class="h2h-sec-tally">A ${pts(sc.A)} – ${pts(sc.B)} B</span>` : ''}
                ${sc && sc.undecided ? `<span class="h2h-sec-und">${sc.undecided} undecided</span>` : ''}
            </button>
            ${open ? `<div class="h2h-rows">${rows.map(rowHtml).join('')}</div>` : ''}
        </section>`;
    }).join('');

    document.getElementById('h2h-body').innerHTML = `
        ${snapshotBanner()}
        <div class="h2h-homes">${headerCard(S.a, 'A')}
            ${S.mode === 'live' ? `<button type="button" class="h2h-swap" data-h2h="swap" title="Swap sides" aria-label="Swap sides"><i data-lucide="arrow-left-right"></i></button>` : '<span></span>'}
            ${headerCard(S.b, 'B')}</div>
        <div class="h2h-scorebar">
            <div class="h2h-total">
                <span class="h2h-total-a">A <b>${pts(tot.A)}</b></span>
                <div class="h2h-meter" aria-hidden="true"><span style="width:${sum ? pctA : 50}%"></span></div>
                <span class="h2h-total-b"><b>${pts(tot.B)}</b> B</span>
                <span class="h2h-leader">${sum ? `${leader} · ${pctA}% / ${100 - pctA}%` : 'No picks yet'}${tot.undecided ? ` · <b>${tot.undecided} undecided</b>` : ''}</span>
            </div>
            ${secLine ? `<div class="h2h-sec-line">${secLine}</div>` : ''}
            <div class="h2h-filters"><button type="button" class="h2h-chip h2h-weights-btn${S.showWeights ? ' is-on' : ''}" data-h2h="weights"><i data-lucide="sliders-horizontal"></i> Weights</button>${chip('all', 'All')}${chip('diff', 'Differences only')}${chip('undecided', 'Undecided')}${chip('A', 'A wins')}${chip('B', 'B wins')}
                <label class="h2h-empty-toggle"><input type="checkbox" data-h2h="empty"${S.showEmpty ? ' checked' : ''}> Show empty fields</label></div>
        </div>
        ${S.showWeights ? weightsPanelHtml() : (sections || '<p class="my-home-loading">No fields match this filter.</p>')}
        ${footerHtml()}
        <p class="h2h-footnote">Monthly cost uses the compare panel's down payment and rate. Each saved comparison keeps the values, weights and tie-breaker it was saved with.</p>`;
    if (window.lucide) window.lucide.createIcons();
}

/** Re-render without losing the scroll position or which weight groups are open. */
function rerenderInPlace() {
    const scrollEl = document.querySelector('#modal-h2h .h2h-modal');
    const top = scrollEl ? scrollEl.scrollTop : 0;
    const openGroups = [...document.querySelectorAll('#modal-h2h .h2h-wgroup')].map(dEl => dEl.open);
    render();
    document.querySelectorAll('#modal-h2h .h2h-wgroup').forEach((dEl, i) => { if (openGroups[i] !== undefined) dEl.open = openGroups[i]; });
    if (scrollEl) scrollEl.scrollTop = top;
}

// ---------------------------------------------------------------- saving / loading comparisons

const homeMeta = p => ({ mls_id: String(p.mls_id), address: p.address || '', city: p.city || '', state: p.state || '', zip: p.zip || '',
    price: Number(p.price) || null, status: p.status || '', main_image_url: p.main_image_url || '', pick_rank: p.pick_rank || null,
    repair_estimate: p.repair_estimate ?? null, repair_note: p.repair_note || '' });

function buildSnapshot() {
    if (S.mode === 'snapshot') return S.snap;
    return {
        v: 1, taken_at: new Date().toISOString(), a: homeMeta(S.a), b: homeMeta(S.b), pay: S.ctx.pay,
        rows: S.rows.map(r => ({ key: r.f.key, label: r.f.label, section: r.f.section, sub: r.f.sub || '', type: r.f.type,
            unscored: !!r.f.unscored, long: !!r.f.long, w: r.f.w, better: r.f.better || null, a: r.ra, b: r.rb, auto: r.auto })),
    };
}

async function saveComparison() {
    const { tot, bySec } = score();
    const sum = tot.A + tot.B;
    const snap = buildSnapshot();
    const body = {
        public_id: S.id || '', mls_a: String(S.a.mls_id), mls_b: String(S.b.mls_id),
        title: S.title.trim(), verdict: S.verdict.trim(), picks: S.picks, weights: S.weights, snapshot: snap,
        score: { A: tot.A, B: tot.B, undecided: tot.undecided, pctA: sum ? Math.round(tot.A / sum * 100) : null, bySec },
    };
    if (!body.title) body.title = `${cleanDisplayAddress(S.a.address, S.a.mls_id)} vs ${cleanDisplayAddress(S.b.address, S.b.mls_id)}`.slice(0, 120);
    let res;
    try { res = await post('h2h_save', body); } catch (e) { res = null; }
    if (!res || !res.success) { showToast(res?.error || 'Could not save the comparison.', 'error'); return false; }
    const c = res.comparison;
    if (!S) return true;
    S.id = c.public_id;
    S.title = c.title || '';
    S.snap = c.snapshot;
    S.savedAt = S.savedAt || c.created_at;
    S.updatedAt = c.updated_at;
    if (S.mode === 'live') S.savedAt = c.updated_at; // the values on screen are now the saved ones
    S.dirty = false;
    showToast('Comparison saved', 'success');
    render();
    return true;
}

export async function openSavedComparison(id) {
    if (S && S.dirty && !window.confirm('You have unsaved changes in the open comparison. Discard them?')) return;
    view = 'compare';
    showModal('Loading saved comparison…');
    let res;
    try { res = await apiFetch(`backend/api.php?action=h2h_get&id=${encodeURIComponent(id)}`); } catch (e) { res = null; }
    if (!res || !res.success) { document.getElementById('h2h-body').innerHTML = `<p class="my-home-loading">${esc(res?.error || 'Could not load that comparison.')}</p>`; return; }
    const c = res.comparison;
    const snap = c.snapshot || {};
    S = { ...blankState(), mode: 'snapshot', id: c.public_id, title: c.title || '', verdict: c.verdict || '',
        savedAt: snap.taken_at || c.updated_at, updatedAt: c.updated_at, snap, a: snap.a || {}, b: snap.b || {},
        picks: c.picks || {}, weights: cleanWeights(c.weights), gemini: parseGemini(c.gemini_text), changes: null };
    compute();
    render();
    detectChanges();
}

/** Compare the snapshot with today's values for the fields in CHANGE_KEYS (plus listing status). */
async function detectChanges() {
    const s = S;
    const a = findProp(s.snap.a?.mls_id), b = findProp(s.snap.b?.mls_id);
    if (!a || !b) { s.changes = false; if (S === s) render(); return; }
    const ctx = await liveContext(a, b);
    if (S !== s) return;
    s.liveA = a; s.liveB = b; s.liveCtx = ctx;
    const fields = buildFields(a, b);
    const out = [];
    [['A', 'a', a, s.snap.a], ['B', 'b', b, s.snap.b]].forEach(([side, k, p, then]) => {
        if ((then?.status || '') !== (p.status || '')) out.push({ side, label: 'Status', then: then?.status || null, now: p.status || null });
    });
    CHANGE_KEYS.forEach(key => {
        const f = fields.find(x => x.key === key);
        const saved = (s.snap.rows || []).find(r => r.key === key);
        if (!f || !saved) return;
        [['A', a, saved.a], ['B', b, saved.b]].forEach(([side, p, then]) => {
            const now = readField(f, p, ctx);
            if ((then?.text ?? null) !== (now.text ?? null)) out.push({ side, label: f.label, then: then?.text ?? null, now: now.text ?? null });
        });
    });
    s.changes = out;
    if (S === s) rerenderInPlace();
}

/** Switch a reopened comparison to today's values; the buyer's own picks and notes stay. */
function refreshToCurrent() {
    if (!S.liveA || !S.liveB) return;
    S.mode = 'live';
    S.a = S.liveA; S.b = S.liveB; S.ctx = S.liveCtx;
    S.changes = null;
    compute();
    S.dirty = true;
    render();
    showToast('Updated to current values. Save to keep them.', 'info');
}

async function rescoreWithCurrent() {
    S.weights = await loadWeights();
    S.dirty = true;
    rerenderInPlace();
    showToast('Rescored with your current weights. Save to keep this.', 'info');
}

async function deleteComparison() {
    if (!S?.id || !window.confirm('Delete this saved comparison? This can’t be undone.')) return;
    let res;
    try { res = await post('h2h_delete', { public_id: S.id }); } catch (e) { res = null; }
    if (!res || !res.success) { showToast(res?.error || 'Could not delete the comparison.', 'error'); return; }
    showToast('Comparison deleted', 'success');
    S = null;
    openSavedList(true);
}

// ---------------------------------------------------------------- saved list

export async function openSavedList(skipDirtyCheck = false) {
    if (!skipDirtyCheck && S && S.dirty && !window.confirm('You have unsaved changes in the open comparison. Discard them?')) return;
    S = null;
    view = 'list';
    showModal('Loading saved comparisons…');
    let res;
    try { res = await apiFetch('backend/api.php?action=h2h_list'); } catch (e) { res = null; }
    const body = document.getElementById('h2h-body');
    if (!res || !res.success) { body.innerHTML = `<p class="my-home-loading">${esc(res?.error || 'Could not load your saved comparisons.')}</p>`; return; }
    const list = res.comparisons || [];
    body.innerHTML = list.length ? `<ul class="h2h-saved-list">${list.map(c => {
        const sc = c.score || {};
        const sum = (Number(sc.A) || 0) + (Number(sc.B) || 0);
        const lead = sum ? (sc.A > sc.B ? 'A leads' : sc.B > sc.A ? 'B leads' : 'Even') : 'No picks';
        return `<li class="h2h-saved-item">
            <button type="button" class="h2h-saved-open" data-h2h="open" data-id="${esc(c.public_id)}">
                <span class="h2h-saved-imgs"><img src="${esc(c.img_a || NO_PHOTO_IMG)}" alt="" referrerpolicy="no-referrer"><img src="${esc(c.img_b || NO_PHOTO_IMG)}" alt="" referrerpolicy="no-referrer"></span>
                <span class="h2h-saved-text">
                    <b>${esc(c.title || 'Untitled comparison')}</b>
                    <span>A: ${esc(cleanDisplayAddress(c.addr_a, c.mls_a))}${c.status_a && c.status_a !== 'Active' ? ` (${esc(c.status_a)})` : ''} · B: ${esc(cleanDisplayAddress(c.addr_b, c.mls_b))}${c.status_b && c.status_b !== 'Active' ? ` (${esc(c.status_b)})` : ''}</span>
                    <span>A ${pts(Number(sc.A) || 0)} – ${pts(Number(sc.B) || 0)} B · ${lead}${sc.undecided ? ` · ${esc(sc.undecided)} undecided` : ''} · saved ${esc(fmtDate(c.updated_at))}</span>
                    ${c.changed && c.changed.length ? `<span class="h2h-saved-changed">Changed since: ${esc(c.changed.join(', '))}</span>` : ''}
                </span>
            </button>
        </li>`;
    }).join('')}</ul>` : '<p class="my-home-loading">No saved comparisons yet. Open Head-to-Head from the compare panel with two homes selected, then Save.</p>';
    if (window.lucide) window.lucide.createIcons();
}

// ---------------------------------------------------------------- Gemini tie-breaker (spec §8)

const AI_SYSTEM = `You are helping a home buyer choose between two finalist homes, A and B, that have already passed his must-haves.
You get a field-by-field comparison he built in his app: each field's value for A and B, his pick (A, B, Draw or undecided), how much the field counts to him (weight 0-3, 3 = matters most) and his own "why" note, plus section totals, his tour notes and his verdict so far.
Use ONLY the facts given. Never invent prices, sizes, features, history or neighborhood facts that are not in the data; if something important is missing, say it is missing.
Weight what HE weighted: high-weight fields with a clear gap decide it; ignore low-weight noise.
Point out where his picks contradict each other or his tour impressions (e.g. B wins most space fields but scored lower on "Would live here"), and undecided high-weight fields that could flip the result.
Be concrete and short: one sentence per item, with numbers where they exist. At most 5 items per list.
Reply as JSON with: headline, leaning (one of: Lean A, Lean B, Too close to call), tradeoffs[] (what he is really trading off between the two), deciding[] (the fields actually deciding it and why), contradictions[], questions[] (to ask the agent or seller before choosing), bottom_line (2-3 sentences).`;

const AI_SCHEMA = {
    type: 'OBJECT',
    properties: {
        headline: { type: 'STRING' },
        leaning: { type: 'STRING', enum: ['Lean A', 'Lean B', 'Too close to call'] },
        tradeoffs: { type: 'ARRAY', items: { type: 'STRING' } },
        deciding: { type: 'ARRAY', items: { type: 'STRING' } },
        contradictions: { type: 'ARRAY', items: { type: 'STRING' } },
        questions: { type: 'ARRAY', items: { type: 'STRING' } },
        bottom_line: { type: 'STRING' },
    },
    required: ['headline', 'leaning', 'tradeoffs', 'deciding', 'contradictions', 'questions', 'bottom_line'],
};

function parseGemini(text) {
    if (!text) return null;
    try { const g = JSON.parse(text); return g && g.result ? g : null; } catch (e) { return null; }
}

const clip = (t, n) => { const v = String(t ?? ''); return v.length > n ? v.slice(0, n) + '…' : v; };

/** The comparison as plain text for Gemini: every field with a value, plus picks, weights and notes. */
function buildAiPrompt() {
    const { tot, bySec } = score();
    const addr = p => `${cleanDisplayAddress(p.address, p.mls_id)}, ${p.city || ''}`;
    const lines = [
        `## Homes`, `A: ${addr(S.a)}`, `B: ${addr(S.b)}`, '',
        `## Score so far (his weights)`,
        `Total: A ${pts(tot.A)} - ${pts(tot.B)} B, ${tot.undecided} high-or-mid weight fields still undecided`,
        ...SECTIONS.filter(sec => bySec[sec]).map(sec => `${sec}: A ${pts(bySec[sec].A)} - ${pts(bySec[sec].B)} B${bySec[sec].undecided ? ` (${bySec[sec].undecided} undecided)` : ''}`),
        '', `## Field by field (field | A | B | his pick | weight | his note)`,
    ];
    let lastSec = '';
    S.rows.forEach(r => {
        if (r.ra.text === null && r.rb.text === null) return;
        const w = r.f.unscored ? null : weightOf(r.f);
        const same = r.ra.text && r.rb.text && String(r.ra.text).toLowerCase() === String(r.rb.text).toLowerCase();
        // Skip zero-weight MLS extras that match; they add length without telling Gemini anything.
        if (r.f.section === 'More MLS details' && (w === 0 || same)) return;
        if (r.f.section !== lastSec) { lines.push(`### ${r.f.section}`); lastSec = r.f.section; }
        const n = r.f.long ? 700 : 240;
        const label = r.f.sub ? `${r.f.label} (${r.f.sub})` : r.f.label;
        if (r.f.unscored) { lines.push(`${label} | A: ${clip(r.ra.text ?? 'not listed', n)} | B: ${clip(r.rb.text ?? 'not listed', n)} | (reference only)`); return; }
        const pk = S.picks[r.f.key] || {};
        const pick = pk.pick === 'D' ? 'Draw' : (pk.pick || 'undecided');
        lines.push(`${label} | A: ${clip(r.ra.text ?? 'not listed', n)} | B: ${clip(r.rb.text ?? 'not listed', n)} | ${pick}${pk.by === 'user' ? ' (his call)' : ''} | w${w}${pk.why ? ` | ${clip(pk.why, 200)}` : ''}`);
    });
    if (S.verdict.trim()) lines.push('', '## His verdict so far', clip(S.verdict.trim(), 2000));
    return clip(lines.join('\n'), 60000);
}

function geminiHtml() {
    if (!S) return '';
    const g = S.gemini;
    const keyState = getGeminiKeyState();
    let controls;
    if (S.aiBusy) controls = '<p class="my-home-note"><i data-lucide="loader"></i> Gemini is weighing the two homes…</p>';
    else if (keyState === 'none') controls = `<p class="my-home-note">Uses the same Gemini key as AI Analysis. <button type="button" class="btn btn-secondary" data-h2h="ai-setup"><i data-lucide="settings"></i> Open AI Setup</button></p>`;
    else if (keyState === 'locked') controls = `<div class="hc-ai-unlock"><input type="password" id="h2h-ai-pin" placeholder="Gemini PIN" autocomplete="current-password">
        <button type="button" class="btn btn-gold" data-h2h="ai-unlock"><i data-lucide="lock-open"></i> Unlock &amp; ${g ? 'Re-run' : 'Run'} tie-breaker</button></div>`;
    else controls = `<button type="button" class="btn btn-gold" data-h2h="ai-run"><i data-lucide="sparkles"></i> ${g ? 'Re-run tie-breaker' : 'Gemini tie-breaker'}</button>`;
    const err = S.aiError ? `<p class="hc-ai-error">${esc(S.aiError)}</p>` : '';
    const head = `<div class="h2h-gemini-head"><b><i data-lucide="sparkles"></i> Gemini tie-breaker</b>
        <span>Reads this comparison as it stands (your picks, weights, notes and verdict). No web search. ${S.id ? '' : 'Runs after saving.'}</span></div>`;
    if (!g) return head + controls + err;
    const r = g.result || {};
    const list = (items, cls) => (items || []).length ? `<ul class="${cls}">${items.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '<p class="my-home-note">None noted.</p>';
    return `${head}
        <div class="hc-ai-result">
            <div class="hc-ai-head"><span class="hc-ai-verdict">${esc(r.leaning || '')}</span><b>${esc(r.headline || '')}</b></div>
            <div class="hc-ai-cols">
                <div><h4>What you're trading off</h4>${list(r.tradeoffs, '')}</div>
                <div><h4>What's actually deciding it</h4>${list(r.deciding, 'hc-ai-gains')}</div>
            </div>
            <div class="hc-ai-cols">
                <div><h4>Where your picks disagree</h4>${list(r.contradictions, 'hc-ai-losses')}</div>
                <div><h4>Ask before choosing</h4>${list(r.questions, 'hc-ai-questions')}</div>
            </div>
            <h4>Bottom line</h4><p>${esc(r.bottom_line || '')}</p>
            <p class="my-home-note">Gemini ${esc(g.model || '')}${g.at ? ' · ' + esc(fmtDate(g.at)) : ''}${g.score ? ` · run at A ${esc(pts(g.score.A))} – ${esc(pts(g.score.B))} B` : ''}. Re-run after changing picks or weights.</p>
        </div>
        ${controls}${err}`;
}

function renderGemini() {
    const el = document.getElementById('h2h-gemini');
    if (!el || !S) return;
    el.innerHTML = geminiHtml();
    if (window.lucide) window.lucide.createIcons();
}

async function runTieBreaker() {
    if (!S || S.aiBusy) return;
    if (S.gemini && !window.confirm('Replace the saved tie-breaker with a new one?')) return;
    // The write-up is stored on the saved comparison, so save first (and save edits so they match).
    if (!S.id || S.dirty) {
        if (!(await saveComparison())) return;
    }
    const s = S;
    s.aiBusy = true; s.aiError = '';
    renderGemini();
    try {
        const { data, model } = await generateGeminiJson(AI_SYSTEM, buildAiPrompt(), AI_SCHEMA);
        const { tot } = score();
        const g = { result: data, model, at: new Date().toISOString(), score: { A: tot.A, B: tot.B } };
        const res = await post('h2h_save_gemini', { public_id: s.id, gemini: g });
        if (!res || !res.success) throw new Error(res?.error || 'Gemini answered, but the write-up could not be saved.');
        s.gemini = g;
    } catch (e) {
        s.aiError = e?.message || 'Gemini did not answer.';
    } finally {
        s.aiBusy = false;
        if (S === s) renderGemini();
    }
}

async function unlockAndRun() {
    const pin = document.getElementById('h2h-ai-pin')?.value || '';
    try { await unlockGeminiVault(pin); } catch (e) { showToast(e?.message || 'That PIN did not unlock the key.', 'error'); return; }
    runTieBreaker();
}

// ---------------------------------------------------------------- events

function setPick(key, val) {
    const cur = S.picks[key] || { why: '' };
    const row = S.rows.find(r => r.f.key === key);
    const next = cur.pick === val ? null : val; // clicking the active pick clears it
    S.picks[key] = { pick: next, by: next === row?.auto ? 'auto' : 'user', why: cur.why || '' };
    S.dirty = true;
}

function onClick(e) {
    const el = e.target.closest('[data-h2h]');
    if (!el) return;
    const act = el.dataset.h2h;
    if (act === 'close') return close();
    if (act === 'list') return openSavedList();
    if (act === 'open') return openSavedComparison(el.dataset.id);
    if (!S) return;
    if (act === 'pick') { setPick(el.dataset.key, el.dataset.val); return rerenderInPlace(); }
    if (act === 'reset') { const r = S.rows.find(x => x.f.key === el.dataset.key); S.picks[el.dataset.key] = { pick: r?.auto ?? null, by: 'auto', why: S.picks[el.dataset.key]?.why || '' }; S.dirty = true; return rerenderInPlace(); }
    if (act === 'filter') { S.filter = el.dataset.val; S.showWeights = false; return render(); }
    if (act === 'weights') { S.showWeights = !S.showWeights; return render(); }
    if (act === 'wset') { return setWeight(el.dataset.key, Number(el.dataset.val)); }
    if (act === 'wreset') {
        if (!window.confirm('Put every field back to its default weight (here and for new comparisons)?')) return;
        S.weights = {}; weightsCache = {}; S.dirty = true; saveGlobalWeights(); rerenderInPlace(); return setWeightStatus('Saving…');
    }
    if (act === 'toggle') { const s = el.dataset.sec; S.collapsed.has(s) ? S.collapsed.delete(s) : S.collapsed.add(s); return rerenderInPlace(); }
    if (act === 'swap' && S.mode === 'live') {
        [S.a, S.b] = [S.b, S.a];
        Object.values(S.picks).forEach(p => { if (p.pick === 'A') p.pick = 'B'; else if (p.pick === 'B') p.pick = 'A'; });
        compute();
        S.dirty = true;
        return render();
    }
    if (act === 'save') { saveComparison(); return; }
    if (act === 'delete') { deleteComparison(); return; }
    if (act === 'refresh') return refreshToCurrent();
    if (act === 'rescore') { rescoreWithCurrent(); return; }
    if (act === 'ai-run') { runTieBreaker(); return; }
    if (act === 'ai-unlock') { unlockAndRun(); return; }
    if (act === 'ai-setup' && typeof window.openAiSetupModal === 'function') { close(); if (!S) window.openAiSetupModal(); return; }
}

function onChange(e) {
    const el = e.target;
    if (!S) return;
    if (el.dataset.h2h === 'weight') {
        setWeight(el.dataset.key, Number(el.value));
    } else if (el.dataset.h2h === 'repair' || el.dataset.h2h === 'repair_note') {
        saveRepair(el);
    } else if (el.dataset.h2h === 'empty') {
        S.showEmpty = el.checked; render();
    }
}

/** Repair estimate + note live on the home (user_metadata), so they're the same in every comparison. */
async function saveRepair(el) {
    if (S.mode !== 'live') return;
    const p = [S.a, S.b].find(h => String(h.mls_id) === String(el.dataset.mls));
    if (!p) return;
    const body = { mls_id: p.mls_id };
    if (el.dataset.h2h === 'repair') {
        const t = el.value.replace(/[$,\s]/g, '');
        if (t !== '' && !/^\d+(\.\d+)?$/.test(t)) { showToast('Enter the repair estimate as a dollar amount, e.g. 25000', 'warning'); return; }
        const n = t === '' ? null : Math.round(Number(t));
        if (n !== null && n > 2000000) { showToast('Repair estimate must be $2,000,000 or less', 'warning'); return; }
        body.repair_estimate = n;
    } else {
        body.repair_note = el.value.trim().slice(0, 300);
    }
    try {
        const res = await post('update_user_data', body);
        if (!res || !res.success) throw new Error(res?.error || 'Could not save the repair estimate');
    } catch (e) { showToast(e.message || 'Could not save the repair estimate', 'error'); return; }
    if (!S || S.mode !== 'live') return;
    if ('repair_estimate' in body) p.repair_estimate = body.repair_estimate;
    if ('repair_note' in body) p.repair_note = body.repair_note;
    compute();
    if (S.id) S.dirty = true; // the saved snapshot still has the old estimate
    rerenderInPlace();
}

/** A weight change applies to this comparison and also becomes the buyer's default for new ones. */
function setWeight(key, w) {
    if (!Number.isInteger(w) || w < 0 || w > 3) return;
    const f = S.fields.find(x => x.key === key);
    if (!f) return;
    weightsCache = weightsCache || {};
    if (w === f.w) { delete S.weights[key]; delete weightsCache[key]; } else { S.weights[key] = w; weightsCache[key] = w; }
    S.dirty = true;
    saveGlobalWeights();
    rerenderInPlace();
    setWeightStatus('Saving…');
}

function onInput(e) {
    const el = e.target;
    if (!S) return;
    const act = el.dataset.h2h;
    if (act === 'why') {
        const k = el.dataset.key;
        S.picks[k] = { ...(S.picks[k] || { pick: null, by: 'auto' }), why: el.value.slice(0, 200) };
    } else if (act === 'title') {
        S.title = el.value.slice(0, 120);
    } else if (act === 'verdict') {
        S.verdict = el.value.slice(0, 4000);
    } else return;
    if (!S.dirty) {
        S.dirty = true;
        const tag = document.querySelector('#modal-h2h .h2h-f-saved');
        if (tag) tag.textContent = 'Unsaved changes';
    }
}

function close() {
    if (S && S.dirty && !window.confirm('You have unsaved changes. Close without saving?')) return;
    document.getElementById('modal-h2h')?.classList.remove('active');
    S = null;
    view = 'compare';
}

// "Saved comparisons" in the user menu (index.html, data-open-h2h-saved).
document.addEventListener('click', e => {
    if (e.target.closest('[data-open-h2h-saved]')) {
        document.getElementById('user-dropdown-menu')?.classList.remove('active', 'show', 'open');
        openSavedList();
    }
});

window.openHeadToHead = openHeadToHead;
window.openSavedComparisons = openSavedList;
