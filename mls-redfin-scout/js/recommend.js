/**
 * MLS & Redfin Property Scout - "Top Picks" Recommendation Modal
 * Deterministic, client-side scoring over whichever properties the user checks in the
 * selection panel - no LLM call, no backend endpoint, no API key. Reproduces the kind of
 * analysis Josh got by pasting a favorites CSV into an LLM ($/sqft, lot size, days-on-market
 * negotiation leverage, HOA overhead, price vs. Redfin estimate), generated from percentile
 * comparisons within the selected set rather than model-generated prose. See
 * claude/recommendations-modal-plan.md in the project for the full design writeup.
 *
 * Named exports are wired to the static toolbar/modal buttons in app.js's bindEvents() and to
 * the command palette, same pattern as commandPalette.js / auth.js. toggleRecommendPick is
 * additionally attached to window because it's invoked from an onchange="..." attribute on
 * checkboxes rendered into innerHTML - same convention detailModal.js and views.js use for
 * anything wired up from dynamically-rendered HTML.
 */
import { state, elements } from './state.js';
import { getPropertyReviewStatus, cleanDisplayAddress, escapeHtml } from './properties.js';
import { showToast } from './toast.js';

// Composite score = weighted sum of these, each normalized 0-1 within the selected set only
// (matches comparing favorites against each other, not the whole database). A metric missing
// for a property (e.g. no Redfin estimate yet) drops out of that property's average rather
// than counting against it - weights below are renormalized per-property to what's available.
const METRIC_DEFS = {
    ppsqft: {
        weight: 0.35, direction: -1, // lower is better
        best: (v, avg) => `Lowest price per square foot in this set (${fmtMoney(v)}/sqft vs. the group's ${fmtMoney(avg)}/sqft average)`,
        good: (v, avg) => `Well below average price per square foot (${fmtMoney(v)}/sqft vs. ${fmtMoney(avg)}/sqft avg)`,
        worst: (v, avg) => `Highest price per square foot in this set (${fmtMoney(v)}/sqft vs. ${fmtMoney(avg)}/sqft avg)`
    },
    lotAcres: {
        weight: 0.20, direction: 1, // higher is better
        best: (v, avg) => `Largest lot in this set - ${v.toFixed(2)} acres, vs. the group's ${avg.toFixed(2)} acre average`,
        good: (v, avg) => `Above-average lot size (${v.toFixed(2)} acres vs. ${avg.toFixed(2)} acre avg)`,
        worst: (v, avg) => `Smallest lot in this set (${v.toFixed(2)} acres vs. ${avg.toFixed(2)} acre avg)`
    },
    domDays: {
        weight: 0.20, direction: 1, // more days = more negotiation leverage
        best: (v, avg) => `${Math.round(v)} days on market - the longest in this set, likely room to negotiate`,
        good: (v, avg) => `${Math.round(v)} days on market, above the group's ${Math.round(avg)}-day average - some negotiating room`,
        worst: (v, avg) => `Only ${Math.round(v)} days on market - the least negotiating leverage in this set`
    },
    hoaFee: {
        weight: 0.15, direction: -1, // lower is better
        best: (v, avg) => v > 0 ? `Lowest HOA in this set (${fmtMoney(v)}/mo vs. ${fmtMoney(avg)}/mo average)` : `No HOA - zero recurring association overhead`,
        good: (v, avg) => `Below-average HOA (${fmtMoney(v)}/mo vs. ${fmtMoney(avg)}/mo avg)`,
        worst: (v, avg) => `Highest HOA in this set (${fmtMoney(v)}/mo vs. ${fmtMoney(avg)}/mo avg)`
    },
    redfinDeltaPct: {
        weight: 0.10, direction: -1, // more negative (under estimate) is better
        best: (v) => `Priced ${Math.abs(v).toFixed(1)}% ${v < 0 ? 'under' : 'over'} Redfin's estimate - the best value gap in this set`,
        good: (v) => `Priced ${Math.abs(v).toFixed(1)}% ${v < 0 ? 'under' : 'over'} Redfin's estimate`,
        worst: (v) => `Priced ${Math.abs(v).toFixed(1)}% ${v < 0 ? 'under' : 'over'} Redfin's estimate - the least favorable gap in this set`
    }
};

const BEST_THRESHOLD = 0.999; // normalized score at/near the extreme of the set
const GOOD_THRESHOLD = 0.7;   // top ~quartile
const WEAK_THRESHOLD = 0.3;   // bottom ~quartile, used for the "why weaker" callout

let selectedIds = new Set();
let hasInitializedSelection = false;
let lastRanking = null;

function fmtMoney(v) {
    return '$' + Math.round(v).toLocaleString();
}

function eligibleProperties() {
    return state.allProperties.filter(p => p && p.mls_id && p.price);
}

function defaultSelectionIds() {
    return eligibleProperties()
        .filter(p => getPropertyReviewStatus(p) === 'favorite')
        .map(p => p.mls_id);
}

