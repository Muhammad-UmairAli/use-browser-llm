# 13 — Agent tracking

Every agent spawned during a session is automatically logged so it appears in
the **Agents** tab of `DASHBOARD.html`. This doc describes how the system works.

## How logging happens

A PreToolUse hook (`.claude/hooks/log-agent-on-spawn.sh`) fires before every
`Agent` tool invocation. The hook:

1. Reads the tool_input JSON from stdin (one interpreter launch for the
   whole extraction).
2. Extracts `subagent_type`, `description`, and `run_in_background`.
3. Classifies the framework (`Claude`, `VoltAgent`, the project shortname,
   or `custom`) from `subagent_type` — see the identifier table below.
4. Resolves the current phase and step from `.claude/task-timer.json`
   (splitting the timer key on the FIRST dash, since step ids like `P1-06`
   contain dashes; falls back to `unknown` so a logging miss never blocks
   the Agent call).
5. Calls `tools/log-agent.py` with the extracted metadata.
6. Always exits 0 — the hook never blocks an Agent call.

## log-agent.py

`tools/log-agent.py <phase> <step> <framework> <agent-name> <parallel:y/n> "<notes>"`

- Appends one row to `.claude/agents-log.json`.
- Regenerates `.claude/agents-log.js` (`window.AGENTS_LOG_DATA = [...]`).
- Appends a row to `AGENT-LOG.md` (human-readable audit trail).
- Pushes an in-flight entry (row index, spawn time, agent name) to
  `.claude/agent-in-flight.json`.
- Prints `[AGENT] Spawning agent: …` to the console.

`tools/log-agent.py --complete [--agent <agent-name>]` (PostToolUse hook)

- Closes the oldest in-flight entry matching `<agent-name>` (parallel agents
  finish out of order; name matching keeps durations on the right rows) or,
  without `--agent`, the most recent entry.
- Writes `end_time` and `duration_ms` onto the matching agents-log row.
  When no `/start-task` timer exists, `/log-time` sums these durations per
  step as the actual-hours fallback.

All writes are atomic and serialized through a lockfile so concurrent hook
invocations from parallel agents cannot lose or corrupt entries.

## AGENT-LOG.md

Pipe table. Columns: Date | Phase | Step | Framework | AgentName | Parallel | Notes.

**Claude is the sole writer.** The hook and `log-agent.py` append rows. Do not edit manually.
`AGENT-LOG.md` is an audit trail only — it is not parsed by any tool.

## Agents tab in DASHBOARD.html

`DASHBOARD.html` loads `.claude/agents-log.js` via `<script src>` at open time and
runs `buildAgentsFromLog()` to compute:

- KPI tiles: total agents, parallel groups, max parallel, count by framework.
- Per-phase collapsible tables with every spawn row.
- "Last synced" timestamp derived from the most recent entry's `datetime` field.

Parallel groups are detected positionally: consecutive rows with `parallel="y"`
on the same step form one group; a step change or a sequential row closes it.

## Manual logging via /log-agent

For edge cases the hook can't cover (MCP tool invocations, external AI calls),
use the `/log-agent` slash command — it calls `log-agent.py` directly.

## Framework identifiers

These are the values the spawn hook writes (and the dashboard's KPI tiles
count):

| Identifier            | When it's used                                                                          |
| --------------------- | --------------------------------------------------------------------------------------- |
| `Claude`              | Native agent types: Explore, general-purpose, Plan, claude-code-guide, statusline-setup |
| `VoltAgent`           | VoltAgent specialists — `voltagent-*` / `plugin:name` types or plugin-cache matches     |
| `<project-shortname>` | Contents of `.claude/project-shortname`, for a project's own custom agents              |
| `custom`              | Anything else                                                                           |

For agents the hook can't see (MCP tool invocations, external AI calls), log
manually via `/log-agent` and pass whatever framework label fits (e.g. `mcp`,
`ccpm`).
