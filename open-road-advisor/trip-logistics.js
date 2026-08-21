// Trip-logistics simulation: pure domain logic, no DOM access.
//
// Split out of advisor.js on 2026-08-20 (see project memory
// advisor_js_architecture.md) -- this file owns the part of a scan that
// decides *where* fuel/rest/meal/overnight-layover stops land along the
// route and *when* the vehicle arrives at each one. It takes the sampled
// route waypoints plus the user's logistics settings in, and returns the
// finalized, stop-merged waypoint list out. Nothing in here touches the
// DOM, the map, or reads form inputs directly -- advisor.js is responsible
// for reading the relevant inputs into plain values/booleans and passing
// them in via the params object.
//
// Card rendering (weather enrichment, DOM building, map markers) lives in
// milestone-cards.js and runs as a separate pass over the finalWaypoints
// this module returns.
import {
  reverseGeocodeSettlement,
  getCustomMealCrossing,
  findNearestFuelStation,
  findNearbyRestaurants,
  findNearbyHotels
} from './geo-utils.js?v=30';

// Builds a new waypoint at targetMile by interpolating between wp1 and wp2 --
// used for every injected logistics stop (fuel/rest/meal/layover), since
// those land between two of the ~25-mile sampled waypoints rather than on
// one exactly.
function interpolateWaypoint(wp1, wp2, targetMile, label, type, toppedOff = false) {
  const den = wp2.distanceMiles - wp1.distanceMiles;
  const ratio = den > 0 ? (targetMile - wp1.distanceMiles) / den : 0;
  const interpolatedMeters = wp1.cumulativeMeters + ratio * (wp2.cumulativeMeters - wp1.cumulativeMeters);
  const interpolatedCoord = [
    wp1.coord[0] + ratio * (wp2.coord[0] - wp1.coord[0]),
    wp1.coord[1] + ratio * (wp2.coord[1] - wp1.coord[1])
  ];
  return {
    coord: interpolatedCoord,
    cumulativeMeters: interpolatedMeters,
    distanceMiles: Math.round(targetMile * 10) / 10,
    bearing: wp1.bearing,
    defaultCity: label,
    isLogistical: true,
    logisticalType: type,
    // All the logistical "needs" folded into this one card -- starts as just
    // itself; the merge pass below unions two waypoints' arrays together when
    // it collapses them into a single card, so downstream detail-section
    // gating can check "does this card cover a meal?" separately from "which
    // type owns the badge/title styling?" (still wp.logisticalType).
    mergedTypes: [type],
    toppedOff: toppedOff
  };
}

function getApproxTzOffset(longitude, unixSecs) {
  let stdOffset = -8; // Default Pacific Time (PST = UTC-8)
  if (longitude >= -85) {
    stdOffset = -5; // Eastern Standard Time (EST = UTC-5)
  } else if (longitude >= -104) {
    stdOffset = -6; // Central Standard Time (CST = UTC-6)
  } else if (longitude >= -117) {
    stdOffset = -7; // Mountain Standard Time (MST = UTC-7)
  }

  // Check if Daylight Saving Time (DST) is active
  const d = new Date(unixSecs * 1000);
  const month = d.getUTCMonth(); // 0 = Jan, 11 = Dec
  let isDst = false;
  if (month > 2 && month < 10) {
    isDst = true; // Apr-Oct
  } else if (month === 2) {
    // March: starts second Sunday
    const date = d.getUTCDate();
    const day = d.getUTCDay(); // 0 = Sunday
    const prevSunday = date - day;
    isDst = (prevSunday >= 8);
  } else if (month === 10) {
    // November: ends first Sunday
    const date = d.getUTCDate();
    const day = d.getUTCDay();
    const prevSunday = date - day;
    isDst = (prevSunday < 1);
  }

  return (stdOffset + (isDst ? 1 : 0)) * 3600;
}

function getNextCurfewBoundaryLocalUnix(localUnix, curfewEndHour, curfewEndMin) {
  const d = new Date(localUnix * 1000);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  let boundary = Date.UTC(y, m, day, curfewEndHour, curfewEndMin, 0) / 1000;
  if (boundary <= localUnix) {
    boundary += 86400;
  }
  return boundary;
}

