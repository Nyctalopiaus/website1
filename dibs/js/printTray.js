/**
 * Buyer print tray (claude/print-tray-spec.md). A Print checkbox on each card (separate from
 * Compare) collects homes; a bar at the bottom opens a dialog that prints them as one duplex-ready
 * PDF: an Initial tour sheet for homes not yet toured, a Re-tour sheet for toured ones (switchable
 * back to Initial tour per home). The PDF itself is built in js/tourPacket.js (buildPrintTrayPdf).
 */
import { state } from './state.js';
import { cleanDisplayAddress, escapeHtml, NO_PHOTO_IMG } from './properties.js';
import { showToast } from './toast.js';

const MAX = 25;
const KEY = 'dibs_print_tray';
let tray = [];            // mls ids, in the order they were picked
const asInitial = new Set(); // toured homes the buyer chose to print as Initial tour
let building = false;

try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) || '[]');
    if (Array.isArray(saved)) tray = saved.filter(v => typeof v === 'string' && /^[A-Za-z0-9-]{1,20}$/.test(v)).slice(0, MAX);
} catch (e) { /* no session storage */ }

function persist() {
    try { sessionStorage.setItem(KEY, JSON.stringify(tray)); } catch (e) { /* ignore */ }
}

/** Print is buyer-only for now (no realtor or admin logins). */
export function isPrintBuyer() {
    const role = state.currentUserProfile?.role;
    return Boolean(state.currentUserProfile) && role !== 'realtor' && role !== 'admin' && !state.isAdmin;
}

export function isInPrintTray(mlsId) {
    return tray.includes(String(mlsId));
}

/** The card's Print checkbox. */
export function printCheckboxHtml(p) {
    if (!isPrintBuyer()) return '';
    const on = isInPrintTray(p.mls_id);
    const m = escapeHtml(p.mls_id);
    return `
        <label class="card-print-checkbox-label ${on ? 'is-checked' : ''}" title="Add to the print tray">
            <input type="checkbox" class="card-print-checkbox" data-mls="${m}" ${on ? 'checked' : ''} onchange="window.handleTogglePrint('${m}', event)">
            <span class="checkbox-text">${on ? '✓ Print' : 'Print'}</span>
        </label>`;
}

function propFor(id) {
    return (state.allProperties || []).find(p => String(p.mls_id) === String(id));
}

/** Tray homes in the order the cards are on screen; homes not in the current view go last. */
function orderedTray() {
    const pos = new Map((state.filteredProperties || []).map((p, i) => [String(p.mls_id), i]));
    return tray
        .map((id, i) => ({ id, i, at: pos.has(id) ? pos.get(id) : 1e6 + i, p: propFor(id) }))
        .filter(x => x.p)
        .sort((a, b) => a.at - b.at)
        .map(x => x.p);
}

const kindOf = p => (Number(p.toured) && !asInitial.has(String(p.mls_id))) ? 'retour' : 'initial';

function updateCheckboxes() {
    document.querySelectorAll('.card-print-checkbox').forEach(input => {
        const on = isInPrintTray(input.dataset.mls);
        input.checked = on;
        const label = input.closest('.card-print-checkbox-label');
        if (label) {
            label.classList.toggle('is-checked', on);
            const t = label.querySelector('.checkbox-text');
            if (t) t.textContent = on ? '✓ Print' : 'Print';
        }
    });
}

function ensureBar() {
    let bar = document.getElementById('print-tray');
    if (bar) return bar;
    bar = document.createElement('div');
    bar.id = 'print-tray';
    bar.className = 'print-tray';
    bar.hidden = true;
    const dock = document.getElementById('compare-dock');
    if (dock?.parentNode) dock.parentNode.insertBefore(bar, dock.nextSibling);
    else document.body.appendChild(bar);
    return bar;
}

