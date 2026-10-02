/**
 * Nycto's MLS Property Scout - View Switching & Renderers (grid/table/matrix)
 */
import { state, elements } from './state.js';
import { getPropertyReviewStatus, cleanDisplayAddress, escapeHtml, NO_PHOTO_IMG, getStatusBadgeClass } from './properties.js';
import { renderMap, highlightMapMarker, unhighlightMapMarker, getPropertiesInView } from './map.js';
import { showToast } from './toast.js';
import { updateCompareButtons } from './compare.js';
import { renderAdminView } from './adminView.js';
import { apiFetch } from './api.js';

function tryParseTags(jsonStr) {
    if (!jsonStr) return [];
    try {
        const parsed = JSON.parse(jsonStr);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        return [];
    }
}

export async function fetchAdminStats() {
    if (!state.authenticated || !state.isAdmin) return;
    try {
        const [usersResult, cleanupResult] = await Promise.all([
            apiFetch('backend/api.php?action=list_users'),
            apiFetch('backend/api.php?action=admin_cleanup_preview')
        ]);
        const users = usersResult?.users || [];
        const summary = cleanupResult?.summary || {};
        state.adminStats = {
            userCount: users.length,
            clientCount: users.filter(u => u.role === 'client').length,
            missingAddressCount: summary.missing_address_count || 0,
            orphanFilesCount: summary.orphan_files_count || 0,
            invalidImageCount: summary.invalid_primary_preview_count || 0
        };
        updateKPIs();
    } catch (e) {
        console.error('Error fetching admin stats:', e);
    }
}
window.fetchAdminStats = fetchAdminStats;

