# Planner Quality Under Autonomous Operation — Vision

> **Status:** draft v1 — starting place for discussion
> **Author:** Coco (with Sean)
> **Date:** 2026-04-18
> **Related top-level:** `c-mo1mq8ry` (Unlock autonomous hopper-based operation)

---

## The goal

Get Nexus to a place where the planner (Astrolabe) can run end-to-end on a brief without Sean being the quality bottleneck.

Today, Sean *is* the bottleneck:

- He reads every plan doc to catch contradictions with the brief.
- He catches concluded-click overrides by hand (e.g. w-mo35s0fo overriding c-mo33dxf5).
- He judges whether the planner's auto-decisions are reasonable.
- He is the only one who verifies delivered features actually work.
- He notices the follow-up work a commission implies and commissions it himself.

Every one of those is a place the system *could* be doing more. The five umbrellas below are a coherent attack on those bottlenecks.

---

## The four umbrellas (plus one neighbor)

We have four live top-level planner-quality threads. They are not redundant — each addresses a distinct failure mode or capability gap.

**The centerpiece is (1) evidence-based decisional machinery.** That's where the real ambition lives — teaching the system to decide *well*, not just defensively. The other three umbrellas support it (fidelity guards inputs, scope structures outputs, verification measures outcomes).

A fifth thread — **observations→commissions** — lives under the autonomy umbrella instead, as a child of "system self-improvement" (`c-mo3hinjt`). It's a neighbor of this vision but not a part of it; noted at the end for completeness.

### 1. Evidence-based decisional machinery — `c-mo3d6lyd` ⭐ *centerpiece*

**The question:** When the planner genuinely *does* need to decide something, how does it decide *well* — on evidence, not vibes?

Today the planner decides by one-shot LLM judgment based on whatever happens to be in the prompt. That's fine for low-stakes tiebreakers but inadequate for decisions that shape architecture.

**The nine children group into three layers:**

**Evidence gatherers** — produce inputs for decisions
- Canon-research agent (c-mo3d6pkh) — project-internal: docs, ADRs, prior commissions, codebase
- External-research agent (c-mo3d6q6m) — adjacent projects, articles, case studies

**Deliberation mechanisms** — produce decisions
- Experts panel (c-mo3d6rf3) — diverse-perspective animas weighing in
- Steelman + arbiter (c-mo3d6sl0) — per-option advocates, then a judge
- Patron Anima (c-mo3d6trd) — socratically-trained standin carrying Sean's taste
- Bold Agent + boldness budget (c-mo3d6v8o) — chartered solo bold calls, reversibility-weighted
- Arbitrary-choice mechanism (c-mo3d6wol) — random/election for confirmed-indifferent decisions

**Meta / routing** — decide *how* to decide
- Ambiguity score (c-mo3d6xwb) — classify the decision
- Cost-weighted planning (c-mo3d6yvo) — trade disambiguation cost against ambiguity reduction

Evidence gatherers *feed* deliberation mechanisms. The meta layer *routes* between them based on how much effort a decision deserves.

**Shape:** generative. Biggest long-term payoff. Most ambitious. This is the point of the exercise.

**Where to start:** **Patron Anima** — cheapest (single anima, no infrastructure), standalone, and closest to what Sean does today. It directly replaces the bottleneck. Canon-research is a strong second parallel track but slower to visible payoff (indexing infrastructure). Defer ambiguity-score routing until we have 2-3 deliberation mechanisms to route between.

### 2. Brief→planner fidelity — `c-mo38bgoh` *(quick confidence-builder)*

**The question:** Can the planner *faithfully represent what it was told* before it starts deciding anything on its own?

