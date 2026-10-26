/**
 * Agent schedule (backend/schedule.php): one calendar across all of a realtor's clients.
 *
 * Opens from the header's Schedule button (realtors and admins). Shows a week strip and the
 * selected day's agenda: client showings (from each client's Tour Planner, or a time booked on the
 * client's Tour tab), the agent's own time blocks (meetings, closings, personal…), free gaps,
 * and conflicts: overlaps, and not enough drive time between different clients' showings.
 */
import { state } from './state.js';
import { apiFetch } from './api.js';
import { escapeHtml, cleanDisplayAddress } from './properties.js';
import { showToast } from './toast.js';

const esc = v => escapeHtml(String(v ?? ''));
const pad = n => String(n).padStart(2, '0');
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const LENGTHS = [[15, '15 min'], [30, '30 min'], [45, '45 min'], [60, '1 hour'], [90, '1½ hours'], [120, '2 hours'], [180, '3 hours'], [240, '4 hours'], [480, 'All day (8 hours)']];

let day = todayKey();      // selected 'YYYY-MM-DD'
let data = null;           // get_agent_schedule response for the week containing `day`
let form = null;           // null, or the time block being added/edited
let confirmDelete = null;  // event_id awaiting a second click

function isAgent() {
    const role = state.currentUserProfile?.role || '';
    return role === 'realtor' || role === 'admin' || Boolean(state.isAdmin);
}

function todayKey() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function parseKey(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); }
function keyOf(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function addDays(k, n) { const d = parseKey(k); d.setDate(d.getDate() + n); return keyOf(d); }
function weekStart(k) { const d = parseKey(k); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return keyOf(d); }
/** 'YYYY-MM-DD HH:MM' -> minutes since the epoch (local), for comparing and subtracting. */
function mins(t) {
    const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(t || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime() / 60000 : NaN;
}
function clock(t) {
    const m = /(\d{2}):(\d{2})$/.exec(t || '');
    if (!m) return '';
    const h = +m[1];
    return `${((h + 11) % 12) + 1}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`;
}
function span(n) {
    n = Math.round(n);
    return n < 60 ? `${n} min` : `${Math.floor(n / 60)} hr${n % 60 ? ` ${n % 60} min` : ''}`;
}
function longDate(k) {
    return parseKey(k).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}
function milesBetween(a, b) {
    const R = 3958.8, toRad = x => x * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}
/** Rough metro drive time: road distance ~1.3x straight line at ~30 mph, plus 5 minutes to park and walk in. */
function driveEstimate(a, b) {
    return Math.round(milesBetween(a, b) * 1.3 / 30 * 60) + 5;
}
function where(s) {
    return [cleanDisplayAddress(s.address, s.mls_id), s.city, 'CO', s.zip].filter(Boolean).join(', ');
}
function directionsUrl(destination) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

async function load(force = false) {
    const from = weekStart(day);
    if (!force && data && data.from === from) return;
    const res = await apiFetch(`backend/api.php?action=get_agent_schedule&from=${from}&days=7`);
    if (!res || !res.success) throw new Error(res?.error || 'Could not load the schedule.');
    data = res;
}

/** Everything on day k, sorted, each with a stable key, plus conflict notes. */
function dayItems(k) {
    if (!data) return { items: [], conflicts: [] };
    const dayStart = mins(`${k} 00:00`), dayEnd = dayStart + 1440;
    const items = [];
    data.showings.forEach(s => {
        const a = mins(s.start), b = mins(s.end);
        if (a < dayEnd && b > dayStart) items.push({ type: 'showing', key: `s|${s.client_id}|${s.mls_id}`, a, b, s, flags: [] });
    });
    data.events.forEach(e => {
        const a = mins(e.start), b = mins(e.end);
        if (a < dayEnd && b > dayStart) items.push({ type: 'event', key: `e|${e.event_id}`, a, b, e, flags: [] });
    });
    items.sort((x, y) => x.a - y.a || x.b - y.b);

    const label = it => it.type === 'event'
        ? `${it.e.title} (${clock(it.e.start)})`
        : `${firstName(it.s.client_name)}'s showing at ${cleanDisplayAddress(it.s.address, it.s.mls_id)} (${clock(it.s.start)})${it.s.status === 'pending' ? ', requested' : ''}`;
    const sameTour = (x, y) => x.type === 'showing' && y.type === 'showing' && String(x.s.client_id) === String(y.s.client_id);
    const conflicts = [];
    for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length && items[j].a < items[i].b; j++) {
            if (sameTour(items[i], items[j])) continue;
            items[i].flags.push('overlap'); items[j].flags.push('overlap');
            conflicts.push({ kind: 'overlap', text: `${label(items[i])} overlaps ${label(items[j])}.` });
        }
    }
    // Drive time between back-to-back showings for different clients.
    for (let i = 0; i + 1 < items.length; i++) {
        const x = items[i], y = items[i + 1];
        if (x.type !== 'showing' || y.type !== 'showing' || sameTour(x, y) || y.a < x.b) continue;
        if (x.s.lat == null || y.s.lat == null) continue;
        const need = driveEstimate({ lat: x.s.lat, lng: x.s.lng }, { lat: y.s.lat, lng: y.s.lng });
        const have = y.a - x.b;
        if (have < need) {
            y.flags.push('tight');
            conflicts.push({ kind: 'tight', text: `Only ${span(have)} to get from ${label(x)} to ${label(y)}: about ${span(need)} of driving.` });
        }
    }
    // Shared calendars: another agent has a showing at the same listing at an overlapping time.
    (data.office_showings || []).forEach(o => {
        const a = mins(o.start), b = mins(o.end);
        items.forEach(it => {
            if (it.type !== 'showing' || String(it.s.mls_id) !== String(o.mls_id) || !(a < it.b && b > it.a)) return;
            it.flags.push('overlap');
            conflicts.push({ kind: 'listing', text: `${o.agent_name} also has a showing at ${cleanDisplayAddress(it.s.address, it.s.mls_id)} from ${clock(o.start)} to ${clock(o.end)}.` });
        });
    });
    return { items, conflicts };
}

