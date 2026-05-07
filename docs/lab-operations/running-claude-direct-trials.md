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

## Manifest shape

Minimal:

```yaml
slug: x023-variant-a
title: X023 — variant A (no review)
description: |
  Tests <intervention> on <rig>. Implement-only, no review pass.

frameworkVersion: '0.1.301'

fixtures:
  - id: codex
    engineId: lab.codex-setup
    givens:
      upstreamRepo: /workspace/nexus
      baseSha: 0e1e81f4a219179fd264625b869e12bd00778365

scenario:
  engineId: lab.claude-direct
  givens:
    rolePath: /abs/path/to/roles/artificer-variant-a.md
    briefPath: /abs/path/to/briefs/variant-a.md
    model: opus
    verifyCommand: |
      pnpm --filter @shardworks/reckoner-apparatus build && \
      pnpm --filter @shardworks/reckoner-apparatus test
    timeoutMs: 5400000   # 90 min cap on the whole stage chain

probes:
  - id: context
    engineId: lab.probe-trial-context
    givens: {}
  - id: commits
    engineId: lab.probe-git-range
    givens: {}
  - id: session
    engineId: lab.probe-claude-session
    givens: {}

archive:
  engineId: lab.archive
  givens: {}
```

### `lab.claude-direct` givens

| field | type | required | meaning |
|---|---|---|---|
| `rolePath` | abs path | yes | role file → `--system-prompt-file` |
| `briefPath` | abs path | yes | brief content → piped to claude's stdin |
| `model` | string | yes | claude model id (e.g. `opus`, `sonnet`, `claude-sonnet-4-5`) |
| `verifyCommand` | string | **yes** | shell command run after the last session, in the codex working dir; exit code + tail captured into the archive |
| `timeoutMs` | number | no (default 90 min) | wallclock cap on the whole stage chain |
| `executionWrap` | enum | no (default `production`) | `production` carries the implement-engine PROLOGUE/EPILOGUE; `bare` runs role + brief alone |
| `review` | object | no | opt-in review loop (see below) |

`verifyCommand` is **required** by convention — the claude-direct
shape gives up the seal engine's automatic build/test gating, so
the verify command is the only Tier-1 mechanical signal we have.
If a calibration trial truly needs no verify (apparatus smoke
test), pass `verifyCommand: 'true'` to make the gating explicit.

---

## Review → revise loop

By default a claude-direct trial is one implementer session and
nothing else. To preserve production's review→revise dynamic —
which matters especially when the implementer model is
sonnet-class and benefits from a revision pass — opt in with a
`review` block:

```yaml
scenario:
  engineId: lab.claude-direct
  givens:
    rolePath: roles/artificer.md
    briefPath: briefs/variant-a.md
    model: sonnet
    review:
      reviewerRolePath: roles/reviewer.md
      reviewerModel: opus
      maxIterations: 1
      revisePromptTemplate: |
        ${brief}
        ---
        A reviewer raised these concerns. Address them and recommit.
        ---
        ${reviewOutput}
    verifyCommand: 'pnpm typecheck && pnpm test'
```

The engine runs a sequential chain in the same working dir, each
step a fresh claude session with its own cost stamp:

```
implement(role, brief)
  → commit_1, transcript_1, session_1
loop while iter < maxIterations:
  review(reviewerRole, prompt-citing-the-implementer's-commit)
    → review.text, session_(2k)
  if review.text begins with `REVIEW PASSED` (case-sensitive):
    break
  revise(role, revisePromptTemplate)
    → commit_(n+1), transcript_(n+1), session_(2k+1)
verify()
  → exit code + tail
```

### Review-block givens

| field | type | required | meaning |
|---|---|---|---|
| `reviewerRolePath` | abs path | yes | role file for review + revise |
| `reviewerModel` | string | yes | model id for review sessions |
| `maxIterations` | number | no (default 1) | upper bound on review/revise cycles |
| `revisePromptTemplate` | string | yes | template for the revise session's prompt; `${brief}` and `${reviewOutput}` are substituted |
| `passToken` | string | no (default `REVIEW PASSED`) | exact line that signals no concerns |

### How review approval is detected

The reviewer is instructed via prompt template to emit
`REVIEW PASSED` on its own line if no concerns, otherwise to
output a concerns list. The engine matches the pass token
literally on its own line; anything else is treated as the
concerns body to forward to revise.

This is intentionally crude — no JSON parsing, no structured
output schema — because every observed parse-failure mode in the
xguild reviewer has been about the model not honoring the schema.
A literal-token convention is the smallest reliable signal.

If the reviewer model still doesn't honor it, surface a session
note in the trial archive (`reviewParseAmbiguous: true`) and
default to "concerns present" — the engine prefers a wasted revise
pass over a false-PASS that hides a quality regression.

### Cost stamping

Each session gets its own row in `lab-trial-claude-sessions` with
its `stage` field set to one of `implement`, `review_1`,
`revise_1`, `review_2`, `revise_2`, ... The archive index row
includes a top-level `total` cost summed across all stages.

In runlogs, report both the total and the per-stage breakdown so
sonnet-with-revise comparisons against opus-monolithic stay
honest (you can see whether the savings hold after factoring the
revise-pass spend in).

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

The claude-direct shape ships a per-session probe:

- **`lab.probe-claude-session`** — captures one row per stage
  session (`implement`, `review_n`, `revise_n`) into
  `lab-trial-claude-sessions` with `costUsd`, `tokenUsage`,
  `transcriptPath`, `stage`, `iteration`, `durationMs`, `turns`.
  Materializes to `<extract-dir>/sessions/{stage}.transcript.jsonl`
  plus a `sessions-summary.json` index.

The general-purpose probes still apply:

- **`lab.probe-trial-context`** — manifest snapshot, framework
  SHA, resolved framework version. Same as xguild.
- **`lab.probe-git-range`** — commits between `baseSha` and the
  codex working dir's `HEAD` after the last stage. Captures all
  commits made by implement and any revise passes.

Skip `lab.probe-stacks-dump` — there's no test guild whose books
to dump.

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
