/**
 * My Home: the user's own house, so listings can be compared against what they would be
 * selling. One home per user (backend/myhome.php). Opened from "My Home" in the profile menu.
 *
 * The owner edits it in #modal-my-home; their realtor can read it (client_id) - the realtor
 * view hooks in a later step. The selling math here (net proceeds, current monthly) is exported
 * for the Compare-to-my-house panel and the compare matrix.
 */
import { state } from './state.js';
import { apiFetch } from './api.js';
import { escapeHtml, NO_PHOTO_IMG } from './properties.js';
import { showToast } from './toast.js';
import { renderActiveView } from './views.js';

const esc = v => escapeHtml(String(v ?? ''));
const FACING = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export const DEFAULT_SELL_COST_PCT = 7;

let loadState = 'idle'; // idle | loading | done
state.myHome = null;
state.myHomeComps = null;   // stored RentCast value + comps for the home (property_comps "home:<id>")
let canLookup = false;      // only the RentCast lookup login, on their own home
let lookupUsage = null;     // { used, cap, window_days }

// [field, label, kind, extra]; kind: text | num | money | pct | select | textarea
const HOUSE_FIELDS = [
    ['address', 'Street address', 'text'], ['city', 'City', 'text'], ['state', 'State', 'text'], ['zip', 'ZIP', 'text'],
    ['beds', 'Beds', 'num'], ['baths', 'Baths', 'num'], ['sqft_finished', 'Finished sq ft', 'num'], ['sqft_total', 'Total sq ft', 'num'],
    ['lot_sqft', 'Lot sq ft', 'num'], ['year_built', 'Year built', 'num'], ['property_type', 'Type', 'text'], ['levels', 'Levels', 'text'],
    ['garage_spaces', 'Garage spaces', 'num'], ['garage_notes', 'Garage notes (width, tandem)', 'text'],
    ['basement', 'Basement', 'text'], ['fence', 'Fence', 'text'],
    ['driveway_facing', 'Driveway faces', 'select', FACING],
    ['hoa_fee', 'HOA per month', 'money'], ['annual_tax', 'Annual property tax', 'money'], ['tax_year', 'Tax year', 'num'],
    ['main_image_url', 'Photo URL', 'text'],
];
const SELL_FIELDS = [
    ['my_price', 'My price (what it should sell for)', 'money'],
    ['mortgage_payoff', 'Mortgage payoff balance', 'money'],
    ['mortgage_rate', 'Current mortgage rate %', 'pct'],
    ['mortgage_pi', 'Current monthly principal & interest', 'money'],
    ['sell_cost_pct', 'Selling costs % (commission, concessions, closing)', 'pct'],
    ['extra_cash', 'Extra cash toward next down payment', 'money'],
];
const ALL_FIELDS = [...HOUSE_FIELDS, ...SELL_FIELDS, ['ai_notes', 'Notes / CMA / AI write-up', 'textarea']];

const num = v => (v === null || v === undefined || v === '' || isNaN(Number(v))) ? null : Number(v);
const money = v => v === null ? '—' : (v < 0 ? '−$' : '$') + Math.round(Math.abs(v)).toLocaleString();

/** Equity, selling costs, net proceeds and the money available for the next down payment. */
export function myHomeSaleMath(h) {
    if (!h) return null;
    const price = num(h.my_price);
    const payoff = num(h.mortgage_payoff) || 0;
    const pct = num(h.sell_cost_pct) ?? DEFAULT_SELL_COST_PCT;
    const extra = num(h.extra_cash) || 0;
    if (price === null) return { price: null, equity: null, sellCosts: null, net: null, downPayment: extra || null };
    const sellCosts = price * pct / 100;
    const net = price - payoff - sellCosts;
    return { price, equity: price - payoff, sellCosts, net, downPayment: net + extra };
}

