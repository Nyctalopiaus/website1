/**
 * BuildRoute Map Module
 * Powered by Leaflet.js with dark tiles & custom numbered markers.
 */
class MapManager {
  constructor(mapContainerId = 'map') {
    this.containerId = mapContainerId;
    this.map = null;
    this.markers = [];
    this.routePolyline = null;
    this.defaultCenter = [39.5501, -104.7801]; // Default Colorado Springs / Denver Region
    this.defaultZoom = 10;
    this.currentTileLayer = null;
    this.mapLayerControl = null;
  }

  initMap() {
    if (this.map) return;

    this.map = L.map(this.containerId, {
      zoomControl: false,
      fadeAnimation: false, // Instant tile paint without CSS opacity delay
      markerZoomAnimation: true,
      preferCanvas: true
    }).setView(this.defaultCenter, this.defaultZoom);

    // Base tile layers (Zero watermarks, 100% clean & public)
    const osmStandard = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      crossOrigin: true
    });

    const esriStreets = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: 'Tiles &copy; Esri &mdash; Source: Esri, DeLorme, NAVTEQ, USGS, Intermap, iPC, NRCAN, Esri Japan, METI, Esri China (Hong Kong), Esri (Thailand), TomTom, 2012'
    });

    const esriSatellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
    });

    if (!this.currentTileLayer) {
      this.currentTileLayer = osmStandard;
      this.currentTileLayer.addTo(this.map);
    }

    if (!this.mapLayerControl) {
      const baseMaps = {
        "🗺️ OpenStreetMap Clean": osmStandard,
        "🛣️ Esri Street Map": esriStreets,
        "🛰️ Esri Satellite": esriSatellite
      };
      this.mapLayerControl = L.control.layers(baseMaps, null, { position: 'topright' }).addTo(this.map);
    }

    // Zoom control at top right
    L.control.zoom({ position: 'topright' }).addTo(this.map);

    // Map click handler for dropping pins / adding sites
    this.map.on('click', async (e) => {
      if (this.onMapClickCallback) {
        this.onMapClickCallback(e.latlng.lat, e.latlng.lng);
      }
    });
  }

  setMapClickCallback(cb) {
    this.onMapClickCallback = cb;
  }

  createMarkerIcon(label, isStart = false, isEnd = false) {
    let pinClass = 'marker-pin';
    if (isStart) pinClass += ' start-pin';
    if (isEnd) pinClass += ' end-pin';

    return L.divIcon({
      className: 'custom-map-marker',
      html: `<div class="${pinClass}">${label}</div>`,
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });
  }

  clearMap() {
    this.markers.forEach(m => this.map.removeLayer(m));
    this.markers = [];
    if (this.routePolyline) {
      this.map.removeLayer(this.routePolyline);
      this.routePolyline = null;
    }
  }

  renderTour(startPoint, scheduledStops, returnLeg, onStopClick = null, roadGeometry = null) {
    this.initMap();
    this.clearMap();

    const latLngs = [];

    // 1. Add Start Location Marker
    if (startPoint && startPoint.lat && startPoint.lng) {
      const startMarker = L.marker([startPoint.lat, startPoint.lng], {
        icon: this.createMarkerIcon('START', true, false)
      }).addTo(this.map);

      startMarker.bindPopup(`
        <div class="p-1">
          <div class="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Starting Location</div>
          <div class="text-sm font-medium text-slate-100 mt-0.5">${startPoint.address}</div>
        </div>
      `);

      this.markers.push(startMarker);
      latLngs.push([startPoint.lat, startPoint.lng]);
    }

    // 2. Add Stop Markers
    scheduledStops.forEach((item, idx) => {
      const stop = item.stopData;
      if (!stop.lat || !stop.lng) return;

      const marker = L.marker([stop.lat, stop.lng], {
        icon: this.createMarkerIcon(item.stopIndex, false, false)
      }).addTo(this.map);

      const gmapsUrl = window.propertyLinks.getGoogleMapsUrl(stop.address, stop.lat, stop.lng);
      const cachedProp = (window.storageManager && typeof window.storageManager.getCachedPropertySync === 'function') ? window.storageManager.getCachedPropertySync(stop.address) : null;
      const effectiveRedfinUrl = stop.redfinUrl || (cachedProp ? (cachedProp.redfinUrl || cachedProp.url) : null) || stop.address;
      const redfinUrl = window.propertyLinks.getRedfinUrl(effectiveRedfinUrl);
      const zillowUrl = window.propertyLinks.getZillowUrl(stop.address);

      marker.bindPopup(`
        <div class="p-1 max-w-xs">
          <div class="text-xs font-semibold text-sky-400">Stop #${item.stopIndex} • ETA ${item.formattedArrival}</div>
          <div class="text-sm font-semibold text-slate-100 mt-1">${stop.address}</div>
          ${stop.price ? `<div class="text-xs text-amber-400 font-bold mt-1">${stop.price} ${stop.lotSize ? '• ' + stop.lotSize : ''}</div>` : ''}
          <div class="flex items-center gap-2 mt-2 pt-2 border-t border-slate-700">
            <a href="${gmapsUrl}" target="_blank" class="text-xs text-emerald-400 hover:underline">Google Maps ↗</a>
            <a href="${redfinUrl}" target="_blank" class="text-xs text-rose-400 hover:underline">Redfin ↗</a>
            <a href="${zillowUrl}" target="_blank" class="text-xs text-sky-400 hover:underline">Zillow ↗</a>
          </div>
        </div>
      `);

      if (onStopClick) {
        marker.on('click', () => onStopClick(stop.id));
      }

      this.markers.push(marker);
      latLngs.push([stop.lat, stop.lng]);
    });

    // 3. Add Loop Back to Start if specified
    if (returnLeg && startPoint && startPoint.lat && startPoint.lng) {
      latLngs.push([startPoint.lat, startPoint.lng]);
    }

    // 4. Draw Polyline Route Line (OSRM Road Geometry or Direct Line Fallback)
    if (roadGeometry && roadGeometry.length > 0) {
      this.routePolyline = L.polyline(roadGeometry, {
        color: '#38bdf8',
        weight: 4,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(this.map);

      const bounds = L.latLngBounds(roadGeometry);
      this.map.fitBounds(bounds, { padding: [40, 40] });
    } else if (latLngs.length >= 2) {
      this.routePolyline = L.polyline(latLngs, {
        color: '#38bdf8',
        weight: 3,
        opacity: 0.7,
        dashArray: '8, 8',
        lineCap: 'round'
      }).addTo(this.map);

      const bounds = L.latLngBounds(latLngs);
      this.map.fitBounds(bounds, { padding: [40, 40] });
    } else if (latLngs.length === 1) {
      this.map.setView(latLngs[0], 13);
    }
  }
}

window.mapManager = new MapManager();
