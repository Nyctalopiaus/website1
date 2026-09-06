/**
 * MLS & Redfin Property Scout - "Top Picks" Recommendation Modal
 * Deterministic, client-side scoring over whichever properties the user checks in the
 * selection panel - no LLM call, no backend endpoint, no API key. Reproduces the kind of
 * analysis Josh got by pasting a favorites CSV into an LLM ($/sqft, lot size, days-on-market
 * negotiation leverage, HOA overhead, price vs. Redfin estimate), generated from percentile
 * comparisons within the selected set rather than model-generated prose.
 *
 * Enhanced with transparency: per-metric score breakdowns, customizable weight profiles,
 * group benchmarks, balanced pros/cons, situational badges, and side-by-side comparison matrix.
 */
import { state, elements } from './state.js';
import { getPropertyReviewStatus, cleanDisplayAddress, escapeHtml, NO_PHOTO_IMG } from './properties.js';
import { showToast } from './toast.js';

export const WEIGHT_PROFILES = {
    balanced: {
        label: 'Balanced Default',
        desc: 'Balanced mix: Price/SqFt (35%), Lot size (20%), Days on Market (20%), HOA (15%), Redfin Est (10%)',
        weights: { ppsqft: 0.35, lotAcres: 0.20, domDays: 0.20, hoaFee: 0.15, redfinDeltaPct: 0.10 }
    },
    negotiation: {
        label: '🔥 High Leverage Negotiation',
        desc: 'Identifies listings with longest Days on Market for aggressive price negotiation',
        weights: { domDays: 0.60, ppsqft: 0.25, redfinDeltaPct: 0.15, hoaFee: 0.00, lotAcres: 0.00 }
    },
    appraisal: {
        label: '⚖️ Low Appraisal Risk',
        desc: 'Prioritizes properties priced farthest under Redfin valuation estimate',
        weights: { redfinDeltaPct: 0.55, ppsqft: 0.30, domDays: 0.15, hoaFee: 0.00, lotAcres: 0.00 }
    },
    value: {
        label: 'Value Hunter',
        desc: 'Focuses heavily on price per sqft and discount relative to Redfin valuation estimate',
        weights: { ppsqft: 0.50, redfinDeltaPct: 0.25, domDays: 0.15, hoaFee: 0.10, lotAcres: 0.00 }
    },
    overhead: {
        label: 'Low Overhead',
        desc: 'Prioritizes properties with minimal monthly HOA fees and efficient price per sqft',
        weights: { hoaFee: 0.45, ppsqft: 0.35, redfinDeltaPct: 0.20, lotAcres: 0.00, domDays: 0.00 }
    },
    land: {
        label: 'Max Land & Space',
        desc: 'Focuses primarily on lot size in acres and finished living space',
        weights: { lotAcres: 0.50, ppsqft: 0.30, domDays: 0.20, hoaFee: 0.00, redfinDeltaPct: 0.00 }
    }
};

