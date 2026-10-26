/**
 * Brokerage settings and agent roster (brokerage admins). Step 3 of claude/brokerage-spec.md.
 *   Office tab: name, phone, address, logo, default selling cost, showing defaults, shared calendars.
 *   Agents tab: every realtor with status and client count; invite an agent (email link, like
 *   client invites); deactivate an agent, which first reassigns each of their clients; reactivate.
 * Backend: backend/brokerage.php, branding.php (kind=brokerage_logo), invites.php (invite_role=realtor).
 */
import { apiFetch } from './api.js';
import { state } from './state.js';
import { showToast } from './toast.js';
import { escapeHtml } from './properties.js';

const API = 'backend/api.php';
const esc = v => escapeHtml(String(v ?? ''));
const SHOW_MINUTES = [15, 20, 30, 45, 60, 90];
const BUFFER_MINUTES = [0, 5, 10, 15, 20, 30];

let tab = 'office';
let settings = null;
let agents = [];
let agentInvites = [];

function isAdmin() {
    const p = state.currentUserProfile || {};
    return Boolean(state.isAdmin) || p.role === 'admin' || Number(p.is_admin) === 1;
}

function ensureModal() {
    let m = document.getElementById('modal-brokerage');
    if (m) return m;
    m = document.createElement('div');
    m.className = 'modal-overlay';
    m.id = 'modal-brokerage';
    m.innerHTML = `
        <div class="modal-content brokerage-modal" role="dialog" aria-modal="true" aria-labelledby="brokerage-title">
            <button class="modal-close" aria-label="Close" data-bk="close"><i data-lucide="x"></i></button>
            <div class="my-home-header">
                <h2 id="brokerage-title"><i data-lucide="building-2"></i> Brokerage</h2>
                <div class="bk-tabs" role="tablist">
                    <button type="button" role="tab" class="bk-tab" data-bk-tab="office">Office</button>
                    <button type="button" role="tab" class="bk-tab" data-bk-tab="agents">Agents</button>
                    <button type="button" role="tab" class="bk-tab" data-bk-tab="billing">Billing</button>
                </div>
            </div>
            <div id="brokerage-body"><p class="my-home-loading">Loading…</p></div>
        </div>`;
    document.body.appendChild(m);
    return m;
}

export async function openBrokerageModal(startTab = 'office') {
    if (!isAdmin()) { showToast('Brokerage settings are for brokerage admins.', 'error'); return; }
    tab = startTab;
    ensureModal().classList.add('active');
    await load();
}
window.openBrokerageModal = openBrokerageModal;

async function load() {
    const body = document.getElementById('brokerage-body');
    body.innerHTML = '<p class="my-home-loading">Loading…</p>';
    try {
        const [s, a, inv] = await Promise.all([
            apiFetch(`${API}?action=get_brokerage_settings`),
            apiFetch(`${API}?action=list_agents`),
            apiFetch(`${API}?action=list_invites`),
        ]);
        if (!s?.success) throw new Error(s?.error || 'Could not load the brokerage settings.');
        if (!a?.success) throw new Error(a?.error || 'Could not load the agents.');
        settings = s.settings;
        agents = a.agents || [];
        agentInvites = (inv?.invites || []).filter(i => i.invite_role === 'realtor' && i.status === 'pending');
        render();
    } catch (e) {
        body.innerHTML = `<p class="my-home-loading">${esc(e.message)}</p>`;
    }
}

function render() {
    document.querySelectorAll('#modal-brokerage [data-bk-tab]').forEach(b => {
        b.classList.toggle('is-on', b.dataset.bkTab === tab);
        b.setAttribute('aria-selected', String(b.dataset.bkTab === tab));
    });
    if (tab === 'billing') { renderBilling(); return; }
    document.getElementById('brokerage-body').innerHTML = tab === 'office' ? officeHtml() : agentsHtml();
    if (window.lucide) window.lucide.createIcons();
}

