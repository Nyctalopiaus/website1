/**
 * BuildRoute / Homeward Route Optimizer Module
 * Implements Haversine distance matrix, 2-Opt Traveling Salesperson Optimization,
 * OSRM live driving route geometry fetching, and real-time ETA schedule matrix calculations.
 */
class RouteOptimizer {
  // Calculate Haversine distance in miles between two lat/lng points
  haversineDistanceMiles(lat1, lon1, lat2, lon2) {
    const R = 3958.8; // Earth radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // Fallback estimate driving time in minutes based on distance & average speed (approx 35mph)
  estimateDriveTimeMins(distanceMiles) {
    const avgSpeedMph = 35;
    const timeMins = (distanceMiles / avgSpeedMph) * 60;
    return Math.max(2, Math.round(timeMins));
  }

  // Fetch real-world turn-by-turn driving route geometry & leg durations from OSRM
  async fetchOSRMRoute(waypoints) {
    if (!waypoints || waypoints.length < 2) return null;

    try {
      const coordsStr = waypoints.map(w => `${w.lng},${w.lat}`).join(';');
      const url = `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=geojson`;

      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
          const route = data.routes[0];
          // GeoJSON coordinates [lon, lat] -> Leaflet [lat, lon]
          const roadGeometry = route.geometry.coordinates.map(c => [c[1], c[0]]);
          return {
            roadGeometry: roadGeometry,
            legs: route.legs // Array of { distance: meters, duration: seconds }
          };
        }
      }
    } catch (e) {
      console.warn('OSRM routing fetch failed, falling back to direct line paths:', e);
    }
    return null;
  }

  // Calculate total tour distance of an ordered route
  calculateTotalDistance(routeStops, startLocation, loopBack) {
    if (!routeStops || routeStops.length === 0) return 0;

    let total = 0;
    let current = startLocation;

    for (const stop of routeStops) {
      total += this.haversineDistanceMiles(current.lat, current.lng, stop.lat, stop.lng);
      current = stop;
    }

    if (loopBack) {
      total += this.haversineDistanceMiles(current.lat, current.lng, startLocation.lat, startLocation.lng);
    }

    return parseFloat(total.toFixed(1));
  }

  // Nearest-Neighbor + 2-Opt TSP Optimization
  optimizeRoute(startLocation, rawStops, loopBack = false) {
    if (!rawStops || rawStops.length <= 1) {
      return rawStops ? [...rawStops] : [];
    }

    // Step 1: Nearest Neighbor Initial Ordering
    let unvisited = [...rawStops];
    let route = [];
    let current = startLocation;

    while (unvisited.length > 0) {
      let nearestIdx = 0;
      let minDistance = Infinity;

      for (let i = 0; i < unvisited.length; i++) {
        const dist = this.haversineDistanceMiles(current.lat, current.lng, unvisited[i].lat, unvisited[i].lng);
        if (dist < minDistance) {
          minDistance = dist;
          nearestIdx = i;
        }
      }

      const nextStop = unvisited.splice(nearestIdx, 1)[0];
      route.push(nextStop);
      current = nextStop;
    }

    // Step 2: 2-Opt Optimization Refinement
    let improved = true;
    let maxIterations = 50;
    let iteration = 0;

    while (improved && iteration < maxIterations) {
      improved = false;
      iteration++;

      for (let i = 0; i < route.length - 1; i++) {
        for (let k = i + 1; k < route.length; k++) {
          const currentDist = this.calculateTotalDistance(route, startLocation, loopBack);

          const newRoute = [
            ...route.slice(0, i),
            ...route.slice(i, k + 1).reverse(),
            ...route.slice(k + 1)
          ];

          const newDist = this.calculateTotalDistance(newRoute, startLocation, loopBack);

          if (newDist < currentDist - 0.01) {
            route = newRoute;
            improved = true;
          }
        }
      }
    }

    return route;
  }

  // Compute Full ETA Schedule Matrix using OSRM Driving Data (with Haversine fallback)
  async computeScheduleMatrixAsync(startLocation, orderedStops, loopBack, stayDurationMins, startTime = new Date()) {
    if (!startLocation || !orderedStops || orderedStops.length === 0) {
      return this.computeScheduleMatrix(startLocation, orderedStops, loopBack, stayDurationMins, startTime);
    }

    // Prepare list of waypoints for OSRM
    const waypoints = [startLocation, ...orderedStops];
    if (loopBack) waypoints.push(startLocation);

    // Fetch OSRM Road Driving Route Geometry & Leg Data
    const osrmData = await this.fetchOSRMRoute(waypoints);

    let currentPoint = startLocation;
    let currentTime = new Date(startTime.getTime());
    let totalDriveMins = 0;
    let totalDistanceMiles = 0;
    const schedule = [];

    for (let index = 0; index < orderedStops.length; index++) {
      const stop = orderedStops[index];
      let legDist = 0;
      let legDriveMins = 0;

      if (osrmData && osrmData.legs && osrmData.legs[index]) {
        const leg = osrmData.legs[index];
        legDist = leg.distance * 0.000621371; // meters to miles
        legDriveMins = Math.max(1, Math.round(leg.duration / 60)); // seconds to minutes
      } else {
        legDist = this.haversineDistanceMiles(currentPoint.lat, currentPoint.lng, stop.lat, stop.lng);
        legDriveMins = this.estimateDriveTimeMins(legDist);
      }

      totalDistanceMiles += legDist;
      totalDriveMins += legDriveMins;

      const arrivalTime = new Date(currentTime.getTime() + legDriveMins * 60000);
      const departureTime = new Date(arrivalTime.getTime() + stayDurationMins * 60000);

      schedule.push({
        stopIndex: index + 1,
        stopData: stop,
        legDistanceMiles: parseFloat(legDist.toFixed(1)),
        legDriveMins: legDriveMins,
        arrivalTime: arrivalTime,
        departureTime: departureTime,
        stayMins: stayDurationMins,
        formattedArrival: this.formatTime(arrivalTime),
        formattedDeparture: this.formatTime(departureTime)
      });

      currentPoint = stop;
      currentTime = departureTime;
    }

    let returnLeg = null;
    if (loopBack && orderedStops.length > 0) {
      const returnIndex = orderedStops.length;
      let returnDist = 0;
      let returnDriveMins = 0;

      if (osrmData && osrmData.legs && osrmData.legs[returnIndex]) {
        const leg = osrmData.legs[returnIndex];
        returnDist = leg.distance * 0.000621371;
        returnDriveMins = Math.max(1, Math.round(leg.duration / 60));
      } else {
        returnDist = this.haversineDistanceMiles(currentPoint.lat, currentPoint.lng, startLocation.lat, startLocation.lng);
        returnDriveMins = this.estimateDriveTimeMins(returnDist);
      }

      totalDistanceMiles += returnDist;
      totalDriveMins += returnDriveMins;

      const finalReturnTime = new Date(currentTime.getTime() + returnDriveMins * 60000);

      returnLeg = {
        legDistanceMiles: parseFloat(returnDist.toFixed(1)),
        legDriveMins: returnDriveMins,
        finalReturnTime: finalReturnTime,
        formattedReturnTime: this.formatTime(finalReturnTime)
      };
    }

    const totalStayMins = orderedStops.length * stayDurationMins;
    const totalTripMins = totalDriveMins + totalStayMins;

    return {
      orderedStops: schedule,
      returnLeg: returnLeg,
      totalDistanceMiles: parseFloat(totalDistanceMiles.toFixed(1)),
      totalDriveMins: totalDriveMins,
      totalStayMins: totalStayMins,
      totalTripMins: totalTripMins,
      formattedTotalDuration: this.formatDuration(totalTripMins),
      roadGeometry: osrmData ? osrmData.roadGeometry : null
    };
  }

  // Synchronous fallback
  computeScheduleMatrix(startLocation, orderedStops, loopBack, stayDurationMins, startTime = new Date()) {
    let currentPoint = startLocation;
    let currentTime = new Date(startTime.getTime());
    let totalDriveMins = 0;
    let totalDistanceMiles = 0;

    const schedule = [];

    orderedStops.forEach((stop, index) => {
      const legDist = this.haversineDistanceMiles(currentPoint.lat, currentPoint.lng, stop.lat, stop.lng);
      const legDriveMins = this.estimateDriveTimeMins(legDist);

      totalDistanceMiles += legDist;
      totalDriveMins += legDriveMins;

      const arrivalTime = new Date(currentTime.getTime() + legDriveMins * 60000);
      const departureTime = new Date(arrivalTime.getTime() + stayDurationMins * 60000);

      schedule.push({
        stopIndex: index + 1,
        stopData: stop,
        legDistanceMiles: parseFloat(legDist.toFixed(1)),
        legDriveMins: legDriveMins,
        arrivalTime: arrivalTime,
        departureTime: departureTime,
        stayMins: stayDurationMins,
        formattedArrival: this.formatTime(arrivalTime),
        formattedDeparture: this.formatTime(departureTime)
      });

      currentPoint = stop;
      currentTime = departureTime;
    });

    let returnLeg = null;
    if (loopBack && orderedStops.length > 0) {
      const returnDist = this.haversineDistanceMiles(currentPoint.lat, currentPoint.lng, startLocation.lat, startLocation.lng);
      const returnDriveMins = this.estimateDriveTimeMins(returnDist);
      totalDistanceMiles += returnDist;
      totalDriveMins += returnDriveMins;

      const finalReturnTime = new Date(currentTime.getTime() + returnDriveMins * 60000);

      returnLeg = {
        legDistanceMiles: parseFloat(returnDist.toFixed(1)),
        legDriveMins: returnDriveMins,
        finalReturnTime: finalReturnTime,
        formattedReturnTime: this.formatTime(finalReturnTime)
      };
    }

    const totalStayMins = orderedStops.length * stayDurationMins;
    const totalTripMins = totalDriveMins + totalStayMins;

    return {
      orderedStops: schedule,
      returnLeg: returnLeg,
      totalDistanceMiles: parseFloat(totalDistanceMiles.toFixed(1)),
      totalDriveMins: totalDriveMins,
      totalStayMins: totalStayMins,
      totalTripMins: totalTripMins,
      formattedTotalDuration: this.formatDuration(totalTripMins),
      roadGeometry: null
    };
  }

  formatTime(dateObj) {
    return dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  formatDuration(mins) {
    const hrs = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    if (hrs === 0) return `${remainingMins} mins`;
    return `${hrs} hr ${remainingMins} mins`;
  }
}

window.optimizer = new RouteOptimizer();
