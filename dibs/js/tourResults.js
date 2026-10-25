/**
 * Tour results: type in what you wrote on the printed tour packet, in the same order as the paper.
 *   Per home (tour order): the six 1-5 ratings, Love it / See it again / Pass, and notes.
 *   For the tour: your top 3, overall impressions, and follow-ups.
 * Saving marks the homes you filled in as toured, applies each decision, moves the top 3 to the top
 * of Top Picks, and lets your realtor see it all. Your realtor opens the same screen read-only.
 *
 * Opened from the Tour view ("Tour Results") or the "Rate it in Dibs" QR on a packet sheet
 * (?results=<MLS #>, handled in deepLink.js), which scrolls to that home.
 * Backend: get_tour_debrief / save_tour_debrief in backend/properties.php.
 */
import { apiFetch } from './api.js';
import { state } from './state.js';
import { showToast } from './toast.js';
import { escapeHtml, NO_PHOTO_IMG, fetchProperties } from './properties.js';

const esc = v => escapeHtml(String(v ?? ''));
const money = v => v ? '$' + Math.round(v).toLocaleString() : '';
// Same labels and order as the packet's "Your notes" (js/tourPacket.js buyerHomePage).
const SCORES = [
    ['overall', 'Overall'], ['layout', 'Layout & flow'], ['condition', 'Condition'],
    ['location', 'Location & street'], ['value', 'Value for price'], ['live_here', 'Would live here'],
];
const DECISIONS = [['love', 'Love it'], ['again', 'See it again'], ['pass', 'Pass']];

let data = null;
let form = null;        // { homes: {mls: {scores, decision, notes}}, top3: [], impressions, followups: [] }
let savedJson = '';
let original = {};     // per home, the values at load (to send only what changed)
let editable = false;
let clientId = null;

/** tour_notes is stored as HTML (the detail modal edits it as rich text); show it as plain text. */
function htmlToText(html) {
    if (!html) return '';
    const doc = new DOMParser().parseFromString(String(html).replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li)>/gi, '\n'), 'text/html');
    return (doc.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
}

function ensureModal() {
    let m = document.getElementById('modal-tour-results');
    if (m) return m;
    m = document.createElement('div');
    m.className = 'modal-overlay';
    m.id = 'modal-tour-results';
    m.innerHTML = `
        <div class="modal-content tour-results-modal" role="dialog" aria-labelledby="tour-results-title">
            <button class="modal-close" aria-label="Close" data-tr="close"><i data-lucide="x"></i></button>
            <div class="my-home-header">
                <h2><i data-lucide="clipboard-check"></i> <span id="tour-results-title">Tour Results</span></h2>
                <p id="tour-results-subtitle"></p>
            </div>
            <div id="tour-results-body"><p class="my-home-loading">Loading…</p></div>
            <div class="my-home-actions" id="tour-results-actions"></div>
        </div>`;
    document.body.appendChild(m);
    return m;
}

function initForm() {
    const homes = {};
    data.stops.forEach(s => {
        homes[s.mls_id] = { scores: { ...(s.scores || {}) }, decision: s.decision || '', notes: htmlToText(s.tour_notes) };
    });
    const d = data.debrief || {};
    form = {
        homes,
        top3: [...(d.top3 || [])],
        impressions: d.impressions || '',
        followups: (d.followups || []).map(f => ({ text: f.text || '', done: !!f.done })),
    };
    normalizeTop3();
    original = JSON.parse(JSON.stringify(homes));
    savedJson = JSON.stringify(form);
}

const dirty = () => form && JSON.stringify(form) !== savedJson;

/** Three slots; a slot whose home is no longer "Love it" is emptied (other slots don't shift). */
function normalizeTop3() {
    const t = [0, 1, 2].map(j => form.top3[j] || '').map(id => (id && form.homes[id]?.decision === 'love') ? id : '');
    form.top3 = t.map((id, j) => (id && t.indexOf(id) === j) ? id : '');
}

