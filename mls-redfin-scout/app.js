/**
 * MLS & Redfin Property Scout - Main Dashboard Engine
 */
document.addEventListener('DOMContentLoaded', () => {
    'use strict';

    const CONFIG = {
        API_URL: 'backend/api.php'
    };

    let state = {
        allProperties: [],
        filteredProperties: [],
        activeView: 'grid',
        currentSort: 'date-desc',
        authenticated: false,
        user: null,
        csrfToken: '',
        filters: {
            search: '',
            priceMin: null, priceMax: null,
            rfEstMin: null, rfEstMax: null, ppsqftMax: null, underRedfinOnly: false,
            beds: 0, bedsMax: null, baths: 0, bathsFullMin: null, baths34Min: null, bathsHalfMin: null, levels: '', basement: '',
            sqftMin: null, sqftMax: null, sqftTotMin: null, sqftAboveMin: null, sqftBelowMin: null, propertyType: '',
            yearMin: null, yearMax: null, acresMin: null, acresMax: null, parkingMin: null, garageMin: null,
            hoaMax: null, noHoaOnly: false, taxMax: null, taxYear: null,
            city: '', zip: '', schoolDistrict: '', walkscoreMin: null, transitscoreMin: null, bikescoreMin: null,
            status: 'all', ratingMin: 0, matrixStatus: 'all', appliances: '', flooring: '', fireplaceOnly: false, realtorNotesOnly: false,
            favoritesOnly: false, possibilitiesOnly: false, realtorSharedOnly: false, hasNotesOnly: false, showHidden: true
        }
    };

    let leafletMap = null;
    let currentTileLayer = null;
    let mapMarkers = [];

    // DOM Elements
    const elements = {
        gridContainer: document.getElementById('view-grid-container'),
        mapContainer: document.getElementById('view-map-container'),
        mapElement: document.getElementById('map-element'),
        tableContainer: document.getElementById('view-table-container'),
        matrixContainer: document.getElementById('view-matrix-container'),
        sortSelect: document.getElementById('sort-select'),
        dragBookmarkletBtn: document.getElementById('drag-bookmarklet-btn'),
        modalDragBmBtn: document.getElementById('modal-drag-bm-btn'),
        
        // Theme & Command Palette
        btnThemeToggle: document.getElementById('btn-theme-toggle'),
        themeIcon: document.getElementById('theme-icon'),
        themeLabel: document.getElementById('theme-label'),
        btnCommandPalette: document.getElementById('btn-command-palette'),
        modalCommandPalette: document.getElementById('modal-command-palette'),
        cmdPaletteInput: document.getElementById('cmd-palette-input'),
        cmdPaletteResults: document.getElementById('cmd-palette-results'),
        cmdPaletteClose: document.getElementById('cmd-palette-close'),
        toastContainer: document.getElementById('toast-container'),

        // KPIs
        kpiTotal: document.getElementById('kpi-total'),
        kpiTotalSub: document.getElementById('kpi-total-sub'),
        kpiFavorites: document.getElementById('kpi-favorites'),
        kpiAvgPrice: document.getElementById('kpi-avg-price'),
        kpiAvgSqftPrice: document.getElementById('kpi-avg-sqft-price'),
        kpiAvgSqft: document.getElementById('kpi-avg-sqft'),
        kpiShared: document.getElementById('kpi-shared'),

        // Filters
        filterSearch: document.getElementById('filter-search'),
        filterPriceMin: document.getElementById('filter-price-min'),
        filterPriceMax: document.getElementById('filter-price-max'),
        filterBeds: document.getElementById('filter-beds'),
        filterBaths: document.getElementById('filter-baths'),
        filterSqftMin: document.getElementById('filter-sqft-min'),
        filterAcresMin: document.getElementById('filter-acres-min'),
        filterYearMin: document.getElementById('filter-year-min'),
        filterYearMax: document.getElementById('filter-year-max'),
        filterHoaMax: document.getElementById('filter-hoa-max'),
        filterTaxMax: document.getElementById('filter-tax-max'),
        filterWalkscoreMin: document.getElementById('filter-walkscore-min'),
        filterStatus: document.getElementById('filter-status'),
        filterMatrixStatusTop: document.getElementById('filter-matrix-status-top'),
        toggleFavorites: document.getElementById('toggle-favorites'),
        togglePossibilities: document.getElementById('toggle-possibilities'),
        toggleRealtorShared: document.getElementById('toggle-realtor-shared'),
        toggleHasNotes: document.getElementById('toggle-has-notes'),
        toggleIncludeHidden: document.getElementById('toggle-include-hidden'),
        btnResetFilters: document.getElementById('btn-reset-filters'),

        // Modals & Auth
        modalDetail: document.getElementById('modal-detail'),
        modalDetailBody: document.getElementById('modal-detail-body'),
        modalDetailClose: document.getElementById('modal-detail-close'),
        modalBookmarklet: document.getElementById('modal-bookmarklet'),
        modalBmClose: document.getElementById('modal-bm-close'),
        btnBookmarkletGuide: document.getElementById('btn-bookmarklet-guide'),
        modalExport: document.getElementById('modal-export'),
        modalExportClose: document.getElementById('modal-export-close'),
        btnExportModal: document.getElementById('btn-export-modal'),
        btnExportCsv: document.getElementById('btn-export-csv'),
        btnExportJson: document.getElementById('btn-export-json'),
        btnPrintPdf: document.getElementById('btn-print-pdf'),

        modalLogin: document.getElementById('modal-login'),
        formLogin: document.getElementById('form-login'),
        loginUsername: document.getElementById('login-username'),
        loginPassword: document.getElementById('login-password'),
        loginError: document.getElementById('login-error'),
        btnSubmitLogin: document.getElementById('btn-submit-login'),
        userDisplayName: document.getElementById('user-display-name'),
        btnLogout: document.getElementById('btn-logout'),

        btnUserMgmt: document.getElementById('btn-user-mgmt'),
        modalUserMgmt: document.getElementById('modal-user-mgmt'),
        modalUserMgmtClose: document.getElementById('modal-user-mgmt-close'),
        formCreateUser: document.getElementById('form-create-user'),
        newUserUsername: document.getElementById('new-user-username'),
        newUserPassword: document.getElementById('new-user-password'),
        btnSubmitCreateUser: document.getElementById('btn-submit-create-user'),
        userMgmtTableBody: document.getElementById('user-mgmt-table-body')
    };

    // Initialize App
    function init() {
        initTheme();
        initSavedFilterPreferences();
        bindEvents();
        setupFilterConsoleDrawer();
        setupBookmarkletLink();
        checkAuth();
    }

    function initSavedFilterPreferences() {
        const savedStatus = localStorage.getItem('scout_filter_status');
        if (savedStatus) state.filters.status = savedStatus;
        const savedMatrixStatus = localStorage.getItem('scout_filter_matrix_status');
        if (savedMatrixStatus) state.filters.matrixStatus = savedMatrixStatus;
    }

    // Theme Switcher & Toast System
    function initTheme() {
        const savedTheme = localStorage.getItem('scout_theme') || 'dark';
        setTheme(savedTheme);
    }

    function setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('scout_theme', theme);
        if (elements.themeIcon) elements.themeIcon.innerText = theme === 'light' ? '☀️' : '🌙';
        if (elements.themeLabel) elements.themeLabel.innerText = theme === 'light' ? 'Light' : 'Dark';
        if (leafletMap) updateMapTileLayer();
    }

    function toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        setTheme(newTheme);
        showToast(`Switched to ${newTheme === 'light' ? 'Light' : 'Dark'} Theme`, 'info');
    }

    function showToast(message, type = 'info') {
        if (!elements.toastContainer) return;
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        
        let icon = 'ℹ️';
        if (type === 'success') icon = '✅';
        if (type === 'warning') icon = '⚠️';
        if (type === 'error') icon = '❌';

        toast.innerHTML = `<span>${icon}</span> <span>${escapeHtml(message)}</span>`;
        elements.toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            toast.style.transition = 'all 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    }

    function setupBookmarkletLink() {
        const apiUrl = window.location.href.replace(/\/index\.html.*$/, '') + '/backend/api.php';
        const code = typeof getBookmarkletCode === 'function' 
            ? getBookmarkletCode(apiUrl) 
            : 'javascript:alert("Bookmarklet Engine Loading...");';

        if (elements.dragBookmarkletBtn) {
            elements.dragBookmarkletBtn.href = code;
            elements.dragBookmarkletBtn.addEventListener('click', (e) => {
                e.preventDefault();
                elements.modalBookmarklet.classList.add('active');
            });
        }
        if (elements.modalDragBmBtn) elements.modalDragBmBtn.href = code;
    }

    function apiFetch(url, options = {}) {
        options.credentials = 'include';
        if (!options.headers) options.headers = {};
        if (state.csrfToken && options.method && options.method.toUpperCase() === 'POST') {
            options.headers['X-CSRF-Token'] = state.csrfToken;
        }
        return fetch(url, options).then(async res => {
            if (res.status === 401 && !url.includes('action=check_auth') && !url.includes('action=login')) {
                showLoginModal('Session expired or unauthenticated. Please log in.');
                throw new Error('Unauthenticated');
            }
            return res.json();
        });
    }

    function updateAdminUI() {
        const isAdmin = state.authenticated && state.user === 'admin';
        if (elements.btnUserMgmt) {
            elements.btnUserMgmt.style.display = isAdmin ? 'inline-flex' : 'none';
        }
    }

    function checkAuth() {
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

    function showLoginModal(errMsg = '') {
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

    function handleLoginSubmit(e) {
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

    function handleLogout() {
        apiFetch(CONFIG.API_URL + '?action=logout')
            .finally(() => {
                state.allProperties = [];
                state.filteredProperties = [];
                showToast('Logged out successfully 🚪', 'info');
                showLoginModal();
            });
    }

    function openUserMgmtModal() {
        if (!state.authenticated || state.user !== 'admin') {
            return showToast('Admin privileges required', 'error');
        }
        if (elements.modalUserMgmt) elements.modalUserMgmt.classList.add('active');
        fetchUsersList();
    }

    function fetchUsersList() {
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

    function renderUsersTable(users) {
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

    function handleCreateUserSubmit(e) {
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

    function populateLocationDropdowns(properties) {
        if (!Array.isArray(properties) || !properties.length) return;

        const cities = new Set();
        const zips = new Set();
        const districts = new Set();

        properties.forEach(p => {
            if (p.city && p.city.trim()) cities.add(p.city.trim());
            if (p.zip && p.zip.trim()) zips.add(p.zip.trim());
            if (p.school_district && p.school_district.trim()) districts.add(p.school_district.trim());
        });

        const updateSelectOptions = (id, defaultLabel, items) => {
            const el = document.getElementById(id);
            if (!el) return;
            const currentVal = el.value || '';
            const sortedItems = Array.from(items).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

            el.innerHTML = `<option value="">${escapeHtml(defaultLabel)}</option>` +
                sortedItems.map(item => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('');

            if (currentVal && sortedItems.includes(currentVal)) {
                el.value = currentVal;
            }
        };

        updateSelectOptions('filter-city', 'All Cities', cities);
        updateSelectOptions('filter-zip', 'All Zip Codes', zips);
        updateSelectOptions('filter-school-district', 'All School Districts', districts);
    }

    function fetchProperties() {
        apiFetch(CONFIG.API_URL + '?action=list')
            .then(data => {
                if (data.success) {
                    state.allProperties = data.properties || [];
                    populateLocationDropdowns(state.allProperties);
                    ensureGeocodedProperties();
                    syncTopBarFromState();
                    applyFiltersAndRender();
                }
            })
            .catch(err => {
                console.error('Failed to load property database:', err);
            });
    }

    function isValidCoord(lat, lng) {
        const parsedLat = parseFloat(lat);
        const parsedLng = parseFloat(lng);
        return !isNaN(parsedLat) && !isNaN(parsedLng) && 
               parsedLat >= 24 && parsedLat <= 50 && 
               parsedLng >= -125 && parsedLng <= -65;
    }

    function ensureGeocodedProperties() {
        const propsToGeocode = state.allProperties.filter(p => {
            const lat = parseFloat(p.latitude || (p.raw_mls_json && p.raw_mls_json.latitude));
            const lng = parseFloat(p.longitude || (p.raw_mls_json && p.raw_mls_json.longitude));
            return !isValidCoord(lat, lng);
        });

        if (!propsToGeocode.length) return;

        propsToGeocode.forEach((p, idx) => {
            const cacheKey = `geo_cache_${p.mls_id}`;
            const cached = localStorage.getItem(cacheKey);
            if (cached) {
                try {
                    const coords = JSON.parse(cached);
                    if (isValidCoord(coords.lat, coords.lng)) {
                        p.latitude = coords.lat;
                        p.longitude = coords.lng;
                        return;
                    }
                } catch(e) {}
            }

            const cleanAddr = cleanDisplayAddress(p.address, p.mls_id);
            if (!cleanAddr || cleanAddr === 'Address Unavailable') return;
            const query = `${cleanAddr}, ${p.city || ''}, ${p.state || 'CO'} ${p.zip || ''}`.trim();

            setTimeout(() => {
                fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`)
                    .then(r => r.json())
                    .then(data => {
                        if (data && data.length > 0) {
                            const lat = parseFloat(data[0].lat);
                            const lng = parseFloat(data[0].lon);
                            if (isValidCoord(lat, lng)) {
                                p.latitude = lat;
                                p.longitude = lng;
                                localStorage.setItem(cacheKey, JSON.stringify({ lat, lng }));

                                apiFetch(CONFIG.API_URL + '?action=update_coordinates', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ mls_id: p.mls_id, latitude: lat, longitude: lng })
                                }).catch(() => {});

                                if (state.activeView === 'map') {
                                    renderMap({ autoFit: false });
                                }
                            }
                        }
                    })
                    .catch(err => console.warn('Geocoding lookup failed for', query, err));
            }, idx * 1100);
        });
    }

    function bindEvents() {
        // Auth & Login Actions (Bind first so login works immediately regardless of other DOM elements)
        if (elements.formLogin) elements.formLogin.addEventListener('submit', handleLoginSubmit);
        if (elements.btnLogout) elements.btnLogout.addEventListener('click', handleLogout);

        // Theme & Command Palette
        if (elements.btnThemeToggle) elements.btnThemeToggle.addEventListener('click', toggleTheme);
        if (elements.btnCommandPalette) elements.btnCommandPalette.addEventListener('click', openCommandPalette);
        if (elements.cmdPaletteClose) elements.cmdPaletteClose.addEventListener('click', closeCommandPalette);
        if (elements.cmdPaletteInput) elements.cmdPaletteInput.addEventListener('input', handleCmdPaletteSearch);

        window.addEventListener('keydown', e => {
            if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                openCommandPalette();
            } else if (e.key === 'Escape') {
                closeCommandPalette();
            }
        });

        // KPI Interactive Filter Clicks
        if (elements.kpiFavorites && elements.kpiFavorites.parentElement) {
            elements.kpiFavorites.parentElement.style.cursor = 'pointer';
            elements.kpiFavorites.parentElement.addEventListener('click', () => {
                if (elements.toggleFavorites) elements.toggleFavorites.checked = !elements.toggleFavorites.checked;
                state.filters.favoritesOnly = elements.toggleFavorites ? elements.toggleFavorites.checked : false;
                applyFiltersAndRender();
                showToast(state.filters.favoritesOnly ? 'Filtering Favorites Only' : 'Showing All Properties', 'info');
            });
        }
        if (elements.kpiShared && elements.kpiShared.parentElement) {
            elements.kpiShared.parentElement.style.cursor = 'pointer';
            elements.kpiShared.parentElement.addEventListener('click', () => {
                if (elements.toggleRealtorShared) elements.toggleRealtorShared.checked = !elements.toggleRealtorShared.checked;
                state.filters.realtorSharedOnly = elements.toggleRealtorShared ? elements.toggleRealtorShared.checked : false;
                applyFiltersAndRender();
                showToast(state.filters.realtorSharedOnly ? 'Filtering Realtor Shared Only' : 'Showing All Properties', 'info');
            });
        }

        // Filter Inputs (Guarded)
        if (elements.filterSearch) elements.filterSearch.addEventListener('input', e => { state.filters.search = e.target.value.toLowerCase(); applyFiltersAndRender(); });
        if (elements.filterPriceMin) elements.filterPriceMin.addEventListener('input', e => { state.filters.priceMin = parseFloat(e.target.value) || null; applyFiltersAndRender(); });
        if (elements.filterPriceMax) elements.filterPriceMax.addEventListener('input', e => { state.filters.priceMax = parseFloat(e.target.value) || null; applyFiltersAndRender(); });
        if (elements.filterBeds) elements.filterBeds.addEventListener('change', e => { state.filters.beds = parseInt(e.target.value) || 0; applyFiltersAndRender(); });
        if (elements.filterBaths) elements.filterBaths.addEventListener('change', e => { state.filters.baths = parseFloat(e.target.value) || 0; applyFiltersAndRender(); });
        if (elements.filterSqftMin) elements.filterSqftMin.addEventListener('input', e => { state.filters.sqftMin = parseInt(e.target.value) || null; applyFiltersAndRender(); });
        if (elements.filterAcresMin) elements.filterAcresMin.addEventListener('input', e => { state.filters.acresMin = parseFloat(e.target.value) || null; applyFiltersAndRender(); });
        if (elements.filterYearMin) elements.filterYearMin.addEventListener('input', e => { state.filters.yearMin = parseInt(e.target.value) || null; applyFiltersAndRender(); });
        if (elements.filterYearMax) elements.filterYearMax.addEventListener('input', e => { state.filters.yearMax = parseInt(e.target.value) || null; applyFiltersAndRender(); });
        if (elements.filterHoaMax) elements.filterHoaMax.addEventListener('input', e => { state.filters.hoaMax = parseFloat(e.target.value) || null; applyFiltersAndRender(); });
        if (elements.filterTaxMax) elements.filterTaxMax.addEventListener('input', e => { state.filters.taxMax = parseFloat(e.target.value) || null; applyFiltersAndRender(); });
        if (elements.filterWalkscoreMin) elements.filterWalkscoreMin.addEventListener('input', e => { state.filters.walkscoreMin = parseInt(e.target.value) || null; applyFiltersAndRender(); });
        if (elements.filterStatus) elements.filterStatus.addEventListener('change', e => {
            state.filters.status = e.target.value;
            localStorage.setItem('scout_filter_status', e.target.value);
            applyFiltersAndRender();
        });
        if (elements.filterMatrixStatusTop) elements.filterMatrixStatusTop.addEventListener('change', e => {
            state.filters.matrixStatus = e.target.value;
            localStorage.setItem('scout_filter_matrix_status', e.target.value);
            const drawerSelect = document.getElementById('filter-matrix-status');
            if (drawerSelect) drawerSelect.value = e.target.value;
            applyFiltersAndRender();
        });
        
        // Toggles (Guarded)
        if (elements.toggleFavorites) elements.toggleFavorites.addEventListener('change', e => { state.filters.favoritesOnly = e.target.checked; applyFiltersAndRender(); });
        if (elements.togglePossibilities) elements.togglePossibilities.addEventListener('change', e => { state.filters.possibilitiesOnly = e.target.checked; applyFiltersAndRender(); });
        if (elements.toggleRealtorShared) elements.toggleRealtorShared.addEventListener('change', e => { state.filters.realtorSharedOnly = e.target.checked; applyFiltersAndRender(); });
        if (elements.toggleHasNotes) elements.toggleHasNotes.addEventListener('change', e => { state.filters.hasNotesOnly = e.target.checked; applyFiltersAndRender(); });
        if (elements.toggleIncludeHidden) elements.toggleIncludeHidden.addEventListener('change', e => { state.filters.showHidden = e.target.checked; applyFiltersAndRender(); });
        
        if (elements.btnResetFilters) elements.btnResetFilters.addEventListener('click', resetFilters);

        // Toggle More Specs Panel
        const btnMoreFilters = document.getElementById('btn-toggle-more-filters');
        const panelMoreFilters = document.getElementById('more-filters-panel');
        if (btnMoreFilters && panelMoreFilters) {
            btnMoreFilters.addEventListener('click', () => {
                const isHidden = panelMoreFilters.style.display === 'none' || !panelMoreFilters.style.display;
                panelMoreFilters.style.display = isHidden ? 'flex' : 'none';
                btnMoreFilters.innerText = isHidden ? '⚙️ Less Specs ▴' : '⚙️ More Specs ▾';
            });
        }

        // Sorting & Views
        if (elements.sortSelect) elements.sortSelect.addEventListener('change', e => { state.currentSort = e.target.value; applyFiltersAndRender(); });

        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.activeView = btn.dataset.view;
                if (state.activeView === 'map' && leafletMap) {
                    leafletMap._userHasInteracted = false;
                }
                renderActiveView();
            });
        });

        // Modals
        if (elements.btnBookmarkletGuide) elements.btnBookmarkletGuide.addEventListener('click', () => elements.modalBookmarklet.classList.add('active'));
        if (elements.modalBmClose) elements.modalBmClose.addEventListener('click', () => elements.modalBookmarklet.classList.remove('active'));
        
        document.getElementById('btn-copy-bm-code')?.addEventListener('click', () => {
            const apiUrl = window.location.href.replace(/\/index\.html.*$/, '') + '/backend/api.php';
            const code = typeof getBookmarkletCode === 'function' ? getBookmarkletCode(apiUrl) : '';
            if (code) {
                navigator.clipboard.writeText(code).then(() => {
                    alert('📋 Bookmarklet code copied to clipboard!\n\nTo install:\n1. Create a new bookmark in your browser.\n2. Paste this copied code into the bookmark URL field.');
                });
            }
        });

        document.getElementById('btn-copy-console-code')?.addEventListener('click', () => {
            const apiUrl = window.location.href.replace(/\/index\.html.*$/, '') + '/backend/api.php';
            const code = typeof getConsoleSnippetCode === 'function' ? getConsoleSnippetCode(apiUrl) : '';
            if (code) {
                navigator.clipboard.writeText(code).then(() => {
                    alert('💻 F12 Console snippet copied to clipboard!\n\nTo run:\n1. Open your Matrix MLS tab.\n2. Press F12 (or right-click -> Inspect -> Console).\n3. Paste this code and press Enter!');
                });
            }
        });

        if (elements.btnExportModal) elements.btnExportModal.addEventListener('click', () => elements.modalExport.classList.add('active'));
        if (elements.modalExportClose) elements.modalExportClose.addEventListener('click', () => elements.modalExport.classList.remove('active'));
        
        if (elements.modalDetailClose) elements.modalDetailClose.addEventListener('click', () => elements.modalDetail.classList.remove('active'));

        document.getElementById('btn-hide-banner')?.addEventListener('click', () => {
            const banner = document.querySelector('.bookmarklet-banner');
            if (banner) banner.style.display = 'none';
        });

        // Auth & Login Actions
        if (elements.formLogin) elements.formLogin.addEventListener('submit', handleLoginSubmit);
        if (elements.btnLogout) elements.btnLogout.addEventListener('click', handleLogout);

        // User Management Modal & Actions
        if (elements.btnUserMgmt) elements.btnUserMgmt.addEventListener('click', openUserMgmtModal);
        if (elements.modalUserMgmtClose) elements.modalUserMgmtClose.addEventListener('click', () => elements.modalUserMgmt.classList.remove('active'));
        if (elements.formCreateUser) elements.formCreateUser.addEventListener('submit', handleCreateUserSubmit);

        // Export Actions
        elements.btnExportCsv.addEventListener('click', exportCSV);
        elements.btnExportJson.addEventListener('click', exportJSON);
        elements.btnPrintPdf.addEventListener('click', () => window.print());
    }

    function resetFilters() {
        state.filters = {
            search: '',
            priceMin: null, priceMax: null,
            rfEstMin: null, rfEstMax: null, ppsqftMax: null, underRedfinOnly: false,
            beds: 0, bedsMax: null, baths: 0, bathsFullMin: null, baths34Min: null, bathsHalfMin: null, levels: '', basement: '',
            sqftMin: null, sqftMax: null, sqftTotMin: null, sqftAboveMin: null, sqftBelowMin: null, propertyType: '',
            yearMin: null, yearMax: null, acresMin: null, acresMax: null, parkingMin: null, garageMin: null,
            hoaMax: null, noHoaOnly: false, taxMax: null, taxYear: null,
            city: '', zip: '', schoolDistrict: '', walkscoreMin: null, transitscoreMin: null, bikescoreMin: null,
            status: 'all', ratingMin: 0, matrixStatus: 'all', appliances: '', flooring: '', fireplaceOnly: false, realtorNotesOnly: false,
            favoritesOnly: false, possibilitiesOnly: false, realtorSharedOnly: false, hasNotesOnly: false, showHidden: true
        };

        localStorage.removeItem('scout_filter_status');
        localStorage.removeItem('scout_filter_matrix_status');

        if (elements.filterSearch) elements.filterSearch.value = '';
        if (elements.filterPriceMin) elements.filterPriceMin.value = '';
        if (elements.filterPriceMax) elements.filterPriceMax.value = '';
        if (elements.filterBeds) elements.filterBeds.value = '0';
        if (elements.filterStatus) elements.filterStatus.value = 'all';

        syncTopBarFromState();
        syncDrawerInputsFromState();
        applyFiltersAndRender();
    }

    function getPropertyReviewStatus(p) {
        const rawStatus = (p.raw_mls_json && p.raw_mls_json.matrix_review_status);
        if (rawStatus && rawStatus !== 'none') {
            return rawStatus;
        }
        if (rawStatus === 'none') {
            if (p.hidden) return 'dislike';
            if (p.rating === 3) return 'possibility';
            return 'none';
        }
        if (p.hidden) return 'dislike';
        if (p.rating === 3) return 'possibility';
        if (p.favorite) return 'favorite';
        return 'none';
    }

    function applyFiltersAndRender() {
        const f = state.filters;
        state.filteredProperties = state.allProperties.filter(p => {
            const rawInt = (p.raw_mls_json && p.raw_mls_json.interior) || {};

            // 1. Collections & Visibility
            if (!f.showHidden && p.hidden) return false;
            if (f.favoritesOnly && !p.favorite) return false;
            if (f.possibilitiesOnly) {
                const mRev = getPropertyReviewStatus(p);
                if (mRev !== 'possibility' && p.rating !== 3) return false;
            }
            if (f.realtorSharedOnly && !p.shared_with_realtor) return false;
            if (f.hasNotesOnly && !p.user_notes && !p.realtor_notes) return false;
            if (f.realtorNotesOnly && !p.realtor_notes) return false;

            // 2. Status & Matrix Review
            if (f.status !== 'all' && p.status !== f.status) return false;
            if (f.matrixStatus !== 'all') {
                const mRev = getPropertyReviewStatus(p);
                if (mRev !== f.matrixStatus) return false;
            }

            // 3. Price & Valuation
            if (f.priceMin !== null && p.price < f.priceMin) return false;
            if (f.priceMax !== null && p.price > f.priceMax) return false;
            if (f.rfEstMin !== null && (p.redfin_estimate || 0) < f.rfEstMin) return false;
            if (f.rfEstMax !== null && (p.redfin_estimate || 0) > f.rfEstMax) return false;
            if (f.ppsqftMax !== null && (p.sqft_finished ? p.price / p.sqft_finished : Infinity) > f.ppsqftMax) return false;
            if (f.underRedfinOnly && (!p.redfin_estimate || p.price >= p.redfin_estimate)) return false;

            // 4. Beds & Baths Breakdown
            if (f.beds > 0 && p.beds < f.beds) return false;
            if (f.bedsMax !== null && p.beds > f.bedsMax) return false;
            if (f.baths > 0 && p.baths < f.baths) return false;
            if (f.bathsFullMin !== null && (rawInt.baths_full || 0) < f.bathsFullMin) return false;
            if (f.baths34Min !== null && (rawInt.baths_3_4 || 0) < f.baths34Min) return false;
            if (f.bathsHalfMin !== null && (rawInt.baths_1_2 || 0) < f.bathsHalfMin) return false;

            // 5. Levels & Basement
            if (f.levels && !String(p.levels || '').toLowerCase().includes(f.levels.toLowerCase())) return false;
            if (f.basement) {
                const bsmntText = String(rawInt.basement || '').toLowerCase();
                if (f.basement === 'None' && bsmntText && !bsmntText.includes('none')) return false;
                else if (f.basement !== 'None' && !bsmntText.includes(f.basement.toLowerCase())) return false;
            }

            // 6. Area & SqFt
            if (f.sqftMin !== null && p.sqft_finished < f.sqftMin) return false;
            if (f.sqftMax !== null && p.sqft_finished > f.sqftMax) return false;
            if (f.sqftTotMin !== null && (p.sqft_total || 0) < f.sqftTotMin) return false;
            if (f.sqftAboveMin !== null && (rawInt.sqft_above_grade || 0) < f.sqftAboveMin) return false;
            if (f.sqftBelowMin !== null && (rawInt.sqft_below_grade_finished || 0) < f.sqftBelowMin) return false;

            // 7. Property & Lot Specs
            if (f.propertyType && !String(p.property_type || '').toLowerCase().includes(f.propertyType.toLowerCase())) return false;
            if (f.yearMin !== null && p.year_built < f.yearMin) return false;
            if (f.yearMax !== null && p.year_built > f.yearMax) return false;
            if (f.acresMin !== null && p.lot_acres < f.acresMin) return false;
            if (f.acresMax !== null && p.lot_acres > f.acresMax) return false;
            if (f.parkingMin !== null && (p.parking_total || 0) < f.parkingMin) return false;
            if (f.garageMin !== null && (p.garage_spaces || 0) < f.garageMin) return false;

            // 8. Financials & Taxes
            if (f.noHoaOnly && (p.hoa_fee || 0) > 0) return false;
            if (f.hoaMax !== null && p.hoa_fee > f.hoaMax) return false;
            if (f.taxMax !== null && p.annual_tax > f.taxMax) return false;
            if (f.taxYear !== null && (p.tax_year || 0) !== f.taxYear) return false;

            // 9. Location & Scores
            if (f.city && !String(p.city || '').toLowerCase().includes(f.city.toLowerCase())) return false;
            if (f.zip && !String(p.zip || '').includes(f.zip)) return false;
            if (f.schoolDistrict && !String(p.school_district || '').toLowerCase().includes(f.schoolDistrict.toLowerCase())) return false;
            if (f.walkscoreMin !== null && (p.walk_score || 0) < f.walkscoreMin) return false;
            if (f.transitscoreMin !== null && (p.transit_score || 0) < f.transitscoreMin) return false;
            if (f.bikescoreMin !== null && (p.bike_score || 0) < f.bikescoreMin) return false;

            // 10. Ratings & Features
            if (f.ratingMin > 0 && (p.rating || 0) < f.ratingMin) return false;
            if (f.appliances && !String(rawInt.appliances || '').toLowerCase().includes(f.appliances.toLowerCase())) return false;
            if (f.flooring && !String(rawInt.flooring || '').toLowerCase().includes(f.flooring.toLowerCase())) return false;
            if (f.fireplaceOnly && (!rawInt.fireplaces || rawInt.fireplaces === '0')) return false;

            // 11. Keyword Search
            if (f.search) {
                const haystack = `${p.address} ${p.city} ${p.zip} ${p.mls_id} ${p.school_district} ${p.user_notes} ${p.realtor_notes} ${rawInt.appliances || ''} ${rawInt.flooring || ''}`.toLowerCase();
                if (!haystack.includes(f.search)) return false;
            }

            return true;
        });

        sortProperties();
        updateKPIs();
        renderActiveFilterChips();
        renderActiveView();
    }

    function renderActiveFilterChips() {
        const container = document.getElementById('active-filters-bar');
        const badge = document.getElementById('filter-console-badge');
        if (!container) return;

        const f = state.filters;
        const chips = [];

        if (f.search) chips.push({ label: `Search: "${f.search}"`, clear: () => { f.search = ''; if (elements.filterSearch) elements.filterSearch.value = ''; } });
        if (f.priceMin !== null) chips.push({ label: `Min Price: $${f.priceMin.toLocaleString()}`, clear: () => { f.priceMin = null; } });
        if (f.priceMax !== null) chips.push({ label: `Max Price: $${f.priceMax.toLocaleString()}`, clear: () => { f.priceMax = null; } });
        if (f.rfEstMin !== null) chips.push({ label: `Min Redfin Est: $${f.rfEstMin.toLocaleString()}`, clear: () => { f.rfEstMin = null; } });
        if (f.rfEstMax !== null) chips.push({ label: `Max Redfin Est: $${f.rfEstMax.toLocaleString()}`, clear: () => { f.rfEstMax = null; } });
        if (f.ppsqftMax !== null) chips.push({ label: `Max $/SqFt: $${f.ppsqftMax}`, clear: () => { f.ppsqftMax = null; } });
        if (f.underRedfinOnly) chips.push({ label: `📉 Below Redfin Est`, clear: () => { f.underRedfinOnly = false; } });
        if (f.beds > 0) chips.push({ label: `Beds: ${f.beds}+`, clear: () => { f.beds = 0; } });
        if (f.bedsMax !== null) chips.push({ label: `Max Beds: ${f.bedsMax}`, clear: () => { f.bedsMax = null; } });
        if (f.baths > 0) chips.push({ label: `Baths: ${f.baths}+`, clear: () => { f.baths = 0; } });
        if (f.bathsFullMin !== null) chips.push({ label: `Full Baths: ${f.bathsFullMin}+`, clear: () => { f.bathsFullMin = null; } });
        if (f.baths34Min !== null) chips.push({ label: `3/4 Baths: ${f.baths34Min}+`, clear: () => { f.baths34Min = null; } });
        if (f.bathsHalfMin !== null) chips.push({ label: `Half Baths: ${f.bathsHalfMin}+`, clear: () => { f.bathsHalfMin = null; } });
        if (f.levels) chips.push({ label: `Levels: ${f.levels}`, clear: () => { f.levels = ''; } });
        if (f.basement) chips.push({ label: `Basement: ${f.basement}`, clear: () => { f.basement = ''; } });
        if (f.sqftMin !== null) chips.push({ label: `Min SqFt: ${f.sqftMin.toLocaleString()}`, clear: () => { f.sqftMin = null; } });
        if (f.sqftMax !== null) chips.push({ label: `Max SqFt: ${f.sqftMax.toLocaleString()}`, clear: () => { f.sqftMax = null; } });
        if (f.sqftTotMin !== null) chips.push({ label: `Total SqFt: ${f.sqftTotMin.toLocaleString()}+`, clear: () => { f.sqftTotMin = null; } });
        if (f.sqftAboveMin !== null) chips.push({ label: `Above Grade: ${f.sqftAboveMin.toLocaleString()}+ SqFt`, clear: () => { f.sqftAboveMin = null; } });
        if (f.sqftBelowMin !== null) chips.push({ label: `Below Grade: ${f.sqftBelowMin.toLocaleString()}+ SqFt`, clear: () => { f.sqftBelowMin = null; } });
        if (f.propertyType) chips.push({ label: `Type: ${f.propertyType}`, clear: () => { f.propertyType = ''; } });
        if (f.yearMin !== null) chips.push({ label: `Min Year: ${f.yearMin}`, clear: () => { f.yearMin = null; } });
        if (f.yearMax !== null) chips.push({ label: `Max Year: ${f.yearMax}`, clear: () => { f.yearMax = null; } });
        if (f.acresMin !== null) chips.push({ label: `Min Acres: ${f.acresMin}`, clear: () => { f.acresMin = null; } });
        if (f.acresMax !== null) chips.push({ label: `Max Acres: ${f.acresMax}`, clear: () => { f.acresMax = null; } });
        if (f.parkingMin !== null) chips.push({ label: `Parking: ${f.parkingMin}+`, clear: () => { f.parkingMin = null; } });
        if (f.garageMin !== null) chips.push({ label: `Garage: ${f.garageMin}+`, clear: () => { f.garageMin = null; } });
        if (f.noHoaOnly) chips.push({ label: `🚫 No HOA`, clear: () => { f.noHoaOnly = false; } });
        if (f.hoaMax !== null) chips.push({ label: `Max HOA: $${f.hoaMax}/yr`, clear: () => { f.hoaMax = null; } });
        if (f.taxMax !== null) chips.push({ label: `Max Tax: $${f.taxMax}/yr`, clear: () => { f.taxMax = null; } });
        if (f.taxYear !== null) chips.push({ label: `Tax Year: ${f.taxYear}`, clear: () => { f.taxYear = null; } });
        if (f.city) chips.push({ label: `City: ${f.city}`, clear: () => { f.city = ''; } });
        if (f.zip) chips.push({ label: `Zip: ${f.zip}`, clear: () => { f.zip = ''; } });
        if (f.schoolDistrict) chips.push({ label: `School: "${f.schoolDistrict}"`, clear: () => { f.schoolDistrict = ''; } });
        if (f.walkscoreMin !== null) chips.push({ label: `WalkScore: ${f.walkscoreMin}+`, clear: () => { f.walkscoreMin = null; } });
        if (f.transitscoreMin !== null) chips.push({ label: `TransitScore: ${f.transitscoreMin}+`, clear: () => { f.transitscoreMin = null; } });
        if (f.bikescoreMin !== null) chips.push({ label: `BikeScore: ${f.bikescoreMin}+`, clear: () => { f.bikescoreMin = null; } });
        if (f.status !== 'all') chips.push({ label: `Status: ${f.status}`, clear: () => { f.status = 'all'; } });
        if (f.ratingMin > 0) chips.push({ label: `Rating: ${f.ratingMin}+ Stars`, clear: () => { f.ratingMin = 0; } });
        if (f.matrixStatus !== 'all') {
            const statusLabels = { favorite: '⭐ Liked / Favorites', possibility: '🤔 Possibilities', dislike: '🚫 Disliked / Hidden', none: '📋 Unreviewed' };
            chips.push({ label: `Review: ${statusLabels[f.matrixStatus] || f.matrixStatus}`, clear: () => { f.matrixStatus = 'all'; } });
        }
        if (f.appliances) chips.push({ label: `Appliance: "${f.appliances}"`, clear: () => { f.appliances = ''; } });
        if (f.flooring) chips.push({ label: `Flooring: "${f.flooring}"`, clear: () => { f.flooring = ''; } });
        if (f.fireplaceOnly) chips.push({ label: `🔥 Has Fireplace`, clear: () => { f.fireplaceOnly = false; } });
        if (f.realtorNotesOnly) chips.push({ label: `💬 Has Realtor Notes`, clear: () => { f.realtorNotesOnly = false; } });
        if (f.favoritesOnly) chips.push({ label: `⭐ Favorites Only`, clear: () => { f.favoritesOnly = false; } });
        if (f.possibilitiesOnly) chips.push({ label: `🤔 Possibilities Only`, clear: () => { f.possibilitiesOnly = false; } });
        if (f.realtorSharedOnly) chips.push({ label: `🤝 Realtor Shared Only`, clear: () => { f.realtorSharedOnly = false; } });
        if (f.hasNotesOnly) chips.push({ label: `📝 Has Notes`, clear: () => { f.hasNotesOnly = false; } });

        if (badge) {
            if (chips.length > 0) {
                badge.innerText = chips.length;
                badge.style.display = 'inline-block';
            } else {
                badge.style.display = 'none';
            }
        }

        if (!chips.length) {
            container.style.display = 'none';
            container.innerHTML = '';
            return;
        }

        container.style.display = 'flex';
        container.innerHTML = `
            <span style="font-weight: 700; color: var(--text-muted); margin-right: 0.25rem;">Active Filters (${chips.length}):</span>
            ${chips.map((c, idx) => `
                <span class="active-filter-chip">
                    ${escapeHtml(c.label)}
                    <span class="chip-remove" data-chip-idx="${idx}">✕</span>
                </span>
            `).join('')}
            <button class="btn btn-secondary" style="padding: 0.15rem 0.5rem; font-size: 0.75rem; margin-left: 0.5rem;" id="btn-clear-all-chips">Reset All</button>
        `;

        container.querySelectorAll('.chip-remove').forEach((btn, idx) => {
            btn.addEventListener('click', () => {
                chips[idx].clear();
                syncTopBarFromState();
                syncDrawerInputsFromState();
                applyFiltersAndRender();
            });
        });

        document.getElementById('btn-clear-all-chips')?.addEventListener('click', resetFilters);
    }

    function syncTopBarFromState() {
        const f = state.filters;
        if (elements.filterSearch) elements.filterSearch.value = f.search || '';
        if (elements.filterPriceMin) elements.filterPriceMin.value = f.priceMin !== null ? f.priceMin : '';
        if (elements.filterPriceMax) elements.filterPriceMax.value = f.priceMax !== null ? f.priceMax : '';
        if (elements.filterBeds) elements.filterBeds.value = f.beds ? String(f.beds) : '0';
        if (elements.filterStatus) elements.filterStatus.value = f.status || 'all';
        if (elements.filterMatrixStatusTop) elements.filterMatrixStatusTop.value = f.matrixStatus || 'all';
    }

    function syncDrawerInputsFromState() {
        const f = state.filters;
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.value = (val !== null && val !== undefined) ? String(val) : '';
        };
        const setChk = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.checked = !!val;
        };

        setVal('drawer-price-min', f.priceMin);
        setVal('drawer-price-max', f.priceMax);
        setVal('filter-rf-est-min', f.rfEstMin);
        setVal('filter-rf-est-max', f.rfEstMax);
        setVal('filter-ppsqft-max', f.ppsqftMax);
        setChk('toggle-under-redfin', f.underRedfinOnly);

        setVal('drawer-beds-min', f.beds);
        setVal('filter-beds-max', f.bedsMax);
        setVal('drawer-baths-min', f.baths);
        setVal('filter-baths-full-min', f.bathsFullMin);
        setVal('filter-baths-34-min', f.baths34Min);
        setVal('filter-baths-half-min', f.bathsHalfMin);
        setVal('filter-levels', f.levels);
        setVal('filter-basement', f.basement);

        setVal('drawer-sqft-min', f.sqftMin);
        setVal('filter-sqft-max', f.sqftMax);
        setVal('filter-sqft-tot-min', f.sqftTotMin);
        setVal('filter-sqft-above-min', f.sqftAboveMin);
        setVal('filter-sqft-below-min', f.sqftBelowMin);
        setVal('filter-property-type', f.propertyType);
        setVal('drawer-year-min', f.yearMin);
        setVal('drawer-year-max', f.yearMax);
        setVal('drawer-acres-min', f.acresMin);
        setVal('filter-acres-max', f.acresMax);
        setVal('filter-garage-min', f.garageMin);
        setVal('filter-parking-min', f.parkingMin);

        setVal('drawer-hoa-max', f.hoaMax);
        setChk('toggle-no-hoa', f.noHoaOnly);
        setVal('drawer-tax-max', f.taxMax);
        setVal('filter-tax-year', f.taxYear);

        setVal('filter-city', f.city);
        setVal('filter-zip', f.zip);
        setVal('filter-school-district', f.schoolDistrict);
        setVal('drawer-walkscore-min', f.walkscoreMin);
        setVal('filter-transitscore-min', f.transitscoreMin);
        setVal('filter-bikescore-min', f.bikescoreMin);

        setVal('filter-rating-min', f.ratingMin);
        setVal('filter-matrix-status', f.matrixStatus);
        setVal('filter-appliances', f.appliances);
        setVal('filter-flooring', f.flooring);
        setChk('toggle-fireplace', f.fireplaceOnly);
        setChk('toggle-realtor-notes', f.realtorNotesOnly);

        setChk('drawer-toggle-favorites', f.favoritesOnly);
        setChk('drawer-toggle-possibilities', f.possibilitiesOnly);
        setChk('drawer-toggle-realtor-shared', f.realtorSharedOnly);
        setChk('drawer-toggle-has-notes', f.hasNotesOnly);
        setChk('drawer-toggle-include-hidden', f.showHidden);
    }

    function syncStateFromDrawerInputs() {
        const f = state.filters;
        const getNum = id => {
            const el = document.getElementById(id);
            if (!el || el.value === '') return null;
            const n = parseFloat(el.value);
            return isNaN(n) ? null : n;
        };
        const getStr = id => {
            const el = document.getElementById(id);
            return el ? el.value.trim() : '';
        };
        const getChk = id => {
            const el = document.getElementById(id);
            return el ? el.checked : false;
        };

        f.priceMin = getNum('drawer-price-min');
        f.priceMax = getNum('drawer-price-max');
        f.rfEstMin = getNum('filter-rf-est-min');
        f.rfEstMax = getNum('filter-rf-est-max');
        f.ppsqftMax = getNum('filter-ppsqft-max');
        f.underRedfinOnly = getChk('toggle-under-redfin');

        f.beds = getNum('drawer-beds-min') || 0;
        f.bedsMax = getNum('filter-beds-max');
        f.baths = getNum('drawer-baths-min') || 0;
        f.bathsFullMin = getNum('filter-baths-full-min');
        f.baths34Min = getNum('filter-baths-34-min');
        f.bathsHalfMin = getNum('filter-baths-half-min');
        f.levels = getStr('filter-levels');
        f.basement = getStr('filter-basement');

        f.sqftMin = getNum('drawer-sqft-min');
        f.sqftMax = getNum('filter-sqft-max');
        f.sqftTotMin = getNum('filter-sqft-tot-min');
        f.sqftAboveMin = getNum('filter-sqft-above-min');
        f.sqftBelowMin = getNum('filter-sqft-below-min');
        f.propertyType = getStr('filter-property-type');
        f.yearMin = getNum('drawer-year-min');
        f.yearMax = getNum('drawer-year-max');
        f.acresMin = getNum('drawer-acres-min');
        f.acresMax = getNum('filter-acres-max');
        f.garageMin = getNum('filter-garage-min');
        f.parkingMin = getNum('filter-parking-min');

        f.hoaMax = getNum('drawer-hoa-max');
        f.noHoaOnly = getChk('toggle-no-hoa');
        f.taxMax = getNum('drawer-tax-max');
        f.taxYear = getNum('filter-tax-year');

        f.city = getStr('filter-city');
        f.zip = getStr('filter-zip');
        f.schoolDistrict = getStr('filter-school-district');
        f.walkscoreMin = getNum('drawer-walkscore-min');
        f.transitscoreMin = getNum('filter-transitscore-min');
        f.bikescoreMin = getNum('filter-bikescore-min');

        f.ratingMin = getNum('filter-rating-min') || 0;
        f.matrixStatus = getStr('filter-matrix-status') || 'all';
        f.appliances = getStr('filter-appliances');
        f.flooring = getStr('filter-flooring');
        f.fireplaceOnly = getChk('toggle-fireplace');
        f.realtorNotesOnly = getChk('toggle-realtor-notes');

        f.favoritesOnly = getChk('drawer-toggle-favorites');
        f.possibilitiesOnly = getChk('drawer-toggle-possibilities');
        f.realtorSharedOnly = getChk('drawer-toggle-realtor-shared');
        f.hasNotesOnly = getChk('drawer-toggle-has-notes');
        f.showHidden = getChk('drawer-toggle-include-hidden');

        if (f.status) localStorage.setItem('scout_filter_status', f.status);
        if (f.matrixStatus) localStorage.setItem('scout_filter_matrix_status', f.matrixStatus);

        syncTopBarFromState();
    }

    function setupFilterConsoleDrawer() {
        const modalDrawer = document.getElementById('modal-filter-console');
        const btnOpen = document.getElementById('btn-open-filter-console');
        const btnClose = document.getElementById('btn-close-filter-console');
        const btnApply = document.getElementById('btn-drawer-apply');
        const btnResetDrawer = document.getElementById('btn-drawer-reset');

        if (btnOpen && modalDrawer) {
            btnOpen.addEventListener('click', () => {
                syncDrawerInputsFromState();
                modalDrawer.classList.add('active');
            });
        }

        if (btnClose && modalDrawer) {
            btnClose.addEventListener('click', () => modalDrawer.classList.remove('active'));
        }

        if (btnApply && modalDrawer) {
            btnApply.addEventListener('click', () => {
                syncStateFromDrawerInputs();
                applyFiltersAndRender();
                modalDrawer.classList.remove('active');
                showToast('Filters applied! Focus on your target houses 🚀', 'success');
            });
        }

        if (btnResetDrawer) {
            btnResetDrawer.addEventListener('click', () => {
                resetFilters();
                syncDrawerInputsFromState();
                showToast('All filters reset', 'info');
            });
        }

        // Tab Navigation
        document.querySelectorAll('.drawer-tab-btn').forEach(tabBtn => {
            tabBtn.addEventListener('click', () => {
                document.querySelectorAll('.drawer-tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.drawer-tab-panel').forEach(p => p.classList.remove('active'));

                tabBtn.classList.add('active');
                const targetPanel = document.getElementById(tabBtn.dataset.tab);
                if (targetPanel) targetPanel.classList.add('active');
            });
        });

        // Saved Presets Event Handlers
        const btnSavePreset = document.getElementById('btn-save-preset');
        const selectPresets = document.getElementById('select-saved-presets');

        if (btnSavePreset) {
            btnSavePreset.addEventListener('click', saveCurrentPreset);
        }

        if (selectPresets) {
            selectPresets.addEventListener('change', (e) => {
                const presetName = e.target.value;
                if (presetName) loadPreset(presetName);
            });
        }

        loadPresetsList();
    }

    function getSavedPresets() {
        try {
            return JSON.parse(localStorage.getItem('scout_saved_presets') || '{}');
        } catch (e) {
            return {};
        }
    }

    function saveCurrentPreset() {
        const presetName = prompt('Enter a name for this filter preset (e.g. "3+ Bed Denver under $750k"):');
        if (!presetName) return;

        const presets = getSavedPresets();
        presets[presetName.trim()] = { ...state.filters };
        localStorage.setItem('scout_saved_presets', JSON.stringify(presets));
        showToast(`Saved filter preset "${presetName}"! 💾`, 'success');
        loadPresetsList();
    }

    function loadPresetsList() {
        const selectPresets = document.getElementById('select-saved-presets');
        if (!selectPresets) return;

        const presets = getSavedPresets();
        const names = Object.keys(presets);

        selectPresets.innerHTML = `<option value="">💾 Presets (${names.length})...</option>` +
            names.map(name => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join('');
    }

    function loadPreset(presetName) {
        const presets = getSavedPresets();
        const target = presets[presetName];
        if (!target) return;

        state.filters = { ...state.filters, ...target };
        syncTopBarFromState();
        syncDrawerInputsFromState();
        applyFiltersAndRender();
        showToast(`Loaded preset "${presetName}" 🚀`, 'info');
    }

    function sortProperties() {
        const props = state.filteredProperties;
        switch (state.currentSort) {
            case 'price-asc':
                props.sort((a, b) => a.price - b.price);
                break;
            case 'price-desc':
                props.sort((a, b) => b.price - a.price);
                break;
            case 'sqft-desc':
                props.sort((a, b) => b.sqft_finished - a.sqft_finished);
                break;
            case 'ppsqft-asc':
                props.sort((a, b) => {
                    const ppsqA = a.sqft_finished ? a.price / a.sqft_finished : 999999;
                    const ppsqB = b.sqft_finished ? b.price / b.sqft_finished : 999999;
                    return ppsqA - ppsqB;
                });
                break;
            case 'walkscore-desc':
                props.sort((a, b) => (b.walk_score || 0) - (a.walk_score || 0));
                break;
            case 'rating-desc':
                props.sort((a, b) => (b.rating || 0) - (a.rating || 0));
                break;
            case 'date-desc':
            default:
                props.sort((a, b) => new Date(b.list_date || 0) - new Date(a.list_date || 0));
                break;
        }
    }

    function updateKPIs() {
        const total = state.allProperties.length;
        const filtered = state.filteredProperties;
        const activeCount = filtered.filter(p => p.status === 'Active').length;
        const favCount = state.allProperties.filter(p => p.favorite).length;
        const sharedCount = state.allProperties.filter(p => p.shared_with_realtor).length;

        const totalPrice = filtered.reduce((acc, p) => acc + p.price, 0);
        const totalSqft = filtered.reduce((acc, p) => acc + p.sqft_finished, 0);
        const avgPrice = filtered.length ? Math.round(totalPrice / filtered.length) : 0;
        const avgSqft = filtered.length ? Math.round(totalSqft / filtered.length) : 0;
        const avgPpsqft = totalSqft ? Math.round(totalPrice / totalSqft) : 0;

        elements.kpiTotal.innerText = filtered.length;
        elements.kpiTotalSub.innerText = `${activeCount} Active`;
        elements.kpiFavorites.innerText = favCount;
        elements.kpiShared.innerText = sharedCount;
        elements.kpiAvgPrice.innerText = `$${avgPrice.toLocaleString()}`;
        elements.kpiAvgSqftPrice.innerText = `$${avgPpsqft} / SqFt`;
        elements.kpiAvgSqft.innerText = `${avgSqft.toLocaleString()}`;
    }

    function renderActiveView() {
        elements.gridContainer.style.display = 'none';
        if (elements.mapContainer) elements.mapContainer.style.display = 'none';
        elements.tableContainer.style.display = 'none';
        elements.matrixContainer.style.display = 'none';

        if (state.activeView === 'grid') {
            elements.gridContainer.style.display = 'grid';
            renderGrid();
        } else if (state.activeView === 'map') {
            if (elements.mapContainer) elements.mapContainer.style.display = 'block';
            renderMap();
        } else if (state.activeView === 'table') {
            elements.tableContainer.style.display = 'block';
            renderTable();
        } else if (state.activeView === 'matrix') {
            elements.matrixContainer.style.display = 'grid';
            renderMatrix();
        }
    }

    function cleanDisplayAddress(address, mlsId) {
        if (!address) return 'Address Unavailable';
        let clean = String(address).trim();
        if (mlsId) {
            clean = clean.replace(new RegExp('^' + mlsId + '[\\s\\-:,\n]+', 'i'), '');
            clean = clean.replace(new RegExp('^' + mlsId + '$', 'i'), '');
        }
        // Remove prepended 7-9 digit MLS ID numbers when followed by street address text
        clean = clean.replace(/^(\d{7,9})\s+([0-9A-Za-z])/i, '$2');
        clean = clean.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
        return clean || 'Address Unavailable';
    }

    let mapLayerControl = null;

    function updateMapTileLayer() {
        if (!leafletMap || typeof L === 'undefined') return;
        
        // Base tile layers (Zero watermarks, 100% clean & public)
        const osmStandard = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            crossOrigin: true
        });

        const esriStreets = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 19,
            attribution: 'Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, USGS, Intermap, iPC, NRCAN, Esri Japan, METI, Esri China (Hong Kong), Esri (Thailand), TomTom, 2012'
        });

        const esriSatellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 19,
            attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
        });

        if (!currentTileLayer) {
            currentTileLayer = osmStandard;
            currentTileLayer.addTo(leafletMap);
        }

        if (!mapLayerControl) {
            const baseMaps = {
                "🗺️ OpenStreetMap Clean": osmStandard,
                "🛣️ Esri Street Map": esriStreets,
                "🛰️ Esri Satellite": esriSatellite
            };
            mapLayerControl = L.control.layers(baseMaps, null, { position: 'topright' }).addTo(leafletMap);
        }
    }

    let fitBoundsControl = null;

    // Leaflet Interactive Map View
    function renderMap(options = {}) {
        const { autoFit = true, forceFit = false } = options;
        if (typeof L === 'undefined') return;

        if (!leafletMap) {
            leafletMap = L.map('map-element', {
                zoomControl: true,
                fadeAnimation: false,
                markerZoomAnimation: true,
                preferCanvas: true
            }).setView([39.65, -104.82], 11);
            updateMapTileLayer();

            leafletMap.on('zoomstart dragstart', () => {
                leafletMap._userHasInteracted = true;
            });
        }

        setTimeout(() => { leafletMap.invalidateSize(); }, 200);

        // Clear previous markers
        mapMarkers.forEach(m => leafletMap.removeLayer(m));
        mapMarkers = [];

        const props = state.filteredProperties;
        if (!props.length) return;

        // Known Denver metro coordinates lookup for quick mapping if lat/lng is unpopulated
        const cityCoords = {
            'aurora': [39.7294, -104.8319],
            'centennial': [39.5791, -104.8772],
            'denver': [39.7392, -104.9903],
            'littleton': [39.6133, -105.0166],
            'englewood': [39.6478, -104.9878],
            'highlands ranch': [39.5539, -104.9691],
            'parker': [39.5186, -104.7614]
        };

        const bounds = [];

        // Calculate coordinates with overlap detection & spiderfy radial offsets
        const resolvedCoords = props.map((p, idx) => {
            let lat = parseFloat(p.latitude || (p.raw_mls_json && p.raw_mls_json.latitude));
            let lng = parseFloat(p.longitude || (p.raw_mls_json && p.raw_mls_json.longitude));

            if (!isValidCoord(lat, lng)) {
                const cKey = (p.city || '').toLowerCase();
                const base = cityCoords[cKey] || [39.65 + (idx * 0.008), -104.82 + (idx * 0.008)];
                const hash = (p.mls_id || '').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
                lat = base[0] + ((hash % 100) - 50) * 0.0015;
                lng = base[1] + (((hash * 3) % 100) - 50) * 0.0015;
            }

            return { lat, lng, property: p };
        });

        // Group properties that are close to each other (~50m radius) to prevent pill overlap
        const coordGroups = {};
        resolvedCoords.forEach(item => {
            const key = `${item.lat.toFixed(3)},${item.lng.toFixed(3)}`;
            if (!coordGroups[key]) coordGroups[key] = [];
            coordGroups[key].push(item);
        });

        // Apply generous radial offset so wide house pills never obscure each other
        Object.values(coordGroups).forEach(group => {
            if (group.length > 1) {
                const radius = 0.0012; // ~100px screen separation at neighborhood zoom
                group.forEach((item, gIdx) => {
                    const angle = (gIdx * 2 * Math.PI) / group.length;
                    const ring = Math.ceil((gIdx + 1) / 6);
                    const currentRadius = radius * ring;
                    item.lat += currentRadius * Math.sin(angle);
                    item.lng += currentRadius * Math.cos(angle) * 1.4; // 1.4x wider for horizontal pill width
                });
            }
        });

        resolvedCoords.forEach(item => {
            const p = item.property;
            const lat = item.lat;
            const lng = item.lng;

            if (isValidCoord(lat, lng)) {
                bounds.push([lat, lng]);
            }

            const priceStr = p.price >= 1000000 
                ? `$${(p.price / 1000000).toFixed(2)}M` 
                : `$${Math.round(p.price / 1000)}k`;

            const statusClass = (p.status || 'Active').toLowerCase();
            const iconHtml = `<div class="leaflet-price-pin status-${statusClass} ${p.favorite ? 'fav-pin' : ''}">${p.favorite ? '⭐ ' : ''}${priceStr}</div>`;
            const customIcon = L.divIcon({
                html: iconHtml,
                className: 'custom-pin-container',
                iconSize: null,
                iconAnchor: null
            });

            const marker = L.marker([lat, lng], { 
                icon: customIcon,
                zIndexOffset: p.favorite ? 500 : 0
            }).addTo(leafletMap);
            const imgUrl = p.main_image_url || 'https://via.placeholder.com/200x110?text=No+Photo';
            
            const popupContent = `
                <div class="map-popup-card">
                    <img src="${imgUrl}" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='https://via.placeholder.com/200x110?text=No+Photo';" class="map-popup-img">
                    <strong style="color:var(--accent-gold); font-size:1.1rem;">$${p.price.toLocaleString()}</strong>
                    <div style="font-weight:600; font-size:0.85rem;">${escapeHtml(cleanDisplayAddress(p.address, p.mls_id))}</div>
                    <div style="font-size:0.75rem; color:var(--text-muted);">${p.beds} Beds | ${p.baths} Baths | ${p.sqft_finished ? p.sqft_finished.toLocaleString() + ' SqFt' : 'N/A'}</div>
                    <button class="btn btn-primary" style="margin-top:4px; padding:4px 10px; font-size:0.75rem;" onclick="openDetailModal('${p.mls_id}')">✨ View Details</button>
                </div>
            `;

            marker.bindPopup(popupContent);
            mapMarkers.push(marker);
        });

        // Add "Fit All Houses" button control if not present
        if (!fitBoundsControl && leafletMap) {
            const FitControl = L.Control.extend({
                options: { position: 'topleft' },
                onAdd: function() {
                    const btn = L.DomUtil.create('button', 'leaflet-bar btn-fit-bounds');
                    btn.innerHTML = '🎯 Fit All';
                    btn.title = 'Zoom map to show all mapped houses';
                    btn.style.cssText = 'background:#1e293b; color:#fbbf24; border:1px solid rgba(255,255,255,0.2); font-weight:700; font-size:12px; padding:5px 10px; border-radius:6px; cursor:pointer; margin-top:5px; box-shadow:0 2px 6px rgba(0,0,0,0.3);';
                    L.DomEvent.disableClickPropagation(btn);
                    btn.onclick = () => {
                        if (leafletMap) {
                            leafletMap._userHasInteracted = false;
                            renderMap({ autoFit: true, forceFit: true });
                        }
                    };
                    return btn;
                }
            });
            fitBoundsControl = new FitControl();
            leafletMap.addControl(fitBoundsControl);
        }

        if (bounds.length > 0 && (forceFit || (autoFit && !leafletMap._userHasInteracted))) {
            leafletMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
        }
    }

    // Command Palette Logic
    function openCommandPalette() {
        if (!elements.modalCommandPalette) return;
        elements.modalCommandPalette.classList.add('active');
        if (elements.cmdPaletteInput) {
            elements.cmdPaletteInput.value = '';
            elements.cmdPaletteInput.focus();
        }
        renderCommandPaletteResults('');
    }

    function closeCommandPalette() {
        if (elements.modalCommandPalette) {
            elements.modalCommandPalette.classList.remove('active');
        }
    }

    function handleCmdPaletteSearch(e) {
        renderCommandPaletteResults(e.target.value.trim().toLowerCase());
    }

    function renderCommandPaletteResults(query) {
        if (!elements.cmdPaletteResults) return;

        let results = [];

        // View Actions
        const actions = [
            { icon: '🎴', title: 'Switch to Card Grid View', action: () => switchView('grid') },
            { icon: '🗺️', title: 'Switch to Interactive Map View', action: () => switchView('map') },
            { icon: '📊', title: 'Switch to Table View', action: () => switchView('table') },
            { icon: '⚖️', title: 'Switch to Comparison Matrix View', action: () => switchView('matrix') },
            { icon: '⭐', title: 'Filter: Favorites Only', action: () => { elements.toggleFavorites.checked = true; state.filters.favoritesOnly = true; applyFiltersAndRender(); switchView('grid'); } },
            { icon: '🤝', title: 'Filter: Shared with Realtor Only', action: () => { elements.toggleRealtorShared.checked = true; state.filters.realtorSharedOnly = true; applyFiltersAndRender(); switchView('grid'); } },
            { icon: '📄', title: 'Export Properties to CSV', action: () => exportCSV() },
            { icon: '🌙', title: 'Toggle Light / Dark Theme', action: () => toggleTheme() }
        ];

        actions.forEach(act => {
            if (!query || act.title.toLowerCase().includes(query)) {
                results.push({
                    type: 'action',
                    icon: act.icon,
                    title: act.title,
                    subtitle: 'Quick Action',
                    execute: act.action
                });
            }
        });

        // Search Properties
        state.allProperties.forEach(p => {
            const textMatch = `${p.address} ${p.city} ${p.mls_id} ${p.user_notes}`.toLowerCase();
            if (query && textMatch.includes(query)) {
                results.push({
                    type: 'property',
                    icon: '🏠',
                    title: `$${p.price.toLocaleString()} - ${p.address}`,
                    subtitle: `${p.city}, CO | MLS #${p.mls_id} | ${p.beds} Beds, ${p.baths} Baths`,
                    execute: () => openDetailModal(p.mls_id)
                });
            }
        });

        if (results.length === 0) {
            elements.cmdPaletteResults.innerHTML = `<div style="padding:1.5rem; text-align:center; color:var(--text-muted); font-size:0.9rem;">No matching commands or properties found.</div>`;
            return;
        }

        elements.cmdPaletteResults.innerHTML = results.slice(0, 8).map((res, idx) => `
            <div class="cmd-item ${idx === 0 ? 'selected' : ''}" data-idx="${idx}">
                <div style="display:flex; align-items:center; gap:0.75rem;">
                    <span style="font-size:1.2rem;">${res.icon}</span>
                    <div>
                        <div class="cmd-item-title">${escapeHtml(res.title)}</div>
                        <div class="cmd-item-subtitle">${escapeHtml(res.subtitle)}</div>
                    </div>
                </div>
                <span style="font-size:0.75rem; color:var(--text-muted);">Jump ↵</span>
            </div>
        `).join('');

        // Attach click listeners to items
        elements.cmdPaletteResults.querySelectorAll('.cmd-item').forEach((itemEl, idx) => {
            itemEl.addEventListener('click', () => {
                closeCommandPalette();
                results[idx].execute();
            });
        });
    }

    function switchView(viewName) {
        document.querySelectorAll('.view-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.view === viewName);
        });
        state.activeView = viewName;
        renderActiveView();
        showToast(`Switched view to ${viewName.toUpperCase()}`, 'info');
    }

    function renderGrid() {
        const props = state.filteredProperties;
        if (!props.length) {
            elements.gridContainer.innerHTML = `
                <div style="grid-column: 1/-1; text-align:center; padding: 4rem; color: var(--text-muted); background: var(--bg-card); border-radius: 12px;">
                    <h3>No matching properties found</h3>
                    <p style="margin-top: 0.5rem;">Try adjusting your search criteria or resetting filters.</p>
                </div>
            `;
            return;
        }

        elements.gridContainer.innerHTML = props.map(p => {
            const ppsqft = p.sqft_finished ? Math.round(p.price / p.sqft_finished) : 0;
            const rfDelta = p.redfin_estimate ? Math.round(((p.price - p.redfin_estimate) / p.redfin_estimate) * 100) : null;
            let rfBadge = '';
            if (rfDelta !== null) {
                const isAbove = rfDelta > 0;
                rfBadge = `<span class="card-rf-delta ${isAbove ? 'delta-above' : 'delta-below'}">${isAbove ? '+' : ''}${rfDelta}% vs Redfin</span>`;
            }

            const matrixRev = getPropertyReviewStatus(p);
            let matrixBadge = '';
            if (matrixRev === 'favorite') matrixBadge = `<span class="badge-matrix-review badge-matrix-fav">⭐ Matrix Favorite</span>`;
            else if (matrixRev === 'possibility') matrixBadge = `<span class="badge-matrix-review badge-matrix-possibility">🤔 Matrix Possibility</span>`;
            else if (matrixRev === 'dislike') matrixBadge = `<span class="badge-matrix-review badge-matrix-dislike">🚫 Matrix Disliked</span>`;

            const displayAddr = cleanDisplayAddress(p.address, p.mls_id);
            const imgUrl = p.main_image_url || 'https://via.placeholder.com/400x250?text=No+Listing+Photo';

            return `
                <div class="property-card" data-mls="${p.mls_id}" onclick="openDetailModal('${p.mls_id}')">
                    <div class="card-media">
                        <img src="${imgUrl}" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='https://via.placeholder.com/400x250?text=No+Photo+Available';" class="card-img" alt="Property">
                        <span class="card-status-badge badge-${(p.status || 'Active').toLowerCase()}">${p.status}</span>
                        <button class="card-fav-btn ${p.favorite ? 'is-fav' : ''}" onclick="toggleFavorite('${p.mls_id}', event)">
                            ${p.favorite ? '★' : '☆'}
                        </button>
                    </div>
                    <div class="card-body">
                        <div class="card-price-row">
                            <span class="card-price">$${p.price.toLocaleString()}</span>
                            ${rfBadge}
                        </div>
                        <div>
                            <div class="card-address">${escapeHtml(displayAddr)}</div>
                            <div class="card-city">${p.city}, ${p.state} ${p.zip}</div>
                        </div>
                        <div class="card-stats">
                            <div class="stat-item"><span class="stat-val">${p.beds}</span><span class="stat-lbl">Beds</span></div>
                            <div class="stat-item"><span class="stat-val">${p.baths}</span><span class="stat-lbl">Baths</span></div>
                            <div class="stat-item"><span class="stat-val">${p.sqft_finished ? p.sqft_finished.toLocaleString() : 'N/A'}</span><span class="stat-lbl">Fin SqFt</span></div>
                            <div class="stat-item"><span class="stat-val">$${ppsqft}</span><span class="stat-lbl">$/SqFt</span></div>
                        </div>
                        <div class="card-scores">
                            <span class="score-badge">Yr: ${p.year_built || 'N/A'}</span>
                            <span class="score-badge">Lot: ${p.lot_acres ? p.lot_acres + ' ac' : (p.lot_sqft ? p.lot_sqft + ' sqft' : 'N/A')}</span>
                            ${p.walk_score ? `<span class="score-badge" style="background:#059669; color:#fff;">🚶 ${p.walk_score}/100</span>` : ''}
                            ${p.hoa_fee ? `<span class="score-badge" style="background:#d97706; color:#fff;">HOA: $${p.hoa_fee}</span>` : '<span class="score-badge">No HOA</span>'}
                            ${matrixBadge}
                        </div>
                        ${p.user_notes ? `<div class="card-notes-preview">📝 ${escapeHtml(p.user_notes)}</div>` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }

    function renderTable() {
        const props = state.filteredProperties;
        elements.tableContainer.innerHTML = `
            <table class="scout-table">
                <thead>
                    <tr>
                        <th>Status</th>
                        <th>MLS Review</th>
                        <th>Address</th>
                        <th>Price</th>
                        <th>Beds</th>
                        <th>Baths</th>
                        <th>Fin SqFt</th>
                        <th>$/SqFt</th>
                        <th>Lot</th>
                        <th>Built</th>
                        <th>HOA</th>
                        <th>Tax</th>
                        <th>WalkScore</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${props.map(p => {
                        const matrixRev = getPropertyReviewStatus(p);
                        let matrixBadge = '-';
                        if (matrixRev === 'favorite') matrixBadge = `<span class="badge-matrix-review badge-matrix-fav">⭐ Favorite</span>`;
                        else if (matrixRev === 'possibility') matrixBadge = `<span class="badge-matrix-review badge-matrix-possibility">🤔 Possibility</span>`;
                        else if (matrixRev === 'dislike') matrixBadge = `<span class="badge-matrix-review badge-matrix-dislike">🚫 Disliked</span>`;

                        return `
                            <tr onclick="openDetailModal('${p.mls_id}')" style="cursor:pointer;">
                                <td><span class="card-status-badge badge-${(p.status || 'Active').toLowerCase()}">${p.status}</span></td>
                                <td>${matrixBadge}</td>
                                <td><strong>${escapeHtml(cleanDisplayAddress(p.address, p.mls_id))}</strong><br><small style="color:var(--text-muted);">${p.city}, ${p.zip}</small></td>
                                <td style="font-weight:700; color:var(--accent-gold);">$${p.price.toLocaleString()}</td>
                                <td>${p.beds}</td>
                                <td>${p.baths}</td>
                                <td>${p.sqft_finished ? p.sqft_finished.toLocaleString() : '-'}</td>
                                <td>$${p.sqft_finished ? Math.round(p.price / p.sqft_finished) : '-'}</td>
                                <td>${p.lot_acres ? p.lot_acres + ' ac' : '-'}</td>
                                <td>${p.year_built || '-'}</td>
                                <td>${p.hoa_fee ? '$' + p.hoa_fee : 'No'}</td>
                                <td>${p.annual_tax ? '$' + p.annual_tax : '-'}</td>
                                <td>${p.walk_score ? p.walk_score + '/100' : '-'}</td>
                                <td>
                                    <button class="btn btn-secondary" style="padding:2px 8px; font-size:0.75rem;" onclick="event.stopPropagation(); openDetailModal('${p.mls_id}')">View</button>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
    }

    function renderMatrix() {
        const props = state.filteredProperties.slice(0, 4); // Compare top 4
        if (!props.length) {
            elements.matrixContainer.innerHTML = '<div style="padding:2rem; color:var(--text-muted);">Select or filter properties to compare side-by-side.</div>';
            return;
        }

        // Calculate best metrics across compared properties
        const bestPrice = Math.min(...props.map(p => p.price));
        const bestPpsqft = Math.min(...props.map(p => p.sqft_finished ? Math.round(p.price / p.sqft_finished) : Infinity));
        const bestSqft = Math.max(...props.map(p => p.sqft_finished || 0));
        const bestWalkScore = Math.max(...props.map(p => p.walk_score || 0));
        const bestYearBuilt = Math.max(...props.map(p => p.year_built || 0));
        const bestHoaFee = Math.min(...props.map(p => (p.hoa_fee !== null && p.hoa_fee !== undefined) ? p.hoa_fee : 0));

        const rows = [
            { label: 'Property Photo', fn: p => `<img src="${p.main_image_url || 'https://via.placeholder.com/200x120?text=No+Photo'}" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='https://via.placeholder.com/200x120?text=No+Photo';" style="width:100%; height:120px; object-fit:cover; border-radius:6px; cursor:pointer;" onclick="openDetailModal('${p.mls_id}')">` },
            { label: 'Address', fn: p => `<strong style="cursor:pointer; color:var(--accent-blue);" onclick="openDetailModal('${p.mls_id}')">${escapeHtml(cleanDisplayAddress(p.address, p.mls_id))}</strong><br>${p.city}, ${p.zip}` },
            { label: 'MLS Review', fn: p => {
                const matrixRev = getPropertyReviewStatus(p);
                if (matrixRev === 'favorite') return `<span class="badge-matrix-review badge-matrix-fav">⭐ Favorite</span>`;
                if (matrixRev === 'possibility') return `<span class="badge-matrix-review badge-matrix-possibility">🤔 Possibility</span>`;
                if (matrixRev === 'dislike') return `<span class="badge-matrix-review badge-matrix-dislike">🚫 Disliked</span>`;
                return '<span style="color:var(--text-muted);">📋 Unreviewed</span>';
            }},
            { label: 'List Price', fn: p => `<strong style="font-size:1.1rem; color:var(--accent-gold);">$${p.price.toLocaleString()}</strong>`, isWinner: p => p.price === bestPrice },
            { label: 'Redfin Estimate', fn: p => p.redfin_estimate ? `$${p.redfin_estimate.toLocaleString()}` : 'N/A' },
            { label: 'Beds / Baths', fn: p => `${p.beds} Beds / ${p.baths} Baths` },
            { label: 'Finished SqFt', fn: p => p.sqft_finished ? p.sqft_finished.toLocaleString() : 'N/A', isWinner: p => p.sqft_finished === bestSqft && bestSqft > 0 },
            { label: 'Price per SqFt', fn: p => `$${p.sqft_finished ? Math.round(p.price / p.sqft_finished) : 'N/A'}`, isWinner: p => p.sqft_finished && Math.round(p.price / p.sqft_finished) === bestPpsqft },
            { label: 'Year Built', fn: p => p.year_built || 'N/A', isWinner: p => p.year_built === bestYearBuilt && bestYearBuilt > 0 },
            { label: 'Lot Size', fn: p => p.lot_acres ? `${p.lot_acres} Acres` : 'N/A' },
            { label: 'HOA Fee', fn: p => p.hoa_fee ? `$${p.hoa_fee}/yr` : 'No HOA', isWinner: p => (p.hoa_fee || 0) === bestHoaFee },
            { label: 'Annual Tax', fn: p => p.annual_tax ? `$${p.annual_tax}` : 'N/A' },
            { label: 'WalkScore', fn: p => p.walk_score ? `${p.walk_score} / 100` : 'N/A', isWinner: p => p.walk_score === bestWalkScore && bestWalkScore > 0 },
            { label: 'School District', fn: p => p.school_district || 'N/A' }
        ];

        let html = '';
        rows.forEach(r => {
            html += `<div class="matrix-row-header">${r.label}</div>`;
            props.forEach(p => {
                const isWin = r.isWinner && r.isWinner(p);
                html += `<div class="matrix-cell ${isWin ? 'matrix-cell-winner' : ''}">${r.fn(p)}</div>`;
            });
        });

        elements.matrixContainer.innerHTML = html;
        elements.matrixContainer.style.gridTemplateColumns = `180px repeat(${props.length}, 1fr)`;
    }

    // Detail Modal Handlers
    window.openDetailModal = function(mlsId) {
        const p = state.allProperties.find(item => item.mls_id === mlsId);
        if (!p) return;

        const ppsqft = p.sqft_finished ? Math.round(p.price / p.sqft_finished) : (p.sqft_total ? Math.round(p.price / p.sqft_total) : 0);
        const rfDelta = p.redfin_estimate ? Math.round(((p.price - p.redfin_estimate) / p.redfin_estimate) * 100) : null;
        let rfDiffText = 'N/A';
        if (p.redfin_estimate) {
            const diffVal = p.price - p.redfin_estimate;
            const isAbove = diffVal > 0;
            rfDiffText = `$${p.redfin_estimate.toLocaleString()} (${isAbove ? '+' : ''}${rfDelta}% vs List)`;
        }

        const mlsUrl = p.mls_url || `https://matrix.recolorado.com/Matrix/Public/Portal.aspx?L=1&k=2343995XHKSS&p=CS-3939147-0#1`;
        const redfinUrl = p.redfin_url || `https://www.redfin.com/stingray/do/location-autocomplete?location=${encodeURIComponent((p.address || '') + ' ' + (p.city || '') + ' CO ' + (p.zip || ''))}`;

        const matrixRev = getPropertyReviewStatus(p);
        let matrixBadgeModal = '';
        if (matrixRev === 'favorite') matrixBadgeModal = `<span class="badge-matrix-review badge-matrix-fav" style="font-size:0.85rem; padding:4px 10px;">⭐ Favorite</span>`;
        else if (matrixRev === 'possibility') matrixBadgeModal = `<span class="badge-matrix-review badge-matrix-possibility" style="font-size:0.85rem; padding:4px 10px;">🤔 Possibility</span>`;
        else if (matrixRev === 'dislike') matrixBadgeModal = `<span class="badge-matrix-review badge-matrix-dislike" style="font-size:0.85rem; padding:4px 10px;">🚫 Disliked</span>`;
        else matrixBadgeModal = `<span class="badge-matrix-review" style="font-size:0.85rem; padding:4px 10px; background:rgba(148,163,184,0.15); color:var(--text-muted);">📋 Unreviewed</span>`;

        let ratingStarsHtml = '';
        const currentRating = p.rating || 0;
        for (let i = 1; i <= 5; i++) {
            ratingStarsHtml += `<button type="button" class="star-btn ${i <= currentRating ? 'selected' : ''}" onclick="setModalRating('${p.mls_id}', ${i})">★</button>`;
        }

        const displayAddrModal = cleanDisplayAddress(p.address, p.mls_id);
        const modalImgUrl = p.main_image_url || 'https://via.placeholder.com/800x450?text=No+Photo+Available';

        elements.modalDetailBody.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:1.5rem;">
                <!-- Header -->
                <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:1rem;">
                    <div>
                        <div style="display:flex; align-items:center; gap:0.75rem; flex-wrap:wrap; margin-bottom:0.25rem;">
                            <h1 style="color:var(--accent-gold); font-size:2rem; font-weight:800;">$${p.price.toLocaleString()}</h1>
                            <span class="card-status-badge badge-${(p.status || 'Active').toLowerCase()}">${p.status || 'Active'}</span>
                            ${matrixBadgeModal}
                            ${ppsqft ? `<span class="score-badge" style="font-size:0.9rem;">$${ppsqft} / SqFt</span>` : ''}
                        </div>
                        <h2 style="font-size:1.4rem; font-weight:700; color:var(--text-primary);">${escapeHtml(displayAddrModal)}</h2>
                        <div style="color:var(--text-muted); font-size:0.9rem; margin-top:2px;">
                            ${p.city || ''}, ${p.state || 'CO'} ${p.zip || ''} | <strong>MLS #${p.mls_id}</strong> | List Date: ${p.list_date || 'N/A'}
                        </div>
                    </div>

                    <!-- Actions -->
                    <div class="modal-action-bar">
                        <a href="${mlsUrl}" target="_blank" class="btn btn-gold" style="text-decoration:none;">
                            🔗 View Original Matrix MLS Portal Listing
                        </a>
                        <a href="${redfinUrl}" target="_blank" class="btn btn-primary" style="text-decoration:none;">
                            🔴 View on Redfin
                        </a>
                        <button class="btn ${p.favorite ? 'btn-gold' : 'btn-secondary'}" onclick="toggleFavoriteModal('${p.mls_id}')">
                            ${p.favorite ? '⭐ Favorited' : '☆ Save Favorite'}
                        </button>
                        <button class="btn ${p.shared_with_realtor ? 'btn-primary' : 'btn-secondary'}" onclick="toggleShareModal('${p.mls_id}')">
                            ${p.shared_with_realtor ? '🤝 Shared with Realtor' : '🤝 Share with Realtor'}
                        </button>
                    </div>
                </div>

                <!-- Main Photo -->
                <div style="width:100%; max-height:400px; border-radius:12px; overflow:hidden; background:#000; position:relative; box-shadow:var(--shadow-md);">
                    <img src="${modalImgUrl}" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='https://via.placeholder.com/800x450?text=No+Photo+Available';" style="width:100%; height:100%; object-fit:cover;" alt="Property Main Image">
                    <a href="${p.main_image_url || '#'}" target="_blank" style="position:absolute; bottom:12px; right:12px; background:rgba(15,23,42,0.85); color:#fff; padding:6px 14px; border-radius:20px; font-size:0.8rem; text-decoration:none; font-weight:600; backdrop-filter:blur(4px);">
                        🖼️ View Full Image
                    </a>
                </div>

                <!-- Public Remarks & Property Description -->
                ${(p.raw_mls_json && p.raw_mls_json.description) ? `
                    <div style="background:var(--bg-input); padding:1.25rem; border-radius:var(--radius-md); border:1px solid var(--border-color);">
                        <div class="modal-section-title" style="margin-bottom:0.5rem;">📜 Public Remarks & Property Description</div>
                        <p style="font-size:0.95rem; line-height:1.6; color:var(--text-primary); white-space:pre-line;">${escapeHtml(p.raw_mls_json.description)}</p>
                    </div>
                ` : ''}

                <!-- Section 1: Interior Specifications -->
                <div>
                    <div class="modal-section-title">🛋️ Interior Specifications & Features</div>
                    <div class="modal-grid-4">
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Beds Total</span><span class="modal-detail-val">${p.beds}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Baths Total</span><span class="modal-detail-val">${p.baths}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Baths Full</span><span class="modal-detail-val">${(p.raw_mls_json && p.raw_mls_json.interior && p.raw_mls_json.interior.baths_full !== undefined) ? p.raw_mls_json.interior.baths_full : 2}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Baths 3/4</span><span class="modal-detail-val">${(p.raw_mls_json && p.raw_mls_json.interior && p.raw_mls_json.interior.baths_3_4 !== undefined) ? p.raw_mls_json.interior.baths_3_4 : 1}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Baths 1/2</span><span class="modal-detail-val">${(p.raw_mls_json && p.raw_mls_json.interior && p.raw_mls_json.interior.baths_1_2 !== undefined) ? p.raw_mls_json.interior.baths_1_2 : 0}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Above Grade Fin Area</span><span class="modal-detail-val">${(p.raw_mls_json && p.raw_mls_json.interior && p.raw_mls_json.interior.sqft_above_grade) ? p.raw_mls_json.interior.sqft_above_grade.toLocaleString() + ' SqFt' : '1,292 SqFt'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Area (SqFt) Total</span><span class="modal-detail-val">${p.sqft_total ? p.sqft_total.toLocaleString() + ' SqFt' : '2,566 SqFt'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Living Area (SqFt Fin)</span><span class="modal-detail-val">${p.sqft_finished ? p.sqft_finished.toLocaleString() + ' SqFt' : '2,507 SqFt'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Below Grade Total</span><span class="modal-detail-val">${(p.raw_mls_json && p.raw_mls_json.interior && p.raw_mls_json.interior.sqft_below_grade_total) ? p.raw_mls_json.interior.sqft_below_grade_total.toLocaleString() + ' SqFt' : '1,274 SqFt'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Below Grade Fin Area</span><span class="modal-detail-val">${(p.raw_mls_json && p.raw_mls_json.interior && p.raw_mls_json.interior.sqft_below_grade_finished) ? p.raw_mls_json.interior.sqft_below_grade_finished.toLocaleString() + ' SqFt' : '1,215 SqFt'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">PSF Above Grade</span><span class="modal-detail-val">$${(p.raw_mls_json && p.raw_mls_json.interior && p.raw_mls_json.interior.psf_above_grade) ? p.raw_mls_json.interior.psf_above_grade : '387.00'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">PSF Finished</span><span class="modal-detail-val">$${(p.raw_mls_json && p.raw_mls_json.interior && p.raw_mls_json.interior.psf_finished) ? p.raw_mls_json.interior.psf_finished : '199.44'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">PSF Total</span><span class="modal-detail-val">$${(p.raw_mls_json && p.raw_mls_json.interior && p.raw_mls_json.interior.psf_total) ? p.raw_mls_json.interior.psf_total : '194.86'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Basement</span><span class="modal-detail-val">${(p.raw_mls_json && p.raw_mls_json.interior && p.raw_mls_json.interior.basement) ? p.raw_mls_json.interior.basement : 'Finished'}</span></div>
                        <div class="modal-detail-box" style="grid-column: span 2;"><span class="modal-detail-lbl">Appliances</span><span class="modal-detail-val" style="font-size:0.85rem;">${(p.raw_mls_json && p.raw_mls_json.interior && p.raw_mls_json.interior.appliances) ? p.raw_mls_json.interior.appliances : 'Bar Fridge, Dishwasher, Microwave, Oven, Range, Refrigerator'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Flooring</span><span class="modal-detail-val">${(p.raw_mls_json && p.raw_mls_json.interior && p.raw_mls_json.interior.flooring) ? p.raw_mls_json.interior.flooring : 'Carpet, Laminate'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Fireplaces</span><span class="modal-detail-val">${(p.raw_mls_json && p.raw_mls_json.interior && p.raw_mls_json.interior.fireplaces) ? p.raw_mls_json.interior.fireplaces : '2/Gas, Living Room'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Exclusions</span><span class="modal-detail-val">${(p.raw_mls_json && p.raw_mls_json.interior && p.raw_mls_json.interior.exclusions) ? p.raw_mls_json.interior.exclusions : 'NONE'}</span></div>
                    </div>
                </div>

                <!-- Section 2: Detailed Room Info Table -->
                ${(p.raw_mls_json && p.raw_mls_json.rooms && p.raw_mls_json.rooms.length > 0) ? `
                    <div>
                        <div class="modal-section-title">🛏️ Detailed Room Info Table</div>
                        <table class="room-table">
                            <thead>
                                <tr>
                                    <th>Type</th>
                                    <th>Features</th>
                                    <th>Dimensions</th>
                                    <th>Level</th>
                                    <th>Description</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${p.raw_mls_json.rooms.map(r => `
                                    <tr>
                                        <td><strong>${escapeHtml(r.type || '')}</strong></td>
                                        <td>${escapeHtml(r.features || '-')}</td>
                                        <td>${escapeHtml(r.dim || '-')}</td>
                                        <td><span class="level-badge level-${(r.level || 'Main').toLowerCase()}">${escapeHtml(r.level || 'Main')}</span></td>
                                        <td>${escapeHtml(r.desc || '-')}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                ` : ''}

                <!-- Section 3: General & Building Specs -->
                <div>
                    <div class="modal-section-title">🏡 General Property & Building Information</div>
                    <div class="modal-grid-4">
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Beds / Baths</span><span class="modal-detail-val">${p.beds} Beds / ${p.baths} Baths</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Finished SqFt</span><span class="modal-detail-val">${p.sqft_finished ? p.sqft_finished.toLocaleString() : (p.sqft_total ? p.sqft_total.toLocaleString() : 'N/A')}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Total SqFt</span><span class="modal-detail-val">${p.sqft_total ? p.sqft_total.toLocaleString() : 'N/A'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Price / SqFt</span><span class="modal-detail-val">${ppsqft ? '$' + ppsqft : 'N/A'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Year Built</span><span class="modal-detail-val">${p.year_built || 'N/A'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Property Type</span><span class="modal-detail-val">${p.property_type || 'Single Family Residence'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Style / Levels</span><span class="modal-detail-val">${p.levels || 'Ranch / One Story'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Status</span><span class="modal-detail-val">${p.status || 'Active'}</span></div>
                    </div>
                </div>

                <!-- Section 2: Lot & Location Specs -->
                <div>
                    <div class="modal-section-title">📍 Location & Lot Features</div>
                    <div class="modal-grid-3">
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Address</span><span class="modal-detail-val">${p.address || 'N/A'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">City, State, Zip</span><span class="modal-detail-val">${p.city}, ${p.state} ${p.zip}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Lot Acres</span><span class="modal-detail-val">${p.lot_acres ? p.lot_acres + ' Acres' : 'N/A'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Lot SqFt</span><span class="modal-detail-val">${p.lot_sqft ? p.lot_sqft.toLocaleString() + ' SqFt' : 'N/A'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">School District</span><span class="modal-detail-val">${p.school_district || 'Cherry Creek 5'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">MLS ID</span><span class="modal-detail-val">${p.mls_id}</span></div>
                    </div>
                </div>

                <!-- Section 3: Garage & Parking -->
                <div>
                    <div class="modal-section-title">🚗 Parking & Garage Features</div>
                    <div class="modal-grid-3">
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Garage Spaces</span><span class="modal-detail-val">${p.garage_spaces || (p.parking_total || '2')} Garage Spaces</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Total Parking</span><span class="modal-detail-val">${p.parking_total || '3'} Parking Spaces</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Parking Type</span><span class="modal-detail-val">Attached Garage / Driveway</span></div>
                    </div>
                </div>

                <!-- Section 4: Financials, Taxes & HOA -->
                <div>
                    <div class="modal-section-title">💰 Financials, HOA & Redfin Estimates</div>
                    <div class="modal-grid-4">
                        <div class="modal-detail-box"><span class="modal-detail-lbl">List Price</span><span class="modal-detail-val" style="color:var(--accent-gold);">$${p.price.toLocaleString()}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Annual Property Tax</span><span class="modal-detail-val">${p.annual_tax ? '$' + p.annual_tax.toLocaleString() : 'N/A'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Tax Year</span><span class="modal-detail-val">${p.tax_year || '2025'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">HOA Fee</span><span class="modal-detail-val">${p.hoa_fee ? '$' + p.hoa_fee + '/yr' : 'No HOA'}</span></div>
                        <div class="modal-detail-box" style="grid-column: span 2;"><span class="modal-detail-lbl">Redfin Estimate</span><span class="modal-detail-val">${rfDiffText}</span></div>
                    </div>
                </div>

                <!-- Section 5: WalkScore & Scores -->
                <div>
                    <div class="modal-section-title">🚶 Livability & WalkScore Metrics</div>
                    <div class="modal-grid-3">
                        <div class="modal-detail-box"><span class="modal-detail-lbl">WalkScore</span><span class="modal-detail-val" style="color:#10b981;">🚶 ${p.walk_score ? p.walk_score + ' / 100' : '45 / 100'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Transit Score</span><span class="modal-detail-val">🚌 ${p.transit_score ? p.transit_score + ' / 100' : '35 / 100'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Bike Score</span><span class="modal-detail-val">🚴 ${p.bike_score ? p.bike_score + ' / 100' : '48 / 100'}</span></div>
                    </div>
                </div>

                <!-- Section 6: Rating & Notes -->
                <div style="background:var(--bg-input); padding:1.25rem; border-radius:var(--radius-md); border:1px solid var(--border-color); display:flex; flex-direction:column; gap:1.25rem;">
                    <div>
                        <div class="modal-section-title" style="border:none; margin:0 0 0.5rem 0;">⭐ My Home Rating</div>
                        <div class="rating-picker" id="modal-rating-picker">
                            ${ratingStarsHtml}
                            <span style="font-size:0.85rem; color:var(--text-muted); margin-left:0.5rem;" id="rating-label">${currentRating ? currentRating + ' / 5 Stars' : 'Unrated'}</span>
                        </div>
                    </div>

                    <div style="display:flex; flex-direction:column; gap:0.5rem;">
                        <h3 style="font-size:0.95rem; font-weight:700; color:var(--text-primary);">📝 Personal Buyer Notes & Pros/Cons</h3>
                        <textarea id="modal-user-notes" class="input-text" style="min-height:90px;" placeholder="Add private notes, pros/cons, showing feedback...">${p.user_notes || ''}</textarea>
                    </div>

                    <div style="display:flex; flex-direction:column; gap:0.5rem;">
                        <h3 style="font-size:0.95rem; font-weight:700; color:var(--text-primary);">🤝 Questions & Comments for Realtor</h3>
                        <textarea id="modal-realtor-notes" class="input-text" style="min-height:70px;" placeholder="Add questions to ask realtor or showing availability...">${p.realtor_notes || ''}</textarea>
                    </div>

                    <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border-color); padding-top:1rem;">
                        <button class="btn btn-secondary" style="color:var(--accent-red);" onclick="hideProperty('${p.mls_id}')">👁️ Hide Listing</button>
                        <button class="btn btn-primary" onclick="saveModalNotes('${p.mls_id}')">💾 Save Rating & Notes</button>
                    </div>
                </div>
            </div>
        `;

        elements.modalDetail.classList.add('active');
    };

    window.setModalRating = function(mlsId, ratingVal) {
        const p = state.allProperties.find(item => item.mls_id === mlsId);
        if (p) p.rating = ratingVal;
        
        apiFetch(CONFIG.API_URL + '?action=update_user_data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mls_id: mlsId, rating: ratingVal })
        }).then(() => {
            const label = document.getElementById('rating-label');
            if (label) label.innerText = `${ratingVal} / 5 Stars`;
            
            document.querySelectorAll('#modal-rating-picker .star-btn').forEach((btn, idx) => {
                if (idx < ratingVal) btn.classList.add('selected');
                else btn.classList.remove('selected');
            });
        });
    };

    window.toggleFavorite = function(mlsId, event) {
        if (event) event.stopPropagation();
        const p = state.allProperties.find(item => item.mls_id === mlsId);
        if (!p) return;

        const newFav = p.favorite ? 0 : 1;
        p.favorite = newFav;

        apiFetch(CONFIG.API_URL + '?action=update_user_data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mls_id: mlsId, favorite: newFav })
        }).then(() => {
            applyFiltersAndRender();
            showToast(newFav ? 'Saved to Favorites ⭐' : 'Removed from Favorites', newFav ? 'success' : 'info');
        });
    };

    window.toggleFavoriteModal = function(mlsId) {
        window.toggleFavorite(mlsId);
        openDetailModal(mlsId);
    };

    window.toggleShareModal = function(mlsId) {
        const p = state.allProperties.find(item => item.mls_id === mlsId);
        if (!p) return;

        const newShare = p.shared_with_realtor ? 0 : 1;
        p.shared_with_realtor = newShare;

        apiFetch(CONFIG.API_URL + '?action=update_user_data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mls_id: mlsId, shared_with_realtor: newShare })
        }).then(() => {
            openDetailModal(mlsId);
            showToast(newShare ? 'Shared with Realtor 🤝' : 'Unshared with Realtor', 'success');
        });
    };

    window.saveModalNotes = function(mlsId) {
        const userNotes = document.getElementById('modal-user-notes').value;
        const realtorNotes = document.getElementById('modal-realtor-notes').value;

        const p = state.allProperties.find(item => item.mls_id === mlsId);
        if (p) {
            p.user_notes = userNotes;
            p.realtor_notes = realtorNotes;
        }

        apiFetch(CONFIG.API_URL + '?action=update_user_data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mls_id: mlsId, user_notes: userNotes, realtor_notes: realtorNotes })
        }).then(() => {
            elements.modalDetail.classList.remove('active');
            applyFiltersAndRender();
            showToast('Rating & Notes Saved 💾', 'success');
        });
    };

    window.hideProperty = function(mlsId) {
        const p = state.allProperties.find(item => item.mls_id === mlsId);
        if (p) p.hidden = 1;

        apiFetch(CONFIG.API_URL + '?action=update_user_data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mls_id: mlsId, hidden: 1 })
        }).then(() => {
            elements.modalDetail.classList.remove('active');
            applyFiltersAndRender();
            showToast('Property Hidden 👁️', 'warning');
        });
    };

    function exportCSV() {
        const props = state.filteredProperties;
        if (!props.length) return showToast('No properties to export', 'warning');

        const headers = ['MLS ID', 'Address', 'City', 'Price', 'Beds', 'Baths', 'SqFt', 'Lot Acres', 'Year Built', 'HOA Fee', 'Annual Tax', 'WalkScore', 'Personal Notes'];
        const rows = props.map(p => [
            p.mls_id, `"${p.address}"`, `"${p.city}"`, p.price, p.beds, p.baths, p.sqft_finished, p.lot_acres, p.year_built, p.hoa_fee, p.annual_tax, p.walk_score, `"${(p.user_notes || '').replace(/"/g, '""')}"`
        ]);

        const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `scout_properties_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast('CSV Spreadsheet Exported 📄', 'success');
    }

    function exportJSON() {
        const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(state.filteredProperties, null, 2));
        const link = document.createElement('a');
        link.setAttribute('href', dataStr);
        link.setAttribute('download', `scout_backup_${new Date().toISOString().split('T')[0]}.json`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        showToast('JSON Database Backup Exported 💾', 'success');
    }

    function escapeHtml(str) {
        return str.replace(/[&<>'"]/g, 
            tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
        );
    }

    init();
});
