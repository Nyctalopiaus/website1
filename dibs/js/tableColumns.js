/**
 * Dibs - Table View column registry, column picker, and the
 * column-aware CSV / PDF report exports.
 *
 * Every export uses exactly what the table shows: the visible columns in their
 * order, over state.filteredProperties in the current sort. AI write-ups
 * (ai_analysis / Gemini) are deliberately NOT offered as columns: they run
 * a page or more per home and would wreck a one-row-per-property report.
 */
import { state } from './state.js';
import { showToast } from './toast.js';
import { cleanDisplayAddress, escapeHtml, getPropertyReviewStatus, getStatusBadgeClass, getCompScore, NO_PHOTO_IMG } from './properties.js';
import { getCardDaysOnMarket } from './views.js';
import { monthlyCost, loadPaySettings } from './compare.js';
import { getMarketRate } from './rates.js';

const STORE_KEY = 'dibs_table_columns_v1';

const num = v => (v === null || v === undefined || v === '' || isNaN(Number(v))) ? null : Number(v);
const money = v => v === null ? '' : '$' + Math.round(v).toLocaleString();
const REVIEW_LABEL = { favorite: 'Favorite', possibility: 'Possibility', dislike: 'Disliked' };
const FACING_LABEL = { N: 'North', NE: 'Northeast', E: 'East', SE: 'Southeast', S: 'South', SW: 'Southwest', W: 'West', NW: 'Northwest' };

function fullAddress(p) {
    const street = cleanDisplayAddress(p.address, p.mls_id) || '';
    const tail = [p.city, p.zip].filter(Boolean).join(' ');
    return tail ? `${street}, ${tail}` : street;
}
// Always the latest 30-yr market rate (ignores any rate typed into the compare panel);
// the down payment still comes from the compare panel's setting (default 20%).
function paySettings() { return { ...loadPaySettings(), rate: null }; }
function estPayment(p) {
    const m = monthlyCost(p, paySettings());
    return m ? Math.round(m.total) : null;
}

/**
 * Column definitions.
 *  value(p): raw value for CSV (numbers stay numbers so Excel can sort/sum).
 *  text(p):  formatted text for the PDF and the default table cell.
 *  html(p):  optional richer table cell.
 *  align:    'right' for numbers.  pdfWidth: optional fixed PDF width (pt).
 */
