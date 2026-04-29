# Reckoner — current state and forward strategy

## Headline finding

**The Reckoner is not out of date. It is actively being built.** The visible "stubs" in `packages/plugins/reckoner/src/` (the hardcoded `'accepted'` in `evaluateScheduler`, the comment "v0 of the CDC handler does not emit deferred rows") are *intentional placeholders* for two commissions currently in-flight. The implementation lag is expected and is closing imminently.

Where I went wrong in the previous response: I read the live code, saw the placeholders, and concluded the apparatus was behind the design. What I missed was that two open writs are actively replacing those placeholders. Survey first, alarm later.

## Current state

### Recently shipped (sealed, code in tree)

| Writ | Title | Conclusion |
|---|---|---|
| w-mohuvk8x | Clerk plugin-keyed `ext` slot | Petition data layer |
| w-mohuvn8h | Reckoner core: registry/config/helpers/types | Kit-static petitioner registry, source-id grammar, decline-reason enum, accept/decline-only CDC handler |
| w-mohuvshq | Vision-keeper worked example | Reference petitioner |
| w-moepkalv | Cartograph apparatus scaffold | Vision/charge/piece writ types + companion books |
| w-moera46h | Cartograph CLI | Patron authoring loop closed |
| w-moix2b56 | `spider.follows` → `depends-on` rename | Framework-level link kind, Clerk-namer-primacy principle |
| w-moix4pe8 | Clockworks kit-contributed standing orders | Substrate for kit-shipped tick |
| w-moiy7bmo | Scheduler kit-contribution registry | Pluggable scheduler interface + two defaults |
| w-moizema2 | `reckoner.petition()` stamp-only overload | Draft-then-publish ergonomics |

### In-flight (open phase, code not yet merged)

| Writ | Title | What it ships |
|---|---|---|
| **w-moiy8hkv** | Periodic tick for the Reckoner | Replaces the CDC-only handler with a tick-based scheduler. Each tick: re-resolve scheduler config, query held petitions, build SchedulerInput, transition writs per decision, append Reckonings rows. Also: removes the always-approve stub. |
| **w-moiyh0jz** | Reckoner dependency-aware consideration | Reads outbound `depends-on` links during per-petition evaluation; classifies targets via writ-type config; emits **deferred** rows with `deferReason: 'dependency_pending' \| 'dependency_failed'` (extending the enum). Settles cycle-handling by deferral. |