function firstName(n) { return String(n || '').trim().split(/\s+/)[0] || 'Client'; }

function weekHtml() {
    const start = weekStart(day);
    const today = todayKey();
    return `<div class="sched-week" role="tablist" aria-label="Week">
        ${Array.from({ length: 7 }, (_, i) => {
            const k = addDays(start, i);
            const { items, conflicts } = dayItems(k);
            const d = parseKey(k);
            return `<button type="button" role="tab" class="sched-day ${k === day ? 'is-active' : ''} ${k === today ? 'is-today' : ''}" data-sched-day="${k}" aria-selected="${k === day}">
                <span class="sched-day-name">${DAY_NAMES[d.getDay()]}</span>
                <span class="sched-day-num">${d.getDate()}</span>
                <span class="sched-day-count">${items.length ? `${items.length} item${items.length === 1 ? '' : 's'}` : '&nbsp;'}</span>
                ${conflicts.length ? `<span class="sched-day-alert" title="${conflicts.length} conflict${conflicts.length === 1 ? '' : 's'}">${conflicts.length}</span>` : ''}
            </button>`;
        }).join('')}
    </div>`;
}

function showingRow(it) {
    const s = it.s;
    return `<li class="sched-stop ${it.flags.length ? 'has-flag' : ''}">
        <span class="sched-time">${esc(clock(s.start))} – ${esc(clock(s.end))}</span>
        <div class="sched-stop-body">
            <div class="sched-stop-addr">${esc(cleanDisplayAddress(s.address, s.mls_id))}<span class="sched-muted"> · ${esc(s.city || '')}</span>
                ${s.status === 'pending' ? '<span class="sched-chip sched-chip--req">Requested</span>' : ''}
                ${it.flags.includes('overlap') ? '<span class="sched-chip sched-chip--bad">Overlap</span>' : ''}
                ${it.flags.includes('tight') ? '<span class="sched-chip sched-chip--warn">Tight drive</span>' : ''}
            </div>
            ${s.access_notes ? `<div class="sched-note"><i data-lucide="key"></i> ${esc(s.access_notes)}</div>` : ''}
        </div>
        <a class="btn btn-secondary btn-compact" href="${esc(directionsUrl(where(s)))}" target="_blank" rel="noopener noreferrer"><i data-lucide="navigation"></i> Directions</a>
    </li>`;
}

