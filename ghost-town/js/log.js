// Activity log for troubleshooting. Browser-only (there is no server), capped ring buffer
// in localStorage, mirrored to the console as [GhostTown]. NEVER pass credentials here.
export const APP_VERSION = '1.0.0';
const LOG_KEY = 'ghosttown_log_v1';
const MAX = 500;

let entries = [];
try { entries = JSON.parse(localStorage.getItem(LOG_KEY)) || []; } catch { entries = []; }

function persist() {
  try { localStorage.setItem(LOG_KEY, JSON.stringify(entries)); } catch { /* storage full/blocked — keep in memory */ }
}

/** level: 'info' | 'warn' | 'error'; event: short code like 'wigle.count'; data: plain object, no secrets. */
export function log(level, event, data = {}) {
  const e = { t: new Date().toISOString(), level, event, ...data };
  entries.push(e);
  if (entries.length > MAX) entries = entries.slice(-MAX);
  persist();
  (console[level] || console.log)('[GhostTown]', event, data);
}

export const entriesNewestFirst = () => entries.slice().reverse();
export function clear() { entries = []; persist(); }

export function report(extra = {}) {
  return JSON.stringify({
    app: 'ghost-town', version: APP_VERSION, generatedAt: new Date().toISOString(),
    userAgent: navigator.userAgent, page: location.origin + location.pathname,
    ...extra, entries,
  }, null, 1);
}

// Catch anything we didn't handle.
window.addEventListener('error', (ev) => log('error', 'uncaught', { message: ev.message, source: `${ev.filename}:${ev.lineno}:${ev.colno}` }));
window.addEventListener('unhandledrejection', (ev) => log('error', 'unhandled-promise', { message: String(ev.reason?.message ?? ev.reason) }));
// CSP violations (e.g. a blocked request) — very useful when something silently doesn't load.
document.addEventListener('securitypolicyviolation', (ev) => log('error', 'csp-blocked', { directive: ev.violatedDirective, blocked: ev.blockedURI }));
