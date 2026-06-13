#!/usr/bin/env bash
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
