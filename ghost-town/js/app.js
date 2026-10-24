// Ghost Town — wardriving planner on WiGLE data, entirely in the browser.
// Each visitor uses their own WiGLE key (PIN-encrypted, vault.js). Counts live in localStorage
// (store.js), downloaded devices in IndexedDB (devices.js). No server sees a key, count or device.
import * as vault from './vault.js';
import * as store from './store.js';
import * as devices from './devices.js';
import { countNetworks, geocodeZip, LimitError, AuthError } from './wigle.js';
import { log, report, entriesNewestFirst, clear as clearLog, APP_VERSION } from './log.js';

// Fixed global lattice: base cell 0.0045° lat × 0.0058° lon (~500 m at 40°N). Sizes nest
// exactly (m = 1, 2, 4), so a coarse count can be summed from its 4 children.
const BASE_DLAT = 0.0045, BASE_DLON = 0.0058;
const SIZE_NAME = { 1: 'About 500 m', 2: 'About 1 km', 4: 'About 2 km' };
const TYPE_NAME = { wifi: 'WiFi', bluetooth: 'Bluetooth', cell: 'Cell towers' };
const TYPE_NOUN = { wifi: 'WiFi networks', bluetooth: 'Bluetooth devices', cell: 'cell towers' };
const REFRESH_AFTER = 90 * 86400;     // counts younger than this are never re-queried
const EMPTY_MIN = 5;                  // fewer all-time networks = empty land or never driven
const QUERY_GAP_MS = 300;             // pause between WiGLE calls
const YEAR_MS = 365.25 * 86400e3;

const $ = (id) => document.getElementById(id);
const fmt = (n) => Number(n).toLocaleString();
const years = () => Number($('age').value);
const size = () => Number($('size').value);
const types = () => [...document.querySelectorAll('input[name=type]:checked')].map((c) => c.value);
const now = () => Math.floor(Date.now() / 1000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cellKey = (cell) => `${cell.m}:${cell.r}:${cell.c}`;
const plural = (n, one, many) => `${fmt(n)} ${n === 1 ? one : many}`;
function msg(text) { $('msg').textContent = text || ''; }

// ---------------- map ----------------
const map = L.map('map', { zoomControl: true, attributionControl: true }).setView([39.5, -98.35], 4);
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19, className: 'dark-tiles',
  referrerPolicy: 'strict-origin-when-cross-origin',   // OSM tile policy requires a Referer; page default is no-referrer
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}).addTo(map);
const gridLayer = L.layerGroup().addTo(map);                       // SVG, so cells can glow
const devRenderer = L.canvas({ padding: 0.3 });
const devLayer = L.layerGroup().addTo(map);                        // canvas, for thousands of dots
let boxLayer = null;
let cellLayers = new Map();

// ---------------- state ----------------
let area = null;                      // { zip, label, lat1, lat2, lon1, lon2, radius }
let scanning = false, stopRequested = false;
let within = null;                    // { m, r, c } while splitting one parent cell
let selected = null;                  // cell shown in the card
let devPulling = false, devStopRequested = false;
let devCache = [];                    // devices inside the selected cell
const justCounted = new Set();        // keys to animate once

// ---------------- grid maths ----------------
function cellsOf(m, box) {
  const dLat = BASE_DLAT * m, dLon = BASE_DLON * m, out = [];
  for (let r = Math.floor(box.lat1 / dLat); r <= Math.floor(box.lat2 / dLat); r++) {
    for (let c = Math.floor(box.lon1 / dLon); c <= Math.floor(box.lon2 / dLon); c++) {
      out.push({ m, r, c, lat1: r * dLat, lat2: (r + 1) * dLat, lon1: c * dLon, lon2: (c + 1) * dLon });
    }
  }
  return out;
}
const cells = () => cellsOf(size(), area);
const childrenOf = (cell) => cellsOf(cell.m / 2, { lat1: cell.lat1 + 1e-9, lat2: cell.lat2 - 1e-9, lon1: cell.lon1 + 1e-9, lon2: cell.lon2 - 1e-9 });
const inWithin = (cell) => !within
  || (Math.floor(cell.r * cell.m / within.m) === within.r && Math.floor(cell.c * cell.m / within.m) === within.c);

/** Direct count (fetched at/after minFetched) or the sum of the 4 children; null if unknown. */
function countFor(m, r, c, type, y, minFetched = 0) {
  const e = store.getCountEntry(m, r, c, type, y);
  if (e && e[1] >= minFetched) return e[0];
  if (m === 1) return null;
  let sum = 0;
  for (const [dr, dc] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
    const v = countFor(m / 2, r * 2 + dr, c * 2 + dc, type, y, minFetched);
    if (v === null) return null;
    sum += v;
  }
  return sum;
}

