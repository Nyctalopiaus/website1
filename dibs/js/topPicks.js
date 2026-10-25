/**
 * Top Picks: the buyer's ranked list of favorites they've toured. Pending / off-market homes drop out
 * on the server.
 *
 * The buyer opens it from the user menu or the "Top Picks" chip. They drag rows to reorder them
 * (or use the arrow buttons on a phone), add toured favorites from the list below, and Save.
 * Their realtor opens the same modal read-only with a client_id from the client page.
 * Backend: get_top_picks / set_pick_order in backend/properties.php.
 */
import { apiFetch } from './api.js';
import { state } from './state.js';
import { showToast } from './toast.js';
import { escapeHtml, NO_PHOTO_IMG } from './properties.js';
import { renderActiveView } from './views.js';

const esc = v => escapeHtml(String(v ?? ''));
const money = v => v ? '$' + Math.round(v).toLocaleString() : '';
const SCORE_KEYS = ['overall', 'layout', 'condition', 'location', 'value', 'live_here'];

let data = null;        // last get_top_picks response
let order = [];         // working ranked list (rows)
let pool = [];          // toured favorites not in the ranking
let savedIds = '';      // order at load, to tell if there are unsaved changes
let editable = false;
let clientId = null;
let dragIndex = null;

function ensureModal() {
    let m = document.getElementById('modal-top-picks');
    if (m) return m;
    m = document.createElement('div');
    m.className = 'modal-overlay';
    m.id = 'modal-top-picks';
    m.innerHTML = `
        <div class="modal-content top-picks-modal" role="dialog" aria-labelledby="top-picks-title">
            <button class="modal-close" aria-label="Close" data-top-picks="close"><i data-lucide="x"></i></button>
            <div class="my-home-header">
                <h2><i data-lucide="trophy"></i> <span id="top-picks-title">Top Picks</span></h2>
                <p id="top-picks-subtitle"></p>
            </div>
            <div id="top-picks-body"><p class="my-home-loading">Loading…</p></div>
            <div class="my-home-actions" id="top-picks-actions"></div>
        </div>`;
    document.body.appendChild(m);
    return m;
}

function avgScore(scores) {
    if (!scores) return null;
    const vals = SCORE_KEYS.map(k => Number(scores[k])).filter(v => v >= 1 && v <= 5);
    return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length) : null;
}

function facts(h) {
    const ppsf = h.sqft_finished ? Math.round(h.price / h.sqft_finished) : 0;
    return [money(h.price), h.beds ? `${h.beds} bd` : '', h.baths ? `${h.baths} ba` : '',
        h.sqft_finished ? `${h.sqft_finished.toLocaleString()} fin sqft` : '', ppsf ? `$${ppsf}/sqft` : '',
        h.garage_spaces ? `${h.garage_spaces}-car` : ''].filter(Boolean).join(' · ');
}

function rowHtml(h, i, kind) {
    const avg = avgScore(h.tour_scores);
    const toured = h.toured_at ? new Date(h.toured_at.replace(' ', 'T') + 'Z').toLocaleDateString() : '';
    const left = kind === 'ranked'
        ? `${editable ? '<span class="tp-grip" aria-hidden="true"><i data-lucide="grip-vertical"></i></span>' : ''}<span class="tp-rank">#${i + 1}</span>`
        : '';
    let actions = '';
    if (editable && kind === 'ranked') {
        actions = `
            <button type="button" class="btn btn-secondary btn-sm" data-top-picks="up" data-i="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Move up"><i data-lucide="arrow-up"></i></button>
            <button type="button" class="btn btn-secondary btn-sm" data-top-picks="down" data-i="${i}" ${i === order.length - 1 ? 'disabled' : ''} aria-label="Move down"><i data-lucide="arrow-down"></i></button>
            <button type="button" class="btn btn-secondary btn-sm" data-top-picks="remove" data-i="${i}" aria-label="Remove from ranking" title="Remove from ranking"><i data-lucide="x"></i></button>`;
    } else if (editable && kind === 'pool') {
        actions = `<button type="button" class="btn btn-secondary btn-sm" data-top-picks="add" data-i="${i}"><i data-lucide="plus"></i> Rank it</button>`;
    }
    return `
        <li class="tp-row tp-row--${kind}" ${editable && kind === 'ranked' ? `draggable="true" data-drag="${i}"` : ''}>
            ${left}
            <img class="tp-thumb" src="${esc(h.main_image_url || NO_PHOTO_IMG)}" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${NO_PHOTO_IMG}';" alt="">
            <div class="tp-info">
                <button type="button" class="tp-addr" data-top-picks="open" data-mls="${esc(h.mls_id)}">${esc(h.address)}${h.city ? `, ${esc(h.city)}` : ''}</button>
                <div class="tp-facts">${esc(facts(h))}</div>
                <div class="tp-meta">${[toured ? `Toured ${toured}` : '', avg ? `Tour score ${avg.toFixed(1)}/5` : ''].filter(Boolean).map(esc).join(' · ')}</div>
            </div>
            ${actions ? `<div class="tp-actions">${actions}</div>` : ''}
        </li>`;
}

