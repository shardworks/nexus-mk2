# Predicted-files gate v0 (soft-warn) at spec-publish

## Intent

At the Astrolabe `spec-publish` engine, count the distinct file paths predicted in the generated spec's task-manifest `<files>` elements. Store that count on the `PlanDoc`. If the count exceeds a configured threshold (initially 15), emit a Clockworks event named `astrolabe.plan.files-over-threshold` carrying the plan id, the count, and the threshold. Do not halt the planning pipeline; do not change any existing behavior beyond adding the count and the optional event. This is a soft-warn observation layer — the framework records the signal, downstream consumers (sanctum-side instrumentation) decide what to do with it.

## Motivation

Empirical analysis of implement-engine cost across 70+ post-Apr-16 sessions identified files-touched as the strongest single cost predictor (Pearson +0.81). Cost ramps roughly linearly through 9 files, plateaus through 10-19, then jumps 3.2× at 20+ files. Sessions above the cliff are 11% of population but ~38% of total implement cost. The planner already predicts the file footprint per task in the manifest's `<files>` field with reasonable accuracy (~76% within 1.5× of actual). Counting and recording predictions at planning time gives downstream tooling a structured signal it can act on (alerting, gating, auto-decomposition) without coupling those decisions into the framework yet. v0 is the measurement layer; enforcement and decomposition land in follow-on commissions once the threshold is empirically validated.

## Non-negotiable decisions

- **Add a `manifestFilesCount` field (or equivalent name) to the PlanDoc schema.** Populated by spec-publish whenever a manifest is present. Absent or 0 when the spec has no `<task-manifest>` block.
- **Path extraction from `<files>` is a permissive regex.** Walk each `<task>` element, extract the inner `<files>` text, find tokens that look like paths (contain at least one `/`, are mixed-content tokens like `packages/plugins/spider/src/spider.ts`). Deduplicate across tasks. The implementer chooses the precise regex; the test cases below define the expected behavior. Free-form prose elsewhere in the action text is not in scope — only the `<files>` element content.
- **Emit a Clockworks event when the count exceeds the threshold.** Event name: `astrolabe.plan.files-over-threshold`. Payload: `{ planId, count, threshold }`. The event fires once per spec-publish invocation, after the plandoc patch has landed. Do NOT emit if no manifest exists or count is 0.
- **Threshold is configurable.** Read from `guild.json` under `astrolabe.predictedFilesThreshold`. Default to 15 if unset. The threshold value lives in config, not as a hardcoded constant in source.
- **Do not halt the planning pipeline.** This is a soft-warn release. The pipeline continues regardless of count. Future commissions will introduce halt or auto-decomposition based on observed thresholds.
- **No coupling to the Laboratory or any sanctum-side plugin.** The framework's job is the count, the storage, and the optional event emission. Anything that wants to surface, alert, or react to the count subscribes to the event or polls the plandoc — that's downstream concern.

## Behavioral cases the design depends on

- A spec with `<task-manifest>` containing tasks that collectively name 7 distinct paths produces `manifestFilesCount: 7`. No event emitted (under threshold).
- A spec with `<task-manifest>` containing tasks that name 18 distinct paths produces `manifestFilesCount: 18` and emits one `astrolabe.plan.files-over-threshold` event with `count: 18, threshold: 15`.
- A spec without a `<task-manifest>` block produces `manifestFilesCount: 0` (or the field absent — implementer's choice, document in code).
- A spec where the same path appears in multiple tasks deduplicates — counted once.
- The `<files>` element of a task may contain free-form prose (e.g., "the orchestration code in `packages/plugins/spider/src/spider.ts` plus its tests"); the regex pulls out the path tokens and ignores the prose.
- Threshold is overridable via `guild.json` config; tests cover the default-15 case and the explicit-override case.

## Out of scope

- Halting or rejecting the planning pipeline based on the count. v0 is observation-only. Future commissions handle gating, halting, or auto-decomposition.
- Counting predicted file imports, cross-package edges, or any per-file metric beyond the count itself. Future commissions may introduce richer predictors as v1/v2 of the gate.
- Surfacing the count in any UI or alert channel. The framework emits the data; sanctum-side instrumentation handles surfacing.
- Modifying the `<files>` element schema or the manifest's XML structure.
- Validating manifest-prediction accuracy against eventual seal-commit file lists.
- Changing the sage-writer instructions about how to write `<files>` elements.

## References

- Source click: `c-moe0l7bl` — predicted-files gate intervention, including the v0/v1/v2 metric tier evolution captured in `c-moe1tb5k`.
- Cost-cliff finding: `c-moe0lgs1` — the empirical evidence behind the threshold of 15.
- Manifest-prediction accuracy: `c-moe0lmhy` — 76% within 1.5×, supporting the gate's reliance on planner predictions.