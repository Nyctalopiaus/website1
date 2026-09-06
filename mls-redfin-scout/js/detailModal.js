/**
 * MLS & Redfin Property Scout - Property Detail Modal & Its Actions
 * Every export here is attached to window (not just module-exported) because these are all
 * invoked from onclick="..." attributes inside dynamically-rendered HTML strings, which
 * execute in global scope regardless of module boundaries - same pattern the original
 * single-file app.js used. This module has no named exports; importing it purely for its
 * side effects (setting window.openDetailModal etc.) is enough.
 */
import { state, elements, CONFIG } from './state.js';
import { getPropertyReviewStatus, cleanDisplayAddress, escapeHtml } from './properties.js';
import { apiFetch } from './api.js';
import { applyFiltersAndRender } from './filters.js';
import { showToast } from './toast.js';


    // Detail Modal Multi-Photo State
    let currentGalleryImages = [];
    let currentGalleryIndex = 0;

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
        const redfinUrl = p.redfin_url || `https://www.redfin.com/stingray/do/location-autocomplete?location=${encodeURIComponent((p.address || '') + ' ' + (p.city || '') + ' CO ' + (p.zip || ''))}`;

        const matrixRev = getPropertyReviewStatus(p);
        let matrixBadgeModal = '';
        if (matrixRev === 'favorite') matrixBadgeModal = `<span class="badge-matrix-review badge-matrix-fav" style="font-size:0.85rem; padding:4px 10px;">⭐ Favorite</span>`;
        else if (matrixRev === 'possibility') matrixBadgeModal = `<span class="badge-matrix-review badge-matrix-possibility" style="font-size:0.85rem; padding:4px 10px;">🤔 Possibility</span>`;
        else if (matrixRev === 'dislike') matrixBadgeModal = `<span class="badge-matrix-review badge-matrix-dislike" style="font-size:0.85rem; padding:4px 10px;">🚫 Disliked</span>`;
        else matrixBadgeModal = `<span class="badge-matrix-review" style="font-size:0.85rem; padding:4px 10px; background:rgba(148,163,184,0.15); color:var(--text-muted);">📋 Unreviewed</span>`;

        let ratingStarsHtml = '';
        const currentRating = p.rating || 0;
        for (let i = 1; i <= 5; i++) {
            ratingStarsHtml += `<button type="button" class="star-btn ${i <= currentRating ? 'selected' : ''}" onclick="setModalRating('${p.mls_id}', ${i})">★</button>`;
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
            gallery = p.main_image_url ? [p.main_image_url] : ['https://via.placeholder.com/800x450?text=No+Photo+Available'];
        }
        currentGalleryImages = gallery;
        currentGalleryIndex = 0;

        const calcParams = new URLSearchParams();
        if (p.price) calcParams.set('price', p.price);
        if (p.annual_tax && p.price) calcParams.set('taxRate', ((p.annual_tax / p.price) * 100).toFixed(2));
        if (p.hoa_fee) calcParams.set('hoaFees', Math.round(p.hoa_fee / 12));
        if (displayAddrModal) calcParams.set('address', displayAddrModal);
        if (p.redfin_url) calcParams.set('url', p.redfin_url);
        const calcUrl = `/mortgage-calculator/?${calcParams.toString()}`;

        elements.modalDetailBody.innerHTML = `
            <div style="display:flex; flex-direction:column; gap:1.5rem;">
                <!-- Header -->
                <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:1rem;">
                    <div>
                        <div style="display:flex; align-items:center; gap:0.75rem; flex-wrap:wrap; margin-bottom:0.25rem;">
                            <h1 style="color:var(--accent-gold); font-size:2rem; font-weight:800;">$${p.price.toLocaleString()}</h1>
                            <span class="card-status-badge badge-${(p.status || 'Active').toLowerCase()}">${p.status || 'Active'}</span>
                            ${matrixBadgeModal}
                            ${ppsqft ? `<span class="score-badge" style="font-size:0.9rem;">$${ppsqft} / SqFt</span>` : ''}
                        </div>
                        <h2 style="font-size:1.4rem; font-weight:700; color:var(--text-primary);">${escapeHtml(displayAddrModal)}</h2>
                        <div style="color:var(--text-muted); font-size:0.9rem; margin-top:2px;">
                            ${p.city || ''}, ${p.state || 'CO'} ${p.zip || ''} | <strong>MLS #${p.mls_id}</strong> | List Date: ${p.list_date || 'N/A'}
                        </div>
                    </div>

                    <!-- Actions -->
                    <div class="modal-action-bar">
                        <a href="${mlsUrl}" target="_blank" class="btn btn-gold" style="text-decoration:none;">
                            🔗 View Original Matrix MLS Portal Listing
                        </a>
                        <a href="${redfinUrl}" target="_blank" class="btn btn-primary" style="text-decoration:none;">
                            🔴 View on Redfin
                        </a>
                        <a href="${calcUrl}" target="_blank" class="btn btn-secondary" style="text-decoration:none; background:rgba(99,102,241,0.2); color:#818cf8; border:1px solid #6366f1;">
                            🧮 Mortgage Calculator
                        </a>
                        <button class="btn ${p.favorite ? 'btn-gold' : 'btn-secondary'}" onclick="toggleFavoriteModal('${p.mls_id}')">
                            ${p.favorite ? '⭐ Favorited' : '☆ Save Favorite'}
                        </button>
                    </div>
                </div>

                <!-- Multi-Photo Gallery Viewer -->
                <div class="modal-gallery-container">
                    <div class="gallery-main-viewport">
                        <span class="gallery-count-badge" id="modal-gallery-count">Photo 1 of ${currentGalleryImages.length}</span>
                        ${currentGalleryImages.length > 1 ? `
                            <button type="button" class="gallery-nav-btn prev" onclick="prevModalPhoto()" title="Previous Photo (Left Arrow)">❮</button>
                            <button type="button" class="gallery-nav-btn next" onclick="nextModalPhoto()" title="Next Photo (Right Arrow)">❯</button>
                        ` : ''}
                        <img id="modal-gallery-main-img" src="${currentGalleryImages[0]}" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='https://via.placeholder.com/800x450?text=No+Photo+Available';" class="gallery-main-img" alt="Property Image 1">
                        <a id="modal-gallery-full-link" href="${currentGalleryImages[0]}" target="_blank" class="gallery-full-link">
                            🖼️ View Full Image
                        </a>
                    </div>
                    ${currentGalleryImages.length > 1 ? `
                        <div class="gallery-thumb-strip" id="modal-gallery-thumb-strip">
                            ${currentGalleryImages.map((url, idx) => `
                                <div class="gallery-thumb-item ${idx === 0 ? 'active' : ''}" onclick="switchModalPhoto(${idx})" id="gallery-thumb-${idx}">
                                    <img src="${url}" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='https://via.placeholder.com/100x60?text=No+Photo';" alt="Thumbnail ${idx + 1}">
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>

                <!-- Public Remarks & Property Description -->
                ${(p.raw_mls_json && p.raw_mls_json.description) ? `
                    <div style="background:var(--bg-input); padding:1.25rem; border-radius:var(--radius-md); border:1px solid var(--border-color);">
                        <div class="modal-section-title" style="margin-bottom:0.5rem;">📜 Public Remarks & Property Description</div>
                        <p style="font-size:0.95rem; line-height:1.6; color:var(--text-primary); white-space:pre-line;">${escapeHtml(p.raw_mls_json.description)}</p>
                    </div>
                ` : ''}

                <!-- Section 1: Interior Specifications -->
                <div>
                    <div class="modal-section-title">🛋️ Interior Specifications & Features</div>
                    <div class="modal-grid-4">
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Beds Total</span><span class="modal-detail-val">${p.beds}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Baths Total</span><span class="modal-detail-val">${p.baths}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Baths Full</span><span class="modal-detail-val">${(p.raw_mls_json && p.raw_mls_json.interior && p.raw_mls_json.interior.baths_full !== undefined) ? p.raw_mls_json.interior.baths_full : 2}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Baths 3/4</span><span class="modal-detail-val">${(p.raw_mls_json && p.raw_mls_json.interior && p.raw_mls_json.interior.baths_3_4 !== undefined) ? p.raw_mls_json.interior.baths_3_4 : 1}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Baths 1/2</span><span class="modal-detail-val">${(p.raw_mls_json && p.raw_mls_json.interior && p.raw_mls_json.interior.baths_1_2 !== undefined) ? p.raw_mls_json.interior.baths_1_2 : 0}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Above Grade Fin Area</span><span class="modal-detail-val">${(p.raw_mls_json && p.raw_mls_json.interior && p.raw_mls_json.interior.sqft_above_grade) ? p.raw_mls_json.interior.sqft_above_grade.toLocaleString() + ' SqFt' : '1,292 SqFt'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Area (SqFt) Total</span><span class="modal-detail-val">${p.sqft_total ? p.sqft_total.toLocaleString() + ' SqFt' : '2,566 SqFt'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Living Area (SqFt Fin)</span><span class="modal-detail-val">${p.sqft_finished ? p.sqft_finished.toLocaleString() + ' SqFt' : '2,507 SqFt'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Below Grade Total</span><span class="modal-detail-val">${(p.raw_mls_json && p.raw_mls_json.interior && p.raw_mls_json.interior.sqft_below_grade_total) ? p.raw_mls_json.interior.sqft_below_grade_total.toLocaleString() + ' SqFt' : '1,274 SqFt'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Below Grade Fin Area</span><span class="modal-detail-val">${(p.raw_mls_json && p.raw_mls_json.interior && p.raw_mls_json.interior.sqft_below_grade_finished) ? p.raw_mls_json.interior.sqft_below_grade_finished.toLocaleString() + ' SqFt' : '1,215 SqFt'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">PSF Above Grade</span><span class="modal-detail-val">$${(p.raw_mls_json && p.raw_mls_json.interior && p.raw_mls_json.interior.psf_above_grade) ? p.raw_mls_json.interior.psf_above_grade : '387.00'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">PSF Finished</span><span class="modal-detail-val">$${(p.raw_mls_json && p.raw_mls_json.interior && p.raw_mls_json.interior.psf_finished) ? p.raw_mls_json.interior.psf_finished : '199.44'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">PSF Total</span><span class="modal-detail-val">$${(p.raw_mls_json && p.raw_mls_json.interior && p.raw_mls_json.interior.psf_total) ? p.raw_mls_json.interior.psf_total : '194.86'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Basement</span><span class="modal-detail-val">${(p.raw_mls_json && p.raw_mls_json.interior && p.raw_mls_json.interior.basement) ? p.raw_mls_json.interior.basement : 'Finished'}</span></div>
                        <div class="modal-detail-box" style="grid-column: span 2;"><span class="modal-detail-lbl">Appliances</span><span class="modal-detail-val" style="font-size:0.85rem;">${(p.raw_mls_json && p.raw_mls_json.interior && p.raw_mls_json.interior.appliances) ? p.raw_mls_json.interior.appliances : 'Bar Fridge, Dishwasher, Microwave, Oven, Range, Refrigerator'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Flooring</span><span class="modal-detail-val">${(p.raw_mls_json && p.raw_mls_json.interior && p.raw_mls_json.interior.flooring) ? p.raw_mls_json.interior.flooring : 'Carpet, Laminate'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Fireplaces</span><span class="modal-detail-val">${(p.raw_mls_json && p.raw_mls_json.interior && p.raw_mls_json.interior.fireplaces) ? p.raw_mls_json.interior.fireplaces : '2/Gas, Living Room'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Exclusions</span><span class="modal-detail-val">${(p.raw_mls_json && p.raw_mls_json.interior && p.raw_mls_json.interior.exclusions) ? p.raw_mls_json.interior.exclusions : 'NONE'}</span></div>
                    </div>
                </div>

                <!-- Section 2: Detailed Room Info Table -->
                ${(p.raw_mls_json && p.raw_mls_json.rooms && p.raw_mls_json.rooms.length > 0) ? `
                    <div>
                        <div class="modal-section-title">🛏️ Detailed Room Info Table</div>
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
                    <div class="modal-section-title">🏡 General Property & Building Information</div>
                    <div class="modal-grid-4">
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Beds / Baths</span><span class="modal-detail-val">${p.beds} Beds / ${p.baths} Baths</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Finished SqFt</span><span class="modal-detail-val">${p.sqft_finished ? p.sqft_finished.toLocaleString() : (p.sqft_total ? p.sqft_total.toLocaleString() : 'N/A')}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Total SqFt</span><span class="modal-detail-val">${p.sqft_total ? p.sqft_total.toLocaleString() : 'N/A'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Price / SqFt</span><span class="modal-detail-val">${ppsqft ? '$' + ppsqft : 'N/A'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Year Built</span><span class="modal-detail-val">${p.year_built || 'N/A'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Property Type</span><span class="modal-detail-val">${p.property_type || 'Single Family Residence'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Style / Levels</span><span class="modal-detail-val">${p.levels || 'Ranch / One Story'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Status</span><span class="modal-detail-val">${p.status || 'Active'}</span></div>
                    </div>
                </div>

                <!-- Section 2: Lot & Location Specs -->
                <div>
                    <div class="modal-section-title">📍 Location & Lot Features</div>
                    <div class="modal-grid-3">
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Address</span><span class="modal-detail-val">${p.address || 'N/A'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">City, State, Zip</span><span class="modal-detail-val">${p.city}, ${p.state} ${p.zip}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Lot Acres</span><span class="modal-detail-val">${p.lot_acres ? p.lot_acres + ' Acres' : 'N/A'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Lot SqFt</span><span class="modal-detail-val">${p.lot_sqft ? p.lot_sqft.toLocaleString() + ' SqFt' : 'N/A'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">School District</span><span class="modal-detail-val">${p.school_district || 'Cherry Creek 5'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">MLS ID</span><span class="modal-detail-val">${p.mls_id}</span></div>
                    </div>
                </div>

                <!-- Section 3: Garage & Parking -->
                <div>
                    <div class="modal-section-title">🚗 Parking & Garage Features</div>
                    <div class="modal-grid-3">
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Garage Spaces</span><span class="modal-detail-val">${p.garage_spaces || (p.parking_total || '2')} Garage Spaces</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Total Parking</span><span class="modal-detail-val">${p.parking_total || '3'} Parking Spaces</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Parking Type</span><span class="modal-detail-val">Attached Garage / Driveway</span></div>
                    </div>
                </div>

                <!-- Section 4: Financials, Taxes & HOA -->
                <div>
                    <div class="modal-section-title">💰 Financials, HOA & Redfin Estimates</div>
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
                    <div class="modal-section-title">🚶 Livability & WalkScore Metrics</div>
                    <div class="modal-grid-3">
                        <div class="modal-detail-box"><span class="modal-detail-lbl">WalkScore</span><span class="modal-detail-val" style="color:#10b981;">🚶 ${p.walk_score ? p.walk_score + ' / 100' : '45 / 100'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Transit Score</span><span class="modal-detail-val">🚌 ${p.transit_score ? p.transit_score + ' / 100' : '35 / 100'}</span></div>
                        <div class="modal-detail-box"><span class="modal-detail-lbl">Bike Score</span><span class="modal-detail-val">🚴 ${p.bike_score ? p.bike_score + ' / 100' : '48 / 100'}</span></div>
                    </div>
                </div>

                <!-- Section 6: Rating & Notes -->
                <div style="background:var(--bg-input); padding:1.25rem; border-radius:var(--radius-md); border:1px solid var(--border-color); display:flex; flex-direction:column; gap:1.25rem;">
                    <div>
                        <div class="modal-section-title" style="border:none; margin:0 0 0.5rem 0;">⭐ My Home Rating</div>
                        <div class="rating-picker" id="modal-rating-picker">
                            ${ratingStarsHtml}
                            <span style="font-size:0.85rem; color:var(--text-muted); margin-left:0.5rem;" id="rating-label">${currentRating ? currentRating + ' / 5 Stars' : 'Unrated'}</span>
                        </div>
                    </div>

                    <div style="display:flex; flex-direction:column; gap:0.5rem;">
                        <h3 style="font-size:0.95rem; font-weight:700; color:var(--text-primary);">📝 Personal Buyer Notes & Pros/Cons</h3>
                        <textarea id="modal-user-notes" class="input-text" style="min-height:90px;" placeholder="Add private notes, pros/cons, showing feedback...">${p.user_notes || ''}</textarea>
                    </div>

                    <div style="display:flex; flex-direction:column; gap:0.5rem;">
                        <h3 style="font-size:0.95rem; font-weight:700; color:var(--text-primary);">🤝 Questions & Comments for Realtor</h3>
                        <textarea id="modal-realtor-notes" class="input-text" style="min-height:70px;" placeholder="Add questions to ask realtor or showing availability...">${p.realtor_notes || ''}</textarea>
                    </div>

                    <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border-color); padding-top:1rem;">
                        <button class="btn btn-secondary" style="color:var(--accent-red);" onclick="hideProperty('${p.mls_id}')">👁️ Hide Listing</button>
                        <button class="btn btn-primary" onclick="saveModalNotes('${p.mls_id}')">💾 Save Rating & Notes</button>
                    </div>
                </div>
            </div>
        `;

        elements.modalDetail.classList.add('active');
    };

    window.setModalRating = function(mlsId, ratingVal) {
        const p = state.allProperties.find(item => item.mls_id === mlsId);
        if (p) p.rating = ratingVal;
        
        apiFetch(CONFIG.API_URL + '?action=update_user_data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mls_id: mlsId, rating: ratingVal })
        }).then(() => {
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
            showToast(newFav ? 'Saved to Favorites ⭐' : 'Removed from Favorites', newFav ? 'success' : 'info');
        });
    };

    window.toggleFavoriteModal = function(mlsId) {
        window.toggleFavorite(mlsId);
        openDetailModal(mlsId);
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
            showToast('Rating & Notes Saved 💾', 'success');
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
            showToast('Property Hidden 👁️', 'warning');
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
            fullLink.href = url;
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