/** { total, recent } summed over the ticked types; recent null = half counted; null = not counted. */
function cellStats(cell, y = years()) {
  let total = 0, recent = 0;
  for (const t of types()) {
    const all = countFor(cell.m, cell.r, cell.c, t, 0);
    if (all === null) return null;
    total += all;
    if (all === 0) continue;
    const rec = countFor(cell.m, cell.r, cell.c, t, y);
    if (rec === null) return { total, recent: null };
    recent += rec;
  }
  return { total, recent };
}

/** Queries still needed, cell by cell (half-counted cells first). refresh: treat >90-day counts as missing. */
function todo(list, y, refresh = false) {
  const minF = refresh ? now() - REFRESH_AFTER : 0;
  const partial = [], fresh = [];
  for (const cell of list) {
    const items = [];
    for (const t of types()) {
      for (const yy of [0, y]) {
        if (countFor(cell.m, cell.r, cell.c, t, yy, minF) === null) items.push({ cell, type: t, y: yy, minF });
      }
    }
    if (items.length) (items.length < types().length * 2 ? partial : fresh).push(...items);
  }
  return [...partial, ...fresh];
}

function refreshDue(y) {
  const minF = now() - REFRESH_AFTER;
  let n = 0;
  for (const cell of cells()) for (const t of types()) for (const yy of [0, y]) {
    if (countFor(cell.m, cell.r, cell.c, t, yy) !== null && countFor(cell.m, cell.r, cell.c, t, yy, minF) === null) n++;
  }
  return n;
}

/** How many whole cells `budget` queries would finish, walking the to-do list in order. */
function cellsFinishable(items, budget) {
  const perCell = new Map();
  for (const it of items) perCell.set(cellKey(it.cell), (perCell.get(cellKey(it.cell)) ?? 0) + 1);
  let n = 0;
  for (const cost of perCell.values()) { if (cost > budget) break; budget -= cost; n++; }
  return n;
}

// ---------------- budget ----------------
function renderBudget() {
  const q = store.quotaToday(), limit = store.knownLimit();
  const box = $('budget');
  if (limit) {
    const left = Math.max(0, limit - q.queries);
    $('budgetText').textContent = `${q.queries} of ${plural(limit, 'query', 'queries')} used today`;
    $('budgetFill').style.width = `${Math.min(100, (q.queries / limit) * 100)}%`;
    box.dataset.state = left ? 'ok' : 'out';
    if (!left || q.hitLimit) {
      $('budgetHint').textContent = 'Out of queries for today. Everything you start picks up where it stopped once WiGLE resets your allowance.';
    } else if (area) {
      const n = cellsFinishable(todo(cells().filter(inWithin), years()), left);
      $('budgetHint').textContent = `${left} left today${n ? `, enough to finish ${plural(n, 'more cell', 'more cells')}` : ''}.`;
    } else {
      $('budgetHint').textContent = `${left} left today.`;
    }
  } else {
    $('budgetText').textContent = q.queries ? `${plural(q.queries, 'query', 'queries')} used today` : 'No queries used today';
    $('budgetFill').style.width = '0';
    box.dataset.state = 'ok';
    $('budgetHint').textContent = 'Your daily limit appears here the first time WiGLE stops a scan.';
  }
}

