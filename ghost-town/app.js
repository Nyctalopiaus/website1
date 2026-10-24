// Ghost Town — count-based grid scan: per cell, all-time vs. recent WiGLE counts.
'use strict';

const API = 'api/';
const BATCH = 10;               // WiGLE queries per server call
const EMPTY_MIN = 5;            // fewer all-time networks than this = empty/undriven
const $ = (id) => document.getElementById(id);

const map = L.map('map', { preferCanvas: true }).setView([39.5, -98.35], 4);
// Standard OSM tiles (no key), darkened via CSS (.dark-tiles in style.css).
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19, className: 'dark-tiles',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);

let area = null;
let grid = null;                // server response: cells, counts, types…
let gridLayer = L.layerGroup().addTo(map);
let boxLayer = null;
let cellLayers = {};            // "r_c" -> rectangle
let scanning = false, stopRequested = false;
let within = null;              // {m, r, c} while drilling into one parent cell
const SIZE_NAME = { 1: '~500 m', 2: '~1 km', 4: '~2 km' };

function inWithin(cell) {
  if (!within) return true;
  return Math.floor(cell.r * grid.size / within.m) === within.r
      && Math.floor(cell.c * grid.size / within.m) === within.c;
}

const msg = (t) => { $('msg').textContent = t || ''; };
const years = () => Number($('age').value);
const selectedTypes = () => [...document.querySelectorAll('input[name=type]:checked')].map((c) => c.value);

