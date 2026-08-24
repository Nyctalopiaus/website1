/**
 * BuildRoute / Homeward Main Application Controller
 * Orchestrates address autocompletion, interactive card ordering/deletion,
 * TSP route optimization, Leaflet map rendering, and report generation.
 */
class HomewardApp {
  constructor() {
    this.currentTour = {
      tourName: 'Homeward Lot Scouting Tour',
      startAddress: '100 Congress Ave, Austin, TX 78701',
      loopBack: true,
      stayDurationMins: 20,
      stops: []
    };
    this.scheduleData = null;
    this.startPointGeocoded = null;
    this.draggedIdx = null;
  }

  init() {
    // 0. Pre-initialize Leaflet Map immediately for sub-second LCP
    window.mapManager.initMap();

    // 1. Load saved tour from LocalStorage or Load Default Sample
    const saved = window.storageManager.loadTour();
    if (saved && saved.stops && saved.stops.length > 0) {
      // Auto-correct any legacy broad county fallback titles or old sample tour name in saved state
      saved.stops.forEach(s => {
        if (s.address && s.address.toLowerCase().includes('calusa pines road') && !s.address.includes('42744')) {
          s.address = '42744 Calusa Pines Rd, Elizabeth, CO 80107';
        }
      });
      if (!saved.tourName || saved.tourName.includes('Austin Hill Country')) {
        saved.tourName = 'House & Lot Scouting Tour';
      }
      this.currentTour = saved;
      this.populateUIFromState();
      this.runOptimizationAndRender();
    } else {
      this.loadSampleData();
    }

    // 2. Attach Autocomplete Engines
    this.initAutocomplete();

    // 3. Initialize Event Listeners & Map Click Pin Dropper
    this.bindEvents();
    this.initMapClickPinDropper();
    window.notesManager.initStarRatingEvents();
  }

  initAutocomplete() {
    const startInput = document.getElementById('input-start-address');
    if (startInput && window.HomewardAutocomplete) {
      window.HomewardAutocomplete.attachAutocomplete(startInput, {
        fetchFn: (query) => window.geocoder.fetchGeocodeCandidates(query),
        onSelect: (candidate) => {
          this.currentTour.startAddress = candidate.displayName;
          this.startPointGeocoded = {
            address: candidate.displayName,
            lat: candidate.lat,
            lng: candidate.lng
          };
          window.storageManager.saveTour(this.currentTour);
        }
      });
    }

    // NOTE: input-add-address used to have address-typeahead autocomplete
    // attached here (fetchFn: geocoder candidates). Removed 2026-08-22 along
    // with the Address/Redfin input-mode toggle — this field now only takes
    // a pasted Redfin URL, which doesn't benefit from address typeahead.
    // See bindEvents() below for the Redfin-URL validation on this input.
  }

  initMapClickPinDropper() {
    if (window.mapManager) {
      window.mapManager.setMapClickCallback(async (lat, lng) => {
        const address = await window.geocoder.reverseGeocode(lat, lng);
        if (confirm(`Add map location to your scouting tour?\n📍 ${address}`)) {
          await this.addStopFromGeocoded(address, lat, lng);
        }
      });
    }
  }

  async loadSampleData() {
    try {
      const resp = await fetch('data/sample-tour.json');
      if (resp.ok) {
        const sample = await resp.json();
        this.currentTour = sample;
        this.populateUIFromState();
        await this.runOptimizationAndRender();
      }
    } catch (e) {
      console.warn('Could not load sample tour json:', e);
    }
  }

  populateUIFromState() {
    const nameInput = document.getElementById('input-tour-name');
    if (nameInput) nameInput.value = this.currentTour.tourName || 'House & Lot Scouting Tour';

    document.getElementById('input-start-address').value = this.currentTour.startAddress || '';
    document.getElementById('input-loopback').checked = !!this.currentTour.loopBack;
    document.getElementById('select-stay-duration').value = this.currentTour.stayDurationMins || 20;

    const prefs = this.currentTour.preferences || {};
    if (document.getElementById('pref-max-price')) document.getElementById('pref-max-price').value = prefs.maxPrice || '';
    if (document.getElementById('pref-min-lot')) document.getElementById('pref-min-lot').value = prefs.minLotSqFt || '';
    if (document.getElementById('pref-min-sqft')) document.getElementById('pref-min-sqft').value = prefs.minHomeSqFt || '';
    if (document.getElementById('pref-max-hoa')) document.getElementById('pref-max-hoa').value = prefs.maxHoa !== undefined ? prefs.maxHoa : '';
    if (document.getElementById('pref-min-year')) document.getElementById('pref-min-year').value = prefs.minYearBuilt || '';
    if (document.getElementById('pref-facing')) document.getElementById('pref-facing').value = prefs.prefFacing || '';
    if (document.getElementById('pref-terrain')) document.getElementById('pref-terrain').value = prefs.prefTerrain || '';
    if (document.getElementById('pref-solar')) document.getElementById('pref-solar').checked = !!prefs.prefSolar;

    this.renderTargetList();
  }

  renderTargetList() {
    const container = document.getElementById('target-address-list');
    const badge = document.getElementById('target-count-badge');
    if (badge) badge.textContent = this.currentTour.stops.length;

    if (!container) return;

    if (this.currentTour.stops.length === 0) {
      container.innerHTML = `
        <div class="text-center py-6 text-slate-500 text-xs">
          <p>No scouting sites added yet.</p>
          <p class="text-[11px] text-slate-600 mt-1">Type an address above or click on the map to add pins.</p>
        </div>
      `;
      return;
    }

    let html = '';
    this.currentTour.stops.forEach((stop, idx) => {
      html += `
        <div class="target-card-item bg-slate-900 border border-slate-800/90 hover:border-sky-500/40 rounded-xl p-2.5 flex items-center justify-between gap-2 group" draggable="true" data-idx="${idx}">
          <div class="flex items-center gap-2 overflow-hidden flex-1">
            <span class="drag-handle text-slate-600 hover:text-slate-400 text-xs font-mono select-none px-0.5" title="Drag to reorder">⋮⋮</span>
            <span class="w-5 h-5 rounded-full bg-sky-500/20 text-sky-400 font-bold text-[11px] flex items-center justify-center flex-shrink-0">
              ${idx + 1}
            </span>
            <span class="text-xs font-medium text-slate-200 truncate" title="${stop.address}">${stop.address}</span>
          </div>

          <div class="flex items-center gap-1 flex-shrink-0">
            <button onclick="window.homewardApp.moveStop(${idx}, ${idx - 1})" ${idx === 0 ? 'disabled' : ''} class="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800 text-slate-300 text-[10px] flex items-center justify-center transition-colors" title="Move Up">
              ▲
            </button>
            <button onclick="window.homewardApp.moveStop(${idx}, ${idx + 1})" ${idx === this.currentTour.stops.length - 1 ? 'disabled' : ''} class="w-5 h-5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:hover:bg-slate-800 text-slate-300 text-[10px] flex items-center justify-center transition-colors" title="Move Down">
              ▼
            </button>
            <button onclick="window.homewardApp.deleteStop(${idx})" class="w-5 h-5 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs flex items-center justify-center transition-colors ml-1" title="Delete address">
              ✕
            </button>
          </div>
        </div>
      `;
    });

    container.innerHTML = html;
    this.bindDragAndDropEvents(container);
  }

