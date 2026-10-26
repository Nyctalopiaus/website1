/**
 * Client side of "release to a departing agent" (brokerage step 4) and "Download my data".
 *   - When the brokerage offers a client the choice to follow a departing agent, this shows the
 *     offer once the client signs in. Staying changes nothing. Going offers a download of their own
 *     data first, then (if they choose) closes their account here.
 *   - "Download my data" in the user menu gives any client the same download at any time.
 * The download is two files: a CSV of their homes (decisions, ratings, notes, tour scores, rank)
 * and a JSON file with everything (tours, My Home, brief, saved searches).
 * Backend: get_my_release / respond_client_release / export_my_data in backend/brokerage.php.
 */
import { apiFetch } from './api.js';
import { state } from './state.js';
import { showToast } from './toast.js';
import { escapeHtml } from './properties.js';

const API = 'backend/api.php';
const esc = v => escapeHtml(String(v ?? ''));
let offer = null;
let downloaded = false;

function saveFile(name, text, type) {
    const blob = new Blob([text], { type });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

const csvCell = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

/** Downloads the signed-in user's data as a CSV of homes plus a full JSON file. */
export async function downloadMyData() {
    const res = await apiFetch(`${API}?action=export_my_data`);
    if (!res?.success) throw new Error(res?.error || 'Could not prepare your data.');
    const day = new Date().toISOString().slice(0, 10);
    const who = String(res.account?.full_name || res.account?.username || 'my').replace(/[^A-Za-z0-9 _-]+/g, '').trim() || 'my';
    const decision = h => h.favorite ? 'Love it' : (h.possibility ? 'See it again' : (h.passed ? 'Pass' : ''));
    const head = ['Top Picks rank', 'MLS #', 'Address', 'City', 'Zip', 'Price', 'Status', 'Beds', 'Baths', 'Finished sq ft', 'Year built',
        'Decision', 'Toured', 'Toured on', 'Tour scores', 'My notes', 'Tour notes', 'Notes from my agent', 'Listing link'];
    const rows = (res.homes || []).map(h => [h.pick_rank || '', h.mls_id, h.address, h.city, h.zip, h.price, h.status, h.beds, h.baths,
        h.sqft_finished, h.year_built, decision(h), h.toured ? 'Yes' : '', h.toured_at || '',
        h.tour_scores ? Object.entries(h.tour_scores).map(([k, v]) => `${k.replace('_', ' ')} ${v}`).join('; ') : '',
        h.my_notes, h.tour_notes, h.agent_shared_notes, h.mls_url || ''].map(csvCell).join(','));
    saveFile(`Dibs homes - ${who} - ${day}.csv`, '﻿' + [head.join(','), ...rows].join('\r\n'), 'text/csv;charset=utf-8');
    saveFile(`Dibs data - ${who} - ${day}.json`, JSON.stringify(res, null, 2), 'application/json');
    return (res.homes || []).length;
}

function modal() {
    let m = document.getElementById('modal-client-release');
    if (m) return m;
    m = document.createElement('div');
    m.className = 'modal-overlay';
    m.id = 'modal-client-release';
    m.innerHTML = `<div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="client-release-title" style="max-width:520px;"><div id="client-release-body"></div></div>`;
    document.body.appendChild(m);
    return m;
}

function renderOffer() {
    const o = offer;
    const office = o.brokerage_name || 'your brokerage';
    document.getElementById('client-release-body').innerHTML = `
        <h2 id="client-release-title" style="margin-top:0;"><i data-lucide="route"></i> A choice about your agent</h2>
        <p><strong>${esc(o.agent_name)}</strong> is leaving ${esc(office)}${o.new_brokerage ? ` for <strong>${esc(o.new_brokerage)}</strong>` : ''}. You can stay with ${esc(office)} or go with ${esc(o.agent_name)}.</p>
        ${o.note ? `<blockquote class="cr-note">${esc(o.note)}</blockquote>` : ''}
        <p class="bk-hint">Nothing changes until you choose.</p>
        <div class="brief-actions">
            <button type="button" class="btn btn-secondary" data-cr="later">Decide later</button>
            <button type="button" class="btn btn-secondary" data-cr="stay">Stay with ${esc(office)}</button>
            <button type="button" class="btn btn-primary" data-cr="go">Go with ${esc(o.agent_name)}</button>
        </div>`;
    if (window.lucide) window.lucide.createIcons();
}

function renderGo() {
    const o = offer;
    document.getElementById('client-release-body').innerHTML = `
        <h2 id="client-release-title" style="margin-top:0;"><i data-lucide="download"></i> Take your data with you</h2>
        <p>If ${esc(o.agent_name)}'s new brokerage is on Dibs too, accept their invite link and choose <strong>"Moving from another brokerage on Dibs?"</strong> when you sign up: your homes, notes, ratings, tour results, Top Picks, My Home and brief move with you. Do that within 90 days. Keep your account open here until then; it's closed automatically when you move.</p>
        <p>Either way, you can also download a copy of your data now.</p>
        <p><button type="button" class="btn btn-secondary" data-cr="download"><i data-lucide="download"></i> Download my data</button>
            <span class="bk-hint" data-cr-done>${downloaded ? 'Downloaded.' : ''}</span></p>
        <label class="bk-check"><input type="checkbox" data-cr-close> Close my Dibs account here now (only if their new brokerage isn't on Dibs; moving closes it for you)</label>
        <div class="brief-actions">
            <button type="button" class="btn btn-secondary" data-cr="back">Back</button>
            <button type="button" class="btn btn-primary" data-cr="confirm-go">Confirm</button>
        </div>`;
    if (window.lucide) window.lucide.createIcons();
}

async function respond(decision, closeAccount = false) {
    const res = await apiFetch(`${API}?action=respond_client_release`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ release_id: offer.release_id, decision, close_account: closeAccount ? 1 : 0 }),
    });
    if (!res?.success) throw new Error(res?.error || 'Could not save your choice.');
    return res;
}

