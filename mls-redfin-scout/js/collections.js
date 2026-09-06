/**
 * MLS & Redfin Property Scout - Curated Playlists & Custom Collections
 * Manages realtor-curated property collections, agent intro notes, client share links,
 * and adding items to playlists.
 */
import { apiFetch } from './api.js';
import { CONFIG, state, elements } from './state.js';
import { showToast } from './toast.js';
import { cleanDisplayAddress, escapeHtml, getPropertyReviewStatus, NO_PHOTO_IMG } from './properties.js';

export let cachedCollections = [];
let editingMlsIds = [];

export async function fetchCollections() {
    try {
        const res = await apiFetch(CONFIG.API_URL + '?action=list_collections');
        if (res && res.success && Array.isArray(res.collections)) {
            cachedCollections = res.collections;
            state.collections = res.collections;
            renderPlaylistsTable(res.collections);
            renderClientPlaylistBanner(res.collections);
        }
    } catch (e) {
        console.error('Failed to fetch curated playlists:', e);
    }
}

window.inlineCarouselState = {
    token: null,
    properties: [],
    currentIndex: 0,
    intervalId: null,
    isPaused: false
};

window.stepInlineCarousel = function(step) {
    const props = window.inlineCarouselState.properties;
    if (!props || !props.length) return;
    let nextIdx = (window.inlineCarouselState.currentIndex + step) % props.length;
    if (nextIdx < 0) nextIdx = props.length - 1;
    window.inlineCarouselState.currentIndex = nextIdx;
    window.renderInlineCarouselSlide();
};

window.goToPropertyCard = function(mlsId) {
    if (!mlsId) return;
    if (typeof window.openDetailModal === 'function') {
        window.openDetailModal(mlsId);
    }
    const card = document.querySelector(`.property-card[data-mls="${mlsId}"]`);
    if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
};

window.renderInlineCarouselSlide = function() {
    const container = document.getElementById('inline-playlist-carousel');
    if (!container) return;
    const props = window.inlineCarouselState.properties;
    if (!props || !props.length) {
        container.innerHTML = `<span style="font-size:0.85rem; color:rgba(250, 246, 240, 0.7); font-style:italic; padding:0.5rem;">No homes in this playlist yet</span>`;
        return;
    }
    const idx = window.inlineCarouselState.currentIndex;
    const p = props[idx];
    const displayAddr = escapeHtml(p.address || `MLS #${p.mls_id}`);
    const imgUrl = p.main_image_url || NO_PHOTO_IMG;
    const ppsqft = p.sqft_finished ? Math.round(p.price / p.sqft_finished) : 0;
    
    let revStatusBadge = '';
    const rawStatus = getPropertyReviewStatus(p);
    if (rawStatus === 'favorite') revStatusBadge = `<span style="font-size:0.75rem; background:#d97706; color:#fff; padding:2px 8px; border-radius:12px; font-weight:800; box-shadow:0 2px 6px rgba(0,0,0,0.3);"><i data-lucide="star"></i> Liked</span>`;
    else if (rawStatus === 'possibility') revStatusBadge = `<span style="font-size:0.75rem; background:#0284c7; color:#fff; padding:2px 8px; border-radius:12px; font-weight:800; box-shadow:0 2px 6px rgba(0,0,0,0.3);"><i data-lucide="circle-help"></i> Possibility</span>`;

    container.innerHTML = `
        <div style="width:105px; height:68px; border-radius:6px; overflow:hidden; border:1px solid rgba(193, 137, 46, 0.45); flex-shrink:0; position:relative; background:#0f1712; cursor:pointer; box-shadow:0 4px 10px rgba(0,0,0,0.4);" onclick="window.goToPropertyCard('${p.mls_id}')" title="Click to view house details">
            <img src="${imgUrl}" alt="${displayAddr}" style="width:100%; height:100%; object-fit:cover; transition:transform 0.3s ease;" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${NO_PHOTO_IMG}';" onmouseenter="this.style.transform='scale(1.06)'" onmouseleave="this.style.transform='scale(1)'">
        </div>
        <div style="flex:1; min-width:0; display:flex; flex-direction:column; justify-content:center; gap:3px; cursor:pointer;" onclick="window.goToPropertyCard('${p.mls_id}')" title="Click to view house details">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:0.5rem;">
                <span style="font-size:1.15rem; font-weight:800; color:var(--accent-gold); white-space:nowrap; letter-spacing:-0.01em;">$${(p.price || 0).toLocaleString()}</span>
                ${revStatusBadge}
            </div>
            <div style="font-size:0.95rem; font-weight:700; color:#FAF6F0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; line-height:1.2;" title="${displayAddr}">
                ${displayAddr}
            </div>
            <div style="font-size:0.82rem; color:rgba(250, 246, 240, 0.8); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-weight:500;">
                ${p.beds || 0} Bed • ${p.baths || 0} Bath • ${(p.sqft_finished || 0).toLocaleString()} SqFt ${ppsqft ? `($${ppsqft}/sqft)` : ''}
            </div>
        </div>
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px; flex-shrink:0; margin-left:0.25rem;">
            <div style="display:flex; gap:4px;">
                <button type="button" class="btn btn-secondary" style="padding:4px 8px; font-size:0.78rem; border-radius:4px; background:rgba(255,255,255,0.12); color:#FAF6F0; border:1px solid rgba(255,255,255,0.25);" onclick="event.stopPropagation(); window.stepInlineCarousel(-1);" title="Previous house"><i data-lucide="chevron-left"></i></button>
                <button type="button" class="btn btn-gold" style="padding:4px 8px; font-size:0.78rem; border-radius:4px;" onclick="event.stopPropagation(); window.stepInlineCarousel(1);" title="Next house"><i data-lucide="chevron-right"></i></button>
            </div>
            <span style="font-size:0.75rem; color:var(--accent-gold); font-weight:800; letter-spacing:0.04em;">${idx + 1} / ${props.length}</span>
        </div>
    `;
    if (window.lucide) window.lucide.createIcons();
};

