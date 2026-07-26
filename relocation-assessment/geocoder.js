/* geocoder.js - Multi-Provider Geocoding & Address Formatting Engine */
(function(window) {
  'use strict';

  async function fetchJson(url, options = {}, timeoutMs = 25000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          ...(options.headers || {}),
          Accept: 'application/json'
        }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timer);
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

  function extractCityNameFromQuery(query) {
    if (!query) return '';
    const parts = String(query).split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return parts[1].replace(/\d+/g, '').trim();
    }
    const words = String(query).replace(/\d+/g, '').split(/\s+/).filter(Boolean);
    const streetTokens = new Set(['st', 'street', 'ave', 'avenue', 'rd', 'road', 'dr', 'drive', 'blvd', 'boulevard', 'way', 'ct', 'court', 'ln', 'lane', 's', 'n', 'e', 'w', 'south', 'north', 'east', 'west']);
    const cityWords = words.filter((w) => !streetTokens.has(w.toLowerCase()));
    return cityWords.length ? cityWords.join(' ') : words.join(' ');
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

  async function queryNominatimSingle(queryStr, limit, timeoutMs) {
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', queryStr);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('addressdetails', '1');

    const data = await fetchJson(url.toString(), {
      headers: { 'Accept-Language': 'en' }
    }, timeoutMs);

    if (!Array.isArray(data) || !data.length) return [];

    const candidates = data
      .map((hit) => {
        const lat = parseFloat(hit.lat);
        const lon = parseFloat(hit.lon);
        if (isNaN(lat) || isNaN(lon)) return null;

        const bboxRaw = Array.isArray(hit.boundingbox) ? hit.boundingbox : [];
        const south = bboxRaw[0] !== undefined ? parseFloat(bboxRaw[0]) : lat - 0.02;
        const north = bboxRaw[1] !== undefined ? parseFloat(bboxRaw[1]) : lat + 0.02;
        const west = bboxRaw[2] !== undefined ? parseFloat(bboxRaw[2]) : lon - 0.02;
        const east = bboxRaw[3] !== undefined ? parseFloat(bboxRaw[3]) : lon + 0.02;

        return {
          displayName: formatAddressFromHit(hit),
          center: { lat, lon },
          bbox: { south, north, west, east }
        };
      })
      .filter(Boolean);

    return deduplicateCandidates(candidates);
  }

  async function fetchNominatimCandidates(query, options = {}) {
    const limit = Math.max(1, Math.min(8, parseInt(options.limit || 6, 10)));
    const timeoutMs = Math.max(1500, Math.min(4000, parseInt(options.timeoutMs || 2500, 10)));

    // Stage 1: Full exact query (2.5s max)
    let hits = await queryNominatimSingle(query, limit, timeoutMs);
    if (hits.length > 0) return deduplicateCandidates(hits);

    // Stage 2: Strip house number and search street + city (2.5s max)
    const strippedHouse = query.replace(/^\d+[a-zA-Z]?\s+/, '').trim();
    if (strippedHouse && strippedHouse !== query) {
      hits = await queryNominatimSingle(strippedHouse, limit, timeoutMs);
      if (hits.length > 0) return deduplicateCandidates(hits);
    }

    // Stage 3: Search city/state only (2.5s max)
    const cityName = extractCityNameFromQuery(query);
    if (cityName && cityName !== query) {
      hits = await queryNominatimSingle(cityName, limit, timeoutMs);
      if (hits.length > 0) return deduplicateCandidates(hits);
    }

    throw new Error('No Nominatim results found');
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

  async function fetchPhotonCandidates(query, limit = 6) {
    const url = new URL('https://photon.komoot.io/api/');
    url.searchParams.set('q', query);
    url.searchParams.set('limit', String(limit));

    const data = await fetchJson(url.toString(), {}, 2500);
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

  async function fetchOpenMeteoCandidates(query, limit = 6) {
    const searchName = extractCityNameFromQuery(query) || query.replace(/^\d+[a-zA-Z]?\s+/, '').trim() || query;
    const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
    url.searchParams.set('name', searchName);
    url.searchParams.set('count', String(limit));

    const data = await fetchJson(url.toString(), {}, 3500);
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

    // Provider 1: Photon Komoot (Ultra-fast instant typeahead)
    try {
      const results = await fetchPhotonCandidates(query, limit);
      if (Array.isArray(results) && results.length > 0) return deduplicateCandidates(results);
    } catch (_err0) {}

    // Provider 2: Nominatim OpenStreetMap (3-stage fallback)
    try {
      const results = await fetchNominatimCandidates(query, options);
      if (Array.isArray(results) && results.length > 0) return deduplicateCandidates(results);
    } catch (_err1) {}

    // Provider 3: Open-Meteo Geocoding
    try {
      const results = await fetchOpenMeteoCandidates(query, limit);
      if (Array.isArray(results) && results.length > 0) return deduplicateCandidates(results);
    } catch (_err2) {}

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
