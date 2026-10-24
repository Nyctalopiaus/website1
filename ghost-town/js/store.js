// Browser-only persistence: cell counts, zip lookups, daily query log.
// Everything lives in this browser's localStorage; export/import is the backup.
// Count shape: counts["m:r:c"][type][years] = [count, fetchedAtEpochSec]

const COUNTS_KEY = 'ghosttown_counts_v1';
const ZIPS_KEY = 'ghosttown_zips_v1';
const QUOTA_KEY = 'ghosttown_quota_v1';
const LIMIT_KEY = 'ghosttown_limit_v1';

function load(k, fallback) {
  try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; }
}
function save(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; }
}

export const counts = load(COUNTS_KEY, {});
export const zips = load(ZIPS_KEY, {});
let quota = load(QUOTA_KEY, {});

export let storageOk = save('ghosttown_probe', 1);

export function putCount(m, r, c, type, years, n) {
  const k = `${m}:${r}:${c}`;
  ((counts[k] ??= {})[type] ??= {})[years] = [n, Math.floor(Date.now() / 1000)];
  storageOk = save(COUNTS_KEY, counts);
}

// Read-only sample data (published demo snapshot) — consulted only after the user's own counts,
// never written to storage.
let demo = null;
export function setDemo(snapshot) { demo = snapshot?.counts ? snapshot : null; }
export const demoActive = () => Boolean(demo);

export function getCountEntry(m, r, c, type, years) {
  const k = `${m}:${r}:${c}`;
  return counts[k]?.[type]?.[years] ?? demo?.counts[k]?.[type]?.[years] ?? null;
}
export const hasOwnCounts = () => Object.keys(counts).length > 0;

export function putZip(zip, data) { zips[zip] = data; save(ZIPS_KEY, zips); }

const today = () => new Date().toISOString().slice(0, 10);
export function logQuery(hitLimit = false) {
  const d = today();
  quota = { [d]: { queries: (quota[d]?.queries ?? 0) + (hitLimit ? 0 : 1), hitLimit: Boolean(quota[d]?.hitLimit || hitLimit) } };
  save(QUOTA_KEY, quota);
  // Learn the daily allowance: the number of queries that succeeded before WiGLE said no.
  if (hitLimit && quota[d].queries > 0) save(LIMIT_KEY, quota[d].queries);
}
export const quotaToday = () => quota[today()] ?? { queries: 0, hitLimit: false };
/** Daily limit learned from the last time WiGLE refused a query; null until that has happened. */
export function knownLimit() {
  const q = quotaToday();
  const saved = load(LIMIT_KEY, null);
  if (q.hitLimit && q.queries > 0 && saved !== q.queries) { save(LIMIT_KEY, q.queries); return q.queries; }
  return Number.isFinite(saved) ? saved : null;
}

export function exportJson() {
  return JSON.stringify({ app: 'ghost-town', version: 1, exportedAt: new Date().toISOString(), counts, zips }, null, 1);
}

/** Merge an export into local data; for each count keeps the newer fetch. Returns cells merged. */
export function importJson(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('That file isn\'t valid JSON.'); }
  if (data?.app !== 'ghost-town' || typeof data.counts !== 'object') throw new Error('Not a Ghost Town backup file.');
  let n = 0;
  for (const [k, byType] of Object.entries(data.counts)) {
    if (!/^\d+:-?\d+:-?\d+$/.test(k) || typeof byType !== 'object') continue;
    for (const [type, byYears] of Object.entries(byType)) {
      if (!['wifi', 'bluetooth', 'cell'].includes(type) || typeof byYears !== 'object') continue;
      for (const [y, entry] of Object.entries(byYears)) {
        if (!/^[0-6]$/.test(y) || !Array.isArray(entry)) continue;
        const [cnt, at] = entry.map(Number);
        if (!Number.isFinite(cnt) || cnt < 0 || !Number.isFinite(at)) continue;
        const cur = counts[k]?.[type]?.[y];
        if (!cur || cur[1] < at) { ((counts[k] ??= {})[type] ??= {})[y] = [Math.floor(cnt), Math.floor(at)]; n++; }
      }
    }
  }
  for (const [z, v] of Object.entries(data.zips ?? {})) {
    if (/^\d{5}$/.test(z) && Number.isFinite(v?.lat) && Number.isFinite(v?.lon)) zips[z] ??= { lat: v.lat, lon: v.lon, label: String(v.label ?? z) };
  }
  save(COUNTS_KEY, counts); save(ZIPS_KEY, zips);
  return n;
}
