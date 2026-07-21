import {
  calculateTripCost,
  downloadGPX,
  escapeHTML,
  getCurrencySymbol
} from './road-utils.js';
import {
  haversineDistance,
  calculateBearing,
  geocode,
  reverseGeocode,
  getCustomMealCrossing,
  fetchOSRMRoute
} from './geo-utils.js';
import { initRouteStops } from './route-stops.js';
import { initUnitCurrencyControls } from './unit-controls.js';

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
    map = L.map('map', {
      zoomControl: true,
      attributionControl: false
    }).setView([45.505, -122.676], 6); // Default centered on Pacific Northwest

    // CartoDB Dark Matter layer (softer dark tile layer)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19
    }).addTo(map);

    const resizeObserver = new ResizeObserver(() => {
      if (map) map.invalidateSize();
    });
    resizeObserver.observe(document.getElementById('map'));
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

    // Create main fragment for milestonesTimeline to batch DOM operations
    const mainFragment = document.createDocumentFragment();

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
        let markerText = `Stop #${idx}: ${stop.name}`;
        if (idx === 0) markerText = `Origin: ${stop.name}`;
        if (idx === geocodedStops.length - 1) markerText = `Destination: ${stop.name}`;

        const stopMarker = L.marker([stop.lat, stop.lon]).addTo(map).bindPopup(markerText);
        waypointMarkers.push(stopMarker);
      });

      // 2. Fetch OSRM Route Polyline
      log('[GIS] Calculating driving route polyline via OSRM...');
      const coordsQuery = geocodedStops.map(s => `${s.lon},${s.lat}`).join(';');
      const routeUrl = `https://router.project-osrm.org/route/v1/driving/${coordsQuery}?overview=full&geometries=geojson`;
      const routeResponse = await fetch(routeUrl);
      if (!routeResponse.ok) throw new Error('OSRM routing request failed.');
      const routeJson = await routeResponse.json();
      if (!routeJson.routes || routeJson.routes.length === 0) throw new Error('No driving routes resolved between stops.');
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

      for (let i = 1; i < coords.length; i++) {
        const d = haversineDistance(coords[i - 1], coords[i]);
        cumulativeDistance += d;

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

      // 3.5 Logistics Injection Engine
      let fuelCapacity = parseFloat(document.getElementById('fuel-capacity').value) || 12.0;
      let estimatedMpg = parseFloat(document.getElementById('estimated-mpg').value) || 30;
      let restInterval = parseFloat(document.getElementById('rest-interval').value) || 150;

      if (isMetric) {
        // Convert metric inputs back to imperial for target simulation correctness
        fuelCapacity = fuelCapacity / 3.78541;      // Liters -> Gallons
        estimatedMpg = estimatedMpg / 0.425144;      // km/L -> MPG
        restInterval = restInterval / 1.60934;      // km -> miles
      }
      
      const enableRestInput = document.getElementById('enable-rest');
      const topOffRestInput = document.getElementById('top-off-rest');
      const topOffMealsInput = document.getElementById('top-off-meals');
      const fuelRange = Math.max(50, fuelCapacity * estimatedMpg);

      const enableBreakfastInput = document.getElementById('enable-breakfast');
      const enableLunchInput = document.getElementById('enable-lunch');
      const enableDinnerInput = document.getElementById('enable-dinner');
      const breakfastTimeInput = document.getElementById('breakfast-time');
      const lunchTimeInput = document.getElementById('lunch-time');
      const dinnerTimeInput = document.getElementById('dinner-time');

      const enforceCurfew = document.getElementById('enforce-curfew').checked;
      const curfewStartStr = document.getElementById('curfew-start').value;
      const curfewEndStr = document.getElementById('curfew-end').value;
      const [curfewStartHour, curfewStartMin] = curfewStartStr.split(':').map(Number);
      const [curfewEndHour, curfewEndMin] = curfewEndStr.split(':').map(Number);

      const finalWaypoints = [];
      let lastRefuelMile = 0;
      let lastRestMile = 0;
      let cumulativeDelaySeconds = 0;

      // Always push the start waypoint
      const startWp = sampledWaypoints[0];
      startWp.arrivalTimeUnix = departureTimeUnix;
      finalWaypoints.push(startWp);

      // Helper function to interpolate waypoints for logistics stops
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

      function getNextCurfewBoundaryLocalUnix(localUnix) {
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

      function getNextCurfewStartLocalUnix(localUnix) {
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

      for (let i = 1; i < sampledWaypoints.length; i++) {
        const currentWp = sampledWaypoints[i];
        let prevWp = finalWaypoints[finalWaypoints.length - 1];

        const approxOffset = getApproxTzOffset(currentWp.coord[0], prevWp.arrivalTimeUnix);

        // Process any logistical events inside this segment chronologically
        let segmentCompleted = false;
        while (!segmentCompleted) {
          const d1 = prevWp.distanceMiles;
          const d2 = currentWp.distanceMiles;
          const t1 = prevWp.arrivalTimeUnix;
          const t2 = departureTimeUnix + (currentWp.cumulativeMeters / speedMps) + cumulativeDelaySeconds;
          const approxOffset = getApproxTzOffset(currentWp.coord[0], t1);

          // Hard gate first: check curfew before any logistical event processing.
          if (enforceCurfew) {
            const localT1 = t1 + approxOffset;
            const localT2 = t2 + approxOffset;
            const nextBoundaryLocal = getNextCurfewBoundaryLocalUnix(localT1);

            if (localT2 > nextBoundaryLocal) {
              const boundaryUtc = nextBoundaryLocal - approxOffset;
              const ratio = Math.max(0, Math.min(1, (boundaryUtc - t1) / (t2 - t1)));
              const boundaryMile = d1 + ratio * (d2 - d1);

              const layoverWp = interpolateWaypoint(prevWp, currentWp, boundaryMile, 'Overnight Layover', 'layover', true);
              // Hard overwrite: layover occurs exactly at curfew-end boundary (10:00 PM local time).
              layoverWp.arrivalTimeUnix = boundaryUtc;
              // cityName will be resolved dynamically via reverse geocoding to show where the vehicle stops
              finalWaypoints.push(layoverWp);

              const resumeLocal = getNextCurfewStartLocalUnix(nextBoundaryLocal);
              const delaySeconds = Math.max(0, resumeLocal - nextBoundaryLocal);
              cumulativeDelaySeconds += delaySeconds;

              lastRefuelMile = boundaryMile;
              prevWp = layoverWp;

              log(`[CURFEW] Boundary enforced at ${(boundaryMile).toFixed(1)} miles (${curfewEndStr} local).`);
              // Stop processing this segment immediately; restart travel flow on next day.
              segmentCompleted = true;
              break;
            }
          }

          // Check event 1: Fuel Stop needed before running out (safety buffer is 15 miles before limit)
          let fuelStopMile = lastRefuelMile + fuelRange - 15;
          let hasFuelEvent = (d2 >= lastRefuelMile + fuelRange) || (fuelStopMile > d1 && fuelStopMile <= d2);
          if (fuelStopMile <= d1) {
            fuelStopMile = d1 + 0.1;
          }

          // Check event 2: Rest Stop interval
          const restStopMile = lastRestMile + restInterval;
          const hasRestEvent = enableRestInput.checked && (restStopMile > d1 && restStopMile <= d2);

          // Check event 3: Meal Stop time crossing
          let mealEvent = null;
          const mealsToTest = [];
          if (enableBreakfastInput.checked) {
            const [h, m] = breakfastTimeInput.value.split(':').map(Number);
            mealsToTest.push({ name: 'Breakfast Stop (1 hr)', hour: h, min: m });
          }
          if (enableLunchInput.checked) {
            const [h, m] = lunchTimeInput.value.split(':').map(Number);
            mealsToTest.push({ name: 'Lunch Stop (1 hr)', hour: h, min: m });
          }
          if (enableDinnerInput.checked) {
            const [h, m] = dinnerTimeInput.value.split(':').map(Number);
            mealsToTest.push({ name: 'Dinner Stop (1 hr)', hour: h, min: m });
          }

          if (t2 > t1 && mealsToTest.length > 0) {
            const crossing = getCustomMealCrossing(t1 + approxOffset, t2 + approxOffset, mealsToTest);
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
              const injectedWp = interpolateWaypoint(prevWp, currentWp, firstEvent.mile, "Fuel Stop Required", "fuel");
              injectedWp.arrivalTimeUnix = departureTimeUnix + (injectedWp.cumulativeMeters / speedMps) + cumulativeDelaySeconds;
              finalWaypoints.push(injectedWp);
              prevWp = injectedWp;
              lastRefuelMile = firstEvent.mile;
            } else if (firstEvent.type === 'rest') {
              const topOff = topOffRestInput.checked;
              const injectedWp = interpolateWaypoint(prevWp, currentWp, firstEvent.mile, "Rest Stop Required", "rest", topOff);
              injectedWp.arrivalTimeUnix = departureTimeUnix + (injectedWp.cumulativeMeters / speedMps) + cumulativeDelaySeconds;
              finalWaypoints.push(injectedWp);
              prevWp = injectedWp;
              lastRestMile = firstEvent.mile;
              if (topOff) {
                lastRefuelMile = firstEvent.mile;
              }
            } else if (firstEvent.type === 'meal') {
              const topOff = topOffMealsInput.checked;
              const injectedWp = interpolateWaypoint(prevWp, currentWp, firstEvent.mile, firstEvent.name, "meal", topOff);
              injectedWp.arrivalTimeUnix = firstEvent.timeUnix;
              finalWaypoints.push(injectedWp);
              prevWp = injectedWp;
              cumulativeDelaySeconds += 3600; // Add 1 hour delay for meal stop
              if (topOff) {
                lastRefuelMile = firstEvent.mile;
              }
            }
          }
        }

        const tArrival = departureTimeUnix + (currentWp.cumulativeMeters / speedMps) + cumulativeDelaySeconds;
        currentWp.arrivalTimeUnix = tArrival;
        finalWaypoints.push(currentWp);
      }

      log(`[LOGISTICS] Logistical pre-processor completed. Timeline contains ${finalWaypoints.length} stops.`);

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

      // Pre-calculate stops counts before fetching weather loop to lock the summary header
      finalWaypoints.forEach(wp => {
        if (wp.isLogistical) {
          if (wp.logisticalType === 'fuel') fuelCount++;
          else if (wp.logisticalType === 'rest') restCount++;
          else if (wp.logisticalType === 'meal') mealCount++;
          else if (wp.logisticalType === 'layover') layoverCount++;
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
          const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&hourly=temperature_2m,windspeed_10m,winddirection_10m,precipitation_probability,cloud_cover,uv_index,visibility,cape&windspeed_unit=${isMetric ? 'kmh' : 'mph'}&temperature_unit=${isMetric ? 'celsius' : 'fahrenheit'}&timeformat=unixtime&daily=sunset&timezone=auto`;
          try {
            const res = await fetch(weatherUrl);
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

      function createSummaryCol(label, val, color) {
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

      const totalDistanceDisplay = (totalDistanceMiles * distMultiplier).toFixed(1);
      createSummaryCol('Total Distance', `${totalDistanceDisplay} ${isMetric ? 'Kilometers' : 'Miles'}`, 'var(--primary-color)');
      createSummaryCol('Estimated Days', `${daysOfTravel} Day${daysOfTravel > 1 ? 's' : ''}`, 'var(--accent-orange)');
      createSummaryCol('Logistical Timeline', totalStopsStr, '#a5b4fc');

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
        } else if (crosswindComponent >= activeVehicle.crosswindLimit * 0.7 || precipProb >= activeVehicle.precipLimit * 0.7 || isHighAltitudeCold || isAfterSunset) {
          rowClass = 'td-warning';
          statusText = 'Plan Ahead';
        }

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

        const needsRefuel = (wp.logisticalType === 'fuel') || wp.toppedOff;
        
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
        addDetail('Wind Condition', `${windSpeed} ${speedLabel} (Dir: ${windDir}°)`);
        addDetail('Precip Probability', `${precipProb}%`);

        if (wp.logisticalType === 'layover') {
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

        if (needsRefuel && wp.logisticalType !== 'layover') {
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

          if (lastWasLayover) {
            const divider = document.createElement('div');
            divider.classList.add('timezone-divider');
            const spanEl = document.createElement('span');
            spanEl.textContent = `🌅 Day Start: Travel Resumed`;
            divider.appendChild(spanEl);
            detailedCardsContainer.appendChild(divider);
            lastWasLayover = false;
          }

          detailedCardsContainer.appendChild(card);
          lastTimeZone = currentTzAbbr;
          displayCounter++;

          if (wp.logisticalType === 'layover') {
            lastWasLayover = true;
          }
        }
      }

      // 5. Update overall HUD display
      hudStability.textContent = `${minStability}%`;
      hudExposure.textContent = `${minExposure}%`;
      hudStops.textContent = `⛽ ${fuelCount} | 🍔 ${mealCount} | 🛏️ ${layoverCount} | ☕ ${restCount}`;

      const finalTravelTimeSeconds = finalWaypoints[finalWaypoints.length - 1].arrivalTimeUnix - departureTimeUnix;
      const durationHours = Math.floor(finalTravelTimeSeconds / 3600);
      const durationMinutes = Math.round((finalTravelTimeSeconds % 3600) / 60);
      const durationStr = durationHours > 0 ? `${durationHours}h ${durationMinutes}m` : `${durationMinutes}m`;
      
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

      // 1. Elevation Profile Chart
      const chartLabels = finalWaypoints.map(wp => `${(wp.distanceMiles * distMultiplier).toFixed(1)} ${distLabel}`);
      const chartDataPoints = finalWaypoints.map(wp => isMetric ? Math.round((wp.elevationFeet || 0) / 3.28084) : (wp.elevationFeet || 0));

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
            pointRadius: 4,
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

      // 2. Fuel Budgeting
      const fuelPriceVal = parseFloat(document.getElementById('fuel-price').value) || 3.50;
      // Simulation variables are converted back to imperial, so the calculation works perfectly in the target currency
      const tripCost = calculateTripCost(totalDistanceMiles, estimatedMpg, fuelPriceVal);
      document.getElementById('hud-fuel-cost').textContent = `${currencySymbol}${tripCost.toFixed(2)}`;

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
      labelPrice: document.getElementById('label-fuel-price'),
      labelRest: document.getElementById('label-rest-interval')
    },
    inputs: {
      inputSpeed: document.getElementById('avg-speed'),
      inputCapacity: document.getElementById('fuel-capacity'),
      inputMpg: document.getElementById('estimated-mpg'),
      inputPrice: document.getElementById('fuel-price'),
      inputRest: document.getElementById('rest-interval')
    },
    hudFuelCost: document.getElementById('hud-fuel-cost')
  });
});
