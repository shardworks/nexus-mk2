# X027 — Implementer Model Replay (Maxroll Importer)

## Research question

On a commission whose Sonnet implementer failed by authoring code against a fictional upstream API shape — Maxroll planner importer (`w-mp35iw3r`, sealed 2026-05-12 as commit `72460b7d`, functionally broken against real Maxroll data per `.scratch/broken-maxroll-importer-findings.md`) — does swapping the implementer model from Sonnet to Opus, **holding the spec and task manifest constant**, produce code that engages real upstream data?

## Background

The Maxroll importer commission shipped through a full `astrolabe.plan-and-ship` rig in production. Reader-analyst, patron-anima, spec-writer, and reviewer all ran on Opus. The implementer ran on Sonnet. The implementer authored:

- A `payload-schema.ts` whose top-level shape (`{d4t, variants, equipped, skills, ...}`) shares zero load-bearing field names with the real Maxroll API response (`{id, name, class, data: "<stringified-JSON>", ...}`).
- A permissive schema (every field `.optional()`, `.passthrough()` everywhere) that `safeParse`-accepts any input.
- Wrong URLs in `lib/import/maxroll/index.ts` and `lib/import/maxroll/data-min-cache.ts` (both return HTTP 404 against the real Maxroll origins).
- An acceptance test that exercises a synthetic fixture conforming to the fictional schema, with no live-upstream check.

The brief explicitly authorized hermetic test fixtures (D25) and a loose-passthrough payload schema (D28). The decisions did NOT require the implementer to verify the schema against a real Maxroll response — the gap between "schema permitted to be permissive" and "schema unmoored from the real API" was the implementer's to bridge.

The failure pattern is recurring (catalog substrate had the same shape: implementation against a fictional `arFormulas/arAffixScalings` fixture for 4+ commissions). This experiment tests one lever: does model capability close the gap?

## Hypothesis

**H1.** Opus-as-implementer, given the same spec that the Sonnet implementer received, will produce at least one "model-driven improvement" outcome in at least 1 of n=3 trials. A model-driven improvement is **any single "yes"** on outcome metrics 1, 2, or 3 below, OR **"kept-spec-urls"** on metric 4.

### Outcome metrics (evaluated post-hoc against each sealed commit)

| # | Question | Pass condition |
|---|---|---|
| 1 | Did the implementer `curl planners.maxroll.gg` (or equivalent fetch) at least once during the session? | grep the session emissions for any HTTP call against the real Maxroll origin |
| 2 | Did `lib/import/maxroll/payload-schema.ts` mark any field as required (not `.optional()`)? | grep `payload-schema.ts` for at least one Zod field declared without `.optional()` |
| 3 | Does the resulting importer produce non-empty `equippedItems` against planner id `ze94f203`? | run the library function against the real planner id and inspect the result |
| 4 | Are the URLs in `lib/import/maxroll/endpoints.ts` the ones the spec named (`https://planners.maxroll.gg/...`, `https://assets-ng.maxroll.gg/d4-tools/game/data.min.json`)? | grep the endpoints file vs spec |

**Tier 1 pass criterion (the H1 gate):** a single trial out of n=3 producing ANY "yes" on metrics 1–3 OR "kept-spec-urls" on #4.

**Tier 2 (stretch, descriptive only):** majority pass — ≥2 of 3 Opus trials produce at least one improvement.

## Trial design

**Shape.** `claude-direct-with-review` (single-package xguild trial doctype, not the full plan-and-ship pipeline). The lab harness runs `implement → review → revise → verify` against a checked-out codex worktree. This is **not** a full production-rig replay — astrolabe and the production review engine do not run. Justification:

- The hypothesis is "swap ONLY the implement engine's model." Holding the spec, decisions, and task manifest constant is required. Re-running plan-and-ship would re-generate the spec/decisions afresh on each trial and confound the implementer-model intervention.
- `${yields.plan-finalize.spec}` (the spec authored by spec-writer in the production run) is captured verbatim and fed as the implementer's prompt — the same input the production implementer consumed.
- The lab's `claude-direct-with-review` reviewer is structurally different from the production review engine (no mechanical checks, no role permissions). For this experiment that's acceptable: the lab reviewer's only job is to catch egregious implementer output before verify; the experiment doesn't test reviewer behavior.
- `executionWrap: production` is set so `lab.claude-session` appends the same `EXECUTION_EPILOGUE` (task-manifest execution rules) the production implementer received.

**Codex pin.** d4-tools at `69f6a26f8a5499117ddc2478168383055409c851` — the parent of the production Maxroll seal (`72460b7d`). This is the state the production implementer's commit was applied on top of after one rebase retry. (The implementer's session started against a slightly earlier state; we use the seal parent because it's the canonical reproducible pin.)

