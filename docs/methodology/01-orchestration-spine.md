# 01 — The orchestration spine

The spine of the kit is one living document at the project root: `SPLIT-PLAN.md`. Everything the project does, has done, has decided to defer, or holds as cross-cutting must show up there or in a doc that `SPLIT-PLAN.md` points at. If it isn't on the spine, it doesn't exist.

## What `SPLIT-PLAN.md` contains

`SPLIT-PLAN.md` is a numbered-section document. The starter template ships with these sections:

| Section                     | Purpose                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------- |
| §0 — Header                 | One-paragraph project description and the current state-of-the-world.                       |
| §1 — Goals                  | What the project is trying to achieve. Stable; rarely edited.                               |
| §2 — Out of scope           | What this project is _not_. Defended actively.                                              |
| §3 — Architecture overview  | Pointer to `docs/architecture-design-decisions.md`; not duplicated here.                    |
| §4 — Cross-cutting concepts | The small set of names/values that must be updated in **every** affected file when changed. |
| §5 — Progress log           | Chronological one-line pointer rows, one per closed phase.                                  |
| §6 — Backlog                | Items deliberately deferred from in-flight phases.                                          |

The kit ships these seven sections — gap-free by design. Adopters who need additional sections append at the end (next available number is 7, then 8, etc., each with its own descriptor that adopters add to `docs/conventions/section-references.md`). If a section truly belongs in the middle, renumber every reference using the kit's grep-and-edit sweep pattern — every cross-reference, console string, and template must move together.

## Phases — the unit of work

Work proceeds in numbered **phases**. One chat session is typically one phase. The phase number, not the calendar date, is the unit of accountability.

For non-trivial phases, create `docs/phases/phase-NNN.md` to hold scope, decisions, and (at the end) the closure log. Trivial chores skip the phase doc and live entirely in `SPLIT-PLAN §5 (progress log)`.

### Reading at the start of a phase

1. Read `SPLIT-PLAN §5 (progress log)` from the bottom up — recent rows tell you what just happened and what the previous phase promised the next one would do.
2. Follow any pointer row that interests you to its phase doc's `## Closure log` for full detail.
3. Read `SPLIT-PLAN §6 (backlog)` to see what is explicitly out of scope until further notice. Don't pull `SPLIT-PLAN §6 (backlog)` items into the current phase without being asked.

### Closing a phase

If the phase has a `docs/phases/phase-NNN.md` doc:

- Append a `## Closure log` section with: date closed, Issue/PR numbers, step status, files added/modified/NOT-touched, sanity checks, diagrams current in `docs/architecture-diagrams.md`, what this unblocks.
- Add a one-line pointer row to `SPLIT-PLAN §5 (progress log)` linking to the new closure log.

If the phase has no phase doc (small chores, hot-fixes, restructures):

- Add a full row to `SPLIT-PLAN §5 (progress log)` directly. Same content, just inline.

Both paths end with the post-phase render check (`tools/render-check.sh <phase>`) passing. See `methodology/02-time-tracking-and-estimates.md`.

### Diagram each component as you build it

When a step adds or changes a system component — a container, service, integration, data path, or pipeline — add or update the corresponding diagram in `docs/architecture-diagrams.md` **in the same PR**. The system stays fully documented as it grows rather than being reconstructed at the end. Mark each component's status (built / in-PR / planned). Use Mermaid syntax so the diagrams render on GitHub. This is part of every step's close-out, alongside the closure log.

## The thin-index discipline

`SPLIT-PLAN §5 (progress log)` rows are **one-line pointers**, not full closure logs. Full detail lives in the per-phase doc. This is why `SPLIT-PLAN §5 (progress log)` stays scannable as the project grows past 50 phases — the spine keeps narrow even when the project gets dense.

If you find `SPLIT-PLAN §5 (progress log)` rows growing into multi-paragraph blocks, that's a signal the phase warranted a `docs/phases/phase-NNN.md` and didn't get one. Migrate the detail there and shrink the row to a pointer.

## SPLIT-PLAN §6 (backlog) discipline

Three rules:

1. **Picking up a `SPLIT-PLAN §6 (backlog)` item:** add a `SPLIT-PLAN §5 (progress log)` row referencing `SPLIT-PLAN §6 (backlog)`, address only the chosen item(s), and **remove the corresponding bullet from `SPLIT-PLAN §6 (backlog)`** so the list shrinks.
2. **Adding to `SPLIT-PLAN §6 (backlog)`:** only when the current phase explicitly defers something. No hypotheticals. The list grows from real friction, not speculation.
3. **Editing `SPLIT-PLAN §6 (backlog)` from inside an unrelated phase is forbidden.** If you find yourself wanting to, stop and ask.

## SPLIT-PLAN §4 (cross-cutting concepts)

Some names and values must update in every place they appear when changed: identity names, secret names, module file names, top-level role labels. `SPLIT-PLAN §4 (cross-cutting concepts)` is the single source of truth listing each concept and every file that references it. When you change one, you walk the row and update every file in it. Don't trust your memory.

## Section reference style

Whenever you mention a numbered section — in chat, in commits, in PR / Issue bodies, in cross-references between docs, **and in console output from kit tools** — write it as `<file-stem> §<number> (<descriptor>)` in full. Every mention, not just first. Never bare `§N`.

Reasoning: a reader scanning a console dashboard or a `SPLIT-PLAN §5 (progress log)` row should not have to flip back to a glossary to find what a bare section number would mean. The descriptor makes the reference self-contained, and the file-stem disambiguates when more than one numbered doc is in play.

Canonical descriptors live in `docs/conventions/section-references.md`. When you add a new numbered section anywhere in the project, add a row there so future references stay consistent.

## When in doubt

1. Re-read the most recent `SPLIT-PLAN §5 (progress log)` row.
2. Re-read the relevant `methodology/` doc.
3. Surface the question rather than guess. Phases are cheap; silent drift is expensive.