export const COLUMNS = [
    { key: 'photo', label: 'Photo', photo: true, pdfWidth: 62,
      value: p => (p.main_image_url ? new URL(p.main_image_url, location.href).href : ''), text: () => '',
      html: p => `<img src="${escapeHtml(p.main_image_url || NO_PHOTO_IMG)}" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${NO_PHOTO_IMG}';" class="table-thumb" alt="">` },
    // Top Picks rank (1 = favorite home); unranked homes sort after ranked ones.
    { key: 'pick_rank', label: 'Rank', align: 'right', value: p => (p.pick_rank ? Number(p.pick_rank) : null), text: p => (p.pick_rank ? `#${p.pick_rank}` : '—') },
    { key: 'mls_id', label: 'MLS #', locked: true, value: p => p.mls_id || '', text: p => String(p.mls_id || '') },
    { key: 'status', label: 'Status', value: p => p.status || '', text: p => p.status || '',
      html: p => `<span class="badge ${getStatusBadgeClass(p.status)}">${escapeHtml(p.status || '')}</span>` },
    { key: 'review', label: 'My Review', value: p => REVIEW_LABEL[getPropertyReviewStatus(p)] || '', text: p => REVIEW_LABEL[getPropertyReviewStatus(p)] || '—',
      html: p => {
          const r = getPropertyReviewStatus(p);
          if (r === 'favorite') return `<span class="badge-matrix-review badge-matrix-fav"><i data-lucide="star"></i> Favorite</span>`;
          if (r === 'possibility') return `<span class="badge-matrix-review badge-matrix-possibility"><i data-lucide="circle-help"></i> Possibility</span>`;
          if (r === 'dislike') return `<span class="badge-matrix-review badge-matrix-dislike"><i data-lucide="ban"></i> Disliked</span>`;
          return '-';
      } },
    { key: 'address', label: 'Address', value: fullAddress, text: fullAddress, pdfWidth: 150,
      html: p => `<strong>${escapeHtml(cleanDisplayAddress(p.address, p.mls_id))}</strong><br><small style="color:var(--text-muted);">${escapeHtml(p.city || '')}, ${escapeHtml(p.zip || '')}</small>` },
    { key: 'city', label: 'City', value: p => p.city || '', text: p => p.city || '' },
    { key: 'price', label: 'Price', align: 'right', value: p => num(p.price), text: p => money(num(p.price)),
      html: p => `<span style="font-weight:700; color:var(--accent-gold);">${money(num(p.price))}</span>` },
    { key: 'beds', label: 'Beds', align: 'right', value: p => num(p.beds), text: p => p.beds ?? '' },
    { key: 'baths', label: 'Baths', align: 'right', value: p => num(p.baths), text: p => p.baths ?? '' },
    { key: 'sqft', label: 'Fin SqFt', align: 'right', value: p => num(p.sqft_finished), text: p => num(p.sqft_finished) ? Number(p.sqft_finished).toLocaleString() : '—' },
    { key: 'ppsf', label: '$/SqFt', align: 'right',
      value: p => (num(p.price) && num(p.sqft_finished)) ? Math.round(p.price / p.sqft_finished) : null,
      text: p => (num(p.price) && num(p.sqft_finished)) ? '$' + Math.round(p.price / p.sqft_finished) : '—' },
    { key: 'lot', label: 'Lot (ac)', align: 'right', value: p => num(p.lot_acres), text: p => num(p.lot_acres) ? `${p.lot_acres} ac` : '—' },
    { key: 'year_built', label: 'Built', align: 'right', value: p => num(p.year_built), text: p => p.year_built || '—' },
    { key: 'property_type', label: 'Type', value: p => p.property_type || '', text: p => p.property_type || '—' },
    { key: 'garage', label: 'Garage', align: 'right', value: p => num(p.garage_spaces), text: p => num(p.garage_spaces) ? `${p.garage_spaces}-car` : '—' },
    { key: 'facing', label: 'Driveway Faces', value: p => FACING_LABEL[p.facing] || '', text: p => FACING_LABEL[p.facing] || '—' },
    { key: 'dom', label: 'Days on Mkt', align: 'right', value: p => getCardDaysOnMarket(p), text: p => { const d = getCardDaysOnMarket(p); return d === null ? '—' : String(d); } },
    { key: 'hoa', label: 'HOA /mo', align: 'right', value: p => num(p.hoa_fee) || 0, text: p => num(p.hoa_fee) ? money(num(p.hoa_fee)) : 'None' },
    { key: 'tax', label: 'Tax /yr', align: 'right', value: p => num(p.annual_tax), text: p => num(p.annual_tax) ? money(num(p.annual_tax)) : '—' },
    { key: 'est_payment', label: 'Est. Payment /mo', align: 'right', value: estPayment, text: p => { const v = estPayment(p); return v === null ? '—' : money(v); } },
    { key: 'price_score', label: 'Price Score', align: 'right',
      value: p => { const c = getCompScore(p); return c ? c.score : null; },
      text: p => { const c = getCompScore(p); return c ? `${c.score} · ${c.pctText}` : '—'; },
      html: p => { const c = getCompScore(p); return c ? `<strong>${c.score}</strong><br><small style="color:var(--text-muted);">${escapeHtml(c.pctText)}</small>` : '-'; } },
    { key: 'school_district', label: 'School District', value: p => p.school_district || '', text: p => p.school_district || '—' },
    { key: 'notes', label: 'My Notes', value: p => p.user_notes || '', pdfWidth: 170,
      // Notes get trimmed in the PDF so one long note can't blow a row up to half a page.
      text: p => { const t = String(p.user_notes || '').replace(/\s+/g, ' ').trim(); return t.length > 140 ? t.slice(0, 137) + '…' : t; } },
];
const BY_KEY = Object.fromEntries(COLUMNS.map(c => [c.key, c]));

