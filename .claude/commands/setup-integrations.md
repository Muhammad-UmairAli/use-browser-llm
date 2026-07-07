---
description: Walk the integration wizard interactively via chat (Claude asks each question, then performs the action you choose)
argument-hint: ""
---

# /setup-integrations

This wizard configures your project in 9 steps and only needs to run once, though you can re-run it anytime to change your answers:

- **1/9 Project name** — names your dashboard header
- **2/9 Branching model** — base flow (main only) or Git Flow (develop + release/_ + hotfix/_)
- **3/9 Cloud provider** — UAT/PROD deployment target (Git Flow only)
- **4/9 CCPM** — parallel task decomposition with Git worktrees
- **5/9 AI plugins** — VoltAgent specialists or Claude Superpowers
- **6/9 Design identity** — pick multiple brand-inspired themes; sets dashboard default and instructs VoltAgent to build a theme picker in your app
- **7/9 Branch protection** — apply GitHub rulesets to main (and develop)
- **8/9 Pre-commit hooks** — activate local commit-time quality checks
- **9/9 WAF provider** — edge protection; Cloudflare drops a full architecture pattern doc into the project

The bash wizard `tools/setup-integrations.sh` is interactive but cannot be run through Claude Code's Bash tool — that tool has no TTY, so `read` calls fail silently and questions auto-default. This slash command runs the wizard conversationally instead: Claude asks each question in chat, then performs the action via Bash.

## Resuming a previous run

Before anything else, read the wizard's per-step state from `DASHBOARD.html`'s `integrations-data` JSON block:

```bash
python3 -c "
import json, re
html = open('DASHBOARD.html', encoding='utf-8').read()
m = re.search(r'<script[^>]*id=\"integrations-data\"[^>]*>(.*?)</script>', html, re.DOTALL)
print(json.dumps(json.loads(m.group(1)), indent=2) if m else '{}')
"
```

If **any** key is already `true`, `"done"`, or `"skipped"`, a previous run got partway. List the completed/skipped steps and ask:

> A previous wizard run already completed these steps: <list>. Continue from the first pending step, or redo everything? (continue / redo)

- **continue** — skip the already-done steps entirely, **including their tracking calls** (`log-time.py` appends a fresh time entry on every run, and duplicates sum in the dashboard). Start from the first pending step.
- **redo** — walk all 9 steps again, tracking calls included (`estimate.py` updates rows in place and `start-task.py` overwrites the timer key, so both are harmless; `log-time.py` appends again, which is correct when the work is genuinely redone).

## Two ways to run it

Ask first:

> Answer each step one at a time, or take the recommended defaults? (guided / defaults)
> Defaults: base flow, CCPM yes, VoltAgent yes, branch protection yes (if a GitHub remote exists), pre-commit yes, WAF none — you'll still pick the project name and a theme.

- **guided** — proceed step by step as written below.
- **defaults** — ask only step 1/9 (project name, mandatory) and the two theme questions from step 6/9, then execute all nine steps in one batch using the defaults above, updating `integrations-data` and running the per-step tracking calls exactly as the steps specify. Report a compact summary at the end. This is the fast path for prototypers; everything remains re-runnable later.

## Starting the wizard

