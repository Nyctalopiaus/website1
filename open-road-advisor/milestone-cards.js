// Milestone timeline rendering: weather enrichment + DOM card building.
//
// Split out of advisor.js on 2026-08-20 (see project memory
// advisor_js_architecture.md) -- this file owns everything that happens
// *after* trip-logistics.js has decided the finalized waypoint list: fetching
// per-waypoint weather, computing each waypoint's display-facing safety
// scoring (stability/exposure/drag), reverse-geocoding, speed-limit and
// fuel-price lookups, and building the actual `.milestone-card` DOM plus the
// route-overview rows, timezone/daylight dividers, and map markers.
//
// buildTripTimeline() is the single entry point. It mutates the map (adding
// markers into the waypointMarkers array the caller owns) and returns the
// assembled DocumentFragment plus the aggregate stats (minStability,
// minExposure, lastWpOffsetSeconds, per-type stop counts) advisor.js needs
// for the HUD/summary updates that follow rendering.
import {
  reverseGeocode,
  findSpeedLimitAtPoint,
  highwayClassLabel
} from './geo-utils.js?v=30';
import { escapeHTML } from './road-utils.js?v=26';

function createSummaryCol(summaryHeader, label, val, color) {
  const col = document.createElement('div');
  const lbl = document.createElement('div');
  lbl.style.fontSize = '0.75rem';
  lbl.style.textTransform = 'uppercase';
  lbl.style.color = 'var(--text-muted)';
  lbl.style.fontWeight = '600';
  lbl.style.marginBottom = '0.25rem';
  lbl.textContent = label;

  const value = document.createElement('div');
  value.style.fontSize = '1.25rem';
  value.style.fontWeight = 'bold';
  value.style.color = color;
  value.textContent = val;

  col.appendChild(lbl);
  col.appendChild(value);
  summaryHeader.appendChild(col);
}

// Formats a unix timestamp as a local "H:MM AM/PM" clock string using the
// waypoint's own UTC offset -- same math as the per-card timeStr below,
// factored out so the sunset/sunrise divider can reuse it for a different
// timestamp (the actual sunset/sunrise instant, not the card's arrival time).
function formatLocalClock(unixTime, offsetSeconds) {
  const d = new Date((unixTime + offsetSeconds) * 1000);
  let h = d.getUTCHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  h = h ? h : 12;
  const m = d.getUTCMinutes().toString().padStart(2, '0');
  return `${h}:${m} ${ampm}`;
}

