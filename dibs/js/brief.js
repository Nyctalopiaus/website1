/**
 * Smart Brief editor + Fit Score badge (backend/brief.php).
 *
 *  - fitBadgeHtml(mlsId): the score chip on each grid card. The first call loads every score
 *    once (action=fit_scores) and re-renders the view when they arrive.
 *  - Clicking a chip opens a popover listing why the listing scored what it did.
 *  - "My Brief" in the profile menu (or window.openBriefModal(clientId) for an agent) opens the
 *    editor: pick a template, switch criteria on, set must / prefer / avoid, weight and target.
 */
import { state } from './state.js';
import { apiFetch } from './api.js';
import { escapeHtml } from './properties.js';
import { showToast } from './toast.js';
import { renderActiveView } from './views.js';

const esc = v => escapeHtml(String(v ?? ''));
const API = 'backend/api.php';

state.fitScores = {};
let scoreState = 'idle';      // idle | loading | done
let catalog = null;           // [{key,label,group,kind,unit,multiple,modes}]
let templates = null;         // {key: {label, criteria}}
let statuses = [];
let options = {};             // {city: [{value, count}], ...} from the listing data
let editor = null;            // {clientId, viewer, brief}

const BAND_LABEL = { perfect: 'Perfect match', strong: 'Strong match', fair: 'Fair match', weak: 'Weak match' };
const MODE_LABEL = { must: 'Must have', prefer: 'Nice to have', avoid: 'Deal-breaker' };
// Stored as weight 1-5; only shown for nice-to-haves, the only mode where it changes the ranking.
const IMPORTANCE = [[1, 'A little'], [2, 'Somewhat'], [3, 'Important'], [4, 'Very important'], [5, 'Top priority']];
const RESULT_ICON = { pass: 'check', partial: 'circle-dot', miss: 'x', dealbreaker: 'ban', unconfirmed: 'circle-help', unknown: 'minus' };
const STATUS_LABEL = { ActiveUnderContract: 'Active Under Contract', ComingSoon: 'Coming Soon' };

function isRealtorLogin() {
    return (state.currentUserProfile?.role || '') === 'realtor';
}

// ------------------------------------------------------------------ scores + badge

export async function loadFitScores(force = false) {
    if (!state.authenticated || isRealtorLogin()) return;
    if (scoreState === 'loading' || (scoreState === 'done' && !force)) return;
    scoreState = 'loading';
    try {
        const res = await apiFetch(`${API}?action=fit_scores`);
        state.fitScores = (res && res.success && res.scores) ? res.scores : {};
    } catch (e) {
        state.fitScores = {};
    }
    scoreState = 'done';
}

let scoresFor = null;         // login the loaded scores belong to

export function fitBadgeHtml(mlsId) {
    if (!state.authenticated || isRealtorLogin()) return '';
    const who = state.currentUserProfile?.username || state.currentUser || null;
    if (scoreState === 'done' && scoresFor !== who) { scoreState = 'idle'; state.fitScores = {}; }
    if (scoreState === 'idle') {
        scoresFor = who;
        loadFitScores().then(() => { if (Object.keys(state.fitScores).length) renderActiveView(); });
        return '';
    }
    const s = state.fitScores[String(mlsId)];
    if (!s || s.score === null || s.score === undefined) return '';
    return `<button type="button" class="fit-badge fit-badge--${esc(s.band)}" data-fit-mls="${esc(mlsId)}"
        title="${esc(BAND_LABEL[s.band] || 'Fit Score')}: see why" aria-label="Fit score ${s.score}, ${esc(BAND_LABEL[s.band] || '')}. See why.">
        <span class="fit-badge-num">${s.score}</span><span class="fit-badge-lbl">Fit</span></button>`;
}

function closePopover() {
    document.getElementById('fit-popover')?.remove();
}

