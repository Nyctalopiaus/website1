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

    clearAll: () => {
      localStorage.removeItem('tp_read_items');
      localStorage.removeItem('tp_bookmarked_items');
      localStorage.removeItem('tp_preferred_view');
      localStorage.removeItem('tp_active_category');
      localStorage.removeItem('tp_triage_filter');
      localStorage.removeItem('tp_metrics_collapsed');
      localStorage.removeItem('tp_view_scope');
      localStorage.removeItem('tp_selected_tags');
      localStorage.removeItem('tp_tags_collapsed');
      localStorage.removeItem('tp_summary_collapsed');
      localStorage.removeItem('tp_visible_columns');
    }
  };

  const State = {
    rawData: null,
    allItems: [],
    filteredItems: [],
    readItems: Storage.getReadItems(),
    bookmarkedItems: Storage.getBookmarkedItems(),
    selectedTags: Storage.getSelectedTags(),
    visibleColumns: Storage.getVisibleColumns(),
    tagsCollapsed: Storage.getTagsCollapsed(),
    summaryCollapsed: Storage.getSummaryCollapsed(),
    tagMatchMode: 'OR',
    preferredView: 'kanban',
    viewScope: Storage.getViewScope(),
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
