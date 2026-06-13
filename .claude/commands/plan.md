---
description: Start a new feature with the clarify-first → spec → implement pipeline
allowed-tools: Read, Grep, Glob, Bash, Task
---

Topic: $ARGUMENTS

Step 1: Spawn the `explorer` subagent to map relevant code areas.
Step 2: Load the `clarify-first` skill. Ask up to 3 questions.
Step 3: Write spec to `.claude/specs/in-progress/<slug>.md`
Step 4: STOP. Wait for explicit "approved, implement" before any Edit.
