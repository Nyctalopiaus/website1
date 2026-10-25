/**
 * Showing requests for realtors/admins (backend/requests.php).
 *
 * - #showing-requests-panel at the top of the Agent Hub: each client with homes waiting, Confirm all,
 *   per-home Confirm / Can't schedule (with a reason), and Open in Tour Planner.
 * - A count badge on the Agent Hub and Tour Planner header buttons while requests are waiting.
 * realtorView.js calls window.renderShowingRequests() after each render.
 */
import { state } from './state.js';
import { apiFetch } from './api.js';
import { escapeHtml, cleanDisplayAddress } from './properties.js';
import { showToast } from './toast.js';

const esc = v => escapeHtml(String(v ?? ''));
const POLL_MS = 2 * 60 * 1000;
const REASONS = [
    ['', 'Choose a reason…'],
    ['The seller isn\'t allowing showings then.', 'Seller isn\'t allowing showings then'],
    ['This home is already under contract.', 'Already under contract'],
    ['The listing agent hasn\'t confirmed yet; I\'ll keep trying.', 'Listing agent hasn\'t confirmed'],
    ['It doesn\'t fit the tour schedule.', 'Doesn\'t fit the tour schedule'],
    ['other', 'Other (write a note)'],
];

let data = null;            // last list_showing_requests response
let open = new Set();       // client ids expanded
let declining = null;       // `${clientId}|${mlsId}` showing the reason picker
let busy = false;

function isAgent() {
    const role = state.currentUserProfile?.role || '';
    return role === 'realtor' || role === 'admin' || Boolean(state.isAdmin);
}

function ago(s) {
    const t = Date.parse(String(s || '').replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(s || '') ? '' : 'Z'));
    if (Number.isNaN(t)) return '';
    const sec = Math.max(0, (Date.now() - t) / 1000);
    if (sec < 3600) return sec < 120 ? 'just now' : `${Math.floor(sec / 60)}m ago`;
    if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
    return `${Math.floor(sec / 86400)}d ago`;
}

async function load() {
    const res = await apiFetch('backend/api.php?action=list_showing_requests');
    if (!res || !res.success) throw new Error(res?.error || 'Could not load showing requests.');
    data = res;
    paintBadges();
    return res;
}

function paintBadges() {
    const n = data?.total || 0;
    ['btn-agent-hub-direct', 'btn-top-map-homeward'].forEach(id => {
        const btn = document.getElementById(id);
        if (!btn) return;
        let b = btn.querySelector('.req-badge');
        if (!n || !isAgent()) { b?.remove(); return; }
        if (!b) { b = document.createElement('span'); b.className = 'req-badge'; btn.appendChild(b); }
        b.textContent = n > 99 ? '99+' : String(n);
        b.title = `${n} showing request${n === 1 ? '' : 's'} waiting`;
    });
}