async function checkOffer() {
    const role = state.currentUserProfile?.role;
    if (!state.authenticated || role !== 'client') return;
    try {
        const res = await apiFetch(`${API}?action=get_my_release`);
        if (!res?.success || !res.release) return;
        if (sessionStorage.getItem('dibs_release_later') === String(res.release.release_id)) return;
        offer = res.release;
        modal().classList.add('active');
        renderOffer();
    } catch (e) { /* try again next sign-in */ }
}

// Wait for sign-in to finish, then check once.
let tries = 0;
const wait = setInterval(() => {
    tries++;
    if (state.authenticated && state.currentUserProfile) { clearInterval(wait); checkOffer(); }
    else if (tries > 60) clearInterval(wait);
}, 1000);

document.addEventListener('click', async e => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    if (t.closest('[data-export-my-data]')) {
        try { const n = await downloadMyData(); showToast(`Downloaded your data (${n} homes).`, 'success'); }
        catch (err) { showToast(err.message, 'error'); }
        return;
    }
    const el = t.closest('#modal-client-release [data-cr]');
    if (!el) return;
    const m = document.getElementById('modal-client-release');
    try {
        switch (el.dataset.cr) {
            case 'later':
                try { sessionStorage.setItem('dibs_release_later', String(offer.release_id)); } catch (_) { /* fine */ }
                m.classList.remove('active');
                break;
            case 'stay':
                el.disabled = true;
                await respond('stay');
                m.classList.remove('active');
                showToast("You're staying. Nothing has changed.", 'success');
                break;
            case 'go': renderGo(); break;
            case 'back': renderOffer(); break;
            case 'download': {
                el.disabled = true;
                const n = await downloadMyData();
                downloaded = true;
                const done = m.querySelector('[data-cr-done]');
                if (done) done.textContent = `Downloaded (${n} homes).`;
                el.disabled = false;
                break;
            }
            case 'confirm-go': {
                const close = !!m.querySelector('[data-cr-close]')?.checked;
                if (close && !downloaded && !window.confirm("You haven't downloaded your data. Close your account anyway?")) return;
                el.disabled = true;
                const res = await respond('go', close);
                m.classList.remove('active');
                if (res.closed) {
                    showToast('Your account is closed. Thank you for using Dibs.', 'success');
                    setTimeout(() => window.location.reload(), 1500);
                } else {
                    showToast(`Got it. Your brokerage has been told you're going with ${offer.agent_name}.`, 'success');
                }
                break;
            }
        }
    } catch (err) {
        showToast(err.message, 'error');
        el.disabled = false;
    }
});
