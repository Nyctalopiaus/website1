/**
 * "Change sign-in username" in My Profile (backend: action=change_username).
 * Everything in Dibs links to the account id, so only the sign-in name changes.
 */
import { state } from './state.js';
import { apiFetch } from './api.js';
import { showToast } from './toast.js';

async function changeUsername(btn) {
    const input = document.getElementById('account-new-username');
    const pw = document.getElementById('account-username-password');
    const err = document.getElementById('account-username-error');
    const name = (input?.value || '').trim().toLowerCase();
    err.textContent = '';
    if (!/^[a-z0-9._-]{3,40}$/.test(name)) { err.textContent = 'Usernames are 3–40 letters, numbers, dots, dashes or underscores.'; return; }
    if (!pw?.value) { err.textContent = 'Enter your current password.'; return; }
    btn.disabled = true;
    try {
        const res = await apiFetch('backend/api.php?action=change_username', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ new_username: name, current_password: pw.value }),
        });
        if (!res || !res.success) throw new Error(res?.error || 'Could not change your username.');
        state.user = res.username;
        if (state.currentUserProfile) state.currentUserProfile.username = res.username;
        const summary = document.getElementById('profile-summary-username');
        if (summary) summary.textContent = res.username;
        input.value = '';
        pw.value = '';
        document.getElementById('account-username-box')?.removeAttribute('open');
        showToast(`Username changed. Sign in as ${res.username} from now on.`, 'success');
    } catch (e) {
        err.textContent = e.message;
    } finally {
        btn.disabled = false;
    }
}

document.addEventListener('click', event => {
    const btn = event.target instanceof Element ? event.target.closest('#btn-change-username') : null;
    if (btn) changeUsername(btn);
});

// ---------------------------------------------------------------- headshot + logo (backend/branding.php)

function brandingSlot(kind) { return document.querySelector(`.branding-slot[data-branding-kind="${kind}"]`); }

function paintBranding(kind, url) {
    const slot = brandingSlot(kind);
    if (!slot) return;
    const preview = slot.querySelector('[data-branding-preview]');
    preview.innerHTML = url
        ? `<img src="${url.replace(/"/g, '&quot;')}" alt="${kind === 'logo' ? 'Company logo' : 'Headshot'}">`
        : `<i data-lucide="${kind === 'logo' ? 'building-2' : 'user-round'}"></i>`;
    slot.querySelector('[data-branding-remove]').hidden = !url;
    if (!url && window.lucide) window.lucide.createIcons();
}

/** Fills both previews from the signed-in profile (called whenever My Profile opens). */
export function refreshBrandingPreviews() {
    const p = state.currentUserProfile || {};
    paintBranding('headshot', document.getElementById('profile-avatar')?.value || p.avatar_url || '');
    paintBranding('logo', p.logo_url || '');
}
window.refreshBrandingPreviews = refreshBrandingPreviews;

function setBranding(kind, url) {
    if (!state.currentUserProfile) state.currentUserProfile = {};
    if (kind === 'logo') state.currentUserProfile.logo_url = url;
    else {
        state.currentUserProfile.avatar_url = url;
        const hidden = document.getElementById('profile-avatar');
        if (hidden) hidden.value = url;
    }
    paintBranding(kind, url);
}

async function uploadBranding(kind, file) {
    if (!file) return;
    if (!/^image\/(jpeg|png)$/.test(file.type)) { showToast('Use a JPG or PNG image.', 'error'); return; }
    if (file.size > 4 * 1024 * 1024) { showToast('That image is too large (4 MB max).', 'error'); return; }
    const fd = new FormData();
    fd.append('kind', kind);
    fd.append('image', file);
    try {
        const res = await apiFetch('backend/api.php?action=upload_branding_image', { method: 'POST', body: fd });
        if (!res || !res.success) throw new Error(res?.error || 'Upload failed.');
        setBranding(kind, res.url);
        showToast(kind === 'logo' ? 'Logo saved.' : 'Headshot saved.', 'success');
    } catch (e) {
        showToast(e.message || 'Upload failed.', 'error');
    }
}

async function removeBranding(kind) {
    try {
        const res = await apiFetch('backend/api.php?action=remove_branding_image', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind }),
        });
        if (!res || !res.success) throw new Error(res?.error || 'Could not remove it.');
        setBranding(kind, '');
        showToast(kind === 'logo' ? 'Logo removed.' : 'Headshot removed.', 'success');
    } catch (e) {
        showToast(e.message || 'Could not remove it.', 'error');
    }
}

document.addEventListener('change', event => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || !input.matches('[data-branding-file]')) return;
    const kind = input.closest('.branding-slot')?.dataset.brandingKind;
    if (kind) uploadBranding(kind, input.files?.[0]);
    input.value = '';
});

document.addEventListener('click', event => {
    const btn = event.target instanceof Element ? event.target.closest('[data-branding-remove]') : null;
    if (!btn) return;
    const kind = btn.closest('.branding-slot')?.dataset.brandingKind;
    if (kind) removeBranding(kind);
});
