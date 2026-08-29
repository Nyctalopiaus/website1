/**
 * DoorScout Local Storage Manager
 * Handles local persistence of multiple target addresses, start location, saved routes, door notes, and settings.
 */

class StorageManager {
  constructor() {
    this.storageKey = 'doorscout_session_data_v2';
  }

  loadSession() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        // Ensure backwards compatibility with single target format
        if (!Array.isArray(parsed.targets) && parsed.targetAddress) {
          parsed.targets = [{
            id: 'target_legacy',
            address: parsed.targetAddress,
            coords: parsed.targetCoords,
            radiusMiles: parsed.radiusMiles || 0.5
          }];
        }
        return parsed;
      }
    } catch (e) {
      console.warn('Failed to load door scout session from localStorage:', e);
    }
    return this.getDefaultSession();
  }

  saveSession(sessionData) {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(sessionData));
    } catch (e) {
      console.warn('Failed to save door scout session to localStorage:', e);
    }
  }

  getDefaultSession() {
    return {
      startAddress: '',
      startCoords: null,
      targets: [
        {
          id: 'target_1',
          address: '',
          coords: null,
          radiusMiles: 0.5
        }
      ],
      density: 'tight', // Default to Tight (All Streets)
      transportMode: 'driving',
      isRoundTrip: true,
      notes: [],
      lastGeneratedRoute: null
    };
  }
}

window.StorageManager = StorageManager;
