/**
 * "Check on 2nd visit" list for a toured home (claude/print-tray-spec.md).
 * The buyer adds, edits, ticks and removes items in the detail modal; the realtor sees them
 * read-only on the client page and in Tour Results. The Re-tour print sheet prints them too.
 * Stored per home in user_metadata.retour_checks_json as [{id, text, done, done_at}].
 */
import { state, CONFIG } from './state.js';
import { escapeHtml } from './properties.js';
import { apiFetch } from './api.js';
import { showToast } from './toast.js';

const MAX_ITEMS = 30;
const MAX_TEXT = 200;

/** The list for a home, from either the list row (JSON string) or an already-decoded array. */
export function parseRetourChecks(p) {
    if (!p) return [];
    if (Array.isArray(p.retour_checks)) return p.retour_checks;
    const raw = p.retour_checks_json;
    if (Array.isArray(raw)) return raw;
    if (!raw) return [];
    try {
        const list = JSON.parse(raw);
        return Array.isArray(list) ? list : [];
    } catch (e) {
        return [];
    }
}

function fmtDate(d) {
    if (!d) return '';
    const dt = new Date(`${d}T12:00:00`);
    return isNaN(dt) ? '' : dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function todayLocal() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function newId() {
    return (Date.now().toString(36) + Math.random().toString(36).slice(2, 6)).slice(0, 16);
}

/** Read-only list for the realtor's views and Tour Results. Empty string when there's nothing to show. */
export function retourChecksReadOnlyHtml(list, { compact = false } = {}) {
    const items = Array.isArray(list) ? list : [];
    if (!items.length) return '';
    const open = items.filter(i => !i.done);
    const done = items.filter(i => i.done);
    const row = i => `<li class="rc-ro-item${i.done ? ' is-done' : ''}"><span class="rc-ro-box" aria-hidden="true">${i.done ? '✓' : ''}</span><span>${escapeHtml(i.text || '')}${i.done && i.done_at ? ` <em class="rc-date">${escapeHtml(fmtDate(i.done_at))}</em>` : ''}</span></li>`;
    return `
        <div class="rc-ro${compact ? ' rc-ro-compact' : ''}">
            <div class="rc-ro-title"><i data-lucide="list-checks"></i> Check on 2nd visit <span class="rc-count">${done.length}/${items.length} done</span></div>
            <ul class="rc-ro-list">${open.map(row).join('')}${done.map(row).join('')}</ul>
        </div>`;
}

function itemRow(mlsId, i) {
    const m = escapeHtml(mlsId);
    return `
        <li class="rc-item${i.done ? ' is-done' : ''}">
            <input type="checkbox" class="rc-check" ${i.done ? 'checked' : ''} aria-label="Done" onchange="window.retourCheckToggle('${m}', '${i.id}', this.checked)">
            <input type="text" class="input-text rc-text" maxlength="${MAX_TEXT}" value="${escapeHtml(i.text || '')}" aria-label="Item" onchange="window.retourCheckEdit('${m}', '${i.id}', this)">
            ${i.done && i.done_at ? `<span class="rc-date">${escapeHtml(fmtDate(i.done_at))}</span>` : ''}
            <button type="button" class="rc-remove" title="Remove" aria-label="Remove" onclick="window.retourCheckRemove('${m}', '${i.id}')"><i data-lucide="x"></i></button>
        </li>`;
}

function innerHtml(p) {
    const items = parseRetourChecks(p);
    const open = items.filter(i => !i.done);
    const done = items.filter(i => i.done);
    const m = escapeHtml(p.mls_id);
    const full = items.length >= MAX_ITEMS;
    return `
        <div class="rc-head">
            <h3><i data-lucide="list-checks"></i> Check on 2nd visit</h3>
            <span class="rc-count">${items.length ? `${done.length}/${items.length} done` : 'Prints on the Re-tour sheet'}</span>
        </div>
        ${open.length ? `<ul class="rc-list">${open.map(i => itemRow(p.mls_id, i)).join('')}</ul>` : ''}
        <div class="rc-add">
            <input type="text" class="input-text" id="rc-new-${m}" maxlength="${MAX_TEXT}" placeholder="${full ? 'List is full (30 items)' : 'Something to look at next time…'}" ${full ? 'disabled' : ''} onkeydown="if(event.key==='Enter'){event.preventDefault();window.retourCheckAdd('${m}');}">
            <button type="button" class="btn btn-secondary btn-sm" ${full ? 'disabled' : ''} onclick="window.retourCheckAdd('${m}')"><i data-lucide="plus"></i> Add</button>
        </div>
        ${done.length ? `<div class="rc-done-head">Done</div><ul class="rc-list rc-list-done">${done.map(i => itemRow(p.mls_id, i)).join('')}</ul>` : ''}
        <div class="rc-foot"><i data-lucide="users" style="width:12px; height:12px; vertical-align:-1px;"></i> Your realtor can see this list.</div>`;
}

/** Editable section for the buyer's detail modal. Only shown once the home is marked toured. */
export function retourChecksSectionHtml(p) {
    if (!p || !Number(p.toured)) return '';
    if (state.currentUserProfile?.role === 'realtor') return '';
    return `<div class="rc-section" id="rc-section-${escapeHtml(p.mls_id)}">${innerHtml(p)}</div>`;
}

function rerender(p) {
    const box = document.getElementById(`rc-section-${p.mls_id}`);
    if (!box) return;
    box.innerHTML = innerHtml(p);
    if (window.lucide) window.lucide.createIcons({ root: box });
}

function findProp(mlsId) {
    return (state.allProperties || []).find(x => x.mls_id === mlsId);
}

let saveChain = Promise.resolve();

/** Saves the whole list (the server replaces it) and keeps the local copy in step. */
function save(p, list, focusNew = false) {
    const prev = p.retour_checks_json;
    p.retour_checks_json = list.length ? JSON.stringify(list) : null;
    delete p.retour_checks;
    rerender(p);
    if (focusNew) document.getElementById(`rc-new-${p.mls_id}`)?.focus();
    saveChain = saveChain.then(() => apiFetch(CONFIG.API_URL + '?action=update_user_data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mls_id: p.mls_id, retour_checks: list })
    })).then(res => {
        if (!res?.success) throw new Error(res?.error || 'Could not save the list');
    }).catch(err => {
        p.retour_checks_json = prev;
        rerender(p);
        showToast(err.message || 'Could not save the list', 'error');
    });
}

