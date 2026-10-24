/**
 * Nycto's MLS Property Scout - Side-by-Side Property Comparison Module
 */
import { state } from './state.js';
import { cleanDisplayAddress, escapeHtml, NO_PHOTO_IMG, getCompScore, getPropertyReviewStatus } from './properties.js';
import { getCardDaysOnMarket } from './views.js';
import { getMarketRate, loadMortgageRates } from './rates.js';
import { showToast } from './toast.js';
import { savePreferencesToServer } from './api.js';
import { myHomeMonthly, myHomeSaleMath } from './myHome.js';

export function toggleCompare(mlsId, event) {
    if (event) {
        event.stopPropagation();
    }
    const idStr = String(mlsId);
    const idx = state.compareList.indexOf(idStr);

    if (idx > -1) {
        state.compareList.splice(idx, 1);
        showToast(`Removed from comparison`, 'info');
    } else {
        if (state.compareList.length >= 4) {
            showToast(`Comparison is limited to 4 properties at a time`, 'warning');
            return;
        }
        state.compareList.push(idStr);
        showToast(`Added to property comparison`, 'success');
    }

    try {
        localStorage.setItem('scout_compare_list', JSON.stringify(state.compareList));
    } catch (e) {}

    savePreferencesToServer();
    updateCompareDock();
    updateCompareButtons();
}

export function clearCompare() {
    state.compareList = [];
    localStorage.removeItem('scout_compare_list');
    savePreferencesToServer();
    updateCompareDock();
    updateCompareButtons();
    showToast(`Comparison list cleared`, 'info');
}

export function updateCompareButtons() {
    document.querySelectorAll('.card-compare-btn').forEach(btn => {
        const mls = btn.dataset.mls;
        const isComparing = state.compareList.includes(String(mls));
        btn.classList.toggle('is-comparing', isComparing);
        btn.innerHTML = isComparing ? '<i data-lucide="check"></i> Comparing' : '<i data-lucide="scale"></i> Compare';
    });

    document.querySelectorAll('.card-compare-checkbox').forEach(input => {
        const mls = input.dataset.mls;
        const isComparing = state.compareList.includes(String(mls));
        input.checked = isComparing;
        const label = input.closest('.card-compare-checkbox-label');
        if (label) {
            label.classList.toggle('is-checked', isComparing);
            const textSpan = label.querySelector('.checkbox-text');
            if (textSpan) {
                textSpan.innerHTML = isComparing ? '<i data-lucide="check"></i> Comparing' : 'Compare';
            }
        }
    });

    if (window.lucide) window.lucide.createIcons();
}

export function updateCompareDock() {
    const dock = document.getElementById('compare-dock');
    const badge = document.getElementById('compare-count-badge');
    const thumbsContainer = document.getElementById('compare-thumbnails');

    if (!dock || !badge || !thumbsContainer) return;

    if (state.compareList.length === 0) {
        dock.style.display = 'none';
        return;
    }

    dock.style.display = 'block';
    badge.innerText = `${state.compareList.length} / 4 Selected`;

    const comparedProps = state.compareList.map(mls => 
        state.allProperties.find(p => String(p.mls_id) === String(mls))
    ).filter(Boolean);

    thumbsContainer.innerHTML = comparedProps.map(p => {
        const img = escapeHtml(p.main_image_url || NO_PHOTO_IMG);
        return `
            <div class="compare-thumb-item" title="${escapeHtml(cleanDisplayAddress(p.address, p.mls_id))}">
                <img src="${img}" alt="${escapeHtml(cleanDisplayAddress(p.address, p.mls_id) || 'Property photo')}" referrerpolicy="no-referrer">
                <span class="compare-thumb-remove" onclick="window.handleToggleCompare('${p.mls_id}', event)"><i data-lucide="x"></i></span>
            </div>
        `;
    }).join('');
    if (window.lucide) window.lucide.createIcons();
}

export function openCompareMatrix() {
    const modal = document.getElementById('modal-compare-matrix');
    const body = document.getElementById('compare-matrix-body');
    if (!modal || !body) return;

    const props = state.compareList.map(mls => 
        state.allProperties.find(p => String(p.mls_id) === String(mls))
    ).filter(Boolean);

    if (props.length === 0) {
        showToast('Please select at least 1 property to compare', 'warning');
        return;
    }

    body.innerHTML = renderCompareTableHTML(props);
    // If market rates weren't loaded yet, re-render once they arrive so the monthly row fills in.
    if (getMarketRate('30yr') === null) {
        loadMortgageRates().then(() => {
            if (modal.classList.contains('active') && getMarketRate('30yr') !== null) {
                body.innerHTML = renderCompareTableHTML(props);
                if (window.lucide) window.lucide.createIcons();
            }
        });
    }
    if (window.lucide) window.lucide.createIcons();
    modal.classList.add('active');
}

