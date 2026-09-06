/**
 * MLS & Redfin Property Scout - Main Dashboard Entry Point
 * Wires up the app: init() runs once on DOMContentLoaded, bindEvents() attaches every DOM
 * event listener. Split out of what used to be one 2155-line file - see js/*.js for the
 * feature modules (auth, filters, map, view renderers, etc.) this file wires together.
 */
import { state, elements, mapState, CONFIG } from './js/state.js';
import { initTheme, toggleTheme } from './js/theme.js';
import { showToast } from './js/toast.js';
import { setupBookmarkletLink } from './js/bookmarkletLink.js';
import {
    checkAuth, handleLoginSubmit, handleLogout, openUserMgmtModal, handleCreateUserSubmit,
    toggleAdminMenu, closeAdminMenu, openEventLogModal, fetchEventLogs,
    toggleUserMenu, closeUserMenu, toggleAgentHubMenu, closeAgentHubMenu,
    openUserProfileModal, closeUserProfileModal, handleUpdateProfileSubmit,
    openPasswordMgmtModal, closePasswordMgmtModal, handleSelfPasswordChangeSubmit
} from './js/auth.js';
import { fetchProperties } from './js/properties.js';
import {
    applyFiltersAndRender, resetFilters, setupFilterConsoleDrawer, loadPresetsList, populateClientFilterDropdown
} from './js/filters.js';
import { switchView, renderActiveView } from './js/views.js';
import {
    openCommandPalette, closeCommandPalette, handleCmdPaletteSearch
} from './js/commandPalette.js';
import { exportCSV, exportJSON, exportFavoritesToHomeward } from './js/export.js';
import {
    openRecommendModal, closeRecommendModal, selectRecommendFavorites, selectRecommendAddPossibilities,
    selectRecommendNone, rankRecommendSelection, backToRecommendSelection, copyRecommendResults
} from './js/recommend.js';
import { openCompareMatrix, closeCompareMatrix, clearCompare } from './js/compare.js';
import {
    openAdminCleanupModal, closeAdminCleanupModal, fetchAdminCleanupPreview,
    renderAdminCleanupTable, selectCandidateHomes, clearSelection, toggleSelectAll, markSelectedForImageRetry,
    handleAdminCleanupExecute, updateCleanupSelectionSummary
} from './js/adminCleanup.js';
import {
    openPlaylistsModal, closePlaylistsModal, handleCreatePlaylistSubmit
} from './js/collections.js';
import {
    openRealtorPortalModal, closeRealtorPortalModal, applyRealtorPortalFilters
} from './js/realtorPortalModal.js';
import {
    toggleNotificationDropdown, closeNotificationDropdown, markAllNotificationsAsRead
} from './js/notifications.js';
import { renderRealtorView } from './js/realtorView.js';
// detailModal.js has no named exports - it's imported purely so its window.openDetailModal /
// window.toggleFavorite / etc. side-effect assignments run (they're called from onclick="..."
// attributes in dynamically-rendered HTML, so they must exist on window before any card renders).
import './js/detailModal.js';

// Global JS error capture — posts to the same action=client_log endpoint the bookmarklet uses
// (backend/properties.php's handleClientLog / event_log table), so an error in the main app is
// something Josh can check later instead of only existing in a console that's since been closed.
// Unauthenticated on purpose, same trust model as the bookmarklet's own sync/scrape_status calls.
function reportClientError(message, context) {
    try {
        fetch(CONFIG.API_URL + '?action=client_log', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ source: 'client', level: 'error', message: String(message).slice(0, 2000), context })
        }).catch(() => {});
    } catch (e) {
        // logging must never break the app
    }
}

window.addEventListener('error', (event) => {
    reportClientError(event.message, {
        file: event.filename, line: event.lineno, col: event.colno,
        stack: event.error && event.error.stack, url: window.location.href
    });
});

window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    reportClientError('Unhandled promise rejection: ' + (reason && reason.message ? reason.message : String(reason)), {
        stack: reason && reason.stack, url: window.location.href
    });
});

