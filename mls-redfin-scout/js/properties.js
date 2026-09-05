/**
 * MLS & Redfin Property Scout - Property Data & Small Shared Helpers
 * Fetching/geocoding properties, plus escapeHtml/cleanDisplayAddress/getPropertyReviewStatus
 * used across nearly every other module.
 */
import { apiFetch } from './api.js';
import { CONFIG, state } from './state.js';
import { syncTopBarFromState, applyFiltersAndRender } from './filters.js';
import { renderMap } from './map.js';


    export function populateLocationDropdowns(properties) {
        if (!Array.isArray(properties) || !properties.length) return;

        const cities = new Set();
        const zips = new Set();
        const districts = new Set();

        properties.forEach(p => {
            if (p.city && p.city.trim()) cities.add(p.city.trim());
            if (p.zip && p.zip.trim()) zips.add(p.zip.trim());
            if (p.school_district && p.school_district.trim()) districts.add(p.school_district.trim());
        });

        const updateSelectOptions = (id, defaultLabel, items) => {
            const el = document.getElementById(id);
            if (!el) return;
            const currentVal = el.value || '';
            const sortedItems = Array.from(items).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

            el.innerHTML = `<option value="">${escapeHtml(defaultLabel)}</option>` +
                sortedItems.map(item => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('');

            if (currentVal && sortedItems.includes(currentVal)) {
                el.value = currentVal;
            }
        };

        updateSelectOptions('filter-city', 'All Cities', cities);
        updateSelectOptions('filter-zip', 'All Zip Codes', zips);
        updateSelectOptions('filter-school-district', 'All School Districts', districts);
    }
    export function fetchProperties() {
        apiFetch(CONFIG.API_URL + '?action=list')
            .then(data => {
                if (data.success) {
                    state.allProperties = data.properties || [];
                    populateLocationDropdowns(state.allProperties);
                    ensureGeocodedProperties();
                    syncTopBarFromState();
                    applyFiltersAndRender();
                }
            })
            .catch(err => {
                console.error('Failed to load property database:', err);
            });
    }
    export function isValidCoord(lat, lng) {
        const parsedLat = parseFloat(lat);
        const parsedLng = parseFloat(lng);
        return !isNaN(parsedLat) && !isNaN(parsedLng) && 
               parsedLat >= 24 && parsedLat <= 50 && 
               parsedLng >= -125 && parsedLng <= -65;
    }
    export function ensureGeocodedProperties() {
        const propsToGeocode = state.allProperties.filter(p => {
            const lat = parseFloat(p.latitude || (p.raw_mls_json && p.raw_mls_json.latitude));
            const lng = parseFloat(p.longitude || (p.raw_mls_json && p.raw_mls_json.longitude));
            return !isValidCoord(lat, lng);
        });

        if (!propsToGeocode.length) return;

        propsToGeocode.forEach((p, idx) => {
            const cacheKey = `geo_cache_${p.mls_id}`;
            const cached = localStorage.getItem(cacheKey);
            if (cached) {
                try {
                    const coords = JSON.parse(cached);
                    if (isValidCoord(coords.lat, coords.lng)) {
                        p.latitude = coords.lat;
                        p.longitude = coords.lng;
                        return;
                    }
                } catch(e) {}
            }

            const cleanAddr = cleanDisplayAddress(p.address, p.mls_id);
            if (!cleanAddr || cleanAddr === 'Address Unavailable') return;
            const query = `${cleanAddr}, ${p.city || ''}, ${p.state || 'CO'} ${p.zip || ''}`.trim();

            setTimeout(() => {
                fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`)
                    .then(r => r.json())
                    .then(data => {
                        if (data && data.length > 0) {
                            const lat = parseFloat(data[0].lat);
                            const lng = parseFloat(data[0].lon);
                            if (isValidCoord(lat, lng)) {
                                p.latitude = lat;
                                p.longitude = lng;
                                localStorage.setItem(cacheKey, JSON.stringify({ lat, lng }));

                                apiFetch(CONFIG.API_URL + '?action=update_coordinates', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ mls_id: p.mls_id, latitude: lat, longitude: lng })
                                }).catch(() => {});

                                if (state.activeView === 'map') {
                                    renderMap({ autoFit: false });
                                }
                            }
                        }
                    })
                    .catch(err => console.warn('Geocoding lookup failed for', query, err));
            }, idx * 1100);
        });
    }
    export function getPropertyReviewStatus(p) {
        const rawStatus = (p.raw_mls_json && p.raw_mls_json.matrix_review_status);
        if (rawStatus && rawStatus !== 'none') {
            return rawStatus;
        }
        if (rawStatus === 'none') {
            if (p.hidden) return 'dislike';
            if (p.rating === 3) return 'possibility';
            return 'none';
        }
        if (p.hidden) return 'dislike';
        if (p.rating === 3) return 'possibility';
        if (p.favorite) return 'favorite';
        return 'none';
    }
    export function cleanDisplayAddress(address, mlsId) {
        if (!address) return 'Address Unavailable';
        let clean = String(address).trim();
        if (mlsId) {
            clean = clean.replace(new RegExp('^' + mlsId + '[\\s\\-:,\n]+', 'i'), '');
            clean = clean.replace(new RegExp('^' + mlsId + '$', 'i'), '');
        }
        // Remove prepended 7-9 digit MLS ID numbers when followed by street address text
        clean = clean.replace(/^(\d{7,9})\s+([0-9A-Za-z])/i, '$2');
        clean = clean.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
        return clean || 'Address Unavailable';
    }
    export function escapeHtml(str) {
        return str.replace(/[&<>'"]/g, 
            tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
        );
    }