function eventHtml(it) {
    const e = it.e;
    const deleting = confirmDelete === e.event_id;
    return `<div class="sched-block sched-block--event sched-kind--${esc(e.kind)} ${it.flags.length ? 'has-flag' : ''}">
        <div class="sched-block-head">
            <span class="sched-time">${esc(clock(e.start))} – ${esc(clock(e.end))}</span>
            <span class="sched-chip">${esc(e.kind_label)}</span>
            <strong class="sched-title">${esc(e.title)}</strong>
            ${it.flags.includes('overlap') ? '<span class="sched-chip sched-chip--bad">Overlap</span>' : ''}
        </div>
        ${e.client_name || e.location ? `<div class="sched-muted">${[e.client_name ? `With ${esc(e.client_name)}` : '', esc(e.location)].filter(Boolean).join(' · ')}</div>` : ''}
        ${e.notes ? `<div class="sched-note">${esc(e.notes)}</div>` : ''}
        <div class="sched-block-actions">
            ${e.location ? `<a class="btn btn-secondary btn-compact" href="${esc(directionsUrl(e.location))}" target="_blank" rel="noopener noreferrer"><i data-lucide="navigation"></i> Directions</a>` : ''}
            <button type="button" class="btn btn-secondary btn-compact" data-sched="edit" data-event="${e.event_id}"><i data-lucide="pencil"></i> Edit</button>
            <button type="button" class="btn ${deleting ? 'btn-danger' : 'btn-secondary'} btn-compact" data-sched="delete" data-event="${e.event_id}"><i data-lucide="trash-2"></i> ${deleting ? 'Click again to delete' : 'Delete'}</button>
        </div>
    </div>`;
}

function agendaHtml() {
    const { items, conflicts } = dayItems(day);
    const parts = [];
    if (conflicts.length) {
        parts.push(`<div class="sched-conflicts" role="alert">
            <strong><i data-lucide="alert-triangle"></i> ${conflicts.length} conflict${conflicts.length === 1 ? '' : 's'} on this day</strong>
            <ul>${conflicts.map(c => `<li>${esc(c.text)}</li>`).join('')}</ul>
        </div>`);
    }
    if (!items.length) {
        parts.push(`<p class="sched-empty">Nothing scheduled. Add a time block, or set a tour date in a client's Tour Planner and their showings appear here.</p>`);
        return parts.join('');
    }
    // Consecutive showings for one client are one tour block.
    let prevEnd = null;
    for (let i = 0; i < items.length;) {
        const it = items[i];
        let group = [it];
        if (it.type === 'showing') {
            while (i + group.length < items.length) {
                const nx = items[i + group.length];
                if (nx.type !== 'showing' || String(nx.s.client_id) !== String(it.s.client_id)) break;
                group.push(nx);
            }
        }
        const start = group[0].a, end = Math.max(...group.map(g => g.b));
        if (prevEnd !== null && start - prevEnd >= 15) parts.push(`<div class="sched-gap">${span(start - prevEnd)} free</div>`);
        if (it.type === 'event') {
            parts.push(eventHtml(it));
        } else {
            const s = it.s;
            const allRequested = group.every(g => g.s.status === 'pending');
            const source = group.some(g => g.s.source === 'booked') ? 'Booked times' : 'From the Tour Planner';
            parts.push(`<div class="sched-block sched-block--tour ${group.some(g => g.flags.length) ? 'has-flag' : ''}">
                <div class="sched-block-head">
                    <span class="sched-time">${esc(clock(group[0].s.start))} – ${esc(clock(group[group.length - 1].s.end))}</span>
                    <span class="sched-chip sched-chip--tour">Tour</span>
                    <strong class="sched-title">${esc(s.client_name)}</strong>
                    <span class="sched-muted">${group.length} home${group.length === 1 ? '' : 's'} · ${source}${allRequested ? ' · not confirmed yet' : ''}</span>
                    <button type="button" class="btn btn-secondary btn-compact sched-push" data-sched="planner" data-client="${esc(s.client_id)}"><i data-lucide="route"></i> Tour Planner</button>
                </div>
                <ol class="sched-stops">${group.map(showingRow).join('')}</ol>
            </div>`);
        }
        prevEnd = prevEnd === null ? end : Math.max(prevEnd, end);
        i += group.length;
    }
    return parts.join('');
}

function unscheduledHtml() {
    const rows = data?.unscheduled || [];
    if (!rows.length) return '';
    const byClient = new Map();
    rows.forEach(r => {
        const k = String(r.client_id);
        if (!byClient.has(k)) byClient.set(k, { name: r.client_name, id: r.client_id, n: 0 });
        byClient.get(k).n++;
    });
    return `<div class="sched-unscheduled">
        <div class="sched-section-title"><i data-lucide="calendar-x"></i> Confirmed showings without a date</div>
        <ul>${[...byClient.values()].map(c => `<li>
            <span><strong>${esc(c.name)}</strong> · ${c.n} home${c.n === 1 ? '' : 's'}</span>
            <button type="button" class="btn btn-secondary btn-compact" data-sched="planner" data-client="${esc(c.id)}"><i data-lucide="route"></i> Set a tour date</button>
        </li>`).join('')}</ul>
    </div>`;
}

