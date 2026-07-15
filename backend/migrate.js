const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Failed to open database:', err);
    process.exit(1);
  }
  
  db.serialize(() => {
    db.run('DROP TABLE IF EXISTS cism_questions', (dropErr) => {
      if (dropErr) console.error('Failed to drop cism_questions:', dropErr);
      else console.log('Dropped cism_questions table.');
    });
    
    db.run('DROP TABLE IF EXISTS cism_flashcards', (dropErr) => {
      if (dropErr) console.error('Failed to drop cism_flashcards:', dropErr);
      else console.log('Dropped cism_flashcards table.');
    });
  });
  
  db.close(() => {
    console.log('Database connection closed.');
  });
});
