/* app.js - Main Application Controller & UI Renderer */
document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  const APP_VERSION = '11.7-smart-cache-skip-including-distance';
  const STORAGE_KEY = 'relocation_assessment_prefs_v117';

  const geocoder = window.RelocationGeocoder;
  const spatial = window.RelocationSpatial;
  const scoring = window.RelocationScoring;

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
    categoryPrefs: {
      grocery: true,
      fitness: true,
      trails: true,
      cuisine: true,
      gas: true,
      parks: true,
      pharmacy: true
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

    primaryStatusPill: document.getElementById('primary-status-pill'),
    primaryStatusText: document.getElementById('primary-status-text'),
    compareStatusPill: document.getElementById('compare-status-pill'),
    compareStatusText: document.getElementById('compare-status-text'),

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
    btnApplyCuisines: document.getElementById('btn-apply-cuisines')
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
  }

  function setCompareStatus(text, stateType = 'ready') {
    setStatusPill(reads.compareStatusPill, reads.compareStatusText, text, stateType);
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
    reads.cuisineActiveDisplay.textContent = state.cuisineTags.join(', ');
  }

  function updateUseLastSearchState() {
    if (!reads.btnUseCurrent) return;
    const hasValue = !!state.lastSavedQuery;
    reads.btnUseCurrent.disabled = !hasValue;
    reads.btnUseCurrent.title = hasValue ? 'Use your most recent successful search' : 'No previous search is available yet';
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
      if (!primary || !compare || !state.compareEnabled) {
        reads.hdrCompareSummary.textContent = 'Select preferences and run a search to see what this location matches well.';
      } else if (primary.score === compare.score) {
        reads.hdrCompareSummary.textContent = 'Both locations match equally well.';
      } else if (primary.score > compare.score) {
        reads.hdrCompareSummary.textContent = `Primary location leads by ${primary.score - compare.score} points.`;
      } else {
        reads.hdrCompareSummary.textContent = `Compare location leads by ${compare.score - primary.score} points.`;
      }
    }
  }

  function renderScoreboardList() {
    if (!reads.scoreboardList) return;
    reads.scoreboardList.innerHTML = '';

    const primary = state.assessments.primary;
    const compare = state.assessments.compare;
    const isCompare = state.compareEnabled && compare;

    CATEGORY_ORDER.forEach((key) => {
      if (!state.categoryPrefs[key]) return;

      const meta = CATEGORY_META[key];
      const pCount = primary?.counts[key] ?? 0;
      const cCount = compare?.counts[key] ?? 0;
      const pPlaces = primary?.markers[key] || [];
      const cPlaces = compare?.markers[key] || [];

      const details = document.createElement('details');
      details.className = 'scoreboard-accordion';

      const summary = document.createElement('summary');

      const title = document.createElement('span');
      title.className = 'scoreboard-title';
      title.textContent = isCompare ? `${meta.label} (Primary / Compare)` : `${meta.label} (Target: ${meta.target})`;

      const valWrap = document.createElement('span');
      valWrap.className = 'scoreboard-val';

      const countText = document.createTextNode(
        isCompare
          ? (key === 'trails' ? `${pCount} mi / ${cCount} mi ` : `${pCount} / ${cCount} `)
          : (key === 'trails' ? `${pCount} mi ` : `${pCount} `)
      );
      valWrap.appendChild(countText);

      const chevron = document.createElement('span');
      chevron.className = 'accordion-chevron';
      chevron.textContent = '▼';
      valWrap.appendChild(chevron);

      summary.appendChild(title);
      summary.appendChild(valWrap);
      details.appendChild(summary);

      const placeList = document.createElement('ul');
      placeList.className = 'place-detail-list';

      if (isCompare) {
        const pHeader = document.createElement('div');
        pHeader.className = 'place-detail-section-header';
        pHeader.textContent = `PRIMARY LOCATION PLACES (${pPlaces.length})`;
        placeList.appendChild(pHeader);

        if (pPlaces.length === 0) {
          const emptyLi = document.createElement('li');
          emptyLi.className = 'place-detail-item';
          emptyLi.innerHTML = '<em>No places detected in radius</em>';
          placeList.appendChild(emptyLi);
        } else {
          pPlaces.slice(0, 15).forEach((pt) => {
            const li = document.createElement('li');
            li.className = 'place-detail-item';
            li.textContent = pt.name || 'Nearby point';
            placeList.appendChild(li);
          });
        }

        const cHeader = document.createElement('div');
        cHeader.className = 'place-detail-section-header';
        cHeader.textContent = `COMPARE LOCATION PLACES (${cPlaces.length})`;
        placeList.appendChild(cHeader);

        if (cPlaces.length === 0) {
          const emptyLi = document.createElement('li');
          emptyLi.className = 'place-detail-item';
          emptyLi.innerHTML = '<em>No places detected in radius</em>';
          placeList.appendChild(emptyLi);
        } else {
          cPlaces.slice(0, 15).forEach((pt) => {
            const li = document.createElement('li');
            li.className = 'place-detail-item';
            li.textContent = pt.name || 'Nearby point';
            placeList.appendChild(li);
          });
        }
      } else {
        const pHeader = document.createElement('div');
        pHeader.className = 'place-detail-section-header';
        pHeader.textContent = `DETECTED PLACES (${pPlaces.length})`;
        placeList.appendChild(pHeader);

        if (pPlaces.length === 0) {
          const emptyLi = document.createElement('li');
          emptyLi.className = 'place-detail-item';
          emptyLi.innerHTML = '<em>No places detected in radius</em>';
          placeList.appendChild(emptyLi);
        } else {
          pPlaces.slice(0, 15).forEach((pt) => {
            const li = document.createElement('li');
            li.className = 'place-detail-item';
            li.textContent = pt.name || 'Nearby point';
            placeList.appendChild(li);
          });
        }
      }

      details.appendChild(placeList);
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

  function ensureMap(slot) {
    const el = slot === 'primary' ? reads.routePreviewMap : reads.routePreviewMapCompare;
    if (!el || typeof window.L === 'undefined') return null;

    if (state.maps[slot]) return state.maps[slot];

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
    return map;
  }

  function renderMapForAssessment(slot, assessment) {
    const map = ensureMap(slot);
    const footerEl = slot === 'primary' ? reads.primaryMapFooter : reads.compareMapFooter;
    if (!map || !state.layerGroups[slot]) return;

    const group = state.layerGroups[slot];
    group.clearLayers();

    if (!assessment || !assessment.center) {
      map.setView([39.8283, -98.5795], 4);
      if (footerEl) footerEl.textContent = 'Enter an address to view live map features';
      return;
    }

    const { center, radiusMeters, radiusMinutes, markers, counts, sourceLabel } = assessment;

    map.setView([center.lat, center.lon], 13);
    window.L.circle([center.lat, center.lon], {
      radius: radiusMeters,
      color: '#38bdf8',
      fillColor: '#0284c7',
      fillOpacity: 0.1,
      weight: 2
    }).addTo(group);

    const centerMarker = window.L.circleMarker([center.lat, center.lon], {
      radius: 8,
      color: '#ffffff',
      fillColor: '#0ea5e9',
      fillOpacity: 1,
      weight: 3
    }).addTo(group);
    centerMarker.bindPopup(`<strong>${assessment.displayName}</strong><br>Search center`);

    CATEGORY_ORDER.forEach((key) => {
      if (!state.categoryPrefs[key]) return;
      const list = markers[key] || [];
      const meta = CATEGORY_META[key];

      list.forEach((pt) => {
        const m = window.L.circleMarker([pt.lat, pt.lon], {
          radius: 5,
          color: '#ffffff',
          fillColor: meta.color,
          fillOpacity: 0.9,
          weight: 1.5
        }).addTo(group);
        m.bindPopup(`<strong>${meta.label}: ${pt.name || 'Nearby point'}</strong>`);
      });
    });

    if (footerEl) {
      footerEl.textContent = `${sourceLabel || 'Live view'} | Radius: ${radiusMinutes} min | Grocery: ${counts.grocery} | Fitness: ${counts.fitness} | Trails: ${counts.trails} mi | Cuisine: ${counts.cuisine} | Parks: ${counts.parks}`;
    }

    setTimeout(() => map.invalidateSize(), 150);
  }

  function renderDashboard() {
    const primary = state.assessments.primary;
    const compare = state.assessments.compare;

    renderScoreHeader();
    renderScoreboardList();
    renderMatrix();
    renderMapForAssessment('primary', primary);

    if (reads.compareMapCard) {
      reads.compareMapCard.hidden = !(state.compareEnabled);
    }

    if (state.compareEnabled) {
      renderMapForAssessment('compare', compare);
    }
  }

  function recomputeAssessmentsFromSources() {
    const radiusMinutes = parseInt(controls.transitRadius?.value || '10', 10);
    for (const slot of ['primary', 'compare']) {
      const source = state.sources[slot];
      if (!source) continue;
      state.assessments[slot] = scoring.buildAssessment(slot, source.query, source.candidate, source.parsed, {
        radiusMinutes,
        categoryPrefs: state.categoryPrefs
      });
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
      let sourceLabel = 'Live view';

      try {
        const overpassData = await spatial.runOverpassQuery(overpassQuery);
        parsed = spatial.parseOverpassData(overpassData);
      } catch (_overpassError) {
        telemetry('Primary map server busy. Trying alternate live server...', 'warn', false);
        parsed = await spatial.fetchLiveFallbackData(candidate.center, queryRadiusMeters, selectedKeys, state.cuisineTags);
        sourceLabel = 'Live view (alternate server)';
      }

      if (!parsed || (!spatial.hasAnyDataPoints(parsed) && sourceLabel.includes('alternate'))) {
        throw new Error('Live map servers are busy or rate-limited. Click Search to retry.');
      }

      state.sources[slot] = { query, candidate, parsed, queriedRadiusMinutes: radiusMinutes };
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

  async function executeSearch(rawQuery, slot = 'primary') {
    if (state.loading) {
      telemetry('A search is already running. Please wait a moment.', 'warn', false);
      return;
    }

    const query = String(rawQuery || '').trim();
    if (!query) {
      telemetry(`Enter a search location first.`, 'warn');
      return;
    }

    // Check if we already have valid cached live map source for this exact query, slot AND transit radius
    const currentRadiusMinutes = parseInt(controls.transitRadius?.value || '10', 10);
    const cachedSource = state.sources[slot];

    if (cachedSource && cachedSource.query && cachedSource.parsed && spatial.hasAnyDataPoints(cachedSource.parsed)) {
      const qLower = query.toLowerCase().trim();
      const cQueryLower = String(cachedSource.query || '').toLowerCase().trim();
      const cDisplayLower = String(cachedSource.candidate?.displayName || '').toLowerCase().trim();
      const sameAddress = (qLower === cQueryLower || qLower === cDisplayLower || cDisplayLower.includes(qLower) || qLower.includes(cQueryLower));
      const sameRadius = (cachedSource.queriedRadiusMinutes === currentRadiusMinutes);

      if (sameAddress && sameRadius) {
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
    loadPrefs();
    refreshSliderReadouts();
    renderCuisineDisplay();
    updateUseLastSearchState();

    if (reads.compareToggle) {
      reads.compareToggle.checked = state.compareEnabled;
      if (reads.compareGroup) reads.compareGroup.hidden = !state.compareEnabled;
      if (reads.compareStatusPill) reads.compareStatusPill.hidden = !state.compareEnabled;
      updateSearchButtonText();

      reads.compareToggle.addEventListener('change', () => {
        state.compareEnabled = !!reads.compareToggle.checked;
        if (reads.compareGroup) reads.compareGroup.hidden = !state.compareEnabled;
        if (reads.compareStatusPill) reads.compareStatusPill.hidden = !state.compareEnabled;
        updateSearchButtonText();

        if (!state.compareEnabled) {
          state.sources.compare = null;
          state.assessments.compare = null;
          setCompareStatus('Compare Mode Disabled', 'idle');
        } else {
          setCompareStatus('Ready for second street address search', 'ready');
        }
        renderDashboard();
        savePrefs();
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

    if (controls.transitRadius) {
      controls.transitRadius.addEventListener('input', () => {
        refreshSliderReadouts();
        recomputeAssessmentsFromSources();
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
    }

    if (reads.locationForm) {
      reads.locationForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const primaryQuery = (reads.locationInput?.value || '').trim();
        if (!primaryQuery) {
          telemetry('Enter a primary street address first.', 'warn');
          return;
        }

        if (state.compareEnabled) {
          const compareQuery = (reads.compareInput?.value || '').trim();
          if (!compareQuery) {
            telemetry('Enter a second street address to compare.', 'warn');
            return;
          }
          await executeSearch(primaryQuery, 'primary');
          await new Promise((resolve) => setTimeout(resolve, 400));
          await executeSearch(compareQuery, 'compare');
        } else {
          await executeSearch(primaryQuery, 'primary');
        }
      });
    }

    // Standalone Autocomplete module initialization
    if (window.RelocationAutocomplete) {
      window.RelocationAutocomplete.attachAutocomplete(reads.locationInput, reads.autocompleteList, {
        fetchFn: (val) => geocoder.fetchGeocodeCandidates(val, { limit: 5 })
      });
      window.RelocationAutocomplete.attachAutocomplete(reads.compareInput, null, {
        fetchFn: (val) => geocoder.fetchGeocodeCandidates(val, { limit: 5 })
      });
    }

    telemetry(`Relocation Analytics v${APP_VERSION} initialized. Ready for street address.`, 'info');
    renderDashboard();
  }

  initUI();
});