function timeOptions(selected) {
    const out = [];
    for (let h = 6; h <= 21; h++) for (const m of [0, 15, 30, 45]) {
        const v = `${pad(h)}:${pad(m)}`;
        out.push(`<option value="${v}" ${v === selected ? 'selected' : ''}>${clock(`x ${v}`)}</option>`);
    }
    return out.join('');
}

function formHtml() {
    if (!form) return '';
    const kinds = data?.kinds || {};
    const clients = data?.clients || [];
    return `<form class="sched-form" data-sched-form novalidate>
        <div class="sched-section-title">${form.event_id ? 'Edit time block' : 'Add a time block'}</div>
        <div class="sched-form-grid">
            <label>Type<select class="select-input" name="kind" required>
                ${Object.entries(kinds).map(([v, l]) => `<option value="${esc(v)}" ${v === form.kind ? 'selected' : ''}>${esc(l)}</option>`).join('')}
            </select></label>
            <label>Title <span class="sched-muted">(optional)</span><input class="text-input" name="title" maxlength="80" value="${esc(form.title || '')}" placeholder="e.g. Closing at Land Title"></label>
            <label>Date<input class="text-input" type="date" name="date" required value="${esc(form.date)}"></label>
            <label>Starts<select class="select-input" name="time" required>${timeOptions(form.time)}</select></label>
            <label>Length<select class="select-input" name="duration" required>
                ${LENGTHS.map(([v, l]) => `<option value="${v}" ${v === form.duration ? 'selected' : ''}>${l}</option>`).join('')}
            </select></label>
            <label>Client <span class="sched-muted">(optional)</span><select class="select-input" name="client">
                <option value="">None</option>
                ${clients.map(c => `<option value="${esc(c.client_id)}" ${String(c.client_id) === String(form.client_id || '') ? 'selected' : ''}>${esc(c.client_name)}</option>`).join('')}
            </select></label>
            <label class="sched-wide">Location <span class="sched-muted">(optional)</span><input class="text-input" name="location" maxlength="200" value="${esc(form.location || '')}" placeholder="Address or place"></label>
            <label class="sched-wide">Notes <span class="sched-muted">(optional)</span><textarea class="text-input" name="notes" maxlength="500" rows="2">${esc(form.notes || '')}</textarea></label>
        </div>
        <div class="brief-actions">
            <button type="button" class="btn btn-secondary" data-sched="form-cancel">Cancel</button>
            <button type="submit" class="btn btn-primary"><i data-lucide="check"></i> ${form.event_id ? 'Save changes' : 'Add to schedule'}</button>
        </div>
    </form>`;
}

function paint() {
    const body = document.getElementById('sched-body');
    if (!body) return;
    body.innerHTML = `
        <div class="sched-toolbar">
            <div class="sched-nav">
                <button type="button" class="btn btn-secondary btn-compact" data-sched="prev-week" title="Previous week" aria-label="Previous week"><i data-lucide="chevrons-left"></i></button>
                <button type="button" class="btn btn-secondary btn-compact" data-sched="prev" title="Previous day" aria-label="Previous day"><i data-lucide="chevron-left"></i></button>
                <input type="date" class="text-input sched-date" value="${esc(day)}" aria-label="Date" data-sched-date>
                <button type="button" class="btn btn-secondary btn-compact" data-sched="next" title="Next day" aria-label="Next day"><i data-lucide="chevron-right"></i></button>
                <button type="button" class="btn btn-secondary btn-compact" data-sched="next-week" title="Next week" aria-label="Next week"><i data-lucide="chevrons-right"></i></button>
                <button type="button" class="btn btn-secondary btn-compact" data-sched="today">Today</button>
            </div>
            <div class="sched-nav">
                <button type="button" class="btn btn-secondary btn-compact" data-sched="ics"><i data-lucide="download"></i> Export day</button>
                <button type="button" class="btn btn-secondary btn-compact" data-sched="print"><i data-lucide="printer"></i> Print</button>
                <button type="button" class="btn btn-primary btn-compact" data-sched="add"><i data-lucide="plus"></i> Add time block</button>
            </div>
        </div>
        ${weekHtml()}
        ${formHtml()}
        <h3 class="sched-day-title">${esc(longDate(day))}</h3>
        ${agendaHtml()}
        ${unscheduledHtml()}`;
    if (window.lucide) window.lucide.createIcons();
}

