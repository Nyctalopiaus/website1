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