function getNextCurfewStartLocalUnix(localUnix, curfewStartHour, curfewStartMin) {
  const d = new Date(localUnix * 1000);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  let start = Date.UTC(y, m, day, curfewStartHour, curfewStartMin, 0) / 1000;
  if (start <= localUnix) {
    start += 86400;
  }
  return start;
}

// Locates the [lon, lat] coordinate on the actual road polyline at a given mile marker, by
// binary-searching the precomputed cumulative-distance array and interpolating between the
// two bracketing polyline vertices.
function getCoordAtMiles(mile, distances, coordsArr) {
  const targetMeters = Math.max(0, mile) * 1609.34;
  const totalMeters = distances[distances.length - 1];
  if (targetMeters <= 0) return coordsArr[0];
  if (targetMeters >= totalMeters) return coordsArr[coordsArr.length - 1];

  let lo = 0, hi = distances.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (distances[mid] < targetMeters) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  const idx = lo;
  const prevIdx = Math.max(0, idx - 1);
  const dPrev = distances[prevIdx];
  const dNext = distances[idx];
  const ratio = dNext > dPrev ? (targetMeters - dPrev) / (dNext - dPrev) : 0;
  return [
    coordsArr[prevIdx][0] + ratio * (coordsArr[idx][0] - coordsArr[prevIdx][0]),
    coordsArr[prevIdx][1] + ratio * (coordsArr[idx][1] - coordsArr[prevIdx][1])
  ];
}

// Smart Layover: rather than dropping the overnight stop at the exact curfew-boundary mile
// (which may well be open highway), walk backward along the actual route in 10-mile
// increments, reverse-geocoding each candidate point, and use the first one that resolves
// to a real city/town/village/hamlet. Falls back to the original boundary mile (prior
// behavior) if nothing valid turns up within the search window.
async function findSmartLayoverStop(targetMile, floorMile, distances, coordsArr) {
  const maxBacktrackMiles = 60;
  const stepMiles = 10;
  const lowerBound = Math.max(floorMile, targetMile - maxBacktrackMiles, 0);
  let firstRequest = true;

  for (let mile = targetMile; mile >= lowerBound; mile -= stepMiles) {
    if (!firstRequest) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // respect Nominatim's ~1 req/sec rate limit
    }
    firstRequest = false;

    const candidateCoord = getCoordAtMiles(mile, distances, coordsArr);
    const settlement = await reverseGeocodeSettlement(candidateCoord[1], candidateCoord[0]);
    if (settlement) {
      return { mile, name: settlement.name };
    }
  }
  return null;
}

// Fuel Stop station search: unlike Smart Layover above (which only ever walks
// backward, because a curfew stop has slack to spare), a fuel stop is computed
// with a 15-mile safety buffer already reserved before the tank actually runs
// dry (see fuelStopMile below) -- so we search forward into that buffer first,
// since it's still fuel-safe ground. Only if nothing turns up forward do we walk
// backward, same 10-mile-step idea as Smart Layover. Both directions are capped
// to stay within the current road segment (segFloorMile..segCeilingMile) so the
// result is always valid input for interpolateWaypoint() below.
async function findFuelStopStation(targetMile, segFloorMile, segCeilingMile, distances, coordsArr) {
  const stepMiles = 10;
  const forwardMaxMiles = 15; // matches the safety buffer reserved in fuelStopMile
  const backwardMaxMiles = 25;
  const searchRadiusMiles = 5;
  let firstRequest = true;

  async function tryMile(mile) {
    if (!firstRequest) {
      await new Promise(resolve => setTimeout(resolve, 1200)); // stay polite to the shared Overpass instance
    }
    firstRequest = false;
    const candidateCoord = getCoordAtMiles(mile, distances, coordsArr);
    const station = await findNearestFuelStation(candidateCoord[1], candidateCoord[0], searchRadiusMiles);
    return station ? { mile, station } : null;
  }

  const forwardCeiling = Math.min(segCeilingMile, targetMile + forwardMaxMiles);
  for (let mile = targetMile; mile <= forwardCeiling; mile += stepMiles) {
    const hit = await tryMile(mile);
    if (hit) return hit;
  }

  const backwardFloor = Math.max(segFloorMile, targetMile - backwardMaxMiles, 0);
  for (let mile = targetMile - stepMiles; mile >= backwardFloor; mile -= stepMiles) {
    const hit = await tryMile(mile);
    if (hit) return hit;
  }

  return null;
}

