/**
 * Client invites (backend/invites.php): the "Invite client" dialog in the realtor view.
 * The agent enters a name and email, gets a single-use link to send themselves (Dibs doesn't
 * send email yet), and can see and revoke pending invites. The link is shown once only:
 * the server keeps just a hash of its token.
 */
import { state } from './state.js';
import { apiFetch } from './api.js';
import { escapeHtml } from './properties.js';
import { showToast } from './toast.js';

const esc = v => escapeHtml(String(v ?? ''));
const API = 'backend/api.php';
const STATUS = { pending: 'Waiting', accepted: 'Joined', expired: 'Expired', revoked: 'Cancelled' };
let agents = null; // admin only: [{id, name}]

function isAdmin() {
    const p = state.currentUserProfile || {};
    return p.role === 'admin' || Number(p.is_admin) === 1;
}

function shortDate(iso) {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function ensureModal() {
    let modal = document.getElementById('modal-invite');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'modal-invite';
    modal.innerHTML = `
        <div class="modal-content invite-modal" role="dialog" aria-modal="true" aria-labelledby="invite-title">
            <button class="modal-close" aria-label="Close" data-invite="close"><i data-lucide="x"></i></button>
            <div class="my-home-header">
                <h2 id="invite-title"><i data-lucide="user-plus"></i> Invite a client</h2>
                <p>They'll get their own Dibs login, already connected to you.</p>
            </div>
            <div id="invite-body"></div>
        </div>`;
    document.body.appendChild(modal);
    return modal;
}

async function loadAgents() {
    if (!isAdmin() || agents) return;
    try {
        const res = await apiFetch(`${API}?action=list_users`);
        agents = (res?.users || [])
            // Realtors only: an admin account is never a client's agent (the server enforces this too).
            .filter(u => u.role === 'realtor' && Number(u.is_admin) !== 1 && u.username !== 'admin')
            .map(u => ({ id: u.id, name: u.full_name || u.username }));
    } catch (e) {
        agents = [];
    }
}

function formHtml() {
    const agentField = isAdmin() && agents && agents.length
        ? `<label class="brief-field brief-field--wide"><span>Their agent</span>
            <select name="realtor_id">${agents.map(a => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('')}</select></label>`
        : '';
    return `
        <form id="invite-form" class="invite-form" novalidate>
            <label class="brief-field brief-field--wide"><span>Client's name</span>
                <input type="text" name="full_name" required minlength="2" maxlength="80" autocomplete="off"></label>
            <label class="brief-field brief-field--wide"><span>Their email</span>
                <input type="email" name="email" required maxlength="254" autocomplete="off"></label>
            ${agentField}
            <p class="join-error invite-error" id="invite-error" role="alert"></p>
            <button type="submit" class="btn btn-primary"><i data-lucide="link"></i> Create invite link</button>
        </form>
        <div id="invite-result"></div>
        <h3 class="brief-group">Your invites</h3>
        <div id="invite-list"><p class="brief-empty">Loading…</p></div>`;
}

function resultHtml(res, link) {
    const first = res.full_name.split(' ')[0];
    return `
        <div class="invite-result">
            <p class="invite-result-title"><i data-lucide="check-circle-2"></i> Invite ready for ${esc(res.full_name)}</p>
            <div class="invite-link-row">
                <input type="text" readonly value="${esc(link)}" aria-label="Invite link" id="invite-link">
                <button type="button" class="btn btn-gold" data-invite="copy"><i data-lucide="copy"></i> Copy</button>
            </div>
            <p class="invite-result-note">Send this to ${esc(first)} by text or email. It works once, until ${esc(shortDate(res.expires_at))}, and only with ${esc(res.email)}. You won't be able to see this link again; you can always create a new one.</p>
        </div>`;
}

async function renderList() {
    const box = document.getElementById('invite-list');
    if (!box) return;
    try {
        const res = await apiFetch(`${API}?action=list_invites`);
        if (!res?.success) throw new Error(res?.error || 'Could not load invites.');
        if (!res.invites.length) { box.innerHTML = '<p class="brief-empty">No invites yet.</p>'; return; }
        box.innerHTML = `<ul class="invite-list">${res.invites.map(i => `
            <li class="invite-row">
                <div class="invite-row-main">
                    <div class="invite-row-name">${esc(i.full_name)}${isAdmin() ? ` <span class="invite-row-agent">· ${esc(i.agent_name || '')}</span>` : ''}</div>
                    <div class="invite-row-meta">${esc(i.email)} · sent ${esc(shortDate(i.created_at))}${i.status === 'pending' ? ` · expires ${esc(shortDate(i.expires_at))}` : ''}</div>
                </div>
                <span class="invite-status invite-status--${esc(i.status)}">${esc(STATUS[i.status] || i.status)}</span>
                ${i.status === 'pending' ? `<button type="button" class="btn btn-secondary invite-revoke" data-invite="revoke" data-id="${esc(i.id)}">Cancel</button>` : ''}
            </li>`).join('')}</ul>`;
    } catch (e) {
        box.innerHTML = `<p class="brief-empty">${esc(e.message)}</p>`;
    }
}

export async function openInviteModal() {
    const modal = ensureModal();
    modal.classList.add('active');
    const body = document.getElementById('invite-body');
    body.innerHTML = '<p class="brief-empty">Loading…</p>';
    await loadAgents();
    if (isAdmin() && !(agents && agents.length)) {
        body.innerHTML = '<p class="brief-empty">Every client needs a realtor, and there are no realtor accounts yet. Create a realtor account first, then invite their clients.</p>';
        return;
    }
    body.innerHTML = formHtml();
    if (window.lucide) window.lucide.createIcons();
    body.querySelector('input[name="full_name"]')?.focus();
    renderList();
}

function closeModal() {
    document.getElementById('modal-invite')?.classList.remove('active');
}

async function submit(form) {
    const err = document.getElementById('invite-error');
    const data = Object.fromEntries(new FormData(form));
    err.textContent = '';
    if ((data.full_name || '').trim().length < 2) { err.textContent = "Enter the client's name."; return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((data.email || '').trim())) { err.textContent = 'Enter a valid email address.'; return; }
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
        const res = await apiFetch(`${API}?action=create_invite`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ full_name: data.full_name.trim(), email: data.email.trim(), realtor_id: data.realtor_id || undefined }),
        });
        if (!res?.success) throw new Error(res?.error || 'Could not create the invite.');
        // The token goes after "#" so it never reaches server logs or Referer headers.
        const link = `${new URL('join.html', location.href.split('#')[0]).href}#t=${res.token}`;
        document.getElementById('invite-result').innerHTML = resultHtml(res, link);
        form.reset();
        if (window.lucide) window.lucide.createIcons();
        renderList();
    } catch (e) {
        err.textContent = e.message;
    } finally {
        btn.disabled = false;
    }
}

