/**
 * MLS & Redfin Property Scout - Property Detail Modal & Its Actions
 * Every export here is attached to window (not just module-exported) because these are all
 * invoked from onclick="..." attributes inside dynamically-rendered HTML strings, which
 * execute in global scope regardless of module boundaries - same pattern the original
 * single-file app.js used. This module has no named exports; importing it purely for its
 * side effects (setting window.openDetailModal etc.) is enough.
 */
import { state, elements, CONFIG } from './state.js';
import { getPropertyReviewStatus, cleanDisplayAddress, escapeHtml, getRedfinUrl, isSafeMediaUrl, NO_PHOTO_IMG } from './properties.js';
import { apiFetch } from './api.js';
import { applyFiltersAndRender } from './filters.js';
import { showToast } from './toast.js';
import { renderClientNextSteps } from './clientNextSteps.js';


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

        const ppsqft = p.sqft_finished ? Math.round(p.price / p.sqft_finished) : (p.sqft_total ? Math.round(p.price / p.sqft_total) : 0);
        const rfDelta = p.redfin_estimate ? Math.round(((p.price - p.redfin_estimate) / p.redfin_estimate) * 100) : null;
        let rfDiffText = 'N/A';
        if (p.redfin_estimate) {
            const diffVal = p.price - p.redfin_estimate;
            const isAbove = diffVal > 0;
            rfDiffText = `$${p.redfin_estimate.toLocaleString()} (${isAbove ? '+' : ''}${rfDelta}% vs List)`;
        }

        const mlsUrl = p.mls_url || `https://matrix.recolorado.com/Matrix/Public/Portal.aspx?L=1&k=2343995XHKSS&p=CS-3939147-0#1`;
        const redfinUrl = getRedfinUrl(p);

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
        const redfinDirectUrl = (p.redfin_url && typeof p.redfin_url === 'string' && p.redfin_url.startsWith('http') && !p.redfin_url.includes('stingray/do/')) ? p.redfin_url : null;
        if (redfinDirectUrl) calcParams.set('url', redfinDirectUrl);
        const calcUrl = `/mortgage-calculator/?${calcParams.toString()}`;

        elements.modalDetailBody.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:1.5rem;">
                <!-- Header -->
                <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:1rem;">
                    <div>
                        <div style="display:flex; align-items:center; gap:0.75rem; flex-wrap:wrap; margin-bottom:0.25rem;">
                            <h1 style="color:var(--accent-gold); font-size:2rem; font-weight:800;">$${p.price.toLocaleString()}</h1>
                            <span class="card-status-badge badge-${escapeHtml((p.status || 'Active').toLowerCase())}">${escapeHtml(p.status || 'Active')}</span>
                            ${matrixBadgeModal}
                            ${ppsqft ? `<span class="score-badge" style="font-size:0.9rem;">$${ppsqft} / SqFt</span>` : ''}
                        </div>
                        <h2 style="font-size:1.4rem; font-weight:700; color:var(--text-primary);">${escapeHtml(displayAddrModal)}</h2>
                        <div style="color:var(--text-muted); font-size:0.9rem; margin-top:2px;">
                            ${escapeHtml(p.city || '')}, ${escapeHtml(p.state || 'CO')} ${escapeHtml(p.zip || '')} | <strong>MLS #${escapeHtml(String(p.mls_id))}</strong> | List Date: ${escapeHtml(p.list_date || 'N/A')}
                        </div>
                    </div>

                    <!-- Actions -->
                    <div class="modal-action-bar">
                        <a href="${mlsUrl}" target="_blank" class="btn btn-gold" style="text-decoration:none;">
                            <i data-lucide="link"></i> View Original Matrix MLS Portal Listing
                        </a>
                        <a href="${redfinUrl}" target="_blank" class="btn btn-primary" style="text-decoration:none;">
                            <i data-lucide="circle"></i> View on Redfin
                        </a>
                        <a href="${calcUrl}" target="_blank" class="btn btn-secondary" style="text-decoration:none; background:rgba(91,124,153,0.2); color:#6B8CA3; border:1px solid #5B7C99;">
                            <i data-lucide="calculator"></i> Mortgage Calculator
                        </a>
                        <button class="btn ${p.favorite ? 'btn-gold' : 'btn-secondary'}" onclick="toggleFavoriteModal('${p.mls_id}')">
                            ${p.favorite ? '<i data-lucide="star" style="fill:currentColor"></i> Favorited' : '<i data-lucide="star"></i> Save Favorite'}
                        </button>
                        <button class="btn btn-secondary realtor-or-admin-only" onclick="addMlsToPlaylist('${p.mls_id}')" style="${(state.currentUserProfile?.role === 'realtor' || state.currentUserProfile?.role === 'admin' || state.isAdmin) ? '' : 'display:none;'}">
                            <i data-lucide="folder-plus"></i> Add to Playlist
                        </button>
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
                        <img id="modal-gallery-main-img" src="${escapeHtml(currentGalleryImages[0])}" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${NO_PHOTO_IMG}';" class="gallery-main-img" alt="Property Image 1">
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

                <!-- Section 4: Financials, Taxes & HOA -->
                <div>
                    <div class="modal-section-title"><i data-lucide="wallet"></i> Financials, HOA & Redfin Estimates</div>
                    <div class="modal-grid-4">
                        <div class="modal-detail-box"><span class="modal-detail-lbl">List Price</span><span class="modal-detail-val" style="color:var(--accent-gold);">$${p.price.toLocaleString()}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Annual Property Tax</span><span class="modal-detail-val">${p.annual_tax ? '$' + p.annual_tax.toLocaleString() : 'N/A'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Tax Year</span><span class="modal-detail-val">${p.tax_year || '2025'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">HOA Fee</span><span class="modal-detail-val">${p.hoa_fee ? '$' + p.hoa_fee + '/yr' : 'No HOA'}</span></div>
                        <div class="modal-detail-box" style="grid-column: span 2;"><span class="modal-detail-lbl">Redfin Estimate</span><span class="modal-detail-val">${rfDiffText}</span></div>
                    </div>
                </div>

                <!-- Section 5: WalkScore & Scores -->
                <div>
                    <div class="modal-section-title"><i data-lucide="footprints"></i> Livability & WalkScore Metrics</div>
                    <div class="modal-grid-3">
                        <div class="modal-detail-box"><span class="modal-detail-lbl">WalkScore</span><span class="modal-detail-val" style="color:#4F7A46;"><i data-lucide="footprints"></i> ${p.walk_score ? p.walk_score + ' / 100' : '45 / 100'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Transit Score</span><span class="modal-detail-val"><i data-lucide="bus"></i> ${p.transit_score ? p.transit_score + ' / 100' : '35 / 100'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Bike Score</span><span class="modal-detail-val"><i data-lucide="bike"></i> ${p.bike_score ? p.bike_score + ' / 100' : '48 / 100'}</span></div>
                    </div>
                </div>

                <!-- Section 6: Rating & Notes -->
                <div id="detail-notes" style="background:var(--bg-input); padding:1.25rem; border-radius:var(--radius-md); border:1px solid var(--border-color); display:flex; flex-direction:column; gap:1.25rem;">
                    <div>
                        <div class="modal-section-title" style="border:none; margin:0 0 0.5rem 0;"><i data-lucide="star"></i> My Home Rating</div>
                        <div class="rating-picker" id="modal-rating-picker">
                            ${ratingStarsHtml}
                            <span style="font-size:0.85rem; color:var(--text-muted); margin-left:0.5rem;" id="rating-label">${currentRating ? currentRating + ' / 5 Stars' : 'Unrated'}</span>
                        </div>
                    </div>

                    <div style="display:flex; flex-direction:column; gap:0.5rem;">
                        <h3 style="font-size:0.95rem; font-weight:700; color:var(--text-primary);"><i data-lucide="pencil"></i> Personal Buyer Notes & Pros/Cons</h3>
                        <textarea id="modal-user-notes" class="input-text" style="min-height:90px;" placeholder="Add private notes, pros/cons, showing feedback...">${escapeHtml(p.user_notes || '')}</textarea>
                    </div>

                    ${state.currentUserProfile?.role === 'client' ? `
                        <div style="border:1px solid var(--border-color); border-radius:var(--radius-sm); padding:0.85rem; background:var(--bg-panel);">
                            <h3 style="font-size:0.95rem; font-weight:700; color:var(--text-primary);"><i data-lucide="circle-check"></i> My Decision</h3>
                            <div style="display:flex; flex-wrap:wrap; gap:0.5rem; margin-top:0.65rem;">
                                <button type="button" class="btn ${p.favorite ? 'btn-gold' : 'btn-secondary'}" onclick="setPropertyDecision('${p.mls_id}', 'love')"><i data-lucide="heart"></i> Love</button>
                                <button type="button" class="btn ${p.rating === 3 ? 'btn-primary' : 'btn-secondary'}" onclick="setPropertyDecision('${p.mls_id}', 'consider')"><i data-lucide="circle-help"></i> Consider</button>
                                <button type="button" class="btn ${p.hidden ? 'btn-secondary' : 'btn-secondary'}" style="${p.hidden ? 'color:var(--accent-red); border-color:var(--accent-red);' : ''}" onclick="setPropertyDecision('${p.mls_id}', 'pass')"><i data-lucide="ban"></i> Pass</button>
                            </div>
                        </div>
                    ` : ''}

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
        window.loadPropertyActivity(mlsId);
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

    window.setPropertyDecision = function(mlsId, decision) {
        const p = state.allProperties.find(item => item.mls_id === mlsId);
        if (!p) return;
        const decisions = {
            love: { favorite: 1, hidden: 0, rating: 5, message: 'Saved as a favorite' },
            consider: { favorite: 0, hidden: 0, rating: 3, message: 'Marked as under consideration' },
            pass: { favorite: 0, hidden: 1, rating: 0, message: 'Marked as passed' }
        };
        const update = decisions[decision];
        if (!update) return;

        apiFetch(CONFIG.API_URL + '?action=update_user_data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mls_id: mlsId, favorite: update.favorite, hidden: update.hidden, rating: update.rating })
        }).then(data => {
            if (!data?.success) throw new Error(data?.error || 'Unable to save decision');
            p.favorite = update.favorite;
            p.hidden = update.hidden;
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