function ensureModal() {
    let modal = document.getElementById('modal-schedule');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'modal-schedule';
    modal.innerHTML = `
        <div class="modal-content schedule-modal" role="dialog" aria-modal="true" aria-labelledby="sched-heading">
            <button class="modal-close" aria-label="Close" data-sched="close"><i data-lucide="x"></i></button>
            <div class="my-home-header"><h2 id="sched-heading"><i data-lucide="calendar-days"></i> My schedule</h2></div>
            <div id="sched-body"><p class="brief-empty">Loading your schedule…</p></div>
        </div>`;
    document.body.appendChild(modal);
    return modal;
}

async function go(k, force = false) {
    day = k;
    confirmDelete = null;
    try { await load(force); paint(); } catch (e) {
        const body = document.getElementById('sched-body');
        if (body) body.innerHTML = `<p class="brief-empty">${esc(e.message)}</p>`;
    }
}

export async function openSchedule(k = null) {
    if (!isAgent()) return;
    ensureModal().classList.add('active');
    if (window.lucide) window.lucide.createIcons();
    form = null;
    await go(k || day, true);
}
window.openSchedule = openSchedule;

function closeModal() {
    document.getElementById('modal-schedule')?.classList.remove('active');
    form = null;
}

function icsEscape(s) {
    return String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}
function icsTime(t) { return t.replace(/[-:]/g, '').replace(' ', 'T') + '00'; }

