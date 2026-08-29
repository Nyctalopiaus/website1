/**
 * DoorScout Advanced Route Generator & Street Traversal Engine
 * - Multi-target neighborhood support
 * - True Overpass GIS residential street network extraction ("Tight" = Up & Down all side streets & cul-de-sacs)
 * - Chunked OSRM road snapping (stitches multiple legs without downsampling loss)
 * - Start Point origin pin & Round Trip support
 * - Google Maps Multi-Waypoint navigation exporter
 */

class RouteEngine {
  constructor() {
    this.osrmBaseUrl = 'https://router.project-osrm.org/route/v1';
    this.overpassEndpoints = [
      'https://overpass-api.de/api/interpreter',
      'https://overpass.kumi.systems/api/interpreter',
      'https://overpass.private.coffee/api/interpreter'
    ];
  }

  /**
   * Main route calculation entrypoint.
   */
  async generateMultiTargetRoute(params) {
    // params: { start, targets: [{ lat, lng, radiusMiles }], density, transportMode, isRoundTrip }
    const startPoint = params.start;
    const targets = params.targets || [];
    const profile = params.transportMode === 'walking' ? 'foot' : 'driving';

    let allWaypoints = [];

    // Add Start Point as first waypoint if available
    if (startPoint && startPoint.lat && startPoint.lng) {
      allWaypoints.push({ lat: startPoint.lat, lng: startPoint.lng, label: 'Start Point' });
    }

    // Process each target neighborhood zone
    for (let i = 0; i < targets.length; i++) {
      const target = targets[i];
      if (!target || !target.coords || !target.coords.lat) continue;

      const radiusMeters = (target.radiusMiles || 0.5) * 1609.34;
      const zoneWaypoints = await this.getNeighborhoodWaypoints(target.coords, radiusMeters, params.density);

      allWaypoints.push(...zoneWaypoints);
    }

    // Add return to Start Point if round trip
    if (params.isRoundTrip && startPoint && startPoint.lat && startPoint.lng) {
      allWaypoints.push({ lat: startPoint.lat, lng: startPoint.lng, label: 'Return Home' });
    }

    if (allWaypoints.length < 2) {
      throw new Error('Insufficient waypoints to build route. Please specify target addresses.');
    }

    // Chunk OSRM calls (max 25 waypoints per call to prevent URL overflow, stitch geometries)
    const osrmResult = await this.fetchStitchedOsrmRoute(allWaypoints, profile);

    // Build Google Maps Export URL
    const googleMapsUrl = this.buildGoogleMapsUrl(allWaypoints, params.transportMode);

    return {
      waypoints: allWaypoints,
      osrmGeometry: osrmResult.geometry,
      distanceKm: (osrmResult.distance / 1000).toFixed(2),
      durationMinutes: Math.round(osrmResult.duration / 60),
      googleMapsUrl: googleMapsUrl,
      transportMode: params.transportMode
    };
  }

  /**
   * Fetches residential street geometry for a neighborhood zone.
   * For "tight" density: queries Overpass API for all residential/living_street/service/unclassified ways.
   */
  async getNeighborhoodWaypoints(center, radiusMeters, density) {
    if (density === 'tight') {
      try {
        const osmWaypoints = await this.fetchOverpassStreetNodes(center, radiusMeters);
        if (osmWaypoints && osmWaypoints.length > 5) {
          return osmWaypoints;
        }
      } catch (e) {
        console.warn('Overpass API query failed, falling back to high-density serpentine grid:', e);
      }
    }

    // Fallback or Medium/Loose grid generation
    const spacingMap = {
      tight: 100,    // 100m (~300ft tight scan)
      medium: 220,   // 220m (~700ft residential loops)
      loose: 400     // 400m (~1300ft perimeter scan)
    };
    const spacing = spacingMap[density] || 220;
    return this.calculateSerpentineGrid(center, radiusMeters, spacing);
  }

  /**
   * Queries Overpass API for residential street network inside the neighborhood radius.
   * Extracts street waypoints and orders them via Nearest-Neighbor traversal so the path goes up and down every street.
   */
  async fetchOverpassStreetNodes(center, radiusMeters) {
    const query = `[out:json][timeout:10];
(
  way["highway"~"residential|living_street|service|unclassified|tertiary"](around:${Math.round(radiusMeters)},${center.lat},${center.lng});
);
out body;
>;
out skel qt;`;

    let data = null;
    for (const endpoint of this.overpassEndpoints) {
      try {
        const resp = await fetch(endpoint, {
          method: 'POST',
          body: 'data=' + encodeURIComponent(query),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });
        if (resp.ok) {
          data = await resp.json();
          break;
        }
      } catch (err) {
        // try next mirror
      }
    }

    if (!data || !data.elements) return null;

    // Build node coordinate dictionary
    const nodes = {};
    data.elements.forEach(el => {
      if (el.type === 'node') {
        nodes[el.id] = { lat: el.lat, lng: el.lon };
      }
    });

    // Extract street lines as lists of coordinate points
    const streetSegments = [];
    data.elements.forEach(el => {
      if (el.type === 'way' && Array.isArray(el.nodes)) {
        const pts = el.nodes.map(nid => nodes[nid]).filter(Boolean);
        if (pts.length >= 2) {
          streetSegments.push(pts);
        }
      }
    });

    if (streetSegments.length === 0) return null;

    // Connect street segments into a continuous traversal path using Nearest Neighbor chaining
    return this.chainStreetSegments(streetSegments, center);
  }