window.initInlinePlaylistCarousel = async function(token, collections) {
    if (!token) return;
    window.inlineCarouselState.token = token;
    window.inlineCarouselState.currentIndex = 0;
    window.inlineCarouselState.isPaused = false;

    if (window.inlineCarouselState.intervalId) {
        clearInterval(window.inlineCarouselState.intervalId);
        window.inlineCarouselState.intervalId = null;
    }

    const allCollections = collections || cachedCollections || state.collections || [];
    let playlist = allCollections.find(c => c.share_token === token);
    let props = playlist?.properties || playlist?.items || [];

    let mlsIds = [];
    if (playlist?.mls_ids) {
        mlsIds = Array.isArray(playlist.mls_ids) ? playlist.mls_ids : [];
    } else if (playlist?.mls_ids_json) {
        try { mlsIds = typeof playlist.mls_ids_json === 'string' ? JSON.parse(playlist.mls_ids_json) : playlist.mls_ids_json; } catch(e) {}
    }

    if (!props.length && mlsIds.length > 0 && Array.isArray(state.allProperties) && state.allProperties.length > 0) {
        const mlsStrSet = new Set(mlsIds.map(id => String(id)));
        props = state.allProperties.filter(p => mlsStrSet.has(String(p.mls_id)));
    }

    if (!props.length) {
        try {
            const res = await apiFetch(CONFIG.API_URL + '?action=get_collection&token=' + encodeURIComponent(token));
            if (res && res.success && res.collection) {
                playlist = res.collection;
                props = res.collection.items || res.collection.properties || [];
                if (playlist) {
                    playlist.items = props;
                    playlist.properties = props;
                }
            }
        } catch(e) {
            console.error('Error fetching playlist homes for inline banner:', e);
        }
    }

    window.inlineCarouselState.properties = props;
    window.renderInlineCarouselSlide();

    if (props.length > 1) {
        window.inlineCarouselState.intervalId = setInterval(() => {
            if (!window.inlineCarouselState.isPaused) {
                window.stepInlineCarousel(1);
            }
        }, 3500);
    }
};

export function renderClientPlaylistBanner(collections) {
    const bannerContainer = document.getElementById('client-playlist-banner-container');
    if (!bannerContainer) return;

    if (!collections || !collections.length) {
        bannerContainer.style.display = 'none';
        return;
    }

    const isClient = state.currentUserProfile?.role === 'client';
    const canEdit = state.isAdmin || state.currentUserProfile?.role === 'realtor';

    // Do not show playlist banner row on main dashboard for realtors or admins
    if (!isClient && canEdit) {
        bannerContainer.style.display = 'none';
        return;
    }

    let myCollections = collections;
    if (isClient && state.currentUserProfile?.id) {
        myCollections = collections.filter(c => c.client_id === state.currentUserProfile.id || !c.client_id);
    }

    if (!myCollections.length) {
        bannerContainer.style.display = 'none';
        return;
    }

    bannerContainer.style.display = 'block';

    const getMetaLabel = (col) => {
        if (isClient) {
            const agentName = col.realtor_display_name || col.realtor_username || 'Your Realtor';
            const agentBrokerage = col.brokerage_name || state.currentUserProfile?.brokerage_name || '';
            return `Agent: ${escapeHtml(agentName)} ${agentBrokerage ? `<span style="color:var(--text-muted); font-weight:400;">(${escapeHtml(agentBrokerage)})</span>` : ''}`;
        } else {
            const clientName = col.client_display_name || col.client_username;
            if (clientName) {
                return `Shared with: <span style="color:var(--accent-gold); font-weight:700;">👤 ${escapeHtml(clientName)}</span>`;
            } else {
                return `Shared with: <span style="color:var(--text-muted); font-weight:400;">🌐 Public / General Link</span>`;
            }
        }
    };

    const agentName = myCollections[0].realtor_display_name || myCollections[0].realtor_username || 'Your Realtor';
    const agentAvatar = myCollections[0].avatar_url || state.currentUserProfile?.avatar_url || '';

    const avatarHtml = agentAvatar 
        ? `<img src="${escapeHtml(agentAvatar)}" alt="${escapeHtml(agentName)}" style="width:36px; height:36px; border-radius:50%; object-fit:cover; border:2px solid var(--accent-gold);">` 
        : `<div style="width:36px; height:36px; border-radius:50%; background:var(--accent-gold); color:#000; font-weight:800; display:flex; align-items:center; justify-content:center; font-size:0.95rem;">${escapeHtml((agentName[0] || 'A').toUpperCase())}</div>`;

    const activeToken = myCollections[0].share_token;

    bannerContainer.innerHTML = `
        <div style="background: linear-gradient(135deg, rgba(212,175,55,0.12), rgba(15,23,42,0.6)); border: 1px solid var(--accent-gold); border-radius: 8px; padding: 0.85rem 1.15rem; margin-bottom: 1.25rem;">
            <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.75rem;">
                <!-- Left: Playlist Selector & Meta -->
                <div style="flex-shrink:0;">
                    <div style="display:flex; align-items:center; gap:0.5rem;">
                        <span class="badge" style="background:var(--accent-gold); color:#000; font-weight:800; font-size:0.75rem; text-transform:uppercase; letter-spacing:0.04em;">Curated Client Playlist</span>
                        <span style="font-size:0.8rem; color:var(--text-muted);">${myCollections.length} Playlist${myCollections.length > 1 ? 's' : ''} Available</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:0.75rem; flex-wrap:wrap; margin-top:0.3rem;">
                        ${avatarHtml}
                        <select id="select-active-client-playlist" class="select-input" style="font-weight:700; font-size:1.05rem; padding:0.4rem 0.75rem; max-width:320px;">
                            ${myCollections.map(c => `<option value="${c.share_token}">${escapeHtml(c.title)} (${c.item_count} Homes)</option>`).join('')}
                        </select>
                        <span id="playlist-banner-meta" style="font-size:0.85rem; color:var(--accent-blue); font-weight:600;">
                            ${getMetaLabel(myCollections[0])}
                        </span>
                    </div>
                </div>

                <!-- Middle: Auto-Rotating Mini Property Preview Banner Carousel -->
                <div id="inline-playlist-carousel" style="flex:1; min-width:320px; max-width:680px; background:linear-gradient(135deg, #1C2B22 0%, #15221A 100%); border:1px solid var(--accent-gold); border-radius:8px; padding:0.55rem 1rem; display:flex; align-items:center; gap:0.85rem; box-shadow:0 8px 24px -4px rgba(47, 75, 60, 0.35), 0 4px 12px rgba(0,0,0,0.25);"
                     onmouseenter="window.inlineCarouselState.isPaused = true;" 
                     onmouseleave="window.inlineCarouselState.isPaused = false;">
                    <span style="font-size:0.85rem; color:rgba(250, 246, 240, 0.7);"><i data-lucide="loader" class="spin"></i> Loading home preview...</span>
                </div>

                <!-- Right: Action Buttons -->
                <div style="display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap; flex-shrink:0;">
                    <button id="playlist-banner-view-btn" class="btn btn-gold" style="font-size:0.85rem; padding:0.45rem 1rem;" onclick="window.viewPlaylistPortal(document.getElementById('select-active-client-playlist')?.value)">
                        <i data-lucide="eye"></i> Open Playlist View
                    </button>
                    ${canEdit ? `
                        <button class="btn btn-secondary" style="font-size:0.85rem; padding:0.45rem 0.85rem;" onclick="window.openPlaylistAndEdit(document.getElementById('select-active-client-playlist')?.value)">
                            <i data-lucide="edit-3"></i> Edit Playlist
                        </button>
                    ` : ''}
                </div>
            </div>
        </div>
    `;

    const selectEl = document.getElementById('select-active-client-playlist');
    if (selectEl) {
        selectEl.addEventListener('change', (e) => {
            const token = e.target.value;
            const target = myCollections.find(c => c.share_token === token);
            if (target) {
                const metaEl = document.getElementById('playlist-banner-meta');
                if (metaEl) {
                    metaEl.innerHTML = getMetaLabel(target);
                }
            }
            window.initInlinePlaylistCarousel(token, myCollections);
        });
    }

    window.initInlinePlaylistCarousel(activeToken, myCollections);

    if (window.lucide) window.lucide.createIcons();
}

