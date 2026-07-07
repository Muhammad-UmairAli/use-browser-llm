#!/usr/bin/env bash
# Warn when `git commit` succeeds but TIME-LOG.md was not modified in the
# committed changeset. Doesn't block — surfaces a warning so Claude knows to
# invoke /log-time before the next commit if substantive work happened.
#
# Reads PostToolUse JSON payload from stdin. Exits 2 on a stale log —
# PostToolUse exit 2 is non-blocking (the tool already ran) but is the only
# exit code whose stderr is fed back to the model; on exit 0 the warning
# would be invisible.
#
# Only checks TIME-LOG.md when the commit actually targeted THIS project —
# an agent session can run commits against a different repo (multi-repo
# work, demos), and this project's TIME-LOG.md is irrelevant to those.
# Target resolution mirrors block-commit-to-main.sh: -C flag, then a `cd`
# prefix in the same command text, then the hook payload's `cwd` (accurate
# even when the `cd` happened in an earlier, separate Bash call), then
# CLAUDE_PROJECT_DIR. Only Python does TEXT analysis; the actual `cd` and
# path comparison happen in bash, since a path string like a Git-Bash
# `/c/...` mount point means one thing to bash and another to a directly
# spawned non-MSYS Python.
#
# See docs/methodology/02-time-tracking-and-estimates.md.

set -euo pipefail

input=$(cat)

# Fast path: this hook fires after every Bash call; bail cheaply unless the
# raw payload even mentions git + commit.
case "$input" in
  *git*commit*) ;;
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

target=""
if [ -n "$PYTHON" ]; then
  # Keep the commit-matching regex in sync with block-commit-to-main.sh.
  verdict=$(printf '%s' "$input" | "$PYTHON" -c '
import json, re, sys

raw = sys.stdin.read()
try:
    payload = json.loads(raw)
    cmd = payload.get("tool_input", {}).get("command", "")
    payload_cwd = payload.get("cwd") or ""
except Exception:
    cmd = raw
    payload_cwd = ""

word = r"(?:[^\s\"\x27]|\"[^\"]*\"|\x27[^\x27]*\x27)+"
commit_pat = re.compile(
    r"(?<![\w\"\x27/-])git((?:\s+(?:-[cC]\s+%s|--?[\w-]+(?:=%s)?)))*\s+commit(?!\S)" % (word, word)
)
m = commit_pat.search(cmd)
if not m:
    print("ok")
    sys.exit(0)

invocation = m.group(0)


def strip_quotes(s):
    s = s.strip()
    if len(s) >= 2 and s[0] == s[-1] and s[0] in "\"\x27":
        return s[1:-1]
    return s


target = None
cflag = re.search(r"-C\s+(%s)" % word, invocation)
if cflag:
    target = strip_quotes(cflag.group(1))
if target is None:
    prefix = cmd[: m.start()]
    cds = list(re.finditer(r"(?:^|&&|;|\n)\s*cd\s+(%s)" % word, prefix))
    if cds:
        target = strip_quotes(cds[-1].group(1))
if target is None and payload_cwd:
    target = payload_cwd
if target is None:
    target = ""

print("commit\t" + target)
' 2>/dev/null || echo "")
  case "$verdict" in
    ok) exit 0 ;;
    commit*) IFS=$'\t' read -r _ target <<<"$verdict" ;;
    *) target="" ;;  # Python crashed — fall through, resolved against CLAUDE_PROJECT_DIR below
  esac
fi
# No Python: fall back to the coarse raw-payload match above (worst case is
# a spurious warning against CLAUDE_PROJECT_DIR, never a block).

[ -n "$target" ] || target="${CLAUDE_PROJECT_DIR:-.}"

# Only proceed if the commit's target really is this project. Compare git
# repo TOPLEVELS, not raw resolved paths — `target` is very often a
# subdirectory of the project root (the Bash tool's cwd sitting in
# templates/, a `-C subdir`, etc.), and raw path equality would wrongly
# treat that as "a different repo" and skip a check that should run. `git
# rev-parse --show-toplevel` walks up to the repo root from anywhere
# inside it, so a subdirectory target still compares equal.
project_dir="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
target_top=$(git -C "$target" rev-parse --show-toplevel 2>/dev/null || echo "")
project_top=$(git -C "$project_dir" rev-parse --show-toplevel 2>/dev/null || echo "")
[ -n "$target_top" ] && [ "$target_top" = "$project_top" ] || exit 0

cd "$project_dir" 2>/dev/null || exit 0

# Only warn about a commit that plausibly just happened — if HEAD is old, the
# git commit most likely failed (this hook fires on failed tool calls too).
# The window is generous because the commit may share its tool call with a
# slow follow-up (e.g. `git commit && pnpm test`).
head_age=$(($(date +%s) - $(git log -1 --format=%ct 2>/dev/null || echo 0)))
[ "$head_age" -lt 600 ] || exit 0

# Find the most recent commit's changeset. If TIME-LOG.md is in it, all good.
if git diff-tree --no-commit-id --name-only -r HEAD 2>/dev/null | grep -qx 'TIME-LOG.md'; then
  exit 0
fi

# Check if the commit message contains "no-log-needed" or "[skip log]" — escape hatch.
last_msg=$(git log -1 --pretty=%B 2>/dev/null || echo "")
case "$last_msg" in
  *"[skip log]"*|*"no-log-needed"*) exit 0 ;;
esac

cat >&2 <<'EOF'
⚠ WARNING: this commit did not modify TIME-LOG.md.

If the commit reflects substantive work (writing docs, building features,
fixing bugs, decomposing tasks, etc.), invoke /log-time before your next
commit so the dashboard reflects the hours.

If the commit is genuinely log-free (typo fix, comment update, formatting),
add "[skip log]" to the commit message to silence this warning.

See docs/methodology/02-time-tracking-and-estimates.md for the discipline.
EOF
# PostToolUse: exit 2 is non-blocking but routes the warning to the model.
exit 2
