/**
 * MLS & Redfin Property Scout - Side-by-Side Property Comparison Module
 */
import { state } from './state.js';
import { cleanDisplayAddress, escapeHtml, NO_PHOTO_IMG } from './properties.js';
import { showToast } from './toast.js';
import { savePreferencesToServer } from './api.js';

export function toggleCompare(mlsId, event) {
    if (event) {
        event.stopPropagation();
    }
    const idStr = String(mlsId);
    const idx = state.compareList.indexOf(idStr);

    if (idx > -1) {
        state.compareList.splice(idx, 1);
        showToast(`Removed from comparison`, 'info');
    } else {
        if (state.compareList.length >= 4) {
            showToast(`Comparison is limited to 4 properties at a time`, 'warning');
            return;
        }
        state.compareList.push(idStr);
        showToast(`Added to property comparison`, 'success');
    }

    try {
        localStorage.setItem('scout_compare_list', JSON.stringify(state.compareList));
    } catch (e) {}

    savePreferencesToServer();
    updateCompareDock();
    updateCompareButtons();
}

export function clearCompare() {
    state.compareList = [];
    localStorage.removeItem('scout_compare_list');
    savePreferencesToServer();
    updateCompareDock();
    updateCompareButtons();
    showToast(`Comparison list cleared`, 'info');
}

export function updateCompareButtons() {
    document.querySelectorAll('.card-compare-btn').forEach(btn => {
        const mls = btn.dataset.mls;
        const isComparing = state.compareList.includes(String(mls));
        btn.classList.toggle('is-comparing', isComparing);
        btn.innerText = isComparing ? '✓ Comparing' : '+ Compare';
    });

    document.querySelectorAll('.card-compare-checkbox').forEach(input => {
        const mls = input.dataset.mls;
        const isComparing = state.compareList.includes(String(mls));
        input.checked = isComparing;
        const label = input.closest('.card-compare-checkbox-label');
        if (label) {
            label.classList.toggle('is-checked', isComparing);
            const textSpan = label.querySelector('.checkbox-text');
            if (textSpan) {
                textSpan.innerText = isComparing ? '✓ Comparing' : 'Compare';
            }
        }
    });
}

export function updateCompareDock() {
    const dock = document.getElementById('compare-dock');
    const badge = document.getElementById('compare-count-badge');
    const thumbsContainer = document.getElementById('compare-thumbnails');

    if (!dock || !badge || !thumbsContainer) return;

    if (state.compareList.length === 0) {
        dock.style.display = 'none';
        return;
    }

    dock.style.display = 'block';
    badge.innerText = `${state.compareList.length} / 4 Selected`;

    const comparedProps = state.compareList.map(mls => 
        state.allProperties.find(p => String(p.mls_id) === String(mls))
    ).filter(Boolean);

    thumbsContainer.innerHTML = comparedProps.map(p => {
        const img = escapeHtml(p.main_image_url || NO_PHOTO_IMG);
        return `
            <div class="compare-thumb-item" title="${escapeHtml(cleanDisplayAddress(p.address, p.mls_id))}">
                <img src="${img}" alt="${escapeHtml(cleanDisplayAddress(p.address, p.mls_id) || 'Property photo')}" referrerpolicy="no-referrer">
                <span class="compare-thumb-remove" onclick="window.handleToggleCompare('${p.mls_id}', event)"><i data-lucide="x"></i></span>
            </div>
        `;
    }).join('');
    if (window.lucide) window.lucide.createIcons();
}

export function openCompareMatrix() {
    const modal = document.getElementById('modal-compare-matrix');
    const body = document.getElementById('compare-matrix-body');
    if (!modal || !body) return;

    const props = state.compareList.map(mls => 
        state.allProperties.find(p => String(p.mls_id) === String(mls))
    ).filter(Boolean);

    if (props.length === 0) {
        showToast('Please select at least 1 property to compare', 'warning');
        return;
    }

    body.innerHTML = renderCompareTableHTML(props);
    if (window.lucide) window.lucide.createIcons();
    modal.classList.add('active');
}

export function closeCompareMatrix() {
    const modal = document.getElementById('modal-compare-matrix');
    if (modal) {
        modal.classList.remove('active');
    }
}

