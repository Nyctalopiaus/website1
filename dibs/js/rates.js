/**
 * Nycto's MLS Property Scout - Mortgage rates tile + panel.
 *
 * The tile lives in the Search Intelligence row (views.js calls ratesTileHtml()); clicking it
 * opens #modal-rates with market trends from FRED (backend/rates.php) and the user's own
 * lender quotes. Market data refreshes server-side at most every 12h, so loading is cheap.
 */
import { apiFetch } from './api.js';
import { escapeHtml } from './properties.js';
import { showToast } from './toast.js';

// Validated categorical slots 1-4 (dataviz reference palette); fixed per loan type, never by rank.
const SERIES_COLORS = { '30yr': 'var(--rate-c1)', '15yr': 'var(--rate-c2)', fha: 'var(--rate-c3)', va: 'var(--rate-c4)' };
const RANGES = { '3M': 92, '6M': 183, '1Y': 366 };

let ratesData = null;      // last get_mortgage_rates response
let loading = null;        // in-flight promise
let chartRange = '6M';
try { chartRange = localStorage.getItem('dibs_rates_range') || '6M'; } catch (e) {}
if (!RANGES[chartRange]) chartRange = '6M';

const fmtRate = r => (r === null || r === undefined) ? '—' : `${Number(r).toFixed(2)}%`;
const fmtDate = d => {
    if (!d) return '';
    const dt = new Date(d + 'T12:00:00');
    return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

// Rates going down is good news for a buyer. Arrow + sign carry the meaning; color only reinforces.
function changeHtml(delta, { compact = false } = {}) {
    if (delta === null || delta === undefined) return '<span class="rate-chg rate-chg-flat">—</span>';
    const d = Number(delta);
    if (Math.abs(d) < 0.005) return '<span class="rate-chg rate-chg-flat">● 0.00</span>';
    const cls = d < 0 ? 'rate-chg-down' : 'rate-chg-up';
    const arrow = d < 0 ? '▼' : '▲';
    return `<span class="rate-chg ${cls}">${arrow}${compact ? '' : ' '}${Math.abs(d).toFixed(2)}</span>`;
}

export function loadMortgageRates(force = false) {
    if (loading) return loading;
    if (ratesData && !force) return Promise.resolve(ratesData);
    loading = apiFetch('backend/api.php?action=get_mortgage_rates')
        .then(res => {
            if (res && res.success) ratesData = res;
            refreshRatesTile();
            if (document.getElementById('modal-rates')?.classList.contains('active')) renderRatesModal();
            return ratesData;
        })
        .catch(() => ratesData)
        .finally(() => { loading = null; });
    return loading;
}

/** Latest market rate (%) for a loan type, or null if not loaded / no data. */
export function getMarketRate(type = '30yr') {
    const s = ratesData?.series?.find(x => x.type === type);
    return s?.latest ? Number(s.latest.rate) : null;
}

function latestQuote(type) {
    return (ratesData?.quotes || []).find(q => q.loan_type === type) || null;
}

function tileInnerHtml() {
    const s30 = ratesData?.series?.find(s => s.type === '30yr');
    const value = s30?.latest ? fmtRate(s30.latest.rate) : (ratesData ? '—' : '…');
    let sub;
    if (s30?.latest) sub = `${changeHtml(s30.change_1w, { compact: true })} wk · ${escapeHtml(fmtDate(s30.latest.date))}`;
    else if (ratesData && !ratesData.key_configured) {
        const q = latestQuote('30yr');
        sub = q ? `Your quote ${fmtRate(q.rate)}` : 'Click to add a quote';
    } else sub = ratesData ? 'No data yet' : 'Loading…';
    return `
        <div class="user-panel-card-header">
            <span class="user-panel-card-label">30-Yr Rate</span>
            <i data-lucide="landmark" style="color:var(--accent-blue);"></i>
        </div>
        <div class="user-panel-card-value">${value}</div>
        <div class="user-panel-card-sub">${sub}</div>`;
}

/** Card markup for the Search Intelligence grid. updateKPIs() re-renders often; data is cached here. */
export function ratesTileHtml() {
    if (!ratesData && !loading) setTimeout(() => loadMortgageRates(), 0);
    return `<div class="user-panel-card rates-tile" id="rates-tile" role="button" tabindex="0"
        onclick="window.openRatesModal && window.openRatesModal()"
        onkeydown="if(event.key==='Enter'&&window.openRatesModal) window.openRatesModal()"
        title="Mortgage rates by loan type, trends and your lender quotes">${tileInnerHtml()}</div>`;
}

function refreshRatesTile() {
    const tile = document.getElementById('rates-tile');
    if (!tile) return;
    tile.innerHTML = tileInnerHtml();
    if (window.lucide) window.lucide.createIcons();
}

// ---------------------------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------------------------

export function openRatesModal() {
    const modal = document.getElementById('modal-rates');
    if (!modal) return;
    modal.classList.add('active');
    renderRatesModal();
    loadMortgageRates(true);
}

function closeRatesModal() {
    document.getElementById('modal-rates')?.classList.remove('active');
}

function renderRatesModal() {
    const body = document.getElementById('rates-modal-body');
    if (!body) return;
    if (!ratesData) { body.innerHTML = '<p class="rates-muted">Loading rates…</p>'; return; }

    const series = ratesData.series || [];
    const anyMarket = series.some(s => s.points && s.points.length);
    const keyNote = !ratesData.key_configured
        ? `<div class="rates-note"><i data-lucide="info"></i> Market rates need a free FRED API key: add <code>FRED_API_KEY=...</code> to your api.env. Your lender quotes work without it.</div>`
        : '';

    const rows = series.map(s => {
        const q = latestQuote(s.type);
        const diff = (q && s.latest) ? q.rate - s.latest.rate : null;
        const diffHtml = diff === null ? '' : `<span class="rates-muted">${diff <= 0 ? '' : '+'}${diff.toFixed(2)} vs market</span>`;
        return `<tr>
            <th scope="row"><span class="rate-swatch" style="background:${SERIES_COLORS[s.type]}"></span>${escapeHtml(s.label)}
                <div class="rates-src">${escapeHtml(s.source)}</div></th>
            <td class="rate-num">${s.latest ? fmtRate(s.latest.rate) : '—'}<div class="rates-src">${s.latest ? escapeHtml(fmtDate(s.latest.date)) : ''}</div></td>
            <td>${changeHtml(s.change_1w)}</td>
            <td>${changeHtml(s.change_1m)}</td>
            <td class="rate-num">${q ? fmtRate(q.rate) : '—'}<div class="rates-src">${q ? `${escapeHtml(q.lender || 'Quote')} · ${escapeHtml(fmtDate(q.quoted_on))}` : ''}</div>${diffHtml}</td>
        </tr>`;
    }).join('');

    const quotes = ratesData.quotes || [];
    const labelFor = t => series.find(s => s.type === t)?.label || t;
    const quoteList = quotes.length ? quotes.slice(0, 30).map(q => `
        <li class="rates-quote">
            <span class="rate-swatch" style="background:${SERIES_COLORS[q.loan_type] || 'var(--text-muted)'}"></span>
            <span class="rates-quote-main"><b>${fmtRate(q.rate)}</b> ${escapeHtml(labelFor(q.loan_type))}${q.points !== null ? ` · ${q.points} pts` : ''}
                <span class="rates-muted">${escapeHtml(q.lender || '')}${q.lender ? ' · ' : ''}${escapeHtml(fmtDate(q.quoted_on))}${q.note ? ' · ' + escapeHtml(q.note) : ''}</span></span>
            <button class="rates-quote-del" type="button" data-quote-id="${q.id}" title="Delete quote" aria-label="Delete quote"><i data-lucide="trash-2"></i></button>
        </li>`).join('') : '<li class="rates-muted">No quotes logged yet.</li>';

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    body.innerHTML = `
        ${keyNote}
        <div class="rates-table-wrap">
            <table class="rates-table">
                <thead><tr><th>Loan type</th><th>Market</th><th>1 week</th><th>1 month</th><th>Your latest quote</th></tr></thead>
                <tbody>${rows}</tbody>
            </table>
        </div>

        ${anyMarket ? `
        <div class="rates-chart-head">
            <h3>Trend</h3>
            <div class="rates-range" role="group" aria-label="Chart range">
                ${Object.keys(RANGES).map(r => `<button type="button" data-range="${r}" class="${r === chartRange ? 'active' : ''}">${r}</button>`).join('')}
            </div>
        </div>
        <div class="rates-legend">${series.filter(s => s.points?.length).map(s => `<span><span class="rate-swatch" style="background:${SERIES_COLORS[s.type]}"></span>${escapeHtml(s.label)}</span>`).join('')}
            ${quotes.length ? '<span><span class="rate-swatch rate-swatch-ring"></span>Your quotes</span>' : ''}</div>
        <div class="rates-chart" id="rates-chart"></div>` : ''}

        <div class="rates-quotes">
            <h3>Lender quotes</h3>
            <form class="rates-quote-form" id="rates-quote-form" autocomplete="off">
                <select name="loan_type" aria-label="Loan type">${series.map(s => `<option value="${s.type}">${escapeHtml(s.label)}</option>`).join('')}</select>
                <input name="rate" type="number" step="0.001" min="0.001" max="19.999" placeholder="Rate %" required aria-label="Rate percent">
                <input name="points" type="number" step="0.001" placeholder="Points" aria-label="Points">
                <input name="lender" type="text" maxlength="80" placeholder="Lender" aria-label="Lender">
                <input name="quoted_on" type="date" value="${todayStr}" aria-label="Quote date">
                <input name="note" type="text" maxlength="300" placeholder="Note (lock, fees…)" aria-label="Note">
                <button type="submit" class="btn-primary"><i data-lucide="plus"></i> Add</button>
            </form>
            <ul class="rates-quote-list">${quoteList}</ul>
        </div>
        <p class="rates-muted rates-foot">Market data: FRED, Federal Reserve Bank of St. Louis${ratesData.last_refreshed ? ` · refreshed ${escapeHtml(ratesData.last_refreshed)} UTC` : ''}. Averages for well-qualified borrowers; your quote depends on credit, down payment and points.</p>
    `;

    if (anyMarket) drawRatesChart();
    if (window.lucide) window.lucide.createIcons();
}

// ---------------------------------------------------------------------------------------------
// Chart: one % axis, a 2px line per loan type, direct end labels, crosshair + all-series tooltip,
// and the user's quotes as ringed dots on their loan type's color.
// ---------------------------------------------------------------------------------------------

function drawRatesChart() {
    const host = document.getElementById('rates-chart');
    if (!host || !ratesData) return;
    const cutoff = new Date(Date.now() - RANGES[chartRange] * 86400000).toISOString().slice(0, 10);
    const series = (ratesData.series || []).map(s => ({ ...s, pts: (s.points || []).filter(p => p.date >= cutoff) })).filter(s => s.pts.length);
    const quotes = (ratesData.quotes || []).filter(q => q.quoted_on >= cutoff && series.some(s => s.type === q.loan_type));
    if (!series.length) { host.innerHTML = '<p class="rates-muted">No market data in this range yet.</p>'; return; }

    const W = Math.max(320, host.clientWidth || 640);
    const H = 240;
    const m = { t: 12, r: 78, b: 26, l: 44 };
    const toMs = d => new Date(d + 'T12:00:00').getTime();
    const allDates = [...new Set(series.flatMap(s => s.pts.map(p => p.date)))].sort();
    const x0 = toMs(cutoff), x1 = toMs(allDates[allDates.length - 1]);
    const vals = series.flatMap(s => s.pts.map(p => p.rate)).concat(quotes.map(q => q.rate));
    let y0 = Math.floor((Math.min(...vals) - 0.1) * 4) / 4, y1 = Math.ceil((Math.max(...vals) + 0.1) * 4) / 4;
    if (y1 - y0 < 0.5) y1 = y0 + 0.5;
    const sx = ms => m.l + (ms - x0) / Math.max(1, x1 - x0) * (W - m.l - m.r);
    const sy = v => m.t + (y1 - v) / (y1 - y0) * (H - m.t - m.b);

    const step = (y1 - y0) > 2 ? 0.5 : 0.25;
    let grid = '';
    for (let v = y0; v <= y1 + 1e-9; v += step) {
        grid += `<line x1="${m.l}" x2="${W - m.r}" y1="${sy(v)}" y2="${sy(v)}" class="rc-grid"/><text x="${m.l - 6}" y="${sy(v) + 4}" class="rc-axis" text-anchor="end">${v.toFixed(2)}%</text>`;
    }
    // Month ticks
    let ticks = '';
    const d = new Date(x0); d.setDate(1); d.setMonth(d.getMonth() + 1);
    const monthsSpan = RANGES[chartRange] / 30;
    for (; d.getTime() <= x1; d.setMonth(d.getMonth() + (monthsSpan > 7 ? 2 : 1))) {
        const x = sx(d.getTime());
        ticks += `<text x="${x}" y="${H - 8}" class="rc-axis" text-anchor="middle">${d.toLocaleDateString([], { month: 'short' })}</text>`;
    }

    // Direct end labels, nudged apart so they never overlap.
    const ends = series.map(s => ({ s, y: sy(s.pts[s.pts.length - 1].rate) })).sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 13) ends[i].y = ends[i - 1].y + 13;

    const lines = series.map(s => {
        const dAttr = s.pts.map((p, i) => `${i ? 'L' : 'M'}${sx(toMs(p.date)).toFixed(1)},${sy(p.rate).toFixed(1)}`).join('');
        return `<path d="${dAttr}" fill="none" stroke="${SERIES_COLORS[s.type]}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    }).join('');
    const labels = ends.map(e => `<text x="${W - m.r + 6}" y="${e.y + 4}" class="rc-label">${escapeHtml(e.s.label.replace(' Fixed', ''))} ${e.s.pts[e.s.pts.length - 1].rate.toFixed(2)}</text>`).join('');
    const quoteDots = quotes.map(q => `<circle cx="${sx(toMs(q.quoted_on))}" cy="${sy(q.rate)}" r="5" fill="${SERIES_COLORS[q.loan_type]}" stroke="var(--bg-card-solid)" stroke-width="2"/>`).join('');

    host.innerHTML = `
        <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Mortgage rate trend, ${chartRange}">
            ${grid}${ticks}${lines}${quoteDots}${labels}
            <line class="rc-cross" x1="0" x2="0" y1="${m.t}" y2="${H - m.b}" style="display:none"/>
            <rect class="rc-hit" x="${m.l}" y="${m.t}" width="${W - m.l - m.r}" height="${H - m.t - m.b}" fill="transparent"/>
        </svg>
        <div class="rc-tip" style="display:none"></div>`;

    const svg = host.querySelector('svg');
    const cross = host.querySelector('.rc-cross');
    const tip = host.querySelector('.rc-tip');
    const hit = host.querySelector('.rc-hit');
    const xs = allDates.map(dt => ({ dt, x: sx(toMs(dt)) }));
    const asOf = (pts, dt) => { let v = null; for (const p of pts) { if (p.date <= dt) v = p.rate; else break; } return v; };

    const move = ev => {
        const rect = svg.getBoundingClientRect();
        const px = ev.clientX - rect.left;
        let best = xs[0];
        for (const c of xs) if (Math.abs(c.x - px) < Math.abs(best.x - px)) best = c;
        cross.setAttribute('x1', best.x); cross.setAttribute('x2', best.x); cross.style.display = '';
        tip.replaceChildren();
        const h = document.createElement('div'); h.className = 'rc-tip-date'; h.textContent = fmtDate(best.dt); tip.append(h);
        for (const s of series) {
            const v = asOf(s.pts, best.dt);
            if (v === null) continue;
            const row = document.createElement('div');
            const sw = document.createElement('span'); sw.className = 'rate-swatch'; sw.style.background = SERIES_COLORS[s.type];
            const name = document.createElement('span'); name.textContent = s.label;
            const val = document.createElement('b'); val.textContent = v.toFixed(2) + '%';
            row.append(sw, name, val); tip.append(row);
        }
        tip.style.display = '';
        const right = best.x + 12;
        tip.style.left = `${right + tip.offsetWidth > W ? Math.max(0, best.x - tip.offsetWidth - 12) : right}px`;
        tip.style.top = `${m.t}px`;
    };
    hit.addEventListener('pointermove', move);
    hit.addEventListener('pointerleave', () => { cross.style.display = 'none'; tip.style.display = 'none'; });
}

// ---------------------------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------------------------

document.addEventListener('click', ev => {
    const modal = document.getElementById('modal-rates');
    if (!modal || !modal.classList.contains('active')) return;
    if (ev.target === modal || ev.target.closest('#modal-rates-close')) { closeRatesModal(); return; }
    const rangeBtn = ev.target.closest('.rates-range button');
    if (rangeBtn) {
        chartRange = rangeBtn.dataset.range;
        try { localStorage.setItem('dibs_rates_range', chartRange); } catch (e) {}
        modal.querySelectorAll('.rates-range button').forEach(b => b.classList.toggle('active', b === rangeBtn));
        drawRatesChart();
        return;
    }
    const del = ev.target.closest('.rates-quote-del');
    if (del) {
        apiFetch('backend/api.php?action=delete_rate_quote', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: Number(del.dataset.quoteId) })
        }).then(res => {
            if (res?.success) { showToast('Quote deleted', 'info'); loadMortgageRates(true); }
            else showToast(res?.error || 'Could not delete quote', 'error');
        }).catch(() => showToast('Could not delete quote', 'error'));
    }
});

document.addEventListener('submit', ev => {
    if (ev.target.id !== 'rates-quote-form') return;
    ev.preventDefault();
    const f = new FormData(ev.target);
    const payload = Object.fromEntries(f.entries());
    apiFetch('backend/api.php?action=save_rate_quote', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    }).then(res => {
        if (res?.success) { showToast('Quote saved', 'success'); loadMortgageRates(true); }
        else showToast(res?.error || 'Could not save quote', 'error');
    }).catch(() => showToast('Could not save quote', 'error'));
});

document.addEventListener('keydown', ev => {
    if (ev.key === 'Escape' && document.getElementById('modal-rates')?.classList.contains('active')) closeRatesModal();
});

let resizeTimer = null;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        if (document.getElementById('modal-rates')?.classList.contains('active')) drawRatesChart();
    }, 150);
});

window.openRatesModal = openRatesModal;