const METRIC_DEFS = {
    ppsqft: {
        name: 'Price / SqFt',
        direction: -1, // lower is better
        formatVal: (v) => `${fmtMoney(v)}/sqft`,
        best: (v, avg) => `Lowest price per sqft in set (${fmtMoney(v)}/sqft vs. ${fmtMoney(avg)} avg)`,
        good: (v, avg) => `Well below avg price per sqft (${fmtMoney(v)}/sqft vs. ${fmtMoney(avg)} avg)`,
        worst: (v, avg) => `Highest price per sqft in set (${fmtMoney(v)}/sqft vs. ${fmtMoney(avg)} avg)`,
        weak: (v, avg) => `Higher than average price per sqft (${fmtMoney(v)}/sqft vs. ${fmtMoney(avg)} avg)`
    },
    lotAcres: {
        name: 'Lot Size (Acres)',
        direction: 1, // higher is better
        formatVal: (v) => `${v.toFixed(2)} acres`,
        best: (v, avg) => `Largest lot size in set (${v.toFixed(2)} acres vs. ${avg.toFixed(2)} acre avg)`,
        good: (v, avg) => `Above-average lot size (${v.toFixed(2)} acres vs. ${avg.toFixed(2)} acre avg)`,
        worst: (v, avg) => `Smallest lot size in set (${v.toFixed(2)} acres vs. ${avg.toFixed(2)} acre avg)`,
        weak: (v, avg) => `Below-average lot size (${v.toFixed(2)} acres vs. ${avg.toFixed(2)} acre avg)`
    },
    domDays: {
        name: 'Days on Market',
        direction: 1, // higher = more negotiation leverage
        formatVal: (v) => `${Math.round(v)} days`,
        best: (v, avg) => `${Math.round(v)} days on market - longest in set, prime negotiation leverage`,
        good: (v, avg) => `${Math.round(v)} days on market (above ${Math.round(avg)}-day group avg) - room to negotiate`,
        worst: (v, avg) => `Only ${Math.round(v)} days on market - fresh listing with least negotiating leverage`,
        weak: (v, avg) => `Fresh listing (${Math.round(v)} days on market) - seller leverage high`
    },
    hoaFee: {
        name: 'HOA Monthly Fee',
        direction: -1, // lower is better
        formatVal: (v) => v > 0 ? `${fmtMoney(v)}/mo` : '$0 (No HOA)',
        best: (v, avg) => v > 0 ? `Lowest HOA fee in set (${fmtMoney(v)}/mo vs. ${fmtMoney(avg)} avg)` : `Zero HOA fee - no recurring association overhead`,
        good: (v, avg) => `Below-average HOA fee (${fmtMoney(v)}/mo vs. ${fmtMoney(avg)} avg)`,
        worst: (v, avg) => `Highest HOA fee in set (${fmtMoney(v)}/mo vs. ${fmtMoney(avg)} avg)`,
        weak: (v, avg) => `Above-average HOA overhead (${fmtMoney(v)}/mo vs. ${fmtMoney(avg)} avg)`
    },
    redfinDeltaPct: {
        name: 'Redfin Est. Gap',
        direction: -1, // more negative (under estimate) is better
        formatVal: (v) => `${Math.abs(v).toFixed(1)}% ${v < 0 ? 'under' : 'over'}`,
        best: (v) => `Priced ${Math.abs(v).toFixed(1)}% ${v < 0 ? 'under' : 'over'} Redfin's estimate - best value gap`,
        good: (v) => `Priced ${Math.abs(v).toFixed(1)}% ${v < 0 ? 'under' : 'over'} Redfin's estimate`,
        worst: (v) => `Priced ${Math.abs(v).toFixed(1)}% ${v < 0 ? 'under' : 'over'} Redfin's estimate - highest markup vs estimate`,
        weak: (v) => `Priced ${Math.abs(v).toFixed(1)}% ${v < 0 ? 'under' : 'over'} Redfin's estimate`
    }
};

const BEST_THRESHOLD = 0.999;
const GOOD_THRESHOLD = 0.65;
const WEAK_THRESHOLD = 0.35;

let selectedIds = new Set();
let hasInitializedSelection = false;
let lastRanking = null;
let currentProfileKey = 'balanced';
let currentViewMode = 'cards'; // 'cards' | 'table'

function fmtMoney(v) {
    if (v === null || v === undefined || isNaN(v)) return 'N/A';
    return '$' + Math.round(v).toLocaleString();
}

function eligibleProperties() {
    return state.allProperties.filter(p => p && p.mls_id && p.price);
}

function defaultSelectionIds() {
    if (state.activeView === 'realtor' && window.getRealtorActiveClientData) {
        const clientData = window.getRealtorActiveClientData();
        if (clientData && clientData.matrix) {
            const loved = clientData.matrix.loved || [];
            const shortlisted = clientData.matrix.shortlisted || [];
            const combined = [...loved, ...shortlisted];
            if (combined.length > 0) {
                return combined.map(p => p.mls_id);
            }
        }
    }
    return eligibleProperties()
        .filter(p => getPropertyReviewStatus(p) === 'favorite')
        .map(p => p.mls_id);
}

function getMetrics(p) {
    const sqft = p.sqft_finished || p.sqft_total || 0;
    const ppsqft = p.price_per_sqft || (sqft ? p.price / sqft : null);

    let lotAcres = null;
    if (p.lot_sqft) {
        lotAcres = p.lot_sqft / 43560;
    } else if (p.lot_acres > 0 && p.lot_acres <= 15) {
        lotAcres = p.lot_acres;
    }

    let domDays = null;
    if (p.list_date) {
        const listed = new Date(p.list_date);
        if (!isNaN(listed.getTime())) {
            domDays = Math.max(0, Math.round((Date.now() - listed.getTime()) / 86400000));
        }
    }
    if (domDays === null && p.days_on_redfin) domDays = p.days_on_redfin;

    const hoaFee = (typeof p.hoa_fee === 'number') ? p.hoa_fee : null;
    const redfinDeltaPct = p.redfin_estimate ? ((p.price - p.redfin_estimate) / p.redfin_estimate) * 100 : null;

    return { ppsqft, lotAcres, domDays, hoaFee, redfinDeltaPct };
}

function isUsable(v) {
    return v !== null && v !== undefined && !isNaN(v);
}

