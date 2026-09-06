/**
 * MLS & Redfin Property Scout - Leaflet Interactive Map
 * mapLayerControl/fitBoundsControl are local to this module (only ever used here); the
 * shared leafletMap/currentTileLayer/mapMarkers refs live in state.js's mapState instead,
 * since other modules (theme.js, the entry app.js) need to read/reset them too.
 */
import { mapState, state } from './state.js';
import { isValidCoord, cleanDisplayAddress, escapeHtml } from './properties.js';


    let mapLayerControl = null;
    export function updateMapTileLayer() {
        if (!mapState.leafletMap || typeof L === 'undefined') return;
        
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

        if (!mapState.currentTileLayer) {
            mapState.currentTileLayer = osmStandard;
            mapState.currentTileLayer.addTo(mapState.leafletMap);
        }

        if (!mapLayerControl) {
            const baseMaps = {
                "🗺️ OpenStreetMap Clean": osmStandard,
                "🛣️ Esri Street Map": esriStreets,
                "🛰️ Esri Satellite": esriSatellite
            };
            mapLayerControl = L.control.layers(baseMaps, null, { position: 'topright' }).addTo(mapState.leafletMap);
        }
    }
    let fitBoundsControl = null;

    // Leaflet Interactive Map View
    export function renderMap(options = {}) {
        const { autoFit = true, forceFit = false } = options;
        if (typeof L === 'undefined') return;

        if (!mapState.leafletMap) {
            mapState.leafletMap = L.map('map-element', {
                zoomControl: true,
                fadeAnimation: false,
                markerZoomAnimation: true,
                preferCanvas: true
            }).setView([39.65, -104.82], 11);
            updateMapTileLayer();

            mapState.leafletMap.on('zoomstart dragstart', () => {
                mapState.leafletMap._userHasInteracted = true;
            });
        }

        setTimeout(() => { mapState.leafletMap.invalidateSize(); }, 200);

        // Clear previous markers
        mapState.mapMarkers.forEach(m => mapState.leafletMap.removeLayer(m));
        mapState.mapMarkers = [];
        mapState.markerMap = {};

        const props = state.filteredProperties;
        if (!props.length) return;

        // Known Denver metro coordinates lookup for quick mapping if lat/lng is unpopulated
        const cityCoords = {
            'aurora': [39.7294, -104.8319],
            'centennial': [39.5791, -104.8772],
            'denver': [39.7392, -104.9903],
            'littleton': [39.6133, -105.0166],
            'englewood': [39.6478, -104.9878],
            'highlands ranch': [39.5539, -104.9691],
            'parker': [39.5186, -104.7614]
        };

        const bounds = [];

        // Calculate coordinates with overlap detection & spiderfy radial offsets
        const resolvedCoords = props.map((p, idx) => {
            let lat = parseFloat(p.latitude || (p.raw_mls_json && p.raw_mls_json.latitude));
            let lng = parseFloat(p.longitude || (p.raw_mls_json && p.raw_mls_json.longitude));

            if (!isValidCoord(lat, lng)) {
                const cKey = (p.city || '').toLowerCase();
                const base = cityCoords[cKey] || [39.65 + (idx * 0.008), -104.82 + (idx * 0.008)];
                const hash = (p.mls_id || '').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
                lat = base[0] + ((hash % 100) - 50) * 0.0015;
                lng = base[1] + (((hash * 3) % 100) - 50) * 0.0015;
            }

            return { lat, lng, property: p };
        });

        // Group properties that are close to each other (~50m radius) to prevent pill overlap
        const coordGroups = {};
        resolvedCoords.forEach(item => {
            const key = `${item.lat.toFixed(3)},${item.lng.toFixed(3)}`;
            if (!coordGroups[key]) coordGroups[key] = [];
            coordGroups[key].push(item);
        });

        // Apply generous radial offset so wide house pills never obscure each other
        Object.values(coordGroups).forEach(group => {
            if (group.length > 1) {
                const radius = 0.0012; // ~100px screen separation at neighborhood zoom
                group.forEach((item, gIdx) => {
                    const angle = (gIdx * 2 * Math.PI) / group.length;
                    const ring = Math.ceil((gIdx + 1) / 6);
                    const currentRadius = radius * ring;
                    item.lat += currentRadius * Math.sin(angle);
                    item.lng += currentRadius * Math.cos(angle) * 1.4; // 1.4x wider for horizontal pill width
                });
            }
        });

        resolvedCoords.forEach(item => {
            const p = item.property;
            const lat = item.lat;
            const lng = item.lng;

            if (isValidCoord(lat, lng)) {
                bounds.push([lat, lng]);
            }

            const priceStr = p.price >= 1000000 
                ? `$${(p.price / 1000000).toFixed(2)}M` 
                : `$${Math.round(p.price / 1000)}k`;

            const statusClass = (p.status || 'Active').toLowerCase();
            const iconHtml = `<div class="leaflet-price-pin status-${statusClass} ${p.favorite ? 'fav-pin' : ''}">${p.favorite ? '⭐ ' : ''}${priceStr}</div>`;
            const customIcon = L.divIcon({
                html: iconHtml,
                className: 'custom-pin-container',
                iconSize: null,
                iconAnchor: null
            });

            const marker = L.marker([lat, lng], { 
                icon: customIcon,
                zIndexOffset: p.favorite ? 500 : 0
            }).addTo(mapState.leafletMap);
            marker._favorite = !!p.favorite;
            const imgUrl = p.main_image_url || 'https://via.placeholder.com/200x110?text=No+Photo';
            
            const popupContent = `
                <div class="map-popup-card">
                    <img src="${imgUrl}" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='https://via.placeholder.com/200x110?text=No+Photo';" class="map-popup-img">
                    <strong style="color:var(--accent-gold); font-size:1.1rem;">$${p.price.toLocaleString()}</strong>
                    <div style="font-weight:600; font-size:0.85rem;">${escapeHtml(cleanDisplayAddress(p.address, p.mls_id))}</div>
                    <div style="font-size:0.75rem; color:var(--text-muted);">${p.beds} Beds | ${p.baths} Baths | ${p.sqft_finished ? p.sqft_finished.toLocaleString() + ' SqFt' : 'N/A'}</div>
                    <button class="btn btn-primary" style="margin-top:4px; padding:4px 10px; font-size:0.75rem;" onclick="openDetailModal('${p.mls_id}')">✨ View Details</button>
                </div>
            `;

            marker.bindPopup(popupContent);

            marker.on('mouseover', () => {
                highlightCardInGrid(p.mls_id);
            });
            marker.on('mouseout', () => {
                unhighlightCardInGrid(p.mls_id);
            });

            mapState.mapMarkers.push(marker);
            if (p.mls_id) {
                mapState.markerMap[String(p.mls_id)] = marker;
            }
        });

        // Add "Fit All Houses" button control if not present
        if (!fitBoundsControl && mapState.leafletMap) {
            const FitControl = L.Control.extend({
                options: { position: 'topleft' },
                onAdd: function() {
                    const btn = L.DomUtil.create('button', 'leaflet-bar btn-fit-bounds');
                    btn.innerHTML = '🎯 Fit All';
                    btn.title = 'Zoom map to show all mapped houses';
                    btn.style.cssText = 'background:#1e293b; color:#fbbf24; border:1px solid rgba(255,255,255,0.2); font-weight:700; font-size:12px; padding:5px 10px; border-radius:6px; cursor:pointer; margin-top:5px; box-shadow:0 2px 6px rgba(0,0,0,0.3);';
                    L.DomEvent.disableClickPropagation(btn);
                    btn.onclick = () => {
                        if (mapState.leafletMap) {
                            mapState.leafletMap._userHasInteracted = false;
                            renderMap({ autoFit: true, forceFit: true });
                        }
                    };
                    return btn;
                }
            });
            fitBoundsControl = new FitControl();
            mapState.leafletMap.addControl(fitBoundsControl);
        }

        if (bounds.length > 0 && (forceFit || (autoFit && !mapState.leafletMap._userHasInteracted))) {
            mapState.leafletMap.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
        }
    }

    export function highlightMapMarker(mlsId) {
        if (!mlsId) return;
        const marker = mapState.markerMap[String(mlsId)];
        if (!marker) return;
        const el = marker.getElement();
        if (el) {
            const pin = el.querySelector('.leaflet-price-pin');
            if (pin) pin.classList.add('pin-highlight');
        }
        marker.setZIndexOffset(2000);
    }

    export function unhighlightMapMarker(mlsId) {
        if (!mlsId) return;
        const marker = mapState.markerMap[String(mlsId)];
        if (!marker) return;
        const el = marker.getElement();
        if (el) {
            const pin = el.querySelector('.leaflet-price-pin');
            if (pin) pin.classList.remove('pin-highlight');
        }
        marker.setZIndexOffset(marker._favorite ? 500 : 0);
    }

    function highlightCardInGrid(mlsId) {
        const cards = document.querySelectorAll(`.property-card[data-mls="${mlsId}"]`);
        cards.forEach(card => card.classList.add('is-map-hovered'));
    }

    function unhighlightCardInGrid(mlsId) {
        const cards = document.querySelectorAll(`.property-card[data-mls="${mlsId}"]`);
        cards.forEach(card => card.classList.remove('is-map-hovered'));
    }

    // Command Palette Logic
