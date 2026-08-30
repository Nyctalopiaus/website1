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
  // search finally failed. 9s per mirror caps that worst case at ~45s instead.
  const OVERPASS_ENDPOINT_TIMEOUT_MS = 9000;

  // Photon fallback: each category is approximated by racing several brand/keyword
  // searches in parallel (Photon has no "find all shop=supermarket near X" query the
  // way Overpass does -- it's a place-name search engine, not a tagged POI database).
  // 2026-08-30: this used to give each parallel search only 1200ms before silently
  // dropping it, which is why the exact same address returned a different grocery
  // count on every run (7, 8, 12, ...) -- whichever subset of ~10 parallel searches
  // happened to land inside that tight window "won", and it varied by nothing more
  // than normal network jitter. Raised to a timeout that reliably lets a real Photon
  // response complete (matching the timeout used elsewhere in this app for a single
  // Photon call) so the same real businesses come back every time.
  //
  // 2026-08-30 (later same day): live testing found a SECOND, subtler source of the
  // same symptom, specific to a visitor's very first search of a fresh page load.
  // A category fallback fires ~8-10 parallel requests to photon.komoot.io at once;
  // the very first time this app talks to that host, those requests also pay
  // connection-setup cost (DNS + TLS) on top of Photon's own response time, which
  // can be enough on its own to push the categories with the broadest/most generic
  // terms (trails, cuisine) past the timeout on that first run only -- every run
  // after that, once the connection is warm, comes back complete and identical.
  // Since a real visitor's first search on the site IS that cold run, this needed
  // two changes: (1) a small timeout bump for margin, and (2) warmUpPhotonConnection()
  // below, which opens a connection to Photon as soon as the page loads (not tied to
  // any search) so it's already warm by the time a real search fires.
  //
  // 2026-08-30 (Compare-mode testing, all 7 categories): live testing found that even
  // with the shared concurrency limiter below (which fixed most of the hard "Failed to
  // fetch"/CORS-style rejections caused by our own request bursts), Compare's fallback
  // was still losing a large fraction of terms to genuine 6000ms timeouts -- Photon
  // itself was simply slow to answer many requests in that window, not just rejecting
  // a burst. Raised to match OVERPASS_ENDPOINT_TIMEOUT_MS (9000ms) so a real Photon
  // response gets the same benefit of the doubt as a real Overpass mirror does, at the
  // cost of a slower fallback path when Photon is genuinely under load. Josh has
  // confirmed he will not use a paid geocoding API for this (low-traffic hobby tool),
  // so trading speed for completeness here is the right tradeoff, not a stopgap.
  const PHOTON_FALLBACK_TERM_TIMEOUT_MS = 9000;

  // Fire-and-forget: open a connection to Photon as soon as this script loads, well
  // before the visitor has typed or submitted an address. This doesn't block or delay
  // anything -- it just means the TLS handshake for photon.komoot.io is already paid
  // for by the time a real search (geocoding, or the category fallback) needs it,
  // instead of that cost landing on the visitor's first real request. Uses a tiny,
  // cheap query and silently ignores any failure -- if it fails, the real requests
  // later just pay the normal connection cost themselves, same as before this existed.
  function warmUpPhotonConnection() {
    try {
      fetch('https://photon.komoot.io/api/?q=warmup&limit=1', { signal: AbortSignal.timeout(3000) }).catch(() => {});
    } catch (_err) {
      // Environments without fetch/AbortSignal support just skip the warm-up --
      // never let this affect the real search path.
    }
  }
  warmUpPhotonConnection();

  // Global concurrency limiter for Photon fallback requests. 2026-08-30 live testing
  // (Compare mode, all 7 categories selected) showed that when Overpass fails for
  // both the Primary and Compare locations, the category fallback fires roughly
  // 40-70 parallel requests to photon.komoot.io per location -- and the SECOND
  // location's burst lands immediately after the first finishes (they run
  // sequentially, not simultaneously, but back-to-back within a ~10-15s window).
  // At that volume some requests came back with an explicit CORS-shaped rejection
  // ("blocked by CORS policy: No 'Access-Control-Allow-Origin' header") rather than
  // real data or even a timeout -- the same signature seen with Nominatim burst
  // rate-limiting, i.e. Photon itself refusing requests once too many arrive too
  // fast from one origin, not a client-side network failure.
  //
  // This queue caps how many Photon requests are actually in flight at once, and
  // is deliberately module-level (shared) state -- it throttles Primary's burst,
  // Compare's burst, and every category within a single location's burst all
  // through the same shared budget, rather than resetting per search. A small
  // stagger between dequeued requests further spreads start times out in case the
  // limit that matters is requests-per-second rather than pure concurrency.
  const PHOTON_MAX_CONCURRENT_REQUESTS = 5;
  const PHOTON_QUEUE_STAGGER_MS = 60;
  let activePhotonRequests = 0;
  const photonRequestQueue = [];

  function drainPhotonQueue() {
    if (activePhotonRequests >= PHOTON_MAX_CONCURRENT_REQUESTS || !photonRequestQueue.length) return;
    const next = photonRequestQueue.shift();
    activePhotonRequests += 1;
    setTimeout(next, PHOTON_QUEUE_STAGGER_MS);
  }

  function runPhotonRequestSlot(taskFn) {
    return new Promise((resolve, reject) => {
      const attempt = () => {
        taskFn().then(
          (result) => { activePhotonRequests -= 1; drainPhotonQueue(); resolve(result); },
          (err) => { activePhotonRequests -= 1; drainPhotonQueue(); reject(err); }
        );
      };
      if (activePhotonRequests < PHOTON_MAX_CONCURRENT_REQUESTS) {
        activePhotonRequests += 1;
        attempt();
      } else {
        photonRequestQueue.push(attempt);
      }
    });
  }

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

        // Rule 1: Same business name -> merge duplicate database entries (this is
        // what collapses the same King Soopers found via two different Photon
        // search terms, e.g. "grocery" and "supermarket", into one result)
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

  function hostnameOf(url) {
    try {
      return new URL(url).hostname;
    } catch (_err) {
      return url;
    }
  }

  async function requestOverpassEndpoint(endpoint, queryText) {
    const body = new URLSearchParams({ data: queryText }).toString();
    const host = hostnameOf(endpoint);

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
      if (!res.ok) throw new Error(`HTTP ${res.status} from ${host}`);
      const raw = await res.text();
      return JSON.parse(raw);
    } catch (err) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        throw new Error(`Timed out after ${OVERPASS_ENDPOINT_TIMEOUT_MS}ms contacting ${host}`);
      }
      if (err instanceof TypeError) {
        throw new Error(`Network error contacting ${host}: ${err.message}`);
      }
      throw err;
    }
  }

  // Brand/keyword seed terms per category -- an approximation of Overpass's tag
  // search, since Photon only matches on place names. Each term is queried in
  // parallel and given a real chance to finish (see PHOTON_FALLBACK_TERM_TIMEOUT_MS
  // above); results are deduplicated by name via deduplicateNearbyPlaces so the
  // same business found by multiple terms only counts once.
  const PHOTON_FALLBACK_TERMS = {
    grocery: ['king soopers', 'safeway', 'sprouts', 'target', 'walmart', 'trader joe', 'whole foods', 'supermarket', 'grocery', 'market'],
    fitness: ['24 hour fitness', 'planet fitness', 'anytime fitness', 'crossfit', 'chuze fitness', 'orange theory', 'fitness', 'gym'],
    trails: ['trail', 'trailhead', 'path', 'greenway', 'cycleway', 'open space'],
    cuisine: ['restaurant', 'pizza', 'cafe', 'taco', 'grill', 'bar', 'coffee', 'starbucks', 'dunkin', 'fast food'],
    gas: ['7-eleven', 'shell', 'conoco', 'circle k', 'maverik', 'gas station', 'fuel', 'exxon'],
    parks: ['park', 'playground', 'dog park', 'recreation', 'open space', 'field'],
    pharmacy: ['walgreens', 'cvs', 'pharmacy', 'target pharmacy', 'rite aid']
  };

  async function fetchPhotonCategoryPOIs(key, lat, lon) {
    const fLat = Number(lat || 0);
    const fLon = Number(lon || 0);
    const fKey = String(key || '');
    const logger = window.RelocationLogger;
    const terms = PHOTON_FALLBACK_TERMS[fKey] || [fKey];

    const elements = [];

    await Promise.all(
      terms.map(async (term) => {
        const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(term)}&lat=${fLat}&lon=${fLon}&limit=30`;
        try {
          const data = await runPhotonRequestSlot(async () => {
            const res = await fetch(photonUrl, { signal: AbortSignal.timeout(PHOTON_FALLBACK_TERM_TIMEOUT_MS) });
            if (!res || !res.ok) return null;
            return res.json();
          });
          if (!data) return;
          const features = Array.isArray(data?.features) ? data.features : [];
          features.forEach((f) => {
            const coords = f.geometry?.coordinates || [];
            if (coords.length < 2) return;
            const pLon = coords[0];
            const pLat = coords[1];
            const props = f.properties || {};
            const name = (props.name || props.street || term).trim();

            const tags = { name };
            if (fKey === 'grocery') tags.shop = 'supermarket';
            else if (fKey === 'fitness') { tags.leisure = 'fitness_centre'; tags.amenity = 'gym'; }
            else if (fKey === 'cuisine') tags.amenity = 'restaurant';
            else if (fKey === 'gas') tags.amenity = 'fuel';
            else if (fKey === 'parks') tags.leisure = 'park';
            else if (fKey === 'pharmacy') tags.amenity = 'pharmacy';
            else if (fKey === 'trails') { tags.highway = 'cycleway'; tags.cycleway = 'designated'; }

            elements.push({
              type: fKey === 'trails' ? 'way' : 'node',
              lat: pLat,
              lon: pLon,
              tags
            });
          });
        } catch (err) {
          logger?.warn('spatial:photon-fallback', `Category lookup "${term}" (${fKey}) failed`, logger?.describeError(err));
        }
      })
    );

    return elements;
  }

  async function fetchPhotonFallbackData(center, selectedKeys) {
    const selected = Array.isArray(selectedKeys) ? selectedKeys : [];
    const results = await Promise.all(
      selected.map((key) => fetchPhotonCategoryPOIs(key, center.lat, center.lon))
    );
    const combinedElements = [];
    results.forEach((list) => combinedElements.push(...list));
    // No synthetic/placeholder data here on purpose: if nothing real comes back,
    // the caller treats that as "no results" and says so honestly rather than
    // inventing POIs that don't exist (a prior version of this fallback did
    // fabricate placeholder points here -- removed 2026-08-30, see project memory).
    return { elements: combinedElements };
  }

  async function runOverpassQuery(queryText, options = {}) {
    let lastError = null;
    const numEndpoints = OVERPASS_ENDPOINTS.length;
    const logger = window.RelocationLogger;

    for (let i = 0; i < numEndpoints; i++) {
      const endpoint = OVERPASS_ENDPOINTS[(overpassEndpointIndex + i) % numEndpoints];
      try {
        const data = await requestOverpassEndpoint(endpoint, queryText);
        if (data && Array.isArray(data.elements) && data.elements.length > 0) {
          overpassEndpointIndex = (overpassEndpointIndex + i + 1) % numEndpoints;
          logger?.info('spatial:overpass', `${hostnameOf(endpoint)} returned ${data.elements.length} element(s)`);
          return data;
        }
        logger?.warn('spatial:overpass', `${hostnameOf(endpoint)} returned 0 elements`);
      } catch (err) {
        lastError = err;
        logger?.warn('spatial:overpass', `${hostnameOf(endpoint)} failed`, logger?.describeError(err));
      }
    }

    logger?.error('spatial:overpass', `All ${numEndpoints} Overpass mirrors failed or returned no elements`);

    if (options.center && Array.isArray(options.selectedKeys) && options.selectedKeys.length) {
      logger?.warn('spatial:photon-fallback', 'All Overpass mirrors failed, falling back to live Photon category search');
      const fallbackData = await fetchPhotonFallbackData(options.center, options.selectedKeys);
      if (fallbackData.elements.length > 0) {
        logger?.info('spatial:photon-fallback', `Photon fallback returned ${fallbackData.elements.length} element(s)`);
        return fallbackData;
      }
      logger?.warn('spatial:photon-fallback', 'Photon fallback also returned nothing');
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
        continue;
      }

      // Photon-fallback trail entries are node points tagged highway=cycleway by
      // fetchPhotonCategoryPOIs above (Photon has no line geometry), so they need
      // their own branch here since they aren't el.type === 'way'.
      if (fKeyLooksLikeTrail(tags) && center) {
        parsed.cycleways.push({
          lat: center.lat,
          lon: center.lon,
          miles: 0.25,
          geometry: [],
          name
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

  function fKeyLooksLikeTrail(tags) {
    return (tags.highway || '').toLowerCase() === 'cycleway' && tags.cycleway === 'designated';
  }

  window.RelocationSpatial = {
    haversineMeters,
    lineDistanceMiles,
    radiusMetersFromMinutes,
    countWithin,
    hasAnyDataPoints,
    buildOverpassQuery,
    runOverpassQuery,
    parseOverpassData
  };
})(window);
