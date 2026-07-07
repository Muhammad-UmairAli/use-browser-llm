# 03 — GitHub workflow

Every change to a protected branch (`main`, and `develop` if Git Flow is in use) goes through a feature branch and a pull request. Even single-file edits, even "obviously safe" one-line typo fixes. This is non-negotiable, and `methodology/04-code-quality-and-gates.md` shows how to enforce it at the platform level so it can't be accidentally bypassed.

This doc describes the **base flow** — feature branch → PR → merge — that applies to every project. Projects with deployable environments (UAT, PROD) layer Git Flow on top of this base; see `methodology/06-git-flow-and-environments.md` for the branch types (`develop`, `feature/*`, `release/*`, `hotfix/*`), environment mapping, and tagging discipline. The mechanics of branching, opening, and merging a PR below are the same in either model — only the _target branch_ and the _naming convention_ change.

## The branch + PR pattern

1. **Branch off the appropriate base** — for the base flow, `git checkout main && git pull && git checkout -b <branch-name>`. Under Git Flow, base off `develop` for features, `develop` for releases (`release/X.Y.Z`), or `main` for hotfixes (`hotfix/X.Y.Z`). Naming: `feature/<short>` / `release/<X.Y.Z>` / `hotfix/<X.Y.Z>` under Git Flow; `phase-Nx-<short>` or `chore-<short>` under the base flow.
2. **Make edits, commit on the branch.** Commits never land on `main` directly.
3. **Push and open a PR** — `git push -u origin <branch>`, then `gh pr create --base main --head <branch> --title ... --body ...`. PR body should follow the project's conventions: Summary, Test plan, files-NOT-touched if relevant.
4. **Merge with a merge commit** — `gh pr merge <num> --merge`. Don't squash (preserves per-branch commit identity); don't rebase (preserves the PR-history link).
5. **Delete the branch (local + remote)** — `git push origin --delete <branch>` + `git branch -D <branch>`.
6. **Fast-forward local `main`** — `git checkout main && git pull`.

If you find yourself about to run `git commit` while on `main`, stop and create a branch first. If `main` somehow has uncommitted edits, move them to a branch with `git stash` + `git checkout -b ...` + `git stash pop`.

## Always read the PR number from `gh pr create` output

GitHub shares numbering between Issues and PRs. The next PR number is **not** "previous-PR-number + 1" — Issues open in between. Always extract the actual PR number from `gh pr create`'s stdout:

```bash
PR_URL=$(gh pr create --base main --head <branch> --title "..." --body "...")
PR_NUM=$(echo "$PR_URL" | grep -oP '/pull/\K\d+')
gh pr merge "$PR_NUM" --merge
```

Or look it up after creation: `gh pr list --head <branch> --json number --jq '.[0].number'`.

## When to create a GitHub Issue

Create an Issue at the **start** of a phase when **all** of these hold:

- The work is engineering or substantive doc work that will produce one or more commits.
- The work has a clear "done" state (a mergeable PR).
- The work is non-trivial — multi-step or expected to span more than a one-line edit.
- The work is not already fully captured by an existing Issue.

**Should** become Issues: phase implementation steps; closing a `SPLIT-PLAN §6 (backlog)` item; substantial cross-cutting doc work.

**Should NOT** become Issues: recording a single piece of data; marking a checkbox; one-commit hygiene cleanup; items that belong in `TODO.md` (e.g., responsibilities of someone who isn't a GitHub user); `SPLIT-PLAN §6 (backlog)` items that are queued but not in flight (avoid empty Issues that rot).

When in doubt, prefer an Issue if the work spans more than one commit or any other PR will reference it.

## The Issue-and-PR flow (Claude performs end-to-end)

1. **Create the Issue** — `gh issue create --title "Phase Nx: <short description>" --body "..."`. Body describes scope, expected deliverables, and links to the relevant `TODO.md` row, `SPLIT-PLAN §6 (backlog)` bullet, or `SPLIT-PLAN §5 (progress log)` in-flight context.
2. **Create the branch** per the pattern above.
3. **Edit, commit on the branch.** Commit messages may include `Refs #N` for traceability but it's optional — the PR body is the canonical link.
4. **Push and open the PR** — `gh pr create ...`. **The PR body MUST include `Closes #N`** so GitHub auto-closes the Issue on merge.
5. **Merge with `--merge`.**
6. **Verify the Issue closed** — `gh issue view N --json state`.
7. **Add the `SPLIT-PLAN §5 (progress log)` row** referencing both the Issue number and PR number.
8. **Delete the branch (local + remote).**

## Consistency invariants — every state must agree

After any phase completes, all of these must be in agreement:

- **Open Issue** ↔ open work item in `TODO.md` or `SPLIT-PLAN §6 (backlog)` or in-flight row in `SPLIT-PLAN §5 (progress log)`.
- **Closed Issue** ↔ `TODO.md` checkbox marked `[x]` (or `SPLIT-PLAN §6 (backlog)` bullet removed), **plus** a `SPLIT-PLAN §5 (progress log)` row recording the closure, **plus** a merged PR.
- **PR** ↔ exactly one Issue (via `Closes #N`).
- **Commits on the branch** ↔ the branch tied to the Issue (via the PR's `Closes` link).

If you find drift (e.g., a closed Issue with no `SPLIT-PLAN §5 (progress log)` row, or an open Issue whose work is already merged), surface and reconcile in the next phase.

## Claude does the GitHub work, not the developer

The developer asks for an outcome. Claude performs end-to-end:

- Decides whether an Issue is warranted.
- Creates the Issue if so.
- Branches, edits, commits, opens the PR with the right `Closes #N` link.
- Merges per the workflow rule.
- Verifies the Issue auto-closed.
- Updates `SPLIT-PLAN §5 (progress log)` with cross-references.

The developer should not need to open the GitHub UI to manage Issue state, link Issues to PRs, or close Issues by hand. If the AI can perform a step but didn't, that's a process bug — surface it.
