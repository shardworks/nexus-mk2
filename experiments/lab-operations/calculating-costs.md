# Calculating Costs

How session and rig costs are captured, what the dollar figures
actually mean under our subscription model, and how to keep
experiment cost numbers comparable across trials.

---

## TL;DR

- The `costUsd` field on every session and rig is **read directly
  from claude-code's NDJSON `result` message** (`total_cost_usd`).
  The framework does no math; whatever Claude prints, we store.
- We run on a **Claude Pro Max 20x subscription**, not à-la-carte
  API. The stamped `costUsd` is therefore not money we pay — it
  is Claude Code's local **API-equivalent estimate**.
- Manually recomputing cost from `tokenUsage` × public Opus 4
  list rates produces a number **~3.0× higher** than the stamped
  value, consistently across well-behaved sessions. This is a
  systematic gap, not noise.
- **In runlogs, use the stamped `costUsd` as the canonical
  experiment-cost metric.** Don't mix stamped figures and manual
  recalculations in the same comparison — that's the
  apples-to-oranges trap that sparked the X021 cost-concern
  alarm.

---

## Two cost sources, one of them in the DB

There are two distinct mechanisms that produce dollar figures for
a session, and they disagree by a fixed factor.

### (A) Stamped `costUsd` — what we store

Path:

1. Claude CLI runs with `--output-format stream-json --verbose`.
2. At session end, Claude emits a `result` NDJSON message with
   `total_cost_usd` (a single dollar number) and a `usage` block
   (input / output / cache_read / cache_write tokens).
3. `parseStreamJsonMessage`
   ([`claude-code/src/index.ts:278`](../../../nexus/packages/plugins/claude-code/src/index.ts))
   does `acc.costUsd = msg.total_cost_usd` — a straight
   assignment, no math.
4. The babysitter forwards the value through `session-record`
   to `SessionDoc.costUsd` in the `animator/sessions` book.
5. `nsg rig show` aggregates by summing `SessionDoc.costUsd`
   across all engine sessions in the rig (per `enrichRigView`
   in `spider/src/rig-view.ts`).

This is the source for every `costUsd` field in the database, and
for every dollar figure surfaced by `nsg rig show`,
`nsg session show`, the Spider dashboard, lab archive rows, and
any tool that reads the books.

### (B) Manual recalculation from token counts

This is **never done by the framework**. Some experiment runlogs
have done it by hand: take `tokenUsage.{inputTokens, outputTokens,
cacheReadTokens, cacheWriteTokens}` and multiply by published
Opus 4 list rates with the prompt-cache discount.

It looks like: "Estimated cost (Opus, 5-min cache TTL) $77.30."

This produces a number that is **systematically ~3× higher** than
the stamped figure. See the next section for what's going on.

---

## What does `total_cost_usd` mean on Pro Max 20x?

We do not pay per-token. The Pro Max 20x subscription is a flat
monthly fee with an opaque usage cap. So when Claude Code reports
`total_cost_usd`, it is **not a charge against our account** —
no money moves at session end.

Instead, the field appears to be Claude Code's local
**"what this would have cost on the API"** estimate, computed
from a pricing table compiled into the CLI. It is advisory — a
proxy for usage intensity — not a billed amount.

We confirmed this empirically by sampling 30 sessions across the
vibers guild and computing manual recalc with Opus 4 list rates:

| | observed |
|---|---|
| Sessions with ratio ≈ exactly 3.00× | 21 / 30 |
| Sessions within 2.87–2.98× | 4 / 30 |
| Outliers (rate-limit truncation, very old sessions, anomalies) | 5 / 30 |

The 3.00× factor is **far too consistent to be model-mixing
noise, subagent-uses-cheaper-model, or a token-counting bug**
(any of those would scatter). It's a systematic constant
embedded in claude-code's pricing computation.

Two plausible explanations, neither of which we can verify from
outside Claude Code:

1. **The `claude-opus-4-7` SKU is priced internally at ~1/3 of
   public Opus 4 list rates** in claude-code's pricing table.
   Anthropic ships internal model variants with their own price
   points; the CLI pricing table reflects those, not the
   marketing-page list.
2. **Pro/Max plans use an internal accounting rate** that
   discounts the API-equivalent figure to reflect subscription
   value (Max plans nominally provide "5–20× the value" of the
   underlying list price; a ~3× discount factor lands in that
   ballpark).

The practical takeaway is the same regardless of cause: **the
stamped `costUsd` is a number Anthropic computes by their own
rules, not a check we cut, and not a number we can easily
re-derive from token counts**. Treat it as an Anthropic-defined
opaque metric.

---

## What the subscription cap *actually* constrains

This document deliberately does **not** try to translate
`costUsd` into "subscription budget consumed." We do not have a
public meter for the cap, and Anthropic's accounting on the
back-end is not exposed to Claude Code locally. What we know:

- The cap is real — sessions can be rate-limited (we have
  many `status: 'rate-limited'` sessions on record).
- The relationship between `total_cost_usd` and remaining
  subscription headroom is not documented and may be non-linear.
- Empirically, we can run trial sequences that sum to many
  thousands of "stamped dollars" inside a single billing cycle
  without exhausting the cap, which would not be possible if
  the cap were measured in literal API dollars.