function officeHtml() {
    const s = settings;
    const opt = (list, v, unit) => list.map(n => `<option value="${n}" ${n === v ? 'selected' : ''}>${n} ${unit}</option>`).join('');
    return `
        <form class="bk-form" data-bk-form="office" novalidate>
            <div class="bk-grid">
                <label>Brokerage name<input type="text" name="name" maxlength="120" value="${esc(s.name)}" placeholder="e.g. Exit Realty DTC"></label>
                <label>Office phone<input type="tel" name="office_phone" maxlength="40" value="${esc(s.office_phone)}" placeholder="(303) 555-0100"></label>
                <label class="bk-wide">Office address<input type="text" name="office_address" maxlength="200" value="${esc(s.office_address)}" placeholder="Street, city, CO zip"></label>
            </div>
            <div class="bk-logo">
                <span class="filter-label">Office logo</span>
                <div class="bk-logo-row">
                    <div class="branding-preview">${s.logo_url ? `<img src="${esc(s.logo_url)}" alt="Office logo">` : '<i data-lucide="building-2"></i>'}</div>
                    <label class="btn btn-secondary btn-compact">Upload<input type="file" accept="image/jpeg,image/png" data-bk-logo hidden></label>
                    ${s.logo_url ? '<button type="button" class="btn btn-secondary btn-compact" data-bk="logo-remove">Remove</button>' : ''}
                </div>
                <span class="bk-hint">JPG or PNG, up to 4 MB. Prints on tour packets for agents who haven't uploaded their own logo. Saved as soon as you pick a file.</span>
            </div>
            <h3 class="my-home-section-title"><i data-lucide="sliders-horizontal"></i> Defaults</h3>
            <div class="bk-grid">
                <label>Selling cost for My Home (%)<input type="number" name="sell_cost_pct" min="0" max="15" step="0.25" value="${esc(s.sell_cost_pct)}"></label>
                <label>Time at each showing<select name="showing_minutes" class="select-input">${opt(SHOW_MINUTES, s.showing_minutes, 'min')}</select></label>
                <label>Buffer between showings<select name="buffer_minutes" class="select-input">${opt(BUFFER_MINUTES, s.buffer_minutes, 'min')}</select></label>
            </div>
            <label class="bk-check"><input type="checkbox" name="share_calendars" ${s.share_calendars ? 'checked' : ''}> Agents can see each other's showings on the Schedule (to spot double-booked listings)</label>
            <p class="bk-hint">Brokerage address: <code>${esc(location.origin)}/dibs/b/${esc(s.slug)}/</code></p>
            <div class="brief-actions">
                <button type="button" class="btn btn-secondary" data-bk="close">Close</button>
                <button type="submit" class="btn btn-primary"><i data-lucide="save"></i> Save</button>
            </div>
        </form>`;
}

function agentsHtml() {
    const active = agents.filter(a => a.status === 'active');
    const rows = agents.map(a => `
        <tr class="${a.status === 'active' ? '' : 'bk-off'}">
            <td><strong>${esc(a.name)}</strong>${a.is_you ? ' <span class="bk-you">(you)</span>' : ''}<div class="bk-sub">${esc(a.email || a.username)}</div></td>
            <td>${a.is_admin ? 'Agent + admin' : 'Agent'}</td>
            <td>${a.status === 'active' ? 'Active' : 'Deactivated'}</td>
            <td>${a.client_count}</td>
            <td class="bk-actions">${a.is_you ? '' : (a.status === 'active'
                ? `<button type="button" class="btn btn-secondary btn-sm" data-bk="deactivate" data-id="${esc(a.id)}">Deactivate…</button>`
                : `<button type="button" class="btn btn-secondary btn-sm" data-bk="reactivate" data-id="${esc(a.id)}">Reactivate</button>`)}</td>
        </tr>`).join('');
    return `
        <table class="bk-table">
            <thead><tr><th>Agent</th><th>Role</th><th>Status</th><th>Clients</th><th></th></tr></thead>
            <tbody>${rows || '<tr><td colspan="5">No agents yet.</td></tr>'}</tbody>
        </table>
        <p class="bk-hint">${active.length} active agent${active.length === 1 ? '' : 's'}. Deactivating an agent moves each of their clients to another agent first, with all of the client's history; the agent can no longer sign in.</p>
        ${clientsHtml()}
        <h3 class="my-home-section-title"><i data-lucide="user-plus"></i> Invite an agent</h3>
        <form class="bk-grid" data-bk-form="invite" novalidate>
            <label>Name<input type="text" name="full_name" maxlength="80" required placeholder="Agent's full name"></label>
            <label>Email<input type="email" name="email" maxlength="254" required placeholder="agent@brokerage.com"></label>
            <div class="bk-invite-go"><button type="submit" class="btn btn-primary"><i data-lucide="send"></i> Create invite link</button></div>
        </form>
        <div id="bk-invite-result"></div>
        ${agentInvites.length ? `<p class="bk-hint">Pending agent invites: ${agentInvites.map(i => esc(i.full_name)).join(', ')}.</p>` : ''}`;
}

