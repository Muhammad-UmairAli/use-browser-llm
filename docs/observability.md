# Observability configuration

Fill in this document during Phase 0. AI assistants consult it before generating code that emits logs or requires Azure monitoring wiring. See `docs/methodology/07-observability-and-logging.md` for the full standard.

## Log Analytics Workspaces

| Purpose                                       | Workspace name            |
| --------------------------------------------- | ------------------------- |
| Active monitoring (alerts + alerting enabled) | `<monitored-workspace>`   |
| Logging only (no alert rules)                 | `<unmonitored-workspace>` |

## Monitoring function

The function that reads job stream failures and triggers automated restarts:

| Field                                         | Value               |
| --------------------------------------------- | ------------------- |
| Name                                          | `<monitoring-app>`  |
| IAM role required on every monitored resource | Website Contributor |

## Application Insights naming

Prefix for Application Insights instances: `<app-insights-prefix>`

Example: prefix `AI-` produces `AI-Automations`, `AI-Billing`, etc.

## Resources in scope

One row per Azure resource this project provisions. Add rows as resources are created; do not leave placeholders for resources that don't exist yet.

| Resource name | Type                                        | Tier                    | Log Analytics Workspace | App Insights name |
| ------------- | ------------------------------------------- | ----------------------- | ----------------------- | ----------------- |
| _add rows_    | Function App / Web App / Automation Account | Monitored / Unmonitored |                         |                   |

## Availability monitoring

| Resource   | Dead-man's-switch endpoint | Check-in interval |
| ---------- | -------------------------- | ----------------- |
| _add rows_ |                            |                   |

## Code conventions for this project

- Default log level: **INFO** for normal flow, **WARNING / ERROR** for anything requiring triage.
- Logging pattern: see `docs/methodology/07-observability-and-logging.md §Code conventions`.
- Every execution block must use `try/catch` (PowerShell) or `try/except` (Python) — no silent exception swallowing.
