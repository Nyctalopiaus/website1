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
    toggleAdminMenu, closeAdminMenu, openEventLogModal, fetchEventLogs
} from './js/auth.js';
import { fetchProperties } from './js/properties.js';
import {
    applyFiltersAndRender, resetFilters, setupFilterConsoleDrawer
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
                if (state.activeView === 'map' && mapState.leafletMap) {
                    mapState.leafletMap._userHasInteracted = false;
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

        document.getElementById('btn-copy-deep-bm-code')?.addEventListener('click', () => {
            const apiUrl = window.location.href.replace(/\/index\.html.*$/, '') + '/backend/api.php';
            const code = typeof getDeepScrapeBookmarkletCode === 'function' ? getDeepScrapeBookmarkletCode(apiUrl) : '';
            if (code) {
                navigator.clipboard.writeText(code).then(() => {
                    alert('📋 Deep Scrape bookmarklet code copied to clipboard!\n\nTo install:\n1. Create a new bookmark in your browser.\n2. Paste this copied code into the bookmark URL field.');
                });
            }
        });

        document.getElementById('btn-copy-deep-console-code')?.addEventListener('click', () => {
            const apiUrl = window.location.href.replace(/\/index\.html.*$/, '') + '/backend/api.php';
            const code = typeof getDeepScrapeConsoleSnippetCode === 'function' ? getDeepScrapeConsoleSnippetCode(apiUrl) : '';
            if (code) {
                navigator.clipboard.writeText(code).then(() => {
                    alert('💻 Deep Scrape F12 console snippet copied to clipboard!\n\nTo run:\n1. Open one listing in Matrix into full detail view.\n2. Press F12 (or right-click -> Inspect -> Console).\n3. Paste this code and press Enter!');
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

        // Admin Dropdown (houses User Management, View Logs, and future admin actions)
        if (elements.btnAdminMenu) {
            elements.btnAdminMenu.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleAdminMenu();
            });
        }
        document.addEventListener('click', (e) => {
            if (elements.adminDropdown && !elements.adminDropdown.contains(e.target)) {
                closeAdminMenu();
            }
        });

        // User Management Modal & Actions
        if (elements.btnUserMgmt) elements.btnUserMgmt.addEventListener('click', openUserMgmtModal);
        if (elements.modalUserMgmtClose) elements.modalUserMgmtClose.addEventListener('click', () => elements.modalUserMgmt.classList.remove('active'));
        if (elements.formCreateUser) elements.formCreateUser.addEventListener('submit', handleCreateUserSubmit);

        // Event Log Modal & Actions
        if (elements.btnViewLogs) elements.btnViewLogs.addEventListener('click', openEventLogModal);
        if (elements.modalEventLogClose) elements.modalEventLogClose.addEventListener('click', () => elements.modalEventLog.classList.remove('active'));
        if (elements.btnRefreshEventLog) elements.btnRefreshEventLog.addEventListener('click', fetchEventLogs);
        if (elements.eventLogSourceFilter) elements.eventLogSourceFilter.addEventListener('change', fetchEventLogs);

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
