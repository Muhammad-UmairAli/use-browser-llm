# VoltAgent — specialist personas on tap

> The kit's `/setup-integrations` wizard installs the VoltAgent plugin groups (core-dev, lang, qa-sec, infra) via `claude plugin install`. Read on for the full catalog, recommended starter set, and when to invoke each specialist.

[VoltAgent's awesome-claude-code-subagents](https://github.com/VoltAgent/awesome-claude-code-subagents) is a catalog of 130+ specialist agent personas — frontend, backend, security, performance, accessibility, code review, debugging, and more. The kit's orchestration layer doesn't supply specialists; VoltAgent does.

## When to invoke a VoltAgent specialist

From inside a task — usually mid-execution — when a question arises that benefits from focused domain expertise:

- **Code review** before merging a non-trivial PR → `code-reviewer`
- **Security review** of a change touching auth, data handling, or secrets → `security-auditor`
- **Performance review** of hot-path code or a new bottleneck → `performance-engineer`
- **Accessibility audit** of new UI work → `accessibility-tester`
- **Hard debugging** with a non-obvious failure mode → `debugger` or `error-detective`
- **Language-specific depth** (e.g., a tricky React hook, a Postgres lock issue, a Kubernetes manifest) → the relevant `*-pro` / `*-specialist` agent

The orchestration layer's flow stays in charge — the specialist gives an opinion, the task-agent decides what to do with it, and the PR records the outcome.

## How invocation looks under autonomous mode

When `/work-the-phase` is running and a task needs review:

1. Task-agent finishes its edits and is about to merge.
2. Task-agent invokes `code-reviewer` via the `Agent` tool with the diff.
3. The specialist returns a review.
4. If the review surfaces a blocking concern, the task-agent halts the autonomous loop (one of the documented stop conditions in `methodology/12-autonomy-and-approvals.md`) and surfaces.
5. If the review is clean, the task-agent proceeds with `gh pr merge` — which still fires the `permissions.ask` gate, prompting the developer.

The specialist isn't a gatekeeper; it's a second opinion that can trigger a human gate when warranted.

## Installation in an adopting project

```bash
# Global install (specialists available across all projects):
claude plugin marketplace add VoltAgent/awesome-claude-code-subagents
claude plugin install voltagent-qa-sec       # code-reviewer, security-auditor, etc.
claude plugin install voltagent-lang         # language specialists
claude plugin install voltagent-core-dev     # frontend-developer, backend-developer, etc.

# OR project-local install (under .claude/agents/):
git clone https://github.com/VoltAgent/awesome-claude-code-subagents
cp awesome-claude-code-subagents/categories/04-quality-security/code-reviewer.md \
   .claude/agents/
```

Pick the specialists that match your stack and the gates the orchestration layer already calls for.

## Recommended starter set

For a project adopting the kit, these specialists pair with the orchestration layer's gates well:

| Specialist                                    | When the kit calls for it                                                               |
| --------------------------------------------- | --------------------------------------------------------------------------------------- |
| `code-reviewer`                               | Before merging any non-trivial PR                                                       |
| `security-auditor`                            | Before merging any PR touching auth, secrets, or data handling                          |
| `architect-reviewer`                          | Before merging cross-cutting changes (touches `SPLIT-PLAN §4 (cross-cutting concepts)`) |
| `debugger`                                    | When a phase hits a non-obvious failure                                                 |
| Language `*-pro` matching the project's stack | Mid-task, on demand                                                                     |

You can install more later. The kit doesn't depend on any specific specialist — VoltAgent is invoked from inside tasks, not from the orchestration layer.

## When NOT to invoke a specialist

For routine work the task-agent can handle alone (basic edits, simple bug fixes, doc updates), invoking a specialist adds round-trip cost without proportional value. Reserve specialists for moments that genuinely benefit from a focused second opinion.