/** What the home costs per month today: P&I + tax + HOA, matching compare.js's monthlyCost(). */
export function myHomeMonthly(h) {
    if (!h) return null;
    const pi = num(h.mortgage_pi) || 0;
    const tax = (num(h.annual_tax) || 0) / 12;
    const hoa = num(h.hoa_fee) || 0;
    if (!pi && !tax && !hoa) return null;
    return { total: pi + tax + hoa, pi, tax, hoa };
}

function isRealtorLogin() {
    return (state.currentUserProfile?.role || '') === 'realtor';
}

export async function loadMyHome(force = false) {
    if (!state.authenticated || (loadState !== 'idle' && !force)) return state.myHome;
    loadState = 'loading';
    try {
        const res = await apiFetch('backend/api.php?action=get_my_home');
        state.myHome = res && res.success ? res.home : null;
        state.myHomeComps = res && res.success ? res.comps : null;
        canLookup = !!(res && res.can_lookup);
        lookupUsage = res && res.usage ? res.usage : null;
    } catch (e) {
        state.myHome = null;
    }
    loadState = 'done';
    if (state.activeView === 'grid') renderActiveView();
    return state.myHome;
}

/** Starts the one-time load (for the "vs My Home" buttons on listing cards). Clients only. */
export function ensureMyHomeLoaded() {
    if (!state.authenticated || isRealtorLogin() || loadState !== 'idle') return;
    loadMyHome();
}

function fieldHtml([key, label, kind, extra], h, readOnly) {
    let v = h ? h[key] : null;
    if (key === 'sell_cost_pct' && (v === null || v === undefined)) v = DEFAULT_SELL_COST_PCT;
    const dis = readOnly ? 'disabled' : '';
    const id = `my-home-${key}`;
    if (kind === 'textarea') {
        return `<label class="my-home-field my-home-field--wide" for="${id}"><span>${esc(label)}</span>
            <textarea id="${id}" data-field="${key}" rows="6" ${dis}>${esc(v ?? '')}</textarea></label>`;
    }
    if (kind === 'select') {
        const opts = ['<option value="">—</option>'].concat(extra.map(o => `<option value="${o}" ${o === v ? 'selected' : ''}>${o}</option>`)).join('');
        return `<label class="my-home-field" for="${id}"><span>${esc(label)}</span><select id="${id}" data-field="${key}" ${dis}>${opts}</select></label>`;
    }
    const isNum = kind !== 'text';
    const wide = key === 'address' || key === 'main_image_url' || key === 'garage_notes' ? ' my-home-field--wide' : '';
    return `<label class="my-home-field${wide}" for="${id}"><span>${esc(label)}</span>
        <input id="${id}" data-field="${key}" type="text" ${isNum ? 'inputmode="decimal"' : ''} value="${esc(v ?? '')}" ${dis}></label>`;
}

function readForm() {
    const out = {};
    document.querySelectorAll('#my-home-body [data-field]').forEach(el => {
        const kind = (ALL_FIELDS.find(f => f[0] === el.dataset.field) || [])[2];
        const raw = el.value.trim();
        out[el.dataset.field] = kind === 'text' || kind === 'select' || kind === 'textarea' ? raw : (raw === '' ? null : raw.replace(/[$,%\s]/g, ''));
    });
    return out;
}

function summaryHtml(h) {
    const m = myHomeSaleMath(h);
    const monthly = myHomeMonthly(h);
    return `
        <div><span>Equity</span><b>${money(m?.equity ?? null)}</b></div>
        <div><span>Selling costs</span><b>${money(m?.sellCosts ?? null)}</b></div>
        <div><span>Net proceeds</span><b>${money(m?.net ?? null)}</b></div>
        <div><span>Down payment available</span><b>${money(m?.downPayment ?? null)}</b></div>
        <div><span>Monthly now (P&amp;I + tax + HOA)</span><b>${monthly ? money(monthly.total) : '—'}</b></div>`;
}