window.clientPreviewState = { token: null, mode: 'carousel', carouselIndex: 0, autoRotateInterval: null, isPaused: false };

window.switchClientPreviewMode = function(mode) {
    window.clientPreviewState.mode = mode;
    if (mode !== 'carousel' && window.clientPreviewState.autoRotateInterval) {
        clearInterval(window.clientPreviewState.autoRotateInterval);
        window.clientPreviewState.autoRotateInterval = null;
    }
    if (window.clientPreviewState.token) {
        renderClientPreviewModal(window.clientPreviewState.token);
    }
};

window.rotatePreviewCarousel = function(step, propsLength) {
    let total = propsLength || 1;
    let newIdx = window.clientPreviewState.carouselIndex + step;
    if (newIdx >= total) newIdx = 0;
    if (newIdx < 0) newIdx = total - 1;
    window.clientPreviewState.carouselIndex = newIdx;
    if (window.clientPreviewState.token) {
        renderClientPreviewModal(window.clientPreviewState.token);
    }
};

window.setPreviewCarouselIndex = function(idx) {
    window.clientPreviewState.carouselIndex = idx;
    if (window.clientPreviewState.token) {
        renderClientPreviewModal(window.clientPreviewState.token);
    }
};

window.startPreviewAutoRotate = function(propsLength) {
    if (window.clientPreviewState.autoRotateInterval) {
        clearInterval(window.clientPreviewState.autoRotateInterval);
        window.clientPreviewState.autoRotateInterval = null;
    }
    if (propsLength > 1 && !window.clientPreviewState.isPaused) {
        window.clientPreviewState.autoRotateInterval = setInterval(() => {
            if (!window.clientPreviewState.isPaused && window.clientPreviewState.mode === 'carousel') {
                window.rotatePreviewCarousel(1, propsLength);
            }
        }, 4000);
    }
};

window.togglePreviewAutoRotate = function(propsLength) {
    window.clientPreviewState.isPaused = !window.clientPreviewState.isPaused;
    if (window.clientPreviewState.isPaused && window.clientPreviewState.autoRotateInterval) {
        clearInterval(window.clientPreviewState.autoRotateInterval);
        window.clientPreviewState.autoRotateInterval = null;
    } else {
        window.startPreviewAutoRotate(propsLength);
    }
    if (window.clientPreviewState.token) {
        renderClientPreviewModal(window.clientPreviewState.token);
    }
};

window.previewClientView = function(token) {
    if (!token) return showToast('Please select a playlist first', 'warning');
    const modal = document.getElementById('modal-client-preview');
    if (!modal) return;
    window.clientPreviewState.token = token;
    window.clientPreviewState.carouselIndex = 0;
    window.clientPreviewState.isPaused = false;
    modal.classList.add('active');
    renderClientPreviewModal(token);
};

window.closeClientPreviewModal = function() {
    const modal = document.getElementById('modal-client-preview');
    if (modal) modal.classList.remove('active');
    if (window.clientPreviewState.autoRotateInterval) {
        clearInterval(window.clientPreviewState.autoRotateInterval);
        window.clientPreviewState.autoRotateInterval = null;
    }
};

window.previewClientViewFromPortal = function() {
    const selectEl = document.getElementById('rp-client-select');
    let targetToken = null;

    if (selectEl && selectEl.value !== 'all') {
        const target = cachedCollections.find(c => String(c.client_id) === String(selectEl.value));
        if (target) targetToken = target.share_token;
    }
    if (!targetToken && cachedCollections.length > 0) {
        targetToken = cachedCollections[0].share_token;
    }
    if (targetToken) {
        window.previewClientView(targetToken);
    } else {
        showToast('No active playlist token found for client preview', 'warning');
    }
};

window.previewPhotoIndices = {};
window.rotatePreviewPhoto = function(mlsId, step, evt) {
    if (evt) evt.stopPropagation();
    const allProps = state.allProperties || [];
    const prop = allProps.find(p => String(p.mls_id) === String(mlsId));
    if (!prop) return;

    let gallery = [];
    if (Array.isArray(prop.gallery_images) && prop.gallery_images.length > 0) gallery = prop.gallery_images;
    else if (typeof prop.gallery_images === 'string') {
        try { gallery = JSON.parse(prop.gallery_images); } catch(e) {}
    }
    if (!Array.isArray(gallery) || gallery.length === 0) {
        gallery = prop.main_image_url ? [prop.main_image_url] : [];
    }
    if (gallery.length <= 1) return;

    const currIdx = window.previewPhotoIndices[mlsId] || 0;
    let nextIdx = (currIdx + step) % gallery.length;
    if (nextIdx < 0) nextIdx = gallery.length - 1;

    window.previewPhotoIndices[mlsId] = nextIdx;

    const imgEl = document.getElementById(`preview-card-img-${mlsId}`);
    const counterEl = document.getElementById(`preview-photo-count-${mlsId}`);
    if (imgEl) imgEl.src = gallery[nextIdx];
    if (counterEl) counterEl.textContent = `${nextIdx + 1} / ${gallery.length}`;
};

