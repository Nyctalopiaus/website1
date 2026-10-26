/**
 * Realtor & lender report: one PDF (plus a CSV with the same rows) to email to both the realtor
 * and the mortgage broker, so they work from the same numbers.
 *   Page 1: the financing picture (My Home sale math, current monthly, rates) and the shortlist
 *           table (Top Picks in rank order, then other available favorites) with an estimated
 *           monthly cost for each home.
 *   Then:   a short block per home with the tour notes shared with the realtor.
 * Grayscale-friendly, built with the tour packet's drawing helpers (js/tourPacket.js).
 * Personal notes are left out: only notes already shared with the realtor are printed.
 */
import { state } from './state.js';
import { showToast } from './toast.js';
import { loadMyHome, myHomeSaleMath, myHomeMonthly } from './myHome.js';
import { loadMortgageRates, getMarketRate, getLatestQuote } from './rates.js';
import { monthlyCost, currentRate, loadPaySettings } from './compare.js';
import { loadLibs, loadFonts, Sheet, C, PAGE_W, PAGE_H, M, CW, FOOT_Y } from './tourPacket.js';

const OFF_MARKET = /pending|contract|closed|sold|withdrawn|expired|off market|cancel/i;
const money = v => (v == null || v === '' || !isFinite(Number(v))) ? '' : '$' + Math.round(Number(v)).toLocaleString('en-US');
const pct = v => (v == null || !isFinite(Number(v))) ? '' : `${Number(v).toFixed(2)}%`;
const num = v => (v == null || v === '' || !isFinite(Number(v))) ? null : Number(v);

function htmlToText(html) {
    if (!html) return '';
    const doc = new DOMParser().parseFromString(String(html).replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li)>/gi, '\n'), 'text/html');
    return (doc.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
}

/** Top Picks (rank order), then the other available favorites (current order). Passed homes are left out. */
function reportHomes() {
    const all = (state.allProperties || []).filter(p => p.favorite && !p.hidden && !OFF_MARKET.test(p.status || ''));
    const ranked = all.filter(p => Number(p.pick_rank) > 0).sort((a, b) => a.pick_rank - b.pick_rank);
    const rest = all.filter(p => !(Number(p.pick_rank) > 0));
    return [...ranked, ...rest];
}

/** The numbers both readers need, computed once so the PDF and the CSV always agree. */
function buildModel() {
    const home = state.myHome || null;
    const sale = home ? myHomeSaleMath(home) : null;
    const now = home ? myHomeMonthly(home) : null;
    const pay = loadPaySettings();
    const rate = currentRate(pay);
    const market = getMarketRate('30yr');
    const quote = getLatestQuote('30yr');
    const downAvail = sale && sale.downPayment != null ? Math.max(0, sale.downPayment) : null;
    const rows = reportHomes().map(p => {
        const price = num(p.price);
        const down = downAvail != null && price ? Math.min(downAvail, price) : (price ? price * (num(pay.downPct) ?? 20) / 100 : null);
        const m = price && rate ? monthlyCost(p, { rate, downAmount: down }) : null;
        const sqft = num(p.sqft_finished);
        return {
            p, price, down, m,
            downPct: price && down != null ? down / price * 100 : null,
            ppsf: price && sqft ? price / sqft : null,
            notes: htmlToText(p.tour_notes),
        };
    });
    return {
        name: state.currentUserProfile?.full_name || state.user || 'Buyer',
        today: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
        home, sale, now, rate, market, quote, downAvail, pay, rows,
        downBasis: downAvail != null ? 'net proceeds from selling the current home, plus extra cash' : `${num(pay.downPct) ?? 20}% down`,
    };
}

// ------------------------------------------------------------------ PDF

const COLS = [
    { k: '#', w: 18, align: 'center' },
    { k: 'Address', w: 148 },
    { k: 'Status', w: 46 },
    { k: 'Price', w: 54, align: 'right' },
    { k: '$/sf', w: 32, align: 'right' },
    { k: 'Bd/Ba', w: 32, align: 'center' },
    { k: 'Fin sf', w: 36, align: 'right' },
    { k: 'Built', w: 28, align: 'center' },
    { k: 'Tax/yr', w: 42, align: 'right' },
    { k: 'HOA/mo', w: 38, align: 'right' },
    { k: 'Est./mo', w: 66, align: 'right' },
];

