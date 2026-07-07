#!/usr/bin/env bash
# .claude/hooks/log-agent-on-spawn.sh
# PreToolUse hook — fires before every Agent tool call.
# Extracts agent metadata from the tool_input JSON and calls log-agent.py.
# Always exits 0 so the Agent tool call is never blocked.

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

# One interpreter launch extracts everything: agent metadata from the payload
# and the current phase/step from .claude/task-timer.json. Timer keys are
# "<phase>-<step>" where step ids may themselves contain dashes (P1-06), so
# split on the FIRST dash only.
SUBAGENT_TYPE="general-purpose"
DESCRIPTION="no description"
RUN_IN_BG="n"
PHASE="unknown"
STEP="unknown"
eval "$(printf '%s' "$PAYLOAD" | "$PYTHON" -c '
import json, shlex, sys
try:
    ti = json.load(sys.stdin).get("tool_input", {}) or {}
except Exception:
    ti = {}
desc = (ti.get("description") or "no description")
desc = desc.replace("\n", " ").replace("|", "/")[:80]
phase, step = "unknown", "unknown"
try:
    keys = list(json.load(open(".claude/task-timer.json", encoding="utf-8")).keys())
    if keys:
        phase, _, step = keys[-1].partition("-")
except Exception:
    pass
print("SUBAGENT_TYPE=%s" % shlex.quote(ti.get("subagent_type") or "general-purpose"))
print("DESCRIPTION=%s" % shlex.quote(desc))
print("RUN_IN_BG=%s" % ("y" if ti.get("run_in_background") else "n"))
print("PHASE=%s" % shlex.quote(phase or "unknown"))
print("STEP=%s" % shlex.quote(step or "unknown"))
' 2>/dev/null)" || true

# Classify framework.
# Claude builtins are the fixed set of native Claude Code agent types.
# VoltAgent: namespaced types (voltagent-*) or plugin:name form, plus cache lookup.
# Anything else is custom.
case "$SUBAGENT_TYPE" in
  Explore|general-purpose|Plan|claude-code-guide|statusline-setup)
    FRAMEWORK="Claude"
    ;;
  voltagent-*|*:*)
    FRAMEWORK="VoltAgent"
    ;;
  *)
    VOLTAGENT_CACHE="$HOME/.claude/plugins/cache/voltagent-subagents"
    if find "$VOLTAGENT_CACHE" -name "${SUBAGENT_TYPE}.md" 2>/dev/null | grep -q .; then
      FRAMEWORK="VoltAgent"
    elif [ -f ".claude/project-shortname" ]; then
      FRAMEWORK="$(tr -d '[:space:]' < .claude/project-shortname)"
    else
      FRAMEWORK="custom"
    fi
    ;;
esac

"$PYTHON" tools/log-agent.py \
  "$PHASE" "$STEP" "$FRAMEWORK" "$SUBAGENT_TYPE" "$RUN_IN_BG" \
  "$DESCRIPTION" 2>/dev/null || true

exit 0