function getMetrics(p) {
    const sqft = p.sqft_finished || p.sqft_total || 0;
    const ppsqft = p.price_per_sqft || (sqft ? p.price / sqft : null);

    // lot_sqft is preferred whenever present: lot_acres has a known scraper bug (bookmarklet-builder.js,
    // now fixed there too) where a glued "<year><acreage>" string on the page parses as a huge number,
    // e.g. "20050.23" from "2005" (year built) + "0.23" (the real acreage) run together with no
    // separator. Existing DB rows scraped before that fix still carry the bad value until re-scraped,
    // so derive from lot_sqft instead and only trust a raw lot_acres value - within a sane residential
    // range - when lot_sqft isn't available at all.
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
        ranges[key] = { min, max, avg, hasSpread: max !== min };
    });
    return ranges;
}

function buildBullets(metrics, percentiles, ranges) {
    const candidates = [];
    Object.keys(METRIC_DEFS).forEach(key => {
        const range = ranges[key];
        const norm = percentiles[key];
        const val = metrics[key];
        if (!range || !range.hasSpread || !isUsable(norm) || !isUsable(val)) return;
        const def = METRIC_DEFS[key];
        if (norm >= BEST_THRESHOLD) {
            candidates.push({ priority: norm + 1, text: def.best(val, range.avg) });
        } else if (norm >= GOOD_THRESHOLD) {
            candidates.push({ priority: norm, text: def.good(val, range.avg) });
        }
    });
    candidates.sort((a, b) => b.priority - a.priority);
    return candidates.slice(0, 3).map(c => c.text);
}

function buildWeakReason(metrics, percentiles, ranges) {
    let worstKey = null;
    let worstNorm = Infinity;
    Object.keys(METRIC_DEFS).forEach(key => {
        const range = ranges[key];
        const norm = percentiles[key];
        if (!range || !range.hasSpread || !isUsable(norm)) return;
        if (norm < worstNorm) {
            worstNorm = norm;
            worstKey = key;
        }
    });
    if (worstKey && worstNorm <= WEAK_THRESHOLD) {
        return METRIC_DEFS[worstKey].worst(metrics[worstKey], ranges[worstKey].avg);
    }
    return 'No standout metric in this set, but nothing particularly weak either - solidly middle of the pack.';
}

/** Scores + ranks `properties` against each other. Requires at least 2 properties. */
function computeRanking(properties) {
    const metricsById = new Map();
    properties.forEach(p => metricsById.set(p.mls_id, getMetrics(p)));
    const ranges = buildRanges(properties, metricsById);

    const scored = properties.map(p => {
        const metrics = metricsById.get(p.mls_id);
        const percentiles = {};
        let weightedSum = 0;
        let weightTotal = 0;

        Object.entries(METRIC_DEFS).forEach(([key, def]) => {
            const range = ranges[key];
            const val = metrics[key];
            if (!range || !isUsable(val)) return;
            let norm;
            if (!range.hasSpread) {
                norm = 1; // only one data point (or everyone tied) - full credit, no bullet generated
            } else {
                norm = (val - range.min) / (range.max - range.min);
                if (def.direction === -1) norm = 1 - norm;
            }
            percentiles[key] = norm;
            weightedSum += norm * def.weight;
            weightTotal += def.weight;
        });

        const score = weightTotal > 0 ? weightedSum / weightTotal : 0;
        const bullets = buildBullets(metrics, percentiles, ranges);
        const weakReason = bullets.length === 0 ? buildWeakReason(metrics, percentiles, ranges) : null;

        return { property: p, metrics, percentiles, score, bullets, weakReason };
    });

    scored.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const ra = a.property.rating || 0, rb = b.property.rating || 0;
        if (rb !== ra) return rb - ra;
        return a.property.price - b.property.price;
    });

    return { scored, ranges };
}

// --- Selection panel ---

function renderSelectionPanel() {
    if (!elements.recommendPickList) return;
    const props = eligibleProperties().sort((a, b) => (b.favorite - a.favorite) || (a.price - b.price));

    if (!props.length) {
        elements.recommendPickList.innerHTML = `<div style="padding:1.5rem; text-align:center; color:var(--text-muted);">No properties in your database yet.</div>`;
    } else {
        elements.recommendPickList.innerHTML = props.map(p => {
            const checked = selectedIds.has(p.mls_id) ? 'checked' : '';
            const rev = getPropertyReviewStatus(p);
            const badge = rev === 'favorite' ? '⭐ ' : rev === 'possibility' ? '🤔 ' : '';
            const thumb = p.main_image_url || 'https://via.placeholder.com/80x60?text=No+Photo';
            return `
            <label class="pick-row">
                <input type="checkbox" data-mls="${p.mls_id}" ${checked} onchange="toggleRecommendPick('${p.mls_id}', this.checked)">
                <img src="${thumb}" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='https://via.placeholder.com/80x60?text=No+Photo';" class="pick-row-thumb">
                <div class="pick-row-info">
                    <div class="pick-row-addr">${badge}${escapeHtml(cleanDisplayAddress(p.address, p.mls_id))}</div>
                    <div class="pick-row-sub">${escapeHtml(p.city || '')}, ${escapeHtml(p.state || 'CO')} &middot; $${p.price.toLocaleString()} &middot; ${p.beds || 0}bd/${p.baths || 0}ba</div>
                </div>
            </label>`;
        }).join('');
    }
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
    updateSelectHint();
};