function exportDay() {
    const { items } = dayItems(day);
    if (!items.length) { showToast('Nothing on this day to export.', 'info'); return; }
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Dibs//Agent Schedule//EN', 'CALSCALE:GREGORIAN'];
    items.forEach(it => {
        const x = it.type === 'event' ? it.e : it.s;
        const summary = it.type === 'event' ? x.title : `Showing: ${cleanDisplayAddress(x.address, x.mls_id)} (${x.client_name})${x.status === 'pending' ? ' [requested]' : ''}`;
        const loc = it.type === 'event' ? x.location : where(x);
        const desc = it.type === 'event' ? [x.client_name ? `Client: ${x.client_name}` : '', x.notes].filter(Boolean).join('\n') : (x.access_notes ? `Access: ${x.access_notes}` : '');
        lines.push('BEGIN:VEVENT', `UID:${it.key.replace(/\|/g, '-')}-${day}@dibs`, `DTSTAMP:${stamp}`,
            `DTSTART:${icsTime(x.start)}`, `DTEND:${icsTime(x.end)}`, `SUMMARY:${icsEscape(summary)}`);
        if (loc) lines.push(`LOCATION:${icsEscape(loc)}`);
        if (desc) lines.push(`DESCRIPTION:${icsEscape(desc)}`);
        lines.push('END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    const url = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `schedule-${day}.ics` });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function printDay() {
    const { items, conflicts } = dayItems(day);
    const rows = items.map(it => {
        const x = it.type === 'event' ? it.e : it.s;
        const what = it.type === 'event'
            ? `${esc(x.kind_label)}: ${esc(x.title)}${x.client_name ? ` (with ${esc(x.client_name)})` : ''}`
            : `Showing for ${esc(x.client_name)}${x.status === 'pending' ? ' (requested)' : ''}`;
        const place = it.type === 'event' ? esc(x.location) : esc(where(x));
        const notes = it.type === 'event' ? esc(x.notes) : esc(x.access_notes);
        return `<tr><td>${esc(clock(x.start))}–${esc(clock(x.end))}</td><td>${what}</td><td>${place}</td><td>${notes}</td></tr>`;
    }).join('');
    const w = window.open('', '_blank');
    if (!w) { showToast('Allow pop-ups for this site to print.', 'error'); return; }
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Schedule ${esc(day)}</title>
        <style>body{font:13px system-ui,sans-serif;margin:24px;color:#111}h1{font-size:18px}table{width:100%;border-collapse:collapse}
        td,th{border-bottom:1px solid #ccc;padding:6px;text-align:left;vertical-align:top}.c{color:#a00}</style></head><body>
        <h1>${esc(longDate(day))}</h1>
        ${conflicts.length ? `<p class="c"><strong>Conflicts:</strong></p><ul class="c">${conflicts.map(c => `<li>${esc(c.text)}</li>`).join('')}</ul>` : ''}
        <table><thead><tr><th>Time</th><th>What</th><th>Where</th><th>Notes</th></tr></thead><tbody>${rows || '<tr><td colspan="4">Nothing scheduled.</td></tr>'}</tbody></table>
        </body></html>`);
    w.document.close();
    w.focus();
    w.print();
}

async function saveForm(f) {
    const v = name => f.elements[name]?.value ?? '';
    const date = v('date');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { showToast('Choose a date.', 'error'); return; }
    const payload = {
        event_id: form.event_id || 0,
        kind: v('kind'),
        title: v('title').trim().slice(0, 80),
        start: `${date} ${v('time')}`,
        duration_mins: Number(v('duration')),
        client_id: v('client') || null,
        location: v('location').trim().slice(0, 200),
        notes: v('notes').trim().slice(0, 500),
    };
    const btn = f.querySelector('[type="submit"]');
    btn.disabled = true;
    try {
        const res = await apiFetch('backend/api.php?action=save_agent_event', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        });
        if (!res || !res.success) throw new Error(res?.error || 'Could not save.');
        showToast(form.event_id ? 'Time block updated.' : 'Added to your schedule.', 'success');
        form = null;
        await go(date, true);
    } catch (e) {
        showToast(e.message || 'Could not save.', 'error');
        btn.disabled = false;
    }
}

document.addEventListener('click', async event => {
    const t = event.target;
    if (!(t instanceof Element)) return;
    if (t.closest('#btn-schedule-direct')) { openSchedule(); return; }
    const modal = t.closest('#modal-schedule');
    if (!modal) return;
    if (t.id === 'modal-schedule') { closeModal(); return; }
    const dayBtn = t.closest('[data-sched-day]');
    if (dayBtn) { go(dayBtn.dataset.schedDay); return; }
    const btn = t.closest('[data-sched]');
    if (!btn) return;
    const id = Number(btn.dataset.event || 0);
    switch (btn.dataset.sched) {
        case 'close': closeModal(); break;
        case 'prev': go(addDays(day, -1)); break;
        case 'next': go(addDays(day, 1)); break;
        case 'prev-week': go(addDays(day, -7)); break;
        case 'next-week': go(addDays(day, 7)); break;
        case 'today': go(todayKey()); break;
        case 'ics': exportDay(); break;
        case 'print': printDay(); break;
        case 'add':
            form = { event_id: 0, kind: 'client_meeting', title: '', date: day, time: '09:00', duration: 60, client_id: '', location: '', notes: '' };
            paint();
            document.querySelector('[data-sched-form] select[name="kind"]')?.focus();
            break;
        case 'form-cancel': form = null; paint(); break;
        case 'edit': {
            const e = data?.events.find(x => x.event_id === id);
            if (!e) break;
            const len = Math.round(mins(e.end) - mins(e.start));
            form = {
                event_id: e.event_id, kind: e.kind, title: e.title, date: e.start.slice(0, 10), time: e.start.slice(11, 16),
                duration: LENGTHS.some(([v]) => v === len) ? len : 60, client_id: e.client_id || '', location: e.location, notes: e.notes,
            };
            paint();
            document.querySelector('[data-sched-form]')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            break;
        }
        case 'delete':
            if (confirmDelete !== id) { confirmDelete = id; paint(); break; }
            try {
                const res = await apiFetch('backend/api.php?action=delete_agent_event', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_id: id }),
                });
                if (!res?.success) throw new Error(res?.error || 'Could not delete.');
                showToast('Time block deleted.', 'success');
                await go(day, true);
            } catch (e) { showToast(e.message || 'Could not delete.', 'error'); }
            break;
        case 'planner':
            await window.tourViewManager?.flushAutosave?.();
            try { localStorage.setItem('active_tour_client_id', String(btn.dataset.client)); } catch (e) { /* storage unavailable */ }
            closeModal();
            window.switchView?.('tour');
            break;
    }
});

document.addEventListener('change', event => {
    const t = event.target;
    if (t instanceof HTMLInputElement && t.matches('#modal-schedule [data-sched-date]') && /^\d{4}-\d{2}-\d{2}$/.test(t.value)) go(t.value);
});

document.addEventListener('submit', event => {
    const f = event.target;
    if (!(f instanceof HTMLFormElement) || !f.matches('#modal-schedule [data-sched-form]')) return;
    event.preventDefault();
    saveForm(f);
});

document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && document.getElementById('modal-schedule')?.classList.contains('active')) closeModal();
});
