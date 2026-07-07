#!/usr/bin/env bash
# Flag bare or descriptor-less §N references (without the <file-stem> prefix
# or the (<descriptor>) suffix) in commit messages, Issue bodies, and PR
# bodies. The kit's convention requires
# <file-stem> §<number> (<descriptor>) every time. See
# docs/methodology/01-orchestration-spine.md.
#
# This is a sample hook — NOT wired into .claude/settings.json by default.
# PreToolUse has no non-blocking warning channel (on exit 0 the message below
# is invisible to the model), so wiring it only makes sense with STRICT=1:
# exit 2 blocks the call and the model rewrites the reference and retries.
# To enable: set STRICT=1 below, then add this file to the PreToolUse Bash
# hook list in .claude/settings.json.

set -euo pipefail

STRICT=0 # set to 1 to block instead of soft-warn

input=$(cat)

# Fast path: bail unless the payload contains a § — either as a literal UTF-8
# character or JSON-escaped (§ / §).
case "$input" in
  *§*|*u00a7*|*u00A7*) ;;
  *) exit 0 ;;
esac

# Resolve Python interpreter: python3 (Linux/Mac) → py (Windows launcher) → python.
PYTHON=""
for cand in python3 py python; do
  if command -v "$cand" >/dev/null 2>&1 && "$cand" -c "" 2>/dev/null; then
    PYTHON="$cand"
    break
  fi
done
# Style check only — without Python, skip rather than guess.
[ -n "$PYTHON" ] || exit 0

verdict=$(printf '%s' "$input" | "$PYTHON" -c '
import json, re, sys
raw = sys.stdin.read()
try:
    cmd = json.loads(raw).get("tool_input", {}).get("command", "")
except Exception:
    cmd = raw
if not re.search(r"(?<![\w\"\x27/-])(git\s+commit|gh\s+(pr|issue)\s+(create|edit))\b", cmd):
    print("ok"); sys.exit(0)
# Full form: <file-stem> §<number> (<descriptor>). Flag any §N that lacks a
# preceding stem-shaped token (contains a dot/dash/slash, or is ALL-CAPS like
# SPLIT-PLAN — plain words like "see" do not count) OR a following (descriptor).
for m in re.finditer(r"§\s*[0-9]+", cmd):
    before, after = cmd[:m.start()], cmd[m.end():]
    has_stem = re.search(r"([A-Za-z0-9][\w]*[.\-/][\w.\-/]*|[A-Z][A-Z0-9]+(-[A-Z0-9]+)*)\s+$", before)
    has_desc = re.match(r"\s*\(", after)
    if not (has_stem and has_desc):
        print("bare"); sys.exit(0)
print("ok")
' 2>/dev/null || echo "ok")

if [ "$verdict" = "bare" ]; then
  echo "Detected bare or descriptor-less '§N' reference. The kit's convention is" >&2
  echo "<file-stem> §<number> (<descriptor>) every time," >&2
  echo "e.g. 'SPLIT-PLAN §5 (progress log)' — never bare '§5'." >&2
  echo "See docs/methodology/01-orchestration-spine.md and" >&2
  echo "docs/conventions/section-references.md for descriptors." >&2
  [ "$STRICT" = "1" ] && exit 2
fi

exit 0