export function selectRecommendFavorites() {
    selectedIds = new Set(eligibleProperties().filter(p => getPropertyReviewStatus(p) === 'favorite').map(p => p.mls_id));
    renderSelectionPanel();
}

export function selectRecommendAddPossibilities() {
    eligibleProperties().filter(p => getPropertyReviewStatus(p) === 'possibility').forEach(p => selectedIds.add(p.mls_id));
    renderSelectionPanel();
}

export function selectRecommendNone() {
    selectedIds = new Set();
    renderSelectionPanel();
}

// --- Results panel ---

function renderResultsPanel(ranking) {
    if (!elements.recommendResultsBody) return;
    const picks = ranking.scored.filter(e => e.bullets.length > 0);
    const weak = ranking.scored.filter(e => e.bullets.length === 0);

    const pickCards = picks.map((entry, idx) => {
        const p = entry.property;
        const rankNum = idx + 1;
        const crown = rankNum === 1 ? '👑 ' : '';
        const sqft = p.sqft_finished || p.sqft_total || 0;
        return `
        <div class="rank-card ${rankNum === 1 ? 'rank-card-top' : ''}">
            <div class="rank-card-num">${crown}#${rankNum}</div>
            <div class="rank-card-body">
                <div class="rank-card-header">
                    <div>
                        <div class="rank-card-addr">${escapeHtml(cleanDisplayAddress(p.address, p.mls_id))}</div>
                        <div class="rank-card-sub">${escapeHtml(p.city || '')}, ${escapeHtml(p.state || 'CO')} &middot; $${p.price.toLocaleString()} &middot; ${p.beds || 0}bd/${p.baths || 0}ba &middot; ${sqft.toLocaleString()} sqft</div>
                    </div>
                    <span class="score-badge" title="Composite score within this comparison set">${Math.round(entry.score * 100)}/100</span>
                </div>
                <ul class="rank-why">${entry.bullets.map(b => `<li>${escapeHtml(b)}</li>`).join('')}</ul>
                <button type="button" class="btn btn-secondary" style="padding:0.35rem 0.85rem; font-size:0.8rem; align-self:flex-start;" onclick="openDetailModal('${p.mls_id}')">View Full Details</button>
            </div>
        </div>`;
    }).join('');

    const weakHtml = weak.length ? `
        <div class="modal-section-title" style="margin-top:1.5rem;">🤷 Less Compelling In This Set</div>
        <div class="rank-weak-list">
            ${weak.map(entry => `
                <div class="rank-weak-item">
                    <strong>${escapeHtml(cleanDisplayAddress(entry.property.address, entry.property.mls_id))}</strong> - $${entry.property.price.toLocaleString()}
                    <div style="color:var(--text-muted); font-size:0.85rem; margin-top:2px;">${escapeHtml(entry.weakReason)}</div>
                </div>`).join('')}
        </div>` : '';

    elements.recommendResultsBody.innerHTML = `
        <div class="modal-section-title">🏆 Top Picks</div>
        <div class="rank-card-list">${pickCards || '<div style="padding:1rem; color:var(--text-muted);">Every metric came out roughly even across this set - no standout picks.</div>'}</div>
        ${weakHtml}
    `;
}

function buildRankingText(ranking) {
    const lines = ['✨ Top Picks - Scout Ranking', ''];
    const picks = ranking.scored.filter(e => e.bullets.length > 0);
    const weak = ranking.scored.filter(e => e.bullets.length === 0);

    picks.forEach((entry, idx) => {
        const p = entry.property;
        lines.push(`#${idx + 1} ${cleanDisplayAddress(p.address, p.mls_id)} - $${p.price.toLocaleString()} (score ${Math.round(entry.score * 100)}/100)`);
        entry.bullets.forEach(b => lines.push(`   - ${b}`));
        lines.push('');
    });

    if (weak.length) {
        lines.push('Less compelling in this set:');
        weak.forEach(entry => {
            lines.push(`- ${cleanDisplayAddress(entry.property.address, entry.property.mls_id)} - $${entry.property.price.toLocaleString()}: ${entry.weakReason}`);
        });
    }
    return lines.join('\n');
}

export function rankRecommendSelection() {
    const props = eligibleProperties().filter(p => selectedIds.has(p.mls_id));
    if (props.length < 2) return;
    lastRanking = computeRanking(props);
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
    if (!hasInitializedSelection) {
        selectedIds = new Set(defaultSelectionIds());
        hasInitializedSelection = true;
    }
    renderSelectionPanel();
    showSelectPanel();
    elements.modalRecommend.classList.add('active');
}

export function closeRecommendModal() {
    if (elements.modalRecommend) elements.modalRecommend.classList.remove('active');
}
