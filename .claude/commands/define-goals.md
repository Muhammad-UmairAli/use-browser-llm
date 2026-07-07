---
description: Walk the user through defining SPLIT-PLAN §1 (goals) and SPLIT-PLAN §2 (out of scope) interactively, then write their answers into SPLIT-PLAN.md
argument-hint: ""
---

# /define-goals

Guide the user through stating their project's goals and out-of-scope items. Replace the kit's template placeholders (`_Goal 1_`, `_Goal 2_`, `_Out-of-scope 1_`) in `SPLIT-PLAN.md` with the user's real answers. Use a welcoming, conversational tone — many adopters running this for the first time may not have written down their goals before.

## Steps

1. **Welcoming intro.** Open with this exact phrasing:

   > Now you are ready to define your project goals and what is in scope and out of scope. I will start asking you questions now to guide you through the process. Are you ready? (y/n)
   - If no: end with "Just say `/define-goals` whenever you're ready." Do not pressure.

2. **Goals — the in-scope side.** Once they say yes, ask:

   > What is this project for? Tell me the main thing you're building, in one or two sentences.

   Wait for the answer. Then:

   > Anything else? Add another goal, or say "done" if those are all.

   Loop until they say "done", "no", "that's it", or similar. Collect each goal as a separate bullet. If they want to revise a previous goal, accept the revision and continue.

3. **Out of scope — the deliberately-not side.** When goals are captured, transition:

   > Now the other side: what should this project explicitly NOT do? These are things you're deliberately ruling out so the work doesn't drift into them. Tell me one, or say "skip" if nothing comes to mind yet.

   If they skip: leave `SPLIT-PLAN §2 (out of scope)` with a single bullet `- _(none specified yet)_`.

   Otherwise loop "Anything else?" until they say "done".

4. **Write the answers.** Edit `SPLIT-PLAN.md`:
   - Replace the goals bullets under `## §1 — Goals` (currently `- _Goal 1_`, `- _Goal 2_`) with the user's actual goals, one bullet per goal.
   - Replace the out-of-scope bullets under `## §2 — Out of scope` with the user's actual items, or with the `- _(none specified yet)_` placeholder if they skipped.
   - Single edit to the file (not multiple round-trips).

5. **Log the time.** This conversation is itself substantive work — capture it via `/log-time`:

   ```
   /log-time 0 27 <hours> "Defined SPLIT-PLAN §1 (goals) and SPLIT-PLAN §2 (out of scope) interactively"
   ```

   `<hours>` is your estimate of how long the back-and-forth took (typically 0.1–0.5h depending on how many goals were collected). Phase 0 step 27 is the kit's reserved slot for goal definition (1–16 are the bootstrap self-test, 17–25 the wizard questions, 26 the wizard umbrella).

6. **Open Phase 1 and immediately hand off to `/work-the-phase`.**

   Say:

   > Goals captured in SPLIT-PLAN §1 (goals). Opening Phase 1 now and starting requirements definition.

   Derive a short Phase 1 title from the user's first goal: lowercase, hyphenated words, max 30 characters (e.g., "customer-order-portal"). Then open the phase by calling the script directly:

   ```bash
   python tools/open-phase.py 1 "<derived-title>"
   ```

   If the script exits non-zero because Phase 1 is already in flight, that is fine — continue.

   Immediately delegate to `/work-the-phase`. Do **not** stop and wait for the user — the handoff is automatic. `/work-the-phase` will detect that CCPM decomposition is missing and will start the PRD → Epic → Task flow, which asks the user to define their requirements.

## What you must not do

- Don't fill in goals on the user's behalf. Each goal must be the user's own words. If they're stuck, ask a clarifying question rather than offering text to accept.
- Don't write to `SPLIT-PLAN.md` until you've collected all the answers — write everything in a single edit so the file is never in a half-finished state.
- Don't keep the kit's `_Goal 1_` / `_Goal 2_` / `_Out-of-scope 1_` literal placeholders in the file. Replace them entirely.
- Don't add unrelated sections to `SPLIT-PLAN.md` — only §1 and §2.
- Don't stop after logging time — immediately open Phase 1 and delegate to `/work-the-phase`. The user should not need to prompt the system to begin requirements definition.
- Don't skip step 5 — this conversation IS work and must end with `/log-time`.