// Default view: what both the realtor and the lender need, on one page width.
const DEFAULT_KEYS = ['mls_id', 'address', 'status', 'price', 'price_score', 'beds', 'baths', 'sqft', 'garage', 'hoa', 'tax', 'est_payment'];
const PDF_COMFORT_COLS = 12;

function sanitize(keys) {
    const out = (keys || []).filter(k => BY_KEY[k]);
    const uniq = [...new Set(out)];
    if (!uniq.includes('mls_id')) uniq.unshift('mls_id');
    return uniq;
}

function loadPrefs() {
    try {
        const s = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
        if (s && Array.isArray(s.visible)) return { visible: sanitize(s.visible) };
    } catch (e) {}
    return { visible: [...DEFAULT_KEYS] };
}
function savePrefs(p) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(p)); } catch (e) {}
}

let prefs = loadPrefs();

export function getVisibleColumns() {
    return prefs.visible.map(k => BY_KEY[k]).filter(Boolean);
}

function setVisible(keys) {
    prefs = { visible: sanitize(keys) };
    savePrefs(prefs);
    if (window.renderTable) window.renderTable();
}

/* ------------------------------------------------------------------ toolbar */

export function tableToolbarHtml(count) {
    return `
    <div class="table-toolbar">
        <div class="table-toolbar-count">${count} ${count === 1 ? 'property' : 'properties'} · ${prefs.visible.length} columns</div>
        <div class="table-toolbar-actions">
            <button type="button" class="btn btn-secondary table-tb-btn" id="table-columns-export-btn"><i data-lucide="columns-3"></i> Columns &amp; Export</button>
        </div>
    </div>`;
}

export function bindTableToolbar(container) {
    container.querySelector('#table-columns-export-btn')?.addEventListener('click', openTableExportModal);
}

/* -------------------------------------------------------- columns & export modal */

const MODAL_ID = 'modal-table-export';

function ensureModal() {
    let modal = document.getElementById(MODAL_ID);
    if (modal) return modal;
    modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = MODAL_ID;
    modal.innerHTML = `
        <div class="modal-content table-export-modal" role="dialog" aria-modal="true" aria-labelledby="table-export-title">
            <button class="modal-close" aria-label="Close" data-tx="close"><i data-lucide="x"></i></button>
            <h2 id="table-export-title"><i data-lucide="columns-3"></i> Table Columns &amp; Export</h2>
            <p class="table-export-intro">Pick the columns for the table. CSV and PDF exports use the same columns, filters and sort.</p>
            <div class="table-export-body"></div>
        </div>`;
    document.body.appendChild(modal);

    modal.addEventListener('click', e => {
        if (e.target === modal || e.target.closest('[data-tx="close"]')) return closeTableExportModal();
        const move = e.target.closest('[data-col-move]');
        if (move) {
            const k = move.dataset.colMove, dir = Number(move.dataset.dir);
            const keys = [...prefs.visible];
            const i = keys.indexOf(k), j = i + dir;
            if (i >= 0 && j >= 0 && j < keys.length) { [keys[i], keys[j]] = [keys[j], keys[i]]; setVisible(keys); renderModalBody(); }
            return;
        }
        if (e.target.closest('[data-tx="reset"]')) { setVisible(DEFAULT_KEYS); renderModalBody(); return; }
        if (e.target.closest('[data-tx="csv"]')) { exportTableCSV(); return; }
        if (e.target.closest('[data-tx="pdf"]')) {
            lastPdf = {
                title: modal.querySelector('#table-pdf-title')?.value.trim() || 'Property Shortlist',
                preparedFor: modal.querySelector('#table-pdf-for')?.value.trim() || '',
            };
            try { localStorage.setItem('dibs_pdf_report_opts', JSON.stringify(lastPdf)); } catch (e) {}
            exportTablePDF();
        }
    });
    modal.addEventListener('change', e => {
        const cb = e.target.closest('[data-col-toggle]');
        if (!cb) return;
        const k = cb.dataset.colToggle;
        const keys = prefs.visible.filter(x => x !== k);
        if (cb.checked) keys.push(k);
        setVisible(keys);
        renderModalBody();
    });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && modal.classList.contains('active')) closeTableExportModal();
    });
    return modal;
}

