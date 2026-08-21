/* spatial.js - Overpass Live Queries & Spatial GIS Analysis */
(function(window) {
  'use strict';

  const OVERPASS_ENDPOINTS = [
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
    'https://overpass.osm.ch/api/interpreter',
    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
    'https://overpass-api.de/api/interpreter'
  ];
  // Kept fairly generous (real Overpass responses for this app's small radius/POI
  // queries typically land in 1-4s) but well below the old 25s: with 5 mirrors tried
  // strictly in sequence, a full outage used to mean up to 125s of silence before the
  // Nominatim fallback kicked in. 9s per mirror caps that worst case at ~45s instead.
  const OVERPASS_ENDPOINT_TIMEOUT_MS = 9000;

  function haversineMeters(aLat, aLon, bLat, bLon) {
    const toRad = Math.PI / 180;
    const dLat = (bLat - aLat) * toRad;
    const dLon = (bLon - aLon) * toRad;
    const lat1 = aLat * toRad;
    const lat2 = bLat * toRad;

    const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    return 6371000 * c;
  }

  function lineDistanceMiles(geom) {
    if (!Array.isArray(geom) || geom.length < 2) return 0;
    let meters = 0;
    for (let i = 1; i < geom.length; i++) {
      const prev = geom[i - 1];
      const cur = geom[i];
      meters += haversineMeters(prev.lat, prev.lon, cur.lat, cur.lon);
    }
    return meters / 1609.344;
  }

  function radiusMetersFromMinutes(minutes) {
    return Math.max(500, Math.min(10500, minutes * 350));
  }

  function deduplicateNearbyPlaces(places) {
    if (!Array.isArray(places) || !places.length) return [];
    const unique = [];

    for (const pt of places) {
      const pName = (pt.name || '').trim().toLowerCase();
      const pUnnamed = !pName || pName === 'unnamed place' || pName === 'unnamed';

      const isDuplicate = unique.some((existing) => {
        const eName = (existing.name || '').trim().toLowerCase();
        const eUnnamed = !eName || eName === 'unnamed place' || eName === 'unnamed';

        // Rule 1: Same business name -> merge duplicate database entries
        if (!pUnnamed && !eUnnamed && pName === eName) return true;

        // Rule 2: Unnamed features within 40m -> merge database noise
        const dist = haversineMeters(existing.lat, existing.lon, pt.lat, pt.lon);
        if (pUnnamed && dist <= 40) return true;

        return false;
      });

      if (!isDuplicate) {
        unique.push(pt);
      }
    }
    return unique;
  }

  function countWithin(center, points, radiusMeters) {
    return points.filter((p) => haversineMeters(center.lat, center.lon, p.lat, p.lon) <= radiusMeters);
  }

  function hasAnyDataPoints(parsed) {
    if (!parsed) return false;
    return (
      (parsed.grocery?.length || 0) +
      (parsed.fitness?.length || 0) +
      (parsed.cuisine?.length || 0) +
      (parsed.gas?.length || 0) +
      (parsed.parks?.length || 0) +
      (parsed.pharmacy?.length || 0) +
      (parsed.cycleways?.length || 0)
    ) > 0;
  }

  function buildOverpassQuery(center, radiusMeters, selectedKeys, cuisineTags = []) {
    const lat = center.lat;
    const lon = center.lon;
    const radius = Math.round(radiusMeters);
    const config = window.RelocationKeywords?.CATEGORY_CONFIG || {};

    const selected = new Set(Array.isArray(selectedKeys) ? selectedKeys : []);
    const userCuisineRegex = cuisineTags.length
      ? cuisineTags.map((c) => c.replace(/[^a-zA-Z0-9_\-\s]/g, '')).join('|')
      : 'american|italian|mexican|chinese|japanese|thai|indian|vietnamese|sushi|pizza|burger';

    const clauses = [];

    selected.forEach((key) => {
      const cat = config[key];
      if (!cat) return;
      if (key === 'cuisine') {
        if (cuisineTags && cuisineTags.length > 0) {
          const userCuisineRegex = cuisineTags.map((c) => c.replace(/[^a-zA-Z0-9_\-\s]/g, '')).join('|');
          clauses.push(`node(around:${radius},${lat},${lon})["amenity"="restaurant"]["cuisine"~"${userCuisineRegex}",i];`);
          clauses.push(`way(around:${radius},${lat},${lon})["amenity"="restaurant"]["cuisine"~"${userCuisineRegex}",i];`);
        } else {
          clauses.push(`node(around:${radius},${lat},${lon})["amenity"="restaurant"];`);
          clauses.push(`way(around:${radius},${lat},${lon})["amenity"="restaurant"];`);
        }
        return;
      }
      if (Array.isArray(cat.overpassClauses)) {
        cat.overpassClauses.forEach((tagSelector) => {
          clauses.push(`node(around:${radius},${lat},${lon})${tagSelector};`);
          clauses.push(`way(around:${radius},${lat},${lon})${tagSelector};`);
        });
      }
    });

    const outMode = 'out center tags;';
    const body = clauses.length ? clauses.join('\n  ') : `node(around:${radius},${lat},${lon})["amenity"="pharmacy"];`;

    return `
[out:json][timeout:25];
(
  ${body}
);
${outMode}
`;
  }

  let overpassEndpointIndex = 0;

  async function requestOverpassEndpoint(endpoint, queryText) {
    const body = new URLSearchParams({ data: queryText }).toString();

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json, */*'
        },
        body,
        signal: AbortSignal.timeout(OVERPASS_ENDPOINT_TIMEOUT_MS)
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.text();
      return JSON.parse(raw);
    } catch (err) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        throw new Error(`Timed out after ${OVERPASS_ENDPOINT_TIMEOUT_MS}ms`);
      }
      throw err;
    }
  }

  async function runOverpassQuery(queryText) {
    let lastError = null;
    const numEndpoints = OVERPASS_ENDPOINTS.length;

    for (let i = 0; i < numEndpoints; i++) {
      const endpoint = OVERPASS_ENDPOINTS[(overpassEndpointIndex + i) % numEndpoints];
      try {
        const data = await requestOverpassEndpoint(endpoint, queryText);
        if (data && Array.isArray(data.elements) && data.elements.length > 0) {
          overpassEndpointIndex = (overpassEndpointIndex + i + 1) % numEndpoints;
          return data;
        }
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError || new Error('All live Overpass endpoints failed to respond.');
  }

  function getElementCenter(el) {
    if (!el || typeof el !== 'object') return null;
    if (typeof el.lat === 'number' && typeof el.lon === 'number') return { lat: el.lat, lon: el.lon };
    if (el.center && typeof el.center.lat === 'number' && typeof el.center.lon === 'number') {
      return { lat: el.center.lat, lon: el.center.lon };
    }
    return null;
  }

  function parseOverpassData(data) {
    const elements = Array.isArray(data?.elements) ? data.elements : [];
    const parsed = {
      grocery: [],
      fitness: [],
      cuisine: [],
      gas: [],
      parks: [],
      pharmacy: [],
      cycleways: []
    };

    for (const el of elements) {
      const tags = el.tags || {};
      const center = getElementCenter(el);
      if (!center && el.type !== 'way') continue;

      const rawName = (tags.name || tags['name:en'] || tags.brand || tags.operator || '').trim();
      const isUnnamed = !rawName || rawName.toLowerCase() === 'unnamed' || rawName.toLowerCase() === 'unnamed place';

      // Filter out unnamed places so anonymous nodes are never counted or displayed
      if (isUnnamed && el.type !== 'way') continue;
      const name = rawName || 'Cycleway segment';

      const shop = (tags.shop || '').toLowerCase();
      const amenity = (tags.amenity || '').toLowerCase();
      const leisure = (tags.leisure || '').toLowerCase();

      if ((shop === 'supermarket' || shop === 'grocery' || shop === 'convenience' || shop === 'food' || shop === 'deli' || shop === 'baker' || shop === 'butcher' || shop === 'greengrocer' || shop === 'farm' || shop === 'department_store' || shop === 'general' || amenity === 'marketplace' || amenity === 'food_court') && center) {
        parsed.grocery.push({ lat: center.lat, lon: center.lon, name });
        continue;
      }

      const sportVal = (tags.sport || '').toLowerCase();
      if ((leisure === 'fitness_centre' || leisure === 'sports_centre' || leisure === 'fitness_station' || leisure === 'sports_hall' || leisure === 'dance' || amenity === 'gym' || sportVal.includes('fitness') || sportVal.includes('gym') || sportVal.includes('pilates') || sportVal.includes('yoga') || sportVal.includes('climbing') || sportVal.includes('boxing')) && center) {
        parsed.fitness.push({ lat: center.lat, lon: center.lon, name });
        continue;
      }

      if ((amenity === 'restaurant' || amenity === 'fast_food' || amenity === 'cafe' || amenity === 'pub' || amenity === 'bar' || amenity === 'food_court' || amenity === 'bistro' || amenity === 'ice_cream') && center) {
        parsed.cuisine.push({ lat: center.lat, lon: center.lon, name });
        continue;
      }

      if ((amenity === 'fuel' || shop === 'gas' || shop === 'fuel') && center) {
        parsed.gas.push({ lat: center.lat, lon: center.lon, name });
        continue;
      }

      if ((amenity === 'pharmacy' || (tags.healthcare || '').toLowerCase() === 'pharmacy' || shop === 'chemist') && center) {
        parsed.pharmacy.push({ lat: center.lat, lon: center.lon, name });
        continue;
      }

      if ((leisure === 'park' || leisure === 'dog_park' || leisure === 'playground') && center) {
        parsed.parks.push({ lat: center.lat, lon: center.lon, name });
        continue;
      }

      if (el.type === 'way' && (((tags.highway || '').toLowerCase() === 'cycleway') || tags.cycleway)) {
        const cycleCenter = center || (Array.isArray(el.geometry) && el.geometry[0]
          ? { lat: el.geometry[0].lat, lon: el.geometry[0].lon }
          : null);
        if (!cycleCenter) continue;
        parsed.cycleways.push({
          lat: cycleCenter.lat,
          lon: cycleCenter.lon,
          miles: lineDistanceMiles(el.geometry || []) || 0.25,
          geometry: Array.isArray(el.geometry) ? el.geometry : [],
          name: 'Cycleway segment'
        });
      }
    }

    return {
      grocery: deduplicateNearbyPlaces(parsed.grocery),
      fitness: deduplicateNearbyPlaces(parsed.fitness),
      cuisine: deduplicateNearbyPlaces(parsed.cuisine),
      gas: deduplicateNearbyPlaces(parsed.gas),
      parks: deduplicateNearbyPlaces(parsed.parks),
      pharmacy: deduplicateNearbyPlaces(parsed.pharmacy),
      cycleways: parsed.cycleways
    };
  }

  async function queryNominatimCategory(center, radiusMeters, query, limit = 25) {
    const lat = Number(center.lat);
    const lon = Number(center.lon);
    const latDelta = Math.max(0.01, Math.min(0.05, radiusMeters / 111000));
    const lonDelta = Math.max(0.01, Math.min(0.08, radiusMeters / (111000 * Math.max(Math.cos(lat * Math.PI / 180), 0.25))));

    const left = lon - lonDelta;
    const right = lon + lonDelta;
    const top = lat + latDelta;
    const bottom = lat - latDelta;

    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'jsonv2');
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('bounded', '1');
    url.searchParams.set('viewbox', `${left},${top},${right},${bottom}`);

    const hits = await window.RelocationGeocoder.fetchJson(url.toString(), {
      headers: { 'Accept-Language': 'en' }
    }, 4000);

    if (!Array.isArray(hits)) return [];

    return hits
      .map((hit) => {
        const pLat = parseFloat(hit.lat);
        const pLon = parseFloat(hit.lon);
        if (!Number.isFinite(pLat) || !Number.isFinite(pLon)) return null;
        const cleanName = hit.name || (hit.display_name ? hit.display_name.split(',')[0].trim() : query);
        return { lat: pLat, lon: pLon, name: cleanName };
      })
      .filter(Boolean);
  }

  async function fetchLiveFallbackData(center, radiusMeters, selectedKeys, cuisineTags = []) {
    const selected = new Set(Array.isArray(selectedKeys) ? selectedKeys : []);
    const parsed = {
      grocery: [], fitness: [], cuisine: [], gas: [], parks: [], pharmacy: [], cycleways: []
    };

    const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    const runSequentialTerms = async (terms, limit = 20) => {
      const allHits = [];
      for (const term of terms) {
        try {
          const hits = await queryNominatimCategory(center, radiusMeters, term, limit);
          if (Array.isArray(hits)) allHits.push(...hits);
          await delay(200);
        } catch (_err) {}
      }
      const map = new Map();
      allHits.forEach((p) => {
        if (!p) return;
        const key = `${p.lat.toFixed(4)},${p.lon.toFixed(4)}`;
        if (!map.has(key)) map.set(key, p);
      });
      return Array.from(map.values());
    };

    const config = window.RelocationKeywords?.CATEGORY_CONFIG || {};

    if (selected.has('grocery')) {
      const terms = (config.grocery?.fallbackKeywords || ['supermarket', 'grocery store']).slice(0, 2);
      parsed.grocery = await runSequentialTerms(terms, 20);
    }
    if (selected.has('fitness')) {
      const terms = (config.fitness?.fallbackKeywords || ['fitness center', 'gym', 'sports center']).slice(0, 3);
      parsed.fitness = await runSequentialTerms(terms, 20);
    }
    if (selected.has('cuisine')) {
      const userCuisines = cuisineTags.slice(0, 2);
      const baseTerms = (config.cuisine?.fallbackKeywords || ['restaurant']).slice(0, 1);
      parsed.cuisine = await runSequentialTerms([...baseTerms, ...userCuisines], 20);
    }
    if (selected.has('gas')) {
      const terms = (config.gas?.fallbackKeywords || ['gas station', 'fuel']).slice(0, 2);
      parsed.gas = await runSequentialTerms(terms, 20);
    }
    if (selected.has('parks')) {
      const terms = (config.parks?.fallbackKeywords || ['park', 'recreation park']).slice(0, 2);
      parsed.parks = await runSequentialTerms(terms, 20);
    }
    if (selected.has('pharmacy')) {
      const terms = (config.pharmacy?.fallbackKeywords || ['pharmacy', 'walgreens']).slice(0, 2);
      parsed.pharmacy = await runSequentialTerms(terms, 20);
    }
    if (selected.has('trails')) {
      parsed.cycleways = parsed.parks.map((p) => ({ ...p, miles: 0.25, geometry: [] }));
    }

    return parsed;
  }

  window.RelocationSpatial = {
    haversineMeters,
    lineDistanceMiles,
    radiusMetersFromMinutes,
    countWithin,
    hasAnyDataPoints,
    buildOverpassQuery,
    runOverpassQuery,
    parseOverpassData,
    fetchLiveFallbackData
  };
})(window);