export function closeCompareMatrix() {
    const modal = document.getElementById('modal-compare-matrix');
    if (modal) {
        modal.classList.remove('active');
    }
}

// Monthly-cost inputs live in the compare panel; remembered per browser.
const PAY_DEFAULTS = { downPct: 20, rate: null };
export function loadPaySettings() {
    try { return { ...PAY_DEFAULTS, ...JSON.parse(localStorage.getItem('dibs_compare_payment') || '{}') }; } catch (e) { return { ...PAY_DEFAULTS }; }
}
function savePaySettings(v) {
    try { localStorage.setItem('dibs_compare_payment', JSON.stringify(v)); } catch (e) {}
}
export function currentRate(settings) {
    const r = Number(settings.rate);
    return r > 0 ? r : getMarketRate('30yr');
}

/**
 * Principal & interest (30-yr) + taxes + HOA, per month. null when price or rate is unknown.
 * settings.downAmount (dollars, e.g. net proceeds from selling My Home) overrides settings.downPct.
 */
export function monthlyCost(p, settings) {
    const price = Number(p.price) || 0;
    const rate = currentRate(settings);
    if (!price || !rate) return null;
    const downAmount = Number(settings.downAmount);
    const loan = settings.downAmount != null && isFinite(downAmount)
        ? Math.max(0, price - Math.max(0, downAmount))
        : price * (1 - Math.min(100, Math.max(0, Number(settings.downPct) || 0)) / 100);
    const r = rate / 100 / 12, n = 360;
    const pi = loan > 0 ? loan * r / (1 - Math.pow(1 + r, -n)) : 0;
    const tax = (Number(p.annual_tax) || 0) / 12;
    const hoa = Number(p.hoa_fee) || 0;
    return { total: pi + tax + hoa, pi, tax, hoa };
}

function monthlyCellHtml(p, settings) {
    if (p.mls_id === HOME_ID) return homeMonthlyCellHtml();
    const m = monthlyCost(p, settings);
    if (!m) return '<span style="color:var(--text-muted);">Enter a rate</span>';
    const $ = v => '$' + Math.round(v).toLocaleString();
    return `<span style="font-weight:800;">${$(m.total)}/mo</span>
        <div class="compare-sub">${$(m.pi)} P&amp;I · ${m.tax ? $(m.tax) : '$0'} tax · ${m.hoa ? $(m.hoa) : '$0'} HOA</div>` + homeDeltaHtml(m.total, myHomeMonthly(pinnedHome())?.total ?? null, money, 'down', '/mo');
}

const raw = p => (p.raw_mls_json && typeof p.raw_mls_json === 'object') ? p.raw_mls_json : {};
const interior = p => raw(p).interior || {};
const money = v => '$' + Math.round(Number(v)).toLocaleString();
const na = '<span style="color:var(--text-muted);">N/A</span>';

function priceCellHtml(p) {
    const price = Number(p.price) || 0;
    const first = Number(p.original_price) || 0;
    let sub = '';
    if (first > price && price > 0) {
        const pct = ((first - price) / first * 100).toFixed(1);
        sub = `<div class="compare-sub" style="color:var(--accent-emerald);">was ${money(first)} · −${pct}%</div>`;
    } else if (p.price_drop && Number(p.price_drop.amount) > 0 && Number(p.price_drop.old_price) > 0) {
        sub = `<div class="compare-sub" style="color:var(--accent-emerald);">was ${money(p.price_drop.old_price)} · −${Number(p.price_drop.pct) || 0}%</div>`;
    }
    return `<span class="compare-prop-price font-serif">${money(price)}</span>${sub}`;
}

function compCellHtml(p) {
    const s = getCompScore(p);
    if (!s) return '<span style="color:var(--text-muted);">—</span>';
    return `<b>${s.score}/100</b><div class="compare-sub">value ${money(s.estimate)} · ${escapeHtml(s.pctText)}</div>`;
}