window.retourCheckAdd = function (mlsId) {
    const p = findProp(mlsId);
    const input = document.getElementById(`rc-new-${mlsId}`);
    if (!p || !input) return;
    const text = input.value.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
    if (!text) return;
    const list = parseRetourChecks(p).slice();
    if (list.length >= MAX_ITEMS) { showToast('The list holds up to 30 items.', 'warning'); return; }
    list.push({ id: newId(), text, done: false, done_at: null });
    save(p, list, true);
};

window.retourCheckToggle = function (mlsId, id, checked) {
    const p = findProp(mlsId);
    if (!p) return;
    const list = parseRetourChecks(p).map(i => i.id === id ? { ...i, done: !!checked, done_at: checked ? todayLocal() : null } : i);
    save(p, list);
};

window.retourCheckEdit = function (mlsId, id, input) {
    const p = findProp(mlsId);
    if (!p) return;
    const text = String(input.value || '').replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT);
    const list = parseRetourChecks(p);
    if (!text) { input.value = (list.find(i => i.id === id) || {}).text || ''; return; }
    save(p, list.map(i => i.id === id ? { ...i, text } : i));
};

window.retourCheckRemove = function (mlsId, id) {
    const p = findProp(mlsId);
    if (!p) return;
    save(p, parseRetourChecks(p).filter(i => i.id !== id));
};