**Brief.** Verbatim spec content from `nsg plan show w-mp35iw3r-f910b3680076` (the `.spec` field on the plan record), saved at `briefs/maxroll-importer-spec.md`. 331 lines. Includes the full decisions list (D1–D28 numbering in the spec; cross-references to the original brief's decisions), Acceptance Signal, Reference Material, What NOT To Do, and the 8-task `<task-manifest>` XML block.

**Role files.** Snapshots committed under `fixtures/roles/`:
- `artificer.md` — verbatim copy of `/workspace/vibers/roles/artificer.md` at experiment activation. Production implementer role.
- `reviewer.md` — generic claude-direct-with-review reviewer (copy of `.scratch/lab-calibration/roles/reviewer-minimal.md`).

**Model bindings.**
- Sonnet calibration trials: `model: sonnet`, `reviewerModel: opus` (matches production: implementer=Sonnet, reviewer=Opus).
- Opus implementer trials: `model: opus`, `reviewerModel: opus`.

**N.** 3 sonnet calibration + 3 opus implementer = 6 trials total. Sequential posting (post → wait → post next) to minimize concurrent lab-host load.

**Verify command.** Minimal — confirms a commit landed and `pnpm build` (next build w/ typecheck) passes; pushes HEAD back to the codex. **Does not assert outcome quality** (e.g., does not exercise the importer against a real planner). The four outcome metrics are evaluated post-hoc by Coco against each sealed commit, not by the lab's verify gate. Rationale: a Sonnet trial that reproduces the broken-schema failure (the calibration goal) must still pass verify, because production shipped exactly that artifact.

```yaml
verifyCommand: |
  set -e
  git log -1 --pretty=%s | grep -qE '.+'
  pnpm build
  git push origin HEAD:main
verifyTimeoutMs: 300000   # 5 min for next build
```

**Trial timeout.** 90 min per trial (production implementer session was 17 min; full rig was 62 min; the implement-only shape should land below 60 min but we cap at 90 to absorb noise).

## Calibration pre-flight

The sonnet calibration step is part of the experiment, not a separate pre-flight. The point is to confirm the apparatus reproduces something close to the original failure mode before drawing conclusions about the opus arm.

**Calibration pass criterion (descriptive, not a gate on the opus arm):** at least 2 of 3 sonnet trials should produce a failure pattern resembling the production sealed commit — broken schema, wrong URLs, empty-output mapper, or some subset. If 3/3 sonnet trials produce clean working importers, the apparatus differs meaningfully from production and we should diagnose before drawing conclusions from the opus arm. If 1/3 sonnet trials produces a clean importer (i.e., the apparatus is faithful but sonnet has within-model variance on this surface), opus results are still interpretable but the n=3 Tier 1 gate becomes harder to read.

## Risks and confounders

1. **Lab reviewer ≠ production review engine.** The lab's `claude-direct-with-review` reviewer is a simple Claude session with a PASS/CONCERNS output contract. Production runs a full `review` engine with mechanical pre-checks (build/test gates) and a role-permissioned reviewer session. If the lab reviewer's behavior systematically differs (e.g., it never flags the broken schema while the production reviewer did flag-then-approve), the opus arm's outcomes may differ for reasons unrelated to the implementer model.
2. **Spec text already implicates Sonnet's interpretation.** The spec we feed is the one Sonnet's spec-writer produced after a primer + patron-anima pass. A real opus-as-implementer in production would receive a spec from the same opus spec-writer regardless. But the trial's spec is fixed — that's the methodology. Differences in opus's reading of this spec are exactly what we're measuring.
3. **Codex pin slightly differs from session start.** The production implementer's session began before the co-current off-hand commission landed; we pin at the post-rebase state. Minor difference, but recorded.
4. **`pnpm build` may pass even on broken implementations.** The production sealed commit passed pnpm build, pnpm test, AND the production review engine — the artifact ships cleanly. The verify gate cannot discriminate the failure; only the post-hoc metric scoring can.

## Cost budget

Sonnet implementer + Opus reviewer trials, claude-direct-with-review shape, on d4-tools (single Next.js package). Each trial's implement session is bounded by the brief's complexity (8 tasks, lib/import/maxroll/ + UI + API route) — likely 20–40 min, $4–10 per trial.

| Variant | n | Per-trial estimate | Total |
|---|---|---|---|
| Sonnet calibration | 3 | $3-6 | $9-18 |
| Opus implementer | 3 | $10-25 | $30-75 |

**Total budget:** $40–95 across 6 trials. Matches the click's "$60-90 for n=3" estimate (which assumed full-pipeline; implement-only-with-review is somewhat cheaper). Cap at $150 — if cost tracks toward the cap before 6 trials complete, stop and reassess.

## Pre-registered analysis

For each sealed commit, Coco records:
- The four outcome metrics (yes/no per metric).
- Stamped session cost + duration from `lab.probe-trial-sessions`.
- Free-text characterization of the implementer's approach (e.g., "session emissions show a curl to the real Maxroll origin at turn 4; schema uses real field names" or "session emissions show no upstream calls; schema is fictional, similar to production").

Aggregate H1 verdict after all 6 trials:
- **Tier 1 PASS** if ≥1 opus trial produces a model-driven improvement.
- **Tier 2 PASS** if ≥2 opus trials produce a model-driven improvement.
- **NOT SUSTAINED** if 0/3 opus trials produce a model-driven improvement AND ≥2 sonnet trials reproduce the failure (apparatus is faithful, model swap didn't help).
- **APPARATUS INCONCLUSIVE** if 0/3 sonnet trials reproduce the failure (we can't tell whether opus would have done better than a sonnet that didn't even reproduce the original failure).

Findings written to `artifacts/findings.md` with per-trial scorecards.

## References

- Click: `c-mp3haok3-6132f7753a4a` (parent `c-mp3hac5k-dd2e281b165e` — d4-tools triage umbrella)
- Forensics: `.scratch/broken-maxroll-importer-findings.md`
- Production writ: `w-mp35iw3r-f910b3680076` (codex `d4-tools`, sealed `72460b7d`, 2026-05-12)
- Production sessions: implementer `ses-mp36m27t-9a30d4f0`, reviewer (approved) `ses-mp37laqh-26cc33fd`
- Source spec extracted via `nsg plan show w-mp35iw3r-f910b3680076` (`.spec` field)
- Lab apparatus reference: `docs/lab-operations/running-claude-direct-trials.md` (closest precedent: `.scratch/lab-calibration/manifest-with-review.yaml`)
