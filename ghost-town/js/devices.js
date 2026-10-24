// Device mode: download individual WiGLE records for one cell (100 per query), resumable
// across days, stored in this browser's IndexedDB. The credential goes only to api.wigle.net.
// Device names (SSIDs) are untrusted text — callers must render them with textContent only.
import { log } from './log.js';
import { ENDPOINTS, LimitError, AuthError } from './wigle.js';

const DB_NAME = 'ghosttown', DB_VERSION = 1;
export const PER_PAGE = 100;

let dbPromise = null;
function db() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('devices')) d.createObjectStore('devices', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('pulls')) d.createObjectStore('pulls', { keyPath: 'key' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => { log('error', 'idb.open-failed', { message: req.error?.message }); reject(req.error); };
  });
  return dbPromise;
}

async function tx(storeName, mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(storeName, mode);
    const out = fn(t.objectStore(storeName));
    t.oncomplete = () => resolve(out instanceof IDBRequest ? out.result : out);
    t.onerror = () => reject(t.error);
  });
}

export const pullKey = (cell, type) => `${cell.m}:${cell.r}:${cell.c}:${type}`;
export const getPull = (cell, type) => tx('pulls', 'readonly', (s) => s.get(pullKey(cell, type)));
export const allPulls = () => tx('pulls', 'readonly', (s) => s.getAll());

/** All stored devices inside a box (whole store is scanned — fine for tens of thousands). */
export async function devicesIn(box) {
  const all = await tx('devices', 'readonly', (s) => s.getAll());
  return all.filter((d) => d.lat >= box.lat1 && d.lat < box.lat2 && d.lon >= box.lon1 && d.lon < box.lon2);
}
export const deviceCount = () => tx('devices', 'readonly', (s) => s.count());

function toEpochMs(v) {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

/** Normalise one WiGLE result (WiFi / Bluetooth / cell shapes differ a little). */
function normalise(type, r) {
  const netid = r.netid ?? r.id;
  if (netid == null || r.trilat == null || r.trilong == null) return null;
  return {
    id: `${type}:${netid}`, type, netid: String(netid),
    name: r.ssid ?? r.name ?? null,
    kind: r.gentype ?? r.type ?? null,           // e.g. infra / BLE / LTE
    lat: Number(r.trilat), lon: Number(r.trilong),
    first: toEpochMs(r.firsttime), last: toEpochMs(r.lasttime ?? r.lastupdt),
    enc: r.encryption ?? null, channel: r.channel ?? null, qos: r.qos ?? null,
  };
}

/**
 * Fetch the next page of devices for (cell, type), save them and the cursor.
 * Returns the updated pull record { key, cursor, fetched, total, complete, updatedAt }.
 */
export async function pullNextPage(credential, cell, type) {
  const key = pullKey(cell, type);
  const pull = (await getPull(cell, type)) ?? { key, cursor: null, fetched: 0, total: null, complete: false };
  if (pull.complete) return pull;

  const params = new URLSearchParams({
    onlymine: 'false', resultsPerPage: String(PER_PAGE),
    latrange1: cell.lat1, latrange2: cell.lat2, longrange1: cell.lon1, longrange2: cell.lon2,
  });
  if (pull.cursor) params.set('searchAfter', pull.cursor);
  const req = { type, cell: key, page: Math.floor(pull.fetched / PER_PAGE) + 1 };
  const t0 = performance.now();
  let res;
  try {
    res = await fetch(`${ENDPOINTS[type]}?${params}`, {
      headers: { Accept: 'application/json', Authorization: 'Basic ' + btoa(credential) },
      credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store',
    });
  } catch (err) {
    log('error', 'devices.network-fail', { ...req, message: err.message });
    throw err;
  }
  const ms = Math.round(performance.now() - t0);
  let json = null;
  try { json = await res.json(); } catch { /* handled below */ }
  if (res.status === 429) { log('warn', 'devices.limit', { ...req, ms }); throw new LimitError('Daily WiGLE query limit reached — the download resumes from here tomorrow.'); }
  if (res.status === 401 || res.status === 403) { log('error', 'devices.auth', { ...req, status: res.status }); throw new AuthError('WiGLE rejected this API name/token. Check them under 🔑.'); }
  if (!res.ok || !json?.success) {
    log('error', 'devices.error', { ...req, status: res.status, ms, body: json ? JSON.stringify(json).slice(0, 300) : null });
    throw new Error(`WiGLE error (HTTP ${res.status}) ${json?.message ?? ''}`.trim());
  }

  const results = Array.isArray(json.results) ? json.results : [];
  const records = results.map((r) => normalise(type, r)).filter(Boolean);
  // Log the field names of the first record once per type, to confirm the response shape.
  if (results[0] && !pull.fetched) log('info', 'devices.fields', { type, fields: Object.keys(results[0]) });

  const next = json.searchAfter ?? json.search_after ?? null;
  const updated = {
    key, cursor: next, fetched: pull.fetched + results.length,
    total: json.totalResults != null ? Number(json.totalResults) : pull.total,
    complete: !next || results.length < PER_PAGE, updatedAt: Date.now(),
  };
  await tx('devices', 'readwrite', (s) => { for (const rec of records) s.put(rec); });
  await tx('pulls', 'readwrite', (s) => s.put(updated));
  log('info', 'devices.page', { ...req, status: res.status, ms, received: results.length, saved: records.length, total: updated.total, complete: updated.complete });
  return updated;
}

/** Wipe all downloaded devices and pull progress (from Diagnostics). */
export async function clearDevices() {
  await tx('devices', 'readwrite', (s) => s.clear());
  await tx('pulls', 'readwrite', (s) => s.clear());
  log('info', 'devices.cleared', {});
}
