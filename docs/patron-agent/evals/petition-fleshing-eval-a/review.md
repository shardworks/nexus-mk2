# Eval A — Thin-Brief Fleshing Review

## Setup

- **8 thin briefs** drawn from real commissions (87 – 1024 chars; see `inputs/`).
- **2 agents:** `patron-flesh` (41 principles, v4) vs. `patron-baseline` (minimal prompt, no principles).
- **Task:** take the thin brief, produce a fleshed petition in patron voice. Free-form markdown, single-pass.
- **Runs log:** `runs.log`. Outputs: `outputs/patron-flesh/<slug>.md` and `outputs/patron-baseline/<slug>.md`.

Timing: patron-flesh avg 86s / 5955 chars; patron-baseline avg 55s / 5242 chars. Patron slower + slightly longer (principle bank load + inline citations).

## How to use this doc

Read each pair (links provided). I've left a one-paragraph **Coco's read** on each flagging the key divergence. Then fill the tags:

- **Plausibility** per agent: `✓` (would ship) / `~` (workable, needs edits) / `✗` (would reject)
- **Scope cut** per agent: `✓` (right-sized) / `W` (too wide) / `N` (too narrow)
- **Reframe quality** (patron only, when it fired): `endorse` / `neutral` / `wrong`
- **Verdict:** `flesh` / `tie` / `baseline`

A short `notes` line per brief for anything else that caught you.

---

## 1. cli-flag-edit  *(87 chars → flesh 4504 / baseline 4132)*

> `nsg writ edit` currently only accepts `--body`. Support for `--title` should be added.

**Files:** [`outputs/patron-flesh/cli-flag-edit.md`](outputs/patron-flesh/cli-flag-edit.md) · [`outputs/patron-baseline/cli-flag-edit.md`](outputs/patron-baseline/cli-flag-edit.md)

**Coco's read:** Clean divergence on scope. Patron led with **#36 Complete the set** — reframed "add --title" as "audit all user-editable fields and ship the set together; if it's just title+body, we're done, but if there are more, pull them in as a coherent set." Baseline stayed inside the brief's framing and explicitly excluded other fields as "a separate commission if we want it." Baseline also explicitly set `--title ""` to validation error *with a confirm-before-build gate* (patron just called the behavior). Both are workable; the question is whether #36's widening move is the right instinct or overreach on a one-flag request.

| flesh plausibility | baseline plausibility | flesh scope | baseline scope | reframe | verdict |
|:---:|:---:|:---:|:---:|:---:|:---:|
| __ | __ | __ | __ | __ | __ |

notes: 

---

## 2. plugin-writ-types  *(283 chars → flesh 5942 / baseline 5353)*

> We want plugins to be able to ship custom types of writs, and other components which use that writ type. This should be similar to how 'roles' can be configured in guild.json, or added by plugins. As with roles, guild.json definitions should take precedent over plugin contributions.

**Files:** [`outputs/patron-flesh/plugin-writ-types.md`](outputs/patron-flesh/plugin-writ-types.md) · [`outputs/patron-baseline/plugin-writ-types.md`](outputs/patron-baseline/plugin-writ-types.md)

