# .claude/

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
