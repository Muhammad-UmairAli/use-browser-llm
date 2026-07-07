# 06 — Git Flow and environment promotion

The kit's default branching model for projects with deployable environments is [Git Flow](https://nvie.com/posts/a-successful-git-branching-model/) — a long-lived `develop` branch where features integrate, plus short-lived `release/*` and `hotfix/*` branches that promote code from environment to environment. Each branch type has a defined target environment, and merging a branch is what triggers a deploy.

For simple projects without deployable environments (libraries, internal tools without CI/CD, single-dev prototypes) the basic flow in `methodology/03-github-workflow.md` is enough — Git Flow's overhead only pays for itself once you have a release cadence distinct from feature merges. Adopt consciously.

## Branch types

| Branch                 | Lifetime       | Cuts from                  | Merges into                                                       | Target environment        |
| ---------------------- | -------------- | -------------------------- | ----------------------------------------------------------------- | ------------------------- |
| `main`                 | Permanent      | n/a — production-of-record | only via `release/*` or `hotfix/*` PR                             | **PROD**                  |
| `develop`              | Permanent      | `main` at project start    | only via `feature/*` PR or back-merge from `release/*`/`hotfix/*` | (none — integration only) |
| `feature/<short-name>` | Until merge    | `develop`                  | `develop` via PR                                                  | (none — local dev)        |
| `release/<X.Y.Z>`      | Until released | `develop`                  | `main` (PR) **and** `develop` (back-merge)                        | **UAT** (auto on push)    |
| `hotfix/<X.Y.Z>`       | Until fixed    | `main`                     | `main` (PR) **and** `develop` (back-merge)                        | **UAT** (auto on push)    |

`main` and `develop` are both permanently protected. Feature, release, and hotfix branches are short-lived and unprotected — their target merge is what enforces review and CI.

## The promotion path — normal release

```
feature/customer-portal-billing
              │  PR + merge
              ▼
   ╔═══════════════════════╗
   ║       develop         ║
   ╚═══════════════════════╝
              │  when ready: cut release/X.Y.Z from develop
              ▼
release/1.4.0  ── push ──▶  CI deploys to UAT
              │  smoke test on UAT; bug-fix commits land directly on the
              │  release branch (PRs into release/* still required).
              │  when UAT signs off:
              │  PR release/1.4.0 → main, merge, tag v1.4.0
              ▼
   ╔═══════════════════════╗
   ║         main          ║  ── push ──▶  CI deploys to PROD
   ╚═══════════════════════╝
              │  back-merge release/1.4.0 → develop so post-release fixes
              │  on the release branch are not lost.
              ▼
   ╔═══════════════════════╗
   ║       develop         ║
   ╚═══════════════════════╝
```

## The promotion path — hotfix

A bug surfaces in PROD. Cut the hotfix from `main` (not `develop`) so the fix doesn't drag in unreleased work:

```
   ╔═══════════════════════╗
   ║         main          ║  v1.4.0
   ╚═══════════════════════╝
              │  cut hotfix/1.4.1
              ▼
hotfix/1.4.1  ── push ──▶  CI deploys to UAT
              │  smoke test the fix in isolation.
              │  when verified:
              │  PR hotfix/1.4.1 → main, merge, tag v1.4.1
              ▼
   ╔═══════════════════════╗
   ║         main          ║  v1.4.1  ── push ──▶  CI deploys to PROD
   ╚═══════════════════════╝
              │  back-merge hotfix/1.4.1 → develop so develop gets the fix
              │  before the next normal release.
              ▼
   ╔═══════════════════════╗
   ║       develop         ║
   ╚═══════════════════════╝
```

The hotfix path bypasses `develop` deliberately — that's what makes a hotfix "hot." Develop may contain in-flight features that aren't ready to ship; the hotfix would be blocked behind them if it had to go through develop first.

## Environment mapping

| Environment   | Receives                                              | Triggered by                                                                                                                                   |
| ------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **Local dev** | Any branch the developer has checked out locally      | Manual. The project documents how to run locally — Postgres / Docker Compose / a dev-pointed cloud resource group / etc. Not CI-driven.        |
| **UAT**       | Latest commit on any `release/*` or `hotfix/*` branch | Push or merge to a `release/*` or `hotfix/*` branch fires the deploy-to-UAT workflow. UAT mirrors PROD's topology but uses isolated resources. |
| **PROD**      | Latest commit on `main`                               | Merge to `main` (which only happens via `release/*` or `hotfix/*` PR) fires the deploy-to-PROD workflow. Tag creation is part of the merge.    |

What the kit does NOT prescribe: the specific CI workflow YAML, the cloud-specific commands (Azure / AWS / GCP / on-prem), the rollback procedure, or the resource-group naming. Those are stack-specific. The methodology defines the _shape_; the adopter wires the deploy.

## Versioning and tagging

