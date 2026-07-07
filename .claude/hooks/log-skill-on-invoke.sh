#!/usr/bin/env bash
# .claude/hooks/log-skill-on-invoke.sh
# PreToolUse hook — fires before every Skill tool call.
# Logs VoltAgent specialist invocations to AGENT-LOG.md.
# Non-VoltAgent skills (built-in slash commands) are ignored.
# Always exits 0 — never blocks the Skill call.

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

PAYLOAD="$(cat)"

# One interpreter launch extracts everything: skill metadata from the payload
# and the current phase/step from .claude/task-timer.json. Timer keys are
# "<phase>-<step>" where step ids may themselves contain dashes (P1-06), so
# split on the FIRST dash only.
SKILL_NAME=""
DESCRIPTION="no args"
PHASE="unknown"
STEP="unknown"
eval "$(printf '%s' "$PAYLOAD" | "$PYTHON" -c '
import json, shlex, sys
try:
    ti = json.load(sys.stdin).get("tool_input", {}) or {}
except Exception:
    ti = {}
args = str(ti.get("args") or "no args")
args = args.replace("\n", " ").replace("|", "/")[:80]
phase, step = "unknown", "unknown"
try:
    keys = list(json.load(open(".claude/task-timer.json", encoding="utf-8")).keys())
    if keys:
        phase, _, step = keys[-1].partition("-")
except Exception:
    pass
print("SKILL_NAME=%s" % shlex.quote(ti.get("skill") or ""))
print("DESCRIPTION=%s" % shlex.quote(args))
print("PHASE=%s" % shlex.quote(phase or "unknown"))
print("STEP=%s" % shlex.quote(step or "unknown"))
' 2>/dev/null)" || true

[ -n "$SKILL_NAME" ] || exit 0

# Only log if it matches a VoltAgent agent (file exists in plugin cache).
VOLTAGENT_CACHE="$HOME/.claude/plugins/cache/voltagent-subagents"
if ! find "$VOLTAGENT_CACHE" -name "${SKILL_NAME}.md" 2>/dev/null | grep -q .; then
  exit 0
fi

"$PYTHON" tools/log-agent.py \
  "$PHASE" "$STEP" "VoltAgent" "$SKILL_NAME" "n" \
  "$DESCRIPTION" 2>/dev/null || true

exit 0
