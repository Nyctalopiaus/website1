const fs = require('fs');
const path = require('path');

const partsDir = path.join(__dirname, 'cism_parts');
const outPath = path.join(__dirname, 'cism_seed.json');

console.log('[COMPILER] Starting CISM database compilation...');

try {
  // Read parts
  const f1Path = path.join(partsDir, 'cism_flashcards_part1.json');
  const f2Path = path.join(partsDir, 'cism_flashcards_part2.json');
  const q1Path = path.join(partsDir, 'cism_questions_part1.json');
  const q2Path = path.join(partsDir, 'cism_questions_part2.json');
  const q3Path = path.join(partsDir, 'cism_questions_part3.json');
  const q4Path = path.join(partsDir, 'cism_questions_part4.json');

  const f1 = JSON.parse(fs.readFileSync(f1Path, 'utf8')).flashcards;
  const f2 = JSON.parse(fs.readFileSync(f2Path, 'utf8')).flashcards;
  const q1 = JSON.parse(fs.readFileSync(q1Path, 'utf8')).questions;
  const q2 = JSON.parse(fs.readFileSync(q2Path, 'utf8')).questions;
  const q3 = JSON.parse(fs.readFileSync(q3Path, 'utf8')).questions;
  const q4 = JSON.parse(fs.readFileSync(q4Path, 'utf8')).questions;

  // Merge
  const mergedFlashcards = [...f1, ...f2];
  const mergedQuestions = [...q1, ...q2, ...q3, ...q4];

  console.log(`[COMPILER] Parsed ${mergedFlashcards.length} flashcards and ${mergedQuestions.length} questions.`);

  if (mergedFlashcards.length < 150 || mergedQuestions.length < 100) {
    throw new Error(`Invalid counts: Flashcards count is ${mergedFlashcards.length} (expected >=150), Questions count is ${mergedQuestions.length} (expected >=100).`);
  }

  // Compile final JSON structure
  const compiledData = {
    questions: mergedQuestions,
    flashcards: mergedFlashcards
  };

  // Write out
  fs.writeFileSync(outPath, JSON.stringify(compiledData, null, 2), 'utf8');
  console.log(`[COMPILER] Successfully wrote compiled database seed to: ${outPath}`);

  // Delete temp files and directory
  fs.unlinkSync(f1Path);
  fs.unlinkSync(f2Path);
  fs.unlinkSync(q1Path);
  fs.unlinkSync(q2Path);
  fs.unlinkSync(q3Path);
  fs.unlinkSync(q4Path);
  fs.rmdirSync(partsDir);
  console.log('[COMPILER] Cleaned up temporary parts directory.');

} catch (err) {
  console.error('[COMPILER] [ERROR] Compilation failed:', err.message);
  process.exit(1);
}
