#!/usr/bin/env bash
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