function bathsCellHtml(p) {
    const i = interior(p);
    const parts = [];
    if (i.baths_full !== undefined && i.baths_full !== null) parts.push(`${i.baths_full} full`);
    if (i.baths_3_4) parts.push(`${i.baths_3_4} ¾`);
    if (i.baths_1_2) parts.push(`${i.baths_1_2} half`);
    return `${p.beds ?? '—'} Beds | ${p.baths ?? '—'} Baths${parts.length ? `<div class="compare-sub">${escapeHtml(parts.join(' · '))}</div>` : ''}`;
}

function basementCellHtml(p) {
    const i = interior(p);
    const status = i.basement ? escapeHtml(String(i.basement)) : '';
    const tot = Number(i.sqft_below_grade_total) || 0;
    const fin = Number(i.sqft_below_grade_finished) || 0;
    const size = tot ? `${fin.toLocaleString()} of ${tot.toLocaleString()} sqft finished` : '';
    if (!status && !size) return na;
    return `${status || 'Basement'}${size ? `<div class="compare-sub">${size}</div>` : ''}`;
}

const REVIEW_LABELS = { favorite: '★ Favorite', possibility: '? Consideration', dislike: '✕ Disliked', none: 'Not reviewed' };
function reviewCellHtml(p) {
    const status = getPropertyReviewStatus(p);
    const note = String(p.user_notes || '').trim().split('\n')[0];
    const short = note.length > 90 ? note.slice(0, 88) + '…' : note;
    return `<b>${REVIEW_LABELS[status] || escapeHtml(status)}</b>${short ? `<div class="compare-sub" style="text-align:left;">${escapeHtml(short)}</div>` : ''}`;
}


// ---- My Home pinned column (js/myHome.js): shown first whenever the user has saved a home ----
const HOME_ID = '__my_home';
function pinnedHome() {
    const h = state.myHome;
    if (!h || !h.address || state.currentUserProfile?.role === 'realtor') return null;
    return h;
}
const n0 = v => (v === null || v === undefined || v === '' || isNaN(Number(v))) ? null : Number(v);
/** My Home shaped like a listing so the matrix's ordinary cell renderers work on it. */
function homeAsProperty(h) {
    return {
        mls_id: HOME_ID, address: h.address, city: h.city, state: h.state, zip: h.zip,
        main_image_url: h.main_image_url, price: n0(h.my_price) || 0, beds: h.beds, baths: h.baths,
        sqft_finished: n0(h.sqft_finished) || 0, sqft_total: h.sqft_total, levels: h.levels,
        lot_sqft: n0(h.lot_sqft) || 0, lot_acres: null, year_built: h.year_built,
        garage_spaces: h.garage_spaces, hoa_fee: n0(h.hoa_fee) || 0, annual_tax: n0(h.annual_tax) || 0,
        raw_mls_json: {},
    };
}
function homeMonthlyCellHtml() {
    const m = myHomeMonthly(pinnedHome());
    if (!m) return '<span style="color:var(--text-muted);">Add P&amp;I on My Home</span>';
    return `<span style="font-weight:800;">${money(m.total)}/mo</span>
        <div class="compare-sub">today: ${money(m.pi)} P&amp;I · ${money(m.tax)} tax · ${money(m.hoa)} HOA</div>`;
}
/** "+$20,000 vs My Home" line under a listing's value; '' when there is no home or no numbers. */
function homeDeltaHtml(value, homeValue, fmt, good, suffix = '') {
    if (!pinnedHome() || value === null || value === undefined || homeValue === null || homeValue === undefined) return '';
    const d = Number(value) - Number(homeValue);
    if (!isFinite(d)) return '';
    if (Math.abs(d) < 0.5) return '<div class="compare-sub compare-home-delta">same as My Home</div>';
    const cls = !good ? '' : ((d > 0) === (good === 'up') ? 'is-good' : 'is-bad');
    return `<div class="compare-sub compare-home-delta ${cls}">${d > 0 ? '+' : '−'}${fmt(Math.abs(d))}${suffix} vs My Home</div>`;
}
const lotOf = p => n0(p.lot_sqft) || (n0(p.lot_acres) ? Math.round(p.lot_acres * 43560) : null);
const intFmt = v => Math.round(v).toLocaleString();
// Per-row "difference from My Home" for listings: [getter, formatter, which direction is good, suffix]
const HOME_DELTAS = {
    'List Price': [p => n0(p.price) || null, money, null, ''],
    'Price / SqFt': [p => (n0(p.price) && n0(p.sqft_finished)) ? p.price / p.sqft_finished : null, money, 'down', '/sqft'],
    'Finished SqFt': [p => n0(p.sqft_finished) || null, intFmt, 'up', ' sqft'],
    'Lot Size': [lotOf, intFmt, 'up', ' sqft'],
    'Year Built': [p => n0(p.year_built), v => String(Math.round(v)), 'up', ' yrs'],
    'Garage & Parking': [p => n0(p.garage_spaces), intFmt, 'up', '-car'],
    'HOA Fee': [p => n0(p.hoa_fee) || 0, money, 'down', '/mo'],
    'Annual Taxes': [p => n0(p.annual_tax), money, 'down', '/yr'],
};
// Cells where My Home has its own content instead of the listing renderer.
const HOME_CELLS = {
    'List Price': h => {
        const s = myHomeSaleMath(h);
        return s.price ? `<span class="compare-prop-price font-serif">${money(s.price)}</span><div class="compare-sub">my price · nets ${money(s.net)}</div>` : '<span style="color:var(--text-muted);">Set my price</span>';
    },
    'Days on Market': () => '<span style="color:var(--text-muted);">Not listed</span>',
    'Price Score (Comps)': () => {
        const v = state.myHomeComps;
        return v && v.comp_estimate ? `<b>${money(v.comp_estimate)}</b><div class="compare-sub">RentCast value of my home</div>` : '<span style="color:var(--text-muted);">—</span>';
    },
    'Price / SqFt': h => (n0(h.my_price) && n0(h.sqft_finished)) ? `$${Math.round(h.my_price / h.sqft_finished)} / sqft` : na,
    'Basement': h => h.basement ? escapeHtml(h.basement) : na,
    'Garage & Parking': h => (h.garage_spaces || h.garage_notes) ? `${h.garage_spaces ? h.garage_spaces + '-car garage' : 'Garage'}${h.garage_notes ? `<div class="compare-sub">${escapeHtml(h.garage_notes)}</div>` : ''}` : na,
    'School District': () => na,
    'Your Review': () => '<b><i data-lucide="house" style="width:1em;height:1em;vertical-align:-0.15em;"></i> My Home</b>',
};
function cellHtml(m, p, home, homeProp) {
    if (p.mls_id === HOME_ID) return (HOME_CELLS[m.label] || m.render)(HOME_CELLS[m.label] ? home : p);
    let html = m.render(p);
    const d = home && HOME_DELTAS[m.label];
    if (d) html += homeDeltaHtml(d[0](p), d[0](homeProp), d[1], d[2], d[3]);
    return html;
}

