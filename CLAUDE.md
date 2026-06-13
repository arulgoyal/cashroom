# Project memory

## Stack
- NestJS, TypeScript, TypeORM, PostgreSQL, Redis

## Commands
- `npm run dev`        — local API
- `npm run test:unit`  — fast tests (run after every edit)
- `npm run test:e2e`   — slow tests (run on completion only)
- `npm run lint:fix`   — must pass before commit
- `npm run typecheck`  — must pass before commit

## Investigation rule (NON-NEGOTIABLE)
Before claiming anything about the codebase: read the file.
Before proposing a change: read the consumers.
Use the explorer subagent for scans larger than ~5 files.
Never invent function signatures, env vars, or DB columns.

## Ask-first rule
For any change touching >1 file or any new public API, invoke the
clarify-first skill BEFORE planning. Cap at 3 questions per round.

## Architectural rules
- TypeORM repositories, not raw QueryBuilder, unless justified in the spec
- New multi-step flows use a state-machine library (XState), not ad-hoc booleans
- Money is `bigint` in the smallest unit (paise/cents), never `number`
- All external HTTP calls go through `*.client.ts` with retry + circuit breaker
- Mutations on shared rows: use the Redis distributed lock helper

## Context navigation (3-layer rule)
1. FIRST, query the code-review-graph MCP tools (e.g. `get_minimal_context_tool`,
   `get_impact_radius_tool`) before any Grep / Read on source files.
   For deeper structural / multi-modal context, consult `graphify-out/GRAPH_REPORT.md`.
2. SECOND, query `.claude/agent-memory/` and `.claude/specs/decisions/`
3. THIRD, read raw files — only when steps 1 and 2 don't answer

## Compaction instructions
When compacting, preserve verbatim:
- List of files modified this session
- The active spec path under `.claude/specs/in-progress/`
- Any open questions the user has not yet answered

## Directory map (high-level only — use the graph for details)
- src/<module-1> — <one-line purpose>
- src/<module-2> — <one-line purpose>
- src/common    — shared utilities

## Specs
Active features: see `.claude/specs/in-progress/`
Past decisions: see `.claude/specs/decisions/`

<!-- code-review-graph MCP tools -->
## MCP Tools: code-review-graph

**IMPORTANT: This project has a knowledge graph. ALWAYS use the
code-review-graph MCP tools BEFORE using Grep/Glob/Read to explore
the codebase.** The graph is faster, cheaper (fewer tokens), and gives
you structural context (callers, dependents, test coverage) that file
scanning cannot.

### When to use graph tools FIRST

- **Exploring code**: `semantic_search_nodes` or `query_graph` instead of Grep
- **Understanding impact**: `get_impact_radius` instead of manually tracing imports
- **Code review**: `detect_changes` + `get_review_context` instead of reading entire files
- **Finding relationships**: `query_graph` with callers_of/callees_of/imports_of/tests_for
- **Architecture questions**: `get_architecture_overview` + `list_communities`

Fall back to Grep/Glob/Read **only** when the graph doesn't cover what you need.

### Key Tools

| Tool | Use when |
| ------ | ---------- |
| `detect_changes` | Reviewing code changes — gives risk-scored analysis |
| `get_review_context` | Need source snippets for review — token-efficient |
| `get_impact_radius` | Understanding blast radius of a change |
| `get_affected_flows` | Finding which execution paths are impacted |
| `query_graph` | Tracing callers, callees, imports, tests, dependencies |
| `semantic_search_nodes` | Finding functions/classes by name or keyword |
| `get_architecture_overview` | Understanding high-level codebase structure |
| `refactor_tool` | Planning renames, finding dead code |

### Workflow

1. The graph auto-updates on file changes (via hooks).
2. Use `detect_changes` for code review.
3. Use `get_affected_flows` to understand impact.
4. Use `query_graph` pattern="tests_for" to check coverage.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