function renderModalBody() {
    const modal = document.getElementById(MODAL_ID);
    if (!modal) return;
    const body = modal.querySelector('.table-export-body');
    // Keep whatever is typed in the report fields across re-renders.
    const typedTitle = modal.querySelector('#table-pdf-title')?.value;
    const typedFor = modal.querySelector('#table-pdf-for')?.value;
    const scrollTop = modal.querySelector('.table-columns-list')?.scrollTop || 0;

    const visible = new Set(prefs.visible);
    const ordered = [...prefs.visible, ...COLUMNS.map(c => c.key).filter(k => !visible.has(k))];
    const lastVisibleIdx = prefs.visible.length - 1;
    const count = (state.filteredProperties || []).length;

    body.innerHTML = `
        <section class="table-export-col">
            <div class="table-export-section-head">
                <h3>Columns <span>${prefs.visible.length} shown</span></h3>
                <button type="button" class="table-columns-reset" data-tx="reset">Reset to default</button>
            </div>
            <ul class="table-columns-list">
                ${ordered.map(k => {
                    const c = BY_KEY[k];
                    const on = visible.has(k);
                    const idx = prefs.visible.indexOf(k);
                    return `<li class="${on ? '' : 'off'}">
                        <label><input type="checkbox" data-col-toggle="${k}" ${on ? 'checked' : ''} ${c.locked ? 'disabled' : ''}> ${escapeHtml(c.label)}${c.locked ? ' <small>(always)</small>' : ''}</label>
                        ${on ? `<span class="table-col-move">
                            <button type="button" data-col-move="${k}" data-dir="-1" ${idx <= 0 ? 'disabled' : ''} aria-label="Move ${escapeHtml(c.label)} earlier"><i data-lucide="chevron-up"></i></button>
                            <button type="button" data-col-move="${k}" data-dir="1" ${idx >= lastVisibleIdx ? 'disabled' : ''} aria-label="Move ${escapeHtml(c.label)} later"><i data-lucide="chevron-down"></i></button>
                        </span>` : ''}
                    </li>`;
                }).join('')}
            </ul>
        </section>
        <section class="table-export-col">
            <div class="table-export-section-head"><h3>Export <span>${count} ${count === 1 ? 'property' : 'properties'}</span></h3></div>
            <div class="table-export-card">
                <div class="table-export-card-title"><i data-lucide="file-spreadsheet"></i> CSV spreadsheet</div>
                <p>Opens in Excel, Numbers or Google Sheets. Numbers stay sortable.</p>
                <button type="button" class="btn btn-secondary" data-tx="csv"><i data-lucide="download"></i> Download CSV</button>
            </div>
            <div class="table-export-card">
                <div class="table-export-card-title"><i data-lucide="file-text"></i> PDF report</div>
                <label>Report title <input type="text" class="input-text" id="table-pdf-title" value="${escapeHtml(typedTitle ?? lastPdf.title)}" maxlength="80"></label>
                <label>Prepared for <input type="text" class="input-text" id="table-pdf-for" value="${escapeHtml(typedFor ?? lastPdf.preparedFor)}" maxlength="80" placeholder="Optional, e.g. Jane Smith, Mortgage Co."></label>
                ${prefs.visible.length > PDF_COMFORT_COLS ? `<div class="table-columns-hint warn">${prefs.visible.length} columns is a lot for one page; the text will be shrunk. ${PDF_COMFORT_COLS} or fewer reads best.</div>` : ''}
                <button type="button" class="btn btn-primary" data-tx="pdf"><i data-lucide="download"></i> Download PDF</button>
            </div>
        </section>`;
    const list = body.querySelector('.table-columns-list');
    if (list) list.scrollTop = scrollTop;
    if (window.lucide) window.lucide.createIcons();
}

