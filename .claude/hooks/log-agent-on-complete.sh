#!/usr/bin/env bash
# .claude/hooks/log-agent-on-complete.sh
# PostToolUse hook — fires after every Agent tool call completes.
# Closes the matching in-flight entry (by agent name, so parallel agents
# finishing out of order keep their own durations) and writes duration_ms
# to agents-log. Always exits 0 — never blocks.

set -euo pipefail

# Resolve Python interpreter: python3 (Linux/Mac) → py (Windows launcher) → python.
PYTHON=""
for cand in python3 py python; do
  if command -v "$cand" >/dev/null 2>&1 && "$cand" -c "" 2>/dev/null; then
    PYTHON="$cand"
    break
  fi
done
[ -n "$PYTHON" ] || exit 0

# Run from the project root so .claude/ and tools/ resolve regardless of the
# session's current working directory.
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0

# Extract the agent type so completion is matched to the right in-flight
# entry (log-agent.py --agent closes the oldest entry with this name).
PAYLOAD="$(cat)"
# Default mirrors the spawn hook: an Agent call without subagent_type was
# logged as "general-purpose", so match completion against the same name.
SUBAGENT_TYPE="$(printf '%s' "$PAYLOAD" | "$PYTHON" -c '
import json, sys
try:
    print(json.load(sys.stdin).get("tool_input", {}).get("subagent_type") or "general-purpose")
except Exception:
    print("")
' 2>/dev/null || echo "")"

if [ -n "$SUBAGENT_TYPE" ]; then
  "$PYTHON" tools/log-agent.py --complete --agent "$SUBAGENT_TYPE" 2>/dev/null || true
else
  "$PYTHON" tools/log-agent.py --complete 2>/dev/null || true
fi

exit 0