  bindDragAndDropEvents(container) {
    const items = container.querySelectorAll('.target-card-item');
    items.forEach((item) => {
      item.addEventListener('dragstart', (e) => {
        this.draggedIdx = parseInt(item.getAttribute('data-idx'));
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
      });

      item.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      });

      item.addEventListener('drop', (e) => {
        e.preventDefault();
        const targetIdx = parseInt(item.getAttribute('data-idx'));
        if (this.draggedIdx !== null && this.draggedIdx !== targetIdx) {
          this.moveStop(this.draggedIdx, targetIdx);
        }
      });

      item.addEventListener('dragend', () => {
        item.classList.remove('dragging');
        this.draggedIdx = null;
      });
    });
  }

  moveStop(fromIdx, toIdx) {
    if (fromIdx < 0 || fromIdx >= this.currentTour.stops.length) return;
    if (toIdx < 0 || toIdx >= this.currentTour.stops.length) return;

    const movedItem = this.currentTour.stops.splice(fromIdx, 1)[0];
    this.currentTour.stops.splice(toIdx, 0, movedItem);

    this.renderTargetList();
    window.storageManager.saveTour(this.currentTour);
    if (this.startPointGeocoded) {
      this.recalculateScheduleOnly();
    }
  }

  deleteStop(idx) {
    if (idx < 0 || idx >= this.currentTour.stops.length) return;

    this.currentTour.stops.splice(idx, 1);
    this.renderTargetList();
    window.storageManager.saveTour(this.currentTour);

    if (this.currentTour.stops.length === 0) {
      window.mapManager.clearMap();
      this.renderItineraryList();
    } else if (this.startPointGeocoded) {
      this.runOptimizationAndRender();
    }
  }

  // Redfin-URL-only gate for the single-stop "Add" input (see bindEvents()).
  // Deliberately loose — same host check as the parsing regex below, not a
  // full URL validator — good enough to catch "typed a plain address by
  // habit" and give a clear message, not meant as a security boundary.
  isRedfinListingUrl(str) {
    if (!str) return false;
    return /^https?:\/\/([a-z0-9-]+\.)?redfin\.com\//i.test(str.trim());
  }

  parseRedfinUrlToAddress(url) {
    if (!url) return '';
    const trimmed = url.trim();
    const match = trimmed.match(/redfin\.com\/([A-Za-z]{2})\/([^\/]+)\/([^\/]+)/i);
    if (match) {
      const state = match[1].toUpperCase();
      const city = match[2].replace(/-/g, ' ');
      const streetRaw = match[3].replace(/-/g, ' ');

      const zipMatch = streetRaw.match(/^(.*?)\s*(\d{5})$/);
      if (zipMatch) {
        const streetName = zipMatch[1];
        const zipCode = zipMatch[2];
        return `${streetName}, ${city}, ${state} ${zipCode}`;
      }
      return `${streetRaw}, ${city}, ${state}`;
    }
    return trimmed;
  }

  async addStopFromGeocoded(addressText, lat = null, lng = null, originalRedfinUrl = null) {
    let cleanTarget = addressText;
    let redfinUrl = originalRedfinUrl;

    if (addressText.startsWith('http://') || addressText.startsWith('https://') || addressText.includes('redfin.com')) {
      redfinUrl = addressText.trim();
      cleanTarget = this.parseRedfinUrlToAddress(redfinUrl);
    }

    const cleaned = window.geocoder.cleanAddress(cleanTarget);
    if (!cleaned) return;

    // Prevent duplicate entries
    const isDup = this.currentTour.stops.some(s => s.address.toLowerCase() === cleaned.toLowerCase());
    if (isDup) {
      alert(`Address "${cleaned}" is already in your site list.`);
      return;
    }

    let latVal = lat;
    let lngVal = lng;

    if (!latVal || !lngVal) {
      const geo = await window.geocoder.geocodeAddress(cleaned);
      if (!geo) {
        alert(`Could not resolve coordinates for "${cleaned}". Please check address spelling.`);
        return;
      }
      latVal = geo.lat;
      lngVal = geo.lng;
    }

    // 1. Check 7-Day Property Cache DB (0ms Local / Server SQLite)
    const cachedProp = await window.storageManager.getCachedProperty(cleaned);
    let elevFt = cachedProp ? cachedProp.elevationFt : null;
    let autoTerrain = cachedProp ? (cachedProp.terrain || 'Flat') : 'Flat';
    let autoFacing = cachedProp ? (cachedProp.facingDirection || '') : '';
    let autoLotSize = cachedProp ? (cachedProp.lotSize || '') : '';
    let isAuto = !!cachedProp;

    const newStop = {
      id: `stop-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      address: cleaned,
      redfinUrl: redfinUrl || (cachedProp ? (cachedProp.redfinUrl || cachedProp.url || null) : null),
      lat: latVal,
      lng: lngVal,
      price: cachedProp ? (cachedProp.price || '') : '',
      lotSize: autoLotSize,
      sqft: cachedProp ? (cachedProp.sqft || '') : '',
      elevationFt: elevFt,
      isAutoDetected: isAuto,
      rating: 3,
      terrain: autoTerrain,
      facingDirection: autoFacing,
      hasSolar: false,
      hoaNotes: cachedProp ? (cachedProp.hoaNotes || '') : '',
      pros: [],
      cons: [],
      notes: '',
      photoUrl: cachedProp ? (cachedProp.photoUrl || '') : '',
      visited: false
    };

    this.currentTour.stops.push(newStop);
    this.renderTargetList();
    window.storageManager.saveTour(this.currentTour);

    if (!this.startPointGeocoded && this.currentTour.startAddress) {
      this.startPointGeocoded = await window.geocoder.geocodeAddress(this.currentTour.startAddress);
    }
    if (!this.startPointGeocoded && this.currentTour.stops.length > 0) {
      const first = this.currentTour.stops[0];
      this.startPointGeocoded = { address: first.address, lat: first.lat, lng: first.lng };
    }
    await this.runOptimizationAndRender();
  }

  bindEvents() {
    const inputAdd = document.getElementById('input-add-address');

    // Add Address Button — Redfin URL only (see isRedfinListingUrl()).
    // Off-Redfin lots go through the map-click pin dropper instead
    // (initMapClickPinDropper), which is address/reverse-geocode based by
    // necessity and unaffected by this restriction.
    const btnAdd = document.getElementById('btn-add-address');
    if (btnAdd && inputAdd) {
      const attemptAdd = async () => {
        const val = inputAdd.value.trim();
        if (!val) return;
        if (!this.isRedfinListingUrl(val)) {
          alert('Please paste a Redfin listing URL (e.g. https://www.redfin.com/CO/...). No Redfin listing for this lot? Click directly on the map instead to drop a pin.');
          return;
        }
        await this.addStopFromGeocoded(val);
        inputAdd.value = '';
      };

      btnAdd.addEventListener('click', attemptAdd);

      inputAdd.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          await attemptAdd();
        }
      });
    }

    // Tour Name Input Change
    const tourNameInput = document.getElementById('input-tour-name');
    if (tourNameInput) {
      tourNameInput.addEventListener('input', (e) => {
        this.currentTour.tourName = e.target.value.trim() || 'House & Lot Scouting Tour';
        window.storageManager.saveTour(this.currentTour);
      });
    }

    // Buyer Preference Input Change Listeners
    const saveAndReScore = () => {
      if (!this.currentTour.preferences) this.currentTour.preferences = {};
      this.currentTour.preferences.maxPrice = document.getElementById('pref-max-price').value;
      this.currentTour.preferences.minLotSqFt = document.getElementById('pref-min-lot').value;
      this.currentTour.preferences.minHomeSqFt = document.getElementById('pref-min-sqft').value;
      this.currentTour.preferences.maxHoa = document.getElementById('pref-max-hoa').value;
      this.currentTour.preferences.minYearBuilt = document.getElementById('pref-min-year').value;
      this.currentTour.preferences.prefFacing = document.getElementById('pref-facing').value;
      this.currentTour.preferences.prefTerrain = document.getElementById('pref-terrain').value;
      this.currentTour.preferences.prefSolar = document.getElementById('pref-solar').checked;

      window.storageManager.saveTour(this.currentTour);
      this.renderTargetList();
      this.renderItineraryList();
    };

    ['pref-max-price', 'pref-min-lot', 'pref-min-sqft', 'pref-max-hoa', 'pref-min-year', 'pref-facing', 'pref-terrain', 'pref-solar'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', saveAndReScore);
    });

    // Optimize Button Click
    document.getElementById('btn-optimize').addEventListener('click', () => {
      this.handleOptimizeTrigger();
    });

    // Stay Duration Change
    document.getElementById('select-stay-duration').addEventListener('change', (e) => {
      this.currentTour.stayDurationMins = parseInt(e.target.value);
      this.recalculateScheduleOnly();
    });

    // Loop Back Toggle Change
    document.getElementById('input-loopback').addEventListener('change', (e) => {
      this.currentTour.loopBack = e.target.checked;
      this.runOptimizationAndRender();
    });

    // CSV File Import Button
    const csvFileInput = document.getElementById('csv-file-input');
    if (csvFileInput) {
      csvFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) this.handleCSVUpload(file);
      });
    }

    // Bulk Paste Modal Events
    const btnOpenPaste = document.getElementById('btn-open-paste-modal');
    const modalPaste = document.getElementById('bulk-paste-modal');
    const btnClosePaste = document.getElementById('close-paste-modal-btn');
    const btnCancelPaste = document.getElementById('cancel-paste-btn');
    const btnSubmitPaste = document.getElementById('submit-paste-btn');
    const textareaPaste = document.getElementById('bulk-paste-textarea');

    if (btnOpenPaste && modalPaste) {
      btnOpenPaste.addEventListener('click', () => modalPaste.classList.remove('hidden'));
    }
    const closePasteModal = () => modalPaste && modalPaste.classList.add('hidden');
    if (btnClosePaste) btnClosePaste.addEventListener('click', closePasteModal);
    if (btnCancelPaste) btnCancelPaste.addEventListener('click', closePasteModal);

    if (btnSubmitPaste && textareaPaste) {
      btnSubmitPaste.addEventListener('click', async () => {
        const text = textareaPaste.value.trim();
        if (!text) {
          closePasteModal();
          return;
        }
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        closePasteModal();

        const statusBox = document.getElementById('geocoding-status');
        if (statusBox) statusBox.classList.remove('hidden');

        for (let i = 0; i < lines.length; i++) {
          if (statusBox) statusBox.textContent = `Batch Geocoding ${i + 1} of ${lines.length}: "${lines[i].slice(0, 25)}..."`;
          await this.addStopFromGeocoded(lines[i]);
        }

        if (statusBox) statusBox.classList.add('hidden');
        textareaPaste.value = '';
      });
    }

    // Export Master CSV
    document.getElementById('btn-export-csv').addEventListener('click', () => {
      window.storageManager.exportToCSV(this.currentTour, this.scheduleData);
    });

    // Export JSON Backup
    document.getElementById('btn-export-json').addEventListener('click', () => {
      window.storageManager.exportToJSON(this.currentTour);
    });

    // Load Sample Tour
    document.getElementById('btn-load-sample').addEventListener('click', () => {
      this.loadSampleData();
    });

    // Clear Tour
    document.getElementById('btn-clear-tour').addEventListener('click', () => {
      if (confirm('Clear all stops and reset tour?')) {
        this.currentTour.stops = [];
        window.storageManager.clearTour();
        this.populateUIFromState();
        window.mapManager.clearMap();
        this.renderItineraryList();
      }
    });

    // Open Route Preview Modal
    const btnOpenRoutePreview = document.getElementById('btn-open-route-preview');
    if (btnOpenRoutePreview) {
      btnOpenRoutePreview.addEventListener('click', () => {
        if (window.routePreviewManager) {
          window.routePreviewManager.openPreview(this.currentTour, this.scheduleData);
        }
      });
    }

    // Close Route Preview Modal
    const btnCloseRoutePreview = document.getElementById('btn-close-route-preview');
    if (btnCloseRoutePreview) {
      btnCloseRoutePreview.addEventListener('click', () => {
        if (window.routePreviewManager) {
          window.routePreviewManager.closePreview();
        }
      });
    }

    // Generate Executive Report
    document.getElementById('btn-generate-report').addEventListener('click', () => {
      window.reportGenerator.generateReport(this.currentTour, this.scheduleData);
    });

    // Print Report
    document.getElementById('btn-print-report').addEventListener('click', () => {
      window.reportGenerator.printReport();
    });

    // Close Report Modal
    document.getElementById('btn-close-report').addEventListener('click', () => {
      window.reportGenerator.closeReport();
    });

    // Close Notebook Modal
    document.getElementById('close-notebook-btn').addEventListener('click', () => {
      window.notesManager.closeNotebook();
    });

    // Open Quick Start Guide
    document.getElementById('btn-open-quickstart').addEventListener('click', () => {
      document.getElementById('quickstart-modal').classList.remove('hidden');
    });

    // Close Quick Start Guide
    document.getElementById('btn-close-quickstart').addEventListener('click', () => {
      document.getElementById('quickstart-modal').classList.add('hidden');
    });

    // Open Sync Modal
    document.getElementById('btn-open-sync-modal').addEventListener('click', () => {
      document.getElementById('sync-modal').classList.remove('hidden');
    });

    // Close Sync Modal
    document.getElementById('close-sync-modal-btn').addEventListener('click', () => {
      document.getElementById('sync-modal').classList.add('hidden');
    });

    // Push This Device's Tour to Cloud Sync
    document.getElementById('btn-sync-push').addEventListener('click', () => {
      this.handleSyncPush();
    });

    // Copy Sync Code to Clipboard
    document.getElementById('btn-sync-copy-code').addEventListener('click', () => {
      this.handleSyncCopyCode();
    });

    // Pull & Merge a Tour from Cloud Sync
    document.getElementById('btn-sync-pull').addEventListener('click', () => {
      this.handleSyncPull();
    });
  }

  // Pushes the current device's tour to sync.php and displays the code the
  // other device will use to pull it. See js/sync.js for the wire format.
  async handleSyncPush() {
    const btn = document.getElementById('btn-sync-push');
    const resultBox = document.getElementById('sync-push-result');
    const codeSpan = document.getElementById('sync-push-code');
    const expiryP = document.getElementById('sync-push-expiry');
    const errorP = document.getElementById('sync-push-error');

    resultBox.classList.add('hidden');
    errorP.classList.add('hidden');
    btn.disabled = true;
    const originalLabel = btn.textContent;
    btn.textContent = 'Pushing...';

    try {
      const result = await window.syncManager.pushTour(this.currentTour);
      codeSpan.textContent = result.code;
      const expiresDate = new Date(result.expiresAt);
      expiryP.textContent = `Expires ${expiresDate.toLocaleDateString()} — enter this code on your other device.`;
      resultBox.classList.remove('hidden');
    } catch (err) {
      errorP.textContent = window.syncManager.describeError(err);
      errorP.classList.remove('hidden');
    } finally {
      btn.disabled = false;
      btn.textContent = originalLabel;
    }
  }

  handleSyncCopyCode() {
    const codeSpan = document.getElementById('sync-push-code');
    const code = codeSpan.textContent.trim();
    if (!code) return;

    const copyBtn = document.getElementById('btn-sync-copy-code');
    const markCopied = () => {
      copyBtn.textContent = 'Copied!';
      setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500);
    };

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(code).then(markCopied).catch(() => {});
    } else {
      try {
        const ta = document.createElement('textarea');
        ta.value = code;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        markCopied();
      } catch (e) {
        // Clipboard unavailable; the code is still visible on screen to copy by hand.
      }
    }
  }

  // Pulls a tour by code from sync.php and merges it into this device's
  // tour by address (see storageManager.mergeSyncedStops) — same
  // non-destructive merge behavior as CSV import, so pulling never erases
  // a stop that only exists on this device.
  async handleSyncPull() {
    const input = document.getElementById('sync-pull-code-input');
    const errorP = document.getElementById('sync-pull-error');
    const successP = document.getElementById('sync-pull-success');
    const btn = document.getElementById('btn-sync-pull');

    errorP.classList.add('hidden');
    successP.classList.add('hidden');

    const code = input.value.trim();
    if (!code) {
      errorP.textContent = `Enter the ${SyncManager.CODE_LENGTH}-character code from the other device.`;
      errorP.classList.remove('hidden');
      return;
    }

    btn.disabled = true;
    const originalLabel = btn.textContent;
    btn.textContent = 'Pulling...';

    try {
      const result = await window.syncManager.pullTour(code);
      const incomingStops = (result.tour && Array.isArray(result.tour.stops)) ? result.tour.stops : [];

      // Replace existing stops and settings with the exact ones from the sync code
      this.currentTour.stops = incomingStops;

      if (result.tour) {
        if (result.tour.tourName) this.currentTour.tourName = result.tour.tourName;
        if (result.tour.startAddress) this.currentTour.startAddress = result.tour.startAddress;
        if (result.tour.loopBack !== undefined) this.currentTour.loopBack = result.tour.loopBack;
        if (result.tour.stayDurationMins !== undefined) this.currentTour.stayDurationMins = result.tour.stayDurationMins;
        if (result.tour.preferences) this.currentTour.preferences = result.tour.preferences;
      }

      this.populateUIFromState();
      window.storageManager.saveTour(this.currentTour);
      await this.handleOptimizeTrigger();

      successP.textContent = `Loaded ${incomingStops.length} stop${incomingStops.length === 1 ? '' : 's'} from the synced tour.`;
      successP.classList.remove('hidden');
      input.value = '';
    } catch (err) {
      errorP.textContent = window.syncManager.describeError(err);
      errorP.classList.remove('hidden');
    } finally {
      btn.disabled = false;
      btn.textContent = originalLabel;
    }
  }

  async handleOptimizeTrigger() {
    const startAddrText = document.getElementById('input-start-address').value.trim();

    if (!startAddrText) {
      alert('Please enter a Starting Address.');
      return;
    }

    if (this.currentTour.stops.length === 0) {
      alert('Please enter at least one target house/lot address.');
      return;
    }

    this.currentTour.startAddress = startAddrText;
    this.currentTour.loopBack = document.getElementById('input-loopback').checked;
    this.currentTour.stayDurationMins = parseInt(document.getElementById('select-stay-duration').value);

    // Show Loading Overlay
    const statusBox = document.getElementById('geocoding-status');
    statusBox.classList.remove('hidden');

    try {
      // 1. Geocode Start Address if provided, else fallback to first stop
      if (startAddrText) {
        statusBox.textContent = `Geocoding Start Address...`;
        this.startPointGeocoded = await window.geocoder.geocodeAddress(startAddrText);
      }

      if (!this.startPointGeocoded && this.currentTour.stops.length > 0) {
        const first = this.currentTour.stops[0];
        this.startPointGeocoded = { address: first.address, lat: first.lat || 39.5, lng: first.lng || -104.8 };
      }

      // 2. Ensure all stops have coordinates
      for (let i = 0; i < this.currentTour.stops.length; i++) {
        const stop = this.currentTour.stops[i];
        if (!stop.lat || !stop.lng) {
          statusBox.textContent = `Geocoding site ${i + 1} of ${this.currentTour.stops.length}: "${stop.address.slice(0, 25)}..."`;
          const geo = await window.geocoder.geocodeAddress(stop.address);
          if (geo) {
            stop.lat = geo.lat;
            stop.lng = geo.lng;
          }
        }
      }

      // 3. Run TSP Route Optimization
      await this.runOptimizationAndRender();

    } catch (e) {
      console.error('Optimization notice:', e);
    } finally {
      statusBox.classList.add('hidden');
    }
  }

  async runOptimizationAndRender() {
    if (this.currentTour.stops.length === 0) {
      this.renderItineraryList();
      return;
    }

    // 1. Ensure ALL stops have valid lat and lng coordinates
    for (const stop of this.currentTour.stops) {
      if (!stop.lat || !stop.lng) {
        const geo = await window.geocoder.geocodeAddress(stop.address);
        if (geo) {
          stop.lat = geo.lat;
          stop.lng = geo.lng;
        }
      }
    }

    // 2. Geocode start if needed, or fallback to first valid stop
    if (this.currentTour.startAddress) {
      this.startPointGeocoded = await window.geocoder.geocodeAddress(this.currentTour.startAddress);
    }
    
    if ((!this.startPointGeocoded || !this.startPointGeocoded.lat) && this.currentTour.stops.length > 0) {
      const firstValid = this.currentTour.stops.find(s => s.lat && s.lng) || this.currentTour.stops[0];
      this.startPointGeocoded = {
        address: firstValid.address,
        lat: firstValid.lat || 39.5501,
        lng: firstValid.lng || -104.7801
      };
    }

    if (!this.startPointGeocoded || !this.startPointGeocoded.lat) return;

    // 3. Filter valid stops for routing
    const validStops = this.currentTour.stops.filter(s => s.lat && s.lng);
    if (validStops.length === 0) return;

    // 4. Optimize Order
    const orderedStops = window.optimizer.optimizeRoute(
      this.startPointGeocoded,
      validStops,
      this.currentTour.loopBack
    );

    this.currentTour.stops = orderedStops;
    this.renderTargetList();

    // 5. Calculate Schedule Matrix & ETAs (Async with OSRM driving route geometry)
    this.scheduleData = await window.optimizer.computeScheduleMatrixAsync(
      this.startPointGeocoded,
      this.currentTour.stops,
      this.currentTour.loopBack,
      this.currentTour.stayDurationMins
    );

    // 6. Render Map with OSRM road geometry
    window.mapManager.renderTour(
      this.startPointGeocoded,
      this.scheduleData.orderedStops,
      this.scheduleData.returnLeg,
      (stopId) => this.openNotebookForStopId(stopId),
      this.scheduleData.roadGeometry
    );

    // 7. Render Itinerary List
    this.renderItineraryList();

    // 8. Save to LocalStorage
    window.storageManager.saveTour(this.currentTour);
  }

  async recalculateScheduleOnly() {
    if (!this.startPointGeocoded || this.currentTour.stops.length === 0) return;

    this.scheduleData = await window.optimizer.computeScheduleMatrixAsync(
      this.startPointGeocoded,
      this.currentTour.stops,
      this.currentTour.loopBack,
      this.currentTour.stayDurationMins
    );

    window.mapManager.renderTour(
      this.startPointGeocoded,
      this.scheduleData.orderedStops,
      this.scheduleData.returnLeg,
      (stopId) => this.openNotebookForStopId(stopId),
      this.scheduleData.roadGeometry
    );

    this.renderItineraryList();
    window.storageManager.saveTour(this.currentTour);
  }

  async handleAutoDetectAllSites() {
    const btn = document.getElementById('btn-autodetect-all-sites');
    // Guard against a second click re-entering this loop while the first
    // run is still fetching — without this, every stop currently past its
    // cache check would get a second overlapping Redfin lookup started on
    // top of the first (backend/property-lookup.php now also dedupes
    // concurrent requests for the same property server-side as a
    // backstop, but this avoids sending the redundant requests at all).
    if (btn && btn.disabled) return;
    if (btn) {
      btn.disabled = true;
      btn.classList.add('opacity-60', 'cursor-not-allowed');
      btn.textContent = '⏳ Batch Fetching Specs & Photos...';
    }

    try {

    // Tracks whether ANY stop actually triggered a live fetch (as opposed
    // to every stop already having complete cached data). When every stop
    // is fully cached, this whole loop can finish in well under a second
    // with zero network calls — the button flashes through its states so
    // fast next to an unchanged list/map that it reads as "nothing
    // happened" even though it worked correctly. This flag drives a
    // distinct completion message for that case (2026-08-22).
    let anyLiveFetch = false;

    for (const stop of this.currentTour.stops) {
      if (!stop.address) continue;

      const cached = await window.storageManager.getCachedProperty(stop.address || stop.redfinUrl);

      // GIS (elevation/terrain/facing) and Redfin (price/lot size/HOA/
      // photo) are two independent data sources that succeed or fail
      // independently — a listing can time out or fail to parse on
      // Redfin's side while the GIS lookup for the same coordinates works
      // fine. The old code gated BOTH live calls on one combined "is
      // anything cached for this stop?" check: once a stop got GIS data
      // cached, a failed Redfin attempt was never retried — the stop was
      // silently stuck with blank price/lot size/HOA for the rest of that
      // cache entry's 7-day TTL, with every future Auto-Detect click
      // treating it as "already done." price/hoaNotes/photoUrl can only
      // ever come from Redfin (GIS never sets them — see below), so they're
      // an unambiguous signal that Redfin already succeeded; lotSize is
      // deliberately excluded here since GIS can also supply it, which
      // would falsely mark Redfin as already-done otherwise (2026-08-22).
      const hasCachedGis = !!(cached && (cached.elevationFt || cached.terrain || cached.facingDirection));
      const hasCachedRedfin = !!(cached && (cached.price || cached.hoaNotes || cached.photoUrl) && cached.sqft);

      if (!hasCachedGis) anyLiveFetch = true;
      if (!hasCachedRedfin) anyLiveFetch = true;

      const [gisRes, redfinMeta] = await Promise.all([
        hasCachedGis
          ? Promise.resolve(cached)
          : window.geocoder.fetchLotElevationAndTerrain(stop.lat, stop.lng).catch(() => null),
        // fetchRedfinMetadata() has its own correctly-scoped 7-day cache
        // check, and the real Scrape.do-budget guard lives server-side in
        // backend/property-lookup.php's own cache — so it's always safe to
        // call this even when a stale/partial local entry exists; it just
        // resolves instantly from cache instead of hitting the network.
        hasCachedRedfin
          ? Promise.resolve(cached)
          : window.propertyLinks.fetchRedfinMetadata(stop.redfinUrl || stop.address).catch(() => null)
      ]);

      if (gisRes) {
        if (gisRes.elevationFt) stop.elevationFt = gisRes.elevationFt;
        if (gisRes.terrain) stop.terrain = gisRes.terrain;
        if (gisRes.facingDirection) stop.facingDirection = gisRes.facingDirection;
        if (gisRes.lotSize) stop.lotSize = gisRes.lotSize;
        stop.isAutoDetected = true;
      }

      if (redfinMeta) {
        if (redfinMeta.redfinUrl) stop.redfinUrl = redfinMeta.redfinUrl;
        if (redfinMeta.price) stop.price = redfinMeta.price;
        if (redfinMeta.sqft) stop.sqft = redfinMeta.sqft;
        if (redfinMeta.yearBuilt) stop.yearBuilt = redfinMeta.yearBuilt;
        if (redfinMeta.photoUrl) stop.photoUrl = redfinMeta.photoUrl;
        if (redfinMeta.lotSize) stop.lotSize = redfinMeta.lotSize;
        if (redfinMeta.hoaNotes) stop.hoaNotes = redfinMeta.hoaNotes;
      }

      const combined = {
        elevationFt: stop.elevationFt,
        terrain: stop.terrain,
        facingDirection: stop.facingDirection,
        lotSize: stop.lotSize,
        sqft: stop.sqft,
        yearBuilt: stop.yearBuilt,
        price: stop.price,
        photoUrl: stop.photoUrl,
        hoaNotes: stop.hoaNotes
      };
      // Only cache when we actually found something. Caching an all-empty
      // result (e.g. Redfin lookup failed/timed out) would lock that stop
      // into "nothing" for the full 7-day TTL, silently skipping every
      // future retry — which is why repeat clicks looked like they did
      // nothing at all.
      // Note: hasCachedRedfin above deliberately does NOT also require
      // yearBuilt (only sqft) — gating retries on multiple fields being
      // truthy compounds the same "keeps re-fetching until every field
      // lands" problem sqft's own gate already caused for every
      // pre-existing property (see 2026-08-22 notes above and in
      // js/notes.js). yearBuilt fills in opportunistically instead.
      const hasUsefulData = combined.elevationFt || combined.terrain || combined.facingDirection ||
        combined.lotSize || combined.sqft || combined.yearBuilt || combined.price || combined.photoUrl || combined.hoaNotes;
      if (hasUsefulData) {
        window.storageManager.setCachedProperty(stop.address, combined);
      }
    }

    this.renderItineraryList();
    window.storageManager.saveTour(this.currentTour);
    if (btn) {
      btn.textContent = anyLiveFetch
        ? '✓ All Site Details & Photos Updated!'
        : '✓ Already Up To Date — Nothing New To Fetch';
      setTimeout(() => { btn.textContent = '⚡ Auto-Detect All Site Specs & Photos (1-Click Batch)'; }, 2500);
    }
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.classList.remove('opacity-60', 'cursor-not-allowed');
      }
    }
  }

  sortStopsByMatchScore() {
    if (!this.currentTour.stops || this.currentTour.stops.length < 2) return;
    const prefs = this.currentTour.preferences || {};
    this.currentTour.stops.sort((a, b) => {
      const scoreA = window.propertyScorer.calculateMatchScore(a, prefs).scorePct;
      const scoreB = window.propertyScorer.calculateMatchScore(b, prefs).scorePct;
      return scoreB - scoreA;
    });
    this.renderTargetList();
    this.runOptimizationAndRender();
  }

  renderItineraryList() {
    try {
      const container = document.getElementById('itinerary-list-container');
      const summaryHeader = document.getElementById('tour-summary-header');
      if (!container) return;

      if (!this.scheduleData || !this.scheduleData.orderedStops || this.scheduleData.orderedStops.length === 0) {
        container.innerHTML = `
          <div class="text-center py-12 text-slate-500 border-2 border-dashed border-slate-800 rounded-2xl">
            <svg class="w-12 h-12 mx-auto mb-3 stroke-current" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
            <p class="font-medium text-slate-400">No route stops planned yet.</p>
            <p class="text-xs text-slate-600 mt-1">Type an address above or click "Load Sample Tour".</p>
          </div>
        `;
        if (summaryHeader) summaryHeader.innerHTML = '';
        return;
      }

      // Render Stats Header
      if (summaryHeader) {
        summaryHeader.innerHTML = `
          <div class="flex items-center justify-between text-xs p-3 rounded-xl bg-slate-900 border border-slate-800">
            <div>
              <span class="text-slate-400">Total Distance:</span>
              <span class="font-bold text-sky-400 ml-1">${this.scheduleData.totalDistanceMiles} mi</span>
            </div>
            <div>
              <span class="text-slate-400">Total Time:</span>
              <span class="font-bold text-amber-400 ml-1">${this.scheduleData.formattedTotalDuration}</span>
            </div>
            <div>
              <span class="text-slate-400">Stops:</span>
              <span class="font-bold text-emerald-400 ml-1">${this.scheduleData.orderedStops.length}</span>
            </div>
          </div>
        `;
      }

      // Render Stop Cards
      let html = '';
      const googleMultiNavUrl = window.propertyLinks.getMultiStopDrivingUrl(
        this.currentTour.startAddress,
        this.currentTour.stops,
        this.currentTour.loopBack
      );

      html += `
        <div class="mb-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <button id="btn-autodetect-all-sites" onclick="window.homewardApp.handleAutoDetectAllSites()" class="w-full inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 text-slate-950 font-bold text-xs shadow-md shadow-sky-500/20 hover:from-sky-400 hover:to-blue-500 transition-all">
            ⚡ Auto-Detect GIS Lot Specs & Elevation
          </button>
          <button id="btn-sort-match-score" onclick="window.homewardApp.sortStopsByMatchScore()" class="w-full inline-flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-emerald-400 font-bold text-xs border border-emerald-500/30 shadow-md transition-all">
            🎯 Sort by Match Score
          </button>
        </div>

        <div class="mb-4">
          <a href="${googleMultiNavUrl}" target="_blank" class="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 text-slate-950 font-bold text-sm shadow-lg shadow-emerald-500/20 hover:from-emerald-400 hover:to-teal-500 transition-all">
            <svg class="w-5 h-5 stroke-current" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/></svg>
            Launch Multi-Stop Driving Nav in Google Maps
          </a>
        </div>
      `;

      this.scheduleData.orderedStops.forEach((item) => {
        const stop = item.stopData;
        const gmapsUrl = window.propertyLinks.getGoogleMapsUrl(stop.address, stop.lat, stop.lng);
        const cachedProp = (window.storageManager && typeof window.storageManager.getCachedPropertySync === 'function') ? window.storageManager.getCachedPropertySync(stop.address) : null;
        const cachedListingUrl = (cachedProp ? (cachedProp.url || cachedProp.redfinUrl) : null) || stop.redfinUrl || stop.url || '';
        const hasDirectListingUrl = cachedListingUrl.startsWith('http://') || cachedListingUrl.startsWith('https://');
        const providerLabel = hasDirectListingUrl ? window.propertyLinks.getProviderLabel(cachedListingUrl, cachedProp ? cachedProp.provider : '') : 'Listing';
        const stars = '★'.repeat(stop.rating || 3);
        const photoUrl = stop.photoUrl || (stop.photoUrls && stop.photoUrls[0]);

        const prefs = this.currentTour.preferences || {};
        const matchRes = window.propertyScorer ? window.propertyScorer.calculateMatchScore(stop, prefs) : { scorePct: 100, badgeColor: 'emerald' };
        const badgeClass = matchRes.badgeColor === 'emerald' ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' : (matchRes.badgeColor === 'rose' ? 'bg-rose-500/20 text-rose-300 border-rose-500/30' : 'bg-amber-500/20 text-amber-300 border-amber-500/30');

        html += `
          <div class="bg-slate-900 border border-slate-800 hover:border-sky-500/40 rounded-xl p-4 transition-all duration-200 group">
            <div class="flex items-start justify-between gap-3">
              
              <!-- Left Info Area -->
              <div class="flex items-start gap-3 flex-1 min-w-0">
                <span class="w-7 h-7 rounded-full bg-sky-500/20 border border-sky-400/40 text-sky-400 font-bold text-xs flex items-center justify-center flex-shrink-0 mt-0.5">
                  ${item.stopIndex}
                </span>
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <h4 class="font-bold text-slate-100 text-sm group-hover:text-sky-300 transition-colors truncate" title="${stop.address}">${stop.address}</h4>
                    <span class="px-2 py-0.5 rounded-full text-[11px] font-bold border ${badgeClass}">🎯 ${matchRes.scorePct}% Match</span>
                  </div>
                  
                  <div class="flex items-center gap-3 text-xs text-slate-400 mt-1">
                    <span class="text-amber-400 font-mono">ETA: ${item.formattedArrival}</span>
                    <span>•</span>
                    <span>Drive: ${item.legDriveMins} mins (${item.legDistanceMiles} mi)</span>
                  </div>

                  ${stop.price || stop.lotSize || stop.sqft || stop.elevationFt || stop.facingDirection || stop.hasSolar ? `
                    <div class="flex items-center gap-2 text-xs font-semibold text-emerald-400 mt-1.5 flex-wrap">
                      ${stop.price || stop.lotSize || stop.sqft ? `<span>${stop.price || ''} ${stop.lotSize ? '• ' + stop.lotSize : ''} ${stop.sqft ? '• 🏠 ' + stop.sqft : ''}</span>` : ''}
                      ${stop.elevationFt ? `<span class="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 text-[11px]">⛰️ ${typeof stop.elevationFt === 'number' ? stop.elevationFt.toLocaleString() : stop.elevationFt} ft Elev ${stop.isAutoDetected ? '<span class="text-sky-400 font-bold ml-1">⚡ Auto</span>' : ''}</span>` : ''}
                      ${stop.facingDirection ? `<span class="px-2 py-0.5 rounded bg-sky-500/10 text-sky-300 border border-sky-500/20 text-[11px]">🧭 Facing ${stop.facingDirection}</span>` : ''}
                      ${stop.hasSolar ? `<span class="px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 text-[11px]">☀️ Solar Installed</span>` : ''}
                    </div>
                  ` : ''}

                  <div class="flex items-center gap-2 mt-3 pt-2.5 border-t border-slate-800 text-xs flex-wrap">
                    <button onclick="window.homewardApp.openNotebookForStopId('${stop.id}')" class="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold border border-slate-700 transition-colors flex items-center gap-1">
                      📝 Inspection Notebook
                    </button>
                    <a href="${gmapsUrl}" target="_blank" class="px-2 py-1 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 font-semibold transition-colors">
                      Google Maps ↗
                    </a>
                    ${hasDirectListingUrl ? `
                      <a href="${cachedListingUrl}" target="_blank" class="px-2 py-1 rounded ${providerLabel === 'Zillow' ? 'bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/20' : (providerLabel === 'Realtor.com' ? 'bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/20' : (providerLabel === 'Homes.com' ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20' : 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20'))} font-semibold transition-colors">
                        ${providerLabel} Listing ↗
                      </a>
                    ` : `
                      <a href="#" onclick="window.propertyLinks ? window.propertyLinks.openBookmarkletModal() : null; return false;" class="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-sky-400 border border-slate-700 font-semibold transition-colors">
                        🔖 Ingest Listing ↗
                      </a>
                    `}
                  </div>
                </div>
              </div>

              <!-- Right Column: Star Rating & House Thumbnail with 🔍 Expand Badge -->
              <div class="flex flex-col items-end justify-between flex-shrink-0 gap-2 self-stretch">
                <div class="text-right">
                  <span class="text-amber-400 text-xs tracking-wider">${stars}</span>
                  ${stop.visited ? '<div class="text-[10px] text-emerald-400 font-bold uppercase mt-0.5">Visited ✓</div>' : ''}
                </div>

                ${photoUrl ? `
                  <div class="w-24 h-16 sm:w-32 sm:h-22 bg-slate-950 rounded-xl border border-slate-800 overflow-hidden flex items-center justify-center p-1 flex-shrink-0 cursor-pointer shadow-md hover:border-sky-500/50 transition-all relative group/img" title="Click to expand photo on screen" data-photo-url="${encodeURI(photoUrl)}" data-photo-title="${stop.address.replace(/"/g, '&quot;')}" onclick="window.openImageLightbox(this)">
                    <img src="${photoUrl}" alt="${stop.address}" class="w-full h-full object-contain rounded-lg pointer-events-none">
                    <span class="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-slate-900/90 text-[9px] font-mono text-slate-300 border border-slate-700 pointer-events-none opacity-80 group-hover/img:opacity-100 transition-opacity">🔍 Expand</span>
                  </div>
                ` : ''}
              </div>

            </div>
          </div>
        `;
      });

      if (this.scheduleData.returnLeg) {
        html += `
          <div class="p-3 rounded-xl bg-slate-950 border border-dashed border-slate-800 text-xs text-slate-400 flex items-center justify-between">
            <span>🔄 Loop Back to Start (${this.currentTour.startAddress.slice(0, 25)}...)</span>
            <span class="font-bold text-emerald-400">Final Return: ${this.scheduleData.returnLeg.formattedReturnTime}</span>
          </div>
        `;
      }

      container.innerHTML = html;
    } catch (e) {
      console.warn('Render itinerary error:', e);
    }
  }

  openImageLightbox(photoUrl, title = 'Property Photo') {
    window.openImageLightbox(photoUrl, title);
  }

  closeImageLightbox() {
    window.openImageLightbox('close');
  }

  openNotebookForStopId(stopId) {
    const stop = this.currentTour.stops.find(s => s.id === stopId);
    if (!stop) return;

    window.notesManager.openNotebook(stop, async (updatedData) => {
      const idx = this.currentTour.stops.findIndex(s => s.id === stopId);
      if (idx !== -1) {
        this.currentTour.stops[idx] = { ...this.currentTour.stops[idx], ...updatedData };
        this.renderTargetList();
        await this.recalculateScheduleOnly();
        window.storageManager.saveTour(this.currentTour);
      }
    });
  }

  handleCSVUpload(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const csvText = e.target.result;
      const parsedRows = window.storageManager.parseCSV(csvText);
      if (parsedRows.length === 0) {
        alert('CSV file appears empty or unreadable.');
        return;
      }

      this.currentTour.stops = window.storageManager.mergeCSVRows(parsedRows, this.currentTour.stops);
      this.populateUIFromState();
      this.handleOptimizeTrigger();
      alert(`Successfully merged ${parsedRows.length} rows from CSV!`);
    };
    reader.readAsText(file);
  }
}

window.openImageLightbox = function(target, title) {
  const modal = document.getElementById('image-lightbox-modal');
  const img = document.getElementById('lightbox-img');
  const titleEl = document.getElementById('lightbox-title');
  const extLink = document.getElementById('lightbox-external-link');

  if (!target || target === 'close') {
    if (modal) {
      modal.classList.add('hidden');
      modal.style.display = 'none';
    }
    return;
  }

  let photoUrl = '';
  let photoTitle = title || 'Property Photo';

  if (typeof target === 'string') {
    photoUrl = target;
  } else if (target && target.getAttribute) {
    const rawUrl = target.getAttribute('data-photo-url') || target.src || target.currentSrc || '';
    try {
      photoUrl = (rawUrl && rawUrl.includes('%')) ? decodeURIComponent(rawUrl) : rawUrl;
    } catch(e) {
      photoUrl = rawUrl;
    }
    photoTitle = target.getAttribute('data-photo-title') || target.alt || title || 'Property Photo';
  } else if (target && target.src) {
    photoUrl = target.src;
  }

  if (!photoUrl || !modal || !img) return;

  img.src = photoUrl;
  if (titleEl) titleEl.textContent = photoTitle;
  if (extLink) extLink.href = photoUrl;

  modal.classList.remove('hidden');
  modal.style.display = 'flex';
};

// Global click event delegation backstop for all photo thumbnails
document.addEventListener('click', (e) => {
  const trigger = e.target.closest('[data-photo-url]') || (e.target.id === 'note-photo-preview' ? e.target : null);
  if (trigger) {
    e.preventDefault();
    e.stopPropagation();
    window.openImageLightbox(trigger);
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    window.openImageLightbox('close');
  }
});

document.addEventListener('DOMContentLoaded', () => {
  window.homewardApp = new HomewardApp();
  window.homewardApp.init();
});
