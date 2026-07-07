---
description: Run the current phase's tasks autonomously through completion
argument-hint: "[--full-auto] [--parallel] [--release X.Y.Z] [--hotfix X.Y.Z]"
---

# /work-the-phase

You are entering the autonomous-loop entry point for this project. Follow the kit's methodology in `docs/methodology/12-autonomy-and-approvals.md`, `docs/methodology/03-github-workflow.md`, and (if the project uses Git Flow) `docs/methodology/06-git-flow-and-environments.md`.

## Steps

1. **Identify the current phase.** Read `SPLIT-PLAN §5 (progress log)` from the bottom up. The most recent unclosed row is the current in-flight phase. If no phase is in flight, ask the user which phase to start.

2. **Choose the target branch and naming convention based on flags and project model.**
   - **Base flow** (no Git Flow): branch off `main`. Naming: `phase-Nx-<short>` or `chore-<short>`. Target branch for PR: `main`.
   - **Git Flow + feature work** (no flag): branch off `develop`. Naming: `feature/<short>`. Target: `develop`.
   - **Git Flow + `--release X.Y.Z`**: branch off `develop`. Naming: `release/<X.Y.Z>`. Target: `main`. After merge to `main`, also back-merge `release/<X.Y.Z>` into `develop`. Tag the `main` merge as `vX.Y.Z`.
   - **Git Flow + `--hotfix X.Y.Z`**: branch off **`main`** (not develop). Naming: `hotfix/<X.Y.Z>`. Target: `main`. After merge, also back-merge `hotfix/<X.Y.Z>` into `develop`. Tag the `main` merge as `vX.Y.Z`.

   Detect Git Flow: if `develop` exists as a remote branch and `docs/methodology/06-git-flow-and-environments.md` is present in the project, Git Flow is in use. Otherwise base flow.

3. **Verify decomposition exists.** Check for `.claude/ccpm/epics/<epic>/`. If tasks already exist there, skip to step 4. If CCPM is not installed, do **not** stop — offer the user two ways forward:

   > CCPM isn't installed. I can (a) install it now (one `git clone` — enables parallel worktree execution), or (b) decompose this phase inline into a task list in the phase doc and work it sequentially. Which do you prefer?

   For (a), install CCPM per `docs/methodology/integrations/ccpm.md`, then run the full decomposition flow below (3a–3d). For (b) — **inline mode** — run 3a–3c as written, then instead of 3d write the PRD and a numbered sequential task list (with a `Hours:` estimate per task from `/estimate`) into `docs/phases/phase-NNN.md`; skip 3d. In inline mode, wherever a later step reads CCPM task files, read the phase doc's task list instead, treat every task as sequential (`--parallel` is unavailable — say so in step 4), and use each task's list number NN for its `P<phase>-NN` step id. With CCPM installed, run the full decomposition flow:

   **3a — Gather requirements.** Ask the user all four questions before proceeding:
   - What problem does this phase solve?
   - Who are the users?
   - What is the primary platform? _(web / mobile / desktop / CLI / API / other)_
   - Any hard constraints? _(existing stack, must-use libraries, team skill set)_

   **3b — Propose a technology stack using VoltAgent.** Based on the platform answer, spawn the appropriate VoltAgent specialist agent as a sub-agent. Give it the requirements from 3a and ask it to return **2–3 candidate stacks**, each with: name, key technologies, pros, cons, and best-fit scenario.

   | Platform             | Agents to consider spawning                                                                                            |
   | -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
   | Mobile               | `voltagent-core-dev:mobile-developer`; also `voltagent-lang:expo-react-native-expert`, `voltagent-lang:flutter-expert` |
   | Web — frontend-heavy | `voltagent-core-dev:frontend-developer`; consider React/Next.js, Vue/Nuxt, Angular                                     |
   | Web — full-stack     | `voltagent-core-dev:fullstack-developer`                                                                               |
   | API / backend        | `voltagent-core-dev:backend-developer`; consider Node, FastAPI, Go, .NET                                               |
   | Desktop              | `voltagent-core-dev:electron-pro`                                                                                      |
   | CLI                  | `voltagent-lang:python-pro` or `voltagent-lang:golang-pro`                                                             |

   Spawn at least one specialist. If the platform is ambiguous, spawn two and merge their proposals.

   **3c — Present and confirm.** Display the proposed stacks clearly with pros/cons. Ask:

   > Which stack do you want to use? Enter the number, or describe a different preference.

   Wait for the user's explicit answer. Do **not** proceed to 3d until a stack is confirmed.

   **3d — Write PRD → Epic → Tasks.** Write the PRD with the confirmed stack named explicitly in the Non-Functional Requirements section. Write the Epic with architecture decisions grounded in the confirmed stack. Decompose into sequential task files (001.md, 002.md, …).