function renderClientDashboardBannerPreview(bodyEl, playlist, props) {
    const totalCount = props.length;
    if (window.clientPreviewState.carouselIndex >= totalCount || window.clientPreviewState.carouselIndex < 0) {
        window.clientPreviewState.carouselIndex = 0;
    }

    const index = window.clientPreviewState.carouselIndex;
    const property = props[index];
    const displayAddress = escapeHtml(property.address || `MLS #${property.mls_id}`);
    const imageUrl = property.main_image_url || NO_PHOTO_IMG;
    const pricePerSqft = property.sqft_finished ? Math.round(property.price / property.sqft_finished) : 0;
    const reviewStatus = getPropertyReviewStatus(property);
    const reviewBadge = reviewStatus === 'favorite'
        ? `<span style="font-size:0.75rem; background:#d97706; color:#fff; padding:2px 8px; border-radius:12px; font-weight:800;"><i data-lucide="star"></i> Liked</span>`
        : reviewStatus === 'possibility'
            ? `<span style="font-size:0.75rem; background:#0284c7; color:#fff; padding:2px 8px; border-radius:12px; font-weight:800;"><i data-lucide="circle-help"></i> Possibility</span>`
            : '';
    const clientName = playlist?.client_name || 'Client';
    const realtorName = playlist?.realtor_name || playlist?.realtor_display_name || state.currentUserProfile?.realtor_name || 'Your Realtor';

    bodyEl.innerHTML = `
        <div style="padding:1.5rem; background:var(--bg-primary); min-height:100%;">
            <div style="background:linear-gradient(135deg, rgba(212,175,55,0.12), rgba(15,23,42,0.6)); border:1px solid var(--accent-gold); border-radius:8px; padding:0.85rem 1.15rem;">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.75rem;">
                    <div style="flex-shrink:0;">
                        <div style="display:flex; align-items:center; gap:0.5rem;">
                            <span class="badge" style="background:var(--accent-gold); color:#000; font-weight:800; font-size:0.75rem; text-transform:uppercase; letter-spacing:0.04em;">Curated Client Playlist</span>
                            <span style="font-size:0.8rem; color:var(--text-muted);">1 Playlist Available</span>
                        </div>
                        <div style="display:flex; align-items:center; gap:0.75rem; flex-wrap:wrap; margin-top:0.3rem;">
                            <div style="width:36px; height:36px; border-radius:50%; background:var(--accent-gold); color:#000; font-weight:800; display:flex; align-items:center; justify-content:center; font-size:0.95rem;">${escapeHtml((realtorName[0] || 'A').toUpperCase())}</div>
                            <span class="select-input" style="font-weight:700; font-size:1.05rem; padding:0.4rem 0.75rem;">${escapeHtml(playlist?.title || 'Playlist')} (${totalCount} Homes)</span>
                            <span style="font-size:0.85rem; color:var(--accent-blue); font-weight:600;">Agent: ${escapeHtml(realtorName)}</span>
                        </div>
                    </div>
                    <div style="flex:1; min-width:320px; max-width:680px; background:linear-gradient(135deg, #1C2B22 0%, #15221A 100%); border:1px solid var(--accent-gold); border-radius:8px; padding:0.55rem 1rem; display:flex; align-items:center; gap:0.85rem; box-shadow:0 8px 24px -4px rgba(47, 75, 60, 0.35), 0 4px 12px rgba(0,0,0,0.25);">
                        <div style="width:105px; height:68px; border-radius:6px; overflow:hidden; border:1px solid rgba(193, 137, 46, 0.45); flex-shrink:0; background:#0f1712;">
                            <img src="${imageUrl}" alt="${displayAddress}" style="width:100%; height:100%; object-fit:cover;" referrerpolicy="no-referrer">
                        </div>
                        <div style="flex:1; min-width:0; display:flex; flex-direction:column; justify-content:center; gap:3px;">
                            <div style="display:flex; align-items:center; justify-content:space-between; gap:0.5rem;"><span style="font-size:1.15rem; font-weight:800; color:var(--accent-gold); white-space:nowrap;">$${(property.price || 0).toLocaleString()}</span>${reviewBadge}</div>
                            <div style="font-size:0.95rem; font-weight:700; color:#FAF6F0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; line-height:1.2;">${displayAddress}</div>
                            <div style="font-size:0.82rem; color:rgba(250,246,240,0.8); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-weight:500;">${property.beds || 0} Bed • ${property.baths || 0} Bath • ${(property.sqft_finished || 0).toLocaleString()} SqFt ${pricePerSqft ? `($${pricePerSqft}/sqft)` : ''}</div>
                        </div>
                        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px; flex-shrink:0; margin-left:0.25rem;">
                            <div style="display:flex; gap:4px;"><button type="button" class="btn btn-secondary" style="padding:4px 8px; font-size:0.78rem; border-radius:4px; background:rgba(255,255,255,0.12); color:#FAF6F0; border:1px solid rgba(255,255,255,0.25);" onclick="window.rotatePreviewCarousel(-1, ${totalCount})" title="Previous house"><i data-lucide="chevron-left"></i></button><button type="button" class="btn btn-gold" style="padding:4px 8px; font-size:0.78rem; border-radius:4px;" onclick="window.rotatePreviewCarousel(1, ${totalCount})" title="Next house"><i data-lucide="chevron-right"></i></button></div>
                            <span style="font-size:0.75rem; color:var(--accent-gold); font-weight:800; letter-spacing:0.04em;">${index + 1} / ${totalCount}</span>
                        </div>
                    </div>
                    <button type="button" class="btn btn-gold" style="font-size:0.85rem; padding:0.45rem 1rem;" disabled><i data-lucide="eye"></i> Open Playlist View</button>
                </div>
            </div>
            <p style="margin:0.85rem 0 0; color:var(--text-muted); font-size:0.85rem;">Client: ${escapeHtml(clientName)}</p>
        </div>
    `;
    if (window.lucide) window.lucide.createIcons();
}

