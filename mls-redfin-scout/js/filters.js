import { elements, state } from './state.js';
import { getPropertyReviewStatus, escapeHtml } from './properties.js';
import { showToast } from './toast.js';
import { fetchSavedFilters, saveFilterApi, deleteFilterApi, apiFetch } from './api.js';


    export function resetFilters() {
        state.filters = {
            search: '',
            priceMin: null, priceMax: null,
            rfEstMin: null, rfEstMax: null, ppsqftMax: null, underRedfinOnly: false,
            beds: 0, bedsMax: null, baths: 0, bathsFullMin: null, baths34Min: null, bathsHalfMin: null, levels: '', basement: '',
            sqftMin: null, sqftMax: null, sqftTotMin: null, sqftAboveMin: null, sqftBelowMin: null, propertyType: '',
            yearMin: null, yearMax: null, acresMin: null, acresMax: null, parkingMin: null, garageMin: null,
            hoaMax: null, noHoaOnly: false, taxMax: null, taxYear: null,
            city: '', zip: '', schoolDistrict: '', walkscoreMin: null, transitscoreMin: null, bikescoreMin: null,
            status: 'all', ratingMin: 0, matrixStatus: 'all', appliances: '', flooring: '', fireplaceOnly: false, realtorNotesOnly: false,
            favoritesOnly: false, possibilitiesOnly: false, realtorSharedOnly: false, hasNotesOnly: false, showHidden: true
        };

        localStorage.removeItem('scout_filter_status');
        localStorage.removeItem('scout_filter_matrix_status');

        if (elements.filterSearch) elements.filterSearch.value = '';
        if (elements.filterPriceMin) elements.filterPriceMin.value = '';
        if (elements.filterPriceMax) elements.filterPriceMax.value = '';
        if (elements.filterBeds) elements.filterBeds.value = '0';
        if (elements.filterStatus) elements.filterStatus.value = 'all';

        syncTopBarFromState();
        syncDrawerInputsFromState();
        applyFiltersAndRender();
    }
    export function applyFiltersAndRender() {
        const f = state.filters;
        state.filteredProperties = state.allProperties.filter(p => {
            const rawInt = (p.raw_mls_json && p.raw_mls_json.interior) || {};

            // 1. Collections & Visibility
            if (!f.showHidden && p.hidden) return false;
            if (f.favoritesOnly && !p.favorite) return false;
            if (f.possibilitiesOnly) {
                const mRev = getPropertyReviewStatus(p);
                if (mRev !== 'possibility' && p.rating !== 3) return false;
            }
            if (f.realtorSharedOnly && !p.shared_with_realtor) return false;
            if (f.hasNotesOnly && !p.user_notes && !p.realtor_notes) return false;
            if (f.realtorNotesOnly && !p.realtor_notes) return false;

            // 2. Status & Matrix Review
            if (f.status !== 'all' && p.status !== f.status) return false;
            if (f.matrixStatus !== 'all') {
                const mRev = getPropertyReviewStatus(p);
                if (mRev !== f.matrixStatus) return false;
            }

            // 3. Price & Valuation
            if (f.priceMin !== null && p.price < f.priceMin) return false;
            if (f.priceMax !== null && p.price > f.priceMax) return false;
            if (f.rfEstMin !== null && (p.redfin_estimate || 0) < f.rfEstMin) return false;
            if (f.rfEstMax !== null && (p.redfin_estimate || 0) > f.rfEstMax) return false;
            if (f.ppsqftMax !== null && (p.sqft_finished ? p.price / p.sqft_finished : Infinity) > f.ppsqftMax) return false;
            if (f.underRedfinOnly && (!p.redfin_estimate || p.price >= p.redfin_estimate)) return false;

            // 4. Beds & Baths Breakdown
            if (f.beds > 0 && p.beds < f.beds) return false;
            if (f.bedsMax !== null && p.beds > f.bedsMax) return false;
            if (f.baths > 0 && p.baths < f.baths) return false;
            if (f.bathsFullMin !== null && (rawInt.baths_full || 0) < f.bathsFullMin) return false;
            if (f.baths34Min !== null && (rawInt.baths_3_4 || 0) < f.baths34Min) return false;
            if (f.bathsHalfMin !== null && (rawInt.baths_1_2 || 0) < f.bathsHalfMin) return false;

            // 5. Levels & Basement
            if (f.levels && !String(p.levels || '').toLowerCase().includes(f.levels.toLowerCase())) return false;
            if (f.basement) {
                const bsmntText = String(rawInt.basement || '').toLowerCase();
                if (f.basement === 'None' && bsmntText && !bsmntText.includes('none')) return false;
                else if (f.basement !== 'None' && !bsmntText.includes(f.basement.toLowerCase())) return false;
            }

            // 6. Area & SqFt
            if (f.sqftMin !== null && p.sqft_finished < f.sqftMin) return false;
            if (f.sqftMax !== null && p.sqft_finished > f.sqftMax) return false;
            if (f.sqftTotMin !== null && (p.sqft_total || 0) < f.sqftTotMin) return false;
            if (f.sqftAboveMin !== null && (rawInt.sqft_above_grade || 0) < f.sqftAboveMin) return false;
            if (f.sqftBelowMin !== null && (rawInt.sqft_below_grade_finished || 0) < f.sqftBelowMin) return false;

            // 7. Property & Lot Specs
            if (f.propertyType && !String(p.property_type || '').toLowerCase().includes(f.propertyType.toLowerCase())) return false;
            if (f.yearMin !== null && p.year_built < f.yearMin) return false;
            if (f.yearMax !== null && p.year_built > f.yearMax) return false;
            if (f.acresMin !== null && p.lot_acres < f.acresMin) return false;
            if (f.acresMax !== null && p.lot_acres > f.acresMax) return false;
            if (f.parkingMin !== null && (p.parking_total || 0) < f.parkingMin) return false;
            if (f.garageMin !== null && (p.garage_spaces || 0) < f.garageMin) return false;

            // 8. Financials & Taxes
            if (f.noHoaOnly && (p.hoa_fee || 0) > 0) return false;
            if (f.hoaMax !== null && p.hoa_fee > f.hoaMax) return false;
            if (f.taxMax !== null && p.annual_tax > f.taxMax) return false;
            if (f.taxYear !== null && (p.tax_year || 0) !== f.taxYear) return false;

            // 9. Location & Scores
            if (f.city && !String(p.city || '').toLowerCase().includes(f.city.toLowerCase())) return false;
            if (f.zip && !String(p.zip || '').includes(f.zip)) return false;
            if (f.schoolDistrict && !String(p.school_district || '').toLowerCase().includes(f.schoolDistrict.toLowerCase())) return false;
            if (f.walkscoreMin !== null && (p.walk_score || 0) < f.walkscoreMin) return false;
            if (f.transitscoreMin !== null && (p.transit_score || 0) < f.transitscoreMin) return false;
            if (f.bikescoreMin !== null && (p.bike_score || 0) < f.bikescoreMin) return false;

            // 10. Ratings & Features
            if (f.ratingMin > 0 && (p.rating || 0) < f.ratingMin) return false;
            if (f.appliances && !String(rawInt.appliances || '').toLowerCase().includes(f.appliances.toLowerCase())) return false;
            if (f.flooring && !String(rawInt.flooring || '').toLowerCase().includes(f.flooring.toLowerCase())) return false;
            if (f.fireplaceOnly && (!rawInt.fireplaces || rawInt.fireplaces === '0')) return false;

            // 11. Keyword Search
            if (f.search) {
                const haystack = `${p.address} ${p.city} ${p.zip} ${p.mls_id} ${p.school_district} ${p.user_notes} ${p.realtor_notes} ${rawInt.appliances || ''} ${rawInt.flooring || ''}`.toLowerCase();
                if (!haystack.includes(f.search)) return false;
            }

            return true;
        });

        sortProperties();
        updateKPIs();
        renderActiveFilterChips();
        renderActiveView();
    }
    export function renderActiveFilterChips() {
        const container = document.getElementById('active-filters-bar');
        const badge = document.getElementById('filter-console-badge');
        if (!container) return;

        const f = state.filters;
        const chips = [];

        if (f.search) chips.push({ label: `Search: "${f.search}"`, clear: () => { f.search = ''; if (elements.filterSearch) elements.filterSearch.value = ''; } });
        if (f.priceMin !== null) chips.push({ label: `Min Price: $${f.priceMin.toLocaleString()}`, clear: () => { f.priceMin = null; } });
        if (f.priceMax !== null) chips.push({ label: `Max Price: $${f.priceMax.toLocaleString()}`, clear: () => { f.priceMax = null; } });
        if (f.rfEstMin !== null) chips.push({ label: `Min Redfin Est: $${f.rfEstMin.toLocaleString()}`, clear: () => { f.rfEstMin = null; } });
        if (f.rfEstMax !== null) chips.push({ label: `Max Redfin Est: $${f.rfEstMax.toLocaleString()}`, clear: () => { f.rfEstMax = null; } });
        if (f.ppsqftMax !== null) chips.push({ label: `Max $/SqFt: $${f.ppsqftMax}`, clear: () => { f.ppsqftMax = null; } });
        if (f.underRedfinOnly) chips.push({ label: `Below Redfin Est`, icon: 'trending-down', clear: () => { f.underRedfinOnly = false; } });
        if (f.beds > 0) chips.push({ label: `Beds: ${f.beds}+`, clear: () => { f.beds = 0; } });
        if (f.bedsMax !== null) chips.push({ label: `Max Beds: ${f.bedsMax}`, clear: () => { f.bedsMax = null; } });
        if (f.baths > 0) chips.push({ label: `Baths: ${f.baths}+`, clear: () => { f.baths = 0; } });
        if (f.bathsFullMin !== null) chips.push({ label: `Full Baths: ${f.bathsFullMin}+`, clear: () => { f.bathsFullMin = null; } });
        if (f.baths34Min !== null) chips.push({ label: `3/4 Baths: ${f.baths34Min}+`, clear: () => { f.baths34Min = null; } });
        if (f.bathsHalfMin !== null) chips.push({ label: `Half Baths: ${f.bathsHalfMin}+`, clear: () => { f.bathsHalfMin = null; } });
        if (f.levels) chips.push({ label: `Levels: ${f.levels}`, clear: () => { f.levels = ''; } });
        if (f.basement) chips.push({ label: `Basement: ${f.basement}`, clear: () => { f.basement = ''; } });
        if (f.sqftMin !== null) chips.push({ label: `Min SqFt: ${f.sqftMin.toLocaleString()}`, clear: () => { f.sqftMin = null; } });
        if (f.sqftMax !== null) chips.push({ label: `Max SqFt: ${f.sqftMax.toLocaleString()}`, clear: () => { f.sqftMax = null; } });
        if (f.sqftTotMin !== null) chips.push({ label: `Total SqFt: ${f.sqftTotMin.toLocaleString()}+`, clear: () => { f.sqftTotMin = null; } });
        if (f.sqftAboveMin !== null) chips.push({ label: `Above-Grade: ${f.sqftAboveMin.toLocaleString()}+ SqFt`, clear: () => { f.sqftAboveMin = null; } });
        if (f.sqftBelowMin !== null) chips.push({ label: `Below-Grade: ${f.sqftBelowMin.toLocaleString()}+ SqFt`, clear: () => { f.sqftBelowMin = null; } });
        if (f.propertyType) chips.push({ label: `Type: ${f.propertyType}`, clear: () => { f.propertyType = ''; } });
        if (f.yearMin !== null) chips.push({ label: `Min Year: ${f.yearMin}`, clear: () => { f.yearMin = null; } });
        if (f.yearMax !== null) chips.push({ label: `Max Year: ${f.yearMax}`, clear: () => { f.yearMax = null; } });
        if (f.acresMin !== null) chips.push({ label: `Min Acres: ${f.acresMin}`, clear: () => { f.acresMin = null; } });
        if (f.acresMax !== null) chips.push({ label: `Max Acres: ${f.acresMax}`, clear: () => { f.acresMax = null; } });
        if (f.parkingMin !== null) chips.push({ label: `Parking: ${f.parkingMin}+`, clear: () => { f.parkingMin = null; } });
        if (f.garageMin !== null) chips.push({ label: `Garage: ${f.garageMin}+`, clear: () => { f.garageMin = null; } });
        if (f.noHoaOnly) chips.push({ label: `No HOA`, icon: 'ban', clear: () => { f.noHoaOnly = false; } });
        if (f.hoaMax !== null) chips.push({ label: `Max HOA: $${f.hoaMax}/yr`, clear: () => { f.hoaMax = null; } });
        if (f.taxMax !== null) chips.push({ label: `Max Tax: $${f.taxMax}/yr`, clear: () => { f.taxMax = null; } });
        if (f.taxYear !== null) chips.push({ label: `Tax Year: ${f.taxYear}`, clear: () => { f.taxYear = null; } });
        if (f.city) chips.push({ label: `City: ${f.city}`, clear: () => { f.city = ''; } });
        if (f.zip) chips.push({ label: `Zip: ${f.zip}`, clear: () => { f.zip = ''; } });
        if (f.schoolDistrict) chips.push({ label: `School: "${f.schoolDistrict}"`, clear: () => { f.schoolDistrict = ''; } });
        if (f.walkscoreMin !== null) chips.push({ label: `WalkScore: ${f.walkscoreMin}+`, clear: () => { f.walkscoreMin = null; } });
        if (f.transitscoreMin !== null) chips.push({ label: `TransitScore: ${f.transitscoreMin}+`, clear: () => { f.transitscoreMin = null; } });
        if (f.bikescoreMin !== null) chips.push({ label: `BikeScore: ${f.bikescoreMin}+`, clear: () => { f.bikescoreMin = null; } });
        if (f.status !== 'all') chips.push({ label: `Status: ${f.status}`, clear: () => { f.status = 'all'; } });
        if (f.ratingMin > 0) chips.push({ label: `Rating: ${f.ratingMin}+ Stars`, clear: () => { f.ratingMin = 0; } });
        if (f.matrixStatus !== 'all') {
            const statusLabels = { favorite: 'Liked / Favorites', possibility: 'Possibilities', dislike: 'Disliked / Hidden', none: 'Unreviewed' };
            chips.push({ label: `Review: ${statusLabels[f.matrixStatus] || f.matrixStatus}`, icon: 'filter', clear: () => { f.matrixStatus = 'all'; } });
        }
        if (f.appliances) chips.push({ label: `Appliance: "${f.appliances}"`, clear: () => { f.appliances = ''; } });
        if (f.flooring) chips.push({ label: `Flooring: "${f.flooring}"`, clear: () => { f.flooring = ''; } });
        if (f.fireplaceOnly) chips.push({ label: `Has Fireplace`, icon: 'flame', clear: () => { f.fireplaceOnly = false; } });
        if (f.realtorNotesOnly) chips.push({ label: `Has Realtor Notes`, icon: 'message-square', clear: () => { f.realtorNotesOnly = false; } });
        if (f.favoritesOnly) chips.push({ label: `Favorites Only`, icon: 'star', clear: () => { f.favoritesOnly = false; } });
        if (f.possibilitiesOnly) chips.push({ label: `Possibilities Only`, icon: 'circle-help', clear: () => { f.possibilitiesOnly = false; } });
        if (f.realtorSharedOnly) chips.push({ label: `Realtor Shared Only`, icon: 'handshake', clear: () => { f.realtorSharedOnly = false; } });
        if (f.hasNotesOnly) chips.push({ label: `Has Notes`, icon: 'pencil', clear: () => { f.hasNotesOnly = false; } });
        if (f.selectedClientId && f.selectedClientId !== 'all') {
            const clientSelect = elements.filterClientSelect || document.getElementById('filter-client-select');
            const selectedOpt = clientSelect && clientSelect.selectedIndex >= 0 ? clientSelect.options[clientSelect.selectedIndex] : null;
            const clientLabel = selectedOpt ? selectedOpt.text.replace('👤 ', '') : `Client #${f.selectedClientId}`;
            chips.push({
                label: `Client: ${clientLabel}`,
                icon: 'user',
                clear: () => {
                    f.selectedClientId = 'all';
                    if (elements.filterClientSelect) elements.filterClientSelect.value = 'all';
                    loadPresetsList();
                }
            });
        }

        if (badge) {
            if (chips.length > 0) {
                badge.innerText = chips.length;
                badge.style.display = 'inline-block';
            } else {
                badge.style.display = 'none';
            }
        }

        if (!chips.length) {
            container.style.display = 'none';
            container.innerHTML = '';
            return;
        }

        container.style.display = 'flex';
        container.innerHTML = `
            <span style="font-weight: 700; color: var(--text-muted); margin-right: 0.25rem;">Active Filters (${chips.length}):</span>
            ${chips.map((c, idx) => `
                <span class="active-filter-chip">
                    ${c.icon ? `<i data-lucide="${c.icon}"></i> ` : ''}${escapeHtml(c.label)}
                    <span class="chip-remove" data-chip-idx="${idx}"><i data-lucide="x"></i></span>
                </span>
            `).join('')}
            <button class="btn btn-secondary" style="padding: 0.15rem 0.5rem; font-size: 0.75rem; margin-left: 0.5rem;" id="btn-clear-all-chips">Reset All</button>
        `;
        if (window.lucide) window.lucide.createIcons();

        container.querySelectorAll('.chip-remove').forEach((btn, idx) => {
            btn.addEventListener('click', () => {
                chips[idx].clear();
                syncTopBarFromState();
                syncDrawerInputsFromState();
                applyFiltersAndRender();
            });
        });

        document.getElementById('btn-clear-all-chips')?.addEventListener('click', resetFilters);
    }
    export function syncTopBarFromState() {
        const f = state.filters;
        if (elements.filterSearch) elements.filterSearch.value = f.search || '';
        if (elements.filterPriceMin) elements.filterPriceMin.value = f.priceMin !== null ? f.priceMin : '';
        if (elements.filterPriceMax) elements.filterPriceMax.value = f.priceMax !== null ? f.priceMax : '';
        if (elements.filterBeds) elements.filterBeds.value = f.beds ? String(f.beds) : '0';
        if (elements.filterStatus) elements.filterStatus.value = f.status || 'all';
        if (elements.filterMatrixStatusTop) elements.filterMatrixStatusTop.value = f.matrixStatus || 'all';
    }
    export function syncDrawerInputsFromState() {
        const f = state.filters;
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.value = (val !== null && val !== undefined) ? String(val) : '';
        };
        const setChk = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.checked = !!val;
        };

        setVal('drawer-price-min', f.priceMin);
        setVal('drawer-price-max', f.priceMax);
        setVal('filter-rf-est-min', f.rfEstMin);
        setVal('filter-rf-est-max', f.rfEstMax);
        setVal('filter-ppsqft-max', f.ppsqftMax);
        setChk('toggle-under-redfin', f.underRedfinOnly);

        setVal('drawer-beds-min', f.beds);
        setVal('filter-beds-max', f.bedsMax);
        setVal('drawer-baths-min', f.baths);
        setVal('filter-baths-full-min', f.bathsFullMin);
        setVal('filter-baths-34-min', f.baths34Min);
        setVal('filter-baths-half-min', f.bathsHalfMin);
        setVal('filter-levels', f.levels);
        setVal('filter-basement', f.basement);

        setVal('drawer-sqft-min', f.sqftMin);
        setVal('filter-sqft-max', f.sqftMax);
        setVal('filter-sqft-tot-min', f.sqftTotMin);
        setVal('filter-sqft-above-min', f.sqftAboveMin);
        setVal('filter-sqft-below-min', f.sqftBelowMin);
        setVal('filter-property-type', f.propertyType);
        setVal('drawer-year-min', f.yearMin);
        setVal('drawer-year-max', f.yearMax);
        setVal('drawer-acres-min', f.acresMin);
        setVal('filter-acres-max', f.acresMax);
        setVal('filter-garage-min', f.garageMin);
        setVal('filter-parking-min', f.parkingMin);

        setVal('drawer-hoa-max', f.hoaMax);
        setChk('toggle-no-hoa', f.noHoaOnly);
        setVal('drawer-tax-max', f.taxMax);
        setVal('filter-tax-year', f.taxYear);

        setVal('filter-city', f.city);
        setVal('filter-zip', f.zip);
        setVal('filter-school-district', f.schoolDistrict);
        setVal('drawer-walkscore-min', f.walkscoreMin);
        setVal('filter-transitscore-min', f.transitscoreMin);
        setVal('filter-bikescore-min', f.bikescoreMin);

        setVal('filter-rating-min', f.ratingMin);
        setVal('filter-matrix-status', f.matrixStatus);
        setVal('filter-appliances', f.appliances);
        setVal('filter-flooring', f.flooring);
        setChk('toggle-fireplace', f.fireplaceOnly);
        setChk('toggle-realtor-notes', f.realtorNotesOnly);

        setChk('drawer-toggle-favorites', f.favoritesOnly);
        setChk('drawer-toggle-possibilities', f.possibilitiesOnly);
        setChk('drawer-toggle-realtor-shared', f.realtorSharedOnly);
        setChk('drawer-toggle-has-notes', f.hasNotesOnly);
        setChk('drawer-toggle-include-hidden', f.showHidden);
    }
    export function syncStateFromDrawerInputs() {
        const f = state.filters;
        const getNum = id => {
            const el = document.getElementById(id);
            if (!el || el.value === '') return null;
            const n = parseFloat(el.value);
            return isNaN(n) ? null : n;
        };
        const getStr = id => {
            const el = document.getElementById(id);
            return el ? el.value.trim() : '';
        };
        const getChk = id => {
            const el = document.getElementById(id);
            return el ? el.checked : false;
        };

        f.priceMin = getNum('drawer-price-min');
        f.priceMax = getNum('drawer-price-max');
        f.rfEstMin = getNum('filter-rf-est-min');
        f.rfEstMax = getNum('filter-rf-est-max');
        f.ppsqftMax = getNum('filter-ppsqft-max');
        f.underRedfinOnly = getChk('toggle-under-redfin');

        f.beds = getNum('drawer-beds-min') || 0;
        f.bedsMax = getNum('filter-beds-max');
        f.baths = getNum('drawer-baths-min') || 0;
        f.bathsFullMin = getNum('filter-baths-full-min');
        f.baths34Min = getNum('filter-baths-34-min');
        f.bathsHalfMin = getNum('filter-baths-half-min');
        f.levels = getStr('filter-levels');
        f.basement = getStr('filter-basement');

        f.sqftMin = getNum('drawer-sqft-min');
        f.sqftMax = getNum('filter-sqft-max');
        f.sqftTotMin = getNum('filter-sqft-tot-min');
        f.sqftAboveMin = getNum('filter-sqft-above-min');
        f.sqftBelowMin = getNum('filter-sqft-below-min');
        f.propertyType = getStr('filter-property-type');
        f.yearMin = getNum('drawer-year-min');
        f.yearMax = getNum('drawer-year-max');
        f.acresMin = getNum('drawer-acres-min');
        f.acresMax = getNum('filter-acres-max');
        f.garageMin = getNum('filter-garage-min');
        f.parkingMin = getNum('filter-parking-min');

        f.hoaMax = getNum('drawer-hoa-max');
        f.noHoaOnly = getChk('toggle-no-hoa');
        f.taxMax = getNum('drawer-tax-max');
        f.taxYear = getNum('filter-tax-year');

        f.city = getStr('filter-city');
        f.zip = getStr('filter-zip');
        f.schoolDistrict = getStr('filter-school-district');
        f.walkscoreMin = getNum('drawer-walkscore-min');
        f.transitscoreMin = getNum('filter-transitscore-min');
        f.bikescoreMin = getNum('filter-bikescore-min');

        f.ratingMin = getNum('filter-rating-min') || 0;
        f.matrixStatus = getStr('filter-matrix-status') || 'all';
        f.appliances = getStr('filter-appliances');
        f.flooring = getStr('filter-flooring');
        f.fireplaceOnly = getChk('toggle-fireplace');
        f.realtorNotesOnly = getChk('toggle-realtor-notes');

        f.favoritesOnly = getChk('drawer-toggle-favorites');
        f.possibilitiesOnly = getChk('drawer-toggle-possibilities');
        f.realtorSharedOnly = getChk('drawer-toggle-realtor-shared');
        f.hasNotesOnly = getChk('drawer-toggle-has-notes');
        f.showHidden = getChk('drawer-toggle-include-hidden');

        if (f.status) localStorage.setItem('scout_filter_status', f.status);
        if (f.matrixStatus) localStorage.setItem('scout_filter_matrix_status', f.matrixStatus);

        syncTopBarFromState();
    }
    export function setupFilterConsoleDrawer() {
        const modalDrawer = document.getElementById('modal-filter-console');
        const btnOpen = document.getElementById('btn-open-filter-console');
        const btnClose = document.getElementById('btn-close-filter-console');
        const btnApply = document.getElementById('btn-drawer-apply');
        const btnResetDrawer = document.getElementById('btn-drawer-reset');

        if (btnOpen && modalDrawer) {
            btnOpen.addEventListener('click', () => {
                syncDrawerInputsFromState();
                modalDrawer.classList.add('active');
            });
        }

        if (btnClose && modalDrawer) {
            btnClose.addEventListener('click', () => modalDrawer.classList.remove('active'));
        }

        if (btnApply && modalDrawer) {
            btnApply.addEventListener('click', () => {
                syncStateFromDrawerInputs();
                applyFiltersAndRender();
                modalDrawer.classList.remove('active');
                showToast('Filters applied! Focus on your target houses', 'success');
            });
        }

        if (btnResetDrawer) {
            btnResetDrawer.addEventListener('click', () => {
                resetFilters();
                syncDrawerInputsFromState();
                showToast('All filters reset', 'info');
            });
        }

        // Tab Navigation
        document.querySelectorAll('.drawer-tab-btn').forEach(tabBtn => {
            tabBtn.addEventListener('click', () => {
                document.querySelectorAll('.drawer-tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.drawer-tab-panel').forEach(p => p.classList.remove('active'));

                tabBtn.classList.add('active');
                const targetPanel = document.getElementById(tabBtn.dataset.tab);
                if (targetPanel) targetPanel.classList.add('active');
            });
        });

        // Saved Presets Event Handlers
        const btnSavePreset = document.getElementById('btn-save-preset');
        const selectPresets = document.getElementById('select-saved-presets');
        const btnDeletePreset = document.getElementById('btn-delete-preset');

        if (btnSavePreset) {
            btnSavePreset.addEventListener('click', saveCurrentPreset);
        }

        if (selectPresets) {
            selectPresets.addEventListener('change', (e) => {
                const presetId = e.target.value;
                if (presetId) loadPreset(presetId);
            });
        }

        if (btnDeletePreset) {
            btnDeletePreset.addEventListener('click', deleteSelectedPreset);
        }

        if (state.authenticated) {
            loadPresetsList();
        }
    }

    let cachedFilters = [];

    export async function populateClientFilterDropdown() {
        const clientGroup = elements.clientFilterGroup || document.getElementById('client-filter-group');
        const clientSelect = elements.filterClientSelect || document.getElementById('filter-client-select');
        if (!clientSelect) return;

        if (!state.authenticated) {
            if (clientGroup) clientGroup.style.display = 'none';
            return;
        }

        const isRealtor = state.currentUserProfile?.role === 'realtor';
        const isAdmin = state.isAdmin || state.currentUserProfile?.role === 'admin';

        if (!isRealtor && !isAdmin) {
            if (clientGroup) clientGroup.style.display = 'none';
            return;
        }

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

        if (clientGroup) clientGroup.style.display = 'flex';

        clientSelect.innerHTML = `<option value="all">👥 All Clients (${clients.length})</option>` +
            clients.map(c => `<option value="${c.id}">👤 ${escapeHtml(c.full_name || c.username)} [${c.initials || 'CL'}]</option>`).join('');

        if (state.filters.selectedClientId) {
            clientSelect.value = state.filters.selectedClientId;
        }
    }

    export async function loadPresetsList() {
        const selectPresets = document.getElementById('select-saved-presets');
        if (!selectPresets) return;

        if (!state.authenticated) {
            selectPresets.innerHTML = `<option value="">💾 Presets (0)...</option>`;
            return;
        }

        // Auto-migrate legacy localStorage filters to server database
        try {
            const localRaw = localStorage.getItem('scout_saved_presets');
            if (localRaw) {
                const localObj = JSON.parse(localRaw);
                const localKeys = Object.keys(localObj);
                if (localKeys.length > 0) {
                    for (const name of localKeys) {
                        await saveFilterApi({ name: name, filter_json: localObj[name] });
                    }
                    localStorage.removeItem('scout_saved_presets');
                    showToast(`Migrated ${localKeys.length} saved filters to your account!`, 'info');
                }
            }
        } catch (e) {
            console.error('LocalStorage filter migration error:', e);
        }

        try {
            const res = await fetchSavedFilters();
            if (res && res.success && Array.isArray(res.filters)) {
                cachedFilters = res.filters;
                state.savedFilters = res.filters;

                let visibleFilters = res.filters;
                const selClient = state.filters.selectedClientId;
                if (selClient && selClient !== 'all') {
                    visibleFilters = res.filters.filter(f => String(f.user_id) === String(selClient) || String(f.target_user_id) === String(selClient) || String(f.created_by_user_id) === String(selClient));
                }

                selectPresets.innerHTML = `<option value="">💾 Presets (${visibleFilters.length})...</option>` +
                    visibleFilters.map(f => `<option value="${f.id}">${escapeHtml(f.display_name || f.name)}</option>`).join('');
            }
        } catch (e) {
            console.error('Failed to fetch saved filters from server:', e);
        }
    }

    export async function saveCurrentPreset() {
        const presetName = prompt('Enter a name for this filter preset (e.g. "3+ Bed Denver under $750k"):');
        if (!presetName || !presetName.trim()) return;

        let targetUserId = null;

        // If current user is Realtor or Admin, allow selecting a target client
        if (state.currentUser && (state.currentUser.role === 'realtor' || state.currentUser.role === 'admin' || state.currentUser.is_admin)) {
            try {
                const usersRes = await apiFetch('backend/api.php?action=list_users');
                if (usersRes && usersRes.success && Array.isArray(usersRes.users)) {
                    const clients = usersRes.users.filter(u => u.role === 'client');
                    if (clients.length > 0) {
                        const clientOptions = clients.map((c, i) => `${i + 1}. ${c.username} [${c.initials}]`).join('\n');
                        const choice = prompt(`Select client to share this filter with (or leave blank to save for yourself):\n\n0. Myself\n${clientOptions}`);
                        if (choice !== null && choice !== '' && choice !== '0') {
                            const selectedIdx = parseInt(choice) - 1;
                            if (clients[selectedIdx]) {
                                targetUserId = clients[selectedIdx].id;
                            }
                        }
                    }
                }
            } catch (e) {}
        }

        try {
            const payload = {
                name: presetName.trim(),
                filter_json: { ...state.filters },
                target_user_id: targetUserId,
                is_shared: targetUserId ? 1 : 0
            };
            const res = await saveFilterApi(payload);
            if (res && res.success) {
                showToast(`Saved filter preset "${presetName.trim()}"!`, 'success');
                await loadPresetsList();
                if (res.id && selectPresets) {
                    selectPresets.value = String(res.id);
                }
            } else {
                showToast(res.error || 'Failed to save filter preset', 'error');
            }
        } catch (e) {
            showToast('Error saving filter preset', 'error');
        }
    }

    export function loadPreset(presetId) {
        const target = cachedFilters.find(f => String(f.id) === String(presetId));
        if (!target) return;

        let filterData = target.filter_json;
        if (typeof filterData === 'string') {
            try { filterData = JSON.parse(filterData); } catch (e) {}
        }

        if (filterData && typeof filterData === 'object') {
            state.filters = { ...state.filters, ...filterData };
            syncTopBarFromState();
            syncDrawerInputsFromState();
            applyFiltersAndRender();
            showToast(`Loaded preset "${target.display_name || target.name}"`, 'info');
        }
    }

    export async function deleteSelectedPreset() {
        const selectPresets = document.getElementById('select-saved-presets');
        if (!selectPresets || !selectPresets.value) {
            return showToast('Please select a saved preset to delete first', 'warning');
        }

        const presetId = selectPresets.value;
        const target = cachedFilters.find(f => String(f.id) === String(presetId));
        if (!target) return;

        if (!confirm(`Are you sure you want to delete the filter preset "${target.name}"?`)) {
            return;
        }

        try {
            const res = await deleteFilterApi(presetId);
            if (res && res.success) {
                showToast(`Deleted preset "${target.name}"`, 'info');
                await loadPresetsList();
            } else {
                showToast(res.error || 'Failed to delete preset', 'error');
            }
        } catch (e) {
            showToast('Error deleting preset', 'error');
        }
    }

    export function sortProperties() {
        const props = state.filteredProperties;
        switch (state.currentSort) {
            case 'price-asc':
                props.sort((a, b) => a.price - b.price);
                break;
            case 'price-desc':
                props.sort((a, b) => b.price - a.price);
                break;
            case 'sqft-desc':
                props.sort((a, b) => b.sqft_finished - a.sqft_finished);
                break;
            case 'ppsqft-asc':
                props.sort((a, b) => {
                    const ppsqA = a.sqft_finished ? a.price / a.sqft_finished : 999999;
                    const ppsqB = b.sqft_finished ? b.price / b.sqft_finished : 999999;
                    return ppsqA - ppsqB;
                });
                break;
            case 'walkscore-desc':
                props.sort((a, b) => (b.walk_score || 0) - (a.walk_score || 0));
                break;
            case 'rating-desc':
                props.sort((a, b) => (b.rating || 0) - (a.rating || 0));
                break;
            case 'date-desc':
            default:
                props.sort((a, b) => new Date(b.list_date || 0) - new Date(a.list_date || 0));
                break;
        }
    }
