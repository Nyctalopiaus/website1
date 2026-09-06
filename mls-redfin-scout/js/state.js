/**
 * MLS & Redfin Property Scout - Shared State
 * CONFIG, the app's mutable state object, cached DOM element references, and the Leaflet
 * map's mutable refs (grouped under mapState since ES module bindings can't be reassigned
 * by importers - only their properties can be mutated). Every other module imports from here.
 */

    export const CONFIG = {
        API_URL: 'backend/api.php'
    };


    export let state = {
        allProperties: [],
        filteredProperties: [],
        activeView: 'grid',
        currentSort: 'date-desc',
        authenticated: false,
        user: null,
        csrfToken: '',
        compareList: [],
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


    export const mapState = {
        leafletMap: null,
        currentTileLayer: null,
        mapMarkers: [],
        markerMap: {}
    };

    // DOM Elements
    export const elements = {
        gridContainer: document.getElementById('view-grid-container'),
        mapContainer: document.getElementById('view-map-container'),
        mapCardsContainer: document.getElementById('map-cards-container'),
        mapElement: document.getElementById('map-element'),
        tableContainer: document.getElementById('view-table-container'),
        matrixContainer: document.getElementById('view-matrix-container'),
        sortSelect: document.getElementById('sort-select'),
        dragBookmarkletBtn: document.getElementById('drag-bookmarklet-btn'),
        modalDragBmBtn: document.getElementById('modal-drag-bm-btn'),
        modalDragDeepBmBtn: document.getElementById('modal-drag-deep-bm-btn'),
        
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
        btnExportHomeward: document.getElementById('btn-export-homeward'),
        btnExportModalHomeward: document.getElementById('btn-export-modal-homeward'),
        btnExportCsv: document.getElementById('btn-export-csv'),
        btnExportJson: document.getElementById('btn-export-json'),
        btnPrintPdf: document.getElementById('btn-print-pdf'),

        // Top Picks Recommendation Modal
        btnRecommend: document.getElementById('btn-recommend'),
        modalRecommend: document.getElementById('modal-recommend'),
        modalRecommendClose: document.getElementById('modal-recommend-close'),
        recommendSelectPanel: document.getElementById('recommend-select-panel'),
        recommendResultsPanel: document.getElementById('recommend-results-panel'),
        recommendPickList: document.getElementById('recommend-pick-list'),
        recommendSelectHint: document.getElementById('recommend-select-hint'),
        recommendResultsBody: document.getElementById('recommend-results-body'),
        btnRecommendSelectFavorites: document.getElementById('btn-recommend-select-favorites'),
        btnRecommendSelectPossibilities: document.getElementById('btn-recommend-select-possibilities'),
        btnRecommendSelectNone: document.getElementById('btn-recommend-select-none'),
        btnRecommendRank: document.getElementById('btn-recommend-rank'),
        btnRecommendBack: document.getElementById('btn-recommend-back'),
        btnRecommendCopy: document.getElementById('btn-recommend-copy'),

        modalLogin: document.getElementById('modal-login'),
        formLogin: document.getElementById('form-login'),
        loginUsername: document.getElementById('login-username'),
        loginPassword: document.getElementById('login-password'),
        loginError: document.getElementById('login-error'),
        btnSubmitLogin: document.getElementById('btn-submit-login'),
        userDisplayName: document.getElementById('user-display-name'),
        btnLogout: document.getElementById('btn-logout'),

        adminDropdown: document.getElementById('admin-dropdown'),
        btnAdminMenu: document.getElementById('btn-admin-menu'),
        adminDropdownMenu: document.getElementById('admin-dropdown-menu'),

        btnUserMgmt: document.getElementById('btn-user-mgmt'),
        modalUserMgmt: document.getElementById('modal-user-mgmt'),
        modalUserMgmtClose: document.getElementById('modal-user-mgmt-close'),
        formCreateUser: document.getElementById('form-create-user'),
        newUserUsername: document.getElementById('new-user-username'),
        newUserPassword: document.getElementById('new-user-password'),
        btnSubmitCreateUser: document.getElementById('btn-submit-create-user'),
        userMgmtTableBody: document.getElementById('user-mgmt-table-body'),

        btnViewLogs: document.getElementById('btn-view-logs'),
        modalEventLog: document.getElementById('modal-event-log'),
        modalEventLogClose: document.getElementById('modal-event-log-close'),
        eventLogSourceFilter: document.getElementById('event-log-source-filter'),
        btnRefreshEventLog: document.getElementById('btn-refresh-event-log'),
        eventLogTableBody: document.getElementById('event-log-table-body'),

        // Admin Property & Media Cleanup Modal
        btnAdminCleanup: document.getElementById('btn-admin-cleanup'),
        modalAdminCleanup: document.getElementById('modal-admin-cleanup'),
        modalAdminCleanupClose: document.getElementById('modal-admin-cleanup-close'),
        cleanupStatProps: document.getElementById('cleanup-stat-props'),
        cleanupStatPropsSub: document.getElementById('cleanup-stat-props-sub'),
        cleanupStatPhotos: document.getElementById('cleanup-stat-photos'),
        cleanupStatPhotosBytes: document.getElementById('cleanup-stat-photos-bytes'),
        cleanupStatOrphans: document.getElementById('cleanup-stat-orphans'),
        cleanupStatOrphansBytes: document.getElementById('cleanup-stat-orphans-bytes'),
        cleanupStatReclaimable: document.getElementById('cleanup-stat-reclaimable'),
        cleanupFilterStatus: document.getElementById('cleanup-filter-status'),
        cleanupModeSelect: document.getElementById('cleanup-mode-select'),
        cleanupProtectFavorites: document.getElementById('cleanup-protect-favorites'),
        btnCleanupSelectUnprotected: document.getElementById('btn-cleanup-select-unprotected'),
        btnCleanupClearSelection: document.getElementById('btn-cleanup-clear-selection'),
        btnCleanupRefresh: document.getElementById('btn-cleanup-refresh'),
        cleanupSelectAll: document.getElementById('cleanup-select-all'),
        cleanupPropertiesTbody: document.getElementById('cleanup-properties-tbody'),
        cleanupIncludeOrphans: document.getElementById('cleanup-include-orphans'),
        cleanupOrphanSummaryText: document.getElementById('cleanup-orphan-summary-text'),
        cleanupSelectionSummary: document.getElementById('cleanup-selection-summary'),
        btnAdminCleanupCancel: document.getElementById('btn-admin-cleanup-cancel'),
        btnAdminCleanupSubmit: document.getElementById('btn-admin-cleanup-submit')
    };
