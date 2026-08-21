const US_STATES = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO',
  connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID',
  illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA',
  maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN',
  mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC',
  'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA',
  'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX',
  utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV',
  wisconsin: 'WI', wyoming: 'WY'
};

function getStateAbbreviation(stateName) {
  if (!stateName) return '';
  const cleanName = stateName.trim().toLowerCase();
  if (cleanName.length === 2) return stateName.toUpperCase();
  return US_STATES[cleanName] || stateName;
}

export function haversineDistance(c1, c2) {
  const R = 6371e3;
  const lat1 = c1[1] * Math.PI / 180;
  const lat2 = c2[1] * Math.PI / 180;
  const dLat = (c2[1] - c1[1]) * Math.PI / 180;
  const dLon = (c2[0] - c1[0]) * Math.PI / 180;

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function calculateBearing(c1, c2) {
  const lat1 = c1[1] * Math.PI / 180;
  const lat2 = c2[1] * Math.PI / 180;
  const dLon = (c2[0] - c1[0]) * Math.PI / 180;

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const brng = Math.atan2(y, x) * 180 / Math.PI;
  return (brng + 360) % 360;
}

// Used by reverseGeocode() below to turn a bearing into a short compass label
// (e.g. "12 mi S of Sutherlin") rather than a raw degree number.
function bearingToCompass(bearingDeg) {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(bearingDeg / 45) % 8;
  return directions[index];
}

// Every fetch below carries an explicit AbortSignal.timeout -- these are all free,
// public OSM/geocoding endpoints with no SLA, and on a long multi-day route this
// module gets called dozens of times in sequence (once per fuel/rest/meal/layover
// search step). Without a timeout, a single slow/overloaded endpoint leaves its
// fetch() promise pending forever, and since every caller here is awaited in a
// strictly sequential chain (trip-logistics.js's simulation loop), one hung request
// stalls the entire scan indefinitely instead of failing fast into the existing
// fallback/mirror logic. 12s matches the timeout already used by queryOverpassPOI.
const FETCH_TIMEOUT_MS = 12000;

export async function geocode(location) {
  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(location)}&limit=1`;
    const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (response.ok) {
      const data = await response.json();
      if (data.features && data.features.length > 0) {
        const feat = data.features[0];
        return {
          lat: feat.geometry.coordinates[1],
          lon: feat.geometry.coordinates[0],
          name: feat.properties.name || location
        };
      }
    }
  } catch (e) {
    console.warn('Photon geocoding failed, falling back to Nominatim:', e);
  }

  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}&limit=1`;
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Geocoding request failed for: ${location}`);
  const results = await response.json();
  if (results.length === 0) throw new Error(`Location not found: "${location}"`);

  return {
    lat: parseFloat(results[0].lat),
    lon: parseFloat(results[0].lon),
    name: results[0].display_name.split(',')[0]
  };
}

export async function reverseGeocode(lat, lon) {
  const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10`;
  try {
    const response = await fetch(nominatimUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (response.ok) {
      const data = await response.json();
      if (data && data.address) {
        const specificPlace = data.address.city || data.address.town || data.address.village || data.address.hamlet || data.address.suburb || null;
        const county = data.address.county || null;
        const stateVal = data.address.state || data.address.region || data.address.province || data.address.state_code || '';
        const stateCode = getStateAbbreviation(stateVal);

        if (specificPlace) {
          return stateCode ? `${specificPlace}, ${stateCode}` : specificPlace;
        }

        if (county) {
          const countyLabel = stateCode ? `${county}, ${stateCode}` : county;
          // A bare county means Nominatim has no city/town/village/hamlet/suburb
          // polygon covering this exact point -- common for unincorporated
          // highway-corridor commercial clusters that still have real businesses
          // nearby. Try to find the closest actual named settlement so the label
          // can read as "12 mi S of Sutherlin, Douglas County, OR" instead of
          // just the county, which reads more remote than these spots usually
          // are. Falls back to the bare county label if nothing is found nearby
          // or the lookup fails -- this is a label enhancement, never a blocker.
          try {
            const nearest = await findNearestNamedSettlement(lat, lon, 25);
            if (nearest) {
              const distanceLabel = nearest.distanceMiles < 1 ? '<1 mi' : `${Math.round(nearest.distanceMiles)} mi`;
              const direction = bearingToCompass(calculateBearing([nearest.lon, nearest.lat], [lon, lat]));
              return `${distanceLabel} ${direction} of ${nearest.name}, ${countyLabel}`;
            }
          } catch (e) {
            console.warn('Nearest-settlement lookup failed, falling back to bare county label:', e);
          }
          return countyLabel;
        }
      }
    }
  } catch (e) {
    console.warn('Nominatim reverse geocode failed, trying BigDataCloud:', e);
  }

  const bdcUrl = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`;
  try {
    const response = await fetch(bdcUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (response.ok) {
      const data = await response.json();
      const place = data.city || data.locality || null;
      let stateVal = '';
      if (data.principalSubdivisionCode && data.principalSubdivisionCode.includes('-')) {
        stateVal = data.principalSubdivisionCode.split('-')[1];
      } else {
        stateVal = data.principalSubdivision || '';
      }
      if (place) {
        const stateCode = getStateAbbreviation(stateVal);
        return stateCode ? `${place}, ${stateCode}` : place;
      }
    }
  } catch (e) {
    console.error('BigDataCloud reverse geocode fallback failed:', e);
  }

  return null;
}

// Used by the Smart Layover feature to test whether a candidate overnight-stop point sits near
// an actual named settlement (city/town/village/hamlet) rather than open countryside. This is
// deliberately stricter than reverseGeocode() above, which also accepts a bare suburb/county
// fallback — that fallback is exactly the "desolate area" signal Smart Layover backtracks away from.
export async function reverseGeocodeSettlement(lat, lon) {
  const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10`;
  try {
    const response = await fetch(nominatimUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
    if (response.ok) {
      const data = await response.json();
      if (data && data.address) {
        const place = data.address.city || data.address.town || data.address.village || data.address.hamlet || null;
        if (place) {
          const stateVal = data.address.state || data.address.region || data.address.province || data.address.state_code || '';
          const stateCode = getStateAbbreviation(stateVal);
          return { name: stateCode ? `${place}, ${stateCode}` : place };
        }
      }
    }
  } catch (e) {
    console.warn('Settlement reverse geocode failed:', e);
  }
  return null;
}

export function getCustomMealCrossing(t1, t2, mealsList) {
  const d1 = new Date(t1 * 1000);
  const d2 = new Date(t2 * 1000);

  const checkDays = [new Date(Date.UTC(d1.getUTCFullYear(), d1.getUTCMonth(), d1.getUTCDate()))];
  if (d1.getUTCDate() !== d2.getUTCDate() || d1.getUTCMonth() !== d2.getUTCMonth()) {
    checkDays.push(new Date(Date.UTC(d2.getUTCFullYear(), d2.getUTCMonth(), d2.getUTCDate())));
  }

  for (const day of checkDays) {
    for (const meal of mealsList) {
      const mealUnix = Math.floor(day.getTime() / 1000) + (meal.hour * 3600) + (meal.min * 60);
      if (mealUnix > t1 && mealUnix <= t2) {
        return { name: meal.name, timeUnix: mealUnix };
      }
    }
  }

  return null;
}

export async function fetchOSRMRoute(start, end) {
  const url = `https://router.project-osrm.org/route/v1/driving/${start.lon},${start.lat};${end.lon},${end.lat}?overview=full&geometries=geojson`;
  const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  if (!response.ok) throw new Error('OSRM routing request failed.');
  const data = await response.json();
  if (!data.routes || data.routes.length === 0) throw new Error('No driving routes resolved between coordinates.');
  return data.routes[0];
}

// Used by the fuel-stop logistics engine to locate an actual gas station near a
// candidate route point, rather than pricing/labeling a bare stretch of highway.
// Queries OpenStreetMap's Overpass API for amenity=fuel points within radiusMiles
// of (lat, lon) and returns the nearest one. Free, keyless, same OSM family as
// geocode()/reverseGeocode() above — deliberately not GasBuddy or any other
// scraped source (see project notes on why we avoid that for station lookup).
// Returns { lat, lon, name } for the nearest station, or null if none are within
// range or the Overpass request fails/times out.
export async function findNearestFuelStation(lat, lon, radiusMiles) {
  const radiusMeters = Math.max(100, Math.round(radiusMiles * 1609.34));
  const query = `[out:json][timeout:15];(node["amenity"="fuel"](around:${radiusMeters},${lat},${lon});way["amenity"="fuel"](around:${radiusMeters},${lat},${lon}););out center 20;`;
  const overpassUrl = 'https://overpass-api.de/api/interpreter';

  try {
    const response = await fetch(overpassUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: query,
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    });
    if (!response.ok) return null;
    const data = await response.json();
    if (!data.elements || data.elements.length === 0) return null;

    let nearest = null;
    let nearestMeters = Infinity;
    for (const el of data.elements) {
      const elLat = el.type === 'node' ? el.lat : (el.center && el.center.lat);
      const elLon = el.type === 'node' ? el.lon : (el.center && el.center.lon);
      if (elLat === undefined || elLon === undefined) continue;

      const distMeters = haversineDistance([lon, lat], [elLon, elLat]);
      if (distMeters < nearestMeters) {
        nearestMeters = distMeters;
        nearest = {
          lat: elLat,
          lon: elLon,
          name: (el.tags && (el.tags.brand || el.tags.name)) || 'Gas Station'
        };
      }
    }
    return nearest;
  } catch (e) {
    console.warn('Overpass fuel station lookup failed:', e);
    return null;
  }
}

// Used by the milestone-card render loop to show the actual (or typical) speed
// limit near a rendered stop (fuel/meal/layover/hazard-transition/origin/
// destination). Informational only -- this does NOT feed the trip's ETA math,
// which still runs on the single flat avg-speed value the user enters (see
// speedMps in advisor.js). Added because a flat 65 mph assumption is wrong on
// mountain passes, rural two-lanes, and plenty of other stretches.
//
// OSM's `maxspeed` tag is solid on interstates/US highways but spotty on rural
// and mountain state routes -- exactly the roads this exists to help with --
// so when no tag is present this falls back to a rough typical-limit table
// keyed by the road's `highway=` classification. A route waypoint's coordinate
// sits ON the route geometry (from OSRM/ORS), so a tight search radius is
// enough to land on the right way without picking up a parallel frontage road.
const HIGHWAY_CLASS_LABELS = {
  motorway: 'interstate/freeway', motorway_link: 'freeway ramp',
  trunk: 'divided highway', trunk_link: 'highway ramp',
  primary: 'primary highway', primary_link: 'highway ramp',
  secondary: 'secondary road', secondary_link: 'secondary road ramp',
  tertiary: 'local highway', tertiary_link: 'local highway ramp',
  unclassified: 'minor road', residential: 'residential street',
  living_street: 'living street', service: 'service road'
};

// Rough, US-typical posted limits by road class, only used when a way has no
// maxspeed tag at all. These are deliberately conservative approximations, not
// authoritative -- always prefer a real tagged value when one exists.
const HIGHWAY_CLASS_DEFAULT_MPH = {
  motorway: 70, motorway_link: 45,
  trunk: 65, trunk_link: 45,
  primary: 55, primary_link: 45,
  secondary: 45, secondary_link: 35,
  tertiary: 40, tertiary_link: 30,
  unclassified: 35, residential: 25,
  living_street: 15, service: 15
};

export function highwayClassLabel(highwayClass) {
  return HIGHWAY_CLASS_LABELS[highwayClass] || (highwayClass ? highwayClass.replace(/_/g, ' ') : 'road');
}

// OSM's documented default unit for a bare maxspeed number is km/h, but in
// practice nearly every US-tagged maxspeed explicitly appends " mph". Treating
// a bare number as mph here matches this app's US-only scope and avoids
// mangling an already-correct US limit (e.g. a bare "55" read as 55 km/h would
// display as 34 mph on a road actually posted 55).
function parseMaxspeedTag(raw) {
  if (!raw) return null;
  const val = raw.trim().toLowerCase();
  if (val === 'none' || val === 'signals' || val === 'walk' || val === 'variable') return null;
  const match = /^(\d+(?:\.\d+)?)\s*(mph|km\/h|kmh)?$/.exec(val);
  if (!match) return null;
  const num = parseFloat(match[1]);
  if (isNaN(num)) return null;
  const unit = match[2];
  if (unit === 'km/h' || unit === 'kmh') return Math.round(num / 1.60934);
  return Math.round(num);
}

export async function findSpeedLimitAtPoint(lat, lon, radiusMiles = 0.15) {
  const radiusMeters = Math.max(50, Math.round(radiusMiles * 1609.34));
  const highwayFilter = 'motorway|trunk|primary|secondary|tertiary|unclassified|residential|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link';
  const query = `[out:json][timeout:15];way["highway"~"${highwayFilter}"](around:${radiusMeters},${lat},${lon});out tags center 10;`;

  let data;
  try {
    data = await queryOverpassPOI(query, 'speed-limit');
  } catch (e) {
    console.warn('Speed limit lookup failed:', e);
    return null;
  }
  if (!data || !data.elements || data.elements.length === 0) return null;

  let nearest = null;
  let nearestMeters = Infinity;
  for (const el of data.elements) {
    const elLat = el.center && el.center.lat;
    const elLon = el.center && el.center.lon;
    if (elLat === undefined || elLon === undefined) continue;
    const distMeters = haversineDistance([lon, lat], [elLon, elLat]);
    if (distMeters < nearestMeters) {
      nearestMeters = distMeters;
      nearest = el;
    }
  }
  if (!nearest) return null;

  const tags = nearest.tags || {};
  const highwayClass = tags.highway || null;
  const posted = parseMaxspeedTag(tags.maxspeed);
  if (posted !== null) {
    return { mph: posted, source: 'posted', highwayClass };
  }

  const estimated = highwayClass ? HIGHWAY_CLASS_DEFAULT_MPH[highwayClass] : undefined;
  if (estimated !== undefined) {
    return { mph: estimated, source: 'estimated', highwayClass };
  }

  return null;
}

// Shared by the meal-stop and layover-lodging searches below to surface actual
// nearby POIs (not just a generic "Lunch Stop"/"Overnight Layover" label) at each
// computed waypoint. Queries OpenStreetMap's Overpass API for a caller-supplied
// tag filter within radiusMiles of (lat, lon) and returns up to `limit` named
// results, nearest first. Unlike findNearestFuelStation above, this walks a short
// list of public Overpass mirrors in turn (same free/keyless OSM family) rather
// than a single endpoint — meal/lodging stops can fire several times per trip, so
// spreading load and tolerating one mirror being down/rate-limited matters more
// here. Every mirror here is a general/global instance — deliberately NOT
// overpass.osm.ch, which despite the generic-looking hostname is the Swiss OSM
// community's regional mirror and only indexes Switzerland; including it was an
// earlier bug that made every US meal stop silently come back empty once the
// first couple of mirrors failed. queryOverpassPOI returns null (never throws) if
// nothing is found or every endpoint fails, so callers can render a plain
// "nothing nearby" message instead of having to special-case an error.
const OVERPASS_MIRROR_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter'
];

