/**
 * "Add these to tour": puts the homes you're looking at onto a showing tour in one step.
 *
 * Which homes: the current filter's results in the current sort (map view: only the homes inside
 * the visible map area). Skipped: homes already on the tour and homes that can't be shown
 * (Pending, Closed, Sold, Withdrawn, Expired, Off Market). At most MAX_BATCH per click.
 * Whose tour: a client's own; a realtor/admin adds to the client selected in the Agent Hub or
 * Tour Planner, named in the confirmation.
 * Uses the existing add_to_tour action, one home at a time so their order is kept.
 */
import { state } from './state.js';
import { apiFetch } from './api.js';
import { escapeHtml, cleanDisplayAddress } from './properties.js';
import { showToast } from './toast.js';
import { getPropertiesInView } from './map.js';

const esc = v => escapeHtml(String(v ?? ''));
const MAX_BATCH = 25;
const NOT_SHOWABLE = /pending|closed|sold|withdrawn|expired|off market|cancel/i;
let plan = null; // { clientId, clientName, homes: [...], skipped: {...} }

function isAgent() {
    const role = state.currentUserProfile?.role || '';
    return role === 'realtor' || role === 'admin' || Boolean(state.isAdmin);
}

function homesInView() {
    const list = state.activeView === 'map' ? getPropertiesInView() : state.filteredProperties;
    return Array.isArray(list) ? list : [];
}

function ensureModal() {
    let modal = document.getElementById('modal-tour-bulk');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'modal-tour-bulk';
    modal.innerHTML = `
        <div class="modal-content tour-bulk-modal" role="dialog" aria-modal="true" aria-labelledby="tour-bulk-title">
            <button class="modal-close" aria-label="Close" data-tour-bulk="close"><i data-lucide="x"></i></button>
            <div class="my-home-header">
                <h2 id="tour-bulk-title"><i data-lucide="route"></i> Add these to the tour</h2>
            </div>
            <div id="tour-bulk-body"></div>
        </div>`;
    document.body.appendChild(modal);
    return modal;
}

async function buildPlan() {
    let clientId = null;
    if (isAgent()) {
        clientId = localStorage.getItem('active_tour_client_id') || localStorage.getItem('active_realtor_client_id');
        if (!clientId || clientId === 'all') return { error: 'Pick a client first: select one in the Agent Hub or the Tour Planner, then come back.' };
    }
    const res = await apiFetch(`backend/api.php?action=get_tour_itinerary${clientId ? `&client_id=${encodeURIComponent(clientId)}` : ''}`);
    if (!res || !res.success) return { error: res?.error || 'Could not load the tour.' };

    const onTour = new Set((res.stops || []).map(s => String(s.mls_id)));
    const skipped = { onTour: 0, notShowable: 0, overLimit: 0 };
    const homes = [];
    for (const p of homesInView()) {
        if (onTour.has(String(p.mls_id))) { skipped.onTour++; continue; }
        if (NOT_SHOWABLE.test(p.status || '')) { skipped.notShowable++; continue; }
        if (homes.length >= MAX_BATCH) { skipped.overLimit++; continue; }
        homes.push(p);
    }
    return { clientId: res.client_id, clientName: res.client_name || 'your', own: !isAgent(), homes, skipped, alreadyOnTour: onTour.size };
}