So the stamped `costUsd` is best understood as a **comparable
intensity metric**, not as a subscription-consumption metric.
For "are we close to the cap?" questions, watch for actual
rate-limit terminations, not for stamped dollars climbing.

---

## Practical implications for experiments

This is the operationally important part.

| comparison | apples-to-apples? | notes |
|---|---|---|
| Stamped (A) vs. stamped (A) across trials | **YES** | both go through the same claude-code pricing table |
| Manual recalc (B) vs. manual recalc (B) | **YES** | both use the same public list rates |
| **Stamped (A) vs. manual recalc (B)** | **NO** | ~3× systematic skew |

The X021 runlog's "lab is too expensive" framing was exactly the
(A)-vs-(B) mistake: the lab implementer was reported as $77.30
(B-side, manually recomputed from transcript token counts because
the lab session never wrote a stamped figure — it failed mid-way),
and that was compared against the production rig's $47.26
(A-side, stamped). Both implementer sessions actually consumed
about the same intensity; the apparent 60% premium was bookkeeping.

### Recommendation: stamped (A) is the canonical metric

Use the DB-stamped `costUsd` as the default cost figure in every
runlog, table, and comparison. Reasons:

1. **Automatic and uniform.** Every completed session has it.
   No manual arithmetic, no opportunity for transcription drift.
2. **Internally consistent.** Two sessions with the same model
   produce comparable stamped numbers regardless of whether their
   token mixes lean toward output, cache reads, or cache writes.
3. **What Anthropic uses.** The cap meter is presumably keyed off
   the same computation Anthropic's billing system uses; the
   stamped value is the closest local proxy we have.
4. **Manual recalc is noisier, not more accurate.** It depends on
   guessing the model's true rates (which we don't know for
   `claude-opus-4-7`) and on getting the cache TTL mix right
   (5-minute vs 1-hour cache_write rates differ).

### When to use manual recalc

There is one legitimate use: **token-efficiency studies under
hypothetical pricing** (e.g., "what would this trial cost on
Sonnet 4 with 1-hour caches?"). Make these explicit:

- Always label the calculation: "Sonnet 4 list, 5-min cache TTL"
- Never put the manual figure in the same column as a stamped
  figure
- Cite both numbers if the comparison crosses calculation
  methods, and call out the ratio so future readers don't trip

### What if the session never stamped a cost?

Some sessions exit without delivering a `result` message — most
commonly **rate-limit terminations** and **timeout/kill paths**
(this is what happened to the X021 trial 1 implementer). In
that case `SessionDoc.costUsd` is unset and `tokenUsage` may be
unset too.

**The default response is to treat the session as un-measured
for cost.** Put `—` in the runlog's cost column and add a note
explaining what went wrong. A broken trial does not get a guess
in its cost column; an estimate that gets read alongside stamped
neighbours is the apples-to-oranges error this guide exists to
prevent.

The temptation to fill the gap with a manual recalc from the
saved transcript should be resisted. The factor is well-defined
(~3× off from the stamped scale), so applying it converts a
known-uncertain number into a falsely-precise one and
contaminates the rest of the comparison.

The narrow exception is when the manual figure is the entire
point of the row — e.g., a token-efficiency study where you are
deliberately asking "what would this have cost on Sonnet 4 with
1-hour caches?" In that case the row is studying B-side
arithmetic from the start; flag it explicitly and keep it out of
A-side comparison tables.

---

## How to read the cost field in `nsg rig show`

The current display for an aggregated rig looks like:

```
cost: $47.2626 (402 input, 253893 output)
```

This is misleading, and the framework knows it
(see clicks `c-mopzz9p7` and `c-mopzzalm` for the pending
fixes). The "402 input, 253893 output" line excludes
**cache-read and cache-write tokens entirely**, which on a
Claude Code session typically dominate token volume by 100–1000×.
That implementer session actually pushed ~41 million tokens
through the model, almost all served from cache.

Until the projection is fixed, treat the input/output line as
"new (uncached) tokens only" and don't try to reconcile it
against the dollar figure.

---

## Sanity checks for runlog authors

Before publishing a cost number in an experiment runlog, ask:

1. **Where did this number come from?** If you typed it from
   `nsg rig show` or `nsg session show`, it's stamped (A). If
   you computed it from a token table, it's manual recalc (B).
2. **What other numbers am I comparing it against?** They must
   all be from the same source. Mixing is the bug.
3. **If the session failed to stamp**, did I note that the cost
   column is "—" rather than an estimate? An estimate in a
   stamped column is the same apples-to-oranges error.

---

## References

- [`packages/plugins/claude-code/src/index.ts`](../../../nexus/packages/plugins/claude-code/src/index.ts) — `parseStreamJsonMessage`, lines 277–292
- [`packages/plugins/animator/src/animator.ts`](../../../nexus/packages/plugins/animator/src/animator.ts) — `getSessionCosts`, line 472
- [`packages/plugins/spider/src/rig-view.ts`](../../../nexus/packages/plugins/spider/src/rig-view.ts) — `enrichRigView`, the rig-level aggregator
- Click `c-mopzz9p7` — fix the SessionCost projection to expose
  cache tokens
- Click `c-mopzzalm` — fix `enrichRigView` to sum across all
  engine attempts (not just the last)
