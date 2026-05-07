# Running claude-direct Trials

Operational guidance for the **claude-direct trial doctype** —
single (or short-chain) claude session in a fresh codex checkout,
no test guild, no daemon, no spider. The lab host spawns claude
directly with a role file and a brief, captures the resulting
commit and transcript, runs a verification command, and archives
the result.

For the full sub-guild flavor (plan → implement → review → revise →
seal in a disposable test guild), see
[`running-xguild-trials.md`](./running-xguild-trials.md).
The high-level chooser between doctypes lives in
[`README.md`](./README.md).

> **Reading cost numbers in trial outputs?** Same rules as xguild
> trials — see [`calculating-costs.md`](./calculating-costs.md).
> The claude-direct engine reads `total_cost_usd` from claude's
> NDJSON `result` message, identical to how the production
> implementer engine does. Numbers are comparable across doctypes
> on a per-session basis.

---

## When to use this shape

The claude-direct shape is the right tool when the variable under
test lives at the **prompt or role-file layer** and the rest of
the pipeline is ceremony. Concretely:

- **Spec / brief format experiments** — inline type sigs, inline
  pattern templates, do-not-Read markers, explicit pre-quoting,
  inventory shape (X021's territory).
- **Role / system-prompt experiments** — implementer behavior
  nudges, reviewer prompt tuning, anti-orientation directives
  (X022's territory).
- **Model-substitution experiments** — comparing sonnet vs opus on
  the same prompt and codex (X015's territory).
- **Tool-surface experiments** that don't need MCP-served lab
  tools — most native-tool-shape questions fit here.

Use the **xguild shape** instead when:

- The variable lives in spider / loom / animator orchestration.
- You need real plan → implement → review → revise → seal
  fidelity (e.g., observation lift, plan-doc round-trip, draft-
  branch dynamics).
- The experiment exercises MCP-served tools that require a
  guild HTTP API.
- You're testing the rig template itself.

---

## What you give up vs xguild

The claude-direct engine reproduces the production claude
invocation faithfully (model, system-prompt-file, prompt piped to
stdin, EXECUTION_PROLOGUE/EPILOGUE injection, native tool surface)
but skips everything around it. Specifically:

| Production xguild | claude-direct |
|---|---|
| `nsg init` + plugin install (~30–60s) | skipped |
| Test-guild daemon + tool HTTP server + MCP proxy (~10s) | skipped |
| Spider scheduling | skipped (lab-host spider only) |
| Plan engine | skipped (brief is given directly) |
| Implement engine wrap (animator session record) | replaced by lab-side capture |
| Review engine (default) | optional — see review loop below |
| Revise engine (default) | optional — see review loop below |
| Seal engine | skipped — implementer commits directly |
| Observation lift | skipped |
| MCP-served clerk/codex/etc. tools | not exposed |
| 90s heartbeat reconciler / stuck-after-finish recovery | n/a (process-bound) |

The **EXECUTION_PROLOGUE/EPILOGUE injection** is preserved by
default — the lab engine carries the same prologue/epilogue text
that production's implement engine prepends/appends, because
those have shown up as load-bearing confounders in past
experiments (X016 documented an EPILOGUE that told the
implementer not to verify). To run "what does the role file alone
do" experiments you can opt out via a given.

---

## Plugin set

Just the laboratory plugin and its dependencies on the lab host —
no test-guild plugin set, no `frameworkVersion` pin for the test
guild.

The lab host itself still runs from monorepo source as usual; the
codex it clones is what gets pinned per trial via `baseSha`.

---

## Architectural shape

A claude-direct trial is composed from three pieces:

1. **`spider.graft-rig-template`** *(framework primitive, lands at v0.1.304)* — a generic Spider engine that resolves a named rig template, overlays caller givens onto its `${vars.X}` references, and grafts the template's engines as a tail set. This is the manifest's `scenario` engine.
2. **A rig template** *(authored manifest-locally for now)* — declares the implement → optional-review → optional-revise → verify chain as a regular DAG of engines. Each stage is a normal Spider engine, runs as its own attempt, gets its own animator/sessions row.
3. **`lab.claude-session`** and **`lab.shell-command`** *(laboratory engines)* — the per-stage primitives. `lab.claude-session` spawns claude with role + prompt + model + cwd and stamps a normal animator/sessions row. `lab.shell-command` runs `verifyCommand` and captures exit code + stderr tail.

The trial writ runs the standard `post-and-collect-default` rig template (codex-setup → scenario → probes → archive → teardowns). The scenario slot is `spider.graft-rig-template`, which grafts the trial-shape template into the rig in place. From `nsg rig list <trialId>`'s perspective, every stage shows up as a separate engine row.

### Why this shape

- **Real per-stage observability.** `nsg rig list --writ <trialId>` shows `implement`, `review`, `revise`, `verify` as discrete engines with their own attempts, costs, statuses.
- **Real per-stage retry semantics.** If `revise` crashes mid-run, Spider's existing engine-retry budget kicks in. No reinvented loop.
- **Cost stamping uses normal `animator/sessions` rows** — no custom per-trial book. Existing extraction tools (cost calculators, tool-use metrics) work unchanged.
- **Trial shapes are declarative.** Authoring a new shape (e.g. multi-iter, sonnet-implement-opus-review) is a new rig template, not a new engine.

---

## Manifest shape

Minimal — implement-only (no review):

```yaml
slug: x023-variant-a
title: X023 — variant A (no review)
description: |
  Tests <intervention> on <rig>. Implement-only, no review pass.

frameworkVersion: '0.1.304'

fixtures:
  - id: codex
    engineId: lab.codex-setup
    givens:
      upstreamRepo: /workspace/nexus
      baseSha: 0e1e81f4a219179fd264625b869e12bd00778365

config:
  spider:
    rigTemplates:
      lab.claude-direct-monolithic:
        engines:
          - id: implement
            designId: lab.claude-session
            upstream: []
            givens:
              rolePath: '${vars.rolePath}'
              briefPath: '${vars.briefPath}'
              model: '${vars.model}'
              cwd: '${yields.codex.workdir}'
              executionWrap: '${vars.executionWrap}'
          - id: verify
            designId: lab.shell-command
            upstream: [implement]
            givens:
              command: '${vars.verifyCommand}'
              cwd: '${yields.codex.workdir}'
        resolutionEngine: verify

scenario:
  engineId: spider.graft-rig-template
  givens:
    template: lab.claude-direct-monolithic
    givens:
      rolePath: /abs/path/to/roles/artificer-variant-a.md
      briefPath: /abs/path/to/briefs/variant-a.md
      model: opus
      executionWrap: production
      verifyCommand: |
        pnpm --filter @shardworks/reckoner-apparatus build && \
        pnpm --filter @shardworks/reckoner-apparatus test

probes:
  - id: context
    engineId: lab.probe-trial-context
    givens: {}
  - id: commits
    engineId: lab.probe-git-range
    givens: {}
  - id: sessions
    engineId: lab.probe-trial-sessions
    givens: {}

archive:
  engineId: lab.archive
  givens: {}
```

### How the substitution flows

1. Manifest declares `rigTemplates.lab.claude-direct-monolithic` under `config.spider.rigTemplates`. The lab-host spider picks it up at startup along with kit-contributed templates.
2. The trial writ runs the canonical `post-and-collect-default` rig: `codex-setup` → `scenario` → probes → archive → teardowns.
3. The `scenario` engine is `spider.graft-rig-template` with `template: 'lab.claude-direct-monolithic'` and a `givens: { ... }` map.
4. At run time, `spider.graft-rig-template` resolves the template, walks each engine's givens, and substitutes `${vars.<key>}` references against the caller-given map (so `${vars.rolePath}` → the absolute role path). All other expressions (`${writ}`, `${yields.codex.workdir}`, etc.) are left untouched.
5. The engine returns the substituted engines as a graft with `graftTail: 'verify'` (from the template's `resolutionEngine`). Spider splices them in; everything downstream of the scenario slot (probes, archive) waits for `verify` to complete.

### `spider.graft-rig-template` givens

| field | type | required | meaning |
|---|---|---|---|
| `template` | string | yes | name of the rig template to graft. Resolved via the spider's effective rigTemplates map. |
| `givens` | object | no | caller-supplied overlay. Keys here populate `${vars.<key>}` references in the template's engine givens. Other `${...}` expressions survive untouched for Spider's normal pipeline. |

Failure modes are loud — bad template name, bad givens shape, missing template all throw immediately. See `docs/architecture/apparatus/spider.md` § `spider.graft-rig-template` in the framework repo for the full behavioral contract.

### `lab.claude-session` givens

| field | type | required | meaning |
|---|---|---|---|
| `rolePath` | abs path | yes | role file → `--system-prompt-file` |
| `briefPath` | abs path | yes | initial-prompt content piped to claude's stdin |
| `promptTemplate` | string | (alternative to `briefPath`) | inline prompt; supports `${yields.*}` interpolation against upstream stages (used by review/revise) |
| `model` | string | yes | claude model id |
| `cwd` | abs path | yes | working dir; typically `${yields.codex.workdir}` |
| `executionWrap` | enum | no (default `production`) | `production` carries the implement-engine PROLOGUE/EPILOGUE wrapping; `bare` runs role + brief alone |

The engine writes a normal `animator/sessions` row stamped with `metadata.trialId` and `metadata.stage` (the engine id within the rig template — `implement`, `review`, `revise`).

### `lab.shell-command` givens

| field | type | required | meaning |
|---|---|---|---|
| `command` | string | yes | shell command to run |
| `cwd` | abs path | yes | working directory |
| `timeoutMs` | number | no (default 600 000) | per-command wallclock cap |

Yields `{ exitCode, stdout, stderr, durationMs }` (stdout/stderr are tail-truncated to ~16 KB each).

`verifyCommand` is **required** by convention — the claude-direct shape gives up the seal engine's automatic build/test gating, so the verify command is the only Tier-1 mechanical signal we have. If a calibration trial truly needs no verify, set `command: 'true'` to make the gating explicit.

---

## Review → revise loop

By default a claude-direct trial is one implementer session and nothing else. To preserve production's review→revise dynamic — which matters especially when the implementer model is sonnet-class and benefits from a revision pass — pick the `lab.claude-direct-with-review` template instead:

```yaml
config:
  spider:
    rigTemplates:
      lab.claude-direct-with-review:
        engines:
          - id: implement
            designId: lab.claude-session
            upstream: []
            givens:
              rolePath: '${vars.rolePath}'
              briefPath: '${vars.briefPath}'
              model: '${vars.model}'
              cwd: '${yields.codex.workdir}'
              executionWrap: '${vars.executionWrap}'
          - id: review
            designId: lab.claude-session
            upstream: [implement]
            givens:
              rolePath: '${vars.reviewerRolePath}'
              promptTemplate: |
                A previous implementer just made these changes against the brief below.
                Inspect HEAD (the implementer's commit) in the working dir.

                If the work satisfies the brief, output exactly:
                  REVIEW: PASS
                If concerns remain, output:
                  REVIEW: CONCERNS
                  <concerns body>
              model: '${vars.reviewerModel}'
              cwd: '${yields.codex.workdir}'
              outputContract: review-pass-concerns   # parses the leading marker; engine yields { passed: bool, concerns: string }
          - id: revise
            designId: lab.claude-session
            upstream: [review]
            when: '!${yields.review.passed}'         # spider skips this engine when review yields passed=true
            givens:
              rolePath: '${vars.rolePath}'
              promptTemplate: |
                Original brief:
                ${vars.briefBody}

                A reviewer raised these concerns. Address them and recommit.

                ${yields.review.concerns}
              model: '${vars.model}'
              cwd: '${yields.codex.workdir}'
              executionWrap: '${vars.executionWrap}'
          - id: verify
            designId: lab.shell-command
            upstream: [revise]
            givens:
              command: '${vars.verifyCommand}'
              cwd: '${yields.codex.workdir}'
        resolutionEngine: verify

scenario:
  engineId: spider.graft-rig-template
  givens:
    template: lab.claude-direct-with-review
    givens:
      rolePath: /abs/path/to/roles/artificer.md
      briefPath: /abs/path/to/briefs/variant-a.md
      briefBody: |          # for the revise prompt — the brief body inlined
        ...
      model: sonnet
      executionWrap: production
      reviewerRolePath: /abs/path/to/roles/reviewer.md
      reviewerModel: opus
      verifyCommand: 'pnpm typecheck && pnpm test'
```

### How review approval is detected — the `when` field does the work

The reviewer engine yields a structured `{ passed: bool, concerns: string }` based on a leading `REVIEW: PASS` / `REVIEW: CONCERNS` marker (parsed by `lab.claude-session` when `outputContract: review-pass-concerns` is set on the engine). The revise engine's `when: '!${yields.review.passed}'` clause causes Spider to **skip** the revise engine entirely — no attempt, no spend — when review passed is truthy. From `nsg rig list <trialId>` you see the revise engine in `skipped` status when review passed and `completed` (or whatever it actually finishes as) when it ran.

The downstream `verify` engine still runs regardless of whether revise was skipped — its upstream is `[revise]`, and Spider's `when`-skip semantics propagate completion downstream so the DAG flows through the skipped engine.

### Multiple iterations

For a 2-iteration loop (review → revise → review → revise → verify), declare additional `review_2` / `revise_2` engines in the template, each with `when` clauses gating on the prior review's `passed` field. Templating gets verbose; we'll lift this to a parameterized iteration count if multi-iter trials become common. The wedge for now is to author per-shape templates as needed.

### Cost stamping

Each stage writes a normal `animator/sessions` row stamped with `metadata.trialId` (so probes can filter) and `metadata.stage = '<engine-id-in-template>'`. Existing extraction tools that read `stacks-export/animator-sessions.json` work unchanged — the `metadata.stage` field disambiguates which row was implement vs review vs revise. The archive index row's probe summaries surface a top-level total cost summed across the trial's sessions.

In runlogs, report both the total and the per-stage breakdown so sonnet-with-revise comparisons against opus-monolithic stay honest (you can see whether the savings hold after factoring the revise-pass spend in).

---

## Verification policy

`verifyCommand` is required. Its exit code becomes the trial's
**Tier 1 mechanical** signal:

- exit 0 → Tier 1 PASS
- exit non-zero → Tier 1 FAIL (trial still archives; failure
  surfaces in the archive row's `verify.exitCode` and the
  `verify.tailStderr` excerpt)

Tier 2 (manual diff vs baseline sealed commit) and Tier 3 (deeper
quality review) remain experimenter responsibilities downstream of
extraction, identical to xguild trials.

---

## Codex selection

Same rules as xguild trials — see
[xguild trials / Codex selection](./running-xguild-trials.md#codex-selection).
The local-bare codex flow tolerates unpushed commits;
synthesized-checkpoint branches work fine.

The codex working dir is reused across all stages within a trial
(implement → review → revise) — review reads the implementer's
commit from `HEAD`; revise commits on top of it. There is no
worktree-isolation between stages by design; the goal is to
mirror production where the implement engine and revise engine
share the same draft branch.

---

## Probes

The claude-direct shape ships a trial-scoped sessions probe:

- **`lab.probe-trial-sessions`** — filters the lab guild's
  `animator/sessions` book by `metadata.trialId` and writes the
  matching rows into `lab-trial-stacks-dumps` with
  `sourceBook = 'animator/sessions'`. Summary surfaces per-stage
  costs and a trial total. Materializes to
  `<extract-dir>/stacks-export/animator-sessions.json` —
  byte-identical shape to what the xguild trial's
  `lab.probe-stacks-dump` produces, so existing extraction
  scripts work unchanged.

The general-purpose probes still apply:

- **`lab.probe-trial-context`** — manifest snapshot, framework
  SHA, resolved framework version. Same as xguild.
- **`lab.probe-git-range`** — commits between `baseSha` and the
  codex working dir's `HEAD` after the last stage. Captures all
  commits made by implement and any revise passes.

Skip `lab.probe-stacks-dump` — there's no test guild whose books
to dump. The lab guild's books carry every session that ever ran
(other trials, lab-host plumbing); `lab.probe-trial-sessions`
filters them down to just this trial's rows.

---

## After posting

Same CLI surface as xguild trials. The trial writ type is
`trial`; the rig template is `post-and-collect-default`; the
lab-host spider runs the rig directly (no sub-guild
serialization).

```sh
nsg lab trial-post path/to/manifest.yaml

# Watch the rig flow on the lab host's spider.
nsg writ list --type trial
nsg writ show <trialId>
nsg rig list --writ <trialId>

# After terminal:
nsg lab trial-show <trialId>
nsg lab trial-extract <trialId> --to /tmp/extract
# stage transcripts:
ls /tmp/extract/sessions/
```

Wallclock per trial is dominated by the claude session(s) — no
sub-guild bootstrap or daemon teardown overhead.

---

## A/B trials

Same variant-pair pattern as xguild — two manifests differing only
in the variable under test, posted as separate trials, joined
sanctum-side. See
[xguild trials / Running A/B trials](./running-xguild-trials.md#running-ab-trials)
for the worked discipline; the manifest mechanics are identical
modulo the scenario engine name.

For claude-direct trials specifically, the brief or the role file
(or both) is typically the variant axis. Pin everything else
identically: `baseSha`, `model`, `executionWrap`, `verifyCommand`,
`review` block contents.

---

## Production-fidelity caveats

These are the known drift points between claude-direct and
production rigs. Document any of them in the spec when they
matter for your hypothesis:

- **No spider retry / recovery** — claude-direct doesn't retry on
  transient session failure; the trial just fails. Production
  spider retries up to its budget. If the model produces a
  flaky session, that's a trial outlier, not a production
  outlier.
- **No animator session-record book** — the lab probe captures
  the same fields, but the test guild's `animator/sessions`
  shape is replaced by `lab-trial-claude-sessions`. Existing
  extraction scripts that read `animator/sessions` need a probe-
  shape adapter (or the probe materializes a compatibility
  view).
- **No MCP tools** — even production-faithful EXECUTION_PROLOGUE
  refers to MCP-served tools that aren't reachable here. Most
  implement sessions don't use them, but if a hypothesis depends
  on MCP tool use, claude-direct is the wrong shape.
- **No seal engine** — the implementer commits directly via its
  brief instructions. Whatever commit shape the implementer
  produces is what gets archived. If the brief doesn't ask for a
  commit, the trial archives a clean working dir with no commits
  (uncommitted changes are lost). Briefs for claude-direct
  trials should always end with an explicit commit instruction.
- **No observation lift** — the planning-pipeline observation
  fan-out doesn't run. Observations the implementer would have
  raised via the planning loop are silent.

---

## Known gotchas

(Section will populate as the shape gets exercise. Initial entries
expected: codex working-dir reuse across stages, large-revise-
prompt token bloat from over-eager `${reviewOutput}` substitution,
verify-command timeout interaction with the trial's `timeoutMs`.)

---

## References

- `packages/laboratory/README.md` — apparatus authoring guide
- `packages/laboratory/src/engines/scenario-claude-direct.ts` —
  the engine implementation (once landed)
- [xguild trials companion guide](./running-xguild-trials.md) —
  the full sub-guild flavor when claude-direct isn't enough