function openPopover(badge) {
    closePopover();
    // Realtor-view badges carry data-fit-source="realtor": scores for the selected client.
    const fromRealtor = badge.dataset.fitSource === 'realtor';
    const s = (fromRealtor ? state.realtorFitScores : state.fitScores)?.[badge.dataset.fitMls];
    if (!s) return;
    const pop = document.createElement('div');
    pop.id = 'fit-popover';
    pop.className = 'fit-popover';
    pop.setAttribute('role', 'dialog');
    pop.setAttribute('aria-label', 'Why this Fit Score');
    pop.innerHTML = `
        <div class="fit-popover-head fit-popover-head--${esc(s.band)}">
            <span class="fit-popover-score">${s.score}</span>
            <span class="fit-popover-band">${esc(BAND_LABEL[s.band] || '')}</span>
        </div>
        <ul class="fit-reasons">
            ${s.reasons.map(r => `
                <li class="fit-reason fit-reason--${esc(r.result)}">
                    <i data-lucide="${RESULT_ICON[r.result] || 'minus'}"></i>
                    <div>
                        <div class="fit-reason-name">${esc(r.criterion)} <span class="fit-reason-mode">${esc(MODE_LABEL[r.mode] || '')}${r.agent_only ? ' · agent only' : ''}</span></div>
                        <div class="fit-reason-detail">${esc(r.detail)}</div>
                    </div>
                </li>`).join('')}
        </ul>
        <button type="button" class="btn btn-secondary fit-popover-edit" data-brief-open="${fromRealtor ? esc(state.realtorFitClientId || '') : ''}"><i data-lucide="sliders-horizontal"></i> ${fromRealtor ? "Edit client's brief" : 'Edit brief'}</button>`;
    document.body.appendChild(pop);
    const r = badge.getBoundingClientRect();
    const w = pop.offsetWidth;
    const left = Math.max(8, Math.min(window.scrollX + r.right - w, window.scrollX + document.documentElement.clientWidth - w - 8));
    pop.style.left = `${left}px`;
    pop.style.top = `${window.scrollY + r.bottom + 8}px`;
    if (window.lucide) window.lucide.createIcons();
}

// Capture phase so the card's own onclick (open details) never fires for the badge.
document.addEventListener('click', event => {
    const t = event.target;
    if (!(t instanceof Element)) return;
    const badge = t.closest('.fit-badge, [data-fit-why]');
    if (badge) {
        event.stopPropagation();
        event.preventDefault();
        openPopover(badge);
        return;
    }
    const opener = t.closest('[data-brief-open]');
    if (opener) {
        closePopover();
        openBriefModal(opener.dataset.briefOpen || null);
        return;
    }
    if (!t.closest('#fit-popover')) closePopover();
}, true);

window.addEventListener('scroll', closePopover, { passive: true });

// ------------------------------------------------------------------ editor

function catalogDef(key) {
    return catalog.find(c => c.key === key);
}