export function updateKPIs() {
    const statsBar = document.querySelector('.stats-bar');
    if (!statsBar) return;

    const total = state.allProperties.length;
    const filtered = state.filteredProperties;
    const activeCount = filtered.filter(p => p.status === 'Active').length;

    if (state.authenticated && state.isAdmin) {
        const stats = state.adminStats || {
            userCount: '-',
            clientCount: '-',
            missingAddressCount: 0,
            orphanFilesCount: 0
        };
        const hiddenCount = state.allProperties.filter(p => p.is_hidden).length;

        statsBar.innerHTML = `
            <section class="user-top-panel">
                <div class="user-top-panel-header">
                    <div>
                        <h2 class="user-top-panel-title"><i data-lucide="shield-check"></i> System Operations</h2>
                        <p class="user-top-panel-sub">System metrics, user accounts & data maintenance.</p>
                    </div>
                </div>
                <div class="user-top-panel-grid">
                    <div class="user-panel-card" onclick="if(window.switchView) window.switchView('admin');" title="Open Admin Operations">
                        <div class="user-panel-card-header">
                            <span class="user-panel-card-label">Listings DB</span>
                            <i data-lucide="database" style="color:var(--accent-emerald);"></i>
                        </div>
                        <div class="user-panel-card-value">${total}</div>
                        <div class="user-panel-card-sub">${activeCount} Active${hiddenCount ? ` / ${hiddenCount} Hidden` : ''}</div>
                    </div>

                    <div class="user-panel-card" onclick="if(window.openUserMgmtModal) window.openUserMgmtModal();" title="Open User Management">
                        <div class="user-panel-card-header">
                            <span class="user-panel-card-label">User Roster</span>
                            <i data-lucide="users" style="color:var(--accent-blue);"></i>
                        </div>
                        <div class="user-panel-card-value">${stats.userCount}</div>
                        <div class="user-panel-card-sub">${stats.clientCount === '-' ? 'User Accounts' : `${stats.clientCount} Client accounts`}</div>
                    </div>

                    <div class="user-panel-card" onclick="if(window.switchView) window.switchView('admin');" title="View Address Quality Queue" style="${stats.missingAddressCount > 0 ? 'border-color: rgba(176,70,58,0.5);' : ''}">
                        <div class="user-panel-card-header">
                            <span class="user-panel-card-label">Address Fix</span>
                            <i data-lucide="map-pin-off" style="color:${stats.missingAddressCount > 0 ? 'var(--accent-red)' : 'var(--text-muted)'};"></i>
                        </div>
                        <div class="user-panel-card-value" style="${stats.missingAddressCount > 0 ? 'color: var(--accent-red);' : ''}">${stats.missingAddressCount}</div>
                        <div class="user-panel-card-sub">Listings needing fix</div>
                    </div>

                    <div class="user-panel-card" onclick="if(window.openAdminCleanupModal) window.openAdminCleanupModal();" title="Open Media Cleanup" style="${stats.orphanFilesCount > 0 ? 'border-color: rgba(184,122,42,0.5);' : ''}">
                        <div class="user-panel-card-header">
                            <span class="user-panel-card-label">Media Cleanup</span>
                            <i data-lucide="image-off" style="color:${stats.orphanFilesCount > 0 ? 'var(--accent-gold)' : 'var(--text-muted)'};"></i>
                        </div>
                        <div class="user-panel-card-value" style="${stats.orphanFilesCount > 0 ? 'color: var(--accent-gold);' : ''}">${stats.orphanFilesCount}</div>
                        <div class="user-panel-card-sub">Files to clean</div>
                    </div>
                </div>
            </section>
        `;
    } else {
        // In map view, stats describe only what's visible on the map; elsewhere, all filtered.
        const inMapView = state.activeView === 'map';
        const shown = inMapView ? getPropertiesInView() : filtered;
        const isSubset = inMapView && shown.length < filtered.length;
        const shownActiveCount = shown.filter(p => p.status === 'Active').length;

        const calcAverages = (list) => {
            const tp = list.reduce((acc, p) => acc + (p.price || 0), 0);
            const ts = list.reduce((acc, p) => acc + (p.sqft_finished || 0), 0);
            return {
                avgPrice: list.length ? Math.round(tp / list.length) : 0,
                avgSqft: list.length ? Math.round(ts / list.length) : 0,
                avgPpsqft: ts ? Math.round(tp / ts) : 0
            };
        };
        const { avgPrice, avgSqft, avgPpsqft } = calcAverages(shown);
        const overall = calcAverages(filtered);

        const pctDiff = (val, base) => {
            if (!val || !base) return '<span>—</span>';
            const pct = Math.round(((val - base) / base) * 100);
            if (pct === 0) return '<span>±0%</span>';
            return pct > 0 ? `<span class="kpi-up">+${pct}%</span>` : `<span class="kpi-down">−${Math.abs(pct)}%</span>`;
        };
        const compareHtml = (isSubset && shown.length)
            ? `<div class="user-panel-card-compare" title="All ${filtered.length}: $${overall.avgPrice.toLocaleString()} avg · $${overall.avgPpsqft} / SqFt">Price ${pctDiff(avgPrice, overall.avgPrice)} · $/SqFt ${pctDiff(avgPpsqft, overall.avgPpsqft)} vs all ${filtered.length}</div>`
            : '';

        const priceDropCount = shown.filter(p => p.price_reduced || p.price_drop || (p.original_price && p.original_price > p.price)).length;
        
        function parseListDate(dateStr) {
            if (!dateStr) return null;
            const str = String(dateStr).trim();
            const parts = str.split('/');
            if (parts.length === 3) {
                let m = parseInt(parts[0], 10) - 1;
                let d = parseInt(parts[1], 10);
                let y = parseInt(parts[2], 10);
                if (y < 100) y += 2000;
                const dt = new Date(y, m, d);
                if (!Number.isNaN(dt.getTime())) return dt;
            }
            const isoDt = new Date(str.replace(' ', 'T'));
            if (!Number.isNaN(isoDt.getTime())) return isoDt;
            return null;
        }

        const nowMs = Date.now();
        const domList = shown.map(p => {
            if (typeof p.days_on_market === 'number') return p.days_on_market;
            const dt = parseListDate(p.list_date);
            if (dt) {
                const days = Math.max(0, Math.round((nowMs - dt.getTime()) / (1000 * 60 * 60 * 24)));
                return Number.isNaN(days) ? null : days;
            }
            return null;
        }).filter(val => val !== null);
        const hasRealDom = domList.length > 0;
        const avgDom = hasRealDom ? Math.round(domList.reduce((a, b) => a + b, 0) / domList.length) : 0;

        const collapsedText = document.getElementById('dashboard-collapsed-summary-text');
        if (collapsedText) {
            collapsedText.innerHTML = `<b>${inMapView ? `${shown.length} of ${filtered.length}` : filtered.length}</b> Properties &nbsp;•&nbsp; <b>$${avgPrice.toLocaleString()}</b> Avg Price &nbsp;•&nbsp; <b>${priceDropCount}</b> Price Drops${hasRealDom ? ` &nbsp;•&nbsp; Avg <b>${avgDom} Days</b>` : ''}`;
        }

        statsBar.innerHTML = `
            <section class="user-top-panel">
                <div class="user-top-panel-header">
                    <div>
                        <h2 class="user-top-panel-title"><i data-lucide="bar-chart-3"></i> Search Intelligence</h2>
                        <p class="user-top-panel-sub">Live metrics for current search criteria.</p>
                    </div>
                    <button class="btn-dashboard-collapse" onclick="if(window.toggleUserDashboard) window.toggleUserDashboard(true);" title="Collapse Dashboard Metrics" type="button">
                        <i data-lucide="chevron-up"></i> Collapse
                    </button>
                </div>
                <div class="user-top-panel-grid">
                    <div class="user-panel-card" title="${inMapView ? 'Properties visible in the map area / total matching filters' : 'Total properties matching current filters'}">
                        <div class="user-panel-card-header">
                            <span class="user-panel-card-label">${inMapView ? 'Properties in View' : 'Properties'}</span>
                            <i data-lucide="home" style="color:var(--accent-emerald);"></i>
                        </div>
                        <div class="user-panel-card-value">${shown.length}${inMapView ? ` <span class="kpi-of">of ${filtered.length}</span>` : ''}</div>
                        <div class="user-panel-card-sub">${shownActiveCount} Active listings</div>
                    </div>

                    <div class="user-panel-card" title="Properties with recent price reductions">
                        <div class="user-panel-card-header">
                            <span class="user-panel-card-label">Price Drops</span>
                            <i data-lucide="trending-down" style="color:${priceDropCount ? 'var(--accent-emerald)' : 'var(--accent-gold)'};"></i>
                        </div>
                        <div class="user-panel-card-value">${priceDropCount}</div>
                        <div class="user-panel-card-sub">${priceDropCount ? 'Recent price cuts' : 'Active reductions'}</div>
                    </div>

                    <div class="user-panel-card" title="Average listing price and price per sqft">
                        <div class="user-panel-card-header">
                            <span class="user-panel-card-label">Avg List Price</span>
                            <i data-lucide="dollar-sign" style="color:var(--accent-gold);"></i>
                        </div>
                        <div class="user-panel-card-value">$${avgPrice.toLocaleString()}</div>
                        <div class="user-panel-card-sub">$${avgPpsqft} / SqFt</div>
                        ${compareHtml}
                    </div>

                    <div class="user-panel-card" title="${hasRealDom ? 'Average days on market' : 'Average finished square footage'}">
                        <div class="user-panel-card-header">
                            <span class="user-panel-card-label">${hasRealDom ? 'Avg Market Time' : 'Avg SqFt'}</span>
                            <i data-lucide="${hasRealDom ? 'clock' : 'ruler'}" style="color:var(--accent-blue);"></i>
                        </div>
                        <div class="user-panel-card-value">${hasRealDom ? `${avgDom} Days` : avgSqft.toLocaleString()}</div>
                        <div class="user-panel-card-sub">${hasRealDom ? 'Average listing age' : 'Finished living area'}</div>
                    </div>
                </div>
            </section>
        `;
    }

    if (window.lucide) window.lucide.createIcons();
}