export function updatePrintTray() {
    const bar = ensureBar();
    const homes = isPrintBuyer() ? orderedTray() : [];
    if (!homes.length) { bar.hidden = true; bar.innerHTML = ''; return; }
    bar.hidden = false;
    bar.innerHTML = `
        <div class="print-tray-inner">
            <span class="print-tray-title"><i data-lucide="printer"></i> <strong>${homes.length}</strong> home${homes.length === 1 ? '' : 's'} to print</span>
            <div class="print-tray-thumbs">${homes.map(p => `
                <span class="print-tray-thumb" title="${escapeHtml(cleanDisplayAddress(p.address, p.mls_id))}">
                    <img src="${escapeHtml(p.main_image_url || NO_PHOTO_IMG)}" alt="" referrerpolicy="no-referrer">
                    <button type="button" class="print-tray-remove" aria-label="Remove from print tray" onclick="window.handleTogglePrint('${escapeHtml(p.mls_id)}', event)"><i data-lucide="x"></i></button>
                </span>`).join('')}</div>
            <div class="print-tray-actions">
                <button type="button" class="btn btn-secondary btn-compact" onclick="window.clearPrintTray()"><i data-lucide="x"></i> Clear</button>
                <button type="button" class="btn btn-primary" onclick="window.openPrintDialog()"><i data-lucide="printer"></i> Print…</button>
            </div>
        </div>`;
    if (window.lucide) window.lucide.createIcons({ root: bar });
}

window.handleTogglePrint = function (mlsId, event) {
    if (event) event.stopPropagation();
    const id = String(mlsId);
    const i = tray.indexOf(id);
    if (i > -1) {
        tray.splice(i, 1);
        asInitial.delete(id);
    } else {
        if (tray.length >= MAX) {
            showToast(`The print tray holds up to ${MAX} homes.`, 'warning');
            updateCheckboxes();
            return;
        }
        tray.push(id);
    }
    persist();
    updateCheckboxes();
    updatePrintTray();
};

window.clearPrintTray = function () {
    tray = [];
    asInitial.clear();
    persist();
    updateCheckboxes();
    updatePrintTray();
};

// ------------------------------------------------------------------ dialog

function ensureModal() {
    let m = document.getElementById('modal-print-tray');
    if (m) return m;
    m = document.createElement('div');
    m.className = 'modal-overlay';
    m.id = 'modal-print-tray';
    m.innerHTML = `
        <div class="modal-content tour-bulk-modal" role="dialog" aria-modal="true" aria-labelledby="print-tray-heading">
            <button class="modal-close" aria-label="Close" data-pt="close"><i data-lucide="x"></i></button>
            <div class="my-home-header"><h2 id="print-tray-heading"><i data-lucide="printer"></i> Print homes</h2></div>
            <div id="print-tray-body"></div>
        </div>`;
    document.body.appendChild(m);
    m.addEventListener('click', onDialogClick);
    m.addEventListener('change', onDialogChange);
    return m;
}

function summary(homes) {
    const re = homes.filter(p => kindOf(p) === 'retour').length;
    const ini = homes.length - re;
    return [ini ? `${ini} Initial tour` : '', re ? `${re} Re-tour` : ''].filter(Boolean).join(' · ');
}

