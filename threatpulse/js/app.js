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
  const IOC_DATA_URLS = ['data/iocs.json'];
  const REFRESH_INTERVAL_MS = AUTO_REFRESH_MS;

  // Per-column progressive rendering: render DEFAULT_COLUMN_LIMIT cards per category up front,
  // then reveal COLUMN_LOAD_INCREMENT more at a time (via "Show More" click or auto-load on scroll)
  // to keep initial render/DOM cost low now that feed.json is uncapped.
  const DEFAULT_COLUMN_LIMIT = 8;
  const COLUMN_LOAD_INCREMENT = 12;
  const AUTO_EXPAND_SCROLL_MARGIN_PX = 400;

  const DOM = {};

  let tickerInterval = null;
  let tickerIndex = 0;
  let tickerKevItems = [];
  let isColumnAutoExpanding = false;
  let paletteActiveIndex = -1;
  let paletteResultItems = [];

  function cacheDOMElements() {
    DOM.searchInput = document.getElementById('search-input');
    DOM.btnClearSearch = document.getElementById('btn-clear-search');
    DOM.btnSortRecency = document.getElementById('btn-sort-recency');
    DOM.btnSortUrgency = document.getElementById('btn-sort-urgency');
    DOM.statusPill = document.getElementById('status-pill');
    DOM.statusText = document.getElementById('status-text');
    DOM.statusSpinner = document.getElementById('status-spinner');
    DOM.showingCounter = document.getElementById('showing-counter');
    DOM.viewKanban = document.getElementById('view-kanban');
    DOM.btnRefresh = document.getElementById('btn-refresh');
    DOM.btnMarkAllRead = document.getElementById('btn-mark-all-read');
    DOM.btnDailyDigest = document.getElementById('btn-daily-digest');
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
    DOM.metricRiskCoverage = document.getElementById('metric-risk-coverage');
    DOM.feedsModalSubtitle = document.getElementById('feeds-modal-subtitle');
    DOM.feedsModalBody = document.getElementById('feeds-modal-body');
    DOM.metricIocCoverage = document.getElementById('metric-ioc-coverage');
    DOM.iocwatchModalSubtitle = document.getElementById('iocwatch-modal-subtitle');
    DOM.iocwatchTbody = document.getElementById('iocwatch-tbody');
    DOM.btnBackToTop = document.getElementById('btn-back-to-top');
    DOM.btnDesktopMore = document.getElementById('btn-desktop-more');
    DOM.desktopMorePanel = document.getElementById('desktop-more-panel');
    DOM.headerMoreMenu = document.getElementById('header-more-menu');
  }

  // Shows the floating "Back to Top" pill once the page has scrolled past the
  // hero/summary area, and smooth-scrolls to top on click.
  function setupBackToTop() {
    if (!DOM.btnBackToTop) return;

    const updateBackToTopVisibility = () => {
      const shouldShow = window.scrollY > 520;
      DOM.btnBackToTop.classList.toggle('is-visible', shouldShow);
    };

    DOM.btnBackToTop.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    window.addEventListener('scroll', updateBackToTopVisibility, { passive: true });
    window.addEventListener('resize', updateBackToTopVisibility, { passive: true });
    updateBackToTopVisibility();
  }

  // Desktop-only "More" dropdown in the header (folds Feed List / Quick Start /
  // Features under a single button at the far right of the row). Toggles on
  // click, closes on an outside click or Escape, and keeps aria-expanded in
  // sync. Under 768px this menu is flattened into the mobile hamburger list
  // via CSS, so it never opens (its trigger is hidden there — see style.css).
  function setupDesktopMoreMenu() {
    if (!DOM.btnDesktopMore || !DOM.desktopMorePanel || !DOM.headerMoreMenu) return;

    const closeMenu = () => {
      DOM.desktopMorePanel.classList.remove('open');
      DOM.btnDesktopMore.setAttribute('aria-expanded', 'false');
    };

    DOM.btnDesktopMore.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = DOM.desktopMorePanel.classList.toggle('open');
      DOM.btnDesktopMore.setAttribute('aria-expanded', String(isOpen));
    });

    document.addEventListener('click', (e) => {
      if (!DOM.desktopMorePanel.classList.contains('open')) return;
      if (!DOM.headerMoreMenu.contains(e.target)) closeMenu();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeMenu();
    });
  }

  // Category header accent colors, mirroring the kanban column header colors in index.html.
  // Falls back to slate for any category not in this map (e.g. a future Phase 3 category)
  // rather than failing to render.
  const CATEGORY_ACCENT = {
    active_threats: { dot: 'bg-rose-500', text: 'text-rose-400' },
    security_advisories: { dot: 'bg-amber-500', text: 'text-amber-400' },
    informational: { dot: 'bg-brand-accent', text: 'text-brand-accent' }
  };

  const FEED_STATUS_META = {
    success: { color: 'bg-emerald-400', title: 'Synced successfully on the last run' },
    failed: { color: 'bg-rose-500', title: 'Failed on the last run — see fetcher.py logs' },
    disabled: { color: 'bg-slate-500', title: 'Configured but disabled — not currently ingesting' },
    unknown: { color: 'bg-slate-600', title: 'No run status yet' }
  };

  // Renders the entire Monitored Security Feeds modal from feed.json's "sources" manifest —
  // replaces what used to be hand-maintained HTML in index.html. Adding, removing, or
  // re-tiering a feed in config.json is now the only step needed for this modal (and the
  // header count) to reflect it; nothing here needs manual updates.
  function renderFeedsModal(data) {
    if (!DOM.feedsModalBody) return;
    const sources = (data && data.sources) || [];

    const enabledCount = sources.filter(s => s.enabled).length;
    if (DOM.feedsModalSubtitle) {
      const pendingCount = sources.length - enabledCount;
      const pendingNote = pendingCount > 0 ? ` • ${pendingCount} pending verification` : '';
      DOM.feedsModalSubtitle.textContent = `${enabledCount} Active Ingestion Sources${pendingNote} • Automated Cron Ingestion`;
    }

    if (sources.length === 0) {
      DOM.feedsModalBody.innerHTML = '<div class="text-center text-slate-500 py-6">No source manifest available yet — run fetcher.py to populate it.</div>';
      return;
    }

    // Group by category_id, preserving first-seen order so a future new category slots in
    // naturally without needing a hardcoded category list here.
    const categoryOrder = [];
    const byCategory = {};
    sources.forEach(s => {
      if (!byCategory[s.category_id]) {
        byCategory[s.category_id] = { name: s.category_name, items: [] };
        categoryOrder.push(s.category_id);
      }
      byCategory[s.category_id].items.push(s);
    });

    DOM.feedsModalBody.innerHTML = categoryOrder.map(catId => {
      const cat = byCategory[catId];
      const accent = CATEGORY_ACCENT[catId] || { dot: 'bg-slate-400', text: 'text-slate-300' };
      const enabledInCat = cat.items.filter(s => s.enabled).length;

      const links = cat.items.map(s => {
        const tierMeta = Components.getTierMeta(s.tier);
        const statusMeta = FEED_STATUS_META[s.last_run_status] || FEED_STATUS_META.unknown;
        const pendingBadge = !s.enabled
          ? '<span class="text-[10px] px-1.5 py-0.5 rounded bg-slate-700/60 text-slate-400 ml-1.5">Pending</span>'
          : '';
        return `
          <a href="${Components.escapeHtml(s.url || '#')}" target="_blank" rel="noopener noreferrer"
             class="bg-brand-bg/80 border border-brand-border/60 hover:border-brand-accent/50 p-2.5 rounded-lg flex items-center justify-between text-slate-200 hover:text-white transition-all ${!s.enabled ? 'opacity-60' : ''}"
             title="${Components.escapeHtml(statusMeta.title)}">
            <span class="flex items-center gap-1.5 truncate">
              <span class="w-1.5 h-1.5 rounded-full ${statusMeta.color} shrink-0"></span>
              <span title="${Components.escapeHtml(tierMeta.label)}">${tierMeta.icon}</span>
              <span class="truncate">${Components.escapeHtml(s.name)}</span>
              ${pendingBadge}
            </span>
            <span class="text-brand-accent shrink-0">↗</span>
          </a>
        `;
      }).join('');

      return `
        <div>
          <h3 class="text-xs font-bold uppercase tracking-wider ${accent.text} mb-2 flex items-center gap-2">
            <span class="w-2 h-2 rounded-full ${accent.dot}"></span> ${Components.escapeHtml(cat.name)} (${enabledInCat} Feed${enabledInCat === 1 ? '' : 's'})
          </h3>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">${links}</div>
        </div>
      `;
    }).join('');
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
      renderFeedsModal(fetchedData);
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
        // Delegates the "critical" check to Components.getItemSeverity so this fallback count
        // (used only when older feed.json payloads lack active_threats_count) stays in sync with
        // the same exploit-signal heuristic used for column routing and card styling.
        return cat === 'active_threats' || hasCve || Components.getItemSeverity(i) === 'critical';
      }).length;
    }

    // Falls back to a client-side count (older feed.json payloads, pre-enrichment, won't carry
    // these stats fields yet) so this tile degrades gracefully instead of showing "undefined".
    let cveTagged = stats.cve_tagged_count;
    let epssScored = stats.epss_scored_count;
    let cvssScored = stats.cvss_scored_count;
    if (cveTagged === undefined || epssScored === undefined || cvssScored === undefined) {
      const cveItems = State.allItems.filter(i => i.tags && i.tags.some(t => t.startsWith('CVE-')));
      cveTagged = cveItems.length;
      epssScored = cveItems.filter(i => typeof i.epss_score === 'number').length;
      cvssScored = cveItems.filter(i => typeof i.cvss_score === 'number').length;
    }

    if (DOM.metricFeedsCount) DOM.metricFeedsCount.textContent = `${processed} / ${totalFeeds}`;
    if (DOM.metricItemsCount) DOM.metricItemsCount.textContent = stats.total_items || State.allItems.length;
    if (DOM.metricThreatsCount) DOM.metricThreatsCount.textContent = activeThreats;
    if (DOM.metricLastSync) DOM.metricLastSync.textContent = data.generated_at ? Components.formatUtcDate(data.generated_at) : 'N/A';
    if (DOM.metricRiskCoverage) {
      DOM.metricRiskCoverage.textContent = cveTagged > 0
        ? `EPSS ${epssScored}/${cveTagged} · CVSS ${cvssScored}/${cveTagged}`
        : 'No CVE-tagged items yet';
    }
    if (DOM.metricSyncStatus) {
      if (failed === 0 && processed > 0) {
        DOM.metricSyncStatus.textContent = 'Ingestion Active';
      } else {
        DOM.metricSyncStatus.textContent = `Sync (${failed} failed)`;
      }
    }
  }

  // IOC Watch (Phase 3) — loaded from its own data/iocs.json, entirely independent of
  // fetchFeedData()/State.allItems. A missing iocs.json (no IOC feeds configured/run yet) is
  // expected on most deployments and handled as a normal empty state, not an error.
  async function fetchIocData() {
    let fetchedData = null;
    for (const url of IOC_DATA_URLS) {
      try {
        const res = await fetch(url + '?t=' + Date.now());
        if (res.ok) {
          fetchedData = await res.json();
          break;
        }
      } catch (e) {
        // Try next URL fallback
      }
    }

    State.iocRawData = fetchedData;
    State.allIocs = (fetchedData && fetchedData.items) || [];
    updateIocMetricsTile(fetchedData);
    renderIocWatchPanel();
  }

  function updateIocMetricsTile(data) {
    if (!DOM.metricIocCoverage) return;
    const stats = (data && data.stats) || null;
    if (!stats || !stats.total_iocs) {
      DOM.metricIocCoverage.textContent = 'No IOC feeds configured yet';
      return;
    }
    const byConf = stats.by_confidence || {};
    DOM.metricIocCoverage.textContent =
      `${stats.total_iocs} indicators — High ${byConf.High || 0} · Medium ${byConf.Medium || 0} · Low ${byConf.Low || 0}`;
  }

  const SCANNER_KEYWORDS = [
    'greynoise', 'noise', 'scanner', 'mass-scanner', 'riot', 'censys', 'shodan',
    'shadowserver', 'binaryedge', 'leakix', 'project25499', 'recurrent', 'stretchoid',
    'driftnet', 'intrinsec', 'cyber-radiation', 'benign', 'research'
  ];

  function isScannerOrNoiseIoc(ioc) {
    if (!ioc) return false;
    if (ioc.greynoise_riot || ioc.greynoise_classification === 'benign') return true;

    const family = (ioc.malware_family || '').toLowerCase();
    if (SCANNER_KEYWORDS.some(kw => family.includes(kw))) return true;

    if (Array.isArray(ioc.tags)) {
      if (ioc.tags.some(t => SCANNER_KEYWORDS.includes(String(t).toLowerCase()))) return true;
    }

    if (Array.isArray(ioc.sources)) {
      if (ioc.sources.some(s => String(s).toLowerCase().includes('greynoise'))) return true;
    }

    return false;
  }

  function updateIocTypeCounts() {
    const eligibleIocs = State.allIocs.filter(ioc => {
      if (!State.iocShowLow && ioc.confidence_label === 'Low') return false;
      if (State.iocFilterGreyNoise && isScannerOrNoiseIoc(ioc)) return false;
      return true;
    });

    const counts = { all: eligibleIocs.length, hash: 0, url: 0, domain: 0, ip: 0 };
    eligibleIocs.forEach(ioc => {
      const group = (Components.getIocTypeMeta(ioc.ioc_type) || {}).group;
      if (group && counts[group] !== undefined) {
        counts[group]++;
      }
    });

    document.querySelectorAll('.ioc-type-chip').forEach(btn => {
      const type = btn.dataset.iocType;
      const cnt = counts[type] || 0;
      const countSpan = btn.querySelector('.ioc-type-count');
      if (countSpan) {
        countSpan.textContent = `(${cnt.toLocaleString()})`;
      }
    });
  }

  function updateIocSortHeaderUI() {
    document.querySelectorAll('th[data-ioc-sort]').forEach(th => {
      const col = th.dataset.iocSort;
      const iconSpan = th.querySelector('.iocwatch-sort-icon');
      if (!iconSpan) return;
      if (col === State.iocSortColumn) {
        iconSpan.textContent = State.iocSortOrder === 'asc' ? ' ▲' : ' ▼';
        th.classList.add('text-purple-400');
      } else {
        iconSpan.textContent = '';
        th.classList.remove('text-purple-400');
      }
    });
  }

  function getFilteredIocs() {
    let list = State.allIocs.filter(ioc => {
      if (!State.iocShowLow && ioc.confidence_label === 'Low') return false;
      if (State.iocFilterGreyNoise && isScannerOrNoiseIoc(ioc)) return false;
      if (State.iocTypeFilter !== 'all') {
        const group = (Components.getIocTypeMeta(ioc.ioc_type) || {}).group;
        if (group !== State.iocTypeFilter) return false;
      }
      return true;
    });

    const col = State.iocSortColumn || 'confidence_score';
    const isAsc = State.iocSortOrder === 'asc';

    list.sort((a, b) => {
      let valA = a[col];
      let valB = b[col];

      if (col === 'confidence_score') {
        valA = a.confidence_score !== undefined ? a.confidence_score : 0;
        valB = b.confidence_score !== undefined ? b.confidence_score : 0;
      } else if (col === 'source_count') {
        valA = Array.isArray(a.sources) ? a.sources.length : (a.source_name ? 1 : 0);
        valB = Array.isArray(b.sources) ? b.sources.length : (b.source_name ? 1 : 0);
      } else if (col === 'first_seen') {
        valA = a.first_seen ? new Date(a.first_seen).getTime() : 0;
        valB = b.first_seen ? new Date(b.first_seen).getTime() : 0;
      } else if (typeof valA === 'string') {
        valA = valA.toLowerCase();
        valB = (valB || '').toLowerCase();
      }

      if (valA < valB) return isAsc ? -1 : 1;
      if (valA > valB) return isAsc ? 1 : -1;
      return 0;
    });

    return list;
  }

  function renderIocWatchPanel() {
    if (!DOM.iocwatchTbody) return;
    const esc = Components.escapeHtml;
    const total = State.allIocs.length;

    updateIocTypeCounts();
    updateIocSortHeaderUI();

    if (DOM.iocwatchModalSubtitle) {
      DOM.iocwatchModalSubtitle.textContent = total > 0
        ? `${total} indicator${total === 1 ? '' : 's'} tracked • Automated Cron Ingestion`
        : 'No IOC feeds configured yet — see api.env.example & config.json\'s ioc_feeds';
    }

    if (total === 0) {
      DOM.iocwatchTbody.innerHTML = `
        <tr><td colspan="6" class="text-center text-slate-500 py-8 px-3">
          No IOC data yet. Set an abuse.ch Auth-Key and/or OTX API key in <span class="text-slate-300">api.env</span>,
          enable a feed under <span class="text-slate-300">config.json</span>'s <span class="text-slate-300">ioc_feeds</span>, then run fetcher.py.
        </td></tr>`;
      return;
    }

    const filtered = getFilteredIocs();
    if (filtered.length === 0) {
      DOM.iocwatchTbody.innerHTML = `
        <tr><td colspan="6" class="text-center text-slate-500 py-8 px-3">No indicators match the current filters.</td></tr>`;
      return;
    }

    DOM.iocwatchTbody.innerHTML = filtered.map(ioc => {
      const typeMeta = Components.getIocTypeMeta(ioc.ioc_type);
      const confMeta = Components.getIocConfidenceMeta(ioc.confidence_label);
      const valueDisplay = ioc.ioc_value.length > 60 ? ioc.ioc_value.slice(0, 57) + '…' : ioc.ioc_value;

      // GreyNoise badge: only meaningful for IPs that have actually been checked (weekly-budget
      // limited server-side, so most IPs won't have this yet -- that's expected, not an error).
      let gnBadge = '';
      if (ioc.ioc_type === 'ip' && ioc.greynoise_classification) {
        if (ioc.greynoise_riot) {
          gnBadge = ` <span class="ioc-gn-badge ioc-gn-riot" title="GreyNoise: RIOT — known business service (e.g. cloud/CDN/scanner vendor)">🔵 RIOT</span>`;
        } else if (ioc.greynoise_classification === 'malicious') {
          gnBadge = ` <span class="ioc-gn-badge ioc-gn-malicious" title="GreyNoise: classified malicious">🔺 GN</span>`;
        } else if (ioc.greynoise_classification === 'benign') {
          gnBadge = ` <span class="ioc-gn-badge ioc-gn-benign" title="GreyNoise: classified benign">⚪ GN</span>`;
        }
      }

      const rowInner = `
        <td class="px-3 py-2 whitespace-nowrap text-slate-300">${typeMeta.icon} ${esc(typeMeta.label)}</td>
        <td class="px-3 py-2 max-w-[280px]">
          <div class="flex items-center gap-1.5">
            <span class="truncate text-slate-200" title="${esc(ioc.ioc_value)}">${esc(valueDisplay)}</span>
            <button type="button" class="iocwatch-copy-btn shrink-0" data-value="${esc(ioc.ioc_value)}" title="Copy value">📋</button>
          </div>
        </td>
        <td class="px-3 py-2 whitespace-nowrap text-slate-400">${ioc.malware_family ? esc(ioc.malware_family) : '—'}</td>
        <td class="px-3 py-2 whitespace-nowrap"><span class="badge-risk ${confMeta.cls}">${confMeta.icon} ${esc(ioc.confidence_label)} (${Math.round(ioc.confidence_score)})</span>${gnBadge}</td>
        <td class="px-3 py-2 whitespace-nowrap text-slate-400">${esc(Components.formatRelativeTime(ioc.first_seen))}</td>
        <td class="px-3 py-2 whitespace-nowrap text-slate-400">${ioc.source_count || (ioc.sources ? ioc.sources.length : 1)}× ${esc((ioc.sources || []).join(', '))}</td>
      `;
      return ioc.reference
        ? `<tr class="border-t border-brand-border/40 hover:bg-brand-bg/40 cursor-pointer" data-reference="${esc(ioc.reference)}">${rowInner}</tr>`
        : `<tr class="border-t border-brand-border/40 hover:bg-brand-bg/40">${rowInner}</tr>`;
    }).join('');
  }

  function exportIocsCsv() {
    const rows = getFilteredIocs();
    if (rows.length === 0) {
      Components.showToast('No IOCs to export with the current filters.');
      return;
    }
    const csvEscape = (val) => `"${String(val == null ? '' : val).replace(/"/g, '""')}"`;
    const header = ['type', 'value', 'malware_family', 'confidence_label', 'confidence_score', 'first_seen', 'last_seen', 'source_count', 'sources', 'reference', 'greynoise_classification', 'greynoise_riot'];
    const lines = [header.join(',')];
    rows.forEach(ioc => {
      lines.push([
        csvEscape(ioc.ioc_type), csvEscape(ioc.ioc_value), csvEscape(ioc.malware_family),
        csvEscape(ioc.confidence_label), csvEscape(ioc.confidence_score), csvEscape(ioc.first_seen),
        csvEscape(ioc.last_seen), csvEscape(ioc.source_count || (ioc.sources ? ioc.sources.length : 1)), csvEscape((ioc.sources || []).join('; ')),
        csvEscape(ioc.reference), csvEscape(ioc.greynoise_classification), csvEscape(ioc.greynoise_riot ? 'true' : '')
      ].join(','));
    });

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `threatpulse-ioc-watch-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    Components.showToast(`Exported ${rows.length} IOC${rows.length === 1 ? '' : 's'} to CSV.`);
  }

  function setupIocWatchPanel() {
    const showLowChk = document.getElementById('iocwatch-show-low');
    if (showLowChk) {
      showLowChk.checked = State.iocShowLow;
      showLowChk.addEventListener('change', () => {
        State.iocShowLow = showLowChk.checked;
        Storage.setIocShowLow(State.iocShowLow);
        renderIocWatchPanel();
      });
    }

    const greynoiseChk = document.getElementById('iocwatch-filter-greynoise');
    if (greynoiseChk) {
      greynoiseChk.checked = State.iocFilterGreyNoise;
      greynoiseChk.addEventListener('change', () => {
        State.iocFilterGreyNoise = greynoiseChk.checked;
        Storage.setIocFilterGreyNoise(State.iocFilterGreyNoise);
        renderIocWatchPanel();
      });
    }

    document.querySelectorAll('.ioc-type-chip').forEach(chip => {
      if (chip.dataset.iocType === State.iocTypeFilter) chip.classList.add('active');
      else chip.classList.remove('active');

      chip.addEventListener('click', () => {
        document.querySelectorAll('.ioc-type-chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        State.iocTypeFilter = chip.dataset.iocType;
        Storage.setIocTypeFilter(State.iocTypeFilter);
        renderIocWatchPanel();
      });
    });

    document.querySelectorAll('th[data-ioc-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.dataset.iocSort;
        if (State.iocSortColumn === col) {
          State.iocSortOrder = State.iocSortOrder === 'asc' ? 'desc' : 'asc';
        } else {
          State.iocSortColumn = col;
          State.iocSortOrder = (col === 'confidence_score' || col === 'first_seen' || col === 'source_count') ? 'desc' : 'asc';
        }
        Storage.setIocSortColumn(State.iocSortColumn);
        Storage.setIocSortOrder(State.iocSortOrder);
        renderIocWatchPanel();
      });
    });

    const btnExport = document.getElementById('btn-iocwatch-export');
    if (btnExport) btnExport.addEventListener('click', exportIocsCsv);

    if (DOM.iocwatchTbody) {
      DOM.iocwatchTbody.addEventListener('click', (e) => {
        const copyBtn = e.target.closest('.iocwatch-copy-btn');
        if (copyBtn) {
          const value = copyBtn.dataset.value;
          if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(value).then(() => Components.showToast('Copied indicator value'));
          }
          return;
        }
        const row = e.target.closest('tr[data-reference]');
        if (row) window.open(row.dataset.reference, '_blank', 'noopener,noreferrer');
      });
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

    if (State.sortMode === 'urgency' && Components.compareUrgency) {
      State.filteredItems.sort(Components.compareUrgency);
    }

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

    // 3. Refresh Top Priority Spotlight (cheap to compute; only visible if that tab is active,
    // but kept current on every pass so switching to it never shows a stale list)
    renderPriorityWidget();
  }

  // Top Priority Spotlight — top 5 items site-wide by computed priority score (EPSS + CVSS +
  // KEV due-date proximity + critical-severity bonus), so the highest-urgency items surface
  // regardless of which category/column they'd otherwise sit in.
  function renderPriorityWidget() {
    const container = document.getElementById('widget-view-priority');
    if (!container || !Components.getPriorityScore) return;

    const top5 = [...State.allItems]
      .sort((a, b) => Components.getPriorityScore(b) - Components.getPriorityScore(a))
      .slice(0, 5);

    if (top5.length === 0) {
      container.innerHTML = `<div class="flex-1 flex items-center justify-center text-[11px] text-slate-500 font-mono">No scored items yet.</div>`;
      return;
    }

    const esc = Components.escapeHtml;
    container.innerHTML = top5.map((item, idx) => {
      const severity = Components.getItemSeverity(item);
      const dotCls = severity === 'critical' ? 'bg-rose-500' : (severity === 'warning' ? 'bg-amber-400' : 'bg-sky-400');
      const cvssBadge = Components.formatCvssBadge(item.cvss_score, item.cvss_severity);
      const epssBadge = Components.formatEpssBadge(item.epss_score, item.epss_percentile);
      const scorePills = [];
      if (epssBadge) scorePills.push(`<span class="badge-risk ${epssBadge.cls} !text-[9px] !py-0">${esc(epssBadge.label)}</span>`);
      if (cvssBadge) scorePills.push(`<span class="badge-risk ${cvssBadge.cls} !text-[9px] !py-0">${esc(cvssBadge.label)}</span>`);

      return `
        <a href="${esc(item.link)}" target="_blank" rel="noopener noreferrer"
           class="flex items-center gap-2 px-2 py-1.5 rounded-md border border-brand-border/50 bg-brand-bg/50 hover:border-brand-accent/60 hover:bg-brand-bg transition-colors group">
          <span class="text-[10px] font-mono text-slate-500 w-3 shrink-0">${idx + 1}</span>
          <span class="w-1.5 h-1.5 rounded-full ${dotCls} shrink-0"></span>
          <span class="flex-1 min-w-0 text-[11px] text-slate-200 group-hover:text-brand-accent line-clamp-1 leading-snug">${esc(item.title)}</span>
          ${scorePills.length > 0 ? `<span class="flex items-center gap-1 shrink-0">${scorePills.join('')}</span>` : ''}
        </a>
      `;
    }).join('');
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

    // 5 cards (up from 3) with a header/title/summary/tag row each, so the
    // placeholder column height is a closer match to a typical rendered
    // column (up to DEFAULT_COLUMN_LIMIT real cards) — this shrinks the
    // layout shift that happens when skeletons are swapped for real cards.
    Object.values(colMap).forEach(col => {
      if (col) {
        col.innerHTML = Array(5).fill(0).map(() => `
          <div class="skeleton-card">
            <div class="skeleton-row">
              <div class="skeleton-line skeleton-badge"></div>
              <div class="skeleton-line skeleton-badge skeleton-badge-sm ml-auto"></div>
            </div>
            <div class="skeleton-line skeleton-title"></div>
            <div class="skeleton-line skeleton-title w-2/3"></div>
            <div class="skeleton-line skeleton-text w-full"></div>
            <div class="skeleton-line skeleton-text w-3/4"></div>
            <div class="skeleton-row">
              <div class="skeleton-line skeleton-tag"></div>
              <div class="skeleton-line skeleton-tag"></div>
            </div>
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

    // 5. Render Cards into the 3 Permanent Columns (progressively, per-column limit)
    categories.forEach(catKey => {
      const items = colItemsMap[catKey] || [];
      const limit = State.columnLimits[catKey] || DEFAULT_COLUMN_LIMIT;
      const visibleItems = items.slice(0, limit);
      const itemsContainer = DOM.viewKanban.querySelector(`[data-category="${catKey}"] .col-items`);

      if (itemsContainer) {
        itemsContainer.innerHTML = '';
        visibleItems.forEach(({ item, idx }) => {
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

      // Show More button: reveal whenever more matching items exist beyond the current column limit
      const btnShowMore = DOM.viewKanban.querySelector(`.btn-show-more[data-category="${catKey}"]`);
      if (btnShowMore) {
        const remaining = items.length - visibleItems.length;
        if (remaining > 0) {
          btnShowMore.classList.remove('hidden');
          const moreCountEl = btnShowMore.querySelector('.more-count');
          if (moreCountEl) moreCountEl.textContent = `(+${Math.min(remaining, COLUMN_LOAD_INCREMENT)})`;
        } else {
          btnShowMore.classList.add('hidden');
        }
      }
    });

    updateStreamScopeHeaderUI();
    scheduleAutoExpandRecheck();
  }

  function resetColumnLimits() {
    State.columnLimits = {
      active_threats: DEFAULT_COLUMN_LIMIT,
      security_advisories: DEFAULT_COLUMN_LIMIT,
      informational: DEFAULT_COLUMN_LIMIT
    };
  }

  let autoExpandFollowUpQueued = false;
  function scheduleAutoExpandRecheck(delayMs = 0) {
    if (autoExpandFollowUpQueued) return;
    autoExpandFollowUpQueued = true;
    window.setTimeout(() => {
      autoExpandFollowUpQueued = false;
      checkAndTriggerColumnAutoExpand();
    }, delayMs);
  }

  // Mirrors the near-bottom auto-load pattern used in nyctos-gig-grid: as the user scrolls,
  // any column whose "Show More" button has scrolled within range of the viewport bottom
  // gets its limit bumped automatically, so scrolling reveals more cards without a click.
  function checkAndTriggerColumnAutoExpand() {
    if (isColumnAutoExpanding) return;
    if (!DOM.viewKanban || DOM.viewKanban.classList.contains('hidden')) return;

    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const visibleButtons = Array.from(DOM.viewKanban.querySelectorAll('.btn-show-more:not(.hidden)'));
    if (visibleButtons.length === 0) return;

    const nearButton = visibleButtons.find(btn => {
      const rect = btn.getBoundingClientRect();
      return rect.top <= viewportHeight + AUTO_EXPAND_SCROLL_MARGIN_PX;
    });
    if (!nearButton) return;

    isColumnAutoExpanding = true;
    const cat = nearButton.dataset.category;
    State.columnLimits[cat] = (State.columnLimits[cat] || DEFAULT_COLUMN_LIMIT) + COLUMN_LOAD_INCREMENT;
    renderKanbanView();
    setTimeout(() => { isColumnAutoExpanding = false; }, 250);
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
    resetColumnLimits();
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

  function updateSortButtonsUI() {
    if (DOM.btnSortRecency && DOM.btnSortUrgency) {
      const urgencyActive = State.sortMode === 'urgency';
      DOM.btnSortUrgency.classList.toggle('active', urgencyActive);
      DOM.btnSortRecency.classList.toggle('active', !urgencyActive);
    }
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

  const TAG_FILTER_HINT_COLLAPSED = 'Tap to filter by source, OS, vendor & threat type';
  const TAG_FILTER_HINT_EXPANDED = 'Filter advisories by Feeds/Sources, Operating Systems, Software/Vendors, Vulnerability Vectors, and Threat Categories';

  function applyTagsCollapsedUI(collapsed) {
    const filterBody = document.getElementById('tag-filter-body');
    const chevron = document.getElementById('chevron-tag-filter');
    const header = document.getElementById('tag-filter-header');
    const hint = document.getElementById('tag-filter-hint');
    const toggleBtn = document.getElementById('btn-toggle-tag-collapse');

    if (!filterBody) return;

    if (hint) hint.textContent = collapsed ? TAG_FILTER_HINT_COLLAPSED : TAG_FILTER_HINT_EXPANDED;
    if (toggleBtn) {
      // Gentle attention pulse only while collapsed and no tag filters are active yet —
      // once expanded or once the user has picked a filter, the affordance has done its job.
      const shouldPulse = collapsed && State.selectedTags.size === 0;
      toggleBtn.classList.toggle('tag-filter-attention', shouldPulse);
      toggleBtn.title = collapsed ? 'Expand tag filters' : 'Collapse tag filters';
    }

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
          resetColumnLimits();
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
        applyTagsCollapsedUI(State.tagsCollapsed);
        resetColumnLimits();
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
        btnMatchOr.classList.add('active');
        btnMatchAnd.classList.remove('active');
        resetColumnLimits();
        filterAndRender();
      });

      btnMatchAnd.addEventListener('click', () => {
        State.tagMatchMode = 'AND';
        btnMatchAnd.classList.add('active');
        btnMatchOr.classList.remove('active');
        resetColumnLimits();
        filterAndRender();
      });
    }

    setupSavedViews();

    // Briefing Mode Toggle Slider
    document.querySelectorAll('.briefing-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.mode;
        State.viewScope = mode;
        Storage.setViewScope(mode);
        updateBriefingSliderUI();

        // Reset column limits when switching modes
        resetColumnLimits();
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
        const viewPriority = document.getElementById('widget-view-priority');

        [viewTicker, viewChecklist, viewPriority].forEach(v => { if (v) v.classList.add('hidden'); });

        if (target === 'ticker' && viewTicker) {
          viewTicker.classList.remove('hidden');
        } else if (target === 'priority' && viewPriority) {
          viewPriority.classList.remove('hidden');
          renderPriorityWidget();
        } else if (viewChecklist) {
          viewChecklist.classList.remove('hidden');
        }
      });
    });

    // Progressive Unfold Column Buttons
    document.querySelectorAll('.btn-show-more').forEach(btn => {
      btn.addEventListener('click', () => {
        const cat = btn.dataset.category;
        State.columnLimits[cat] = (State.columnLimits[cat] || DEFAULT_COLUMN_LIMIT) + COLUMN_LOAD_INCREMENT;
        renderKanbanView();
      });
    });

    // Auto-load more cards as the user scrolls near a column's "Show More" button
    ['scroll', 'resize', 'wheel', 'touchmove'].forEach(evt => {
      window.addEventListener(evt, checkAndTriggerColumnAutoExpand, { passive: true });
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
    modalSetup('btn-open-iocwatch', 'iocwatch-modal', ['#btn-close-iocwatch']);
    setupIocWatchPanel();

    if (DOM.btnMarkAllRead) {
      DOM.btnMarkAllRead.addEventListener('click', () => markAllVisibleAsRead());
    }

    if (DOM.btnDailyDigest) {
      DOM.btnDailyDigest.addEventListener('click', () => {
        const DIGEST_CAP = 20;
        const oneDayMs = 24 * 60 * 60 * 1000;
        const nowMs = Date.now();

        const eligible = State.allItems.filter(item => {
          const publishedMs = item.published_at ? new Date(item.published_at).getTime() : 0;
          const isToday = publishedMs > 0 && !isNaN(publishedMs) && (nowMs - publishedMs <= oneDayMs);
          if (!isToday) return false;

          const severity = Components.getItemSeverity(item);
          const cvssBadge = Components.formatCvssBadge(item.cvss_score, item.cvss_severity);
          const epssBadge = Components.formatEpssBadge(item.epss_score, item.epss_percentile);
          const isHighRisk = (cvssBadge && (cvssBadge.cls === 'risk-critical' || cvssBadge.cls === 'risk-high'))
            || (epssBadge && (epssBadge.cls === 'risk-critical' || epssBadge.cls === 'risk-high'));

          return severity === 'critical' || isHighRisk;
        });

        const sorted = eligible.sort((a, b) => Components.getPriorityScore(b) - Components.getPriorityScore(a));
        const truncatedCount = Math.max(0, sorted.length - DIGEST_CAP);
        const digestItems = sorted.slice(0, DIGEST_CAP);

        Components.copyDailyDigest(digestItems);

        if (truncatedCount > 0) {
          setTimeout(() => Components.showToast(`+${truncatedCount} more critical/high item${truncatedCount === 1 ? '' : 's'} not included (top ${DIGEST_CAP} only)`), 2200);
        }
      });
    }

    if (DOM.btnRefresh) DOM.btnRefresh.addEventListener('click', () => fetchFeedData());

    if (DOM.btnResetFilters) {
      DOM.btnResetFilters.addEventListener('click', () => {
        State.searchQuery = '';
        if (DOM.searchInput) DOM.searchInput.value = '';
        if (DOM.btnClearSearch) DOM.btnClearSearch.classList.add('hidden');
        State.triageFilter = 'all';
        Storage.setTriageFilter('all');
        State.viewScope = 'briefing';
        Storage.setViewScope('briefing');
        resetColumnLimits();
        updateBriefingSliderUI();
        updateTriageButtonsUI();
        // State.activeCategory remains 'all'
      });
    }

    if (DOM.searchInput) {
      DOM.searchInput.addEventListener('input', (e) => {
        if (DOM.btnClearSearch) DOM.btnClearSearch.classList.toggle('hidden', e.target.value.length === 0);
        clearTimeout(State.debounceTimer);
        State.debounceTimer = setTimeout(() => {
          State.searchQuery = e.target.value.trim();
          resetColumnLimits();
          filterAndRender();
        }, DEBOUNCE_MS);
      });
    }

    if (DOM.btnClearSearch) {
      DOM.btnClearSearch.addEventListener('click', () => {
        clearTimeout(State.debounceTimer);
        State.searchQuery = '';
        if (DOM.searchInput) {
          DOM.searchInput.value = '';
          DOM.searchInput.focus();
        }
        DOM.btnClearSearch.classList.add('hidden');
        resetColumnLimits();
        filterAndRender();
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
        resetColumnLimits();
        filterAndRender();
      });
    });

    if (DOM.btnSortRecency && DOM.btnSortUrgency) {
      [DOM.btnSortRecency, DOM.btnSortUrgency].forEach(btn => {
        btn.addEventListener('click', () => {
          State.sortMode = btn.dataset.sort;
          Storage.setSortMode(State.sortMode);
          updateSortButtonsUI();
          resetColumnLimits();
          filterAndRender();
        });
      });
    }


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
        resetColumnLimits();
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

    setupCommandPalette();
  }

  // Command Palette (Ctrl/Cmd+K) — fuzzy-jumps to any item in State.allItems by title,
  // source name, or CVE tag. Reuses the .modal-overlay/.modal-card styling already used by
  // the Feeds/Quick Start/Features modals rather than inventing new chrome.
  function setupCommandPalette() {
    const modal = document.getElementById('command-palette-modal');
    const input = document.getElementById('command-palette-input');
    const results = document.getElementById('command-palette-results');
    const openBtn = document.getElementById('btn-open-palette');
    if (!modal || !input || !results) return;

    const openPalette = () => {
      modal.style.display = 'flex';
      modal.classList.remove('hidden');
      modal.setAttribute('aria-hidden', 'false');
      input.value = '';
      renderPaletteResults('');
      setTimeout(() => input.focus(), 0);
    };

    const closePalette = () => {
      modal.style.display = 'none';
      modal.classList.add('hidden');
      modal.setAttribute('aria-hidden', 'true');
      paletteActiveIndex = -1;
      paletteResultItems = [];
    };

    const selectResult = (item) => {
      if (!item) return;
      closePalette();
      window.open(item.link, '_blank', 'noopener,noreferrer');
    };

    const setActiveIndex = (idx) => {
      const rows = results.querySelectorAll('.palette-result-row');
      rows.forEach(r => r.classList.remove('palette-result-active'));
      if (idx >= 0 && idx < rows.length) {
        paletteActiveIndex = idx;
        rows[idx].classList.add('palette-result-active');
        rows[idx].scrollIntoView({ block: 'nearest' });
      } else {
        paletteActiveIndex = -1;
      }
    };

    if (openBtn) openBtn.addEventListener('click', openPalette);

    modal.addEventListener('click', (e) => {
      if (e.target === modal) closePalette();
    });

    input.addEventListener('input', (e) => {
      renderPaletteResults(e.target.value.trim());
      setActiveIndex(paletteResultItems.length > 0 ? 0 : -1);
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closePalette();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (paletteResultItems.length > 0) setActiveIndex((paletteActiveIndex + 1) % paletteResultItems.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (paletteResultItems.length > 0) setActiveIndex((paletteActiveIndex - 1 + paletteResultItems.length) % paletteResultItems.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (paletteActiveIndex >= 0 && paletteResultItems[paletteActiveIndex]) {
          selectResult(paletteResultItems[paletteActiveIndex]);
        }
      }
    });

    results.addEventListener('click', (e) => {
      const row = e.target.closest('.palette-result-row');
      if (!row) return;
      const idx = parseInt(row.dataset.idx, 10);
      selectResult(paletteResultItems[idx]);
    });

    // Global shortcut: Ctrl/Cmd+K opens the palette from anywhere; Escape closes it even when
    // focus isn't in the input (e.g. right after opening, before the setTimeout focus lands).
    document.addEventListener('keydown', (e) => {
      const isMac = navigator.platform ? /Mac/.test(navigator.platform) : /Mac/.test(navigator.userAgent);
      const modKey = isMac ? e.metaKey : e.ctrlKey;
      if (modKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const isOpen = !modal.classList.contains('hidden');
        if (isOpen) closePalette(); else openPalette();
      } else if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
        closePalette();
      }
    });
  }

  function renderPaletteResults(query) {
    const results = document.getElementById('command-palette-results');
    if (!results) return;
    const esc = Components.escapeHtml;

    let matches;
    if (!query) {
      // Empty query: show the top 8 by priority score so the palette is useful the instant it opens.
      matches = [...State.allItems]
        .sort((a, b) => (Components.getPriorityScore ? Components.getPriorityScore(b) - Components.getPriorityScore(a) : 0))
        .slice(0, 8);
    } else {
      const q = query.toLowerCase();
      const terms = q.split(/\s+/).filter(Boolean);
      matches = State.allItems
        .map(item => {
          const haystack = `${item.title || ''} ${(item.source && item.source.name) || ''} ${(item.tags || []).join(' ')}`.toLowerCase();
          const allTermsMatch = terms.every(t => haystack.includes(t));
          if (!allTermsMatch) return null;
          // Simple relevance score: title-start match ranks highest, then title-contains, then other fields.
          let score = 0;
          const titleLower = (item.title || '').toLowerCase();
          if (titleLower.startsWith(q)) score += 100;
          else if (titleLower.includes(q)) score += 50;
          score += (Components.getPriorityScore ? Components.getPriorityScore(item) : 0) * 0.1;
          return { item, score };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score)
        .slice(0, 20)
        .map(m => m.item);
    }

    paletteResultItems = matches;

    if (matches.length === 0) {
      results.innerHTML = `<div class="text-center text-xs text-slate-500 font-mono py-6">No matching items.</div>`;
      return;
    }

    results.innerHTML = matches.map((item, idx) => {
      const severity = Components.getItemSeverity(item);
      const dotCls = severity === 'critical' ? 'bg-rose-500' : (severity === 'warning' ? 'bg-amber-400' : 'bg-sky-400');
      const tierMeta = Components.getTierMeta(item.source && item.source.tier);
      return `
        <div class="palette-result-row flex items-center gap-2 px-2.5 py-2 rounded-md cursor-pointer" data-idx="${idx}">
          <span class="w-1.5 h-1.5 rounded-full ${dotCls} shrink-0"></span>
          <span class="flex-1 min-w-0 text-xs text-slate-200 line-clamp-1">${esc(item.title)}</span>
          <span class="text-[10px] text-slate-500 font-mono shrink-0" title="${esc(tierMeta.label)}">${tierMeta.icon} ${esc(item.source ? item.source.name : '')}</span>
        </div>
      `;
    }).join('');
  }

  // Saved Views: named presets of tags + match mode + search + sort, persisted via
  // Storage.getSavedViews/saveSavedViews (same localStorage-only pattern as every other bit of
  // State). Surfaced as a dropdown next to the tag filter's Match/Clear controls.
  function setupSavedViews() {
    const select = document.getElementById('saved-views-select');
    const btnSave = document.getElementById('btn-save-view');
    const btnDelete = document.getElementById('btn-delete-view');
    if (!select || !btnSave) return;

    renderSavedViewsDropdown();

    select.addEventListener('change', () => {
      const id = select.value;
      if (btnDelete) btnDelete.classList.toggle('hidden', !id);
      if (!id) return;

      const view = State.savedViews.find(v => v.id === id);
      if (!view) return;

      // Apply the preset onto State, then re-sync every piece of UI that mirrors it.
      State.selectedTags = new Set(view.tags || []);
      Storage.saveSelectedTags(State.selectedTags);

      State.tagMatchMode = view.tagMatchMode === 'AND' ? 'AND' : 'OR';
      const btnMatchOr = document.getElementById('btn-tag-match-or');
      const btnMatchAnd = document.getElementById('btn-tag-match-and');
      if (btnMatchOr && btnMatchAnd) {
        btnMatchOr.classList.toggle('active', State.tagMatchMode === 'OR');
        btnMatchAnd.classList.toggle('active', State.tagMatchMode === 'AND');
      }

      State.searchQuery = view.searchQuery || '';
      if (DOM.searchInput) DOM.searchInput.value = State.searchQuery;
      if (DOM.btnClearSearch) DOM.btnClearSearch.classList.toggle('hidden', State.searchQuery.length === 0);

      State.sortMode = view.sortMode === 'urgency' ? 'urgency' : 'recency';
      Storage.setSortMode(State.sortMode);
      updateSortButtonsUI();

      updateTagFilterSummaryUI();
      renderTagCheckboxGrid();
      resetColumnLimits();
      filterAndRender();
      Components.showToast(`Loaded saved view "${view.name}"`);
    });

    // Inline name entry (no native prompt()/confirm() — those block automated tooling and read
    // as jarring in a "premium" UI). Clicking Save swaps the button for a text input + confirm/
    // cancel icons; Enter confirms, Escape cancels.
    const inputGroup = document.getElementById('save-view-input-group');
    const nameInput = document.getElementById('save-view-name-input');
    const btnConfirm = document.getElementById('btn-save-view-confirm');
    const btnCancel = document.getElementById('btn-save-view-cancel');

    const showSaveInput = () => {
      if (!inputGroup || !nameInput) return;
      btnSave.classList.add('hidden');
      inputGroup.classList.remove('hidden');
      inputGroup.classList.add('flex');
      nameInput.value = '';
      setTimeout(() => nameInput.focus(), 0);
    };

    const hideSaveInput = () => {
      if (!inputGroup) return;
      inputGroup.classList.add('hidden');
      inputGroup.classList.remove('flex');
      btnSave.classList.remove('hidden');
    };

    const confirmSaveView = () => {
      const name = nameInput ? nameInput.value.trim() : '';
      if (!name) {
        if (nameInput) nameInput.focus();
        return;
      }

      const view = {
        id: `view_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
        name: name.slice(0, 60),
        tags: Array.from(State.selectedTags),
        tagMatchMode: State.tagMatchMode,
        searchQuery: State.searchQuery,
        sortMode: State.sortMode,
        createdAt: new Date().toISOString()
      };

      State.savedViews.push(view);
      Storage.saveSavedViews(State.savedViews);
      renderSavedViewsDropdown();
      select.value = view.id;
      if (btnDelete) btnDelete.classList.remove('hidden');
      hideSaveInput();
      Components.showToast(`Saved view "${view.name}"`);
    };

    btnSave.addEventListener('click', showSaveInput);

    if (btnConfirm) btnConfirm.addEventListener('click', confirmSaveView);
    if (btnCancel) btnCancel.addEventListener('click', hideSaveInput);

    if (nameInput) {
      nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          confirmSaveView();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          hideSaveInput();
        }
      });
    }

    if (btnDelete) {
      btnDelete.addEventListener('click', () => {
        const id = select.value;
        if (!id) return;
        const view = State.savedViews.find(v => v.id === id);
        State.savedViews = State.savedViews.filter(v => v.id !== id);
        Storage.saveSavedViews(State.savedViews);
        renderSavedViewsDropdown();
        btnDelete.classList.add('hidden');
        Components.showToast(view ? `Deleted view "${view.name}"` : 'Deleted view');
      });
    }
  }

  function renderSavedViewsDropdown() {
    const select = document.getElementById('saved-views-select');
    if (!select) return;
    const currentValue = select.value;
    const options = ['<option value="">Saved Views…</option>']
      .concat(State.savedViews.map(v => `<option value="${Components.escapeHtml(v.id)}">${Components.escapeHtml(v.name)}</option>`));
    select.innerHTML = options.join('');
    if (State.savedViews.some(v => v.id === currentValue)) select.value = currentValue;
  }

  function setupAutoRefresh() {
    setInterval(() => {
      fetchFeedData(true);
      fetchIocData();
    }, REFRESH_INTERVAL_MS);
  }

  document.addEventListener('DOMContentLoaded', () => {
    cacheDOMElements();
    updateBriefingSliderUI();
    updateTriageButtonsUI();
    updateSortButtonsUI();
    applyMetricsCollapsedUI(State.metricsCollapsed);
    applyTagsCollapsedUI(State.tagsCollapsed);
    applySummaryCollapsedUI(State.summaryCollapsed);
    setupEventListeners();
    setupBackToTop();
    setupDesktopMoreMenu();
    fetchFeedData();
    fetchIocData();
    setupAutoRefresh();
  });
  })(window);