async function api(path, opts) {
  const res = await fetch(API + path, opts);
  let data;
  try { data = await res.json(); } catch { throw new Error(`Server error (HTTP ${res.status})`); }
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function showQuota(q) {
  if (q) $('quota').textContent = `· ${q.queries} queries today${q.hit_limit ? ' (limit hit)' : ''}`;
}

// Sum counts across the checked types; null if any needed count is missing.
function cellStats(key, y) {
  const c = grid.counts[key] || {};
  let total = 0, recent = 0;
  for (const t of grid.types) {
    const all = c[t]?.[0];
    if (all === undefined) return null;
    total += all;
    if (all === 0) continue;
    const rec = c[t]?.[y];
    if (rec === undefined) return { total, recent: null };
    recent += rec;
  }
  return { total, recent };
}

function queriesNeeded(y) {
  let n = 0;
  for (const cell of grid.cells) {
    if (!inWithin(cell)) continue;
    const c = grid.counts[`${cell.r}_${cell.c}`] || {};
    for (const t of grid.types) {
      if (c[t]?.[0] === undefined) n += 2;            // all-time + year (year may turn out free)
      else if (c[t][0] > 0 && c[t]?.[y] === undefined) n += 1;
    }
  }
  return n;
}

function lerpColor(a, b, t) {
  const pa = a.match(/\w\w/g).map((h) => parseInt(h, 16));
  const pb = b.match(/\w\w/g).map((h) => parseInt(h, 16));
  return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

function draw() {
  if (!grid) return;
  const y = years();
  $('ageLabel').textContent = y;
  gridLayer.clearLayers();
  cellLayers = {};

  const scored = [];
  let maxTotal = 1;
  for (const cell of grid.cells) {
    const s = cellStats(`${cell.r}_${cell.c}`, y);
    if (s) maxTotal = Math.max(maxTotal, s.total);
  }

  let counted = 0, sumTotal = 0, sumStale = 0;
  for (const cell of grid.cells) {
    const key = `${cell.r}_${cell.c}`;
    const s = cellStats(key, y);
    const bounds = [[cell.lat1, cell.lon1], [cell.lat2, cell.lon2]];
    let style, popup;

    if (!s || s.recent === null) {
      style = { color: '#8a92a3', weight: 1, dashArray: '3 4', fill: false };
      popup = s ? `All-time: ${s.total.toLocaleString()}<br>${y}-yr count not done yet` : 'Not counted yet';
    } else if (s.total < EMPTY_MIN) {
      counted++;
      style = { color: '#6b7280', weight: 1, fillColor: '#6b7280', fillOpacity: 0.12 };
      popup = `Only ${s.total} network(s) ever recorded.<br>Empty land, or nobody has driven it — check the map.`;
    } else {
      counted++;
      const stale = s.total - s.recent;
      const ratio = stale / s.total;
      sumTotal += s.total; sumStale += stale;
      const density = Math.log(s.total + 1) / Math.log(maxTotal + 1);
      style = { color: '#2a2f3a', weight: 1, fillColor: lerpColor('4f8cc9', 'ff5c8a', ratio), fillOpacity: 0.15 + 0.55 * density };
      popup = `<strong>${stale.toLocaleString()} stale</strong> (${Math.round(ratio * 100)}%)<br>`
        + `All-time: ${s.total.toLocaleString()}<br>Seen in last ${y} yr: ${s.recent.toLocaleString()}`;
      scored.push({ key, stale, ratio, cell });
    }
    const rect = L.rectangle(bounds, style).bindPopup(() => popupEl(popup, cell)).addTo(gridLayer);
    cellLayers[key] = rect;
  }

  // Stats
  const stats = $('stats');
  stats.replaceChildren();
  const pct = sumTotal ? Math.round((sumStale / sumTotal) * 100) : 0;
  for (const [k, v] of [['Cells counted', `${counted} / ${grid.cells.length}`], ['Networks (all-time)', sumTotal.toLocaleString()], ['Stale', `${sumStale.toLocaleString()} (${pct}%)`]]) {
    const row = document.createElement('div');
    row.className = 'stat';
    const a = document.createElement('span'); a.textContent = k;
    const b = document.createElement('strong'); b.textContent = v;
    row.append(a, b);
    stats.append(row);
  }

  // Ranked list by absolute stale count
  const ol = $('ranked');
  ol.replaceChildren();
  scored.sort((a, b) => b.stale - a.stale).slice(0, 8).forEach((s) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'link';
    btn.textContent = `${s.stale.toLocaleString()} stale · ${Math.round(s.ratio * 100)}%`;
    btn.addEventListener('click', () => {
      map.fitBounds(cellLayers[s.key].getBounds(), { maxZoom: 16 });
      cellLayers[s.key].openPopup();
    });
    li.append(btn);
    ol.append(li);
  });

  const need = queriesNeeded(y);
  $('needed').textContent = need
    ? `About ${need} WiGLE queries to finish this view.`
    : 'This view is fully counted — no queries needed.';
  $('scanBtn').disabled = scanning || need === 0;
  const rb = $('refreshBtn');
  rb.hidden = !grid.refreshDue;
  rb.disabled = scanning;
  if (grid.refreshDue) {
    const since = new Date(grid.oldestDue * 1000).toLocaleDateString();
    rb.textContent = `Refresh ${grid.refreshDue} old count(s) (since ${since})`;
  }
}

// Popup body (our own numbers only) + a drill-down button for cells bigger than ~500 m.
function popupEl(html, cell) {
  const div = document.createElement('div');
  div.innerHTML = html;
  if (grid.size > 1) {
    const btn = document.createElement('button');
    btn.className = 'small popup-btn';
    btn.textContent = `Count 4 × ${SIZE_NAME[grid.size / 2]} cells here`;
    btn.disabled = scanning;
    btn.addEventListener('click', () => drillInto(cell));
    div.append(document.createElement('br'), btn);
  }
  return div;
}

async function drillInto(cell) {
  map.closePopup();
  within = { m: grid.size, r: cell.r, c: cell.c };
  $('size').value = String(grid.size / 2);
  try {
    await loadGrid();
    map.fitBounds([[cell.lat1, cell.lon1], [cell.lat2, cell.lon2]], { maxZoom: 16 });
    await scan(false);
  } catch (err) { msg(err.message); within = null; }
}

async function loadGrid() {
  const types = selectedTypes();
  grid = await api(`grid.php?area_id=${area.id}&size=${$('size').value}&types=${types.join(',')}`);
  showQuota(grid.quota);
  draw();
}

async function loadArea(e) {
  e?.preventDefault();
  msg('');
  if (!selectedTypes().length) return msg('Pick at least one type to count.');
  try {
    const data = await api(`area.php?zip=${encodeURIComponent($('zip').value)}&radius=${encodeURIComponent($('radius').value)}`);
    area = data.area;
    if (boxLayer) boxLayer.remove();
    boxLayer = L.rectangle([[area.lat1, area.lon1], [area.lat2, area.lon2]],
      { color: '#b388ff', weight: 1, fill: false, dashArray: '4 4' }).addTo(map);
    map.fitBounds(boxLayer.getBounds());
    $('scanSection').hidden = false;
    await loadGrid();
  } catch (err) { msg(err.message); }
}

// refresh=false: count what's missing. refresh=true: re-count anything older than 90 days.
async function scan(refresh = false) {
  scanning = true; stopRequested = false;
  $('scanBtn').disabled = true; $('stopBtn').hidden = false;
  msg('Counting…');
  try {
    while (!stopRequested && (refresh ? grid.refreshDue > 0 : queriesNeeded(years()) > 0)) {
      const body = new FormData();
      body.set('area_id', area.id); body.set('size', grid.size);
      body.set('types', grid.types.join(',')); body.set('years', years()); body.set('max', BATCH);
      if (refresh) body.set('refresh', '1');
      if (within) body.set('within', `${within.m}:${within.r}:${within.c}`);
      const data = await api('grid.php', { method: 'POST', body });
      grid = data;
      showQuota(data.quota);
      draw();
      if (data.stopReason) { msg(data.stopReason); break; }
      if (refresh && !data.queriesUsed) break;      // nothing left that this view can refresh
      msg(`Counting… ${queriesNeeded(years())} queries left`);
    }
    if (!$('msg').textContent.startsWith('Daily') && !$('msg').textContent.startsWith('WiGLE')) {
      msg(stopRequested ? 'Stopped — Count cells picks up where it left off.' : 'Done.');
    }
  } catch (err) { msg(err.message); }
  scanning = false;
  within = null;
  $('stopBtn').hidden = true;
  draw();
}

$('areaForm').addEventListener('submit', loadArea);

// Help modal — opens automatically on the first visit only.
const help = $('help');
$('helpBtn').addEventListener('click', () => help.showModal());
$('helpClose').addEventListener('click', () => help.close());
help.addEventListener('click', (e) => { if (e.target === help) help.close(); });   // backdrop click
try {
  if (!localStorage.getItem('ghostTownHelpSeen')) { help.showModal(); localStorage.setItem('ghostTownHelpSeen', '1'); }
} catch { /* storage blocked — just don't auto-open */ }
$('age').addEventListener('input', draw);
$('scanBtn').addEventListener('click', () => scan(false));
$('refreshBtn').addEventListener('click', () => scan(true));
$('stopBtn').addEventListener('click', () => { stopRequested = true; msg('Stopping after this batch…'); });
$('size').addEventListener('change', () => { if (area) loadGrid().catch((e) => msg(e.message)); });
document.querySelectorAll('input[name=type]').forEach((c) => c.addEventListener('change', () => {
  if (area && selectedTypes().length) loadGrid().catch((e) => msg(e.message));
}));
