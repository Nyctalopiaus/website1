/**
 * MLS & Redfin Property Scout - API Fetch Wrapper
 */
import { elements, state } from './state.js';

    export function apiFetch(url, options = {}) {
        options.credentials = 'include';
        if (!options.headers) options.headers = {};
        if (state.csrfToken && options.method && options.method.toUpperCase() === 'POST') {
            options.headers['X-CSRF-Token'] = state.csrfToken;
        }
        return fetch(url, options).then(async res => {
            if (res.status === 401 && !url.includes('action=check_auth') && !url.includes('action=login')) {
                if (state.authenticated) {
                    if (window.showLoginModal) window.showLoginModal('Session expired or unauthenticated. Please log in.');
                }
                throw new Error('Unauthenticated');
            }
            return res.json();
        });
    }

    export function fetchSavedFilters() {
        return apiFetch('backend/api.php?action=get_saved_filters');
    }

    export function saveFilterApi(filterPayload) {
        return apiFetch('backend/api.php?action=save_filter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(filterPayload)
        });
    }

    export function deleteFilterApi(filterId) {
        return apiFetch('backend/api.php?action=delete_filter', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: filterId })
        });
    }

    export function fetchUserPreferences() {
        return apiFetch('backend/api.php?action=get_preferences');
    }

    export function saveUserPreferences(prefs) {
        return apiFetch('backend/api.php?action=update_preferences', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(prefs)
        });
    }

    export async function syncUserPreferencesFromServer() {
        if (!state.authenticated) return;
        try {
            const res = await fetchUserPreferences();
            if (res && res.success && res.preferences) {
                const p = res.preferences;
                if (p.active_view && ['grid', 'map', 'table', 'matrix'].includes(p.active_view)) {
                    state.activeView = p.active_view;
                    localStorage.setItem('scout_active_view', p.active_view);
                    document.querySelectorAll('.view-btn').forEach(b => {
                        b.classList.toggle('active', b.dataset.view === p.active_view);
                    });
                }
                if (p.current_sort) {
                    state.currentSort = p.current_sort;
                    localStorage.setItem('scout_current_sort', p.current_sort);
                    if (elements.sortSelect) elements.sortSelect.value = p.current_sort;
                }
                if (Array.isArray(p.compare_list)) {
                    state.compareList = p.compare_list;
                    localStorage.setItem('scout_compare_list', JSON.stringify(p.compare_list));
                }
                if (p.active_filters) {
                    if (p.active_filters.status) {
                        state.filters.status = p.active_filters.status;
                        localStorage.setItem('scout_filter_status', p.active_filters.status);
                    }
                    if (p.active_filters.matrixStatus) {
                        state.filters.matrixStatus = p.active_filters.matrixStatus;
                        localStorage.setItem('scout_filter_matrix_status', p.active_filters.matrixStatus);
                    }
                }
            }
        } catch (e) {
            console.warn('Could not sync preferences from server, using local fallback:', e);
        }
    }

    export function savePreferencesToServer() {
        if (!state.authenticated) return;
        const payload = {
            active_view: state.activeView,
            current_sort: state.currentSort,
            compare_list: state.compareList,
            active_filters: {
                status: state.filters.status,
                matrixStatus: state.filters.matrixStatus
            }
        };
        saveUserPreferences(payload).catch(err => {
            console.warn('Failed to save preferences to server:', err);
        });
    }

