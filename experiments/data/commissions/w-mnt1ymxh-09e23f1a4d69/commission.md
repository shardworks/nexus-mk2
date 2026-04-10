# DESIGN BRIEF — `nsg writ list` result-truncation & pagination UX

**Status:** design brief — needs decomposition and option analysis before implementation. Route to Astrolabe for structured decomposition once it's ready to pick up briefs.

## Problem

`nsg writ list` has a default `--limit` of 20 and supports `--offset` for pagination. The output format today is a flat JSON array of writ objects. There is **no indication in the response** that the result set was truncated — a caller receiving exactly 20 writs has no way to know whether that's all the writs matching the query or the first page of many.

This is not a theoretical problem. It bit a Coco session on 2026-04-10: Coco queried open quests, got 20 back, and confidently reported "20 open quests, here's the whole board." The patron knew the real number was higher (it was 38). Only on push-back did Coco re-query with `--limit 500` and discover she'd been operating on a truncated slice.

The failure mode has three properties that make it dangerous:

1. **Silent.** No stderr warning, no metadata field, no sentinel in the output.
2. **Plausible.** A result of exactly `limit` items is indistinguishable from a genuine complete result of that size.
3. **Downstream.** Once a caller (agent or human) has internalized the partial result, subsequent reasoning compounds the error — filtering, grouping, recommendations, and decisions all inherit the wrong denominator.

The same class of issue likely applies to other Clerk/guild list commands (`events list`, `writ children`, etc.) and to any future list-style `nsg` surface. This brief is scoped to `writ list` as the concrete case; any general mechanism adopted should be designed with reuse in mind.

## Goals

A solution should accomplish at least:

- **Detectability.** Any caller that receives a truncated result can tell — without a second query — that more results exist.
- **Machine-legibility.** The signal must be present in JSON output, not only in human-readable text. `nsg` is called from scripts, from commission.sh, from hooks, and from agents reading CLI output.
- **Low-friction correctness.** The common case — "list everything I care about" — should be easy to express correctly. A caller who writes the naive command should not silently get a partial result and not know.
- **Stability.** Any output-shape change must be considered against the stability contract of `nsg` as an inter-process interface. Agents parse this output; breaking changes ripple.

A solution should avoid:

- Requiring every caller to remember to check a specific field before trusting the result (the mistake is *forgetting* to check).
- Unbounded result sets by default (large guilds will have thousands of writs; a default `--limit 100_000` is not acceptable).
- Proliferating flags without a coherent story (`--all`, `--count`, `--show-truncation`, `--warn-on-limit` — four flags that each solve a piece of the problem is worse than one design decision).

## Option space

These are starting points for Astrolabe's decomposition, not a ranked menu. Each has tradeoffs; combinations are likely.

### A. Add a metadata envelope to list output

Wrap the list in an object: `{ items: [...], total: N, limit: 20, offset: 0, truncated: true }`. The caller always has `total` and `truncated` in hand.

- **Pro:** Structural, machine-legible, self-describing, idiomatic REST.
- **Con:** Breaking change for every existing caller that does `nsg writ list | jq '.[]'` — including Coco's own current workflows. Requires a migration story.

### B. Emit a stderr warning on truncation

When `returned == limit`, print a line to stderr like `warning: result truncated at limit=20; pass --limit N or --offset to page`.

- **Pro:** Zero change to stdout shape. Purely additive. Agents consuming stdout JSON are unaffected. Humans running the command interactively see the warning.
- **Con:** Stderr is easy to ignore in scripts and sub-shells. Agents reading CLI tool output usually only see stdout. Doesn't help the machine-legibility goal.

### C. Require `--all` for unbounded queries, default to erroring on truncation

Change the default: if the query would return more than the (possibly higher) default limit, error out with a message explaining how to either page or pass `--all`.

- **Pro:** Fails loudly. Impossible to silently get partial data.
- **Con:** Breaks every currently-working invocation. `--all` on a large guild is potentially a lot of data.

