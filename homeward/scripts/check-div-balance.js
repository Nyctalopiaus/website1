#!/usr/bin/env node
/**
 * check-div-balance.js
 *
 * Catches the recurring homeward index.html bug documented in project
 * memory (local_db_modal_fix.md): a missing </div> nests a later modal
 * inside an earlier one, which — because the earlier modal has
 * class="hidden" — silently collapses the later modal to 0x0 with no JS
 * error. Happened three times in two days (2026-08-22 x2, 2026-08-23)
 * before this script existed.
 *
 * What it checks, walking the file in document order with a stack of open
 * <div> tags (this mirrors how a browser actually parses it, not just a
 * naive count):
 *   1. Whole-file <div> / </div> count balance.
 *   2. For every `id="modal-*"` div: is any of its ancestors ALSO a
 *      `modal-*` div? That's the actual bug class — a plain count mismatch
 *      can hide exactly which modal(s) got swallowed, so this is the more
 *      useful check.
 *
 * Usage (from the homeward/ folder):
 *   node scripts/check-div-balance.js [path/to/some.html ...]
 *   (defaults to homeward/index.html — the file one level up — if no path given)
 *
 * Exit code 0 = clean, 1 = problem found (also used by the pre-commit
 * hook in .githooks/pre-commit to block a bad commit).
 */

const fs = require('fs');
const path = require('path');

function checkFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');

  // Matches an opening <div ...> or a closing </div> tag, in document
  // order. Deliberately simple (no full HTML parser) — good enough for
  // this codebase's plain, unminified markup, and that simplicity is what
  // makes it easy to trust/maintain.
  const tagPattern = /<div\b([^>]*)>|<\/div\s*>/gi;
  const idPattern = /\bid\s*=\s*["']([^"']+)["']/i;

  const stack = []; // { id: string|null, line: number }
  const nestingIssues = []; // { childId, childLine, parentId, parentLine }
  let extraCloses = 0;
  let match;
  let line = 1;
  let lastIndex = 0;

  while ((match = tagPattern.exec(content)) !== null) {
    // Track line number by counting newlines since the last match.
    line += (content.slice(lastIndex, match.index).match(/\n/g) || []).length;
    lastIndex = match.index;

    const isClose = match[0].toLowerCase().startsWith('</');

    if (isClose) {
      if (stack.length === 0) {
        extraCloses++;
      } else {
        stack.pop();
      }
      continue;
    }

    const attrs = match[1] || '';
    const idMatch = attrs.match(idPattern);
    const id = idMatch ? idMatch[1] : null;

    if (id && id.startsWith('modal-')) {
      const openModalAncestor = stack.find(entry => entry.id && entry.id.startsWith('modal-'));
      if (openModalAncestor) {
        nestingIssues.push({
          childId: id,
          childLine: line,
          parentId: openModalAncestor.id,
          parentLine: openModalAncestor.line
        });
      }
    }

    stack.push({ id, line });
  }

  const unclosedCount = stack.length;
  const unclosedModals = stack.filter(entry => entry.id).map(entry => `${entry.id} (line ${entry.line})`);

  const opens = (content.match(/<div\b/gi) || []).length;
  const closes = (content.match(/<\/div\s*>/gi) || []).length;

  const problems = [];
  if (opens !== closes) {
    problems.push(`Div count mismatch: ${opens} <div> vs ${closes} </div> (diff ${opens - closes}).`);
  }
  if (extraCloses > 0) {
    problems.push(`${extraCloses} </div> tag(s) with no matching open <div> found before them.`);
  }
  if (unclosedCount > 0) {
    problems.push(`${unclosedCount} <div> tag(s) never closed by end of file.` +
      (unclosedModals.length ? ` Includes: ${unclosedModals.join(', ')}` : ''));
  }
  nestingIssues.forEach(issue => {
    problems.push(
      `Modal nesting bug: #${issue.childId} (line ${issue.childLine}) is nested inside ` +
      `#${issue.parentId} (opened line ${issue.parentLine}) — since ${issue.parentId} likely ` +
      `has class="hidden", ${issue.childId} will silently render at 0x0. Almost always means a ` +
      `missing </div> somewhere between line ${issue.parentLine} and line ${issue.childLine}.`
    );
  });

  return problems;
}

function main() {
  const args = process.argv.slice(2);
  // This script lives at homeward/scripts/check-div-balance.js, so its
  // default target (when no path is given) is the index.html one level up.
  const defaultPath = path.join(__dirname, '..', 'index.html');
  const targets = args.length > 0 ? args : [defaultPath];

  let anyProblems = false;

  targets.forEach(target => {
    if (!fs.existsSync(target)) {
      console.error(`check-div-balance: file not found: ${target}`);
      anyProblems = true;
      return;
    }
    const problems = checkFile(target);
    if (problems.length === 0) {
      console.log(`check-div-balance: ${target} — OK`);
    } else {
      anyProblems = true;
      console.error(`check-div-balance: ${target} — ${problems.length} problem(s):`);
      problems.forEach(p => console.error(`  - ${p}`));
    }
  });

  process.exit(anyProblems ? 1 : 0);
}

main();