/** Builds min/max/avg per metric across the values present in this selected set. */
function buildRanges(properties, metricsById) {
    const ranges = {};
    Object.keys(METRIC_DEFS).forEach(key => {
        const values = properties
            .map(p => metricsById.get(p.mls_id)[key])
            .filter(isUsable);
        if (!values.length) {
            ranges[key] = null;
            return;
        }
        const min = Math.min(...values);
        const max = Math.max(...values);
        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        ranges[key] = { min, max, avg, hasSpread: max !== min, count: values.length };
    });
    return ranges;
}

/** Computes average benchmark statistics for the group */
function computeGroupBenchmarks(properties, metricsById) {
    const totalProps = properties.length;
    const totalPrice = properties.reduce((sum, p) => sum + (p.price || 0), 0);
    const avgPrice = totalProps > 0 ? totalPrice / totalProps : 0;

    const ranges = buildRanges(properties, metricsById);
    return {
        count: totalProps,
        avgPrice,
        avgPpsqft: ranges.ppsqft ? ranges.ppsqft.avg : null,
        avgLot: ranges.lotAcres ? ranges.lotAcres.avg : null,
        avgDom: ranges.domDays ? ranges.domDays.avg : null,
        avgHoa: ranges.hoaFee ? ranges.hoaFee.avg : null
    };
}

function buildProsAndCons(metrics, percentiles, ranges) {
    const strengths = [];
    const drawbacks = [];

    Object.keys(METRIC_DEFS).forEach(key => {
        const range = ranges[key];
        const norm = percentiles[key];
        const val = metrics[key];
        if (!range || !range.hasSpread || !isUsable(norm) || !isUsable(val)) return;
        const def = METRIC_DEFS[key];

        if (norm >= BEST_THRESHOLD) {
            strengths.push({ priority: norm + 1, text: def.best(val, range.avg) });
        } else if (norm >= GOOD_THRESHOLD) {
            strengths.push({ priority: norm, text: def.good(val, range.avg) });
        } else if (norm <= (1 - BEST_THRESHOLD)) {
            drawbacks.push({ priority: 1 - norm + 1, text: def.worst(val, range.avg) });
        } else if (norm <= WEAK_THRESHOLD) {
            drawbacks.push({ priority: 1 - norm, text: def.weak(val, range.avg) });
        }
    });

    strengths.sort((a, b) => b.priority - a.priority);
    drawbacks.sort((a, b) => b.priority - a.priority);

    return {
        strengths: strengths.slice(0, 3).map(s => s.text),
        drawbacks: drawbacks.slice(0, 2).map(d => d.text)
    };
}

/** Determines situational badge for property based on standouts */
function getSituationalBadge(entry, rankNum) {
    if (rankNum === 1) return { icon: '<i data-lucide="crown"></i>', label: '#1 Top Pick', class: 'situational-badge-top' };

    const { percentiles } = entry;
    if (percentiles.ppsqft >= GOOD_THRESHOLD || percentiles.redfinDeltaPct >= GOOD_THRESHOLD) {
        return { icon: '<i data-lucide="tag"></i>', label: 'Best Value', class: '' };
    }
    if (percentiles.domDays >= GOOD_THRESHOLD) {
        return { icon: '<i data-lucide="handshake"></i>', label: 'Negotiation Target', class: '' };
    }
    if (percentiles.hoaFee >= BEST_THRESHOLD) {
        return { icon: '<i data-lucide="trending-down"></i>', label: 'Lowest Overhead', class: '' };
    }
    if (percentiles.lotAcres >= GOOD_THRESHOLD) {
        return { icon: '<i data-lucide="trees"></i>', label: 'Max Acreage', class: '' };
    }
    return null;
}

