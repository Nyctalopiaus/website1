/**
 * Nycto's MLS Property Scout - Realtor Collaboration Portal Modal
 * Manages rendering the Realtor Collaboration Portal inside an interactive modal dialog.
 */
import { apiFetch } from './api.js';
import { CONFIG, state, elements } from './state.js';
import { showToast } from './toast.js';
import { getPropertyReviewStatus, cleanDisplayAddress, escapeHtml, NO_PHOTO_IMG, getStatusBadgeClass } from './properties.js';
import { applyCustomOrder } from './realtorView.js';

let rpProperties = [];
let rpFilteredProperties = [];
let rpViewMode = localStorage.getItem('rp_view_mode') || 'card';

export function setRpViewMode(mode) {
    rpViewMode = mode;
    try { localStorage.setItem('rp_view_mode', mode); } catch(e){}
    document.querySelectorAll('.rp-view-btn').forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.getElementById(mode === 'compact' ? 'rp-view-compact' : 'rp-view-card');
    if (activeBtn) activeBtn.classList.add('active');
    renderRealtorPortalList(rpFilteredProperties);
}
window.setRpViewMode = setRpViewMode;

export async function populatePortalClientDropdown() {
    const clientContainer = document.getElementById('rp-client-filter-container');
    const clientSelect = document.getElementById('rp-client-select');
    if (!clientSelect) return;

    const isRealtor = state.currentUserProfile?.role === 'realtor';
    const isAdmin = state.isAdmin || state.currentUserProfile?.role === 'admin';

    let clients = [];
    if (isRealtor && Array.isArray(state.currentUserProfile?.assigned_clients)) {
        clients = state.currentUserProfile.assigned_clients;
    } else {
        try {
            const usersRes = await apiFetch('backend/api.php?action=list_users');
            if (usersRes && usersRes.success && Array.isArray(usersRes.users)) {
                clients = usersRes.users.filter(u => u.role === 'client');
            }
        } catch (e) {}
    }

    if (clientContainer) {
        clientContainer.style.display = (isRealtor || isAdmin) ? 'flex' : 'none';
    }

    const cachedClientId = localStorage.getItem('active_realtor_client_id');
    const currentVal = (clientSelect.value && clientSelect.value !== 'all') ? clientSelect.value : (cachedClientId || 'all');
    clientSelect.innerHTML = `<option value="all">All Clients (${clients.length})</option>` +
        clients.map(c => `<option value="${c.id}">${escapeHtml(c.full_name || c.username)}</option>`).join('');

    if (clients.some(c => String(c.id) === String(currentVal))) {
        clientSelect.value = currentVal;
    } else {
        clientSelect.value = 'all';
    }
}

export function openRealtorPortalModal(playlistToken = null) {
    if (!state.authenticated) return;
    const modal = document.getElementById('modal-realtor-portal');
    if (modal) modal.classList.add('active');

    populatePortalClientDropdown();

    const activeList = (state.allProperties && state.allProperties.length > 0) ? state.allProperties : [];

    if (playlistToken) {
        const collections = state.collections || [];
        const playlist = collections.find(c => c.share_token === playlistToken);
        if (playlist) {
            if (playlist.client_id) {
                const clientSelect = document.getElementById('rp-client-select');
                if (clientSelect) clientSelect.value = playlist.client_id;
            }
            if (playlist.mls_ids_json) {
                let mlsIds = [];
                try {
                    mlsIds = typeof playlist.mls_ids_json === 'string' ? JSON.parse(playlist.mls_ids_json) : playlist.mls_ids_json;
                } catch(e) {}
                if (Array.isArray(mlsIds) && mlsIds.length > 0) {
                    rpProperties = activeList.filter(p => mlsIds.includes(p.mls_id));
                    updatePortalKPIs(rpProperties);
                    applyRealtorPortalFilters();
                    return;
                }
            }
        }
    }

    if (activeList.length > 0) {
        rpProperties = activeList;
        updatePortalKPIs(rpProperties);
        applyRealtorPortalFilters();
    } else {
        loadRealtorPortalData();
    }
}

