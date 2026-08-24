/**
 * BuildRoute / Homeward Geocoder Module
 * Multi-provider Geocoding & Address Typeahead Engine with multi-stage fallback matching
 * (Photon + Nominatim + LocalStorage Cache).
 */

// Used by Geocoder.filterByState() to sanity-check fallback geocode
// candidates against the state the user actually typed. Bug found
// 2026-08-22: for a rural/unindexed address ("22685 Cow Cir, Ramah, CO
// 80832"), both providers returned zero results for the full query, so the
// code fell through to looser fallback stages (street + zip only, etc.)
// and accepted whatever came back first with NO check that it was even in
// the right state — one fallback query fuzzy-matched a transposed zip code
// and returned a bus stop in a different Colorado city; a looser stage
// after that landed on a result near the FL/GA border entirely unrelated
// to the input. Filtering candidates against the expected state turns
// that class of bug into a clear "couldn't confidently geocode this"
// failure instead of a silently wrong pin.
const US_STATE_NAMES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', DC: 'District of Columbia',
  FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana',
  ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada',
  NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon',
  PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota',
  TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont', VA: 'Virginia',
  WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  PR: 'Puerto Rico'
};

class Geocoder {
  constructor() {
    this.cacheKey = 'homeward_geocache_v1';
    this.cache = this.loadCache();
    this.requestDelayMs = 800; // Nominatim delay fallback
  }

  loadCache() {
    try {
      const stored = localStorage.getItem(this.cacheKey);
      return stored ? JSON.parse(stored) : {};
    } catch (e) {
      return {};
    }
  }

  saveCache() {
    try {
      localStorage.setItem(this.cacheKey, JSON.stringify(this.cache));
    } catch (e) {
      console.warn('Geocode cache save failed', e);
    }
  }

  cleanAddress(addressStr) {
    if (!addressStr) return '';
    let str = String(addressStr).trim().replace(/\s+/g, ' ');
    // Remove leading house comma formatting if present
    return str.replace(/^(\d+[a-zA-Z]?),\s*/, '$1 ');
  }

  /**
   * Single query fetcher helper (Photon -> Nominatim)
   */
  async querySingleCandidateList(cleaned, limit = 6) {
    // 1. Photon Komoot API (sub-200ms instant search)
    try {
      const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(cleaned)}&limit=${limit}`;
      const resp = await fetch(url);
      if (resp.ok) {
        const data = await resp.json();
        const features = Array.isArray(data?.features) ? data.features : [];
        if (features.length > 0) {
          const queryHouseMatch = cleaned.match(/^\d+[a-zA-Z]?/);
          const qHouse = queryHouseMatch ? queryHouseMatch[0] : '';

          const candidates = features.map(f => {
            const coords = f.geometry?.coordinates || [0, 0];
            const lng = parseFloat(coords[0]);
            const lat = parseFloat(coords[1]);
            const props = f.properties || {};

            const streetName = props.street || (props.osm_key === 'highway' || props.type === 'street' ? props.name : '') || '';
            const houseNum = props.housenumber || qHouse;
            const streetPart = houseNum && streetName ? `${houseNum} ${streetName}` : streetName;

            const parts = [
              streetPart,
              props.city || props.town || props.village || props.district,
              props.state,
              props.postcode
            ].filter(Boolean);

            const displayName = parts.length >= 2 ? parts.join(', ') : (props.name || cleaned);
            return {
              displayName: this.cleanAddress(displayName),
              lat,
              lng
            };
          }).filter(c => c.lat && c.lng && c.displayName);

          if (candidates.length > 0) {
            return this.deduplicateCandidates(candidates);
          }
        }
      }
    } catch (_errPhoton) {}

    // 2. Nominatim OpenStreetMap fallback
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cleaned)}&limit=${limit}`;
      const resp = await fetch(url, { headers: { 'User-Agent': 'Homeward-SiteScoutingApp/1.0' } });
      if (resp.ok) {
        const data = await resp.json();
        if (Array.isArray(data) && data.length > 0) {
          const candidates = data.map(hit => ({
            displayName: this.cleanAddress(hit.display_name),
            lat: parseFloat(hit.lat),
            lng: parseFloat(hit.lon)
          })).filter(c => c.lat && c.lng);
          return this.deduplicateCandidates(candidates);
        }
      }
    } catch (_errNom) {}

