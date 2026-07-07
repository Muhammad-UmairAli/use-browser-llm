#!/usr/bin/env bash
# Refuse `gh pr create` if the PR body lacks `Closes #N` (or `Closes #none`
# for Issue-less chores). Enforces the consistency invariant: every PR
# auto-closes its linked Issue.
# Reads PreToolUse JSON payload from stdin; exits 2 to block.

set -euo pipefail

input=$(cat)

# Fast path: this hook fires on every Bash call; bail cheaply unless the raw
# payload even mentions a PR create.
case "$input" in
  *gh*pr*create*) ;;
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

cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || true

if [ -n "$PYTHON" ]; then
  # Fail CLOSED on interpreter error (`|| echo missing`) — same policy as
  # block-commit-to-main.sh; a gate that fails open is not a gate.
  verdict=$(printf '%s' "$input" | "$PYTHON" -c '
import json, re, sys
raw = sys.stdin.read()
try:
    cmd = json.loads(raw).get("tool_input", {}).get("command", "")
except Exception:
    cmd = raw
closes = re.compile(r"[Cc]loses #([0-9]+|[Nn]one)\b")
if not re.search(r"(?<![\w\"\x27/-])gh\s+pr\s+create\b", cmd):
    print("ok"); sys.exit(0)
if closes.search(cmd):
    print("ok"); sys.exit(0)
# Tokenize so flags quoted inside --title/--body text are not mistaken for
# real flags (e.g. --title "handle -F flag").
import shlex
try:
    toks = shlex.split(cmd)
except ValueError:
    toks = cmd.split()
if any(t in ("--fill", "--fill-first", "--fill-verbose") for t in toks):
    print("ok"); sys.exit(0)  # body comes from commit messages — cannot inspect
# --body-file/-F: the body lives in a file — inspect it when readable.
path = None
for i, t in enumerate(toks):
    if t in ("--body-file", "-F") and i + 1 < len(toks):
        path = toks[i + 1]; break
    if t.startswith("--body-file="):
        path = t.split("=", 1)[1]; break
if path:
    try:
        body = open(path, encoding="utf-8").read()
        print("ok" if closes.search(body) else "missing")
    except OSError:
        print("ok")  # cannot inspect (path relative to another cwd) — do not strand
    sys.exit(0)
print("missing")
' 2>/dev/null || echo "missing")
else
  # No Python: only enforce when the literal phrase is present, then grep the
  # raw payload for the Closes reference.
  case "$input" in
    *"gh pr create"*)
      if printf '%s' "$input" | grep -qE '[Cc]loses #([0-9]+|[Nn]one)'; then
        verdict="ok"
      else
        verdict="missing"
      fi
      ;;
    *) verdict="ok" ;;
  esac
fi

if [ "$verdict" = "missing" ]; then
  echo "BLOCKED: gh pr create body must include 'Closes #N' to auto-close the linked Issue." >&2
  echo "         If this PR has no Issue (small chore), write 'Closes #none' instead." >&2
  echo "         See docs/methodology/03-github-workflow.md." >&2
  exit 2
fi

exit 0