**Coco's read:** Architectural strictness divergence. Patron made two moves baseline didn't:
1. **Built-ins migrate to be contributions** (#10, #38) — no hardcoded special-case for `mandate`; the framework's own types come through the contribution path.
2. **Plugin-vs-plugin id collision throws loud at boot** (#2) — both plugin ids named in the error. Baseline said "later one wins, warning logged" — silent-shadowing via load-order.

Patron also excluded per-writ-type lifecycle overrides (#11, #18); baseline allowed plugins to declare their own lifecycle state sets. And patron treated the contribution contract as load-bearing precedent (#13). Baseline added "frozen writ with missing-type indicator" as graceful degradation — patron didn't engage with that failure mode, which is arguably a baseline win (real-world: what if a plugin gets uninstalled?).

| flesh plausibility | baseline plausibility | flesh scope | baseline scope | reframe | verdict |
|:---:|:---:|:---:|:---:|:---:|:---:|
| __ | __ | __ | __ | __ | __ |

notes: 

---

## 3. writs-page-width  *(262 chars → flesh 5189 / baseline 4459)*

> The 'writs' page extends to the full width and height of the viewport, which feels cluttered. It should instead be in the standard page-container we use for other pages, like Spider and Guild. The components inside should be wrapped in cards as well.

**Files:** [`outputs/patron-flesh/writs-page-width.md`](outputs/patron-flesh/writs-page-width.md) · [`outputs/patron-baseline/writs-page-width.md`](outputs/patron-baseline/writs-page-width.md)

**Coco's read:** Roughly equivalent answers. Both identified the conformance fix, scoped out Spider/Guild changes, made similar assumptions. Patron added explicit citations (#23, #26, #28, #40) and one move baseline didn't make: **"don't sweep other full-bleed pages in this petition — that's a separate conformance pass."** Baseline gave slightly more operational detail on the card stack (toolbar / table / detail). Probably a **tie** on this one — good calibration signal for whether the principles add real value on simple UX-conformance work or just ceremony.

| flesh plausibility | baseline plausibility | flesh scope | baseline scope | reframe | verdict |
|:---:|:---:|:---:|:---:|:---:|:---:|
| __ | __ | __ | __ | __ | __ |

notes: 

---

## 4. engine-refresh-bug  *(350 chars → flesh 5465 / baseline 5210)*

> When viewing engine details on the spider page in oculus, it constantly refreshes and causes text to flicker — also, scroll position is reset in any of the scrollable areas (including the transcript).

**Files:** [`outputs/patron-flesh/engine-refresh-bug.md`](outputs/patron-flesh/engine-refresh-bug.md) · [`outputs/patron-baseline/engine-refresh-bug.md`](outputs/patron-baseline/engine-refresh-bug.md)

**Coco's read:** Opposite scope instincts. Patron **widened toward root cause** (#31 fix-the-source): *"Any sibling engine-ish views in Oculus that share the same refresh pattern — if the root cause is a shared polling/render helper, fix it once and the siblings come along (#36)."* And explicitly rejected scroll-restoration shims: *"That is treating the symptom. The source is we are re-rendering nodes that didn't change."* Fail-loud on fetch errors (#2). Baseline **narrowed to this one surface**: *"Other Oculus pages, even if they share the same polling pattern. I want this one fixed first; we can generalize later."* Baseline has more operational detail on tail-follow behavior (pinned-to-bottom auto-scroll). This is a real Sean-shaped question: do you widen now or later?

| flesh plausibility | baseline plausibility | flesh scope | baseline scope | reframe | verdict |
|:---:|:---:|:---:|:---:|:---:|:---:|
| __ | __ | __ | __ | __ | __ |

notes: 

---

## 5. session-viewing  *(569 chars → flesh 5968 / baseline 5906)*

> - viewing current and past sessions, including: status, writ title (if applicable), role, etc. Also include the total cost of the session in USD, with an on-hover tooltip showing the USD and token cost breakdowns
> - ability to cancel sessions via a button
> - Details for a session should include the transcript, similar to how it is displayed on quick engines in the spider
>
> NOTE: The session log should stream in realtime if the session is running. This is currently broken on the engine detail page. We should implement it on this page, and fix in the spider as well

**Files:** [`outputs/patron-flesh/session-viewing.md`](outputs/patron-flesh/session-viewing.md) · [`outputs/patron-baseline/session-viewing.md`](outputs/patron-baseline/session-viewing.md)

**Coco's read:** Two reframes from patron, both significant:
1. **"Fix streaming in spider + implement streaming in sessions view" is misframed** (#31). It's one bug in the shared streaming mechanism, not two work-items. Baseline took the brief literally and built both as separate line-items.
2. **"New page" is the wrong shape** (#26). The spider already renders session transcripts for quick engines — grow the spider to list all sessions (with an engines filter) before committing to a new page. Baseline built `/sessions` as a new route without pushback.

Baseline has more operational concreteness (ASCII-art cost tooltip, pinned-to-top for running sessions, "● Live" indicator, retention question). If you take the brief at face value, baseline is more immediately buildable; if you think the framing was wrong, patron caught both mistakes.

| flesh plausibility | baseline plausibility | flesh scope | baseline scope | reframe | verdict |
|:---:|:---:|:---:|:---:|:---:|:---:|
| __ | __ | __ | __ | __ | __ |

notes: 

---

## 6. running-rig-view  *(582 chars → flesh 7200 / baseline 4535)*

> In the Spider page of oculus, there is the ability to see running rigs—including currently active engines. For anima engines with an agent session, there is a 'session log' box. This should be a running view of the anima session... However, currently the box remains empty and the heading above it just shows `Session Log [loading...]`, with the loading text being a pill that pulses faintly.

**Files:** [`outputs/patron-flesh/running-rig-view.md`](outputs/patron-flesh/running-rig-view.md) · [`outputs/patron-baseline/running-rig-view.md`](outputs/patron-baseline/running-rig-view.md)

**Coco's read:** Biggest length gap (7200 vs 4535) — patron went deeper. Several principle-texture moves:

- **Content-bearing loading state** (#41): replace pulsing `[loading...]` pill with *"Loading session events..."* + session id, and *"Waiting for first event from &lt;anima name&gt;..."* for zero-event empty state.
- **Backfill-vs-live-join race** called out as a distinct failure mode to diagnose (#31).
- **"First-of-its-kind live panel → precedent"** (#13) if no other Oculus view does this today.
- **Fail loud on disconnect** (#2): explicit disconnected indicator, not silent reset to `[loading...]`.

Baseline has token-level streaming as default (patron defers that to v2 via #27 "use existing event grain, don't invent sub-grain"), and a concrete scrollback cap. Both good. The patron version is more opinionated about the failure-mode enumeration; baseline is more operational-steady-state.

| flesh plausibility | baseline plausibility | flesh scope | baseline scope | reframe | verdict |
|:---:|:---:|:---:|:---:|:---:|:---:|
| __ | __ | __ | __ | __ | __ |

notes: 

---

## 7. session-provider  *(740 chars → flesh 6969 / baseline 8058)*

> Currently, the claude-code session provider runs anima sessions as child process of whatever Guild process spawns them (probably the spider). This means that if the spider is terminated, all working anima sessions just stop and leave their work in an indeterminate state. ... we should spawn claude code processes in a detached manner so that they persist without the guild continuing to run. We will need to consider the minimal harness...

**Files:** [`outputs/patron-flesh/session-provider.md`](outputs/patron-flesh/session-provider.md) · [`outputs/patron-baseline/session-provider.md`](outputs/patron-baseline/session-provider.md)

**Coco's read:** Only brief where baseline is **longer** than patron. Baseline leans heavily operational (PID/PGID tracking, SIGTERM→SIGKILL grace period, spider scan-and-reconcile on startup, crash semantics). Patron is more architectural:

- **"Engine produces its own yields — I won't have it passed a ready-made result"** (#16). Harness writes completion row to book; clockwork event routes back to engine; engine reads the row in its next pass.
- **"Pull on resume, don't rely on replayed events"** (#4, #19) — if the event fired while no spider was alive, engine re-checks the book on startup.
- **No generalization to future providers** (#18) — baseline asked about this as a deferred question; patron explicitly scoped it out.
- **Extension of existing engine-status + clockwork-event shape, not a parallel pipeline** (#3, #26).

The architectural framing is a real patron call; the operational detail from baseline is what a good planner would fill in regardless. This might be the clearest case of **complementary** outputs — you'd take the framing from patron and the operational detail from baseline.

| flesh plausibility | baseline plausibility | flesh scope | baseline scope | reframe | verdict |
|:---:|:---:|:---:|:---:|:---:|:---:|
| __ | __ | __ | __ | __ | __ |

notes: 

---

## 8. ghost-config  *(1024 chars → flesh 5402 / baseline 4283)*

> astrolabe.generatedWritType config becomes a ghost field on the combined-rig path. ... As briefs migrate off the two-phase rig entirely ..., this field becomes fully dead. **A follow-up cleanup after the old planning rigs are deleted (post multi-rig refactor) can drop it.**  Follow-up: Delete AstrolabeConfig.generatedWritType and inline the literal 'mandate' in spec-publish **after the old two-phase-planning rig is retired.**

**Files:** [`outputs/patron-flesh/ghost-config.md`](outputs/patron-flesh/ghost-config.md) · [`outputs/patron-baseline/ghost-config.md`](outputs/patron-baseline/ghost-config.md)

**Coco's read:** **Textbook #39 reject-the-framing divergence.** The brief explicitly frames the deletion as a follow-up after the rig retirement. Baseline took the bait and structured the commission as *conditional*: *"This commission is conditional: it should only execute after the `astrolabe.two-phase-planning` rig has been retired... If that precondition isn't met when the commission is picked up, bounce it back to me — don't do a partial deletion or leave the field in place 'just in case.'"* Added an "is it gone yet?" gate as the planner's primary decision.

Patron opened: *"I'm rejecting that framing (#39). The two deletions are independent, and the config-side cleanup is trivial to do now — waiting for the rig retirement to drop a config field that nobody sets is exactly the 'repair the stale thing' pattern I want to avoid (#38). Delete it now."* Ten-line diff today, no reason to schedule a second commission.

This is the single clearest principle-fire in the set. If the patron's move here is right, that's probably the strongest single-example evidence that the principles produce calls baseline misses.

| flesh plausibility | baseline plausibility | flesh scope | baseline scope | reframe | verdict |
|:---:|:---:|:---:|:---:|:---:|:---:|
| __ | __ | __ | __ | __ | __ |

notes: 

---

## Aggregate scoring

Fill in once you've tagged the 8 above. Totals are pure counts; no weighting.

| metric | flesh | baseline | tie |
|---|:---:|:---:|:---:|
| would-ship (`✓`) count | __ | __ | — |
| right-sized scope (`✓`) count | __ | __ | — |
| verdict wins | __ | __ | __ |

**Reframe quality (patron-flesh only, across 5 fires — briefs 1, 2, 4, 5, 8):**

| brief | reframe | quality |
|---|---|---|
| cli-flag-edit | complete-the-set (#36) | __ |
| plugin-writ-types | migrate built-ins to contributions (#10, #38); loud-throw collisions (#2) | __ |
| engine-refresh-bug | fix-at-root across sibling surfaces (#31, #36) | __ |
| session-viewing | one-fix-two-surfaces + extend-spider-not-new-page (#31, #26) | __ |
| ghost-config | delete-now-not-after (#39, #38, #1) | __ |

## Coco's preliminary read (to compare against your tags)

Before you tag — so we can see how well my read matches yours:

- **Patron-flesh wins clearly on:** ghost-config (#39 is unambiguous), cli-flag-edit (#36 is the right instinct if you care about complete sets), plugin-writ-types (fail-loud on collisions is non-negotiable taste).
- **Tie or mild-edge-baseline on:** writs-page-width (both fine), running-rig-view (baseline has more usable operational detail, patron has better failure-mode enumeration), session-provider (complementary — take framing from patron, operations from baseline).
- **Interesting mid-case:** engine-refresh-bug and session-viewing. Patron's "widen to root cause / reject new-page framing" is principled but may be overreach if the planner would have caught it anyway. Real signal to watch: does baseline's narrower scoping correspond to what Sean-on-a-good-day would actually want, or does it reflect the laziness you called out in the v3→v4 conversation?

## Questions this eval was designed to answer

1. **Are the principles too narrow / too specific?** Cross-check: do they fire on thin briefs that weren't derived from the plandoc decision-fill dataset? → Answered by principle-fire density across briefs 1–8.
2. **How does the agent do on generating features from thin specs?** → Answered by plausibility tagging. Read alongside baseline to isolate what the principles add vs. what any Opus instance produces.
3. **What are the pathologies?** Overreach (catching false positives), under-reach (missing obvious reframes baseline also missed), hallucinating principles that don't really fit. Flag any of these in the `notes:` lines.
