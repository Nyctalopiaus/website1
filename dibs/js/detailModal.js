/**
 * Nycto's MLS Property Scout - Property Detail Modal & Its Actions
 * Every export here is attached to window (not just module-exported) because these are all
 * invoked from onclick="..." attributes inside dynamically-rendered HTML strings, which
 * execute in global scope regardless of module boundaries - same pattern the original
 * single-file app.js used. This module has no named exports; importing it purely for its
 * side effects (setting window.openDetailModal etc.) is enough.
 */
import { state, elements, CONFIG } from './state.js';
import { getPropertyReviewStatus, cleanDisplayAddress, escapeHtml, isSafeMediaUrl, NO_PHOTO_IMG, getStatusBadgeClass, getCompScore, buildCompScoreBadge } from './properties.js';
import { apiFetch, savePreferencesToServer } from './api.js';
import { applyFiltersAndRender } from './filters.js';
import { showToast } from './toast.js';
import { renderClientNextSteps } from './clientNextSteps.js';

// Matrix's portal has no per-listing URL (a listing's detail view is a postback on the search's
// result set, and the address bar never changes), so the best Dibs can link to is the search page
// the house was synced from. Tag that link with dibs_mls=<MLS #>: the portal ignores unknown query
// params (confirmed live Oct 2026), and the Dibs bookmarklet, when clicked on a page carrying that
// param, opens that one listing instead of running a scrape.
function matrixListingUrl(p) {
    const base = p.mls_url || 'https://matrix.recolorado.com/Matrix/Public/Portal.aspx';
    try {
        const u = new URL(base);
        if (p.mls_id) u.searchParams.set('dibs_mls', String(p.mls_id));
        return u.toString();
    } catch (e) {
        return base;
    }
}


export const DEFAULT_REACTION_CHIPS = [
    '😍 Great Kitchen',
    '🌳 Big Yard',
    '📐 Great Layout',
    '🛠️ Needs Renovation',
    '🔊 Busy Road',
    '💵 Priced Well'
];

// Quick-insert chips for the MLS Portal Sync note box (a separate, fully editable library).
export const DEFAULT_MLS_NOTE_CHIPS = [
    'Split rail fence',
    'Garage too small'
];

function getMlsNoteChips() {
    return Array.isArray(state.userMlsNoteChips) ? state.userMlsNoteChips : [...DEFAULT_MLS_NOTE_CHIPS];
}

const MLS_CHIP_SEP = ', ';

function splitMlsNote(text) {
    return String(text || '').split(/\s*[,;\n]\s*/).map(s => s.trim()).filter(Boolean);
}

function mlsNoteHasChip(text, chip) {
    const c = chip.toLowerCase();
    return splitMlsNote(text).some(part => part.toLowerCase() === c);
}

window.renderMlsNoteChipsHtml = function() {
    const current = document.getElementById('modal-mls-note')?.value || '';
    let html = '<div class="reaction-chips-wrapper" style="display:flex; flex-wrap:wrap; gap:0.45rem; align-items:center;">';
    getMlsNoteChips().forEach(chip => {
        const safe = escapeHtml(chip);
        html += `
            <button type="button" class="reaction-chip ${mlsNoteHasChip(current, chip) ? 'active' : ''}" data-chip="${safe}"
                    onclick="window.toggleMlsNoteChip(this.dataset.chip)">
                <span>${safe}</span>
                <span class="chip-delete-btn" title="Remove from your MLS note chips" onclick="window.deleteMlsNoteChip(event, this.parentElement.dataset.chip)">&times;</span>
            </button>`;
    });
    html += `
        <button type="button" class="btn btn-secondary btn-compact reaction-chip-add" onclick="window.promptAddMlsNoteChip()">
            <i data-lucide="plus"></i> Custom Chip
        </button>
    </div>`;
    return html;
};

function refreshMlsNoteChips() {
    const container = document.getElementById('modal-mls-note-chips');
    if (!container) return;
    container.innerHTML = window.renderMlsNoteChipsHtml();
    if (window.lucide) window.lucide.createIcons();
}

// Called from the textarea's oninput so the count and chip highlights track manual typing.
window.onMlsNoteInput = function() {
    const el = document.getElementById('modal-mls-note');
    const count = document.getElementById('modal-mls-note-count');
    if (el && count) count.textContent = el.value.length + ' / 500';
    document.querySelectorAll('#modal-mls-note-chips .reaction-chip[data-chip]').forEach(btn => {
        btn.classList.toggle('active', mlsNoteHasChip(el?.value, btn.dataset.chip));
    });
};

window.toggleMlsNoteChip = function(chip) {
    const el = document.getElementById('modal-mls-note');
    if (!el || !chip) return;
    const parts = splitMlsNote(el.value);
    const idx = parts.findIndex(part => part.toLowerCase() === chip.toLowerCase());
    if (idx >= 0) {
        parts.splice(idx, 1);
    } else {
        parts.push(chip);
    }
    const next = parts.join(MLS_CHIP_SEP);
    if (next.length > 500) { showToast('MLS notes are limited to 500 characters', 'error'); return; }
    el.value = next;
    window.onMlsNoteInput();
    el.focus();
};

window.promptAddMlsNoteChip = function() {
    const input = prompt('New MLS note chip (e.g. "Backs to open space", "No basement"):');
    if (!input || !input.trim()) return;
    const chip = input.trim().replace(/[,;\n]+/g, ' ').slice(0, 100);
    const list = getMlsNoteChips();
    if (!list.some(c => c.toLowerCase() === chip.toLowerCase())) {
        state.userMlsNoteChips = [...list, chip];
        savePreferencesToServer();
    }
    refreshMlsNoteChips();
    window.toggleMlsNoteChip(chip);
};

window.deleteMlsNoteChip = function(event, chip) {
    event.stopPropagation();
    if (!confirm(`Remove "${chip}" from your MLS note chips?`)) return;
    state.userMlsNoteChips = getMlsNoteChips().filter(c => c !== chip);
    savePreferencesToServer();
    refreshMlsNoteChips();
};

export function getPropertyTags(p) {
    if (!p) return [];
    if (Array.isArray(p.tags_json)) return p.tags_json;
    if (Array.isArray(p.tags)) return p.tags;
    if (typeof p.tags_json === 'string') {
        try {
            const parsed = JSON.parse(p.tags_json);
            return Array.isArray(parsed) ? parsed : [];
        } catch(e) {}
    }
    return [];
}

export function getAvailableReactionChips() {
    const custom = Array.isArray(state.userCustomChips) ? state.userCustomChips : [];
    const combined = [...DEFAULT_REACTION_CHIPS];
    custom.forEach(c => {
        if (c && typeof c === 'string' && !combined.includes(c)) {
            combined.push(c);
        }
    });
    return combined;
}

