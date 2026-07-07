# 12 — Autonomy and approvals

The kit ships an opinionated permissions config so adopters get sensible defaults from day one: safe operations auto-run, hard-to-reverse operations always prompt, and a small set of irreversible operations are flatly denied. The same config supports three operating modes you flip between as needed — including a "work nonstop" mode that still respects your hard gates.

## The three modes

| Mode                 | `defaultMode`       | Behavior                                                                                       | When to use                                                                 |
| -------------------- | ------------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| **Gated**            | `default`           | Prompts on anything not on the `permissions.allow` list.                                       | Normal work, anything unfamiliar, code review surface.                      |
| **Autonomous-edit**  | `acceptEdits`       | Auto-accepts file edits; still prompts on non-allowlisted Bash. `permissions.ask` still gates. | Mid-phase grinding through tasks; you trust edits but want eyes on deploys. |
| **Fully autonomous** | `bypassPermissions` | Auto-runs everything **except** `permissions.ask` and `permissions.deny`.                      | Overnight runs, parallel CCPM agents, "ping me only on the real gates."     |

**Key invariant:** even in fully autonomous mode, every operation listed under `permissions.ask` still prompts. "Work nonstop" never means "do irreversible things without asking." The `ask` list is your hard gate.

## What ships in `templates/.claude/settings.json`

A starter allow / ask / deny matrix:

- **`permissions.allow`** — read-only Bash (`git status`, `git diff`, `git log`), safe `gh` operations (create/view/list Issues and PRs), test runners (`pnpm test`, `pnpm run lint`; the kit standardizes on pnpm — see `methodology/04-code-quality-and-gates.md` (code quality and gates)), and the file-editing tools (`Read`, `Glob`, `Grep`, `Edit`, `Write`).
- **`permissions.ask`** — operations the methodology already calls "always confirm first": merging PRs, all forms of `git push`, `git reset --hard`, `git rebase`, `rm`, IaC deployment commands, infra-resource updates, schema migrations, `kubectl delete`.
- **`permissions.deny`** — irreversible-and-dangerous: `rm -rf /`, force-push to `main`, force-with-lease to `main`. The platform-level branch-protection ruleset is the primary defense; `deny` is belt-and-braces.

Adopters tune the lists for their stack. The defaults are conservative — pick what to add to `allow`, never remove from `deny`.

## Defense-in-depth via PreToolUse hooks

The kit ships gate hooks under `templates/.claude/hooks/`:

- `block-commit-to-main.sh` — refuses direct commits to `main` regardless of mode (independent of platform ruleset; defense in depth). Checks the branch of the repo the commit actually targets — resolved from a `-C`/`cd` in the command text, then the hook payload's `cwd`, then `CLAUDE_PROJECT_DIR` — not just the session's own project root, so it stays correct when an agent runs commands against a different repo (multi-repo work, scratch demos). `warn-on-stale-time-log.sh` uses the same resolution to skip its check entirely when a commit doesn't target this project.
- `require-closes-on-pr.sh` — refuses `gh pr create` if the PR body lacks `Closes #N` (or `Closes #none` for Issue-less chores).
- `verify-section-reference-style.sh` — sample (unwired by default): flags bare `§N` references in commit messages and PR bodies when wired with its `STRICT=1` toggle.

The gate hooks fail closed by policy: a matched violation exits 2 (Claude Code blocks the call), and an internal error while checking a candidate command is treated as a match rather than waved through. Only an explicit exit 2 blocks — which is why the sample hook is ineffective unless its strict toggle is on.

## The "work nonstop" entry point

`templates/.claude/commands/work-the-phase.md` ships as a slash command that, when invoked:

1. Reads the current in-flight phase from the most recent unclosed row in `SPLIT-PLAN §5 (progress log)`.
2. Verifies the phase has decomposed CCPM tasks (or runs decomposition first).
3. Optionally flips to `acceptEdits` (default) or `bypassPermissions` (with `--full-auto` flag).
4. Iterates per task: open Issue → branch → execute (specialists invoked as needed) → PR with `Closes #N` → merge → next task.
5. With `--parallel`, hands off to CCPM's worktree spawner so multiple agents work concurrently — each subject to the same `permissions.ask` gates.

## Stop conditions

The autonomous loop halts and surfaces on any of these:

1. Any `permissions.ask` tool fires (forces a prompt by design).
2. A task's PR CI fails.
3. A task hits unresolved ambiguity (engineering-hygiene "surface conflicts" rule from `methodology/04-code-quality-and-gates.md`).
4. A specialist subagent (e.g., security review) returns a blocking concern.
5. The post-phase render check on `DASHBOARD.html` fails (cells `—`).
6. A cross-doc consistency walk via `SPLIT-PLAN §4 (cross-cutting concepts)` finds drift the AI can't auto-resolve.

When the loop halts, it leaves the work-in-progress visible (open Issue, draft PR, dirty branch — whatever state was reached) and reports the stop condition. The developer decides; the loop resumes once the gate clears.

## Composition with multi-agent execution

When `/work-the-phase --parallel` runs through CCPM:

- Each spawned worktree-agent inherits the project's `.claude/settings.json`. Same `allow`, same `ask`, same `deny`.
- A prompt fired by any agent (e.g., agent A hits `gh pr merge`) appears in the developer's main session, queued/serialized by Claude Code.
- Hooks fire per-agent, so consistency invariants (`Closes #N` on PRs, no commits to `main`) are enforced even when the developer isn't watching the specific worktree.

The result: parallel autonomous work, gated only at the operations you decided are worth gating.
