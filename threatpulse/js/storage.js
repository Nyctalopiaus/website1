/**
 * ThreatPulse — Storage Manager & Application State Schema
 */
(function(window) {
  'use strict';

  const Storage = {
    getReadItems: () => new Set(JSON.parse(localStorage.getItem('tp_read_items') || '[]')),
    saveReadItems: (set) => localStorage.setItem('tp_read_items', JSON.stringify(Array.from(set))),
    
    getBookmarkedItems: () => new Set(JSON.parse(localStorage.getItem('tp_bookmarked_items') || '[]')),
    saveBookmarkedItems: (set) => localStorage.setItem('tp_bookmarked_items', JSON.stringify(Array.from(set))),

    getActiveCategory: () => 'all',
    setActiveCategory: (cat) => localStorage.setItem('tp_active_category', 'all'),

    getTriageFilter: () => localStorage.getItem('tp_triage_filter') || 'all',
    setTriageFilter: (filter) => localStorage.setItem('tp_triage_filter', filter),

    getMetricsCollapsed: () => localStorage.getItem('tp_metrics_collapsed') === 'true',
    setMetricsCollapsed: (collapsed) => localStorage.setItem('tp_metrics_collapsed', collapsed ? 'true' : 'false'),

    getViewScope: () => localStorage.getItem('tp_view_scope') || 'briefing',
    setViewScope: (scope) => localStorage.setItem('tp_view_scope', scope),

    getSortMode: () => localStorage.getItem('tp_sort_mode') || 'recency',
    setSortMode: (mode) => localStorage.setItem('tp_sort_mode', mode),

    getSelectedTags: () => new Set(JSON.parse(localStorage.getItem('tp_selected_tags') || '[]')),
    saveSelectedTags: (set) => localStorage.setItem('tp_selected_tags', JSON.stringify(Array.from(set))),

    getTagsCollapsed: () => localStorage.getItem('tp_tags_collapsed') !== 'false',
    setTagsCollapsed: (collapsed) => localStorage.setItem('tp_tags_collapsed', collapsed ? 'true' : 'false'),

    getSummaryCollapsed: () => localStorage.getItem('tp_summary_collapsed') !== 'false',
    setSummaryCollapsed: (collapsed) => localStorage.setItem('tp_summary_collapsed', collapsed ? 'true' : 'false'),

    getVisibleColumns: () => {
      const stored = localStorage.getItem('tp_visible_columns');
      if (!stored) return new Set(['active_threats', 'security_advisories', 'informational']);
      try {
        const arr = JSON.parse(stored);
        return new Set(arr.length > 0 ? arr : ['active_threats', 'security_advisories', 'informational']);
      } catch (e) {
        return new Set(['active_threats', 'security_advisories', 'informational']);
      }
    },
    saveVisibleColumns: (set) => localStorage.setItem('tp_visible_columns', JSON.stringify(Array.from(set))),

    // Saved Views: named filter presets (tags + match mode + search + sort). Stored as a plain
    // array of {id, name, tags, tagMatchMode, searchQuery, sortMode, createdAt}. Consistent with
    // every other Storage entry here: pure localStorage, nothing sent to a server, so the
    // "100% stateless & private" claim in the Quick Start modal stays true for this too.
    getSavedViews: () => {
      try {
        const stored = JSON.parse(localStorage.getItem('tp_saved_views') || '[]');
        return Array.isArray(stored) ? stored : [];
      } catch (e) {
        return [];
      }
    },
    saveSavedViews: (views) => localStorage.setItem('tp_saved_views', JSON.stringify(views)),

    // IOC Watch panel preferences (Phase 3). "Show low confidence" defaults OFF -- the whole
    // point of the confidence model is a curated High+Medium default view, not a raw firehose.
    getIocShowLow: () => localStorage.getItem('tp_ioc_show_low') === 'true',
    setIocShowLow: (show) => localStorage.setItem('tp_ioc_show_low', show ? 'true' : 'false'),

    getIocFilterGreyNoise: () => localStorage.getItem('tp_ioc_filter_greynoise') === 'true',
    setIocFilterGreyNoise: (val) => localStorage.setItem('tp_ioc_filter_greynoise', val ? 'true' : 'false'),

    getIocTypeFilter: () => localStorage.getItem('tp_ioc_type_filter') || 'all',
    setIocTypeFilter: (type) => localStorage.setItem('tp_ioc_type_filter', type),

    getIocSortColumn: () => localStorage.getItem('tp_ioc_sort_col') || 'confidence_score',
    setIocSortColumn: (col) => localStorage.setItem('tp_ioc_sort_col', col),

    getIocSortOrder: () => localStorage.getItem('tp_ioc_sort_order') || 'desc',
    setIocSortOrder: (order) => localStorage.setItem('tp_ioc_sort_order', order),

    // Homelab/engineering feeds (Tailscale, Pi-hole, Jeff Geerling, etc. -- config.json's
    // per-feed "engineering_homelab" flag) are general engineering/hobby content, not core
    // threat intel. Defaults OFF so the main stream stays signal-focused; a person can opt back
    // in per-browser. Individual feeds stay filterable as always via the Feeds & Sources tag
    // checkboxes -- this is a separate, coarser on/off switch for the whole homelab bucket.
    getShowLabContent: () => localStorage.getItem('tp_show_lab_content') === 'true',
    setShowLabContent: (show) => localStorage.setItem('tp_show_lab_content', show ? 'true' : 'false'),

    clearAll: () => {
      localStorage.removeItem('tp_read_items');
      localStorage.removeItem('tp_bookmarked_items');
      localStorage.removeItem('tp_preferred_view');
      localStorage.removeItem('tp_active_category');
      localStorage.removeItem('tp_triage_filter');
      localStorage.removeItem('tp_metrics_collapsed');
      localStorage.removeItem('tp_view_scope');
      localStorage.removeItem('tp_sort_mode');
      localStorage.removeItem('tp_selected_tags');
      localStorage.removeItem('tp_tags_collapsed');
      localStorage.removeItem('tp_summary_collapsed');
      localStorage.removeItem('tp_visible_columns');
      localStorage.removeItem('tp_saved_views');
      localStorage.removeItem('tp_ioc_show_low');
      localStorage.removeItem('tp_ioc_filter_greynoise');
      localStorage.removeItem('tp_ioc_type_filter');
      localStorage.removeItem('tp_ioc_sort_col');
      localStorage.removeItem('tp_ioc_sort_order');
      localStorage.removeItem('tp_show_lab_content');
    }
  };

  const State = {
    rawData: null,
    allItems: [],
    filteredItems: [],
    // IOC Watch (Phase 3): loaded separately from data/iocs.json, never merged into
    // allItems/filteredItems -- a deliberately distinct data model and view, not part of the
    // news kanban's tag taxonomy or severity/urgency system.
    allIocs: [],
    iocRawData: null,
    iocShowLow: Storage.getIocShowLow(),
    iocFilterGreyNoise: Storage.getIocFilterGreyNoise(),
    iocTypeFilter: Storage.getIocTypeFilter(),
    iocSortColumn: Storage.getIocSortColumn(),
    iocSortOrder: Storage.getIocSortOrder(),
    readItems: Storage.getReadItems(),
    bookmarkedItems: Storage.getBookmarkedItems(),
    selectedTags: Storage.getSelectedTags(),
    visibleColumns: Storage.getVisibleColumns(),
    savedViews: Storage.getSavedViews(),
    tagsCollapsed: Storage.getTagsCollapsed(),
    showLabContent: Storage.getShowLabContent(),
    summaryCollapsed: Storage.getSummaryCollapsed(),
    tagMatchMode: 'OR',
    preferredView: 'kanban',
    viewScope: Storage.getViewScope(),
    sortMode: Storage.getSortMode(),
    activeCategory: Storage.getActiveCategory(),
    triageFilter: Storage.getTriageFilter(),
    metricsCollapsed: Storage.getMetricsCollapsed(),
    columnLimits: {
      active_threats: 8,
      security_advisories: 8,
      informational: 8
    },
    searchQuery: '',
    isLoading: true,
    isBackgroundRefreshing: false,
    debounceTimer: null,
    refreshInterval: null
  };

  window.TPStorage = Storage;
  window.TPState = State;
})(window);