// Builds the full itinerary timeline (summary header, Route Overview table,
// Detailed Route Timeline cards, map markers) for a finalized waypoint list.
//
// Params:
//   finalWaypoints    - output of trip-logistics.js's runLogisticsSimulation()
//   departureTimeUnix - trip departure time (unix seconds)
//   isMetric, distLabel, tempLabel, speedLabel, distMultiplier, currencySymbol
//                     - unit/currency display settings
//   activeVehicle, vehicleKey - selected vehicle profile + its config object
//   fuelGrade, estimatedMpg   - for per-stop fuel price/cost lookups
//   fetchFuelPrice    - async (stateCode, grade) => quote, from
//                        trip-logistics.js's createFuelPriceService()
//   map, waypointMarkers - Leaflet map instance + the array to push new
//                        markers into (mutated in place, same as before)
//   log               - logging callback
//
// Returns { mainFragment, minStability, minExposure, lastWpOffsetSeconds,
//           fuelCount, mealCount, restCount, layoverCount }.
export async function buildTripTimeline({
  finalWaypoints,
  departureTimeUnix,
  isMetric,
  distLabel,
  tempLabel,
  speedLabel,
  distMultiplier,
  currencySymbol,
  activeVehicle,
  vehicleKey,
  fuelGrade,
  estimatedMpg,
  fetchFuelPrice,
  map,
  waypointMarkers,
  log
}) {
  // 4. Query Open-Meteo & Nominatim Reverse-Geocoding for each Waypoint
  let minStability = 100;
  let minExposure = 100;
  let totalDrag = 0;
  let startingElevation = null;
  let lastWpOffsetSeconds = 0;

  let fuelCount = 0;
  let restCount = 0;
  let mealCount = 0;
  let layoverCount = 0;

  // Pre-calculate stops counts before fetching weather loop to lock the summary header.
  // Counts by mergedTypes (not just the card's primary logisticalType) so a combined
  // card -- e.g. a Rest Stop merged into a Breakfast Stop card -- still counts as one
  // of each rather than only counting toward whichever type ended up owning the card.
  finalWaypoints.forEach(wp => {
    if (wp.isLogistical) {
      const types = wp.mergedTypes || [wp.logisticalType];
      if (types.includes('fuel')) fuelCount++;
      if (types.includes('rest')) restCount++;
      if (types.includes('meal')) mealCount++;
      if (types.includes('layover')) layoverCount++;
    }
  });

  let lastTimeZone = null;
  let lastHazardState = '';

  // 1. Fetch weather in parallel batches of 3, with 1000ms delay between batches
  log(`[METEO] Fetching weather forecast for ${finalWaypoints.length} coordinates in parallel batches of 3...`);
  const weatherDataList = new Array(finalWaypoints.length);
  for (let startIdx = 0; startIdx < finalWaypoints.length; startIdx += 3) {
    if (startIdx > 0) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    const chunk = finalWaypoints.slice(startIdx, startIdx + 3);
    const promises = chunk.map(async (wp, chunkIdx) => {
      const idx = startIdx + chunkIdx;
      const lat = wp.coord[1];
      const lon = wp.coord[0];
      const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,windspeed_10m,winddirection_10m,precipitation_probability,cloud_cover,uv_index,visibility,cape&windspeed_unit=${isMetric ? 'kmh' : 'mph'}&temperature_unit=${isMetric ? 'celsius' : 'fahrenheit'}&timeformat=unixtime&daily=sunset,sunrise&timezone=auto`;
      try {
        // Timeout guard: open-meteo is fetched for every waypoint in batches of 3,
        // and on a long multi-day route that can be 100+ coordinates. Without a
        // timeout, one slow/unresponsive request stalls its whole Promise.all batch
        // forever, hanging the entire render pass right where it stopped -- exactly
        // the "gets stuck partway through the route" symptom on long routes that a
        // short test route rarely has enough requests to trigger.
        const res = await fetch(weatherUrl, { signal: AbortSignal.timeout(12000) });
        if (res.ok) {
          weatherDataList[idx] = await res.json();
        }
      } catch (e) {
        log(`[ERROR] Weather query failed for WP #${idx + 1}.`);
      }
    });
    await Promise.all(promises);
  }

  // Render premium timeline summary header using DOM Node API
  const mainFragment = document.createDocumentFragment();
  const totalDistanceMiles = finalWaypoints[finalWaypoints.length - 1].distanceMiles;
  const totalTravelTimeSeconds = finalWaypoints[finalWaypoints.length - 1].arrivalTimeUnix - departureTimeUnix;
  const daysOfTravel = Math.max(1, Math.ceil(totalTravelTimeSeconds / 86400));
  const totalStopsStr = `⛽ ${fuelCount} Stop${fuelCount !== 1 ? 's' : ''} | 🍔 ${mealCount} Meal${mealCount !== 1 ? 's' : ''} | 🛏️ ${layoverCount} Layover${layoverCount !== 1 ? 's' : ''} | ☕ ${restCount} Rest${restCount !== 1 ? 's' : ''}`;

  const summaryHeader = document.createElement('div');
  summaryHeader.classList.add('timeline-summary-header');
  summaryHeader.style.background = 'rgba(255,255,255,0.02)';
  summaryHeader.style.border = '1px solid var(--border-color)';
  summaryHeader.style.borderRadius = '8px';
  summaryHeader.style.padding = '1rem';
  summaryHeader.style.marginBottom = '1.5rem';
  summaryHeader.style.display = 'flex';
  summaryHeader.style.justifyContent = 'space-around';
  summaryHeader.style.flexWrap = 'wrap';
  summaryHeader.style.gap = '1rem';
  summaryHeader.style.textAlign = 'center';
  summaryHeader.style.width = '100%';

  const totalDistanceDisplay = (totalDistanceMiles * distMultiplier).toFixed(1);
  createSummaryCol(summaryHeader, 'Total Distance', `${totalDistanceDisplay} ${isMetric ? 'Kilometers' : 'Miles'}`, 'var(--primary-color)');
  createSummaryCol(summaryHeader, 'Estimated Days', `${daysOfTravel} Day${daysOfTravel > 1 ? 's' : ''}`, 'var(--accent-orange)');
  createSummaryCol(summaryHeader, 'Logistical Timeline', totalStopsStr, '#a5b4fc');

  mainFragment.appendChild(summaryHeader);

  // Create Route Overview details element securely
  const routeOverviewDetails = document.createElement('details');
  routeOverviewDetails.open = true;
  routeOverviewDetails.classList.add('itinerary-details');

  const routeOverviewSummary = document.createElement('summary');
  routeOverviewSummary.classList.add('itinerary-summary');
  routeOverviewSummary.textContent = 'Route Overview ';
  const arrowSpan1 = document.createElement('span');
  arrowSpan1.classList.add('summary-arrow');
  routeOverviewSummary.appendChild(arrowSpan1);

  const quickItineraryContent = document.createElement('div');
  quickItineraryContent.id = 'quick-itinerary-content';
  quickItineraryContent.classList.add('itinerary-content-box');
  quickItineraryContent.style.fontFamily = 'var(--font-mono)';
  quickItineraryContent.style.fontSize = '0.85rem';

  routeOverviewDetails.appendChild(routeOverviewSummary);
  routeOverviewDetails.appendChild(quickItineraryContent);
  mainFragment.appendChild(routeOverviewDetails);

  // Create Detailed Route Timeline details element securely
  const detailedTimelineDetails = document.createElement('details');
  detailedTimelineDetails.classList.add('itinerary-details');

  const detailedTimelineSummary = document.createElement('summary');
  detailedTimelineSummary.classList.add('itinerary-summary');
  detailedTimelineSummary.textContent = 'Detailed Route Timeline ';
  const arrowSpan2 = document.createElement('span');
  arrowSpan2.classList.add('summary-arrow');
  detailedTimelineSummary.appendChild(arrowSpan2);

  const detailedCardsContainer = document.createElement('div');
  detailedCardsContainer.id = 'detailed-cards-container';
  detailedCardsContainer.classList.add('itinerary-content-box', 'milestones-timeline');

  detailedTimelineDetails.appendChild(detailedTimelineSummary);
  detailedTimelineDetails.appendChild(detailedCardsContainer);
  mainFragment.appendChild(detailedTimelineDetails);

  // Add route overview table column headers securely
  const headerRow = document.createElement('div');
  headerRow.style.display = 'grid';
  headerRow.style.gridTemplateColumns = '2fr 1fr 1fr';
  headerRow.style.paddingBottom = '0.5rem';
  headerRow.style.marginBottom = '0.5rem';
  headerRow.style.borderBottom = '1px solid rgba(255,255,255,0.2)';
  headerRow.style.fontSize = '0.7rem';
  headerRow.style.color = 'var(--text-muted)';
  headerRow.style.textTransform = 'uppercase';
  headerRow.style.letterSpacing = '0.05em';
  headerRow.style.fontWeight = '700';

  const hCol1 = document.createElement('span');
  hCol1.textContent = 'Stop';
  const hCol2 = document.createElement('span');
  hCol2.textContent = 'ETA';
  const hCol3 = document.createElement('span');
  hCol3.style.textAlign = 'right';
  hCol3.textContent = 'Total / Leg';

  headerRow.appendChild(hCol1);
  headerRow.appendChild(hCol2);
  headerRow.appendChild(hCol3);
  quickItineraryContent.appendChild(headerRow);

  let displayCounter = 1;
  let lastRenderedMile = 0;
  let lastWasLayover = false;
  let pendingDayStartUnix = null;
  let lastIsAfterSunset = null;
  let pendingDaylightDivider = null;
  for (let idx = 0; idx < finalWaypoints.length; idx++) {
    const wp = finalWaypoints[idx];
    const lat = wp.coord[1];
    const lon = wp.coord[0];
    const arrivalTimeUnix = wp.arrivalTimeUnix;

    const weatherData = weatherDataList[idx];
    if (!weatherData) {
      log(`[ERROR] Missing weather data for WP #${idx + 1}. Skipping.`);
      continue;
    }

    const utcOffsetSeconds = weatherData.utc_offset_seconds || 0;
    lastWpOffsetSeconds = utcOffsetSeconds;

    const currentTz = weatherData.timezone;
    let currentTzAbbr = weatherData.timezone_abbreviation;
    try {
      const formatter = new Intl.DateTimeFormat('en-US', { timeZone: currentTz, timeZoneName: 'short' });
      const tzPart = formatter.formatToParts(new Date()).find(p => p.type === 'timeZoneName');
      if (tzPart) currentTzAbbr = tzPart.value;
    } catch(e) {}
    const tzMapper = { 'GMT-4': 'EDT', 'GMT-5': 'CDT/EST', 'GMT-6': 'MDT/CST', 'GMT-7': 'PDT/MST', 'GMT-8': 'PST' };
    if (tzMapper[currentTzAbbr]) currentTzAbbr = tzMapper[currentTzAbbr];

    const arrivalDate = new Date((arrivalTimeUnix + utcOffsetSeconds) * 1000);
    let hoursNum = arrivalDate.getUTCHours();
    const ampm = hoursNum >= 12 ? 'PM' : 'AM';
    hoursNum = hoursNum % 12;
    hoursNum = hoursNum ? hoursNum : 12;
    const minutesStr = arrivalDate.getUTCMinutes().toString().padStart(2, '0');
    const timeStr = `${hoursNum}:${minutesStr} ${ampm} (${arrivalDate.toLocaleDateString(undefined, {month: 'short', day: 'numeric', timeZone: 'UTC'})})`;

    const hourlyTimes = weatherData.hourly.time;
    let closestIndex = 0;
    let minDiff = Infinity;

    for (let t = 0; t < hourlyTimes.length; t++) {
      const diff = Math.abs(hourlyTimes[t] - arrivalTimeUnix);
      if (diff < minDiff) {
        minDiff = diff;
        closestIndex = t;
      }
    }

    const tempVal = Math.round(weatherData.hourly.temperature_2m[closestIndex]);
    const windSpeed = Math.round(weatherData.hourly.windspeed_10m[closestIndex]);
    const windDir = Math.round(weatherData.hourly.winddirection_10m[closestIndex]);
    const precipProb = weatherData.hourly.precipitation_probability[closestIndex];
    const cloudCover = weatherData.hourly.cloud_cover[closestIndex];
    const uvIndex = weatherData.hourly.uv_index[closestIndex];
    const visibilityMeters = weatherData.hourly.visibility[closestIndex];
    const cape = weatherData.hourly.cape[closestIndex];

    let skyCondition = "Clear Skies";
    if (cloudCover > 85) skyCondition = "Overcast";
    else if (cloudCover > 60) skyCondition = "Mostly Cloudy";
    else if (cloudCover > 20) skyCondition = "Partly Cloudy";

    const hasSunburnWarning = (uvIndex > activeVehicle.uvLimit);
    const hasLowVisibility = (visibilityMeters < 1000);
    const hasSevereStorm = (cape > 1000);
    const visibilityMiles = Math.round((visibilityMeters / 1609.34) * 10) / 10;

    const currentElevation = weatherData.elevation || 0;
    if (startingElevation === null) startingElevation = currentElevation;
    const elevationFeet = Math.round(currentElevation * 3.28084);
    wp.elevationFeet = elevationFeet;
    const isHighAltitudeCold = isMetric ? (tempVal < 7.2 && elevationFeet > 3000) : (tempVal < 45 && elevationFeet > 3000);

    let sunsetUnix = null;
    if (weatherData.daily && weatherData.daily.sunset) {
      let minSunsetDiff = Infinity;
      weatherData.daily.sunset.forEach(s => {
        const diff = Math.abs(s - arrivalTimeUnix);
        if (diff < minSunsetDiff) {
          minSunsetDiff = diff;
          sunsetUnix = s;
        }
      });
    }
    const isAfterSunset = sunsetUnix && (arrivalTimeUnix > sunsetUnix);

    let sunriseUnix = null;
    if (weatherData.daily && weatherData.daily.sunrise) {
      let minSunriseDiff = Infinity;
      weatherData.daily.sunrise.forEach(s => {
        const diff = Math.abs(s - arrivalTimeUnix);
        if (diff < minSunriseDiff) {
          minSunriseDiff = diff;
          sunriseUnix = s;
        }
      });
    }

    // Doesn't spawn its own milestone card (see the rowClass note below) --
    // just queues a lightweight divider, like the existing "Day Start: Travel
    // Resumed" one, to be dropped in front of whichever card renders next so
    // the user still sees when dusk/dawn actually happened along the route.
    if (lastIsAfterSunset !== null && isAfterSunset !== lastIsAfterSunset) {
      const transitionUnix = isAfterSunset ? sunsetUnix : sunriseUnix;
      pendingDaylightDivider = {
        isNight: isAfterSunset,
        timeLabel: transitionUnix ? formatLocalClock(transitionUnix, utcOffsetSeconds) : null,
        timeUnix: transitionUnix
      };
    }
    lastIsAfterSunset = isAfterSunset;

    const angleDiff = Math.abs(windDir - wp.bearing);
    const relativeAngleRad = (angleDiff * Math.PI) / 180;
    const headwindComponent = windSpeed * Math.cos(relativeAngleRad);
    const crosswindComponent = Math.abs(windSpeed * Math.sin(relativeAngleRad));

    const dragCoefficient = Math.round((activeVehicle.baseDrag + Math.max(0, headwindComponent * 0.003)) * 100) / 100;

    const crosswindRatio = crosswindComponent / activeVehicle.crosswindLimit;
    const stabilityIndex = Math.max(0, Math.round(activeVehicle.baseStability - (crosswindRatio * 45)));

    const rainPenalty = (precipProb / 100) * 35;
    const exposureMargin = Math.max(0, Math.round(100 - (rainPenalty + (crosswindRatio * 35))));

    if (stabilityIndex < minStability) minStability = stabilityIndex;
    if (exposureMargin < minExposure) minExposure = exposureMargin;
    totalDrag += dragCoefficient;

    let rowClass = '';
    let statusText = (vehicleKey === 'car' || vehicleKey === 'jeep') ? 'Clear Drive' : 'Smooth Riding';

    if (crosswindComponent >= activeVehicle.crosswindLimit || precipProb >= activeVehicle.precipLimit) {
      rowClass = 'td-error';
      statusText = 'High Wind Alert';
    } else if (crosswindComponent >= activeVehicle.crosswindLimit * 0.7 || precipProb >= activeVehicle.precipLimit * 0.7 || isHighAltitudeCold) {
      rowClass = 'td-warning';
      statusText = 'Plan Ahead';
    }
    // Note: isAfterSunset is deliberately NOT one of the rowClass triggers above.
    // rowClass drives isNewHazard/isHazardCleared below, which synthesizes a whole
    // new milestone card at the transition point -- fine for a real weather/wind
    // hazard appearing or clearing, but sunset/sunrise happens on every single trip
    // and was spawning a "Plan Ahead" card at dusk and a "Conditions Cleared" card
    // at dawn with nothing else notable at either point. isAfterSunset still does its
    // other two jobs below: it adds a "Night Travel Alert" badge to whatever cards
    // legitimately render (origin/destination/logistical stops/real hazards) and
    // darkens those cards' styling -- so the info isn't lost, it just no longer
    // manufactures its own standalone cards.

    const isOrigin = idx === 0;
    const isDestination = idx === finalWaypoints.length - 1;
    const isLogistical = wp.isLogistical;
    const isNewHazard = (rowClass !== '' && rowClass !== lastHazardState);
    const isHazardCleared = (rowClass === '' && lastHazardState !== '');
    lastHazardState = rowClass;
    const shouldRender = isOrigin || isDestination || isLogistical || isNewHazard || isHazardCleared;

    let cityName = wp.cityName;
    if (shouldRender && !cityName) {
      cityName = await reverseGeocode(lat, lon) || "Unknown Location";
      wp.cityName = cityName;
    }
    if (!cityName) {
      cityName = wp.cityName || wp.defaultCity || `Waypoint #${idx + 1}`;
    }

    // Informational speed-limit lookup (see findSpeedLimitAtPoint in
    // geo-utils.js) -- does not touch the ETA math, which still runs on the
    // single flat avg-speed value. wp.speedLimitInfo === undefined means "not
    // looked up yet"; null is a legitimate "nothing found" result, so only
    // fetch once per waypoint either way.
    if (shouldRender && wp.speedLimitInfo === undefined) {
      wp.speedLimitInfo = await findSpeedLimitAtPoint(lat, lon).catch(() => null);
    }

    // Grade-based fuel pricing for any stop where a top-off actually happens:
    // dedicated Fuel Stops (which went through the station search in
    // trip-logistics.js and have wp.coord snapped to a real station) and
    // rest/meal stops with "top off" enabled (which already sit at a real,
    // chosen location, so no separate station search is needed for those).
    // Reuses the "City, ST" string reverseGeocode already resolved above
    // instead of a second call.
    if (((wp.mergedTypes || [wp.logisticalType]).includes('fuel') || wp.toppedOff) && !wp.fuelPriceQuote) {
      const stateMatch = /,\s*([A-Z]{2})\s*$/.exec(cityName || '');
      const stateCode = stateMatch ? stateMatch[1] : '';
      const quote = await fetchFuelPrice(stateCode, fuelGrade);
      wp.fuelPriceQuote = quote;
      const gallons = estimatedMpg > 0 ? (wp.milesSinceLastRefuel || 0) / estimatedMpg : 0;
      wp.fuelGallons = Math.max(0, gallons);
      wp.fuelCost = wp.fuelGallons * quote.price;
    }

    // Nearby dining for Meal Stops is already resolved in trip-logistics.js
    // (findMealStopDining walked back along the route to the nearest mile
    // with real options before this waypoint was ever created) --
    // wp.nearbyRestaurants is always an array (possibly empty) by the time a
    // meal waypoint reaches this loop.

    let cardTitle = cityName;
    let badgeText = statusText;
    let milestoneBadgeClass = 'badge-success';
    if (rowClass === 'td-warning') milestoneBadgeClass = 'badge-warn';
    if (rowClass === 'td-error') milestoneBadgeClass = 'badge-error';
    let finalRowClass = rowClass;

    if (isHazardCleared && !wp.isLogistical) {
      badgeText = 'Conditions Cleared';
      milestoneBadgeClass = 'badge-success';
    }

    if (wp.isLogistical) {
      if (cityName === wp.defaultCity || cityName === 'Unknown Location') {
        cardTitle = `${wp.defaultCity} (Highway Route)`;
      } else {
        cardTitle = `${wp.defaultCity} (${cityName})`;
      }
      badgeText = 'Action Required';
      milestoneBadgeClass = wp.logisticalType === 'fuel' ? 'badge-error' : 'badge-warn';
      if (wp.logisticalType === 'layover') {
        badgeText = '🛏️ Overnight Layover';
        milestoneBadgeClass = 'badge-layover';
        finalRowClass = 'td-layover';
      } else {
        if (finalRowClass === '') {
          finalRowClass = wp.logisticalType === 'fuel' ? 'td-error' : 'td-warning';
        }
      }
    }

    const card = document.createElement('div');
    card.classList.add('milestone-card');
    if (finalRowClass) {
      card.classList.add(finalRowClass);
    }

    if (isAfterSunset) {
      card.style.setProperty('background', 'rgba(15, 23, 42, 0.7)', 'important');
      card.style.setProperty('border-color', 'rgba(56, 189, 248, 0.2)', 'important');
    }

    const needsRefuel = (wp.mergedTypes || [wp.logisticalType]).includes('fuel') || wp.toppedOff;

    const cardHeader = document.createElement('div');
    cardHeader.classList.add('milestone-header');

    const milestoneInfo = document.createElement('div');
    milestoneInfo.classList.add('milestone-info');

    const badgeSpan = document.createElement('span');
    badgeSpan.classList.add('milestone-badge');
    badgeSpan.textContent = `#${displayCounter}`;

    const titleH3 = document.createElement('h3');
    titleH3.classList.add('milestone-title');
    titleH3.textContent = cardTitle;

    milestoneInfo.appendChild(badgeSpan);
    milestoneInfo.appendChild(titleH3);

    const badgesContainer = document.createElement('div');
    badgesContainer.style.display = 'flex';
    badgesContainer.style.gap = '0.5rem';
    badgesContainer.style.alignItems = 'center';
    badgesContainer.style.flexWrap = 'wrap';

    if (wp.logisticalType === 'layover') {
      const b = document.createElement('span');
      b.classList.add('badge', 'badge-error');
      b.style.background = 'rgba(239, 68, 68, 0.15)';
      b.style.color = '#ef4444';
      b.style.borderColor = 'rgba(239, 68, 68, 0.25)';
      b.textContent = '⏱️ Curfew Boundary';
      badgesContainer.appendChild(b);
    }

    if (wp.toppedOff) {
      const b = document.createElement('span');
      b.classList.add('badge', 'badge-success');
      b.style.background = 'rgba(16, 185, 129, 0.15)';
      b.style.color = '#34d399';
      b.style.borderColor = 'rgba(16, 185, 129, 0.25)';
      b.textContent = '⛽ Tank Topped Off';
      badgesContainer.appendChild(b);
    }
    if (isAfterSunset) {
      const b = document.createElement('span');
      b.classList.add('badge', 'badge-warn');
      b.textContent = 'Night Travel Alert';
      badgesContainer.appendChild(b);
    }
    if (hasSunburnWarning) {
      const b = document.createElement('span');
      b.classList.add('badge', 'badge-warn');
      b.style.background = 'rgba(245, 158, 11, 0.15)';
      b.style.color = 'var(--accent-orange)';
      b.style.borderColor = 'rgba(245, 158, 11, 0.25)';
      b.textContent = 'Sunburn Warning';
      badgesContainer.appendChild(b);
    }
    if (hasLowVisibility) {
      const b = document.createElement('span');
      b.classList.add('badge', 'badge-error');
      b.style.background = 'rgba(239, 68, 68, 0.15)';
      b.style.color = 'var(--accent-red)';
      b.style.borderColor = 'rgba(239, 68, 68, 0.25)';
      b.textContent = 'Low Visibility Alert';
      badgesContainer.appendChild(b);
    }
    if (hasSevereStorm) {
      const b = document.createElement('span');
      b.classList.add('badge', 'badge-error');
      b.style.background = 'rgba(239, 68, 68, 0.15)';
      b.style.color = 'var(--accent-red)';
      b.style.borderColor = 'rgba(239, 68, 68, 0.25)';
      b.textContent = 'Severe Storm Potential';
      badgesContainer.appendChild(b);
    }
    if (isHighAltitudeCold) {
      const b = document.createElement('span');
      b.classList.add('badge', 'badge-error');
      b.textContent = 'Cold Altitude Warning';
      badgesContainer.appendChild(b);
    }

    const actionBadge = document.createElement('span');
    actionBadge.classList.add('badge');
    actionBadge.classList.add(milestoneBadgeClass);
    actionBadge.textContent = badgeText;
    badgesContainer.appendChild(actionBadge);

    cardHeader.appendChild(milestoneInfo);
    cardHeader.appendChild(badgesContainer);

    const cardDetails = document.createElement('div');
    cardDetails.classList.add('milestone-details');

    function addDetail(label, val) {
      const group = document.createElement('div');
      group.classList.add('detail-group');
      const lblSpan = document.createElement('span');
      lblSpan.classList.add('detail-label');
      lblSpan.textContent = label;
      const valSpan = document.createElement('span');
      valSpan.classList.add('detail-val');
      valSpan.textContent = val;
      group.appendChild(lblSpan);
      group.appendChild(valSpan);
      cardDetails.appendChild(group);
    }

    const displayDistance = (wp.distanceMiles * distMultiplier).toFixed(1);
    const displayTemp = tempVal;
    const displayElevation = isMetric ? Math.round(wp.elevationFeet / 3.28084) : elevationFeet;
    const elevationUnit = isMetric ? 'm' : 'Ft';

    addDetail('Estimated Arrival', timeStr);
    addDetail('Distance Travelled', `${displayDistance} ${isMetric ? 'Kilometers' : 'Miles'}`);
    addDetail('Expected Temp', `${displayTemp}${tempLabel}`);
    addDetail('Elevation', `${displayElevation} ${elevationUnit}`);
    if (wp.speedLimitInfo) {
      const sl = wp.speedLimitInfo;
      const label = sl.source === 'posted' ? 'Posted Speed Limit' : 'Typical Speed Limit (est.)';
      const slDisplay = isMetric ? Math.round(sl.mph * 1.60934) : sl.mph;
      addDetail(label, `${slDisplay} ${speedLabel} (${highwayClassLabel(sl.highwayClass)})`);
    }
    addDetail('Wind Condition', `${windSpeed} ${speedLabel} (Dir: ${windDir}°)`);
    addDetail('Precip Probability', `${precipProb}%`);

    if ((wp.mergedTypes || [wp.logisticalType]).includes('layover')) {
      const noticeGroup = document.createElement('div');
      noticeGroup.classList.add('detail-group');
      noticeGroup.style.gridColumn = 'span 2';
      noticeGroup.style.borderTop = '1px dashed rgba(255, 255, 255, 0.05)';
      noticeGroup.style.paddingTop = '0.5rem';
      noticeGroup.style.marginTop = '0.5rem';

      const noticeLabel = document.createElement('span');
      noticeLabel.classList.add('detail-label');
      noticeLabel.style.color = '#818cf8';
      noticeLabel.textContent = 'Advisor Notice';

      const noticeVal = document.createElement('span');
      noticeVal.classList.add('detail-val');
      noticeVal.style.color = '#ffffff';
      noticeVal.style.fontWeight = '500';
      noticeVal.textContent = 'Travel curfew reached. Route calculations paused until morning departure.';

      noticeGroup.appendChild(noticeLabel);
      noticeGroup.appendChild(noticeVal);
      cardDetails.appendChild(noticeGroup);
    }

    if (needsRefuel && !(wp.mergedTypes || [wp.logisticalType]).includes('layover')) {
      const actionGroup = document.createElement('div');
      actionGroup.classList.add('detail-group');
      actionGroup.style.gridColumn = 'span 2';
      actionGroup.style.borderTop = '1px dashed rgba(255, 255, 255, 0.05)';
      actionGroup.style.paddingTop = '0.5rem';
      actionGroup.style.marginTop = '0.5rem';

      const actionLabel = document.createElement('span');
      actionLabel.classList.add('detail-label');
      actionLabel.style.color = 'var(--accent-orange)';
      actionLabel.textContent = 'Logistics Action';

      const actionVal = document.createElement('span');
      actionVal.classList.add('detail-val');
      actionVal.style.color = '#ffffff';
      actionVal.style.fontWeight = '600';
      actionVal.textContent = 'Action: Refill fuel tank to maximum capacity.';

      actionGroup.appendChild(actionLabel);
      actionGroup.appendChild(actionVal);
      cardDetails.appendChild(actionGroup);
    }

    if ((wp.mergedTypes || [wp.logisticalType]).includes('fuel') || wp.toppedOff) {
      const priceGroup = document.createElement('div');
      priceGroup.classList.add('detail-group');
      priceGroup.style.gridColumn = 'span 2';
      priceGroup.style.borderTop = '1px dashed rgba(255, 255, 255, 0.05)';
      priceGroup.style.paddingTop = '0.5rem';
      priceGroup.style.marginTop = '0.5rem';

      const priceLabel = document.createElement('span');
      priceLabel.classList.add('detail-label');
      priceLabel.style.color = 'var(--accent-orange)';
      priceLabel.textContent = 'Estimated Fill-Up';

      const priceVal = document.createElement('span');
      priceVal.classList.add('detail-val');
      priceVal.style.color = '#ffffff';
      priceVal.style.fontWeight = '600';

      if (!wp.fuelPriceQuote) {
        priceVal.textContent = 'Price estimate unavailable for this stop.';
      } else {
        const quote = wp.fuelPriceQuote;
        const gradeLabelMap = { regular: 'Regular Unleaded', premium: 'Premium Unleaded', diesel: 'Diesel' };
        const gradeLabel = gradeLabelMap[quote.grade] || quote.grade;
        let line = `${wp.fuelGallons.toFixed(1)} gal @ ${currencySymbol}${quote.price.toFixed(2)}/gal (${gradeLabel}, ${quote.areaLabel}) = ${currencySymbol}${wp.fuelCost.toFixed(2)}`;
        if (wp.stationFound && wp.stationName && wp.stationName !== 'Gas Station') {
          line += ` — near ${wp.stationName}`;
        }
        priceVal.textContent = line;

        const notes = [];
        if ((wp.mergedTypes || [wp.logisticalType]).includes('fuel') && !wp.stationFound) {
          notes.push('No mapped gas station confirmed near this stop — price is a regional estimate for this area, not a specific pump.');
        }
        if (quote.usedFallbackGrade) {
          notes.push(`${gradeLabelMap[quote.requestedGrade] || quote.requestedGrade} pricing wasn't available for this area — showing Regular Unleaded as an estimate instead.`);
        } else if (quote.source === 'default_estimate') {
          notes.push('Live price data unavailable — showing a national default estimate.');
        }

        notes.forEach(noteText => {
          const noteEl = document.createElement('div');
          noteEl.style.color = 'var(--text-muted)';
          noteEl.style.fontSize = '0.75rem';
          noteEl.style.marginTop = '0.15rem';
          noteEl.textContent = noteText;
          priceVal.appendChild(noteEl);
        });
      }

      priceGroup.appendChild(priceLabel);
      priceGroup.appendChild(priceVal);
      cardDetails.appendChild(priceGroup);
    }

    if ((wp.mergedTypes || [wp.logisticalType]).includes('meal')) {
      const diningGroup = document.createElement('div');
      diningGroup.classList.add('detail-group');
      diningGroup.style.gridColumn = 'span 2';
      diningGroup.style.borderTop = '1px dashed rgba(255, 255, 255, 0.05)';
      diningGroup.style.paddingTop = '0.5rem';
      diningGroup.style.marginTop = '0.5rem';

      const diningLabel = document.createElement('span');
      diningLabel.classList.add('detail-label');
      diningLabel.style.color = 'var(--accent-orange)';
      diningLabel.textContent = 'Nearby Dining Options';

      const diningVal = document.createElement('span');
      diningVal.classList.add('detail-val');
      diningVal.style.color = '#ffffff';

      const restaurants = wp.nearbyRestaurants || [];
      if (wp.restaurantSearchSkipped) {
        diningVal.style.fontWeight = '500';
        diningVal.textContent = 'Restaurant search skipped — enable "Find Nearby Restaurants" to search.';
      } else if (restaurants.length === 0) {
        diningVal.style.fontWeight = '500';
        diningVal.textContent = 'No mapped restaurants found within 5 miles of this stop or the 50 miles before it — check ahead or bring provisions.';
      } else {
        diningVal.style.fontWeight = '600';
        restaurants.forEach(r => {
          const row = document.createElement('div');
          row.style.marginTop = '0.2rem';
          const distDisplay = (r.distanceMiles * distMultiplier).toFixed(1);
          const cuisineStr = r.cuisine ? ` — ${r.cuisine}` : '';
          row.textContent = `${r.name}${cuisineStr} (${distDisplay} ${isMetric ? 'km' : 'mi'})`;
          diningVal.appendChild(row);
        });
      }

      diningGroup.appendChild(diningLabel);
      diningGroup.appendChild(diningVal);
      cardDetails.appendChild(diningGroup);
    }

    if ((wp.mergedTypes || [wp.logisticalType]).includes('layover')) {
      const lodgingGroup = document.createElement('div');
      lodgingGroup.classList.add('detail-group');
      lodgingGroup.style.gridColumn = 'span 2';
      lodgingGroup.style.borderTop = '1px dashed rgba(255, 255, 255, 0.05)';
      lodgingGroup.style.paddingTop = '0.5rem';
      lodgingGroup.style.marginTop = '0.5rem';

      const lodgingLabel = document.createElement('span');
      lodgingLabel.classList.add('detail-label');
      lodgingLabel.style.color = 'var(--accent-orange)';
      lodgingLabel.textContent = 'Nearby Lodging';

      const lodgingVal = document.createElement('span');
      lodgingVal.classList.add('detail-val');
      lodgingVal.style.color = '#ffffff';

      const hotels = wp.nearbyHotels || [];
      if (wp.lodgingSearchSkipped) {
        lodgingVal.style.fontWeight = '500';
        lodgingVal.textContent = 'Lodging search skipped — enable "Find Nearby Lodging" to search.';
      } else if (hotels.length === 0) {
        lodgingVal.style.fontWeight = '500';
        lodgingVal.textContent = 'No mapped hotels found within 10 miles of this stop or the 60 miles before it — check ahead for lodging.';
      } else {
        lodgingVal.style.fontWeight = '600';
        hotels.forEach(h => {
          const row = document.createElement('div');
          row.style.marginTop = '0.2rem';
          const distDisplay = (h.distanceMiles * distMultiplier).toFixed(1);
          const typeStr = h.lodgingType ? ` — ${h.lodgingType.replace(/_/g, ' ')}` : '';
          const starsStr = h.stars ? ` (${h.stars}★)` : '';
          row.textContent = `${h.name}${typeStr}${starsStr} (${distDisplay} ${isMetric ? 'km' : 'mi'})`;
          lodgingVal.appendChild(row);
        });
      }

      lodgingGroup.appendChild(lodgingLabel);
      lodgingGroup.appendChild(lodgingVal);
      cardDetails.appendChild(lodgingGroup);
    }

    card.appendChild(cardHeader);
    card.appendChild(cardDetails);

    if (shouldRender) {
      wp.displayCounter = displayCounter;
      wp.formattedTime = timeStr;
      wp.displayTitle = cardTitle;
      const distSinceLast = ((wp.distanceMiles - lastRenderedMile) * distMultiplier).toFixed(1);
      let icon = '📍';
      if (isOrigin) icon = '🏁';
      else if (isDestination) icon = '🎯';
      else if (wp.isLogistical) {
        if (wp.logisticalType === 'fuel') icon = '⛽';
        else if (wp.logisticalType === 'meal') icon = '🍔';
        else if (wp.logisticalType === 'layover') icon = '🛏️';
        else if (wp.logisticalType === 'rest') icon = '☕';
      } else if (isNewHazard) icon = '⚠️';
      else if (isHazardCleared) icon = '✅';

      const row = document.createElement('div');
      row.style.display = 'grid';
      row.style.gridTemplateColumns = '2fr 1fr 1fr';
      row.style.paddingBottom = '0.4rem';
      row.style.borderBottom = '1px dashed rgba(255,255,255,0.05)';
      row.style.alignItems = 'center';

      const col1 = document.createElement('span');
      col1.style.color = 'var(--text-bright)';
      col1.style.textOverflow = 'ellipsis';
      col1.style.overflow = 'hidden';
      col1.style.whiteSpace = 'nowrap';
      col1.style.paddingRight = '1rem';
      col1.appendChild(document.createTextNode(`${icon} ${displayCounter}. ${cardTitle}`));

      const col2 = document.createElement('span');
      col2.style.color = 'var(--text-muted)';
      col2.appendChild(document.createTextNode(timeStr));

      const col3 = document.createElement('span');
      col3.style.color = 'var(--primary-color)';
      col3.style.textAlign = 'right';

      const displayWpMiles = (wp.distanceMiles * distMultiplier).toFixed(1);
      const milesText = document.createTextNode(`${displayWpMiles} ${distLabel} `);
      const diffSpan = document.createElement('span');
      diffSpan.style.fontSize = '0.7rem';
      diffSpan.style.color = 'var(--text-light)';
      diffSpan.style.marginLeft = '0.25rem';
      diffSpan.appendChild(document.createTextNode(`(+${distSinceLast})`));

      col3.appendChild(milesText);
      col3.appendChild(diffSpan);

      row.appendChild(col1);
      row.appendChild(col2);
      row.appendChild(col3);

      quickItineraryContent.appendChild(row);

      lastRenderedMile = wp.distanceMiles;
      let mapMarker;
      if (wp.isLogistical) {
        let emoji = '📍';
        if (wp.logisticalType === 'fuel') emoji = '⛽';
        else if (wp.logisticalType === 'meal') emoji = '🍔';
        else if (wp.logisticalType === 'layover') emoji = '🛏️';
        else if (wp.logisticalType === 'rest') emoji = '☕';
        const customIcon = L.divIcon({
          className: 'custom-map-emoji',
          html: `<div style="font-size: 16px; text-shadow: 0 2px 4px rgba(0,0,0,0.8); line-height: 1;">${emoji}</div>`,
          iconSize: [20, 20],
          iconAnchor: [10, 10]
        });
        mapMarker = L.marker([lat, lon], { icon: customIcon });
      } else {
        let markerColor = 'var(--primary-color)';
        if (rowClass === 'td-error') markerColor = 'var(--accent-red)';
        else if (rowClass === 'td-warning') markerColor = 'var(--accent-orange)';
        mapMarker = L.circleMarker([lat, lon], { radius: 5, fillColor: '#ffffff', color: markerColor, weight: 2, fillOpacity: 0.9 });
      }
      mapMarker.addTo(map).bindPopup(`WP #${displayCounter}: ${escapeHTML(cityName)}<br>Arrival: ${timeStr}<br>Temp: ${displayTemp}${tempLabel}<br>Elevation: ${displayElevation} ${elevationUnit}<br>Wind: ${windSpeed} ${speedLabel}<br>Precip: ${precipProb}%${isAfterSunset ? '<br><b>Night Riding Alert</b>' : ''}${isHighAltitudeCold ? '<br><b>Cold Altitude Warning</b>' : ''}`);
      waypointMarkers.push(mapMarker);

      if (lastTimeZone !== null && lastTimeZone !== currentTzAbbr) {
        const divider = document.createElement('div');
        divider.classList.add('timezone-divider');
        const spanEl = document.createElement('span');
        spanEl.textContent = `⏱️ Time Zone Shift: Entering ${currentTzAbbr}`;
        divider.appendChild(spanEl);
        detailedCardsContainer.appendChild(divider);
      }

      // Both of these are "pending" flags queued from an earlier iteration
      // (possibly several unrendered sample points back) and only actually
      // dropped into the DOM here, in front of whichever card renders next.
      // They need to appear in the order the underlying events really
      // happened -- e.g. if a curfew resumes travel at 6:00 AM and sunrise
      // that same morning is at 6:17 AM, "Day Start" belongs first -- so
      // compare their real timestamps rather than always rendering daylight
      // before day-start.
      const appendDaylightDivider = () => {
        const divider = document.createElement('div');
        divider.classList.add('timezone-divider');
        const spanEl = document.createElement('span');
        const timeLabel = pendingDaylightDivider.timeLabel || 'approx. this stretch';
        spanEl.textContent = pendingDaylightDivider.isNight
          ? `🌇 Sunset (${timeLabel}): Entering Night Driving`
          : `🌄 Sunrise (${timeLabel}): Daylight Returns`;
        divider.appendChild(spanEl);
        detailedCardsContainer.appendChild(divider);
      };
      const appendDayStartDivider = () => {
        const divider = document.createElement('div');
        divider.classList.add('timezone-divider');
        const spanEl = document.createElement('span');
        spanEl.textContent = `🌅 Day Start: Travel Resumed`;
        divider.appendChild(spanEl);
        detailedCardsContainer.appendChild(divider);
      };

      if (pendingDaylightDivider && lastWasLayover) {
        // Both pending at once -- order by actual clock time when both are
        // known; if either timestamp is missing, keep the prior (daylight
        // first) behavior as a safe default rather than guessing.
        const dayStartFirst = pendingDayStartUnix != null
          && pendingDaylightDivider.timeUnix != null
          && pendingDayStartUnix <= pendingDaylightDivider.timeUnix;
        if (dayStartFirst) {
          appendDayStartDivider();
          appendDaylightDivider();
        } else {
          appendDaylightDivider();
          appendDayStartDivider();
        }
        pendingDaylightDivider = null;
        lastWasLayover = false;
        pendingDayStartUnix = null;
      } else if (pendingDaylightDivider) {
        appendDaylightDivider();
        pendingDaylightDivider = null;
      } else if (lastWasLayover) {
        appendDayStartDivider();
        lastWasLayover = false;
        pendingDayStartUnix = null;
      }

      detailedCardsContainer.appendChild(card);
      lastTimeZone = currentTzAbbr;
      displayCounter++;

      if (wp.logisticalType === 'layover') {
        lastWasLayover = true;
        pendingDayStartUnix = typeof wp.resumeAtUnix === 'number' ? wp.resumeAtUnix : null;
      }
    }
  }

  return {
    mainFragment,
    minStability,
    minExposure,
    lastWpOffsetSeconds,
    fuelCount,
    mealCount,
    restCount,
    layoverCount
  };
}