### D. Raise the default limit substantially (e.g. 500 or 1000)

Band-aid: make truncation rare enough that the failure mode is less likely to bite in practice.

- **Pro:** One-line change. No design work. Mostly backward-compatible (existing callers just get more data).
- **Con:** Doesn't solve the underlying problem. A guild with 2000 writs still has the same trap, just shifted. Pure deferral.

### E. Add `--count` or `--total` mode

A separate invocation shape that returns just the count, so callers can explicitly check size before or after listing.

- **Pro:** Opt-in, no breaking change.
- **Con:** Two-query pattern for what should be one question. Doesn't help the forgetting case.

### F. Auto-paginate in the CLI

When no `--limit` is passed, the CLI itself pages under the hood and emits the full result. Explicit `--limit` disables this.

- **Pro:** Naive command "just works." The common case is the easy case.
- **Con:** Potentially expensive on large guilds. Caller has no way to cap the cost without knowing to pass `--limit`.

### G. Hybrid: default JSON envelope for new, but keep flat array under a flag

Introduce `--output json-envelope` (new, recommended) and `--output json-array` (legacy, current default initially, deprecated over time).

- **Pro:** Path to (A) without an immediate breaking change.
- **Con:** More surface area during the transition. Two output shapes to maintain.

## Design questions for Astrolabe

1. **Which option (or combination) best meets the goals above?** Astrolabe should evaluate each against *detectability*, *machine-legibility*, *low-friction correctness*, and *stability*, and recommend one.
2. **Is this a `writ list` change, a `nsg list-style commands` change, or a framework-wide CLI convention?** The right blast radius depends on how many commands have the same shape today and how many will in the future.
3. **What's the migration story for existing callers?** Enumerate: `commission.sh`, Coco's startup/skill queries, commission-log queries, tests, agent hooks, Laboratory queries. Each one will need to be checked and possibly updated.
4. **Does this interact with `--offset`?** If we envelope the response, should we also surface `next_offset` / `has_more` as first-class fields?
5. **What's the behavior under `--status` multi-value** (the companion mandate in flight)? If multiple statuses are ORed and the union exceeds limit, the same truncation trap applies — ensure the design covers that.
6. **Does the solution generalize to event streams?** `nsg` is likely to grow event/stream commands; a list-result envelope convention should be compatible with cursor-based streaming.

## Deliverable shape

A short design document answering the questions above and recommending one concrete approach, with:

- Chosen design (diagrams / JSON examples as needed).
- Migration plan covering each known caller.
- Staged implementation plan (framework → clerk → other plugins → caller updates).
- Acceptance criteria suitable for turning into implementation mandates.

## Pointers

- Current implementation: `nsg writ list` in `/workspace/nexus/packages/plugins/clerk/src/` — find where the CLI command is registered and the query is built.
- Companion mandate (in flight): `w-mnt1touo-da5924184847` — multi-value `--status` support. The two designs should not conflict.
- Callers to audit:
  - `/workspace/nexus-mk2/bin/*.sh` — any script calling `nsg writ list` or similar.
  - `/workspace/nexus-mk2/.claude/skills/quests/SKILL.md` — documents a `writ list` query Coco runs at startup.
  - Laboratory apparatus — queries the Clerk for commission/session data.
  - Tests in `packages/plugins/clerk/src/clerk.test.ts` and `packages/framework/cli/src/program.test.ts`.

## Incident reference

Coco session 2026-04-10 — a session in which the patron asked "what are we working on?" and Coco used the multi-flag `nsg writ list --type quest --status ready --status active --status waiting` pattern from the quests skill, then a follow-up `--limit`-less query. Two bugs hit in sequence (multi-status single-value plus default-limit truncation), causing a wrong initial answer that the patron had to correct twice. That session is the motivating incident for both the companion mandate and this brief.