Before asking any questions, run the following so agents spawned during this wizard are attributed to Phase 0 step 26 in the agent log (steps 1–16 are the bootstrap self-test, 17–25 the per-question wizard slots; 26 is the wizard's umbrella slot):

```bash
python3 tools/start-task.py 0 26 "Integration wizard"
```

Then open DASHBOARD.html so the user can follow along as each integration is applied:

```bash
# Windows
start DASHBOARD.html
# macOS
open DASHBOARD.html
# Linux
xdg-open DASHBOARD.html
```

Say:

> Opening your project dashboard — you can follow each integration step here as it's applied. It will track every phase of the project going forward too.

Then proceed with the steps below — one question at a time, wait for the answer, then act.

## Steps

In guided mode, skip cleanly on "no" / "n" / "skip" and never assume defaults; in the defaults fast path, apply the published defaults without re-asking.

### 1/9 Project name (mandatory)

```bash
python3 tools/estimate.py 0 17 0.014 0.014 "Integration Wizard - Project name"
python3 tools/start-task.py 0 17 "Integration Wizard - Project name"
```

Ask: **"What is the name of your project? This will appear in the Project Dashboard header in DASHBOARD.html."**

This question is **mandatory** — do not accept an empty answer. Re-ask until a non-empty name is given.

Once you have the name:

1. Write it to `.claude/project-name`:

```bash
mkdir -p .claude && echo "PROJECT_NAME_HERE" > .claude/project-name
```

2. Update `DASHBOARD.html`'s `project-config` JSON block (sets both `project_name` and `repo_url`):

```bash
python3 - <<'PYEOF'
import json, re, subprocess
name = "PROJECT_NAME_HERE"
try:
    url = subprocess.check_output(['git', 'remote', 'get-url', 'origin'], stderr=subprocess.DEVNULL).decode().strip()
    url = re.sub(r'^git@([^:]+):', r'https://\1/', url)
    if url.endswith('.git'): url = url[:-4]
except Exception:
    url = ''
with open('DASHBOARD.html', encoding='utf-8') as f:
    html = f.read()
m = re.search(r'(<script[^>]*id="project-config"[^>]*>)(.*?)(</script>)', html, re.DOTALL)
if m:
    cfg = json.loads(m.group(2))
    cfg['project_name'] = name
    cfg['repo_url'] = url
    replacement = m.group(1) + '\n' + json.dumps(cfg, indent=2) + '\n' + m.group(3)
    html = html[:m.start()] + replacement + html[m.end():]
    with open('DASHBOARD.html', 'w', encoding='utf-8') as f:
        f.write(html)
PYEOF
```

(Replace `PROJECT_NAME_HERE` with the actual name the user gave. `repo_url` is detected automatically from `git remote get-url origin` and normalised to an HTTPS URL; it's written as an empty string if no remote exists yet.)

Tell the user: "Project name saved — it will appear in the DASHBOARD.html header."

```bash
python3 tools/log-time.py 0 17 0 "Integration Wizard - Project name"
```

### 2/9 Branching model

```bash
python3 tools/estimate.py 0 18 0.008 0.008 "Integration Wizard - Branching model"
python3 tools/start-task.py 0 18 "Integration Wizard - Branching model"
```

Ask: **"Use Git Flow (develop, release/_, hotfix/_) or stick with the base flow (single `main`)? Git Flow is recommended for projects with deployable UAT/PROD environments. (gitflow / base / skip)"**

If `gitflow`:

- If `develop` branch doesn't exist locally: `git checkout -b develop`, push if remote exists.
- Note Git Flow status; gates step 3/8.

After done or skip, update `DASHBOARD.html`:

```bash
python3 - <<'PYEOF'
import json, re
with open('DASHBOARD.html', encoding='utf-8') as f: html = f.read()
m = re.search(r'(<script[^>]*id="integrations-data"[^>]*>)(.*?)(</script>)', html, re.DOTALL)
if m:
    d = json.loads(m.group(2)); d['git_flow'] = True
    html = html[:m.start()] + m.group(1) + '\n' + json.dumps(d, indent=2) + '\n' + m.group(3) + html[m.end():]
    with open('DASHBOARD.html', 'w', encoding='utf-8') as f: f.write(html)
PYEOF
```

Replace `True` with `'skipped'` if the user chose base or skip.

```bash
python3 tools/log-time.py 0 18 0 "Integration Wizard - Branching model"
```

### 3/9 Cloud provider (only if Git Flow chosen)

```bash
python3 tools/estimate.py 0 19 0.006 0.006 "Integration Wizard - Cloud provider"
python3 tools/start-task.py 0 19 "Integration Wizard - Cloud provider"
```

Ask: **"Which cloud will host UAT and PROD? (azure / aws / gcp / other / none)"**

For any non-`none`: `mkdir -p .github/workflows` and write a `.github/workflows/README.md` placeholder noting the trigger structure (push to `release/*` → UAT, push to `main` → PROD) and that the adopter fills in the cloud-specific YAML.

This step shares the `git_flow` integration key — no separate dashboard update needed.

```bash
python3 tools/log-time.py 0 19 0 "Integration Wizard - Cloud provider"
```

### 4/9 CCPM (decomposition + parallel execution)

```bash
python3 tools/estimate.py 0 20 0.011 0.011 "Integration Wizard - CCPM"
python3 tools/start-task.py 0 20 "Integration Wizard - CCPM"
```

Ask: **"Install CCPM (PRD → Epic → Task with Git worktrees for parallel agent execution)? (y/n)"**

If yes, attempt:

```bash
git clone https://github.com/automazeio/ccpm .claude/ccpm
```

**If the clone is blocked by a security or permission prompt, do NOT auto-continue.** Stop and say:

> The `git clone` for CCPM was blocked. You can either:
>
> 1. Run it yourself in a terminal: `git clone https://github.com/automazeio/ccpm .claude/ccpm`
> 2. Skip this integration for now.
>
> What would you like to do? (run / skip)

Wait for their answer. Only mark done if the user confirms they ran it; mark skipped if they chose skip.

After done or skip, update `DASHBOARD.html`:

```bash
python3 - <<'PYEOF'
import json, re
with open('DASHBOARD.html', encoding='utf-8') as f: html = f.read()
m = re.search(r'(<script[^>]*id="integrations-data"[^>]*>)(.*?)(</script>)', html, re.DOTALL)
if m:
    d = json.loads(m.group(2)); d['ccpm'] = True
    html = html[:m.start()] + m.group(1) + '\n' + json.dumps(d, indent=2) + '\n' + m.group(3) + html[m.end():]
    with open('DASHBOARD.html', 'w', encoding='utf-8') as f: f.write(html)
PYEOF
```

Replace `True` with `'skipped'` if the user skipped.

If done: tell the user to follow CCPM's README for slash-command registration.

```bash
python3 tools/log-time.py 0 20 0 "Integration Wizard - CCPM"
```

### 5/9 AI plugins (specialist personas & skills)

```bash
python3 tools/estimate.py 0 21 0.020 0.020 "Integration Wizard - AI plugins"
python3 tools/start-task.py 0 21 "Integration Wizard - AI plugins"
```

Ask: \*\*"Which AI plugins would you like to install?

- **voltagent** — 130+ specialists (code-reviewer, security-auditor, debugger, language-pros, etc.)
- **superpowers** — skills framework: TDD, debugging, brainstorming, code-review agent

(voltagent / superpowers / skip)"\*\*

#### If voltagent

First attempt adding the marketplace source:

```bash
claude plugin marketplace add VoltAgent/awesome-claude-code-subagents
```

**If this is blocked**, stop and say:

> The `claude plugin marketplace add` command was blocked. You can either:
>
> 1. Run it yourself: `claude plugin marketplace add VoltAgent/awesome-claude-code-subagents`
> 2. Skip VoltAgent for now.
>
> What would you like to do? (run / skip)

If proceeding, install all four plugin groups:

```bash
claude plugin install voltagent-core-dev
claude plugin install voltagent-lang
claude plugin install voltagent-qa-sec
claude plugin install voltagent-meta
```

**If any install is blocked**, apply the same pause-and-ask pattern for that group, then continue with the remaining groups.

Update `DASHBOARD.html`:

```bash
python3 - <<'PYEOF'
import json, re
with open('DASHBOARD.html', encoding='utf-8') as f: html = f.read()
m = re.search(r'(<script[^>]*id="integrations-data"[^>]*>)(.*?)(</script>)', html, re.DOTALL)
if m:
    d = json.loads(m.group(2)); d['voltagent'] = True; d['superpowers'] = 'skipped'
    html = html[:m.start()] + m.group(1) + '\n' + json.dumps(d, indent=2) + '\n' + m.group(3) + html[m.end():]
    with open('DASHBOARD.html', 'w', encoding='utf-8') as f: f.write(html)
PYEOF
```

(Sets `superpowers` to `'skipped'` too — both keys are in the dashboard's wizard-completion check, so leaving the unchosen one at its unset default would strand the onboarding banner on "In Progress" forever.)

#### If superpowers

```bash
claude plugin install superpowers@claude-plugins-official
```

**If this is blocked**, stop and say:

> The `claude plugin install` command was blocked. You can either:
>
> 1. Run it yourself: `claude plugin install superpowers@claude-plugins-official`
> 2. Skip Superpowers for now.
>
> What would you like to do? (run / skip)

Update `DASHBOARD.html`:

```bash
python3 - <<'PYEOF'
import json, re
with open('DASHBOARD.html', encoding='utf-8') as f: html = f.read()
m = re.search(r'(<script[^>]*id="integrations-data"[^>]*>)(.*?)(</script>)', html, re.DOTALL)
if m:
    d = json.loads(m.group(2)); d['superpowers'] = True; d['voltagent'] = 'skipped'
    html = html[:m.start()] + m.group(1) + '\n' + json.dumps(d, indent=2) + '\n' + m.group(3) + html[m.end():]
    with open('DASHBOARD.html', 'w', encoding='utf-8') as f: f.write(html)
PYEOF
```

(Sets `voltagent` to `'skipped'` too, for the same reason as the mirrored block above.)

#### If skip

```bash
python3 - <<'PYEOF'
import json, re
with open('DASHBOARD.html', encoding='utf-8') as f: html = f.read()
m = re.search(r'(<script[^>]*id="integrations-data"[^>]*>)(.*?)(</script>)', html, re.DOTALL)
if m:
    d = json.loads(m.group(2)); d['voltagent'] = 'skipped'; d['superpowers'] = 'skipped'
    html = html[:m.start()] + m.group(1) + '\n' + json.dumps(d, indent=2) + '\n' + m.group(3) + html[m.end():]
    with open('DASHBOARD.html', 'w', encoding='utf-8') as f: f.write(html)
PYEOF
```

```bash
python3 tools/log-time.py 0 21 0 "Integration Wizard - AI plugins"
```

### 6/9 Design identity (multi-theme picker)

```bash
python3 tools/estimate.py 0 22 0.004 0.004 "Integration Wizard - Design identity"
python3 tools/start-task.py 0 22 "Integration Wizard - Design identity"
```

Ask: **"Set a visual design identity for this project? The kit ships 74 brand-inspired themes — you can select multiple dark and light themes. They'll set your dashboard default and instruct VoltAgent to build a theme picker in your app. (y/n)"**

If no/skip → mark `getdesign: 'skipped'`, update `DASHBOARD.html`, and continue.

If yes, display the dark themes list, ask which dark themes the user wants, then display the light themes list and ask which light themes they want.

**Display dark themes:**

```
Dark themes:
 1. Binance        (slug: binance,       accent #fcd535)
 2. BMW M          (slug: bmw-m,         accent #1c69d4)
 3. Bugatti        (slug: bugatti,       accent #ffffff)
 4. ClickHouse     (slug: clickhouse,    accent #faff69)
 5. Composio       (slug: composio,      accent #0007cd)
 6. Ferrari        (slug: ferrari,       accent #da291c)
 7. Framer         (slug: [empty],       accent #0099ff)
 8. HashiCorp      (slug: hashicorp,     accent #2b89ff)
 9. Intrust IT     (slug: intrust-it-dark, accent #f68326)
10. Lamborghini    (slug: lamborghini,   accent #ffc000)
11. Linear         (slug: linear,        accent #5e6ad2)
12. PlayStation    (slug: playstation,   accent #0070d1)
13. Raycast        (slug: raycast,       accent #ff6161)
14. Resend         (slug: resend,        accent #fcfdff)
15. Revolut        (slug: revolut,       accent #494fdf)
16. Runway ML      (slug: runwayml,      accent #ffffff)
17. Sanity         (slug: sanity,        accent #f36458)
18. Sentry         (slug: sentry,        accent #c2ef4e)
19. Shopify        (slug: shopify,       accent #c1fbd4)
20. SpaceX         (slug: spacex,        accent #ffffff)
21. Spotify        (slug: spotify,       accent #1ed760)
22. The Verge      (slug: theverge,      accent #3cffd0)
23. VoltAgent      (slug: voltagent,     accent #00d992)
24. Warp           (slug: warp,          accent #faf9f6)
25. xAI            (slug: xai,           accent #ffffff)
```

Ask: **"Which dark themes do you want? Enter numbers comma-separated (e.g. `3,7`) or `none`:"**

Validate each number is 1–25. Accept `none` as a valid answer. Store matched dark entries.

**Display light themes:**

```
Light themes:
 1. Airbnb         (slug: airbnb,        accent #ff385c)
 2. Airtable       (slug: airtable,      accent #181d26)
 3. Apple          (slug: apple,         accent #0066cc)
 4. BMW            (slug: bmw,           accent #1c69d4)
 5. Cal.com        (slug: cal,           accent #111111)
 6. Claude         (slug: claude,        accent #cc785c)
 7. Clay           (slug: clay,          accent #0a0a0a)
 8. Cohere         (slug: cohere,        accent #17171c)
 9. Coinbase       (slug: coinbase,      accent #0052ff)
10. Cursor         (slug: cursor,        accent #f54e00)
11. ElevenLabs     (slug: elevenlabs,    accent #292524)
12. Expo           (slug: expo,          accent #000000)
13. Figma          (slug: figma,         accent #000000)
14. IBM            (slug: ibm,           accent #0f62fe)
15. Intercom       (slug: intercom,      accent #ff5600)
16. Intrust IT     (slug: intrust-it,    accent #f68326)
17. Kraken         (slug: kraken,        accent #7132f5)
18. Light          (slug: light,         accent #0969da)
19. Lovable        (slug: lovable,       accent #1c1c1c)
20. Mastercard     (slug: mastercard,    accent #141413)
21. Meta           (slug: meta,          accent #0064e0)
22. MiniMax        (slug: minimax,       accent #0a0a0a)
23. Mintlify       (slug: mintlify,      accent #00d4a4)
24. Miro           (slug: miro,          accent #ffd02f)
25. Mistral AI     (slug: mistral,       accent #fa520f)
26. MongoDB        (slug: mongodb,       accent #00ed64)
27. Nike           (slug: nike,          accent #111111)
28. Notion         (slug: notion,        accent #5645d4)
29. NVIDIA         (slug: nvidia,        accent #76b900)
30. Ollama         (slug: ollama,        accent #000000)
31. OpenCode AI    (slug: opencode,      accent #007aff)
32. Pinterest      (slug: pinterest,     accent #e60023)
33. PostHog        (slug: posthog,       accent #f7a501)
34. Renault        (slug: renault,       accent #ffed00)
35. Replicate      (slug: replicate,     accent #ea2804)
36. Slack          (slug: slack,         accent #4a154b)
37. Starbucks      (slug: starbucks,     accent #00754a)
38. Stripe         (slug: stripe,        accent #533afd)
39. Superhuman     (slug: superhuman,    accent #1b1938)
40. Supabase       (slug: supabase,      accent #3ecf8e)
41. Tesla          (slug: tesla,         accent #3e6ae1)
42. Together AI    (slug: together,      accent #ef2cc1)
43. Uber           (slug: uber,          accent #000000)
44. Vercel         (slug: vercel,        accent #0072f5)
45. Vodafone       (slug: vodafone,      accent #e60000)
46. Webflow        (slug: webflow,       accent #146ef5)
47. WIRED          (slug: wired,         accent #057dbc)
48. Wise           (slug: wise,          accent #9fe870)
49. Zapier         (slug: zapier,        accent #ff4f00)
```

Ask: **"Which light themes do you want? Enter numbers comma-separated (e.g. `1,5,18`) or `none`:"**

Validate each number is 1–49.

**Validation:** if both dark and light answers are `none`, say: "You must select at least one theme. Let's try again." and repeat both questions.

Resolve each number to its name, slug, canvas, and accent from the lists above. Note: Framer's slug is the empty string `""` — write it as an empty string in JSON, not the word "empty".

Collect all selected themes: dark selections first, then light. The first theme in the combined list is the **default theme** — it will be applied automatically when the dashboard is opened for the first time.

**Write `docs/DESIGN.md`** (replace if it exists):

```
---
version: kit-theme
---

## Selected themes

| Theme | Canvas | Accent | Slug |
|-------|--------|--------|------|
| <name> | <dark/light> | <accent> | <slug or "(framer default)" for empty slug> |
...one row per selected theme...

Full CSS variable definitions live in `DASHBOARD.html` under `body[data-theme="<slug>"]`
blocks (or `:root` for Framer). Copy those blocks into your app's stylesheet when
implementing the theme picker.

## Theme picker mandate

All frontend UI **must** include a theme picker that lets users switch between the themes
listed above at runtime. Apply a theme by setting `data-theme="<slug>"` on the root element
(`<html>` or `<body>`; Framer uses no attribute — it is the CSS `:root` default).
The default theme on first load should be **<first-selected-theme-name>**.
```

**Update `DASHBOARD.html` `project-config`** — write `selected_themes` (array of slugs in selection order) and `default_theme` (first slug, or `""` for Framer):

```bash
python3 - <<'PYEOF'
import json, re
SELECTED_THEMES = ["SLUG1", "SLUG2"]   # replace with resolved slugs
DEFAULT_THEME   = "SLUG1"              # replace with first slug ("" for Framer)
with open('DASHBOARD.html', encoding='utf-8') as f: html = f.read()
m = re.search(r'(<script[^>]*id="project-config"[^>]*>)(.*?)(</script>)', html, re.DOTALL)
if m:
    cfg = json.loads(m.group(2))
    cfg['selected_themes'] = SELECTED_THEMES
    cfg['default_theme']   = DEFAULT_THEME
    html = html[:m.start()] + m.group(1) + '\n' + json.dumps(cfg, indent=2) + '\n' + m.group(3) + html[m.end():]
    with open('DASHBOARD.html', 'w', encoding='utf-8') as f: f.write(html)
PYEOF
```

**Update `CLAUDE.md`'s `## Branding & visual identity` section** — replace its content idempotently (safe to re-run):

```bash
python3 - <<'PYEOF'
import re
THEME_ROWS = "| Spotify | dark | #1ed760 |\n| Stripe | light | #533afd |"   # replace with actual rows
DEFAULT_NAME = "Spotify"                                                      # replace with first theme's name
NEW_SECTION = """## Branding & visual identity

This project uses the following design themes (full CSS variable specs in `DASHBOARD.html`
and documented in `docs/DESIGN.md`):

| Theme | Canvas | Accent |
|-------|--------|--------|
""" + THEME_ROWS + """

**Theme picker requirement:** All frontend UI must include a theme picker that lets users
switch between these themes at runtime. Apply themes by toggling `data-theme="<slug>"` on
the root element. The default theme on first load is **""" + DEFAULT_NAME + """**.
VoltAgent should generate a framework-appropriate theme picker component using these themes.
"""
with open('CLAUDE.md', encoding='utf-8') as f: text = f.read()
pattern = re.compile(r'## Branding & visual identity\b.*?(?=\n## |\Z)', re.DOTALL)
if pattern.search(text):
    text = pattern.sub(NEW_SECTION.rstrip(), text)
else:
    text = text.rstrip() + '\n\n' + NEW_SECTION
with open('CLAUDE.md', 'w', encoding='utf-8') as f: f.write(text)
PYEOF
```

Add a row to `SPLIT-PLAN §4 (cross-cutting concepts)` pointing at `docs/DESIGN.md`:

```
| `docs/DESIGN.md` | Visual identity — <theme names>, theme picker mandate for VoltAgent |
```

After done or skip, update `DASHBOARD.html` integrations status:

```bash
python3 - <<'PYEOF'
import json, re
with open('DASHBOARD.html', encoding='utf-8') as f: html = f.read()
m = re.search(r'(<script[^>]*id="integrations-data"[^>]*>)(.*?)(</script>)', html, re.DOTALL)
if m:
    d = json.loads(m.group(2)); d['getdesign'] = True
    html = html[:m.start()] + m.group(1) + '\n' + json.dumps(d, indent=2) + '\n' + m.group(3) + html[m.end():]
    with open('DASHBOARD.html', 'w', encoding='utf-8') as f: f.write(html)
PYEOF
```

Replace `True` with `'skipped'` if the user skipped.

```bash
python3 tools/log-time.py 0 22 0 "Integration Wizard - Design identity"
```

### 7/9 Branch protection rulesets

```bash
python3 tools/estimate.py 0 23 0.050 0.050 "Integration Wizard - Branch protection"
python3 tools/start-task.py 0 23 "Integration Wizard - Branch protection"
```

Run `git remote get-url origin` to get the remote URL. Parse `<owner>/<repo>` from it: strip a leading `https://github.com/`, a leading `git@github.com:`, and a trailing `.git` if present.

**If no remote is configured**, ask:

> No git remote found. Would you like to create a GitHub repository and add it as your remote? (y/n)

If yes:

- Ask: **"Enter the repository name (e.g., `acme/my-project` or `https://github.com/acme/my-project`):"**
- Parse `<owner>/<repo>` from the answer: strip `https://github.com/` prefix and `.git` suffix if present.
- Ask: **"Public or private? (public / private)"**
- Confirm: **"Create `<owner>/<repo>` as a <visibility> repo and push to it? (y/n)"**
- If confirmed, run:
  ```bash
  gh repo create <owner>/<repo> --<public|private> --source=. --remote=origin --push
  ```
- If `gh` is not authenticated, say: "Run `gh auth login` first, then re-run `/setup-integrations`."

If the user says no to creating a remote, skip branch protection (mark skipped) and continue to 8/9.

**If remote exists** and `gh` is authenticated:

- Ask: **"Apply main branch-protection ruleset to `<owner>/<repo>`? (y/n)"**
  - If yes: `gh api -X POST /repos/<owner>/<repo>/rulesets -H "Accept: application/vnd.github+json" --input .github/rulesets/main.json`
- If Git Flow was chosen, also ask about develop ruleset; same pattern with `develop.json`.

After done or skip, update `DASHBOARD.html`:

```bash
python3 - <<'PYEOF'
import json, re
with open('DASHBOARD.html', encoding='utf-8') as f: html = f.read()
m = re.search(r'(<script[^>]*id="integrations-data"[^>]*>)(.*?)(</script>)', html, re.DOTALL)
if m:
    d = json.loads(m.group(2)); d['branch_protection'] = True
    html = html[:m.start()] + m.group(1) + '\n' + json.dumps(d, indent=2) + '\n' + m.group(3) + html[m.end():]
    with open('DASHBOARD.html', 'w', encoding='utf-8') as f: f.write(html)
PYEOF
```

Replace `True` with `'skipped'` if the user skipped.

```bash
python3 tools/log-time.py 0 23 0 "Integration Wizard - Branch protection"
```

### 8/9 Local commit-time hooks (pre-commit)

```bash
python3 tools/estimate.py 0 24 0.017 0.017 "Integration Wizard - Pre-commit hooks"
python3 tools/start-task.py 0 24 "Integration Wizard - Pre-commit hooks"
```

Ask: **"Install pre-commit and activate hooks now? (y/n)"**

If yes: try `uv tool install pre-commit` first; fall back to `pip install pre-commit` if uv is not on PATH. Then run `pre-commit install`. Verify `.git/hooks/pre-commit` exists after.

After done or skip, update `DASHBOARD.html`:

```bash
python3 - <<'PYEOF'
import json, re
with open('DASHBOARD.html', encoding='utf-8') as f: html = f.read()
m = re.search(r'(<script[^>]*id="integrations-data"[^>]*>)(.*?)(</script>)', html, re.DOTALL)
if m:
    d = json.loads(m.group(2)); d['pre_commit'] = True
    html = html[:m.start()] + m.group(1) + '\n' + json.dumps(d, indent=2) + '\n' + m.group(3) + html[m.end():]
    with open('DASHBOARD.html', 'w', encoding='utf-8') as f: f.write(html)
PYEOF
```

Replace `True` with `'skipped'` if the user skipped.

```bash
python3 tools/log-time.py 0 24 0 "Integration Wizard - Pre-commit hooks"
```

### 9/9 WAF provider

```bash
python3 tools/estimate.py 0 25 0.006 0.006 "Integration Wizard - WAF provider"
python3 tools/start-task.py 0 25 "Integration Wizard - WAF provider"
```

Ask: **"Which WAF will protect this app? (cloudflare / azure / aws / none)"**

- **cloudflare** — copy the full Cloudflare-Tunnel pattern into the project:
  ```bash
  mkdir -p docs/waf && cp .kit/waf/cloudflare-tunnel-aca-pattern.md docs/waf/cloudflare-tunnel-aca-pattern.md
  ```
  (The doc was staged into `.kit/waf/` at init. If it's missing, tell the user to re-run `init-project.sh`.) Then tell the user to record the choice as a decision in `docs/architecture-design-decisions.md` and reference it from SPLIT-PLAN §3 (architecture overview).
- **azure / aws** — `mkdir -p docs/waf` and write a short `docs/waf/README.md` placeholder naming the chosen WAF (mirrors the cloud-provider `.github/workflows/README.md` stub): note the ruleset, origin-protection, TLS, secrets, and observability TODOs, and point at `docs/architecture-design-decisions.md`.
- **none** — write nothing.

After acting, update `DASHBOARD.html` (`waf` is `True` for any chosen WAF, `'skipped'` for none):

```bash
python3 - <<'PYEOF'
import json, re
WAF = "none"  # replace with the user's answer
with open('DASHBOARD.html', encoding='utf-8') as f: html = f.read()
m = re.search(r'(<script[^>]*id="integrations-data"[^>]*>)(.*?)(</script>)', html, re.DOTALL)
if m:
    d = json.loads(m.group(2)); d['waf'] = ('skipped' if WAF == 'none' else True)
    html = html[:m.start()] + m.group(1) + '\n' + json.dumps(d, indent=2) + '\n' + m.group(3) + html[m.end():]
    with open('DASHBOARD.html', 'w', encoding='utf-8') as f: f.write(html)
PYEOF
```

```bash
python3 tools/log-time.py 0 25 0 "Integration Wizard - WAF provider"
```

## On completion

Write the wizard-run marker file so `/whats-next` knows the wizard has been offered:

```bash
mkdir -p .claude
date -u +"%Y-%m-%dT%H:%M:%SZ" > .claude/.integrations-wizard-run
```

Log the wizard time (step 26 — the umbrella slot claimed by start-task at the top of the wizard):

```
/log-time 0 26 <hours> "Integration wizard"
```

Then open DASHBOARD.html so the user can see the integration status:

```bash
# Windows
start DASHBOARD.html
# macOS
open DASHBOARD.html
# Linux
xdg-open DASHBOARD.html
```

Say:

> Integration wizard complete. DASHBOARD.html is now open — the onboarding checklist shows which integrations are active (✓), which were skipped (–), and which are still pending (○).
>
> Re-run `/whats-next` anytime to see the current state.

## What you must not do

- Don't auto-default questions the user didn't answer (in guided mode). If they say "skip" or are ambiguous, treat it as skip and move on. The defaults fast path is the one exception — the user opted into the published defaults up front.
- Don't run all the wizard's steps in a batch in guided mode — ask, wait, act, then move to the next question. The user might want to stop midway.
- Don't write the wizard marker unless every step was walked through (guided) or executed from the defaults (fast path). If they abort mid-wizard, the wizard is incomplete and `/whats-next` should still show remaining steps — the Resuming section picks up from the `integrations-data` state next time.
- Don't re-run tracking calls for steps skipped during a resume — duplicated time entries sum in the dashboard.
- Don't auto-continue past a blocked Bash command — pause and offer run-yourself or skip.
