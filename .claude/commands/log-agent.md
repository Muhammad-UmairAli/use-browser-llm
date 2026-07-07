# /log-agent

Manually log an agent spawn to AGENT-LOG.md and update DASHBOARD.html.

Use this for edge cases the PreToolUse hook can't cover automatically — for example:

- MCP tool invocations that aren't routed through the Agent tool
- External AI calls made outside Claude Code

## Usage

```
/log-agent <phase> <step> <framework> <agent-name> <parallel:y/n> "<notes>"
```

## Examples

```
/log-agent 3 1 mcp claude-ai-HaloPSA n "queried HaloPSA for ticket data"
/log-agent 3 2 voltagent code-reviewer n "reviewed auth middleware PR"
```

## Frameworks

- `Claude` — Explore, general-purpose, Plan, claude-code-guide (Claude Code native agents)
- `voltagent` — VoltAgent specialists (code-reviewer, security-auditor, etc.)
- `ccpm` — CCPM worktree spawner
- `mcp` — MCP tool invocations
- `custom` — anything else

## What it does

Calls `python tools/log-agent.py` with the arguments, which appends a row to
`.claude/agents-log.json`, regenerates `.claude/agents-log.js`, and appends a
row to `AGENT-LOG.md` (human-readable audit trail). The Agents tab in
`DASHBOARD.html` picks up the new entry on the next browser reload.