- Versions follow [SemVer](https://semver.org/): `vMAJOR.MINOR.PATCH`.
- A release branch is named `release/<next-version>` — e.g. `release/1.4.0`. The version is decided when the branch is cut, not after the fact.
- A tag `vX.Y.Z` is created on `main` at the merge of `release/X.Y.Z` or `hotfix/X.Y.Z`. Tag creation can be manual (`git tag -a vX.Y.Z -m "..." && git push origin vX.Y.Z`) or automated via CI on merge.
- Hotfixes increment **PATCH** only. Normal releases choose MINOR or MAJOR per SemVer rules.
- Maintain a `CHANGELOG.md` (Keep-a-Changelog style or Conventional-Commits-driven) — the kit doesn't prescribe a format but does require _some_ human-readable record of what shipped per tag.

## Branch protection — protect both `main` and `develop`

The kit ships two rulesets:

- `templates/.github/rulesets/main.json` — protects `main`. Allowed merge method: `merge` only (preserves the release-branch / hotfix-branch identity in history).
- `templates/.github/rulesets/develop.json` — protects `develop`. Allowed merge method: `merge` only, same as `main` — `methodology/03-github-workflow.md` mandates merge commits everywhere (squash breaks per-branch commit identity, which the release back-merge paths rely on).

Both rulesets reject direct commits, deletion, and non-fast-forward (force) pushes. Apply both at adoption time:

```bash
gh api -X POST /repos/<owner>/<repo>/rulesets \
  -H "Accept: application/vnd.github+json" \
  --input .github/rulesets/main.json
gh api -X POST /repos/<owner>/<repo>/rulesets \
  -H "Accept: application/vnd.github+json" \
  --input .github/rulesets/develop.json
```

The kit's PreToolUse hook `templates/.claude/hooks/block-commit-to-main.sh` is defense-in-depth: it refuses direct commits to `main`, `master`, **and** `develop` regardless of mode.

## Implementing this with your CI

The kit doesn't ship CI workflow YAML — every cloud is different — but the trigger structure is consistent across stacks. Wire your CI of choice to:

| Trigger                                       | Action                                                                     |
| --------------------------------------------- | -------------------------------------------------------------------------- |
| `push` or `pull_request` merge to `release/*` | Build artifact, deploy to UAT, run smoke checks                            |
| `push` or `pull_request` merge to `hotfix/*`  | Build artifact, deploy to UAT, run smoke checks                            |
| `push` to `main`                              | Build artifact, deploy to PROD, create `vX.Y.Z` tag if not already present |
| `push` to `develop`                           | Run tests + lint only — no deploy                                          |
| `pull_request` (any target)                   | Run tests + lint                                                           |

For Azure: a `.github/workflows/deploy-uat.yml` and `deploy-prod.yml` pair is conventional, using `az containerapp update --image` or `az deployment group create`. For AWS: equivalents using ECS/EKS/ECR. For other stacks: the same trigger structure with different deploy commands. None of that is in the kit — it's adopter-specific.

## Composition with the rest of the methodology

- **Phase boundaries align with branch type.** A phase that completes a release becomes a `release/*` branch; a phase that fixes a PROD bug becomes a `hotfix/*` branch; everything else is a `feature/*` branch on `develop`.
- **Issues and PRs still link 1:1** via the `Closes #N` invariant in `methodology/03-github-workflow.md`. The PR's _target branch_ is what changes — not the consistency invariants.
- **The autonomous loop** (`/work-the-phase`) reads the phase's intent to choose the target branch. Flags `--release X.Y.Z` and `--hotfix X.Y.Z` select the appropriate branch type and merge target. See `templates/.claude/commands/work-the-phase.md`.
- **`SPLIT-PLAN §5 (progress log)` rows** for release/hotfix phases include the version number and the production-deploy outcome (e.g. "released as v1.4.0; UAT smoke checks passed; PROD deploy clean").
- **Self-healing docs** still apply to release-prep docs and the CHANGELOG.
- **Self-healing deployment** is especially relevant during release-branch UAT smoke testing — when an `az deployment group create` fails, the same monitor-and-troubleshoot loop applies, with fixes landing on the release branch and re-deploying.

## Anti-patterns to avoid

- **Cutting a hotfix from `develop`.** Defeats the purpose; the hotfix now drags in unreleased work. Cut from `main`.
- **Skipping the back-merge after release or hotfix.** The fix lives on `main` but not `develop`; the next normal release re-introduces the bug. Always back-merge.
- **Long-lived release branches.** A release branch should live days, not weeks. If UAT keeps surfacing issues, that's a signal to delay the cut, not to camp on the release branch.
- **Direct commits to `develop` for "small" changes.** The branch protection rejects them. The hook rejects them. The methodology rejects them. There are no exceptions.
- **Tagging before merging to `main`.** The tag is created _at_ the merge, never before. Pre-tagging risks the merge being amended.

## When you might choose a different model

Git Flow is heavyweight. Two simpler alternatives that map to the same environment promotion idea:

- **Trunk-based development with deployment branches.** A single `main` is the integration point; release happens by promoting the `main` HEAD to a `production` (or environment-named) branch that's auto-deployed. Cleaner if the team can keep `main` always-shippable.
- **Release tags only (no release branches).** Cut tags directly off `main` when ready; CI deploys on tag creation. Skip the release branch entirely. Fine for projects where stabilization happens via feature flags rather than a stabilization branch.

The kit's templates default to Git Flow because it handles the hotfix case explicitly, which the simpler models often leave underspecified. Adopters who prefer trunk-based or tag-only flows should document the variance in their `CLAUDE.md` and override the relevant templates.