function renderCompareTableHTML(props) {
    const home = pinnedHome();
    const homeProp = home ? homeAsProperty(home) : null;
    const columns = home ? [homeProp, ...props] : props;
    const pay = loadPaySettings();
    const metrics = [
        { label: 'Property Photo & Address', key: 'header' },
        { label: 'List Price', render: priceCellHtml },
        { label: 'Days on Market', render: p => { const d = getCardDaysOnMarket(p); return d === null || d === undefined ? na : `${d} days`; } },
        { label: 'Price Score (Comps)', render: compCellHtml },
        { label: 'Est. Monthly Cost', key: 'monthly', render: p => monthlyCellHtml(p, pay) },
        { label: 'Price / SqFt', render: p => p.sqft_finished ? `$${Math.round(p.price / p.sqft_finished)} / sqft` : na },
        { label: 'Beds / Baths', render: bathsCellHtml },
        { label: 'Finished SqFt', render: p => p.sqft_finished ? `${p.sqft_finished.toLocaleString()} sqft` : na },
        { label: 'Basement', render: basementCellHtml },
        { label: 'Style / Levels', render: p => p.levels ? escapeHtml(p.levels) : na },
        { label: 'Lot Size', render: p => p.lot_acres ? `${p.lot_acres} Acres` : (p.lot_sqft ? `${p.lot_sqft.toLocaleString()} sqft` : na) },
        { label: 'Year Built', render: p => p.year_built || na },
        { label: 'Garage & Parking', render: p => (p.garage_spaces || p.parking_total) ? `${p.garage_spaces ? p.garage_spaces + '-car garage' : 'No garage listed'}${p.parking_total ? `<div class="compare-sub">${p.parking_total} total parking</div>` : ''}` : na },
        { label: 'HOA Fee', render: p => p.hoa_fee ? `$${Number(p.hoa_fee).toLocaleString()}/mo` : '<span style="color:#4F7A46;">No HOA</span>' },
        { label: 'Annual Taxes', render: p => p.annual_tax ? `$${p.annual_tax.toLocaleString()}/yr` : na },
        { label: 'School District', render: p => p.school_district ? escapeHtml(p.school_district) : na },
        { label: 'Your Review', render: reviewCellHtml }
    ];

    const rateVal = Number(pay.rate) > 0 ? pay.rate : '';
    const market = getMarketRate('30yr');
    const paymentBar = `
        <div class="compare-pay-bar" id="compare-pay-bar">
            <span class="compare-pay-title"><i data-lucide="calculator"></i> Monthly cost assumptions</span>
            <label>Down payment <input type="number" id="compare-pay-down" min="0" max="100" step="0.5" value="${Number(pay.downPct)}"> %</label>
            <label>Rate <input type="number" id="compare-pay-rate" min="0" max="20" step="0.001" value="${rateVal}" placeholder="${market ? market.toFixed(2) : 'e.g. 6.25'}"> %</label>
            <span class="compare-pay-note">${market ? `Blank rate = today's 30-yr market (${market.toFixed(2)}%).` : 'Market rate not loaded; enter a rate.'} 30-yr fixed; excludes insurance &amp; PMI.</span>
        </div>`;

    const bannerHtml = `
        <div class="matrix-info-banner modal-matrix-banner">
            <div class="matrix-info-header">
                <div class="matrix-info-title">
                    <span><i data-lucide="scale"></i> Custom Property Comparison</span>
                </div>
                <span class="badge-gold">${props.length} / 4 Selected</span>
            </div>
            <div class="matrix-info-grid">
                <div class="matrix-info-item">
                    <span><i data-lucide="pin"></i></span>
                    <div>
                        <strong>Custom Selection:</strong> Comparing the <strong>${props.length}</strong> specific property listing(s) you added to your comparison dock via <strong>+ Compare</strong>.
                    </div>
                </div>
            </div>
        </div>
    `;

    return `
        ${bannerHtml}
        ${paymentBar}
        <table class="compare-table">
            <thead>
                <tr>
                    <th class="metric-col">Feature</th>
                    ${columns.map(p => {
                        const img = escapeHtml(p.main_image_url || NO_PHOTO_IMG);
                        const addr = p.mls_id === HOME_ID ? (p.address || 'My Home') : cleanDisplayAddress(p.address, p.mls_id);
                        return `
                            <th class="prop-col${p.mls_id === HOME_ID ? ' compare-home-col' : ''}">
                                ${p.mls_id === HOME_ID ? '<span class="compare-home-tag"><i data-lucide="house"></i> My Home</span>' : ''}
                                <div class="compare-prop-card">
                                    <img src="${img}" class="compare-prop-img" alt="${escapeHtml(addr || 'Property photo')}">
                                    <div style="font-weight:700; font-size:0.95rem;">${escapeHtml(addr)}</div>
                                    <div style="font-size:0.8rem; color:var(--text-muted);">${escapeHtml(p.city || '')}, ${escapeHtml(p.state || '')} ${escapeHtml(p.zip || '')}</div>
                                </div>
                            </th>
                        `;
                    }).join('')}
                </tr>
            </thead>
            <tbody>
                ${metrics.slice(1).map(m => `
                    <tr>
                        <td class="metric-col">${escapeHtml(m.label)}</td>
                        ${columns.map(p => `
                            <td style="text-align:center;"${p.mls_id === HOME_ID ? ' class="compare-home-col"' : ''}${m.key === 'monthly' ? ` data-monthly-mls="${escapeHtml(String(p.mls_id))}"` : ''}>${cellHtml(m, p, home, homeProp)}</td>
                        `).join('')}
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

// Down payment / rate edits recompute just the monthly-cost row.
document.addEventListener('input', ev => {
    if (ev.target.id !== 'compare-pay-down' && ev.target.id !== 'compare-pay-rate') return;
    const down = document.getElementById('compare-pay-down');
    const rate = document.getElementById('compare-pay-rate');
    const settings = { downPct: Number(down?.value) || 0, rate: rate && rate.value !== '' ? Number(rate.value) : null };
    savePaySettings(settings);
    document.querySelectorAll('[data-monthly-mls]').forEach(td => {
        if (td.dataset.monthlyMls === HOME_ID) return; // the home's monthly is its actual loan, not these assumptions
        const p = state.allProperties.find(x => String(x.mls_id) === td.dataset.monthlyMls);
        if (p) td.innerHTML = monthlyCellHtml(p, settings);
    });
});

// Global hook for inline onclicks
window.handleToggleCompare = toggleCompare;