/** Billing tab: plan, trial, seats and the price. Payment setup comes when Stripe is connected. */
async function renderBilling() {
    const body = document.getElementById('brokerage-body');
    body.innerHTML = '<p class="my-home-loading">Loading…</p>';
    try {
        const res = await apiFetch(`${API}?action=billing_status`);
        if (!res?.success) throw new Error(res?.error || 'Could not load billing.');
        const b = res.billing;
        const money = v => '$' + Number(v).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
        const daysLeft = b.trial_ends_at ? Math.max(0, Math.ceil((new Date(b.trial_ends_at.replace(' ', 'T') + 'Z') - Date.now()) / 86400000)) : null;
        const plan = {
            comped: 'Free (no charge)',
            trial: daysLeft !== null ? `Free trial: ${daysLeft} day${daysLeft === 1 ? '' : 's'} left` : 'Free trial',
            monthly: 'Monthly', annual: 'Yearly',
        }[b.plan] || b.plan;
        const seats = Math.max(1, b.seats);
        body.innerHTML = `
            <table class="bk-table"><tbody>
                <tr><td>Plan</td><td><strong>${esc(plan)}</strong></td></tr>
                <tr><td>Agent seats</td><td>${b.seats} active agent${b.seats === 1 ? '' : 's'}</td></tr>
                <tr><td>Price</td><td>${money(b.price_monthly)} per agent a month, or ${money(b.price_yearly)} per agent a year</td></tr>
                ${b.plan === 'comped' ? '' : `<tr><td>Your cost</td><td>${money(seats * b.price_monthly)} a month (${seats} seat${seats === 1 ? '' : 's'}), or ${money(seats * b.price_yearly)} a year</td></tr>`}
            </tbody></table>
            <p class="bk-hint">Seats are agents who can sign in. Clients are always free. Deactivating an agent frees their seat.</p>
            ${b.plan === 'comped' ? '' : `<p class="bk-hint">${b.payments_connected ? '' : 'Online payment setup is coming soon. Nothing will be charged until you add a card.'}</p>`}`;
    } catch (e) {
        body.innerHTML = `<p class="my-home-loading">${esc(e.message)}</p>`;
    }
}

/** Every active agent's clients, with "Release…" (offer the client the choice to follow an agent who's leaving). */
function clientsHtml() {
    const rows = agents.filter(a => a.status === 'active').flatMap(a => a.roster.map(c => ({ c, a })));
    if (!rows.length) return '';
    return `
        <h3 class="my-home-section-title"><i data-lucide="users"></i> Clients</h3>
        <table class="bk-table"><tbody>
            ${rows.map(({ c, a }) => `<tr>
                <td><strong>${esc(c.name)}</strong><div class="bk-sub">Agent: ${esc(a.name)}</div></td>
                <td>${c.release ? `Offered to go with ${esc(c.release.agent_name)}; waiting for their answer` : ''}</td>
                <td class="bk-actions">${c.release
                    ? `<button type="button" class="btn btn-secondary btn-sm" data-bk="release-cancel" data-id="${esc(c.release.release_id)}">Withdraw offer</button>`
                    : `<button type="button" class="btn btn-secondary btn-sm" data-bk="release" data-id="${esc(c.id)}" data-agent="${esc(a.id)}">Release…</button>`}</td>
            </tr>`).join('')}
        </tbody></table>
        <p class="bk-hint">"Release" asks the client whether they want to follow an agent who's leaving. Nothing changes unless they agree; if they do, they can download their own data (never your private notes) and close their account here.</p>`;
}

