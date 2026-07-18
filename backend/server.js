const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
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

// SQLite Database Setup
const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('[DATABASE] Failed to connect to SQLite database:', err);
  } else {
    console.log('[DATABASE] Connected to SQLite database at:', dbPath);
    initDatabase();
  }
});

function initDatabase() {
  db.serialize(() => {
    // 1. Create games table
    db.run(`
      CREATE TABLE IF NOT EXISTS games (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        hours REAL NOT NULL,
        rating TEXT NOT NULL
      )
    `);

    // 2. Create calculator profile table
    db.run(`
      CREATE TABLE IF NOT EXISTS calculator (
        id INTEGER PRIMARY KEY,
        homePrice REAL NOT NULL,
        downPaymentAmount REAL NOT NULL,
        downPaymentPercent REAL NOT NULL,
        interest30 REAL NOT NULL,
        interest15 REAL NOT NULL,
        taxRate REAL NOT NULL,
        homeInsurance REAL NOT NULL,
        hoaFees REAL NOT NULL,
        pmiRate REAL NOT NULL,
        grossIncome REAL NOT NULL,
        activeTerm INTEGER NOT NULL
      )
    `);

    // Ensure additionalPayment column exists (migration)
    db.run(`ALTER TABLE calculator ADD COLUMN additionalPayment REAL DEFAULT 0`, (err) => {
      // Ignore if column already exists
    });

    // Initialize calculator profile default row (ID 1) if empty
    db.get('SELECT id FROM calculator WHERE id = 1', (err, row) => {
      if (err) {
        console.error('[DATABASE] Error querying default calculator row:', err);
      } else if (!row) {
        const stmt = db.prepare(`
          INSERT INTO calculator (
            id, homePrice, downPaymentAmount, downPaymentPercent,
            interest30, interest15, taxRate, homeInsurance,
            hoaFees, pmiRate, grossIncome, activeTerm
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(1, 400000, 80000, 20, 6.5, 5.8, 1.2, 1200, 0, 0.75, 10000, 30, (insertErr) => {
          if (insertErr) {
            console.error('[DATABASE] Failed to insert default calculator row:', insertErr);
          } else {
            console.log('[DATABASE] Default calculator profile initialized successfully.');
          }
        });
        stmt.finalize();
      }
    });

    // 3. Create CISM questions table
    db.run(`
      CREATE TABLE IF NOT EXISTS cism_questions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        question TEXT NOT NULL,
        option_a TEXT NOT NULL,
        option_b TEXT NOT NULL,
        option_c TEXT NOT NULL,
        option_d TEXT NOT NULL,
        correct_option TEXT NOT NULL,
        explanation TEXT NOT NULL,
        domain INTEGER NOT NULL,
        custom INTEGER DEFAULT 0
      )
    `);

    // 4. Create CISM flashcards table
    db.run(`
      CREATE TABLE IF NOT EXISTS cism_flashcards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        term TEXT NOT NULL,
        definition TEXT NOT NULL,
        domain INTEGER NOT NULL,
        custom INTEGER DEFAULT 0
      )
    `);

    // 5. Create CISM attempts table
    db.run(`
      CREATE TABLE IF NOT EXISTS cism_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user TEXT DEFAULT 'Nycto',
        timestamp TEXT NOT NULL,
        score REAL NOT NULL,
        correct_count INTEGER NOT NULL,
        total_count INTEGER NOT NULL,
        duration_seconds INTEGER NOT NULL
      )
    `);

    // 6. Create CISM bookmarks table
    db.run(`
      CREATE TABLE IF NOT EXISTS cism_bookmarks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user TEXT DEFAULT 'Nycto',
        item_type TEXT NOT NULL,
        item_id INTEGER NOT NULL,
        UNIQUE(user, item_type, item_id)
      )
    `);

    // Migration to support multi-user profiles in CISM
    db.run(`ALTER TABLE cism_attempts ADD COLUMN user TEXT DEFAULT 'Nycto'`, (err) => {
      // Ignore if already modified
    });

    db.all("PRAGMA table_info(cism_bookmarks)", (pragmaErr, columns) => {
      if (!pragmaErr && columns) {
        const hasUser = columns.some(col => col.name === 'user');
        if (!hasUser) {
          console.log('[DATABASE] Migrating cism_bookmarks table to support multi-user storage...');
          db.serialize(() => {
            db.run('ALTER TABLE cism_bookmarks RENAME TO cism_bookmarks_old');
            db.run(`
              CREATE TABLE cism_bookmarks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user TEXT DEFAULT 'Nycto',
                item_type TEXT NOT NULL,
                item_id INTEGER NOT NULL,
                UNIQUE(user, item_type, item_id)
              )
            `);
            db.run("INSERT INTO cism_bookmarks (user, item_type, item_id) SELECT 'Nycto', item_type, item_id FROM cism_bookmarks_old");
            db.run('DROP TABLE cism_bookmarks_old');
            console.log('[DATABASE] Migration of cism_bookmarks completed successfully.');
          });
        }
      }
    });

    // Auto-update CISM questions & flashcards from cism_seed.json if database counts are outdated
    const seedPath = path.join(__dirname, 'cism_seed.json');
    fs.readFile(seedPath, 'utf8', (readErr, data) => {
      if (!readErr) {
        try {
          const seed = JSON.parse(data);
          db.get('SELECT count(*) as count FROM cism_questions WHERE custom = 0', (err, row) => {
            const dbCount = row ? row.count : 0;
            if (!err && dbCount < seed.questions.length) {
              console.log(`[DATABASE] Database standard questions count (${dbCount}) is less than seed count (${seed.questions.length}). Upgrading database questions and flashcards...`);
              db.serialize(() => {
                db.run("DELETE FROM cism_questions WHERE custom = 0");
                db.run("DELETE FROM cism_flashcards WHERE custom = 0");
                
                const qStmt = db.prepare(`
                  INSERT INTO cism_questions (
                    question, option_a, option_b, option_c, option_d,
                    correct_option, explanation, domain, custom
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
                `);
                seed.questions.forEach(q => {
                  qStmt.run(q.question, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_option, q.explanation, q.domain);
                });
                qStmt.finalize();

                const fStmt = db.prepare(`
                  INSERT INTO cism_flashcards (
                    term, definition, domain, custom
                  ) VALUES (?, ?, ?, 0)
                `);
                seed.flashcards.forEach(f => {
                  fStmt.run(f.term, f.definition, f.domain);
                });
                fStmt.finalize();
                console.log(`[DATABASE] Successfully upgraded CISM database content to ${seed.questions.length} questions and ${seed.flashcards.length} flashcards.`);
              });
            }
          });
        } catch (parseErr) {
          console.error('[DATABASE] Failed to parse cism_seed.json in upgrade check:', parseErr);
        }
      }
    });
  });
}

function seedCismData() {
  const seedPath = path.join(__dirname, 'cism_seed.json');
  fs.readFile(seedPath, 'utf8', (err, data) => {
    if (err) {
      console.error('[DATABASE] Failed to read cism_seed.json:', err);
      return;
    }
    try {
      const seed = JSON.parse(data);
      
      db.serialize(() => {
        // Seed CISM questions
        const qStmt = db.prepare(`
          INSERT INTO cism_questions (
            question, option_a, option_b, option_c, option_d,
            correct_option, explanation, domain, custom
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
        `);
        seed.questions.forEach(q => {
          qStmt.run(q.question, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_option, q.explanation, q.domain);
        });
        qStmt.finalize();
        console.log(`[DATABASE] Seeded ${seed.questions.length} CISM practice questions.`);

        // Seed CISM flashcards
        const fStmt = db.prepare(`
          INSERT INTO cism_flashcards (
            term, definition, domain, custom
          ) VALUES (?, ?, ?, 0)
        `);
        seed.flashcards.forEach(f => {
          fStmt.run(f.term, f.definition, f.domain);
        });
        fStmt.finalize();
        console.log(`[DATABASE] Seeded ${seed.flashcards.length} CISM flashcards.`);
      });
    } catch (parseErr) {
      console.error('[DATABASE] Failed to parse cism_seed.json:', parseErr);
    }
  });
}

// ==========================================
// API ENDPOINTS: Gaming Log
// ==========================================

// GET /api/games
app.get('/api/games', (req, res) => {
  db.all('SELECT * FROM games ORDER BY id ASC', [], (err, rows) => {
    if (err) {
      console.error('[SERVER] GET /api/games error:', err);
      return res.status(500).json({ error: 'Failed to retrieve games.' });
    }
    res.json(rows);
  });
});

// POST /api/games
app.post('/api/games', (req, res) => {
  const { title, hours, rating } = req.body;
  
  if (!title || typeof hours !== 'number' || !rating) {
    return res.status(400).json({ error: 'Missing or invalid fields: title, hours, and rating are required.' });
  }

  // Restrict to maximum 20 entries to prevent data overrun
  db.get('SELECT COUNT(*) as count FROM games', [], (err, row) => {
    if (err) {
      console.error('[SERVER] Database error checking games count:', err);
      return res.status(500).json({ error: 'Failed to verify database limits.' });
    }

    if (row && row.count >= 20) {
      return res.status(400).json({ error: 'Limit reached. The gaming log is restricted to a maximum of 20 entries to prevent data overrun.' });
    }

    const stmt = db.prepare('INSERT INTO games (title, hours, rating) VALUES (?, ?, ?)');
    stmt.run(title, hours, rating, function (insertErr) {
      if (insertErr) {
        console.error('[SERVER] POST /api/games error:', insertErr);
        return res.status(500).json({ error: 'Failed to insert game.' });
      }
      res.status(201).json({ id: this.lastID, title, hours, rating });
    });
    stmt.finalize();
  });
});

// DELETE /api/games/:id
app.delete('/api/games/:id', (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ error: 'Invalid game ID.' });
  }

  db.run('DELETE FROM games WHERE id = ?', [id], function (err) {
    if (err) {
      console.error('[SERVER] DELETE /api/games error:', err);
      return res.status(500).json({ error: 'Failed to delete game.' });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: 'Game not found.' });
    }
    res.json({ message: 'Game deleted successfully.', id });
  });
});

// ==========================================
// API ENDPOINTS: Housing Calculator
// ==========================================

// GET /api/calculator
app.get('/api/calculator', (req, res) => {
  db.get('SELECT * FROM calculator WHERE id = 1', [], (err, row) => {
    if (err) {
      console.error('[SERVER] GET /api/calculator error:', err);
      return res.status(500).json({ error: 'Failed to retrieve calculator profile.' });
    }
    res.json(row);
  });
});

// POST /api/calculator
app.post('/api/calculator', (req, res) => {
  const {
    homePrice, downPaymentAmount, downPaymentPercent,
    interest30, interest15, taxRate, homeInsurance,
    hoaFees, pmiRate, grossIncome, activeTerm, additionalPayment
  } = req.body;

  const sql = `
    UPDATE calculator SET
      homePrice = ?, downPaymentAmount = ?, downPaymentPercent = ?,
      interest30 = ?, interest15 = ?, taxRate = ?, homeInsurance = ?,
      hoaFees = ?, pmiRate = ?, grossIncome = ?, activeTerm = ?, additionalPayment = ?
    WHERE id = 1
  `;

  db.run(sql, [
    homePrice, downPaymentAmount, downPaymentPercent,
    interest30, interest15, taxRate, homeInsurance,
    hoaFees, pmiRate, grossIncome, activeTerm, additionalPayment || 0
  ], function (err) {
    if (err) {
      console.error('[SERVER] POST /api/calculator error:', err);
      return res.status(500).json({ error: 'Failed to update calculator profile.' });
    }
    res.json({ message: 'Calculator profile updated successfully.' });
  });
});

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
// API ENDPOINTS: CISM Trainer
// ==========================================

// GET /api/cism/questions
app.get('/api/cism/questions', (req, res) => {
  db.all('SELECT * FROM cism_questions ORDER BY id ASC', [], (err, rows) => {
    if (err) {
      console.error('[SERVER] GET /api/cism/questions error:', err);
      return res.status(500).json({ error: 'Failed to retrieve CISM questions.' });
    }
    res.json(rows);
  });
});

// POST /api/cism/questions
app.post('/api/cism/questions', (req, res) => {
  const { question, option_a, option_b, option_c, option_d, correct_option, explanation, domain } = req.body;
  if (!question || !option_a || !option_b || !option_c || !option_d || !correct_option || !explanation || !domain) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  // Cap custom CISM questions to 30 max to prevent database bloat
  db.get('SELECT COUNT(*) as count FROM cism_questions WHERE custom = 1', [], (err, row) => {
    if (err) {
      console.error('[SERVER] Database error checking custom questions count:', err);
      return res.status(500).json({ error: 'Failed to verify custom question limits.' });
    }
    if (row && row.count >= 30) {
      return res.status(400).json({ error: 'Limit reached. Custom questions are capped at a maximum of 30 entries to prevent data overrun.' });
    }

    const stmt = db.prepare(`
      INSERT INTO cism_questions (
        question, option_a, option_b, option_c, option_d,
        correct_option, explanation, domain, custom
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    `);
    stmt.run(question, option_a, option_b, option_c, option_d, correct_option.toUpperCase(), explanation, parseInt(domain), function (insertErr) {
      if (insertErr) {
        console.error('[SERVER] POST /api/cism/questions error:', insertErr);
        return res.status(500).json({ error: 'Failed to save custom question.' });
      }
      res.status(201).json({ id: this.lastID, question, option_a, option_b, option_c, option_d, correct_option, explanation, domain, custom: 1 });
    });
    stmt.finalize();
  });
});

// GET /api/cism/flashcards
app.get('/api/cism/flashcards', (req, res) => {
  db.all('SELECT * FROM cism_flashcards ORDER BY id ASC', [], (err, rows) => {
    if (err) {
      console.error('[SERVER] GET /api/cism/flashcards error:', err);
      return res.status(500).json({ error: 'Failed to retrieve CISM flashcards.' });
    }
    res.json(rows);
  });
});

// POST /api/cism/flashcards
app.post('/api/cism/flashcards', (req, res) => {
  const { term, definition, domain } = req.body;
  if (!term || !definition || !domain) {
    return res.status(400).json({ error: 'Term, definition, and domain are required.' });
  }

  const stmt = db.prepare(`
    INSERT INTO cism_flashcards (
      term, definition, domain, custom
    ) VALUES (?, ?, ?, 1)
  `);
  stmt.run(term, definition, parseInt(domain), function (err) {
    if (err) {
      console.error('[SERVER] POST /api/cism/flashcards error:', err);
      return res.status(500).json({ error: 'Failed to save custom CISM flashcard.' });
    }
    res.status(201).json({ id: this.lastID, term, definition, domain, custom: 1 });
  });
  stmt.finalize();
});

// GET /api/cism/attempts
app.get('/api/cism/attempts', (req, res) => {
  const user = req.query.user || 'Nycto';
  db.all('SELECT * FROM cism_attempts WHERE user = ? ORDER BY id DESC LIMIT 50', [user], (err, rows) => {
    if (err) {
      console.error('[SERVER] GET /api/cism/attempts error:', err);
      return res.status(500).json({ error: 'Failed to retrieve CISM scores.' });
    }
    res.json(rows);
  });
});

// POST /api/cism/attempts
app.post('/api/cism/attempts', (req, res) => {
  const { score, correct_count, total_count, duration_seconds, user } = req.body;
  const activeUser = user || 'Nycto';
  if (typeof score !== 'number' || typeof correct_count !== 'number' || typeof total_count !== 'number' || typeof duration_seconds !== 'number') {
    return res.status(400).json({ error: 'Invalid attempt parameters.' });
  }

  const timestamp = new Date().toISOString();
  const stmt = db.prepare('INSERT INTO cism_attempts (user, timestamp, score, correct_count, total_count, duration_seconds) VALUES (?, ?, ?, ?, ?, ?)');
  stmt.run(activeUser, timestamp, score, correct_count, total_count, duration_seconds, function (err) {
    if (err) {
      console.error('[SERVER] POST /api/cism/attempts error:', err);
      return res.status(500).json({ error: 'Failed to record attempt score.' });
    }
    
    // Auto-prune database to keep only the latest 100 runs max per user
    db.run('DELETE FROM cism_attempts WHERE user = ? AND id NOT IN (SELECT id FROM cism_attempts WHERE user = ? ORDER BY id DESC LIMIT 100)', [activeUser, activeUser], (pruneErr) => {
      if (pruneErr) console.error('[SERVER] Failed to prune old attempts:', pruneErr);
    });

    res.status(201).json({ id: this.lastID, user: activeUser, timestamp, score, correct_count, total_count, duration_seconds });
  });
  stmt.finalize();
});

// GET /api/cism/bookmarks
app.get('/api/cism/bookmarks', (req, res) => {
  const user = req.query.user || 'Nycto';
  db.all('SELECT * FROM cism_bookmarks WHERE user = ?', [user], (err, rows) => {
    if (err) {
      console.error('[SERVER] GET /api/cism/bookmarks error:', err);
      return res.status(500).json({ error: 'Failed to retrieve CISM bookmarks.' });
    }
    res.json(rows);
  });
});

// POST /api/cism/bookmarks
app.post('/api/cism/bookmarks', (req, res) => {
  const { item_type, item_id, bookmarked, user } = req.body;
  const activeUser = user || 'Nycto';
  if (!item_type || !item_id) {
    return res.status(400).json({ error: 'item_type and item_id are required.' });
  }

  if (bookmarked) {
    // Cap total bookmarks to 100 flags max per user to prevent database spam
    db.get('SELECT COUNT(*) as count FROM cism_bookmarks WHERE user = ?', [activeUser], (err, row) => {
      if (err) {
        console.error('[SERVER] Database error checking bookmarks count:', err);
        return res.status(500).json({ error: 'Failed to verify bookmarks limit.' });
      }
      if (row && row.count >= 100) {
        return res.status(400).json({ error: 'Limit reached. Bookmarks are capped at a maximum of 100 total entries.' });
      }

      const stmt = db.prepare('INSERT OR IGNORE INTO cism_bookmarks (user, item_type, item_id) VALUES (?, ?, ?)');
      stmt.run(activeUser, item_type, item_id, function (insertErr) {
        if (insertErr) {
          console.error('[SERVER] POST /api/cism/bookmarks insert error:', insertErr);
          return res.status(500).json({ error: 'Failed to flag CISM item.' });
        }
        res.json({ message: 'Item flagged successfully.', bookmarked: true });
      });
      stmt.finalize();
    });
  } else {
    db.run('DELETE FROM cism_bookmarks WHERE user = ? AND item_type = ? AND item_id = ?', [activeUser, item_type, item_id], function (err) {
      if (err) {
        console.error('[SERVER] POST /api/cism/bookmarks delete error:', err);
        return res.status(500).json({ error: 'Failed to unflag CISM item.' });
      }
      res.json({ message: 'Item unflagged successfully.', bookmarked: false });
    });
  }
});

// ==========================================
// API ENDPOINTS: Route Telemetry & Atmospheric Analyzer
// ==========================================

app.post('/api/telemetry/analyze', async (req, res) => {
  const { origin, destination, vehicleId } = req.body;

  if (!origin || !destination || !vehicleId) {
    return res.status(400).json({ error: 'origin, destination, and vehicleId are required.' });
  }

  // Production Setup Note: In a production environment, real API keys (e.g. OpenWeatherMap, Google Roads API)
  // would be retrieved from process.env and queried inside the loop to fetch actual coordinates and weather vectors.
  const vehicles = {
    sedan: { name: 'Sedan (Standard)', baseDrag: 0.28, baseStability: 85, weightKg: 1500, crosswindLimitMph: 35 },
    suv: { name: 'SUV (Utility)', baseDrag: 0.38, baseStability: 75, weightKg: 2200, crosswindLimitMph: 30 },
    semi: { name: 'Semi-Truck (Heavy Cargo)', baseDrag: 0.65, baseStability: 50, weightKg: 18000, crosswindLimitMph: 20 },
    ev: { name: 'EV (Aero optimized)', baseDrag: 0.22, baseStability: 90, weightKg: 2100, crosswindLimitMph: 38 }
  };

  const selectedVehicle = vehicles[vehicleId.toLowerCase()] || vehicles.sedan;

  const routeWaypoints = {
    "mountain_pass": [
      { name: "Valley Checkpoint", distanceMark: 0, lat: 34.0522, lon: -118.2437, elevationFeet: 400 },
      { name: "Canyon Switchback", distanceMark: 12, lat: 34.1250, lon: -118.1920, elevationFeet: 2200 },
      { name: "Summit Ridge Pass", distanceMark: 28, lat: 34.2380, lon: -118.1150, elevationFeet: 6800 },
      { name: "Desert Descent", distanceMark: 45, lat: 34.3120, lon: -118.0120, elevationFeet: 3100 }
    ],
    "coastal_highway": [
      { name: "Harbor Start", distanceMark: 0, lat: 36.6002, lon: -121.8947, elevationFeet: 15 },
      { name: "Oceanic Bluff", distanceMark: 15, lat: 36.5120, lon: -121.9320, elevationFeet: 120 },
      { name: "Cove Outlook", distanceMark: 32, lat: 36.4250, lon: -121.9810, elevationFeet: 250 },
      { name: "Bridge Approach", distanceMark: 50, lat: 36.3110, lon: -122.0120, elevationFeet: 80 }
    ],
    "urban_corridor": [
      { name: "Downtown Terminus", distanceMark: 0, lat: 40.7128, lon: -74.0060, elevationFeet: 35 },
      { name: "Industrial Bypass", distanceMark: 5, lat: 40.7550, lon: -73.9820, elevationFeet: 55 },
      { name: "River Crossing Bridge", distanceMark: 12, lat: 40.7920, lon: -73.9550, elevationFeet: 140 },
      { name: "Suburban Outlet", distanceMark: 20, lat: 40.8350, lon: -73.9210, elevationFeet: 90 }
    ]
  };

  const routeKey = `${origin.toLowerCase()}_${destination.toLowerCase()}`;
  const waypoints = routeWaypoints[routeKey] || routeWaypoints["mountain_pass"];

  try {
    const aggregatedWaypoints = [];
    let cumulativeDrag = 0;
    let minStability = 100;
    let minExposureMargin = 100;

    for (const wp of waypoints) {
      // Simulate API query latency
      await new Promise(resolve => setTimeout(resolve, 150));

      const elevationWindFactor = wp.elevationFeet > 4000 ? 2.5 : 1.0;
      const windSpeed = Math.round((12 + Math.random() * 15) * elevationWindFactor);
      const windDirection = Math.round(Math.random() * 360);
      const precipitation = Math.floor(Math.random() * 6);

      const routeAngle = 45;
      const relativeAngleRad = ((windDirection - routeAngle) * Math.PI) / 180;
      
      const headwindComponent = windSpeed * Math.cos(relativeAngleRad);
      const crosswindComponent = Math.abs(windSpeed * Math.sin(relativeAngleRad));

      const dragCoefficient = Math.round((selectedVehicle.baseDrag + Math.max(0, headwindComponent * 0.003)) * 100) / 100;
      const crosswindRatio = crosswindComponent / selectedVehicle.crosswindLimitMph;
      const stabilityIndex = Math.max(0, Math.round(selectedVehicle.baseStability - (crosswindRatio * 45)));

      const precipitationPenalty = precipitation * 8;
      const altitudePenalty = Math.max(0, (wp.elevationFeet - 2000) * 0.002);
      const exposureMargin = Math.max(0, Math.round(100 - (precipitationPenalty + altitudePenalty + (crosswindRatio * 20))));

      let tractionStatus = "NORMAL";
      if (precipitation >= 4 || exposureMargin < 50) {
        tractionStatus = "CRITICAL";
      } else if (precipitation >= 1 || exposureMargin < 75) {
        tractionStatus = "DEGRADED";
      }

      cumulativeDrag += dragCoefficient;
      if (stabilityIndex < minStability) minStability = stabilityIndex;
      if (exposureMargin < minExposureMargin) minExposureMargin = exposureMargin;

      aggregatedWaypoints.push({
        ...wp,
        windSpeed,
        windDirection,
        precipitation,
        headwindComponent: Math.round(headwindComponent * 10) / 10,
        crosswindComponent: Math.round(crosswindComponent * 10) / 10,
        dragCoefficient,
        stabilityIndex,
        exposureMargin,
        tractionStatus
      });
    }

    const avgDrag = Math.round((cumulativeDrag / waypoints.length) * 100) / 100;

    res.json({
      route: routeKey.toUpperCase().replace('_', ' TO '),
      vehicle: selectedVehicle.name,
      overallStabilityIndex: minStability,
      overallExposureMargin: minExposureMargin,
      overallDragCoefficient: avgDrag,
      waypoints: aggregatedWaypoints
    });

  } catch (error) {
    console.error('[SERVER] Telemetry query failed:', error);
    res.status(500).json({ error: 'Failed to aggregate atmospheric telemetry data.' });
  }
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  db.close(() => {
    console.log('[DATABASE] Closed connection to SQLite.');
    process.exit(0);
  });
});

// Start Server
app.listen(PORT, '127.0.0.1', () => {
  console.log(`[SERVER] Node backend API running locally on http://127.0.0.1:${PORT}`);
});