window.renderReactionChipsHtml = function(p) {
    const activeTags = getPropertyTags(p);
    const availableChips = getAvailableReactionChips();

    let html = '<div class="reaction-chips-wrapper" style="display:flex; flex-wrap:wrap; gap:0.45rem; align-items:center;">';
    
    availableChips.forEach(chip => {
        const isActive = activeTags.includes(chip);
        const isCustom = !DEFAULT_REACTION_CHIPS.includes(chip);
        html += `
            <button type="button" class="reaction-chip ${isActive ? 'active' : ''}" 
                    onclick="window.togglePropertyReactionChip('${p.mls_id}', '${escapeHtml(chip)}')">
                <span>${escapeHtml(chip)}</span>
                ${isCustom ? `<span class="chip-delete-btn" title="Delete chip from your reusable library" onclick="window.deleteCustomReactionChip(event, '${escapeHtml(chip)}')">&times;</span>` : ''}
            </button>
        `;
    });

    html += `
        <button type="button" class="btn btn-secondary btn-compact reaction-chip-add" onclick="window.promptAddCustomReactionChip('${p.mls_id}')">
            <i data-lucide="plus"></i> Custom Chip
        </button>
    `;
    html += '</div>';
    return html;
};

window.togglePropertyReactionChip = function(mlsId, chipText) {
    const p = state.allProperties.find(item => item.mls_id === mlsId);
    if (!p) return;
    let currentTags = getPropertyTags(p);
    if (currentTags.includes(chipText)) {
        currentTags = currentTags.filter(t => t !== chipText);
    } else {
        currentTags.push(chipText);
    }
    p.tags_json = currentTags;
    p.tags = currentTags;

    apiFetch(CONFIG.API_URL + '?action=update_user_data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mls_id: mlsId, tags: currentTags })
    }).then(() => {
        const container = document.getElementById('modal-reaction-chips-container');
        if (container) {
            container.innerHTML = window.renderReactionChipsHtml(p);
            if (window.lucide) window.lucide.createIcons();
        }
        applyFiltersAndRender();
    });
};

window.promptAddCustomReactionChip = function(mlsId) {
    const input = prompt('Enter a custom property reaction (e.g. "🏊 Needs Pool", "🏔️ Mountain View"):');
    if (!input || !input.trim()) return;
    const cleanChip = input.trim();
    if (!state.userCustomChips) state.userCustomChips = [];
    if (!state.userCustomChips.includes(cleanChip) && !DEFAULT_REACTION_CHIPS.includes(cleanChip)) {
        state.userCustomChips.push(cleanChip);
        savePreferencesToServer();
    }
    window.togglePropertyReactionChip(mlsId, cleanChip);
};

