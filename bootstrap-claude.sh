#!/usr/bin/env bash
#
# bootstrap-claude-setup.sh
# Sets up the SoA Claude Code repo-level scaffolding described in the
# Claude Code Setup Guide. Idempotent: skips any file that already exists.
#
# Usage:
#   cd <your-repo>
#   bash bootstrap-claude-setup.sh
#
# Optional flags:
#   --force           Overwrite existing files (DESTRUCTIVE)
#   --skip-graph      Skip knowledge-graph install hint at the end
#   --stack=<name>    nestjs (default) | next | python | generic
#

set -euo pipefail

# ---------- args ----------
FORCE=0
SKIP_GRAPH=0
STACK="nestjs"
for arg in "$@"; do
  case "$arg" in
    --force) FORCE=1 ;;
    --skip-graph) SKIP_GRAPH=1 ;;
    --stack=*) STACK="${arg#*=}" ;;
    -h|--help)
      grep '^#' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *) echo "unknown arg: $arg" >&2; exit 2 ;;
  esac
done

# ---------- helpers ----------
say() { printf "\033[1;34m[claude-setup]\033[0m %s\n" "$*"; }
ok()  { printf "\033[1;32m  ✓\033[0m %s\n" "$*"; }
skip(){ printf "\033[1;33m  -\033[0m %s (exists, skipping)\n" "$*"; }
warn(){ printf "\033[1;33m[warn]\033[0m %s\n" "$*"; }

write_file() {
  local path="$1"; shift
  local content="$*"
  if [[ -f "$path" && "$FORCE" -ne 1 ]]; then
    skip "$path"
    return
  fi
  mkdir -p "$(dirname "$path")"
  printf "%s" "$content" > "$path"
  ok "wrote $path"
}

ensure_gitignore() {
  local pattern="$1"
  if [[ ! -f .gitignore ]]; then touch .gitignore; fi
  if ! grep -qxF "$pattern" .gitignore; then
    echo "$pattern" >> .gitignore
    ok ".gitignore += $pattern"
  fi
}

# ---------- preconditions ----------
if [[ ! -d .git ]]; then
  warn "no .git directory found — are you sure this is a repo root?"
  read -r -p "  continue anyway? [y/N] " yn
  [[ "$yn" =~ ^[Yy]$ ]] || exit 1
fi

say "stack: $STACK"
say "force: $FORCE"

# ---------- directories ----------
say "creating .claude/ tree"
mkdir -p \
  .claude/agents \
  .claude/skills/clarify-first \
  .claude/commands \
  .claude/specs/in-progress \
  .claude/specs/executed \
  .claude/specs/decisions \
  .claude/hooks \
  .claude/agent-memory

# ---------- gitignore ----------
say "updating .gitignore"
ensure_gitignore ".claude/settings.local.json"
ensure_gitignore ".claude/agent-memory/"

# ---------- root CLAUDE.md ----------
say "writing project memory"

case "$STACK" in
  nestjs)
    STACK_LINE="NestJS, TypeScript, TypeORM, PostgreSQL, Redis"
    BUILD_CMDS=$'- `npm run dev`        — local API\n- `npm run test:unit`  — fast tests (run after every edit)\n- `npm run test:e2e`   — slow tests (run on completion only)\n- `npm run lint:fix`   — must pass before commit\n- `npm run typecheck`  — must pass before commit'
    ARCH_RULES=$'- TypeORM repositories, not raw QueryBuilder, unless justified in the spec\n- New multi-step flows use a state-machine library (XState), not ad-hoc booleans\n- Money is `bigint` in the smallest unit (paise/cents), never `number`\n- All external HTTP calls go through `*.client.ts` with retry + circuit breaker\n- Mutations on shared rows: use the Redis distributed lock helper'
    ;;
  next)
    STACK_LINE="Next.js, TypeScript, React, Tailwind"
    BUILD_CMDS=$'- `npm run dev`        — local dev server\n- `npm run build`      — production build\n- `npm run test`       — Jest / Vitest\n- `npm run lint:fix`   — must pass before commit\n- `npm run typecheck`  — must pass before commit'
    ARCH_RULES=$'- Server components by default; mark client components explicitly with `"use client"`\n- Data fetching in server components or route handlers; never directly in client components\n- All forms use react-hook-form + zod for validation\n- Feature flags via the existing flag provider; never inline conditionals on env'
    ;;
  python)
    STACK_LINE="Python, FastAPI / Django"
    BUILD_CMDS=$'- `make dev`           — local server\n- `make test`          — pytest fast suite\n- `make lint`          — ruff / black\n- `make typecheck`     — mypy / pyright'
    ARCH_RULES=$'- Type hints are mandatory on public functions\n- Pydantic models for all I/O boundaries\n- Database access through the repository layer, not raw SQL'
    ;;
  *)
    STACK_LINE="<fill in your stack>"
    BUILD_CMDS=$'- `<command>` — <description>'
    ARCH_RULES=$'- <fill in architectural rules>'
    ;;