// Meal Stop dining search: backward-only (unlike the Fuel Stop search above,
// there's no "safety buffer" pushing this forward -- a meal stop just needs to
// land somewhere with actual food, and arriving a little ahead of the exact
// mealtime crossing to reach a real cluster of restaurants beats hitting that
// crossing dead in the middle of nowhere). Steps back from the computed meal
// mile in 5-mile increments, up to 50 miles, stopping at the first mile that
// has any mapped dining options within searchRadiusMiles. Returns
// { mile, coord, restaurants } on a hit, or null if the whole 50-mile window
// (or the segment, if shorter) comes up empty. Only called when the "Find
// Nearby Restaurants" checkbox is on -- at up to 10 sequential Overpass round
// trips per meal stop (1200ms apart, plus mirror fallback attempts), this is
// the most expensive part of a scan, so it's opt-out rather than free.
async function findMealStopDining(targetMile, floorMile, distances, coordsArr) {
  const stepMiles = 5;
  const backwardMaxMiles = 50;
  const searchRadiusMiles = 5;
  let firstRequest = true;

  const backwardFloor = Math.max(floorMile, targetMile - backwardMaxMiles, 0);
  for (let mile = targetMile; mile >= backwardFloor; mile -= stepMiles) {
    if (!firstRequest) {
      await new Promise(resolve => setTimeout(resolve, 1200)); // stay polite to the shared Overpass mirrors
    }
    firstRequest = false;
    const candidateCoord = getCoordAtMiles(mile, distances, coordsArr);
    const restaurants = await findNearbyRestaurants(candidateCoord[1], candidateCoord[0], searchRadiusMiles, 6);
    if (restaurants.length > 0) {
      return { mile, coord: candidateCoord, restaurants };
    }
  }

  return null;
}

// Overnight Layover lodging search: backward-only, same idea as the Meal
// Stop dining search above but tuned for lodging -- hotels/motels are
// sparser on the map than restaurants, so this starts with a wider 10-mile
// search radius and steps back in coarser 10-mile increments (vs meal's
// 5/5) from the layover mile (which may already have been pulled back
// toward a real town by Smart Layover above). Returns
// { mile, coord, hotels } on a hit, or null if the whole backward window
// (or the segment, if shorter) comes up empty -- callers fall back to
// whatever mile/coord they already had (Smart Layover's settlement, or
// the raw curfew boundary) and just show "no mapped lodging nearby".
async function findLayoverLodging(targetMile, floorMile, distances, coordsArr) {
  const stepMiles = 10;
  const backwardMaxMiles = 60; // matches Smart Layover's own backtrack cap
  const searchRadiusMiles = 10;
  let firstRequest = true;

  const backwardFloor = Math.max(floorMile, targetMile - backwardMaxMiles, 0);
  for (let mile = targetMile; mile >= backwardFloor; mile -= stepMiles) {
    if (!firstRequest) {
      await new Promise(resolve => setTimeout(resolve, 1200)); // stay polite to the shared Overpass mirrors
    }
    firstRequest = false;
    const candidateCoord = getCoordAtMiles(mile, distances, coordsArr);
    const hotels = await findNearbyHotels(candidateCoord[1], candidateCoord[0], searchRadiusMiles, 6);
    if (hotels.length > 0) {
      return { mile, coord: candidateCoord, hotels };
    }
  }

  return null;
}