window.toggleUserDashboard = function(collapse) {
    const topGrid = document.querySelector('.user-dashboard-top-grid');
    const strip = document.getElementById('dashboard-collapsed-strip');
    const isCollapsed = collapse !== undefined ? collapse : !topGrid?.classList.contains('collapsed');

    if (topGrid) {
        if (isCollapsed) {
            topGrid.classList.add('collapsed');
            if (strip) strip.style.display = 'flex';
            localStorage.setItem('user_dashboard_collapsed', 'true');
        } else {
            topGrid.classList.remove('collapsed');
            if (strip) strip.style.display = 'none';
            localStorage.setItem('user_dashboard_collapsed', 'false');
        }
    }
    if (window.lucide) window.lucide.createIcons();
};

export function syncDashboardCollapseState() {
    const isCollapsed = localStorage.getItem('user_dashboard_collapsed') === 'true';
    const topGrid = document.querySelector('.user-dashboard-top-grid');
    const strip = document.getElementById('dashboard-collapsed-strip');
    if (topGrid && isCollapsed) {
        topGrid.classList.add('collapsed');
        if (strip) strip.style.display = 'flex';
    } else if (topGrid) {
        topGrid.classList.remove('collapsed');
        if (strip) strip.style.display = 'none';
    }
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

        const topGrid = document.querySelector('.user-dashboard-top-grid');
        const statsBar = document.querySelector('.stats-bar');
        const topFilterContainer = document.querySelector('.top-filter-container');

        if (state.activeView === 'realtor') {
            if (topGrid) topGrid.style.display = 'none';
            if (statsBar) statsBar.style.display = 'none';
            if (topFilterContainer) topFilterContainer.style.display = 'none';
            if (realtorContainer) {
                realtorContainer.style.display = 'block';
                if (window.renderRealtorView) window.renderRealtorView();
            }
        } else if (state.activeView === 'admin') {
            if (topGrid) topGrid.style.display = 'none';
            if (statsBar) statsBar.style.display = 'none';
            if (topFilterContainer) topFilterContainer.style.display = 'none';
            if (adminContainer) {
                adminContainer.style.display = 'block';
                renderAdminView();
            }
        } else {
            if (topGrid) topGrid.style.display = 'grid';
            if (statsBar) statsBar.style.display = 'grid';
            if (topFilterContainer) topFilterContainer.style.display = 'block';
            syncDashboardCollapseState();

            if (state.activeView === 'grid') {
                elements.gridContainer.style.display = 'grid';
                renderGrid(elements.gridContainer, false);
            } else if (state.activeView === 'map') {
                if (elements.mapContainer) elements.mapContainer.style.display = 'flex';
                renderMap();
                renderMapCards();
            } else if (state.activeView === 'table') {
                elements.tableContainer.style.display = 'block';
                renderTable();
            } else if (state.activeView === 'matrix') {
                elements.matrixContainer.style.display = 'grid';
                renderMatrix();
            }
            // Stats depend on the active view (map view = only what's on screen), so refresh
            // them after the view (and its map pins) are rendered.
            updateKPIs();
        }
    }

    // Map view: cards + "X of Y" count for only the pins inside the visible map area.
    function renderMapCards() {
        if (!elements.mapCardsContainer) return;
        const inView = getPropertiesInView();
        const total = state.filteredProperties.length;
        const countEl = document.getElementById('map-results-count');
        if (countEl) {
            countEl.innerHTML = total ? `<b>${inView.length}</b> of ${total} results in map view` : '';
        }
        renderGrid(elements.mapCardsContainer, true, inView);
    }

    document.addEventListener('dibs:map-viewport-changed', () => {
        if (state.activeView !== 'map') return;
        renderMapCards();
        updateKPIs();
    });
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

    function getCardDaysOnMarket(p) {
        if (typeof p.days_on_market === 'number') return p.days_on_market;
        if (p.days_on_market != null && p.days_on_market !== '' && !isNaN(Number(p.days_on_market))) return Number(p.days_on_market);
        if (!p.list_date) return null;
        const str = String(p.list_date).trim();
        let dt = null;
        const parts = str.split('/');
        if (parts.length === 3) {
            let y = parseInt(parts[2], 10);
            if (y < 100) y += 2000;
            dt = new Date(y, parseInt(parts[0], 10) - 1, parseInt(parts[1], 10));
        }
        if (!dt || Number.isNaN(dt.getTime())) dt = new Date(str.replace(' ', 'T'));
        if (Number.isNaN(dt.getTime())) return null;
        return Math.max(0, Math.round((Date.now() - dt.getTime()) / 86400000));
    }

    // Price-drop pill for the property card. Prefers the server's price_drop (the latest
    // sync-detected cut); falls back to original_price (first price Dibs ever saw) when a listing
    // is below it but has no logged event. "Recent" = noticed within the last 14 days.
    const PRICE_DROP_RECENT_DAYS = 14;
    function fmtDropAmount(n) {
        if (n >= 1000) {
            const k = n / 1000;
            return `$${(k >= 10 || Number.isInteger(k) ? Math.round(k) : k.toFixed(1))}K`;
        }
        return `$${Math.round(n).toLocaleString()}`;
    }
    export function buildPriceDropPill(p) {
        const price = Number(p.price) || 0;
        const firstSeen = Number(p.original_price) || 0;
        const d = p.price_drop;
        let amount = 0, pct = 0, oldPrice = 0, when = null;
        if (d && Number(d.amount) > 0) {
            amount = Number(d.amount);
            pct = Number(d.pct) || 0;
            oldPrice = Number(d.old_price) || 0;
            const dt = d.detected_at ? new Date(d.detected_at) : null;
            if (dt && !Number.isNaN(dt.getTime())) when = dt;
        } else if (firstSeen > price && price > 0) {
            amount = firstSeen - price;
            pct = Math.round((amount / firstSeen) * 1000) / 10;
            oldPrice = firstSeen;
        } else {
            return '';
        }
        const ageDays = when ? (Date.now() - when.getTime()) / 86400000 : Infinity;
        const isRecent = ageDays <= PRICE_DROP_RECENT_DAYS;
        const totalDrop = firstSeen > price ? firstSeen - price : 0;
        const tipParts = [`Price dropped from $${oldPrice.toLocaleString()} to $${price.toLocaleString()} (-${pct}%)`];
        if (when) tipParts.push(`spotted on the ${when.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} sync`);
        if (totalDrop > amount + 1) tipParts.push(`$${totalDrop.toLocaleString()} total below the first price Dibs saw`);
        const tip = tipParts.join(' · ');
        return `<span class="card-price-drop-pill${isRecent ? ' is-recent' : ''}" title="${escapeHtml(tip)}" aria-label="${escapeHtml(tip)}"><i data-lucide="trending-down"></i> ${fmtDropAmount(amount)}${pct ? ` <span class="card-price-drop-pct">${pct}%</span>` : ''}</span>`;
    }

    export function buildPropertyCardHtml(p) {
        const ppsqft = p.sqft_finished ? Math.round(p.price / p.sqft_finished) : 0;
        const dom = getCardDaysOnMarket(p);

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

        const mapQuery = [p.address, p.city, p.state, p.zip].filter(Boolean).join(', ');
        const mapsUrl = mapQuery ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}` : '';

        return `
            <div class="property-card" data-mls="${p.mls_id}" onclick="openDetailModal('${p.mls_id}')">
                <div class="card-media">
                    <img src="${escapeHtml(imgUrl)}" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${NO_PHOTO_IMG}';" class="card-img" alt="${escapeHtml(p.address || 'Property photo')}">
                    <span class="card-status-badge ${getStatusBadgeClass(p.status)}">${escapeHtml(p.status || '')}</span>
                    ${photoBadge}
                    <button class="card-fav-btn ${p.favorite ? 'is-fav' : ''}" onclick="toggleFavorite('${p.mls_id}', event)" aria-label="${p.favorite ? 'Remove from favorites' : 'Add to favorites'}" aria-pressed="${p.favorite ? 'true' : 'false'}" title="${p.favorite ? 'Remove from favorites' : 'Add to favorites'}">
                        <svg class="fav-star-icon" viewBox="0 0 24 24" fill="${p.favorite ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"><path d="M12 2.5l2.98 6.04 6.67.97-4.83 4.7 1.14 6.65L12 17.77l-5.96 3.13 1.14-6.65-4.83-4.7 6.67-.97L12 2.5z"/></svg>
                    </button>
                </div>
                <div class="card-body">
                    <div class="card-price-row">
                        <span class="card-price font-serif">$${p.price.toLocaleString()}</span>
                        ${buildPriceDropPill(p)}
                    </div>
                    <div>
                        <div class="card-address">${escapeHtml(displayAddr)}</div>
                        <div class="card-city">
                            ${escapeHtml(p.city || '')}, ${escapeHtml(p.state || '')} ${escapeHtml(p.zip || '')}
                            ${mapsUrl ? `<a href="${mapsUrl}" target="_blank" rel="noopener noreferrer" class="card-map-link" onclick="event.stopPropagation()" title="Open in Google Maps" aria-label="Open in Google Maps"><i data-lucide="map-pin"></i></a>` : ''}
                        </div>
                    </div>
                    <div class="card-stats">
                        <div class="stat-item"><span class="stat-val">${p.beds}</span><span class="stat-lbl">Beds</span></div>
                        <div class="stat-item"><span class="stat-val">${p.baths}</span><span class="stat-lbl">Baths</span></div>
                        <div class="stat-item"><span class="stat-val">${p.sqft_finished ? p.sqft_finished.toLocaleString() : 'N/A'}</span><span class="stat-lbl">Finished SqFt</span></div>
                        <div class="stat-item"><span class="stat-val">$${ppsqft}</span><span class="stat-lbl">$/SqFt</span></div>
                    </div>
                    <div class="card-scores">
                        ${dom !== null ? `<span class="score-badge" title="Days on market"><i data-lucide="clock" style="width:0.85em;height:0.85em;vertical-align:-0.1em;"></i> ${dom} ${dom === 1 ? 'day' : 'days'} on market</span>` : ''}
                        <span class="score-badge">Built: ${p.year_built || 'N/A'}</span>
                        <span class="score-badge">Lot: ${p.lot_acres ? p.lot_acres + ' acres' : (p.lot_sqft ? p.lot_sqft.toLocaleString() + ' sqft' : 'N/A')}</span>
                        ${p.hoa_fee ? `<span class="score-badge" style="background:#B87A2A; color:#fff;">HOA: $${p.hoa_fee}</span>` : '<span class="score-badge">No HOA</span>'}
                        ${matrixBadge}
                    </div>
                    ${(() => {
                        const tags = Array.isArray(p.tags_json) ? p.tags_json : (Array.isArray(p.tags) ? p.tags : (typeof p.tags_json === 'string' ? (tryParseTags(p.tags_json)) : []));
                        if (!tags || !tags.length) return '';
                        const displayTags = tags.slice(0, 3);
                        const extraCount = tags.length - 3;
                        return `<div class="card-reaction-chips" style="display:flex; flex-wrap:wrap; gap:0.25rem; margin-top:0.4rem;">${displayTags.map(t => `<span class="card-reaction-pill">${escapeHtml(t)}</span>`).join('')}${extraCount > 0 ? `<span class="card-reaction-pill pill-more">+${extraCount}</span>` : ''}</div>`;
                    })()}
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

    export function renderGrid(containerEl = elements.gridContainer, attachMapHoverEvents = false, propsOverride = null) {
        if (!containerEl) return;
        const props = propsOverride || state.filteredProperties;
        if (!props.length && propsOverride && state.filteredProperties.length) {
            containerEl.innerHTML = `
                <div style="grid-column: 1/-1; text-align:center; padding: 4rem; color: var(--text-muted); background: var(--bg-card); border-radius: 12px;">
                    <h3>No properties in this map area</h3>
                    <p style="margin-top: 0.5rem;">Zoom out, drag the map, or use Fit All to see every result.</p>
                </div>
            `;
            return;
        }
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
                                <td><span class="badge ${getStatusBadgeClass(p.status)}">${escapeHtml(p.status || '')}</span></td>
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
                            <strong>Winner Highlights:</strong> Green highlighted boxes indicate best-in-class values (Lowest Price, Lowest $/SqFt, Largest Area, Newest Year, & Lowest HOA).
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
                            ${ap.favorite ? '★ ' : ''}${escapeHtml(cleanDisplayAddress(ap.address, ap.mls_id))} ($${ap.price.toLocaleString()})
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
            { label: 'Beds / Baths', fn: p => `${p.beds} Beds / ${p.baths} Baths` },
            { label: 'Finished SqFt', fn: p => p.sqft_finished ? p.sqft_finished.toLocaleString() : 'N/A', isWinner: p => p.sqft_finished === bestSqft && bestSqft > 0 },
            { label: 'Price per SqFt', fn: p => `$${p.sqft_finished ? Math.round(p.price / p.sqft_finished) : 'N/A'}`, isWinner: p => p.sqft_finished && Math.round(p.price / p.sqft_finished) === bestPpsqft },
            { label: 'Year Built', fn: p => p.year_built || 'N/A', isWinner: p => p.year_built === bestYearBuilt && bestYearBuilt > 0 },
            { label: 'Lot Size', fn: p => p.lot_acres ? `${p.lot_acres} Acres` : 'N/A' },
            { label: 'HOA Fee', fn: p => p.hoa_fee ? `$${p.hoa_fee}/yr` : 'No HOA', isWinner: p => (p.hoa_fee || 0) === bestHoaFee },
            { label: 'Annual Tax', fn: p => p.annual_tax ? `$${p.annual_tax}` : 'N/A' },
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