function cells(r) {
    const p = r.p;
    return [
        p.pick_rank ? String(p.pick_rank) : '•',
        `${p.address || ''}${p.city ? ', ' + p.city : ''}`,
        `${p.status || 'Active'}${p.toured ? ' *' : ''}`,
        money(r.price),
        r.ppsf ? '$' + Math.round(r.ppsf) : '',
        `${p.beds ?? ''}/${p.baths ?? ''}`,
        p.sqft_finished ? Number(p.sqft_finished).toLocaleString('en-US') : '',
        p.year_built || '',
        money(p.annual_tax),
        p.hoa_fee ? money(p.hoa_fee) : '$0',
        r.m ? money(r.m.total) : '',
    ];
}

function footer(s, mdl, page, total) {
    s.stroke(C.rule, 0.5).line(M, FOOT_Y - 9, PAGE_W - M, FOOT_Y - 9);
    s.one(`${mdl.name} · Home search report · ${mdl.today}`, M, FOOT_Y, 300, 7.2, 'normal', C.muted);
    s.one(`Page ${page} of ${total}`, M + 300, FOOT_Y, CW - 300, 7.2, 'normal', C.muted, 'right');
}

function factsColumn(s, title, rows, x, y, w) {
    s.one(title, x, y + 8, w, 7.6, 'bold', C.ink);
    let yy = y + 14;
    rows.forEach(([label, value, strong]) => {
        s.one(label, x, yy + 9, w * 0.58, 8, 'normal', C.muted);
        s.one(value || '—', x + w * 0.58, yy + 9, w * 0.42, 8.4, strong ? 'bold' : 'normal', C.ink, 'right');
        yy += 12.5;
    });
    return yy;
}

function financePage(s, mdl) {
    let y = M;
    s.one('HOME SEARCH REPORT', M, y + 9, CW, 8.5, 'bold', C.gold);
    s.one(mdl.name, M, y + 36, CW - 160, 22, 'displayBold');
    s.one(`For my realtor and lender · ${mdl.today}`, M, y + 54, CW - 160, 10, 'display', C.muted);
    const ranked = mdl.rows.filter(r => r.p.pick_rank).length;
    s.one(`${mdl.rows.length} home${mdl.rows.length === 1 ? '' : 's'}${ranked ? ` · ${ranked} ranked` : ''}`, M + CW - 160, y + 36, 160, 10, 'bold', C.ink, 'right');
    y += 68;

    y = s.title('Financing picture', M, y, CW);
    const gap = 18, w3 = (CW - 2 * gap) / 3;
    const sale = mdl.sale, h = mdl.home;
    let bottom = y;
    if (h) {
        bottom = Math.max(bottom, factsColumn(s, 'SELLING MY CURRENT HOME', [
            ['Expected sale price', money(sale?.price)],
            ['Mortgage payoff', money(h.mortgage_payoff)],
            ['Equity', money(sale?.equity)],
            [`Selling costs (${num(h.sell_cost_pct) ?? 7}%)`, sale?.sellCosts != null ? '-' + money(sale.sellCosts) : ''],
            ['Net proceeds', money(sale?.net), true],
            ['Extra cash', money(h.extra_cash)],
            ['Down payment available', money(mdl.downAvail), true],
        ], M, y, w3));
        bottom = Math.max(bottom, factsColumn(s, 'CURRENT HOME TODAY', [
            ['Mortgage rate', h.mortgage_rate ? pct(h.mortgage_rate) : ''],
            ['Principal & interest', money(mdl.now?.pi)],
            ['Property tax', mdl.now?.tax ? money(mdl.now.tax) + '/mo' : ''],
            ['HOA', mdl.now?.hoa ? money(mdl.now.hoa) + '/mo' : '$0'],
            ['Monthly total', mdl.now ? money(mdl.now.total) : '', true],
        ], M + w3 + gap, y, w3));
    } else {
        s.box('No current home is entered in Dibs, so estimates below use a percentage down payment instead of sale proceeds.', M, y + 2, 2 * w3 + gap, 40, 8.6, 'italic', C.muted);
        bottom = y + 30;
    }
    bottom = Math.max(bottom, factsColumn(s, 'RATES (30-YR FIXED)', [
        ['Market average', mdl.market ? pct(mdl.market) : ''],
        ['Lender quote', mdl.quote ? `${pct(mdl.quote.rate)}${mdl.quote.lender ? ' · ' + mdl.quote.lender : ''}` : ''],
        ['Used for estimates', pct(mdl.rate), true],
    ], M + 2 * (w3 + gap), y, w3));
    y = bottom + 6;
    y += s.box(`Estimated monthly = 30-year principal & interest + property tax + HOA, at ${pct(mdl.rate) || 'the market rate'}, with the down payment from ${mdl.downBasis} (capped at the price). Insurance, PMI and utilities are not included. * = toured.`, M, y, CW, 30, 7.6, 'italic', C.muted) + 10;

    y = s.title('Shortlist', M, y, CW);
    return tableRows(s, mdl, y);
}