// ---------------- drawing ----------------
function lerpColor(a, b, t) {
  const pa = a.match(/\w\w/g).map((h) => parseInt(h, 16));
  const pb = b.match(/\w\w/g).map((h) => parseInt(h, 16));
  return '#' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

function draw() {
  $('ageLabel').textContent = years() === 1 ? '1 year' : `${years()} years`;
  renderBudget();
  if (!area) return;
  const y = years(), all = cells();
  gridLayer.clearLayers();
  cellLayers = new Map();

  const stats = all.map((cell) => cellStats(cell, y));
  const maxTotal = Math.max(1, ...stats.filter(Boolean).map((s) => s.total));
  const scored = [];
  let counted = 0, sumTotal = 0, sumStale = 0;

  all.forEach((cell, i) => {
    const s = stats[i], key = cellKey(cell);
    const density = s ? Math.log(s.total + 1) / Math.log(maxTotal + 1) : 0;
    let style, cls = 'cell';
    if (!s) {
      style = { color: '#8a92a3', weight: 1, opacity: 0.6, dashArray: '3 5', fillOpacity: 0 };
    } else if (s.recent === null) {
      style = { color: '#a48bff', weight: 1, dashArray: '3 5', fillColor: '#8a7fb0', fillOpacity: 0.08 + 0.3 * density };
    } else if (s.total < EMPTY_MIN) {
      counted++;
      style = { color: '#6b7280', weight: 1, fillColor: '#6b7280', fillOpacity: 0.14 };
    } else {
      counted++;
      const stale = s.total - s.recent, ratio = stale / s.total;
      sumTotal += s.total; sumStale += stale;
      style = { color: '#0f1726', weight: 1, fillColor: lerpColor('4fa3e0', 'ff6f91', ratio), fillOpacity: 0.18 + 0.5 * density };
      cls += ratio >= 0.66 ? ' cell-g3' : ratio >= 0.4 ? ' cell-g2' : ratio >= 0.2 ? ' cell-g1' : '';
      scored.push({ cell, key, stale, ratio, total: s.total });
    }
    if (justCounted.has(key)) cls += ' cell-new';
    if (selected && key === cellKey(selected)) cls += ' cell-selected';
    const rect = L.rectangle([[cell.lat1, cell.lon1], [cell.lat2, cell.lon2]], { ...style, className: cls })
      .on('click', () => openCell(cell)).addTo(gridLayer);
    rect.bindTooltip(s && s.recent !== null && s.total >= EMPTY_MIN
      ? `${fmt(s.total - s.recent)} stale of ${fmt(s.total)}` : s ? (s.recent === null ? 'Half counted' : 'Almost no networks') : 'Not counted yet',
      { sticky: true, direction: 'top', opacity: 0.95 });
    cellLayers.set(key, rect);
  });
  justCounted.clear();

  // Summary sentence
  const sum = $('summary');
  sum.replaceChildren();
  const p1 = document.createElement('p');
  p1.textContent = `${counted} of ${plural(all.length, 'cell', 'cells')} counted.`;
  sum.append(p1);
  if (sumTotal) {
    const p2 = document.createElement('p');
    p2.textContent = `${fmt(sumStale)} of ${fmt(sumTotal)} networks (${Math.round((sumStale / sumTotal) * 100)}%) haven't been seen in ${$('ageLabel').textContent}.`;
    sum.append(p2);
  }

  // Ranked list
  const ol = $('ranked');
  ol.replaceChildren();
  scored.sort((a, b) => b.stale - a.stale).slice(0, 8).forEach((s) => {
    const li = document.createElement('li');
    const btn = document.createElement('button');
    btn.type = 'button';
    if (selected && s.key === cellKey(selected)) btn.setAttribute('aria-current', 'true');
    const num = document.createElement('span'); num.className = 'num'; num.textContent = `${fmt(s.stale)} stale`;
    const pct = document.createElement('span'); pct.className = 'pct'; pct.textContent = `of ${fmt(s.total)}`;
    const bar = document.createElement('span'); bar.className = 'bar';
    const fill = document.createElement('i'); fill.style.width = `${Math.round(s.ratio * 100)}%`;
    bar.append(fill);
    btn.append(num, pct, bar);
    btn.addEventListener('click', () => { map.fitBounds(cellLayers.get(s.key).getBounds(), { maxZoom: 15, padding: [40, 40] }); openCell(s.cell); });
    li.append(btn);
    ol.append(li);
  });
  $('rankSection').hidden = !scored.length;

  const need = todo(all, y).length;
  const limit = store.knownLimit();
  $('needed').textContent = need
    ? `Finishing this view takes up to ${plural(need, 'query', 'queries')}${limit ? `, about ${plural(Math.ceil(need / limit), 'day', 'days')} at your allowance` : ''}.`
    : 'Every cell in this view is counted.';
  $('scanBtn').disabled = scanning || need === 0;
  const due = refreshDue(y);
  $('refreshBtn').hidden = !due;
  $('refreshBtn').disabled = scanning;
  $('refreshBtn').textContent = `Refresh ${plural(due, 'count', 'counts')} older than 90 days`;
  $('demoBanner').hidden = !(store.demoActive() && !store.hasOwnCounts());
  if (selected) renderCard();
}

// ---------------- cell card + devices ----------------
function openCell(cell) {
  selected = cell;
  $('cellCard').hidden = false;
  draw();
  loadDevices();
}
function closeCell() {
  selected = null;
  $('cellCard').hidden = true;
  devLayer.clearLayers();
  devCache = [];
  draw();
}

async function pullState(cell) {
  const out = {};
  for (const t of types()) out[t] = await devices.getPull(cell, t);
  return out;
}

async function renderCard() {
  const cell = selected;
  if (!cell) return;
  const s = cellStats(cell), y = years();
  $('cellTitle').textContent = `${SIZE_NAME[cell.m]} cell`;
  $('cellWhere').textContent = area?.label ? area.label.split(',').slice(0, 2).join(',') : '';
  const story = $('cellStory'), facts = $('cellFacts');
  story.replaceChildren(); facts.replaceChildren();
  const fact = (k, v) => { const dt = document.createElement('dt'); dt.textContent = k; const dd = document.createElement('dd'); dd.textContent = v; facts.append(dt, dd); };

  if (!s) {
    story.textContent = 'Not counted yet. Counting this cell costs about 2 queries per type.';
  } else if (s.recent === null) {
    story.textContent = `${fmt(s.total)} networks recorded here so far. The ${y}-year count will show how many have gone stale.`;
  } else if (s.total < EMPTY_MIN) {
    story.textContent = `Only ${plural(s.total, 'network has', 'networks have')} ever been recorded here. If the streets underneath are built up, nobody has driven it yet.`;
  } else {
    const stale = s.total - s.recent;
    const strong = document.createElement('strong');
    strong.textContent = fmt(stale);
    story.append(strong, ` of ${fmt(s.total)} networks here haven't been seen in ${$('ageLabel').textContent}.`);
    $('cellBar').querySelector('.stale').style.width = `${(stale / s.total) * 100}%`;
  }
  $('cellBar').hidden = !(s && s.recent !== null && s.total >= EMPTY_MIN);
  if (s) {
    fact('Networks on record', fmt(s.total));
    if (s.recent !== null) fact(`Seen in the last ${$('ageLabel').textContent}`, fmt(s.recent));
    const e = store.getCountEntry(cell.m, cell.r, cell.c, types()[0], 0);
    if (e) fact('Counted on', new Date(e[1] * 1000).toLocaleDateString());
  }

  // Split action
  const split = $('splitBtn');
  if (cell.m > 1) {
    const need = todo(childrenOf(cell), y).length;
    split.hidden = false;
    split.disabled = scanning || devPulling || need === 0;
    split.textContent = need ? `Split into 4 smaller cells (up to ${plural(need, 'query', 'queries')})` : 'Smaller cells already counted';
  } else split.hidden = true;

  // Device download action
  const pulls = await pullState(cell);
  if (cell !== selected) return;
  let left = 0, unknown = false, anyStarted = false, allDone = true, fetched = 0;
  for (const t of types()) {
    const p = pulls[t];
    const total = p?.total ?? countFor(cell.m, cell.r, cell.c, t, 0);
    if (p) { anyStarted = true; fetched += p.fetched; }
    if (p?.complete) continue;
    allDone = false;
    if (total == null) { unknown = true; continue; }
    left += Math.ceil(Math.max(0, total - (p?.fetched ?? 0)) / devices.PER_PAGE);
  }
  const dev = $('devBtn');
  dev.hidden = allDone;
  dev.disabled = scanning || devPulling || unknown;
  dev.textContent = unknown ? 'Download devices'
    : `${anyStarted ? 'Continue downloading' : 'Download devices'} (about ${plural(Math.max(1, left), 'query', 'queries')})`;
  $('devStop').hidden = !devPulling;
  if (!devPulling) {
    $('devProgress').textContent = unknown ? 'Count this cell first so the download cost is known.'
      : allDone ? `All ${fmt(fetched)} devices downloaded.`
      : anyStarted ? `${fmt(fetched)} devices downloaded so far.` : '';
  }
}

async function loadDevices() {
  const cell = selected;
  if (!cell) return;
  try { devCache = await devices.devicesIn(cell); }
  catch (err) { devCache = []; log('error', 'devices.read-failed', { message: err.message }); }
  if (cell !== selected) return;
  $('devPanel').hidden = !devCache.length;
  // Type chips from what's actually downloaded
  const present = [...new Set(devCache.map((d) => d.type))];
  const box = $('fType');
  const prev = new Set([...box.querySelectorAll('input:checked')].map((i) => i.value));
  box.replaceChildren();
  for (const t of present) {
    const label = document.createElement('label'); label.className = 'chip';
    const input = document.createElement('input'); input.type = 'checkbox'; input.value = t;
    input.checked = !prev.size || prev.has(t);
    input.addEventListener('change', drawDevices);
    const span = document.createElement('span'); span.textContent = TYPE_NAME[t] ?? t;
    label.append(input, span);
    box.append(label);
  }
  drawDevices();
}

function devicePopup(d) {
  const div = document.createElement('div'); div.className = 'dev-pop';
  const h = document.createElement('h4'); h.textContent = d.name || (d.type === 'wifi' ? 'Hidden network' : 'Unnamed device');
  const mac = document.createElement('div'); mac.className = 'mac'; mac.textContent = d.netid;
  const dl = document.createElement('dl');
  const row = (k, v) => { if (v == null || v === '') return; const dt = document.createElement('dt'); dt.textContent = k; const dd = document.createElement('dd'); dd.textContent = String(v); dl.append(dt, dd); };
  row('Type', [TYPE_NAME[d.type], d.kind].filter(Boolean).join(', '));
  row('Security', d.enc);
  row('First seen', d.first ? new Date(d.first).toLocaleDateString() : null);
  row('Last seen', d.last ? new Date(d.last).toLocaleDateString() : null);
  row('Channel', d.channel);
  div.append(h, mac, dl);
  return div;
}

function drawDevices() {
  devLayer.clearLayers();
  if (!selected || !devCache.length) return;
  const typeOn = new Set([...$('fType').querySelectorAll('input:checked')].map((i) => i.value));
  const age = document.querySelector('input[name=fAge]:checked').value;
  const sec = document.querySelector('input[name=fSec]:checked').value;
  const cutoff = Date.now() - years() * YEAR_MS;
  const shown = devCache.filter((d) => {
    if (!typeOn.has(d.type)) return false;
    const stale = d.last != null && d.last < cutoff;
    if (age === 'stale' && !stale) return false;
    if (age === 'fresh' && stale) return false;
    if (sec === 'open' && !(d.type === 'wifi' && /^(none|open|unknown)?$/i.test(String(d.enc ?? '')))) return false;
    return true;
  });
  $('devCount').textContent = `Showing ${fmt(shown.length)} of ${plural(devCache.length, 'device', 'devices')}.`;
  if (!$('devShow').checked) return;
  for (const d of shown) {
    const stale = d.last != null && d.last < cutoff;
    L.circleMarker([d.lat, d.lon], {
      renderer: devRenderer, radius: 3.5, weight: 0,
      fillColor: stale ? '#ff6f91' : '#4fa3e0', fillOpacity: 0.9,
    }).bindPopup(() => devicePopup(d)).addTo(devLayer);
  }
}

async function downloadDevices() {
  const cell = selected;
  const cred = await ensureCredential();
  if (!cred || !cell) return;
  devPulling = true; devStopRequested = false;
  renderCard();
  log('info', 'devices.start', { cell: cellKey(cell), types: types(), quotaToday: store.quotaToday() });
  let pages = 0, ended = 'Download finished.';
  try {
    for (const t of types()) {
      let p = await devices.getPull(cell, t);
      while (!p?.complete) {
        if (devStopRequested) { ended = 'Download paused. Continue any time; it picks up where it stopped.'; break; }
        p = await devices.pullNextPage(cred, cell, t);
        store.logQuery();
        pages++;
        $('devProgress').textContent = `Downloaded ${fmt(p.fetched)}${p.total ? ` of ${fmt(p.total)}` : ''} ${TYPE_NOUN[t]}.`;
        renderBudget();
        if (cell === selected) await loadDevices();
        await sleep(QUERY_GAP_MS);
      }
      if (devStopRequested) break;
    }
  } catch (err) {
    if (err instanceof LimitError) store.logQuery(true);
    if (err instanceof AuthError) { vault.lock(); keyStatus(); }
    ended = err instanceof TypeError ? 'Couldn\'t reach WiGLE. Check your connection and try again.' : err.message;
    log(err instanceof LimitError ? 'warn' : 'error', 'devices.stopped', { reason: err.name, message: err.message });
  }
  log('info', 'devices.end', { cell: cellKey(cell), pages, result: ended });
  devPulling = false;
  $('devProgress').textContent = ended;
  renderBudget();
  if (cell === selected) { await loadDevices(); renderCard(); }
}

// ---------------- key handling ----------------
function keyStatus() {
  const chip = $('keyBtn');
  if (vault.getCredential()) { chip.dataset.state = 'on'; chip.lastElementChild.textContent = 'WiGLE key unlocked'; }
  else if (vault.hasVault()) { chip.dataset.state = 'locked'; chip.lastElementChild.textContent = 'Unlock WiGLE key'; }
  else { chip.dataset.state = 'off'; chip.lastElementChild.textContent = 'Add WiGLE key'; }
}

function openKeyDialog() {
  $('keyForm').reset();
  $('keyErr').textContent = '';
  $('forgetBtn').hidden = !vault.hasVault();
  $('lockBtn').hidden = !vault.getCredential();
  if (vault.hasVault() && !vault.getCredential()) { openUnlock(); return; }
  $('keyDialog').showModal();
}

let afterUnlock = null;
function openUnlock(then) {
  afterUnlock = then || null;
  $('unlockForm').reset();
  $('unlockErr').textContent = '';
  $('unlockDialog').showModal();
}

/** Resolves with the credential, prompting for a key or PIN if needed; null if cancelled. */
function ensureCredential() {
  const cred = vault.getCredential();
  if (cred) return Promise.resolve(cred);
  return new Promise((resolve) => {
    const done = () => resolve(vault.getCredential());
    if (vault.hasVault()) {
      openUnlock(done);
      $('unlockDialog').addEventListener('close', () => { if (!vault.getCredential()) resolve(null); }, { once: true });
    } else {
      openKeyDialog();
      $('keyDialog').addEventListener('close', done, { once: true });
    }
  }).then((c) => { if (!c) msg('Counting needs your WiGLE key. Add it with the 🔑 button.'); return c; });
}

$('keyForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('apiName').value, token = $('apiToken').value, pin = $('pin').value, pin2 = $('pin2').value;
  if (!name.trim() || !token.trim()) return void ($('keyErr').textContent = 'Enter both the API Name and the API Token.');
  if (pin.length < 4) return void ($('keyErr').textContent = 'Use a PIN of at least 4 characters.');
  if (pin !== pin2) return void ($('keyErr').textContent = 'The two PINs don\'t match.');
  try {
    await vault.createVault(pin, name, token);
    log('info', 'key.saved', {});
    $('keyDialog').close();
    keyStatus();
    msg('');
  } catch (err) { $('keyErr').textContent = err.message; log('error', 'key.save-failed', { message: err.message }); }
});

