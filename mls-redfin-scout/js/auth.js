/**
 * MLS & Redfin Property Scout - Auth & User Management UI
 * promptResetPassword/confirmDeleteUser are exposed on window because they're called from
 * onclick="..." attributes in dynamically-rendered HTML (see renderUsersTable), same as in
 * the original single-file app.js.
 */
import { apiFetch } from './api.js';
import { CONFIG, state, elements } from './state.js';
import { showToast } from './toast.js';
import { escapeHtml } from './properties.js';
import { fetchProperties } from './properties.js';


    export function updateAdminUI() {
        const isAdmin = state.authenticated && state.user === 'admin';
        if (elements.adminDropdown) {
            elements.adminDropdown.style.display = isAdmin ? 'flex' : 'none';
        }
        if (!isAdmin) closeAdminMenu();
    }

    // Admin dropdown — houses admin-only actions (User Management, View Logs, and whatever
    // else gets added later) behind one "⚙️ Admin" button instead of one nav button each.
    export function toggleAdminMenu() {
        if (elements.adminDropdownMenu) elements.adminDropdownMenu.classList.toggle('open');
    }
    export function closeAdminMenu() {
        if (elements.adminDropdownMenu) elements.adminDropdownMenu.classList.remove('open');
    }
    export function checkAuth() {
        apiFetch(CONFIG.API_URL + '?action=check_auth')
            .then(data => {
                if (data && data.authenticated) {
                    state.authenticated = true;
                    state.user = data.username;
                    state.csrfToken = data.csrf_token;
                    if (elements.modalLogin) elements.modalLogin.classList.remove('active');
                    if (elements.userDisplayName) elements.userDisplayName.innerText = '👤 ' + data.username;
                    if (elements.btnLogout) elements.btnLogout.style.display = 'inline-flex';
                    updateAdminUI();
                    fetchProperties();
                } else {
                    showLoginModal();
                }
            })
            .catch(() => {
                showLoginModal();
            });
    }
    export function showLoginModal(errMsg = '') {
        state.authenticated = false;
        state.user = null;
        if (elements.userDisplayName) elements.userDisplayName.innerText = '👤 Guest';
        if (elements.btnLogout) elements.btnLogout.style.display = 'none';
        updateAdminUI();
        if (elements.loginError) {
            if (errMsg) {
                elements.loginError.innerText = errMsg;
                elements.loginError.style.display = 'block';
            } else {
                elements.loginError.style.display = 'none';
            }
        }
        if (elements.modalLogin) {
            elements.modalLogin.style.display = '';
            elements.modalLogin.classList.add('active');
        }
    }
    export function handleLoginSubmit(e) {
        if (e) e.preventDefault();
        const username = elements.loginUsername ? elements.loginUsername.value.trim() : '';
        const password = elements.loginPassword ? elements.loginPassword.value : '';
        if (!username || !password) {
            if (elements.loginError) {
                elements.loginError.innerText = 'Please enter both username and password.';
                elements.loginError.style.display = 'block';
            }
            return;
        }

        if (elements.btnSubmitLogin) {
            elements.btnSubmitLogin.disabled = true;
            elements.btnSubmitLogin.innerText = 'Signing In... ⏳';
        }

        fetch(CONFIG.API_URL + '?action=login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ username, password })
        })
        .then(res => res.json())
        .then(data => {
            console.log('Login response:', data);
            if (data.success) {
                state.authenticated = true;
                state.user = data.username;
                state.csrfToken = data.csrf_token;
                if (elements.loginError) elements.loginError.style.display = 'none';
                if (elements.modalLogin) {
                    elements.modalLogin.classList.remove('active');
                    elements.modalLogin.style.display = 'none';
                }
                if (elements.userDisplayName) elements.userDisplayName.innerText = '👤 ' + data.username;
                if (elements.btnLogout) elements.btnLogout.style.display = 'inline-flex';
                if (elements.loginPassword) elements.loginPassword.value = '';
                updateAdminUI();
                showToast(`Welcome back, ${data.username}! 🚀`, 'success');
                fetchProperties();
            } else {
                if (elements.loginError) {
                    elements.loginError.innerText = data.error || 'Invalid credentials';
                    elements.loginError.style.display = 'block';
                }
            }
        })
        .catch(err => {
            console.error('Login error:', err);
            if (elements.loginError) {
                elements.loginError.innerText = 'Login request failed: ' + (err.message || 'Server error.');
                elements.loginError.style.display = 'block';
            }
        })
        .finally(() => {
            if (elements.btnSubmitLogin) {
                elements.btnSubmitLogin.disabled = false;
                elements.btnSubmitLogin.innerText = 'Sign In 🚀';
            }
        });
    }

    window.handleLoginSubmit = handleLoginSubmit;
    export function handleLogout() {
        apiFetch(CONFIG.API_URL + '?action=logout')
            .finally(() => {
                state.allProperties = [];
                state.filteredProperties = [];
                showToast('Logged out successfully 🚪', 'info');
                showLoginModal();
            });
    }
    export function openUserMgmtModal() {
        if (!state.authenticated || state.user !== 'admin') {
            return showToast('Admin privileges required', 'error');
        }
        closeAdminMenu();
        if (elements.modalUserMgmt) elements.modalUserMgmt.classList.add('active');
        fetchUsersList();
    }
    export function fetchUsersList() {
        if (!elements.userMgmtTableBody) return;
        elements.userMgmtTableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:1.5rem; color:var(--text-muted);">Loading user accounts... ⏳</td></tr>`;

        apiFetch(CONFIG.API_URL + '?action=list_users')
            .then(data => {
                if (data.success && Array.isArray(data.users)) {
                    renderUsersTable(data.users);
                } else {
                    showToast(data.error || 'Failed to load user list', 'error');
                }
            })
            .catch(err => {
                console.error('Failed to fetch user accounts:', err);
                if (elements.userMgmtTableBody) {
                    elements.userMgmtTableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:1.5rem; color:var(--accent-red);">Failed to load user accounts</td></tr>`;
                }
            });
    }
    export function renderUsersTable(users) {
        if (!elements.userMgmtTableBody) return;
        if (!users.length) {
            elements.userMgmtTableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:1.5rem;">No user accounts found</td></tr>`;
            return;
        }

        elements.userMgmtTableBody.innerHTML = users.map(u => {
            const isSelf = u.username === state.user;
            const isAdminAcc = u.username === 'admin';
            const created = u.created_at ? new Date(u.created_at).toLocaleDateString() : 'N/A';
            const lastLogin = u.last_login ? new Date(u.last_login).toLocaleString() : 'Never';

            return `
                <tr>
                    <td><strong>#${u.id}</strong></td>
                    <td>
                        <span style="font-weight:600;">${escapeHtml(u.username)}</span>
                        ${isAdminAcc ? '<span class="badge" style="background:var(--accent-gold); color:#000; font-size:0.7rem; margin-left:0.4rem; padding:0.1rem 0.4rem; border-radius:4px;">ADMIN</span>' : ''}
                        ${isSelf ? '<span style="font-size:0.75rem; color:var(--text-muted); margin-left:0.3rem;">(You)</span>' : ''}
                    </td>
                    <td style="font-size:0.85rem; color:var(--text-muted);">${created}</td>
                    <td style="font-size:0.85rem; color:var(--text-muted);">${lastLogin}</td>
                    <td>
                        <div style="display:flex; gap:0.4rem;">
                            <button class="btn btn-secondary" style="padding:0.25rem 0.6rem; font-size:0.75rem;" onclick="promptResetPassword(${u.id}, '${escapeHtml(u.username)}')">🔑 Password</button>
                            ${!isAdminAcc ? `<button class="btn btn-secondary" style="padding:0.25rem 0.6rem; font-size:0.75rem; color:var(--accent-red);" onclick="confirmDeleteUser(${u.id}, '${escapeHtml(u.username)}')">🗑️ Delete</button>` : ''}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // Event Log Modal — the admin view onto event_log (backend/bootstrap.php's logEvent()),
    // which is where sync results, bookmarklet/scrape events, main-app JS errors, and system
    // events (failed migrations, etc.) all land now instead of being silently swallowed or only
    // ever visible in a browser console that's since been closed.
    export function openEventLogModal() {
        if (!state.authenticated || state.user !== 'admin') {
            return showToast('Admin privileges required', 'error');
        }
        closeAdminMenu();
        if (elements.modalEventLog) elements.modalEventLog.classList.add('active');
        fetchEventLogs();
    }
    export function fetchEventLogs() {
        if (!elements.eventLogTableBody) return;
        elements.eventLogTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:1.5rem; color:var(--text-muted);">Loading events... ⏳</td></tr>`;

        const source = elements.eventLogSourceFilter ? elements.eventLogSourceFilter.value : '';
        let url = CONFIG.API_URL + '?action=view_event_log';
        if (source) url += '&source=' + encodeURIComponent(source);

        apiFetch(url)
            .then(data => {
                if (data.success && Array.isArray(data.logs)) {
                    renderEventLogTable(data.logs);
                } else {
                    showToast(data.error || 'Failed to load event log', 'error');
                }
            })
            .catch(err => {
                console.error('Failed to fetch event log:', err);
                if (elements.eventLogTableBody) {
                    elements.eventLogTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:1.5rem; color:var(--accent-red);">Failed to load event log</td></tr>`;
                }
            });
    }
    export function renderEventLogTable(logs) {
        if (!elements.eventLogTableBody) return;
        if (!logs.length) {
            elements.eventLogTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:1.5rem;">No events logged yet</td></tr>`;
            return;
        }

        elements.eventLogTableBody.innerHTML = logs.map(l => {
            const time = l.timestamp ? new Date(l.timestamp.replace(' ', 'T')).toLocaleString() : '';
            const level = (l.level || 'info').toLowerCase();
            const context = l.context_json || '';
            const contextShort = context.length > 100 ? context.slice(0, 100) + '…' : context;

            return `
                <tr>
                    <td style="white-space:nowrap; font-size:0.8rem; color:var(--text-muted);">${escapeHtml(time)}</td>
                    <td style="white-space:nowrap;">${escapeHtml(l.source || '')}</td>
                    <td><span class="log-level-badge log-level-${escapeHtml(level)}">${escapeHtml(level)}</span></td>
                    <td style="white-space:nowrap; font-size:0.8rem;">${escapeHtml(l.mls_id || '')}</td>
                    <td style="max-width:320px;">${escapeHtml(l.message || '')}</td>
                    <td style="max-width:260px; font-size:0.75rem; color:var(--text-muted);" title="${escapeHtml(context)}">${escapeHtml(contextShort)}</td>
                </tr>
            `;
        }).join('');
    }

    export function handleCreateUserSubmit(e) {
        if (e) e.preventDefault();
        const username = elements.newUserUsername ? elements.newUserUsername.value.trim() : '';
        const password = elements.newUserPassword ? elements.newUserPassword.value : '';

        if (!username || !password) return;

        if (elements.btnSubmitCreateUser) {
            elements.btnSubmitCreateUser.disabled = true;
            elements.btnSubmitCreateUser.innerText = 'Creating... ⏳';
        }

        apiFetch(CONFIG.API_URL + '?action=create_user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        })
        .then(data => {
            if (data.success) {
                showToast(`User account "${data.username}" created! 🚀`, 'success');
                if (elements.newUserUsername) elements.newUserUsername.value = '';
                if (elements.newUserPassword) elements.newUserPassword.value = '';
                fetchUsersList();
            } else {
                showToast(data.error || 'Failed to create user', 'error');
            }
        })
        .catch(err => {
            showToast('Error creating user account', 'error');
        })
        .finally(() => {
            if (elements.btnSubmitCreateUser) {
                elements.btnSubmitCreateUser.disabled = false;
                elements.btnSubmitCreateUser.innerText = 'Create User 🚀';
            }
        });
    }

    window.promptResetPassword = function(userId, username) {
        const newPassword = prompt(`Enter new password for account "${username}":`);
        if (!newPassword) return;

        if (newPassword.length < 4) {
            return alert('Password must be at least 4 characters long.');
        }

        apiFetch(CONFIG.API_URL + '?action=change_password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, new_password: newPassword })
        })
        .then(data => {
            if (data.success) {
                showToast(`Password updated for "${username}" 🔑`, 'success');
            } else {
                showToast(data.error || 'Failed to update password', 'error');
            }
        })
        .catch(() => showToast('Error resetting user password', 'error'));
    };

    window.confirmDeleteUser = function(userId, username) {
        if (!confirm(`Are you sure you want to delete user account "${username}"? This cannot be undone.`)) {
            return;
        }

        apiFetch(CONFIG.API_URL + '?action=delete_user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId })
        })
        .then(data => {
            if (data.success) {
                showToast(`User account "${username}" deleted 🗑️`, 'warning');
                fetchUsersList();
            } else {
                showToast(data.error || 'Failed to delete user', 'error');
            }
        })
        .catch(() => showToast('Error deleting user account', 'error'));
    };