  /**
   * Chains street segment endpoints using Nearest-Neighbor to minimize backtracking and ensure full coverage.
   */
  chainStreetSegments(segments, center) {
    const waypoints = [];
    const remaining = [...segments];

    let currentPos = center;

    while (remaining.length > 0) {
      // Find segment whose start or end is closest to currentPos
      let bestIdx = 0;
      let bestDist = Infinity;
      let reverseSegment = false;

      for (let i = 0; i < remaining.length; i++) {
        const seg = remaining[i];
        const distStart = this.haversine(currentPos, seg[0]);
        const distEnd = this.haversine(currentPos, seg[seg.length - 1]);

        if (distStart < bestDist) {
          bestDist = distStart;
          bestIdx = i;
          reverseSegment = false;
        }
        if (distEnd < bestDist) {
          bestDist = distEnd;
          bestIdx = i;
          reverseSegment = true;
        }
      }

      const chosen = remaining.splice(bestIdx, 1)[0];
      const orderedPts = reverseSegment ? [...chosen].reverse() : chosen;

      // Sample points along this street segment (first, middle, last)
      if (orderedPts.length > 3) {
        const midIdx = Math.floor(orderedPts.length / 2);
        waypoints.push(orderedPts[0], orderedPts[midIdx], orderedPts[orderedPts.length - 1]);
      } else {
        waypoints.push(...orderedPts);
      }

      currentPos = waypoints[waypoints.length - 1];
    }

    return waypoints;
  }

  /**
   * Serpentine lawnmower grid fallback.
   */
  calculateSerpentineGrid(center, radiusMeters, spacingMeters) {
    const points = [];
    const latRadian = center.lat * (Math.PI / 180);
    const metersPerLat = 111000;
    const metersPerLng = 111000 * Math.cos(latRadian);

    const dLatRadius = radiusMeters / metersPerLat;
    const dLngRadius = radiusMeters / metersPerLng;

    const latStep = spacingMeters / metersPerLat;
    const lngStep = spacingMeters / metersPerLng;

    let scanDirection = 1;

    for (let latOffset = -dLatRadius + (latStep / 2); latOffset <= dLatRadius; latOffset += latStep) {
      const currentLat = center.lat + latOffset;
      const latRatio = Math.abs(latOffset) / dLatRadius;
      if (latRatio >= 1) continue;

      const maxLngOffset = dLngRadius * Math.sqrt(1 - (latRatio * latRatio));

      const rowPoints = [];
      for (let lngOffset = -maxLngOffset; lngOffset <= maxLngOffset; lngOffset += lngStep) {
        rowPoints.push({ lat: currentLat, lng: center.lng + lngOffset });
      }

      if (scanDirection < 0) rowPoints.reverse();
      points.push(...rowPoints);
      scanDirection *= -1;
    }

    return points;
  }

  /**
   * Calls OSRM API in 25-waypoint chunks and stitches all GeoJSON LineStrings together into one seamless polyline.
   */
  async fetchStitchedOsrmRoute(waypoints, profile) {
    const chunkSize = 20; // 20 waypoints per leg
    const stitchedCoordinates = [];
    let totalDistance = 0;
    let totalDuration = 0;

    for (let i = 0; i < waypoints.length - 1; i += (chunkSize - 1)) {
      const chunk = waypoints.slice(i, i + chunkSize);
      if (chunk.length < 2) break;

      const legData = await this.fetchSingleOsrmLeg(chunk, profile);
      totalDistance += legData.distance;
      totalDuration += legData.duration;

      if (legData.geometry && legData.geometry.coordinates) {
        // Avoid duplicating join node coordinates
        if (stitchedCoordinates.length > 0) {
          stitchedCoordinates.push(...legData.geometry.coordinates.slice(1));
        } else {
          stitchedCoordinates.push(...legData.geometry.coordinates);
        }
      }
    }

    return {
      geometry: {
        type: 'LineString',
        coordinates: stitchedCoordinates
      },
      distance: totalDistance,
      duration: totalDuration
    };
  }

