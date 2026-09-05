/**
 * MLS & Redfin Property Scout - View Switching & Renderers (grid/table/matrix)
 */
import { state, elements } from './state.js';
import { getPropertyReviewStatus, cleanDisplayAddress, escapeHtml } from './properties.js';
import { renderMap } from './map.js';
import { showToast } from './toast.js';


    export function updateKPIs() {
        const total = state.allProperties.length;
        const filtered = state.filteredProperties;
        const activeCount = filtered.filter(p => p.status === 'Active').length;
        const favCount = state.allProperties.filter(p => p.favorite).length;
        const sharedCount = state.allProperties.filter(p => p.shared_with_realtor).length;

        const totalPrice = filtered.reduce((acc, p) => acc + p.price, 0);
        const totalSqft = filtered.reduce((acc, p) => acc + p.sqft_finished, 0);
        const avgPrice = filtered.length ? Math.round(totalPrice / filtered.length) : 0;
        const avgSqft = filtered.length ? Math.round(totalSqft / filtered.length) : 0;
        const avgPpsqft = totalSqft ? Math.round(totalPrice / totalSqft) : 0;

        elements.kpiTotal.innerText = filtered.length;
        elements.kpiTotalSub.innerText = `${activeCount} Active`;
        elements.kpiFavorites.innerText = favCount;
        elements.kpiShared.innerText = sharedCount;
        elements.kpiAvgPrice.innerText = `$${avgPrice.toLocaleString()}`;
        elements.kpiAvgSqftPrice.innerText = `$${avgPpsqft} / SqFt`;
        elements.kpiAvgSqft.innerText = `${avgSqft.toLocaleString()}`;
    }
    export function renderActiveView() {
        elements.gridContainer.style.display = 'none';
        if (elements.mapContainer) elements.mapContainer.style.display = 'none';
        elements.tableContainer.style.display = 'none';
        elements.matrixContainer.style.display = 'none';

        if (state.activeView === 'grid') {
            elements.gridContainer.style.display = 'grid';
            renderGrid();
        } else if (state.activeView === 'map') {
            if (elements.mapContainer) elements.mapContainer.style.display = 'block';
            renderMap();
        } else if (state.activeView === 'table') {
            elements.tableContainer.style.display = 'block';
            renderTable();
        } else if (state.activeView === 'matrix') {
            elements.matrixContainer.style.display = 'grid';
            renderMatrix();
        }
    }
    export function switchView(viewName) {
        document.querySelectorAll('.view-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.view === viewName);
        });
        state.activeView = viewName;
        renderActiveView();
        showToast(`Switched view to ${viewName.toUpperCase()}`, 'info');
    }
    export function renderGrid() {
        const props = state.filteredProperties;
        if (!props.length) {
            elements.gridContainer.innerHTML = `
                <div style="grid-column: 1/-1; text-align:center; padding: 4rem; color: var(--text-muted); background: var(--bg-card); border-radius: 12px;">
                    <h3>No matching properties found</h3>
                    <p style="margin-top: 0.5rem;">Try adjusting your search criteria or resetting filters.</p>
                </div>
            `;
            return;
        }

        elements.gridContainer.innerHTML = props.map(p => {
            const ppsqft = p.sqft_finished ? Math.round(p.price / p.sqft_finished) : 0;
            const rfDelta = p.redfin_estimate ? Math.round(((p.price - p.redfin_estimate) / p.redfin_estimate) * 100) : null;
            let rfBadge = '';
            if (rfDelta !== null) {
                const isAbove = rfDelta > 0;
                rfBadge = `<span class="card-rf-delta ${isAbove ? 'delta-above' : 'delta-below'}">${isAbove ? '+' : ''}${rfDelta}% vs Redfin</span>`;
            }

            const matrixRev = getPropertyReviewStatus(p);
            let matrixBadge = '';
            if (matrixRev === 'favorite') matrixBadge = `<span class="badge-matrix-review badge-matrix-fav">⭐ Matrix Favorite</span>`;
            else if (matrixRev === 'possibility') matrixBadge = `<span class="badge-matrix-review badge-matrix-possibility">🤔 Matrix Possibility</span>`;
            else if (matrixRev === 'dislike') matrixBadge = `<span class="badge-matrix-review badge-matrix-dislike">🚫 Matrix Disliked</span>`;

            const displayAddr = cleanDisplayAddress(p.address, p.mls_id);
            const imgUrl = p.main_image_url || 'https://via.placeholder.com/400x250?text=No+Listing+Photo';

            return `
                <div class="property-card" data-mls="${p.mls_id}" onclick="openDetailModal('${p.mls_id}')">
                    <div class="card-media">
                        <img src="${imgUrl}" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='https://via.placeholder.com/400x250?text=No+Photo+Available';" class="card-img" alt="Property">
                        <span class="card-status-badge badge-${(p.status || 'Active').toLowerCase()}">${p.status}</span>
                        <button class="card-fav-btn ${p.favorite ? 'is-fav' : ''}" onclick="toggleFavorite('${p.mls_id}', event)">
                            ${p.favorite ? '★' : '☆'}
                        </button>
                    </div>
                    <div class="card-body">
                        <div class="card-price-row">
                            <span class="card-price">$${p.price.toLocaleString()}</span>
                            ${rfBadge}
                        </div>
                        <div>
                            <div class="card-address">${escapeHtml(displayAddr)}</div>
                            <div class="card-city">${p.city}, ${p.state} ${p.zip}</div>
                        </div>
                        <div class="card-stats">
                            <div class="stat-item"><span class="stat-val">${p.beds}</span><span class="stat-lbl">Beds</span></div>
                            <div class="stat-item"><span class="stat-val">${p.baths}</span><span class="stat-lbl">Baths</span></div>
                            <div class="stat-item"><span class="stat-val">${p.sqft_finished ? p.sqft_finished.toLocaleString() : 'N/A'}</span><span class="stat-lbl">Fin SqFt</span></div>
                            <div class="stat-item"><span class="stat-val">$${ppsqft}</span><span class="stat-lbl">$/SqFt</span></div>
                        </div>
                        <div class="card-scores">
                            <span class="score-badge">Yr: ${p.year_built || 'N/A'}</span>
                            <span class="score-badge">Lot: ${p.lot_acres ? p.lot_acres + ' ac' : (p.lot_sqft ? p.lot_sqft + ' sqft' : 'N/A')}</span>
                            ${p.walk_score ? `<span class="score-badge" style="background:#059669; color:#fff;">🚶 ${p.walk_score}/100</span>` : ''}
                            ${p.hoa_fee ? `<span class="score-badge" style="background:#d97706; color:#fff;">HOA: $${p.hoa_fee}</span>` : '<span class="score-badge">No HOA</span>'}
                            ${matrixBadge}
                        </div>
                        ${p.user_notes ? `<div class="card-notes-preview">📝 ${escapeHtml(p.user_notes)}</div>` : ''}
                    </div>
                </div>
            `;
        }).join('');
    }
    export function renderTable() {
        const props = state.filteredProperties;
        elements.tableContainer.innerHTML = `
            <table class="scout-table">
                <thead>
                    <tr>
                        <th>Status</th>
                        <th>MLS Review</th>
                        <th>Address</th>
                        <th>Price</th>
                        <th>Beds</th>
                        <th>Baths</th>
                        <th>Fin SqFt</th>
                        <th>$/SqFt</th>
                        <th>Lot</th>
                        <th>Built</th>
                        <th>HOA</th>
                        <th>Tax</th>
                        <th>WalkScore</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${props.map(p => {
                        const matrixRev = getPropertyReviewStatus(p);
                        let matrixBadge = '-';
                        if (matrixRev === 'favorite') matrixBadge = `<span class="badge-matrix-review badge-matrix-fav">⭐ Favorite</span>`;
                        else if (matrixRev === 'possibility') matrixBadge = `<span class="badge-matrix-review badge-matrix-possibility">🤔 Possibility</span>`;
                        else if (matrixRev === 'dislike') matrixBadge = `<span class="badge-matrix-review badge-matrix-dislike">🚫 Disliked</span>`;

                        return `
                            <tr onclick="openDetailModal('${p.mls_id}')" style="cursor:pointer;">
                                <td><span class="card-status-badge badge-${(p.status || 'Active').toLowerCase()}">${p.status}</span></td>
                                <td>${matrixBadge}</td>
                                <td><strong>${escapeHtml(cleanDisplayAddress(p.address, p.mls_id))}</strong><br><small style="color:var(--text-muted);">${p.city}, ${p.zip}</small></td>
                                <td style="font-weight:700; color:var(--accent-gold);">$${p.price.toLocaleString()}</td>
                                <td>${p.beds}</td>
                                <td>${p.baths}</td>
                                <td>${p.sqft_finished ? p.sqft_finished.toLocaleString() : '-'}</td>
                                <td>$${p.sqft_finished ? Math.round(p.price / p.sqft_finished) : '-'}</td>
                                <td>${p.lot_acres ? p.lot_acres + ' ac' : '-'}</td>
                                <td>${p.year_built || '-'}</td>
                                <td>${p.hoa_fee ? '$' + p.hoa_fee : 'No'}</td>
                                <td>${p.annual_tax ? '$' + p.annual_tax : '-'}</td>
                                <td>${p.walk_score ? p.walk_score + '/100' : '-'}</td>
                                <td>
                                    <button class="btn btn-secondary" style="padding:2px 8px; font-size:0.75rem;" onclick="event.stopPropagation(); openDetailModal('${p.mls_id}')">View</button>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        `;
    }
    export function renderMatrix() {
        const props = state.filteredProperties.slice(0, 4); // Compare top 4
        if (!props.length) {
            elements.matrixContainer.innerHTML = '<div style="padding:2rem; color:var(--text-muted);">Select or filter properties to compare side-by-side.</div>';
            return;
        }

        // Calculate best metrics across compared properties
        const bestPrice = Math.min(...props.map(p => p.price));
        const bestPpsqft = Math.min(...props.map(p => p.sqft_finished ? Math.round(p.price / p.sqft_finished) : Infinity));
        const bestSqft = Math.max(...props.map(p => p.sqft_finished || 0));
        const bestWalkScore = Math.max(...props.map(p => p.walk_score || 0));
        const bestYearBuilt = Math.max(...props.map(p => p.year_built || 0));
        const bestHoaFee = Math.min(...props.map(p => (p.hoa_fee !== null && p.hoa_fee !== undefined) ? p.hoa_fee : 0));

        const rows = [
            { label: 'Property Photo', fn: p => `<img src="${p.main_image_url || 'https://via.placeholder.com/200x120?text=No+Photo'}" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='https://via.placeholder.com/200x120?text=No+Photo';" style="width:100%; height:120px; object-fit:cover; border-radius:6px; cursor:pointer;" onclick="openDetailModal('${p.mls_id}')">` },
            { label: 'Address', fn: p => `<strong style="cursor:pointer; color:var(--accent-blue);" onclick="openDetailModal('${p.mls_id}')">${escapeHtml(cleanDisplayAddress(p.address, p.mls_id))}</strong><br>${p.city}, ${p.zip}` },
            { label: 'MLS Review', fn: p => {
                const matrixRev = getPropertyReviewStatus(p);
                if (matrixRev === 'favorite') return `<span class="badge-matrix-review badge-matrix-fav">⭐ Favorite</span>`;
                if (matrixRev === 'possibility') return `<span class="badge-matrix-review badge-matrix-possibility">🤔 Possibility</span>`;
                if (matrixRev === 'dislike') return `<span class="badge-matrix-review badge-matrix-dislike">🚫 Disliked</span>`;
                return '<span style="color:var(--text-muted);">📋 Unreviewed</span>';
            }},
            { label: 'List Price', fn: p => `<strong style="font-size:1.1rem; color:var(--accent-gold);">$${p.price.toLocaleString()}</strong>`, isWinner: p => p.price === bestPrice },
            { label: 'Redfin Estimate', fn: p => p.redfin_estimate ? `$${p.redfin_estimate.toLocaleString()}` : 'N/A' },
            { label: 'Beds / Baths', fn: p => `${p.beds} Beds / ${p.baths} Baths` },
            { label: 'Finished SqFt', fn: p => p.sqft_finished ? p.sqft_finished.toLocaleString() : 'N/A', isWinner: p => p.sqft_finished === bestSqft && bestSqft > 0 },
            { label: 'Price per SqFt', fn: p => `$${p.sqft_finished ? Math.round(p.price / p.sqft_finished) : 'N/A'}`, isWinner: p => p.sqft_finished && Math.round(p.price / p.sqft_finished) === bestPpsqft },
            { label: 'Year Built', fn: p => p.year_built || 'N/A', isWinner: p => p.year_built === bestYearBuilt && bestYearBuilt > 0 },
            { label: 'Lot Size', fn: p => p.lot_acres ? `${p.lot_acres} Acres` : 'N/A' },
            { label: 'HOA Fee', fn: p => p.hoa_fee ? `$${p.hoa_fee}/yr` : 'No HOA', isWinner: p => (p.hoa_fee || 0) === bestHoaFee },
            { label: 'Annual Tax', fn: p => p.annual_tax ? `$${p.annual_tax}` : 'N/A' },
            { label: 'WalkScore', fn: p => p.walk_score ? `${p.walk_score} / 100` : 'N/A', isWinner: p => p.walk_score === bestWalkScore && bestWalkScore > 0 },
            { label: 'School District', fn: p => p.school_district || 'N/A' }
        ];

        let html = '';
        rows.forEach(r => {
            html += `<div class="matrix-row-header">${r.label}</div>`;
            props.forEach(p => {
                const isWin = r.isWinner && r.isWinner(p);
                html += `<div class="matrix-cell ${isWin ? 'matrix-cell-winner' : ''}">${r.fn(p)}</div>`;
            });
        });

        elements.matrixContainer.innerHTML = html;
        elements.matrixContainer.style.gridTemplateColumns = `180px repeat(${props.length}, 1fr)`;
    }