// Creates a per-scan fuel-price fetcher + cache so multiple fuel stops that
// resolve to the same state/grade (common on long highway legs) only hit
// fuel-price-proxy.php once each, instead of once per stop. The cache is
// handed back too -- advisor.js's post-render Fuel Budgeting step looks at
// it (cache.values()) to find a real EIA quote to use as its fallback
// price-per-gallon for any stop that never resolved its own quote.
export function createFuelPriceService(log) {
  const fuelPriceCache = new Map();
  async function fetchFuelPrice(stateCode, grade) {
    const cacheKey = `${stateCode || ''}|${grade}`;
    if (fuelPriceCache.has(cacheKey)) {
      return fuelPriceCache.get(cacheKey);
    }
    try {
      const params = new URLSearchParams({ grade });
      if (stateCode) params.set('state', stateCode);
      const res = await fetch(`fuel-price-proxy.php?${params.toString()}`, { signal: AbortSignal.timeout(12000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      fuelPriceCache.set(cacheKey, data);
      return data;
    } catch (e) {
      log(`[FUEL] Price lookup failed for ${stateCode || 'US'} (${grade}): ${e.message}`);
      const fallback = {
        price: 3.50, period: null, grade: 'regular', requestedGrade: grade,
        usedFallbackGrade: grade !== 'regular', area: 'default',
        areaLabel: 'National default estimate', source: 'default_estimate'
      };
      fuelPriceCache.set(cacheKey, fallback);
      return fallback;
    }
  }
  return { fetchFuelPrice, cache: fuelPriceCache };
}

// Runs the full logistics simulation: walks the sampled route waypoints in
// order, injecting fuel/rest/meal/overnight-layover stops wherever they
// become due, then collapses any stops that coincidentally landed within a
// short hop of each other into single combined cards. Returns the finalized
// waypoint list -- the only thing milestone-cards.js needs to render the
// timeline.
export async function runLogisticsSimulation({
  sampledWaypoints,
  departureTimeUnix,
  speedMps,
  cumulativeDistances,
  coords,
  fuelRange,
  restInterval,
  enableRest,
  topOffRest,
  topOffMeals,
  findRestaurantsEnabled,
  findHotelsEnabled,
  smartLayoverEnabled,
  enforceCurfew,
  curfewStartHour,
  curfewStartMin,
  curfewEndHour,
  curfewEndMin,
  curfewEndStr,
  meals,
  log
}) {
  const finalWaypoints = [];
  let lastRefuelMile = 0;
  let lastRestMile = 0;
  let cumulativeDelaySeconds = 0;

  // Always push the start waypoint
  const startWp = sampledWaypoints[0];
  startWp.arrivalTimeUnix = departureTimeUnix;
  finalWaypoints.push(startWp);

  for (let i = 1; i < sampledWaypoints.length; i++) {
    const currentWp = sampledWaypoints[i];
    let prevWp = finalWaypoints[finalWaypoints.length - 1];
    // Set immediately after an overnight layover is injected so subsequent event checks in
    // this same segment use the actual resume time (next morning) rather than the moment the
    // vehicle stopped for the night. Without this, curfew/meal checks below would re-evaluate
    // against a "t1" that's already hours in the past relative to the layover, which can
    // misfire a second, bogus layover the same evening.
    let resumeOverrideUtc = null;

    // Process any logistical events inside this segment chronologically
    let segmentCompleted = false;
    while (!segmentCompleted) {
      const d1 = prevWp.distanceMiles;
      const d2 = currentWp.distanceMiles;
      const t1 = resumeOverrideUtc !== null ? resumeOverrideUtc : prevWp.arrivalTimeUnix;
      const t2 = departureTimeUnix + (currentWp.cumulativeMeters / speedMps) + cumulativeDelaySeconds;
      const approxOffset = getApproxTzOffset(currentWp.coord[0], t1);

      // Hard gate first: check curfew before any logistical event processing.
      if (enforceCurfew) {
        const localT1 = t1 + approxOffset;
        const localT2 = t2 + approxOffset;
        const nextBoundaryLocal = getNextCurfewBoundaryLocalUnix(localT1, curfewEndHour, curfewEndMin);

        if (localT2 > nextBoundaryLocal) {
          const boundaryUtc = nextBoundaryLocal - approxOffset;
          const ratio = Math.max(0, Math.min(1, (boundaryUtc - t1) / (t2 - t1)));
          let layoverMile = d1 + ratio * (d2 - d1);

          if (smartLayoverEnabled) {
            const settlement = await findSmartLayoverStop(layoverMile, d1, cumulativeDistances, coords);
            if (settlement) {
              log(`[CURFEW] Smart Layover backtracked ${(layoverMile - settlement.mile).toFixed(1)} mi to settle near ${settlement.name}.`);
              layoverMile = settlement.mile;
            }
          }

          // Lodging search runs regardless of Smart Layover -- it starts right at
          // whatever mile the stop is currently at (settlement-adjusted or the raw
          // curfew boundary) and only ever moves the stop further back, never forward,
          // so it never conflicts with the curfew boundary being enforced. Skipped
          // entirely when "Find Nearby Lodging" is off, since the backward walk is
          // the most expensive part of a scan and shouldn't run for users who don't
          // care about it.
          const lodgingHit = findHotelsEnabled
            ? await findLayoverLodging(layoverMile, d1, cumulativeDistances, coords)
            : null;
          if (lodgingHit && lodgingHit.mile < layoverMile) {
            log(`[CURFEW] Lodging search backtracked ${(layoverMile - lodgingHit.mile).toFixed(1)} mi further to reach mapped hotels.`);
          }
          if (lodgingHit) {
            layoverMile = lodgingHit.mile;
          }

          const layoverWp = interpolateWaypoint(prevWp, currentWp, layoverMile, 'Overnight Layover', 'layover', true);
          // Actual arrival time at the layover point -- may be earlier than the wall-clock
          // curfew boundary if Smart Layover and/or the lodging search pulled the stop
          // back toward a real town / mapped hotel.
          layoverWp.arrivalTimeUnix = departureTimeUnix + (layoverWp.cumulativeMeters / speedMps) + cumulativeDelaySeconds;
          if (lodgingHit) {
            // Snap to the actual route coordinate the lodging search found (rather than
            // interpolateWaypoint's straight-line coord between the two sampled
            // waypoints), same idea as the Fuel/Meal Stop snaps elsewhere in this file.
            layoverWp.coord = lodgingHit.coord;
          }
          layoverWp.nearbyHotels = lodgingHit ? lodgingHit.hotels : [];
          layoverWp.lodgingSearchSkipped = !findHotelsEnabled;
          // cityName will be resolved dynamically via reverse geocoding to show where the vehicle stops
          finalWaypoints.push(layoverWp);

          // Rest until the next curfew-start time, measured from when the vehicle actually
          // stopped (not the nominal curfew-end wall clock) so Smart Layover backtracking
          // doesn't quietly shrink the overnight rest period.
          const actualLayoverLocalUnix = layoverWp.arrivalTimeUnix + approxOffset;
          const resumeLocal = getNextCurfewStartLocalUnix(actualLayoverLocalUnix, curfewStartHour, curfewStartMin);
          const delaySeconds = Math.max(0, resumeLocal - actualLayoverLocalUnix);
          cumulativeDelaySeconds += delaySeconds;

          lastRefuelMile = layoverMile;
          prevWp = layoverWp;
          resumeOverrideUtc = layoverWp.arrivalTimeUnix + delaySeconds;
          // Carried on the waypoint itself so the render loop can compare it
          // against a same-card pending sunrise/sunset divider and show
          // whichever actually happened first (see lastWasLayover in
          // milestone-cards.js) -- otherwise "Day Start" and "Sunrise"/"Sunset"
          // always rendered in a fixed order regardless of which one the
          // clock says came first.
          layoverWp.resumeAtUnix = resumeOverrideUtc;

          log(`[CURFEW] Boundary enforced at ${layoverMile.toFixed(1)} miles (${curfewEndStr} local).`);
          // Keep processing the remainder of this segment -- a fuel/rest/meal stop may still
          // be due before reaching the next sampled waypoint -- instead of skipping past it.
          continue;
        }
      }

      // Check event 1: Fuel Stop needed before running out (safety buffer is 15 miles before limit)
      let fuelStopMile = lastRefuelMile + fuelRange - 15;
      if (fuelStopMile <= d1) {
        // Already inside (or past) the safety buffer at the start of this segment -- force a
        // stop almost immediately instead of silently deferring it (previously this branch
        // recalculated fuelStopMile too late for hasFuelEvent to notice it).
        fuelStopMile = d1 + 0.1;
      }
      const hasFuelEvent = (d2 >= lastRefuelMile + fuelRange) || (fuelStopMile > d1 && fuelStopMile <= d2);

      // Check event 2: Rest Stop interval
      const restStopMile = lastRestMile + restInterval;
      const hasRestEvent = enableRest && (restStopMile > d1 && restStopMile <= d2);

      // Check event 3: Meal Stop time crossing
      let mealEvent = null;
      if (t2 > t1 && meals.length > 0) {
        const crossing = getCustomMealCrossing(t1 + approxOffset, t2 + approxOffset, meals);
        if (crossing) {
          crossing.timeUnix -= approxOffset; // Shift back to absolute UTC
          const ratio = (crossing.timeUnix - t1) / (t2 - t1);
          const mealMile = d1 + ratio * (d2 - d1);
          mealEvent = { name: crossing.name, timeUnix: crossing.timeUnix, mile: mealMile };
        }
      }

      // Gather active events
      const activeEvents = [];
      if (hasFuelEvent && fuelStopMile < d2) {
        activeEvents.push({ type: 'fuel', mile: fuelStopMile });
      }
      if (hasRestEvent && restStopMile < d2) {
        activeEvents.push({ type: 'rest', mile: restStopMile });
      }
      if (mealEvent && mealEvent.mile < d2) {
        activeEvents.push({ type: 'meal', mile: mealEvent.mile, name: mealEvent.name, timeUnix: mealEvent.timeUnix });
      }

      if (activeEvents.length === 0) {
        segmentCompleted = true;
      } else {
        // Sort events by distance to find the earliest one
        activeEvents.sort((a, b) => a.mile - b.mile);
        const firstEvent = activeEvents[0];

        if (firstEvent.type === 'fuel') {
          const priorRefuelMile = lastRefuelMile;
          let actualStopMile = firstEvent.mile;
          let stationInfo = null;

          const stationHit = await findFuelStopStation(firstEvent.mile, d1, d2, cumulativeDistances, coords);
          if (stationHit) {
            actualStopMile = stationHit.mile;
            stationInfo = stationHit.station;
          }

          const injectedWp = interpolateWaypoint(prevWp, currentWp, actualStopMile, "Fuel Stop Required", "fuel");
          injectedWp.arrivalTimeUnix = departureTimeUnix + (injectedWp.cumulativeMeters / speedMps) + cumulativeDelaySeconds;
          injectedWp.stationFound = !!stationInfo;
          injectedWp.stationName = stationInfo ? stationInfo.name : null;
          if (stationInfo) {
            // Snap to the actual station coordinate (a short distance off the
            // interpolated route point) so the city/state lookup and price
            // quote below reflect where the driver will really pull in.
            injectedWp.coord = [stationInfo.lon, stationInfo.lat];
          }
          injectedWp.milesSinceLastRefuel = actualStopMile - priorRefuelMile;
          finalWaypoints.push(injectedWp);
          prevWp = injectedWp;
          resumeOverrideUtc = null;
          lastRefuelMile = actualStopMile;
        } else if (firstEvent.type === 'rest') {
          const topOff = topOffRest;
          const injectedWp = interpolateWaypoint(prevWp, currentWp, firstEvent.mile, "Rest Stop Required", "rest", topOff);
          injectedWp.arrivalTimeUnix = departureTimeUnix + (injectedWp.cumulativeMeters / speedMps) + cumulativeDelaySeconds;
          finalWaypoints.push(injectedWp);
          prevWp = injectedWp;
          resumeOverrideUtc = null;
          lastRestMile = firstEvent.mile;
          if (topOff) {
            // Not run through the Fuel Stop station search above -- a rest stop
            // is already a real, chosen location, unlike an arbitrary computed
            // mile marker -- so pricing below just uses this waypoint's own
            // coordinate directly.
            injectedWp.milesSinceLastRefuel = firstEvent.mile - lastRefuelMile;
            lastRefuelMile = firstEvent.mile;
          }
        } else if (firstEvent.type === 'meal') {
          const topOff = topOffMeals;
          let actualStopMile = firstEvent.mile;
          // Skipped entirely when "Find Nearby Restaurants" is off -- the backward
          // walk is the most expensive part of a scan and shouldn't run for users
          // who don't care about it.
          const diningHit = findRestaurantsEnabled
            ? await findMealStopDining(firstEvent.mile, d1, cumulativeDistances, coords)
            : null;
          if (diningHit) {
            actualStopMile = diningHit.mile;
          }

          const injectedWp = interpolateWaypoint(prevWp, currentWp, actualStopMile, firstEvent.name, "meal", topOff);
          if (diningHit) {
            // Snap to the mile that actually had dining options -- arrival time
            // shifts a little earlier along with it, same idea as the Fuel Stop
            // station snap above, rather than keeping the original mealtime
            // crossing's exact clock time now that the stop itself moved.
            injectedWp.arrivalTimeUnix = departureTimeUnix + (injectedWp.cumulativeMeters / speedMps) + cumulativeDelaySeconds;
            injectedWp.coord = diningHit.coord;
            injectedWp.nearbyRestaurants = diningHit.restaurants;
          } else {
            injectedWp.arrivalTimeUnix = firstEvent.timeUnix;
            injectedWp.nearbyRestaurants = [];
          }
          injectedWp.restaurantSearchSkipped = !findRestaurantsEnabled;
          finalWaypoints.push(injectedWp);
          prevWp = injectedWp;
          cumulativeDelaySeconds += 3600; // Add 1 hour delay for meal stop
          // Resume the clock from *after* the meal (arrival + the 1hr above), not
          // from the raw arrival time -- otherwise the next event check's t1 stays
          // at the arrival instant while t2 already reflects the full delay, and
          // when the dining search backtracks the stop to before the meal's exact
          // scheduled clock time (e.g. arriving 6:25 PM for a 6:30 PM dinner), that
          // now-still-uncrossed 6:30 PM threshold gets detected as a second, bogus
          // meal event ~1 stationary "hour" later. Same fix already applied to the
          // Overnight Layover branch above (via its own resumeOverrideUtc).
          resumeOverrideUtc = injectedWp.arrivalTimeUnix + 3600;
          if (topOff) {
            injectedWp.milesSinceLastRefuel = actualStopMile - lastRefuelMile;
            lastRefuelMile = actualStopMile;
          }
        }
      }
    }

    const tArrival = departureTimeUnix + (currentWp.cumulativeMeters / speedMps) + cumulativeDelaySeconds;
    currentWp.arrivalTimeUnix = tArrival;
    finalWaypoints.push(currentWp);
  }

  // Collapse logistical stops that landed within a short hop of each other. Fuel
  // range, the mandatory rest-break interval, meal-clock crossings, and the nightly
  // curfew boundary are all evaluated independently above, so two of them can
  // coincidentally fall a few miles/minutes apart (e.g. a rest break interval that
  // happens to land right next to that night's curfew stop, or right next to
  // breakfast time). A driver would just make one stop and handle both needs there
  // rather than pulling over twice in the same few minutes, so merge any such
  // adjacent pair into a single combined card instead of rendering both.
  {
    const MERGE_MAX_MILES = 25;
    const MERGE_MAX_MINUTES = 45;
    // Higher-priority type anchors the merged card's badge/title/detail-gating
    // (see logisticalType usage in milestone-cards.js) when neither/both stops
    // found a real location; a stop that actually resolved a real place (mapped
    // gas station / restaurant / hotel) always outranks a bare computed mile
    // marker, though.
    const TYPE_PRIORITY = { layover: 3, fuel: 2, meal: 1, rest: 0 };
    const hasRealLocationHit = (t) => (
      (t.logisticalType === 'fuel' && t.stationFound) ||
      (t.logisticalType === 'meal' && (t.nearbyRestaurants || []).length > 0) ||
      (t.logisticalType === 'layover' && (t.nearbyHotels || []).length > 0)
    );

    const collapsed = [];
    for (const wp of finalWaypoints) {
      const prev = collapsed[collapsed.length - 1];
      const prevTypes = prev ? new Set(prev.mergedTypes || [prev.logisticalType]) : null;
      // Never merge two stops that both cover the same need (e.g. two real rest
      // breaks that happen to be within MERGE_MAX_MILES of each other because the
      // user configured a short rest interval) -- only coincidental *different*
      // triggers landing close together should collapse.
      const closeEnough = !!prev && prev.isLogistical && wp.isLogistical &&
        !prevTypes.has(wp.logisticalType) &&
        Math.abs(wp.distanceMiles - prev.distanceMiles) <= MERGE_MAX_MILES &&
        Math.abs(wp.arrivalTimeUnix - prev.arrivalTimeUnix) <= MERGE_MAX_MINUTES * 60;

      if (closeEnough) {
        const prevHit = hasRealLocationHit(prev);
        const wpHit = hasRealLocationHit(wp);
        let anchor = prev, other = wp;
        if (wpHit && !prevHit) {
          anchor = wp; other = prev;
        } else if (prevHit === wpHit && TYPE_PRIORITY[wp.logisticalType] > TYPE_PRIORITY[prev.logisticalType]) {
          anchor = wp; other = prev;
        }

        anchor.defaultCity = `${prev.defaultCity} + ${wp.defaultCity}`;
        anchor.mergedTypes = Array.from(new Set([
          ...(prev.mergedTypes || [prev.logisticalType]),
          ...(wp.mergedTypes || [wp.logisticalType])
        ]));
        anchor.toppedOff = !!(prev.toppedOff || wp.toppedOff);
        // Whichever side measured more distance since the last real refuel wins --
        // when both sides top off, the later one's figure is usually a near-zero
        // top-up measured from the mile the first side just refueled at (they're
        // the same physical stop), not a second real fill-up.
        const milesA = prev.milesSinceLastRefuel || 0;
        const milesB = wp.milesSinceLastRefuel || 0;
        anchor.milesSinceLastRefuel = Math.max(milesA, milesB) || undefined;
        anchor.nearbyRestaurants = (prev.nearbyRestaurants || []).length ? prev.nearbyRestaurants : (wp.nearbyRestaurants || []);
        anchor.restaurantSearchSkipped = !!(prev.restaurantSearchSkipped || wp.restaurantSearchSkipped);
        anchor.nearbyHotels = (prev.nearbyHotels || []).length ? prev.nearbyHotels : (wp.nearbyHotels || []);
        anchor.lodgingSearchSkipped = !!(prev.lodgingSearchSkipped || wp.lodgingSearchSkipped);
        anchor.stationFound = !!(prev.stationFound || wp.stationFound);
        anchor.stationName = prev.stationName || wp.stationName;

        log(`[LOGISTICS] Merged ${other.logisticalType} stop (${other.distanceMiles.toFixed(1)} mi) into ${anchor.logisticalType} stop (${anchor.distanceMiles.toFixed(1)} mi) -- ${Math.abs(wp.distanceMiles - prev.distanceMiles).toFixed(1)} mi / ${(Math.abs(wp.arrivalTimeUnix - prev.arrivalTimeUnix) / 60).toFixed(0)} min apart.`);

        collapsed[collapsed.length - 1] = anchor;
      } else {
        wp.mergedTypes = wp.mergedTypes || (wp.isLogistical ? [wp.logisticalType] : []);
        collapsed.push(wp);
      }
    }
    finalWaypoints.splice(0, finalWaypoints.length, ...collapsed);
  }

  log(`[LOGISTICS] Logistical pre-processor completed. Timeline contains ${finalWaypoints.length} stops.`);

  return finalWaypoints;
}
