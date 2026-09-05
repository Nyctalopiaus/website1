#!/bin/sh
# Pre-commit hook template — blocks a commit that would ship an index.html
# with the recurring modal/div-nesting bug (see project memory:
# local_db_modal_fix.md and homeward/scripts/check-div-balance.js).
#
# This file is NOT auto-installed by git (hooks live outside version
# control by default). To activate it once, from the vm_code repo root:
#   cp homeward/scripts/pre-commit-hook.sh .git/hooks/pre-commit
#   chmod +x .git/hooks/pre-commit
#
# Only runs the checker against index.html files actually staged in the
# commit, so it stays silent for commits that don't touch one.

REPO_ROOT=$(git rev-parse --show-toplevel)
CHECKER="$REPO_ROOT/homeward/scripts/check-div-balance.js"
STAGED_INDEX_FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -E '(^|/)index\.html$')

if [ -z "$STAGED_INDEX_FILES" ]; then
  exit 0
fi

if [ ! -f "$CHECKER" ]; then
  echo "pre-commit: check-div-balance.js not found at $CHECKER — skipping check."
  exit 0
fi

FAILED=0
for f in $STAGED_INDEX_FILES; do
  node "$CHECKER" "$REPO_ROOT/$f"
  if [ $? -ne 0 ]; then
    FAILED=1
  fi
done

if [ $FAILED -ne 0 ]; then
  echo ""
  echo "pre-commit: blocked — check-div-balance found a problem above. Fix it, or"
  echo "  commit with --no-verify to force it through (not recommended)."
  exit 1
fi

exit 0
