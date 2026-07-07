# 07 — Observability and logging

Two concerns, two distinct systems: log aggregation for diagnostics, and availability probing for uptime. Configure both, or explicitly record why one is absent.

## Log classification

Every service is classified at project inception as one of two tiers:

| Tier        | Description                                | Log destination           |
| ----------- | ------------------------------------------ | ------------------------- |
| Monitored   | Active alerting on errors and job failures | `<monitored-workspace>`   |
| Unmonitored | Logging retained; no alert rules           | `<unmonitored-workspace>` |

Record the classification in `docs/observability.md`. Don't defer it.

## Azure resource types

The kit recognizes three Azure resource types with distinct wiring paths:

| Resource type       | Log sources                                                            |
| ------------------- | ---------------------------------------------------------------------- |
| Function Apps       | Application Insights → Log Analytics (job stream errors, job failures) |
| Web Apps            | App Service Logs (File System) → Diagnostic Settings → Log Analytics   |
| Automation Accounts | Job stream errors, job failures → Log Analytics                        |

## Application Insights

Provision one Application Insights instance per monitored Function App. Naming convention: `<app-insights-prefix>` followed by the app's descriptor — for example `AI-Automations`. Point it at the chosen Log Analytics Workspace.

## Code conventions

Emit structured output at the right severity level so alert rules and log queries match correctly.

### PowerShell (Functions, Automation Accounts)

`Write-Output` for informational entries; `Write-Warning` for anything that warrants triage. Wrap every execution block in `try/catch` — do not swallow exceptions silently.

```powershell
try {
    # work here
    Write-Output "Step completed: <description>"
} catch {
    Write-Warning "Step failed: $_"
    throw
}
```

### Python (Functions, Web Apps)

Use the standard `logging` library, configured at module level so the framework's log router picks it up.

```python
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

try:
    # work here
    logger.info("Step completed: <description>")
except Exception as exc:
    logger.error("Step failed: %s", exc)
    raise
```

## Availability monitoring — dead-man's-switch

For scheduled or long-running workloads, configure a dead-man's-switch: the app pings a third-party monitoring endpoint on each successful run; a missed check-in fires an alert. Record the endpoint URL and check-in interval in `docs/observability.md`.

## IAM requirements

The monitoring function (`<monitoring-app>`) must hold the **Website Contributor** role — assigned via IAM — on every Function App and Web App it is responsible for. This enables automated restarts when downtime is detected. Assign this role at provisioning time, not after an incident.

## Wiring checklist

For each new Azure resource:

1. Classify as monitored or unmonitored — record the decision in `docs/observability.md`.
2. Create Application Insights (Function Apps) **or** enable File System logging plus Diagnostic Settings (Web Apps), pointing at the correct Log Analytics Workspace.
3. Assign the **Website Contributor** role to `<monitoring-app>` via IAM.
4. Add the resource to the monitoring function's configuration array.
5. Apply the code conventions above.

Don't mark a resource production-ready until all five steps are done.

## Applying these standards in code generation

When generating code for Azure Functions, Web Apps, or Automation Accounts:

1. Check that `docs/observability.md` exists and its resource table is filled in.
2. If the doc is missing or incomplete, surface the gap to the user before writing production code.
3. Use the values in `docs/observability.md` for resource names, workspace targets, monitoring function references, and Application Insights names.