function homeHtml(c, h) {
    const key = `${c.client_id}|${h.mls_id}`;
    const meta = [h.city, h.price ? `$${Number(h.price).toLocaleString()}` : '', h.beds ? `${h.beds} bd` : '', h.baths ? `${h.baths} ba` : ''].filter(Boolean).join(' · ');
    const offMarket = /pending|closed|sold|withdrawn|expired|off market|cancel/i.test(h.listing_status || '');
    return `<li class="req-home">
        ${h.image ? `<img class="req-thumb" src="${esc(h.image)}" alt="" loading="lazy">` : '<span class="req-thumb req-thumb--none"></span>'}
        <div class="req-home-body">
            <button type="button" class="req-home-addr" data-req-open="${esc(h.mls_id)}">${esc(cleanDisplayAddress(h.address, h.mls_id))}</button>
            <div class="req-home-meta">${esc(meta)}${offMarket ? ` · <span class="req-warn">${esc(h.listing_status)}</span>` : ''} · requested ${esc(ago(h.requested_at))}</div>
            ${declining === key ? `
            <div class="req-decline">
                <select class="select-input" data-req-reason aria-label="Reason">${REASONS.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select>
                <input type="text" class="text-input" data-req-note maxlength="300" placeholder="Note to ${esc(c.client_name)}" hidden>
                <button type="button" class="btn btn-secondary btn-compact" data-req="decline-send" data-client="${esc(c.client_id)}" data-mls="${esc(h.mls_id)}">Send</button>
                <button type="button" class="btn btn-secondary btn-compact" data-req="decline-cancel">Cancel</button>
            </div>` : ''}
        </div>
        ${declining === key ? '' : `<div class="req-home-actions">
            <button type="button" class="btn btn-primary btn-compact" data-req="confirm" data-client="${esc(c.client_id)}" data-mls="${esc(h.mls_id)}"><i data-lucide="check"></i> Confirm</button>
            <button type="button" class="btn btn-secondary btn-compact" data-req="decline" data-client="${esc(c.client_id)}" data-mls="${esc(h.mls_id)}">Can't schedule</button>
        </div>`}
    </li>`;
}

function clientHtml(c) {
    const isOpen = open.has(String(c.client_id));
    const n = c.homes.length;
    return `<div class="req-client" data-req-client="${esc(c.client_id)}">
        <div class="req-client-head">
            <button type="button" class="req-client-toggle" data-req="toggle" data-client="${esc(c.client_id)}" aria-expanded="${isOpen}">
                <i data-lucide="${isOpen ? 'chevron-down' : 'chevron-right'}"></i>
                <span class="req-client-name">${esc(c.client_name)}</span>
                <span class="req-client-sub">${n} home${n === 1 ? '' : 's'} requested · ${esc(ago(c.latest))}</span>
            </button>
            <div class="req-client-actions">
                <button type="button" class="btn btn-secondary btn-compact" data-req="planner" data-client="${esc(c.client_id)}"><i data-lucide="route"></i> Open in Tour Planner</button>
                <button type="button" class="btn btn-primary btn-compact" data-req="confirm-all" data-client="${esc(c.client_id)}"><i data-lucide="check-check"></i> Confirm all ${n}</button>
            </div>
        </div>
        ${isOpen ? `<ul class="req-home-list">${c.homes.map(h => homeHtml(c, h)).join('')}</ul>` : ''}
    </div>`;
}

function paint() {
    const panel = document.getElementById('showing-requests-panel');
    if (!panel) return;
    const clients = data?.clients || [];
    if (!clients.length) { panel.hidden = true; panel.innerHTML = ''; return; }
    panel.hidden = false;
    panel.innerHTML = `
        <div class="req-head">
            <span class="req-title"><i data-lucide="calendar-plus"></i> Showing requests</span>
            <span class="agent-feed-count">${data.total} waiting</span>
        </div>
        ${clients.map(clientHtml).join('')}`;
    if (window.lucide) window.lucide.createIcons();
}

export async function renderShowingRequests() {
    if (!isAgent() || !document.getElementById('showing-requests-panel')) return;
    try { await load(); paint(); } catch (e) { console.warn('[ShowingRequests]', e); }
}
window.renderShowingRequests = renderShowingRequests;

/** Expand one client's requests and bring the panel into view (used by the activity feed). */
window.showShowingRequests = async function (clientId) {
    if (clientId) open.add(String(clientId));
    await renderShowingRequests();
    document.getElementById('showing-requests-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

async function respond(clientId, mlsIds, decision, note = '') {
    if (busy) return;
    busy = true;
    try {
        const res = await apiFetch('backend/api.php?action=respond_showing_requests', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ client_id: clientId, mls_ids: mlsIds, decision, note }),
        });
        if (!res || !res.success) throw new Error(res?.error || 'Could not save.');
        const n = res.updated.length;
        showToast(decision === 'confirm'
            ? `Confirmed ${n} showing${n === 1 ? '' : 's'}.`
            : 'Marked as can\'t schedule. Your client will see your note.', 'success');
        declining = null;
        await load();
        paint();
        window.renderAgentFeedPanel?.(true);
    } catch (e) {
        showToast(e.message || 'Could not save.', 'error');
    } finally {
        busy = false;
    }
}

document.addEventListener('click', event => {
    const t = event.target;
    if (!(t instanceof Element) || !t.closest('#showing-requests-panel')) return;
    const openListing = t.closest('[data-req-open]');
    if (openListing) { window.openDetailModal?.(openListing.dataset.reqOpen); return; }
    const btn = t.closest('[data-req]');
    if (!btn || busy) return;
    const clientId = btn.dataset.client;
    const group = (data?.clients || []).find(c => String(c.client_id) === String(clientId));
    switch (btn.dataset.req) {
        case 'toggle':
            open.has(String(clientId)) ? open.delete(String(clientId)) : open.add(String(clientId));
            paint();
            break;
        case 'confirm-all':
            if (group) respond(clientId, group.homes.map(h => h.mls_id), 'confirm');
            break;
        case 'confirm':
            respond(clientId, [btn.dataset.mls], 'confirm');
            break;
        case 'decline':
            declining = `${clientId}|${btn.dataset.mls}`;
            paint();
            break;
        case 'decline-cancel':
            declining = null;
            paint();
            break;
        case 'decline-send': {
            const box = btn.closest('.req-decline');
            const reason = box.querySelector('[data-req-reason]').value;
            const typed = box.querySelector('[data-req-note]').value.trim();
            const note = reason === 'other' ? typed : reason;
            if (!note) { showToast(reason === 'other' ? 'Write a short note for your client.' : 'Choose a reason.', 'error'); return; }
            respond(clientId, [btn.dataset.mls], 'unavailable', note.slice(0, 300));
            break;
        }
        case 'planner':
            (async () => {
                await window.tourViewManager?.flushAutosave?.();
                try { localStorage.setItem('active_tour_client_id', String(clientId)); } catch (e) { /* storage unavailable */ }
                window.switchView?.('tour');
            })();
            break;
    }
});

document.addEventListener('change', event => {
    const sel = event.target;
    if (!(sel instanceof HTMLSelectElement) || !sel.matches('#showing-requests-panel [data-req-reason]')) return;
    const note = sel.closest('.req-decline')?.querySelector('[data-req-note]');
    if (note) { note.hidden = sel.value !== 'other'; if (!note.hidden) note.focus(); }
});

// Badge: check shortly after sign-in, then every couple of minutes while the page is open.
async function pollBadge() {
    if (!isAgent()) return;
    try { await load(); if (document.getElementById('showing-requests-panel')) paint(); } catch (e) { /* next poll */ }
}
setTimeout(pollBadge, 2500);
setTimeout(pollBadge, 8000);
setInterval(() => { if (!document.hidden) pollBadge(); }, POLL_MS);
