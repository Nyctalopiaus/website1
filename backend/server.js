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
        item_type TEXT NOT NULL,
        item_id INTEGER NOT NULL,
        UNIQUE(item_type, item_id)
      )
    `);

    // Initialize CISM questions & flashcards from cism_seed.json if empty
    db.get('SELECT id FROM cism_questions LIMIT 1', (err, row) => {
      if (err) {
        console.error('[DATABASE] Error checking cism_questions table:', err);
      } else if (!row) {
        seedCismData();
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
  db.all('SELECT * FROM cism_attempts ORDER BY id DESC LIMIT 50', [], (err, rows) => {
    if (err) {
      console.error('[SERVER] GET /api/cism/attempts error:', err);
      return res.status(500).json({ error: 'Failed to retrieve CISM scores.' });
    }
    res.json(rows);
  });
});

// POST /api/cism/attempts
app.post('/api/cism/attempts', (req, res) => {
  const { score, correct_count, total_count, duration_seconds } = req.body;
  if (typeof score !== 'number' || typeof correct_count !== 'number' || typeof total_count !== 'number' || typeof duration_seconds !== 'number') {
    return res.status(400).json({ error: 'Invalid attempt parameters.' });
  }

  const timestamp = new Date().toISOString();
  const stmt = db.prepare('INSERT INTO cism_attempts (timestamp, score, correct_count, total_count, duration_seconds) VALUES (?, ?, ?, ?, ?)');
  stmt.run(timestamp, score, correct_count, total_count, duration_seconds, function (err) {
    if (err) {
      console.error('[SERVER] POST /api/cism/attempts error:', err);
      return res.status(500).json({ error: 'Failed to record attempt score.' });
    }
    
    // Auto-prune database to keep only the latest 100 runs max
    db.run('DELETE FROM cism_attempts WHERE id NOT IN (SELECT id FROM cism_attempts ORDER BY id DESC LIMIT 100)', [], (pruneErr) => {
      if (pruneErr) console.error('[SERVER] Failed to prune old attempts:', pruneErr);
    });

    res.status(201).json({ id: this.lastID, timestamp, score, correct_count, total_count, duration_seconds });
  });
  stmt.finalize();
});

// GET /api/cism/bookmarks
app.get('/api/cism/bookmarks', (req, res) => {
  db.all('SELECT * FROM cism_bookmarks', [], (err, rows) => {
    if (err) {
      console.error('[SERVER] GET /api/cism/bookmarks error:', err);
      return res.status(500).json({ error: 'Failed to retrieve CISM bookmarks.' });
    }
    res.json(rows);
  });
});

// POST /api/cism/bookmarks
app.post('/api/cism/bookmarks', (req, res) => {
  const { item_type, item_id, bookmarked } = req.body;
  if (!item_type || !item_id) {
    return res.status(400).json({ error: 'item_type and item_id are required.' });
  }

  if (bookmarked) {
    // Cap total bookmarks to 100 flags max to prevent database spam
    db.get('SELECT COUNT(*) as count FROM cism_bookmarks', [], (err, row) => {
      if (err) {
        console.error('[SERVER] Database error checking bookmarks count:', err);
        return res.status(500).json({ error: 'Failed to verify bookmarks limit.' });
      }
      if (row && row.count >= 100) {
        return res.status(400).json({ error: 'Limit reached. Bookmarks are capped at a maximum of 100 total entries.' });
      }

      const stmt = db.prepare('INSERT OR IGNORE INTO cism_bookmarks (item_type, item_id) VALUES (?, ?)');
      stmt.run(item_type, item_id, function (insertErr) {
        if (insertErr) {
          console.error('[SERVER] POST /api/cism/bookmarks insert error:', insertErr);
          return res.status(500).json({ error: 'Failed to flag CISM item.' });
        }
        res.json({ message: 'Item flagged successfully.', bookmarked: true });
      });
      stmt.finalize();
    });
  } else {
    db.run('DELETE FROM cism_bookmarks WHERE item_type = ? AND item_id = ?', [item_type, item_id], function (err) {
      if (err) {
        console.error('[SERVER] POST /api/cism/bookmarks delete error:', err);
        return res.status(500).json({ error: 'Failed to unflag CISM item.' });
      }
      res.json({ message: 'Item unflagged successfully.', bookmarked: false });
    });
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
