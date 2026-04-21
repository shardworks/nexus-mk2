# Fix Oculus spider engine-detail refresh so scroll survives

The engine-detail view on Oculus's spider page currently re-renders wholesale on every refresh tick. The visible symptoms are flicker and scroll-reset, but the real cost is that I can't actually read the transcript as an engine runs — every tick yanks me back to the top and I lose my place. Fix the refresh so the DOM is stable across ticks and the transcript is readable while live.

## Reader and decision

Me (the patron), watching a running engine in real time to decide "is this going somewhere useful, or should I intervene?" Cadence is continuous during an active session — I leave the view open for minutes at a time, scrolling around the transcript while new content streams in. This is the canonical live-observation surface; scroll stability is load-bearing, not cosmetic (#22).

## Reframe

The brief asks for "more targeted updates." That's the right direction, but I want to name the root cause rather than treat the symptom: the view is replacing the whole engine-detail subtree on each tick, and the transcript is being re-rendered instead of appended to. Fix the source, not the consumer (#31) — I don't want a scroll-save/restore hack layered over a full re-render. I want the full re-render to stop happening.

## Scope

**In:**
- The engine-detail panel on the Oculus spider page (the view opened when you click an engine row).
- The refresh mechanism that currently causes the flicker — replace it with a diff-and-apply / append-only update model.
- Scroll behavior on the transcript specifically, plus any other scrollable text areas in the same panel.

**Out:**
- Any other Oculus page. If they have the same problem, that's a separate commission — don't let the fix sprawl (#23).
- Switching polling to websockets/SSE. If the current transport is polling, keep polling; the bug is in render strategy, not transport. Transport-change is a bigger scope and not what's broken here.
- Any new "pause refresh" toggle or user-facing control. That's making me work around the bug (#31). Reject.
- Configurable refresh intervals. Not the problem.

## How it works

Concretely, the panel should behave like this:

1. **Transcript is append-only in the DOM.** New transcript entries are appended as new child nodes to the existing scroll container. Existing nodes are never re-created on a refresh tick. If the data model allows transcript edits (I don't think it does, but flag it — see assumptions), handle that as a targeted node update, not a full re-render.

2. **Scalar fields diff-update in place.** Engine status, token counts, cost, elapsed time — each reads from the freshly-fetched state and updates only the text node it owns. No parent remount.

3. **Auto-tail when I'm at the bottom; otherwise leave me alone.** Standard chat-app behavior: if the scroll container is at (or near) the bottom when new content arrives, keep it pinned to bottom. If I've scrolled up to read something, new content arriving does not move me. This is the behavior that makes the view usable while live (#29 — amendment-not-re-entry, applied to reading: don't make me re-find my place).

4. **Fail loud if the refresh stops working.** If the fetch fails repeatedly, surface it visibly in the panel — don't silently stop updating and leave me staring at stale data thinking the engine is idle (#2).

5. **Existing surface, no new chrome.** This is a bug fix on the spider page, not a redesign. No new indicators, toggles, or layout changes unless they fall out of the fix naturally (#26). If a small "following latest / scrolled up" affordance emerges from the auto-tail behavior, it goes immediately adjacent to the transcript, not in a page header (#40).

## Assumptions I made

- The current refresh is a polling loop that refetches the full engine state and re-renders the panel from scratch. If it's actually something weirder (e.g., a websocket that sends full snapshots, or a key-churn bug in the component tree), the fix shape is similar but the diagnosis step matters — confirm the mechanism before writing code.
- Transcript entries are append-only in the underlying data model. If entries can be mutated after creation, the append-only DOM strategy needs a targeted-update path for edits.
- "Other text areas" in the brief means things like the engine's current-prompt display or tool-call output blocks — fix these with the same diff-in-place approach. If there's a specific text area I'm forgetting, the same principle applies.
- Oculus is the React-ish frontend I remember it being. If the panel is implemented in a way where "don't re-render the subtree" requires a structural change (wrong key strategy, wrong component boundaries), that structural change is in scope — it's the actual fix.

## Deferred questions

- None blocking. If the planner finds that the refresh is driven by something other than a naive poll-and-replace (e.g., a framework-level subscription that's over-broad), flag it and proceed — the user-facing outcome I want is the same regardless of which layer the fix lands in.