export async function renderClientPreviewModal(token, mode = 'client-banner') {
    const bodyEl = document.getElementById('client-preview-body');
    const headingEl = document.getElementById('client-preview-heading');
    const externalLink = document.getElementById('client-preview-external-link');
    if (!bodyEl) return;

    window.clientPreviewState.token = token;

    let playlist = cachedCollections.find(c => c.share_token === token);
    let props = playlist?.properties || playlist?.items || [];

    if (!playlist || !props.length || !playlist.realtor_name) {
        try {
            const res = await apiFetch(CONFIG.API_URL + '?action=get_collection&token=' + encodeURIComponent(token));
            if (res && res.success && res.collection) {
                playlist = res.collection;
                props = res.collection.items || res.collection.properties || [];
            }
        } catch(e) {}
    }

    if (!props.length && playlist?.mls_ids_json && Array.isArray(state.allProperties) && state.allProperties.length > 0) {
        let mlsIds = [];
        try { mlsIds = typeof playlist.mls_ids_json === 'string' ? JSON.parse(playlist.mls_ids_json) : playlist.mls_ids_json; } catch(e) {}
        if (mlsIds.length > 0) {
            const mlsStrSet = new Set(mlsIds.map(id => String(id)));
            props = state.allProperties.filter(p => mlsStrSet.has(String(p.mls_id)));
        }
    }

    const shareUrl = `share.html?token=${encodeURIComponent(token)}`;

    if (externalLink) {
        externalLink.href = shareUrl;
    }

    if (headingEl) {
        const titleStr = playlist?.title ? `: ${escapeHtml(playlist.title)}` : '';
        headingEl.innerHTML = `<i data-lucide="eye"></i> Client Dashboard Banner Preview${titleStr}`;
    }

    const totalCount = props.length;

    if (!totalCount) {
        bodyEl.innerHTML = `
            <div style="padding: 4rem; text-align: center; color: var(--text-muted); background: #0b0f19; height:100%;">
                <i data-lucide="alert-circle" style="width:48px; height:48px; margin-bottom:1rem; color:var(--accent-gold);"></i>
                <h3>No Properties Found in Playlist</h3>
                <p style="margin-top:0.5rem;">This playlist currently has no assigned home listings.</p>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    if (mode === 'client-banner') {
        renderClientDashboardBannerPreview(bodyEl, playlist, props);
        return;
    }

    if (window.clientPreviewState.carouselIndex >= totalCount || window.clientPreviewState.carouselIndex < 0) {
        window.clientPreviewState.carouselIndex = 0;
    }
    const idx = window.clientPreviewState.carouselIndex;
    const p = props[idx];
    const displayAddr = escapeHtml(cleanDisplayAddress(p.address, p.mls_id));
    const ppsqft = p.sqft_finished ? Math.round(p.price / p.sqft_finished) : 0;
    const mainImg = p.main_image_url || NO_PHOTO_IMG;

    const realtorName = playlist?.realtor_name || playlist?.realtor_display_name || state.currentUserProfile?.full_name || 'Agent';
    const realtorLabel = `SHARED BY REALTOR: ${escapeHtml(realtorName).toUpperCase()}`;

    const dotsHtml = props.map((_, i) => 
        `<span class="hero-dot ${i === idx ? 'active' : ''}" onclick="window.setPreviewCarouselIndex(${i})" title="Go to home ${i + 1}" style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${i === idx ? 'var(--accent-gold)' : 'rgba(255,255,255,0.25)'}; margin:0 3px; cursor:pointer;"></span>`
    ).join('');

    const favCount = props.filter(item => getPropertyReviewStatus(item) === 'favorite').length;
    const possCount = props.filter(item => getPropertyReviewStatus(item) === 'possibility').length;
    const dislikeCount = props.filter(item => getPropertyReviewStatus(item) === 'dislike').length;
    const totalPrice = props.reduce((acc, item) => acc + (Number(item.price) || 0), 0);
    const avgPrice = Math.round(totalPrice / totalCount);

    bodyEl.innerHTML = `
        <div style="height: 100%; overflow-y: auto; padding: 1.5rem; background: #0b0f19; color: var(--text-primary);">
            
            <!-- Top Hero Banner Carousel -->
            <div style="margin-bottom: 1.5rem;">
                <div class="client-hero-banner" onmouseenter="window.clientPreviewState.isPaused=true; const tag=document.getElementById('modal-pause-tag'); if(tag) tag.style.display='inline-flex';" onmouseleave="window.clientPreviewState.isPaused=false; const tag=document.getElementById('modal-pause-tag'); if(tag) tag.style.display='none';">
                    <!-- Image Box -->
                    <div class="hero-img-box">
                        <img src="${mainImg}" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${NO_PHOTO_IMG}';" alt="${displayAddr}" style="cursor:pointer;" onclick="window.goToPropertyCard('${p.mls_id}')">
                        <div class="hero-badge-overlay">
                            <span class="hero-tag tag-active"><i data-lucide="check-circle-2"></i> ${p.status || 'Active'}</span>
                            <span class="hero-tag tag-pause" id="modal-pause-tag" style="display:${window.clientPreviewState.isPaused ? 'inline-flex' : 'none'};"><i data-lucide="pause"></i> Paused</span>
                        </div>
                        ${totalCount > 1 ? `
                            <button type="button" class="hero-nav prev" onclick="window.rotatePreviewCarousel(-1, ${totalCount})" title="Previous home"><i data-lucide="chevron-left"></i></button>
                            <button type="button" class="hero-nav next" onclick="window.rotatePreviewCarousel(1, ${totalCount})" title="Next home"><i data-lucide="chevron-right"></i></button>
                        ` : ''}
                    </div>

                    <!-- Details Box -->
                    <div class="hero-details-box">
                        <div>
                            <div class="hero-meta-header">
                                <span><i data-lucide="folder-heart"></i> ${realtorLabel}</span>
                                <span>${playlist?.title ? escapeHtml(playlist.title) : 'Curated Playlist'} • Home ${idx + 1} of ${totalCount}</span>
                            </div>

                            <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom: 0.25rem;">
                                <div class="hero-price">$${(Number(p.price) || 0).toLocaleString()}</div>
                                ${ppsqft ? `<div style="font-size:0.85rem; font-weight:700; color:var(--text-muted);">$${ppsqft}/SqFt</div>` : ''}
                            </div>

                            <div class="hero-address" style="cursor:pointer;" onclick="window.goToPropertyCard('${p.mls_id}')">${displayAddr}</div>
                            <div style="font-size:0.85rem; color:var(--text-muted); margin-bottom: 0.75rem;">
                                ${p.city || ''}, ${p.state || 'CO'} ${p.zip || ''} • MLS #${p.mls_id}
                            </div>

                            <div class="hero-stats-row">
                                <div class="hero-stat-pill"><strong>${p.beds || 0}</strong> Beds</div>
                                <div class="hero-stat-pill"><strong>${p.baths || 0}</strong> Baths</div>
                                <div class="hero-stat-pill"><strong>${(Number(p.sqft_finished) || 0).toLocaleString()}</strong> SqFt</div>
                                ${p.year_built ? `<div class="hero-stat-pill">Built <strong>${p.year_built}</strong></div>` : ''}
                                ${p.rating ? `<div class="hero-stat-pill" style="color:var(--accent-gold);"><i data-lucide="star"></i> <strong>${p.rating}</strong>/5</div>` : ''}
                            </div>

                            ${p.user_notes ? `
                                <div style="margin-top:0.6rem; font-size:0.8rem; background:rgba(255,255,255,0.05); padding:0.4rem 0.65rem; border-left:3px solid var(--accent-gold); border-radius:4px; color:var(--text-primary);">
                                    <strong>Client Note:</strong> "${escapeHtml(p.user_notes)}"
                                </div>
                            ` : ''}
                        </div>

                        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:1rem; pt:0.5rem; border-top:1px solid rgba(255,255,255,0.1);">
                            <div class="hero-stepper">
                                ${dotsHtml}
                            </div>
                            <div style="display:flex; gap:0.5rem; align-items:center;">
                                <button type="button" class="btn btn-secondary" style="font-size:0.75rem; padding:0.3rem 0.6rem;" onclick="window.togglePreviewAutoRotate(${totalCount})">
                                    <i data-lucide="${window.clientPreviewState.isPaused ? 'play' : 'pause'}"></i> ${window.clientPreviewState.isPaused ? 'Resume' : 'Pause'}
                                </button>
                                <button type="button" class="btn btn-gold" style="font-size:0.75rem; padding:0.3rem 0.6rem;" onclick="window.goToPropertyCard('${p.mls_id}')">
                                    View Card <i data-lucide="arrow-down"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- KPI Stats Bar -->
            <div class="realtor-kpi-bar" style="margin-bottom:1.5rem;">
                <div class="realtor-kpi-card">
                    <span class="realtor-kpi-label">Total Properties</span>
                    <span class="realtor-kpi-val">${totalCount}</span>
                    <span class="realtor-kpi-sub">${props.filter(item => (item.status||'Active').toLowerCase()==='active').length} Active</span>
                </div>
                <div class="realtor-kpi-card">
                    <span class="realtor-kpi-label"><i data-lucide="star"></i> Liked / Favorites</span>
                    <span class="realtor-kpi-val">${favCount}</span>
                    <span class="realtor-kpi-sub">Top Buyer Picks</span>
                </div>
                <div class="realtor-kpi-card">
                    <span class="realtor-kpi-label"><i data-lucide="circle-help"></i> Possibilities</span>
                    <span class="realtor-kpi-val">${possCount}</span>
                    <span class="realtor-kpi-sub">Under Consideration</span>
                </div>
                <div class="realtor-kpi-card">
                    <span class="realtor-kpi-label"><i data-lucide="ban"></i> Disliked / Hidden</span>
                    <span class="realtor-kpi-val">${dislikeCount}</span>
                    <span class="realtor-kpi-sub">Filtered Out</span>
                </div>
                <div class="realtor-kpi-card">
                    <span class="realtor-kpi-label">Avg List Price</span>
                    <span class="realtor-kpi-val">$${avgPrice.toLocaleString()}</span>
                    <span class="realtor-kpi-sub">Curated Selection</span>
                </div>
            </div>

            <!-- Property Cards Grid -->
            <div class="realtor-grid-container" id="preview-grid-container">
                ${props.map(item => {
                    const itemPpsqft = item.sqft_finished ? Math.round(item.price / item.sqft_finished) : 0;
                    const itemAddr = escapeHtml(cleanDisplayAddress(item.address, item.mls_id));
                    const revStatus = getPropertyReviewStatus(item);
                    let revBadgeHtml = '';
                    if (revStatus === 'favorite') revBadgeHtml = `<span class="badge-matrix-review badge-matrix-fav"><i data-lucide="star"></i> Liked</span>`;
                    else if (revStatus === 'possibility') revBadgeHtml = `<span class="badge-matrix-review badge-matrix-possibility"><i data-lucide="circle-help"></i> Possibility</span>`;
                    else if (revStatus === 'dislike') revBadgeHtml = `<span class="badge-matrix-review badge-matrix-dislike"><i data-lucide="ban"></i> Disliked</span>`;
                    else revBadgeHtml = `<span class="badge-matrix-review badge-matrix-unreviewed"><i data-lucide="clipboard-list"></i> Unreviewed</span>`;

                    let gallery = [];
                    if (Array.isArray(item.gallery_images) && item.gallery_images.length > 0) gallery = item.gallery_images;
                    else if (typeof item.gallery_images === 'string') {
                        try { gallery = JSON.parse(item.gallery_images); } catch(e) {}
                    }
                    if (!Array.isArray(gallery) || gallery.length === 0) {
                        gallery = item.main_image_url ? [item.main_image_url] : [];
                    }

                    return `
                        <div class="realtor-card" id="preview-card-${item.mls_id}" data-mls="${item.mls_id}">
                            <div class="realtor-media">
                                <img id="preview-card-img-${item.mls_id}" src="${item.main_image_url || NO_PHOTO_IMG}" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${NO_PHOTO_IMG}';" class="realtor-img" alt="${itemAddr}">
                                ${gallery.length > 1 ? `
                                    <button type="button" class="card-photo-nav prev" onclick="window.rotatePreviewPhoto('${item.mls_id}', -1, event)" title="Previous photo"><i data-lucide="chevron-left"></i></button>
                                    <button type="button" class="card-photo-nav next" onclick="window.rotatePreviewPhoto('${item.mls_id}', 1, event)" title="Next photo"><i data-lucide="chevron-right"></i></button>
                                    <span class="card-photo-count-badge" id="preview-photo-count-${item.mls_id}">1 / ${gallery.length}</span>
                                ` : ''}
                                <div class="realtor-card-badges-overlay">
                                    <span class="card-status-badge badge-${(item.status || 'Active').toLowerCase()}">${item.status || 'Active'}</span>
                                    ${revBadgeHtml}
                                </div>
                            </div>
                            <div class="realtor-info">
                                <div class="realtor-card-header">
                                    <div>
                                        <h2 style="color:var(--accent-gold); font-weight:800; font-size:1.4rem; margin:0;">$${(Number(item.price) || 0).toLocaleString()}</h2>
                                        <h3 style="margin-top:4px; font-size:1.05rem; margin-bottom:2px;">${itemAddr}</h3>
                                        <div style="color:var(--text-muted); font-size:0.82rem;">
                                            ${item.city || ''}, ${item.state || 'CO'} ${item.zip || ''} • <strong>MLS #${item.mls_id}</strong>
                                        </div>
                                    </div>
                                </div>

                                <div class="realtor-specs-grid" style="margin-top:0.75rem;">
                                    <div class="spec-item"><span class="spec-label">Beds</span><span class="spec-val">${item.beds || 0}</span></div>
                                    <div class="spec-item"><span class="spec-label">Baths</span><span class="spec-val">${item.baths || 0}</span></div>
                                    <div class="spec-item"><span class="spec-label">SqFt</span><span class="spec-val">${(Number(item.sqft_finished) || 0).toLocaleString()}</span></div>
                                    <div class="spec-item"><span class="spec-label">$/SqFt</span><span class="spec-val">$${itemPpsqft}</span></div>
                                </div>

                                ${item.user_notes ? `
                                    <div style="margin-top:0.75rem; background:rgba(255,255,255,0.04); padding:0.5rem 0.75rem; border-left:3px solid var(--accent-gold); border-radius:4px; font-size:0.82rem;">
                                        <strong>Buyer Notes:</strong> ${escapeHtml(item.user_notes)}
                                    </div>
                                ` : ''}
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;

    if (window.lucide) window.lucide.createIcons();
    window.startPreviewAutoRotate(totalCount);
}

