/**
 * MLS & Redfin Property Scout - View Switching & Renderers (grid/table/matrix)
 */
import { state, elements } from './state.js';
import { getPropertyReviewStatus, cleanDisplayAddress, escapeHtml, NO_PHOTO_IMG } from './properties.js';
import { renderMap, highlightMapMarker, unhighlightMapMarker } from './map.js';
import { showToast } from './toast.js';
import { updateCompareButtons } from './compare.js';
import { renderAdminView } from './adminView.js';


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

        if (elements.kpiTotal) elements.kpiTotal.innerText = filtered.length;
        if (elements.kpiTotalSub) elements.kpiTotalSub.innerText = `${activeCount} Active`;
        if (elements.kpiFavorites) elements.kpiFavorites.innerText = favCount;
        if (elements.kpiShared) elements.kpiShared.innerText = sharedCount;
        if (elements.kpiAvgPrice) elements.kpiAvgPrice.innerText = `$${avgPrice.toLocaleString()}`;
        if (elements.kpiAvgSqftPrice) elements.kpiAvgSqftPrice.innerText = `$${avgPpsqft} / SqFt`;
        if (elements.kpiAvgSqft) elements.kpiAvgSqft.innerText = `${avgSqft.toLocaleString()}`;
    }

    export function renderActiveView() {
        if (state.activeView === 'admin' && !state.isAdmin) {
            state.activeView = 'grid';
            if (window.history && window.history.replaceState) {
                window.history.replaceState(null, '', '#grid');
            }
        }
        elements.gridContainer.style.display = 'none';
        if (elements.mapContainer) elements.mapContainer.style.display = 'none';
        elements.tableContainer.style.display = 'none';
        elements.matrixContainer.style.display = 'none';
        const realtorContainer = document.getElementById('view-realtor-container');
        if (realtorContainer) realtorContainer.style.display = 'none';
        const adminContainer = document.getElementById('view-admin-container');
        if (adminContainer) adminContainer.style.display = 'none';

        const statsBar = document.querySelector('.stats-bar');
        const topFilterContainer = document.querySelector('.top-filter-container');

        if (state.activeView === 'realtor') {
            if (statsBar) statsBar.style.display = 'none';
            if (topFilterContainer) topFilterContainer.style.display = 'none';
            if (realtorContainer) {
                realtorContainer.style.display = 'block';
                if (window.renderRealtorView) window.renderRealtorView();
            }
        } else if (state.activeView === 'admin') {
            if (statsBar) statsBar.style.display = 'none';
            if (topFilterContainer) topFilterContainer.style.display = 'none';
            if (adminContainer) {
                adminContainer.style.display = 'block';
                renderAdminView();
            }
        } else {
            if (statsBar) statsBar.style.display = 'grid';
            if (topFilterContainer) topFilterContainer.style.display = 'block';

            if (state.activeView === 'grid') {
                elements.gridContainer.style.display = 'grid';
                renderGrid(elements.gridContainer, false);
            } else if (state.activeView === 'map') {
                if (elements.mapContainer) elements.mapContainer.style.display = 'flex';
                renderMap();
                if (elements.mapCardsContainer) {
                    renderGrid(elements.mapCardsContainer, true);
                }
            } else if (state.activeView === 'table') {
                elements.tableContainer.style.display = 'block';
                renderTable();
            } else if (state.activeView === 'matrix') {
                elements.matrixContainer.style.display = 'grid';
                renderMatrix();
            }
        }
    }
import { savePreferencesToServer } from './api.js';

