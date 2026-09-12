/* logger.js - Lightweight client-side lookup logger
 *
 * Every geocoding/POI "lookup" this app makes (Photon, Nominatim, Open-Meteo,
 * the 5 Overpass mirrors) previously failed silently -- catch blocks like
 * `catch (_err) {}` swallowed the real reason so there was no way to tell why
 * a given address search failed after the fact. This module gives every
 * lookup call site a single place to record what happened:
 *   - console.log/warn/error (visible immediately in DevTools), AND
 *   - a ring buffer persisted to localStorage, so the detail survives a page
 *     reload and can be inspected later via the on-page "View Debug Log"
 *     button (wired up in app.js) without needing DevTools open at the time
 *     of the failure.
 *
 * Kept dependency-free and defensive: any failure inside the logger itself
 * (e.g. localStorage full/blocked in a private window) must never break the
 * app it's trying to help debug.
 */
(function (window) {
  'use strict';

  const STORAGE_KEY = 'relocation_lookup_log_v1';
  const MAX_ENTRIES = 300;

  function loadFromStorage() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_err) {
      return [];
    }
  }

  let buffer = loadFromStorage();

  function persist() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(buffer));
    } catch (_err) {
      // localStorage unavailable/full -- logging still works in-memory and
      // via console for the rest of this page load.
    }
  }

  function describeError(err) {
    if (!err) return 'unknown error';
    if (err.name === 'AbortError' || err.name === 'TimeoutError') {
      return err.message || 'timed out';
    }
    if (err instanceof Error) return err.message || err.name || 'error';
    return String(err);
  }

  function formatDetail(detail) {
    if (detail === undefined || detail === null) return '';
    if (typeof detail === 'string') return detail;
    try {
      return JSON.stringify(detail);
    } catch (_err) {
      return String(detail);
    }
  }

  function record(level, source, message, detail) {
    const entry = {
      ts: new Date().toISOString(),
      level: level,
      source: source,
      message: message,
      detail: detail !== undefined ? detail : null
    };

    buffer.push(entry);
    if (buffer.length > MAX_ENTRIES) {
      buffer = buffer.slice(buffer.length - MAX_ENTRIES);
    }
    persist();

    const detailStr = formatDetail(entry.detail);
    const consoleMsg = `[Reloc:${source}] ${message}${detailStr ? ' | ' + detailStr : ''}`;
    try {
      if (level === 'error') console.error(consoleMsg);
      else if (level === 'warn') console.warn(consoleMsg);
      else console.log(consoleMsg);
    } catch (_err) {
      // console unavailable -- ignore
    }

    return entry;
  }

  function getAll() {
    return buffer.slice();
  }

  function clear() {
    buffer = [];
    persist();
  }

  function exportText() {
    return buffer
      .map((e) => {
        const detailStr = formatDetail(e.detail);
        return `[${e.ts}] ${String(e.level).toUpperCase()} ${e.source}: ${e.message}${detailStr ? ' | ' + detailStr : ''}`;
      })
      .join('\n');
  }

  // Catch anything unforeseen too -- an uncaught exception or a rejected
  // promise nobody awaited would otherwise leave zero trace.
  window.addEventListener('error', (e) => {
    record('error', 'window', e.message || 'Uncaught error', {
      file: e.filename,
      line: e.lineno
    });
  });
  window.addEventListener('unhandledrejection', (e) => {
    const desc = describeError(e.reason);
    const msg = String(desc || '').toLowerCase();
    if (msg.includes('signal timed out') || msg.includes('timed out after') || msg.includes('failed to fetch')) {
      return;
    }
    record('error', 'window', 'Unhandled promise rejection', desc);
  });

  window.RelocationLogger = {
    info: (source, message, detail) => record('info', source, message, detail),
    warn: (source, message, detail) => record('warn', source, message, detail),
    error: (source, message, detail) => record('error', source, message, detail),
    describeError,
    getAll,
    clear,
    exportText
  };
})(window);