document.addEventListener('DOMContentLoaded', () => {
    'use strict';

    // Initialize App
    function init() {
        try { initTheme(); } catch (e) { console.error('Theme init error:', e); }
        try { if (window.lucide) window.lucide.createIcons(); } catch (e) {}
        try { initSavedFilterPreferences(); } catch (e) { console.error('Filter prefs init error:', e); }
        try { bindEvents(); } catch (e) { console.error('Bind events error:', e); }
        try { setupFilterConsoleDrawer(); } catch (e) { console.error('Filter drawer setup error:', e); }
        try { setupBookmarkletLink(); } catch (e) { console.error('Bookmarklet link setup error:', e); }
        try { checkAuth(); } catch (e) { console.error('Auth check error:', e); }
    }


    function initSavedFilterPreferences() {
        // 1. Restore Active View (URL Hash > localStorage > Default 'grid')
        const hashView = window.location.hash.replace('#', '');
        const savedView = localStorage.getItem('scout_active_view');
        const isRealtorUser = state.currentUserProfile?.role === 'realtor' || state.currentUserProfile?.role === 'admin';
        const targetView = (hashView && ['grid', 'map', 'table', 'matrix', 'realtor', 'admin'].includes(hashView))
            ? hashView
            : (isRealtorUser ? 'realtor' : (savedView || 'grid'));

        state.activeView = targetView;
        document.querySelectorAll('.view-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.view === targetView);
        });

        // 2. Restore Current Sort
        const savedSort = localStorage.getItem('scout_current_sort');
        if (savedSort) {
            state.currentSort = savedSort;
            if (elements.sortSelect) elements.sortSelect.value = savedSort;
        }

        // 3. Restore Compare List
        try {
            const savedCompare = localStorage.getItem('scout_compare_list');
            if (savedCompare) {
                state.compareList = JSON.parse(savedCompare) || [];
            }
        } catch (e) {
            state.compareList = [];
        }

        // 4. Restore Filter Statuses
        const savedStatus = localStorage.getItem('scout_filter_status');
        if (savedStatus) state.filters.status = savedStatus;
        const savedMatrixStatus = localStorage.getItem('scout_filter_matrix_status');
        if (savedMatrixStatus) state.filters.matrixStatus = savedMatrixStatus;
    }

    // Theme Switcher & Toast System

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
                closeRealtorPortalModal();
                document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
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
        if (elements.filterClientSelect) {
            elements.filterClientSelect.addEventListener('change', e => {
                state.filters.selectedClientId = e.target.value;
                loadPresetsList();
                applyFiltersAndRender();
                const text = e.target.options[e.target.selectedIndex]?.text || '';
                showToast(`Filtering presets & view for ${text}`, 'info');
            });
        }
        
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
                btnMoreFilters.innerText = isHidden ? 'Less Specs ▴' : 'More Specs ▾';
            });
        }

        // Sorting & Views
        if (elements.sortSelect) elements.sortSelect.addEventListener('change', e => {
            state.currentSort = e.target.value;
            localStorage.setItem('scout_current_sort', e.target.value);
            applyFiltersAndRender();
        });

        document.querySelectorAll('.view-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                switchView(btn.dataset.view);
            });
        });

        window.addEventListener('hashchange', () => {
            const hash = window.location.hash.replace('#', '').toLowerCase();
            if (['grid', 'map', 'table', 'matrix'].includes(hash) && hash !== state.activeView) {
                switchView(hash);
            }
        });

        // Modals
        if (elements.btnBookmarkletGuide) elements.btnBookmarkletGuide.addEventListener('click', () => elements.modalBookmarklet.classList.add('active'));
        if (elements.modalBmClose) elements.modalBmClose.addEventListener('click', () => elements.modalBookmarklet.classList.remove('active'));

        document.getElementById('btn-copy-deep-console-code')?.addEventListener('click', () => {
            const apiUrl = window.location.href.replace(/\/index\.html.*$/, '') + '/backend/api.php';
            const code = typeof getDeepScrapeConsoleSnippetCode === 'function' ? getDeepScrapeConsoleSnippetCode(apiUrl, state.user) : '';
            if (code) {
                navigator.clipboard.writeText(code).then(() => {
                    alert('Deep Scrape F12 console snippet copied to clipboard!\n\nTo run:\n1. Open one listing in Matrix into full detail view.\n2. Press F12 (or right-click -> Inspect -> Console).\n3. Paste this code and press Enter!');
                });
            }
        });

        if (elements.btnExportModal) elements.btnExportModal.addEventListener('click', () => elements.modalExport.classList.add('active'));
        if (elements.modalExportClose) elements.modalExportClose.addEventListener('click', () => elements.modalExport.classList.remove('active'));
        if (elements.btnExportHomeward) elements.btnExportHomeward.addEventListener('click', exportFavoritesToHomeward);
        if (elements.btnExportModalHomeward) elements.btnExportModalHomeward.addEventListener('click', () => {
            elements.modalExport.classList.remove('active');
            exportFavoritesToHomeward();
        });

        // Top Picks Recommendation Modal
        if (elements.btnRecommend) elements.btnRecommend.addEventListener('click', openRecommendModal);
        if (elements.modalRecommendClose) elements.modalRecommendClose.addEventListener('click', closeRecommendModal);
        if (elements.btnRecommendSelectFavorites) elements.btnRecommendSelectFavorites.addEventListener('click', selectRecommendFavorites);
        if (elements.btnRecommendSelectPossibilities) elements.btnRecommendSelectPossibilities.addEventListener('click', selectRecommendAddPossibilities);
        if (elements.btnRecommendSelectNone) elements.btnRecommendSelectNone.addEventListener('click', selectRecommendNone);
        if (elements.btnRecommendRank) elements.btnRecommendRank.addEventListener('click', rankRecommendSelection);
        if (elements.btnRecommendBack) elements.btnRecommendBack.addEventListener('click', backToRecommendSelection);
        if (elements.btnRecommendCopy) elements.btnRecommendCopy.addEventListener('click', copyRecommendResults);

        if (elements.modalDetailClose) elements.modalDetailClose.addEventListener('click', () => elements.modalDetail.classList.remove('active'));

        document.getElementById('btn-hide-banner')?.addEventListener('click', () => {
            const banner = document.querySelector('.bookmarklet-banner');
            if (banner) banner.style.display = 'none';
        });

        // User Dropdown Menu & Account Modals
        if (elements.btnUserMenu) {
            elements.btnUserMenu.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleUserMenu();
            });
        }
        document.addEventListener('click', (e) => {
            const container = document.getElementById('user-dropdown-container');
            if (container && !container.contains(e.target)) {
                closeUserMenu();
            }
            if (elements.adminDropdown && !elements.adminDropdown.contains(e.target)) {
                closeAdminMenu();
            }
            const agentHubContainer = document.getElementById('agent-hub-container');
            if (agentHubContainer && !agentHubContainer.contains(e.target)) {
                closeAgentHubMenu();
            }
            const notifContainer = document.getElementById('notification-container');
            if (notifContainer && !notifContainer.contains(e.target)) {
                closeNotificationDropdown();
            }
        });

        // Agent Hub Dropdown Menu
        document.getElementById('btn-agent-hub-menu')?.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleAgentHubMenu();
        });

        // Notifications Center
        document.getElementById('btn-notifications')?.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleNotificationDropdown();
        });
        document.getElementById('btn-mark-all-notifications')?.addEventListener('click', markAllNotificationsAsRead);

        // User Profile Modal & Actions
        if (elements.btnUserProfile) elements.btnUserProfile.addEventListener('click', openUserProfileModal);
        if (elements.modalUserProfileClose) elements.modalUserProfileClose.addEventListener('click', closeUserProfileModal);
        if (elements.btnCancelUserProfile) elements.btnCancelUserProfile.addEventListener('click', closeUserProfileModal);
        if (elements.formUserProfile) elements.formUserProfile.addEventListener('submit', handleUpdateProfileSubmit);

        // Password Management Modal & Actions
        if (elements.btnUserPassword) elements.btnUserPassword.addEventListener('click', openPasswordMgmtModal);
        if (elements.modalPasswordMgmtClose) elements.modalPasswordMgmtClose.addEventListener('click', closePasswordMgmtModal);
        if (elements.btnCancelPasswordMgmt) elements.btnCancelPasswordMgmt.addEventListener('click', closePasswordMgmtModal);
        if (elements.formPasswordMgmt) elements.formPasswordMgmt.addEventListener('submit', handleSelfPasswordChangeSubmit);

        // Curated Client Playlists & Collections Modal
        if (elements.btnPlaylists) elements.btnPlaylists.addEventListener('click', () => {
            closeAgentHubMenu();
            openPlaylistsModal();
        });
        if (elements.modalPlaylistsClose) elements.modalPlaylistsClose.addEventListener('click', closePlaylistsModal);
        if (elements.formCreatePlaylist) elements.formCreatePlaylist.addEventListener('submit', handleCreatePlaylistSubmit);

        // Realtor Collaboration Portal Modal
        if (elements.btnRealtorPortal) elements.btnRealtorPortal.addEventListener('click', () => {
            closeAgentHubMenu();
            openRealtorPortalModal();
        });
        document.getElementById('modal-realtor-portal-close')?.addEventListener('click', closeRealtorPortalModal);
        document.getElementById('rp-search')?.addEventListener('input', applyRealtorPortalFilters);
        document.getElementById('rp-mls-status')?.addEventListener('change', applyRealtorPortalFilters);
        document.getElementById('rp-client-select')?.addEventListener('change', applyRealtorPortalFilters);
        document.getElementById('rp-review-status')?.addEventListener('change', applyRealtorPortalFilters);
        document.getElementById('rp-sort')?.addEventListener('change', applyRealtorPortalFilters);

        // Universal Backdrop Click Listener to close any modal when clicking dark overlay background
        document.querySelectorAll('.modal-overlay').forEach(overlay => {
            overlay.addEventListener('click', (e) => {
                if (e.target === overlay) {
                    overlay.classList.remove('active');
                    if (overlay.id === 'modal-realtor-portal') {
                        closeRealtorPortalModal();
                    }
                }
            });
        });

        // Admin Dropdown
        if (elements.btnAdminMenu) {
            elements.btnAdminMenu.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleAdminMenu();
            });
        }

        // User Management Modal & Actions
        if (elements.btnUserMgmt) elements.btnUserMgmt.addEventListener('click', openUserMgmtModal);
        if (elements.modalUserMgmtClose) elements.modalUserMgmtClose.addEventListener('click', () => elements.modalUserMgmt.classList.remove('active'));
        if (elements.formCreateUser) elements.formCreateUser.addEventListener('submit', handleCreateUserSubmit);

        // Event Log Modal & Actions
        if (elements.btnViewLogs) elements.btnViewLogs.addEventListener('click', openEventLogModal);
        if (elements.modalEventLogClose) elements.modalEventLogClose.addEventListener('click', () => elements.modalEventLog.classList.remove('active'));
        if (elements.btnRefreshEventLog) elements.btnRefreshEventLog.addEventListener('click', fetchEventLogs);
        if (elements.eventLogSourceFilter) elements.eventLogSourceFilter.addEventListener('change', fetchEventLogs);

        // Admin Property & Media Cleanup Modal & Actions
        if (elements.btnAdminCleanup) elements.btnAdminCleanup.addEventListener('click', openAdminCleanupModal);
        if (elements.modalAdminCleanupClose) elements.modalAdminCleanupClose.addEventListener('click', closeAdminCleanupModal);
        if (elements.btnAdminCleanupCancel) elements.btnAdminCleanupCancel.addEventListener('click', closeAdminCleanupModal);
        if (elements.btnCleanupRefresh) elements.btnCleanupRefresh.addEventListener('click', fetchAdminCleanupPreview);
        if (elements.cleanupFilterStatus) elements.cleanupFilterStatus.addEventListener('change', renderAdminCleanupTable);
        if (elements.cleanupModeSelect) elements.cleanupModeSelect.addEventListener('change', updateCleanupSelectionSummary);
        if (elements.cleanupProtectFavorites) elements.cleanupProtectFavorites.addEventListener('change', renderAdminCleanupTable);
        if (elements.btnCleanupSelectUnprotected) elements.btnCleanupSelectUnprotected.addEventListener('click', selectCandidateHomes);
        if (elements.btnCleanupClearSelection) elements.btnCleanupClearSelection.addEventListener('click', clearSelection);
        if (elements.btnCleanupRetryImages) elements.btnCleanupRetryImages.addEventListener('click', markSelectedForImageRetry);
        if (elements.cleanupSelectAll) elements.cleanupSelectAll.addEventListener('change', toggleSelectAll);
        if (elements.cleanupIncludeOrphans) elements.cleanupIncludeOrphans.addEventListener('change', updateCleanupSelectionSummary);
        if (elements.btnAdminCleanupSubmit) elements.btnAdminCleanupSubmit.addEventListener('click', handleAdminCleanupExecute);

        // Export Actions
        elements.btnExportCsv.addEventListener('click', exportCSV);
        elements.btnExportJson.addEventListener('click', exportJSON);
        elements.btnPrintPdf.addEventListener('click', () => window.print());

        // Side-by-Side Property Comparison Matrix & Dock
        document.getElementById('btn-open-compare-matrix')?.addEventListener('click', openCompareMatrix);
        document.getElementById('btn-close-compare-matrix')?.addEventListener('click', closeCompareMatrix);
        document.getElementById('btn-clear-compare')?.addEventListener('click', clearCompare);
    }


    init();
});
