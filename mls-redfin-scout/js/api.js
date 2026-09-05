/**
 * MLS & Redfin Property Scout - API Fetch Wrapper
 */
import { state } from './state.js';
import { showLoginModal } from './auth.js';


    export function apiFetch(url, options = {}) {
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