function dotsHtml(mls, key, value) {
    let h = '';
    for (let n = 1; n <= 5; n++) {
        h += `<button type="button" class="tr-dot${value >= n ? ' is-on' : ''}" ${editable ? '' : 'disabled'}
            data-tr="score" data-mls="${esc(mls)}" data-key="${key}" data-n="${n}" aria-label="${n} of 5" aria-pressed="${value === n}">${n}</button>`;
    }
    return h;
}

function homeHtml(s, i) {
    const f = form.homes[s.mls_id];
    const muted = s.stop_status === 'unavailable' ? ' <span class="tr-tag">Showing unavailable</span>' : '';
    return `
        <section class="tr-home" id="tr-home-${esc(s.mls_id)}">
            <div class="tr-home-head">
                <span class="tr-stop">${i + 1}</span>
                <img src="${esc(s.main_image_url || NO_PHOTO_IMG)}" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${NO_PHOTO_IMG}';" alt="">
                <div>
                    <div class="tr-addr">${esc(s.address)}${s.city ? `, ${esc(s.city)}` : ''}${muted}</div>
                    <div class="tp-facts">${esc([money(s.price), s.beds ? `${s.beds} bd` : '', s.baths ? `${s.baths} ba` : '', s.sqft_finished ? `${Number(s.sqft_finished).toLocaleString()} fin sqft` : ''].filter(Boolean).join(' · '))}${s.pick_rank ? ` · <strong>Your #${s.pick_rank}</strong>` : ''}</div>
                </div>
            </div>
            <div class="tr-scores">
                ${SCORES.map(([k, label]) => `<div class="tr-score"><span>${label}</span><span class="tr-dots">${dotsHtml(s.mls_id, k, f.scores[k] || 0)}</span></div>`).join('')}
            </div>
            <div class="tr-decision" role="group" aria-label="Decision">
                ${DECISIONS.map(([v, label]) => `<button type="button" class="btn btn-secondary btn-sm${f.decision === v ? ' is-on' : ''}" ${editable ? '' : 'disabled'} data-tr="decision" data-mls="${esc(s.mls_id)}" data-v="${v}" aria-pressed="${f.decision === v}">${label}</button>`).join('')}
            </div>
            <textarea class="tr-notes" rows="3" data-tr-input="notes" data-mls="${esc(s.mls_id)}" placeholder="${editable ? 'Your notes from this home' : ''}" ${editable ? '' : 'readonly'}>${esc(f.notes)}</textarea>
        </section>`;
}

function topOptions(selected, slot) {
    // Homes you loved on this tour; "Love it" makes a home a favorite, which Top Picks needs.
    const loved = data.stops.filter(s => form.homes[s.mls_id].decision === 'love');
    const taken = form.top3.filter((id, j) => j !== slot);
    let opts = `<option value="">—</option>`;
    loved.forEach(s => {
        if (taken.includes(s.mls_id)) return;
        opts += `<option value="${esc(s.mls_id)}" ${selected === s.mls_id ? 'selected' : ''}>${esc(s.address)}</option>`;
    });
    return opts;
}

function render() {
    const body = document.getElementById('tour-results-body');
    const actions = document.getElementById('tour-results-actions');
    if (!body || !data) return;
    if (!data.stops.length) {
        body.innerHTML = `<p class="tp-empty">${editable ? 'There are no homes on your tour yet.' : 'This client has no homes on their tour.'}</p>`;
        actions.innerHTML = `<button type="button" class="btn btn-secondary" data-tr="close">Close</button>`;
        return;
    }
    normalizeTop3();
    const lovedCount = data.stops.filter(s => form.homes[s.mls_id].decision === 'love').length;
    body.innerHTML = `
        ${data.stops.map(homeHtml).join('')}
        <section class="tr-tour">
            <h3 class="my-home-section-title"><i data-lucide="trophy"></i> Your top picks from this tour</h3>
            ${lovedCount
                ? `<div class="tr-top3">${[0, 1, 2].map(j => `<label><span>${j + 1}.</span><select data-tr-input="top3" data-slot="${j}" ${editable ? '' : 'disabled'}>${topOptions(form.top3[j] || '', j)}</select></label>`).join('')}</div>
                   <p class="tp-note">These move to the top of Top Picks in this order when you save.</p>`
                : `<p class="tp-note">Mark homes "Love it" to pick your top 3 from this tour.</p>`}
            <h3 class="my-home-section-title"><i data-lucide="message-square-text"></i> Overall impressions</h3>
            <textarea class="tr-notes" rows="3" data-tr-input="impressions" ${editable ? '' : 'readonly'}>${esc(form.impressions)}</textarea>
            <h3 class="my-home-section-title"><i data-lucide="list-checks"></i> Follow-ups</h3>
            <div class="tr-followups">
                ${form.followups.map((f, j) => `
                    <div class="tr-followup">
                        <input type="checkbox" data-tr-input="fu-done" data-j="${j}" ${f.done ? 'checked' : ''} ${editable ? '' : 'disabled'} aria-label="Done">
                        <input type="text" maxlength="200" data-tr-input="fu-text" data-j="${j}" value="${esc(f.text)}" ${editable ? '' : 'readonly'}>
                        ${editable ? `<button type="button" class="btn btn-secondary btn-sm" data-tr="fu-remove" data-j="${j}" aria-label="Remove"><i data-lucide="x"></i></button>` : ''}
                    </div>`).join('')}
                ${!form.followups.length && !editable ? '<p class="tp-note">None.</p>' : ''}
                ${editable && form.followups.length < 20 ? `<button type="button" class="btn btn-secondary btn-sm" data-tr="fu-add"><i data-lucide="plus"></i> Add follow-up</button>` : ''}
            </div>
        </section>`;
    paintActions();
    if (window.lucide) window.lucide.createIcons();
}

function paintActions() {
    const actions = document.getElementById('tour-results-actions');
    if (!actions) return;
    const d = dirty();
    actions.innerHTML = editable
        ? `${d ? '<span class="tp-dirty">Unsaved changes</span>' : ''}
           <button type="button" class="btn btn-secondary" data-tr="close">${d ? 'Discard' : 'Close'}</button>
           <button type="button" class="btn btn-primary" data-tr="save" ${d ? '' : 'disabled'}><i data-lucide="save"></i> Save results</button>`
        : `<button type="button" class="btn btn-secondary" data-tr="close">Close</button>`;
    if (window.lucide) window.lucide.createIcons();
}

/**
 * Opens Tour Results. focusMls scrolls to one home. forClientId (realtor/admin) opens that
 * client's results read-only.
 */
export async function openTourResults(focusMls = null, forClientId = null) {
    const m = ensureModal();
    m.classList.add('active');
    clientId = forClientId;
    data = null;
    document.getElementById('tour-results-body').innerHTML = '<p class="my-home-loading">Loading…</p>';
    document.getElementById('tour-results-actions').innerHTML = '';
    try {
        const q = forClientId ? `&client_id=${encodeURIComponent(forClientId)}` : '';
        const res = await apiFetch(`backend/api.php?action=get_tour_debrief${q}`);
        if (!res || !res.success) throw new Error(res?.error || 'Could not load tour results.');
        data = res;
        editable = !!res.editable && !forClientId;
        const when = new Date(res.tour_date + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
        document.getElementById('tour-results-title').textContent = `Tour Results · ${when}`;
        document.getElementById('tour-results-subtitle').textContent = editable
            ? 'Copy in what you wrote on your tour packet. Homes you fill in are marked toured, and your realtor sees everything here.'
            : "What the client wrote on their tour packet. Read-only.";
        initForm();
        render();
        if (focusMls) document.getElementById(`tr-home-${focusMls}`)?.scrollIntoView({ block: 'start' });
    } catch (e) {
        document.getElementById('tour-results-body').innerHTML = `<p class="my-home-loading">${esc(e.message)}</p>`;
        document.getElementById('tour-results-actions').innerHTML = `<button type="button" class="btn btn-secondary" data-tr="close">Close</button>`;
    }
}

function close(force = false) {
    if (!force && editable && dirty() && !window.confirm('Discard your unsaved tour results?')) return;
    document.getElementById('modal-tour-results')?.classList.remove('active');
}

async function save(btn) {
    btn.disabled = true;
    // Only homes you changed are sent, so untouched homes aren't marked toured. Notes go only when
    // edited, so rich-text notes written in the detail view aren't flattened.
    const homes = Object.entries(form.homes).filter(([id, h]) => JSON.stringify(h) !== JSON.stringify(original[id]))
        .map(([mls_id, h]) => {
            const out = { mls_id, scores: Object.fromEntries(Object.entries(h.scores).filter(([, v]) => v)), decision: h.decision };
            if (h.notes !== original[mls_id].notes) out.notes = h.notes;
            return out;
        });
    try {
        const res = await apiFetch('backend/api.php?action=save_tour_debrief', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tour_date: data.tour_date, homes, top3: form.top3.filter(Boolean), impressions: form.impressions, followups: form.followups }),
        });
        if (!res || !res.success) throw new Error(res?.error || 'Could not save tour results.');
        savedJson = JSON.stringify(form);
        showToast(res.skipped_top3?.length
            ? 'Saved. Some top picks couldn\'t be ranked (they need to be available favorites).'
            : 'Tour results saved. Your realtor can see them.', res.skipped_top3?.length ? 'warning' : 'success');
        // Reload the listings so cards, ranks and decisions match what was saved.
        try { fetchProperties(); } catch (_) { /* the grid refreshes on its next load */ }
        openTourResults(null, clientId);
    } catch (e) {
        showToast(e.message, 'error');
        btn.disabled = false;
    }
}

document.addEventListener('click', event => {
    const t = event.target;
    if (!(t instanceof Element)) return;
    if (t.closest('[data-open-tour-results]')) {
        const el = t.closest('[data-open-tour-results]');
        openTourResults(null, el.dataset.clientId || null);
        return;
    }
    if (t.id === 'modal-tour-results') { close(); return; }
    const el = t.closest('[data-tr]');
    if (!el || !el.closest('#modal-tour-results')) return;
    const mls = el.dataset.mls;
    switch (el.dataset.tr) {
        case 'close': close(); break;
        case 'save': save(el); break;
        case 'score': {
            const sc = form.homes[mls].scores, k = el.dataset.key, n = Number(el.dataset.n);
            if (sc[k] === n) delete sc[k]; else sc[k] = n;   // tap the same dot again to clear
            const wrap = el.parentElement;
            wrap.querySelectorAll('.tr-dot').forEach(d => {
                const dn = Number(d.dataset.n);
                d.classList.toggle('is-on', (sc[k] || 0) >= dn);
                d.setAttribute('aria-pressed', String(sc[k] === dn));
            });
            paintActions();
            break;
        }
        case 'decision': {
            const h = form.homes[mls];
            h.decision = h.decision === el.dataset.v ? '' : el.dataset.v;
            const y = document.getElementById('tour-results-body')?.parentElement?.scrollTop;
            render();
            const box = document.querySelector('#modal-tour-results .tour-results-modal');
            if (box && y != null) box.scrollTop = y;
            break;
        }
        case 'fu-add': form.followups.push({ text: '', done: false }); render(); break;
        case 'fu-remove': form.followups.splice(Number(el.dataset.j), 1); render(); break;
    }
});

document.addEventListener('input', event => {
    const el = event.target;
    if (!(el instanceof Element) || !el.closest('#modal-tour-results') || !el.dataset.trInput) return;
    const j = Number(el.dataset.j);
    switch (el.dataset.trInput) {
        case 'notes': form.homes[el.dataset.mls].notes = el.value; break;
        case 'impressions': form.impressions = el.value; break;
        case 'fu-text': form.followups[j].text = el.value; break;
        case 'fu-done': form.followups[j].done = el.checked; break;
        case 'top3': form.top3[Number(el.dataset.slot)] = el.value; render(); return;
    }
    paintActions();
});
document.addEventListener('change', event => {
    const el = event.target;
    if (el instanceof HTMLInputElement && el.type === 'checkbox' && el.dataset.trInput === 'fu-done' && el.closest('#modal-tour-results')) {
        form.followups[Number(el.dataset.j)].done = el.checked;
        paintActions();
    }
});

document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && document.getElementById('modal-tour-results')?.classList.contains('active')) close();
});

window.openTourResults = openTourResults;
