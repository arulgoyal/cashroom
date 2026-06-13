#!/usr/bin/env bash
# Prepends current branch + dirty file count so it survives compaction.
BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
DIRTY=$(git status --porcelain 2>/dev/null | wc -l | tr -d " ")
SPEC=$(ls .claude/specs/in-progress/*.md 2>/dev/null | head -1 || echo "")
if [ -n "$SPEC" ]; then
  echo "[branch=$BRANCH, dirty=$DIRTY files, active-spec=$SPEC]"
else
  echo "[branch=$BRANCH, dirty=$DIRTY files]"
fi