const cmoney = v => '$' + Math.round(Number(v) || 0).toLocaleString();
function shortDate(v) {
    if (!v) return '';
    const d = new Date(v);
    return isNaN(d) ? String(v).slice(0, 10) : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** RentCast value + comps for the home, and the lookup buttons for the login allowed to spend them. */
function valueSectionHtml(home, comps, canEdit) {
    const left = lookupUsage ? Math.max(0, lookupUsage.cap - lookupUsage.used) : null;
    const leftNote = left === null ? '' : `${left} of ${lookupUsage.cap} lookups left this ${lookupUsage.window_days}-day window.`;
    const buttons = canEdit && canLookup ? `
        <div class="my-home-lookup-row">
            <button type="button" class="btn btn-secondary" data-my-home="fill"><i data-lucide="download"></i> Fill empty fields from RentCast</button>
            <button type="button" class="btn btn-secondary" data-my-home="value"><i data-lucide="scale"></i> ${comps ? 'Refresh value' : 'Check value'}</button>
            <span class="my-home-note">Each uses 1 lookup and saves the form first. ${esc(leftNote)}</span>
        </div>` : '';
    if (!comps) {
        return buttons || '<p class="my-home-note">No RentCast value on file yet.</p>';
    }
    const myPrice = num(home?.my_price);
    const diff = myPrice !== null ? myPrice - comps.comp_estimate : null;
    const subj = comps.comp_subject || {};
    const subjBits = [subj.bedrooms && `${subj.bedrooms} bd`, subj.bathrooms && `${subj.bathrooms} ba`, subj.squareFootage && `${Number(subj.squareFootage).toLocaleString()} sqft`, subj.yearBuilt && `built ${subj.yearBuilt}`].filter(Boolean);
    const lastSale = subj.lastSalePrice ? `Last sold ${cmoney(subj.lastSalePrice)}${subj.lastSaleDate ? ' on ' + shortDate(subj.lastSaleDate) : ''}.` : '';
    const rows = (comps.comps || []).map(c => {
        const price = Number(c.price) || 0, sqft = Number(c.squareFootage) || 0;
        const active = String(c.status || '').toLowerCase() === 'active';
        return `<tr><td>${esc(c.formattedAddress || '')}</td><td>${price ? cmoney(price) : '—'}</td><td>${c.bedrooms ?? '?'} / ${c.bathrooms ?? '?'}</td>
            <td>${sqft ? sqft.toLocaleString() : '—'}</td><td>${price && sqft ? cmoney(price / sqft) : '—'}</td>
            <td>${c.distance != null ? Number(c.distance).toFixed(2) + ' mi' : ''}</td><td>${active ? 'Active' : (c.removedDate ? 'Off ' + esc(shortDate(c.removedDate)) : 'Off market')}</td></tr>`;
    }).join('');
    return `
        <div class="my-home-summary">
            <div><span>RentCast value</span><b>${cmoney(comps.comp_estimate)}</b></div>
            <div><span>Likely range</span><b>${comps.comp_range_low && comps.comp_range_high ? `${cmoney(comps.comp_range_low)} – ${cmoney(comps.comp_range_high)}` : '—'}</b></div>
            <div><span>My price vs value</span><b>${diff === null ? '—' : (diff < 0 ? '−' : '+') + cmoney(Math.abs(diff))}</b></div>
        </div>
        ${canEdit ? `<button type="button" class="btn btn-secondary my-home-use-value" data-my-home="use-value" data-value="${Math.round(comps.comp_estimate)}"><i data-lucide="arrow-down-to-line"></i> Use ${cmoney(comps.comp_estimate)} as my price</button>` : ''}
        <p class="my-home-note">From ${(comps.comps || []).length} RentCast comps${comps.comp_fetched_at ? ', checked ' + esc(shortDate(comps.comp_fetched_at)) : ''}. ${subjBits.length ? 'RentCast has your home as ' + esc(subjBits.join(' / ')) + '. ' : ''}${esc(lastSale)} Comp prices are listing prices, not confirmed closings.</p>
        ${rows ? `<div class="my-home-comps-wrap"><table class="room-table"><thead><tr><th>Comparable</th><th>Price</th><th>Bd / Ba</th><th>SqFt</th><th>$/SqFt</th><th>Distance</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>` : ''}
        ${buttons}`;
}

function renderModal(home, canEdit, comps = state.myHomeComps) {
    const body = document.getElementById('my-home-body');
    if (!body) return;
    const ro = !canEdit;
    body.innerHTML = `
        <h3 class="my-home-section-title"><i data-lucide="house"></i> The house</h3>
        <div class="my-home-grid">${HOUSE_FIELDS.map(f => fieldHtml(f, home, ro)).join('')}</div>
        <h3 class="my-home-section-title"><i data-lucide="hand-coins"></i> Selling</h3>
        <div class="my-home-grid">${SELL_FIELDS.map(f => fieldHtml(f, home, ro)).join('')}</div>
        <div class="my-home-summary" id="my-home-summary">${summaryHtml(home)}</div>
        <h3 class="my-home-section-title"><i data-lucide="scale"></i> Value &amp; comps</h3>
        <div id="my-home-value">${valueSectionHtml(home, comps, canEdit)}</div>
        <h3 class="my-home-section-title"><i data-lucide="notebook-pen"></i> Notes</h3>
        <div class="my-home-grid">${fieldHtml(ALL_FIELDS[ALL_FIELDS.length - 1], home, ro)}</div>
        ${canEdit ? `<div class="my-home-actions">
            <button type="button" class="btn btn-secondary" data-my-home="close">Cancel</button>
            <button type="button" class="btn btn-primary" data-my-home="save"><i data-lucide="save"></i> Save my home</button>
        </div>` : ''}`;
    if (window.lucide) window.lucide.createIcons();
}

/** Opens the home modal. With a clientId (realtor/admin), it opens that client's home read-only. */
export async function openMyHomeModal(clientId) {
    const modal = document.getElementById('modal-my-home');
    if (!modal) return;
    modal.classList.add('active');
    const title = document.getElementById('my-home-title');
    const subtitle = document.getElementById('my-home-subtitle');
    if (title) title.textContent = clientId ? "Client's Home" : 'My Home';
    if (subtitle) subtitle.textContent = clientId
        ? 'The home this client would sell, as they entered it. Read-only.'
        : "The house you'd sell. Every listing can be compared against it.";
    const body = document.getElementById('my-home-body');
    if (clientId) {
        if (body) body.innerHTML = '<p class="my-home-loading">Loading…</p>';
        try {
            const res = await apiFetch(`backend/api.php?action=get_my_home&client_id=${encodeURIComponent(clientId)}`);
            if (!res || !res.success) throw new Error(res?.error || 'Could not load the home.');
            if (!res.home) { if (body) body.innerHTML = '<p class="my-home-loading">This client hasn\'t added their home yet.</p>'; return; }
            renderModal(res.home, false, res.comps);
        } catch (e) {
            if (body) body.innerHTML = `<p class="my-home-loading">${esc(e.message)}</p>`;
        }
        return;
    }
    renderModal(state.myHome, true);
}

function closeModal() {
    document.getElementById('modal-my-home')?.classList.remove('active');
}

/** Saves the form. Returns true on success; shows its own error toast otherwise. */
async function saveForm() {
    const data = readForm();
    if (!data.address) { showToast('Add the street address first.', 'error'); return false; }
    try {
        const res = await apiFetch('backend/api.php?action=save_my_home', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!res || !res.success) throw new Error(res?.error || 'Save failed.');
        state.myHome = res.home;
        loadState = 'done';
        return true;
    } catch (e) {
        showToast(e.message || 'Save failed.', 'error');
        return false;
    }
}

async function save(btn) {
    btn.disabled = true;
    const ok = await saveForm();
    btn.disabled = false;
    if (!ok) return;
    closeModal();
    showToast('My home saved.', 'success');
    if (state.activeView === 'grid') renderActiveView();
}

/** Fill / value lookups: save first so RentCast sees the current address, then spend one lookup. */
async function lookup(kind, btn) {
    document.querySelectorAll('#my-home-body [data-my-home="fill"], #my-home-body [data-my-home="value"]').forEach(b => { b.disabled = true; });
    const label = btn.innerHTML;
    btn.innerHTML = '<i data-lucide="loader"></i> Checking RentCast…';
    if (window.lucide) window.lucide.createIcons();
    try {
        if (!(await saveForm())) return;
        const action = kind === 'fill' ? 'fill_my_home' : 'check_my_home_value';
        const res = await apiFetch(`backend/api.php?action=${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        if (res && res.usage) lookupUsage = res.usage;
        if (!res || !res.success) throw new Error(res?.error || 'RentCast lookup failed.');
        if (kind === 'fill') {
            state.myHome = res.home;
            const sale = res.last_sale && res.last_sale.price ? ` Last sale on record: ${cmoney(res.last_sale.price)}${res.last_sale.date ? ' (' + shortDate(res.last_sale.date) + ')' : ''}.` : '';
            showToast(res.filled.length ? `Filled ${res.filled.length} empty field${res.filled.length === 1 ? '' : 's'} from RentCast.${sale}` : `RentCast had nothing new for the empty fields.${sale}`, 'success');
        } else {
            state.myHomeComps = res.comps;
            showToast(`RentCast values your home at ${cmoney(res.comps.comp_estimate)}.`, 'success');
        }
        renderModal(state.myHome, true);
        if (state.activeView === 'grid') renderActiveView();
    } catch (e) {
        showToast(e.message || 'RentCast lookup failed.', 'error');
        btn.innerHTML = label;
    } finally {
        document.querySelectorAll('#my-home-body [data-my-home="fill"], #my-home-body [data-my-home="value"]').forEach(b => { b.disabled = false; });
        if (window.lucide) window.lucide.createIcons();
    }
}

window.openMyHomeModal = openMyHomeModal;

// Profile menu entry: hidden for realtor logins (they open a client's home from the realtor view).
document.addEventListener('click', event => {
    const t = event.target;
    if (!(t instanceof Element)) return;
    const menuBtn = document.getElementById('btn-user-my-home');
    if (menuBtn && t.closest('#user-dropdown-container')) menuBtn.style.display = isRealtorLogin() ? 'none' : '';
    if (!t.closest('#btn-user-my-home')) return;
    document.getElementById('user-dropdown-menu')?.classList.remove('open');
    (loadState === 'done' ? Promise.resolve() : loadMyHome(true)).then(() => openMyHomeModal());
}, true);

document.addEventListener('click', event => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    if (target.closest('#modal-my-home-close') || target.id === 'modal-my-home') { closeModal(); return; }
    const actionEl = target.closest('[data-my-home]');
    if (!actionEl || !actionEl.closest('#modal-my-home')) return;
    if (actionEl.dataset.myHome === 'close') closeModal();
    else if (actionEl.dataset.myHome === 'save') save(actionEl);
    else if (actionEl.dataset.myHome === 'fill' || actionEl.dataset.myHome === 'value') lookup(actionEl.dataset.myHome, actionEl);
    else if (actionEl.dataset.myHome === 'use-value') {
        const input = document.getElementById('my-home-my_price');
        if (input) {
            input.value = actionEl.dataset.value;
            input.dispatchEvent(new Event('input', { bubbles: true }));
            showToast('Set as my price. Save to keep it.', 'success');
        }
    }
});

// Live selling math while typing.
document.addEventListener('input', event => {
    const el = event.target;
    if (!(el instanceof Element) || !el.closest('#my-home-body')) return;
    const summary = document.getElementById('my-home-summary');
    if (summary) summary.innerHTML = summaryHtml(readForm());
});

document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && document.getElementById('modal-my-home')?.classList.contains('active')) closeModal();
    if ((event.key === 'Enter' || event.key === ' ') && event.target instanceof Element && event.target.matches('.my-home-card--empty')) {
        event.preventDefault();
        openMyHomeModal();
    }
});
