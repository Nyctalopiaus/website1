// Cache-busting query params on these local module imports mirror the ?v= scheme
// already used on the advisor.js/advisor.css <script>/<link> tags in index.html —
// without one here, browsers can keep serving a stale cached copy of a module even
// after advisor.js's own version bumps, since each import URL is cached separately.
// Bump these alongside index.html's advisor.js?v= whenever any of these files change.
//
// advisor.js is the orchestrator for the trip-planning flow: UI wiring, map init,
// modals, and reading form inputs. The two heaviest, fastest-growing pieces of the
// scan flow live in their own modules (split out 2026-08-20 -- see project memory
// advisor_js_architecture.md):
//   - trip-logistics.js: pure simulation -- decides where fuel/rest/meal/layover
//     stops land and when the vehicle arrives at each one. No DOM access.
//   - milestone-cards.js: weather enrichment + all `.milestone-card` DOM building,
//     map markers, and timeline dividers for the finalized waypoint list.
import {
  downloadGPX,
  escapeHTML,
  getCurrencySymbol
} from './road-utils.js?v=26';
import {
  haversineDistance,
  calculateBearing,
  geocode
} from './geo-utils.js?v=30';
import { initRouteStops } from './route-stops.js?v=26';
import { initUnitCurrencyControls } from './unit-controls.js?v=26';
import { runLogisticsSimulation, createFuelPriceService } from './trip-logistics.js?v=2';
import { buildTripTimeline } from './milestone-cards.js?v=2';