export function switchView(viewName) {
    document.querySelectorAll('.view-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.view === viewName);
    });
    state.activeView = viewName;
    localStorage.setItem('scout_active_view', viewName);
    if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', '#' + viewName);
    } else {
        window.location.hash = viewName;
    }
    renderActiveView();
    savePreferencesToServer();
    showToast(`Switched view to ${viewName.toUpperCase()}`, 'info');
}

    export function buildPropertyCardHtml(p) {
        const ppsqft = p.sqft_finished ? Math.round(p.price / p.sqft_finished) : 0;
        const rfDelta = p.redfin_estimate ? Math.round(((p.price - p.redfin_estimate) / p.redfin_estimate) * 100) : null;
        let rfBadge = '';
        if (rfDelta !== null) {
            const isAbove = rfDelta > 0;
            rfBadge = `<span class="card-rf-delta ${isAbove ? 'delta-above' : 'delta-below'}">${isAbove ? '+' : ''}${rfDelta}% vs Redfin</span>`;
        }

        const matrixRev = getPropertyReviewStatus(p);
        let matrixBadge = '';
        if (matrixRev === 'favorite') matrixBadge = `<span class="badge-matrix-review badge-matrix-fav"><i data-lucide="star"></i> Matrix Favorite</span>`;
        else if (matrixRev === 'possibility') matrixBadge = `<span class="badge-matrix-review badge-matrix-possibility"><i data-lucide="circle-help"></i> Matrix Possibility</span>`;
        else if (matrixRev === 'dislike') matrixBadge = `<span class="badge-matrix-review badge-matrix-dislike"><i data-lucide="ban"></i> Matrix Disliked</span>`;

        const displayAddr = cleanDisplayAddress(p.address, p.mls_id);
        const imgUrl = p.main_image_url || NO_PHOTO_IMG;

        let photoCount = 0;
        if (p.photo_count) {
            photoCount = p.photo_count;
        } else if (Array.isArray(p.gallery_images)) {
            photoCount = p.gallery_images.length;
        } else if (typeof p.gallery_images === 'string') {
            try { photoCount = JSON.parse(p.gallery_images).length; } catch(e) {}
        }
        const photoBadge = photoCount > 1 ? `<span class="card-photo-count-badge"><i data-lucide="images"></i> ${photoCount}</span>` : '';

        const isComparing = state.compareList && state.compareList.includes(String(p.mls_id));

        return `
            <div class="property-card" data-mls="${p.mls_id}" onclick="openDetailModal('${p.mls_id}')">
                <div class="card-media">
                    <img src="${escapeHtml(imgUrl)}" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${NO_PHOTO_IMG}';" class="card-img" alt="${escapeHtml(p.address || 'Property photo')}">
                    <span class="card-status-badge badge-${(p.status || 'Active').toLowerCase().replace(/[^a-z0-9-]/g, '')}">${escapeHtml(p.status || '')}</span>
                    ${photoBadge}
                    <button class="card-fav-btn ${p.favorite ? 'is-fav' : ''}" onclick="toggleFavorite('${p.mls_id}', event)" aria-label="${p.favorite ? 'Remove from favorites' : 'Add to favorites'}" aria-pressed="${p.favorite ? 'true' : 'false'}" title="${p.favorite ? 'Remove from favorites' : 'Add to favorites'}">
                        <svg class="fav-star-icon" viewBox="0 0 24 24" fill="${p.favorite ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><path d="M12 2.5l2.98 6.04 6.67.97-4.83 4.7 1.14 6.65L12 17.77l-5.96 3.13 1.14-6.65-4.83-4.7 6.67-.97L12 2.5z"/></svg>
                    </button>
                </div>
                <div class="card-body">
                    <div class="card-price-row">
                        <span class="card-price font-serif">$${p.price.toLocaleString()}</span>
                        ${rfBadge}
                    </div>
                    <div>
                        <div class="card-address">${escapeHtml(displayAddr)}</div>
                        <div class="card-city">${escapeHtml(p.city || '')}, ${escapeHtml(p.state || '')} ${escapeHtml(p.zip || '')}</div>
                    </div>
                    <div class="card-stats">
                        <div class="stat-item"><span class="stat-val">${p.beds}</span><span class="stat-lbl">Beds</span></div>
                        <div class="stat-item"><span class="stat-val">${p.baths}</span><span class="stat-lbl">Baths</span></div>
                        <div class="stat-item"><span class="stat-val">${p.sqft_finished ? p.sqft_finished.toLocaleString() : 'N/A'}</span><span class="stat-lbl">Finished SqFt</span></div>
                        <div class="stat-item"><span class="stat-val">$${ppsqft}</span><span class="stat-lbl">$/SqFt</span></div>
                    </div>
                    <div class="card-scores">
                        <span class="score-badge">Built: ${p.year_built || 'N/A'}</span>
                        <span class="score-badge">Lot: ${p.lot_acres ? p.lot_acres + ' acres' : (p.lot_sqft ? p.lot_sqft.toLocaleString() + ' sqft' : 'N/A')}</span>
                        ${p.walk_score ? `<span class="score-badge" style="background:#4F7A46; color:#fff;"><i data-lucide="footprints"></i> ${p.walk_score}/100</span>` : ''}
                        ${p.hoa_fee ? `<span class="score-badge" style="background:#B87A2A; color:#fff;">HOA: $${p.hoa_fee}</span>` : '<span class="score-badge">No HOA</span>'}
                        ${matrixBadge}
                    </div>
                    ${p.user_notes ? `<div class="card-notes-preview"><i data-lucide="file-text"></i> ${escapeHtml(p.user_notes)}</div>` : ''}
                    <div class="card-footer-row">
                        <label class="card-compare-checkbox-label ${isComparing ? 'is-checked' : ''}" onclick="event.stopPropagation();" title="Select to include in Compare Matrix (up to 4)">
                            <input type="checkbox" class="card-compare-checkbox" data-mls="${p.mls_id}" ${isComparing ? 'checked' : ''} onchange="window.handleToggleCompare('${p.mls_id}', event)">
                            <span class="checkbox-text">${isComparing ? '✓ Comparing' : 'Compare'}</span>
                        </label>
                    </div>
                </div>
            </div>
        `;
    }

    export function renderGrid(containerEl = elements.gridContainer, attachMapHoverEvents = false) {
        if (!containerEl) return;
        const props = state.filteredProperties;
        if (!props.length) {
            containerEl.innerHTML = `
                <div style="grid-column: 1/-1; text-align:center; padding: 4rem; color: var(--text-muted); background: var(--bg-card); border-radius: 12px;">
                    <h3>No matching properties found</h3>
                    <p style="margin-top: 0.5rem;">Try adjusting your search criteria or resetting filters.</p>
                </div>
            `;
            return;
        }

        containerEl.innerHTML = props.map(buildPropertyCardHtml).join('');
        if (window.lucide) window.lucide.createIcons();
        updateCompareButtons();

        if (attachMapHoverEvents) {
            containerEl.querySelectorAll('.property-card').forEach(card => {
                const mls = card.dataset.mls;
                if (!mls) return;
                card.addEventListener('mouseenter', () => highlightMapMarker(mls));
                card.addEventListener('mouseleave', () => unhighlightMapMarker(mls));
            });
        }
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
                        if (matrixRev === 'favorite') matrixBadge = `<span class="badge-matrix-review badge-matrix-fav"><i data-lucide="star"></i> Favorite</span>`;
                        else if (matrixRev === 'possibility') matrixBadge = `<span class="badge-matrix-review badge-matrix-possibility"><i data-lucide="circle-help"></i> Possibility</span>`;
                        else if (matrixRev === 'dislike') matrixBadge = `<span class="badge-matrix-review badge-matrix-dislike"><i data-lucide="ban"></i> Disliked</span>`;

                        return `
                            <tr onclick="openDetailModal('${p.mls_id}')" style="cursor:pointer;">
                                <td><span class="card-status-badge badge-${escapeHtml((p.status || 'Active').toLowerCase())}">${escapeHtml(p.status || '')}</span></td>
                                <td>${matrixBadge}</td>
                                <td><strong>${escapeHtml(cleanDisplayAddress(p.address, p.mls_id))}</strong><br><small style="color:var(--text-muted);">${escapeHtml(p.city || '')}, ${escapeHtml(p.zip || '')}</small></td>
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
        if (window.lucide) window.lucide.createIcons();
    }
    export function renderMatrix() {
        let props = [];
        let isCustomSelection = false;

        // 1. Prioritize user's explicitly selected compare dock items
        if (state.compareList && state.compareList.length > 0) {
            props = state.compareList.map(mls => 
                state.allProperties.find(p => String(p.mls_id) === String(mls))
            ).filter(Boolean);
            isCustomSelection = true;
        }

        // 2. If no custom selection, fallback to top 4 of filtered search results
        if (!props.length) {
            props = state.filteredProperties.slice(0, 4);
        }

        if (!props.length) {
            elements.matrixContainer.innerHTML = `
                <div class="matrix-info-banner" style="grid-column: 1/-1;">
                    <div class="matrix-info-header">
                        <div class="matrix-info-title"><i data-lucide="scale"></i> Compare Matrix</div>
                    </div>
                    <p style="font-size:0.85rem; color:var(--text-muted); margin-top:0.3rem;">
                        No properties match your active search filters. Try resetting filters, or click <code>+ Compare</code> on property cards to pick custom homes for side-by-side comparison.
                    </p>
                </div>
            `;
            if (window.lucide) window.lucide.createIcons();
            return;
        }

        // Calculate best metrics across compared properties
        const bestPrice = Math.min(...props.map(p => p.price));
        const bestPpsqft = Math.min(...props.map(p => p.sqft_finished ? Math.round(p.price / p.sqft_finished) : Infinity));
        const bestSqft = Math.max(...props.map(p => p.sqft_finished || 0));
        const bestWalkScore = Math.max(...props.map(p => p.walk_score || 0));
        const bestYearBuilt = Math.max(...props.map(p => p.year_built || 0));
        const bestHoaFee = Math.min(...props.map(p => (p.hoa_fee !== null && p.hoa_fee !== undefined) ? p.hoa_fee : 0));

        const selectionBadgeText = isCustomSelection 
            ? `${props.length} Custom Selected Property(ies)` 
            : `Top ${props.length} of ${state.filteredProperties.length} Filtered Listings`;

        const selectionExplanation = isCustomSelection
            ? `Showing <strong>${props.length} hand-picked property(ies)</strong> from your compare list. Use the column dropdowns below to swap properties!`
            : `Showing top <strong>${props.length}</strong> listings based on current search & sort order. Use the column dropdowns below or click <strong>+ Compare</strong> on cards to pick exact properties!`;

        const bannerHtml = `
            <div class="matrix-info-banner" style="grid-column: 1/-1;">
                <div class="matrix-info-header">
                    <div class="matrix-info-title">
                        <span><i data-lucide="scale"></i> Side-by-Side Property Matrix</span>
                    </div>
                    <span class="badge-gold">${selectionBadgeText}</span>
                </div>
                <div class="matrix-info-grid">
                    <div class="matrix-info-item">
                        <span><i data-lucide="target"></i></span>
                        <div>${selectionExplanation}</div>
                    </div>
                    <div class="matrix-info-item">
                        <span><i data-lucide="trophy"></i></span>
                        <div>
                            <strong>Winner Highlights:</strong> Green highlighted boxes indicate best-in-class values (Lowest Price, Lowest $/SqFt, Largest Area, Newest Year, Lowest HOA, & Highest WalkScore).
                        </div>
                    </div>
                    <div class="matrix-info-item">
                        <span><i data-lucide="lightbulb"></i></span>
                        <div>
                            <strong>Swap Column Homes:</strong> Click any column header dropdown below to change which home is displayed in that column!
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Available properties for selection dropdowns (Favorites / Filtered first, then all)
        const availableProps = state.filteredProperties.length ? state.filteredProperties : state.allProperties;

        const rows = [
            { label: 'Column Selection', fn: (p, idx) => `
                <select class="matrix-col-select input-text" data-col-idx="${idx}" style="font-size:0.75rem; padding:0.25rem 0.4rem; width:100%; font-weight:600; background:var(--bg-input); border-color:var(--border-color); color:var(--accent-gold);">
                    ${availableProps.map(ap => `
                        <option value="${ap.mls_id}" ${String(ap.mls_id) === String(p.mls_id) ? 'selected' : ''}>
                            ${ap.favorite ? '⭐ ' : ''}${escapeHtml(cleanDisplayAddress(ap.address, ap.mls_id))} ($${ap.price.toLocaleString()})
                        </option>
                    `).join('')}
                </select>
            ` },
            { label: 'Property Photo', fn: p => `<img src="${escapeHtml(p.main_image_url || NO_PHOTO_IMG)}" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${NO_PHOTO_IMG}';" style="width:100%; height:120px; object-fit:cover; border-radius:6px; cursor:pointer;" onclick="openDetailModal('${p.mls_id}')" alt="${escapeHtml(p.address || 'Property photo')}">` },
            { label: 'Address', fn: p => `<strong style="cursor:pointer; color:var(--accent-blue);" onclick="openDetailModal('${p.mls_id}')">${escapeHtml(cleanDisplayAddress(p.address, p.mls_id))}</strong><br>${escapeHtml(p.city || '')}, ${escapeHtml(p.zip || '')}` },
            { label: 'MLS Review', fn: p => {
                const matrixRev = getPropertyReviewStatus(p);
                if (matrixRev === 'favorite') return `<span class="badge-matrix-review badge-matrix-fav"><i data-lucide="star"></i> Favorite</span>`;
                if (matrixRev === 'possibility') return `<span class="badge-matrix-review badge-matrix-possibility"><i data-lucide="circle-help"></i> Possibility</span>`;
                if (matrixRev === 'dislike') return `<span class="badge-matrix-review badge-matrix-dislike"><i data-lucide="ban"></i> Disliked</span>`;
                return '<span style="color:var(--text-muted);"><i data-lucide="clipboard-list"></i> Unreviewed</span>';
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
            { label: 'School District', fn: p => escapeHtml(p.school_district || 'N/A') }
        ];

        let html = bannerHtml;
        rows.forEach(r => {
            html += `<div class="matrix-row-header">${r.label}</div>`;
            props.forEach((p, idx) => {
                const isWin = r.isWinner && r.isWinner(p);
                html += `<div class="matrix-cell ${isWin ? 'matrix-cell-winner' : ''}">${r.fn(p, idx)}</div>`;
            });
        });

        elements.matrixContainer.innerHTML = html;
        elements.matrixContainer.style.gridTemplateColumns = `180px repeat(${props.length}, 1fr)`;
        if (window.lucide) window.lucide.createIcons();

        // Attach event listeners for column dropdown selection swaps
        elements.matrixContainer.querySelectorAll('.matrix-col-select').forEach(select => {
            select.addEventListener('change', (e) => {
                const colIdx = parseInt(e.target.dataset.colIdx, 10);
                const newMlsId = String(e.target.value);

                // Build or update state.compareList
                if (!state.compareList || state.compareList.length === 0) {
                    state.compareList = props.map(p => String(p.mls_id));
                }
                state.compareList[colIdx] = newMlsId;
                
                // Re-render Matrix immediately
                renderMatrix();
            });
        });
    }

window.switchView = switchView;
window.renderActiveView = renderActiveView;
window.updateKPIs = updateKPIs;