4. **Recommend execution mode** _(if the user passed `--full-auto`, `--parallel`, or both as arguments they have already decided — skip the recommendation and the question, but STILL compute the U and R flags below: R gates the security audit in step 6 and matters most on exactly the unattended runs)_

   Read the task files in `.claude/ccpm/epics/<epic>/` (inline mode: the task list in `docs/phases/phase-NNN.md`) and compute these four signals:
   - **N** — total task count
   - **P** — tasks whose `depends_on` is empty or already fully satisfied (parallelisable right now)
   - **D** — longest unbroken dependency chain (serial floor — minimum tasks that must run in sequence regardless of parallelism)
   - **U** — unknowns flag: `true` if any task body contains `TBD`, `?`, `decide`, `figure out`, or `investigate`
   - **R** — risk flag: `true` if any task body mentions schema, migration, auth, third-party credentials, or API integration

   Also check whether CCPM is installed (`ls .claude/ccpm`). If absent, parallel is unavailable — exclude it from the recommendation entirely and note why.

   Apply this table to select a recommendation:

   | Condition                     | Recommended mode                                       |
   | ----------------------------- | ------------------------------------------------------ |
   | N = 1                         | `--full-auto` if U=false, R=false; otherwise `default` |
   | D = N (fully sequential)      | `--full-auto` if U=false, R=false; otherwise `default` |
   | P ≥ 2 and U=false and R=false | `--full-auto --parallel`                               |
   | P ≥ 2 and (U=true or R=true)  | `--parallel` (default/acceptEdits mode, stay in loop)  |
   | P = 1 and U=false and R=false | `--full-auto`                                          |
   | P = 1 and (U=true or R=true)  | `default`                                              |

   Output a concise block (≤ 8 lines):
   - Task graph: N, P, chain depth D
   - Unknowns/risk flags (omit this line if both are false)
   - Recommended mode in backticks with a one-phrase reason
   - Available alternatives

   Then ask:

   > Proceed with `<recommended mode>`? Press Enter to accept, or type: `full-auto`, `parallel`, `full-auto --parallel`, `default`, or describe a change.

   Wait for an explicit response. Map it to a flag set carried into step 5:
   - Enter / "yes" / "accept" → recommended mode
   - "full-auto" → `--full-auto`
   - "parallel" → `--parallel`
   - "full-auto --parallel" → both
   - "default" / "no flags" → acceptEdits (no flags)

5. **Set the autonomy mode** using the flags from the user's original invocation or step 4's confirmed choice.
   - No flags (default): `acceptEdits` mode — auto-accept edits, prompt on non-allowlisted Bash, `permissions.ask` still gates.
   - `--full-auto`: `bypassPermissions` mode — auto-run everything except `permissions.ask` and `permissions.deny`.
   - `--parallel`: hand off to CCPM's worktree spawner. Each spawned agent inherits the project's `.claude/settings.json`.

6. **Iterate over tasks.** For each eligible task (per CCPM's dependency graph):
   - Open a GitHub Issue (or pick up its existing one) per `docs/methodology/03-github-workflow.md`.
   - Branch off the target base (per step 2).
   - **Record start time** — invoke `/start-task <phase> <step> "<task description>"` (or directly `python tools/start-task.py <phase> <step> "<task description>"`). This writes a wall-clock timestamp to `.claude/task-timer.json`. Do this **before** any code is written. `<step>` is `P<phase>-<NN>` where NN is the CCPM task file number (`001.md` → `P1-01`) — the same id `/estimate` and `/log-time` must use; see `docs/methodology/02-time-tracking-and-estimates.md` § "Step ids".
   - **Advisor approach check.** Call `advisor()` to validate your planned implementation approach before writing any code. Proceed only after the advisor raises no blocking concern.
   - Execute the task. Invoke VoltAgent specialists (`code-reviewer`, `security-auditor`, etc.) when the work warrants it.
   - **Write and run tests.** For every feature or bug-fix task, write unit tests alongside the implementation. Run the full test suite using the project's test command. Do not proceed to the PR step until all tests pass. If tests fail: fix the implementation (or the test expectation if it was wrong), then re-run. Do not comment out or skip failing tests to make the suite green.
   - **Code review.** Invoke `voltagent-qa-sec:code-reviewer` as a subagent on every task. Give it the changed files and ask for a blocking-vs-advisory breakdown of findings. Address all blocking findings (re-run tests if code changed as a result). Advisory findings may be deferred to `SPLIT-PLAN §6 (backlog)` with a brief note.
   - **Security audit** _(run when R=true — task involves auth, credentials, API integrations, schema/migrations, or any input/output boundary)_. Invoke `voltagent-qa-sec:security-auditor` as a subagent. Give it the changed files plus any relevant context (auth flow, data schema, external API surface). Ask for a risk-ranked finding list. All Critical and High findings must be resolved before the PR; Medium findings should be assessed and either fixed or explicitly deferred to `SPLIT-PLAN §6 (backlog)`; Low findings may be noted and deferred. Re-run tests after any security fix.
   - **Update the architecture diagrams.** If the task added or changed a system component (a container, service, integration, data path, or pipeline), add or update its diagram in `docs/architecture-diagrams.md` in this same PR. Use Mermaid syntax and mark the component's status (built / in-PR / planned). If the task touched no components, skip this.
   - **Advisor sign-off.** Call `advisor()` again to validate that tests are green, the review is clear, and the implementation matches the task requirements before opening the PR. If the advisor surfaces a concern, resolve it before proceeding.
   - Open the PR with `Closes #N` in the body. Verify the PR's base branch matches step 2 — under Git Flow, feature PRs target `develop`, release/hotfix PRs target `main`.
   - Merge with `--merge` (this fires `permissions.ask` — the developer is prompted).
   - For `release/*` and `hotfix/*` merges to `main`: also create the tag (`git tag -a vX.Y.Z -m "..." && git push origin vX.Y.Z`) and execute the back-merge to `develop`.
   - **Log finish time** — invoke `/log-time <phase> <step> <est_hours> "<notes>"`. Pass the task's `Hours:` value as `<est_hours>` (CCPM task file frontmatter, or the phase doc's task list in inline mode) — `log-time.py` uses it as the estimate in `DASHBOARD.html`, reads the timer started above, calculates real elapsed time (capped at 8 h), and records that as the actual hours.
   - Delete the branch (local + remote).