/** Scores + ranks `properties` against each other based on active weight profile. */
function computeRanking(properties, profileKey = 'balanced') {
    const activeProfile = WEIGHT_PROFILES[profileKey] || WEIGHT_PROFILES.balanced;
    const weightsConfig = activeProfile.weights;

    const metricsById = new Map();
    properties.forEach(p => metricsById.set(p.mls_id, getMetrics(p)));
    const ranges = buildRanges(properties, metricsById);
    const benchmarks = computeGroupBenchmarks(properties, metricsById);

    const totalActiveMetrics = Object.values(weightsConfig).filter(w => w > 0).length;

    const scored = properties.map(p => {
        const metrics = metricsById.get(p.mls_id);
        const percentiles = {};
        const breakdown = [];
        let weightedSum = 0;
        let weightTotal = 0;
        let availableMetricsCount = 0;

        Object.entries(METRIC_DEFS).forEach(([key, def]) => {
            const weight = weightsConfig[key] || 0;
            const range = ranges[key];
            const val = metrics[key];
            const isAvailable = range !== null && isUsable(val);

            let norm = 0;
            if (isAvailable) {
                availableMetricsCount++;
                if (!range.hasSpread) {
                    norm = 1;
                } else {
                    norm = (val - range.min) / (range.max - range.min);
                    if (def.direction === -1) norm = 1 - norm;
                }
                if (weight > 0) {
                    weightedSum += norm * weight;
                    weightTotal += weight;
                }
            }

            percentiles[key] = norm;
            breakdown.push({
                key,
                name: def.name,
                weight,
                weightPct: Math.round(weight * 100),
                rawVal: val,
                formattedVal: isAvailable ? def.formatVal(val) : 'N/A',
                normScore: Math.round(norm * 100),
                isAvailable
            });
        });

        const score = weightTotal > 0 ? weightedSum / weightTotal : 0;
        const { strengths, drawbacks } = buildProsAndCons(metrics, percentiles, ranges);

        return {
            property: p,
            metrics,
            percentiles,
            score,
            breakdown,
            strengths,
            drawbacks,
            availableMetricsCount,
            totalActiveMetrics
        };
    });

    scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const ra = a.property.rating || 0, rb = b.property.rating || 0;
        if (rb !== ra) return rb - ra;
        return a.property.price - b.property.price;
    });

    return { scored, ranges, benchmarks, profileKey, profile: activeProfile };
}

// --- Selection Panel ---

let activePreset = null; // 'favorites' | 'possibilities' | 'none' | null

function updatePresetButtonUI() {
    const btnFav = elements.btnRecommendSelectFavorites;
    const btnPoss = elements.btnRecommendSelectPossibilities;
    const btnNone = elements.btnRecommendSelectNone;
    const isRealtor = state.activeView === 'realtor';

    const favCount = eligibleProperties().filter(p => getPropertyReviewStatus(p) === 'favorite').length;
    const possCount = eligibleProperties().filter(p => getPropertyReviewStatus(p) === 'possibility').length;

    if (btnFav) {
        const favLabel = isRealtor ? `❤️ Loved (${favCount})` : `⭐ Favorites (${favCount})`;
        btnFav.innerHTML = activePreset === 'favorites' ? `<i data-lucide="check-circle-2"></i> ${favLabel}` : `<i data-lucide="star"></i> ${favLabel}`;
        btnFav.classList.toggle('btn-preset-active', activePreset === 'favorites');
    }

    if (btnPoss) {
        const possLabel = isRealtor ? `+ ⭐ Shortlisted (+${possCount})` : `+ ❓ Possibilities (+${possCount})`;
        btnPoss.innerHTML = (activePreset === 'possibilities') ? `<i data-lucide="check-circle-2"></i> ${possLabel}` : `<i data-lucide="circle-help"></i> ${possLabel}`;
        btnPoss.classList.toggle('btn-preset-active', activePreset === 'possibilities');
    }

    if (btnNone) {
        btnNone.innerHTML = `<i data-lucide="trash-2"></i> Clear (${selectedIds.size})`;
        btnNone.classList.toggle('btn-preset-active', activePreset === 'none');
    }

    if (window.lucide) window.lucide.createIcons();
}

function renderSelectionPanel() {
    if (!elements.recommendPickList) return;
    const props = eligibleProperties().sort((a, b) => (b.favorite - a.favorite) || (a.price - b.price));

    if (!props.length) {
        elements.recommendPickList.innerHTML = `<div style="padding:1.5rem; text-align:center; color:var(--text-muted);">No properties in your database yet.</div>`;
    } else {
        elements.recommendPickList.innerHTML = props.map(p => {
            const checked = selectedIds.has(p.mls_id);
            const rev = getPropertyReviewStatus(p);
            const badge = rev === 'favorite' ? '<i data-lucide="heart" style="color:var(--accent-red)"></i> ' : rev === 'possibility' ? '<i data-lucide="star" style="color:var(--accent-gold)"></i> ' : '';
            const thumb = escapeHtml(p.main_image_url || NO_PHOTO_IMG);
            return `
            <label class="pick-row ${checked ? 'pick-row-checked' : ''}">
                <input type="checkbox" data-mls="${p.mls_id}" ${checked ? 'checked' : ''} onchange="toggleRecommendPick('${p.mls_id}', this.checked)">
                <img src="${thumb}" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${NO_PHOTO_IMG}';" class="pick-row-thumb" alt="${escapeHtml(cleanDisplayAddress(p.address, p.mls_id) || 'Property photo')}">
                <div class="pick-row-info">
                    <div class="pick-row-addr">${badge}${escapeHtml(cleanDisplayAddress(p.address, p.mls_id))}</div>
                    <div class="pick-row-sub">${escapeHtml(p.city || '')}, ${escapeHtml(p.state || 'CO')} &middot; $${p.price.toLocaleString()} &middot; ${p.beds || 0}bd/${p.baths || 0}ba</div>
                </div>
            </label>`;
        }).join('');
        if (window.lucide) window.lucide.createIcons();
    }
    updatePresetButtonUI();
    updateSelectHint();
}