window.viewPlaylistPortal = function(token) {
    const modalPlaylists = document.getElementById('modal-playlists');
    if (modalPlaylists) modalPlaylists.classList.remove('active');
    openRealtorPortalModal(token);
};

export function closeRealtorPortalModal() {
    const modal = document.getElementById('modal-realtor-portal');
    if (modal) modal.classList.remove('active');
}

export async function loadRealtorPortalData() {
    const container = document.getElementById('rp-list-container');
    if (container) {
        container.innerHTML = `
            <div style="grid-column: 1/-1; text-align:center; padding: 3rem; color: var(--text-muted);">
                <h3>Loading properties... <i data-lucide="hourglass"></i></h3>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
    }

    try {
        const res = await apiFetch(CONFIG.API_URL + '?action=list');
        if (res && res.success && Array.isArray(res.properties)) {
            rpProperties = res.properties;
            updatePortalKPIs(rpProperties);
            applyRealtorPortalFilters();
        } else {
            if (container) {
                container.innerHTML = `
                    <div style="grid-column: 1/-1; text-align:center; padding: 3rem; color: var(--accent-red);">
                        <h3>Unable to load property portfolio</h3>
                        <p style="margin-top: 0.5rem; color:var(--text-muted);">${escapeHtml(res.error || 'Authentication required')}</p>
                    </div>
                `;
            }
        }
    } catch (e) {
        console.error('Error loading realtor portal data:', e);
    }
}

export function updatePortalKPIs(props) {
    const total = props.length;
    const active = props.filter(p => (p.status || '').toLowerCase() === 'active').length;
    const fav = props.filter(p => getPropertyReviewStatus(p) === 'favorite').length;
    const poss = props.filter(p => getPropertyReviewStatus(p) === 'possibility').length;
    const dislike = props.filter(p => getPropertyReviewStatus(p) === 'dislike').length;

    const totalPrice = props.reduce((acc, p) => acc + (p.price || 0), 0);
    const totalSqft = props.reduce((acc, p) => acc + (p.sqft_finished || 0), 0);
    const avgPrice = total ? Math.round(totalPrice / total) : 0;
    const avgPpsqft = totalSqft ? Math.round(totalPrice / totalSqft) : 0;

    const elTotal = document.getElementById('kpi-rp-total');
    const elActive = document.getElementById('kpi-rp-active');
    const elFav = document.getElementById('kpi-rp-fav');
    const elPoss = document.getElementById('kpi-rp-poss');
    const elDislike = document.getElementById('kpi-rp-dislike');
    const elAvgPrice = document.getElementById('kpi-rp-avg-price');
    const elAvgPpsqft = document.getElementById('kpi-rp-avg-ppsqft');

    if (elTotal) elTotal.innerText = total;
    if (elActive) elActive.innerText = `${active} Active`;
    if (elFav) elFav.innerText = fav;
    if (elPoss) elPoss.innerText = poss;
    if (elDislike) elDislike.innerText = dislike;
    if (elAvgPrice) elAvgPrice.innerText = `$${avgPrice.toLocaleString()}`;
    if (elAvgPpsqft) elAvgPpsqft.innerText = `$${avgPpsqft} / SqFt`;
}

export function applyRealtorPortalFilters() {
    const searchVal = (document.getElementById('rp-search')?.value || '').toLowerCase().trim();
    const mlsStatusVal = document.getElementById('rp-mls-status')?.value || 'active';
    const reviewStatusVal = document.getElementById('rp-review-status')?.value || 'all';
    const sortVal = document.getElementById('rp-sort')?.value || 'rating-desc';

    rpFilteredProperties = rpProperties.filter(p => {
        const revStatus = getPropertyReviewStatus(p);
        if (reviewStatusVal !== 'all' && revStatus !== reviewStatusVal) return false;

        const pStatus = (p.status || 'Active').toLowerCase();
        const isPending = pStatus.includes('pending') || pStatus.includes('under contract') || pStatus.includes('contingent');
        const isClosed = pStatus.includes('closed') || pStatus.includes('sold');
        const isActive = !isPending && !isClosed;

        if (mlsStatusVal === 'active' && !isActive) return false;
        if (mlsStatusVal === 'pending' && !isPending) return false;
        if (mlsStatusVal === 'closed' && !isClosed) return false;

        if (searchVal) {
            const haystack = `${p.address || ''} ${p.city || ''} ${p.zip || ''} ${p.mls_id || ''} ${p.user_notes || ''} ${p.realtor_notes || ''}`.toLowerCase();
            if (!haystack.includes(searchVal)) return false;
        }
        return true;
    });

    rpFilteredProperties.sort((a, b) => {
        if (sortVal === 'price-desc') return (b.price || 0) - (a.price || 0);
        if (sortVal === 'price-asc') return (a.price || 0) - (b.price || 0);
        if (sortVal === 'rating-desc') return (b.rating || 0) - (a.rating || 0);
        if (sortVal === 'sqft-desc') return (b.sqft_finished || 0) - (a.sqft_finished || 0);
        if (sortVal === 'walkscore-desc') return (b.walk_score || 0) - (a.walk_score || 0);
        if (sortVal === 'date-desc') return new Date(b.created_at || b.list_date || 0) - new Date(a.created_at || a.list_date || 0);
        return 0;
    });

    renderRealtorPortalList(rpFilteredProperties);
}

export function renderRealtorPortalList(properties) {
    const container = document.getElementById('rp-list-container');
    if (!container) return;

    if (rpViewMode === 'compact') {
        container.className = 'realtor-compact-container';
        renderCompactRealtorTable(container, properties);
    } else {
        container.className = 'realtor-grid-container';
        renderRealtorCards(container, properties);
    }

    if (window.lucide) window.lucide.createIcons();
}

function renderRealtorCards(container, properties) {
    if (!properties.length) {
        container.innerHTML = `
            <div style="grid-column: 1/-1; text-align:center; padding: 3rem; color: var(--text-muted); background: var(--bg-card); border-radius: 12px;">
                <h3>No matching properties found</h3>
                <p style="margin-top: 0.5rem;">Try adjusting your filters or clearing your search term.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = properties.map(p => {
        const ppsqft = p.sqft_finished ? Math.round(p.price / p.sqft_finished) : 0;
        const rfDelta = p.redfin_estimate ? Math.round(((p.price - p.redfin_estimate) / p.redfin_estimate) * 100) : null;
        let rfDiffBadge = '';
        if (rfDelta !== null) {
            const isAbove = rfDelta > 0;
            rfDiffBadge = `<span class="card-rf-delta ${isAbove ? 'delta-above' : 'delta-below'}" style="font-size:0.75rem;">${isAbove ? '+' : ''}${rfDelta}% vs Redfin</span>`;
        }

        const revStatus = getPropertyReviewStatus(p);
        let revBadgeHtml = '';
        if (revStatus === 'favorite') revBadgeHtml = `<span class="badge-matrix-review badge-matrix-fav"><i data-lucide="star"></i> Client Liked</span>`;
        else if (revStatus === 'possibility') revBadgeHtml = `<span class="badge-matrix-review badge-matrix-possibility"><i data-lucide="circle-help"></i> Client Possibility</span>`;
        else if (revStatus === 'dislike') revBadgeHtml = `<span class="badge-matrix-review badge-matrix-dislike"><i data-lucide="ban"></i> Client Disliked</span>`;
        else revBadgeHtml = `<span class="badge-matrix-review badge-matrix-unreviewed"><i data-lucide="clipboard-list"></i> Client Unreviewed</span>`;

        const displayAddr = cleanDisplayAddress(p.address, p.mls_id);
        const mlsUrl = p.mls_url || `https://matrix.recolorado.com/Matrix/Public/Portal.aspx`;

        let tagsArray = [];
        if (Array.isArray(p.tags_json)) tagsArray = p.tags_json;
        else if (typeof p.tags_json === 'string') {
            try { tagsArray = JSON.parse(p.tags_json); } catch(e) {}
        }

        const hasBuyerNotes = Boolean(p.user_notes || (tagsArray && tagsArray.length > 0));
        const hasAgentNotes = Boolean(p.realtor_notes && p.realtor_notes.trim());

        return `
            <div class="realtor-card">
                <div class="realtor-media">
                    <img src="${p.main_image_url || NO_PHOTO_IMG}" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${NO_PHOTO_IMG}';" class="realtor-img" alt="Property Thumbnail" onclick="window.openDetailModal('${p.mls_id}')" style="cursor:pointer;">
                    <div class="realtor-card-badges-overlay">
                        <span class="card-status-badge ${getStatusBadgeClass(p.status)}">${escapeHtml(p.status || 'Active')}</span>
                        ${revBadgeHtml}
                    </div>
                    <div class="realtor-card-rating-overlay">
                        <i data-lucide="star"></i> ${p.rating || 0}/5 Buyer Rating
                    </div>
                </div>

                <div class="realtor-info">
                    <div class="realtor-card-header">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:0.5rem; width:100%;">
                            <div>
                                <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
                                    <h2 style="color: var(--accent-gold); font-weight:800; font-size:1.4rem; margin:0;">$${p.price.toLocaleString()}</h2>
                                    ${rfDiffBadge}
                                    ${ppsqft ? `<span style="font-size:0.78rem; font-weight:700; color:var(--text-muted);">$${ppsqft}/SqFt</span>` : ''}
                                </div>
                                <h3 style="margin-top:4px; font-size:1.05rem; line-height:1.3; margin-bottom:2px; cursor:pointer;" onclick="window.openDetailModal('${p.mls_id}')">${escapeHtml(displayAddr)}</h3>
                                <div style="color: var(--text-muted); font-size:0.8rem;">
                                    ${p.city || ''}, ${p.state || 'CO'} ${p.zip || ''} | <strong>MLS #${p.mls_id}</strong>
                                </div>
                            </div>

                            <div class="rp-quick-actions" style="display:flex; gap:4px; align-items:center;">
                                <button class="matrix-icon-btn" onclick="window.openDetailModal('${p.mls_id}')" title="Photos Gallery & Full Details"><i data-lucide="image"></i></button>
                                <button class="matrix-icon-btn" onclick="window.openPropertyMapModal('${p.mls_id}')" title="Property Location Map Modal"><i data-lucide="map-pin"></i></button>
                                <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(displayAddr + ', ' + (p.city || '') + ' ' + (p.state || 'CO') + ' ' + (p.zip || ''))}" target="_blank" class="matrix-icon-btn" title="Google Maps Directions"><i data-lucide="map"></i></a>
                                ${p.virtual_tour_url ? `<a href="${escapeHtml(p.virtual_tour_url)}" target="_blank" class="matrix-icon-btn" title="Virtual Tour"><i data-lucide="video"></i></a>` : ''}
                                <a href="${mlsUrl}" target="_blank" class="matrix-icon-btn" title="Matrix MLS Portal"><i data-lucide="external-link"></i></a>
                            </div>
                        </div>
                    </div>

                    <div class="realtor-specs-bar" style="display:flex; gap:0.6rem 0.9rem; flex-wrap:wrap; font-size:0.8rem; background:var(--bg-input); padding:0.5rem 0.75rem; border-radius:var(--radius-sm); border:1px solid var(--border-color);">
                        <span><strong>${p.beds || 0}</strong> Beds</span>
                        <span><strong>${p.baths || 0}</strong> Baths</span>
                        <span><strong>${(p.sqft_finished || 0).toLocaleString()}</strong> SqFt</span>
                        <span><strong>${p.lot_acres ? p.lot_acres + ' ac' : (p.lot_sqft ? (p.lot_sqft).toLocaleString() + ' sqft' : 'N/A')}</strong> Lot</span>
                        <span><strong>${p.year_built || 'N/A'}</strong> Built</span>
                        ${p.walk_score ? `<span><strong><i data-lucide="footprints"></i> ${p.walk_score}/100</strong></span>` : ''}
                        <span><strong>${p.hoa_fee ? '$' + p.hoa_fee + '/yr HOA' : 'No HOA'}</strong></span>
                    </div>

                    <div class="realtor-notes-box buyer-box ${hasBuyerNotes ? '' : 'realtor-empty-notes'}">
                        <strong style="color: var(--accent-gold); font-size:0.8rem;"><i data-lucide="pencil"></i> Buyer Notes & Interests:</strong>
                        ${p.user_notes ? `<p style="margin-top:4px; font-size:0.85rem; white-space:pre-wrap; color:var(--text-primary);">${escapeHtml(p.user_notes)}</p>` : ''}
                        ${(tagsArray && tagsArray.length > 0) ? `
                            <div style="margin-top:6px;">
                                ${tagsArray.map(t => `<span class="tag-pill">#${escapeHtml(t)}</span>`).join('')}
                            </div>
                        ` : ''}
                        ${!hasBuyerNotes ? `<p style="margin-top:2px; font-size:0.78rem; color:var(--text-muted); font-style:italic;">No buyer notes written yet.</p>` : ''}
                    </div>

                    <div class="realtor-notes-box agent-box ${hasAgentNotes ? 'has-agent-notes' : 'realtor-empty-agent-notes'}" style="margin-top:auto;">
                        <strong style="color: var(--accent-blue); font-size:0.8rem;"><i data-lucide="message-square"></i> Agent Feedback / Showing Notes:</strong>
                        <textarea class="input-text realtor-agent-textarea" style="margin-top:6px; width:100%; min-height:55px; font-size:0.82rem;" placeholder="Add agent commentary, showing feedback, or comps notes...">${escapeHtml(p.realtor_notes || '')}</textarea>
                        
                        <div class="realtor-card-actions" style="display:flex; justify-content:space-between; align-items:center; margin-top:8px; flex-wrap:wrap; gap:0.5rem;">
                            <button class="btn btn-primary" style="font-size:0.78rem; padding:0.35rem 0.75rem;" onclick="savePortalAgentNote('${p.mls_id}', this)">
                                <i data-lucide="save"></i> Save Agent Note
                            </button>

                            <div style="display:flex; gap:0.4rem;">
                                <a href="${mlsUrl}" target="_blank" class="btn btn-secondary" style="font-size:0.75rem; padding:0.3rem 0.55rem; text-decoration:none;">
                                    <i data-lucide="link"></i> Matrix MLS
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

function renderCompactRealtorTable(container, properties) {
    if (!properties.length) {
        container.innerHTML = `
            <div style="text-align:center; padding: 3rem; color: var(--text-muted); background: var(--bg-card); border-radius: 12px;">
                <h3>No matching properties found</h3>
                <p style="margin-top: 0.5rem;">Try adjusting your filters or clearing your search term.</p>
            </div>
        `;
        return;
    }

    const activeClientId = localStorage.getItem('active_realtor_client_id');
    const sortedProps = applyCustomOrder(properties, activeClientId);

    const rowsHtml = sortedProps.map(p => {
        const ppsqft = p.sqft_finished ? Math.round(p.price / p.sqft_finished) : 0;
        const revStatus = getPropertyReviewStatus(p);
        let revBadgeHtml = '';
        if (revStatus === 'favorite') revBadgeHtml = `<span class="badge-matrix-review badge-matrix-fav" title="Client Liked"><i data-lucide="star"></i> Liked</span>`;
        else if (revStatus === 'possibility') revBadgeHtml = `<span class="badge-matrix-review badge-matrix-possibility" title="Client Possibility"><i data-lucide="circle-help"></i> Maybe</span>`;
        else if (revStatus === 'dislike') revBadgeHtml = `<span class="badge-matrix-review badge-matrix-dislike" title="Client Disliked"><i data-lucide="ban"></i> Passed</span>`;
        else revBadgeHtml = `<span class="badge-matrix-review badge-matrix-unreviewed" title="Unreviewed"><i data-lucide="minus"></i> Unreviewed</span>`;

        const displayAddr = cleanDisplayAddress(p.address, p.mls_id);
        const mlsUrl = p.mls_url || `https://matrix.recolorado.com/Matrix/Public/Portal.aspx`;

        return `
            <tr class="rp-compact-row" data-mls="${p.mls_id}" draggable="true"
                ondragstart="window.handleTableRowDragStart(event, '${p.mls_id}')"
                ondragover="window.handleTableRowDragOver(event)"
                ondragleave="window.handleTableRowDragLeave(event)"
                ondrop="window.handleTableRowDrop(event, '${p.mls_id}', ${activeClientId || 'null'})"
                ondragend="window.handleTableRowDragEnd(event)">
                <td class="table-drag-handle" style="padding:0.5rem 0.35rem; width:30px;" title="Drag row to reorder">
                    <i data-lucide="grip-vertical" style="width:14px; height:14px;"></i>
                </td>
                <td style="padding:0.5rem 0.35rem; width:28px; text-align:center;">
                    <input type="checkbox" class="rp-table-select-chk" data-mls="${p.mls_id}" onchange="window.updateRealtorTableSelection()" onclick="event.stopPropagation()">
                </td>
                <td style="padding:0.5rem 0.6rem; font-weight:700; white-space:nowrap;">
                    <a href="javascript:void(0)" onclick="window.openDetailModal('${p.mls_id}')" style="color:var(--accent-blue); text-decoration:none;">#${p.mls_id}</a>
                </td>
                <td style="padding:0.5rem 0.6rem; white-space:nowrap;">
                    ${revBadgeHtml}
                </td>
                <td style="padding:0.5rem 0.6rem; white-space:nowrap;">
                    <span class="card-status-badge ${getStatusBadgeClass(p.status)}" style="font-size:0.7rem; padding:2px 6px;">${escapeHtml(p.status || 'Active')}</span>
                </td>
                <td style="padding:0.5rem 0.6rem; white-space:nowrap;">
                    <div class="rp-quick-actions" style="display:flex; gap:3px; align-items:center;">
                        <button class="matrix-icon-btn" onclick="window.openDetailModal('${p.mls_id}')" title="Photos Gallery & Full Details"><i data-lucide="image"></i></button>
                        <button class="matrix-icon-btn" onclick="window.openPropertyMapModal('${p.mls_id}')" title="Property Location Map Modal"><i data-lucide="map-pin"></i></button>
                        <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(displayAddr + ', ' + (p.city || '') + ' ' + (p.state || 'CO') + ' ' + (p.zip || ''))}" target="_blank" class="matrix-icon-btn" title="Google Maps Directions"><i data-lucide="map"></i></a>
                        ${p.virtual_tour_url ? `<a href="${escapeHtml(p.virtual_tour_url)}" target="_blank" class="matrix-icon-btn" title="Virtual Tour"><i data-lucide="video"></i></a>` : ''}
                        <a href="${mlsUrl}" target="_blank" class="matrix-icon-btn" title="Matrix MLS Portal"><i data-lucide="external-link"></i></a>
                    </div>
                </td>
                <td style="padding:0.5rem 0.6rem;">
                    <div style="font-weight:700; font-size:0.85rem; color:var(--text-primary); cursor:pointer;" onclick="window.openDetailModal('${p.mls_id}')">
                        ${escapeHtml(displayAddr)}
                    </div>
                    <div style="font-size:0.75rem; color:var(--text-muted);">${escapeHtml(p.city || '')}, ${escapeHtml(p.state || 'CO')} ${escapeHtml(p.zip || '')}</div>
                </td>
                <td style="padding:0.5rem 0.6rem; font-weight:800; color:var(--accent-gold); white-space:nowrap; font-size:0.9rem;">
                    $${(p.price || 0).toLocaleString()}
                </td>
                <td style="padding:0.5rem 0.6rem; white-space:nowrap;">
                    ${p.beds || 0}bd / ${p.baths || 0}ba
                </td>
                <td style="padding:0.5rem 0.6rem; white-space:nowrap;">
                    ${(p.sqft_finished || 0).toLocaleString()}
                </td>
                <td style="padding:0.5rem 0.6rem; white-space:nowrap; color:var(--text-muted);">
                    ${ppsqft ? `$${ppsqft}` : '-'}
                </td>
                <td style="padding:0.5rem 0.6rem; min-width:260px;">
                    <div class="rp-compact-note-cell" style="display:flex; gap:4px; align-items:center;">
                        <input type="text" class="input-text rp-compact-note-input" value="${escapeHtml(p.realtor_notes || '')}" placeholder="Add showing note..." style="font-size:0.78rem; padding:0.25rem 0.5rem; height:28px; flex:1; border-radius:4px;">
                        <button class="btn btn-primary" style="padding:0.2rem 0.5rem; font-size:0.72rem; height:28px; white-space:nowrap;" onclick="savePortalAgentNote('${p.mls_id}', this)" title="Save Agent Note">
                            <i data-lucide="save"></i> Save
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <div class="rp-compact-table-wrapper" style="width:100%; overflow-x:auto; background:var(--bg-card); border-radius:10px; border:1px solid var(--border-color);">
            <div style="display:flex; justify-content:space-between; align-items:center; padding:0.55rem 0.85rem; border-bottom:1px solid var(--border-color); background:var(--bg-input); font-size:0.78rem; color:var(--text-muted);">
                <span><i data-lucide="grip-vertical" style="width:14px; height:14px; vertical-align:middle; color:var(--accent-gold);"></i> Drag row handles to custom-sort property order.</span>
                <button class="btn btn-sm btn-secondary" style="font-size:0.75rem; padding:0.2rem 0.55rem;" onclick="window.resetRealtorTableOrder(${activeClientId || 'null'})"><i data-lucide="rotate-ccw"></i> Reset Order</button>
            </div>
            <table class="rp-compact-table" style="width:100%; border-collapse:collapse; font-size:0.83rem; text-align:left;">
                <thead>
                    <tr style="background:var(--bg-input); border-bottom:2px solid var(--border-color); color:var(--text-muted); font-size:0.72rem; text-transform:uppercase; letter-spacing:0.04em;">
                        <th style="padding:0.6rem; width:30px; text-align:center;" title="Drag handle"><i data-lucide="grip-vertical" style="width:13px; height:13px;"></i></th>
                        <th style="padding:0.6rem; width:28px; text-align:center;">
                            <input type="checkbox" id="rp-modal-select-all" onclick="window.toggleRealtorTableSelectAll(this)" title="Select / Deselect All">
                        </th>
                        <th style="padding:0.6rem;">MLS ID</th>
                        <th style="padding:0.6rem;">Client Reaction</th>
                        <th style="padding:0.6rem;">Status</th>
                        <th style="padding:0.6rem;">Quick Actions</th>
                        <th style="padding:0.6rem;">Address</th>
                        <th style="padding:0.6rem;">Price</th>
                        <th style="padding:0.6rem;">Bds/Ba</th>
                        <th style="padding:0.6rem;">SqFt</th>
                        <th style="padding:0.6rem;">$/SqFt</th>
                        <th style="padding:0.6rem;">Agent Showing Notes</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>
        </div>
    `;
}

export async function savePortalAgentNote(mlsId, btn) {
    const parent = btn.closest('.realtor-notes-box') || btn.closest('.rp-compact-note-cell');
    const inputEl = parent ? parent.querySelector('textarea, input[type="text"]') : null;
    const noteText = inputEl ? inputEl.value : '';

    btn.disabled = true;
    btn.innerHTML = 'Saving... <i data-lucide="hourglass"></i>';
    if (window.lucide) window.lucide.createIcons();

    try {
        const res = await apiFetch(CONFIG.API_URL + '?action=update_user_data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mls_id: mlsId, realtor_notes: noteText })
        });

        btn.disabled = false;
        if (res && res.success) {
            btn.innerHTML = 'Saved! <i data-lucide="check"></i>';
            if (window.lucide) window.lucide.createIcons();
            btn.style.backgroundColor = 'var(--accent-emerald)';
            const prop = state.allProperties.find(item => String(item.mls_id) === String(mlsId));
            if (prop) prop.realtor_notes = noteText;
            setTimeout(() => {
                btn.innerHTML = (parent && parent.classList.contains('rp-compact-note-cell')) ? '<i data-lucide="save"></i> Save' : '<i data-lucide="save"></i> Save Agent Note';
                if (window.lucide) window.lucide.createIcons();
                btn.style.backgroundColor = '';
            }, 2000);
        } else {
            btn.innerText = 'Failed';
            showToast(res.error || 'Could not save note.', 'error');
        }
    } catch (err) {
        btn.disabled = false;
        btn.innerText = 'Error';
        showToast('Error saving note', 'error');
    }
}

window.savePortalAgentNote = savePortalAgentNote;