Concrete failures we've seen:
- Reinterpreting brief prescriptions as tradeoffs to rediscover (w-mo35s0fo D1)
- Contradicting concluded clicks (w-mo35s0fo D18 vs c-mo33dxf5)
- Auto-applying internal heuristics (Three Defaults, razor's Patch Test) as overriding rules rather than tiebreakers
- Narrowing scope past the brief's explicit requirements (w-mo35s0fo D14)

**The mechanism:** a **fidelity audit** engine that runs after the analyst, verifies no brief/click commitment was contradicted, and flips `selected → null` on any decisions that fail audit. Flagged decisions then flow naturally through the existing patron-review gate. Self-correction via `graftTail` + `--resume` with N=2 budget before force-surfacing.

**Shape:** defensive. Minimal effort, quick to ship, buys confidence to run the next batch of autonomous commissions while the main event gets built. **Don't over-invest here** — when the decisional machinery lands, much of this is absorbed (a Patron Anima catches concluded-click overrides; canon-research flags contradictions naturally).

**Children:** auto-decide vs surface (c-mo38bjlv), concluded-click authority (c-mo38bktc), structured-vs-narrative precedence (c-mo38blsc), phases/audit (c-mo38bmg9 → audit design c-mo3937z0 + plumbing c-mo393918 + other phase passes c-mo3939oj), pre-injection of referenced content (c-mo390t7h).

### 3. Scope rethink — `c-mo3d6med`

**The question:** What is the `scope` field *for*, and is it in the right place in the pipeline?

Today scope is an upfront patron-gate that asks Sean to confirm in/out items before decisions or spec are written. In practice this gate is noisy (we've seen 11-item scope lists that nobody disagreed with) and forces a review before there's enough context to review.

**The mechanism:**
- **Drop the upfront scope-as-patron-gate** (c-mo3d729h) — its current role is ceremonial
- **Generate scope after decisions/spec** (c-mo3d735m) — when structure is actually known
- **Scope-item grouping** (c-mo3d74m6) — cluster items into chunks that can co-reside in a session
- **Plan→writ-hierarchy/rig-structure materialization** (c-mo3d75ud) — scope clusters become child writs dispatched in parallel or serial

**Shape:** structural. Changes what the planner emits. Potential unlock for implementation parallelism downstream.

### 4. Verification — `c-mo3dj3u3`

**The question:** After a commission completes, is the feature actually delivered correctly? "Tests pass" is too weak.

Two parts (cribbed from GSD's Verify Work phase):

**(a) Automated verification within rigs** — beyond unit tests. What else can we check inside an implementation rig that gives the patron confidence? (c-mo3dj6xl)

**(b) Guided patron walkthrough** — Sean-led verification UI that:
- Extracts testable deliverables from the brief/spec (c-mo3dj7v7)
- Walks Sean through them one by one (c-mo3dj90b)
- On failure, auto-diagnoses (c-mo3dj9x2) and commissions a fix (c-mo3djasp)

Plus: placement in the rig pipeline (c-mo3djbos) and relationship to existing quality/review (c-mo3djcvz).

**Shape:** downstream. Closes the loop between "the rig said done" and "the feature works." Feeds failure data back into the planner via fix commissions.

### Neighbor — System self-improvement (`c-mo3hinjt`, under autonomy)

Not part of this vision, but adjacent and worth naming.

Under the autonomy umbrella sits a broader question: *how does the system surface and perform its own improvements — noticing work that needs doing and commissioning it without patron prompting?*

**Observations→commissions** (`c-mo39ro9x`) is one avenue for this — converting analyst observations (refactoring opportunities, risks, adjacent cleanups) into follow-up commissions. But the parent concept is bigger: any pattern where the system generates its own work from what it has noticed (failed verifications, quality-scorer trends, seal conflicts, cost spikes, etc.) would live there too.

This is the feedback loop that closes the autonomy story. It consumes output from verification (§4) and — if it auto-dispatches — feeds the hopper with patron-independent work. But it doesn't *shape* the planner itself, which is why it's not a planner-quality umbrella.

---

## How they compose

```
┌─────────────────────────────────────────────────────────────┐
│  BRIEF                                                       │
│    ↓                                                         │
│  PLANNER                                                     │
│    │                                                         │
│    │  ① fidelity audit guards inputs                         │
│    │  ② decisional machinery handles genuine decisions       │
│    │  ③ scope output restructures for downstream parallelism │
│    ↓                                                         │
│  IMPLEMENTATION (parallel/serial per ③)                      │
│    ↓                                                         │
│  ④ VERIFICATION (automated + guided patron walkthrough)      │
│    │                                                         │
│    │   fix commissions ─────┐                                │
│    │                        │                                │
│    │   observations ─── [self-improvement loop] ─── hopper ─┘│
│    │                                                         │
│    └─ (neighbor — not part of this vision, see above)        │
└─────────────────────────────────────────────────────────────┘
```

- **(1) and (2) are both *inside* the planner** but tackle different things: (1) is the main event — producing *good* decisions when inputs underdetermine; (2) is the guardrail — respecting the inputs you were given.
- **(3) is about what the planner *emits*** — its output structure — and enables downstream parallelism.
- **(4) is about *verifying* what was delivered** — it consumes the output of implementation, not of planning.
- **Self-improvement loop** (neighbor, under autonomy) closes the cycle — verification failures and analyst observations become follow-up commissions. Listed for completeness; not a planner-quality umbrella.

---

## Proposed build order

**Phase 1 — quick confidence-builder (small, parallel to Phase 2 start)**

- **(2) Fidelity audit** — minimum viable version. Ship the audit engine with a small checklist (contradict-brief, contradict-concluded-click) and N=2 retry budget. Don't go deep — just enough to run the next batch of autonomous commissions with more confidence. Plumbing is already largely designed (c-mo393918 ready to conclude, c-mo3937z0 has checks drafted). Cap the investment here — the decisional machinery will absorb most of what a bigger fidelity gate would do.

**Phase 2 — the main event: decisional machinery (start ASAP, runs alongside Phase 1)**

- **Patron Anima first** (c-mo3d6trd) — socratically-trained standin that carries Sean's taste. Cheap, standalone, highest-leverage. Directly replaces what Sean does by hand today.
- **Canon-research second, optionally in parallel** (c-mo3d6pkh) — indexed corpus of prior commitments. Heavier infrastructure but feeds everything downstream.
- **Defer routing** — ambiguity score and cost-weighted planning come *after* we have 2-3 deliberation mechanisms to route between. Build consumers first.
- **Then broaden** — experts panel, steelmen+arbiter, bold agent, arbitrary-choice. Multiple children can run in parallel once we commit.

**Phase 3 — structural unlock**

- **(3) Scope rethink** — relatively self-contained. Gets us downstream parallelism, which multiplies the value of everything downstream. Drop-and-regenerate is a tractable refactor. Can start whenever — not gated on the planner's internal quality improvements.

**Phase 4 — closing the loop**

- **(4) Verification** — needs delivered features to verify. Better once (2) and (3) are in so the features being verified are higher-quality. The guided-walkthrough UI is a meaningful engineering effort.

---

## Where this *doesn't* fit

Worth naming what's adjacent but not in scope for this vision:

- **Session boundary / decomposition** (c-mo1vzt8c) — about whether to split work into sessions. Touches (3) but is a separate line.
- **Atlas / repo intelligence** (c-mo1mqhql) — about pre-built interpretive context. Would accelerate (1) and (2) but is its own track.
- **Concurrency control** (c-mo1mqcam) — about two planners running at once. Relevant once (3) produces parallelism-ready output.
- **Hopper/queue autonomy** (c-mo28k3ar) — about the queue shape. Different layer.

These are neighbors, not children.

---

## Open questions this vision doesn't answer

- **Does the fidelity audit generalize to an "audit engine" pattern?** (Same shape for implementation rigs, for verification rigs?)
- **What's the right abstraction for "decisional machinery" — is it one apparatus or many?** The children today are a grab-bag; unclear what the unifying interface is.
- **How does verification integrate with existing quality/review?** (c-mo3djcvz — named but unresolved)
- **Should observations→commissions flow be automatic or always patron-gated?** Affects how aggressive the feedback loop gets.

---

## Next move

If this vision holds up, there are two parallel tracks:

**Track A (Phase 2 — the main event): Patron Anima MVP.**
1. Scope the MVP — what's in the first prototype and what's deferred? (new click opened under c-mo3d6trd)
2. Answer the corpus/training questions — what carries your taste, and how?
3. Commission the prototype

**Track B (Phase 1 — quick confidence builder): Fidelity audit, minimal version.**
1. Conclude c-mo393918 (plumbing — already substantially done)
2. Resolve c-mo3937z0 children — flag data shape (c-mo39rl0o), audit role (c-mo39rlwk)
3. Commission the audit engine — small, limited checklist, ship it

Before that: **review this vision**. Does the framing hold? Are the four umbrellas actually the right four? Is the phase ordering right?