export function openPlaylistsModal() {
    if (!state.authenticated) return;
    const modal = document.getElementById('modal-playlists');
    if (modal) modal.classList.add('active');
    fetchCollections();
    populatePlaylistClientSelect();
}

export function closePlaylistsModal() {
    const modal = document.getElementById('modal-playlists');
    if (modal) modal.classList.remove('active');
    resetPlaylistForm();
}

export async function populatePlaylistClientSelect() {
    const select = document.getElementById('playlist-client-select');
    if (!select) return;

    let clients = [];
    if (state.currentUserProfile?.assigned_clients) {
        clients = state.currentUserProfile.assigned_clients;
    } else {
        try {
            const usersRes = await apiFetch(CONFIG.API_URL + '?action=list_users');
            if (usersRes && usersRes.success && Array.isArray(usersRes.users)) {
                clients = usersRes.users.filter(u => u.role === 'client');
            }
        } catch (e) {}
    }

    select.innerHTML = `<option value="">(None / General Share)</option>` +
        clients.map(c => `<option value="${c.id}">👤 ${escapeHtml(c.full_name || c.username)} [${c.initials || 'CL'}]</option>`).join('');
}

export function renderPlaylistsTable(collections) {
    const tbody = document.getElementById('playlists-table-body');
    if (!tbody) return;

    if (!collections.length) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:1.5rem; color:var(--text-muted);">No curated playlists created yet. Click "Create Playlist" above to start!</td></tr>`;
        return;
    }

    const currentOrigin = window.location.origin + window.location.pathname.replace(/\/index\.html.*$/, '/');

    tbody.innerHTML = collections.map(c => {
        const client = c.client_display_name ? `👤 ${escapeHtml(c.client_display_name)}` : '—';
        const created = c.created_at ? new Date(c.created_at).toLocaleDateString() : 'N/A';
        const shareUrl = `${currentOrigin}share.html?token=${c.share_token}`;

        return `
            <tr>
                <td><strong>#${c.id}</strong></td>
                <td>
                    <div style="font-weight:700; color:var(--accent-gold);">${escapeHtml(c.title)}</div>
                    ${c.description ? `<div style="font-size:0.75rem; color:var(--text-muted);">${escapeHtml(c.description)}</div>` : ''}
                </td>
                <td style="font-size:0.85rem; color:var(--accent-blue);">${client}</td>
                <td><span class="badge" style="background:var(--bg-input); padding:2px 8px; border-radius:12px; font-weight:700;">${c.item_count} Homes</span></td>
                <td style="font-size:0.8rem; color:var(--text-muted);">${created}</td>
                <td>
                    <div style="display:flex; gap:0.4rem; flex-wrap:wrap;">
                        <button class="btn btn-secondary" style="padding:0.25rem 0.6rem; font-size:0.75rem;" onclick="copyCollectionShareLink('${escapeHtml(shareUrl)}')"><i data-lucide="copy"></i> Copy Link</button>
                        <button class="btn btn-secondary" style="padding:0.25rem 0.6rem; font-size:0.75rem;" onclick="window.viewPlaylistPortal('${c.share_token}')"><i data-lucide="eye"></i> View</button>
                        <button class="btn btn-secondary" style="padding:0.25rem 0.6rem; font-size:0.75rem; background:#ffffff; color:#0f172a; font-weight:700; border:1px solid var(--accent-gold);" onclick="window.previewClientView('${c.share_token}')"><i data-lucide="external-link" style="color:var(--accent-gold);"></i> Client View</button>
                        <button class="btn btn-secondary" style="padding:0.25rem 0.6rem; font-size:0.75rem;" onclick="window.editPlaylist(${c.id})"><i data-lucide="edit-3"></i> Edit</button>
                        <button class="btn btn-secondary" style="padding:0.25rem 0.6rem; font-size:0.75rem; color:var(--accent-red);" onclick="confirmDeletePlaylist(${c.id}, '${escapeHtml(c.title)}')"><i data-lucide="trash-2"></i> Delete</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    if (window.lucide) window.lucide.createIcons();
}

export function editPlaylist(id) {
    const target = cachedCollections.find(c => c.id === id);
    if (!target) return showToast('Playlist not found', 'error');

    const idEl = document.getElementById('playlist-id');
    const titleEl = document.getElementById('playlist-title');
    const clientEl = document.getElementById('playlist-client-select');
    const descEl = document.getElementById('playlist-description');
    const headingEl = document.getElementById('playlist-form-heading');
    const submitBtn = document.getElementById('btn-submit-playlist');
    const cancelBtn = document.getElementById('btn-cancel-edit-playlist');
    const formContainer = document.getElementById('playlist-form-container');

    if (idEl) idEl.value = target.id;
    if (titleEl) titleEl.value = target.title || '';
    if (clientEl) clientEl.value = target.client_id || '';
    if (descEl) descEl.value = target.description || '';

    editingMlsIds = Array.isArray(target.mls_ids) ? [...target.mls_ids] : [];
    renderPlaylistHomesEditor();

    if (headingEl) {
        headingEl.innerHTML = `<i data-lucide="edit-3"></i> Edit Playlist #${target.id}: ${escapeHtml(target.title)}`;
    }
    if (submitBtn) {
        submitBtn.innerHTML = `<i data-lucide="check"></i> Save Changes`;
        submitBtn.className = 'btn btn-gold';
    }
    if (cancelBtn) {
        cancelBtn.style.display = 'inline-flex';
    }

    if (formContainer) {
        formContainer.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    if (window.lucide) window.lucide.createIcons();
}
window.editPlaylist = editPlaylist;

export function resetPlaylistForm() {
    const idEl = document.getElementById('playlist-id');
    const titleEl = document.getElementById('playlist-title');
    const clientEl = document.getElementById('playlist-client-select');
    const descEl = document.getElementById('playlist-description');
    const headingEl = document.getElementById('playlist-form-heading');
    const submitBtn = document.getElementById('btn-submit-playlist');
    const cancelBtn = document.getElementById('btn-cancel-edit-playlist');
    const editorEl = document.getElementById('playlist-properties-editor');

    if (idEl) idEl.value = '';
    if (titleEl) titleEl.value = '';
    if (clientEl) clientEl.value = '';
    if (descEl) descEl.value = '';

    editingMlsIds = [];
    if (editorEl) editorEl.style.display = 'none';

    if (headingEl) {
        headingEl.innerHTML = `<i data-lucide="plus-circle"></i> Create New Playlist Collection`;
    }
    if (submitBtn) {
        submitBtn.innerHTML = `<i data-lucide="plus"></i> Create Playlist`;
        submitBtn.className = 'btn btn-primary';
    }
    if (cancelBtn) {
        cancelBtn.style.display = 'none';
    }
    if (window.lucide) window.lucide.createIcons();
}
window.resetPlaylistForm = resetPlaylistForm;

export function renderPlaylistHomesEditor() {
    const editorEl = document.getElementById('playlist-properties-editor');
    if (!editorEl) return;

    editorEl.style.display = 'block';

    const allProps = state.allProperties || [];
    const availableProps = allProps.filter(p => !editingMlsIds.includes(p.mls_id));

    let html = `
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; margin-bottom:0.6rem;">
            <label class="filter-label" style="margin:0; font-weight:700;">Included Homes in Playlist (<span id="playlist-edit-count">${editingMlsIds.length}</span>):</label>
            <div style="display:flex; gap:0.4rem; align-items:center; flex:1; max-width:480px; min-width:260px;">
                <select id="playlist-add-prop-select" class="select-input" style="font-size:0.83rem; width:100%; height:32px; padding:0.2rem 0.5rem;" onchange="window.addHomeToEditingPlaylist(this.value)">
                    <option value="">➕ Add property to this playlist...</option>
                    ${availableProps.map(p => `<option value="${p.mls_id}">${escapeHtml(p.address || p.mls_id)} — $${(p.price || 0).toLocaleString()} (${p.beds || 0}B/${p.baths || 0}B, ${escapeHtml(p.city || '')}) [MLS #${p.mls_id}]</option>`).join('')}
                </select>
            </div>
        </div>
    `;

    if (!editingMlsIds || !editingMlsIds.length) {
        html += `<div id="playlist-edit-homes-list" style="font-size:0.82rem; color:var(--text-muted); font-style:italic; padding:0.4rem 0;">No properties currently in this playlist. Use the dropdown above to add houses!</div>`;
    } else {
        html += `<div id="playlist-edit-homes-list" style="display: flex; flex-wrap: wrap; gap: 0.4rem; max-height: 140px; overflow-y: auto;">` +
            editingMlsIds.map(mlsId => {
                const prop = allProps.find(p => p.mls_id === mlsId);
                const label = prop ? `${prop.address || mlsId} ($${(prop.price || 0).toLocaleString()})` : `MLS #${mlsId}`;
                return `
                    <span style="display:inline-flex; align-items:center; gap:0.35rem; background:var(--bg-card); border:1px solid var(--border-color); padding:0.25rem 0.6rem; border-radius:14px; font-size:0.8rem;">
                        <span>🏠 ${escapeHtml(label)}</span>
                        <button type="button" style="background:none; border:none; color:var(--accent-red); cursor:pointer; font-weight:bold; padding:0 2px; font-size:0.9rem;" onclick="window.removeHomeFromEditingPlaylist('${mlsId}')" title="Remove home from playlist">&times;</button>
                    </span>
                `;
            }).join('') +
        `</div>`;
    }

    editorEl.innerHTML = html;
}

