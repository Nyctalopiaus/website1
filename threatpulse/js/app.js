/**
 * ThreatPulse — Main Application Coordinator
 */
(function(window) {
  'use strict';

  const Storage = window.TPStorage;
  const State = window.TPState;
  const Components = window.TPComponents;

  const AUTO_REFRESH_MS = 5 * 60 * 1000; // 5 minutes
  const DEBOUNCE_MS = 200;
  const DATA_URLS = ['data/feed.json'];
  const REFRESH_INTERVAL_MS = AUTO_REFRESH_MS;

  const DOM = {};

  let tickerInterval = null;
  let tickerIndex = 0;
  let tickerKevItems = [];

  function cacheDOMElements() {
    DOM.searchInput = document.getElementById('search-input');
    DOM.statusPill = document.getElementById('status-pill');
    DOM.statusText = document.getElementById('status-text');
    DOM.statusSpinner = document.getElementById('status-spinner');
    DOM.showingCounter = document.getElementById('showing-counter');
    DOM.viewKanban = document.getElementById('view-kanban');
    DOM.btnRefresh = document.getElementById('btn-refresh');
    DOM.btnMarkAllRead = document.getElementById('btn-mark-all-read');
    DOM.stateMessage = document.getElementById('state-message');
    DOM.stateTitle = document.getElementById('state-title');
    DOM.stateDesc = document.getElementById('state-desc');
    DOM.btnResetFilters = document.getElementById('btn-reset-filters');
    DOM.toastContainer = document.getElementById('toast-container');
    DOM.btnClearStorage = document.getElementById('btn-clear-storage');
    DOM.btnCollapseMetrics = document.getElementById('btn-collapse-metrics');
    DOM.chevronMetrics = document.getElementById('chevron-metrics');
    DOM.metricsHeader = document.getElementById('metrics-header');
    DOM.metricsGridBody = document.getElementById('metrics-grid-body');
    DOM.metricsCard = document.getElementById('metrics-card');
    DOM.metricSyncStatus = document.getElementById('metric-sync-status');
    DOM.metricFeedsCount = document.getElementById('metric-feeds-count');
    DOM.metricItemsCount = document.getElementById('metric-items-count');
    DOM.metricThreatsCount = document.getElementById('metric-threats-count');
    DOM.metricLastSync = document.getElementById('metric-last-sync');
  }



  async function fetchFeedData(isBackground = false) {
    if (!isBackground) {
      State.isLoading = true;
      renderSkeletonScreens();
      setStatus('Loading latest feeds...', true);
    } else {
      State.isBackgroundRefreshing = true;
      setStatus('Refreshing feeds in background...', true);
    }

    let loaded = false;
    let fetchedData = null;

    for (const url of DATA_URLS) {
      try {
        const res = await fetch(url + '?t=' + Date.now());
        if (res.ok) {
          fetchedData = await res.json();
          loaded = true;
          break;
        }
      } catch (e) {
        // Try next URL fallback
      }
    }

    State.isLoading = false;
    State.isBackgroundRefreshing = false;

    if (loaded && fetchedData) {
      State.rawData = fetchedData;
      State.allItems = fetchedData.items || [];
      updateSyncStatus(fetchedData.generated_at);
      updateMetricsCard(fetchedData);
      updateTagFilterSummaryUI();
      renderTagCheckboxGrid();
      filterAndRender();
      if (isBackground) Components.showToast('Feeds auto-refreshed in background');
    } else {
      setStatus('Failed to load feed data', false);
      showStateMessage('Error Loading Feeds', 'Unable to fetch security intelligence payload.');
    }
  }

  function setStatus(text, isLoading = false) {
    if (DOM.statusText) DOM.statusText.textContent = text;
    if (DOM.statusPill) {
      if (isLoading) {
        DOM.statusPill.classList.add('animate-pulse');
      } else {
        DOM.statusPill.classList.remove('animate-pulse');
      }
    }
  }

  function updateSyncStatus(generatedAt) {
    if (!generatedAt) {
      setStatus('Engine Active', false);
      return;
    }
    const relTime = Components.formatRelativeTime(generatedAt);
    setStatus(`Updated ${relTime}`, false);
  }

  function updateMetricsCard(data) {
    if (!data) return;
    const stats = data.stats || {};
    const processed = stats.feeds_processed !== undefined ? stats.feeds_processed : (stats.processed_sources || 0);
    const failed = stats.feeds_failed || 0;
    const totalFeeds = (processed + failed) > 0 ? (processed + failed) : (stats.total_sources || 19);

    let activeThreats = stats.active_threats_count;
    if (activeThreats === undefined || activeThreats === null) {
      activeThreats = State.allItems.filter(i => {
        const cat = i.source.category_id;
        const hasCve = i.tags && i.tags.some(t => t.startsWith('CVE-'));
        return cat === 'active_threats' || hasCve || (i.title && i.title.toLowerCase().includes('exploit'));
      }).length;
    }

    if (DOM.metricFeedsCount) DOM.metricFeedsCount.textContent = `${processed} / ${totalFeeds}`;
    if (DOM.metricItemsCount) DOM.metricItemsCount.textContent = stats.total_items || State.allItems.length;
    if (DOM.metricThreatsCount) DOM.metricThreatsCount.textContent = activeThreats;
    if (DOM.metricLastSync) DOM.metricLastSync.textContent = data.generated_at ? Components.formatUtcDate(data.generated_at) : 'N/A';
    if (DOM.metricSyncStatus) {
      if (failed === 0 && processed > 0) {
        DOM.metricSyncStatus.textContent = 'Ingestion Active';
      } else {
        DOM.metricSyncStatus.textContent = `Sync (${failed} failed)`;
      }
    }
  }

  function isItemInActiveViewScope(item) {
    if (!item) return false;
    const nowMs = Date.now();
    const maxAgeMs = 24 * 60 * 60 * 1000; // 24 hours

    // 1. View Scope Filter: Briefing (24h) vs Full Stream
    if (State.viewScope === 'briefing') {
      const publishedMs = item.published_at ? new Date(item.published_at).getTime() : 0;
      const isWithin24h = publishedMs > 0 && !isNaN(publishedMs) && (nowMs - publishedMs <= maxAgeMs);
      if (!isWithin24h) return false;
    }

    // 2. Primary Category Filter
    if (State.activeCategory === 'bookmarked') {
      if (!State.bookmarkedItems.has(item.id)) return false;
    }

    // 3. Secondary Triage Filter [ All | Unread Only | Bookmarks ]
    if (State.triageFilter === 'unread') {
      if (State.readItems.has(item.id)) return false;
    } else if (State.triageFilter === 'bookmarked') {
      if (!State.bookmarkedItems.has(item.id)) return false;
    }

    // 4. Search Query Filter
    if (State.searchQuery) {
      const q = State.searchQuery.toLowerCase();
      const enrichedTags = Components.getEnrichedItemTags ? Components.getEnrichedItemTags(item) : (item.tags || []);
      const titleMatch = item.title ? item.title.toLowerCase().includes(q) : false;
      const summaryMatch = item.summary ? item.summary.toLowerCase().includes(q) : false;
      const sourceMatch = (item.source && item.source.name) ? item.source.name.toLowerCase().includes(q) : false;
      const tagsMatch = enrichedTags.some(t => t.toLowerCase().includes(q));
      if (!titleMatch && !summaryMatch && !sourceMatch && !tagsMatch) return false;
    }

    return true;
  }

  function filterAndRender() {
    State.filteredItems = State.allItems.filter(item => {
      if (!isItemInActiveViewScope(item)) return false;

      // Selected Threat Tag & Entity Checkbox Filter
      if (State.selectedTags && State.selectedTags.size > 0) {
        const enrichedTags = Components.getEnrichedItemTags ? Components.getEnrichedItemTags(item) : (item.tags || []);
        const itemTagsSet = new Set(enrichedTags.map(t => t.toLowerCase()));
        const selectedArr = Array.from(State.selectedTags).map(t => t.toLowerCase());

        if (State.tagMatchMode === 'AND') {
          const matchesAll = selectedArr.every(st => itemTagsSet.has(st));
          if (!matchesAll) return false;
        } else {
          const matchesAny = selectedArr.some(st => itemTagsSet.has(st));
          if (!matchesAny) return false;
        }
      }

      return true;
    });

    updateItemCounters();
    updateHeroWidgets();
    renderTagCheckboxGrid();
    renderDashboard();
  }

  function updateHeroWidgets() {
    // 1. Update Checklist Widget Counts
    const criticalKevs = State.allItems.filter(i => Components.getItemSeverity(i) === 'critical').length;
    const unreadCount = State.allItems.filter(i => !State.readItems.has(i.id)).length;
    const savedCount = State.bookmarkedItems.size;

    const elCrit = document.getElementById('chk-critical-count');
    const elUnread = document.getElementById('chk-unread-count');
    const elSaved = document.getElementById('chk-saved-count');

    if (elCrit) elCrit.textContent = criticalKevs;
    if (elUnread) elUnread.textContent = unreadCount;
    if (elSaved) elSaved.textContent = savedCount;

    // 2. Update Threat Ticker Widget Items
    tickerKevItems = State.allItems.filter(i => Components.getItemSeverity(i) === 'critical');
    if (tickerKevItems.length > 0) {
      renderTickerItem(tickerKevItems[tickerIndex % tickerKevItems.length]);
      startTickerAutoRotate();
    }
  }

  function renderTickerItem(item) {
    if (!item) return;
    const elTitle = document.getElementById('ticker-title');
    const elSummary = document.getElementById('ticker-summary');
    const elPublished = document.getElementById('ticker-published');
    const elLink = document.getElementById('ticker-link');
    const elSummaryPreview = document.getElementById('summary-preview-text');

    if (elTitle) elTitle.textContent = item.title;
    if (elSummary) elSummary.textContent = item.summary || 'Critical security advisory highlight.';
    if (elPublished) elPublished.textContent = Components.formatRelativeTime(item.published_at);
    if (elLink) elLink.href = item.link || '#';
    if (elSummaryPreview && item.title) elSummaryPreview.textContent = item.title;
  }

  function startTickerAutoRotate() {
    if (tickerInterval) clearInterval(tickerInterval);
    if (tickerKevItems.length <= 1) return;

    tickerInterval = setInterval(() => {
      tickerIndex = (tickerIndex + 1) % tickerKevItems.length;
      renderTickerItem(tickerKevItems[tickerIndex]);
    }, 6000); // Rotate every 6 seconds
  }

  function updateItemCounters() {
    if (DOM.showingCounter) {
      DOM.showingCounter.textContent = `${State.filteredItems.length} of ${State.allItems.length}`;
    }

    const counts = {
      all: State.allItems.length,
      active_threats: 0,
      security_advisories: 0,
      informational: 0,
      bookmarked: State.bookmarkedItems.size
    };

    State.allItems.forEach(item => {
      let colKey = item.source ? item.source.category_id : 'active_threats';
      const hasCve = item.tags && item.tags.some(t => t.startsWith('CVE-'));
      if (hasCve || Components.getItemSeverity(item) === 'critical') {
        colKey = 'active_threats';
      }

      if (counts[colKey] !== undefined) {
        counts[colKey]++;
      }
    });

    Object.keys(counts).forEach(cat => {
      const el = document.getElementById(`count-${cat}`);
      if (el) el.textContent = `(${counts[cat]})`;
    });

    updateStreamScopeHeaderUI();
  }

  function renderDashboard() {
    if (State.isLoading) return;

    if (State.filteredItems.length === 0) {
      showStateMessage(
        'No Matching Security Items',
        State.searchQuery
          ? `No feed entries match search term "${State.searchQuery}".`
          : 'No feed items available in this category/triage filter.'
      );
      if (DOM.viewKanban) DOM.viewKanban.classList.add('hidden');
      return;
    }

    if (DOM.stateMessage) DOM.stateMessage.classList.add('hidden');
    if (DOM.viewKanban) DOM.viewKanban.classList.remove('hidden');
    renderKanbanView();
    highlightSelectedCard();
  }

  function showStateMessage(title, desc) {
    if (DOM.stateTitle) DOM.stateTitle.textContent = title;
    if (DOM.stateDesc) DOM.stateDesc.textContent = desc;
    if (DOM.stateMessage) DOM.stateMessage.classList.remove('hidden');
  }

  function renderSkeletonScreens() {
    if (!DOM.viewKanban) return;
    if (DOM.stateMessage) DOM.stateMessage.classList.add('hidden');
    DOM.viewKanban.classList.remove('hidden');

    const colMap = {
      active_threats: DOM.viewKanban.querySelector('[data-category="active_threats"] .col-items'),
      platform_infrastructure: DOM.viewKanban.querySelector('[data-category="security_advisories"] .col-items'),
      engineering_homelab: DOM.viewKanban.querySelector('[data-category="informational"] .col-items')
    };

    Object.values(colMap).forEach(col => {
      if (col) {
        col.innerHTML = Array(3).fill(0).map(() => `
          <div class="skeleton-card">
            <div class="skeleton-line skeleton-title"></div>
            <div class="skeleton-line skeleton-text w-3/4"></div>
            <div class="skeleton-line skeleton-badge"></div>
          </div>
        `).join('');
      }
    });
  }

                  function renderKanbanView() {
    if (!DOM.viewKanban) return;

    const categories = ['active_threats', 'security_advisories', 'informational'];

    // 1. Enforce Permanent 3-Column Grid Layout & Clear Card Containers
    DOM.viewKanban.classList.remove('grid-cols-1', 'grid-cols-2', 'grid-cols-3', 'md:grid-cols-2', 'lg:grid-cols-3');
    DOM.viewKanban.classList.add('grid-cols-1', 'md:grid-cols-2', 'lg:grid-cols-3');

    categories.forEach(catKey => {
      const colEl = DOM.viewKanban.querySelector(`.col-kanban[data-category="${catKey}"]`);
      if (colEl) colEl.classList.remove('hidden');

      const itemsContainer = DOM.viewKanban.querySelector(`[data-category="${catKey}"] .col-items`);
      if (itemsContainer) itemsContainer.innerHTML = '';
    });

    // 2. Separate Items strictly into 3 Category Streams
    const activeItems = [];
    const advisoryItems = [];
    const infoItems = [];

    State.filteredItems.forEach((item, idx) => {
      let rawCat = item.source ? item.source.category_id : 'active_threats';
      if (rawCat === 'platform_infrastructure') rawCat = 'security_advisories';
      if (rawCat === 'engineering_homelab') rawCat = 'informational';

      const hasCve = item.tags && item.tags.some(t => t.startsWith('CVE-'));
      const isCritical = Components.getItemSeverity(item) === 'critical';

      // ANY item with a CVE tag or critical exploit ALWAYS routes to Active Threat Intel & CVEs!
      if (hasCve || isCritical || rawCat === 'active_threats') {
        activeItems.push({ item, idx });
      } else if (rawCat === 'security_advisories') {
        advisoryItems.push({ item, idx });
      } else {
        infoItems.push({ item, idx });
      }
    });

    // 3. Update Filter Row Controls (Total Category Item Counts, Checkboxes & Dimmed States)
    const vis = State.visibleColumns;
    const catCounts = {
      active_threats: activeItems.length,
      security_advisories: advisoryItems.length,
      informational: infoItems.length
    };

    categories.forEach(catKey => {
      const btn = DOM.viewKanban.querySelector(`.col-toggle-btn[data-category="${catKey}"]`);
      const chk = DOM.viewKanban.querySelector(`.col-visibility-chk[data-category="${catKey}"]`);
      const countEl = DOM.viewKanban.querySelector(`[data-category="${catKey}"] .col-count`);
      const isChecked = vis.has(catKey);

      if (chk) chk.checked = isChecked;
      if (countEl) countEl.textContent = `(${catCounts[catKey]})`;

      if (btn) {
        if (isChecked) {
          btn.classList.remove('dimmed');
        } else {
          btn.classList.add('dimmed');
        }
      }
    });

    // 4. Map Cards into 3 Physical Columns Following the Exact Approved Plan
    const colItemsMap = { active_threats: [], security_advisories: [], informational: [] };
    const hasActive = vis.has('active_threats');
    const hasSec = vis.has('security_advisories');
    const hasInfo = vis.has('informational');

    if (hasActive && hasSec && hasInfo) {
      // Scenario 1: All 3 Checked -> Col 1: Active, Col 2: Sec, Col 3: Info
      colItemsMap.active_threats = activeItems;
      colItemsMap.security_advisories = advisoryItems;
      colItemsMap.informational = infoItems;
    } else if (hasActive && hasSec && !hasInfo) {
      // Scenario 2: Active + Sec Checked (Info dimmed) -> Active expands across Left & Center (Col 1 & Col 2); Sec takes Right (Col 3)
      const half = Math.ceil(activeItems.length / 2);
      colItemsMap.active_threats = activeItems.slice(0, half);
      colItemsMap.security_advisories = activeItems.slice(half);
      colItemsMap.informational = advisoryItems;
    } else if (hasActive && !hasSec && hasInfo) {
      // Scenario 3: Active + Info Checked (Sec dimmed) -> Active expands across Left & Center (Col 1 & Col 2); Info takes Right (Col 3)
      const half = Math.ceil(activeItems.length / 2);
      colItemsMap.active_threats = activeItems.slice(0, half);
      colItemsMap.security_advisories = activeItems.slice(half);
      colItemsMap.informational = infoItems;
    } else if (hasActive && !hasSec && !hasInfo) {
      // Scenario 4: Only Active Checked (Sec & Info dimmed) -> Active expands across ALL 3 COLUMNS!
      const third = Math.ceil(activeItems.length / 3);
      colItemsMap.active_threats = activeItems.slice(0, third);
      colItemsMap.security_advisories = activeItems.slice(third, third * 2);
      colItemsMap.informational = activeItems.slice(third * 2);
    } else if (!hasActive && hasSec && hasInfo) {
      // Scenario 5: Sec + Info Checked (Active dimmed) -> Sec expands across Col 1 & Col 2; Info takes Col 3
      const half = Math.ceil(advisoryItems.length / 2);
      colItemsMap.active_threats = advisoryItems.slice(0, half);
      colItemsMap.security_advisories = advisoryItems.slice(half);
      colItemsMap.informational = infoItems;
    } else if (!hasActive && hasSec && !hasInfo) {
      // Scenario 6: Only Sec Checked (Active & Info dimmed) -> Sec expands across ALL 3 COLUMNS!
      const third = Math.ceil(advisoryItems.length / 3);
      colItemsMap.active_threats = advisoryItems.slice(0, third);
      colItemsMap.security_advisories = advisoryItems.slice(third, third * 2);
      colItemsMap.informational = advisoryItems.slice(third * 2);
    } else if (!hasActive && !hasSec && hasInfo) {
      // Scenario 7: Only Info Checked (Active & Sec dimmed) -> Info expands across ALL 3 COLUMNS!
      const third = Math.ceil(infoItems.length / 3);
      colItemsMap.active_threats = infoItems.slice(0, third);
      colItemsMap.security_advisories = infoItems.slice(third, third * 2);
      colItemsMap.informational = infoItems.slice(third * 2);
    }

    // 5. Render Cards into the 3 Permanent Columns
    categories.forEach(catKey => {
      const items = colItemsMap[catKey] || [];
      const itemsContainer = DOM.viewKanban.querySelector(`[data-category="${catKey}"] .col-items`);

      if (itemsContainer) {
        itemsContainer.innerHTML = '';
        items.forEach(({ item, idx }) => {
          const cardDOM = Components.createKanbanCardDOM(
            item, 
            idx, 
            State, 
            handleToggleRead, 
            handleToggleBookmark
          );
          itemsContainer.appendChild(cardDOM);
        });
      }

      // Hide Show More button
      const btnShowMore = DOM.viewKanban.querySelector(`.btn-show-more[data-category="${catKey}"]`);
      if (btnShowMore) btnShowMore.classList.add('hidden');
    });

    updateStreamScopeHeaderUI();
  }

  function handleToggleRead(item, index) {
    if (State.readItems.has(item.id)) {
      State.readItems.delete(item.id);
      Components.showToast('Marked as unread');
    } else {
      State.readItems.add(item.id);
      Components.showToast('Marked as read');
    }
    Storage.saveReadItems(State.readItems);
    filterAndRender();
  }

  function handleToggleBookmark(item, index) {
    if (State.bookmarkedItems.has(item.id)) {
      State.bookmarkedItems.delete(item.id);
      Components.showToast('Removed from saved bookmarks');
    } else {
      State.bookmarkedItems.add(item.id);
      Components.showToast('Added to saved bookmarks');
    }
    Storage.saveBookmarkedItems(State.bookmarkedItems);
    updateItemCounters();
    filterAndRender();
  }

  function markAllVisibleAsRead() {
    if (State.filteredItems.length === 0) {
      Components.showToast('No visible items to mark as read');
      return;
    }

    let newlyRead = 0;
    State.filteredItems.forEach(item => {
      if (!State.readItems.has(item.id)) {
        State.readItems.add(item.id);
        newlyRead++;
      }
    });

    if (newlyRead > 0) {
      Storage.saveReadItems(State.readItems);
      Components.showToast(`Marked ${newlyRead} visible item(s) as read`);
      filterAndRender();
    } else {
      Components.showToast('All visible items are already marked as read');
    }
  }

  function handleCategorySelect(cat) {
    if (State.activeCategory === cat && cat !== 'all') {
      State.activeCategory = 'all';
      Components.showToast('Showing all feeds');
    } else {
      State.activeCategory = cat;
      const catNames = {
        active_threats: 'Active Threats',
        security_advisories: 'Security Advisories',
        informational: 'Informational & Research',
        bookmarked: 'Bookmarks',
        all: 'All Feeds'
      };
      Components.showToast(`Filtered by ${catNames[cat] || cat}`);
    }
    Storage.setActiveCategory(State.activeCategory);
    updateCategoryPillUI();
    filterAndRender();
  }

  function updateStreamScopeHeaderUI() {
    const elIcon = document.getElementById('scope-icon-badge');
    const elTitle = document.getElementById('scope-title-text');
    const elSub = document.getElementById('scope-subtitle-text');
    const elCount = document.getElementById('scope-count-badge');

    if (!elTitle) return;

    const renderedCount = document.querySelectorAll('#view-kanban .item-card').length;
    const filteredCount = State.filteredItems ? State.filteredItems.length : 0;
    const totalCount = State.allItems ? State.allItems.length : 0;

    let countText = '';
    if (renderedCount < filteredCount) {
      countText = `Showing ${renderedCount} of ${filteredCount} Advisories`;
    } else {
      countText = `Showing ${filteredCount} Advisories`;
    }

    if (State.viewScope === 'briefing') {
      if (elIcon) elIcon.textContent = '⚡';
      elTitle.textContent = "Today's Triage Briefing (24h Window)";
      if (elSub) elSub.textContent = "Filtered high-signal advisories published in the last 24 hours & active CISA KEVs";
      if (elCount) elCount.textContent = `${countText} (24h Focus)`;
    } else {
      if (elIcon) elIcon.textContent = '🌐';
      elTitle.textContent = "Complete Intelligence Feed Payload";
      if (elSub) elSub.textContent = "Full un-filtered historical advisory stream across all 28 monitored intelligence feeds";
      if (elCount) elCount.textContent = `${countText} of ${totalCount} (Full Stream)`;
    }
  }

  function updateBriefingSliderUI() {
    const btnBriefing = document.getElementById('btn-mode-briefing');
    const btnFull = document.getElementById('btn-mode-full');

    if (btnBriefing && btnFull) {
      if (State.viewScope === 'briefing') {
        btnBriefing.classList.add('active');
        btnFull.classList.remove('active');
      } else {
        btnFull.classList.add('active');
        btnBriefing.classList.remove('active');
      }
    }
    updateStreamScopeHeaderUI();
  }

  function updateCategoryPillUI() {
    document.querySelectorAll('.cat-pill').forEach(btn => {
      if (btn.dataset.category === State.activeCategory) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    document.querySelectorAll('.col-toggle-btn').forEach(btn => {
      if (btn.dataset.category === State.activeCategory) {
        btn.classList.add('ring-2', 'ring-brand-accent', 'border-brand-accent', 'bg-brand-card');
        btn.classList.remove('bg-brand-card/90', 'border-brand-border/60');
      } else {
        btn.classList.remove('ring-2', 'ring-brand-accent', 'border-brand-accent');
        btn.classList.add('bg-brand-card/90', 'border-brand-border/60');
      }
    });
  }

  function updateTriageButtonsUI() {
    document.querySelectorAll('.triage-btn').forEach(btn => {
      if (btn.dataset.triage === State.triageFilter) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  function applyMetricsCollapsedUI(collapsed) {
    const gridBody = DOM.metricsGridBody || document.getElementById('metrics-grid-body');
    const chevron = DOM.chevronMetrics || document.getElementById('chevron-metrics');
    const header = DOM.metricsHeader || document.getElementById('metrics-header');

    if (!gridBody) return;

    if (collapsed) {
      gridBody.style.display = 'none';
      if (chevron) chevron.classList.add('rotate-180');
      if (header) {
        header.classList.remove('border-b', 'mb-3');
        header.classList.add('pb-0');
      }
    } else {
      gridBody.style.display = 'grid';
      if (chevron) chevron.classList.remove('rotate-180');
      if (header) {
        header.classList.add('border-b', 'mb-3');
        header.classList.remove('pb-0');
      }
    }
  }

  function applyTagsCollapsedUI(collapsed) {
    const filterBody = document.getElementById('tag-filter-body');
    const chevron = document.getElementById('chevron-tag-filter');
    const header = document.getElementById('tag-filter-header');

    if (!filterBody) return;

    if (collapsed) {
      filterBody.style.display = 'none';
      filterBody.classList.add('hidden');
      if (chevron) chevron.classList.add('rotate-180');
      if (header) {
        header.classList.remove('border-b', 'pb-3', 'mb-4');
        header.classList.add('pb-0');
      }
    } else {
      filterBody.style.display = 'flex';
      filterBody.classList.remove('hidden');
      if (chevron) chevron.classList.remove('rotate-180');
      if (header) {
        header.classList.add('border-b', 'pb-3', 'mb-4');
        header.classList.remove('pb-0');
      }
      renderTagCheckboxGrid();
    }
  }

  function getScopedItemsForTagCounts() {
    return State.allItems.filter(item => isItemInActiveViewScope(item));
  }

  function renderTagCheckboxGrid() {
    const container = document.getElementById('tag-checkbox-grid-container');
    if (!container) return;

    // Collect tag frequencies strictly for items matching active view scope (24h vs Full Stream)
    const scopedItems = getScopedItemsForTagCounts();
    const tagCounts = {};
    scopedItems.forEach(item => {
      const enriched = Components.getEnrichedItemTags ? Components.getEnrichedItemTags(item) : (item.tags || []);
      enriched.forEach(t => {
        tagCounts[t] = (tagCounts[t] || 0) + 1;
      });
    });

    const searchQuery = (document.getElementById('tag-search-input')?.value || '').toLowerCase();

    // Dynamic Feeds & Sources tags
    const sourceNames = Array.from(new Set(State.allItems.map(item => item.source?.name).filter(Boolean))).sort();

    // Taxonomy buckets (Ordered: Feeds -> Vulns -> Threats -> CVEs -> OS -> Apps)
    const taxonomy = {
      feeds: { label: '📡 Feeds & Sources', color: 'text-cyan-400', tags: sourceNames },
      vuln: { label: '🛡️ Vulnerability Vectors & CVEs', color: 'text-rose-400', tags: ['0-Day', 'RCE', 'Critical', 'Unauthenticated', 'Privilege Escalation', 'Auth Bypass', 'SQLi', 'Buffer Overflow', 'DoS', 'Kernel', 'Exploited'] },
      threat: { label: '☣️ Threat Categories', color: 'text-emerald-400', tags: ['Ransomware', 'Malware', 'Phishing', 'APT', 'Supply Chain'] }
    };

    // Gather remaining CVE tags dynamically
    const cveTags = Object.keys(tagCounts).filter(t => t.startsWith('CVE-')).sort();
    if (cveTags.length > 0) {
      taxonomy.cves = { label: '🔑 CVE Disclosures', color: 'text-purple-400', tags: cveTags };
    }

    // Place Operating Systems & Apps as the final categories
    taxonomy.os = { label: '💻 Operating Systems & Platforms', color: 'text-amber-400', tags: ['Windows', 'Linux', 'macOS', 'iOS', 'Android', 'Ubuntu', 'Debian', 'FreeBSD', 'Rocky Linux'] };
    taxonomy.apps = { label: '📦 Apps & Infrastructure', color: 'text-sky-400', tags: ['Kubernetes', 'AWS', 'Docker', 'WordPress', 'Cisco', 'Palo Alto', 'Tailscale', 'Proxmox', 'Home Assistant', 'Cloudflare', 'Apache', 'Nginx', 'Active Directory', 'VPN'] };

    container.innerHTML = '';

    Object.keys(taxonomy).forEach(catKey => {
      const cat = taxonomy[catKey];
      // Always show all defined taxonomy tags so OSs, Apps, and Threats are always visible and checkable
      const matchingTags = cat.tags.filter(t => !searchQuery || t.toLowerCase().includes(searchQuery));

      if (matchingTags.length === 0) return;

      const colDOM = document.createElement('div');
      colDOM.className = 'flex flex-col gap-1.5 bg-brand-bg/60 p-3 rounded-lg border border-brand-border/50';
      
      const headerDOM = document.createElement('h4');
      headerDOM.className = `text-[11px] font-bold uppercase tracking-wider ${cat.color} mb-1 flex items-center justify-between`;
      headerDOM.innerHTML = `<span>${cat.label}</span> <span class="text-slate-500 font-mono">(${matchingTags.length})</span>`;
      colDOM.appendChild(headerDOM);

      const listDOM = document.createElement('div');
      listDOM.className = 'flex flex-col gap-1 max-h-[160px] overflow-y-auto pr-1';

      matchingTags.forEach(tagName => {
        const isChecked = State.selectedTags.has(tagName);
        const count = tagCounts[tagName] || 0;

        const labelDOM = document.createElement('label');
        labelDOM.className = `flex items-center justify-between px-2 py-1 rounded text-xs font-mono cursor-pointer transition-all ${isChecked ? 'bg-brand-accent/20 border border-brand-accent/40 text-brand-accent font-semibold' : 'hover:bg-brand-card/80 text-slate-300'}`;
        labelDOM.innerHTML = `
          <div class="flex items-center gap-2 truncate">
            <input type="checkbox" class="tag-checkbox form-checkbox rounded text-brand-accent border-slate-600 bg-brand-bg focus:ring-0" value="${Components.escapeHtml(tagName)}" ${isChecked ? 'checked' : ''}>
            <span class="truncate">${Components.escapeHtml(tagName)}</span>
          </div>
          <span class="text-[10px] opacity-75 font-mono">(${count})</span>
        `;

        const checkbox = labelDOM.querySelector('input[type="checkbox"]');
        checkbox.addEventListener('change', (e) => {
          if (e.target.checked) {
            State.selectedTags.add(tagName);
          } else {
            State.selectedTags.delete(tagName);
          }
          Storage.saveSelectedTags(State.selectedTags);
          updateTagFilterSummaryUI();
          filterAndRender();
        });

        listDOM.appendChild(labelDOM);
      });

      colDOM.appendChild(listDOM);
      container.appendChild(colDOM);
    });

    if (container.children.length === 0) {
      container.innerHTML = '<div class="col-span-full py-4 text-center text-xs text-slate-500 font-mono">No matching tags found for search query.</div>';
    }
  }

  function updateTagFilterSummaryUI() {
    const summary = document.getElementById('tag-selection-summary');
    const badge = document.getElementById('active-tags-count-badge');
    const count = State.selectedTags.size;

    if (summary) {
      summary.textContent = count > 0 ? `(${count} active ${count === 1 ? 'filter' : 'filters'})` : '(0 active filters)';
      summary.className = count > 0 ? 'text-xs font-mono font-bold text-brand-accent' : 'text-xs font-mono font-normal text-slate-400';
    }

    if (badge) {
      if (count > 0) {
        badge.textContent = count;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }
    }
  }

  function applySummaryCollapsedUI(collapsed) {
    const summaryBody = document.getElementById('executive-summary-body');
    const chevron = document.getElementById('chevron-summary');
    const toggleText = document.getElementById('summary-toggle-text');

    if (collapsed) {
      if (summaryBody) summaryBody.classList.add('hidden');
      if (chevron) chevron.classList.add('rotate-180');
      if (toggleText) toggleText.textContent = 'Expand Status & Metrics';
    } else {
      if (summaryBody) summaryBody.classList.remove('hidden');
      if (chevron) chevron.classList.remove('rotate-180');
      if (toggleText) toggleText.textContent = 'Collapse Status & Metrics';
    }
  }

  function setupEventListeners() {
    // Executive Summary Section Collapse Handler
    const toggleSummaryCollapse = (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      State.summaryCollapsed = !State.summaryCollapsed;
      Storage.setSummaryCollapsed(State.summaryCollapsed);
      applySummaryCollapsedUI(State.summaryCollapsed);
    };

    const summaryHeader = document.getElementById('executive-summary-header');
    if (summaryHeader) summaryHeader.onclick = toggleSummaryCollapse;

    const btnToggleSummary = document.getElementById('btn-toggle-summary');
    if (btnToggleSummary) btnToggleSummary.onclick = toggleSummaryCollapse;

    // Dedicated Tag Filters Section Collapse Handler
    const toggleTagsCollapse = (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      State.tagsCollapsed = !State.tagsCollapsed;
      Storage.setTagsCollapsed(State.tagsCollapsed);
      applyTagsCollapsedUI(State.tagsCollapsed);
    };

    const tagHeaderEl = document.getElementById('tag-filter-header');
    if (tagHeaderEl) {
      tagHeaderEl.onclick = toggleTagsCollapse;
    }

    const btnToggleTagCollapse = document.getElementById('btn-toggle-tag-collapse');
    if (btnToggleTagCollapse) {
      btnToggleTagCollapse.onclick = toggleTagsCollapse;
    }

    // Also support btn-toggle-tags-panel if present in toolbar
    const btnToggleTags = document.getElementById('btn-toggle-tags-panel');
    if (btnToggleTags) {
      btnToggleTags.onclick = (e) => {
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
        State.tagsCollapsed = false;
        Storage.setTagsCollapsed(false);
        applyTagsCollapsedUI(false);
        const tagPanel = document.getElementById('tag-filter-panel');
        if (tagPanel) tagPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      };
    }

    // Tag Search Input Filter
    const tagSearchInput = document.getElementById('tag-search-input');
    if (tagSearchInput) {
      tagSearchInput.addEventListener('input', () => {
        renderTagCheckboxGrid();
      });
    }

    // Clear Tags Button
    const btnClearTags = document.getElementById('btn-clear-tags');
    if (btnClearTags) {
      btnClearTags.addEventListener('click', () => {
        State.selectedTags.clear();
        Storage.saveSelectedTags(State.selectedTags);
        updateTagFilterSummaryUI();
        renderTagCheckboxGrid();
        filterAndRender();
        Components.showToast('Cleared tag filters');
      });
    }

    // Tag Match Mode Switches (ANY / ALL)
    const btnMatchOr = document.getElementById('btn-tag-match-or');
    const btnMatchAnd = document.getElementById('btn-tag-match-and');
    if (btnMatchOr && btnMatchAnd) {
      btnMatchOr.addEventListener('click', () => {
        State.tagMatchMode = 'OR';
        btnMatchOr.className = 'px-2 py-0.5 rounded text-[11px] font-bold bg-brand-accent/20 text-brand-accent border border-brand-accent/30';
        btnMatchAnd.className = 'px-2 py-0.5 rounded text-[11px] font-bold text-slate-400 hover:text-slate-200';
        filterAndRender();
      });

      btnMatchAnd.addEventListener('click', () => {
        State.tagMatchMode = 'AND';
        btnMatchAnd.className = 'px-2 py-0.5 rounded text-[11px] font-bold bg-brand-accent/20 text-brand-accent border border-brand-accent/30';
        btnMatchOr.className = 'px-2 py-0.5 rounded text-[11px] font-bold text-slate-400 hover:text-slate-200';
        filterAndRender();
      });
    }
    // Briefing Mode Toggle Slider
    document.querySelectorAll('.briefing-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        State.viewScope = mode;
        Storage.setViewScope(mode);
        updateBriefingSliderUI();
        
        // Reset column limits when switching modes
        State.columnLimits = { active_threats: 8, security_advisories: 8, informational: 8 };
        filterAndRender();
        Components.showToast(mode === 'briefing' ? "Switched to Today's Triage Briefing (24h)" : 'Switched to Full Intelligence Stream');
      });
    });

    // Dual Hero Widget Tab Switcher
    document.querySelectorAll('.widget-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.widget-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const target = btn.dataset.widget;
        const viewTicker = document.getElementById('widget-view-ticker');
        const viewChecklist = document.getElementById('widget-view-checklist');

        if (target === 'ticker') {
          if (viewTicker) viewTicker.classList.remove('hidden');
          if (viewChecklist) viewChecklist.classList.add('hidden');
        } else {
          if (viewTicker) viewTicker.classList.add('hidden');
          if (viewChecklist) viewChecklist.classList.remove('hidden');
        }
      });
    });

    // Progressive Unfold Column Buttons
    document.querySelectorAll('.btn-show-more').forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = btn.dataset.category;
        State.columnLimits[cat] = (State.columnLimits[cat] || 8) + 12;
        renderKanbanView();
      });
    });

    // Metrics Card Collapse Handler
    const toggleMetrics = (e) => {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      State.metricsCollapsed = !State.metricsCollapsed;
      Storage.setMetricsCollapsed(State.metricsCollapsed);
      applyMetricsCollapsedUI(State.metricsCollapsed);
    };

    const headerEl = document.getElementById('metrics-header');
    if (headerEl) {
      headerEl.onclick = toggleMetrics;
    }

    // Modal Handlers (Feeds, QuickStart, Features)
    const modalSetup = (btnId, modalId, closeIds) => {
      const btn = document.getElementById(btnId);
      const modal = document.getElementById(modalId);
      if (!modal) return;

      const openModal = () => {
        modal.style.display = 'flex';
        modal.classList.remove('hidden');
        modal.setAttribute('aria-hidden', 'false');
      };

      const closeModal = () => {
        modal.style.display = 'none';
        modal.classList.add('hidden');
        modal.setAttribute('aria-hidden', 'true');
      };

      if (btn) btn.onclick = openModal;

      closeIds.forEach(cId => {
        const closeEls = document.querySelectorAll(cId);
        closeEls.forEach(cEl => {
          cEl.onclick = closeModal;
        });
      });

      modal.onclick = (e) => {
        if (e.target === modal) closeModal();
      };
    };

    modalSetup('btn-open-feeds', 'feeds-modal', ['.btn-close-feeds']);
    modalSetup('btn-open-quickstart', 'quickstart-modal', ['#btn-close-quickstart']);
    modalSetup('btn-open-features', 'features-modal', ['#btn-close-features']);

    if (DOM.btnMarkAllRead) {
      DOM.btnMarkAllRead.addEventListener('click', () => markAllVisibleAsRead());
    }

    if (DOM.btnRefresh) DOM.btnRefresh.addEventListener('click', () => fetchFeedData());

    if (DOM.btnResetFilters) {
      DOM.btnResetFilters.addEventListener('click', () => {
        State.searchQuery = '';
        if (DOM.searchInput) DOM.searchInput.value = '';
        State.triageFilter = 'all';
        Storage.setTriageFilter('all');
        State.viewScope = 'briefing';
        Storage.setViewScope('briefing');
        State.columnLimits = { active_threats: 8, security_advisories: 8, informational: 8 };
        updateBriefingSliderUI();
        updateTriageButtonsUI();
        // State.activeCategory remains 'all'
      });
    }

    if (DOM.searchInput) {
      DOM.searchInput.addEventListener('input', (e) => {
        clearTimeout(State.debounceTimer);
        State.debounceTimer = setTimeout(() => {
          State.searchQuery = e.target.value.trim();
          filterAndRender();
        }, DEBOUNCE_MS);
      });
    }

    document.querySelectorAll('.cat-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        handleCategorySelect(btn.dataset.category);
      });
    });

    document.querySelectorAll('.triage-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        State.triageFilter = btn.dataset.triage;
        Storage.setTriageFilter(State.triageFilter);
        updateTriageButtonsUI();
        filterAndRender();
      });
    });




        // Column Header Checkbox Event Listeners
    const catLabels = {
      active_threats: 'Active Threats',
      security_advisories: 'Security Advisories',
      informational: 'Informational & Research'
    };

    document.querySelectorAll('.col-visibility-chk').forEach(chk => {
      chk.checked = State.visibleColumns.has(chk.dataset.category);

      chk.addEventListener('change', (e) => {
        e.stopPropagation();
        const cat = chk.dataset.category;
        if (chk.checked) {
          State.visibleColumns.add(cat);
          Components.showToast(`Showing ${catLabels[cat] || cat} cards`);
        } else {
          if (State.visibleColumns.size <= 1) {
            chk.checked = true;
            Components.showToast('At least one column classification must be selected');
            return;
          }
          State.visibleColumns.delete(cat);
          Components.showToast(`Hidden ${catLabels[cat] || cat} cards`);
        }
        Storage.saveVisibleColumns(State.visibleColumns);
        filterAndRender();
      });
    });

    document.querySelectorAll('.col-toggle-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        if (e.target.closest('.col-chk-label') || e.target.classList.contains('col-visibility-chk')) return;
        const chk = btn.querySelector('.col-visibility-chk');
        if (chk) {
          chk.checked = !chk.checked;
          chk.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    });

    if (DOM.btnClearStorage) {
      DOM.btnClearStorage.addEventListener('click', () => {
        if (confirm('Reset all local storage, read states, and custom settings?')) {
          Storage.clearAll();
          window.location.reload();
        }
      });
    }
  }

  function setupAutoRefresh() {
    setInterval(() => {
      fetchFeedData(true);
    }, REFRESH_INTERVAL_MS);
  }

  document.addEventListener('DOMContentLoaded', () => {
    cacheDOMElements();
    updateBriefingSliderUI();
    updateTriageButtonsUI();
    applyMetricsCollapsedUI(State.metricsCollapsed);
    applyTagsCollapsedUI(State.tagsCollapsed);
    applySummaryCollapsedUI(State.summaryCollapsed);
    setupEventListeners();
    fetchFeedData();
    setupAutoRefresh();
  });
  })(window);