function newId(key) {
    return `${key}-${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
}

function listVal(v) {
    return Array.isArray(v) ? v.join(', ') : (v ?? '');
}

// Every control sits under a visible label, so a filled box still says what it is.
function field(label, control, wide = false) {
    return `<label class="brief-field${wide ? ' brief-field--wide' : ''}"><span>${esc(label)}</span>${control}</label>`;
}

function numInput(name, value, label, step = 'any') {
    return field(label, `<input type="number" step="${step}" data-t="${name}" value="${esc(value ?? '')}">`);
}

function textInput(name, value, label, placeholder = '') {
    return field(label, `<input type="text" data-t="${name}" value="${esc(value ?? '')}" placeholder="${esc(placeholder)}">`, true);
}

const fmtMoney = v => v >= 1e6 ? `$${+(v / 1e6).toFixed(2)}M` : `$${Math.round(v / 1000)}K`;
const k = a => a.map(v => v * 1000);

// Familiar MLS-style steps. [values, formatter]. Plain number boxes are used for everything else.
const PRESETS = {
    price: [k([150, 200, 250, 300, 350, 400, 450, 500, 550, 600, 650, 700, 750, 800, 850, 900, 950, 1000, 1250, 1500, 2000, 3000]), fmtMoney],
    finished_sqft: [[800, 1000, 1250, 1500, 1750, 2000, 2250, 2500, 2750, 3000, 3500, 4000, 5000], v => `${v.toLocaleString()} sq ft`],
    lot_size: [[0.1, 0.15, 0.25, 0.5, 0.75, 1, 2, 5, 10, 20], v => `${v} acre${v === 1 ? '' : 's'}`],
    year_built: [[1950, 1960, 1970, 1980, 1990, 2000, 2005, 2010, 2015, 2020, 2025], v => String(v)],
};
const AT_LEAST = {
    beds: [1, 2, 3, 4, 5, 6],
    baths: [1, 1.5, 2, 2.5, 3, 4],
    garage: [1, 2, 3, 4],
};

/** A "No min / No max" dropdown of preset steps; a saved value off the list is kept as its own option. */
function presetSelect(name, value, values, fmt, emptyLabel) {
    const v = (value === null || value === undefined || value === '' || Number(value) === 0) ? null : Number(value);
    const opts = [...values];
    if (v !== null && !opts.includes(v)) opts.push(v);
    opts.sort((a, b) => a - b);
    return `<select data-t="${name}"><option value="">${emptyLabel}</option>${opts.map(o => `<option value="${o}" ${o === v ? 'selected' : ''}>${esc(fmt(o))}</option>`).join('')}</select>`;
}

/**
 * Checkboxes built from the values that actually appear in the listing data (with counts).
 * Picks that no longer have listings stay visible and checked, marked "0", so nothing is lost.
 */
function checklistHtml(key, selected) {
    const chosen = new Set(selected.map(v => String(v).toLowerCase()));
    const opts = [...(options[key] || [])];
    selected.forEach(v => {
        if (!opts.some(o => o.value.toLowerCase() === String(v).toLowerCase())) opts.push({ value: String(v), count: 0 });
    });
    if (!opts.length) return '<p class="brief-empty">No values for this in your listings yet.</p>';
    const filter = opts.length > 10
        ? `<input type="search" class="brief-check-filter" data-filter placeholder="Filter ${opts.length} options" aria-label="Filter options">` : '';
    return `<div class="brief-checklist">${filter}<div class="brief-checks brief-checks--grid">${opts.map(o => `
        <label data-opt-label="${esc(o.value.toLowerCase())}"><input type="checkbox" data-t="opt" value="${esc(o.value)}" ${chosen.has(o.value.toLowerCase()) ? 'checked' : ''}>
        ${esc(o.value)} <span class="brief-count">${o.count}</span></label>`).join('')}</div></div>`;
}

function targetHtml(c, def) {
    const t = c.target;
    const unit = def.unit ? ` (${def.unit})` : '';
    if (AT_LEAST[c.key]) {
        return field('At least', presetSelect('value', t, AT_LEAST[c.key], v => `${v}+`, 'Any'));
    }
    if (PRESETS[c.key] && def.kind === 'range') {
        const [values, fmt] = PRESETS[c.key];
        return field('Min', presetSelect('min', t?.min, values, fmt, 'No min')) + field('Max', presetSelect('max', t?.max, values, fmt, 'No max'));
    }
    switch (def.kind) {
        case 'min': return numInput('value', t, `At least${unit}`);
        case 'max': return numInput('value', t, `No more than${unit}`);
        case 'range': return numInput('min', t?.min, `Min${unit}`) + numInput('max', t?.max, `Max${unit}`);
        case 'in':
            if (c.key === 'status') {
                const on = new Set(t || []);
                return `<div class="brief-checks">${statuses.map(s => `<label><input type="checkbox" data-t="status" value="${esc(s)}" ${on.has(s) ? 'checked' : ''}> ${esc(STATUS_LABEL[s] || s)}</label>`).join('')}</div>`;
            }
            return checklistHtml(c.key, t || []);
        case 'bool':
            return field('Should be', `<select data-t="bool"><option value="1" ${t !== false ? 'selected' : ''}>Yes</option><option value="0" ${t === false ? 'selected' : ''}>No</option></select>`);
        case 'payment':
            return numInput('max', t?.max, 'Max per month ($)') + numInput('rate_pct', t?.rate_pct, 'Interest rate (%)') +
                numInput('down_pct', t?.down_pct ?? 20, 'Down payment (%)') + numInput('term_years', t?.term_years ?? 30, 'Loan term (years)', '1');
        case 'radius':
            return textInput('label', t?.label, 'Place', 'e.g. work') + numInput('lat', t?.lat, 'Latitude') +
                numInput('lng', t?.lng, 'Longitude') + numInput('miles', t?.miles, 'Within (miles)');
        case 'keyword':
            return textInput('keywords', listVal(t?.keywords), 'Words or phrases (comma-separated)');
        case 'custom':
            return textInput('label', t?.label, 'Name', 'e.g. 6 ft privacy fence') +
                textInput('keywords', listVal(t?.keywords), 'Words in the listing that confirm it', 'e.g. 6 ft fence, privacy fence') +
                textInput('note', t?.note, 'Note (optional)');
    }
    return '';
}

function rowHtml(c, idx) {
    const def = catalogDef(c.key);
    if (!def) return '';
    const name = c.key === 'custom' && c.target?.label ? c.target.label : def.label;
    return `
        <div class="brief-row ${c.enabled === false ? 'is-off' : ''}" data-idx="${idx}">
            <label class="brief-row-name">
                <input type="checkbox" data-f="enabled" ${c.enabled === false ? '' : 'checked'}>
                <span>${esc(name)}</span>
            </label>
            <div class="brief-row-controls">
                <select data-f="mode" aria-label="How it counts">
                    ${def.modes.map(m => `<option value="${m}" ${c.mode === m ? 'selected' : ''}>${MODE_LABEL[m]}</option>`).join('')}
                </select>
                <select data-f="weight" aria-label="How important" ${c.mode === 'prefer' ? '' : 'hidden'}>
                    ${IMPORTANCE.map(([w, label]) => `<option value="${w}" ${Number(c.weight) === w ? 'selected' : ''}>${label}</option>`).join('')}
                </select>
                ${editor.viewer === 'agent' ? `<label class="brief-agent-only" title="Hidden from the client"><input type="checkbox" data-f="agent_only" ${c.visibility === 'agent_only' ? 'checked' : ''}> Agent only</label>` : ''}
                <button type="button" class="brief-remove" data-brief="remove" aria-label="Remove ${esc(name)}"><i data-lucide="x"></i></button>
            </div>
            <div class="brief-row-target">${targetHtml(c, def)}</div>
        </div>`;
}

function render() {
    const body = document.getElementById('brief-body');
    if (!body) return;
    const crit = editor.brief.criteria;
    const groups = [...new Set(catalog.map(c => c.group))];
    const used = new Set(crit.map(c => c.key));
    const addable = catalog.filter(c => c.multiple || !used.has(c.key));

    body.innerHTML = `
        <div class="brief-toolbar">
            <label class="brief-template">Start from
                <select id="brief-template">
                    ${Object.entries(templates).map(([k, t]) => `<option value="${k}" ${editor.brief.template === k ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}
                </select>
            </label>
            <button type="button" class="btn btn-secondary" data-brief="template"><i data-lucide="layout-template"></i> Apply template</button>
        </div>
        <p class="brief-legend"><b>Must have:</b> homes without it drop below 60. <b>Nice to have:</b> raises the score, and close counts. <b>Deal-breaker:</b> homes with it drop below 40.</p>
        ${groups.map(g => {
            const rows = crit.map((c, i) => [c, i]).filter(([c]) => catalogDef(c.key)?.group === g);
            if (!rows.length) return '';
            return `<h3 class="brief-group">${esc(g)}</h3>${rows.map(([c, i]) => rowHtml(c, i)).join('')}`;
        }).join('')}
        ${crit.length ? '' : '<p class="brief-empty">No criteria yet. Apply a template or add one below.</p>'}
        <div class="brief-add">
            <select id="brief-add-key" aria-label="Criterion to add">
                ${groups.map(g => `<optgroup label="${esc(g)}">${addable.filter(c => c.group === g).map(c => `<option value="${c.key}">${esc(c.label)}</option>`).join('')}</optgroup>`).join('')}
            </select>
            <button type="button" class="btn btn-secondary" data-brief="add"><i data-lucide="plus"></i> Add criterion</button>
        </div>
        <div class="brief-actions">
            <button type="button" class="btn btn-secondary" data-brief="close">Cancel</button>
            <button type="button" class="btn btn-primary" data-brief="save"><i data-lucide="save"></i> Save brief</button>
        </div>`;
    if (window.lucide) window.lucide.createIcons();
}

/** Copies the form into editor.brief so re-renders (add, remove, template) keep typed values. */
function readForm() {
    document.querySelectorAll('#brief-body .brief-row').forEach(row => {
        const c = editor.brief.criteria[Number(row.dataset.idx)];
        if (!c) return;
        const def = catalogDef(c.key);
        const q = sel => row.querySelector(sel);
        const val = name => { const el = q(`[data-t="${name}"]`); return el ? el.value.trim() : ''; };
        const n = name => { const v = val(name); return v === '' ? null : Number(v); };
        const list = name => val(name).split(',').map(s => s.trim()).filter(Boolean);
        c.enabled = q('[data-f="enabled"]').checked;
        c.mode = q('[data-f="mode"]').value;
        c.weight = Number(q('[data-f="weight"]').value);
        const agentOnly = q('[data-f="agent_only"]');
        if (agentOnly) c.visibility = agentOnly.checked ? 'agent_only' : 'shared';
        switch (def.kind) {
            case 'min': case 'max': c.target = n('value'); break;
            case 'range': c.target = { min: n('min'), max: n('max') }; break;
            case 'in':
                c.target = [...row.querySelectorAll(c.key === 'status' ? '[data-t="status"]:checked' : '[data-t="opt"]:checked')].map(el => el.value);
                break;
            case 'bool': c.target = val('bool') !== '0'; break;
            case 'payment': c.target = { max: n('max'), rate_pct: n('rate_pct'), down_pct: n('down_pct'), term_years: n('term_years') }; break;
            case 'radius': c.target = { label: val('label'), lat: n('lat'), lng: n('lng'), miles: n('miles') }; break;
            case 'keyword': c.target = { keywords: list('keywords') }; break;
            case 'custom': c.target = { label: val('label'), keywords: list('keywords'), note: val('note') }; break;
        }
    });
}

export async function openBriefModal(clientId = null) {
    const modal = document.getElementById('modal-brief');
    if (!modal) return;
    modal.classList.add('active');
    const body = document.getElementById('brief-body');
    if (body) body.innerHTML = '<p class="brief-empty">Loading…</p>';
    try {
        // Fetched on every open so the city/ZIP/type lists reflect the latest listings.
        const cat = await apiFetch(`${API}?action=brief_catalog`);
        if (!cat || !cat.success) throw new Error(cat?.error || 'Could not load the criteria list.');
        catalog = cat.catalog; templates = cat.templates; statuses = cat.statuses; options = cat.options || {};
        const res = await apiFetch(`${API}?action=get_brief${clientId ? `&client_id=${encodeURIComponent(clientId)}` : ''}`);
        if (!res || !res.success) throw new Error(res?.error || 'Could not load the brief.');
        editor = { clientId, viewer: res.viewer, brief: res.brief };
        const title = document.getElementById('brief-title');
        const subtitle = document.getElementById('brief-subtitle');
        if (title) title.textContent = clientId ? "Client's Brief" : 'My Brief';
        if (subtitle) subtitle.textContent = res.source === 'seeded'
            ? 'Started from the targets already on file. Adjust it and save to score every listing.'
            : 'What a great home looks like. Every listing gets a Fit Score against it.';
        render();
    } catch (e) {
        if (body) body.innerHTML = `<p class="brief-empty">${esc(e.message)}</p>`;
    }
}

function closeModal() {
    document.getElementById('modal-brief')?.classList.remove('active');
    editor = null;
}

async function save(btn) {
    readForm();
    btn.disabled = true;
    try {
        const res = await apiFetch(`${API}?action=save_brief`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ client_id: editor.clientId, brief: editor.brief }),
        });
        if (!res || !res.success) throw new Error(res?.error || 'Save failed.');
        const ownBrief = !editor.clientId;
        const savedFor = editor.clientId;
        closeModal();
        if (savedFor) document.dispatchEvent(new CustomEvent('dibs:brief-saved', { detail: { clientId: savedFor } }));
        showToast('Brief saved. Fit Scores updated.', 'success');
        if (ownBrief) {
            await loadFitScores(true);
            renderActiveView();
        }
    } catch (e) {
        showToast(e.message || 'Save failed.', 'error');
    } finally {
        btn.disabled = false;
    }
}

