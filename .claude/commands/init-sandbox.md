---
description: Set up an Azure Container Apps sandbox — Express + PostgreSQL in a single container, deployed to Azure and opened in your browser as Phase 1.
argument-hint: ""
---

# /init-sandbox

This command scaffolds a sandbox application (Express web app + API + PostgreSQL, all in one container), deploys it to Azure Container Apps Express, and opens your browser to the running site. It runs as **Phase 1** of your project.

Multiple sandboxes can exist in the same repo — each gets its own `sandboxes/{slug}/` directory and `.claude/sandbox-{slug}.json` config. After a sandbox is live, run `tools/sandbox-deploy.sh {slug}` to push updates.

## Prerequisites

Before starting, verify that:

- Azure CLI is installed: `az --version`
- You are logged in: `az account show`
- The Container Apps extension is at v1.3.0b4 or later:
  ```
  az extension show --name containerapp --query version
  ```

If the extension is missing or outdated:

```
az extension add -n ContainerApp
az extension update --name containerapp
```

**Important:** Azure Container Apps Express is in preview. It requires a Microsoft Entra ID (organizational) account — personal Microsoft accounts are not supported. It is available only in **West Central US** (`westcentralus`) and **East Asia** (`eastasia`) regions.

If any prerequisite fails, tell the user what is missing and stop. Do not proceed until prerequisites pass.

## Step 1 — Open Phase 1

Before collecting any information, open Phase 1 formally:

```bash
python tools/open-phase.py 1 "Phase 1 - ACA Express Sandbox Setup"
```

If the script exits non-zero because Phase 1 is **already in flight** (e.g. `/define-goals` opened it), that is fine — continue with the existing phase. Any other error: surface it and stop.

Surface the script output. From this point forward, log each substantive step via `/log-time`.

## Step 2 — Collect configuration

Ask Question 1 first; every other value has a sensible default derived from the slug, so most users only answer once and confirm.

**Question 1:** "What short local name should this sandbox have? This becomes the directory name (`sandboxes/{slug}/`) and config key. (e.g. `prototype`, `auth-spike`, `api-demo`)"

- Must be non-empty, lowercase, hyphens and alphanumeric only, no spaces, **21 characters or fewer, not ending in a hyphen** (Azure Container App names are capped at 32 chars and the derived default adds the 11-char `ca-sandbox-` prefix).
- Store as `SLUG`.

After Question 1, offer the derived defaults in one shot:

> Defaults from the slug — resource group `rg-sandbox-{slug}`, app `ca-sandbox-{slug}`, region `eastasia`, min replicas `0` (scale to zero). Use these, or customize each? (defaults / customize)

If **defaults**: set `RG=rg-sandbox-{slug}`, `APP_NAME=ca-sandbox-{slug}`, `ENV_NAME=env-{APP_NAME}`, `REGION=eastasia`, `MIN_REPLICAS=0` and jump to the confirmation below. If **customize**, ask Questions 2–5 one at a time:

**Question 2:** "What should the Azure resource group be named? (e.g. rg-sandbox-myproject)"

- Must be non-empty. Re-ask if blank.
- Store as `RG`.

**Question 3:** "What should the Container App be named? (e.g. ca-sandbox-myproject)"

- Must be non-empty, lowercase, no spaces.
- Store as `APP_NAME`.
- Derive `ENV_NAME` as `env-{APP_NAME}`.

**Question 4:** "Which Azure region? (westcentralus / eastasia)"

- Default: `eastasia`
- Only accept `westcentralus` or `eastasia`.
- Store as `REGION`.

**Question 5:** "Minimum replicas — 0 (scale to zero when idle, cold start on first request) or 1 (always on)? Press Enter for 0."

- Default: `0`
- Only accept `0` or `1`.
- Store as `MIN_REPLICAS`.

Confirm the values back to the user before proceeding:

