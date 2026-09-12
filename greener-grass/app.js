/* app.js - Main Application Controller & UI Renderer */
document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  const APP_VERSION = '14.0-weighted-priorities-and-targets';
  // NOTE: storage key intentionally NOT bumped for this change. categoryPrefs
  // used to be stored as { key: boolean }; setCategoryPrefs() below has a
  // legacy branch that upgrades a bare boolean to { enabled, weight: 3,
  // target: <default> } on load, so old v117 data keeps working -- bumping
  // the key would have silently discarded a returning user's saved cuisine
  // tags/last search/radius too, not just their category booleans.
  const STORAGE_KEY = 'relocation_assessment_prefs_v117';
  // Separate key (and its own separate persistence functions below) from
  // STORAGE_KEY on purpose: a shortlist entry is a saved snapshot of a past
  // search, not a "current session preferences" value, and keeping it in
  // its own key means a prefs-shape migration can never wipe it out.
  const SHORTLIST_STORAGE_KEY = 'relocation_shortlist_v1';
  const SHORTLIST_MAX_ENTRIES = 20;

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
    // NOTE: these defaults must mirror the `checked`/`value` attributes in
    // index.html (grocery/fitness/trails/cuisine on, gas/parks/pharmacy off;
    // weight 3, target per CATEGORY_META). initUI() also re-syncs this from
    // the live DOM controls on load so the two can never drift. Each entry is
    // { enabled, weight (1-5 priority), target (per-category "fully met"
    // count/miles) } -- see getCategoryPrefs()/setCategoryPrefs().
    categoryPrefs: {
      grocery: { enabled: true, weight: 3, target: 3 },
      fitness: { enabled: true, weight: 3, target: 4 },
      trails: { enabled: true, weight: 3, target: 2 },
      cuisine: { enabled: true, weight: 3, target: 6 },
      gas: { enabled: false, weight: 3, target: 3 },
      parks: { enabled: false, weight: 3, target: 3 },
      pharmacy: { enabled: false, weight: 3, target: 2 }
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
    },
    // Saved candidate addresses, independent of the Primary/Compare pair --
    // see addCurrentToShortlist()/renderShortlist() below.
    shortlist: []
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
    btnSaveShortlist: document.getElementById('btn-save-shortlist'),
    shortlistPanel: document.getElementById('shortlist-panel'),
    shortlistList: document.getElementById('shortlist-list'),
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

    hdrPrimaryName: document.getElementById('top-neighborhood-name'),
    hdrPrimaryScore: document.getElementById('top-neighborhood-score'),
    compareScoreCard: document.getElementById('compare-score-card'),
    hdrCompareName: document.getElementById('compare-neighborhood-name'),
    hdrCompareScore: document.getElementById('compare-neighborhood-score'),
    hdrCompareSummary: document.getElementById('match-score-explain'),
    relatedToolsRow: document.getElementById('related-tools-row'),

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

  // Per-category priority weight (1-5 slider) + target ("fully met" count/mi)
  // controls, keyed the same way as CATEGORY_ORDER/state.categoryPrefs.
  const categoryTuneReads = {};
  CATEGORY_ORDER.forEach((key) => {
    categoryTuneReads[key] = {
      checkbox: document.getElementById(`pref-${key}`),
      row: document.getElementById(`pref-${key}`)?.closest('.pref-check-row'),
      weight: document.getElementById(`weight-${key}`),
      weightVal: document.getElementById(`weight-${key}-val`),
      target: document.getElementById(`target-${key}`)
    };
  });

  // The on-page "Live Activity Feed" panel these messages used to render
  // into shipped hidden/unused and has been removed (see project notes);
  // route meaningful status messages to the existing console/localStorage
  // logger instead of letting them go nowhere. Ephemeral per-keystroke
  // pings (addToLog === false) are still skipped, same as before.
  function telemetry(message, level = 'info', addToLog = true) {
    if (!addToLog) return;
    const lvl = level === 'error' ? 'error' : (level === 'warn' ? 'warn' : 'info');
    logger?.[lvl]('app:status', message);
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

  function clampWeight(raw) {
    const n = parseInt(raw, 10);
    if (!Number.isFinite(n) || n < 1) return 3;
    return Math.min(n, 5);
  }

  function clampTarget(key, raw) {
    const fallback = CATEGORY_META[key]?.target || 1;
    const n = parseFloat(raw);
    if (!Number.isFinite(n) || n <= 0) return fallback;
    return n;
  }

  function updateTuneControlsDisabledState(key) {
    const t = categoryTuneReads[key];
    if (!t) return;
    const enabled = !!t.checkbox?.checked;
    if (t.weight) t.weight.disabled = !enabled;
    if (t.target) t.target.disabled = !enabled;
    if (t.row) t.row.classList.toggle('is-disabled', !enabled);
  }

  function getCategoryPrefs() {
    const result = {};
    CATEGORY_ORDER.forEach((key) => {
      const t = categoryTuneReads[key];
      result[key] = {
        enabled: !!t?.checkbox?.checked,
        weight: clampWeight(t?.weight?.value),
        target: clampTarget(key, t?.target?.value)
      };
    });
    return result;
  }

  function setCategoryPrefs(prefs) {
    CATEGORY_ORDER.forEach((key) => {
      const incoming = prefs && prefs[key];
      const current = state.categoryPrefs[key] || {};
      if (incoming && typeof incoming === 'object') {
        state.categoryPrefs[key] = {
          enabled: typeof incoming.enabled === 'boolean' ? incoming.enabled : !!current.enabled,
          weight: clampWeight(incoming.weight != null ? incoming.weight : current.weight),
          target: clampTarget(key, incoming.target != null ? incoming.target : current.target)
        };
      } else if (typeof incoming === 'boolean') {
        // Legacy shape (pre-weighting): a bare boolean meant "enabled" only.
        state.categoryPrefs[key] = {
          enabled: incoming,
          weight: clampWeight(current.weight),
          target: clampTarget(key, current.target)
        };
      }

      const t = categoryTuneReads[key];
      const catPref = state.categoryPrefs[key];
      if (t?.checkbox) t.checkbox.checked = !!catPref.enabled;
      if (t?.weight) t.weight.value = String(catPref.weight);
      if (t?.weightVal) t.weightVal.textContent = String(catPref.weight);
      if (t?.target) t.target.value = String(catPref.target);
      updateTuneControlsDisabledState(key);
    });
  }

  function selectedCategoryKeys() {
    return CATEGORY_ORDER.filter((key) => !!state.categoryPrefs[key]?.enabled);
  }

  // A result's badge/estimate flag should reflect where ITS data actually
  // came from (Overpass vs. the Photon fallback), not just whether this
  // particular call happened to be a fresh fetch -- so every place that
  // builds an assessment (fresh fetch, cache-reuse on resubmit, and a pure
  // re-score after changing weights/targets) goes through this helper and
  // reads usedFallback/categoryFetchStatus off the stored source.
  function sourceLabelFor(usedFallback) {
    return usedFallback ? 'Partial data (fallback source)' : 'Live view';
  }

  function assessmentOptionsForSource(source, radiusMinutes, labelOverride) {
    const usedFallback = !!source?.usedFallback;
    return {
      isEstimated: usedFallback,
      sourceLabel: labelOverride || sourceLabelFor(usedFallback),
      radiusMinutes,
      categoryPrefs: state.categoryPrefs,
      categoryFetchStatus: source?.categoryFetchStatus || null
    };
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
      ? 'Download a formatted HTML report of your current match score results'
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

  // buildReportText()/buildAssessmentReportSection() below are kept as a
  // ready-to-wire plain-text alternative to the HTML report exportReport()
  // uses by default (see buildReportHTML() further down) -- not currently
  // called from any button. Wire a second "Export as .txt" button to
  // buildReportText() + downloadTextFile(..., 'text/plain;charset=utf-8')
  // if a plainer format is ever wanted alongside the HTML one.
  function buildAssessmentReportSection(label, assessment, activeKeys) {
    const lines = [];
    if (!assessment) {
      lines.push(`${label}: No search run yet.`);
      lines.push('');
      return lines;
    }
    lines.push(`${label}: ${assessment.displayName}`);
    lines.push(`Match Score: ${assessment.score}/100`);
    if (assessment.isEstimated) {
      lines.push('Data source: partial (Overpass unavailable; backed by a fallback brand/keyword search -- counts may undercount what\'s actually nearby).');
    }
    lines.push('Category Breakdown:');
    activeKeys.forEach((key) => {
      const meta = CATEGORY_META[key];
      const count = assessment.counts[key] ?? 0;
      const pct = Math.round((assessment.norms[key] || 0) * 100);
      const unit = key === 'trails' ? ' mi' : '';
      const target = assessment.targets?.[key] ?? meta.target;
      const weight = assessment.weights?.[key];
      const weightNote = weight ? `, priority ${weight}/5` : '';
      const unconfirmed = !!assessment.categoryFetchStatus?.[key]?.allTermsFailed;
      const countText = unconfirmed ? "couldn't confirm (fallback lookups failed)" : `${count}${unit} found (${pct}%)`;
      lines.push(`  - ${meta.label} (target ${target}${unit}${weightNote}): ${countText}`);
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

  function downloadTextFile(filename, text, mime = 'text/plain;charset=utf-8') {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function escapeHTML(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function buildAssessmentReportTableHTML(label, assessment, activeKeys) {
    if (!assessment) {
      return `<h2>${escapeHTML(label)}</h2><p>No search run yet.</p>`;
    }

    const rows = activeKeys.map((key) => {
      const meta = CATEGORY_META[key];
      const count = assessment.counts[key] ?? 0;
      const pct = Math.round((assessment.norms[key] || 0) * 100);
      const unit = key === 'trails' ? ' mi' : '';
      const target = assessment.targets?.[key] ?? meta.target;
      const weight = assessment.weights?.[key];
      const unconfirmed = !!assessment.categoryFetchStatus?.[key]?.allTermsFailed;
      const foundText = unconfirmed ? "Couldn't confirm" : `${count}${unit} found`;
      const pctText = unconfirmed ? '—' : `${pct}%`;
      return `<tr>
        <td>${escapeHTML(meta.label)}</td>
        <td>${escapeHTML(String(target))}${unit}</td>
        <td>${weight ? `${weight}/5` : '—'}</td>
        <td>${escapeHTML(foundText)}</td>
        <td>${pctText}</td>
      </tr>`;
    }).join('');

    const sourceNote = assessment.isEstimated
      ? `<p class="note">Data source: partial &mdash; Overpass was unavailable, so this is backed by a fallback brand/keyword search and may undercount what's actually nearby.</p>`
      : '';

    return `
      <h2>${escapeHTML(label)}: ${escapeHTML(assessment.displayName)}</h2>
      <p class="score">Match Score: <strong>${assessment.score}/100</strong></p>
      ${sourceNote}
      <table>
        <thead><tr><th>Category</th><th>Target</th><th>Priority</th><th>Found</th><th>Goal %</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  function buildReportHTML() {
    const activeKeys = selectedCategoryKeys();
    const radiusMinutes = parseInt(controls.transitRadius?.value || '10', 10);
    const radiusMeters = spatial.radiusMetersFromMinutes(radiusMinutes);
    const miles = (radiusMeters / 1609.344).toFixed(1);

    const primarySection = buildAssessmentReportTableHTML('Primary Location', state.assessments.primary, activeKeys);
    const compareSection = state.compareEnabled
      ? buildAssessmentReportTableHTML('Compare Location', state.assessments.compare, activeKeys)
      : '';

    // Self-contained (inline CSS, no external requests) so it opens cleanly
    // as a standalone file and prints/saves-as-PDF reasonably -- meant to be
    // forwarded to a spouse or realtor, unlike the old plain-.txt export.
    return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Relocation Analytics Report</title>
<style>
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1.25rem; color: #1e293b; line-height: 1.5; }
  h1 { font-size: 1.4rem; margin-bottom: 0.2rem; }
  h2 { font-size: 1.1rem; margin-top: 1.9rem; border-bottom: 2px solid #0ea5e9; padding-bottom: 0.3rem; }
  .meta { color: #64748b; font-size: 0.88rem; margin-bottom: 1.25rem; }
  .score { font-size: 1.05rem; }
  table { width: 100%; border-collapse: collapse; margin-top: 0.6rem; font-size: 0.92rem; }
  th, td { text-align: left; padding: 0.45rem 0.6rem; border-bottom: 1px solid #e2e8f0; }
  th { background: #f1f5f9; }
  .note { color: #92400e; font-size: 0.85rem; background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 0.5rem 0.75rem; }
  .footer { margin-top: 2rem; font-size: 0.8rem; color: #94a3b8; }
  @media print { body { margin: 0.5in; max-width: none; } }
</style>
</head>
<body>
  <h1>Relocation Analytics Report</h1>
  <p class="meta">Generated ${escapeHTML(new Date().toLocaleString())} &middot; Transit radius ${radiusMinutes} min (${miles} mi, ~13 mph pace) &middot; Cuisine filters: ${escapeHTML(state.cuisineTags.length ? state.cuisineTags.join(', ') : 'All Cuisines')}</p>
  ${primarySection}
  ${compareSection}
  <p class="footer">Data sources: OpenStreetMap (Photon, Overpass), Open-Meteo Geocoding.</p>
</body>
</html>`;
  }

  function exportReport() {
    if (!state.assessments.primary) {
      telemetry('Run a primary search first to export a report.', 'warn');
      return;
    }
    const html = buildReportHTML();
    const namePart = slugifyForFilename(state.assessments.primary.displayName);
    const dateStamp = new Date().toISOString().slice(0, 10);
    downloadTextFile(`relocation-report-${namePart}-${dateStamp}.html`, html, 'text/html;charset=utf-8');
    telemetry('Report exported.', 'info');
  }

  // --- Saved shortlist -------------------------------------------------
  // Lets a user track more than just the Primary/Compare pair -- a real
  // relocation search usually means comparing a handful of candidate
  // addresses over time, not exactly two at once. Deliberately simple:
  // save, load (re-runs the search, restoring the priority/target snapshot
  // that produced the saved score), and delete. No inline editing.

  function loadShortlist() {
    try {
      const raw = localStorage.getItem(SHORTLIST_STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (Array.isArray(data)) state.shortlist = data;
    } catch (_err) {}
  }

  function saveShortlistToStorage() {
    try {
      localStorage.setItem(SHORTLIST_STORAGE_KEY, JSON.stringify(state.shortlist));
    } catch (_err) {}
  }

  function addCurrentToShortlist() {
    const primary = state.assessments.primary;
    const source = state.sources.primary;
    if (!primary || !source) {
      telemetry('Run a primary search first to save it to your shortlist.', 'warn');
      return;
    }

    const entry = {
      id: `sl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      displayName: primary.displayName,
      query: source.query,
      score: primary.score,
      radiusMinutes: primary.radiusMinutes,
      // A snapshot, not a live reference -- editing sliders afterward must
      // not retroactively change what a saved entry says it was scored on.
      categoryPrefs: JSON.parse(JSON.stringify(state.categoryPrefs)),
      savedAt: new Date().toISOString()
    };

    state.shortlist.unshift(entry);
    if (state.shortlist.length > SHORTLIST_MAX_ENTRIES) {
      state.shortlist.length = SHORTLIST_MAX_ENTRIES;
    }
    saveShortlistToStorage();
    renderShortlist();
    telemetry(`Saved "${geocoder.getShortAddressLabel(entry.displayName, entry.query)}" to your shortlist.`, 'info');
  }

  function removeFromShortlist(id) {
    state.shortlist = state.shortlist.filter((e) => e.id !== id);
    saveShortlistToStorage();
    renderShortlist();
  }

  async function loadFromShortlist(id) {
    const entry = state.shortlist.find((e) => e.id === id);
    if (!entry) return;

    // Restore the priority/target snapshot the saved score was actually
    // computed against, not whatever the sliders currently say -- otherwise
    // "Load" would silently re-score the address under today's settings and
    // the displayed saved score would stop matching what comes back.
    if (entry.categoryPrefs) {
      setCategoryPrefs(entry.categoryPrefs);
      state.categoryPrefs = getCategoryPrefs();
    }
    if (controls.transitRadius && entry.radiusMinutes) {
      controls.transitRadius.value = String(entry.radiusMinutes);
      refreshSliderReadouts();
    }
    if (reads.locationInput) reads.locationInput.value = entry.query;

    await executeSearch(entry.query, 'primary');
    savePrefs();
  }

  function renderShortlist() {
    if (!reads.shortlistList || !reads.shortlistPanel) return;
    reads.shortlistPanel.hidden = state.shortlist.length === 0;
    reads.shortlistList.innerHTML = '';

    state.shortlist.forEach((entry) => {
      const label = geocoder.getShortAddressLabel(entry.displayName, entry.query);

      const row = document.createElement('div');
      row.className = 'shortlist-row';

      const main = document.createElement('div');
      main.className = 'shortlist-row-main';

      const name = document.createElement('span');
      name.className = 'shortlist-name';
      name.textContent = label;
      name.title = entry.displayName || entry.query;

      const meta = document.createElement('span');
      meta.className = 'shortlist-meta';
      const savedDate = new Date(entry.savedAt);
      const dateText = Number.isNaN(savedDate.getTime()) ? '' : ` · saved ${savedDate.toLocaleDateString()}`;
      meta.textContent = `Score ${entry.score}/100${dateText}`;

      main.appendChild(name);
      main.appendChild(meta);

      const actions = document.createElement('div');
      actions.className = 'shortlist-row-actions';

      const loadBtn = document.createElement('button');
      loadBtn.type = 'button';
      loadBtn.className = 'ghost-btn shortlist-load-btn';
      loadBtn.textContent = 'Load';
      loadBtn.title = `Re-run this search: ${label}`;
      loadBtn.addEventListener('click', () => loadFromShortlist(entry.id));

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'ghost-btn shortlist-delete-btn';
      delBtn.textContent = '✕';
      delBtn.setAttribute('aria-label', `Remove ${label} from shortlist`);
      delBtn.addEventListener('click', () => removeFromShortlist(entry.id));

      actions.appendChild(loadBtn);
      actions.appendChild(delBtn);

      row.appendChild(main);
      row.appendChild(actions);
      reads.shortlistList.appendChild(row);
    });
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
    if (reads.relatedToolsRow) {
      reads.relatedToolsRow.hidden = !primary;
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
        reads.hdrCompareSummary.innerHTML = `💡 <strong>Match Score: ${primary.score}/100</strong> across ${activeKeys.length} selected categories, weighted by the priority you set for each below.`;
      } else {
        const diff = Math.abs(primary.score - compare.score);
        const leadText = primary.score === compare.score
          ? 'Both locations match equally well.'
          : primary.score > compare.score
            ? `Primary location leads by ${diff} points (${primary.score} vs ${compare.score}).`
            : `Compare location leads by ${diff} points (${compare.score} vs ${primary.score}).`;
        reads.hdrCompareSummary.innerHTML = `🏆 <strong>${leadText}</strong> Each location earns points per category based on its priority weight and target goal below.`;
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

  // A category's point contribution now depends on its own priority weight
  // relative to the other selected categories in that specific assessment
  // (see scoring.js's weighted-average change), not a flat 100/N split --
  // this computes "how many of the 100 points is this category worth here."
  function maxPointsForCategory(assessment, key) {
    if (!assessment) return 0;
    const selected = assessment.selected || [];
    if (!selected.includes(key)) return 0;
    const weightTotal = selected.reduce((acc, k) => acc + (assessment.weights?.[k] || 1), 0);
    if (!weightTotal) return 0;
    return ((assessment.weights?.[key] || 1) / weightTotal) * 100;
  }

  function renderScoreboardList() {
    if (!reads.scoreboardList) return;
    reads.scoreboardList.innerHTML = '';

    const primary = state.assessments.primary;
    const compare = state.assessments.compare;
    const isCompare = state.compareEnabled && compare;

    CATEGORY_ORDER.forEach((key) => {
      if (!state.categoryPrefs[key]?.enabled) return;

      const meta = CATEGORY_META[key];
      const pCount = primary?.counts[key] ?? 0;
      const cCount = compare?.counts[key] ?? 0;
      const pPlaces = primary?.markers[key] || [];
      const cPlaces = compare?.markers[key] || [];
      const pTarget = primary?.targets?.[key] ?? meta.target;
      const cTarget = compare?.targets?.[key] ?? meta.target;

      // Calculate score breakdown metrics -- each side uses its own
      // assessment's target/weight (they're normally the same live prefs,
      // but a compare assessment can be a slightly older cached snapshot).
      const pMaxPts = maxPointsForCategory(primary, key);
      const cMaxPts = maxPointsForCategory(compare, key);

      const pRatio = Math.min(pCount / pTarget, 1);
      const pPct = Math.round(pRatio * 100);
      const pPts = (pRatio * pMaxPts).toFixed(1);

      const cRatio = Math.min(cCount / cTarget, 1);
      const cPct = Math.round(cRatio * 100);
      const cPts = (cRatio * cMaxPts).toFixed(1);

      const details = document.createElement('details');
      details.className = 'scoreboard-accordion';

      const summary = document.createElement('summary');

      const title = document.createElement('span');
      title.className = 'scoreboard-title';
      title.textContent = `${meta.label} (Target: ${pTarget} ${key === 'trails' ? 'mi' : ''})`;

      const valWrap = document.createElement('span');
      valWrap.className = 'scoreboard-val';

      // A category whose Photon-fallback lookups ALL failed/timed out gets
      // an honest "couldn't confirm" instead of a bare 0 -- a 0 here could
      // otherwise be misread as "confirmed nothing nearby" when really the
      // data collection itself came up empty-handed. See spatial.js's
      // fetchPhotonFallbackData / categoryFetchStatus.
      const pUnconfirmed = !!primary?.categoryFetchStatus?.[key]?.allTermsFailed;
      const cUnconfirmed = !!compare?.categoryFetchStatus?.[key]?.allTermsFailed;
      const pCountLabel = pUnconfirmed ? "couldn't confirm" : (key === 'trails' ? `${pCount} mi` : `${pCount}`);
      const cCountLabel = cUnconfirmed ? "couldn't confirm" : (key === 'trails' ? `${cCount} mi` : `${cCount}`);

      let countTextContent = '';
      if (!primary) {
        countTextContent = 'Waiting... ';
      } else if (isCompare) {
        countTextContent = `P: ${pCountLabel} (${pPts} pts) | C: ${cCountLabel} (${cPts} pts) `;
      } else {
        countTextContent = pUnconfirmed
          ? `${pCountLabel} (+${pPts} pts) `
          : `${pCountLabel}${key === 'trails' ? '' : ' found'} (${pPct}% · +${pPts} pts) `;
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

        const pProgressLabel = pUnconfirmed
          ? `<span style="color: var(--accent-orange, #f59e0b);">Couldn't confirm -- fallback lookups failed</span> (+${pPts} / ${pMaxPts.toFixed(1)} pts)`
          : `${pPct}% (+${pPts} / ${pMaxPts.toFixed(1)} pts)`;

        let breakdownHTML = `
          <div class="breakdown-metric-row">
            <span>Primary Goal Progress (${pCountLabel} of ${pTarget}${key === 'trails' ? ' mi' : ''}):</span>
            <span class="breakdown-pct-val" style="color: ${meta.color};">${pProgressLabel}</span>
          </div>
          <div class="score-progress-track">
            <div class="score-progress-fill" style="width: ${pPct}%; background-color: ${meta.color};"></div>
          </div>
        `;

        if (isCompare) {
          const cProgressLabel = cUnconfirmed
            ? `<span style="color: var(--accent-orange, #f59e0b);">Couldn't confirm -- fallback lookups failed</span> (+${cPts} / ${cMaxPts.toFixed(1)} pts)`
            : `${cPct}% (+${cPts} / ${cMaxPts.toFixed(1)} pts)`;
          breakdownHTML += `
            <div class="breakdown-metric-row" style="margin-top: 0.6rem;">
              <span>Compare Goal Progress (${cCountLabel} of ${cTarget}${key === 'trails' ? ' mi' : ''}):</span>
              <span class="breakdown-pct-val" style="color: ${meta.color};">${cProgressLabel}</span>
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

    const { center, radiusMeters, radiusMinutes, markers, counts, sourceLabel, isEstimated } = assessment;

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
      if (!state.categoryPrefs[key]?.enabled) return;
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
      const activeKeys = CATEGORY_ORDER.filter((key) => !!state.categoryPrefs[key]?.enabled);
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
            <span class="legend-source-badge${isEstimated ? ' is-fallback' : ''}" title="${isEstimated ? 'Overpass was unavailable; these counts come from a backup search of common brand/keyword terms and may undercount what\'s actually nearby.' : 'Counts came from a full live map-data query.'}">${sourceLabel || 'Live View'}</span>
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
        state.assessments[slot] = scoring.buildAssessment(slot, source.query, source.candidate, source.parsed,
          assessmentOptionsForSource(source, radiusMinutes));
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
      let usedFallback = false;
      let categoryFetchStatus = null;

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
        usedFallback = !!overpassData.usedFallback;
        categoryFetchStatus = overpassData.categoryFetchStatus || null;
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
        usedFallback,
        categoryFetchStatus,
        queriedRadiusMinutes: radiusMinutes,
        queryRadiusMeters,
        queriedCategories: selectedKeys.slice(),
        queriedCuisineTags: state.cuisineTags.slice()
      };
      const assessment = scoring.buildAssessment(slot, query, candidate, parsed,
        assessmentOptionsForSource(state.sources[slot], radiusMinutes));
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
        const assessment = scoring.buildAssessment(slot, cachedSource.query, cachedSource.candidate, cachedSource.parsed,
          assessmentOptionsForSource(cachedSource, currentRadiusMinutes, `${sourceLabelFor(cachedSource.usedFallback)} (active)`));
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
    CATEGORY_ORDER.forEach((key) => updateTuneControlsDisabledState(key));
    loadPrefs();
    refreshSliderReadouts();
    renderCuisineDisplay();
    updateUseLastSearchState();
    loadShortlist();
    renderShortlist();

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

    if (reads.btnSaveShortlist) {
      reads.btnSaveShortlist.addEventListener('click', () => {
        addCurrentToShortlist();
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

    CATEGORY_ORDER.forEach((key) => {
      const t = categoryTuneReads[key];
      if (!t) return;

      if (t.checkbox) {
        t.checkbox.addEventListener('change', () => {
          updateTuneControlsDisabledState(key);
          state.categoryPrefs = getCategoryPrefs();
          recomputeAssessmentsFromSources();
        });
      }

      if (t.weight) {
        t.weight.addEventListener('input', () => {
          if (t.weightVal) t.weightVal.textContent = t.weight.value;
        });
        t.weight.addEventListener('change', () => {
          state.categoryPrefs = getCategoryPrefs();
          recomputeAssessmentsFromSources();
        });
      }

      if (t.target) {
        t.target.addEventListener('change', () => {
          // Snap out-of-range/empty input back to a sane value immediately
          // so the displayed target never silently disagrees with what's
          // actually used in scoring.
          t.target.value = String(clampTarget(key, t.target.value));
          state.categoryPrefs = getCategoryPrefs();
          recomputeAssessmentsFromSources();
        });
      }
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