7. **Stop conditions** — halt and surface on any of:
   - Any `permissions.ask` tool fires (forces a prompt).
   - A task's PR CI fails.
   - A task hits unresolved ambiguity (engineering-hygiene "surface conflicts" rule).
   - A specialist subagent returns a blocking concern.
   - The post-phase render check on `DASHBOARD.html` fails.
   - A cross-doc consistency walk via `SPLIT-PLAN §4 (cross-cutting concepts)` finds drift you can't auto-resolve.
   - Under Git Flow: a UAT smoke-test failure on a `release/*` or `hotfix/*` deploy.
   - Under Git Flow: a back-merge conflict between `release/*` (or `hotfix/*`) and `develop` that can't be auto-resolved.

8. **Phase close.** When all phase tasks are merged:
   - Confirm `docs/architecture-diagrams.md` reflects every component the phase built or changed, with each status updated (in-PR → built on merge). Note this in the closure log.
   - Append `## Closure log` to `docs/phases/phase-NNN.md`.
   - Replace the placeholder with a thin pointer row in `SPLIT-PLAN §5 (progress log)`. For release/hotfix phases, include the version number and PROD deploy outcome.
   - Run `./tools/render-check.sh <phase-id>`. If any step in the closed phase lacks a logged actual, halt and report.
   - Report completion: phase number, tasks merged, total actuals, variance vs. estimate, and (for release/hotfix) the new tag and PROD-deploy result.

## What you must not do

- **Rename task files after creation.** Task files keep their sequential names (001.md, 002.md, …) forever. GitHub issue numbers are stored only in each file's `github:` frontmatter field — they are never used as filenames and never replace the sequential IDs in `depends_on` arrays. Do not create mapping files to reconcile the two numbering systems. The mismatch between sequential task IDs and GitHub issue numbers is expected and intentional.
- Bypass `permissions.ask` gates by reformulating commands.
- Cut a hotfix from `develop` (drags in unreleased work). Hotfixes always cut from `main`.
- Skip the back-merge after a release or hotfix (develop loses the fix; the next normal release re-introduces the bug).
- Tag before the PR to `main` is merged. The tag is created _at_ the merge, never before.
- Merge a phase PR with `—` cells in `DASHBOARD.html` without an explicit "files NOT touched / step X not logged" note in the `SPLIT-PLAN §5 (progress log)` row.
- Add items to `SPLIT-PLAN §6 (backlog)` from inside this loop unless the user explicitly defers something.
- Skip the post-phase render check.
- Open a PR for a task without a passing test suite. Tests must be green before `gh pr create` runs.
- Open a PR without completing the `voltagent-qa-sec:code-reviewer` gate and addressing all blocking findings.
- Skip the `voltagent-qa-sec:security-auditor` gate when R=true. If the task touches auth, credentials, APIs, migrations, or any trust boundary, the security audit is not optional.
- Skip either `advisor()` call (approach check before coding; sign-off before PR). Skipping the advisor is the fastest way to merge something that looks correct but isn't.
- Merge a PR that adds or changes a system component without updating its diagram in `docs/architecture-diagrams.md` in the same PR. Diagrams grow with the system, not at the end.