export function openTableExportModal() {
    const modal = ensureModal();
    // Fresh open: start the report fields from the saved values.
    const body = modal.querySelector('.table-export-body');
    if (body) body.innerHTML = '';
    renderModalBody();
    modal.classList.add('active');
}

export function closeTableExportModal() {
    document.getElementById(MODAL_ID)?.classList.remove('active');
}

/* ---------------------------------------------------------------- exports */

function fileStamp() { return new Date().toISOString().split('T')[0]; }

function download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return String(v);
    const s = String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function exportTableCSV() {
    const props = state.filteredProperties || [];
    if (!props.length) return showToast('No properties to export', 'warning');
    const cols = getVisibleColumns();
    const lines = [cols.map(c => csvCell(c.label)).join(',')];
    props.forEach(p => lines.push(cols.map(c => csvCell(c.value(p))).join(',')));
    // BOM so Excel opens it as UTF-8 (em dashes, accented street names).
    download(new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' }), `dibs_properties_${fileStamp()}.csv`);
    showToast(`CSV exported: ${props.length} properties, ${cols.length} columns`, 'success');
}

let lastPdf = (() => {
    try { return { title: 'Property Shortlist', preparedFor: '', ...JSON.parse(localStorage.getItem('dibs_pdf_report_opts') || '{}') }; }
    catch (e) { return { title: 'Property Shortlist', preparedFor: '' }; }
})();

let pdfLibPromise = null;
function loadScript(src) {
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = () => reject(new Error('Failed to load ' + src));
        document.head.appendChild(s);
    });
}
function loadPdfLib() {
    if (window.jspdf?.jsPDF?.API?.autoTable) return Promise.resolve();
    if (!pdfLibPromise) {
        pdfLibPromise = loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js')
            .then(() => loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js'))
            .catch(e => { pdfLibPromise = null; throw e; });
    }
    return pdfLibPromise;
}

// Loads a listing photo and shrinks it to a small JPEG for the PDF. Photos cached on
// the Dibs server are same-origin; remote ones only work if their host allows CORS,
// otherwise that row's thumbnail is simply left blank.
async function thumbDataUrl(url) {
    if (!url) return null;
    try {
        const res = await fetch(url, { referrerPolicy: 'no-referrer', credentials: 'same-origin' });
        if (!res.ok) return null;
        const bmp = await createImageBitmap(await res.blob());
        const W = 160, H = 110; // ~2.6x the printed size, so it stays crisp
        const canvas = document.createElement('canvas');
        canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d');
        const scale = Math.max(W / bmp.width, H / bmp.height); // cover-crop
        const dw = bmp.width * scale, dh = bmp.height * scale;
        ctx.drawImage(bmp, (W - dw) / 2, (H - dh) / 2, dw, dh);
        return canvas.toDataURL('image/jpeg', 0.8);
    } catch (e) {
        return null;
    }
}

export async function exportTablePDF() {
    const props = state.filteredProperties || [];
    if (!props.length) return showToast('No properties to export', 'warning');
    try {
        await loadPdfLib();
    } catch (e) {
        console.error(e);
        return showToast('Could not load the PDF library. Check your connection and try again.', 'error');
    }
    const cols = getVisibleColumns();
    const photoIdx = cols.findIndex(c => c.photo);
    let thumbs = [];
    if (photoIdx >= 0) {
        showToast(`Preparing ${props.length} photos…`, 'info');
        thumbs = await Promise.all(props.map(p => thumbDataUrl(p.main_image_url)));
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 36;
    const ink = [31, 41, 55], muted = [107, 114, 128], rule = [209, 213, 219];

    // Header
    doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(...ink);
    doc.text(lastPdf.title || 'Property Shortlist', margin, margin + 6);
    const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const sub = [lastPdf.preparedFor ? `Prepared for ${lastPdf.preparedFor}` : '', dateStr, `${props.length} ${props.length === 1 ? 'property' : 'properties'}`].filter(Boolean).join('  ·  ');
    doc.setFont('helvetica', 'normal').setFontSize(9.5).setTextColor(...muted);
    doc.text(sub, margin, margin + 22);
    doc.setDrawColor(...rule).setLineWidth(0.75).line(margin, margin + 32, pageW - margin, margin + 32);

    const many = cols.length > PDF_COMFORT_COLS;
    const columnStyles = {};
    cols.forEach((c, i) => {
        const st = {};
        if (c.align === 'right') st.halign = 'right';
        if (c.pdfWidth && (!many || c.photo)) st.cellWidth = c.pdfWidth;
        if (c.key === 'mls_id') st.textColor = muted;
        if (c.key === 'address') st.fontStyle = 'bold';
        if (c.photo) st.minCellHeight = 44;
        columnStyles[i] = st;
    });

    // Footnotes so the reader knows what the computed columns mean.
    const notes = [];
    if (cols.some(c => c.key === 'est_payment')) {
        const s = loadPaySettings();
        const rate = getMarketRate('30yr');
        const down = s.downAmount != null ? `$${Math.round(s.downAmount).toLocaleString()} down` : `${Number(s.downPct) || 0}% down`;
        notes.push(`Est. payment: 30-yr fixed P&I at ${rate ? Number(rate).toFixed(2) + '% (latest market rate)' : 'the latest market rate'}, ${down}, plus property tax and HOA. Excludes insurance and PMI.`);
    }
    if (cols.some(c => c.key === 'price_score')) notes.push('Price Score (0–100): list price against the RentCast value estimate; 50 is in line with comps, higher means priced below. Comps are listing prices, not confirmed closings.');

    doc.autoTable({
        startY: margin + 44,
        margin: { left: margin, right: margin, bottom: margin + 18 },
        head: [cols.map(c => c.label)],
        body: props.map(p => cols.map(c => String(c.text(p) ?? ''))),
        theme: 'plain',
        styles: { font: 'helvetica', fontSize: many ? 7 : 8.5, cellPadding: { top: 5, bottom: 5, left: 4, right: 4 }, textColor: ink, overflow: 'linebreak', valign: 'middle' },
        headStyles: { fontStyle: 'bold', fontSize: many ? 7 : 8, textColor: ink, fillColor: [243, 244, 246], lineWidth: { bottom: 0.75 }, lineColor: rule },
        alternateRowStyles: { fillColor: [249, 250, 251] },
        columnStyles,
        didParseCell: data => {
            if (data.section === 'head' && cols[data.column.index]?.align === 'right') data.cell.styles.halign = 'right';
        },
        didDrawCell: data => {
            if (data.section !== 'body' || data.column.index !== photoIdx) return;
            const img = thumbs[data.row.index];
            if (!img) return;
            const w = data.cell.width - 6, h = Math.min(data.cell.height - 6, w * 110 / 160);
            doc.addImage(img, 'JPEG', data.cell.x + 3, data.cell.y + (data.cell.height - h) / 2, w, h);
        },
    });

    let y = doc.lastAutoTable.finalY + 14;
    if (notes.length) {
        doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...muted);
        notes.forEach(n => {
            const wrapped = doc.splitTextToSize(n, pageW - margin * 2);
            if (y + wrapped.length * 10 > pageH - margin - 18) { doc.addPage(); y = margin; }
            doc.text(wrapped, margin, y);
            y += wrapped.length * 10;
        });
    }

    // Footer on every page
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
        doc.setPage(i);
        doc.setFont('helvetica', 'normal').setFontSize(7.5).setTextColor(...muted);
        doc.text('Listing data from MLS; verify details before relying on them.', margin, pageH - margin + 6);
        doc.text(`Page ${i} of ${pages}`, pageW - margin, pageH - margin + 6, { align: 'right' });
    }

    const slug = (lastPdf.title || 'property_report').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    doc.save(`${slug || 'property_report'}_${fileStamp()}.pdf`);
    showToast('PDF report downloaded', 'success');
}