window.deleteCustomReactionChip = function(event, chipText) {
    event.stopPropagation();
    if (!confirm(`Delete "${chipText}" from your reusable reaction chips library?`)) return;
    if (state.userCustomChips) {
        state.userCustomChips = state.userCustomChips.filter(c => c !== chipText);
        savePreferencesToServer();
    }
    const modalEl = document.getElementById('modal-detail');
    const mlsId = modalEl?.dataset?.currentMlsId || '';
    if (mlsId) {
        const p = state.allProperties.find(item => item.mls_id === mlsId);
        if (p) {
            const container = document.getElementById('modal-reaction-chips-container');
            if (container) {
                container.innerHTML = window.renderReactionChipsHtml(p);
                if (window.lucide) window.lucide.createIcons();
            }
        }
    }
};

    // Detail Modal Multi-Photo State
    let currentGalleryImages = [];
    let currentGalleryIndex = 0;

    function getActivityIcon(activityType) {
        const icons = {
            listing_imported: 'download',
            listing_status_changed: 'refresh-cw',
            lifecycle_updated: 'circle-dot',
            lifecycle_restored: 'circle-check',
            favorite_updated: 'star',
            rating_updated: 'circle-help',
            client_visibility_updated: 'ban',
            client_note_updated: 'notebook-pen',
            client_question_updated: 'message-circle-question',
            realtor_private_note_updated: 'lock-keyhole',
            playlist_added: 'folder-plus',
            property_message_sent: 'message-square',
            showing_itinerary_updated: 'calendar-clock',
            address_corrected: 'map-pin-check'
        };
        return icons[activityType] || 'history';
    }

    // Detail Modal Handlers
    window.openDetailModal = function(mlsId) {
        if (elements.modalRecommend && elements.modalRecommend.classList.contains('active')) {
            if (typeof window.closeRecommendModal === 'function') {
                window.closeRecommendModal();
            } else {
                elements.modalRecommend.classList.remove('active');
            }
        }
        const p = state.allProperties.find(item => item.mls_id === mlsId);
        if (!p) return;

        // Track recently viewed home in localStorage
        try {
            let recent = JSON.parse(localStorage.getItem('scout_recently_viewed_homes') || '[]');
            if (!Array.isArray(recent)) recent = [];
            recent = recent.filter(id => String(id) !== String(mlsId));
            recent.unshift(String(mlsId));
            if (recent.length > 15) recent = recent.slice(0, 15);
            localStorage.setItem('scout_recently_viewed_homes', JSON.stringify(recent));
        } catch(e){}

        const ppsqft = p.sqft_finished ? Math.round(p.price / p.sqft_finished) : (p.sqft_total ? Math.round(p.price / p.sqft_total) : 0);

        const mlsUrl = matrixListingUrl(p.mls_url ? p : { ...p, mls_url: 'https://matrix.recolorado.com/Matrix/Public/Portal.aspx?L=1&k=2343995XHKSS&p=CS-3939147-0#1' });

        const matrixRev = getPropertyReviewStatus(p);
        let matrixBadgeModal = '';
        if (matrixRev === 'favorite') matrixBadgeModal = `<span class="badge-matrix-review badge-matrix-fav" style="font-size:0.85rem; padding:4px 10px;"><i data-lucide="star"></i> Favorite</span>`;
        else if (matrixRev === 'possibility') matrixBadgeModal = `<span class="badge-matrix-review badge-matrix-possibility" style="font-size:0.85rem; padding:4px 10px;"><i data-lucide="circle-help"></i> Possibility</span>`;
        else if (matrixRev === 'dislike') matrixBadgeModal = `<span class="badge-matrix-review badge-matrix-dislike" style="font-size:0.85rem; padding:4px 10px;"><i data-lucide="ban"></i> Disliked</span>`;
        else matrixBadgeModal = `<span class="badge-matrix-review" style="font-size:0.85rem; padding:4px 10px; background:rgba(138,127,110,0.15); color:var(--text-muted);"><i data-lucide="clipboard-list"></i> Unreviewed</span>`;

        let ratingStarsHtml = '';
        const currentRating = p.rating || 0;
        for (let i = 1; i <= 5; i++) {
            ratingStarsHtml += `<button type="button" class="star-btn ${i <= currentRating ? 'selected' : ''}" onclick="setModalRating('${p.mls_id}', ${i})"><i data-lucide="star"></i></button>`;
        }

        const displayAddrModal = cleanDisplayAddress(p.address, p.mls_id);
        const modalMapQuery = [p.address, p.city, p.state, p.zip].filter(Boolean).join(', ');
        const modalMapsUrl = modalMapQuery ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(modalMapQuery)}` : '';

        // Prepare multi-photo gallery array
        let gallery = [];
        if (Array.isArray(p.gallery_images) && p.gallery_images.length > 0) {
            gallery = p.gallery_images;
        } else if (typeof p.gallery_images === 'string') {
            try { gallery = JSON.parse(p.gallery_images); } catch(e) {}
        }
        if (!Array.isArray(gallery) || gallery.length === 0) {
            gallery = p.main_image_url ? [p.main_image_url] : [NO_PHOTO_IMG];
        }
        currentGalleryImages = gallery;
        currentGalleryIndex = 0;

        const calcParams = new URLSearchParams();
        if (p.price) calcParams.set('price', p.price);
        if (p.annual_tax && p.price) calcParams.set('taxRate', ((p.annual_tax / p.price) * 100).toFixed(2));
        if (p.hoa_fee) calcParams.set('hoaFees', Math.round(p.hoa_fee / 12));
        if (displayAddrModal) calcParams.set('address', displayAddrModal);
        const calcUrl = `/housenomics/?${calcParams.toString()}`;

        elements.modalDetailBody.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:1.5rem;">
                <!-- Header -->
                <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:1rem;">
                    <div>
                        <div style="display:flex; align-items:center; gap:0.75rem; flex-wrap:wrap; margin-bottom:0.25rem;">
                            <h1 style="color:var(--accent-gold); font-size:2rem; font-weight:800;">$${p.price.toLocaleString()}</h1>
                            <span class="badge ${getStatusBadgeClass(p.status)}">${escapeHtml(p.status || 'Active')}</span>
                            ${matrixBadgeModal}
                            ${ppsqft ? `<span class="score-badge" style="font-size:0.9rem;">$${ppsqft} / SqFt</span>` : ''}
                            <span id="modal-comp-score-slot">${buildCompScoreBadge(p, true)}</span>
                        </div>
                        <h2 style="font-size:1.4rem; font-weight:700; color:var(--text-primary);">
                            ${escapeHtml(displayAddrModal)}
                            ${modalMapsUrl ? `<a href="${modalMapsUrl}" target="_blank" rel="noopener noreferrer" class="card-map-link" title="Open in Google Maps" aria-label="Open in Google Maps"><i data-lucide="map-pin"></i></a>` : ''}
                        </h2>
                        <div style="color:var(--text-muted); font-size:0.9rem; margin-top:2px;">
                            ${escapeHtml(p.city || '')}, ${escapeHtml(p.state || 'CO')} ${escapeHtml(p.zip || '')} | <strong>MLS #${escapeHtml(String(p.mls_id))}</strong> | List Date: ${escapeHtml(p.list_date || 'N/A')}
                        </div>
                    </div>

                    <!-- Actions -->
                    <div class="modal-action-bar">
                        <a href="${escapeHtml(mlsUrl)}" target="_blank" class="btn btn-gold" style="text-decoration:none;">
                            <i data-lucide="link"></i> View Original Matrix MLS Portal Listing
                        </a>
                        <a href="${calcUrl}" target="_blank" class="btn btn-secondary" style="text-decoration:none; background:rgba(91,124,153,0.2); color:#6B8CA3; border:1px solid #5B7C99;">
                            <i data-lucide="calculator"></i> Mortgage Calculator
                        </a>
                        <button type="button" class="btn btn-secondary" onclick="openPhotoViewer('${p.mls_id}', null, { fromDetail: true })">
                            <i data-lucide="images"></i> View Photos (${currentGalleryImages.length})
                        </button>
                        <span id="modal-comps-action-slot" style="display:contents;">${buildCompsActionButton(p)}</span>
                        <button class="btn btn-secondary realtor-or-admin-only" onclick="addMlsToPlaylist('${p.mls_id}')" style="${(state.currentUserProfile?.role === 'realtor' || state.currentUserProfile?.role === 'admin' || state.isAdmin) ? '' : 'display:none;'}">
                            <i data-lucide="folder-plus"></i> Add to Playlist
                        </button>
                    </div>
                </div>

                <!-- My Decision Row -->
                <div style="border:1px solid var(--border-color); border-radius:var(--radius-sm); padding:0.85rem; background:var(--bg-panel);">
                    <h3 style="font-size:0.95rem; font-weight:700; color:var(--text-primary); margin-bottom:0.65rem; display:flex; align-items:center; gap:0.4rem;"><i data-lucide="circle-check"></i> My Decision</h3>
                    <div style="display:flex; flex-wrap:wrap; gap:0.5rem;">
                        <button type="button" class="btn ${p.favorite && !p.hidden ? 'btn-gold' : 'btn-secondary'}" onclick="setPropertyDecision('${p.mls_id}', 'love')"><i data-lucide="heart"></i> Love</button>
                        <button type="button" class="btn ${matrixRev === 'possibility' ? 'btn-primary' : 'btn-secondary'}" onclick="setPropertyDecision('${p.mls_id}', 'consider')"><i data-lucide="circle-help"></i> Consider</button>
                        <button type="button" class="btn ${p.hidden ? 'btn-secondary' : 'btn-secondary'}" style="${p.hidden ? 'color:var(--accent-red); border-color:var(--accent-red);' : ''}" onclick="setPropertyDecision('${p.mls_id}', 'pass')"><i data-lucide="ban"></i> Pass</button>
                    </div>
                </div>

                <div style="display:flex; gap:0.4rem; flex-wrap:wrap; padding-bottom:0.25rem; border-bottom:1px solid var(--border-color);">
                    <button type="button" class="btn btn-secondary" style="font-size:0.78rem; padding:0.35rem 0.6rem;" onclick="window.jumpToPropertyDetailSection('detail-overview')"><i data-lucide="house"></i> Overview</button>
                    <button type="button" class="btn btn-secondary" style="font-size:0.78rem; padding:0.35rem 0.6rem;" onclick="window.jumpToPropertyDetailSection('detail-photos')"><i data-lucide="images"></i> Photos</button>
                    <button type="button" class="btn btn-secondary" style="font-size:0.78rem; padding:0.35rem 0.6rem;" onclick="window.jumpToPropertyDetailSection('detail-notes')"><i data-lucide="notebook-pen"></i> Notes</button>
                    <button type="button" class="btn btn-secondary" style="font-size:0.78rem; padding:0.35rem 0.6rem;" onclick="window.jumpToPropertyDetailSection('detail-activity')"><i data-lucide="history"></i> Activity</button>
                </div>

                <!-- Multi-Photo Gallery Viewer -->
                <div class="modal-gallery-container" id="detail-photos">
                    <div class="gallery-main-viewport">
                        <span class="gallery-count-badge" id="modal-gallery-count">Photo 1 of ${currentGalleryImages.length}</span>
                        ${currentGalleryImages.length > 1 ? `
                            <button type="button" class="gallery-nav-btn prev" onclick="prevModalPhoto()" title="Previous Photo (Left Arrow)"><i data-lucide="chevron-left"></i></button>
                            <button type="button" class="gallery-nav-btn next" onclick="nextModalPhoto()" title="Next Photo (Right Arrow)"><i data-lucide="chevron-right"></i></button>
                        ` : ''}
                        <img id="modal-gallery-main-img" src="${escapeHtml(currentGalleryImages[0])}" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${NO_PHOTO_IMG}';" class="gallery-main-img" alt="Property Image 1" style="cursor:zoom-in;" title="Open full-screen" onclick="openPhotoViewer('${p.mls_id}', currentModalPhotoIndex(), { fromDetail: true })">
                        <button type="button" class="gallery-full-link" style="right:auto; left:14px; cursor:pointer; font-family:inherit; display:inline-flex; align-items:center; gap:6px;" onclick="openPhotoViewer('${p.mls_id}', null, { fromDetail: true })">
                            <i data-lucide="layout-grid"></i> See all ${currentGalleryImages.length} photos
                        </button>
                        <a id="modal-gallery-full-link" href="${isSafeMediaUrl(currentGalleryImages[0]) ? escapeHtml(currentGalleryImages[0]) : '#'}" target="_blank" rel="noopener" class="gallery-full-link">
                            <i data-lucide="image"></i> View Full Image
                        </a>
                    </div>
                    ${currentGalleryImages.length > 1 ? `
                        <div class="gallery-thumb-strip" id="modal-gallery-thumb-strip">
                            ${currentGalleryImages.map((url, idx) => `
                                <div class="gallery-thumb-item ${idx === 0 ? 'active' : ''}" onclick="switchModalPhoto(${idx})" id="gallery-thumb-${idx}">
                                    <img src="${escapeHtml(url)}" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${NO_PHOTO_IMG}';" alt="Thumbnail ${idx + 1}">
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>

                <!-- Public Remarks & Property Description -->
                ${(p.raw_mls_json && p.raw_mls_json.description) ? `
                    <div style="background:var(--bg-input); padding:1.25rem; border-radius:var(--radius-md); border:1px solid var(--border-color);">
                        <div class="modal-section-title" style="margin-bottom:0.5rem;"><i data-lucide="scroll-text"></i> Public Remarks & Property Description</div>
                        <p style="font-size:0.95rem; line-height:1.6; color:var(--text-primary); white-space:pre-line;">${escapeHtml(p.raw_mls_json.description)}</p>
                    </div>
                ` : ''}

                <!-- Section 1: Interior Specifications -->
                <div id="detail-overview">
                    <div class="modal-section-title"><i data-lucide="armchair"></i> Interior Specifications & Features</div>
                    <div class="modal-grid-4">
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Total Bedrooms</span><span class="modal-detail-val">${p.beds}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Total Bathrooms</span><span class="modal-detail-val">${p.baths}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Full Bathrooms</span><span class="modal-detail-val">${(p.raw_mls_json && p.raw_mls_json.interior && p.raw_mls_json.interior.baths_full !== undefined) ? p.raw_mls_json.interior.baths_full : 2}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">3/4 Bathrooms</span><span class="modal-detail-val">${(p.raw_mls_json && p.raw_mls_json.interior && p.raw_mls_json.interior.baths_3_4 !== undefined) ? p.raw_mls_json.interior.baths_3_4 : 1}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Half Bathrooms</span><span class="modal-detail-val">${(p.raw_mls_json && p.raw_mls_json.interior && p.raw_mls_json.interior.baths_1_2 !== undefined) ? p.raw_mls_json.interior.baths_1_2 : 0}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Above-Grade Finished SqFt</span><span class="modal-detail-val">${(p.raw_mls_json && p.raw_mls_json.interior && p.raw_mls_json.interior.sqft_above_grade) ? p.raw_mls_json.interior.sqft_above_grade.toLocaleString() + ' SqFt' : '1,292 SqFt'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Total Area (SqFt)</span><span class="modal-detail-val">${p.sqft_total ? p.sqft_total.toLocaleString() + ' SqFt' : '2,566 SqFt'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Finished Living Area</span><span class="modal-detail-val">${p.sqft_finished ? p.sqft_finished.toLocaleString() + ' SqFt' : '2,507 SqFt'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Below-Grade Total SqFt</span><span class="modal-detail-val">${(p.raw_mls_json && p.raw_mls_json.interior && p.raw_mls_json.interior.sqft_below_grade_total) ? p.raw_mls_json.interior.sqft_below_grade_total.toLocaleString() + ' SqFt' : '1,274 SqFt'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Below-Grade Finished SqFt</span><span class="modal-detail-val">${(p.raw_mls_json && p.raw_mls_json.interior && p.raw_mls_json.interior.sqft_below_grade_finished) ? p.raw_mls_json.interior.sqft_below_grade_finished.toLocaleString() + ' SqFt' : '1,215 SqFt'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">$/SqFt (Above Grade)</span><span class="modal-detail-val">$${(p.raw_mls_json && p.raw_mls_json.interior && p.raw_mls_json.interior.psf_above_grade) ? p.raw_mls_json.interior.psf_above_grade : '387.00'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">$/SqFt (Finished)</span><span class="modal-detail-val">$${(p.raw_mls_json && p.raw_mls_json.interior && p.raw_mls_json.interior.psf_finished) ? p.raw_mls_json.interior.psf_finished : '199.44'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">$/SqFt (Total)</span><span class="modal-detail-val">$${(p.raw_mls_json && p.raw_mls_json.interior && p.raw_mls_json.interior.psf_total) ? p.raw_mls_json.interior.psf_total : '194.86'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Basement Status</span><span class="modal-detail-val">${(p.raw_mls_json && p.raw_mls_json.interior && p.raw_mls_json.interior.basement) ? p.raw_mls_json.interior.basement : 'Finished'}</span></div>
                        <div class="modal-detail-box" style="grid-column: span 2;"><span class="modal-detail-lbl">Included Appliances</span><span class="modal-detail-val" style="font-size:0.85rem;">${(p.raw_mls_json && p.raw_mls_json.interior && p.raw_mls_json.interior.appliances) ? p.raw_mls_json.interior.appliances : 'Bar Fridge, Dishwasher, Microwave, Oven, Range, Refrigerator'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Flooring Types</span><span class="modal-detail-val">${(p.raw_mls_json && p.raw_mls_json.interior && p.raw_mls_json.interior.flooring) ? p.raw_mls_json.interior.flooring : 'Carpet, Laminate'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Fireplaces</span><span class="modal-detail-val">${(p.raw_mls_json && p.raw_mls_json.interior && p.raw_mls_json.interior.fireplaces) ? p.raw_mls_json.interior.fireplaces : '2/Gas, Living Room'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Excluded Items</span><span class="modal-detail-val">${(p.raw_mls_json && p.raw_mls_json.interior && p.raw_mls_json.interior.exclusions) ? (p.raw_mls_json.interior.exclusions === 'NONE' ? 'None' : p.raw_mls_json.interior.exclusions) : 'None'}</span></div>
                    </div>
                </div>

                <!-- Section 2: Detailed Room Info Table -->
                ${(p.raw_mls_json && p.raw_mls_json.rooms && p.raw_mls_json.rooms.length > 0) ? `
                    <div>
                        <div class="modal-section-title"><i data-lucide="bed"></i> Detailed Room Info Table</div>
                        <table class="room-table">
                            <thead>
                                <tr>
                                    <th>Type</th>
                                    <th>Features</th>
                                    <th>Dimensions</th>
                                    <th>Level</th>
                                    <th>Description</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${p.raw_mls_json.rooms.map(r => `
                                    <tr>
                                        <td><strong>${escapeHtml(r.type || '')}</strong></td>
                                        <td>${escapeHtml(r.features || '-')}</td>
                                        <td>${escapeHtml(r.dim || '-')}</td>
                                        <td><span class="level-badge level-${(r.level || 'Main').toLowerCase()}">${escapeHtml(r.level || 'Main')}</span></td>
                                        <td>${escapeHtml(r.desc || '-')}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                ` : ''}

                <!-- Section 3: General & Building Specs -->
                <div>
                    <div class="modal-section-title"><i data-lucide="home"></i> General Property & Building Information</div>
                    <div class="modal-grid-4">
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Beds / Baths</span><span class="modal-detail-val">${p.beds} Beds / ${p.baths} Baths</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Finished SqFt</span><span class="modal-detail-val">${p.sqft_finished ? p.sqft_finished.toLocaleString() : (p.sqft_total ? p.sqft_total.toLocaleString() : 'N/A')}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Total SqFt</span><span class="modal-detail-val">${p.sqft_total ? p.sqft_total.toLocaleString() : 'N/A'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Price / SqFt</span><span class="modal-detail-val">${ppsqft ? '$' + ppsqft : 'N/A'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Year Built</span><span class="modal-detail-val">${p.year_built || 'N/A'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Property Type</span><span class="modal-detail-val">${escapeHtml(p.property_type || 'Single Family Residence')}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Style / Levels</span><span class="modal-detail-val">${escapeHtml(p.levels || 'Ranch / One Story')}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Status</span><span class="modal-detail-val">${escapeHtml(p.status || 'Active')}</span></div>
                    </div>
                </div>

                <!-- Section 2: Lot & Location Specs -->
                <div>
                    <div class="modal-section-title"><i data-lucide="map-pin"></i> Location & Lot Features</div>
                    <div class="modal-grid-3">
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Address</span><span class="modal-detail-val">${escapeHtml(p.address || 'N/A')}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">City, State, Zip</span><span class="modal-detail-val">${escapeHtml(p.city || '')}, ${escapeHtml(p.state || '')} ${escapeHtml(p.zip || '')}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Lot Acres</span><span class="modal-detail-val">${p.lot_acres ? p.lot_acres + ' Acres' : 'N/A'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Lot SqFt</span><span class="modal-detail-val">${p.lot_sqft ? p.lot_sqft.toLocaleString() + ' SqFt' : 'N/A'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">School District</span><span class="modal-detail-val">${escapeHtml(p.school_district || 'Cherry Creek 5')}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">MLS ID</span><span class="modal-detail-val">${p.mls_id}</span></div>
                    </div>
                </div>

                <!-- Section 3: Garage & Parking -->
                <div>
                    <div class="modal-section-title"><i data-lucide="car"></i> Parking & Garage Features</div>
                    <div class="modal-grid-3">
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Garage Spaces</span><span class="modal-detail-val">${p.garage_spaces || (p.parking_total || '2')} Garage Spaces</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Total Parking</span><span class="modal-detail-val">${p.parking_total || '3'} Parking Spaces</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Parking Type</span><span class="modal-detail-val">Attached Garage / Driveway</span></div>
                    </div>
                </div>

                <!-- Price vs. Comps (RentCast, on demand - see window.checkComps) -->
                <div id="detail-comps" data-mls="${escapeHtml(String(p.mls_id))}">${buildCompsSectionHtml(p)}</div>

                <!-- Section 4: Financials, Taxes & HOA -->
                <div>
                    <div class="modal-section-title"><i data-lucide="wallet"></i> Financials, Taxes & HOA</div>
                    <div class="modal-grid-4">
                        <div class="modal-detail-box"><span class="modal-detail-lbl">List Price</span><span class="modal-detail-val" style="color:var(--accent-gold);">$${p.price.toLocaleString()}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Annual Property Tax</span><span class="modal-detail-val">${p.annual_tax ? '$' + p.annual_tax.toLocaleString() : 'N/A'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Tax Year</span><span class="modal-detail-val">${p.tax_year || '2025'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">HOA Fee</span><span class="modal-detail-val">${p.hoa_fee ? '$' + p.hoa_fee + '/yr' : 'No HOA'}</span></div>
                    </div>
                </div>

                <!-- Section 5: Rating & Notes -->
                <div id="detail-notes" style="background:var(--bg-input); padding:1.25rem; border-radius:var(--radius-md); border:1px solid var(--border-color); display:flex; flex-direction:column; gap:1.25rem;">
                    <div>
                        <div class="modal-section-title" style="border:none; margin:0 0 0.5rem 0;"><i data-lucide="star"></i> My Home Rating</div>
                        <div class="rating-picker" id="modal-rating-picker">
                            ${ratingStarsHtml}
                            <span style="font-size:0.85rem; color:var(--text-muted); margin-left:0.5rem;" id="rating-label">${currentRating ? currentRating + ' / 5 Stars' : 'Unrated'}</span>
                        </div>
                    </div>

                    <div style="display:flex; flex-direction:column; gap:0.5rem;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <h3 style="font-size:0.95rem; font-weight:700; color:var(--text-primary);"><i data-lucide="sparkles"></i> Property Reaction Chips</h3>
                            <span style="font-size:0.78rem; color:var(--text-muted);">Click to tag listing</span>
                        </div>
                        <div id="modal-reaction-chips-container">
                            ${window.renderReactionChipsHtml(p)}
                        </div>
                    </div>

                    <div style="display:flex; flex-direction:column; gap:0.5rem;">
                        <h3 style="font-size:0.95rem; font-weight:700; color:var(--text-primary);"><i data-lucide="pencil"></i> Personal Buyer Notes & Pros/Cons</h3>
                        <textarea id="modal-user-notes" class="input-text" style="min-height:90px;" placeholder="Add private notes, pros/cons, showing feedback...">${escapeHtml(p.user_notes || '')}</textarea>
                    </div>

                    ${renderMlsSyncPanel(p, matrixRev)}

                    <div style="display:flex; flex-direction:column; gap:0.5rem;">
                        <h3 style="font-size:0.95rem; font-weight:700; color:var(--text-primary);"><i data-lucide="handshake"></i> Questions & Comments for Realtor</h3>
                        <textarea id="modal-realtor-notes" class="input-text" style="min-height:70px;" placeholder="Add questions to ask realtor or showing availability...">${escapeHtml(p.realtor_notes || '')}</textarea>
                    </div>

                    <div id="detail-activity" style="border-top:1px solid var(--border-color); padding-top:1rem;">
                        <h3 style="font-size:0.95rem; font-weight:700; color:var(--text-primary);"><i data-lucide="history"></i> Activity</h3>
                        <div id="modal-property-activity" style="margin-top:0.6rem; color:var(--text-muted); font-size:0.85rem;">Loading activity...</div>
                    </div>

                    <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border-color); padding-top:1rem;">
                        <button class="btn btn-secondary" style="color:var(--accent-red);" onclick="hideProperty('${p.mls_id}')"><i data-lucide="eye-off"></i> Hide Listing</button>
                        <button class="btn btn-primary" onclick="saveModalNotes('${p.mls_id}')"><i data-lucide="save"></i> Save Rating & Notes</button>
                    </div>
                </div>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();

        elements.modalDetail.classList.add('active');
        elements.modalDetail.dataset.currentMlsId = mlsId;

        const modalContent = elements.modalDetail?.querySelector('.modal-content');
        if (modalContent) {
            modalContent.scrollTop = 0;
        }

        window.loadPropertyActivity(mlsId);
    };

    // ---- Comps (RentCast) -------------------------------------------------------------------
    // Lookups only ever happen from the buttons below: the free RentCast plan allows 50 a month,
    // so nothing fetches comps automatically. Results are stored server-side per listing and come
    // back with the normal property list, so reopening a home costs nothing.
    const COMPS_MONTHLY_LOOKUPS = 50;
    const compsMoney = n => '$' + Math.round(Number(n) || 0).toLocaleString();
    const compsDate = value => {
        const d = value ? new Date(value) : null;
        return (d && !Number.isNaN(d.getTime())) ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '';
    };

    function buildCompsActionButton(p) {
        const id = escapeHtml(String(p.mls_id));
        return getCompScore(p)
            ? `<button type="button" class="btn btn-secondary" onclick="jumpToPropertyDetailSection('detail-comps')"><i data-lucide="scale"></i> View Comps</button>`
            : `<button type="button" class="btn btn-secondary" data-comps-btn onclick="checkComps('${id}')"><i data-lucide="scale"></i> Check Comps</button>`;
    }

    function buildCompsSectionHtml(p) {
        const id = escapeHtml(String(p.mls_id));
        const title = `<div class="modal-section-title"><i data-lucide="scale"></i> Price vs. Comps</div>`;
        const s = getCompScore(p);
        if (!s) {
            return `${title}
                <div style="display:flex; align-items:center; gap:0.75rem; flex-wrap:wrap;">
                    <button type="button" class="btn btn-secondary" data-comps-btn onclick="checkComps('${id}')"><i data-lucide="scale"></i> Check Comps</button>
                    <span class="comps-note" style="margin:0;">Looks up comparable listings on RentCast and scores this price against them. Each check uses one of your ${COMPS_MONTHLY_LOOKUPS} monthly lookups.</span>
                </div>`;
        }

        const comps = Array.isArray(p.comps) ? p.comps : [];
        const low = Number(p.comp_range_low) || 0;
        const high = Number(p.comp_range_high) || 0;
        const diffText = `${s.diff < 0 ? '-' : '+'}${compsMoney(Math.abs(s.diff))}`;
        const subj = p.comp_subject || {};
        const subjParts = [];
        if (subj.bedrooms) subjParts.push(`${subj.bedrooms} bd`);
        if (subj.bathrooms) subjParts.push(`${subj.bathrooms} ba`);
        if (subj.squareFootage) subjParts.push(`${Number(subj.squareFootage).toLocaleString()} sqft`);
        if (subj.yearBuilt) subjParts.push(`built ${subj.yearBuilt}`);
        const checked = compsDate(p.comp_fetched_at);

        const rows = comps.map(c => {
            const sqft = Number(c.squareFootage) || 0;
            const price = Number(c.price) || 0;
            const offMarket = String(c.status || '').toLowerCase() !== 'active';
            const when = offMarket ? (compsDate(c.removedDate) ? `Off market ${compsDate(c.removedDate)}` : 'Off market') : 'Active';
            return `<tr>
                <td>${escapeHtml(c.formattedAddress || '')}</td>
                <td>${price ? compsMoney(price) : 'N/A'}</td>
                <td>${c.bedrooms ?? '?'} / ${c.bathrooms ?? '?'}</td>
                <td>${sqft ? sqft.toLocaleString() : 'N/A'}</td>
                <td>${(price && sqft) ? compsMoney(price / sqft) : 'N/A'}</td>
                <td>${c.distance != null ? Number(c.distance).toFixed(2) + ' mi' : ''}</td>
                <td>${escapeHtml(when)}</td>
                <td>${c.correlation != null ? Math.round(Number(c.correlation) * 100) + '%' : ''}</td>
            </tr>`;
        }).join('');

        return `${title}
            <div class="modal-grid-4">
                <div class="modal-detail-box"><span class="modal-detail-lbl">Price Score</span><span class="modal-detail-val">${buildCompScoreBadge(p, true)}</span></div>
                <div class="modal-detail-box"><span class="modal-detail-lbl">Comp-Based Value</span><span class="modal-detail-val">${compsMoney(s.estimate)}</span></div>
                <div class="modal-detail-box"><span class="modal-detail-lbl">Likely Range</span><span class="modal-detail-val">${(low && high) ? `${compsMoney(low)} - ${compsMoney(high)}` : 'N/A'}</span></div>
                <div class="modal-detail-box"><span class="modal-detail-lbl">List Price vs. Value</span><span class="modal-detail-val">${diffText}</span></div>
            </div>
            <div class="comps-note">
                Based on ${comps.length} comparable listing${comps.length === 1 ? '' : 's'} from RentCast${checked ? `, checked ${escapeHtml(checked)}` : ''}.
                ${subjParts.length ? `RentCast valued this home as ${escapeHtml(subjParts.join(' / '))}.` : ''}
                Comp prices are listing prices (active or recently off market), not confirmed closing prices.
                The score re-calculates on its own if this home's price changes.
            </div>
            ${rows ? `<div class="comps-table-wrap"><table class="room-table">
                <thead><tr><th>Comparable</th><th>Price</th><th>Bd / Ba</th><th>SqFt</th><th>$/SqFt</th><th>Distance</th><th>Status</th><th>Match</th></tr></thead>
                <tbody>${rows}</tbody>
            </table></div>` : ''}
            <div style="margin-top:0.75rem;">
                <button type="button" class="btn btn-secondary" data-comps-btn onclick="checkComps('${id}', true)"><i data-lucide="refresh-cw"></i> Refresh Comps</button>
            </div>`;
    }

    function refreshCompsUi(p) {
        const section = document.getElementById('detail-comps');
        if (!section || section.dataset.mls !== String(p.mls_id)) return;
        section.innerHTML = buildCompsSectionHtml(p);
        const scoreSlot = document.getElementById('modal-comp-score-slot');
        if (scoreSlot) scoreSlot.innerHTML = buildCompScoreBadge(p, true);
        const actionSlot = document.getElementById('modal-comps-action-slot');
        if (actionSlot) actionSlot.innerHTML = buildCompsActionButton(p);
        if (window.lucide) window.lucide.createIcons();
    }

    window.checkComps = function(mlsId, force = false) {
        const p = state.allProperties.find(x => String(x.mls_id) === String(mlsId));
        if (!p) return;
        if (force && !confirm(`Refresh comps for this home? This uses one of your ${COMPS_MONTHLY_LOOKUPS} monthly RentCast lookups.`)) return;
        document.querySelectorAll('[data-comps-btn]').forEach(btn => { btn.disabled = true; btn.textContent = 'Checking comps...'; });
        apiFetch(CONFIG.API_URL + '?action=check_comps', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mls_id: mlsId, force: !!force })
        }).then(data => {
            if (!data || !data.success || !data.comps) throw new Error((data && data.error) || 'Comps lookup failed');
            Object.assign(p, data.comps);
            refreshCompsUi(p);
            applyFiltersAndRender();
            const s = getCompScore(p);
            const usage = data.usage ? ` (${data.usage.used} of ${data.usage.cap} lookups used)` : '';
            showToast(s ? `Price score ${s.score}: ${s.pctText}${usage}` : 'Comps saved', 'success');
        }).catch(error => {
            refreshCompsUi(p);
            showToast(error.message || 'Comps lookup failed', 'error');
        });
    };

    window.loadPropertyActivity = function(mlsId) {
        const container = document.getElementById('modal-property-activity');
        if (!container) return;
        apiFetch(CONFIG.API_URL + '?action=get_property_activity&mls_id=' + encodeURIComponent(mlsId))
            .then(data => {
                const activity = data?.activity || [];
                if (!activity.length) {
                    container.textContent = 'No activity has been recorded for this property yet.';
                    return;
                }
                container.innerHTML = activity.map(item => `
                    <div style="display:grid; grid-template-columns:auto 1fr; gap:0.65rem; padding:0.55rem 0; border-bottom:1px solid var(--border-color);">
                        <i data-lucide="${getActivityIcon(item.activity_type)}" style="color:var(--accent-gold); margin-top:0.1rem;"></i>
                        <div><div style="color:var(--text-primary);">${escapeHtml(item.message)}</div><div style="margin-top:0.1rem; font-size:0.76rem; color:var(--text-muted);">${escapeHtml(item.created_at || '')}${item.actor_username ? ` by ${escapeHtml(item.actor_username)}` : ''}</div></div>
                    </div>
                `).join('');
                if (window.lucide) window.lucide.createIcons();
            })
            .catch(() => {
                container.textContent = 'Activity is temporarily unavailable.';
            });
    };

    window.jumpToPropertyDetailSection = function(sectionId) {
        document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    window.setModalRating = function(mlsId, ratingVal) {
        const p = state.allProperties.find(item => item.mls_id === mlsId);
        if (p) p.rating = ratingVal;
        
        apiFetch(CONFIG.API_URL + '?action=update_user_data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mls_id: mlsId, rating: ratingVal })
        }).then(() => {
            renderClientNextSteps();
            const label = document.getElementById('rating-label');
            if (label) label.innerText = `${ratingVal} / 5 Stars`;
            
            document.querySelectorAll('#modal-rating-picker .star-btn').forEach((btn, idx) => {
                if (idx < ratingVal) btn.classList.add('selected');
                else btn.classList.remove('selected');
            });
        });
    };

    window.toggleFavorite = function(mlsId, event) {
        if (event) event.stopPropagation();
        const p = state.allProperties.find(item => item.mls_id === mlsId);
        if (!p) return;

        const newFav = p.favorite ? 0 : 1;
        p.favorite = newFav;

        apiFetch(CONFIG.API_URL + '?action=update_user_data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mls_id: mlsId, favorite: newFav })
        }).then(() => {
            applyFiltersAndRender();
            renderClientNextSteps();
            showToast(newFav ? 'Saved to Favorites' : 'Removed from Favorites', newFav ? 'success' : 'info');
        });
    };

    window.toggleFavoriteModal = function(mlsId) {
        window.toggleFavorite(mlsId);
        openDetailModal(mlsId);
    };

    // ---- MLS portal two-way sync panel -------------------------------------------------------
    // Status: pushed automatically on the next scrape (with a confirm prompt on the portal) when
    // only Dibs changed. Notes: append-only on the portal, so they're only sent via the explicit
    // "Queue for MLS" outbox below — never derived from the personal notes field automatically.
    const MLS_STATUS_LABELS = { favorite: 'Favorite', possibility: 'Possibility', dislike: 'Disliked', none: 'No status' };

    function renderMlsSyncPanel(p, dibsStatus) {
        const baseline = p.mls_status_baseline || null;
        const seen = p.mls_status_seen || baseline;
        const conflict = Number(p.mls_status_conflict) === 1;
        let statusLine;
        if (!baseline) {
            statusLine = `<span style="color:var(--text-muted);">Not synced with the MLS yet — runs on the next scrape.</span>`;
        } else if (conflict) {
            statusLine = `
                <div style="border:1px solid var(--accent-red); border-radius:var(--radius-sm); padding:0.6rem; color:var(--text-primary);">
                    <strong><i data-lucide="triangle-alert"></i> Conflict:</strong> both sides changed since the last sync.
                    Dibs says <strong>${MLS_STATUS_LABELS[dibsStatus]}</strong>, MLS says <strong>${MLS_STATUS_LABELS[seen] || seen}</strong>. Nothing will be pushed until you pick one.
                    <div style="display:flex; gap:0.5rem; margin-top:0.5rem; flex-wrap:wrap;">
                        <button type="button" class="btn btn-primary" onclick="resolveMlsConflict('${p.mls_id}', 'keep_dibs')">Keep Dibs (${MLS_STATUS_LABELS[dibsStatus]})</button>
                        <button type="button" class="btn btn-secondary" onclick="resolveMlsConflict('${p.mls_id}', 'take_mls')">Use MLS (${MLS_STATUS_LABELS[seen] || seen})</button>
                    </div>
                </div>`;
        } else if (dibsStatus !== baseline) {
            statusLine = `<span><i data-lucide="upload"></i> MLS will change <strong>${MLS_STATUS_LABELS[baseline]}</strong> → <strong>${MLS_STATUS_LABELS[dibsStatus]}</strong> on the next scrape (you'll confirm it on the portal).</span>`;
        } else {
            statusLine = `<span style="color:var(--text-muted);"><i data-lucide="check"></i> In sync with MLS (${MLS_STATUS_LABELS[baseline]}).</span>`;
        }

        const notes = Array.isArray(p.mls_notes) ? p.mls_notes : [];
        const notesHtml = notes.length
            ? notes.map(n => `<div style="padding:0.4rem 0; border-bottom:1px solid var(--border-color);"><span style="color:var(--text-muted); font-size:0.8rem;">${escapeHtml(n.date || '')} · ${escapeHtml(n.author || '')}</span><div>${escapeHtml(n.text || '')}</div></div>`).join('')
            : `<div style="color:var(--text-muted);">No notes on the MLS portal yet.</div>`;

        const outbox = (p.mls_note_outbox || '').trim();
        const outboxHtml = outbox
            ? `<div style="border:1px dashed var(--border-color); border-radius:var(--radius-sm); padding:0.6rem;">
                   <div style="font-size:0.85rem; color:var(--text-muted);"><i data-lucide="clock"></i> Queued — posts on the next scrape after you confirm it on the portal:</div>
                   <div style="margin:0.35rem 0;">"${escapeHtml(outbox)}"</div>
                   <button type="button" class="btn btn-secondary" onclick="setMlsNoteOutbox('${p.mls_id}', '')">Cancel</button>
               </div>`
            : `<div id="modal-mls-note-chips">${window.renderMlsNoteChipsHtml()}</div>
               <textarea id="modal-mls-note" class="input-text" maxlength="500" style="min-height:60px;" placeholder="Short note for your realtor, e.g. Not extra wide garage — or tap a chip above" oninput="window.onMlsNoteInput()"></textarea>
               <div style="display:flex; align-items:center; gap:0.5rem; flex-wrap:wrap;">
                   <button type="button" class="btn btn-primary" onclick="queueMlsNoteFromModal('${p.mls_id}')"><i data-lucide="send"></i> Queue for MLS</button>
                   <span id="modal-mls-note-count" style="font-size:0.8rem; color:var(--text-muted);">0 / 500</span>
                   <span style="font-size:0.8rem; color:var(--text-muted);">Portal notes are permanent — they can't be edited or deleted.</span>
               </div>`;

        return `
            <div style="border:1px solid var(--border-color); border-radius:var(--radius-sm); padding:0.85rem; background:var(--bg-panel); display:flex; flex-direction:column; gap:0.6rem;">
                <h3 style="font-size:0.95rem; font-weight:700; color:var(--text-primary);"><i data-lucide="refresh-cw"></i> MLS Portal Sync</h3>
                <div style="font-size:0.85rem;">${statusLine}</div>
                <div style="font-size:0.85rem;">${notesHtml}</div>
                ${outboxHtml}
            </div>`;
    }

    function postMlsUpdate(mlsId, body, successMsg) {
        return apiFetch(CONFIG.API_URL + '?action=update_user_data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mls_id: mlsId, ...body })
        }).then(data => {
            if (!data?.success) throw new Error(data?.error || 'Unable to save');
            showToast(successMsg, 'success');
            return data;
        }).catch(error => { showToast(error.message || 'Unable to save', 'error'); throw error; });
    }

    window.setMlsNoteOutbox = function(mlsId, text) {
        const p = state.allProperties.find(item => item.mls_id === mlsId);
        postMlsUpdate(mlsId, { mls_note_outbox: text }, text ? 'Queued for the MLS' : 'MLS note cancelled').then(() => {
            if (p) p.mls_note_outbox = text || null;
            openDetailModal(mlsId);
        }).catch(() => {});
    };

    window.queueMlsNoteFromModal = function(mlsId) {
        const el = document.getElementById('modal-mls-note');
        const text = (el?.value || '').trim();
        if (!text) { showToast('Type a note first', 'error'); return; }
        if (text.length > 500) { showToast('MLS notes are limited to 500 characters', 'error'); return; }
        const p = state.allProperties.find(item => item.mls_id === mlsId);
        const norm = s => String(s || '').replace(/\s+/g, ' ').trim().replace(/^["“](.*)["”]$/s, '$1').trim().toLowerCase();
        if ((p?.mls_notes || []).some(n => norm(n.text) === norm(text))) {
            showToast('That note is already on the MLS portal', 'error');
            return;
        }
        window.setMlsNoteOutbox(mlsId, text);
    };

    window.resolveMlsConflict = function(mlsId, choice) {
        const p = state.allProperties.find(item => item.mls_id === mlsId);
        postMlsUpdate(mlsId, { mls_conflict_resolve: choice }, choice === 'keep_dibs' ? 'Dibs status will be pushed on the next scrape' : 'Using the MLS status').then(() => {
            if (p) {
                // Mirror what the server just did (handleUpdateUserData, mls_conflict_resolve).
                const seen = p.mls_status_seen;
                p.mls_status_baseline = seen;
                p.mls_status_conflict = 0;
                if (choice === 'take_mls') {
                    p.favorite = seen === 'favorite' ? 1 : 0;
                    p.hidden = seen === 'dislike' ? 1 : 0;
                    p.possibility = seen === 'possibility' ? 1 : 0;
                }
            }
            applyFiltersAndRender();
            renderClientNextSteps();
            openDetailModal(mlsId);
        }).catch(() => {});
    };

    window.setPropertyDecision = function(mlsId, decision) {
        const p = state.allProperties.find(item => item.mls_id === mlsId);
        if (!p) return;
        const decisions = {
            // These three map 1:1 onto the MLS portal buckets (Favorite / Possibility / Dislike)
            // and are pushed there on the next scrape. Clicking the active one clears it (-> none).
            love: { favorite: 1, hidden: 0, possibility: 0, rating: 5, message: 'Saved as a favorite' },
            consider: { favorite: 0, hidden: 0, possibility: 1, rating: 3, message: 'Marked as a possibility' },
            pass: { favorite: 0, hidden: 1, possibility: 0, rating: 0, message: 'Marked as passed' }
        };
        let update = decisions[decision];
        if (!update) return;
        const isActive = (decision === 'love' && p.favorite && !p.hidden)
            || (decision === 'consider' && getPropertyReviewStatus(p) === 'possibility')
            || (decision === 'pass' && p.hidden);
        if (isActive) {
            update = { favorite: 0, hidden: 0, possibility: 0, rating: p.rating, message: 'Decision cleared' };
        }

        apiFetch(CONFIG.API_URL + '?action=update_user_data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mls_id: mlsId, favorite: update.favorite, hidden: update.hidden, possibility: update.possibility, rating: update.rating })
        }).then(data => {
            if (!data?.success) throw new Error(data?.error || 'Unable to save decision');
            p.favorite = update.favorite;
            p.hidden = update.hidden;
            p.possibility = update.possibility;
            p.rating = update.rating;
            applyFiltersAndRender();
            renderClientNextSteps();
            showToast(update.message, 'success');
            openDetailModal(mlsId);
        }).catch(error => showToast(error.message || 'Unable to save decision', 'error'));
    };

    window.saveModalNotes = function(mlsId) {
        const userNotes = document.getElementById('modal-user-notes').value;
        const realtorNotes = document.getElementById('modal-realtor-notes').value;

        const p = state.allProperties.find(item => item.mls_id === mlsId);
        if (p) {
            p.user_notes = userNotes;
            p.realtor_notes = realtorNotes;
        }

        apiFetch(CONFIG.API_URL + '?action=update_user_data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mls_id: mlsId, user_notes: userNotes, realtor_notes: realtorNotes })
        }).then(() => {
            elements.modalDetail.classList.remove('active');
            applyFiltersAndRender();
            renderClientNextSteps();
            showToast('Rating & Notes Saved', 'success');
        });
    };

    window.hideProperty = function(mlsId) {
        const p = state.allProperties.find(item => item.mls_id === mlsId);
        if (p) p.hidden = 1;

        apiFetch(CONFIG.API_URL + '?action=update_user_data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mls_id: mlsId, hidden: 1 })
        }).then(() => {
            elements.modalDetail.classList.remove('active');
            applyFiltersAndRender();
            renderClientNextSteps();
            showToast('Property Hidden', 'warning');
        });
    };

    // Gallery Photo Switchers & Keyboard Controls
    window.switchModalPhoto = function(index) {
        if (!currentGalleryImages || currentGalleryImages.length === 0) return;
        if (index < 0) index = currentGalleryImages.length - 1;
        if (index >= currentGalleryImages.length) index = 0;

        currentGalleryIndex = index;
        const url = currentGalleryImages[currentGalleryIndex];

        const mainImg = document.getElementById('modal-gallery-main-img');
        const countBadge = document.getElementById('modal-gallery-count');
        const fullLink = document.getElementById('modal-gallery-full-link');

        if (mainImg) {
            mainImg.style.opacity = '0.3';
            mainImg.src = url;
            setTimeout(() => { mainImg.style.opacity = '1'; }, 100);
        }
        if (countBadge) {
            countBadge.innerText = `Photo ${currentGalleryIndex + 1} of ${currentGalleryImages.length}`;
        }
        if (fullLink) {
            fullLink.href = isSafeMediaUrl(url) ? url : '#';
        }

        document.querySelectorAll('.gallery-thumb-item').forEach((item, idx) => {
            if (idx === currentGalleryIndex) {
                item.classList.add('active');
                item.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            } else {
                item.classList.remove('active');
            }
        });
    };

    window.currentModalPhotoIndex = function() { return currentGalleryIndex; };

    window.prevModalPhoto = function() {
        window.switchModalPhoto(currentGalleryIndex - 1);
    };

    window.nextModalPhoto = function() {
        window.switchModalPhoto(currentGalleryIndex + 1);
    };

    // Keyboard Arrow Navigation for Photo Gallery
    document.addEventListener('keydown', function(e) {
        const modal = document.getElementById('modal-detail') || (elements && elements.modalDetail);
        if (!modal || !modal.classList.contains('active')) return;
        if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;

        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            window.prevModalPhoto();
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            window.nextModalPhoto();
        }
    });