These two are the actual gap-closers between the architecture doc and the live code. **Both must land before the staleness commission (this conversation's click) can dispatch.**

### Concluded clicks awaiting commission

**None.** Every concluded click in the Reckoner subtree has either been dispatched (most of them) or has had its conclusion record explicit dispatch via existing in-flight writs. There is no backlog of "designed but not commissioned" work.

### Live clicks (design in progress)

Eight live clicks remain in the Reckoner subtree. Triaged by readiness:

| Click | Title | Readiness |
|---|---|---|
| **c-moixpj1l** | Deferred-petition staleness diagnostic | **Converging now** (this conversation). Ready to commission once the in-flight w-moiyh0jz lands. |
| c-moiu8pm9 | Initial petition timing — when does first review-vision mandate land for a new vision? | Three options enumerated in click body; the conclusion-favorite is (c) vision-keeper subscribes to CDC on `book.cartograph.visions.created`. Tractable design conversation; could close in one session. |
| c-moiu8tm4 | Periodic re-evaluation of long-lived cartograph nodes | v0 lean already in click body (manual `nsg vision review <id>` command). Could close in one session. |
| c-moivkc4y | Output contract for review rigs | Affects observability/replay; tractable but blocked behind vision-keeper apparatus runtime existing. |
| c-moivkfgb | Priority dimension cascade — bound child priorities by parent? | Click body already says "v0: skip the bounding mechanism." Effectively pre-concluded; one session to ratify. |
| c-mod9a9un | Multi-product / plural-petitioner priority allocation | Future work; no current pressure (single-product guild today). Hold. |
| c-mod9ab0i | Petition dedup and conflict | Future work; designed-out per c-mod9a48y context. Hold. |
| c-mohd0luw | Petitioner-claim calibration loop | Cross-cuts laboratory + Reckoner; calibration data needs first to accumulate. Hold. |

### Parked clicks

Five parked clicks, all with explicit unblock conditions:

| Click | Title | Unblock condition |
|---|---|---|
| c-moixb74x | Operator-configurable Reckoner tick cadence | Real operator need surfaces (multi-environment tuning, cost-driven slowdowns, calibration loop wanting backpressure) |
| c-mof65was | WIP-ceiling shape (single number vs per-petitioner vs priority-weighted) | Operational pressure on the v0 single-number cap |
| c-mod53p9w | Dogfood Nexus as the first product | After authoring machinery is settled |
| c-mod53rbz | How is Nexus's first product-vision captured | After dogfooding decision lands |
| c-mod53rpa | Cross-product dependency edges in writ data model | When second product emerges |

## Why "out of date" was the wrong framing

The pattern that made the apparatus *look* out of date:

1. **Architecture docs settled before implementation** — the Reckonings book design (`docs/architecture/reckonings-book.md`) and apparatus contract (`docs/architecture/apparatus/reckoner.md`) describe the full deferred-row model with rich `deferReason` metadata. The live code only emits `accepted`/`declined`. The **gap is intentional**: design first, implementation second, in tight succession. The CDC-handler-only v0 was deliberately scoped to ship a working spine before the tick-based replacement landed.

2. **Multiple commissions in-flight at once** — the April 28 design burst (yesterday in absolute terms) generated a tightly-coupled batch: the Reckoner.petition() helper, the dependency-aware consideration design, the depends-on rename, the staleness diagnostic, and the periodic tick. Some shipped same-day; others are still working through the build pipeline. A snapshot taken mid-burst sees a transient gap.

3. **No persistent design-without-commission backlog** — every concluded design has a commission writ id in its conclusion. The conclusion field carries the dispatch status as load-bearing data. Reading conclusions front-to-back makes this clear; reading code-only makes it look like designs are evaporating.

The takeaway for future surveys: **always cross-reference click conclusions against `nsg writ show <id>` for the dispatched commission**. The conclusion-with-writ-id pattern is the join key.

## Forward strategy

### Immediate (this session / next session)

1. **Converge `c-moixpj1l` (this click)** — staleness design. Capture in `staleness.md`, then commission. Adds `depends-on` link to **w-moiyh0jz**.

2. **Watch w-moiy8hkv and w-moiyh0jz to completion.** These are the two open commissions blocking the staleness work and most other Reckoner-dependent design. No action needed unless they stall.

### Near-term (next 1–3 sessions)

3. **Close c-moivkfgb** (priority dimension cascade) — the click body already says "v0: skip." Ratify and conclude in a brief session; no commission needed (decision is "no mechanism").

4. **Close c-moiu8tm4** (periodic re-evaluation of cartograph nodes) — v0 lean already names the manual command shape. One session to ratify, then commission a small CLI addition.

5. **Close c-moiu8pm9** (initial petition timing) — three options enumerated; favored option named. One session to confirm, then a small commission for the vision-keeper-side CDC observer.

6. **Close c-moivkc4y** (review-rig output contract) — needs the vision-keeper-apparatus package to exist first. May need an upstream commission to scaffold that package before this design can land. **Open question for Sean: is the vision-keeper apparatus scaffold queued anywhere, or is it an unstated next-up?**

### Holding pattern

7. **Park c-mod9a9un, c-mod9ab0i, c-mohd0luw** — no current pressure; they wait for a triggering condition (multi-product reality, observed dedup conflicts, accumulated calibration data). Track as "live but holding" — they're not blocking anything.

### Maintenance

8. **Update click parent (c-mod99ris) status** — the umbrella Reckoner click is still `live`. Every direct child decision is concluded. The umbrella may be ready to conclude with a short summary pointing at the in-flight implementing writs and the remaining children. Worth a quick decision in a future session.

## Recommended commission posting sequence

Once the staleness design converges:

```
[currently open]
w-moiy8hkv  Periodic tick                          ← in flight
w-moiyh0jz  Dependency-aware consideration         ← in flight, depends-on rename satisfied

[next, in this order]
1. <staleness>         depends-on -> w-moiyh0jz
2. <init petition>     depends-on -> vision-keeper-apparatus scaffold (if not yet posted)
3. <periodic review>   no dependencies; can post any time
```

## Action items / open questions for Sean

- **Vision-keeper apparatus scaffold** — the petitioner-runtime split (c-moiu7yc1) said the runtime moves to a new `@shardworks/vision-keeper-apparatus` plugin separate from `@shardworks/cartograph-apparatus`. Has that been commissioned anywhere I missed? If not, it's the unstated prerequisite for several downstream clicks.

- **c-mod99ris umbrella** — concur on concluding once the in-flight writs land?

- **c-moivkfgb / c-moiu8tm4 / c-moiu8pm9** — these can probably each close in a quick session given how settled the click bodies already are. Worth queuing for a focused "close out the easy ones" session?
