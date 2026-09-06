/**
 * MLS & Redfin Property Scout - CSV / JSON Export
 */
import { state } from './state.js';
import { showToast } from './toast.js';
import { getPropertyReviewStatus } from './properties.js';

export function exportCSV() {
    const props = state.filteredProperties;
    if (!props.length) return showToast('No properties to export', 'warning');

    const headers = ['MLS ID', 'Address', 'City', 'Price', 'Beds', 'Baths', 'SqFt', 'Lot Acres', 'Year Built', 'HOA Fee', 'Annual Tax', 'WalkScore', 'Personal Notes'];
    const rows = props.map(p => [
        p.mls_id, `"${p.address}"`, `"${p.city}"`, p.price, p.beds, p.baths, p.sqft_finished, p.lot_acres, p.year_built, p.hoa_fee, p.annual_tax, p.walk_score, `"${(p.user_notes || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `scout_properties_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('CSV Spreadsheet Exported 📄', 'success');
}

export function exportJSON() {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(state.filteredProperties, null, 2));
    const link = document.createElement('a');
    link.setAttribute('href', dataStr);
    link.setAttribute('download', `scout_backup_${new Date().toISOString().split('T')[0]}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('JSON Database Backup Exported 💾', 'success');
}

export function exportFavoritesToHomeward() {
    const all = state.allProperties || [];
    const favorites = all.filter(p => p.favorite || getPropertyReviewStatus(p) === 'favorite');

    if (!favorites.length) {
        return showToast('No favorited properties found to export to Homeward.', 'warning');
    }

    const stops = favorites.map((p, idx) => {
        const addressParts = [p.address, p.city, p.state, p.zip].filter(Boolean);
        const fullAddress = addressParts.join(', ') || p.address || 'Property';
        const photo = p.photo_url || (Array.isArray(p.photos) && p.photos.length > 0 ? p.photos[0] : (p.image_url || ''));

        return {
            id: `scout-fav-${p.mls_id || Date.now() + '-' + idx}`,
            address: fullAddress,
            lat: (p.latitude && !isNaN(parseFloat(p.latitude))) ? parseFloat(p.latitude) : null,
            lng: (p.longitude && !isNaN(parseFloat(p.longitude))) ? parseFloat(p.longitude) : null,
            price: p.price ? (typeof p.price === 'number' ? `$${p.price.toLocaleString()}` : String(p.price)) : '',
            lotSize: p.lot_acres ? `${p.lot_acres} Acres` : (p.sqft_finished ? `${p.sqft_finished} sqft` : ''),
            sqft: p.sqft_finished ? String(p.sqft_finished) : '',
            hoaNotes: p.hoa_fee ? `$${p.hoa_fee}/mo HOA` : '',
            notes: p.user_notes || '',
            redfinUrl: p.url || '',
            photoUrl: photo,
            rating: 5,
            visited: false
        };
    });

    try {
        const payload = {
            source: 'mls-redfin-scout',
            timestamp: Date.now(),
            stops: stops
        };
        localStorage.setItem('homeward_pending_import_scout', JSON.stringify(payload));
        showToast(`Exporting ${stops.length} favorites to Homeward... 🗺️`, 'success');
        setTimeout(() => {
            window.open('../homeward/?import=scout', '_blank');
        }, 400);
    } catch (e) {
        console.error('Failed to export to Homeward:', e);
        showToast('Error preparing Homeward export', 'error');
    }
}