$('unlockForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    await vault.unlockVault($('unlockPin').value);
    log('info', 'key.unlocked', {});
    $('unlockDialog').close();
    keyStatus();
    const cb = afterUnlock; afterUnlock = null;
    cb?.();
  } catch (err) { $('unlockErr').textContent = err.message; log('warn', 'key.unlock-failed', { message: err.message }); }
});

function forgetKey() {
  vault.forget();
  log('info', 'key.forgotten', {});
  keyStatus();
  $('keyDialog').close(); $('unlockDialog').close();
  msg('Your WiGLE key was removed from this browser.');
}
$('forgetBtn').addEventListener('click', forgetKey);
$('unlockForget').addEventListener('click', forgetKey);
$('keyBtn').addEventListener('click', openKeyDialog);
$('demoKeyBtn').addEventListener('click', openKeyDialog);
$('lockBtn').addEventListener('click', () => { vault.lock(); log('info', 'key.locked', {}); keyStatus(); $('keyDialog').close(); });
for (const id of ['keyCancel', 'unlockCancel', 'helpClose', 'diagClose']) $(id).addEventListener('click', (e) => e.target.closest('dialog').close());
document.querySelectorAll('dialog').forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));

// ---------------- area + scanning ----------------
function setArea(zip, z, radius) {
  const dLat = radius / 111.32, dLon = radius / (111.32 * Math.cos(z.lat * Math.PI / 180));
  area = { zip, radius, label: z.label, lat1: z.lat - dLat, lat2: z.lat + dLat, lon1: z.lon - dLon, lon2: z.lon + dLon };
  boxLayer?.remove();
  boxLayer = L.rectangle([[area.lat1, area.lon1], [area.lat2, area.lon2]],
    { color: '#a48bff', weight: 1, opacity: 0.7, fill: false, dashArray: '6 6', interactive: false }).addTo(map);
  map.fitBounds(boxLayer.getBounds(), { padding: [20, 20] });
  $('scanSection').hidden = false;
  if (selected) closeCell(); else draw();
}

