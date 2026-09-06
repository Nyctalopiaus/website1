/**
 * MLS & Redfin Property Scout - Property Data & Small Shared Helpers
 * Fetching/geocoding properties, plus escapeHtml/cleanDisplayAddress/getPropertyReviewStatus
 * used across nearly every other module.
 */
import { apiFetch } from './api.js';
import { CONFIG, elements, state } from './state.js';
import { applyFiltersAndRender, syncTopBarFromState } from './filters.js';
import { renderClientNextSteps } from './clientNextSteps.js';

// Local, network-independent fallback for listings with no cached photo. A former external
// placeholder dependency could stop resolving, leaving listings with broken image boxes, so a
// friendly placeholder. An inline SVG data URI has no network dependency, so it always renders.
export const NO_PHOTO_IMG = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="250" viewBox="0 0 400 250">' +
    '<rect width="400" height="250" fill="#F0EAE0"/>' +
    '<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#B0A48F" font-family="sans-serif" font-size="18">No Photo Available</text>' +
    '</svg>'
);

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
    function showPropertyLoadError(error) {
        if (!elements.gridContainer) return;
        elements.gridContainer.style.display = 'grid';
        elements.gridContainer.innerHTML = `
            <div style="grid-column:1/-1; text-align:center; padding:4rem; background:var(--bg-card); border:1px solid var(--border-color); border-radius:var(--radius-md);">
                <h3>Unable to load properties</h3>
                <p style="margin-top:0.5rem; color:var(--text-muted);">${escapeHtml(error.message || 'Please try again.')}</p>
                <button type="button" class="btn btn-gold" style="margin-top:1rem;" onclick="window.location.reload()"><i data-lucide="rotate-ccw"></i> Retry</button>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
    }

    export function fetchProperties() {
        apiFetch(CONFIG.API_URL + '?action=list')
            .then(data => {
                if (!data?.success) {
                    throw new Error(data?.error || 'The property service did not return a valid response.');
                }
                state.allProperties = data.properties || [];
                populateLocationDropdowns(state.allProperties);
                ensureGeocodedProperties();
                syncTopBarFromState();
                applyFiltersAndRender();
                renderClientNextSteps();
                if (window.inlineCarouselState && window.inlineCarouselState.token && (!window.inlineCarouselState.properties || !window.inlineCarouselState.properties.length)) {
                    if (typeof window.initInlinePlaylistCarousel === 'function') {
                        window.initInlinePlaylistCarousel(window.inlineCarouselState.token);
                    }
                }
            })
            .catch(err => {
                console.error('Failed to load property database:', err);
                showPropertyLoadError(err);
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
        if (p.hidden) return 'dislike';
        if (p.favorite) return 'favorite';
        if (p.rating === 3) return 'possibility';
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
    /**
     * Guards a scraper-controlled URL before it's ever used as a clickable href (e.g. the detail
     * modal's "View Full Image" link). Image/gallery URLs come from an unauthenticated sync
     * payload (see backend/properties.php's SSRF note), so without this a crafted `javascript:`
     * URL could execute in an authenticated session when clicked. Not needed for <img src> —
     * browsers don't execute javascript: URLs there, they just fail to load — only for href.
     */
    export function isSafeMediaUrl(url) {
        return typeof url === 'string' && /^https?:\/\//i.test(url);
    }
    export function getRedfinUrl(p) {
        if (!p) return 'https://www.redfin.com';
        if (p.redfin_url && typeof p.redfin_url === 'string' && p.redfin_url.startsWith('http') && !p.redfin_url.includes('stingray/do/')) {
            return p.redfin_url;
        }
        const cleanAddr = cleanDisplayAddress(p.address, p.mls_id);
        const parts = [
            cleanAddr !== 'Address Unavailable' ? cleanAddr : '',
            p.city,
            p.state || 'CO',
            p.zip
        ].filter(Boolean);

        const query = parts.join(' ');
        if (!query) return 'https://www.redfin.com';

        return `https://www.redfin.com/stingray/do/query-location?location=${encodeURIComponent(query)}`;
    }

