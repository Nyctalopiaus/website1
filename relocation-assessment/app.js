/* app.js - Main Application Controller & UI Renderer */
document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  const APP_VERSION = '13.3-typeahead-cancel-and-city-fix';
  const STORAGE_KEY = 'relocation_assessment_prefs_v117';

  const geocoder = window.RelocationGeocoder;
  const spatial = window.RelocationSpatial;
  const scoring = window.RelocationScoring;
  const logger = window.RelocationLogger;

  const CATEGORY_META = scoring.CATEGORY_META;
  const CATEGORY_ORDER = scoring.CATEGORY_ORDER;

  const state = {
    loading: false,
    compareEnabled: false,
    autocompleteActiveIndex: -1,
    searchCandidates: [],
    locationQuery: '',
    locationDisplay: '',
    locationCenter: null,
    lastSavedQuery: '',
    cuisineTags: ['mexican', 'italian', 'sushi', 'thai'],
    // NOTE: these defaults must mirror the `checked` attributes in index.html
    // (grocery/fitness/trails/cuisine on, gas/parks/pharmacy off). initUI() also
    // re-syncs this from the live DOM checkboxes on load so the two can never drift.
    categoryPrefs: {
      grocery: true,
      fitness: true,
      trails: true,
      cuisine: true,
      gas: false,
      parks: false,
      pharmacy: false
    },
    sources: {
      primary: null,
      compare: null
    },
    assessments: {
      primary: null,
      compare: null
    },
    maps: {
      primary: null,
      compare: null
    },
    layerGroups: {
      primary: null,
      compare: null
    }
  };

  const reads = {
    locationForm: document.getElementById('location-search-form'),
    locationInput: document.getElementById('location-search-input'),
    compareInput: document.getElementById('location-compare-input'),
    btnSearch: document.getElementById('btn-main-action'),
    btnClearSearch: document.getElementById('btn-clear-search'),
    compareToggle: document.getElementById('compare-toggle'),
    compareGroup: document.getElementById('compare-input-row'),
    btnUseCurrent: document.getElementById('btn-use-current'),
    btnExportReport: document.getElementById('btn-export-report'),
    autocompleteList: document.getElementById('autocomplete-list'),
    formNotice: document.getElementById('form-notice'),

    primaryStatusWrap: document.getElementById('primary-status-wrap'),
    primaryStatusPill: document.getElementById('primary-status-pill'),
    primaryStatusText: document.getElementById('primary-status-text'),
    btnRetryPrimary: document.getElementById('btn-retry-primary'),

    compareStatusWrap: document.getElementById('compare-status-wrap'),
    compareStatusPill: document.getElementById('compare-status-pill'),
    compareStatusText: document.getElementById('compare-status-text'),
    btnRetryCompare: document.getElementById('btn-retry-compare'),

    telemetryText: document.getElementById('scanner-status'),
    scannerGrid: document.getElementById('scanner-grid'),

    hdrPrimaryName: document.getElementById('top-neighborhood-name'),
    hdrPrimaryScore: document.getElementById('top-neighborhood-score'),
    compareScoreCard: document.getElementById('compare-score-card'),
    hdrCompareName: document.getElementById('compare-neighborhood-name'),
    hdrCompareScore: document.getElementById('compare-neighborhood-score'),
    hdrCompareSummary: document.getElementById('match-score-explain'),

    scoreboardList: document.getElementById('scoreboard-list'),
    matrixHeadRow: document.getElementById('matrix-head-row'),
    matrixTbody: document.getElementById('matrix-tbody'),

    routePreviewMap: document.getElementById('route-preview-map'),
    routePreviewMapCompare: document.getElementById('route-preview-map-compare'),
    compareMapCard: document.getElementById('compare-map-card'),
    primaryMapFooter: document.getElementById('route-preview-meta'),
    compareMapFooter: document.getElementById('route-preview-meta-compare'),

    prefGrocery: document.getElementById('pref-grocery'),
    prefFitness: document.getElementById('pref-fitness'),
    prefTrails: document.getElementById('pref-trails'),
    prefCuisine: document.getElementById('pref-cuisine'),
    prefGas: document.getElementById('pref-gas'),
    prefParks: document.getElementById('pref-parks'),
    prefPharmacy: document.getElementById('pref-pharmacy'),

    cuisineInput: document.getElementById('cuisine-tags-input'),
    cuisineActiveDisplay: document.getElementById('cuisine-tags-active'),
    btnApplyCuisines: document.getElementById('btn-apply-cuisines'),
    btnClearCuisines: document.getElementById('btn-clear-cuisines')
  };

  const controls = {
    transitRadius: document.getElementById('transit-radius'),
    readoutTransitMinutes: document.getElementById('val-transit-radius')
  };

  function nowStamp() {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function telemetry(message, level = 'info', addToLog = true) {
    if (reads.telemetryText) {
      reads.telemetryText.textContent = message;
    }
    if (addToLog && reads.scannerGrid) {
      const item = document.createElement('div');
      item.className = `scanner-item item-${level}`;
      item.textContent = `[${nowStamp()}] ${message}`;
      reads.scannerGrid.prepend(item);
      while (reads.scannerGrid.children.length > 25) {
        reads.scannerGrid.removeChild(reads.scannerGrid.lastChild);
      }
    }
  }

  let formNoticeTimer = null;

  // Surfaces a message where the user is actually looking, near the search
  // controls. Previously these validation messages only went to telemetry(),
  // which writes into the "Live Activity Feed" panel -- a panel that ships
  // hidden in this build, so the warnings were never visible at all.
  function showFormNotice(message, level = 'warn') {
    if (!reads.formNotice) return;
    reads.formNotice.textContent = message;
    reads.formNotice.className = level === 'error' ? 'form-notice form-notice-error' : 'form-notice';
    reads.formNotice.hidden = false;
    clearTimeout(formNoticeTimer);
    formNoticeTimer = setTimeout(() => {
      reads.formNotice.hidden = true;
    }, 6000);
  }

  function hideFormNotice() {
    if (!reads.formNotice) return;
    clearTimeout(formNoticeTimer);
    reads.formNotice.hidden = true;
  }

  function warnUser(message, level = 'warn') {
    telemetry(message, level);
    showFormNotice(message, level);
  }

  function updateSearchButtonText() {
    if (!reads.btnSearch) return;
    if (state.loading) {
      reads.btnSearch.textContent = state.compareEnabled ? 'Comparing...' : 'Searching...';
    } else {
      reads.btnSearch.textContent = state.compareEnabled ? 'Compare' : 'Search';
    }
  }

  function setLoading(isLoading, statusText = '') {
    state.loading = isLoading;
    if (reads.btnSearch) reads.btnSearch.disabled = isLoading;
    updateSearchButtonText();
    if (isLoading && statusText) telemetry(statusText, 'info', false);
  }

  function setStatusPill(pillEl, textEl, text, stateType = 'ready') {
    if (pillEl) {
      pillEl.className = `status-pill status-${stateType}`;
    }
    if (textEl) {
      textEl.textContent = text;
    }
  }

  function setPrimaryStatus(text, stateType = 'ready') {
    setStatusPill(reads.primaryStatusPill, reads.primaryStatusText, text, stateType);
    if (reads.btnRetryPrimary) {
      reads.btnRetryPrimary.hidden = (stateType !== 'error');
    }
  }

  function setCompareStatus(text, stateType = 'ready') {
    setStatusPill(reads.compareStatusPill, reads.compareStatusText, text, stateType);
    if (reads.btnRetryCompare) {
      reads.btnRetryCompare.hidden = (!state.compareEnabled || stateType !== 'error');
    }
  }

  function refreshSliderReadouts() {
    const minutes = parseInt(controls.transitRadius?.value || '10', 10);
    const radiusMeters = spatial.radiusMetersFromMinutes(minutes);
    const miles = (radiusMeters / 1609.344).toFixed(1);

    if (controls.readoutTransitMinutes) {
      controls.readoutTransitMinutes.textContent = `${minutes} min (${miles} mi)`;
    }
  }

  function getCategoryPrefs() {
    return {
      grocery: !!reads.prefGrocery?.checked,
      fitness: !!reads.prefFitness?.checked,
      trails: !!reads.prefTrails?.checked,
      cuisine: !!reads.prefCuisine?.checked,
      gas: !!reads.prefGas?.checked,
      parks: !!reads.prefParks?.checked,
      pharmacy: !!reads.prefPharmacy?.checked
    };
  }

  function setCategoryPrefs(prefs) {
    state.categoryPrefs = { ...state.categoryPrefs, ...prefs };
    if (reads.prefGrocery) reads.prefGrocery.checked = !!state.categoryPrefs.grocery;
    if (reads.prefFitness) reads.prefFitness.checked = !!state.categoryPrefs.fitness;
    if (reads.prefTrails) reads.prefTrails.checked = !!state.categoryPrefs.trails;
    if (reads.prefCuisine) reads.prefCuisine.checked = !!state.categoryPrefs.cuisine;
    if (reads.prefGas) reads.prefGas.checked = !!state.categoryPrefs.gas;
    if (reads.prefParks) reads.prefParks.checked = !!state.categoryPrefs.parks;
    if (reads.prefPharmacy) reads.prefPharmacy.checked = !!state.categoryPrefs.pharmacy;
  }

  function selectedCategoryKeys() {
    return CATEGORY_ORDER.filter((key) => !!state.categoryPrefs[key]);
  }

  function renderCuisineDisplay() {
    if (!reads.cuisineActiveDisplay) return;
    if (!state.cuisineTags || state.cuisineTags.length === 0) {
      reads.cuisineActiveDisplay.textContent = 'All Cuisines';
    } else {
      reads.cuisineActiveDisplay.textContent = state.cuisineTags.join(', ');
    }
  }

  function updateUseLastSearchState() {
    if (!reads.btnUseCurrent) return;
    const hasValue = !!state.lastSavedQuery;
    reads.btnUseCurrent.disabled = !hasValue;
    reads.btnUseCurrent.title = hasValue ? 'Use your most recent successful search' : 'No previous search is available yet';
  }

  function updateExportButtonState() {
    if (!reads.btnExportReport) return;
    const hasData = !!state.assessments.primary;
    reads.btnExportReport.disabled = !hasData;
    reads.btnExportReport.title = hasData
      ? 'Download a text summary of your current match score results'
      : 'Run a search first to enable exporting a report';
  }

  function slugifyForFilename(str) {
    const slug = String(str || 'location')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 40);
    return slug || 'location';
  }

  function buildAssessmentReportSection(label, assessment, activeKeys) {
    const lines = [];
    if (!assessment) {
      lines.push(`${label}: No search run yet.`);
      lines.push('');
      return lines;
    }
    lines.push(`${label}: ${assessment.displayName}`);
    lines.push(`Match Score: ${assessment.score}/100`);
    lines.push('Category Breakdown:');
    activeKeys.forEach((key) => {
      const meta = CATEGORY_META[key];
      const count = assessment.counts[key] ?? 0;
      const pct = Math.round((assessment.norms[key] || 0) * 100);
      const unit = key === 'trails' ? ' mi' : '';
      const targetUnit = key === 'trails' ? ' mi' : '';
      lines.push(`  - ${meta.label} (target ${meta.target}${targetUnit}): ${count}${unit} found (${pct}%)`);
    });
    lines.push('');
    return lines;
  }

  function buildReportText() {
    const activeKeys = selectedCategoryKeys();
    const radiusMinutes = parseInt(controls.transitRadius?.value || '10', 10);
    const radiusMeters = spatial.radiusMetersFromMinutes(radiusMinutes);
    const miles = (radiusMeters / 1609.344).toFixed(1);

    const lines = [];
    lines.push('RELOCATION ANALYTICS REPORT');
    lines.push(`Generated: ${new Date().toLocaleString()}`);
    lines.push('');
    lines.push(`Transit Radius: ${radiusMinutes} min (${miles} mi)`);
    lines.push(`Cuisine Filters: ${state.cuisineTags.length ? state.cuisineTags.join(', ') : 'All Cuisines'}`);
    lines.push(`Selected Categories: ${activeKeys.map((k) => CATEGORY_META[k].label).join(', ') || 'None'}`);
    lines.push('');

    lines.push(...buildAssessmentReportSection('PRIMARY LOCATION', state.assessments.primary, activeKeys));
    if (state.compareEnabled) {
      lines.push(...buildAssessmentReportSection('COMPARE LOCATION', state.assessments.compare, activeKeys));
    }

    lines.push('Data sources: OpenStreetMap (Photon, Overpass), Open-Meteo Geocoding.');
    return lines.join('\n');
  }

  function downloadTextFile(filename, text) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportReport() {
    if (!state.assessments.primary) {
      telemetry('Run a primary search first to export a report.', 'warn');
      return;
    }
    const text = buildReportText();
    const namePart = slugifyForFilename(state.assessments.primary.displayName);
    const dateStamp = new Date().toISOString().slice(0, 10);
    downloadTextFile(`relocation-report-${namePart}-${dateStamp}.txt`, text);
    telemetry('Report exported.', 'info');
  }

  function hideAutocompleteList() {
    if (!reads.autocompleteList) return;
    reads.autocompleteList.hidden = true;
    reads.autocompleteList.innerHTML = '';
    state.autocompleteActiveIndex = -1;
  }

  function showAutocompleteList(candidates, onSelect) {
    if (!reads.autocompleteList) return;
    reads.autocompleteList.innerHTML = '';
    reads.autocompleteList.setAttribute('role', 'listbox');
    reads.autocompleteList.setAttribute('aria-label', 'Address suggestions');
    state.autocompleteActiveIndex = -1;

    candidates.forEach((cand, idx) => {
      const li = document.createElement('li');
      li.className = 'autocomplete-item';
      li.setAttribute('role', 'option');
      li.setAttribute('id', `autocomplete-option-${idx}`);
      li.tabIndex = -1;
      li.innerHTML = `<strong>${cand.displayName}</strong>`;
      li.addEventListener('click', () => {
        onSelect(cand);
        hideAutocompleteList();
      });
      reads.autocompleteList.appendChild(li);
    });

    reads.autocompleteList.hidden = false;
  }

  function renderScoreHeader() {
    const primary = state.assessments.primary;
    const compare = state.assessments.compare;

    if (reads.hdrPrimaryName) {
      reads.hdrPrimaryName.textContent = primary ? primary.displayName : 'Waiting for search...';
    }
    if (reads.hdrPrimaryScore) {
      reads.hdrPrimaryScore.textContent = primary ? String(primary.score) : '--';
    }

    if (reads.compareScoreCard) {
      reads.compareScoreCard.hidden = !(state.compareEnabled);
    }

    if (reads.hdrCompareName) {
      reads.hdrCompareName.textContent = compare ? compare.displayName : 'Waiting for compare...';
    }
    if (reads.hdrCompareScore) {
      reads.hdrCompareScore.textContent = compare ? String(compare.score) : '--';
    }

    if (reads.hdrCompareSummary) {
      if (!primary) {
        reads.hdrCompareSummary.textContent = 'Select preferences and run a search to see what this location matches well. Your 100-point Match Score is calculated by comparing nearby live amenities against the target goals shown below.';
      } else if (!compare || !state.compareEnabled) {
        const activeKeys = selectedCategoryKeys();
        const maxPerCat = (100 / (activeKeys.length || 1)).toFixed(1);
        reads.hdrCompareSummary.innerHTML = `💡 <strong>Match Score: ${primary.score}/100</strong> across ${activeKeys.length} selected categories. Each category contributes up to <strong>+${maxPerCat} pts</strong> toward your score upon reaching its target goal below.`;
      } else {
        const diff = Math.abs(primary.score - compare.score);
        const leadText = primary.score === compare.score
          ? 'Both locations match equally well.'
          : primary.score > compare.score
            ? `Primary location leads by ${diff} points (${primary.score} vs ${compare.score}).`
            : `Compare location leads by ${diff} points (${compare.score} vs ${primary.score}).`;
        reads.hdrCompareSummary.innerHTML = `🏆 <strong>${leadText}</strong> Each location earns points per category based on reaching its target goal below.`;
      }
    }
  }

  function renderPlaceItems(container, placesList, sectionTitle) {
    const listWrap = document.createElement('div');
    listWrap.className = 'place-detail-section-wrap';

    if (sectionTitle) {
      const header = document.createElement('div');
      header.className = 'place-detail-section-header';
      header.textContent = `${sectionTitle} (${placesList.length})`;
      listWrap.appendChild(header);
    }

    const ul = document.createElement('ul');
    ul.className = 'place-detail-list';

    if (!placesList || placesList.length === 0) {
      const emptyLi = document.createElement('li');
      emptyLi.className = 'place-detail-item';
      emptyLi.innerHTML = '<em>No places detected in radius</em>';
      ul.appendChild(emptyLi);
      listWrap.appendChild(ul);
      container.appendChild(listWrap);
      return;
    }

    const INITIAL_LIMIT = 15;
    const overflowLis = [];

    placesList.forEach((pt, idx) => {
      const li = document.createElement('li');
      li.className = 'place-detail-item';
      if (idx >= INITIAL_LIMIT) {
        li.className += ' place-item-overflow';
        li.hidden = true;
        overflowLis.push(li);
      }
      li.textContent = pt.name || 'Nearby point';
      ul.appendChild(li);
    });

    listWrap.appendChild(ul);

    if (overflowLis.length > 0) {
      const btnToggle = document.createElement('button');
      btnToggle.type = 'button';
      btnToggle.className = 'btn-show-more-places';
      btnToggle.textContent = `Show all ${placesList.length} places (+${overflowLis.length} more) ▼`;

      btnToggle.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const currentlyHidden = overflowLis[0].hidden;
        overflowLis.forEach((li) => {
          li.hidden = !currentlyHidden;
        });

        if (currentlyHidden) {
          ul.classList.add('is-expanded');
          btnToggle.textContent = `Show fewer places ▲`;
        } else {
          ul.classList.remove('is-expanded');
          btnToggle.textContent = `Show all ${placesList.length} places (+${overflowLis.length} more) ▼`;
        }
      });

      listWrap.appendChild(btnToggle);
    }

    container.appendChild(listWrap);
  }

  function renderScoreboardList() {
    if (!reads.scoreboardList) return;
    reads.scoreboardList.innerHTML = '';

    const primary = state.assessments.primary;
    const compare = state.assessments.compare;
    const isCompare = state.compareEnabled && compare;
    const activeKeys = selectedCategoryKeys();
    const maxPtsPerCat = activeKeys.length ? (100 / activeKeys.length) : 0;

    CATEGORY_ORDER.forEach((key) => {
      if (!state.categoryPrefs[key]) return;

      const meta = CATEGORY_META[key];
      const pCount = primary?.counts[key] ?? 0;
      const cCount = compare?.counts[key] ?? 0;
      const pPlaces = primary?.markers[key] || [];
      const cPlaces = compare?.markers[key] || [];

      // Calculate score breakdown metrics
      const pRatio = Math.min(pCount / meta.target, 1);
      const pPct = Math.round(pRatio * 100);
      const pPts = (pRatio * maxPtsPerCat).toFixed(1);

      const cRatio = Math.min(cCount / meta.target, 1);
      const cPct = Math.round(cRatio * 100);
      const cPts = (cRatio * maxPtsPerCat).toFixed(1);

      const details = document.createElement('details');
      details.className = 'scoreboard-accordion';

      const summary = document.createElement('summary');

      const title = document.createElement('span');
      title.className = 'scoreboard-title';
      title.textContent = `${meta.label} (Target: ${meta.target} ${key === 'trails' ? 'mi' : ''})`;

      const valWrap = document.createElement('span');
      valWrap.className = 'scoreboard-val';

      let countTextContent = '';
      if (!primary) {
        countTextContent = 'Waiting... ';
      } else if (isCompare) {
        countTextContent = key === 'trails'
          ? `P: ${pCount} mi (${pPts} pts) | C: ${cCount} mi (${cPts} pts) `
          : `P: ${pCount} (${pPts} pts) | C: ${cCount} (${cPts} pts) `;
      } else {
        countTextContent = key === 'trails'
          ? `${pCount} mi (${pPct}% · +${pPts} pts) `
          : `${pCount} found (${pPct}% · +${pPts} pts) `;
      }

      const countText = document.createTextNode(countTextContent);
      valWrap.appendChild(countText);

      const chevron = document.createElement('span');
      chevron.className = 'accordion-chevron';
      chevron.textContent = '▼';
      valWrap.appendChild(chevron);

      summary.appendChild(title);
      summary.appendChild(valWrap);
      details.appendChild(summary);

      // Scoring Breakdown & Visual Progress Bar
      if (primary) {
        const breakdownBox = document.createElement('div');
        breakdownBox.className = 'category-score-breakdown-box';

        let breakdownHTML = `
          <div class="breakdown-metric-row">
            <span>Primary Goal Progress (${pCount} of ${meta.target}${key === 'trails' ? ' mi' : ''}):</span>
            <span class="breakdown-pct-val" style="color: ${meta.color};">${pPct}% (+${pPts} / ${maxPtsPerCat.toFixed(1)} pts)</span>
          </div>
          <div class="score-progress-track">
            <div class="score-progress-fill" style="width: ${pPct}%; background-color: ${meta.color};"></div>
          </div>
        `;

        if (isCompare) {
          breakdownHTML += `
            <div class="breakdown-metric-row" style="margin-top: 0.6rem;">
              <span>Compare Goal Progress (${cCount} of ${meta.target}${key === 'trails' ? ' mi' : ''}):</span>
              <span class="breakdown-pct-val" style="color: ${meta.color};">${cPct}% (+${cPts} / ${maxPtsPerCat.toFixed(1)} pts)</span>
            </div>
            <div class="score-progress-track">
              <div class="score-progress-fill" style="width: ${cPct}%; background-color: ${meta.color}; opacity: 0.85;"></div>
            </div>
          `;
        }

        breakdownBox.innerHTML = breakdownHTML;
        details.appendChild(breakdownBox);
      }

      const placeWrapper = document.createElement('div');
      placeWrapper.className = 'place-detail-wrapper';

      if (isCompare) {
        renderPlaceItems(placeWrapper, pPlaces, 'PRIMARY LOCATION PLACES');
        renderPlaceItems(placeWrapper, cPlaces, 'COMPARE LOCATION PLACES');
      } else {
        renderPlaceItems(placeWrapper, pPlaces, 'DETECTED PLACES');
      }

      details.appendChild(placeWrapper);
      reads.scoreboardList.appendChild(details);
    });
  }

  function renderMatrixRow(label, assessment, keys) {
    const tr = document.createElement('tr');
    const tdLabel = document.createElement('td');
    tdLabel.innerHTML = `<strong>${label}</strong><br><small>${assessment?.displayName || '--'}</small>`;
    tr.appendChild(tdLabel);

    const tdScore = document.createElement('td');
    tdScore.innerHTML = `<strong>${assessment?.score ?? '--'}</strong>`;
    tr.appendChild(tdScore);

    keys.forEach((key) => {
      const td = document.createElement('td');
      const count = assessment?.counts[key] ?? '--';
      td.textContent = key === 'trails' ? `${count} mi` : count;
      tr.appendChild(td);
    });

    return tr;
  }

  function renderMatrix() {
    if (!reads.matrixHeadRow || !reads.matrixTbody) return;

    reads.matrixHeadRow.innerHTML = '';
    reads.matrixTbody.innerHTML = '';

    const primary = state.assessments.primary;
    const compare = state.assessments.compare;

    const thLoc = document.createElement('th');
    thLoc.textContent = 'Location';
    reads.matrixHeadRow.appendChild(thLoc);

    const thScore = document.createElement('th');
    thScore.textContent = 'Score';
    reads.matrixHeadRow.appendChild(thScore);

    const categoryKeys = selectedCategoryKeys();
    categoryKeys.forEach((key) => {
      const th = document.createElement('th');
      th.textContent = CATEGORY_META[key].label;
      reads.matrixHeadRow.appendChild(th);
    });

    reads.matrixTbody.appendChild(renderMatrixRow('Primary', primary, categoryKeys));

    if (state.compareEnabled && compare) {
      reads.matrixTbody.appendChild(renderMatrixRow('Compare', compare, categoryKeys));
    }
  }

  // Creates the Leaflet map for a slot and hands it to onReady once it's safe
  // to use. Leaflet measures its container the instant L.map() runs, and this
  // map card sits inside a CSS grid whose column widths aren't necessarily
  // final on first paint (webfont swap, sibling content, initial layout
  // settle) -- often the container is still genuinely 0x0 at that instant.
  // Initializing Leaflet against a 0-size container and trying to correct it
  // afterward with invalidateSize() turned out not to reliably recover (still
  // produced a torn/partial tile grid in production) -- so instead we wait
  // for the container's first real (non-zero) measurement before ever
  // constructing the map. A ResizeObserver keeps correcting the size for
  // every later real change too (window resize, compare-mode toggling the
  // grid layout, etc.), not just first paint.
  function ensureMap(slot, onReady) {
    const el = slot === 'primary' ? reads.routePreviewMap : reads.routePreviewMapCompare;
    if (!el || typeof window.L === 'undefined') return;

    if (state.maps[slot]) {
      onReady(state.maps[slot]);
      return;
    }

    function createMap() {
      if (state.maps[slot]) {
        onReady(state.maps[slot]);
        return;
      }

      const map = window.L.map(el, {
        zoomControl: true,
        attributionControl: false
      });

      window.L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19
      }).addTo(map);

      const group = window.L.layerGroup().addTo(map);
      state.maps[slot] = map;
      state.layerGroups[slot] = group;

      if (typeof ResizeObserver !== 'undefined') {
        let resizeTimer = null;
        const observer = new ResizeObserver(() => {
          clearTimeout(resizeTimer);
          resizeTimer = setTimeout(() => map.invalidateSize(), 50);
        });
        observer.observe(el);
      } else {
        // Fallback for older browsers without ResizeObserver support.
        window.addEventListener('resize', () => map.invalidateSize());
      }

      onReady(map);
    }

    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      createMap();
      return;
    }

    if (typeof ResizeObserver !== 'undefined') {
      const waitObserver = new ResizeObserver((entries) => {
        const entry = entries[0];
        const w = entry.contentRect ? entry.contentRect.width : el.getBoundingClientRect().width;
        const h = entry.contentRect ? entry.contentRect.height : el.getBoundingClientRect().height;
        if (w > 0 && h > 0) {
          waitObserver.disconnect();
          createMap();
        }
      });
      waitObserver.observe(el);
    } else {
      // No ResizeObserver support: fall back to polling briefly for a real size.
      setTimeout(() => ensureMap(slot, onReady), 100);
    }
  }

  function renderMapForAssessment(slot, assessment) {
    ensureMap(slot, (map) => {
      renderMapOnceReady(slot, assessment, map);
    });
  }

  function renderMapOnceReady(slot, assessment, map) {
    const footerEl = slot === 'primary' ? reads.primaryMapFooter : reads.compareMapFooter;
    if (!map || !state.layerGroups[slot]) return;

    const group = state.layerGroups[slot];
    group.clearLayers();

    const emptyOverlay = slot === 'primary' ? document.getElementById('route-preview-empty') : document.getElementById('route-preview-empty-compare');

    if (!assessment || !assessment.center) {
      map.setView([39.8283, -98.5795], 4);
      if (emptyOverlay) emptyOverlay.hidden = false;
      if (footerEl) footerEl.innerHTML = '';
      return;
    }

    if (emptyOverlay) emptyOverlay.hidden = true;

    const { center, radiusMeters, radiusMinutes, markers, counts, sourceLabel } = assessment;

    const radiusCircle = window.L.circle([center.lat, center.lon], {
      radius: radiusMeters,
      color: '#38bdf8',
      fillColor: '#0284c7',
      fillOpacity: 0.12,
      weight: 2
    }).addTo(group);

    const centerMarker = window.L.circleMarker([center.lat, center.lon], {
      radius: 8,
      color: '#ffffff',
      fillColor: '#0ea5e9',
      fillOpacity: 1,
      weight: 3
    }).addTo(group);
    centerMarker.bindPopup(`<strong>${assessment.displayName}</strong><br>Search Center`);

    CATEGORY_ORDER.forEach((key) => {
      if (!state.categoryPrefs[key]) return;
      const list = markers[key] || [];
      const meta = CATEGORY_META[key];

      list.forEach((pt) => {
        const m = window.L.circleMarker([pt.lat, pt.lon], {
          radius: 5.5,
          color: '#ffffff',
          fillColor: meta.color,
          fillOpacity: 0.95,
          weight: 1.5
        }).addTo(group);
        m.bindPopup(`<strong>${meta.label}: ${pt.name || 'Nearby point'}</strong>`);
      });
    });

    map.invalidateSize({ animate: false });
    try {
      const circleBounds = radiusCircle.getBounds();
      map.fitBounds(circleBounds, { padding: [22, 22], maxZoom: 15 });
    } catch (_err) {
      map.setView([center.lat, center.lon], 13);
    }

    if (footerEl) {
      const activeKeys = CATEGORY_ORDER.filter((key) => !!state.categoryPrefs[key]);
      const miles = (radiusMeters / 1609.344).toFixed(1);

      let legendItemsHTML = `
        <div class="legend-badge-item">
          <span class="legend-dot" style="background-color: #0ea5e9; box-shadow: 0 0 6px #0ea5e9;"></span>
          <span class="legend-name">Center</span>
        </div>
      `;

      activeKeys.forEach((key) => {
        const meta = CATEGORY_META[key];
        const countVal = counts[key] ?? 0;
        const formattedVal = key === 'trails' ? `${countVal} mi` : countVal;
        legendItemsHTML += `
          <div class="legend-badge-item">
            <span class="legend-dot" style="background-color: ${meta.color}; box-shadow: 0 0 6px ${meta.color};"></span>
            <span class="legend-name">${meta.label}</span>
            <span class="legend-count">${formattedVal}</span>
          </div>
        `;
      });

      footerEl.innerHTML = `
        <div class="map-legend-card">
          <div class="legend-header-row">
            <span class="legend-title">📍 Transit Radius: ${radiusMinutes} min (${miles} mi)</span>
            <span class="legend-source-badge">${sourceLabel || 'Live View'}</span>
          </div>
          <div class="legend-badges-grid">
            ${legendItemsHTML}
          </div>
        </div>
      `;
    }

    setTimeout(() => {
      map.invalidateSize({ animate: false });
      try {
        if (radiusCircle) {
          map.fitBounds(radiusCircle.getBounds(), { padding: [22, 22], maxZoom: 15 });
        }
      } catch (_e) {}
    }, 100);
  }

  function renderDashboard() {
    const primary = state.assessments.primary;
    const compare = state.assessments.compare;

    renderScoreHeader();
    renderScoreboardList();
    renderMatrix();
    updateExportButtonState();
    renderMapForAssessment('primary', primary);

    if (reads.compareMapCard) {
      reads.compareMapCard.hidden = !(state.compareEnabled);
    }

    if (state.compareEnabled) {
      renderMapForAssessment('compare', compare);
    }
  }

  // A cached search source can only be reused (without hitting the live APIs
  // again) if it actually queried every category currently selected, at a
  // radius at least as large as what's currently needed, and -- when Cuisine
  // is selected -- with the same cuisine tags. Otherwise the "cached" counts
  // for anything newly added would silently read as zero.
  function sourceCanSatisfy(source, selectedKeys, radiusMinutes) {
    if (!source) return false;

    // A cached source that came back with zero data points for every
    // category (an empty live search, or one salvaged from a mid-failure
    // state) shouldn't be treated as authoritative forever -- re-run it live
    // instead of permanently showing an all-zero result for this location.
    if (!spatial.hasAnyDataPoints(source.parsed)) return false;

    const queriedCategories = source.queriedCategories || [];
    const missingCategory = selectedKeys.some((key) => !queriedCategories.includes(key));
    if (missingCategory) return false;

    const neededMeters = spatial.radiusMetersFromMinutes(radiusMinutes);
    if (neededMeters > (source.queryRadiusMeters || 0)) return false;

    if (selectedKeys.includes('cuisine')) {
      const queriedCuisine = source.queriedCuisineTags || [];
      const currentCuisine = state.cuisineTags || [];
      const sameCuisineSet = queriedCuisine.length === currentCuisine.length
        && queriedCuisine.every((tag) => currentCuisine.includes(tag));
      if (!sameCuisineSet) return false;
    }

    return true;
  }

  async function recomputeAssessmentsFromSources() {
    const radiusMinutes = parseInt(controls.transitRadius?.value || '10', 10);
    const selectedKeys = selectedCategoryKeys();

    for (const slot of ['primary', 'compare']) {
      const source = state.sources[slot];
      if (!source) continue;

      if (sourceCanSatisfy(source, selectedKeys, radiusMinutes)) {
        state.assessments[slot] = scoring.buildAssessment(slot, source.query, source.candidate, source.parsed, {
          radiusMinutes,
          categoryPrefs: state.categoryPrefs
        });
      } else {
        // The current selection needs data this cached source never fetched
        // (a newly-enabled category, a wider radius, or new cuisine tags) --
        // re-run a live search instead of silently showing stale/zero counts.
        telemetry(`Refreshing ${slot} live data for your updated selection...`, 'info', false);
        await runAssessmentForCandidate(slot, source.query, source.candidate);
      }
    }
    renderDashboard();
    savePrefs();
  }

  async function runAssessmentForCandidate(slot, query, candidate) {
    const shortLabel = geocoder.getShortAddressLabel(candidate?.displayName, query);

    if (slot === 'primary') {
      setPrimaryStatus(`Searching: ${shortLabel}...`, 'searching');
    } else {
      setCompareStatus(`Searching: ${shortLabel}...`, 'searching');
    }

    setLoading(true, `Analyzing ${shortLabel}...`);

    try {
      if (slot === 'primary') {
        state.locationQuery = query;
        state.lastSavedQuery = query;
        state.locationDisplay = candidate.displayName;
        state.locationCenter = candidate.center;
        updateUseLastSearchState();
      }

      telemetry(`Analyzing ${shortLabel}...`, 'info');
      telemetry('Gathering nearby places for your selected priorities...', 'info', false);

      const selectedKeys = selectedCategoryKeys();
      const radiusMinutes = parseInt(controls.transitRadius?.value || '10', 10);
      const queryRadiusMeters = spatial.radiusMetersFromMinutes(radiusMinutes) + 700;
      const overpassQuery = spatial.buildOverpassQuery(candidate.center, queryRadiusMeters, selectedKeys, state.cuisineTags);

      let parsed = null;
      const sourceLabel = 'Live view';

      // spatial.runOverpassQuery tries all 5 independent Overpass mirrors
      // first, and only if every mirror fails does it fall back internally
      // to a live Photon-based category search (see spatial.js). There's no
      // second fallback layer to call here -- a prior duplicate fallback
      // call into a since-removed spatial.fetchCategoryPOIs was redundant
      // (and had an argument-order bug) and was removed 2026-08-30.
      try {
        const overpassData = await spatial.runOverpassQuery(overpassQuery, {
          center: candidate.center,
          radiusMeters: queryRadiusMeters,
          selectedKeys
        });
        parsed = spatial.parseOverpassData(overpassData);
      } catch (overpassError) {
        logger?.error('app:search', `All live map servers failed for ${slot} ("${shortLabel}")`, logger?.describeError(overpassError));
      }

      if (!parsed || !spatial.hasAnyDataPoints(parsed)) {
        throw new Error('Live map servers are unavailable or rate-limited right now. Click Search to retry.');
      }

      state.sources[slot] = {
        query,
        candidate,
        parsed,
        queriedRadiusMinutes: radiusMinutes,
        queryRadiusMeters,
        queriedCategories: selectedKeys.slice(),
        queriedCuisineTags: state.cuisineTags.slice()
      };
      const assessment = scoring.buildAssessment(slot, query, candidate, parsed, {
        isEstimated: false,
        sourceLabel,
        radiusMinutes,
        categoryPrefs: state.categoryPrefs
      });
      state.assessments[slot] = assessment;

      if (slot === 'primary') {
        setPrimaryStatus(`Primary Address: ${shortLabel}`, 'success');
      } else {
        setCompareStatus(`Compare Address: ${shortLabel}`, 'success');
      }

      telemetry(`${slot === 'primary' ? 'Primary' : 'Compare'} location ready.`, 'info');
      renderDashboard();
      savePrefs();
    } catch (error) {
      logger?.error('app:search', `${slot} assessment failed for "${shortLabel}"`, logger?.describeError(error));
      if (slot === 'compare') {
        state.sources.compare = null;
        state.assessments.compare = null;
        setCompareStatus(`Compare: ${shortLabel} — Search failed`, 'error');
        telemetry('Compare failed: live map data is unavailable right now.', 'error');
      } else {
        state.sources.primary = null;
        state.assessments.primary = null;
        setPrimaryStatus(`Primary: ${shortLabel} — Search failed`, 'error');
        telemetry('Search failed: live map data is unavailable right now.', 'error');
      }
      renderDashboard();
      savePrefs();
    } finally {
      setLoading(false);
    }
  }

  async function executeSearch(rawQuery, slot = 'primary', forceRetry = false) {
    if (state.loading) {
      warnUser('A search is already running. Please wait a moment.');
      return;
    }

    const query = String(rawQuery || '').trim();
    if (!query) {
      warnUser('Enter a search location first.');
      return;
    }

    if (forceRetry) {
      state.sources[slot] = null;
      telemetry(`Retrying live spatial search for ${slot} location...`, 'info', false);
    }

    // Check if we already have a valid cached live map source for this exact query
    // AND slot that can satisfy the currently selected categories/radius/cuisine.
    const currentRadiusMinutes = parseInt(controls.transitRadius?.value || '10', 10);
    const cachedSource = state.sources[slot];

    if (cachedSource && cachedSource.query && cachedSource.parsed) {
      const qLower = query.toLowerCase().trim();
      const cQueryLower = String(cachedSource.query || '').toLowerCase().trim();
      const cDisplayLower = String(cachedSource.candidate?.displayName || '').toLowerCase().trim();
      const sameAddress = (qLower === cQueryLower || qLower === cDisplayLower || cDisplayLower.includes(qLower) || qLower.includes(cQueryLower));
      const canSatisfy = sourceCanSatisfy(cachedSource, selectedCategoryKeys(), currentRadiusMinutes);

      if (sameAddress && canSatisfy) {
        telemetry(`Reusing active live map data for ${slot}...`, 'info', false);
        const assessment = scoring.buildAssessment(slot, cachedSource.query, cachedSource.candidate, cachedSource.parsed, {
          isEstimated: false,
          sourceLabel: 'Live view (active)',
          radiusMinutes: currentRadiusMinutes,
          categoryPrefs: state.categoryPrefs
        });
        state.assessments[slot] = assessment;
        const shortLabel = geocoder.getShortAddressLabel(cachedSource.candidate?.displayName, query);
        if (slot === 'primary') {
          setPrimaryStatus(`Primary Address: ${shortLabel}`, 'success');
        } else {
          setCompareStatus(`Compare Address: ${shortLabel}`, 'success');
        }
        renderDashboard();
        savePrefs();
        return;
      }
    }

    const shortQuery = geocoder.getShortAddressLabel(null, query);
    if (slot === 'primary') {
      setPrimaryStatus(`Searching: ${shortQuery}...`, 'searching');
    } else {
      setCompareStatus(`Searching: ${shortQuery}...`, 'searching');
    }

    setLoading(true, `Searching ${query}...`);
    try {
      if (slot === 'primary' && reads.scannerGrid) {
        reads.scannerGrid.innerHTML = '';
      }

      telemetry(`Resolving ${slot === 'primary' ? 'primary' : 'compare'} location...`, 'info', false);
      const candidates = await geocoder.fetchGeocodeCandidates(query);

      if (slot === 'primary') {
        state.searchCandidates = candidates;
        hideAutocompleteList();
      }

      const selected = candidates[0];
      await runAssessmentForCandidate(slot, query, selected);
    } catch (error) {
      logger?.error('app:geocode', `Could not resolve "${query}" (${slot})`, logger?.describeError(error));
      if (slot === 'primary') {
        setPrimaryStatus(`Primary: ${shortQuery} — Search failed`, 'error');
      } else {
        setCompareStatus(`Compare: ${shortQuery} — Search failed`, 'error');
      }
      telemetry('Search could not be completed right now. Please try again.', 'error');
      setLoading(false);
    }
  }

  function loadPrefs() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);

      if (data.categoryPrefs) setCategoryPrefs(data.categoryPrefs);
      if (Array.isArray(data.cuisineTags) && data.cuisineTags.length) {
        state.cuisineTags = data.cuisineTags;
      }
      if (data.transitMinutes && controls.transitRadius) {
        controls.transitRadius.value = String(data.transitMinutes);
      }
      if (typeof data.compareEnabled === 'boolean') {
        state.compareEnabled = data.compareEnabled;
      }
      if (data.lastSavedQuery) {
        state.lastSavedQuery = data.lastSavedQuery;
      }
    } catch (_err) {}
  }

  function savePrefs() {
    try {
      const data = {
        app_version: APP_VERSION,
        categoryPrefs: state.categoryPrefs,
        cuisineTags: state.cuisineTags,
        transitMinutes: parseInt(controls.transitRadius?.value || '10', 10),
        compareEnabled: state.compareEnabled,
        lastSavedQuery: state.lastSavedQuery
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (_err) {}
  }

  function initUI() {
    // Always take the checkboxes' actual DOM state as the source of truth first
    // (fixes a bug where the score silently included Gas/Parks/Pharmacy even
    // though those boxes render unchecked on a fresh visit). loadPrefs() below
    // will override this if the user has previously saved preferences.
    state.categoryPrefs = getCategoryPrefs();
    loadPrefs();
    refreshSliderReadouts();
    renderCuisineDisplay();
    updateUseLastSearchState();

    if (reads.compareToggle) {
      reads.compareToggle.checked = state.compareEnabled;
      if (reads.compareGroup) reads.compareGroup.hidden = !state.compareEnabled;
      if (reads.compareStatusWrap) reads.compareStatusWrap.hidden = !state.compareEnabled;
      if (!state.compareEnabled) {
        setCompareStatus('Compare Mode Disabled', 'idle');
      } else if (!state.assessments.compare) {
        setCompareStatus('Ready for second street address search', 'ready');
      }
      updateSearchButtonText();

      reads.compareToggle.addEventListener('change', () => {
        state.compareEnabled = !!reads.compareToggle.checked;
        if (reads.compareGroup) reads.compareGroup.hidden = !state.compareEnabled;
        if (reads.compareStatusWrap) reads.compareStatusWrap.hidden = !state.compareEnabled;

        if (state.compareEnabled) {
          if (state.assessments.compare) {
            const label = geocoder.getShortAddressLabel(state.assessments.compare.displayName);
            setCompareStatus(`Compare Address: ${label}`, 'success');
          } else {
            setCompareStatus('Ready for second street address search', 'ready');
          }
        } else {
          state.sources.compare = null;
          state.assessments.compare = null;
          setCompareStatus('Compare Mode Disabled', 'idle');
        }

        updateSearchButtonText();
        renderDashboard();
        savePrefs();
      });
    }

    if (reads.btnRetryPrimary) {
      reads.btnRetryPrimary.addEventListener('click', () => {
        const query = reads.locationInput?.value || state.sources.primary?.query || '';
        if (query) {
          executeSearch(query, 'primary', true);
        } else {
          warnUser('Enter a primary location first to retry.');
        }
      });
    }

    if (reads.btnRetryCompare) {
      reads.btnRetryCompare.addEventListener('click', () => {
        const query = reads.compareInput?.value || state.sources.compare?.query || '';
        if (query) {
          executeSearch(query, 'compare', true);
        } else {
          warnUser('Enter a second location to compare first.');
        }
      });
    }

    if (reads.btnClearSearch) {
      reads.btnClearSearch.addEventListener('click', () => {
        if (reads.locationInput) reads.locationInput.value = '';
        if (reads.compareInput) reads.compareInput.value = '';
        state.sources.primary = null;
        state.sources.compare = null;
        state.assessments.primary = null;
        state.assessments.compare = null;
        setPrimaryStatus('Ready for primary street address search', 'ready');
        setCompareStatus('Ready for second street address search', 'ready');
        renderDashboard();
      });
    }

    if (reads.btnUseCurrent) {
      reads.btnUseCurrent.addEventListener('click', () => {
        if (!state.lastSavedQuery) return;
        if (reads.locationInput) reads.locationInput.value = state.lastSavedQuery;
        executeSearch(state.lastSavedQuery, 'primary');
      });
    }

    if (reads.btnExportReport) {
      reads.btnExportReport.addEventListener('click', () => {
        exportReport();
      });
    }

    if (controls.transitRadius) {
      let radiusRecomputeTimer = null;
      controls.transitRadius.addEventListener('input', () => {
        refreshSliderReadouts();
        // Debounced: dragging the slider fires many 'input' events, and a
        // recompute can now trigger a real live re-fetch (see
        // sourceCanSatisfy) when the new radius exceeds what was originally
        // queried, so we wait for the user to pause instead of re-running it
        // on every pixel of drag.
        clearTimeout(radiusRecomputeTimer);
        radiusRecomputeTimer = setTimeout(() => {
          recomputeAssessmentsFromSources();
        }, 350);
      });
    }

    [
      reads.prefGrocery,
      reads.prefFitness,
      reads.prefTrails,
      reads.prefCuisine,
      reads.prefGas,
      reads.prefParks,
      reads.prefPharmacy
    ].forEach((el) => {
      if (!el) return;
      el.addEventListener('change', () => {
        state.categoryPrefs = getCategoryPrefs();
        recomputeAssessmentsFromSources();
      });
    });

    if (reads.cuisineInput) {
      const addCuisines = () => {
        const val = (reads.cuisineInput.value || '').trim();
        if (val) {
          const tags = val.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
          tags.forEach((tag) => {
            if (!state.cuisineTags.includes(tag)) state.cuisineTags.push(tag);
          });
          reads.cuisineInput.value = '';
          renderCuisineDisplay();
          recomputeAssessmentsFromSources();
        }
      };

      reads.cuisineInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          addCuisines();
        }
      });

      if (reads.btnApplyCuisines) {
        reads.btnApplyCuisines.addEventListener('click', () => {
          addCuisines();
        });
      }

      if (reads.btnClearCuisines) {
        reads.btnClearCuisines.addEventListener('click', () => {
          state.cuisineTags = [];
          if (reads.cuisineInput) reads.cuisineInput.value = '';
          renderCuisineDisplay();
          recomputeAssessmentsFromSources();
          savePrefs();
          telemetry('Cuisine filters cleared. Cuisine search will now match all restaurants.', 'info');
        });
      }
    }

    if (reads.locationForm) {
      reads.locationForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const primaryQuery = (reads.locationInput?.value || '').trim();
        if (!primaryQuery) {
          warnUser('Enter a primary street address first.');
          return;
        }

        if (state.compareEnabled) {
          const compareQuery = (reads.compareInput?.value || '').trim();
          if (!compareQuery) {
            warnUser('Enter a second street address to compare.');
            return;
          }
          hideFormNotice();
          const pShort = geocoder.getShortAddressLabel(null, primaryQuery);
          const cShort = geocoder.getShortAddressLabel(null, compareQuery);
          setPrimaryStatus(`Searching: ${pShort}...`, 'searching');
          setCompareStatus(`Searching: ${cShort}...`, 'searching');

          await executeSearch(primaryQuery, 'primary');
          await new Promise((resolve) => setTimeout(resolve, 400));
          await executeSearch(compareQuery, 'compare');
        } else {
          hideFormNotice();
          await executeSearch(primaryQuery, 'primary');
        }
      });
    }

    // Standalone Autocomplete module initialization
    // `signal` lets autocomplete.js cancel a stale in-flight lookup (e.g. for
    // "5578 s telluride" typed a moment ago) once a newer one supersedes it,
    // instead of letting both run to completion against the free geocoders.
    if (window.RelocationAutocomplete) {
      window.RelocationAutocomplete.attachAutocomplete(reads.locationInput, reads.autocompleteList, {
        fetchFn: (val, signal) => geocoder.fetchGeocodeCandidates(val, { limit: 5, signal })
      });
      window.RelocationAutocomplete.attachAutocomplete(reads.compareInput, null, {
        fetchFn: (val, signal) => geocoder.fetchGeocodeCandidates(val, { limit: 5, signal })
      });
    }

    // Features Modal Toggle
    // Quick Start Modal Toggle
    const btnOpenQuickstart = document.getElementById('btn-open-quickstart');
    const quickstartModal = document.getElementById('quickstart-modal');
    const btnCloseQuickstart = document.getElementById('btn-close-quickstart');

    if (btnOpenQuickstart && quickstartModal) {
      const openQsModal = () => {
        quickstartModal.style.display = 'flex';
        quickstartModal.classList.remove('hidden');
        quickstartModal.setAttribute('aria-hidden', 'false');
      };
      const closeQsModal = () => {
        quickstartModal.style.display = 'none';
        quickstartModal.classList.add('hidden');
        quickstartModal.setAttribute('aria-hidden', 'true');
      };

      btnOpenQuickstart.addEventListener('click', openQsModal);
      if (btnCloseQuickstart) btnCloseQuickstart.addEventListener('click', closeQsModal);
      quickstartModal.addEventListener('click', (e) => {
        if (e.target === quickstartModal) closeQsModal();
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !quickstartModal.classList.contains('hidden')) {
          closeQsModal();
        }
      });
    }

    // Features Modal Toggle
    const btnOpenFeatures = document.getElementById('btn-open-features');
    const featuresModal = document.getElementById('features-modal');
    const btnCloseFeatures = document.getElementById('btn-close-features');

    if (btnOpenFeatures && featuresModal) {
      const openFeaturesModal = () => {
        featuresModal.style.display = 'flex';
        featuresModal.classList.remove('hidden');
        featuresModal.setAttribute('aria-hidden', 'false');
      };
      const closeFeaturesModal = () => {
        featuresModal.style.display = 'none';
        featuresModal.classList.add('hidden');
        featuresModal.setAttribute('aria-hidden', 'true');
      };

      btnOpenFeatures.addEventListener('click', openFeaturesModal);
      if (btnCloseFeatures) btnCloseFeatures.addEventListener('click', closeFeaturesModal);
      featuresModal.addEventListener('click', (e) => {
        if (e.target === featuresModal) closeFeaturesModal();
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !featuresModal.classList.contains('hidden')) {
          closeFeaturesModal();
        }
      });
    }

    telemetry(`Relocation Analytics v${APP_VERSION} initialized. Ready for street address.`, 'info');
    renderDashboard();
  }

  initUI();
});