esac

write_file "CLAUDE.md" "# Project memory

## Stack
- $STACK_LINE

## Commands
$BUILD_CMDS

## Investigation rule (NON-NEGOTIABLE)
Before claiming anything about the codebase: read the file.
Before proposing a change: read the consumers.
Use the explorer subagent for scans larger than ~5 files.
Never invent function signatures, env vars, or DB columns.

## Ask-first rule
For any change touching >1 file or any new public API, invoke the
clarify-first skill BEFORE planning. Cap at 3 questions per round.

## Architectural rules
$ARCH_RULES

## Context navigation (3-layer rule)
1. FIRST, query the code-review-graph MCP tools (e.g. \`get_minimal_context_tool\`,
   \`get_impact_radius_tool\`) before any Grep / Read on source files.
   For deeper structural / multi-modal context, consult \`graphify-out/GRAPH_REPORT.md\`.
2. SECOND, query \`.claude/agent-memory/\` and \`.claude/specs/decisions/\`
3. THIRD, read raw files — only when steps 1 and 2 don't answer

## Compaction instructions
When compacting, preserve verbatim:
- List of files modified this session
- The active spec path under \`.claude/specs/in-progress/\`
- Any open questions the user has not yet answered

## Directory map (high-level only — use the graph for details)
- src/<module-1> — <one-line purpose>
- src/<module-2> — <one-line purpose>
- src/common    — shared utilities

## Specs
Active features: see \`.claude/specs/in-progress/\`
Past decisions: see \`.claude/specs/decisions/\`
"

# ---------- settings.json ----------
write_file ".claude/settings.json" '{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "permissions": {
    "allow": [
      "Bash(npm run lint:*)",
      "Bash(npm run test:unit*)",
      "Bash(npm run typecheck*)",
      "Bash(git status)",
      "Bash(git diff*)",
      "Bash(git log*)",
      "Bash(git branch*)",
      "Read(**)",
      "Glob(**)",
      "Grep(**)"
    ],
    "deny": [
      "Bash(git push --force*)",
      "Bash(git push -f*)",
      "Bash(rm -rf*)",
      "Bash(npm publish*)",
      "Edit(.env*)",
      "Edit(node_modules/**)",
      "Edit(dist/**)",
      "Edit(build/**)"
    ]
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          { "type": "command", "command": ".claude/hooks/block-prod-creds.sh" }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          { "type": "command", "command": ".claude/hooks/lint-changed.sh" }
        ]
      }
    ],
    "UserPromptSubmit": [
      { "type": "command", "command": ".claude/hooks/inject-branch-state.sh" }
    ]
  }
}
'

# ---------- settings.local.json (template) ----------
write_file ".claude/settings.local.json" '{
  "_comment": "Personal overrides. Gitignored. Override permissions or hooks here for your machine."
}
'

# ---------- hooks ----------
write_file ".claude/hooks/block-prod-creds.sh" '#!/usr/bin/env bash
# Blocks any Bash command that references production credentials or DBs.
# Reads JSON from stdin. Exit 2 = block. Exit 0 = allow.
INPUT=$(cat)

# Extract .tool_input.command — prefer jq, fall back to python3
if command -v jq >/dev/null 2>&1; then
  COMMAND=$(echo "$INPUT" | jq -r ".tool_input.command // \"\"")
else
  COMMAND=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print((d.get(\"tool_input\") or {}).get(\"command\",\"\"))" 2>/dev/null || echo "")
fi

if echo "$COMMAND" | grep -Eqi "(prod|production)\.(env|config)|PROD_DB_PASSWORD|AWS_PROD_|DATABASE_URL.*prod"; then
  echo "BLOCKED: command appears to reference production credentials" >&2
  exit 2
fi

# Block schema-destructive SQL when piped to psql/mysql
if echo "$COMMAND" | grep -Eqi "(drop\s+(table|database|schema)|truncate\s+table)" \
   && echo "$COMMAND" | grep -Eqi "(psql|mysql|pg_)"; then
  echo "BLOCKED: schema-destructive SQL against a database client" >&2
  exit 2
fi

exit 0
'

write_file ".claude/hooks/lint-changed.sh" '#!/usr/bin/env bash
# Runs lint only on the changed file. Quiet on success.
INPUT=$(cat)

if command -v jq >/dev/null 2>&1; then
  FILE=$(echo "$INPUT" | jq -r ".tool_input.file_path // \"\"")
else
  FILE=$(echo "$INPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print((d.get(\"tool_input\") or {}).get(\"file_path\",\"\"))" 2>/dev/null || echo "")
fi

[ -z "$FILE" ] && exit 0
[ ! -f "$FILE" ] && exit 0

case "$FILE" in
  *.ts|*.tsx|*.js|*.jsx)
    npx --no-install eslint "$FILE" --quiet 2>&1 || true
    ;;
  *.py)
    ruff check "$FILE" 2>&1 || true
    ;;
esac
exit 0
'

write_file ".claude/hooks/inject-branch-state.sh" '#!/usr/bin/env bash
# Prepends current branch + dirty file count so it survives compaction.
BRANCH=$(git branch --show-current 2>/dev/null || echo "unknown")
DIRTY=$(git status --porcelain 2>/dev/null | wc -l | tr -d " ")
SPEC=$(ls .claude/specs/in-progress/*.md 2>/dev/null | head -1 || echo "")
if [ -n "$SPEC" ]; then
  echo "[branch=$BRANCH, dirty=$DIRTY files, active-spec=$SPEC]"
else
  echo "[branch=$BRANCH, dirty=$DIRTY files]"
fi
'

chmod +x .claude/hooks/*.sh 2>/dev/null || true
ok "hooks made executable"

# ---------- skills ----------
write_file ".claude/skills/clarify-first/SKILL.md" '---
name: clarify-first
description: Use BEFORE planning or implementing any code change that touches more than one file, adds a new public API, modifies a database schema, or changes a payment/auth/KYC/security flow. Forces structured questioning to surface ambiguity before code is written. Do NOT use for one-line typo fixes or single-file edits where intent is unambiguous.
---

# Clarify before executing

Before producing a plan, identify ambiguity along these dimensions:

1. **Contract** — exact request/response shape, error codes, idempotency semantics
2. **Data** — schema changes, migration strategy, backfill needs, indexing
3. **State** — concurrency, locking, retry semantics, partial-failure recovery
4. **Edge cases** — empty/null/duplicate, large inputs, timeout behaviour
5. **Ownership** — who owns the call sites, who reviews, who is on-call
6. **Rollout** — feature flag? backward compat? rollback plan? canary?

## Rules

- Read the codebase first. Never ask what the code can answer.
- Use the AskUserQuestion tool. Cap at 3 questions per round.
- Bias toward fewer, higher-value questions.
- After answers, write a spec to `.claude/specs/in-progress/<slug>.md`
  with: goal, files-touched, risk, validation steps, rollback.
- Only after the spec is written and the user explicitly approves,
  exit this skill and proceed to implementation.

## Spec template

```markdown
# Spec: <slug>
**Status:** in-progress
**Owner:** @<user>
**Started:** <date>

## Goal
<one paragraph>

## Decisions
- [x] <resolved>
- [ ] <open question>

## Files touched
- `<path>` (new|modified|deleted)

## Validation
- Unit: <what>
- Integration: <what>
- Manual: <what>

## Rollback
<how to undo>

## Risk: LOW | MEDIUM | HIGH
<one-line justification>
```
'

# ---------- subagents ----------
write_file ".claude/agents/explorer.md" '---
name: explorer
description: Read-only scout for codebase exploration. Use FIRST for any "how does X work" or "where is Y" question. Returns a distilled summary, not raw file dumps. Saves the main context window.
tools: Read, Grep, Glob
model: haiku
---

You are a read-only codebase scout. You run in an isolated context window.

For each task:
1. Query the code-review-graph MCP tools first (call `get_minimal_context_tool`)
2. Then narrow with Grep / Glob if needed
3. Read targeted files only when necessary
4. Return a 5–15 line summary covering:
   - Relevant file paths
   - Key types / functions
   - Call sites and consumers
   - Risks or surprises noticed

Never write or edit. Never run anything. Just report.
'

write_file ".claude/agents/planner.md" '---
name: planner
description: Turns a feature request into a reviewed spec. Always uses the clarify-first skill. Outputs to .claude/specs/in-progress/. Does NOT write implementation code.
tools: Read, Grep, Glob, Task
skills: clarify-first
model: sonnet
---

Your job: turn a feature request into a reviewed spec.

1. Spawn the `explorer` subagent for codebase context
2. Load the `clarify-first` skill, ask up to 3 questions
3. Write the spec to `.claude/specs/in-progress/<slug>.md`
4. STOP. Do not write code. Wait for explicit "approved, implement".
'

write_file ".claude/agents/architect.md" '---
name: architect
description: Use for cross-module decisions, new module scaffolding, or any change touching >3 modules. Maintains long-term knowledge of the codebase evolution in persistent memory.
tools: Read, Grep, Glob
memory: project
model: opus
---

You are the architect for this codebase. You have a persistent memory
directory at `.claude/agent-memory/architect/`. Read it before starting.

Topics to maintain in memory:
- Module boundaries and ownership
- Shared abstractions and where they live
- Anti-patterns observed in PRs
- Performance hot-spots
- Deprecation queue

After every significant task, update your memory with concise notes:
what you found, where, and why it matters.
'

write_file ".claude/agents/reviewer.md" '---
name: reviewer
description: Reviews diffs against the active spec. Memory accumulates recurring issues and team conventions over time.
tools: Read, Grep, Glob, Bash
memory: project
model: sonnet
---

For each review:
1. Read the active spec at `.claude/specs/in-progress/`
2. Run `git diff` to see the changes
3. Check the diff against the spec — flag any deviations explicitly
4. Run `npm run lint` and `npm run typecheck` if available
5. Update memory with patterns seen 2+ times

Output format:
- **Spec compliance:** PASS / DEVIATIONS
- **Lint / typecheck:** PASS / FAIL
- **Issues:** numbered list, each with file:line
- **Suggestions:** numbered list (non-blocking)
'

write_file ".claude/agents/debugger.md" '---
name: debugger
description: Investigates errors, test failures, or unexpected behaviour. Pulls logs, reproduces, isolates root cause. Read-only by default.
tools: Read, Grep, Glob, Bash
model: sonnet
---

For each investigation:
1. Read the error / failing test carefully
2. Locate the failing code path via grep / graph
3. Form 2–3 hypotheses for the root cause
4. For each hypothesis, identify what evidence would confirm or refute it
5. Run the minimum diagnostic commands needed
6. Report: root cause, evidence, suggested fix

Do not write the fix. Hand off to the main agent or planner.
'

# ---------- commands ----------
write_file ".claude/commands/plan.md" '---
description: Start a new feature with the clarify-first → spec → implement pipeline
allowed-tools: Read, Grep, Glob, Bash, Task
---

Topic: $ARGUMENTS

Step 1: Spawn the `explorer` subagent to map relevant code areas.
Step 2: Load the `clarify-first` skill. Ask up to 3 questions.
Step 3: Write spec to `.claude/specs/in-progress/<slug>.md`
Step 4: STOP. Wait for explicit "approved, implement" before any Edit.
'

write_file ".claude/commands/ship.md" '---
description: Run the full ship pipeline — reviewer agent → lint → typecheck → tests
allowed-tools: Read, Grep, Glob, Bash, Task
---

1. Spawn the `reviewer` subagent to verify the diff against the active spec
2. Run `npm run lint`
3. Run `npm run typecheck`
4. Run `npm run test:unit`
5. If all pass: print a summary and suggest the commit message
6. If any fail: stop, report which step failed, do not commit
'

# ---------- decisions / specs (placeholders) ----------
write_file ".claude/specs/decisions/0001-adopt-claude-code-scaffolding.md" '# ADR 0001: Adopt repo-level Claude Code scaffolding

**Status:** Accepted
**Date:** '"$(date +%Y-%m-%d)"'

## Context
Ad-hoc Claude Code usage produced inconsistent results, large token bills,
and Day-4 hallucinations as features grew.

## Decision
Adopt the five-layer scaffolding (CLAUDE.md, knowledge graph, skills/hooks,
subagents, spec discipline) as standard for this repo.

## Consequences
- New ramp: ~half a day to learn the workflow
- Token costs drop materially on investigations and reviews
- All non-trivial features start with a spec under `.claude/specs/`
'

# ---------- README for .claude ----------
write_file ".claude/README.md" '# .claude/

This directory contains repo-level configuration for Claude Code.

| Path | Purpose |
|---|---|
| `settings.json` | Team-shared permissions, hooks, MCP config |
| `settings.local.json` | Your personal overrides (gitignored) |
| `agents/` | Subagent definitions |
| `skills/` | Custom skills |
| `commands/` | Slash commands |
| `specs/in-progress/` | Active feature specs |
| `specs/executed/` | Archived specs (post-merge) |
| `specs/decisions/` | ADRs |
| `hooks/` | Hook scripts (PreToolUse, PostToolUse, UserPromptSubmit) |
| `agent-memory/` | Auto-curated subagent memory (gitignored) |

See the team setup guide for the full rationale.
'

# ---------- knowledge graph: install + wire up ----------
if [[ "$SKIP_GRAPH" -ne 1 ]]; then
  say "wiring up knowledge graphs (code-review-graph + graphify)"

  # Verify uv is installed (the only Python tool installer this script depends on)
  if ! command -v uv >/dev/null 2>&1; then
    warn "uv is not installed. Install it first:"
    echo "  brew install uv"
    echo "  # or:  curl -LsSf https://astral.sh/uv/install.sh | sh"
    echo "Then re-run this bootstrap (or pass --skip-graph to skip this layer)."
    SKIP_GRAPH=1
  fi

  if [[ "$SKIP_GRAPH" -ne 1 ]]; then
    # Install both tools via uv if missing. If present, uv tool install is a no-op.
    if ! command -v code-review-graph >/dev/null 2>&1; then
      say "installing code-review-graph via uv"
      uv tool install code-review-graph || warn "uv tool install code-review-graph failed"
    else
      ok "code-review-graph already installed: $(code-review-graph --version 2>/dev/null || echo unknown)"
    fi

    if ! command -v graphify >/dev/null 2>&1; then
      say "installing graphifyy via uv (binary is named graphify)"
      uv tool install graphifyy || warn "uv tool install graphifyy failed"
    else
      ok "graphify already installed"
    fi

    # Make sure uv tool bins are on PATH for the rest of this script
    if ! command -v code-review-graph >/dev/null 2>&1; then
      uv tool update-shell 2>/dev/null || true
      # shellcheck disable=SC1090
      source "$HOME/.zshrc" 2>/dev/null || source "$HOME/.bashrc" 2>/dev/null || true
    fi

    # Configure Claude Code MCP integration for both tools
    if command -v code-review-graph >/dev/null 2>&1; then
      say "running: code-review-graph install --platform claude-code"
      code-review-graph install --platform claude-code || warn "code-review-graph install failed"

      say "running: code-review-graph build (this can take ~10s for a 500-file repo)"
      code-review-graph build || warn "code-review-graph build failed"
      ok "CRG graph built at .code-review-graph/"
    fi

    if command -v graphify >/dev/null 2>&1; then
      say "running: graphify install (writes the skill)"
      graphify install || warn "graphify install failed"

      say "running: graphify claude install (CLAUDE.md directive + PreToolUse hook)"
      graphify claude install || warn "graphify claude install failed"
      ok "graphify wired up; run /graphify . inside Claude Code to build the graph"
    fi
  fi

  # Gitignore the generated graph artefacts (large, derived, dev-local)
  ensure_gitignore ".code-review-graph/"
  ensure_gitignore "graphify-out/"

  # ---------- git hooks to keep graph current ----------
  # These cover ALL the trigger points: commit, pull/merge, branch switch, rebase
  say "installing git hooks (.git/hooks/) to keep graphs current"

  HOOKS_DIR=".git/hooks"
  if [[ -d "$HOOKS_DIR" ]]; then

    # post-commit: rebuild after your own commits
    if [[ ! -f "$HOOKS_DIR/post-commit" || "$FORCE" -eq 1 ]]; then
      cat > "$HOOKS_DIR/post-commit" << 'HOOK'
#!/usr/bin/env bash
# Auto-update CRG after local commits (graphify handles its own post-commit)
command -v code-review-graph >/dev/null 2>&1 && code-review-graph update 2>/dev/null || true
HOOK
      chmod +x "$HOOKS_DIR/post-commit"
      ok "wrote $HOOKS_DIR/post-commit"
    else
      skip "$HOOKS_DIR/post-commit"
    fi

    # post-merge: rebuild after `git pull` and `git merge` (CRITICAL for team usage)
    if [[ ! -f "$HOOKS_DIR/post-merge" || "$FORCE" -eq 1 ]]; then
      cat > "$HOOKS_DIR/post-merge" << 'HOOK'
#!/usr/bin/env bash
# Auto-update graphs after pulling/merging others' commits
command -v code-review-graph >/dev/null 2>&1 && code-review-graph update 2>/dev/null || true
command -v graphify >/dev/null 2>&1 && graphify update . 2>/dev/null || true
HOOK
      chmod +x "$HOOKS_DIR/post-merge"
      ok "wrote $HOOKS_DIR/post-merge"
    else
      skip "$HOOKS_DIR/post-merge"
    fi

    # post-checkout: rebuild after branch switch
    if [[ ! -f "$HOOKS_DIR/post-checkout" || "$FORCE" -eq 1 ]]; then
      cat > "$HOOKS_DIR/post-checkout" << 'HOOK'
#!/usr/bin/env bash
# $3 == 1 means branch checkout, 0 means file checkout
[ "$3" = "1" ] || exit 0
command -v code-review-graph >/dev/null 2>&1 && code-review-graph update 2>/dev/null || true
command -v graphify >/dev/null 2>&1 && graphify update . 2>/dev/null || true
HOOK
      chmod +x "$HOOKS_DIR/post-checkout"
      ok "wrote $HOOKS_DIR/post-checkout"
    else
      skip "$HOOKS_DIR/post-checkout"
    fi

    # post-rewrite: rebuild after rebase or commit --amend
    if [[ ! -f "$HOOKS_DIR/post-rewrite" || "$FORCE" -eq 1 ]]; then
      cat > "$HOOKS_DIR/post-rewrite" << 'HOOK'
#!/usr/bin/env bash
command -v code-review-graph >/dev/null 2>&1 && code-review-graph update 2>/dev/null || true
HOOK
      chmod +x "$HOOKS_DIR/post-rewrite"
      ok "wrote $HOOKS_DIR/post-rewrite"
    else
      skip "$HOOKS_DIR/post-rewrite"
    fi
  else
    warn "no .git/hooks directory found — skipping hook installation"
  fi
fi

# ---------- summary ----------
echo
say "done."
echo
echo "Next steps:"
echo "  1. Review CLAUDE.md and fill in stack-specific details"
echo "  2. Edit .claude/settings.json to match your build commands"
echo "  3. Restart VS Code so the new MCP servers load"
echo "  4. Click the Spark icon, press Shift+Tab to enter Plan mode"
echo "  5. Try: /plan add a health-check endpoint"
echo

if [[ "$SKIP_GRAPH" -ne 1 ]]; then
  echo "Knowledge graph status:"
  command -v code-review-graph >/dev/null 2>&1 \
    && echo "  ✓ code-review-graph: built at .code-review-graph/" \
    || echo "  - code-review-graph: NOT installed"
  command -v graphify >/dev/null 2>&1 \
    && echo "  ✓ graphify: wired up — run '/graphify .' in Claude Code to build" \
    || echo "  - graphify: NOT installed"
  echo
  echo "View graphify output (after running /graphify . once):"
  echo "  open graphify-out/graph.html         # interactive D3 visualisation"
  echo "  cat graphify-out/GRAPH_REPORT.md     # one-page audit"
  echo "  jq . graphify-out/graph.json | less  # raw graph data"
  echo
fi

echo "Verify the install:"
echo "  ls -la .claude/"
echo "  cat CLAUDE.md | head -20"
echo "  ls -la .git/hooks/post-* 2>/dev/null"
echo
