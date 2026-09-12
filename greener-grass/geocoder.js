/* geocoder.js - Multi-Provider Geocoding & Address Formatting Engine */
(function(window) {
  'use strict';

  function hostnameOf(url) {
    try {
      return new URL(url).hostname;
    } catch (_err) {
      return url;
    }
  }

  async function fetchJson(url, options = {}, timeoutMs = 25000) {
    const { signal: externalSignal, ...restOptions } = options;
    // AbortSignal.timeout()/AbortSignal.any() (native, no manual relay
    // controller/listener needed) combine our own timeout with an optional
    // caller-supplied signal -- e.g. the address-field typeahead cancelling a
    // lookup that's been superseded by a newer keystroke. An earlier
    // hand-rolled version of this (a manual AbortController + 'abort'
    // listener relaying into a second internal controller) leaked genuine
    // unhandled promise rejections under real network timing in prod -- see
    // the 2026-08-30 relocation-assessment project notes. Letting the
    // browser own the signal composition avoids that whole class of bug.
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const combinedSignal = externalSignal ? AbortSignal.any([externalSignal, timeoutSignal]) : timeoutSignal;

    try {
      const response = await fetch(url, {
        ...restOptions,
        signal: combinedSignal,
        headers: {
          ...(restOptions.headers || {}),
          Accept: 'application/json'
        }
      });
      if (!response.ok) {
        const err = new Error(`HTTP ${response.status} from ${hostnameOf(url)}`);
        err.status = response.status;
        throw err;
      }
      return await response.json();
    } catch (err) {
      // Name *which* host and how this failed (timeout vs. cancelled vs. bad
      // status vs. a network-level error like CORS/DNS/offline) instead of a
      // bare "AbortError" -- that's the detail that ends up in the debug log
      // and actually explains a failed lookup. Check the SOURCE signals'
      // own `.aborted` state rather than parsing `err.name`/`err.message` --
      // more robust regardless of exactly how the browser names/labels the
      // rejection for a given abort reason.
      if (err && err.name === 'AbortError') {
        if (externalSignal && externalSignal.aborted) {
          const cancelErr = new Error(`Lookup for ${hostnameOf(url)} cancelled -- superseded by a newer request`);
          cancelErr.name = 'CancelledError';
          throw cancelErr;
        }
        const timeoutErr = new Error(`Timed out after ${timeoutMs}ms contacting ${hostnameOf(url)}`);
        timeoutErr.name = 'TimeoutError';
        throw timeoutErr;
      }
      if (err instanceof TypeError) {
        throw new Error(`Network error contacting ${hostnameOf(url)}: ${err.message}`);
      }
      throw err;
    }
  }

  function formatCleanAddress(displayName) {
    if (!displayName) return '';
    let str = String(displayName).trim();
    str = str.replace(/^(\d+[a-zA-Z]?),\s*/, '$1 ');
    return str;
  }

  function getShortAddressLabel(displayName, rawQuery) {
    const raw = displayName ? formatCleanAddress(displayName) : formatCleanAddress(rawQuery || '');
    if (!raw) return '';
    const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0]}, ${parts[1]}`;
    }
    return parts[0] || raw;
  }

  // Returns:
  //   a non-empty string -- our best guess at the city name.
  //   ''  -- no street structure was recognized at all (e.g. a bare place
  //          name like "Denver"); the caller may reasonably treat the whole
  //          query as a place-name search.
  //   null -- we recognized a street-type word (St/Dr/Ave/...) but nothing
  //          follows it yet, i.e. the city genuinely hasn't been typed yet.
  //          Callers must NOT fall back to guessing here -- see below.
  function extractCityNameFromQuery(query) {
    if (!query) return '';
    const parts = String(query).split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return parts[1].replace(/\d+/g, '').trim();
    }
    // No comma to separate street from city -- typically because the user
    // is still mid-typing. Guessing which words are "the city" here is
    // ambiguous, and a street *name* can itself collide with a real place
    // name (e.g. "5578 S Telluride St" -- Telluride is a real CO town,
    // ~250mi from an actual Centennial, CO address). Directional words
    // (S/N/E/W/...) are NOT reliable end-of-street markers -- they usually
    // come right before the street *name*, not after it -- so only a real
    // street-type suffix (St/Dr/Ave/...) is trusted to mark where the
    // street segment ends. Only words after the LAST such suffix are
    // treated as the city; if none exists yet, report that explicitly with
    // `null` rather than guessing from the leftover words (which is what
    // previously matched "telluride" as if it were the city).
    const words = String(query).replace(/\d+/g, '').split(/\s+/).filter(Boolean);
    const streetTypeTokens = new Set(['st', 'street', 'ave', 'avenue', 'rd', 'road', 'dr', 'drive', 'blvd', 'boulevard', 'way', 'ct', 'court', 'ln', 'lane', 'pl', 'place', 'cir', 'circle', 'ter', 'terrace', 'pkwy', 'parkway', 'hwy', 'highway']);
    let lastTypeIdx = -1;
    words.forEach((w, idx) => {
      if (streetTypeTokens.has(w.toLowerCase())) lastTypeIdx = idx;
    });
    if (lastTypeIdx === -1) return '';
    const cityWords = words.slice(lastTypeIdx + 1);
    return cityWords.length ? cityWords.join(' ') : null;
  }

  function formatAddressFromHit(hit) {
    if (!hit) return '';
    if (hit.address) {
      const a = hit.address;
      const house = a.house_number ? `${a.house_number} ` : '';
      const road = a.road || a.street || a.pedestrian || a.suburb || '';
      const city = a.city || a.town || a.village || a.municipality || a.county || '';
      let state = a.state || a.state_code || '';
      const zip = a.postcode || '';

      const stateMap = {
        'colorado': 'CO', 'california': 'CA', 'new york': 'NY', 'texas': 'TX',
        'florida': 'FL', 'illinois': 'IL', 'washington': 'WA', 'arizona': 'AZ',
        'nevada': 'NV', 'utah': 'UT', 'oregon': 'OR'
      };
      if (stateMap[state.toLowerCase()]) {
        state = stateMap[state.toLowerCase()];
      }

      const parts = [];
      if (house || road) parts.push(`${house}${road}`.trim());
      if (city) parts.push(city);
      if (state || zip) parts.push(`${state} ${zip}`.trim());

      const formatted = parts.filter(Boolean).join(', ');
      if (formatted && formatted.length > 5) return formatted;
    }

    return formatCleanAddress(hit.display_name || '');
  }

  function deduplicateCandidates(candidates) {
    if (!Array.isArray(candidates)) return [];
    const seen = new Set();
    return candidates.filter((c) => {
      if (!c || !c.displayName) return false;
      const key = c.displayName.toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function isStreetMatch(query, streetName) {
    if (!query || !streetName) return true;
    const qLower = String(query).toLowerCase();
    const sLower = String(streetName).toLowerCase();
    const streetTokens = sLower
      .replace(/[^a-z0-9]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2 && t !== 'drive' && t !== 'street' && t !== 'road' && t !== 'avenue' && t !== 'east' && t !== 'west' && t !== 'north' && t !== 'south');
    if (!streetTokens.length) return true;
    return streetTokens.some((token) => qLower.includes(token));
  }

  async function fetchPhotonCandidates(query, limit = 6, signal) {
    const url = new URL('https://photon.komoot.io/api/');
    url.searchParams.set('q', query);
    url.searchParams.set('limit', String(limit));

    const data = await fetchJson(url.toString(), { signal }, 5000);

    const features = Array.isArray(data?.features) ? data.features : [];
    if (!features.length) throw new Error('No Photon candidates found');

    const queryHouseMatch = String(query).match(/^\d+[a-zA-Z]?/);
    const qHouse = queryHouseMatch ? queryHouseMatch[0] : '';

    const results = features
      .map((f) => {
        const coords = f.geometry?.coordinates || [0, 0];
        const lon = parseFloat(coords[0]);
        const lat = parseFloat(coords[1]);
        const props = f.properties || {};

        const streetName = props.street || (props.osm_key === 'highway' || props.type === 'street' ? props.name : '') || (props.name !== props.city ? props.name : '') || '';

        // If the candidate street does not match the user's typed street, filter it out!
        if (streetName && !isStreetMatch(query, streetName)) return null;

        const houseNum = props.housenumber || qHouse;
        const streetPart = houseNum && streetName ? `${houseNum} ${streetName}` : streetName;

        const parts = [
          streetPart,
          props.city || props.town || props.village || props.district,
          props.state,
          props.postcode
        ].filter(Boolean);

        const label = parts.length >= 2 ? parts.join(', ') : (props.name || query);
        return {
          displayName: formatCleanAddress(label),
          center: { lat, lon },
          bbox: { south: lat - 0.02, north: lat + 0.02, west: lon - 0.02, east: lon + 0.02 }
        };
      })
      .filter(Boolean);

    if (!results.length) throw new Error('No matching Photon candidates found');
    return results;
  }

  async function fetchOpenMeteoCandidates(query, limit = 6, signal) {
    const cityGuess = extractCityNameFromQuery(query);
    if (cityGuess === null) {
      // A street-type suffix (St/Dr/Ave/...) was found but nothing follows
      // it yet -- the city hasn't been typed. Report an honest "nothing to
      // search yet" rather than falling back to a guess built from the
      // street name itself, which risks matching an unrelated real place
      // (see extractCityNameFromQuery).
      throw new Error('No Open-Meteo candidates found');
    }
    const searchName = cityGuess || query.replace(/^\d+[a-zA-Z]?\s+/, '').trim() || query;
    const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
    url.searchParams.set('name', searchName);
    url.searchParams.set('count', String(limit));

    const data = await fetchJson(url.toString(), { signal }, 3500);
    const results = Array.isArray(data?.results) ? data.results : [];
    if (!results.length) throw new Error('No Open-Meteo candidates found');

    return results.map((r) => {
      const lat = parseFloat(r.latitude);
      const lon = parseFloat(r.longitude);
      const label = `${query} (${r.name}, ${r.admin1 || r.country || ''})`;
      return {
        displayName: formatCleanAddress(label),
        center: { lat, lon },
        bbox: { south: lat - 0.02, north: lat + 0.02, west: lon - 0.02, east: lon + 0.02 }
      };
    });
  }

  async function fetchGeocodeCandidates(query, options = {}) {
    const limit = Math.max(1, Math.min(8, parseInt(options.limit || 6, 10)));
    const signal = options.signal;
    const logger = window.RelocationLogger;
    const startedAt = Date.now();

    // The address-field typeahead passes its own AbortSignal so a lookup
    // for a stale, already-superseded prefix can be cut short instead of
    // running the full Photon+Open-Meteo waterfall (up to ~8.5s) to
    // completion for no reason. A real search submission never passes a
    // signal, so this has no effect there.
    function throwIfCancelled() {
      if (signal && signal.aborted) {
        const err = new Error('Lookup cancelled -- superseded by a newer request');
        err.name = 'CancelledError';
        throw err;
      }
    }

    throwIfCancelled();

    // Provider 1: Photon Komoot (Exact street address geocoding)
    try {
      const results = await fetchPhotonCandidates(query, limit, signal);
      if (Array.isArray(results) && results.length > 0) {
        logger?.info('geocoder:photon', `Resolved "${query}" -> ${results.length} result(s) in ${Date.now() - startedAt}ms`);
        return deduplicateCandidates(results);
      }
    } catch (err0) {
      if (err0 && err0.name === 'CancelledError') throw err0;
      logger?.warn('geocoder:photon', `Failed for "${query}"`, logger?.describeError(err0));
    }

    throwIfCancelled();

    // Provider 2: Open-Meteo Geocoding
    // (Nominatim was previously provider 2 here but was removed 2026-08-29:
    // logging revealed every Nominatim request from this domain was being
    // blocked -- "No 'Access-Control-Allow-Origin' header is present" -- so
    // it was a guaranteed-failure dead end on every search that reached it,
    // not an occasional fallback. See relocation-assessment project memory.)
    try {
      const results = await fetchOpenMeteoCandidates(query, limit, signal);
      if (Array.isArray(results) && results.length > 0) {
        logger?.info('geocoder:open-meteo', `Resolved "${query}" -> ${results.length} result(s) in ${Date.now() - startedAt}ms`);
        return deduplicateCandidates(results);
      }
    } catch (err1) {
      if (err1 && err1.name === 'CancelledError') throw err1;
      logger?.warn('geocoder:open-meteo', `Failed for "${query}"`, logger?.describeError(err1));
    }

    logger?.error('geocoder', `Both providers failed to resolve "${query}" (${Date.now() - startedAt}ms)`);
    throw new Error(`Address '${query}' could not be resolved by live geocoders.`);
  }

  window.RelocationGeocoder = {
    fetchGeocodeCandidates,
    formatCleanAddress,
    getShortAddressLabel,
    extractCityNameFromQuery,
    fetchJson
  };
})(window);
