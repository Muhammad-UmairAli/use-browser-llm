# 04 — Code quality and gates

Three layers of enforcement: platform-level branch protection (can't be bypassed), permission-level autonomy gates (see `methodology/12-autonomy-and-approvals.md`), and convention-level engineering hygiene (the AI follows in every phase).

## Platform-level branch protection

The kit ships `templates/.github/rulesets/main.json` with a starter ruleset that, when applied to your repo, makes direct pushes to `main` impossible regardless of who attempts them. Changes can only land via a merged PR.

Apply via the GitHub API:

```bash
gh api -X POST /repos/<owner>/<repo>/rulesets \
  -H "Accept: application/vnd.github+json" \
  --input .github/rulesets/main.json
```

The starter ruleset includes:

- `pull_request` rule — PRs required for any change to `main`.
- `deletion` rule — `main` cannot be deleted.
- `non_fast_forward` rule — force-pushes to `main` rejected.
- `bypass_actors: []` — no one bypasses, including admins.

When CI is wired up, add a `required_status_checks` rule so passing CI is required before merge. Pin the ruleset's live `id` (returned on creation) in `.github/rulesets/README.md` so future updates can target it without listing.

## Sanity checks before claiming a phase done

For any edit involving generators, secret names, or cross-doc consistency, run greps and report the counts. The standard set:

```bash
# Did the bad thing get removed (in executable lines)?
grep -n "<bad pattern>" <file>

# Did the right thing replace it?
grep -nc "<good pattern>" <file>

# Did anything that should be unchanged stay unchanged?
grep -c "<load-bearing string>" <file>   # compare to baseline

# Defense in depth — things that should always be 0
grep -c "<forbidden pattern>" <file>
```

Report the actual counts, not "looks good."

## Audit before edit

When asked to change something, **read first**. Surface what you found, decide whether the edit is still needed, and only then make it. Don't edit blind. The 30 seconds you spend reading saves the hours you'd spend chasing a silent regression.

## Files NOT touched — declare it

When you finish a phase, list the files that were **deliberately not touched**, even ones the casual reader might expect were edited. Include this in the `SPLIT-PLAN §5 (progress log)` row. It's how a future reviewer confirms scope discipline.

## When the prompt and the sanity check conflict

If a prompt's literal text contains a string that a sanity check is meant to flag, follow the prompt's specification, note the tension in the `SPLIT-PLAN §5 (progress log)` row, and suggest a reconciliation path. Don't silently change either side to make the check pass.

## Cross-doc consistency walks

`SPLIT-PLAN §4 (cross-cutting concepts)` lists the small set of names and values that must update in every affected file when any one of them changes. When editing one of these concepts, walk `SPLIT-PLAN §4 (cross-cutting concepts)` row-by-row and update every file in the row. Don't trust your memory.

## IaC parameter-passing consistency

For projects using IaC (Bicep, Terraform, etc.), three checks the AI runs whenever a module is edited:

1. Confirm structural balance (e.g., `grep -c '{' file.bicep` equals `grep -c '}' file.bicep`).
2. Confirm the caller passes every required parameter the module declares — and only those.
3. Confirm the parameter table in the IaC reference doc matches the module's declarations exactly (name, type, secure flags, length constraints).

These three checks take 30 seconds and catch silent drift.

## Local commit-time gates — pre-commit

Branch protection catches issues at PR time. The kit also ships a `.pre-commit-config.yaml` (and a parallel `.github/workflows/ci.yml`) that catches them _before_ the commit even lands locally — and the same hooks re-run in CI on every PR for developers who haven't activated pre-commit on their machine.

Per-developer activation (one time):

```bash
uv tool install pre-commit  # or: pip install pre-commit
pre-commit install
```

The kit's `/setup-integrations` wizard offers to do this for you (the pre-commit step).

The generic baseline shipped:

| Category      | Hooks                                                                                                                                                                                     |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hygiene       | `trailing-whitespace`, `end-of-file-fixer`, `check-yaml`, `check-json`, `check-merge-conflict`, `check-added-large-files` (2 MB limit), `mixed-line-ending --fix=lf`                      |
| Format        | `prettier` for Markdown / YAML / JSON (excluded: workflow YAMLs — actionlint owns those — plus `.claude/` data files and the TIME-LOG/AGENT-LOG audit trails, which tools write verbatim) |
| Workflow lint | `actionlint` validates `.github/workflows/*.yml`                                                                                                                                          |

`detect-secrets` is shipped commented-out — uncomment when ready, then `detect-secrets scan > .secrets.baseline` and commit the baseline.

When a hook fails, fix the issue and re-commit. Don't bypass with `--no-verify` — that defeats the purpose. If a hook is wrong about your code (false positive), update its config or add an `exclude:` pattern, and explain the tension in the `SPLIT-PLAN §5 (progress log)` row.

### Adding stack-specific hooks

The generic config is a starting point. Add language- and tool-specific hooks as your stack solidifies:

| Stack           | Recommended hook                                                                              |
| --------------- | --------------------------------------------------------------------------------------------- |
| Python          | [ruff](https://github.com/astral-sh/ruff-pre-commit) — lint + format                          |
| TypeScript / JS | [eslint](https://github.com/pre-commit/mirrors-eslint) (prettier already covers MD/YAML/JSON) |
| Dockerfile      | [hadolint](https://github.com/hadolint/hadolint)                                              |
| Bicep           | local hook running `az bicep build --file <module>.bicep --stdout > /dev/null`                |
| Terraform       | [pre-commit-terraform](https://github.com/antonbabenko/pre-commit-terraform)                  |

Each addition lands as one PR per the standard branch+PR flow.

## `.gitattributes` and `.editorconfig` — pre-pre-commit hygiene

These two files prevent issues from entering the working tree at all:

- **`.gitattributes`** with `* text=auto eol=lf` and explicit binary classifications. Git normalizes line endings on checkout for every platform, so Windows developers never accidentally commit CRLF.
- **`.editorconfig`** tells the editor (VS Code / JetBrains / Vim with plugin) to use the project's indentation, charset, end-of-line, and final-newline conventions automatically.

Both ship at adoption time. Adopters who already have these files keep theirs; the kit's templates assume there isn't an existing `.gitattributes`.

## Package manager — pnpm for Node projects

Node projects in this kit use **pnpm**, not npm or yarn. It is faster (content-addressable store + hard links), strict about phantom dependencies, and saves disk across multiple projects on one machine. Commands map directly: `pnpm install`, `pnpm test`, `pnpm run build`, `pnpm run lint`, `pnpm exec <bin>` (or `pnpm dlx` for one-off binaries).

- **Install pnpm via Corepack** — `corepack enable`, which ships with Node 16.13+. Pin the version per project with a `"packageManager": "pnpm@<version>"` field in `package.json` so every developer and CI run resolves the same pnpm.
- **Commit `pnpm-lock.yaml`.** Never commit `package-lock.json`; if one appears, delete it.
- **In Docker**, `RUN corepack enable` before the first `pnpm` call, copy `pnpm-lock.yaml` alongside `package.json` so the install layer caches, and use `pnpm install --prod` for production images (the equivalent of npm's `--omit=dev`).
- **The one npm exception** is the global Claude Code CLI install in `README.md` — that is tooling bootstrap (npm ships with Node, and pnpm isn't present yet at that point), not project dependency management.

The `permissions.allow` list in `templates/.claude/settings.json` allowlists the pnpm commands; see `methodology/12-autonomy-and-approvals.md` (autonomy and approvals).

## Anchor-stability discipline for long docs

When a doc has stable section numbers that other docs link to (e.g., `OTHER_DOC.md#2-10-uat-smoke-test`), don't renumber. If a new section needs to slot in, give it a letter suffix (`§2.6a`) rather than renumbering downstream sections. Renumbering breaks links silently.
