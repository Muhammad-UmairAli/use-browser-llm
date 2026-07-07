---
description: Show the project's setup-status dashboard and offer to do whatever is next
argument-hint: ""
---

# /whats-next

Display the project's status dashboard and offer to do the most likely next item.

## Steps

1. Run `bash tools/whats-next.sh` and surface the output to the user **verbatim**. The dashboard speaks for itself — do **not** re-summarize SETUP / PHASE STATE in your own words, do **not** add a numbered list of "two things to fix", do **not** explain the difference between placeholders and real items. The user can read the dashboard.

2. After the dashboard, ask **exactly one concise question**. The phrasing depends on the dashboard's NEXT ACTION — match the case below; never synthesize a different recommendation.

   | Dashboard NEXT ACTION                                                                  | Question to ask                                                                                                                                                                      |
   | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
   | "Run the integration wizard…"                                                          | `Next: run the integration wizard via /setup-integrations. Want me to do that now? (y/n)`                                                                                            |
   | "Activate pre-commit locally…"                                                         | `Next: install pre-commit hooks (uv tool install pre-commit && pre-commit install). Want me to do that now? (y/n)`                                                                   |
   | "Apply branch protection…"                                                             | `Next: apply the branch-protection ruleset to this repo. Want me to do that now? (y/n)`                                                                                              |
   | "Define your project: fill in SPLIT-PLAN §1 (goals) and SPLIT-PLAN §2 (out of scope)…" | `Now you are ready to define your project goals and what is in scope and out of scope. I will start asking you questions now to guide you through the process. Are you ready? (y/n)` |
   | "Pick from SPLIT-PLAN §6 (backlog)…"                                                   | `Next: pick from SPLIT-PLAN §6 (backlog) — N items waiting. Want me to walk through them? (y/n)`                                                                                     |
   | "TODO.md has N real open item(s)…"                                                     | `Next: address one of the N open items in TODO.md. Want me to walk through them? (y/n)`                                                                                              |
   | "Per the most recent SPLIT-PLAN §5 (progress log) row: <text>"                         | `Next: <verbatim text from the dashboard>. Want me to start that now? (y/n)`                                                                                                         |
   | (otherwise)                                                                            | `Next: open Phase 1 via /open-phase 1 "<title>". Want me to do that now? (y/n)`                                                                                                      |

   One line, one question, no preamble. Do not re-summarize the dashboard.

3. Based on answer:
   - **yes** → execute the action by delegating to the matching slash command:
     - integration wizard → `/setup-integrations`
     - goals/scope → `/define-goals`
     - phase work → `/work-the-phase`
     - other setup tasks (pre-commit install, branch protection apply, etc.) → perform inline.
   - **no** → one short follow-up: "What would you rather do?" Then act on their answer.
   - **skip** → re-show the next-priority item from the dashboard. Don't re-explain the rules.

## Natural language triggers

The kit's adopter `CLAUDE.md` instructs the AI to invoke `/whats-next` automatically when the user types phrases like:

- "what's next?"
- "where am I?"
- "what should I do?"
- "status?"
- "show me the dashboard"

Always run `/whats-next` first to ground the conversation in current state, then ask — never assume what the user wants to do based on memory alone.

## What you must not do

- Run any of the suggested actions without confirmation. The dashboard is informational; the user picks.
- Auto-invoke `/work-the-phase --full-auto` from inside `/whats-next`. Pass-through to `/work-the-phase` with no flags so its own gating applies.
- Modify `SPLIT-PLAN §6 (backlog)` from this command — that violates the `SPLIT-PLAN §6 (backlog)` discipline (only the picking-up phase removes a bullet).