function tableHeader(s, y) {
    let x = M;
    COLS.forEach(c => { s.one(c.k, x + 2, y + 9, c.w - 4, 7.2, 'bold', C.muted, c.align || 'left'); x += c.w; });
    s.stroke(C.ink, 0.8).line(M, y + 13, M + CW, y + 13);
    return y + 16;
}

/** Draws as many shortlist rows as fit; returns the index of the first row left over. */
function tableRows(s, mdl, y, start = 0) {
    y = tableHeader(s, y);
    const rowH = 17;
    let i = start;
    for (; i < mdl.rows.length; i++) {
        if (y + rowH > FOOT_Y - 16) break;
        const r = mdl.rows[i];
        let x = M;
        cells(r).forEach((v, j) => {
            const c = COLS[j];
            const strong = j === 0 || j === 3 || j === COLS.length - 1;
            s.one(v, x + 2, y + 11, c.w - 4, j === 1 ? 8.2 : 8, strong ? 'bold' : 'normal', C.ink, c.align || 'left');
            x += c.w;
        });
        s.stroke(C.rule, 0.4).line(M, y + rowH - 1, M + CW, y + rowH - 1);
        y += rowH;
    }
    return i;
}

/** Per-home notes: only homes with shared tour notes or scores; as many blocks per page as fit. */
function notesPages(doc, s, mdl) {
    const items = mdl.rows.filter(r => r.notes || (r.p.tour_scores && Object.keys(r.p.tour_scores).length));
    if (!items.length) return;
    doc.addPage();
    let y = s.title('Tour notes (shared with the realtor)', M, M, CW);
    items.forEach(r => {
        const p = r.p;
        const scores = p.tour_scores ? Object.values(p.tour_scores).map(Number).filter(Boolean) : [];
        const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '';
        const noteH = Math.min(150, s.measure(r.notes || '', CW, 8.6));
        const need = 30 + noteH;
        if (y + need > FOOT_Y - 16) { doc.addPage(); y = M; }
        s.one(`${p.pick_rank ? '#' + p.pick_rank + '  ' : ''}${p.address || ''}${p.city ? ', ' + p.city : ''}`, M, y + 11, CW - 170, 10.5, 'displayBold');
        s.one([money(r.price), r.m ? money(r.m.total) + '/mo est.' : '', avg ? `avg score ${avg}/5` : ''].filter(Boolean).join('  ·  '), M + CW - 170, y + 11, 170, 8.4, 'normal', C.muted, 'right');
        y += 17;
        if (r.notes) y += s.box(r.notes, M, y, CW, 150, 8.6) + 4;
        else { s.one('No notes.', M, y + 9, CW, 8.4, 'italic', C.muted); y += 13; }
        s.stroke(C.rule, 0.4).line(M, y + 4, M + CW, y + 4);
        y += 12;
    });
}

