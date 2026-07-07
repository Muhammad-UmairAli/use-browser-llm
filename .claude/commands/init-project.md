---
description: Orient a freshly-initialised project — confirm Phase 0 complete, offer the integration wizard, then hand off to /define-goals
argument-hint: ""
---

# /init-project

`init-project` refers to `tools/init-project.sh` — a bash script run from your terminal that bootstraps a project from the kit. If you're seeing this command fire inside Claude Code, **that script has already run**. Phase 0 (16 timed bootstrap steps) is complete and the kit is wired up. This slash command picks up from there.

> **Do not** confuse this with the built-in `/init` skill. This command never rewrites `CLAUDE.md`.

## Steps

1. **Confirm Phase 0 is complete.** Run the render check:

   ```bash
   bash tools/render-check.sh 0
   ```

   - If it exits non-zero or the file doesn't exist: say "Phase 0 actuals are missing — run `bash /path/to/claude-orchestration-kit/tools/init-project.sh` from your terminal first, then reopen Claude Code." Stop here; do nothing else.
   - If it exits 0: Phase 0 is confirmed. Continue.

2. **Check the integration wizard.** Look for `.claude/.integrations-wizard-run`:

   ```bash
   test -f .claude/.integrations-wizard-run && echo "done" || echo "pending"
   ```

   - **Pending**: say "The integration wizard hasn't been run yet. It wires up Git Flow, CCPM, VoltAgent, GetDesign.md, branch protection, and pre-commit hooks. Want to run it now? (y/n)". If yes, delegate to `/setup-integrations`.
   - **Done**: say "Integration wizard already complete." and continue.

3. **Check whether goals are defined.** Grep `SPLIT-PLAN.md` for the placeholder text `_Goal 1_`:

   ```bash
   grep -q "_Goal 1_" SPLIT-PLAN.md && echo "placeholder" || echo "defined"
   ```

   - **Placeholder still present**: goals haven't been defined. Say "Phase 0 is complete and the integrations are wired up. The last setup step is defining your project goals. Want me to guide you through that now? (y/n)". If yes, delegate to `/define-goals`.
   - **Goals defined**: run `/whats-next` to orient the session on whatever is next.

## What you must not do

- **Never run `tools/init-project.sh` without `--no-wizard` from inside Claude Code.** Its interactive wizard prompt hangs without a TTY. If Phase 0 rows are missing, tell the user to run the script from their terminal (or run it yourself with `--no-wizard` from the kit checkout, per the kit-side `/init-project` command).
- **Never rewrite, overwrite, or replace `CLAUDE.md`**, `SPLIT-PLAN.md`, or any other file the bootstrap already created. Phase 0 is done; do not redo it.
- **Never proceed to Phase 1 work, write features, or decompose tasks.** This command's sole purpose is orientation and handoff to `/setup-integrations`, `/define-goals`, or `/whats-next`.
- **Never use Claude Code's built-in `/init` skill path.** Do not call `Skill("init")` or perform any action that looks like a fresh project initialisation.
