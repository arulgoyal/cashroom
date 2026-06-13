---
description: Run the full ship pipeline — reviewer agent → lint → typecheck → tests
allowed-tools: Read, Grep, Glob, Bash, Task
---

1. Spawn the `reviewer` subagent to verify the diff against the active spec
2. Run `npm run lint`
3. Run `npm run typecheck`
4. Run `npm run test:unit`
5. If all pass: print a summary and suggest the commit message
6. If any fail: stop, report which step failed, do not commit