function releaseHtml(client, agent) {
    return `
        <h3 class="my-home-section-title"><i data-lucide="route"></i> Release ${esc(client.name)}</h3>
        <p class="bk-hint">${esc(client.name)} will be asked whether to stay with the brokerage or go with the agent below. You'll get a notice with their answer.</p>
        <form class="bk-grid" data-bk-form="release" data-client="${esc(client.id)}" novalidate>
            <label>Agent they'd follow<input type="text" name="agent_name" maxlength="80" required value="${esc(agent?.name || '')}"></label>
            <label>Agent's new brokerage (optional)<input type="text" name="new_brokerage" maxlength="120" placeholder="e.g. Compass"></label>
            <label class="bk-wide">Note to the client (optional)<input type="text" name="note" maxlength="500" placeholder="Anything they should know"></label>
            <div class="brief-actions bk-wide">
                <button type="button" class="btn btn-secondary" data-bk="back">Cancel</button>
                <button type="submit" class="btn btn-primary">Send the choice to ${esc(client.name)}</button>
            </div>
        </form>`;
}

/** The deactivate dialog: pick a new agent for each client (or one for all). */
function deactivateHtml(agent) {
    const others = agents.filter(a => a.status === 'active' && a.id !== agent.id);
    if (!others.length) return `<p>There's no other active agent to take ${esc(agent.name)}'s clients. Invite or reactivate an agent first.</p>
        <div class="brief-actions"><button type="button" class="btn btn-secondary" data-bk="back">Back</button></div>`;
    const preferred = (others.find(a => a.is_admin) || others[0]).id;
    const opts = sel => others.map(o => `<option value="${esc(o.id)}" ${o.id === sel ? 'selected' : ''}>${esc(o.name)}</option>`).join('');
    return `
        <h3 class="my-home-section-title"><i data-lucide="user-x"></i> Deactivate ${esc(agent.name)}</h3>
        ${agent.roster.length ? `
            <p class="bk-hint">Choose who takes over each client. They keep their favorites, notes, tour results and Top Picks, and both the client and the new agent get a notice.</p>
            <label class="bk-all">Give all clients to <select class="select-input" data-bk-all>${opts(preferred)}</select></label>
            <table class="bk-table"><tbody>
                ${agent.roster.map(c => `<tr><td>${esc(c.name)}</td><td><select class="select-input" data-bk-assign="${esc(c.id)}">${opts(preferred)}</select></td></tr>`).join('')}
            </tbody></table>` : `<p class="bk-hint">${esc(agent.name)} has no clients to reassign.</p>`}
        <p class="bk-hint">${esc(agent.name)} won't be able to sign in. Their notes and showings stay in the brokerage's records. You can reactivate them later.</p>
        <div class="brief-actions">
            <button type="button" class="btn btn-secondary" data-bk="back">Cancel</button>
            <button type="button" class="btn btn-primary" data-bk="confirm-deactivate" data-id="${esc(agent.id)}">Deactivate and reassign</button>
        </div>`;
}