> Ready to deploy:
>
> - Local slug: `{SLUG}` → `sandboxes/{SLUG}/`
> - Resource group: `{RG}`
> - App name: `{APP_NAME}`
> - Environment: `{ENV_NAME}`
> - Region: `{REGION}`
> - Min replicas: `{MIN_REPLICAS}`
>
> Shall I proceed? (y/n)

If they say no, stop. If yes, continue.

## Step 3 — Scaffold sandbox code

First, check if `sandboxes/{SLUG}/` already exists:

```bash
python3 -c "import os; print('exists' if os.path.isdir('sandboxes/{SLUG}') else 'ok')"
```

If the output is `exists`, ask the user:

> `sandboxes/{SLUG}/` already exists. Overwrite it? (y/n)

If they say no, skip this step and move to Step 4 (assume the existing directory is correct). If yes, remove it:

```bash
python3 -c "import shutil; shutil.rmtree('sandboxes/{SLUG}')"
```

If `.kit/sandbox` does not exist, the project was initialized with an older version of the kit. Tell the user:

> `.kit/sandbox` is missing — re-run `tools/init-project.sh` in a scratch directory to get the latest kit, or copy the `templates/sandbox/` folder from the kit repository into `sandboxes/{SLUG}/` manually.

Do not proceed if the source is missing.

Copy the template using Python (works cross-platform on Windows, macOS, and Linux):

```bash
python3 -c "import shutil, os; os.makedirs('sandboxes', exist_ok=True); shutil.copytree('.kit/sandbox', 'sandboxes/{SLUG}')"
```

Tell the user: "Sandbox code scaffolded to `sandboxes/{SLUG}/`."

Log this step:

```
/log-time 1 1 0.05 "Scaffold sandbox code from template"
```

## Step 4 — Create Azure resource group and environment

Create the resource group:

```bash
az group create --name {RG} --location {REGION}
```

Create the Container Apps express environment:

```bash
az containerapp env create \
  --environment-mode express \
  --name {ENV_NAME} \
  --resource-group {RG} \
  --logs-destination none
```

If either command fails, surface the full error and stop. Common failures:

- Not logged in → `az login`
- Subscription not registered → `az provider register --namespace Microsoft.App`
- Region not available → confirm the user chose `westcentralus` or `eastasia`

Log when done:

```
/log-time 1 2 0.1 "Create Azure resource group and Container Apps express environment"
```

## Step 5 — Build and deploy

Deploy from source (Azure builds the Dockerfile automatically via ACR):

```bash
az containerapp up \
  --name {APP_NAME} \
  --resource-group {RG} \
  --environment {ENV_NAME} \
  --source ./sandboxes/{SLUG} \
  --ingress external \
  --target-port 3000 \
  --min-replicas {MIN_REPLICAS} \
  --max-replicas 1
```

`--max-replicas 1` caps the app at one instance — PostgreSQL runs inside the container, so more than one replica would each start a separate database, causing split-brain data. `--min-replicas {MIN_REPLICAS}`: `0` scales to zero when idle (cold start on first request after inactivity); `1` keeps the container always on.

This command:

1. Creates an Azure Container Registry in the resource group.
2. Builds the `sandboxes/{SLUG}/Dockerfile` in the cloud via ACR Tasks.
3. Deploys the image to the Container App.

This typically takes 3–6 minutes. Tell the user to wait and that it will open the browser when done.

**If `--source` fails** (express-mode environments may not support source builds in all regions/CLI versions), fall back to a two-step build-then-deploy:

```bash
# Step 5a — Create a registry and build the image
ACR_NAME="${APP_NAME//[-_]/}acr"   # strip hyphens/underscores; ACR names are alphanumeric
az acr create \
  --name "$ACR_NAME" \
  --resource-group {RG} \
  --sku Basic \
  --admin-enabled true

az acr build \
  --registry "$ACR_NAME" \
  --image sandbox:latest \
  ./sandboxes/{SLUG}

# Step 5b — Deploy the pre-built image
ACR_SERVER=$(az acr show --name "$ACR_NAME" --query loginServer --output tsv)
ACR_USER=$(az acr credential show --name "$ACR_NAME" --query username --output tsv)
ACR_PASS=$(az acr credential show --name "$ACR_NAME" --query "passwords[0].value" --output tsv)

az containerapp create \
  --name {APP_NAME} \
  --resource-group {RG} \
  --environment {ENV_NAME} \
  --image "$ACR_SERVER/sandbox:latest" \
  --registry-server "$ACR_SERVER" \
  --registry-username "$ACR_USER" \
  --registry-password "$ACR_PASS" \
  --ingress external \
  --target-port 3000 \
  --min-replicas {MIN_REPLICAS} \
  --max-replicas 1
```