function updateSelectHint() {
    if (!elements.recommendSelectHint) return;
    const n = selectedIds.size;
    elements.recommendSelectHint.textContent =
        n === 0 ? 'Select at least 2 properties to compare.' :
        n === 1 ? 'Select 1 more property - need at least 2 to compare.' :
        `${n} selected - ready to rank.`;
    if (elements.btnRecommendRank) elements.btnRecommendRank.disabled = n < 2;
}

window.toggleRecommendPick = function(mlsId, checked) {
    if (checked) selectedIds.add(mlsId); else selectedIds.delete(mlsId);
    activePreset = null;
    const row = document.querySelector(`input[data-mls="${mlsId}"]`)?.closest('.pick-row');
    if (row) row.classList.toggle('pick-row-checked', checked);
    updatePresetButtonUI();
    updateSelectHint();
};

export function selectRecommendFavorites() {
    const favs = eligibleProperties().filter(p => getPropertyReviewStatus(p) === 'favorite').map(p => p.mls_id);
    selectedIds = new Set(favs);
    activePreset = 'favorites';
    renderSelectionPanel();
    const label = state.activeView === 'realtor' ? 'Loved' : 'Favorite';
    showToast(`✓ Selected ${favs.length} ${label} properties`, 'info');
}

export function selectRecommendAddPossibilities() {
    const poss = eligibleProperties().filter(p => getPropertyReviewStatus(p) === 'possibility').map(p => p.mls_id);
    poss.forEach(id => selectedIds.add(id));
    activePreset = 'possibilities';
    renderSelectionPanel();
    const label = state.activeView === 'realtor' ? 'Shortlisted' : 'Possibility';
    showToast(`✓ Included ${poss.length} ${label} properties (Total: ${selectedIds.size})`, 'info');
}

export function selectRecommendNone() {
    selectedIds = new Set();
    activePreset = 'none';
    renderSelectionPanel();
    showToast('Cleared property selection', 'info');
}

// --- Results Panel ---

window.switchRecommendProfile = function(profileKey) {
    if (!WEIGHT_PROFILES[profileKey]) return;
    currentProfileKey = profileKey;
    if (selectedIds.size >= 2) {
        rankRecommendSelection();
    }
};

window.switchRecommendViewMode = function(viewMode) {
    currentViewMode = viewMode;
    if (lastRanking) {
        renderResultsPanel(lastRanking);
    }
};

window.toggleScoreBreakdown = function(mlsId) {
    const el = document.getElementById(`breakdown-${mlsId}`);
    if (el) {
        el.style.display = el.style.display === 'none' ? 'flex' : 'none';
    }
};

function renderGroupBenchmarkBar(benchmarks) {
    return `
    <div class="recommend-benchmark-bar">
        <div class="benchmark-item"><strong>Comparison Benchmark (${benchmarks.count} Homes):</strong></div>
        <div class="benchmark-item">Avg Price: <strong>${fmtMoney(benchmarks.avgPrice)}</strong></div>
        <div class="benchmark-item">Avg $/SqFt: <strong>${fmtMoney(benchmarks.avgPpsqft)}/sqft</strong></div>
        <div class="benchmark-item">Avg Lot: <strong>${benchmarks.avgLot ? benchmarks.avgLot.toFixed(2) + ' acres' : 'N/A'}</strong></div>
        <div class="benchmark-item">Avg DOM: <strong>${benchmarks.avgDom ? Math.round(benchmarks.avgDom) + ' days' : 'N/A'}</strong></div>
        <div class="benchmark-item">Avg HOA: <strong>${fmtMoney(benchmarks.avgHoa)}/mo</strong></div>
    </div>`;
}

const PROFILE_ICONS = {
    balanced: 'scale',
    value: 'dollar-sign',
    overhead: 'trending-down',
    negotiation: 'handshake',
    land: 'trees'
};

