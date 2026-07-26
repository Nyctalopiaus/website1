const INTERESTED_KEYS = ['nycto_interested_shows', 'gig_grid_interested_shows'];
const LEGACY_INTERESTED_KEY = 'metal_interested_shows';

export function getInterestedIds() {
  for (const key of INTERESTED_KEYS) {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch (error) {
      console.error(`Failed to parse interested shows for key ${key}`, error);
    }
  }

  // One-time legacy migration path from pre-rename key.
  try {
    const legacyRaw = localStorage.getItem(LEGACY_INTERESTED_KEY);
    if (legacyRaw) {
      const parsedLegacy = JSON.parse(legacyRaw);
      if (Array.isArray(parsedLegacy)) {
        const uniqueIds = Array.from(new Set(parsedLegacy.map(id => String(id))));
        localStorage.setItem('nycto_interested_shows', JSON.stringify(uniqueIds));
        localStorage.removeItem(LEGACY_INTERESTED_KEY);
        return uniqueIds;
      }
    }
  } catch (error) {
    console.error('Failed to migrate legacy interested shows', error);
  }

  return [];
}

export function saveInterestedIds(ids) {
  try {
    const uniqueIds = Array.from(new Set((ids || []).map(id => String(id))));
    localStorage.setItem('nycto_interested_shows', JSON.stringify(uniqueIds));
  } catch (error) {
    console.error('Failed to save interested shows', error);
  }
}

const IGNORE_KEYS = ['nycto_ignored_events', 'metal_ignored_events', 'ignored_events', 'metal_ignored_shows_ignored'];

export function getIgnoredEventIds() {
  const allIds = new Set();
  IGNORE_KEYS.forEach(key => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          parsed.forEach(id => allIds.add(String(id)));
        }
      }
    } catch (error) {
      console.error(`Failed to parse ignored events for key ${key}`, error);
    }
  });
  return Array.from(allIds);
}

export function saveIgnoredEventIds(ids) {
  try {
    if (!ids || ids.length === 0) {
      IGNORE_KEYS.forEach(key => localStorage.removeItem(key));
    } else {
      const uniqueIds = Array.from(new Set(ids.map(id => String(id))));
      localStorage.setItem('nycto_ignored_events', JSON.stringify(uniqueIds));
    }
  } catch (error) {
    console.error('Failed to save ignored event IDs', error);
  }
}
