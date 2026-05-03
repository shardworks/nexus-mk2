# Calibration trial 5 — apparatus-fixed Opus baseline (production parity)

**Trial id:** `w-mooouo4t-aceb96daa15e`
**Outer rig:** `rig-mooouoql-f296aee5` (failed at 30-min `waitForRigTerminal` timeout)
**Inner rig (in test guild):** `rig-mooova1a-4b1a0996` (completed 02:00:52)
**Test guild:** `/workspace/vibers/.nexus/laboratory/guilds/x018-calibration-baseline-cartograph-aceb96da`
**Reader-analyst session:** `ses-mooova47-8d679eb4`

## Verdict: spec-defined "branch (a) — trust real-world baseline"

Reader-analyst cost diverged **+12%** from the real-world baseline
(within the spec's ≤15% band). Apparatus is faithful enough to
treat the production session (`ses-mojmj4zc`, $8.08, 14.6 min) as
the reference baseline for X018 variant comparison. **Proceed to
variant trial.**

The apparatus fixes from trial 4 — `settings.model: opus`, plus the
loom-workaround guild-level role overrides for the three astrolabe
roles + role-file copies into `roles/astrolabe.<name>.md` — landed
the planner on Opus with all 20 expected tools authorized. No
permission-drop warnings for the overridden roles in the daemon
log. Reader-analyst ran cleanly in a single attempt.

## Reader-analyst metrics (the only engine X018 cares about)

| metric | real-world (prod, ses-mojmj4zc) | trial 5 (ses-mooova47) | delta |
|---|---|---|---|
| model | claude-opus-4-7 | claude-opus-4-7 ✅ | — |
| role | sage-primer-attended | sage-primer-attended ✅ | — |
| status | completed | completed (1 attempt) ✅ | — |
| **cost USD** | **$8.08** | **$9.04** | **+12%** |
| **wall duration** | **14.6 min** | **15.92 min** | **+9%** |
| input tokens | 113 | 103 | −9% |
| output tokens | 50,057 | 58,487 | +17% |
| cache read tokens | 10,173,478 | 11,928,094 | +17% |
| cache write tokens | 278,947 | 257,943 | −8% |
| authorized tools | (n/a) | **20** ✅ | — |

20 authorized tools (writ-* x6, click-* x4, plan-* x2,
inventory-write, scope-write, decisions-write, observations-write,
spec-write, session-* x3) — full set. The trial-4 tool-drop
diagnosis is closed.

## Plan-doc structural metrics (Tier 1 reference)

These are the reference baseline figures variant trials are checked
against.

| metric | trial 5 |
|---|---|
| inventory word count | 3011 |
| scope item count | 5 |
| decision count | 22 |
| observation count | 3 |
| spec word count | 6830 |
| all four artifacts present and non-trivial | ✅ |

Tier 1 thresholds for the variant: decisions within 22 ± 7 (15–29);
scope within 5 ± 2 (3–7); inventory within 3011 ± 1204 words
(1807–4215). Spec word-count not in the spec's Tier 1 list but
useful as a sanity check.

## Other observations

### Spec-writer rate-limit cascade — irrelevant to X018, relevant to apparatus design

The `spec-writer` engine ran 9 attempts spanning 19:00 → 02:00.
Attempt 1 burned $1.17 over 6.9 min before hitting an Anthropic
rate limit (`status: rate-limited` in the session record).
Attempts 2–8 were 1.1–1.4 sec rate-limit bounces (cost $0).
Attempt 9 at 01:53 finally cleared and produced the spec ($1.67,
7.27 min). Total spec-writer cost across the 9 attempts: $2.83.

This 7-hour wall-time wedge has **no bearing on X018's
reader-analyst measurement** — the reader-analyst is engine #3
in the rig, completed cleanly in one attempt, and its session
telemetry is captured immediately. But it does mean the outer rig's
30-min `waitForRigTerminal` cap timed out the scenario engine, and
in turn cancelled the archive engine — so this trial has no
auto-archive row. The artifacts here were reconstituted manually
by querying the test guild's daemon HTTP API (`/api/session/list`,
`/api/session/show`, `/api/rig/list`, `/api/writ/list`,
`/api/plan/list`) before tearing the test guild down.

### Apparatus design implication

For X018 specifically, the spec-writer downstream of reader-analyst
is **not in scope** — the experiment only measures reader-analyst.
A `lab.plan-only-after-analyst` rig template that resolves at
`inventory-check` (one engine after reader-analyst) would skip the
patron-anima/decision-review/spec-writer/plan-finalize/
observation-lift chain and let the outer rig's archive complete in
~17 min instead of waiting on engines that don't matter. Captured
the design tension in the apparatus discussion separately.

## Cost composition (informational)

| session | engine | role | attempts | cost USD |
|---|---|---|---|---|
| ses-mooova47 | reader-analyst | sage-primer-attended | 1 | $9.04 |
| ses-moopfrkg | patron-anima | (patron-role) | 1 | $0.39 |
| ses-moopintg + retries | spec-writer | sage-writer | 9 | $2.83 |
| ses-mop49psb | (final spec-writer attempt — counted above) | — | — | — |
| **trial total** | | | | **$12.27** |

Note: only the reader-analyst $9.04 line item is the X018-relevant
cost. The remaining $3.22 is downstream pipeline cost the
experiment does not measure.

## Apparatus components used

- `lab.plan-only` rig template (per `lab-operations/running-trials.md`,
  copy-pasted into manifest's `config.spider.rigTemplates`)
- `lab.commission-post-xguild` with `waitForRigTerminal: true`
  (the `lab.wait-for-rig-terminal-xguild` engine landed in
  `packages/laboratory/src/engines/scenario-xguild.ts` for spec-only
  trial support — mandate writs never seal in plan-only, so
  writ-based wait would always time out)
- `lab.codex-setup` SHA-pinned at `aff280e75add02bd25e1af0e9467e8a81bfbcd41`
  (parent of cartograph commission's sealed commit `607b572`)
- Loom workaround: guild-level `loom.roles` overrides for
  `astrolabe.sage-primer-attended`, `astrolabe.sage-primer-solo`,
  `astrolabe.sage-writer` (kit-validator drops permissions
  referencing `clerk` / `ratchet` because astrolabe's `requires`
  lookup happens before astrolabe is fully registered) — combined
  with role `.md` files copied to `roles/astrolabe.<name>.md` (the
  dotted-name convention loom uses to resolve guild-level role
  instructions)

## Files in this extract

- `manifest.yaml` — captured trial config (calibration-baseline.yaml at trial-post time).
- `NOTES.md` — this file.
- `produced-spec.md` — the spec the planner wrote (240 lines, 6830 words).
- `produced-inventory.md` — the inventory the reader-analyst produced (537 lines, 3011 words).
- `test-guild-export/` — manually-pulled snapshots of the test guild's books at extraction time:
  - `animator-sessions.json` — full session telemetry (last 50)
  - `animator-sessions-summary.json` — flattened metrics view
  - `spider-rigs.json` — inner rig state
  - `clerk-writs.json` — writs in the test guild (cartograph mandate + observation set + 3 promoted-mandate children)
  - `astrolabe-plans.json` — full plan doc (inventory + scope + decisions + observations + spec)
  - `guild.json` — captured guild config (verifies settings.model=opus and role overrides)
  - `role-sage-primer-attended-as-injected.md` — exact role file the test guild loaded (md5-matches upstream)
