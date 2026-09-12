/**
 * Nycto's MLS Property Scout - Auth & User Management UI
 * promptResetPassword/confirmDeleteUser are exposed on window because they're called from
 * onclick="..." attributes in dynamically-rendered HTML (see renderUsersTable), same as in
 * the original single-file app.js.
 */
import { apiFetch, syncUserPreferencesFromServer } from './api.js';
import { CONFIG, state, elements } from './state.js';
import { showToast } from './toast.js';
import { escapeHtml } from './properties.js';
import { fetchProperties } from './properties.js';
import { populateClientFilterDropdown, loadPresetsList } from './filters.js';
import { fetchCollections } from './collections.js';
import { fetchNotifications } from './notifications.js';

const LOCAL_STATE_OWNER_KEY = 'scout_local_state_owner';

function resetLocalStateForAccount(username) {
    const previousUsername = localStorage.getItem(LOCAL_STATE_OWNER_KEY);
    if (previousUsername === username) return false;

    Object.keys(localStorage)
        .filter(key => key.startsWith('scout_'))
        .forEach(key => localStorage.removeItem(key));
    localStorage.setItem(LOCAL_STATE_OWNER_KEY, username);
    return true;
}

    export function updateUserUI() {
        const authenticated = state.authenticated;
        const isAdmin = authenticated && state.isAdmin;
        const isRealtor = authenticated && (state.currentUserProfile?.role === 'realtor' || state.currentUserProfile?.role === 'admin' || isAdmin);

        const adminItems = document.querySelectorAll('.admin-only');
        adminItems.forEach(el => {
            el.style.display = isAdmin ? 'flex' : 'none';
        });

        const realtorOrAdminItems = document.querySelectorAll('.realtor-or-admin-only');
        realtorOrAdminItems.forEach(el => {
            el.style.display = isRealtor ? 'flex' : 'none';
        });

        const adminDivider = document.getElementById('admin-divider');
        if (adminDivider) {
            adminDivider.style.display = (isAdmin || isRealtor) ? 'block' : 'none';
        }

        const userCaret = document.getElementById('user-menu-caret');
        if (userCaret) {
            userCaret.style.display = authenticated ? 'inline' : 'none';
        }

        const toolsMenuBtn = document.getElementById('btn-realtor-tools-menu');
        if (toolsMenuBtn) {
            if (isAdmin) {
                toolsMenuBtn.innerHTML = `<i data-lucide="shield"></i> Admin Tools <span style="font-size: 0.65rem; margin-left: 0.25rem;">▾</span>`;
                toolsMenuBtn.title = "Admin Operational Tools";
            } else {
                toolsMenuBtn.innerHTML = `<i data-lucide="wrench"></i> Realtor Tools <span style="font-size: 0.65rem; margin-left: 0.25rem;">▾</span>`;
                toolsMenuBtn.title = "Realtor Operational Tools";
            }
        }

        if (elements.userDisplayName) {
            if (authenticated) {
                const displayName = state.currentUserProfile?.full_name || state.user || 'User';
                elements.userDisplayName.innerHTML = `<i data-lucide="user-check"></i> ${escapeHtml(displayName)}`;
            } else {
                elements.userDisplayName.innerHTML = `<i data-lucide="log-in"></i> Sign in`;
            }
        }

        if (window.lucide) window.lucide.createIcons();

        if (elements.adminDropdown) {
            elements.adminDropdown.style.display = isAdmin ? 'flex' : 'none';
        }

        const notifContainer = document.getElementById('notification-container');
        if (notifContainer) notifContainer.style.display = authenticated ? 'inline-flex' : 'none';

        if (authenticated) {
            if (isAdmin && window.fetchAdminStats) {
                window.fetchAdminStats();
            }
            populateClientFilterDropdown();
            loadPresetsList();
            fetchCollections();
            fetchNotifications();
        } else {
            const clientGroup = elements.clientFilterGroup || document.getElementById('client-filter-group');
            if (clientGroup) clientGroup.style.display = 'none';
            const selectPresets = document.getElementById('select-saved-presets');
            if (selectPresets) selectPresets.innerHTML = `<option value="">Presets (0)...</option>`;
        }

        if (!isAdmin && !authenticated) closeUserMenu();
    }

    export function updateAdminUI() {
        updateUserUI();
    }

    export function toggleUserMenu() {
        if (!state.authenticated) {
            showLoginModal();
            return;
        }
        const userMenu = elements.userDropdownMenu || document.getElementById('user-dropdown-menu');
        if (userMenu) userMenu.classList.toggle('open');
    }

    export function closeUserMenu() {
        const userMenu = elements.userDropdownMenu || document.getElementById('user-dropdown-menu');
        if (userMenu) userMenu.classList.remove('open');
    }

    export function toggleAdminMenu() {
        if (elements.adminDropdownMenu) elements.adminDropdownMenu.classList.toggle('open');
    }
    export function closeAdminMenu() {
        if (elements.adminDropdownMenu) elements.adminDropdownMenu.classList.remove('open');
    }

    export function toggleAgentHubMenu() {
        const menu = document.getElementById('agent-hub-dropdown-menu');
        if (menu) menu.classList.toggle('open');
    }

    export function closeAgentHubMenu() {
        const menu = document.getElementById('agent-hub-dropdown-menu');
        if (menu) menu.classList.remove('open');
    }

    export function checkAuth() {
        apiFetch(CONFIG.API_URL + '?action=check_auth')
            .then(async data => {
                if (data && data.authenticated) {
                    if (resetLocalStateForAccount(data.username)) {
                        window.location.reload();
                        return;
                    }
                    state.authenticated = true;
                    state.user = data.username;
                    state.isAdmin = !!data.is_admin;
                    state.csrfToken = data.csrf_token;
                    state.currentUserProfile = data;

                    const modalLoginEl = elements.modalLogin || document.getElementById('modal-login');
                    if (modalLoginEl) {
                        modalLoginEl.classList.remove('active');
                        modalLoginEl.style.display = 'none';
                    }
                    updateUserUI();
                    if (window.initSavedFilterPreferences) {
                        try { window.initSavedFilterPreferences(); } catch (e) {}
                    }
                    await syncUserPreferencesFromServer();
                    fetchProperties();
                    if ((data.role === 'admin' || data.is_admin) && (!window.location.hash || window.location.hash === '#admin')) {
                        if (window.switchView) window.switchView('admin');
                    } else if (data.role === 'realtor' && (!window.location.hash || window.location.hash === '#realtor')) {
                        if (window.switchView) window.switchView('realtor');
                    }
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
        state.isAdmin = false;
        state.currentUserProfile = null;
        updateUserUI();
        if (window.location.hash || window.location.pathname.includes('//')) {
            const cleanPath = window.location.pathname.replace(/\/+/g, '/');
            if (window.history && window.history.replaceState) {
                window.history.replaceState(null, '', cleanPath);
            }
        }
        const loginErrEl = elements.loginError || document.getElementById('login-error');
        if (loginErrEl) {
            if (errMsg) {
                loginErrEl.innerText = errMsg;
                loginErrEl.style.display = 'block';
            } else {
                loginErrEl.style.display = 'none';
            }
        }
        const modalLoginEl = elements.modalLogin || document.getElementById('modal-login');
        if (modalLoginEl) {
            modalLoginEl.style.display = '';
            modalLoginEl.classList.add('active');
        }
        try { if (window.lucide) window.lucide.createIcons(); } catch (e) {}
    }
    window.showLoginModal = showLoginModal;

    let isLoggingIn = false;

    export function handleLoginSubmit(e) {
        if (e) e.preventDefault();
        if (isLoggingIn) return;

        const loginErrEl = elements.loginError || document.getElementById('login-error');
        const loginUserEl = elements.loginUsername || document.getElementById('login-username');
        const loginPassEl = elements.loginPassword || document.getElementById('login-password');
        const btnSubmit = elements.btnSubmitLogin || document.getElementById('btn-submit-login');

        const username = loginUserEl ? loginUserEl.value.trim() : '';
        const password = loginPassEl ? loginPassEl.value : '';

        if (!username || !password) {
            if (loginErrEl) {
                loginErrEl.innerText = 'Please enter both username and password.';
                loginErrEl.style.display = 'block';
            }
            return;
        }

        isLoggingIn = true;
        if (btnSubmit) {
            btnSubmit.disabled = true;
            btnSubmit.innerText = 'Signing In...';
        }

        apiFetch(CONFIG.API_URL + '?action=login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`
        })
        .then(async data => {
            if (data.success) {
                if (resetLocalStateForAccount(data.username)) {
                    window.location.reload();
                    return;
                }
                state.authenticated = true;
                state.user = data.username;
                state.isAdmin = !!data.is_admin;
                state.csrfToken = data.csrf_token;
                state.currentUserProfile = data;

                if (loginErrEl) loginErrEl.style.display = 'none';
                const modalLoginEl = elements.modalLogin || document.getElementById('modal-login');
                if (modalLoginEl) {
                    modalLoginEl.classList.remove('active');
                    modalLoginEl.style.display = 'none';
                }
                if (loginPassEl) loginPassEl.value = '';
                updateUserUI();
                if (window.initSavedFilterPreferences) {
                    try { window.initSavedFilterPreferences(); } catch (e) {}
                }
                await syncUserPreferencesFromServer();
                showToast(`Welcome back, ${data.full_name || data.username}!`, 'success');
                fetchProperties();
                if (data.role === 'admin' || data.is_admin) {
                    if (window.switchView) window.switchView('admin');
                } else if (data.role === 'realtor') {
                    if (window.switchView) window.switchView('realtor');
                }
            } else {
                if (loginErrEl) {
                    loginErrEl.innerText = data.error || 'Invalid credentials';
                    loginErrEl.style.display = 'block';
                }
            }
        })
        .catch(err => {
            console.error('Login error:', err);
            if (loginErrEl) {
                loginErrEl.innerText = 'Login request failed: ' + (err.message || 'Server error.');
                loginErrEl.style.display = 'block';
            }
        })
        .finally(() => {
            isLoggingIn = false;
            if (btnSubmit) {
                btnSubmit.disabled = false;
                btnSubmit.innerText = 'Sign In';
            }
        });
    }

    window.handleLoginSubmit = handleLoginSubmit;

    export function clearScoutLocalStorage() {
        Object.keys(localStorage)
            .filter(key => key.startsWith('scout_'))
            .forEach(key => localStorage.removeItem(key));
    }

    export function handleLogout() {
        closeUserMenu();
        apiFetch(CONFIG.API_URL + '?action=logout')
            .finally(() => {
                clearScoutLocalStorage();
                state.allProperties = [];
                state.filteredProperties = [];
                state.currentUserProfile = null;
                state.authenticated = false;
                state.user = null;
                state.isAdmin = false;
                state.csrfToken = null;
                showToast('Logged out successfully', 'info');
                const cleanPath = window.location.pathname.replace(/\/+/g, '/');
                if (window.history && window.history.replaceState) {
                    window.history.replaceState(null, '', cleanPath);
                }
                window.location.href = window.location.origin + cleanPath;
            });
    }

    window.handleLogout = handleLogout;
    window.handleLoginSubmit = handleLoginSubmit;

    // Self-initializing Auth DOM Event Listeners
    // Ensures login form submission and logout work regardless of app.js status
    export function initAuthEventListeners() {
        window.handleLoginSubmit = handleLoginSubmit;
        window.handleLogout = handleLogout;
        const formLogin = elements.formLogin || document.getElementById('form-login');
        if (formLogin) {
            formLogin.removeEventListener('submit', handleLoginSubmit);
            formLogin.addEventListener('submit', handleLoginSubmit);
        }
        const btnLogout = elements.btnLogout || document.getElementById('btn-logout');
        if (btnLogout) {
            btnLogout.removeEventListener('click', handleLogout);
            btnLogout.addEventListener('click', handleLogout);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAuthEventListeners);
    } else {
        initAuthEventListeners();
    }

    export function openUserProfileModal() {
        if (!state.authenticated) return showLoginModal();
        closeUserMenu();

        const p = state.currentUserProfile || {};
        const elUsername = document.getElementById('profile-summary-username');
        const elRole = document.getElementById('profile-summary-role');
        const elCreated = document.getElementById('profile-summary-created');
        const elRealtor = document.getElementById('profile-summary-realtor');
        const relLabel = document.getElementById('profile-summary-rel-label');
        const elAvatar = document.getElementById('profile-avatar-badge');
        const elFullName = document.getElementById('profile-full-name');
        const elEmail = document.getElementById('profile-email');
        const elPhone = document.getElementById('profile-phone');
        const errEl = document.getElementById('profile-form-error');

        if (errEl) errEl.style.display = 'none';

        const role = p.role || (state.isAdmin ? 'admin' : 'client');

        if (elUsername) elUsername.textContent = p.username || state.user || '';
        if (elRole) elRole.textContent = `Role: ${role.toUpperCase()}`;
        if (elCreated) elCreated.textContent = p.created_at ? new Date(p.created_at).toLocaleDateString() : 'N/A';
        if (elAvatar) elAvatar.textContent = p.initials || 'US';

        if (role === 'realtor') {
            if (relLabel) relLabel.textContent = 'Assigned Clients: ';
            if (elRealtor) {
                const clients = p.assigned_clients || [];
                if (clients.length > 0) {
                    const clientNames = clients.map(c => c.full_name || c.username).join(', ');
                    elRealtor.textContent = `${clients.length} (${clientNames})`;
                } else {
                    elRealtor.textContent = '0 Clients Assigned';
                }
            }
        } else if (role === 'admin') {
            if (relLabel) relLabel.textContent = 'Access Level: ';
            if (elRealtor) elRealtor.textContent = 'System Administrator';
        } else {
            if (relLabel) relLabel.textContent = 'Assigned Agent: ';
            if (elRealtor) elRealtor.textContent = p.realtor_name || 'None (Direct)';
        }

        if (elFullName) elFullName.value = p.full_name || '';
        if (elEmail) elEmail.value = p.email || '';
        if (elPhone) elPhone.value = p.phone || '';

        const elBrokerage = document.getElementById('profile-brokerage');
        const elAvatarUrl = document.getElementById('profile-avatar');
        const clientPrefsGroup = document.getElementById('profile-client-preferences-group');
        if (elBrokerage) elBrokerage.value = p.brokerage_name || '';
        if (elAvatarUrl) elAvatarUrl.value = p.avatar_url || '';
        if (clientPrefsGroup) clientPrefsGroup.style.display = role === 'client' ? 'block' : 'none';
        document.getElementById('profile-target-min-price').value = p.target_min_price || '';
        document.getElementById('profile-target-max-price').value = p.target_max_price || '';
        document.getElementById('profile-target-cities').value = p.target_cities || '';
        document.getElementById('profile-target-beds').value = p.target_beds || '';
        document.getElementById('profile-target-timeline').value = p.target_timeline || '';
        document.getElementById('profile-must-haves').value = p.must_haves || '';
        document.getElementById('profile-deal-breakers').value = p.deal_breakers || '';

        const modal = elements.modalUserProfile || document.getElementById('modal-user-profile');
        if (modal) modal.classList.add('active');
    }

    export function closeUserProfileModal() {
        const modal = elements.modalUserProfile || document.getElementById('modal-user-profile');
        if (modal) modal.classList.remove('active');
    }

    export function handleUpdateProfileSubmit(e) {
        if (e) e.preventDefault();
        const fullName = (document.getElementById('profile-full-name')?.value || '').trim();
        const email = (document.getElementById('profile-email')?.value || '').trim();
        const phone = (document.getElementById('profile-phone')?.value || '').trim();
        const brokerageName = (document.getElementById('profile-brokerage')?.value || '').trim();
        const avatarUrl = (document.getElementById('profile-avatar')?.value || '').trim();
        const targetMinPrice = document.getElementById('profile-target-min-price')?.value || '';
        const targetMaxPrice = document.getElementById('profile-target-max-price')?.value || '';
        const targetCities = (document.getElementById('profile-target-cities')?.value || '').trim();
        const targetBeds = document.getElementById('profile-target-beds')?.value || '';
        const targetTimeline = (document.getElementById('profile-target-timeline')?.value || '').trim();
        const mustHaves = (document.getElementById('profile-must-haves')?.value || '').trim();
        const dealBreakers = (document.getElementById('profile-deal-breakers')?.value || '').trim();
        const btnSave = document.getElementById('btn-save-user-profile');
        const errEl = document.getElementById('profile-form-error');

        if (errEl) errEl.style.display = 'none';

        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            if (errEl) {
                errEl.textContent = 'Please enter a valid email address.';
                errEl.style.display = 'block';
            }
            return;
        }

        if (btnSave) {
            btnSave.disabled = true;
            btnSave.textContent = 'Saving...';
        }

        apiFetch(CONFIG.API_URL + '?action=update_profile', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ full_name: fullName, email, phone, brokerage_name: brokerageName, avatar_url: avatarUrl, target_min_price: targetMinPrice, target_max_price: targetMaxPrice, target_cities: targetCities, target_beds: targetBeds, target_timeline: targetTimeline, must_haves: mustHaves, deal_breakers: dealBreakers })
        })
        .then(data => {
            if (data.success) {
                if (state.currentUserProfile) {
                    state.currentUserProfile.full_name = data.full_name;
                    state.currentUserProfile.email = data.email;
                    state.currentUserProfile.phone = data.phone;
                    state.currentUserProfile.brokerage_name = data.brokerage_name;
                    state.currentUserProfile.avatar_url = data.avatar_url;
                    state.currentUserProfile.initials = data.initials;
                    state.currentUserProfile.target_min_price = data.target_min_price;
                    state.currentUserProfile.target_max_price = data.target_max_price;
                    state.currentUserProfile.target_cities = data.target_cities;
                    state.currentUserProfile.target_beds = data.target_beds;
                    state.currentUserProfile.target_timeline = data.target_timeline;
                    state.currentUserProfile.must_haves = data.must_haves;
                    state.currentUserProfile.deal_breakers = data.deal_breakers;
                }
                updateUserUI();
                closeUserProfileModal();
                showToast('Profile updated successfully!', 'success');
            } else {
                if (errEl) {
                    errEl.textContent = data.error || 'Failed to update profile.';
                    errEl.style.display = 'block';
                }
            }
        })
        .catch(err => {
            if (errEl) {
                errEl.textContent = err.message || 'Error updating profile.';
                errEl.style.display = 'block';
            }
        })
        .finally(() => {
            if (btnSave) {
                btnSave.disabled = false;
                btnSave.innerHTML = '<i data-lucide="check"></i> Save Profile';
                if (window.lucide) window.lucide.createIcons();
            }
        });
    }

    export function openPasswordMgmtModal() {
        if (!state.authenticated) return showLoginModal();
        closeUserMenu();

        const pwdCurrent = document.getElementById('pwd-current');
        const pwdNew = document.getElementById('pwd-new');
        const pwdConfirm = document.getElementById('pwd-confirm');
        const errEl = document.getElementById('pwd-mgmt-error');

        if (pwdCurrent) pwdCurrent.value = '';
        if (pwdNew) pwdNew.value = '';
        if (pwdConfirm) pwdConfirm.value = '';
        if (errEl) errEl.style.display = 'none';

        const modal = elements.modalPasswordMgmt || document.getElementById('modal-password-mgmt');
        if (modal) modal.classList.add('active');
    }

    export function closePasswordMgmtModal() {
        const modal = elements.modalPasswordMgmt || document.getElementById('modal-password-mgmt');
        if (modal) modal.classList.remove('active');
    }

    export function handleSelfPasswordChangeSubmit(e) {
        if (e) e.preventDefault();
        const currentPassword = document.getElementById('pwd-current')?.value || '';
        const newPassword = document.getElementById('pwd-new')?.value || '';
        const confirmPassword = document.getElementById('pwd-confirm')?.value || '';
        const btnSave = document.getElementById('btn-save-password-mgmt');
        const errEl = document.getElementById('pwd-mgmt-error');

        if (errEl) errEl.style.display = 'none';

        if (!currentPassword) {
            if (errEl) {
                errEl.textContent = 'Please enter your current password.';
                errEl.style.display = 'block';
            }
            return;
        }

        if (newPassword.length < 8) {
            if (errEl) {
                errEl.textContent = 'New password must be at least 8 characters long.';
                errEl.style.display = 'block';
            }
            return;
        }

        if (newPassword !== confirmPassword) {
            if (errEl) {
                errEl.textContent = 'New password and confirmation do not match.';
                errEl.style.display = 'block';
            }
            return;
        }

        if (btnSave) {
            btnSave.disabled = true;
            btnSave.textContent = 'Updating...';
        }

        apiFetch(CONFIG.API_URL + '?action=change_password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ current_password: currentPassword, new_password: newPassword })
        })
        .then(data => {
            if (data.success) {
                closePasswordMgmtModal();
                showToast('Password changed successfully!', 'success');
            } else {
                if (errEl) {
                    errEl.textContent = data.error || 'Failed to update password.';
                    errEl.style.display = 'block';
                }
            }
        })
        .catch(err => {
            if (errEl) {
                errEl.textContent = err.message || 'Error updating password.';
                errEl.style.display = 'block';
            }
        })
        .finally(() => {
            if (btnSave) {
                btnSave.disabled = false;
                btnSave.innerHTML = '<i data-lucide="key-round"></i> Update Password';
                if (window.lucide) window.lucide.createIcons();
            }
        });
    }
    export function openUserMgmtModal() {
        const isRealtor = state.currentUserProfile?.role === 'realtor';
        if (!state.authenticated || !(state.isAdmin || isRealtor)) {
            return showToast('Admin or Realtor privileges required', 'error');
        }
        closeAdminMenu();
        if (elements.modalUserMgmt) elements.modalUserMgmt.classList.add('active');

        // Realtors can only create client accounts scoped to themselves (enforced
        // server-side too) — lock the role/assignment controls out of the create form
        // so they don't see options the backend will reject.
        const roleWrapper = document.getElementById('wrapper-new-user-role');
        const realtorWrapper = document.getElementById('wrapper-new-user-realtor');
        const roleSelect = document.getElementById('new-user-role');
        const isFullAdmin = !!state.isAdmin;
        if (roleWrapper) roleWrapper.style.display = isFullAdmin ? '' : 'none';
        if (realtorWrapper) realtorWrapper.style.display = isFullAdmin ? '' : 'none';
        if (roleSelect && !isFullAdmin) roleSelect.value = 'client';

        fetchUsersList();
    }
    export function fetchUsersList() {
        if (!elements.userMgmtTableBody) return;
        elements.userMgmtTableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:1.5rem; color:var(--text-muted);">Loading user accounts...</td></tr>`;

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

        // Update count badge in header
        const countBadge = document.getElementById('user-mgmt-count-badge');
        if (countBadge) {
            countBadge.textContent = `${users.length} ${users.length === 1 ? 'Account' : 'Accounts'}`;
        }

        if (!users.length) {
            elements.userMgmtTableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:1.5rem; color:var(--text-muted);">No user accounts found</td></tr>`;
            return;
        }

        // Populate new-user-realtor select options in the create form
        const selectRealtor = document.getElementById('new-user-realtor');
        if (selectRealtor) {
            const realtors = users.filter(u => u.role === 'realtor' || u.role === 'admin' || u.is_admin);
            selectRealtor.innerHTML = `<option value="">(None / Direct)</option>` +
                realtors.map(r => `<option value="${r.id}">${escapeHtml(r.username)} [${r.initials || 'AG'}]</option>`).join('');
        }

        const realtorsMap = new Map(users.map(u => [u.id, u.username]));

        const formatShortDateTime = (dStr) => {
            if (!dStr || dStr === 'Never') return 'Never';
            const d = new Date(dStr);
            if (isNaN(d.getTime())) return dStr;
            return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ', ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
        };

        elements.userMgmtTableBody.innerHTML = users.map(u => {
            const isSelf = u.username === state.user;
            const isAdminAcc = u.username === 'admin';
            const role = u.role || (u.is_admin ? 'admin' : 'client');
            const created = u.created_at ? new Date(u.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A';
            const lastLogin = formatShortDateTime(u.last_login);
            const initials = u.initials || 'US';

            let roleBadge = '<span class="user-role-badge role-client">CLIENT</span>';
            if (role === 'admin') {
                roleBadge = '<span class="user-role-badge role-admin"><i data-lucide="shield-check" style="width:11px; height:11px; margin-right:3px;"></i> ADMIN</span>';
            } else if (role === 'realtor') {
                roleBadge = '<span class="user-role-badge role-realtor"><i data-lucide="award" style="width:11px; height:11px; margin-right:3px;"></i> REALTOR</span>';
            }

            const assignedRealtorName = u.realtor_id ? (realtorsMap.get(u.realtor_id) || `ID #${u.realtor_id}`) : null;
            const realtorDisplay = assignedRealtorName 
                ? `<span class="assigned-realtor-tag"><i data-lucide="user-check" style="width:13px; height:13px;"></i> ${escapeHtml(assignedRealtorName)}</span>`
                : `<span style="font-size:0.82rem; color:var(--text-muted); font-style:italic;">None</span>`;

            return `
                <tr>
                    <td style="font-weight:700; color:var(--text-muted); font-size:0.85rem;">#${u.id}</td>
                    <td>
                        <span style="font-weight:600; font-size:0.92rem; color:var(--text-primary);">${escapeHtml(u.username)}</span>
                        ${roleBadge}
                        ${isSelf ? '<span style="font-size:0.75rem; color:var(--accent-gold); font-weight:600; margin-left:0.4rem;">(You)</span>' : ''}
                    </td>
                    <td>
                        <span class="user-avatar-pill" title="User Initials: ${escapeHtml(initials)}">${escapeHtml(initials)}</span>
                    </td>
                    <td>${realtorDisplay}</td>
                    <td style="font-size:0.85rem; color:var(--text-muted);">${created}</td>
                    <td style="font-size:0.85rem; color:var(--text-muted);">${lastLogin}</td>
                    <td>
                        <div style="display:flex; gap:0.4rem; flex-wrap:wrap; align-items:center;">
                            ${state.isAdmin ? `<button class="btn btn-secondary" style="padding:0.25rem 0.6rem; font-size:0.75rem;" onclick="promptResetPassword(${u.id}, '${escapeHtml(u.username)}')"><i data-lucide="key-round"></i> Password</button>` : ''}
                            ${(state.isAdmin && !isAdminAcc) ? `<button class="btn btn-secondary" style="padding:0.25rem 0.6rem; font-size:0.75rem;" onclick="promptChangeRole(${u.id}, '${escapeHtml(u.username)}', '${role}', ${u.realtor_id || 'null'})"><i data-lucide="user-check"></i> Edit Role</button>` : ''}
                            ${(state.isAdmin && !isAdminAcc) ? `<button class="btn btn-secondary" style="padding:0.25rem 0.6rem; font-size:0.75rem; color:var(--accent-red);" onclick="confirmDeleteUser(${u.id}, '${escapeHtml(u.username)}')"><i data-lucide="trash-2"></i> Delete</button>` : ''}
                            ${!state.isAdmin ? `<span style="font-size:0.75rem; color:var(--text-muted); background:var(--bg-input); padding:0.2rem 0.5rem; border-radius:4px; border:1px solid var(--border-color); display:inline-flex; align-items:center; gap:0.25rem;"><i data-lucide="lock" style="width:11px; height:11px;"></i> View Only</span>` : ''}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
        if (window.lucide) window.lucide.createIcons();
    }

    // Event Log Modal — the admin view onto event_log
    export function openEventLogModal() {
        if (!state.authenticated || !state.isAdmin) {
            return showToast('Admin privileges required', 'error');
        }
        closeUserMenu();
        closeAdminMenu();
        if (elements.modalEventLog) elements.modalEventLog.classList.add('active');
        fetchEventLogs();
    }
    export function fetchEventLogs() {
        if (!elements.eventLogTableBody) return;
        elements.eventLogTableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:1.5rem; color:var(--text-muted);">Loading events...</td></tr>`;

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
                    elements.eventLogTableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:1.5rem; color:var(--accent-red);">Failed to load event log</td></tr>`;
                }
            });
    }
    export function renderEventLogTable(logs) {
        if (!elements.eventLogTableBody) return;

        // Update count badge
        const countBadge = document.getElementById('event-log-count-badge');
        if (countBadge) {
            countBadge.textContent = `${logs.length} ${logs.length === 1 ? 'Event Entry' : 'Event Entries'}`;
        }

        if (!logs.length) {
            elements.eventLogTableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:1.5rem; color:var(--text-muted);">No events logged yet</td></tr>`;
            return;
        }

        const formatLogTime = (ts) => {
            if (!ts) return 'N/A';
            const d = new Date(ts.replace(' ', 'T'));
            if (isNaN(d.getTime())) return ts;
            return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ', ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
        };

        elements.eventLogTableBody.innerHTML = logs.map(l => {
            const time = formatLogTime(l.timestamp);
            const level = (l.level || 'info').toLowerCase();
            const user = l.username || 'System';
            const context = l.context_json || '';
            const contextShort = context.length > 90 ? context.slice(0, 90) + '…' : context;

            let levelClass = 'level-info';
            let levelIcon = 'info';
            if (level === 'warn' || level === 'warning') {
                levelClass = 'level-warn';
                levelIcon = 'alert-triangle';
            } else if (level === 'error' || level === 'fail' || level === 'failure') {
                levelClass = 'level-error';
                levelIcon = 'alert-octagon';
            } else if (level === 'login' || level === 'security') {
                levelClass = 'level-security';
                levelIcon = 'shield-check';
            }

            const levelBadge = `<span class="log-level-badge ${levelClass}"><i data-lucide="${levelIcon}" style="width:11px; height:11px; margin-right:3px;"></i> ${escapeHtml(level.toUpperCase())}</span>`;
            const sourcePill = `<span class="log-source-tag">${escapeHtml(l.source || 'system')}</span>`;

            return `
                <tr>
                    <td style="white-space:nowrap; font-size:0.8rem; color:var(--text-muted);">${escapeHtml(time)}</td>
                    <td style="white-space:nowrap;">${sourcePill}</td>
                    <td style="white-space:nowrap;">${levelBadge}</td>
                    <td style="white-space:nowrap; font-weight:600; font-size:0.82rem; color:var(--accent-gold);">${escapeHtml(user)}</td>
                    <td style="white-space:nowrap; font-size:0.8rem; font-weight:600; color:var(--text-muted);">${escapeHtml(l.mls_id || '—')}</td>
                    <td style="max-width:320px; font-weight:500;">${escapeHtml(l.message || '')}</td>
                    <td style="max-width:260px; font-size:0.75rem; color:var(--text-muted);" title="${escapeHtml(context)}">${escapeHtml(contextShort || '—')}</td>
                </tr>
            `;
        }).join('');
        if (window.lucide) window.lucide.createIcons();
    }

    export function handleCreateUserSubmit(e) {
        if (e) e.preventDefault();
        const username = elements.newUserUsername ? elements.newUserUsername.value.trim() : '';
        const password = elements.newUserPassword ? elements.newUserPassword.value : '';
        const role = document.getElementById('new-user-role') ? document.getElementById('new-user-role').value : 'client';
        const realtorIdVal = document.getElementById('new-user-realtor') ? document.getElementById('new-user-realtor').value : '';

        if (!username || !password) return;

        if (elements.btnSubmitCreateUser) {
            elements.btnSubmitCreateUser.disabled = true;
            elements.btnSubmitCreateUser.innerText = 'Creating...';
        }

        apiFetch(CONFIG.API_URL + '?action=create_user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                username, 
                password, 
                role, 
                realtor_id: realtorIdVal ? parseInt(realtorIdVal) : null 
            })
        })
        .then(data => {
            if (data.success) {
                showToast(`User account "${data.username}" created as ${data.role}!`, 'success');
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
                elements.btnSubmitCreateUser.innerText = 'Create User';
            }
        });
    }

    window.promptResetPassword = function(userId, username) {
        const newPassword = prompt(`Enter new password for account "${username}":`);
        if (!newPassword) return;

        if (newPassword.length < 8) {
            return alert('Password must be at least 8 characters long.');
        }

        apiFetch(CONFIG.API_URL + '?action=change_password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, new_password: newPassword })
        })
        .then(data => {
            if (data.success) {
                showToast(`Password updated for "${username}"`, 'success');
            } else {
                showToast(data.error || 'Failed to update password', 'error');
            }
        })
        .catch(() => showToast('Error resetting user password', 'error'));
    };

    window.promptChangeRole = function(userId, username, currentRole) {
        const choice = prompt(`Select new role for account "${username}" (Currently: ${currentRole}):\n\n1. Client (Homebuyer)\n2. Realtor / Agent\n3. Administrator\n\nEnter 1, 2, or 3:`);
        if (!choice) return;

        let newRole = 'client';
        if (choice.trim() === '2') newRole = 'realtor';
        else if (choice.trim() === '3') newRole = 'admin';

        apiFetch(CONFIG.API_URL + '?action=update_user_role', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: userId, role: newRole })
        })
        .then(data => {
            if (data.success) {
                showToast(`Updated role for "${username}" to ${newRole.toUpperCase()}`, 'success');
                fetchUsersList();
            } else {
                showToast(data.error || 'Failed to update user role', 'error');
            }
        })
        .catch(() => showToast('Error updating user role', 'error'));
    };

    window.confirmToggleUserRole = function(userId, username, currentlyAdmin) {
        window.promptChangeRole(userId, username, currentlyAdmin ? 'admin' : 'client');
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
                showToast(`User account "${username}" deleted`, 'warning');
                fetchUsersList();
            } else {
                showToast(data.error || 'Failed to delete user', 'error');
            }
        })
        .catch(() => showToast('Error deleting user account', 'error'));
    };