function renderControlsRow() {
    return `
    <div class="recommend-controls-row">
        <div class="recommend-presets-bar">
            <span class="preset-label">Scoring Profile:</span>
            ${Object.entries(WEIGHT_PROFILES).map(([key, prof]) => `
                <button type="button" class="preset-pill ${key === currentProfileKey ? 'active' : ''}" onclick="switchRecommendProfile('${key}')" title="${escapeHtml(prof.desc)}">
                    <i data-lucide="${PROFILE_ICONS[key] || 'circle'}"></i> ${prof.label}
                </button>
            `).join('')}
        </div>
        <div class="recommend-view-toggle">
            <button type="button" class="view-pill ${currentViewMode === 'cards' ? 'active' : ''}" onclick="switchRecommendViewMode('cards')"><i data-lucide="layout-grid"></i> Cards</button>
            <button type="button" class="view-pill ${currentViewMode === 'table' ? 'active' : ''}" onclick="switchRecommendViewMode('table')"><i data-lucide="table"></i> Matrix</button>
        </div>
    </div>`;
}

function renderCardView(ranking) {
    return ranking.scored.map((entry, idx) => {
        const p = entry.property;
        const rankNum = idx + 1;
        const crown = rankNum === 1 ? '<i data-lucide="crown"></i> ' : '';
        const sqft = p.sqft_finished || p.sqft_total || 0;
        const badge = getSituationalBadge(entry, rankNum);
        const scoreInt = Math.round(entry.score * 100);

        const badgeHtml = badge ? `<span class="situational-badge ${badge.class}">${badge.icon} ${badge.label}</span>` : '';
        const dataNote = entry.availableMetricsCount < 5 ? `<div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">Scored on ${entry.availableMetricsCount} of 5 metrics</div>` : '';

        const strengthsHtml = entry.strengths.length ? `
            <div class="rank-strengths-title"><i data-lucide="circle" style="fill:currentColor;color:var(--badge-active)"></i> Top Strengths</div>
            <ul class="rank-why rank-bullets-green">${entry.strengths.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ul>
        ` : '';

        const drawbacksHtml = entry.drawbacks.length ? `
            <div class="rank-drawbacks-title"><i data-lucide="circle" style="fill:currentColor;color:var(--accent-red)"></i> Watch Out Items</div>
            <ul class="rank-why rank-bullets-red">${entry.drawbacks.map(d => `<li>${escapeHtml(d)}</li>`).join('')}</ul>
        ` : '';

        const breakdownRows = entry.breakdown.map(b => `
            <div class="breakdown-row">
                <div class="breakdown-row-header">
                    <span>${escapeHtml(b.name)} ${b.weight > 0 ? `(${b.weightPct}%)` : '(0%)'}</span>
                    <strong>${b.formattedVal} &middot; Score: ${b.isAvailable ? b.normScore + '/100' : 'N/A'}</strong>
                </div>
                <div class="breakdown-bar-bg">
                    <div class="breakdown-bar-fill" style="width: ${b.isAvailable ? b.normScore : 0}%;"></div>
                </div>
            </div>
        `).join('');

        return `
        <div class="rank-card ${rankNum === 1 ? 'rank-card-top' : ''}">
            <div class="rank-card-num">${crown}#${rankNum}</div>
            <div class="rank-card-body">
                <div class="rank-card-header">
                    <div>
                        <div class="rank-card-addr">${escapeHtml(cleanDisplayAddress(p.address, p.mls_id))}${badgeHtml}</div>
                        <div class="rank-card-sub">${escapeHtml(p.city || '')}, ${escapeHtml(p.state || 'CO')} &middot; $${p.price.toLocaleString()} &middot; ${p.beds || 0}bd/${p.baths || 0}ba &middot; ${sqft.toLocaleString()} sqft</div>
                        ${dataNote}
                    </div>
                    <span class="score-badge score-badge-interactive" onclick="toggleScoreBreakdown('${p.mls_id}')" title="Click to expand full score breakdown">${scoreInt}/100 ▾</span>
                </div>

                            <div id="breakdown-${p.mls_id}" class="rank-card-breakdown" style="display:none;">
                    <div style="font-weight:700; color:var(--accent-gold); font-size:0.8rem; margin-bottom:0.25rem;"><i data-lucide="search"></i> Score Calculation Breakdown (${ranking.profile.label})</div>
                    ${breakdownRows}
                </div>

                <button type="button" class="btn btn-secondary" style="padding:0.35rem 0.85rem; font-size:0.8rem; align-self:flex-start; margin-top:0.25rem;" onclick="closeRecommendModal(); openDetailModal('${p.mls_id}')">View Full Details</button>
            </div>
        </div>`;
    }).join('');
}

