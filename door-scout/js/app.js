/**
 * DoorScout Main Application Controller
 * Handles explicit Start Point, dynamic Multiple Target Neighborhoods, Overpass street traversal, and PC-to-Mobile sync.
 */

class DoorScoutApp {
  constructor() {
    this.storage = new StorageManager();
    this.session = this.storage.loadSession();
    this.router = new RouteEngine();
    this.syncClient = new SyncClient();

    this.map = null;
    this.startMarker = null;
    this.targetMarkers = [];
    this.radiusCircles = [];
    this.routePolyline = null;
    this.notesManager = null;

    this.initMap();
    this.initStartLocationControls();
    this.renderTargetNeighborhoodsUI();
    this.initControls();
    this.checkUrlSyncCode();
  }

  initMap() {
    // Default center (Denver, CO fallback or first target coords)
    const initialTarget = (this.session.targets && this.session.targets[0] && this.session.targets[0].coords) ? this.session.targets[0].coords : { lat: 39.7392, lng: -104.9903 };

    this.map = L.map('map', { zoomControl: false }).setView([initialTarget.lat, initialTarget.lng], 14);
    L.control.zoom({ position: 'topright' }).addTo(this.map);

    // CartoDB Voyager tile layer
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 19
    }).addTo(this.map);

    this.notesManager = new InspirationNotesManager(this.map, (updatedNotes) => {
      this.session.notes = updatedNotes;
      this.storage.saveSession(this.session);
      this.renderNotesSidebar();
    });

    // Map Click Handler for dropping Door Pins
    this.map.on('click', (e) => {
      if (document.getElementById('toggle-pin-mode').checked) {
        this.promptAddDoorPin(e.latlng.lat, e.latlng.lng);
      }
    });

    if (this.session.notes) {
      this.notesManager.loadNotes(this.session.notes);
      this.renderNotesSidebar();
    }

    // Render existing markers on initial load
    this.updateStartOnMap();
    this.updateTargetsOnMap();
  }

  initStartLocationControls() {
    const startInput = document.getElementById('input-start-address');
    const startDropdown = document.getElementById('dropdown-start-address');
    const btnGps = document.getElementById('btn-use-gps');

    if (startInput && startDropdown) {
      if (this.session.startAddress) startInput.value = this.session.startAddress;

      new AddressAutocomplete(startInput, startDropdown, (place) => {
        this.session.startAddress = place.address;
        this.session.startCoords = { lat: place.lat, lng: place.lng };
        this.storage.saveSession(this.session);
        this.updateStartOnMap();
      });
    }

    if (btnGps) {
      btnGps.addEventListener('click', () => {
        if (!navigator.geolocation) {
          alert('Geolocation is not supported by your browser.');
          return;
        }
        btnGps.innerHTML = `⏳ Locating...`;
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const lat = pos.coords.latitude;
            const lng = pos.coords.longitude;
            const addressStr = `Current GPS Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`;

            this.session.startAddress = addressStr;
            this.session.startCoords = { lat, lng };
            if (startInput) startInput.value = addressStr;

            this.storage.saveSession(this.session);
            this.updateStartOnMap();
            btnGps.innerHTML = `📍 GPS`;
          },
          (err) => {
            alert('Unable to retrieve current location.');
            btnGps.innerHTML = `📍 GPS`;
          }
        );
      });
    }
  }

  renderTargetNeighborhoodsUI() {
    const container = document.getElementById('target-neighborhoods-list');
    if (!container) return;

    if (!Array.isArray(this.session.targets) || this.session.targets.length === 0) {
      this.session.targets = [{ id: 'target_1', address: '', coords: null, radiusMiles: 0.5 }];
    }

    container.innerHTML = '';

    this.session.targets.forEach((target, index) => {
      const card = document.createElement('div');
      card.className = 'p-3 rounded-lg bg-slate-950 border border-slate-800 flex flex-col gap-2 relative';
      card.innerHTML = `
        <div class="flex items-center justify-between">
          <span class="text-[11px] font-bold text-sky-400 flex items-center gap-1">🎯 Target Zone #${index + 1}</span>
          ${this.session.targets.length > 1 ? `<button onclick="window.app.removeTargetZone(${index})" class="text-[10px] text-rose-400 font-bold hover:underline">🗑️ Remove</button>` : ''}
        </div>
        <div class="relative">
          <input id="input-target-${index}" type="text" value="${escapeHtml(target.address || '')}" placeholder="e.g. 5578 S Telluride St, Centennial, CO" class="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-800 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-sky-500" />
          <div id="dropdown-target-${index}" class="absolute z-50 left-0 right-0 top-full mt-1 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl hidden max-h-48 overflow-y-auto"></div>
        </div>
        <div>
          <div class="flex justify-between items-center text-[10px] text-slate-400 mb-0.5">
            <span>Zone Radius</span>
            <span id="label-radius-${index}" class="font-bold text-sky-400 font-mono">${target.radiusMiles || 0.5} mi</span>
          </div>
          <input id="slider-radius-${index}" type="range" min="0.1" max="1.5" step="0.1" value="${target.radiusMiles || 0.5}" class="w-full accent-sky-500 bg-slate-800 h-1.5 rounded cursor-pointer" />
        </div>
      `;
      container.appendChild(card);

      // Bind autocomplete to target input
      setTimeout(() => {
        const inp = document.getElementById(`input-target-${index}`);
        const drop = document.getElementById(`dropdown-target-${index}`);
        const slider = document.getElementById(`slider-radius-${index}`);
        const label = document.getElementById(`label-radius-${index}`);

        if (inp && drop) {
          new AddressAutocomplete(inp, drop, (place) => {
            target.address = place.address;
            target.coords = { lat: place.lat, lng: place.lng };
            this.storage.saveSession(this.session);
            this.updateTargetsOnMap();
          });
        }

        if (slider && label) {
          slider.addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            target.radiusMiles = val;
            label.textContent = `${val} mi`;
            this.storage.saveSession(this.session);
            this.updateTargetsOnMap();
          });
        }
      }, 50);
    });

    this.updateTargetsOnMap();
  }

  addTargetZone() {
    this.session.targets.push({
      id: 'target_' + Date.now(),
      address: '',
      coords: null,
      radiusMiles: 0.5
    });
    this.storage.saveSession(this.session);
    this.renderTargetNeighborhoodsUI();
  }

  removeTargetZone(index) {
    if (this.session.targets.length <= 1) return;
    this.session.targets.splice(index, 1);
    this.storage.saveSession(this.session);
    this.renderTargetNeighborhoodsUI();
  }

  initControls() {
    // Add Target Zone Button
    const btnAddTarget = document.getElementById('btn-add-target');
    if (btnAddTarget) {
      btnAddTarget.addEventListener('click', () => this.addTargetZone());
    }

    // Density Buttons
    ['tight', 'medium', 'loose'].forEach(density => {
      const btn = document.getElementById(`btn-density-${density}`);
      if (btn) {
        btn.addEventListener('click', () => this.setDensity(density));
      }
    });

    // Transport Mode Toggle
    const modeDrive = document.getElementById('btn-mode-driving');
    const modeWalk = document.getElementById('btn-mode-walking');
    if (modeDrive && modeWalk) {
      modeDrive.addEventListener('click', () => this.setTransportMode('driving'));
      modeWalk.addEventListener('click', () => this.setTransportMode('walking'));
    }

    // Round Trip Checkbox
    const chkRoundTrip = document.getElementById('chk-round-trip');
    if (chkRoundTrip) {
      chkRoundTrip.checked = this.session.isRoundTrip;
      chkRoundTrip.addEventListener('change', (e) => {
        this.session.isRoundTrip = e.target.checked;
        this.storage.saveSession(this.session);
      });
    }

    // Generate Route Button
    const btnGenerate = document.getElementById('btn-generate-route');
    if (btnGenerate) {
      btnGenerate.addEventListener('click', () => this.calculateAndRenderRoute());
    }

    // Sync to Phone Button
    const btnSyncPhone = document.getElementById('btn-sync-phone');
    if (btnSyncPhone) {
      btnSyncPhone.addEventListener('click', () => this.openSyncModal());
    }

    // Pull Code Input
    const btnPullCode = document.getElementById('btn-pull-code');
    if (btnPullCode) {
      btnPullCode.addEventListener('click', () => this.pullSessionByCode());
    }

    this.setDensity(this.session.density || 'tight');
    this.setTransportMode(this.session.transportMode || 'driving');
  }

  setDensity(density) {
    this.session.density = density;
    ['tight', 'medium', 'loose'].forEach(d => {
      const btn = document.getElementById(`btn-density-${d}`);
      if (btn) {
        if (d === density) {
          btn.className = 'px-3 py-1.5 rounded-lg bg-sky-500 text-slate-950 font-bold text-xs shadow transition-all';
        } else {
          btn.className = 'px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs border border-slate-700 transition-all';
        }
      }
    });
    this.storage.saveSession(this.session);
  }

  setTransportMode(mode) {
    this.session.transportMode = mode;
    const modeDrive = document.getElementById('btn-mode-driving');
    const modeWalk = document.getElementById('btn-mode-walking');

    if (mode === 'driving') {
      modeDrive.className = 'flex-1 py-2 rounded-lg bg-sky-500 text-slate-950 font-bold text-xs shadow transition-all flex items-center justify-center gap-1.5';
      modeWalk.className = 'flex-1 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs border border-slate-700 transition-all flex items-center justify-center gap-1.5';
    } else {
      modeWalk.className = 'flex-1 py-2 rounded-lg bg-emerald-500 text-slate-950 font-bold text-xs shadow transition-all flex items-center justify-center gap-1.5';
      modeDrive.className = 'flex-1 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs border border-slate-700 transition-all flex items-center justify-center gap-1.5';
    }
    this.storage.saveSession(this.session);
  }

  updateStartOnMap() {
    if (!this.session.startCoords) return;
    const latlng = [this.session.startCoords.lat, this.session.startCoords.lng];

    if (this.startMarker) this.map.removeLayer(this.startMarker);

    const icon = L.divIcon({
      className: 'start-pin-marker w-9 h-9 font-black shadow-xl',
      html: '🚀',
      iconSize: [36, 36],
      iconAnchor: [18, 18]
    });

    this.startMarker = L.marker(latlng, { icon }).addTo(this.map)
      .bindPopup(`<b class="text-emerald-700">🏁 START ORIGIN:</b><br><span class="text-xs text-slate-700">${this.session.startAddress}</span>`);
  }

  updateTargetsOnMap() {
    // Clear existing markers and circles
    this.targetMarkers.forEach(m => this.map.removeLayer(m));
    this.radiusCircles.forEach(c => this.map.removeLayer(c));
    this.targetMarkers = [];
    this.radiusCircles = [];

    const bounds = [];
    if (this.session.startCoords) {
      bounds.push([this.session.startCoords.lat, this.session.startCoords.lng]);
    }

    (this.session.targets || []).forEach((target, idx) => {
      if (!target.coords) return;
      const latlng = [target.coords.lat, target.coords.lng];
      bounds.push(latlng);

      const icon = L.divIcon({
        className: 'target-pin-marker w-8 h-8 font-black shadow-lg',
        html: `🎯${idx + 1}`,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      const marker = L.marker(latlng, { icon }).addTo(this.map)
        .bindPopup(`<b class="text-sky-700">🎯 TARGET ZONE #${idx + 1}:</b><br><span class="text-xs text-slate-700">${target.address}</span>`);
      this.targetMarkers.push(marker);

      const circle = L.circle(latlng, {
        radius: (target.radiusMiles || 0.5) * 1609.34,
        color: '#38bdf8',
        fillColor: '#0284c7',
        fillOpacity: 0.15,
        weight: 2,
        className: 'radius-pulse'
      }).addTo(this.map);
      this.radiusCircles.push(circle);
    });

    if (bounds.length > 0) {
      this.map.fitBounds(L.latLngBounds(bounds), { padding: [50, 50] });
    }
  }

  async calculateAndRenderRoute() {
    const validTargets = (this.session.targets || []).filter(t => t.coords && t.coords.lat);
    if (validTargets.length === 0) {
      alert('Please enter at least one target neighborhood address.');
      return;
    }

    const btn = document.getElementById('btn-generate-route');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<span class="animate-spin">⏳</span> Querying OpenStreetMap & Snapping Roads...`;
    }

    try {
      const result = await this.router.generateMultiTargetRoute({
        start: this.session.startCoords,
        targets: validTargets,
        density: this.session.density,
        transportMode: this.session.transportMode,
        isRoundTrip: this.session.isRoundTrip
      });

      // Render polyline
      if (this.routePolyline) this.map.removeLayer(this.routePolyline);

      const color = this.session.transportMode === 'walking' ? '#10b981' : '#38bdf8';
      this.routePolyline = L.geoJSON(result.osrmGeometry, {
        style: {
          color: color,
          weight: 5,
          opacity: 0.85,
          lineCap: 'round',
          lineJoin: 'round'
        }
      }).addTo(this.map);

      this.map.fitBounds(this.routePolyline.getBounds(), { padding: [40, 40] });

      // Update Summary Bar
      const summaryBar = document.getElementById('route-summary');
      if (summaryBar) {
        summaryBar.classList.remove('hidden');
        const distMi = (result.distanceKm * 0.621371).toFixed(1);
        document.getElementById('stat-distance').textContent = `${distMi} mi (${result.distanceKm} km)`;
        document.getElementById('stat-duration').textContent = formatDuration(result.durationMinutes);
        document.getElementById('stat-waypoints').textContent = `${result.waypoints.length} stops`;
      }

      // Update Google Maps Link & GPX Export buttons
      const btnGmaps = document.getElementById('btn-open-gmaps');
      if (btnGmaps) {
        btnGmaps.href = result.googleMapsUrl;
        btnGmaps.classList.remove('hidden');
      }

      const btnGpx = document.getElementById('btn-export-gpx');
      if (btnGpx) {
        btnGpx.classList.remove('hidden');
        btnGpx.onclick = () => this.downloadGpxFile(result);
      }

      this.session.lastGeneratedRoute = result;
      this.storage.saveSession(this.session);
    } catch (err) {
      console.error('Route calculation error:', err);
      alert('Failed to generate full street route: ' + (err.message || err));
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `✨ Generate Inspection Route`;
      }
    }
  }

  promptAddDoorPin(lat, lng) {
    const title = prompt('Enter a title for this Door/Architectural Idea:', 'Craftsman Entryway');
    if (!title) return;

    const styleTag = prompt('Enter architectural style (craftsman, modern, midcentury, double, colonial, custom):', 'craftsman') || 'custom';
    const description = prompt('Enter notes or details (e.g. Cedar finish, matte black hardware):', '') || '';

    this.notesManager.addNote(lat, lng, {
      title,
      styleTag: styleTag.toLowerCase(),
      description
    });
  }

  deleteDoorPin(id) {
    this.notesManager.removeNote(id);
  }

  renderNotesSidebar() {
    const listContainer = document.getElementById('door-pins-list');
    if (!listContainer) return;

    if (!this.session.notes || this.session.notes.length === 0) {
      listContainer.innerHTML = `<div class="p-4 text-center text-xs text-slate-500">No door pins added yet. Turn on "Drop Door Pins" mode and click anywhere on the map!</div>`;
      return;
    }

    listContainer.innerHTML = '';
    this.session.notes.forEach(note => {
      const card = document.createElement('div');
      card.className = 'p-3 rounded-lg bg-slate-900 border border-slate-800 text-xs flex flex-col gap-1 hover:border-sky-500/50 transition-all';
      card.innerHTML = `
        <div class="flex items-center justify-between">
          <span class="font-bold text-slate-200 flex items-center gap-1">🚪 ${escapeHtml(note.title)}</span>
          <span class="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 font-semibold uppercase">${escapeHtml(note.styleTag)}</span>
        </div>
        ${note.description ? `<p class="text-[11px] text-slate-400">${escapeHtml(note.description)}</p>` : ''}
        <div class="flex justify-between items-center pt-1 border-t border-slate-800/80 mt-1">
          <button onclick="window.app.map.setView([${note.lat}, ${note.lng}], 17)" class="text-[10px] text-sky-400 hover:underline">📍 Show on Map</button>
          <button onclick="window.app.deleteDoorPin('${note.id}')" class="text-[10px] text-rose-400 hover:underline">🗑️ Delete</button>
        </div>
      `;
      listContainer.appendChild(card);
    });
  }

  async openSyncModal() {
    const modal = document.getElementById('modal-sync');
    const qrImg = document.getElementById('sync-qr-code');
    const codeDisplay = document.getElementById('sync-code-display');

    if (!modal) return;
    modal.classList.remove('hidden');

    try {
      const syncResult = await this.syncClient.pushSession(this.session);
      if (codeDisplay) codeDisplay.textContent = syncResult.code;
      if (qrImg) qrImg.src = syncResult.qrUrl;
    } catch (err) {
      alert('Failed to generate sync code. Check network connection.');
    }
  }

  async pullSessionByCode() {
    const input = document.getElementById('input-sync-code');
    if (!input || !input.value.trim()) {
      alert('Please enter a 6-character code.');
      return;
    }

    try {
      const res = await this.syncClient.pullSession(input.value.trim());
      if (res && res.tour) {
        this.session = res.tour;
        this.storage.saveSession(this.session);
        alert('Session synced successfully!');
        window.location.reload();
      }
    } catch (err) {
      alert('Failed to pull session. Verify the code and try again.');
    }
  }

  async checkUrlSyncCode() {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    if (code) {
      try {
        const res = await this.syncClient.pullSession(code);
        if (res && res.tour) {
          this.session = res.tour;
          this.storage.saveSession(this.session);
          window.history.replaceState({}, document.title, window.location.pathname);
          window.location.reload();
        }
      } catch (err) {
        console.warn('Auto URL sync code pull failed:', err);
      }
    }
  }

  downloadGpxFile(routeData) {
    if (!routeData) return;
    try {
      const gpxContent = this.router.exportToGpx(routeData, this.session.notes || []);
      const blob = new Blob([gpxContent], { type: 'application/gpx+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      
      const dateStr = new Date().toISOString().slice(0, 10);
      const filename = `doorscout_route_${dateStr}.gpx`;

      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('GPX generation failed:', err);
      alert('Failed to export GPX file.');
    }
  }
}

function formatDuration(totalMinutes) {
  if (!totalMinutes || totalMinutes <= 0) return '0 mins';
  if (totalMinutes < 60) return `~${totalMinutes} mins`;
  const hrs = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (mins === 0) {
    return `~${hrs} hr${hrs > 1 ? 's' : ''}`;
  }
  return `~${hrs} hr${hrs > 1 ? 's' : ''} ${mins} min${mins > 1 ? 's' : ''}`;
}

document.addEventListener('DOMContentLoaded', () => {
  window.app = new DoorScoutApp();
});
