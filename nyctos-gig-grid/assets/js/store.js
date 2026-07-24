export function getInterestedIds() {
  try {
    const raw = localStorage.getItem('metal_interested_shows');
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    console.error('Failed to parse interested shows', error);
    return [];
  }
}

export function saveInterestedIds(ids) {
  try {
    localStorage.setItem('metal_interested_shows', JSON.stringify(ids));
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