function render() {
    const body = document.getElementById('top-picks-body');
    const actions = document.getElementById('top-picks-actions');
    if (!body || !data) return;
    const dirty = order.map(h => h.mls_id).join(',') !== savedIds;
    const nt = data.not_toured || [];
    body.innerHTML = `
        <h3 class="my-home-section-title"><i data-lucide="list-ordered"></i> ${editable ? 'Your ranking' : 'Ranking'}</h3>
        ${order.length
            ? `<ol class="tp-list" id="tp-ranked">${order.map((h, i) => rowHtml(h, i, 'ranked')).join('')}</ol>`
            : `<p class="tp-empty">${editable ? (pool.length ? 'Nothing ranked yet. Add your toured favorites below, best first.' : 'Nothing to rank yet. Once you tour a favorite, it shows up here.') : 'This client hasn\'t ranked any homes yet.'}</p>`}
        ${pool.length ? `
            <h3 class="my-home-section-title"><i data-lucide="footprints"></i> Toured favorites not ranked (${pool.length})</h3>
            <ul class="tp-list">${pool.map((h, i) => rowHtml(h, i, 'pool')).join('')}</ul>` : ''}
        ${nt.length ? `
            <details class="tp-later">
                <summary>Favorites not toured yet (${nt.length}): these can be ranked after you see them</summary>
                <ul class="tp-list">${nt.map((h, i) => rowHtml(h, i, 'later')).join('')}</ul>
            </details>` : ''}
        ${data.unavailable_count ? `<p class="tp-note">${data.unavailable_count} favorite${data.unavailable_count === 1 ? ' is' : 's are'} Pending or off the market and left out.</p>` : ''}`;
    if (actions) {
        actions.innerHTML = editable
            ? `${dirty ? '<span class="tp-dirty">Unsaved changes</span>' : ''}
               <button type="button" class="btn btn-secondary" data-top-picks="close">${dirty ? 'Discard' : 'Close'}</button>
               <button type="button" class="btn btn-primary" data-top-picks="save" ${dirty ? '' : 'disabled'}><i data-lucide="save"></i> Save ranking</button>`
            : `<button type="button" class="btn btn-secondary" data-top-picks="close">Close</button>`;
    }
    if (window.lucide) window.lucide.createIcons();
}

/** Opens Top Picks. With a clientId (realtor/admin), it shows that client's ranking read-only. */
export async function openTopPicksModal(forClientId = null) {
    const m = ensureModal();
    m.classList.add('active');
    clientId = forClientId;
    data = null;
    const sub = document.getElementById('top-picks-subtitle');
    if (sub) sub.textContent = forClientId
        ? "The client's ranked favorites, best first. Read-only."
        : 'Rank the favorites you\'ve toured, best first. Your realtor sees this order.';
    document.getElementById('top-picks-body').innerHTML = '<p class="my-home-loading">Loading…</p>';
    document.getElementById('top-picks-actions').innerHTML = '';
    try {
        const q = forClientId ? `&client_id=${encodeURIComponent(forClientId)}` : '';
        const res = await apiFetch(`backend/api.php?action=get_top_picks${q}`);
        if (!res || !res.success) throw new Error(res?.error || 'Could not load Top Picks.');
        data = res;
        editable = !!res.editable && !forClientId;
        order = [...res.ranked];
        pool = [...res.unranked];
        savedIds = order.map(h => h.mls_id).join(',');
        render();
    } catch (e) {
        document.getElementById('top-picks-body').innerHTML = `<p class="my-home-loading">${esc(e.message)}</p>`;
    }
}

