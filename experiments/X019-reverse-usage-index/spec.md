---
status: active
---

# X019 — Reverse Usage Index

**Parent click:** `c-moogy8wa` — source-code preprocessing to
reduce planner cost. **This experiment's click:** `c-moogyjgw`.

## Research question

Does providing the reader-analyst with a **reverse usage index
lookup tool** (one MCP tool that answers "where is this symbol
defined and referenced?") reduce planning-session cost by replacing
its current Grep-based cross-reference behavior, without
meaningfully degrading spec quality?

## Pipeline placement

The Astrolabe `plan-and-ship` rig has 13 engines. The intervention
target is engine #3, **`reader-analyst`** — same target as X018.

Unlike X018 (which modifies the role prompt), X019 introduces a
new MCP tool (`code-lookup`) into the test guild's tools apparatus
and assigns it to the reader-analyst role's permissions. The role
prompt receives a small instruction snippet directing tool
preference; the bulk of the artifact lives in the tool's backing
data.

The trial shape is **spec-only** (planning-only) — same as X018.
See [Lab Operations / Trial Shapes](../lab-operations/running-trials.md#trial-shapes).

## Background

Same source analysis as X018 (sessions `ses-mok28grd-6e552bb6` and
`ses-mojmj4zc-e81d52ed`). 30–45% of the planner's tool calls are
**cross-reference Greps** — queries like:

```
Grep "ensureBook"
Grep "setWritExt|getWritExt|writ\.ext"
Grep "delete-book|dropBook|removeBook"
Grep "cartograph/visions|cartograph/charges|cartograph/pieces"
Grep "WhereClause|export type.*Where"
Grep "supportKit\.books|books:.*indexes"
```

Each query is structurally a "given a symbol, where is it defined
and where is it referenced" lookup. Greps return matched lines as
plaintext fragments; the planner often re-reads files to resolve
context.

A precomputed **reverse usage index** — built once per codex SHA
via ts-morph — answers these queries directly with structured
results: definition site (file/line/signature), reference list
(file/line/kind: call, type-reference, import, etc.).

Estimated full-monorepo size for exported symbols + cross-package
refs is **~600 KB to 1 MB** — too large to inject into the role
prompt. The index is exposed via an **MCP tool** the planner calls
on demand, not as primer context.

X018 tests primer-injection of a complementary artifact (package
surface map). X018 runs first — see [Sequencing](#sequencing).

## Hypothesis

**H1.** Providing the `code-lookup` tool (modes: `symbol`,
`usages`, `package`) reduces reader-analyst session cost (USD) by
≥25% **relative to the X018 baseline** — i.e., on top of whatever
surface-map injection achieves.

The relative framing means X019's baseline is "X018 intervention
applied; no lookup tool" and its treatment is "X018 intervention
applied + lookup tool available." If X018 was falsified, X019's
baseline reverts to current production and the comparison becomes
"no precomputed substrate" vs. "lookup tool only."

"Meaningfully degrading" follows the same three-tier regime as
X018 (Tiers 1+2 every trial, Tier 3 on trigger).

## Variants

| variant | description |
|---|---|
| baseline | reader-analyst with X018 intervention applied (or current production if X018 falsified); `code-lookup` plugin not installed; role prompt unchanged |
| with-lookup-tool | same baseline, plus: `code-lookup` plugin installed and tool granted to reader-analyst role; role prompt extended with the tool-preference snippet that instructs "use `code-lookup` for symbol/usage/package queries, reserve Grep for content searches" |

The instruction snippet is **as load-bearing as the tool itself.**
Without the prompt extension, the anima's training falls back to
Grep regardless of what's installed; with the snippet, the
reader-analyst is directed to substitute. The baseline must not see
the snippet — otherwise the baseline anima would attempt to call a
non-registered tool and confound the comparison.

## Metrics

### Primary (cost)

- **Reader-analyst session cost (USD)**
- **Reader-analyst tokens** — input / output / cache-read /
  cache-write
- **Reader-analyst wallclock duration**

### Secondary (mechanism)

Tool-call counts on the reader-analyst session, with attention to
the substitution pattern:

- `Grep` calls categorized as cross-reference queries (expected
  to drop sharply)
- `code-lookup` calls (expected to rise, replacing greps)
- `Grep` calls categorized as content searches (multi-word
  phrases, comments, regex over file bodies) — should remain
  unchanged
- Total reads, total bash, total tool calls

Mechanism prediction: cross-reference Greps move to `code-lookup`
calls roughly 1-for-1; orientation Greps and content-Greps stay
where they are.

### Tool-quality (mechanism diagnostic)

- **`code-lookup` correctness rate** — fraction of tool calls
  that return a non-empty, accurate result. Sanity-checked against
  ts-morph ground truth on the calibration runs.
- **Latency** — per-call response time. If the tool is materially
  slower than Grep, per-call latency could erase per-token savings.

### Quality (no-regression)

Same three-tier regime as X018:

**Tier 1 — Mechanical structural integrity (every trial).**
Extracted post-trial from the `astrolabe/plans` book:

- All four artifact sections present and non-trivial in length
  (`inventory`, `scope`, `decisions`, `observations`, `spec`)
- Decision count within ±30% of baseline
- Scope item count within ±30% of baseline
- Inventory length within ±40% of baseline (word count)
- Every decision has `selected` populated

Trip any check → trial flagged "quality flagged." Automated.

**Tier 2 — Manual side-by-side review (every trial pair).**
Coco/Sean reads baseline + variant specs side-by-side. Flag any
obvious quality regression. Expected outcome is "no identified
issues" — escalate to Tier 3 if anything flagged. ~10 min per
pair; one-paragraph summary in the trial pair's artifact
directory.

**Tier 3 — Downstream implementer trial (deferred / on-trigger).**
Hand each variant's spec to a fresh implement-only trial. Compare
outcome class and quality-scorer composite. ~$5–10 per trial.
Run when Tier 1 or 2 flags concern, on periodic spot-check, or
for experiment sign-off.

H1 is sustained when cost reduction is observed AND at least one of:

- Tier 1 + Tier 2 both pass
- Tier 3 passes

## Design

X019 requires real framework code (a new tool with a handler
implementation), so the canonical experiment-branch publish flow
applies — see
[Lab Operations / Framework changes for experiments](../lab-operations/running-trials.md#framework-changes-for-experiments).

### Phase 1 — index generator (sanctum-side)

A sanctum-side script produces the reverse usage index artifact for
a given codex SHA. ts-morph-based; emits structured JSON keyed by
symbol name with reference arrays:

```json
{
  "generatedFromSha": "<sha>",
  "symbols": {
    "ensureBook": {
      "kind": "function",
      "definedAt": { "file": "...", "line": 142 },
      "signature": "...",
      "doc": "...",
      "references": [
        { "file": "...", "line": 67, "kind": "call" }
      ]
    }
  }
}
```

Targets: full-monorepo coverage of exported symbols + cross-package
references; size ~600 KB–1 MB; regen ≤2 min. The artifact lives at
a known path (e.g., `<codex-cwd>/.nexus/code-lookup-index.json`) so
the tool handler in the test guild can read it.

### Phase 2 — `code-lookup` plugin on an experiment branch

Build the tool as a real nexus plugin on an experiment branch.
Plugin lives at `packages/plugins/code-lookup/` (or similar) in the
nexus monorepo and contributes:

1. **The `code-lookup` MCP tool** with three modes:
   - `symbol <name>` → definition site, signature, JSDoc, kind
   - `usages <name>` → array of `{file, line, kind}` references
   - `package <name>` → full package detail with all signatures +
     JSDocs

   Handler reads the artifact from a configured path (codex cwd
   by default) on each call.

2. **A role-prompt instruction snippet** at
   `<plugin>/sage-tool-preference.md` (or similar). Plain markdown
   that the trial manifest can prepend or append to the
   reader-analyst's role prompt. Snippet directs the anima to use
   `code-lookup` for symbol/usage/package queries and reserve Grep
   for content searches.

   Shipping the snippet alongside the tool means the snippet is
   versioned with the tool that requires it — a future change to
   the tool's surface (a new mode, renamed mode, etc.) updates the
   snippet in the same commit.

**Role prompts on the branch are NOT modified.** The instruction is
a separate file the manifest applies per-variant — the baseline
variant gets the unmodified production role prompt, the
with-tool variant gets the production prompt + the snippet. This
keeps the experiment branch carrying a clean superset (additive
plugin + additive snippet file) rather than a branched fork of
existing role prompts.

**Branch convention:**
`experimental/x019-code-lookup`

**Publish workflow:**

```bash
cd /workspace/nexus-mk2
npx tsx bin/publish-experimental.ts --branch experimental/x019-code-lookup
```

The script publishes all workspace packages under tag
`experimental` with version `<next-patch>-x019.<n>`. Iterating on
the branch republishes with incrementing `<n>`.

### Phase 3 — A/B trials

Paired trials on identical commissions, spec-only shape, using the
prerelease version pinned in the manifest. Both variants get
X018's surface-map injection (so the only delta is the tool); if
X018 falsified, neither gets it.

**Codex selection.** Same as X018 — the two real plan rigs we
already analyzed:

1. Stacks `dropBook` plan rig (mandate `w-mojnftby`, baseline cost
   $6.48)
2. Cartograph plan rig (mandate `w-mojmj0rc`, baseline cost $8.08)

**Manifest plumbing per trial:**

- `frameworkVersion` and all plugin pins set to the experimental
  prerelease version (the publish script prints the ready-to-paste
  snippet)
- The new `@shardworks/code-lookup-apparatus` (or whatever the
  plugin is named) is added to the plugin list on the
  with-lookup-tool variant; absent on the baseline variant
- A small fixture step regenerates the reverse-usage-index
  artifact against the codex SHA and writes it to the expected
  path inside the codex working dir
- Test guild's `loom.roles.<sage-role>` config grants permission
  for the `code-lookup` tool name on the with-lookup-tool variant
- Test guild's `loom.roles.<sage-role>` role prompt is overridden
  on the with-lookup-tool variant: production prompt +
  `sage-tool-preference.md` from the plugin appended (mechanism
  parallel to X018's surface-map injection). Baseline variant's
  role prompt is left at the production default.

**Rig configuration.** Use the `lab.plan-only` rig template per
[Lab Operations / Planning-only rig](../lab-operations/running-trials.md#planning-only-rig).
Same recipe as X018.

**N=1/variant calibration first.** Expand based on signal strength
and per-trial cost.

## Risks

- **Tool adoption failure.** Even with role-prompt instruction,
  the reader-analyst may default to Grep out of habit. If tool
  calls are <25% of the equivalent Grep volume in the treatment
  variant, the intervention isn't being applied — that's a
  prompt-engineering problem, not an index problem. Mitigation:
  log every Grep that could have been a `code-lookup` call
  (post-hoc analysis), iterate the prompt if adoption is low.
- **Index incompleteness.** If `code-lookup` returns empty or
  inaccurate results, the planner reverts to Grep and pays
  *both* the failed tool call AND the Grep. Net cost could
  increase. Mitigation: high index correctness target (≥99% on
  ground-truth comparison), fail-loud error mode rather than
  silent empty returns.
- **Index size at scale.** Beyond Nexus to larger codebases, index
  size grows non-linearly. Out of scope for X019; worth flagging
  for follow-ups.
- **X018 confound.** Surface-map injection may already cover
  symbol-existence queries (a subset of cross-reference Greps).
  X019's additional effect size could be small if the categories
  overlap heavily. The relative-baseline framing handles this
  analytically.
- **Tool-vs-Grep speed.** If artifact load + MCP roundtrip is
  slower than Grep, per-call latency could erase per-token
  savings. Measure.

## Depends on

- X018 results (sequencing) — to know what baseline to compare
  against
- Sanctum-side reverse-usage-index generator (Phase 1)
- `code-lookup` plugin built on an experiment branch in the nexus
  monorepo (Phase 2)
- Experiment-branch publish workflow (`bin/publish-experimental.ts`)
  validated end-to-end at least once before X019 takes a hard
  dependency on it
- Spec-only trial shape support in the Laboratory
- Reproducible scenario codexes (the two replay rigs)

## Sequencing

X019 runs **after** X018. The two interventions are intentionally
separable: surface-map injection targets *orientation* (small,
broad context dump); reverse-usage-index tool targets
*cross-reference queries* (large, narrow lookups). Running them
sequentially keeps the mechanism distinguishable.

## References

- Parent click: `c-moogy8wa`
- This experiment's click: `c-moogyjgw`
- Companion: X018 — Package Surface Map Injection
- Lab Operations: `experiments/lab-operations/running-trials.md`
- Source analysis transcripts: same as X018
- Astrolabe pipeline: `docs/architecture/apparatus/astrolabe.md`
- Role prompt: `packages/plugins/astrolabe/sage-primer-attended.md`