Surface the full error from the primary attempt before trying the fallback. Do not auto-retry more than once.

Log when done:

```
/log-time 1 3 0.2 "Build and deploy sandbox to Azure Container Apps"
```

## Step 6 — Get URL and open browser

Retrieve the app URL:

```bash
az containerapp show \
  --name {APP_NAME} \
  --resource-group {RG} \
  --query properties.configuration.ingress.fqdn \
  --output tsv
```

Prepend `https://` to the output. Call that `SANDBOX_URL`.

Open the browser:

```bash
# Windows
start {SANDBOX_URL}
# macOS
open {SANDBOX_URL}
# Linux
xdg-open {SANDBOX_URL}
```

(Choose the right command for the detected OS.)

## Step 7 — Save sandbox config

Write `.claude/sandbox-{SLUG}.json` so `tools/sandbox-deploy.sh` and `tools/sandbox-destroy.sh` can find the resource names:

```bash
python3 - <<'PYEOF'
import json
from pathlib import Path
config = {
    "slug":           "SLUG_HERE",
    "app_name":       "APP_NAME_HERE",
    "resource_group": "RG_HERE",
    "env_name":       "ENV_NAME_HERE",
    "region":         "REGION_HERE",
    "min_replicas":   "MIN_REPLICAS_HERE",
    "url":            "SANDBOX_URL_HERE"
}
Path('.claude').mkdir(exist_ok=True)
Path('.claude/sandbox-SLUG_HERE.json').write_text(json.dumps(config, indent=2) + '\n')
print("Saved .claude/sandbox-SLUG_HERE.json")
PYEOF
```

(Substitute the actual values for `SLUG_HERE`, `APP_NAME_HERE`, `RG_HERE`, `ENV_NAME_HERE`, `REGION_HERE`, `MIN_REPLICAS_HERE` (0 or 1), and `SANDBOX_URL_HERE`.)

Log when done:

```
/log-time 1 4 0.02 "Save sandbox config to .claude/sandbox-{SLUG}.json"
```

## Step 8 — Tell the user what's next

Say:

> **Sandbox `{SLUG}` is live at {SANDBOX_URL}**
>
> The page shows three things:
>
> - A **theme picker** (Light / Dark / Slate) — the kit's design identity integration will extend this.
> - An **items table** loaded live from PostgreSQL running inside the container.
> - An **API health check** confirming the database connection.
>
> **To make changes and redeploy:**
>
> 1. Edit files in `sandboxes/{SLUG}/` (or use the kit's phase process to gather goals, write reqs, and implement).
> 2. Run `tools/sandbox-deploy.sh {SLUG}` to rebuild and push. It opens the browser automatically when done.
>
> **To tear everything down:**
> Run `tools/sandbox-destroy.sh {SLUG}` — it will ask you to confirm the resource group name before deleting.
>
> **To create another sandbox:**
> Run `/init-sandbox` again and choose a different slug — each sandbox gets its own directory and Azure resources.
>
> Phase 1 is open. Use `/open-phase 2 "<title>"` when you're ready to start the next phase of actual work.

## What you must not do

- Don't skip the prerequisite check — a failed deploy mid-way is harder to recover from than stopping early.
- Don't proceed past "Shall I proceed?" without a yes.
- Don't skip `/log-time` calls — each step must be tracked.
- Don't auto-retry a failed `az` command more than once; surface the error and let the user decide.
- Don't close Phase 1 — it stays open so the user can continue adding work to it via the normal kit process.
