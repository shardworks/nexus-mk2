# Require package-scoped verify commands in task manifests

## Intent

Update the task-manifest rules in the sage-writer instructions so that `<verify>` commands target the smallest scope that exercises the task's blast radius — typically a single package via `pnpm --filter <pkg-name> test` — rather than monorepo-wide commands like `pnpm -w test`. The intent is to instruct the sage-writer anima to default to narrow scope, with an explicit exception clause for tasks that genuinely span packages.

## Motivation

Implement-engine sessions iterate task-by-task, running each task's `<verify>` command and observing its output. When that command runs the entire monorepo test suite, the resulting `tool_result` payload is large, lands in the conversation context, and is re-read by every subsequent turn through Claude's automatic prompt-cache. Across the 5–8 verify cycles in a typical session, this is a substantial contributor to per-session output and cache-read tokens. Narrowing each verify command to package scope cuts that output without changing the iterative-deliberation pattern that the manifest is designed to produce.

The change is a behavioural instruction to the sage-writer; no engine, plugin, or schema change is needed. See click `c-modyhqk3` for the cost-investigation context that motivated this intervention.

## Non-negotiable decisions

- **Default to package scope.** The manifest rules must instruct the sage-writer to write verify commands that target the smallest scope exercising the task's blast radius. The canonical example is `pnpm --filter <pkg-name> <script>` or a focused grep, not `pnpm -w test` or `pnpm -w typecheck`.
- **Allow wider scope when justified.** Tasks whose blast radius genuinely spans packages (cross-cutting refactors, monorepo-wide renames, registry changes consumed by many plugins) may use `pnpm -w typecheck` or a workspace-wide command. The rule is *narrow by default*, not *narrow always*.
- **Concrete examples in the rules section.** The updated guidance must include at least one concrete example of an acceptable package-scoped command and at least one concrete example of when wider scope is appropriate, so the sage-writer has unambiguous models to follow.
- **Instruction-only change.** This is a sage-writer-discipline change. Do not add validation in plugin code, do not modify the manifest XML schema, do not change the `<verify>` field structure, and do not change the engine that consumes the manifest.

## Out of scope

- Capping task count or action length in the manifest. (Deferred — change one thing at a time.)
- Modifying any engine code (`spec-publish`, `implement`, `implement-loop`, `piece-session`).
- Reviving or re-enabling piece-session decomposition.
- Adding mechanical enforcement of the rule (linting the manifest, rejecting bad verify commands at parse time). Discipline lives in the sage-writer instructions.
- Any change to brief-style rules outside the manifest section.

## References

- Source click: `c-modyhqk3` (cost intervention investigation; under the hopper Stage 1 umbrella `c-moa42eey`).
- Cost-tracking sibling: `c-mo1mqh2g` (token-budget design — context, not load-bearing here).