  async fetchSingleOsrmLeg(waypoints, profile) {
    const coordsStr = waypoints.map(w => `${w.lng.toFixed(6)},${w.lat.toFixed(6)}`).join(';');
    const url = `${this.osrmBaseUrl}/${profile}/${coordsStr}?overview=full&geometries=geojson`;

    try {
      const resp = await fetch(url);
      const json = await resp.json();
      if (json.code === 'Ok' && json.routes && json.routes.length > 0) {
        return {
          geometry: json.routes[0].geometry,
          distance: json.routes[0].distance,
          duration: json.routes[0].duration
        };
      }
    } catch (err) {
      console.warn('OSRM leg fetch failed:', err);
    }

    return {
      geometry: {
        type: 'LineString',
        coordinates: waypoints.map(w => [w.lng, w.lat])
      },
      distance: 0,
      duration: 0
    };
  }

  buildGoogleMapsUrl(waypoints, transportMode) {
    if (!waypoints || waypoints.length < 2) return '';

    // Sample down to max 10 key waypoints for Google Maps URL length limits
    const sampled = this.sampleWaypoints(waypoints, 10);
    const origin = `${sampled[0].lat.toFixed(6)},${sampled[0].lng.toFixed(6)}`;
    const destination = `${sampled[sampled.length - 1].lat.toFixed(6)},${sampled[sampled.length - 1].lng.toFixed(6)}`;

    const travelMode = transportMode === 'walking' ? 'walking' : 'driving';
    let url = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=${travelMode}`;

    if (sampled.length > 2) {
      const intermediateWaypoints = sampled.slice(1, sampled.length - 1)
        .map(w => `${w.lat.toFixed(6)},${w.lng.toFixed(6)}`)
        .join('|');
      url += `&waypoints=${encodeURIComponent(intermediateWaypoints)}`;
    }

    return url;
  }

  /**
   * Generates a standard GPX 1.1 XML string from route track points and waypoints/door pins.
   */
  exportToGpx(routeData, doorNotes = []) {
    const timeISO = new Date().toISOString();
    let gpx = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    gpx += `<gpx version="1.1" creator="DoorScout Architectural Inspiration Planner" xmlns="http://www.topografix.com/GPX/1/1">\n`;
    gpx += `  <metadata>\n`;
    gpx += `    <name>DoorScout Neighborhood Inspection Route</name>\n`;
    gpx += `    <time>${timeISO}</time>\n`;
    gpx += `  </metadata>\n`;

    // Add Door Inspiration Pins as GPX Waypoints (<wpt>)
    if (Array.isArray(doorNotes)) {
      doorNotes.forEach(note => {
        if (note && note.lat && note.lng) {
          gpx += `  <wpt lat="${note.lat.toFixed(6)}" lon="${note.lng.toFixed(6)}">\n`;
          gpx += `    <name>${escapeXml(note.title || 'Door Pin')}</name>\n`;
          gpx += `    <cmt>${escapeXml(note.description || '')}</cmt>\n`;
          gpx += `    <sym>Door</sym>\n`;
          gpx += `    <type>${escapeXml(note.styleTag || 'architectural')}</type>\n`;
          gpx += `  </wpt>\n`;
        }
      });
    }

    // Add Route Track (<trk>)
    gpx += `  <trk>\n`;
    gpx += `    <name>DoorScout Inspection Track</name>\n`;
    gpx += `    <trkseg>\n`;

    // Extract track coordinates from OSRM geometry (GeoJSON LineString) or waypoints fallback
    if (routeData && routeData.osrmGeometry && Array.isArray(routeData.osrmGeometry.coordinates)) {
      routeData.osrmGeometry.coordinates.forEach(coord => {
        // GeoJSON is [lon, lat]
        gpx += `      <trkpt lat="${coord[1].toFixed(6)}" lon="${coord[0].toFixed(6)}"></trkpt>\n`;
      });
    } else if (routeData && Array.isArray(routeData.waypoints)) {
      routeData.waypoints.forEach(wp => {
        gpx += `      <trkpt lat="${wp.lat.toFixed(6)}" lon="${wp.lng.toFixed(6)}"></trkpt>\n`;
      });
    }

    gpx += `    </trkseg>\n`;
    gpx += `  </trk>\n`;
    gpx += `</gpx>`;

    return gpx;
  }

  sampleWaypoints(waypoints, maxCount) {
    if (waypoints.length <= maxCount) return waypoints;
    const sampled = [waypoints[0]];
    const step = (waypoints.length - 2) / (maxCount - 2);

    for (let i = 1; i < maxCount - 1; i++) {
      const index = Math.round(i * step);
      sampled.push(waypoints[index]);
    }
    sampled.push(waypoints[waypoints.length - 1]);
    return sampled;
  }

  haversine(a, b) {
    const toRad = Math.PI / 180;
    const dLat = (b.lat - a.lat) * toRad;
    const dLng = (b.lng - a.lng) * toRad;
    const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(a.lat * toRad) * Math.cos(b.lat * toRad);
    return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }
}

function escapeXml(unsafe) {
  return (unsafe || '').replace(/[<>&'"]/g, c => {
    switch (c) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '\'': return '&apos;';
      case '"': return '&quot;';
      default: return c;
    }
  });
}

window.RouteEngine = RouteEngine;