window.openBriefModal = openBriefModal;

// Profile menu entry: hidden for realtor logins (they open a client's brief from the realtor view).
document.addEventListener('click', event => {
    const t = event.target;
    if (!(t instanceof Element)) return;
    const menuBtn = document.getElementById('btn-user-brief');
    if (menuBtn && t.closest('#user-dropdown-container')) menuBtn.style.display = isRealtorLogin() ? 'none' : '';
    if (!t.closest('#btn-user-brief')) return;
    document.getElementById('user-dropdown-menu')?.classList.remove('open');
    openBriefModal();
}, true);

document.addEventListener('click', event => {
    const t = event.target;
    if (!(t instanceof Element)) return;
    if (t.closest('#modal-brief-close') || t.id === 'modal-brief') { closeModal(); return; }
    const action = t.closest('[data-brief]');
    if (!action || !action.closest('#modal-brief') || !editor) return;
    const kind = action.dataset.brief;
    if (kind === 'close') { closeModal(); return; }
    if (kind === 'save') { save(action); return; }
    readForm();
    if (kind === 'remove') {
        const idx = Number(action.closest('.brief-row').dataset.idx);
        editor.brief.criteria.splice(idx, 1);
    } else if (kind === 'add') {
        const key = document.getElementById('brief-add-key')?.value;
        const def = key && catalogDef(key);
        if (!def) return;
        editor.brief.criteria.push({ id: def.multiple ? newId(key) : key, key, enabled: true, mode: 'prefer', weight: 3, visibility: 'shared' });
    } else if (kind === 'template') {
        const key = document.getElementById('brief-template')?.value;
        const tpl = templates[key];
        if (!tpl) return;
        // Keep custom criteria and keyword lists: templates only cover the standard ones.
        const keep = editor.brief.criteria.filter(c => c.key === 'custom' || c.key === 'keywords');
        editor.brief.template = key;
        editor.brief.criteria = [
            ...tpl.criteria.map(c => ({ id: c.key, enabled: true, visibility: 'shared', ...JSON.parse(JSON.stringify(c)) })),
            ...keep,
        ];
        showToast(`${tpl.label} template applied. Fill in the targets, then save.`, 'success');
    }
    render();
});

// Dim a row as soon as it is switched off; show "How important" only for nice-to-haves.
document.addEventListener('change', event => {
    const el = event.target;
    if (!(el instanceof Element)) return;
    if (el.matches('#brief-body [data-f="enabled"]')) {
        el.closest('.brief-row')?.classList.toggle('is-off', !el.checked);
    } else if (el.matches('#brief-body [data-f="mode"]')) {
        const weight = el.closest('.brief-row')?.querySelector('[data-f="weight"]');
        if (weight) weight.hidden = el.value !== 'prefer';
    }
});

// Narrow a long checklist as the user types; only hides rows, never changes what is checked.
document.addEventListener('input', event => {
    const el = event.target;
    if (!(el instanceof Element) || !el.matches('#brief-body [data-filter]')) return;
    const q = el.value.trim().toLowerCase();
    el.closest('.brief-checklist')?.querySelectorAll('[data-opt-label]').forEach(label => {
        label.hidden = q !== '' && !label.dataset.optLabel.includes(q);
    });
});

document.addEventListener('keydown', event => {
    if (event.key !== 'Escape') return;
    if (document.getElementById('fit-popover')) { closePopover(); return; }
    if (document.getElementById('modal-brief')?.classList.contains('active')) closeModal();
});