function planHtml(p) {
    const who = p.own ? 'your tour' : `${esc(p.clientName)}'s tour`;
    const notes = [];
    if (p.skipped.onTour) notes.push(`${p.skipped.onTour} already on the tour`);
    if (p.skipped.notShowable) notes.push(`${p.skipped.notShowable} not available to show (pending, closed or off market)`);
    if (p.skipped.overLimit) notes.push(`${p.skipped.overLimit} more past the ${MAX_BATCH}-home limit; narrow your filters to add them next`);
    if (!p.homes.length) {
        return `<p class="tour-bulk-lead">Nothing new to add to ${who}.</p>
            ${notes.length ? `<ul class="tour-bulk-notes">${notes.map(n => `<li>${n}</li>`).join('')}</ul>` : ''}
            <div class="brief-actions"><button type="button" class="btn btn-secondary" data-tour-bulk="close">Close</button></div>`;
    }
    return `
        <p class="tour-bulk-lead">Add <strong>${p.homes.length} home${p.homes.length === 1 ? '' : 's'}</strong> to ${who}${p.alreadyOnTour ? `, which has ${p.alreadyOnTour} already` : ''}.</p>
        <ol class="tour-bulk-list">
            ${p.homes.map(h => `<li><span>${esc(cleanDisplayAddress(h.address, h.mls_id))}</span><span class="tour-bulk-meta">${esc(h.city || '')}${h.price ? ` · $${Number(h.price).toLocaleString()}` : ''}</span></li>`).join('')}
        </ol>
        ${notes.length ? `<p class="tour-bulk-skip">Skipped: ${notes.join('; ')}.</p>` : ''}
        ${p.own ? '<p class="tour-bulk-hint">Each one is a showing request: it shows as <strong>Requested</strong> until your agent confirms it.</p>' : ''}
        <p class="tour-bulk-hint">They're added in the order shown. Use <strong>Optimize Route</strong> in the Tour Planner to find the shortest drive.</p>
        <div class="brief-actions">
            <button type="button" class="btn btn-secondary" data-tour-bulk="close">Cancel</button>
            <button type="button" class="btn btn-primary" data-tour-bulk="confirm"><i data-lucide="route"></i> Add ${p.homes.length} to tour</button>
        </div>`;
}

export async function openTourBulkAdd() {
    const modal = ensureModal();
    modal.classList.add('active');
    const body = document.getElementById('tour-bulk-body');
    body.innerHTML = '<p class="brief-empty">Checking the tour…</p>';
    try {
        plan = await buildPlan();
        body.innerHTML = plan.error ? `<p class="brief-empty">${esc(plan.error)}</p>` : planHtml(plan);
    } catch (e) {
        plan = null;
        body.innerHTML = `<p class="brief-empty">${esc(e.message || 'Could not load the tour.')}</p>`;
    }
    if (window.lucide) window.lucide.createIcons();
}

function closeModal() {
    document.getElementById('modal-tour-bulk')?.classList.remove('active');
    plan = null;
}

async function confirmAdd(btn) {
    if (!plan || !plan.homes?.length) return;
    btn.disabled = true;
    // A pending Tour Planner autosave holds the old stop list; let it land before adding.
    if (window.tourViewManager?.flushAutosave) await window.tourViewManager.flushAutosave();
    let added = 0;
    const failed = [];
    for (const h of plan.homes) {
        btn.innerHTML = `<i data-lucide="loader-2" class="animate-spin"></i> Adding ${added + 1} of ${plan.homes.length}…`;
        try {
            const res = await apiFetch('backend/api.php?action=add_to_tour', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(plan.own ? { mls_id: h.mls_id } : { mls_id: h.mls_id, client_id: plan.clientId }),
            });
            if (res && res.success) added++; else failed.push(h);
        } catch (e) {
            failed.push(h);
        }
    }
    const who = plan.own ? 'your tour' : `${plan.clientName}'s tour`;
    closeModal();
    if (failed.length) showToast(`Added ${added} to ${who}; ${failed.length} could not be added. Try again in a moment.`, 'error');
    else showToast(plan.own
        ? `Requested ${added} showing${added === 1 ? '' : 's'}. They show as Requested until your agent confirms.`
        : `Added ${added} home${added === 1 ? '' : 's'} to ${who}.`, 'success');
    if (added && window.switchView) window.switchView('tour');
}

window.openTourBulkAdd = openTourBulkAdd;

document.addEventListener('click', event => {
    const t = event.target;
    if (!(t instanceof Element)) return;
    if (t.closest('#btn-add-view-to-tour')) { openTourBulkAdd(); return; }
    if (t.id === 'modal-tour-bulk') { closeModal(); return; }
    const action = t.closest('[data-tour-bulk]');
    if (!action || !action.closest('#modal-tour-bulk')) return;
    if (action.dataset.tourBulk === 'close') closeModal();
    else if (action.dataset.tourBulk === 'confirm') confirmAdd(action);
});

document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && document.getElementById('modal-tour-bulk')?.classList.contains('active')) closeModal();
});