async function post(action, body) {
    const res = await apiFetch(`${API}?action=${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res?.success) throw new Error(res?.error || 'Something went wrong.');
    return res;
}

document.addEventListener('click', async e => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    if (t.closest('[data-open-brokerage]')) { openBrokerageModal(); return; }
    if (!t.closest('#modal-brokerage')) return;
    if (t.id === 'modal-brokerage') { t.classList.remove('active'); return; }
    const tabBtn = t.closest('[data-bk-tab]');
    if (tabBtn) { tab = tabBtn.dataset.bkTab; render(); return; }
    const el = t.closest('[data-bk]');
    if (!el) return;
    const id = el.dataset.id;
    try {
        switch (el.dataset.bk) {
            case 'close': document.getElementById('modal-brokerage').classList.remove('active'); break;
            case 'back': render(); break;
            case 'copy-link': {
                const input = el.previousElementSibling;
                await navigator.clipboard.writeText(input.value);
                showToast('Link copied.', 'success');
                break;
            }
            case 'logo-remove':
                await post('remove_branding_image', { kind: 'brokerage_logo' });
                settings.logo_url = '';
                render();
                showToast('Office logo removed.', 'success');
                break;
            case 'deactivate': {
                const agent = agents.find(a => a.id === id);
                if (agent) { document.getElementById('brokerage-body').innerHTML = deactivateHtml(agent); if (window.lucide) window.lucide.createIcons(); }
                break;
            }
            case 'confirm-deactivate': {
                const assignments = {};
                document.querySelectorAll('#modal-brokerage [data-bk-assign]').forEach(s => { assignments[s.dataset.bkAssign] = s.value; });
                el.disabled = true;
                const res = await post('deactivate_agent', { agent_id: id, assignments });
                showToast(`Agent deactivated${res.reassigned ? `; ${res.reassigned} client${res.reassigned === 1 ? '' : 's'} reassigned` : ''}.`, 'success');
                await load();
                break;
            }
            case 'release': {
                const agent = agents.find(a => a.id === el.dataset.agent);
                const client = agent?.roster.find(c => c.id === id);
                if (client) { document.getElementById('brokerage-body').innerHTML = releaseHtml(client, agent); if (window.lucide) window.lucide.createIcons(); }
                break;
            }
            case 'release-cancel':
                await post('cancel_client_release', { release_id: Number(id) });
                showToast('Offer withdrawn.', 'success');
                await load();
                break;
            case 'reactivate':
                await post('reactivate_agent', { agent_id: id });
                showToast('Agent reactivated.', 'success');
                await load();
                break;
        }
    } catch (err) {
        showToast(err.message, 'error');
        el.disabled = false;
    }
});

document.addEventListener('change', async e => {
    const el = e.target;
    if (!(el instanceof Element) || !el.closest('#modal-brokerage')) return;
    if (el.matches('[data-bk-all]')) {
        document.querySelectorAll('#modal-brokerage [data-bk-assign]').forEach(s => { s.value = el.value; });
        return;
    }
    if (el.matches('[data-bk-logo]') && el.files?.[0]) {
        const fd = new FormData();
        fd.append('kind', 'brokerage_logo');
        fd.append('image', el.files[0]);
        try {
            const res = await apiFetch(`${API}?action=upload_branding_image`, { method: 'POST', body: fd });
            if (!res?.success) throw new Error(res?.error || 'Upload failed.');
            settings.logo_url = res.url;
            render();
            showToast('Office logo saved.', 'success');
        } catch (err) {
            showToast(err.message || 'Upload failed.', 'error');
        }
    }
});

document.addEventListener('submit', async e => {
    const form = e.target;
    if (!(form instanceof HTMLFormElement) || !form.closest('#modal-brokerage')) return;
    e.preventDefault();
    const btn = form.querySelector('[type="submit"]');
    const f = new FormData(form);
    try {
        if (btn) btn.disabled = true;
        if (form.dataset.bkForm === 'office') {
            const res = await post('save_brokerage_settings', {
                name: f.get('name'), office_phone: f.get('office_phone'), office_address: f.get('office_address'),
                sell_cost_pct: Number(f.get('sell_cost_pct')), showing_minutes: Number(f.get('showing_minutes')),
                buffer_minutes: Number(f.get('buffer_minutes')), share_calendars: f.get('share_calendars') ? 1 : 0,
            });
            settings = res.settings;
            showToast('Brokerage settings saved.', 'success');
        } else if (form.dataset.bkForm === 'release') {
            await post('request_client_release', { client_id: form.dataset.client, agent_name: f.get('agent_name'), new_brokerage: f.get('new_brokerage'), note: f.get('note') });
            showToast('Sent. The client will see the choice next time they open Dibs.', 'success');
            await load();
            return;
        } else if (form.dataset.bkForm === 'invite') {
            const res = await post('create_invite', { full_name: f.get('full_name'), email: f.get('email'), invite_role: 'realtor' });
            const link = `${new URL('join.html', location.href.split('#')[0]).href}#t=${res.token}`;
            document.getElementById('bk-invite-result').innerHTML = `
                <div class="bk-invite-link">
                    <p>Send this link to <strong>${esc(res.full_name)}</strong> (${esc(res.email)}). It works once and expires in 7 days.</p>
                    <input type="text" readonly value="${esc(link)}" onclick="this.select()">
                    <button type="button" class="btn btn-secondary btn-sm" data-bk="copy-link">Copy link</button>
                </div>`;
            form.reset();
        }
    } catch (err) {
        showToast(err.message, 'error');
    } finally {
        if (btn) btn.disabled = false;
    }
});

document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.getElementById('modal-brokerage')?.classList.contains('active')) {
        document.getElementById('modal-brokerage').classList.remove('active');
    }
});