function renderCompareTableHTML(props) {
    const metrics = [
        { label: 'Property Photo & Address', key: 'header' },
        { label: 'List Price', render: p => `<span class="compare-prop-price font-serif">$${p.price.toLocaleString()}</span>` },
        { label: 'Price / SqFt', render: p => `$${p.sqft_finished ? Math.round(p.price / p.sqft_finished) : 0} / sqft` },
        { label: 'Redfin Est. Delta', render: p => {
            if (!p.redfin_estimate) return 'N/A';
            const delta = Math.round(((p.price - p.redfin_estimate) / p.redfin_estimate) * 100);
            const isAbove = delta > 0;
            return `<span style="color:${isAbove ? '#B0463A' : '#4F7A46'}; font-weight:700;">${isAbove ? '+' : ''}${delta}% vs Redfin</span>`;
        }},
        { label: 'Beds / Baths', render: p => `${p.beds} Beds | ${p.baths} Baths` },
        { label: 'Finished SqFt', render: p => p.sqft_finished ? `${p.sqft_finished.toLocaleString()} sqft` : 'N/A' },
        { label: 'Lot Size', render: p => p.lot_acres ? `${p.lot_acres} Acres` : (p.lot_sqft ? `${p.lot_sqft.toLocaleString()} sqft` : 'N/A') },
        { label: 'Year Built', render: p => p.year_built || 'N/A' },
        { label: 'HOA Fee', render: p => p.hoa_fee ? `$${p.hoa_fee}/mo` : '<span style="color:#4F7A46;">No HOA</span>' },
        { label: 'Annual Taxes', render: p => p.taxes_annual ? `$${p.taxes_annual.toLocaleString()}/yr` : 'N/A' },
        { label: 'Walk / Transit Score', render: p => `<i data-lucide="footprints"></i> ${p.walk_score || 'N/A'} / <i data-lucide="bus"></i> ${p.transit_score || 'N/A'}` },
        { label: 'Garage & Parking', render: p => `${p.garage_spaces ? p.garage_spaces + ' Garage' : 'N/A'}` }
    ];

    const bannerHtml = `
        <div class="matrix-info-banner modal-matrix-banner">
            <div class="matrix-info-header">
                <div class="matrix-info-title">
                    <span><i data-lucide="scale"></i> Custom Property Comparison</span>
                </div>
                <span class="badge-gold">${props.length} / 4 Selected</span>
            </div>
            <div class="matrix-info-grid">
                <div class="matrix-info-item">
                    <span><i data-lucide="pin"></i></span>
                    <div>
                        <strong>Custom Selection:</strong> Comparing the <strong>${props.length}</strong> specific property listing(s) you added to your comparison dock via <strong>+ Compare</strong>.
                    </div>
                </div>
                <div class="matrix-info-item">
                    <span><i data-lucide="bar-chart-3"></i></span>
                    <div>
                        <strong>Valuation Benchmarking:</strong> Evaluates list price against Redfin estimated value (<span style="color:#4F7A46; font-weight:700;">Green = below estimate</span>, <span style="color:#B0463A; font-weight:700;">Red = above estimate</span>).
                    </div>
                </div>
            </div>
        </div>
    `;

    return `
        ${bannerHtml}
        <table class="compare-table">
            <thead>
                <tr>
                    <th class="metric-col">Feature</th>
                    ${props.map(p => {
                        const img = escapeHtml(p.main_image_url || NO_PHOTO_IMG);
                        const addr = cleanDisplayAddress(p.address, p.mls_id);
                        return `
                            <th class="prop-col">
                                <div class="compare-prop-card">
                                    <img src="${img}" class="compare-prop-img" alt="${escapeHtml(addr || 'Property photo')}">
                                    <div style="font-weight:700; font-size:0.95rem;">${escapeHtml(addr)}</div>
                                    <div style="font-size:0.8rem; color:var(--text-muted);">${escapeHtml(p.city || '')}, ${escapeHtml(p.state || '')} ${escapeHtml(p.zip || '')}</div>
                                </div>
                            </th>
                        `;
                    }).join('')}
                </tr>
            </thead>
            <tbody>
                ${metrics.slice(1).map(m => `
                    <tr>
                        <td class="metric-col">${escapeHtml(m.label)}</td>
                        ${props.map(p => `
                            <td style="text-align:center;">${m.render(p)}</td>
                        `).join('')}
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

// Global hook for inline onclicks
window.handleToggleCompare = toggleCompare;
