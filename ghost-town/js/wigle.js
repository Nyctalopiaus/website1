// Direct browser → WiGLE calls. The credential goes only to api.wigle.net.
import { log } from './log.js';

export const ENDPOINTS = {
  wifi: 'https://api.wigle.net/api/v2/network/search',
  bluetooth: 'https://api.wigle.net/api/v2/bluetooth/search',
  cell: 'https://api.wigle.net/api/v2/cell/search',
};

export class LimitError extends Error {}
export class AuthError extends Error {}

/** Count networks of `type` in a box; years>0 limits to ones updated in the last N years. */
export async function countNetworks(credential, type, box, years) {
  const params = new URLSearchParams({
    onlymine: 'false', resultsPerPage: '1',
    latrange1: box.lat1, latrange2: box.lat2, longrange1: box.lon1, longrange2: box.lon2,
  });
  if (years > 0) {
    const d = new Date();
    d.setFullYear(d.getFullYear() - years);
    params.set('lastupdt', d.toISOString().slice(0, 10).replaceAll('-', ''));
  }
  // Logged: endpoint + query params (no credential — it's only in the header), status, timing, result.
  const req = { type, years, cell: box.m != null ? `${box.m}:${box.r}:${box.c}` : undefined, params: params.toString() };
  const t0 = performance.now();
  let res;
  try {
    res = await fetch(`${ENDPOINTS[type]}?${params}`, {
      headers: { Accept: 'application/json', Authorization: 'Basic ' + btoa(credential) },
      credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store',
    });
  } catch (err) {
    log('error', 'wigle.network-fail', { ...req, message: err.message, ms: Math.round(performance.now() - t0) });
    throw err;
  }
  const ms = Math.round(performance.now() - t0);
  let json = null;
  try { json = await res.json(); } catch { /* handled below */ }
  const wigleMsg = json?.message ?? json?.error ?? null;
  if (res.status === 429) {
    log('warn', 'wigle.limit', { ...req, status: 429, ms, wigleMsg });
    throw new LimitError('Daily WiGLE query limit reached — resume tomorrow.');
  }
  if (res.status === 401 || res.status === 403) {
    log('error', 'wigle.auth', { ...req, status: res.status, ms, wigleMsg });
    throw new AuthError('WiGLE rejected this API name/token. Check them under 🔑 WiGLE Key.');
  }
  if (!res.ok || !json?.success) {
    log('error', 'wigle.error', { ...req, status: res.status, ms, wigleMsg, body: json ? JSON.stringify(json).slice(0, 300) : null });
    throw new Error(`WiGLE error (HTTP ${res.status}) ${wigleMsg ?? ''}`.trim());
  }
  const total = Number(json.totalResults ?? 0);
  log('info', 'wigle.count', { ...req, status: res.status, ms, totalResults: total });
  return total;
}

/** Zip → center via OpenStreetMap Nominatim (no key, no WiGLE quota). */
export async function geocodeZip(zip) {
  const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({ postalcode: zip, country: 'us', format: 'json', limit: '1' })}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' }, credentials: 'omit' });
  if (!res.ok) {
    log('error', 'geocode.error', { zip, status: res.status });
    throw new Error(`Zip lookup failed (HTTP ${res.status}).`);
  }
  const json = await res.json();
  if (!json.length) { log('warn', 'geocode.not-found', { zip }); throw new Error(`Zip ${zip} not found.`); }
  const out = { lat: Number(json[0].lat), lon: Number(json[0].lon), label: String(json[0].display_name ?? zip) };
  log('info', 'geocode.ok', { zip, lat: out.lat, lon: out.lon });
  return out;
}