document.addEventListener('DOMContentLoaded', () => {
  let elevationChart = null;

  // DOM Elements
  const startTimeInput = document.getElementById('start-time');
  const avgSpeedInput = document.getElementById('avg-speed');
  const vehicleProfile = document.getElementById('vehicle-profile');
  const btnScan = document.getElementById('btn-scan');

  const hudStability = document.getElementById('hud-stability');
  const hudExposure = document.getElementById('hud-exposure');
  const hudStops = document.getElementById('hud-stops');
  const hudDuration = document.getElementById('hud-duration');
  const routeSafetyAlert = document.getElementById('route-safety-alert');
  const btnAddStop = document.getElementById('btn-add-stop');
  const btnSwapRoute = document.getElementById('btn-swap-route');
  const routeStopsList = document.getElementById('route-stops-list');
  const scenicRouteCheckbox = document.getElementById('scenic-route');
  const avoidTollsCheckbox = document.getElementById('avoid-tolls');
  const avoidFerriesCheckbox = document.getElementById('avoid-ferries');
  const milestonesTimeline = document.getElementById('milestones-timeline');
  const stabilityLabel = document.getElementById('hud-stability-label');
  const btnPrint = document.getElementById('btn-print');

  // Trigger native browser printing of the travel itinerary
  btnPrint.addEventListener('click', () => {
    window.print();
  });

  // Dynamically update the HUD comfort title label based on selected profile & auto-fill garage parameters
  function updateComfortLabel() {
    const fuelCapacityInput = document.getElementById('fuel-capacity');
    const estimatedMpgInput = document.getElementById('estimated-mpg');

    if (vehicleProfile.value === 'motorcycle') {
      stabilityLabel.textContent = 'Exposure & Fatigue Risk (Rider)';
      if (fuelCapacityInput) fuelCapacityInput.value = '7.0';
      if (estimatedMpgInput) estimatedMpgInput.value = '40';
    } else if (vehicleProfile.value === 'jeep') {
      stabilityLabel.textContent = 'Exposure & Fatigue Risk (Driver)';
      if (fuelCapacityInput) fuelCapacityInput.value = '21.5';
      if (estimatedMpgInput) estimatedMpgInput.value = '17';
    } else {
      stabilityLabel.textContent = 'Exposure & Fatigue Risk (Driver)';
      if (fuelCapacityInput) fuelCapacityInput.value = '14.0';
      if (estimatedMpgInput) estimatedMpgInput.value = '30';
    }
  }
  vehicleProfile.addEventListener('change', updateComfortLabel);
  updateComfortLabel();

  // "Top off at Rest Stops" only has any effect if rest stops are actually
  // being scheduled -- gray it out and make it non-interactive whenever
  // "Schedule Rest Stops" is unchecked, so it doesn't look like a live,
  // independent option when it can't do anything on its own. Also uncheck it
  // at that moment if it was left checked, so a re-enable of "Schedule Rest
  // Stops" later doesn't silently resurrect a top-off setting the user never
  // consciously chose while it was live.
  const restStopsToggle = document.getElementById('enable-rest');
  const topOffRestToggle = document.getElementById('top-off-rest');
  function syncTopOffRestAvailability() {
    const restStopsEnabled = restStopsToggle.checked;
    topOffRestToggle.disabled = !restStopsEnabled;
    if (!restStopsEnabled && topOffRestToggle.checked) {
      topOffRestToggle.checked = false;
    }
    const row = topOffRestToggle.closest('.input-group');
    if (row) row.classList.toggle('control-disabled', !restStopsEnabled);
  }
  restStopsToggle.addEventListener('change', syncTopOffRestAvailability);
  syncTopOffRestAvailability();

  // Pre-populate departure time field with current local time
  const now = new Date();
  const tzoffset = now.getTimezoneOffset() * 60000;
  const localISOTime = (new Date(now - tzoffset)).toISOString().slice(0, 16);
  startTimeInput.value = localISOTime;



  // Vehicle Parameters configuration
  const vehicles = {
    car: { name: "Standard Car", baseDrag: 0.28, baseStability: 85, crosswindLimit: 35, precipLimit: 80, uvLimit: 8 },
    jeep: { name: "Jeep Rubicon", baseDrag: 0.42, baseStability: 70, crosswindLimit: 30, precipLimit: 70, uvLimit: 8 },
    motorcycle: { name: "BMW K1600B Motorcycle", baseDrag: 0.35, baseStability: 50, crosswindLimit: 20, precipLimit: 40, uvLimit: 6 }
  };

  // Map variables
  let map;
  let routePolyline = null;
  let waypointMarkers = [];
  let isScanning = false;

  // Initialize Map
  function initMap() {
    const mapEl = document.getElementById('map');
    if (!mapEl || typeof L === 'undefined') return;

    if (L.Icon && L.Icon.Default) {
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/images/marker-shadow.png'
      });
    }

    function createMap() {
      if (map) return;
      map = L.map('map', {
        zoomControl: true,
        attributionControl: false
      }).setView([45.505, -122.676], 6); // Default centered on Pacific Northwest

      // CartoDB Dark Matter layer (softer dark tile layer) with OSM fallback
      const primaryTiles = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        subdomains: 'abcd'
      });

      primaryTiles.on('tileerror', function() {
        console.warn('CartoDB basemap tiles failed to load, swapping to OpenStreetMap tiles.');
        if (map && map.hasLayer(primaryTiles)) {
          map.removeLayer(primaryTiles);
        }
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19
        }).addTo(map);
      });

      primaryTiles.addTo(map);

      if (typeof ResizeObserver !== 'undefined') {
        let resizeTimer = null;
        const resizeObserver = new ResizeObserver(() => {
          clearTimeout(resizeTimer);
          resizeTimer = setTimeout(() => {
            if (map) map.invalidateSize({ animate: false });
          }, 50);
        });
        resizeObserver.observe(mapEl);
      } else {
        window.addEventListener('resize', () => {
          if (map) map.invalidateSize({ animate: false });
        });
      }
    }

    const rect = mapEl.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      createMap();
      return;
    }

    if (typeof ResizeObserver !== 'undefined') {
      const waitObserver = new ResizeObserver((entries) => {
        const entry = entries[0];
        const w = entry.contentRect ? entry.contentRect.width : mapEl.getBoundingClientRect().width;
        const h = entry.contentRect ? entry.contentRect.height : mapEl.getBoundingClientRect().height;
        if (w > 0 && h > 0) {
          waitObserver.disconnect();
          createMap();
        }
      });
      waitObserver.observe(mapEl);
    } else {
      setTimeout(initMap, 100);
    }
  }

  function log(message) {
    const timestamp = new Date().toTimeString().split(' ')[0];
    console.log(`[${timestamp}] ${message}`);
  }

  initRouteStops({
    routeStopsList,
    btnAddStop,
    btnSwapRoute,
    log
  });

  // Main Action Trigger
  btnScan.addEventListener('click', async () => {
    if (isScanning) return;
    isScanning = true;
    btnScan.disabled = true;
    btnPrint.disabled = true;
    document.getElementById('btn-export-gpx').disabled = true;
    document.getElementById('btn-copy-itinerary').disabled = true;

    const isMetric = document.getElementById('unit-toggle').value === 'metric';
    const distLabel = isMetric ? 'km' : 'mi';
    const tempLabel = isMetric ? '°C' : '°F';
    const speedLabel = isMetric ? 'km/h' : 'mph';
    const distMultiplier = isMetric ? 1.60934 : 1;

    const currencyVal = document.getElementById('currency-toggle').value;
    const currencySymbol = getCurrencySymbol(currencyVal);

    // Reset UI displays
    hudStability.textContent = '--%';
    hudExposure.textContent = '--%';
    hudStops.textContent = '--';
    hudDuration.textContent = '--';
    document.getElementById('hud-eta-desc').textContent = 'Calculated duration & ETA';
    document.getElementById('hud-fuel-cost').textContent = `${currencySymbol}--`;
    document.getElementById('hud-health-score').textContent = 'Trip Health: --% (Pending)';
    document.getElementById('btn-copy-itinerary').textContent = '📋 Copy Itinerary';
    routeSafetyAlert.style.display = 'none';

    // Clear milestonesTimeline and create loading element securely
    milestonesTimeline.textContent = '';
    const loadingDiv = document.createElement('div');
    loadingDiv.classList.add('timeline-loading');
    const pulseSpan = document.createElement('span');
    pulseSpan.classList.add('pulse-indicator');
    loadingDiv.appendChild(pulseSpan);
    loadingDiv.appendChild(document.createTextNode(' Calculating open road milestones and downloading forecast data...'));
    milestonesTimeline.appendChild(loadingDiv);

    // Clear previous Map overlays
    if (routePolyline) {
      map.removeLayer(routePolyline);
      routePolyline = null;
    }
    waypointMarkers.forEach(m => map.removeLayer(m));
    waypointMarkers = [];

    let avgSpeed = parseFloat(avgSpeedInput.value);
    if (isMetric) {
      avgSpeed = avgSpeed / 1.60934;
    }
    const vehicleKey = vehicleProfile.value;
    const activeVehicle = vehicles[vehicleKey];

    const stopInputs = Array.from(document.querySelectorAll('.route-stop-input'));
    const allStopsText = stopInputs.map(input => input.value.trim()).filter(val => val !== '');

    if (allStopsText.length < 2 || isNaN(avgSpeed) || avgSpeed <= 0) {
      log('[ERROR] Input parameters incomplete, stops are missing, or speed is invalid.');
      alert('Please fill out at least two route stops and ensure avg speed is valid.');
      isScanning = false;
      btnScan.disabled = false;
      return;
    }

    try {
      const departureTimeUnix = Math.floor(new Date(startTimeInput.value).getTime() / 1000);

      // 1. Geocode locations in linear order
      const geocodedStops = [];
      for (let i = 0; i < allStopsText.length; i++) {
        const stopText = allStopsText[i];
        let prefix = `Stop #${i}`;
        if (i === 0) prefix = 'Origin';
        if (i === allStopsText.length - 1) prefix = 'Destination';

        log(`[SYS] Resolving Geocoding coordinates for ${prefix}: "${stopText}"...`);
        const coord = await geocode(stopText);
        log(`[SYS] ${prefix} locked: ${coord.name} (${coord.lat.toFixed(4)}, ${coord.lon.toFixed(4)})`);
        geocodedStops.push(coord);

        // Delay to respect Nominatim rate limit
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Add markers on map
      geocodedStops.forEach((stop, idx) => {
        let markerText = `Stop #${idx}: ${escapeHTML(stop.name)}`;
        let emoji = '📍';

        if (idx === 0) {
          markerText = `Origin: ${escapeHTML(stop.name)}`;
          emoji = '🟢';
        } else if (idx === geocodedStops.length - 1) {
          markerText = `Destination: ${escapeHTML(stop.name)}`;
          emoji = '🏁';
        }

        const customIcon = L.divIcon({
          className: 'custom-route-stop-icon',
          html: `<div style="font-size: 22px; filter: drop-shadow(0 2px 5px rgba(0,0,0,0.9)); line-height: 1; text-align: center;">${emoji}</div>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        });

        const stopMarker = L.marker([stop.lat, stop.lon], { icon: customIcon }).addTo(map).bindPopup(markerText);
        waypointMarkers.push(stopMarker);
      });

      // 2. Fetch Route Polyline — OSRM by default, or a routing-preference-aware
      // route via OpenRouteService when Scenic Route / Avoid Tolls / Avoid
      // Ferries is checked. That call goes through ors-directions-proxy.php
      // (same-origin, keeps the ORS key server-side) which normalizes its
      // response to the same {routes:[{geometry:{coordinates}}]} shape OSRM
      // returns below, so everything past this block works identically either
      // way. Any ORS failure (no key configured, ORS down/rate-limited, etc.)
      // silently falls back to the standard OSRM route rather than breaking
      // the scan.
      const coordsQuery = geocodedStops.map(s => `${s.lon},${s.lat}`).join(';');
      const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${coordsQuery}?overview=full&geometries=geojson`;

      const avoidFeatures = [];
      if (scenicRouteCheckbox && scenicRouteCheckbox.checked) avoidFeatures.push('highways');
      if (avoidTollsCheckbox && avoidTollsCheckbox.checked) avoidFeatures.push('tollways');
      if (avoidFerriesCheckbox && avoidFerriesCheckbox.checked) avoidFeatures.push('ferries');

      let routeJson = null;
      if (avoidFeatures.length > 0) {
        log(`[GIS] Requesting a routing-preference-aware route via OpenRouteService (avoiding: ${avoidFeatures.join(', ')})...`);
        try {
          const preferredUrl = `ors-directions-proxy.php?coords=${encodeURIComponent(coordsQuery)}&avoid=${encodeURIComponent(avoidFeatures.join(','))}`;
          const preferredResponse = await fetch(preferredUrl, { signal: AbortSignal.timeout(12000) });
          const preferredJson = await preferredResponse.json();
          if (!preferredResponse.ok || preferredJson.error) {
            throw new Error(preferredJson.error || 'Preferred-route request failed.');
          }
          if (!preferredJson.routes || preferredJson.routes.length === 0) {
            throw new Error('Preferred-route service returned no route.');
          }
          routeJson = preferredJson;
          log('[GIS] Preferred route resolved via OpenRouteService.');
        } catch (preferredError) {
          log(`[GIS] Preferred route unavailable (${preferredError.message}) — falling back to standard route.`);
          routeJson = null;
        }
      }

      if (!routeJson) {
        log('[GIS] Calculating driving route polyline via OSRM...');
        const routeResponse = await fetch(osrmUrl, { signal: AbortSignal.timeout(12000) });
        if (!routeResponse.ok) throw new Error('OSRM routing request failed.');
        routeJson = await routeResponse.json();
        if (!routeJson.routes || routeJson.routes.length === 0) throw new Error('No driving routes resolved between stops.');
      }

      const routeData = routeJson.routes[0];
      const coords = routeData.geometry.coordinates; // Array of [lon, lat]

      // Draw polyline onto map
      const latLngs = coords.map(c => [c[1], c[0]]);
      routePolyline = L.polyline(latLngs, { color: 'var(--primary-color)', weight: 4 }).addTo(map);
      map.fitBounds(routePolyline.getBounds());

      // 3. Sample Waypoints along the polyline dynamically
      const speedMps = (avgSpeed * 1609.34) / 3600;
      const targetIntervalMeters = 25 * 1609.34;
      log(`[GIS] Using hardcoded sampling interval of 25 miles...`);

      const sampledWaypoints = [];

      // Always capture the start waypoint
      sampledWaypoints.push({
        coord: coords[0],
        cumulativeMeters: 0,
        distanceMiles: 0,
        bearing: calculateBearing(coords[0], coords[1] || coords[0]),
        defaultCity: geocodedStops[0].name
      });

      let cumulativeDistance = 0;
      let lastSampledPoint = coords[0];
      // Parallel array of cumulative route distance (meters) at each coords[] index. Used by the
      // Smart Layover backtracking search below to locate any point along the actual road
      // polyline by mile marker, not just the sparsely-sampled waypoints.
      const cumulativeDistances = [0];

      for (let i = 1; i < coords.length; i++) {
        const d = haversineDistance(coords[i - 1], coords[i]);
        cumulativeDistance += d;
        cumulativeDistances.push(cumulativeDistance);

        const distFromLastSample = haversineDistance(lastSampledPoint, coords[i]);
        if (distFromLastSample >= targetIntervalMeters) {
          sampledWaypoints.push({
            coord: coords[i],
            cumulativeMeters: cumulativeDistance,
            distanceMiles: Math.round((cumulativeDistance / 1609.34) * 10) / 10,
            bearing: calculateBearing(coords[i], coords[i + 1] || coords[i]),
            defaultCity: null
          });
          lastSampledPoint = coords[i];
        }
      }

      // Always capture the final destination waypoint if not already captured
      const finalDistMiles = Math.round((cumulativeDistance / 1609.34) * 10) / 10;
      const lastWp = sampledWaypoints[sampledWaypoints.length - 1];
      if (lastWp.distanceMiles !== finalDistMiles) {
        sampledWaypoints.push({
          coord: coords[coords.length - 1],
          cumulativeMeters: cumulativeDistance,
          distanceMiles: finalDistMiles,
          bearing: lastWp.bearing,
          defaultCity: geocodedStops[geocodedStops.length - 1].name
        });
      }

      log(`[GIS] Resolved ${sampledWaypoints.length} timeline waypoints.`);

      // 3.6 Dense Elevation Profile (optional, via OpenRouteService) — samples
      // the already-drawn route polyline far more tightly than the ~25-mile
      // timeline waypoints above (those exist for weather/logistics pacing,
      // not elevation smoothness) and enriches those points with real
      // elevation via ORS's Elevation Line service. This is purely a chart
      // quality enhancement: it never touches routing, weather, or the
      // timeline waypoints/HUD/milestones themselves. Any failure (no key,
      // ORS down, response shape mismatch) just leaves the Elevation Profile
      // chart on its existing per-waypoint data, built further down from
      // finalWaypoints as before.
      let denseElevationProfile = null;
      try {
        const totalRouteMeters = cumulativeDistances[cumulativeDistances.length - 1] || 0;
        const TARGET_ELEVATION_POINTS = 200;
        if (totalRouteMeters > 0) {
          // Never denser than ~0.25 mile spacing, so a short trip doesn't
          // balloon into hundreds of near-duplicate points.
          const elevSampleIntervalMeters = Math.max(totalRouteMeters / (TARGET_ELEVATION_POINTS - 1), 400);
          const elevSamplePoints = [coords[0]];
          const elevSampleMiles = [0];
          let lastElevSampleDist = 0;
          for (let i = 1; i < coords.length; i++) {
            if (cumulativeDistances[i] - lastElevSampleDist >= elevSampleIntervalMeters) {
              elevSamplePoints.push(coords[i]);
              elevSampleMiles.push(cumulativeDistances[i] / 1609.34);
              lastElevSampleDist = cumulativeDistances[i];
            }
          }
          const lastCoordIdx = coords.length - 1;
          if (elevSamplePoints[elevSamplePoints.length - 1] !== coords[lastCoordIdx]) {
            elevSamplePoints.push(coords[lastCoordIdx]);
            elevSampleMiles.push(totalRouteMeters / 1609.34);
          }

          if (elevSamplePoints.length >= 2) {
            log(`[GIS] Requesting a ${elevSamplePoints.length}-point elevation profile via OpenRouteService...`);
            const elevCoordsQuery = elevSamplePoints.map(c => `${c[0]},${c[1]}`).join(';');
            const elevResponse = await fetch(`ors-elevation-proxy.php?coords=${encodeURIComponent(elevCoordsQuery)}`, { signal: AbortSignal.timeout(12000) });
            const elevJson = await elevResponse.json();
            if (!elevResponse.ok || elevJson.error) {
              throw new Error(elevJson.error || 'Elevation profile request failed.');
            }
            if (!Array.isArray(elevJson.coordinates) || elevJson.coordinates.length !== elevSamplePoints.length) {
              throw new Error('Elevation profile response did not match requested points.');
            }
            denseElevationProfile = elevJson.coordinates.map((c, idx) => ({
              distanceMiles: Math.round(elevSampleMiles[idx] * 10) / 10,
              elevationFeet: Math.round(c[2] * 3.28084)
            }));
            log(`[GIS] Elevation profile resolved (${denseElevationProfile.length} points).`);
          }
        }
      } catch (elevError) {
        log(`[GIS] Dense elevation profile unavailable (${elevError.message}) — using standard per-waypoint elevation chart.`);
        denseElevationProfile = null;
      }

      // 3.5 Logistics Injection Engine — reads all the trip-logistics settings
      // from the form into plain values, then hands them to
      // trip-logistics.js's runLogisticsSimulation() to decide where
      // fuel/rest/meal/layover stops land. That function is pure (no DOM
      // access) and returns the finalized, stop-merged waypoint list.
      let fuelCapacity = parseFloat(document.getElementById('fuel-capacity').value) || 12.0;
      let estimatedMpg = parseFloat(document.getElementById('estimated-mpg').value) || 30;
      let restInterval = parseFloat(document.getElementById('rest-interval').value) || 150;
      const fuelGradeSelect = document.getElementById('fuel-grade');
      const fuelGrade = fuelGradeSelect ? fuelGradeSelect.value : 'regular';

      if (isMetric) {
        // Convert metric inputs back to imperial for target simulation correctness
        fuelCapacity = fuelCapacity / 3.78541;      // Liters -> Gallons
        estimatedMpg = estimatedMpg / 0.425144;      // km/L -> MPG
        restInterval = restInterval / 1.60934;      // km -> miles
      }

      const enableRestInput = document.getElementById('enable-rest');
      const topOffRestInput = document.getElementById('top-off-rest');
      const topOffMealsInput = document.getElementById('top-off-meals');
      const findRestaurantsEnabled = document.getElementById('find-restaurants').checked;
      const fuelRange = Math.max(50, fuelCapacity * estimatedMpg);

      const enableBreakfastInput = document.getElementById('enable-breakfast');
      const enableLunchInput = document.getElementById('enable-lunch');
      const enableDinnerInput = document.getElementById('enable-dinner');
      const breakfastTimeInput = document.getElementById('breakfast-time');
      const lunchTimeInput = document.getElementById('lunch-time');
      const dinnerTimeInput = document.getElementById('dinner-time');

      const enforceCurfew = document.getElementById('enforce-curfew').checked;
      const smartLayoverEnabled = document.getElementById('smart-layover').checked;
      const findHotelsEnabled = document.getElementById('find-hotels').checked;
      const curfewStartStr = document.getElementById('curfew-start').value;
      const curfewEndStr = document.getElementById('curfew-end').value;
      const [curfewStartHour, curfewStartMin] = curfewStartStr.split(':').map(Number);
      const [curfewEndHour, curfewEndMin] = curfewEndStr.split(':').map(Number);

      const meals = [];
      if (enableBreakfastInput.checked) {
        const [h, m] = breakfastTimeInput.value.split(':').map(Number);
        meals.push({ name: 'Breakfast Stop (1 hr)', hour: h, min: m });
      }
      if (enableLunchInput.checked) {
        const [h, m] = lunchTimeInput.value.split(':').map(Number);
        meals.push({ name: 'Lunch Stop (1 hr)', hour: h, min: m });
      }
      if (enableDinnerInput.checked) {
        const [h, m] = dinnerTimeInput.value.split(':').map(Number);
        meals.push({ name: 'Dinner Stop (1 hr)', hour: h, min: m });
      }

      const finalWaypoints = await runLogisticsSimulation({
        sampledWaypoints,
        departureTimeUnix,
        speedMps,
        cumulativeDistances,
        coords,
        fuelRange,
        restInterval,
        enableRest: enableRestInput.checked,
        topOffRest: topOffRestInput.checked,
        topOffMeals: topOffMealsInput.checked,
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
      });

      // fetchFuelPrice/fuelPriceCache are created here (rather than inside
      // runLogisticsSimulation) because they're only ever used during card
      // rendering below (any stop with a top-off resolves a live price
      // quote there) -- the cache is also consulted again afterward by the
      // Fuel Budgeting step for its fallback price-per-gallon.
      const { fetchFuelPrice, cache: fuelPriceCache } = createFuelPriceService(log);

      // 4-5. Weather enrichment + milestone card/timeline rendering, plus map
      // markers -- see milestone-cards.js.
      const {
        mainFragment,
        minStability,
        minExposure,
        lastWpOffsetSeconds,
        fuelCount,
        mealCount,
        restCount,
        layoverCount
      } = await buildTripTimeline({
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
      });

      // 5. Update overall HUD display
      hudStability.textContent = `${minStability}%`;
      hudExposure.textContent = `${minExposure}%`;
      hudStops.textContent = `⛽ ${fuelCount} | 🍔 ${mealCount} | 🛏️ ${layoverCount} | ☕ ${restCount}`;

      const finalTravelTimeSeconds = finalWaypoints[finalWaypoints.length - 1].arrivalTimeUnix - departureTimeUnix;
      const durationDays = Math.floor(finalTravelTimeSeconds / 86400);
      const durationHours = Math.floor((finalTravelTimeSeconds % 86400) / 3600);
      const durationMinutes = Math.round((finalTravelTimeSeconds % 3600) / 60);
      const durationStr = durationDays > 0
        ? `${durationDays}d ${durationHours}h ${durationMinutes}m`
        : durationHours > 0
          ? `${durationHours}h ${durationMinutes}m`
          : `${durationMinutes}m`;

      const finalArrivalDate = new Date((departureTimeUnix + finalTravelTimeSeconds + lastWpOffsetSeconds) * 1000);
      let finalHours = finalArrivalDate.getUTCHours();
      const finalAmpm = finalHours >= 12 ? 'PM' : 'AM';
      finalHours = finalHours % 12;
      finalHours = finalHours ? finalHours : 12;
      const finalMins = finalArrivalDate.getUTCMinutes().toString().padStart(2, '0');
      const etaStr = `${finalHours}:${finalMins} ${finalAmpm}`;

      hudDuration.textContent = durationStr;
      document.getElementById('hud-eta-desc').textContent = `ETA: ${etaStr} (${finalArrivalDate.toLocaleDateString(undefined, {month: 'short', day: 'numeric', timeZone: 'UTC'})})`;

      // Apply HUD warning status colors
      if (minStability < 60) {
        hudStability.className = 'hud-stat-val text-red';
      } else if (minStability < 80) {
        hudStability.className = 'hud-stat-val text-orange';
      } else {
        hudStability.className = 'hud-stat-val text-cobalt';
      }

      if (minExposure < 50) {
        hudExposure.className = 'hud-stat-val text-red';
      } else if (minExposure < 75) {
        hudExposure.className = 'hud-stat-val text-orange';
      } else {
        hudExposure.className = 'hud-stat-val text-cobalt';
      }

      // 6. Formulate and display dynamic route safety alert banner securely
      routeSafetyAlert.style.display = 'block';
      routeSafetyAlert.textContent = '';
      if (minStability < 50 || minExposure < 50) {
        routeSafetyAlert.style.backgroundColor = 'var(--accent-red-dim)';
        routeSafetyAlert.style.color = 'var(--accent-red)';
        routeSafetyAlert.style.border = '1px solid rgba(248, 113, 113, 0.2)';
        const strongEl = document.createElement('strong');
        strongEl.textContent = 'Route Alert: Severe Risk. ';
        routeSafetyAlert.appendChild(strongEl);
        routeSafetyAlert.appendChild(document.createTextNode('High wind velocities or rain slick risks exceed safety limits. Dynamic stability indices fall below safe margins for your vehicle. Consider altering departure schedules or weights.'));
      } else if (minStability < 75 || minExposure < 75) {
        routeSafetyAlert.style.backgroundColor = 'var(--accent-orange-dim)';
        routeSafetyAlert.style.color = 'var(--accent-orange)';
        routeSafetyAlert.style.border = '1px solid rgba(251, 191, 36, 0.2)';
        const strongEl = document.createElement('strong');
        strongEl.textContent = 'Route Alert: Caution. ';
        routeSafetyAlert.appendChild(strongEl);
        routeSafetyAlert.appendChild(document.createTextNode('Elevated crosswinds or rain probabilities detected. Monitor wind angles and prepare for slight dynamic drag increases.'));
      } else {
        routeSafetyAlert.style.backgroundColor = 'var(--primary-dim)';
        routeSafetyAlert.style.color = 'var(--primary-color)';
        routeSafetyAlert.style.border = '1px solid rgba(96, 165, 250, 0.15)';
        const strongEl = document.createElement('strong');
        strongEl.textContent = 'Route Status: Optimal. ';
        routeSafetyAlert.appendChild(strongEl);
        routeSafetyAlert.appendChild(document.createTextNode('Atmospheric vectors suggest clear, stable travel conditions across the entire route timeline.'));
      }

      // Append compiled DocumentFragment element directly to browser tree in exactly ONE operation
      milestonesTimeline.textContent = '';
      milestonesTimeline.appendChild(mainFragment);

      // 1. Elevation Profile Chart — prefer the dense ORS-derived profile
      // (many more points, sampled independent of the sparser timeline
      // waypoints) when it resolved successfully; otherwise fall back to the
      // original per-waypoint data exactly as before.
      const usingDenseElevationProfile = !!(denseElevationProfile && denseElevationProfile.length > 0);
      const chartSource = usingDenseElevationProfile ? denseElevationProfile : finalWaypoints;
      const chartLabels = chartSource.map(wp => `${(wp.distanceMiles * distMultiplier).toFixed(1)} ${distLabel}`);
      const chartDataPoints = chartSource.map(wp => isMetric ? Math.round((wp.elevationFeet || 0) / 3.28084) : (wp.elevationFeet || 0));

      // Dynamically resolve CSS variable values for Chart.js 2D Canvas context rendering
      const computedStyle = getComputedStyle(document.body);
      const primaryColor = computedStyle.getPropertyValue('--primary-color').trim() || '#f97316';
      const textMuted = computedStyle.getPropertyValue('--text-muted').trim() || '#94a3b8';
      const textBright = computedStyle.getPropertyValue('--text-bright').trim() || '#ffffff';

      const ctx = document.getElementById('elevation-chart').getContext('2d');
      if (elevationChart) {
        elevationChart.destroy();
      }
      elevationChart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: chartLabels,
          datasets: [{
            label: isMetric ? 'Elevation (Meters)' : 'Elevation (Feet)',
            data: chartDataPoints,
            borderColor: primaryColor,
            backgroundColor: 'rgba(249, 115, 22, 0.1)',
            borderWidth: 2,
            fill: true,
            tension: 0.3,
            pointRadius: usingDenseElevationProfile ? 0 : 4,
            pointHoverRadius: usingDenseElevationProfile ? 3 : 4,
            pointBackgroundColor: primaryColor,
            pointBorderColor: textBright
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: {
              grid: { color: 'rgba(255, 255, 255, 0.08)' },
              ticks: { color: textMuted, font: { size: 10 } }
            },
            y: {
              grid: { color: 'rgba(255, 255, 255, 0.08)' },
              ticks: { color: textMuted, font: { size: 10 } }
            }
          },
          plugins: {
            legend: { display: false }
          }
        }
      });

      // 2. Fuel Budgeting — sum the real per-stop costs resolved during the timeline
      // pass above (each Fuel Stop, and each topped-off Rest/Meal Stop, already
      // fetched a live EIA price for the selected grade via fuel-price-proxy.php).
      let tripCost = 0;
      let anyEstimatedStop = false;
      const anyRealQuote = Array.from(fuelPriceCache.values()).find(q => q.source === 'EIA');
      const fallbackPricePerGallon = anyRealQuote ? anyRealQuote.price : 3.50;

      finalWaypoints.forEach(wp => {
        if (wp.logisticalType !== 'fuel' && !wp.toppedOff) return;
        if (typeof wp.fuelCost === 'number') {
          tripCost += wp.fuelCost;
        } else if (wp.milesSinceLastRefuel) {
          const gallons = estimatedMpg > 0 ? wp.milesSinceLastRefuel / estimatedMpg : 0;
          tripCost += gallons * fallbackPricePerGallon;
          anyEstimatedStop = true;
        }
      });

      document.getElementById('hud-fuel-cost').textContent = `${currencySymbol}${tripCost.toFixed(2)}${anyEstimatedStop ? '*' : ''}`;
      if (anyEstimatedStop) {
        log('[FUEL] * At least one stop had no resolved price and used a flat fallback estimate in the total above.');
      }

      // 3. Trip Health Score
      const healthScore = Math.round((minStability + minExposure) / 2);
      let healthStatus = 'Optimal';
      if (healthScore < 50) {
        healthStatus = 'Severe Risk';
      } else if (healthScore < 75) {
        healthStatus = 'Caution';
      }
      document.getElementById('hud-health-score').textContent = `Trip Health: ${healthScore}% (${healthStatus})`;

      // 4. GPX Export
      const btnExportGPX = document.getElementById('btn-export-gpx');
      btnExportGPX.disabled = false;

      const newBtnExportGPX = btnExportGPX.cloneNode(true);
      btnExportGPX.parentNode.replaceChild(newBtnExportGPX, btnExportGPX);
      newBtnExportGPX.addEventListener('click', () => {
        downloadGPX(finalWaypoints);
      });

      // 5. Copy Itinerary
      const btnCopyItinerary = document.getElementById('btn-copy-itinerary');
      btnCopyItinerary.disabled = false;

      const newBtnCopyItinerary = btnCopyItinerary.cloneNode(true);
      btnCopyItinerary.parentNode.replaceChild(newBtnCopyItinerary, btnCopyItinerary);
      newBtnCopyItinerary.addEventListener('click', () => {
        let text = "";
        finalWaypoints.forEach((wp) => {
          if (wp.displayCounter) {
            const distVal = (wp.distanceMiles * distMultiplier).toFixed(1);
            text += `Stop ${wp.displayCounter}: ${wp.displayTitle} - ETA: ${wp.formattedTime} - Dist: ${distVal} ${distLabel}\n`;
          }
        });
        navigator.clipboard.writeText(text).then(() => {
          newBtnCopyItinerary.textContent = "✅ Copied!";
          setTimeout(() => {
            newBtnCopyItinerary.textContent = "📋 Copy Itinerary";
          }, 2000);
        }).catch(err => {
          console.error("Clipboard copy failed: ", err);
        });
      });

      log('[SYS] ATMOSPHERIC DECODING COMPLETED.');
      btnPrint.disabled = false;

    } catch (err) {
      log(`[ERROR] SCAN TRIGGER EXCEPTION: ${err.message}`);
      milestonesTimeline.textContent = '';
      const errorDiv = document.createElement('div');
      errorDiv.classList.add('timeline-error');
      errorDiv.textContent = 'Failed to resolve route advisor metrics. Please verify address details and try again.';
      milestonesTimeline.appendChild(errorDiv);
    } finally {
      isScanning = false;
      btnScan.disabled = false;
    }
  });

  // Init Leaflet map on load
  initMap();

  // Resize Chart.js when Elevation Profile is toggled open to fix layout bugs inside details
  const elevationDetails = document.querySelector('.elevation-panel details');
  if (elevationDetails) {
    elevationDetails.addEventListener('toggle', (e) => {
      if (e.target.open && elevationChart) {
        setTimeout(() => {
          elevationChart.resize();
        }, 50);
      }
    });
  }

  // Unit and currency control wiring (no cross-selection side effects)
  initUnitCurrencyControls({
    unitToggle: document.getElementById('unit-toggle'),
    currencyToggle: document.getElementById('currency-toggle'),
    labels: {
      labelSpeed: document.getElementById('label-avg-speed'),
      labelCapacity: document.getElementById('label-fuel-capacity'),
      labelMpg: document.getElementById('label-estimated-mpg'),
      labelRest: document.getElementById('label-rest-interval')
    },
    inputs: {
      inputSpeed: document.getElementById('avg-speed'),
      inputCapacity: document.getElementById('fuel-capacity'),
      inputMpg: document.getElementById('estimated-mpg'),
      inputRest: document.getElementById('rest-interval')
    },
    hudFuelCost: document.getElementById('hud-fuel-cost')
  });

  // Quick Start Modal Toggle
  const btnOpenQuickstart = document.getElementById('btn-open-quickstart');
  const quickstartModal = document.getElementById('quickstart-modal');
  const btnCloseQuickstart = document.getElementById('btn-close-quickstart');

  if (btnOpenQuickstart && quickstartModal) {
    const openQsModal = () => {
      quickstartModal.style.display = 'flex';
      quickstartModal.classList.remove('hidden');
      quickstartModal.setAttribute('aria-hidden', 'false');
    };
    const closeQsModal = () => {
      quickstartModal.style.display = 'none';
      quickstartModal.classList.add('hidden');
      quickstartModal.setAttribute('aria-hidden', 'true');
    };

    btnOpenQuickstart.addEventListener('click', openQsModal);
    if (btnCloseQuickstart) btnCloseQuickstart.addEventListener('click', closeQsModal);
    quickstartModal.addEventListener('click', (e) => {
      if (e.target === quickstartModal) closeQsModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !quickstartModal.classList.contains('hidden')) {
        closeQsModal();
      }
    });
  }

  // Features Modal Toggle
  const btnOpenFeatures = document.getElementById('btn-open-features');
  const featuresModal = document.getElementById('features-modal');
  const btnCloseFeatures = document.getElementById('btn-close-features');

  if (btnOpenFeatures && featuresModal) {
    const openFeaturesModal = () => {
      featuresModal.style.display = 'flex';
      featuresModal.classList.remove('hidden');
      featuresModal.setAttribute('aria-hidden', 'false');
    };
    const closeFeaturesModal = () => {
      featuresModal.style.display = 'none';
      featuresModal.classList.add('hidden');
      featuresModal.setAttribute('aria-hidden', 'true');
    };

    btnOpenFeatures.addEventListener('click', openFeaturesModal);
    if (btnCloseFeatures) btnCloseFeatures.addEventListener('click', closeFeaturesModal);
    featuresModal.addEventListener('click', (e) => {
      if (e.target === featuresModal) closeFeaturesModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !featuresModal.classList.contains('hidden')) {
        closeFeaturesModal();
      }
    });
  }

  const btnBackToTop = document.getElementById('btn-back-to-top');
  if (btnBackToTop) {
    const updateBackToTopVisibility = () => {
      const shouldShow = window.scrollY > 520;
      btnBackToTop.classList.toggle('is-visible', shouldShow);
    };

    btnBackToTop.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    window.addEventListener('scroll', updateBackToTopVisibility, { passive: true });
    window.addEventListener('resize', updateBackToTopVisibility, { passive: true });
    updateBackToTopVisibility();
  }
});
