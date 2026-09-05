/**
 * MLS & Redfin Property Scout - CSV / JSON Export
 */
import { state } from './state.js';
import { showToast } from './toast.js';


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