async function queryOverpassPOI(query, logLabel) {
  for (const endpoint of OVERPASS_MIRROR_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: query,
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
      });
      if (!response.ok) continue;
      const data = await response.json();
      // A mirror can return a well-formed, successful *empty* response for a
      // point outside its coverage rather than erroring — don't treat that as
      // final until every mirror has had a chance; move on and keep trying.
      if (data && data.elements && data.elements.length > 0) return data;
    } catch (e) {
      console.warn(`Overpass ${logLabel} lookup failed at ${endpoint}:`, e);
    }
  }
  return null;
}

function dedupeAndRankPOIs(elements, lat, lon, limit, mapTags) {
  const seen = new Set();
  const results = [];
  for (const el of elements) {
    const elLat = el.type === 'node' ? el.lat : (el.center && el.center.lat);
    const elLon = el.type === 'node' ? el.lon : (el.center && el.center.lon);
    if (elLat === undefined || elLon === undefined) continue;

    const tags = el.tags || {};
    const name = tags.name;
    if (!name) continue; // unnamed POIs aren't useful to suggest by name

    // Dedup: the same place is often mapped as both a node and a way (e.g. a
    // building outline plus a POI node inside it) and would otherwise show twice.
    const dedupeKey = `${name.toLowerCase()}|${elLat.toFixed(3)}|${elLon.toFixed(3)}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const distanceMeters = haversineDistance([lon, lat], [elLon, elLat]);
    results.push({
      name,
      lat: elLat,
      lon: elLon,
      distanceMiles: distanceMeters / 1609.34,
      ...mapTags(tags)
    });
  }

  results.sort((a, b) => a.distanceMiles - b.distanceMiles);
  return results.slice(0, limit);
}

// Used by reverseGeocode() above when a point falls back to a bare county name
// (no city/town/village/hamlet/suburb polygon covers it) -- looks up the
// single closest actual named settlement so the label can read as "12 mi S of
// Sutherlin" instead of just the county. Same shared Overpass mirror list and
// dedup/ranking as the restaurant/hotel lookups above; not exported, only used
// internally by reverseGeocode().
async function findNearestNamedSettlement(lat, lon, radiusMiles) {
  const radiusMeters = Math.max(100, Math.round(radiusMiles * 1609.34));
  const placeFilter = 'city|town|village|hamlet';
  const query = `[out:json][timeout:15];node["place"~"${placeFilter}"](around:${radiusMeters},${lat},${lon});out center 40;`;

  const data = await queryOverpassPOI(query, 'settlement');
  if (!data || !data.elements || data.elements.length === 0) return null;

  const results = dedupeAndRankPOIs(data.elements, lat, lon, 1, tags => ({ placeType: tags.place }));
  return results.length > 0 ? results[0] : null;
}

export async function findNearbyRestaurants(lat, lon, radiusMiles, limit = 6) {
  const radiusMeters = Math.max(100, Math.round(radiusMiles * 1609.34));
  const amenityFilter = 'restaurant|fast_food|cafe|pub|bar|food_court';
  const query = `[out:json][timeout:15];(node["amenity"~"${amenityFilter}"](around:${radiusMeters},${lat},${lon});way["amenity"~"${amenityFilter}"](around:${radiusMeters},${lat},${lon}););out center 40;`;

  const data = await queryOverpassPOI(query, 'restaurant');
  if (!data || !data.elements || data.elements.length === 0) return [];

  return dedupeAndRankPOIs(data.elements, lat, lon, limit, tags => ({
    cuisine: tags.cuisine ? tags.cuisine.replace(/_/g, ' ') : null,
    amenity: tags.amenity
  }));
}

// Used by the Overnight Layover logistics engine to surface actual nearby
// lodging (not just a bare city/town name from Smart Layover) at each computed
// curfew stop. Queries OpenStreetMap's Overpass API for
// tourism=hotel/motel/guest_house/hostel within radiusMiles of (lat, lon) and
// returns up to `limit` named results, nearest first. Same shared Overpass
// mirror list and dedup/ranking as findNearbyRestaurants above.
export async function findNearbyHotels(lat, lon, radiusMiles, limit = 6) {
  const radiusMeters = Math.max(100, Math.round(radiusMiles * 1609.34));
  const tourismFilter = 'hotel|motel|guest_house|hostel';
  const query = `[out:json][timeout:15];(node["tourism"~"${tourismFilter}"](around:${radiusMeters},${lat},${lon});way["tourism"~"${tourismFilter}"](around:${radiusMeters},${lat},${lon}););out center 40;`;

  const data = await queryOverpassPOI(query, 'hotel');
  if (!data || !data.elements || data.elements.length === 0) return [];

  return dedupeAndRankPOIs(data.elements, lat, lon, limit, tags => ({
    lodgingType: tags.tourism,
    stars: tags.stars || null
  }));
}