function renderSideBySideMatrix(ranking) {
    const benchmarkRow = `
        <tr>
            <th>Group Benchmark</th>
            <th>-</th>
            <th>${fmtMoney(ranking.benchmarks.avgPpsqft)}/sqft</th>
            <th>${ranking.benchmarks.avgLot ? ranking.benchmarks.avgLot.toFixed(2) + ' ac' : 'N/A'}</th>
            <th>${ranking.benchmarks.avgDom ? Math.round(ranking.benchmarks.avgDom) + ' days' : 'N/A'}</th>
            <th>${fmtMoney(ranking.benchmarks.avgHoa)}/mo</th>
            <th>-</th>
        </tr>`;

    const rows = ranking.scored.map((entry, idx) => {
        const p = entry.property;
        const rankNum = idx + 1;
        const badge = getSituationalBadge(entry, rankNum);
        const crown = rankNum === 1 ? '<i data-lucide="crown"></i> ' : '';
        const badgeStr = badge ? ` (${badge.label})` : '';

        return `
        <tr>
            <td>
                <strong>${crown}#${rankNum}${badgeStr}</strong><br>
                <span style="font-size:0.8rem; color:var(--text-muted); cursor:pointer; text-decoration:underline;" onclick="closeRecommendModal(); openDetailModal('${p.mls_id}')" title="Click to view full details">${escapeHtml(cleanDisplayAddress(p.address, p.mls_id))}</span>
            </td>
            <td><strong>$${p.price.toLocaleString()}</strong></td>
            <td>${METRIC_DEFS.ppsqft.formatVal(entry.metrics.ppsqft)}</td>
            <td>${METRIC_DEFS.lotAcres.formatVal(entry.metrics.lotAcres)}</td>
            <td>${METRIC_DEFS.domDays.formatVal(entry.metrics.domDays)}</td>
            <td>${METRIC_DEFS.hoaFee.formatVal(entry.metrics.hoaFee)}</td>
            <td><strong style="color:var(--accent-gold);">${Math.round(entry.score * 100)}/100</strong></td>
        </tr>`;
    }).join('');

    return `
    <div class="recommend-table-wrapper">
        <table class="recommend-table">
            <thead>
                <tr>
                    <th>Property</th>
                    <th>Price</th>
                    <th>Price / SqFt</th>
                    <th>Lot Size</th>
                    <th>Days on Market</th>
                    <th>HOA Fee</th>
                    <th>Composite Score</th>
                </tr>
            </thead>
            <tbody>
                ${benchmarkRow}
                ${rows}
            </tbody>
        </table>
    </div>`;
}

function renderResultsPanel(ranking) {
    if (!elements.recommendResultsBody) return;

    const benchmarkHtml = renderGroupBenchmarkBar(ranking.benchmarks);
    const controlsHtml = renderControlsRow();

    const isRealtorView = state.activeView === 'realtor';
    const realtorActionBar = isRealtorView ? `
        <div style="background: rgba(217, 164, 65, 0.1); border: 1px solid var(--accent-gold); border-radius: var(--radius-sm); padding: 0.75rem 1rem; margin-bottom: 1rem; display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap;">
            <div style="font-weight: 700; font-size: 0.88rem; color: var(--accent-gold); display: flex; align-items: center; gap: 0.35rem;">
                <i data-lucide="briefcase"></i> Realtor Action Suite:
            </div>
            <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                <button type="button" class="btn btn-emerald btn-sm" onclick="window.transferRankedToTour()"><i data-lucide="map-pin"></i> Build Showing Tour from Top Picks</button>
                <button type="button" class="btn btn-gold btn-sm" onclick="window.saveRankedPicksAsPlaylist()"><i data-lucide="music"></i> Save Top Picks as Client Playlist</button>
            </div>
        </div>
    ` : '';

    let mainContentHtml = '';
    if (currentViewMode === 'cards') {
        mainContentHtml = `<div class="rank-card-list">${renderCardView(ranking)}</div>`;
    } else {
        mainContentHtml = renderSideBySideMatrix(ranking);
    }

    elements.recommendResultsBody.innerHTML = `
        ${benchmarkHtml}
        ${realtorActionBar}
        ${controlsHtml}
        <div class="modal-section-title"><i data-lucide="trophy"></i> Top Picks Ranking (${ranking.profile.label})</div>
        ${mainContentHtml}
    `;
    if (window.lucide) window.lucide.createIcons();
}

function buildRankingText(ranking) {
    const lines = [
        `Top Picks - Scout Ranking (${ranking.profile.label})`,
        `Selected Properties: ${ranking.benchmarks.count} | Group Avg Price: ${fmtMoney(ranking.benchmarks.avgPrice)} | Avg $/sqft: ${fmtMoney(ranking.benchmarks.avgPpsqft)}/sqft`,
        ''
    ];

    ranking.scored.forEach((entry, idx) => {
        const p = entry.property;
        lines.push(`#${idx + 1} ${cleanDisplayAddress(p.address, p.mls_id)} - $${p.price.toLocaleString()} (Score: ${Math.round(entry.score * 100)}/100)`);
        if (entry.strengths.length) {
            lines.push('   Top Strengths:');
            entry.strengths.forEach(s => lines.push(`     + ${s}`));
        }
        if (entry.drawbacks.length) {
            lines.push('   Watch Out Items:');
            entry.drawbacks.forEach(d => lines.push(`     - ${d}`));
        }
        lines.push('');
    });

    return lines.join('\n');
}