async function loadArea(e) {
  e?.preventDefault();
  msg('');
  if (!types().length) return msg('Tick at least one type to count.');
  const zip = $('zip').value.trim();
  const radius = Number($('radius').value);
  if (!/^\d{5}$/.test(zip)) return msg('Enter a 5-digit US zip code.');
  if (!(radius >= 0.5 && radius <= 15)) return msg('Choose a radius between 0.5 and 15 km.');
  try {
    let z = store.zips[zip] ?? demoZips[zip];
    if (!z) { z = await geocodeZip(zip); store.putZip(zip, z); } else log('info', 'geocode.cached', { zip });
    setArea(zip, z, radius);
    log('info', 'area.loaded', { zip, radius, size: size(), types: types(), cells: cells().length, needed: todo(cells(), years()).length });
  } catch (err) { msg(err.message); log('error', 'area.failed', { zip, message: err.message }); }
}

async function scan(refresh = false) {
  const cred = await ensureCredential();
  if (!cred) { within = null; return; }
  scanning = true; stopRequested = false;
  $('stopBtn').hidden = false;
  msg('');
  draw();
  const y = years();
  const plan = todo(cells().filter(inWithin), y, refresh);
  let used = 0, ended = 'Counting finished.';
  log('info', 'scan.start', { zip: area.zip, size: size(), types: types(), years: y, refresh, within, planned: plan.length, quotaToday: store.quotaToday() });
  try {
    for (const { cell, type, y: yy, minF } of plan) {
      if (stopRequested) { ended = 'Counting paused. Count cells picks up where it stopped.'; break; }
      if (countFor(cell.m, cell.r, cell.c, type, yy, minF) !== null) continue;
      if (yy > 0 && countFor(cell.m, cell.r, cell.c, type, 0, minF) === 0) {      // nothing ever → nothing recent
        store.putCount(cell.m, cell.r, cell.c, type, yy, 0);
        log('info', 'scan.free-zero', { cell: cellKey(cell), type, years: yy });
        continue;
      }
      const n = await countNetworks(cred, type, cell, yy);
      store.logQuery();
      store.putCount(cell.m, cell.r, cell.c, type, yy, n);
      used++;
      if (yy > 0) justCounted.add(cellKey(cell));
      msg(`Counting… ${plural(used, 'query', 'queries')} used.`);
      draw();
      await sleep(QUERY_GAP_MS);
    }
  } catch (err) {
    if (err instanceof LimitError) store.logQuery(true);
    if (err instanceof AuthError) { vault.lock(); keyStatus(); }
    ended = err instanceof TypeError ? 'Couldn\'t reach WiGLE. Check your connection and try again.' : err.message;
    log(err instanceof LimitError ? 'warn' : 'error', 'scan.stopped', { reason: err.name, message: err.message });
  }
  if (!store.storageOk) {
    ended += ' This browser isn\'t saving data, so these counts will be lost when the page closes.';
    log('error', 'storage.not-saving', {});
  }
  log('info', 'scan.end', { queriesUsed: used, result: ended, remaining: todo(cells(), y, refresh).length, quotaToday: store.quotaToday() });
  scanning = false; within = null;
  $('stopBtn').hidden = true;
  msg(ended);
  draw();
}

