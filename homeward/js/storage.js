/**
 * BuildRoute Storage & CSV Import/Export Module
 * LocalStorage persistence, PapaParse-style CSV parsing & merging, and master CSV export.
 */
class StorageManager {
  constructor() {
    this.storageKey = 'homeward_active_tour_v1';
    this.backupDeviceIdKey = 'homeward_device_backup_id';
    this.lastBackupAtKey = 'homeward_last_backup_at';
    this._autoBackupTimer = null;
  }

  saveTour(tourData) {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(tourData));
    } catch (e) {
      console.warn('LocalStorage save failed:', e);
    }
    // Fire-and-forget: schedule a background copy to the server so a
    // cleared browser / crashed profile / new machine isn't a total loss.
    // Deliberately not awaited — never let a backup hiccup slow down or
    // block the save the user is actually waiting on.
    this._scheduleAutoBackup(tourData);
  }

  // A stable per-browser id, generated once and stored separately from the
  // tour data itself (so it survives a "clear this site's data for the
  // tour" action, though not a full localStorage.clear() — see
  // js/sync.js's autoBackup/restoreAutoBackup and sync.php for the
  // server-side half). Not a secret meant to be guessed-around: same trust
  // model as the existing 6-char push/pull code, just longer and
  // non-expiring since its job is different (safety net vs. deliberate
  // handoff).
  getOrCreateBackupDeviceId() {
    try {
      let id = localStorage.getItem(this.backupDeviceIdKey);
      if (id && /^[a-f0-9]{16,64}$/.test(id)) return id;
      id = (crypto && crypto.randomUUID) ? crypto.randomUUID().replace(/-/g, '') : this._fallbackRandomHex(32);
      localStorage.setItem(this.backupDeviceIdKey, id);
      return id;
    } catch (e) {
      // localStorage unavailable (private mode, quota, etc.) — auto-backup
      // simply won't have anywhere to persist the id; caller treats a null
      // return as "skip this backup attempt."
      return null;
    }
  }

  _fallbackRandomHex(byteLen) {
    let hex = '';
    for (let i = 0; i < byteLen; i++) {
      hex += Math.floor(Math.random() * 256).toString(16).padStart(2, '0');
    }
    return hex;
  }

  // Debounced so a burst of edits (typing in a note, dragging cards) only
  // triggers one network call ~30s after things go quiet, not one per
  // keystroke. Best-effort throughout: a failed backup is silently retried
  // on the next save rather than surfaced as an error, since it's a
  // background safety net, not an action the user explicitly took.
  _scheduleAutoBackup(tourData) {
    if (!window.syncManager || typeof window.syncManager.autoBackup !== 'function') return;
    if (this._autoBackupTimer) clearTimeout(this._autoBackupTimer);
    this._autoBackupTimer = setTimeout(() => {
      const deviceId = this.getOrCreateBackupDeviceId();
      if (!deviceId) return;
      window.syncManager.autoBackup(tourData, deviceId)
        .then(() => {
          try { localStorage.setItem(this.lastBackupAtKey, String(Date.now())); } catch (e) {}
        })
        .catch(() => {
          // Silent — the status indicator (getBackupStatus) reflects the
          // last *successful* backup time, so a failure just means that
          // timestamp doesn't advance. Next save tries again.
        });
    }, 30000);
  }

  // Read-only status for the UI (Cross-Device Sync modal). Returns
  // { deviceId, lastBackupAt: number|null }.
  getBackupStatus() {
    let deviceId = null;
    let lastBackupAt = null;
    try {
      deviceId = localStorage.getItem(this.backupDeviceIdKey);
      const raw = localStorage.getItem(this.lastBackupAtKey);
      lastBackupAt = raw ? parseInt(raw, 10) : null;
    } catch (e) {}
    return { deviceId, lastBackupAt: (lastBackupAt && !isNaN(lastBackupAt)) ? lastBackupAt : null };
  }

  // --- SITE DETAIL CACHE (LocalStorage only, per-browser) ---
  // Combines GIS data (elevation/terrain/facing — from window.geocoder,
  // not Redfin) with Redfin listing data (price/photo/lot/HOA) under one
  // per-address key, matching how handleAutoDetectAllSites() in app.js
  // writes them together. This is a fast, per-browser mirror only — it is
  // NOT the source of truth for avoiding duplicate Redfin/Scrape.do calls.
  // That job belongs to the shared server-side 7-day cache in
  // backend/property-lookup.php (used by both homeward and
  // mortgage-calculator), which property-links.js's fetchRedfinMetadata()
  // calls directly — that endpoint checks its own DB before ever spending
  // a Scrape.do pull, regardless of what's (or isn't) in this local
  // mirror. This local cache used to also round-trip to a homeward-only
  // api/property-cache.php SQLite endpoint; that endpoint has been
  // retired now that the shared backend covers the same need site-wide.
  _normalizeCacheKey(input) {
    if (!input) return '';
    return input.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  _sanitizePropertyRecord(record) {
    if (!record) return record;
    if (record.lotSize && (String(record.lotSize).includes('26.76') || (String(record.lotSize).includes('Acres') && parseFloat(record.lotSize) > 10))) {
      record.lotSize = '';
    }
    if (record.terrain === 'Steep Slope') {
      record.terrain = 'Flat';
    }
    return record;
  }

  // Turns a cached property record (from getCachedProperty /
  // getCachedPropertySync, which both now include createdAt) into a
  // freshness signal for the UI. The point: when Auto-Detect silently
  // fails (Redfin changes something, scraping gets blocked again), a blank
  // spec field today looks identical to "never checked" — this makes the
  // three cases distinguishable:
  //   'fresh'   — has a createdAt AND at least price or sqft came back.
  //   'partial' — has a createdAt but price/sqft are still empty, i.e. a
  //               fetch happened but likely didn't find real listing data.
  //   'none'    — no createdAt at all — Auto-Detect was never run.
  getFreshnessInfo(cachedProp) {
    if (!cachedProp || !cachedProp.createdAt) {
      return { state: 'none', label: 'Never auto-detected' };
    }
    const rel = this._formatRelativeTime(cachedProp.createdAt);
    const hasCoreData = !!(cachedProp.price || cachedProp.sqft);
    if (hasCoreData) {
      return { state: 'fresh', label: `Auto-detected ${rel}` };
    }
    return { state: 'partial', label: `Auto-detected ${rel} — no price/sqft found` };
  }

  // Small "3m ago" / "2h ago" / "5d ago" formatter — kept local to this
  // file (rather than imported from app.js, which has the same helper for
  // the Auto-Backup status line) so storage.js has no load-order
  // dependency on app.js.
  _formatRelativeTime(timestampMs) {
    const diffMs = Date.now() - timestampMs;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  }

  getCachedPropertySync(addressOrUrl) {
    if (!addressOrUrl) return null;
    const normKey = this._normalizeCacheKey(addressOrUrl);
    if (!normKey) return null;
    try {
      const localItem = localStorage.getItem(`homeward_prop_cache_${normKey}`);
      if (localItem) {
        const parsed = JSON.parse(localItem);
        if (parsed && parsed.data) {
          const sanitized = this._sanitizePropertyRecord(parsed.data);
          // createdAt lives alongside `data`, not inside it — surface it here
          // too so callers (e.g. getFreshnessInfo) can tell how old this
          // record is without a second read.
          return { ...sanitized, createdAt: parsed.createdAt || null };
        }
      }
    } catch (e) {}
    return null;
  }

  async getCachedProperty(addressOrUrl) {
    if (!addressOrUrl) return null;
    const normKey = this._normalizeCacheKey(addressOrUrl);
    if (!normKey) return null;

    const localDbKey = `homeward_prop_cache_${normKey}`;
    try {
      const localItem = localStorage.getItem(localDbKey);
      if (localItem) {
        const parsed = JSON.parse(localItem);
        // Permanent persistence: no expiration timeout so observations, media, and specs stay permanently cached
        if (parsed && parsed.data) {
          const sanitized = this._sanitizePropertyRecord(parsed.data);
          return { ...sanitized, cachedSource: 'LocalStorage (0ms)', createdAt: parsed.createdAt || null };
        }
      }
    } catch (e) {
      console.warn('LocalStorage cache read error:', e);
    }

    return null;
  }

  setCachedProperty(addressOrUrl, data) {
    if (!addressOrUrl || !data) return;
    const normKey = this._normalizeCacheKey(addressOrUrl);
    if (!normKey) return;

    const localDbKey = `homeward_prop_cache_${normKey}`;
    try {
      // Merge with existing cached record if present so observations and photos aren't lost when partial updates occur
      let existingData = {};
      const localItem = localStorage.getItem(localDbKey);
      if (localItem) {
        try {
          const parsed = JSON.parse(localItem);
          if (parsed && parsed.data) existingData = parsed.data;
        } catch (err) {}
      }

      const mergedData = this._sanitizePropertyRecord({ ...existingData, ...data });

      const cacheObj = {
        key: normKey,
        input: addressOrUrl,
        data: mergedData,
        createdAt: Date.now(),
        expiresAt: null // Never time out (Permanent LocalStorage)
      };
      localStorage.setItem(localDbKey, JSON.stringify(cacheObj));
    } catch (e) {
      console.warn('LocalStorage cache write error:', e);
    }
  }

  loadTour() {
    try {
      const data = localStorage.getItem(this.storageKey);
      if (!data) return null;
      const parsed = JSON.parse(data);
      if (parsed && Array.isArray(parsed.stops)) {
        parsed.stops.forEach(stop => this._sanitizePropertyRecord(stop));
      }
      return parsed;
    } catch (e) {
      return null;
    }
  }

  clearTour() {
    localStorage.removeItem(this.storageKey);
  }

  // Parse CSV String into Array of Objects
  parseCSV(csvText) {
    const lines = csvText.split(/\r\n|\n/);
    if (lines.length === 0) return [];

    const headers = this.parseCSVLine(lines[0]);
    const results = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values = this.parseCSVLine(line);
      const rowObj = {};

      headers.forEach((header, idx) => {
        const cleanHeader = header.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        rowObj[cleanHeader] = values[idx] ? values[idx].trim() : '';
      });

      results.push(rowObj);
    }

    return results;
  }

  parseCSVLine(lineText) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < lineText.length; i++) {
      const char = lineText[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current);
    return result;
  }

  // Sanitize helper functions for CSV data validation
  sanitizeString(val, maxLength = 300) {
    if (!val) return '';
    let str = String(val).trim();
    // Strip HTML tags
    str = str.replace(/<[^>]*>/g, '');
    // Strip javascript: and dangerous URI schemes / event handlers
    str = str.replace(/javascript\s*:/gi, '');
    str = str.replace(/on[a-z]+\s*=/gi, '');
    return str.slice(0, maxLength);
  }

  sanitizeUrl(val, maxLength = 1000) {
    if (!val) return '';
    const str = String(val).trim();
    if (!/^https?:\/\/[^\s<>'"]+$/i.test(str)) {
      return '';
    }
    return str.slice(0, maxLength);
  }

  sanitizeCoordinate(val, isLat = true) {
    if (val === null || val === undefined || val === '') return null;
    const num = parseFloat(val);
    if (isNaN(num)) return null;
    if (isLat && (num < -90 || num > 90)) return null;
    if (!isLat && (num < -180 || num > 180)) return null;
    return num;
  }

  // Validate and sanitize CSV rows to prevent malicious payloads or invalid data
  validateAndCleanCSVRows(csvRows) {
    const validRows = [];
    const errors = [];
    let skippedCount = 0;

    (csvRows || []).forEach((row, idx) => {
      const rawAddress = row.address || row.location || row.streetaddress || row.houseaddress || '';
      const address = this.sanitizeString(rawAddress, 300);

      if (!address || address.length < 3) {
        skippedCount++;
        if (errors.length < 5) {
          errors.push(`Row #${idx + 1}: Missing or invalid property address ("${rawAddress.slice(0, 30)}")`);
        }
        return;
      }

      const prosRaw = row.pros ? (Array.isArray(row.pros) ? row.pros : String(row.pros).split('|')) : [];
      const consRaw = row.cons ? (Array.isArray(row.cons) ? row.cons : String(row.cons).split('|')) : [];

      const cleanRow = {
        address: address,
        lat: this.sanitizeCoordinate(row.lat, true),
        lng: this.sanitizeCoordinate(row.lng || row.lon, false),
        price: this.sanitizeString(row.price, 50),
        lotSize: this.sanitizeString(row.lotsize || row.size, 50),
        sqft: this.sanitizeString(row.sqft || row.homesize, 50),
        rating: Math.min(5, Math.max(1, parseInt(row.rating) || 3)),
        terrain: this.sanitizeString(row.terrain, 100) || 'Flat',
        utilities: this.sanitizeString(row.utilities, 100) || 'All Available',
        hoaNotes: this.sanitizeString(row.hoanotes || row.hoa, 200),
        pros: prosRaw.map(p => this.sanitizeString(p, 100)).filter(p => p.length > 0),
        cons: consRaw.map(c => this.sanitizeString(c, 100)).filter(c => c.length > 0),
        notes: this.sanitizeString(row.notes || row.thoughts, 1000),
        photoUrl: this.sanitizeUrl(row.photourl || row.imageurl || row.photo),
        redfinUrl: this.sanitizeUrl(row.redfinurl || row.url),
        zillowUrl: this.sanitizeUrl(row.zillowurl),
        visited: row.visited === 'true' || row.visited === '1' || row.visited === true
      };

      validRows.push(cleanRow);
    });

    return { validRows, skippedCount, errors };
  }

  // Convert CSV rows to BuildRoute Stop Format & Merge
  mergeCSVRows(csvRows, existingStops = []) {
    const merged = [...existingStops];

    csvRows.forEach((row, idx) => {
      const address = this.sanitizeString(row.address || row.location || row.streetaddress || row.houseaddress || '', 300);
      if (!address) return;

      // Check if address already exists in current stops
      const existingIdx = merged.findIndex(s => s.address.toLowerCase() === address.toLowerCase());

      const stopObj = {
        id: existingIdx !== -1 ? merged[existingIdx].id : `stop-csv-${Date.now()}-${idx}`,
        address: address,
        lat: row.lat !== null && row.lat !== undefined ? parseFloat(row.lat) : (existingIdx !== -1 ? merged[existingIdx].lat : null),
        lng: row.lng !== null && row.lng !== undefined ? parseFloat(row.lng) : (existingIdx !== -1 ? merged[existingIdx].lng : null),
        price: row.price || (existingIdx !== -1 ? merged[existingIdx].price : ''),
        lotSize: row.lotSize || row.lotsize || (existingIdx !== -1 ? merged[existingIdx].lotSize : ''),
        sqft: row.sqft || (existingIdx !== -1 ? merged[existingIdx].sqft : ''),
        rating: row.rating ? parseInt(row.rating) : (existingIdx !== -1 ? merged[existingIdx].rating : 3),
        terrain: row.terrain || (existingIdx !== -1 ? merged[existingIdx].terrain : 'Flat'),
        utilities: row.utilities || (existingIdx !== -1 ? merged[existingIdx].utilities : 'All Available'),
        hoaNotes: row.hoaNotes || row.hoanotes || (existingIdx !== -1 ? merged[existingIdx].hoaNotes : ''),
        pros: Array.isArray(row.pros) ? row.pros : (row.pros ? row.pros.split('|').map(s => s.trim()) : (existingIdx !== -1 ? merged[existingIdx].pros : [])),
        cons: Array.isArray(row.cons) ? row.cons : (row.cons ? row.cons.split('|').map(s => s.trim()) : (existingIdx !== -1 ? merged[existingIdx].cons : [])),
        notes: row.notes || (existingIdx !== -1 ? merged[existingIdx].notes : ''),
        photoUrl: row.photoUrl || row.photourl || (existingIdx !== -1 ? merged[existingIdx].photoUrl : ''),
        redfinUrl: row.redfinUrl || (existingIdx !== -1 ? merged[existingIdx].redfinUrl : ''),
        visited: row.visited === true || row.visited === 'true' || row.visited === '1' || (existingIdx !== -1 ? merged[existingIdx].visited : false)
      };

      if (existingIdx !== -1) {
        merged[existingIdx] = stopObj;
      } else {
        merged.push(stopObj);
      }
    });

    return merged;
  }

  // Merge a full incoming stop list (from cross-device sync) into the
  // existing stops, matched by address (case-insensitive) — same
  // truthy-wins-per-field semantics as mergeCSVRows above, so pulling a
  // sync behaves the same way importing a CSV already does: it fills in
  // whatever the incoming side actually has data for, adds stops that
  // don't exist locally yet, and never blanks out a local field just
  // because the other device's copy of that stop hadn't been touched.
  mergeSyncedStops(incomingStops, existingStops = []) {
    const merged = [...existingStops];

    (incomingStops || []).forEach((incoming, idx) => {
      if (!incoming || !incoming.address) return;

      const existingIdx = merged.findIndex(s => s.address.toLowerCase() === incoming.address.toLowerCase());

      if (existingIdx === -1) {
        merged.push({ ...incoming, id: incoming.id || `stop-sync-${Date.now()}-${idx}` });
        return;
      }

      const existing = merged[existingIdx];
      merged[existingIdx] = {
        ...existing,
        ...incoming,
        id: existing.id,
        lat: (incoming.lat !== null && incoming.lat !== undefined) ? incoming.lat : existing.lat,
        lng: (incoming.lng !== null && incoming.lng !== undefined) ? incoming.lng : existing.lng,
        price: incoming.price || existing.price,
        lotSize: incoming.lotSize || existing.lotSize,
        hoaNotes: incoming.hoaNotes || existing.hoaNotes,
        notes: incoming.notes || existing.notes,
        photoUrl: incoming.photoUrl || existing.photoUrl,
        redfinUrl: incoming.redfinUrl || existing.redfinUrl,
        zillowUrl: incoming.zillowUrl || existing.zillowUrl,
        pros: (incoming.pros && incoming.pros.length) ? incoming.pros : existing.pros,
        cons: (incoming.cons && incoming.cons.length) ? incoming.cons : existing.cons
      };
    });

    return merged;
  }

  // Export Tour Data to CSV Spreadsheet
  exportToCSV(tourData, scheduleData) {
    if (!tourData || !tourData.stops || tourData.stops.length === 0) {
      alert('No tour stops to export.');
      return;
    }

    const headers = [
      'Stop Number',
      'Address',
      'ETA Arrival',
      'ETA Departure',
      'Price',
      'Lot Size',
      'Rating (1-5)',
      'Terrain',
      'Utilities',
      'HOA Notes',
      'Pros',
      'Cons',
      'Thoughts / Notes',
      'Photo URL',
      'Visited',
      'Latitude',
      'Longitude'
    ];

    const rows = [headers];

    tourData.stops.forEach((stop, idx) => {
      const scheduleItem = scheduleData && scheduleData.orderedStops ? scheduleData.orderedStops[idx] : null;

      rows.push([
        idx + 1,
        `"${(stop.address || '').replace(/"/g, '""')}"`,
        scheduleItem ? scheduleItem.formattedArrival : '',
        scheduleItem ? scheduleItem.formattedDeparture : '',
        `"${(stop.price || '').replace(/"/g, '""')}"`,
        `"${(stop.lotSize || '').replace(/"/g, '""')}"`,
        stop.rating || 3,
        `"${(stop.terrain || 'Flat').replace(/"/g, '""')}"`,
        `"${(stop.utilities || 'All Available').replace(/"/g, '""')}"`,
        `"${(stop.hoaNotes || '').replace(/"/g, '""')}"`,
        `"${(stop.pros ? stop.pros.join('|') : '').replace(/"/g, '""')}"`,
        `"${(stop.cons ? stop.cons.join('|') : '').replace(/"/g, '""')}"`,
        `"${(stop.notes || '').replace(/"/g, '""')}"`,
        `"${(stop.photoUrl || '').replace(/"/g, '""')}"`,
        stop.visited ? 'Yes' : 'No',
        stop.lat || '',
        stop.lng || ''
      ]);
    });

    const csvContent = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Homeward_Tour_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  // Export JSON Backup
  exportToJSON(tourData) {
    const jsonStr = JSON.stringify(tourData, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Homeward_Backup_${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }
}

window.storageManager = new StorageManager();
