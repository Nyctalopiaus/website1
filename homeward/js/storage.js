/**
 * BuildRoute Storage & CSV Import/Export Module
 * LocalStorage persistence, PapaParse-style CSV parsing & merging, and master CSV export.
 */
class StorageManager {
  constructor() {
    this.storageKey = 'homeward_active_tour_v1';
  }

  saveTour(tourData) {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(tourData));
    } catch (e) {
      console.warn('LocalStorage save failed:', e);
    }
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

  getCachedPropertySync(addressOrUrl) {
    if (!addressOrUrl) return null;
    const normKey = this._normalizeCacheKey(addressOrUrl);
    if (!normKey) return null;
    try {
      const localItem = localStorage.getItem(`homeward_prop_cache_${normKey}`);
      if (localItem) {
        const parsed = JSON.parse(localItem);
        if (parsed && parsed.data) {
          return this._sanitizePropertyRecord(parsed.data);
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
          return { ...sanitized, cachedSource: 'LocalStorage (0ms)' };
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

  // Convert CSV rows to BuildRoute Stop Format & Merge
  mergeCSVRows(csvRows, existingStops = []) {
    const merged = [...existingStops];

    csvRows.forEach((row, idx) => {
      const address = row.address || row.location || row.streetaddress || row.houseaddress || '';
      if (!address) return;

      // Check if address already exists in current stops
      const existingIdx = merged.findIndex(s => s.address.toLowerCase() === address.toLowerCase());

      const stopObj = {
        id: existingIdx !== -1 ? merged[existingIdx].id : `stop-csv-${Date.now()}-${idx}`,
        address: address,
        lat: row.lat ? parseFloat(row.lat) : (existingIdx !== -1 ? merged[existingIdx].lat : null),
        lng: row.lng || row.lon ? parseFloat(row.lng || row.lon) : (existingIdx !== -1 ? merged[existingIdx].lng : null),
        price: row.price || (existingIdx !== -1 ? merged[existingIdx].price : ''),
        lotSize: row.lotsize || row.size || (existingIdx !== -1 ? merged[existingIdx].lotSize : ''),
        rating: row.rating ? parseInt(row.rating) : (existingIdx !== -1 ? merged[existingIdx].rating : 3),
        terrain: row.terrain || (existingIdx !== -1 ? merged[existingIdx].terrain : 'Flat'),
        utilities: row.utilities || (existingIdx !== -1 ? merged[existingIdx].utilities : 'All Available'),
        hoaNotes: row.hoanotes || row.hoa || (existingIdx !== -1 ? merged[existingIdx].hoaNotes : ''),
        pros: row.pros ? row.pros.split('|').map(s => s.trim()) : (existingIdx !== -1 ? merged[existingIdx].pros : []),
        cons: row.cons ? row.cons.split('|').map(s => s.trim()) : (existingIdx !== -1 ? merged[existingIdx].cons : []),
        notes: row.notes || row.thoughts || (existingIdx !== -1 ? merged[existingIdx].notes : ''),
        photoUrl: row.photourl || row.imageurl || row.photo || (existingIdx !== -1 ? merged[existingIdx].photoUrl : ''),
        visited: row.visited === 'true' || row.visited === '1' || (existingIdx !== -1 ? merged[existingIdx].visited : false)
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