async function splitCell() {
  const cell = selected;
  if (!cell || cell.m === 1) return;
  within = { m: cell.m, r: cell.r, c: cell.c };
  $('size').value = String(cell.m / 2);
  closeCell();
  map.fitBounds([[cell.lat1, cell.lon1], [cell.lat2, cell.lon2]], { maxZoom: 16, padding: [30, 30] });
  await scan(false);
}

// ---------------- data: export / import / demo ----------------
function exportData() {
  const view = area && { zip: area.zip, radius: area.radius, size: size(), years: years(), types: types() };
  const data = JSON.parse(store.exportJson());
  data.view = view;
  log('info', 'data.exported', { storedCells: Object.keys(store.counts).length });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
  a.download = `ghost-town-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function importData(e) {
  const file = e.target.files?.[0];
  e.target.value = '';
  if (!file) return;
  try {
    const n = store.importJson(await file.text());
    log('info', 'data.imported', { file: file.name, bytes: file.size, merged: n });
    msg(`Imported ${plural(n, 'count', 'counts')}.`);
    draw();
  } catch (err) { msg(err.message); log('error', 'data.import-failed', { file: file.name, message: err.message }); }
}

// Published sample (data/demo.json, made with Export) shown read-only to visitors with no data yet.
let demoZips = {};
async function loadDemo() {
  if (store.hasOwnCounts()) return;
  try {
    const res = await fetch('data/demo.json', { cache: 'no-cache' });
    if (!res.ok) return;
    const demo = await res.json();
    if (demo?.app !== 'ghost-town' || !demo.view) return;
    store.setDemo(demo);
    demoZips = demo.zips ?? {};
    const v = demo.view, z = demoZips[v.zip];
    if (!z) return;
    $('zip').value = v.zip; $('radius').value = v.radius; $('size').value = String(v.size); $('age').value = String(v.years);
    document.querySelectorAll('input[name=type]').forEach((c) => { c.checked = v.types.includes(c.value); });
    $('demoPlace').textContent = z.label.split(',').slice(0, 2).join(',');
    setArea(v.zip, z, v.radius);
    log('info', 'demo.loaded', { zip: v.zip });
  } catch (err) { log('warn', 'demo.failed', { message: err.message }); }
}

// ---------------- diagnostics ----------------
async function diagReport() {
  let devCount = null;
  try { devCount = await devices.deviceCount(); } catch { /* ignore */ }
  return report({ storageOk: store.storageOk, keyState: $('keyBtn').dataset.state, quotaToday: store.quotaToday(),
    knownLimit: store.knownLimit(), storedCells: Object.keys(store.counts).length, storedDevices: devCount,
    demo: store.demoActive(), area: area && { zip: area.zip, radius: area.radius, size: size(), types: types(), years: years() } });
}
async function openDiag() {
  const rows = entriesNewestFirst();
  const body = $('diagLog');
  body.replaceChildren();
  for (const e of rows.slice(0, 200)) {
    const { t, level, event, ...rest } = e;
    const li = document.createElement('li'); li.className = `lvl-${level}`;
    const when = document.createElement('span'); when.className = 'when'; when.textContent = t.replace('T', ' ').slice(0, 19);
    const ev = document.createElement('strong'); ev.textContent = ` ${event} `;
    const detail = document.createElement('code'); detail.textContent = JSON.stringify(rest);
    li.append(when, ev, detail);
    body.append(li);
  }
  let devCount = '?';
  try { devCount = fmt(await devices.deviceCount()); } catch { /* ignore */ }
  const q = store.quotaToday();
  $('diagSummary').textContent = `Version ${APP_VERSION}. ${fmt(rows.length)} log entries, ${fmt(Object.keys(store.counts).length)} counted cells, `
    + `${devCount} devices stored. ${q.queries} queries today${q.hitLimit ? ' (limit reached)' : ''}. Storage ${store.storageOk ? 'working' : 'NOT saving'}.`;
  $('diagDialog').showModal();
}
$('diagBtn').addEventListener('click', openDiag);
$('diagCopy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(await diagReport()); $('diagCopy').textContent = 'Copied'; }
  catch { $('diagCopy').textContent = 'Copy blocked, use Download'; }
  setTimeout(() => { $('diagCopy').textContent = 'Copy report'; }, 2000);
});
$('diagDownload').addEventListener('click', async () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([await diagReport()], { type: 'application/json' }));
  a.download = `ghost-town-diagnostics-${new Date().toISOString().slice(0, 19).replaceAll(':', '')}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
$('diagClear').addEventListener('click', () => { clearLog(); log('info', 'log.cleared', {}); openDiag(); });

// ---------------- wiring ----------------
$('areaForm').addEventListener('submit', loadArea);
$('age').addEventListener('input', () => { draw(); drawDevices(); });
$('size').addEventListener('change', () => { if (selected) closeCell(); else draw(); });
document.querySelectorAll('input[name=type]').forEach((c) => c.addEventListener('change', () => { if (types().length) draw(); }));
$('scanBtn').addEventListener('click', () => scan(false));
$('refreshBtn').addEventListener('click', () => scan(true));
$('stopBtn').addEventListener('click', () => { stopRequested = true; msg('Pausing after this query…'); });
$('cellClose').addEventListener('click', closeCell);
$('splitBtn').addEventListener('click', splitCell);
$('devBtn').addEventListener('click', downloadDevices);
$('devStop').addEventListener('click', () => { devStopRequested = true; $('devProgress').textContent = 'Pausing after this page…'; });
$('devShow').addEventListener('change', drawDevices);
document.querySelectorAll('input[name=fAge], input[name=fSec]').forEach((r) => r.addEventListener('change', drawDevices));
$('exportBtn').addEventListener('click', exportData);
$('importInput').addEventListener('change', importData);
$('helpBtn').addEventListener('click', () => $('help').showModal());
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && selected && !document.querySelector('dialog[open]')) closeCell(); });

keyStatus();
renderBudget();
log('info', 'page.load', { version: APP_VERSION, keyState: $('keyBtn').dataset.state, storedCells: Object.keys(store.counts).length, storageOk: store.storageOk, quotaToday: store.quotaToday(), knownLimit: store.knownLimit() });
loadDemo();
try {
  if (!localStorage.getItem('ghostTownHelpSeen')) { $('help').showModal(); localStorage.setItem('ghostTownHelpSeen', '1'); }
} catch { /* storage blocked — just don't auto-open */ }