window.addHomeToEditingPlaylist = function(mlsId) {
    if (!mlsId) return;
    if (!editingMlsIds.includes(mlsId)) {
        editingMlsIds.push(mlsId);
        renderPlaylistHomesEditor();
    }
};

window.removeHomeFromEditingPlaylist = function(mlsId) {
    editingMlsIds = editingMlsIds.filter(id => String(id) !== String(mlsId));
    renderPlaylistHomesEditor();
};

window.openPlaylistAndEdit = function(shareToken) {
    if (!shareToken) return;
    const target = cachedCollections.find(c => c.share_token === shareToken);
    if (!target) return;
    openPlaylistsModal();
    editPlaylist(target.id);
};

export async function handleCreatePlaylistSubmit(e) {
    if (e) e.preventDefault();

    const idEl = document.getElementById('playlist-id');
    const titleEl = document.getElementById('playlist-title');
    const descEl = document.getElementById('playlist-description');
    const clientEl = document.getElementById('playlist-client-select');
    const btnSubmit = document.getElementById('btn-submit-playlist');

    const playlistId = idEl?.value ? parseInt(idEl.value) : null;
    const title = (titleEl?.value || '').trim();
    const description = (descEl?.value || '').trim();
    const clientId = clientEl?.value ? parseInt(clientEl.value) : null;

    if (!title) return showToast('Please enter a playlist title', 'warning');

    if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.textContent = playlistId ? 'Saving Changes...' : 'Saving Playlist...';
    }

    const payload = {
        title,
        description,
        client_id: clientId,
        mls_ids: editingMlsIds
    };
    if (playlistId) {
        payload.id = playlistId;
    }

    try {
        const res = await apiFetch(CONFIG.API_URL + '?action=save_collection', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (res && res.success) {
            showToast(playlistId ? `Updated playlist "${title}"!` : `Created playlist "${title}"!`, 'success');
            resetPlaylistForm();
            fetchCollections();
        } else {
            showToast(res.error || 'Failed to save playlist', 'error');
        }
    } catch (err) {
        showToast('Error saving playlist', 'error');
    } finally {
        if (btnSubmit) {
            btnSubmit.disabled = false;
        }
    }
}

