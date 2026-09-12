import { apiFetch } from './api.js';
import { elements, state } from './state.js';

export function setupBookmarkletLink() {
    let targetUsernameOverride = null;
    let scrapeToken = null;
    let isScrapeTokenReady = false;
    const getCurrentUsername = () => state.currentUserProfile?.username || state.user || null;

    const getApiUrl = () => {
        let base = window.location.origin + window.location.pathname.replace(/\/index\.html$/, '').replace(/\/$/, '');
        return base + '/backend/api.php';
    };

    const setBookmarkletReadyState = (ready) => {
        const links = [elements.dragBookmarkletBtn, elements.modalDragBmBtn, elements.modalDragDeepBmBtn].filter(Boolean);
        links.forEach(link => {
            link.setAttribute('aria-disabled', ready ? 'false' : 'true');
            link.style.pointerEvents = ready ? '' : 'none';
            link.style.opacity = ready ? '' : '0.55';
            link.title = ready ? '' : 'Generating protected bookmarklet...';
            if (!ready) link.setAttribute('href', 'javascript:void(0)');
        });
        [document.getElementById('btn-copy-bm-code'), document.getElementById('btn-copy-console-code')].filter(Boolean).forEach(button => {
            button.disabled = !ready;
            button.title = ready ? '' : 'Generating protected bookmarklet...';
        });
    };

    const updateHrefs = () => {
        if (!isScrapeTokenReady || !scrapeToken) {
            setBookmarkletReadyState(false);
            return;
        }
        const apiUrl = getApiUrl();
        const targetUsername = targetUsernameOverride || getCurrentUsername();
        if (typeof getBookmarkletCode === 'function') {
            const code = getBookmarkletCode(apiUrl, targetUsername, scrapeToken);
            if (elements.dragBookmarkletBtn) elements.dragBookmarkletBtn.setAttribute('href', code);
            if (elements.modalDragBmBtn) elements.modalDragBmBtn.setAttribute('href', code);
        }
        if (typeof getDeepScrapeBookmarkletCode === 'function') {
            const deepCode = getDeepScrapeBookmarkletCode(apiUrl, targetUsername, scrapeToken);
            if (elements.modalDragDeepBmBtn) elements.modalDragDeepBmBtn.setAttribute('href', deepCode);
        }
        setBookmarkletReadyState(true);
    };

    updateHrefs();

    const refreshScrapeToken = async () => {
        if (!getCurrentUsername()) return false;
        isScrapeTokenReady = false;
        updateHrefs();
        try {
            const res = await apiFetch('backend/api.php?action=create_scrape_token', { method: 'POST' });
            if (!res?.success || !res.token) throw new Error(res?.error || 'Token request failed');
            scrapeToken = res.token;
            isScrapeTokenReady = true;
            updateHrefs();
            return true;
        } catch (e) {
            scrapeToken = null;
            console.warn('Failed to create scrape token:', e);
            if (window.showToast) window.showToast('Could not generate a protected bookmarklet. Try opening setup again.', 'error');
            return false;
        }
    };

    // Re-sync on hover or drag start
    const targets = [elements.dragBookmarkletBtn, elements.modalDragBmBtn, elements.modalDragDeepBmBtn].filter(Boolean);
    targets.forEach(btn => {
        ['mouseenter', 'focus', 'mousedown', 'dragstart'].forEach(evt => {
            btn.addEventListener(evt, updateHrefs);
        });
    });

    const targetUserContainer = document.getElementById('bm-target-user-container');
    const targetUserSelect = document.getElementById('bm-target-user-select');

    const loadTargetUsers = async () => {
        const profile = state.currentUserProfile;
        const username = getCurrentUsername();
        if (!username) return;
        const role = profile?.role || (profile?.is_admin ? 'admin' : 'client');
        const isPrimaryAdmin = username === 'admin';
        
        if (isPrimaryAdmin || role === 'admin' || role === 'realtor') {
            try {
                const res = await apiFetch('backend/api.php?action=list_users');
                if (res.success && Array.isArray(res.users) && res.users.length > 0) {
                    if (targetUserContainer) targetUserContainer.style.display = 'block';
                    if (targetUserSelect) {
                        targetUserSelect.innerHTML = res.users.map(u => {
                            const nameStr = u.full_name ? `${u.username} (${u.full_name})` : u.username;
                            const isDefault = u.username === 'jhankins' || u.username === username;
                            return `<option value="${u.username}" ${isDefault ? 'selected' : ''}>${nameStr}</option>`;
                        }).join('');

                        targetUsernameOverride = targetUserSelect.value;
                        updateHrefs();

                        targetUserSelect.onchange = (e) => {
                            targetUsernameOverride = e.target.value;
                            updateHrefs();
                        };
                    }
                }
            } catch (e) {
                console.warn('Failed to load user list for bookmarklet targeting:', e);
            }
        } else {
            if (targetUserContainer) targetUserContainer.style.display = 'none';
            targetUsernameOverride = username;
            updateHrefs();
        }
    };

    if (elements.dragBookmarkletBtn) {
        elements.dragBookmarkletBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            await refreshScrapeToken();
            await loadTargetUsers();
            elements.modalBookmarklet?.classList.add('active');
        });
    }

    if (elements.btnBookmarkletGuide) {
        elements.btnBookmarkletGuide.addEventListener('click', async () => {
            await refreshScrapeToken();
            await loadTargetUsers();
        });
    }

    const copyBmBtn = document.getElementById('btn-copy-bm-code');
    if (copyBmBtn) {
        copyBmBtn.addEventListener('click', () => {
            if (!isScrapeTokenReady || !scrapeToken) {
                if (window.showToast) window.showToast('Bookmarklet setup is still generating. Please wait.', 'warning');
                return;
            }
            const apiUrl = getApiUrl();
            const targetUsername = targetUsernameOverride || getCurrentUsername();
            if (typeof getBookmarkletCode === 'function') {
                const code = getBookmarkletCode(apiUrl, targetUsername, scrapeToken);
                navigator.clipboard.writeText(code).then(() => {
                    if (window.showToast) window.showToast(`Copied bookmarklet code for ${targetUsername || 'default account'}!`, 'success');
                });
            }
        });
    }

    const copyConsoleBtn = document.getElementById('btn-copy-console-code');
    if (copyConsoleBtn) {
        copyConsoleBtn.addEventListener('click', () => {
            if (!isScrapeTokenReady || !scrapeToken) {
                if (window.showToast) window.showToast('Bookmarklet setup is still generating. Please wait.', 'warning');
                return;
            }
            const apiUrl = getApiUrl();
            const targetUsername = targetUsernameOverride || getCurrentUsername();
            if (typeof getConsoleSnippetCode === 'function') {
                const code = getConsoleSnippetCode(apiUrl, targetUsername, scrapeToken);
                navigator.clipboard.writeText(code).then(() => {
                    if (window.showToast) window.showToast(`Copied console snippet for ${targetUsername || 'default account'}!`, 'success');
                });
            }
        });
    }
}
