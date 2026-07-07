# CCPM — primary decomposition and parallel execution

> The kit's `/setup-integrations` wizard installs CCPM with one Y/N prompt (clones into `.claude/ccpm`; `tools/setup-integrations.sh` is the terminal fallback). Read on for context, the manual install steps, and how CCPM composes with the orchestration layer.

[CCPM](https://github.com/automazeio/ccpm) is the kit's primary tool for turning a phase into executable tasks and running those tasks concurrently. The orchestration layer owns _what's recorded_; CCPM owns _how the work decomposes and runs_.

## What CCPM provides

| Concept       | What it is                                                                                                                                      |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **PRD**       | Business-level requirements doc. Guided brainstorm — problem, users, success criteria, constraints, out-of-scope.                               |
| **Epic**      | Technical breakdown of a PRD. Architecture decisions, technical approach, task preview.                                                         |
| **Task**      | One unit of executable work. Markdown file with acceptance criteria, effort estimate, and metadata: `parallel`, `depends_on`, `conflicts_with`. |
| **Worktrees** | Each parallel-eligible task gets its own Git worktree directory. An agent runs in each, isolated from siblings.                                 |

## How a phase flows under CCPM + the orchestration layer

```
Phase opens (orchestration layer):
  • Add placeholder row to SPLIT-PLAN §5 (progress log)
  • Create docs/phases/phase-NNN.md if non-trivial

Decomposition (CCPM):
  • PRD authored (or skipped for small phases)
  • Epic authored — architecture, approach, task list
  • Tasks decomposed with parallel/depends_on/conflicts_with metadata

Issue creation (orchestration layer takes over):
  • One GitHub Issue per task, labeled phase-NNN, linking to the spec
  • Per "Claude does the GitHub work" — the AI creates these end-to-end

Parallel execution (CCPM):
  • Dependency graph evaluated; eligible tasks (parallel:true, no
    unmerged depends_on, no active conflicts_with) get worktrees:
        git worktree add ../wt-task-NNN -b task-NNN-...
  • An agent runs per worktree, picks up its Issue, branches inside
    its worktree, edits, commits, opens PR with `Closes #N`
  • As PRs merge, dependency graph re-evaluates; new tasks become
    eligible; new worktrees spawn

Each task closes (orchestration layer):
  • Branch + PR + `Closes #N` + merge with --merge
  • Branch deleted (local + remote)
  • TIME-LOG.md row appended
  • Self-healing docs pattern fires if any doc was wrong

Phase closes (orchestration layer):
  • Closure log appended to docs/phases/phase-NNN.md
  • Thin pointer row replaces the placeholder in SPLIT-PLAN §5 (progress log)
  • plan-data.json marked completed; DASHBOARD.html refreshes on next open
  • render-check.sh verifies every step has a logged actual
```

## Task file naming — do not rename after creation

Task files are named sequentially by the decomposition step: `001.md`, `002.md`, etc. These names are permanent. GitHub issue numbers are recorded only in the `github:` frontmatter field of each task file; they do not affect filenames.

`depends_on` arrays always reference the sequential task file basenames (`[1]`, `[2]`, …), not GitHub issue numbers. Because GitHub assigns issue numbers globally across issues, PRs, and epics, they will almost never match the sequential task IDs — that mismatch is expected and correct. Do not create mapping files to reconcile them.

## Concept mapping — no double-bookkeeping

| Orchestration layer                         | CCPM                                                         |
| ------------------------------------------- | ------------------------------------------------------------ |
| Phase row in `SPLIT-PLAN §5 (progress log)` | PRD                                                          |
| `docs/phases/phase-NNN.md` for big phases   | Epic                                                         |
| GitHub Issue                                | Task file                                                    |
| PR with `Closes #N`                         | Task PR                                                      |
| Closure log + `TIME-LOG.md` rows            | (CCPM has no equivalent — orchestration layer handles state) |

The two layers compose; they don't overlap. CCPM has no opinion about progress logs or time tracking; the orchestration layer has no opinion about parallel execution. Each layer fills the other's gap.

## Autonomy under CCPM

When `/work-the-phase --parallel` runs (see `methodology/12-autonomy-and-approvals.md`), CCPM spawns worktrees and the kit's `.claude/settings.json` propagates to each agent. Every agent inherits the same `allow`/`ask`/`deny` matrix and the same hooks — so concurrent agents are gated identically, and any agent hitting an `ask` rule (e.g., `gh pr merge`) prompts the developer in the main session.

## Installation in an adopting project

```bash
# In the adopting project's root, after the kit's init-project.sh has run:
git clone https://github.com/automazeio/ccpm .claude/ccpm
# Follow CCPM's own install instructions for slash commands.
```

The kit's `.claude/commands/work-the-phase.md` invokes CCPM commands; CCPM's task files live at `.claude/ccpm/epics/<epic>/<task>.md` (per CCPM's own conventions).

## When to skip CCPM

For genuinely small phases (a one-step chore, a doc fix, a typo) skip the PRD/Epic/Task ceremony entirely. Open an Issue, branch, edit, PR, merge. CCPM is for phases big enough that decomposition pays for itself.

For very large greenfield builds where you want a full role-team simulation (analyst / PM / architect / SM / dev / QA personas), BMAD-METHOD integration is planned for v2 (no doc yet — see https://github.com/bmad-code-org/BMAD-METHOD).