export async function addMlsToPlaylist(mlsId) {
    if (!state.authenticated) return;

    if (!cachedCollections.length) {
        await fetchCollections();
    }

    if (!cachedCollections.length) {
        if (confirm('No active playlists found. Would you like to open Playlists to create one?')) {
            openPlaylistsModal();
        }
        return;
    }

    const options = cachedCollections.map((c, i) => `${i + 1}. ${c.title} (${c.item_count} homes)`).join('\n');
    const choice = prompt(`Add MLS #${mlsId} to playlist:\n\n${options}\n\nEnter playlist number (1-${cachedCollections.length}):`);
    if (!choice) return;

    const idx = parseInt(choice) - 1;
    const targetCol = cachedCollections[idx];
    if (!targetCol) return showToast('Invalid playlist selection', 'error');

    try {
        const res = await apiFetch(CONFIG.API_URL + '?action=add_to_collection', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ collection_id: targetCol.id, mls_ids: [mlsId] })
        });

        if (res && res.success) {
            showToast(`Added MLS #${mlsId} to playlist "${targetCol.title}"!`, 'success');
            fetchCollections();
        } else {
            showToast(res.error || 'Failed to add item to playlist', 'error');
        }
    } catch (e) {
        showToast('Error adding property to playlist', 'error');
    }
}
window.addMlsToPlaylist = addMlsToPlaylist;

window.copyCollectionShareLink = function(url) {
    navigator.clipboard.writeText(url).then(() => {
        showToast('Playlist share link copied to clipboard!', 'success');
    });
};

window.openPlaylistsModal = openPlaylistsModal;

window.setPlaylistEditingMlsIds = function(mlsIds) {
    editingMlsIds = Array.isArray(mlsIds) ? [...mlsIds] : [];
    renderPlaylistHomesEditor();
};

window.confirmDeletePlaylist = async function(id, title) {
    if (!confirm(`Are you sure you want to delete playlist "${title}"?`)) return;

    try {
        const res = await apiFetch(CONFIG.API_URL + '?action=delete_collection', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id })
        });

        if (res && res.success) {
            showToast(`Deleted playlist "${title}"`, 'info');
            fetchCollections();
        } else {
            showToast(res.error || 'Failed to delete playlist', 'error');
        }
    } catch (e) {
        showToast('Error deleting playlist', 'error');
    }
};
