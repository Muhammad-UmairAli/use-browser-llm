#!/usr/bin/env bash
# Block direct commits to protected branches (main / master / develop).
# Defense-in-depth on top of the platform-level branch-protection rulesets.
# Reads PreToolUse JSON payload from stdin; exits 2 to block.
#
# Checks the branch of the repo the commit actually TARGETS, not just the
# session's own project root — an agent session can run Bash commands
# against a different repo than the one it's rooted in (multi-repo work,
# demos, scratch testing). Resolution order, most to least specific:
#   1. `-C <path>` on the matched git invocation itself.
#   2. A `cd <path>` prefix earlier in the SAME command string.
#   3. The hook payload's own `cwd` field — Claude Code's Bash tool keeps a
#      persistent working directory across separate tool calls, and `cwd`
#      accurately reflects it at hook-fire time. This is what makes a bare
#      `git commit` (with no -C/cd in its own text, because the `cd`
#      happened in an earlier, separate Bash call) resolve correctly.
#   4. CLAUDE_PROJECT_DIR — final fallback if none of the above apply.
#
# Path resolution note: only Python does TEXT analysis (extracting which
# path string applies); the actual `cd`/branch check happens in bash, not
# via a Python subprocess. A path string like a Git-Bash `/c/...` mount
# point means one thing to bash and another to a native git.exe spawned
# directly from a non-MSYS Python — bash is what will actually run the
# real command, so bash must also be what resolves the path here.
#
# See docs/methodology/03-github-workflow.md and 06-git-flow-and-environments.md.

set -euo pipefail

input=$(cat)

# Fast path: skip the Python launch entirely unless the raw payload even
# mentions git + commit. This hook fires on every Bash call, so the common
# case (ls, grep, test runs) must cost one shell `case`, not an interpreter.
case "$input" in
  *git*commit*) ;;
  *) exit 0 ;;
esac

# Resolve Python interpreter: python3 (Linux/Mac) → py (Windows launcher) → python.
# Test each candidate actually executes — on Windows, python3/python may be
# App-Execution-Alias stubs that exit non-zero.
PYTHON=""
for cand in python3 py python; do
  if command -v "$cand" >/dev/null 2>&1 && "$cand" -c "" 2>/dev/null; then
    PYTHON="$cand"
    break
  fi
done

target=""
if [ -n "$PYTHON" ]; then
  # Precise match: a real `git commit` invocation (allowing -C <path>, -c k=v —
  # with quoted values — and other flags between `git` and `commit`), not the
  # words inside a quoted string like `git log --grep="git commit"`. Prints
  # "ok" (not a real commit) or "commit\t<target-dir>" — TEXT ANALYSIS ONLY,
  # no filesystem access, so path format never matters here.
  # Keep the commit-matching regex in sync with warn-on-stale-time-log.sh.
  verdict=$(printf '%s' "$input" | "$PYTHON" -c '
import json, os, re, sys

raw = sys.stdin.read()
try:
    payload = json.loads(raw)
    cmd = payload.get("tool_input", {}).get("command", "")
    payload_cwd = payload.get("cwd") or ""
except Exception:
    cmd = raw
    payload_cwd = ""

# A "word" is any run of unquoted chars and/or quoted segments, so values
# like key="A B" are consumed whole.
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

# 1) -C <path> on the matched git invocation — most authoritative, it
#    explicitly overrides the process cwd for that one command.
cflag = re.search(r"-C\s+(%s)" % word, invocation)
if cflag:
    target = strip_quotes(cflag.group(1))

# 2) A `cd <path>` earlier in the SAME command string, chained by &&, ;, or
#    a newline, before the matched commit invocation — changes the
#    effective cwd from whatever the hook payload reports.
if target is None:
    prefix = cmd[: m.start()]
    cds = list(re.finditer(r"(?:^|&&|;|\n)\s*cd\s+(%s)" % word, prefix))
    if cds:
        target = strip_quotes(cds[-1].group(1))

# 3) The payload cwd — accurate even when the `cd` happened in a prior,
#    separate Bash tool call this command'\''s own text cannot reveal.
if target is None and payload_cwd:
    target = payload_cwd

# 4) Last resort: the session project root, resolved by bash below.
if target is None:
    target = ""

# Tab-separated, single line — target may be empty (bash resolves the
# CLAUDE_PROJECT_DIR fallback itself).
print("commit\t" + target)
' 2>/dev/null || echo "")
  case "$verdict" in
    ok) exit 0 ;;
    commit*)
      IFS=$'\t' read -r _ target <<<"$verdict"
      ;;
    *)
      # Python crashed or produced nothing — fail closed via the coarse
      # text match against the session's own project root (same policy as
      # the no-Python branch below).
      case "$input" in
        *"git commit"*) target="" ;;
        *) exit 0 ;;
      esac
      ;;
  esac
else
  # No Python: cannot resolve -C / cd / payload cwd — require the literal
  # phrase before failing closed, checking only the session's own project
  # (the same limitation this hook always had without Python).
  case "$input" in
    *"git commit"*) target="" ;;
    *) exit 0 ;;
  esac
fi

[ -n "$target" ] || target="${CLAUDE_PROJECT_DIR:-.}"

branch=$(git -C "$target" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
case "$branch" in
  main|master|develop)
    echo "BLOCKED: direct commits to '$branch' are forbidden by claude-orchestration-kit." >&2
    echo "         Target repo: $target" >&2
    echo "         Branch off and open a PR. Naming under Git Flow:" >&2
    echo "           - feature/<short>     (off develop, merges to develop)" >&2
    echo "           - release/<X.Y.Z>     (off develop, merges to main + back to develop)" >&2
    echo "           - hotfix/<X.Y.Z>      (off main,    merges to main + back to develop)" >&2
    echo "         Or under the base flow: phase-Nx-<short> / chore-<short> off main." >&2
    echo "         See docs/methodology/03-github-workflow.md and 06-git-flow-and-environments.md." >&2
    exit 2
    ;;
esac

exit 0
