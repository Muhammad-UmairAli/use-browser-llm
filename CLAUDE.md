# CLAUDE.md — operating instructions for AI assistants in this project

This file pins the conventions this project follows. AI assistants read this first on every session. If anything you are about to do conflicts with what is below, **stop and surface the conflict** — do not silently deviate.

## What this project is

<!-- One paragraph. What you're building, for whom, current state of the world. -->

_Replace this paragraph with your project's one-line description._

## Repo layout

<!-- Reproducible from `ls`; not duplicated here. Note any non-obvious paths. -->

## How work is structured

This project uses the [claude-orchestration-kit](https://github.com/IntrustIT/claude-orchestration-kit) methodology. The full reference lives in `docs/methodology/` (copied in at init time). To wire up the kit's optional integrations (Git Flow, CCPM, VoltAgent, design themes, branch protection, WAF) run `/setup-integrations` in Claude Code — it walks you through the integration wizard and performs each install for you. (`tools/setup-integrations.sh` is the terminal fallback for use outside Claude Code.)

One-paragraph summary:

Work proceeds in numbered **phases**, one chat session per phase. The phase number is the unit of accountability, not the calendar date. Each phase starts by reading the most recent rows of `SPLIT-PLAN §5 (progress log)` from the bottom up. Each phase closes with a `## Closure log` appended to `docs/phases/phase-NNN.md` (or a full row inline in `SPLIT-PLAN §5 (progress log)` for small chores), plus `/log-time` for each substantive step, plus `/close-phase` to mark the phase complete, plus the post-phase render check (`tools/render-check.sh <phase>`).

### Before starting any phase

1. Read `SPLIT-PLAN §5 (progress log)` from the bottom up.
2. Follow any pointer row to its phase doc's `## Closure log` for full detail.
3. Read `SPLIT-PLAN §6 (backlog)` to learn what is deferred. Don't pull `SPLIT-PLAN §6 (backlog)` items into the current phase without explicit user instruction.

### When the phase is done

See `docs/methodology/01-orchestration-spine.md` for the close-out checklist.

## Working discipline

- **Every change to a protected branch goes through a feature branch + PR.** No direct commits to `main` or (under Git Flow) `develop`. Branch-protection rulesets enforce this at the platform level. See `docs/methodology/03-github-workflow.md` for the base flow, and `docs/methodology/06-git-flow-and-environments.md` for releases, hotfixes, and the local-dev / UAT / PROD environment promotion path.
- **Audit before edit.** Read the file first; surface what you found; then edit.
- **Run sanity checks before claiming done.** Greps with counts, not "looks good." See `docs/methodology/04-code-quality-and-gates.md`.
- **Pre-commit hooks run on every commit.** Don't bypass with `--no-verify`. Fix the issue and re-commit. See `docs/methodology/04-code-quality-and-gates.md` § "Local commit-time gates".
- **Node projects use pnpm, not npm or yarn.** `pnpm install` / `pnpm test` / `pnpm run build`; install pnpm via `corepack enable`, pin it with a `packageManager` field in `package.json`, and commit `pnpm-lock.yaml`. See `docs/methodology/04-code-quality-and-gates.md` § "Package manager".
- **Every substantive action ends with `/log-time`.** Writing a doc, decomposing tasks, building features, fixing bugs, reviewing code, opening or merging PRs — if it took non-trivial time, log it via `/log-time <phase> <step> <hours> "<notes>"`. The slash command appends to `.claude/time-log.json`, regenerates `.claude/time-log.js`, and runs `tools/render-check.py`. The dev never edits the data files directly.
- **Open phases via `/open-phase`, not implicitly.** When work moves from one phase to the next, run `/open-phase <N> "<title>"` first — it adds the SPLIT-PLAN §5 (progress log) row, creates `docs/phases/phase-NNN.md`, and logs the opening. Skipping this and starting work directly is how phases go untracked.
- **Estimate every step via `/estimate`, not by typing numbers.** `/estimate <phase> <step> "<description>"` spawns the `task-estimator` subagent which applies the kit's published rubric (`docs/methodology/02-time-tracking-and-estimates.md` § "Estimating: the rubric") and writes both the Baseline and With-AI columns. Two estimators on different days should land on the same numbers — that's the whole point.
- **Diagram each component as you build it.** When a step adds or changes a system component (a container, service, integration, data path, or pipeline), add or update the corresponding diagram in `docs/architecture-diagrams.md` in the same PR — so the system stays fully documented as it grows rather than being reconstructed at the end. Mark component status (built / in-PR / planned), and use Mermaid syntax so the diagrams render on GitHub. This is part of every step's close-out, alongside the closure log.
- **Declare files NOT touched** when you finish a phase, in the `SPLIT-PLAN §5 (progress log)` row.
- **Section reference style:** always `<file-stem> §<number> (<descriptor>)`. Every mention, not just first. Never bare `§N`. Applies to **every surface**: chat, commit messages, PR/Issue titles and bodies, doc cross-references, and console output from kit tools (`whats-next.sh`, `init-project.sh`, `setup-integrations.sh`, etc.). Descriptors: `docs/conventions/section-references.md`.
- **Write and run tests before every PR.** For each feature or bug-fix task: write unit tests alongside the implementation, run the full test suite, and do not open a PR until all tests pass. If the project has no test framework yet, set one up as part of the first feature task and document the test command here.
- **Code review gate before PR.** After tests pass, invoke `voltagent-qa-sec:code-reviewer` on every task. Address all blocking findings before creating the PR; defer advisory findings to `SPLIT-PLAN §6 (backlog)` with a brief note. For tasks that touch auth, credentials, APIs, schema/migrations, or any input/output boundary, also invoke `voltagent-qa-sec:security-auditor` — all Critical and High findings must be resolved before the PR.
- **Before generating code for cloud resources, check `docs/observability.md`.** Whenever you write code for an Azure Function App, Web App, or Automation Account — or any service that emits logs or calls availability endpoints — verify that `docs/observability.md` exists and its resource table is filled in. If the doc is missing or incomplete, surface the gap before writing production code. Use the values there for workspace targets, Application Insights names, and monitoring function references. See `docs/methodology/07-observability-and-logging.md` for the full standard.
- **Use `advisor()` at key checkpoints.** Call `advisor()` before starting substantive code on any task, and again after tests + review pass but before opening the PR. Also call it when stuck, changing approach, or unsure about a design decision. The advisor sees your full conversation history — give it weight.

## Time tracking

`.claude/time-log.json` is the canonical data source. **Claude is the sole writer.** When the AI completes a step, it runs `/log-time` to append an entry. When the developer does work the AI couldn't (meetings, manual env setup), the dev says "I did Phase Nx step M for Y hours" and the AI runs `/log-time`. `TIME-LOG.md` is an append-only human-readable audit trail — it is not parsed by any tool. See `docs/methodology/02-time-tracking-and-estimates.md`.

## Branding & visual identity

This project uses the following design themes (full CSS variable specs in `DASHBOARD.html`
and documented in `docs/DESIGN.md`):

| Theme   | Canvas | Accent  |
| ------- | ------ | ------- |
| Binance | dark   | #fcd535 |
| Airbnb  | light  | #ff385c |

**Theme picker requirement:** All frontend UI must include a theme picker that lets users
switch between these themes at runtime. Apply themes by toggling `data-theme="<slug>"` on
the root element. The default theme on first load is **Binance**.
VoltAgent should generate a framework-appropriate theme picker component using these themes.

## Self-healing documentation

When you follow a documented procedure and find the doc wrong/missing/stale, fix the doc as part of the same phase's work. Inline fix bundled into the current PR for small issues; surface to the user first for large ones. See `docs/methodology/05-self-healing-docs.md`.

## Autonomy and approvals

This project ships `.claude/settings.json` with an opinionated `allow` / `ask` / `deny` matrix. Three operating modes — `default`, `acceptEdits`, `bypassPermissions` — flipped via `defaultMode`. Even in fully autonomous mode, `permissions.ask` always gates. The `/work-the-phase` slash command is the entry point for autonomous loops. See `docs/methodology/12-autonomy-and-approvals.md`.

## When the user asks "what's next?"

When the user types phrases like "what's next?", "where am I?", "what should I do?", "status?", or "show me the dashboard", invoke the `/whats-next` slash command immediately. It runs `tools/whats-next.sh` (which prints the setup-status dashboard) and then offers to do the most likely next item from `SPLIT-PLAN §5 (progress log)`. Never guess from memory — let the dashboard ground the conversation in current state first.

## When in doubt

1. Re-read the most recent `SPLIT-PLAN §5 (progress log)` row.
2. Re-read the relevant `docs/methodology/` doc.
3. Run `/whats-next` to see the current state of every integration.
4. If the dashboard or logging looks wrong, run `/kit-doctor` — it checks the whole pipeline and prints a fix per finding.
5. Surface the question rather than guess.
