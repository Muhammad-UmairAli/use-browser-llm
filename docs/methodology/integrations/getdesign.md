# GetDesign.md — design specifications as context

> The kit's `/setup-integrations` wizard writes `docs/DESIGN.md` from its built-in multi-theme design-identity step; a GetDesign.md spec can replace or extend that file at any time (the terminal fallback wizard `tools/setup-integrations.sh` still offers the direct download). Read on for the full catalog, picking guidance, and how it composes with VoltAgent's design specialists.

[GetDesign.md](https://www.getdesign.md) is a curated library of production-grade `DESIGN.md` files inspired by 70+ major design systems (Stripe, Figma, Apple, Notion, BMW, Airtable, etc.). Each is a structured Markdown spec covering typography, color, components, spacing, and UI patterns.

The kit's orchestration layer doesn't dictate visual design; GetDesign supplies it as drop-in context for AI agents doing UI work.

## How it plugs in — different shape from VoltAgent

| Layer         | Mechanism                                                                                 |
| ------------- | ----------------------------------------------------------------------------------------- |
| **VoltAgent** | _Agents_ — invoked via the `Agent` tool from inside a task                                |
| **GetDesign** | _Context_ — a markdown file dropped into the project so any agent reads it and follows it |

GetDesign isn't a persona to summon. It's a specification you commit alongside the code so every agent doing UI work has concrete depth — typography scales, color tokens, component patterns — instead of inventing them from scratch.

## When to use it

A phase with UI work — designing or refactoring a frontend component, building a new page, tightening visual consistency. The pattern:

1. Pick a `DESIGN.md` from the [GetDesign.md](https://www.getdesign.md) collection that matches your project's intended aesthetic (e.g., the `stripe` or `notion` spec for clean SaaS, `bmw` for high-contrast premium, etc.).
2. Drop it at `docs/DESIGN.md` in your project.
3. Reference it from `CLAUDE.md` so every agent reads it on session start (the kit's template `CLAUDE.md` includes a stub line under "Branding & visual identity" — point it at `docs/DESIGN.md`).
4. Mid-phase, the task-agent doing UI work follows the spec. Color, type, spacing, component structure all come from the spec, not from improvisation.

## How this composes with the orchestration layer

- **Cross-cutting concept.** The choice of `DESIGN.md` is itself a cross-cutting concept — it shows up in `SPLIT-PLAN §4 (cross-cutting concepts)` as a row pointing at `docs/DESIGN.md`, plus the `CLAUDE.md` reference, plus any frontend file that hard-codes design tokens.
- **Self-healing docs apply.** If a UI task discovers `docs/DESIGN.md` is missing a token the design needs, the agent updates the spec inline (per `methodology/05-self-healing-docs.md`), bundling the fix into the same PR.
- **Specialist review still applies.** A UI task can still invoke VoltAgent's `accessibility-tester` or `ui-designer` for a focused review — GetDesign provides the _spec_, VoltAgent provides the _reviewer_.

## Adopting in a new project

```bash
# Browse https://www.getdesign.md and pick a DESIGN.md
# Save it as docs/DESIGN.md in your repo
mkdir -p docs
curl -o docs/DESIGN.md https://www.getdesign.md/<chosen-system>/DESIGN.md

# Add a SPLIT-PLAN §4 (cross-cutting concepts) row pointing at it
# Add a CLAUDE.md reference under "Branding & visual identity"
# Commit alongside any code that depends on it
```

The kit's template `CLAUDE.md` already has a placeholder for this — uncomment the `docs/DESIGN.md` reference once you've picked a spec.

## When to skip

For projects without significant UI work — a CLI tool, a backend service, an IaC repo — there's no UI for `DESIGN.md` to constrain. Skip the integration entirely; the slot in the kit's template `CLAUDE.md` stays commented out.