async function buildPdf(mdl) {
    const [, fonts] = await Promise.all([loadLibs(), loadFonts()]);
    const doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'letter' });
    const s = new Sheet(doc, fonts);
    let next = financePage(s, mdl);
    while (next < mdl.rows.length) {
        doc.addPage();
        next = tableRows(s, mdl, M, next);
    }
    notesPages(doc, s, mdl);
    const total = doc.getNumberOfPages();
    for (let i = 1; i <= total; i++) { doc.setPage(i); footer(s, mdl, i, total); }
    doc.save(`Home search report - ${mdl.name.replace(/[^A-Za-z0-9 _-]+/g, '').trim()} - ${new Date().toISOString().slice(0, 10)}.pdf`);
    return total;
}

// ------------------------------------------------------------------ CSV

function csvCell(v) {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildCsv(mdl) {
    const head = ['Rank', 'MLS ID', 'Address', 'City', 'Status', 'Toured', 'Price', '$/Fin SqFt', 'Beds', 'Baths', 'Fin SqFt', 'Year Built',
        'Annual Tax', 'HOA/mo', 'Down Payment', 'Down %', 'Loan', 'Rate %', 'P&I/mo', 'Tax/mo', 'Est. Monthly'];
    const lines = [head.join(',')];
    mdl.rows.forEach(r => {
        const p = r.p;
        const loan = r.price != null && r.down != null ? Math.max(0, r.price - r.down) : '';
        lines.push([p.pick_rank || '', p.mls_id, p.address, p.city, p.status || 'Active', p.toured ? 'Yes' : 'No', r.price ?? '',
            r.ppsf ? Math.round(r.ppsf) : '', p.beds ?? '', p.baths ?? '', p.sqft_finished ?? '', p.year_built ?? '',
            p.annual_tax ?? '', p.hoa_fee ?? 0, r.down != null ? Math.round(r.down) : '', r.downPct != null ? r.downPct.toFixed(1) : '',
            loan === '' ? '' : Math.round(loan), mdl.rate ?? '', r.m ? Math.round(r.m.pi) : '', r.m ? Math.round(r.m.tax) : '', r.m ? Math.round(r.m.total) : '',
        ].map(csvCell).join(','));
    });
    // Assumptions after a blank line, so the table above still imports cleanly.
    const h = mdl.home, sale = mdl.sale;
    lines.push('', 'Assumptions');
    lines.push(['Rate used (30-yr fixed)', mdl.rate ?? ''].map(csvCell).join(','));
    lines.push(['Down payment basis', mdl.downBasis].map(csvCell).join(','));
    if (h) {
        [['Current home expected sale price', sale?.price], ['Current mortgage payoff', h.mortgage_payoff], ['Equity', sale?.equity],
            ['Selling cost %', num(h.sell_cost_pct) ?? 7], ['Net proceeds', sale?.net], ['Extra cash', h.extra_cash],
            ['Down payment available', mdl.downAvail], ['Current mortgage rate %', h.mortgage_rate], ['Current monthly total', mdl.now?.total]]
            .forEach(([k, v]) => lines.push([k, v == null || v === '' ? '' : Math.round(Number(v) * 100) / 100].map(csvCell).join(',')));
    }
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Home search report - ${mdl.name.replace(/[^A-Za-z0-9 _-]+/g, '').trim()} - ${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ------------------------------------------------------------------ entry point

let busy = false;
export async function exportBuyerReport() {
    if (busy) return;
    if (!state.authenticated) return showToast('Sign in first.', 'warning');
    busy = true;
    try {
        showToast('Building your report…', 'info');
        await Promise.all([loadMyHome(true), loadMortgageRates()]);
        const mdl = buildModel();
        if (!mdl.rows.length) { showToast('No available favorites to report on yet.', 'warning'); return; }
        const pages = await buildPdf(mdl);
        buildCsv(mdl);
        document.getElementById('modal-export')?.classList.remove('active');
        showToast(`Report ready: ${mdl.rows.length} homes, ${pages}-page PDF plus a CSV.`, 'success');
    } catch (e) {
        console.error('[BuyerReport]', e);
        showToast(e.message || 'Could not build the report.', 'error');
    } finally {
        busy = false;
    }
}

document.addEventListener('click', e => {
    if (e.target instanceof Element && e.target.closest('#btn-export-buyer-report')) exportBuyerReport();
});
window.exportBuyerReport = exportBuyerReport;