    return [];
  }

  /**
   * Fast typeahead candidate lookup powered by Photon Komoot & Nominatim with fallback stages.
   */
  async fetchGeocodeCandidates(query, limit = 6) {
    const cleaned = this.cleanAddress(query);
    if (!cleaned || cleaned.length < 2) return [];

    // Derived once and applied at every fallback stage below via
    // filterByState() — see US_STATE_NAMES comment for why this matters.
    const expectedState = this.extractExpectedState(cleaned);

    // Stage 1: Direct full query search
    let candidates = await this.querySingleCandidateList(cleaned, limit);
    candidates = this.filterByState(candidates, expectedState);
    if (candidates.length > 0) return candidates;

    // Stage 2: Fallback — Strip city name if zip code or state is present
    // (Handles unincorporated county roads e.g. "42744 Calusa Pines Rd, Elizabeth, CO 80107" -> "42744 Calusa Pines Rd, 80107")
    const zipMatch = cleaned.match(/\b\d{5}\b/);
    const streetMatch = cleaned.match(/^(\d+[a-zA-Z]?\s+[^,]+)/);

    if (streetMatch) {
      const streetPart = streetMatch[1];
      const zipPart = zipMatch ? zipMatch[0] : '';
      const statePart = expectedState || '';

      const altTerms = [];
      if (streetPart && zipPart) altTerms.push(`${streetPart}, ${zipPart}`);
      if (streetPart && statePart && zipPart) altTerms.push(`${streetPart}, ${statePart} ${zipPart}`);
      if (streetPart && statePart) altTerms.push(`${streetPart}, ${statePart}`);

      for (const altQuery of altTerms) {
        candidates = await this.querySingleCandidateList(altQuery, limit);
        // altQuery may have dropped the zip/state text itself (e.g. the
        // zip-only variant), so re-check against the ORIGINAL expectedState
        // rather than whatever this particular altQuery string contains.
        candidates = this.filterByState(candidates, expectedState);
        if (candidates.length > 0) {
          const houseNumMatch = cleaned.match(/^(\d+[a-zA-Z]?)/);
          return candidates.map(c => {
            const hasNum = /\d/.test(c.displayName.split(',')[0] || '');
            if (!hasNum && houseNumMatch) {
              return {
                ...c,
                displayName: `${houseNumMatch[1]} ${c.displayName}`
              };
            }
            return c;
          });
        }
      }
    }

    // Stage 3: Fallback — Strip house number and search street + city/zip
    const strippedHouse = cleaned.replace(/^\d+[a-zA-Z]?\s+/, '').trim();
    if (strippedHouse && strippedHouse !== cleaned) {
      candidates = await this.querySingleCandidateList(strippedHouse, limit);
      candidates = this.filterByState(candidates, expectedState);
      if (candidates.length > 0) {
        const houseNumMatch = cleaned.match(/^(\d+[a-zA-Z]?)/);
        return candidates.map(c => {
          const hasNum = /\d/.test(c.displayName.split(',')[0] || '');
          if (!hasNum && houseNumMatch) {
            return {
              ...c,
              displayName: `${houseNumMatch[1]} ${c.displayName}`
            };
          }
          return c;
        });
      }
    }

    return [];
  }

  // Pulls a 2-letter token out of the query that's actually a real US state
  // abbreviation (not just any 2 capital letters — guards against
  // coincidental matches). Returns null if none found.
  extractExpectedState(cleaned) {
    const tokens = cleaned.match(/\b[A-Z]{2}\b/g) || [];
    for (const token of tokens) {
      if (US_STATE_NAMES[token]) return token;
    }
    return null;
  }

  // Rejects candidates whose displayName doesn't mention the expected
  // state's full name. Returns the ORIGINAL list unchanged when there's no
  // expected state to check against (nothing to validate). Returns an
  // EMPTY list (not the original) when there IS an expected state and
  // nothing matches it — callers should treat that as "no good candidates
  // from this query" and keep trying fallback stages, rather than silently
  // accepting a wrong-state top result.
  filterByState(candidates, expectedState) {
    if (!expectedState || !candidates || candidates.length === 0) return candidates;
    const fullName = US_STATE_NAMES[expectedState];
    if (!fullName) return candidates;
    const needle = fullName.toLowerCase();
    return candidates.filter(c => c.displayName && c.displayName.toLowerCase().includes(needle));
  }

  deduplicateCandidates(candidates) {
    const seen = new Set();
    return candidates.filter(c => {
      const key = c.displayName.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async geocodeAddress(addressStr) {
    const cleaned = this.cleanAddress(addressStr);
    if (!cleaned) return null;

    // Check Cache
    if (this.cache[cleaned]) {
      return this.cache[cleaned];
    }

    // Try multi-stage candidate lookup
    let candidates = await this.fetchGeocodeCandidates(cleaned, 1);

    // Stage 4 Fallback: City, State / Zip portion if street lookup produced 0 results
    if (!candidates || candidates.length === 0) {
      const parts = cleaned.split(',');
      if (parts.length >= 2) {
        const cityZipFallback = parts.slice(1).join(',').trim();
        candidates = await this.fetchGeocodeCandidates(cityZipFallback, 1);
      }
    }

    // Stage 5 Fallback: First word + City/State
    if (!candidates || candidates.length === 0) {
      const words = cleaned.split(' ');
      if (words.length > 2) {
        const sansNumber = words.slice(1).join(' ');
        candidates = await this.fetchGeocodeCandidates(sansNumber, 1);
      }
    }

    if (candidates && candidates.length > 0) {
      const result = {
        address: cleaned,
        display_name: candidates[0].displayName,
        lat: candidates[0].lat,
        lng: candidates[0].lng
      };
      this.cache[cleaned] = result;
      this.saveCache();
      return result;
    }

    return null;
  }

  calcPolygonAreaAcres(coords) {
    if (!coords || coords.length < 3) return null;
    const R = 6378137.0;
    let area = 0;
    for (let i = 0; i < coords.length; i++) {
      const j = (i + 1) % coords.length;
      const lat1 = coords[i].lat * (Math.PI / 180);
      const lon1 = coords[i].lon * (Math.PI / 180);
      const lat2 = coords[j].lat * (Math.PI / 180);
      const lon2 = coords[j].lon * (Math.PI / 180);
      area += (lon2 - lon1) * (2 + Math.sin(lat1) + Math.sin(lat2));
    }
    area = Math.abs((area * R * R) / 2.0);
    const sqFt = area * 10.7639;
    const acres = sqFt / 43560.0;
    if (acres >= 0.1 && acres <= 500) {
      if (acres >= 1.0) {
        return `${acres.toFixed(2)} Acres`;
      }
      return `${Math.round(sqFt).toLocaleString()} sq ft`;
    }
    return null;
  }

  async fetchLotParcelSize(lat, lng) {
    if (!lat || !lng) return null;
    try {
      const url = `https://overpass-api.de/api/interpreter?data=[out:json];(way(around:60,${lat},${lng});node(around:60,${lat},${lng}););out%20geom;`;
      const resp = await fetch(url);
      if (resp.ok) {
        const res = await resp.json();
        const elements = res.elements || [];
        for (const el of elements) {
          if (el.geometry && el.geometry.length >= 3) {
            const formatted = this.calcPolygonAreaAcres(el.geometry);
            if (formatted) return formatted;
          }
        }
      }
    } catch (e) {
      console.warn('Parcel size fetch error:', e);
    }
    return null;
  }

  /**
   * Auto-detect street bearing & lot orientation to suggest house facing direction (N, S, E, W, NE, NW, SE, SW).
   */
  async fetchLotFacingDirection(lat, lng) {
    if (!lat || !lng) return null;
    try {
      const url = `https://overpass-api.de/api/interpreter?data=[out:json];way(around:100,${lat},${lng})[highway];out%20tags%20geom;`;
      const resp = await fetch(url);
      if (resp.ok) {
        const res = await resp.json();
        const ways = res.elements || [];
        let minDistanceSq = Infinity;
        let nearestPoint = null;

        const nonRoadTypes = ['footway', 'path', 'steps', 'pedestrian', 'cycleway', 'bridleway', 'service', 'track', 'proposed', 'construction'];

        for (const way of ways) {
          if (!way.geometry) continue;
          const hwType = (way.tags && way.tags.highway) ? way.tags.highway.toLowerCase() : '';
          if (nonRoadTypes.includes(hwType)) continue;

          for (const pt of way.geometry) {
            const dLat = pt.lat - lat;
            const dLon = (pt.lon - lng) * Math.cos(lat * Math.PI / 180);
            const distSq = dLat * dLat + dLon * dLon;
            if (distSq < minDistanceSq) {
              minDistanceSq = distSq;
              nearestPoint = pt;
            }
          }
        }

        if (nearestPoint) {
          const dLon = (nearestPoint.lon - lng) * (Math.PI / 180);
          const lat1 = lat * (Math.PI / 180);
          const lat2 = nearestPoint.lat * (Math.PI / 180);

          const y = Math.sin(dLon) * Math.cos(lat2);
          const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
          const bearingFromHouseToRoad = (Math.atan2(y, x) * (180 / Math.PI) + 360) % 360;

          const directions = [
            'North (N)', 'Northeast (NE)', 'East (E)', 'Southeast (SE)',
            'South (S)', 'Southwest (SW)', 'West (W)', 'Northwest (NW)'
          ];
          const idx = Math.floor((bearingFromHouseToRoad + 22.5) / 45) % 8;
          return directions[idx];
        }
      }
    } catch (e) {
      console.warn('Facing direction fetch error:', e);
    }
    return null;
  }

  /**
   * Auto-query free APIs to calculate lot altitude (ft), terrain slope classification, house facing direction, and lot size.
   */
  async fetchLotElevationAndTerrain(lat, lng) {
    if (!lat || !lng) return null;

    try {
      const lats = [lat, lat + 0.0002, lat - 0.0002, lat, lat].map(n => n.toFixed(5)).join(',');
      const lons = [lng, lng, lng, lng + 0.0002, lng - 0.0002].map(n => n.toFixed(5)).join(',');
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats}&longitude=${lons}&current=temperature_2m`;

      const elevResp = await fetch(url).catch(() => null);

      if (elevResp && elevResp.ok) {
        const data = await elevResp.json();
        if (Array.isArray(data) && data.length > 0) {
          const elevsFt = data.map(item => Math.round((item.elevation || 0) * 3.28084));
          const centerElevFt = elevsFt[0];
          const minElevFt = Math.min(...elevsFt);
          const maxElevFt = Math.max(...elevsFt);
          const varianceFt = maxElevFt - minElevFt;

          let terrain = 'Flat';
          if (varianceFt >= 30) {
            terrain = 'Steep Slope';
          } else if (varianceFt >= 10) {
            terrain = 'Gentle Slope';
          }

          return {
            elevationFt: centerElevFt,
            varianceFt: varianceFt,
            terrain: terrain,
            facingDirection: null,
            lotSize: null
          };
        }
      }
    } catch (e) {
      console.warn('Lot details auto-detect error:', e);
    }
    return null;
  }

  async reverseGeocode(lat, lng) {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`;
      const resp = await fetch(url, { headers: { 'User-Agent': 'Homeward-SiteScoutingApp/1.0' } });
      if (resp.ok) {
        const data = await resp.json();
        if (data && data.display_name) {
          return this.cleanAddress(data.display_name);
        }
      }
    } catch (e) {
      console.warn('Reverse geocode error:', e);
    }
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }

  async geocodeBatch(addresses, onProgress = null) {
    const results = [];
    for (let i = 0; i < addresses.length; i++) {
      const addr = addresses[i];
      if (onProgress) {
        onProgress(i + 1, addresses.length, addr);
      }

      const isCached = !!this.cache[this.cleanAddress(addr)];
      const res = await this.geocodeAddress(addr);

      if (res) {
        results.push(res);
      } else {
        console.warn(`Could not geocode: ${addr}`);
      }

      if (!isCached && i < addresses.length - 1) {
        await new Promise(r => setTimeout(r, this.requestDelayMs));
      }
    }
    return results;
  }
}

window.geocoder = new Geocoder();
