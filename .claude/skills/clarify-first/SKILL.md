---
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