async function copyLink(btn) {
    const input = document.getElementById('invite-link');
    if (!input) return;
    try {
        await navigator.clipboard.writeText(input.value);
    } catch (e) {
        input.select();
        document.execCommand('copy');
    }
    btn.innerHTML = '<i data-lucide="check"></i> Copied';
    if (window.lucide) window.lucide.createIcons();
}

async function revoke(btn) {
    btn.disabled = true;
    try {
        const res = await apiFetch(`${API}?action=revoke_invite`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: Number(btn.dataset.id) }),
        });
        if (!res?.success) throw new Error(res?.error || 'Could not cancel the invite.');
        showToast('Invite cancelled. That link no longer works.', 'success');
        renderList();
    } catch (e) {
        showToast(e.message, 'error');
        btn.disabled = false;
    }
}

window.openInviteModal = openInviteModal;

document.addEventListener('click', event => {
    const t = event.target;
    if (!(t instanceof Element)) return;
    if (t.id === 'modal-invite') { closeModal(); return; }
    const action = t.closest('[data-invite]');
    if (!action || !action.closest('#modal-invite')) return;
    const kind = action.dataset.invite;
    if (kind === 'close') closeModal();
    else if (kind === 'copy') copyLink(action);
    else if (kind === 'revoke') revoke(action);
});

document.addEventListener('submit', event => {
    if (event.target instanceof HTMLFormElement && event.target.id === 'invite-form') {
        event.preventDefault();
        submit(event.target);
    }
});

document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && document.getElementById('modal-invite')?.classList.contains('active')) closeModal();
});