export function rankRecommendSelection() {
    const props = eligibleProperties().filter(p => selectedIds.has(p.mls_id));
    if (props.length < 2) return;
    lastRanking = computeRanking(props, currentProfileKey);
    renderResultsPanel(lastRanking);
    showResultsPanel();
}

export function copyRecommendResults() {
    if (!lastRanking) return;
    const text = buildRankingText(lastRanking);
    if (!navigator.clipboard) {
        showToast('Clipboard not available in this browser', 'error');
        return;
    }
    navigator.clipboard.writeText(text)
        .then(() => showToast('Top Picks copied to clipboard', 'success'))
        .catch(() => showToast('Could not copy to clipboard', 'error'));
}

// --- Modal open/close ---

function showSelectPanel() {
    if (elements.recommendSelectPanel) elements.recommendSelectPanel.style.display = '';
    if (elements.recommendResultsPanel) elements.recommendResultsPanel.style.display = 'none';
}

function showResultsPanel() {
    if (elements.recommendSelectPanel) elements.recommendSelectPanel.style.display = 'none';
    if (elements.recommendResultsPanel) elements.recommendResultsPanel.style.display = '';
}

export function backToRecommendSelection() {
    renderSelectionPanel();
    showSelectPanel();
}

export function openRecommendModal() {
    if (!elements.modalRecommend) return;
    if (state.activeView === 'realtor' || !hasInitializedSelection) {
        selectedIds = new Set(defaultSelectionIds());
        hasInitializedSelection = true;
    }

    const modalTitle = document.getElementById('recommend-modal-title');
    if (modalTitle) {
        const clientData = (state.activeView === 'realtor' && window.getRealtorActiveClientData) ? window.getRealtorActiveClientData() : null;
        const clientName = clientData && clientData.selected_client ? (clientData.selected_client.full_name || clientData.selected_client.username) : null;
        if (clientName) {
            modalTitle.innerHTML = `<i data-lucide="sparkles" style="color:var(--accent-gold);"></i> Top Picks Strategy Engine for <span style="color:var(--accent-gold);">${escapeHtml(clientName)}</span>`;
        } else {
            modalTitle.innerHTML = `<i data-lucide="sparkles"></i> Top Picks`;
        }
    }

    renderSelectionPanel();
    showSelectPanel();
    elements.modalRecommend.classList.add('active');
    if (window.lucide) window.lucide.createIcons();
}

window.transferRankedToTour = function() {
    if (!lastRanking || !lastRanking.scored || lastRanking.scored.length === 0) return;
    const topPicks = lastRanking.scored.slice(0, 5).map(e => e.property);
    closeRecommendModal();
    if (window.switchRealtorSubTab) {
        window.switchRealtorSubTab('tour');
        showToast(`Showing itinerary initialized with top ${topPicks.length} ranked picks!`, 'success');
    }
};

window.saveRankedPicksAsPlaylist = function() {
    if (!lastRanking || !lastRanking.scored || lastRanking.scored.length === 0) return;
    const topMlsIds = lastRanking.scored.map(e => e.property.mls_id);
    closeRecommendModal();

    if (window.openPlaylistsModal) {
        window.openPlaylistsModal();
        setTimeout(() => {
            const titleEl = document.getElementById('playlist-title');
            const descEl = document.getElementById('playlist-description');
            const clientData = (state.activeView === 'realtor' && window.getRealtorActiveClientData) ? window.getRealtorActiveClientData() : null;
            const clientName = clientData && clientData.selected_client ? (clientData.selected_client.full_name || clientData.selected_client.username) : '';

            if (titleEl) titleEl.value = `Top Picks Strategy (${lastRanking.profile.label}) - ${clientName}`;
            if (descEl) descEl.value = `Curated top ${topMlsIds.length} ranked homes based on ${lastRanking.profile.label} strategy. Group avg price: ${fmtMoney(lastRanking.benchmarks.avgPrice)}.`;

            if (window.setPlaylistEditingMlsIds) {
                window.setPlaylistEditingMlsIds(topMlsIds);
            }
            showToast(`Playlist pre-populated with top ${topMlsIds.length} ranked properties!`, 'success');
        }, 150);
    }
};

export function closeRecommendModal() {
    if (elements.modalRecommend) elements.modalRecommend.classList.remove('active');
}
window.closeRecommendModal = closeRecommendModal;

