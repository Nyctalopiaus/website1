const express = require('express');
const cors = require('cors');
const path = require('path');
const os = require('os');
const fs = require('fs');

// Local Log File Configuration
const logPath = path.join(__dirname, 'app.log');
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

function appendLog(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] [${level}] ${message}\n`;
  fs.appendFile(logPath, logLine, (err) => {
    if (err) originalConsoleError('[SYSTEM] Failed to write to log file:', err);
  });
}

// Override console methods to intercept logs automatically
console.log = function (...args) {
  originalConsoleLog.apply(console, args);
  appendLog(args.join(' '), 'INFO');
};

console.error = function (...args) {
  originalConsoleError.apply(console, args);
  appendLog(args.join(' '), 'ERROR');
};

const app = express();
const PORT = process.env.PORT || 3000;

const allowedOrigins = [
  'https://nycto.ninja',
  'https://www.nycto.ninja',
  'http://localhost',
  'http://127.0.0.1',
  'http://192.168.86.14'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1 || origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
      return callback(null, true);
    }
    return callback(new Error('CORS Policy: Blocked by unauthorized origin.'));
  }
}));
app.use(express.json());

// ==========================================
// NOTE ON DATA STORAGE
// ==========================================
// This backend intentionally does not persist any user-submitted data. Every
// front-end tool that talks to this server (game-rating-log, mortgage-
// calculator, cism-training) advertises a "100% Private / Local Storage"
// guarantee in its UI, meaning form inputs must live only in the visitor's
// own browser (localStorage). This backend previously exposed unauthenticated
// /api/games, /api/calculator, /api/cism/*, and /api/telemetry/analyze routes
// backed by a shared SQLite database — a single global table with no per-user
// or per-session scoping, so one visitor's inputs were stored server-side and
// visible to every other visitor. That contradicted the privacy claims shown
// in each tool's UI and has been removed. Do NOT reintroduce a database or
// per-tool persistence here without per-user auth/session scoping and an
// updated, accurate privacy notice on the corresponding front end.
//
// The routes below only proxy/compute public, non-personal data (live
// mortgage rates, a public MLS listing lookup) and store nothing.

let cachedRates = null;
let cacheTime = 0;

async function fetchLiveRates() {
  const now = Date.now();
  if (cachedRates && (now - cacheTime < 43200000)) {
    return cachedRates;
  }

  try {
    const fetchWithTimeout = async (url, timeoutMs = 1500) => {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(id);
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        return await response.text();
      } catch (err) {
        clearTimeout(id);
        throw err;
      }
    };

    const [res30, res15] = await Promise.all([
      fetchWithTimeout('https://fred.stlouisfed.org/graph/fredgraph.csv?id=MORTGAGE30US'),
      fetchWithTimeout('https://fred.stlouisfed.org/graph/fredgraph.csv?id=MORTGAGE15US')
    ]);

    const parseCSV = (csvText) => {
      const lines = csvText.trim().split('\n');
      for (let i = lines.length - 1; i >= 0; i--) {
        const parts = lines[i].split(',');
        if (parts.length === 2) {
          const date = parts[0].trim();
          const rate = parseFloat(parts[1].trim());
          if (date && !isNaN(rate)) {
            return { date, rate };
          }
        }
      }
      throw new Error('Invalid CSV structure');
    };

    const data30 = parseCSV(res30);
    const data15 = parseCSV(res15);

    const formatDate = (dateStr) => {
      const parts = dateStr.split('-');
      if (parts.length !== 3) return dateStr;
      const year = parts[0];
      const monthIdx = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const months = [
        'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
        'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
      ];
      return `${months[monthIdx] || ''} ${day}, ${year}`;
    };

    cachedRates = {
      rate30: data30.rate,
      rate15: data15.rate,
      date: formatDate(data30.date),
      source: 'St. Louis Fed (FRED)'
    };
    cacheTime = now;
    return cachedRates;
  } catch (err) {
    console.error('[RATES] Error fetching live rates from FRED:', err);
    if (cachedRates) return cachedRates;
    return {
      rate30: 6.85,
      rate15: 6.15,
      date: 'Estimate',
      source: 'FRED Estimate'
    };
  }
}

// GET /api/rates
app.get('/api/rates', async (req, res) => {
  try {
    const rates = await fetchLiveRates();
    res.json(rates);
  } catch (err) {
    console.error('[SERVER] GET /api/rates error:', err);
    res.status(500).json({ error: 'Failed to fetch rates.' });
  }
});

// ==========================================
// REMOVED: Mortgage Calculator MLS Redfin Proxy (2026-08-18 security fix)
// ==========================================
// This route used to duplicate mortgage-calculator/mls-proxy.php with a
// hardcoded Scrape.do API token in plaintext and no host allowlist/SSRF
// protection (it would fetch any ?url= a caller supplied). The real,
// hardened implementation is the PHP file at
// mortgage-calculator/mls-proxy.php, which restricts fetches to
// redfin.com, rejects DNS-rebinding to private/reserved IPs, verifies TLS,
// and reads its Scrape.do/ScraperAPI credentials from /home/nyctltlc/api.env
// via getenv() rather than hardcoding them. That file already serves this
// exact URL path directly, so this duplicate route added risk with no
// benefit. Do not re-add an mls-proxy route here without porting the same
// host allowlist + DNS-rebind protection + getenv()-sourced token used in
// the PHP version.

// Handle graceful shutdown
process.on('SIGINT', () => {
  process.exit(0);
});

// Start Server
app.listen(PORT, '127.0.0.1', () => {
  console.log(`[SERVER] Node backend API running locally on http://127.0.0.1:${PORT}`);
});
