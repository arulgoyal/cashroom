# ADR 0001: Adopt repo-level Claude Code scaffolding

**Status:** Accepted
**Date:** 2026-06-13

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
