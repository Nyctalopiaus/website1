/**
 * Dibs Tour Planner - Route Optimizer & Scheduling Engine
 * Implements Haversine distance calculations, 2-Opt Traveling Salesperson Optimization,
 * live OSRM turn-by-turn driving geometry and duration fetching, ETA schedule generation,
 * navigation URL generation (Google & Apple Maps), and RFC 5545 iCalendar (.ics) exports.
 */

export class RouteOptimizer {
    constructor() {
        this.geocodeCache = new Map();
    }

    /** "537 Pitkin Way, Castle Rock, CO 80104": a bare street can match the wrong town on a map. */
    fullAddress(stop) {
        if (!stop) return '';
        const street = String(stop.address || '').trim();
        const cityState = [stop.city, stop.state || 'CO'].map(v => String(v || '').trim()).filter(Boolean).join(', ');
        return [street, [cityState, String(stop.zip || '').trim()].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    }

    /** RFC 5545 TEXT escaping: backslash, semicolon, comma and newlines. */
    icsText(value) {
        return String(value ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
    }

    /**
     * Calculate Haversine distance in miles between two latitude/longitude points.
     */
    haversineDistanceMiles(lat1, lon1, lat2, lon2) {
        if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return 0;
        const R = 3958.8; // Earth radius in statute miles
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a =
            Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    /**
     * Fallback estimation of driving time in minutes based on distance & average suburban speed (35 mph).
     */
    estimateDriveTimeMins(distanceMiles) {
        const avgSpeedMph = 35;
        const timeMins = (distanceMiles / avgSpeedMph) * 60;
        return Math.max(2, Math.round(timeMins));
    }

    /**
     * Fetch real-world road geometry and leg durations using the public OSRM driving API.
     * Waypoints: array of { lat, lng } objects.
     */
    async fetchOSRMRoute(waypoints) {
        if (!waypoints || waypoints.length < 2) return null;

        try {
            const valid = waypoints.filter(w => w && w.lat != null && w.lng != null);
            if (valid.length < 2) return null;

            const coordsStr = valid.map(w => `${Number(w.lng).toFixed(6)},${Number(w.lat).toFixed(6)}`).join(';');
            const url = `https://router.project-osrm.org/route/v1/driving/${coordsStr}?overview=full&geometries=geojson`;

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);

            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeoutId);

            if (response.ok) {
                const data = await response.json();
                if (data.code === 'Ok' && data.routes && data.routes.length > 0) {
                    const route = data.routes[0];
                    // OSRM GeoJSON is [lon, lat] -> convert to Leaflet [lat, lon]
                    const roadGeometry = route.geometry.coordinates.map(c => [c[1], c[0]]);
                    return {
                        roadGeometry,
                        legs: route.legs || [] // Array of { distance: meters, duration: seconds }
                    };
                }
            }
        } catch (e) {
            console.warn('[TourOptimizer] OSRM routing fetch failed or timed out, falling back to direct paths:', e);
        }
        return null;
    }

    /**
     * Calculate total cumulative distance of an ordered route.
     */
    calculateTotalDistance(routeStops, startLocation, loopBack = false) {
        if (!routeStops || routeStops.length === 0) return 0;
        let total = 0;
        let current = startLocation;

        for (const stop of routeStops) {
            total += this.haversineDistanceMiles(current.lat, current.lng, stop.lat || stop.latitude, stop.lng || stop.longitude);
            current = { lat: stop.lat || stop.latitude, lng: stop.lng || stop.longitude };
        }

        if (loopBack && startLocation) {
            total += this.haversineDistanceMiles(current.lat, current.lng, startLocation.lat, startLocation.lng);
        }

        return parseFloat(total.toFixed(1));
    }

    /**
     * Nearest-Neighbor seed + 2-Opt TSP Route Optimization.
     * Orders stops to minimize total travel time/distance starting from startLocation.
     */
    optimizeRoute(startLocation, rawStops, loopBack = false) {
        if (!rawStops || rawStops.length <= 1) {
            return rawStops ? [...rawStops] : [];
        }

        // Filter stops that have valid lat/lng
        const validStops = rawStops.filter(s => (s.lat != null && s.lng != null) || (s.latitude != null && s.longitude != null));
        const invalidStops = rawStops.filter(s => !validStops.includes(s));

        if (validStops.length <= 1) {
            return [...validStops, ...invalidStops];
        }

        // Step 1: Nearest Neighbor Initial Ordering
        let unvisited = [...validStops];
        let route = [];
        let current = startLocation || {
            lat: validStops[0].lat || validStops[0].latitude,
            lng: validStops[0].lng || validStops[0].longitude
        };

        while (unvisited.length > 0) {
            let nearestIdx = 0;
            let minDistance = Infinity;

            for (let i = 0; i < unvisited.length; i++) {
                const sLat = unvisited[i].lat != null ? unvisited[i].lat : unvisited[i].latitude;
                const sLng = unvisited[i].lng != null ? unvisited[i].lng : unvisited[i].longitude;
                const dist = this.haversineDistanceMiles(current.lat, current.lng, sLat, sLng);
                if (dist < minDistance) {
                    minDistance = dist;
                    nearestIdx = i;
                }
            }

            const nextStop = unvisited.splice(nearestIdx, 1)[0];
            route.push(nextStop);
            current = {
                lat: nextStop.lat != null ? nextStop.lat : nextStop.latitude,
                lng: nextStop.lng != null ? nextStop.lng : nextStop.longitude
            };
        }

        // Step 2: 2-Opt Iterative Improvement
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

        return [...route, ...invalidStops];
    }

    /**
     * Compute full itinerary ETAs, drive legs, stay durations, and OSRM road geometry.
     */
    async computeScheduleMatrixAsync(startLocation, orderedStops, loopBack = false, stayDurationMins = 20, startTime = new Date()) {
        if (!orderedStops || orderedStops.length === 0) {
            return {
                orderedStops: [],
                returnLeg: null,
                totalDistanceMiles: 0,
                totalDriveMins: 0,
                totalStayMins: 0,
                totalTripMins: 0,
                formattedTotalDuration: '0 mins',
                roadGeometry: null
            };
        }

        const validStops = orderedStops.filter(s => (s.lat != null && s.lng != null) || (s.latitude != null && s.longitude != null));
        const effectiveStart = (startLocation && startLocation.lat != null && startLocation.lng != null)
            ? startLocation
            : (validStops[0] ? { lat: validStops[0].lat || validStops[0].latitude, lng: validStops[0].lng || validStops[0].longitude, address: validStops[0].address } : null);

        if (!effectiveStart) {
            return this.computeScheduleMatrix(startLocation, orderedStops, loopBack, stayDurationMins, startTime);
        }

        // Prepare waypoints for OSRM
        const waypoints = [
            { lat: effectiveStart.lat, lng: effectiveStart.lng },
            ...validStops.map(s => ({ lat: s.lat || s.latitude, lng: s.lng || s.longitude }))
        ];
        if (loopBack) {
            waypoints.push({ lat: effectiveStart.lat, lng: effectiveStart.lng });
        }

        const osrmData = await this.fetchOSRMRoute(waypoints);

        let currentPoint = effectiveStart;
        let currentTime = new Date(startTime.getTime());
        let totalDriveMins = 0;
        let totalDistanceMiles = 0;
        const schedule = [];

        for (let index = 0; index < orderedStops.length; index++) {
            const stop = orderedStops[index];
            const stopLat = stop.lat != null ? stop.lat : stop.latitude;
            const stopLng = stop.lng != null ? stop.lng : stop.longitude;
            const hasCoords = stopLat != null && stopLng != null;

            let legDist = 0;
            let legDriveMins = 0;

            if (osrmData && osrmData.legs && osrmData.legs[index]) {
                const leg = osrmData.legs[index];
                legDist = (leg.distance || 0) * 0.000621371; // meters to miles
                legDriveMins = Math.max(1, Math.round((leg.duration || 0) / 60)); // seconds to mins
            } else if (hasCoords) {
                legDist = this.haversineDistanceMiles(currentPoint.lat, currentPoint.lng, stopLat, stopLng);
                legDriveMins = this.estimateDriveTimeMins(legDist);
            } else {
                legDist = 0;
                legDriveMins = 10; // default estimate
            }

            totalDistanceMiles += legDist;
            totalDriveMins += legDriveMins;

            const arrivalTime = new Date(currentTime.getTime() + legDriveMins * 60000);
            const durationForStop = Number(stop.duration_mins) || stayDurationMins;
            const departureTime = new Date(arrivalTime.getTime() + durationForStop * 60000);

            schedule.push({
                stopIndex: index + 1,
                stopData: stop,
                legDistanceMiles: parseFloat(legDist.toFixed(1)),
                legDriveMins,
                arrivalTime,
                departureTime,
                stayMins: durationForStop,
                formattedArrival: this.formatTime(arrivalTime),
                formattedDeparture: this.formatTime(departureTime)
            });

            if (hasCoords) {
                currentPoint = { lat: stopLat, lng: stopLng };
            }
            currentTime = departureTime;
        }

        let returnLeg = null;
        if (loopBack && orderedStops.length > 0 && effectiveStart) {
            const returnIndex = orderedStops.length;
            let returnDist = 0;
            let returnDriveMins = 0;

            if (osrmData && osrmData.legs && osrmData.legs[returnIndex]) {
                const leg = osrmData.legs[returnIndex];
                returnDist = (leg.distance || 0) * 0.000621371;
                returnDriveMins = Math.max(1, Math.round((leg.duration || 0) / 60));
            } else {
                returnDist = this.haversineDistanceMiles(currentPoint.lat, currentPoint.lng, effectiveStart.lat, effectiveStart.lng);
                returnDriveMins = this.estimateDriveTimeMins(returnDist);
            }

            totalDistanceMiles += returnDist;
            totalDriveMins += returnDriveMins;

            const finalReturnTime = new Date(currentTime.getTime() + returnDriveMins * 60000);

            returnLeg = {
                legDistanceMiles: parseFloat(returnDist.toFixed(1)),
                legDriveMins: returnDriveMins,
                finalReturnTime,
                formattedReturnTime: this.formatTime(finalReturnTime)
            };
        }

        const totalStayMins = schedule.reduce((acc, s) => acc + s.stayMins, 0);
        const totalTripMins = totalDriveMins + totalStayMins;

        return {
            orderedStops: schedule,
            returnLeg,
            totalDistanceMiles: parseFloat(totalDistanceMiles.toFixed(1)),
            totalDriveMins,
            totalStayMins,
            totalTripMins,
            formattedTotalDuration: this.formatDuration(totalTripMins),
            roadGeometry: osrmData ? osrmData.roadGeometry : null
        };
    }

    /**
     * Synchronous fallback without network calls.
     */
    computeScheduleMatrix(startLocation, orderedStops, loopBack = false, stayDurationMins = 20, startTime = new Date()) {
        let currentPoint = startLocation || { lat: 39.55, lng: -104.78 };
        let currentTime = new Date(startTime.getTime());
        let totalDriveMins = 0;
        let totalDistanceMiles = 0;
        const schedule = [];

        (orderedStops || []).forEach((stop, index) => {
            const stopLat = stop.lat != null ? stop.lat : stop.latitude;
            const stopLng = stop.lng != null ? stop.lng : stop.longitude;
            const hasCoords = stopLat != null && stopLng != null;

            const legDist = hasCoords ? this.haversineDistanceMiles(currentPoint.lat, currentPoint.lng, stopLat, stopLng) : 0;
            const legDriveMins = hasCoords ? this.estimateDriveTimeMins(legDist) : 10;

            totalDistanceMiles += legDist;
            totalDriveMins += legDriveMins;

            const arrivalTime = new Date(currentTime.getTime() + legDriveMins * 60000);
            const durationForStop = Number(stop.duration_mins) || stayDurationMins;
            const departureTime = new Date(arrivalTime.getTime() + durationForStop * 60000);

            schedule.push({
                stopIndex: index + 1,
                stopData: stop,
                legDistanceMiles: parseFloat(legDist.toFixed(1)),
                legDriveMins,
                arrivalTime,
                departureTime,
                stayMins: durationForStop,
                formattedArrival: this.formatTime(arrivalTime),
                formattedDeparture: this.formatTime(departureTime)
            });

            if (hasCoords) {
                currentPoint = { lat: stopLat, lng: stopLng };
            }
            currentTime = departureTime;
        });

        let returnLeg = null;
        if (loopBack && orderedStops && orderedStops.length > 0 && startLocation && startLocation.lat != null) {
            const returnDist = this.haversineDistanceMiles(currentPoint.lat, currentPoint.lng, startLocation.lat, startLocation.lng);
            const returnDriveMins = this.estimateDriveTimeMins(returnDist);
            totalDistanceMiles += returnDist;
            totalDriveMins += returnDriveMins;
            const finalReturnTime = new Date(currentTime.getTime() + returnDriveMins * 60000);
            returnLeg = {
                legDistanceMiles: parseFloat(returnDist.toFixed(1)),
                legDriveMins: returnDriveMins,
                finalReturnTime,
                formattedReturnTime: this.formatTime(finalReturnTime)
            };
        }

        const totalStayMins = schedule.reduce((acc, s) => acc + s.stayMins, 0);
        const totalTripMins = totalDriveMins + totalStayMins;

        return {
            orderedStops: schedule,
            returnLeg,
            totalDistanceMiles: parseFloat(totalDistanceMiles.toFixed(1)),
            totalDriveMins,
            totalStayMins,
            totalTripMins,
            formattedTotalDuration: this.formatDuration(totalTripMins),
            roadGeometry: null
        };
    }

    /**
     * Geocode a text address to { address, lat, lng } using OpenStreetMap Nominatim with memory cache.
     */
    async geocodeAddress(addressStr) {
        if (!addressStr || typeof addressStr !== 'string') return null;
        const clean = addressStr.trim();
        if (!clean) return null;

        if (this.geocodeCache.has(clean.toLowerCase())) {
            return this.geocodeCache.get(clean.toLowerCase());
        }

        try {
            const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(clean)}&limit=1`;
            const resp = await fetch(url, {
                headers: { 'Accept': 'application/json' }
            });
            if (resp.ok) {
                const results = await resp.json();
                if (results && results.length > 0) {
                    const r = results[0];
                    const out = {
                        address: clean,
                        lat: parseFloat(r.lat),
                        lng: parseFloat(r.lon),
                        displayName: r.display_name
                    };
                    this.geocodeCache.set(clean.toLowerCase(), out);
                    return out;
                }
            }
        } catch (e) {
            console.warn('[TourOptimizer] Geocode error:', e);
        }
        return null;
    }

    /**
     * Build Google Maps driving navigation URL with multiple waypoints.
     */
    buildGoogleMapsMultiStopUrl(startAddress, orderedStops, loopBack = false) {
        if (!orderedStops || orderedStops.length === 0) return '#';

        const origin = encodeURIComponent(startAddress || this.fullAddress(orderedStops[0]));
        let destination = encodeURIComponent(this.fullAddress(orderedStops[orderedStops.length - 1]));

        if (loopBack) {
            destination = origin;
        }

        let waypoints = [];
        if (loopBack) {
            waypoints = orderedStops.map(s => encodeURIComponent(this.fullAddress(s)));
        } else if (orderedStops.length > 1) {
            waypoints = orderedStops.slice(0, orderedStops.length - 1).map(s => encodeURIComponent(this.fullAddress(s)));
        }

        let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}`;
        if (waypoints.length > 0) {
            url += `&waypoints=${waypoints.join('|')}`;
        }
        return url;
    }

    /**
     * Build Apple Maps driving navigation URL.
     */
    buildAppleMapsMultiStopUrl(startAddress, orderedStops) {
        if (!orderedStops || orderedStops.length === 0) return '#';
        const daddr = encodeURIComponent(this.fullAddress(orderedStops[orderedStops.length - 1]));
        const saddr = encodeURIComponent(startAddress || this.fullAddress(orderedStops[0]));
        return `https://maps.apple.com/?saddr=${saddr}&daddr=${daddr}&dirflg=d`;
    }

    /**
     * Generate RFC 5545 iCalendar content for the entire tour schedule.
     */
    generateICS(tourName, scheduleMatrix, startLocation) {
        if (!scheduleMatrix || !scheduleMatrix.orderedStops || scheduleMatrix.orderedStops.length === 0) {
            return '';
        }

        const formatICSDate = (date) => {
            const pad = (n) => String(n).padStart(2, '0');
            return date.getUTCFullYear() +
                pad(date.getUTCMonth() + 1) +
                pad(date.getUTCDate()) + 'T' +
                pad(date.getUTCHours()) +
                pad(date.getUTCMinutes()) +
                pad(date.getUTCSeconds()) + 'Z';
        };

        const now = formatICSDate(new Date());
        const calName = (tourName || 'Home Viewing Tour').replace(/[^\w\s-]/g, '');

        let ics = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//Dibs Real Estate//Tour Planner//EN',
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH',
            `X-WR-CALNAME:${calName}`
        ];

        scheduleMatrix.orderedStops.forEach((item, idx) => {
            const stop = item.stopData;
            const startUtc = formatICSDate(item.arrivalTime);
            const endUtc = formatICSDate(item.departureTime);
            const uid = `tour-stop-${stop.mls_id || idx}-${Date.now()}@dibs.local`;

            const summary = `Showing #${item.stopIndex}: ${stop.address || 'Property Stop'}`;
            const cleanNotes = (stop.tour_notes || stop.access_notes || '')
                .replace(/<[^>]*>/g, '')
                .trim();

            const descriptionParts = [
                `Tour Stop #${item.stopIndex} of ${scheduleMatrix.orderedStops.length}`,
                stop.price ? `Price: $${Number(stop.price).toLocaleString()}` : '',
                stop.beds ? `Specs: ${stop.beds} bd, ${stop.baths || '?'} ba, ${stop.sqft_finished ? Number(stop.sqft_finished).toLocaleString() + ' sqft' : ''}` : '',
                item.legDriveMins ? `Drive Time: ~${item.legDriveMins} mins (${item.legDistanceMiles} mi)` : '',
                stop.status_reason ? `Status Note: ${stop.status_reason}` : '',
                cleanNotes ? `Notes: ${cleanNotes}` : ''
            ].filter(Boolean).map(p => this.icsText(p)).join('\\n');

            ics.push(
                'BEGIN:VEVENT',
                `UID:${uid}`,
                `DTSTAMP:${now}`,
                `DTSTART:${startUtc}`,
                `DTEND:${endUtc}`,
                `SUMMARY:${this.icsText(summary)}`,
                `LOCATION:${this.icsText(this.fullAddress(stop))}`,
                `DESCRIPTION:${descriptionParts}`,
                'STATUS:CONFIRMED',
                'END:VEVENT'
            );
        });

        ics.push('END:VCALENDAR');
        return ics.join('\r\n');
    }

    /**
     * Download the tour as a .ics calendar file.
     */
    downloadICS(tourName, scheduleMatrix, startLocation) {
        const content = this.generateICS(tourName, scheduleMatrix, startLocation);
        if (!content) return false;

        const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        const fileName = (tourName || 'home-tour').toLowerCase().replace(/[^a-z0-9_-]/g, '_') + '.ics';
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
        return true;
    }

    formatTime(dateObj) {
        if (!dateObj || !(dateObj instanceof Date) || isNaN(dateObj.getTime())) return '';
        return dateObj.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }

    formatDuration(mins) {
        const hrs = Math.floor(mins / 60);
        const rem = mins % 60;
        if (hrs === 0) return `${rem} mins`;
        if (rem === 0) return `${hrs} hr${hrs > 1 ? 's' : ''}`;
        return `${hrs} hr${hrs > 1 ? 's' : ''} ${rem} mins`;
    }
}

export const routeOptimizer = new RouteOptimizer();
if (typeof window !== 'undefined') {
    window.routeOptimizer = routeOptimizer;
}
