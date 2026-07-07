# /export-phase-times

Export every step row from the phase lists with its start date/time, end
date/time, and logged hours — as a quick table in chat or a CSV file.

## Usage

```
/export-phase-times            → aligned table in the conversation
/export-phase-times csv        → CSV printed in the conversation
/export-phase-times csv FILE   → CSV written to FILE (e.g. phase-times.csv)
```

## What it does

Runs `python tools/export-phase-times.py` (add `--csv [FILE]` for the CSV
forms). The tool is read-only: it joins `.claude/plan-data.json` (the step
rows, in phase order) with `.claude/time-log.json` and derives, per step:

- **start** — earliest `datetime − hours` across the step's time-log
  entries. `/log-time` stamps completion time plus elapsed hours, so
  subtracting recovers when work on the step actually began.
- **end** — latest logged `datetime` for the step.
- **hours** — summed logged hours.

Steps with no logged time yet show blank start/end — they render in the
list but haven't been worked. Roll-up rows (mirrors of a decomposed
phase's totals) are flagged `[rollup]` so their hours aren't read as
additional work.

Times are shown in the local timezone.