function paintDialog(msg = '') {
    const body = document.getElementById('print-tray-body');
    if (!body) return;
    const homes = orderedTray();
    const kinds = new Set(homes.map(kindOf));
    const anyToured = homes.some(p => Number(p.toured));
    const rows = homes.map(p => {
        const id = escapeHtml(p.mls_id);
        const addr = escapeHtml(cleanDisplayAddress(p.address, p.mls_id));
        const pick = Number(p.toured)
            ? `<select class="input-text print-kind" data-pt-kind="${id}" aria-label="Sheet for ${addr}">
                   <option value="retour" ${kindOf(p) === 'retour' ? 'selected' : ''}>Re-tour</option>
                   <option value="initial" ${kindOf(p) === 'initial' ? 'selected' : ''}>Initial tour</option>
               </select>`
            : `<span class="print-kind-fixed" title="Not toured yet">Initial tour</span>`;
        return `<li class="print-row"><span class="print-row-addr">${addr}</span>${pick}</li>`;
    }).join('');
    body.innerHTML = `
        <p class="tour-bulk-lead"><strong data-pt-summary>${summary(homes)}</strong>: ${homes.length} sheet${homes.length === 1 ? '' : 's'}, one per home, printed front and back.</p>
        <details class="print-list" ${kinds.size > 1 ? 'open' : ''}>
            <summary>Homes and sheet type${anyToured ? ' (toured homes can print either way)' : ''}</summary>
            <ul>${rows}</ul>
        </details>
        <ul class="tour-bulk-notes">
            <li><strong>Initial tour</strong>: photo, key facts, how it fits your brief, what to check, and a rating form; notes page on the back.</li>
            ${anyToured ? '<li><strong>Re-tour</strong>: the same front with your first-visit scores, decision, repairs and notes; your "Check on 2nd visit" list, a second rating and note lines on the back.</li>' : ''}
        </ul>
        <div class="packet-options">
            <label><input type="checkbox" data-pt-opt="photos" checked> Listing photos</label>
        </div>
        <p class="tour-bulk-hint">Print double-sided, <strong>flip on long edge</strong>, at <strong>100% / actual size</strong>.</p>
        <p class="tour-bulk-hint" data-pt-status aria-live="polite">${escapeHtml(msg)}</p>
        <div class="brief-actions">
            <button type="button" class="btn btn-secondary" data-pt="close">Cancel</button>
            <button type="button" class="btn btn-primary" data-pt="make"><i data-lucide="download"></i> Create PDF</button>
        </div>`;
    if (window.lucide) window.lucide.createIcons({ root: body });
}

window.openPrintDialog = function () {
    if (!isPrintBuyer()) return;
    if (!orderedTray().length) { showToast('Tick Print on a few homes first.', 'info'); return; }
    ensureModal().classList.add('active');
    paintDialog();
};

function close() {
    if (building) return;
    document.getElementById('modal-print-tray')?.classList.remove('active');
}

async function onDialogClick(event) {
    const t = event.target;
    if (!(t instanceof Element)) return;
    if (t.id === 'modal-print-tray') { close(); return; }
    const btn = t.closest('[data-pt]');
    if (!btn) return;
    if (btn.dataset.pt === 'close') { close(); return; }
    if (btn.dataset.pt !== 'make' || building) return;
    const status = document.querySelector('#modal-print-tray [data-pt-status]');
    const photos = Boolean(document.querySelector('#modal-print-tray [data-pt-opt="photos"]')?.checked);
    const picks = orderedTray().map(p => ({ mls_id: String(p.mls_id), kind: kindOf(p) }));
    building = true;
    btn.disabled = true;
    try {
        const { buildPrintTrayPdf } = await import('./tourPacket.js');
        const r = await buildPrintTrayPdf(picks, { photos }, m => { if (status) status.textContent = m; });
        building = false;
        close();
        showToast(`PDF ready: ${r.sheets} sheet${r.sheets === 1 ? '' : 's'}, double-sided.`, 'success');
    } catch (e) {
        console.error('[PrintTray]', e);
        if (status) status.textContent = e.message || 'Could not build the PDF.';
    } finally {
        building = false;
        btn.disabled = false;
    }
}

function onDialogChange(event) {
    const t = event.target;
    if (!(t instanceof HTMLSelectElement) || !t.dataset.ptKind) return;
    const id = t.dataset.ptKind;
    if (t.value === 'initial') asInitial.add(id); else asInitial.delete(id);
    const s = document.querySelector('#modal-print-tray [data-pt-summary]');
    if (s) s.textContent = summary(orderedTray());
}