function isDirty() { return data && order.map(h => h.mls_id).join(',') !== savedIds; }

function close(force = false) {
    if (!force && editable && isDirty() && !window.confirm('Discard your unsaved ranking changes?')) return;
    document.getElementById('modal-top-picks')?.classList.remove('active');
}

async function save(btn) {
    const ids = order.map(h => h.mls_id);
    if (btn) btn.disabled = true;
    try {
        const res = await apiFetch('backend/api.php?action=set_pick_order', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mls_ids: ids }),
        });
        if (!res || !res.success) throw new Error(res?.error || 'Could not save the ranking.');
        savedIds = ids.join(',');
        const rank = new Map(ids.map((id, i) => [String(id), i + 1]));
        (state.allProperties || []).forEach(p => { p.pick_rank = rank.get(String(p.mls_id)) || null; });
        try { renderActiveView(); } catch (_) { /* the grid may not be on screen */ }
        showToast('Top Picks saved. Your realtor can see the new order.', 'success');
        render();
    } catch (e) {
        showToast(e.message, 'error');
        if (btn) btn.disabled = false;
    }
}

function move(from, to) {
    if (to < 0 || to >= order.length || from === to) return;
    const [h] = order.splice(from, 1);
    order.splice(to, 0, h);
    render();
}

document.addEventListener('click', event => {
    const t = event.target;
    if (!(t instanceof Element)) return;
    if (t.closest('#btn-user-top-picks, [data-open-top-picks]')) {
        document.getElementById('user-dropdown-menu')?.classList.remove('open');
        openTopPicksModal();
        return;
    }
    if (t.id === 'modal-top-picks') { close(); return; }
    const el = t.closest('[data-top-picks]');
    if (!el || !el.closest('#modal-top-picks')) return;
    const i = Number(el.dataset.i);
    switch (el.dataset.topPicks) {
        case 'close': close(); break;
        case 'save': save(el); break;
        case 'up': move(i, i - 1); break;
        case 'down': move(i, i + 1); break;
        case 'remove': pool.unshift(order.splice(i, 1)[0]); render(); break;
        case 'add': order.push(pool.splice(i, 1)[0]); render(); break;
        case 'open':
            if (editable && isDirty() && !window.confirm('Leave without saving your ranking?')) return;
            close(true);
            if (window.openDetailModal) window.openDetailModal(el.dataset.mls);
            break;
    }
});

// Drag to reorder (desktop). Phones use the arrow buttons.
document.addEventListener('dragstart', e => {
    const row = e.target instanceof Element && e.target.closest('#tp-ranked [data-drag]');
    if (!row) return;
    dragIndex = Number(row.dataset.drag);
    row.classList.add('is-dragging');
    e.dataTransfer.effectAllowed = 'move';
    try { e.dataTransfer.setData('text/plain', String(dragIndex)); } catch (_) {}
});
document.addEventListener('dragover', e => {
    const row = e.target instanceof Element && e.target.closest('#tp-ranked [data-drag]');
    if (!row || dragIndex === null) return;
    e.preventDefault();
    document.querySelectorAll('#tp-ranked .is-drop-target').forEach(r => r.classList.remove('is-drop-target'));
    row.classList.add('is-drop-target');
});
document.addEventListener('drop', e => {
    const row = e.target instanceof Element && e.target.closest('#tp-ranked [data-drag]');
    if (!row || dragIndex === null) return;
    e.preventDefault();
    const to = Number(row.dataset.drag);
    const from = dragIndex;
    dragIndex = null;
    move(from, to);
});
document.addEventListener('dragend', () => {
    dragIndex = null;
    document.querySelectorAll('#tp-ranked .is-dragging, #tp-ranked .is-drop-target').forEach(r => r.classList.remove('is-dragging', 'is-drop-target'));
});

// Realtor logins have no favorites of their own, so hide the menu item for them (as My Home does).
document.addEventListener('click', event => {
    const t = event.target;
    if (!(t instanceof Element) || !t.closest('#user-dropdown-container')) return;
    const btn = document.getElementById('btn-user-top-picks');
    if (btn) btn.style.display = (state.currentUserProfile?.role || '') === 'realtor' ? 'none' : '';
}, true);

document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.getElementById('modal-top-picks')?.classList.contains('active')) close();
});

window.openTopPicksModal = openTopPicksModal;
