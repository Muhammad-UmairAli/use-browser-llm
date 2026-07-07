# 05 — Self-healing documentation

Documentation is followed, not just read. When the AI executes a documented procedure (a phase doc, a deployment runbook, an SOP) and finds the doc is wrong, missing detail, ambiguous, or out of date, the AI updates the doc as part of the same phase's work. Every execution is also an audit; rot is paid down on the same touch that found it.

## When to fix inline (no separate phase)

If the doc issue is small and the fix is local — a typo, a missing line in a code block, a stale path, an unmentioned prerequisite, an outdated CLI flag — bundle the fix into the **current phase's PR**. The `SPLIT-PLAN §5 (progress log)` row records the doc update alongside the substantive work. The PR body lists the doc updates explicitly so the reviewer sees them.

## When to surface first

If the doc issue is larger — a whole step is wrong, the procedure is fundamentally outdated, the fix would change behavior other readers depend on, the fix touches `SPLIT-PLAN §4 (cross-cutting concepts)` — surface it to the user before changing the doc. The fix may belong in its own phase, or may need clarification, or may require updates to several linked docs.

## Always

- Doc updates land via the standard branch + PR flow (`methodology/03-github-workflow.md`). Never a direct edit to `main`.
- The PR body explains both the doc problem AND the fix.
- If the concept appears in `SPLIT-PLAN §4 (cross-cutting concepts)`, update **every** file in that `SPLIT-PLAN §4 (cross-cutting concepts)` row, not just the file currently being followed.
- The phase's `SPLIT-PLAN §5 (progress log)` row records the doc fix in "What was done" so future chats know the doc changed mid-phase.

## Why it works

- **`main` stays protected** — every fix goes through a PR.
- **Developer keeps oversight** — every PR is reviewable; risky fixes surface first.
- **Docs improve continuously** — every execution is also an audit.
- **Audit trail is preserved** — `SPLIT-PLAN §5 (progress log)` records each doc fix in the phase that found it.

## Flow

```
        AI follows a documented procedure
                       │
                       ▼
         ┌──────────────────────────────┐
         │ Doc issue found?             │
         │ (wrong / missing /           │
         │  stale / ambiguous)          │
         └──────────────────────────────┘
              No  │           │ Yes
                  ▼           ▼
           Continue     ┌───────────────────────┐
           executing    │ How big is the fix?   │
                        └───────────────────────┘
                          Small │       │ Large
                                ▼       ▼
                  ┌──────────────────┐  ┌──────────────────┐
                  │ INLINE FIX       │  │ SURFACE TO USER  │
                  │ • bundle into    │  │ • explain        │
                  │   current PR     │  │ • propose scope  │
                  │ • PR body lists  │  │ • wait for       │
                  │   doc updates    │  │   guidance       │
                  │ • SPLIT-PLAN §5  │  └──────────────────┘
                  │   (progress log) │
                  │   row notes it   │
                  └──────────────────┘            │
                          │                       ▼
                          │            (own phase / clarify /
                          │             multi-doc coordination)
                          └────────┬───────────────┘
                                   ▼
                  ┌────────────────────────────────────────┐
                  │ Concept in SPLIT-PLAN §4               │
                  │ (cross-cutting concepts)?              │
                  │   Yes → update EVERY file in           │
                  │         SPLIT-PLAN §4                  │
                  │         (cross-cutting concepts) row   │
                  │   No  → local fix only                 │
                  └────────────────────────────────────────┘
                                   │
                                   ▼
                  ┌────────────────────────────────────────┐
                  │ Land via branch + PR (never main)      │
                  │ PR body: problem + fix                 │
                  │ SPLIT-PLAN §5 (progress log) row       │
                  │ records the doc change                 │
                  └────────────────────────────────────────┘
```

## Companion: self-healing deployment

The same pattern applied to long-running operational commands (IaC deploys, container builds, CI runs). When the AI runs a documented procedure that invokes a long-running command and the command fails, it captures the error context, spawns a troubleshooting subagent to diagnose, applies the fix via PR (low-risk inline; risky fixes surface first), then re-runs from a clean state. Records the cycle in the phase's `SPLIT-PLAN §5 (progress log)` row.

This makes deployment iteration fast without sacrificing audit trail or main-branch protection. (Detailed write-up deferred to v2.)
