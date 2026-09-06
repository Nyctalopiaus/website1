/**
 * MLS & Redfin Property Scout - Realtor Collaboration Portal Modal
 * Manages rendering the Realtor Collaboration Portal inside an interactive modal dialog.
 */
import { apiFetch } from './api.js';
import { CONFIG, state, elements } from './state.js';
import { showToast } from './toast.js';
import { getPropertyReviewStatus, cleanDisplayAddress, escapeHtml, getRedfinUrl, NO_PHOTO_IMG } from './properties.js';

let rpProperties = [];
let rpFilteredProperties = [];

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

    const currentVal = clientSelect.value || 'all';
    clientSelect.innerHTML = `<option value="all">👥 All Clients (${clients.length})</option>` +
        clients.map(c => `<option value="${c.id}">👤 ${escapeHtml(c.full_name || c.username)}</option>`).join('');

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
        const redfinUrl = getRedfinUrl(p);

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
                    <img src="${p.main_image_url || NO_PHOTO_IMG}" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${NO_PHOTO_IMG}';" class="realtor-img" alt="Property Thumbnail">
                    <div class="realtor-card-badges-overlay">
                        <span class="card-status-badge badge-${(p.status || 'Active').toLowerCase()}">${p.status || 'Active'}</span>
                        ${revBadgeHtml}
                    </div>
                    <div class="realtor-card-rating-overlay">
                        <i data-lucide="star"></i> ${p.rating || 0}/5 Buyer Rating
                    </div>
                </div>

                <div class="realtor-info">
                    <div class="realtor-card-header">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:0.5rem;">
                            <div>
                                <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
                                    <h2 style="color: var(--accent-gold); font-weight:800; font-size:1.4rem; margin:0;">$${p.price.toLocaleString()}</h2>
                                    ${rfDiffBadge}
                                    ${ppsqft ? `<span style="font-size:0.78rem; font-weight:700; color:var(--text-muted);">$${ppsqft}/SqFt</span>` : ''}
                                </div>
                                <h3 style="margin-top:4px; font-size:1.05rem; line-height:1.3; margin-bottom:2px;">${escapeHtml(displayAddr)}</h3>
                                <div style="color: var(--text-muted); font-size:0.8rem;">
                                    ${p.city || ''}, ${p.state || 'CO'} ${p.zip || ''} | <strong>MLS #${p.mls_id}</strong>
                                </div>
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
                                    <i data-lucide="link"></i> Matrix
                                </a>
                                <a href="${redfinUrl}" target="_blank" class="btn btn-secondary" style="font-size:0.75rem; padding:0.3rem 0.55rem; text-decoration:none;">
                                    <i data-lucide="circle"></i> Redfin
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
}

export async function savePortalAgentNote(mlsId, btn) {
    const textarea = btn.closest('.realtor-notes-box').querySelector('textarea');
    const noteText = textarea ? textarea.value : '';

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
                btn.innerHTML = '<i data-lucide="save"></i> Save Agent Note';
                if (window.lucide) window.lucide.createIcons();
                btn.style.backgroundColor = '';
            }, 2000);
        } else {
            btn.innerText = 'Failed to Save';
            showToast(res.error || 'Could not save note.', 'error');
        }
    } catch (err) {
        btn.disabled = false;
        btn.innerText = 'Error Saving';
        showToast('Error saving note', 'error');
    }
}

window.savePortalAgentNote = savePortalAgentNote;
