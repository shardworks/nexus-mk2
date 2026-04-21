# Stop Oculus engine-detail from clobbering scroll on every refresh

The engine-detail view on the Oculus spider page is unreadable during a live run. It re-renders the entire panel on some interval, which flickers visibly and resets scroll position inside the transcript and any other text-bearing panes. Anything longer than a single screen is effectively unreadable — by the time I've scrolled to the part I want, the next tick throws me back to the top. Fix the refresh so updates are targeted and scroll state is preserved.

## Reader and decision

The reader is me (or whoever is babysitting a live engine through Oculus). The decision is **"what is this engine doing right now, and what has it said so far — is it progressing, stuck, or done?"** (#22). The frequency is *continuous* for the duration of an active run — I leave this view open for minutes to hours while work is underway. That is the load-bearing workflow; if I can't read the transcript while the engine is running, the surface fails its only job.

## Scope

**In:**
- The engine-detail panel on the Oculus spider page — specifically the transcript pane and any other scroll-containing text areas (rationale, tool output, whatever else renders as a scrollable block).
- The refresh/update mechanism that drives those panes.
- Any sibling engine-ish views in Oculus that share the same refresh pattern — if the root cause is a shared polling/render helper, fix it once and the siblings come along (#36). The planner should check for this and report; I don't want the same bug to resurface on the next similar surface because we only patched the one page.

**Out:**
- Redesigning the engine-detail layout or adding new fields. This is a bug fix against an existing workflow (#23, #26), not a redesign.
- Scroll-restoration shims that remember and re-apply scrollTop after a full re-render. That is treating the symptom (#31). The source of the problem is that we are re-rendering nodes that didn't change. Fix the source.
- New data-model concepts for engine events. Whatever the transcript already is, append to it — don't invent a new stream type to solve this.

## How it works

The fix is to make updates **targeted**, not to paper over the full-refresh with restoration logic (#31). Concretely, my expectation:

1. **The transcript pane appends new lines rather than rewriting the block.** New transcript entries should attach to the existing DOM (or equivalent framework-native diff) so the nodes the user is reading don't get torn down and rebuilt. Scroll position is preserved for free when the nodes under the scroll container are stable.
2. **Non-transcript fields update by diff.** Status chips, counters, timing, cost — these rerender when their value changes, not on every tick. If the underlying framework does this for free with keyed/memoized components, use that; if we're reaching for `innerHTML = ...` or equivalent sledgehammer, stop.
3. **Prefer a push/stream source over polling if one already exists** for engine events. If the engine emits events into a book we already subscribe to elsewhere (#27 — fabricate uses of existing infrastructure), read from there rather than re-polling a full snapshot. If no stream exists, leave polling in place but narrow it — and do not introduce a new streaming layer just for this (#18).
4. **If a fetch fails, fail loud** (#2) — surface an error state in the panel, don't silently swallow and keep the last good snapshot forever. The reader should know when they're looking at stale data.

The acceptance test is plain: open the engine-detail view on a running engine, scroll halfway down the transcript, wait one minute, and confirm I am still scrolled to the same content with no visible flicker. New transcript lines arriving below are fine and expected; they should not disturb my scroll.

## Assumptions I made

- The bug is a full-panel re-render on a polling interval, not a CSS/layout thrash. The planner should confirm by inspecting the current fetch/render path before choosing between "switch to diff-based render" and "switch to streaming."
- "Scroll resets" means the scroll container's children are being replaced (new DOM nodes, same shape). If instead the scroll container *itself* is being unmounted/remounted, the same fix applies one level up but the planner needs to notice.
- Other scrollable panes on the same view (rationale, any tool-output block) share the problem. Fix them all; this is the complete slice (#36). If I've named one that doesn't actually exist on this surface, drop it.
- There is no external consumer of the current refresh behavior that would break from the change. This is a UI bug fix; I do not expect backwards-compat scaffolding (#1, #10).

## Deferred questions

- Does Oculus already have a push/event-stream path for engine updates, or is everything polled? The answer decides whether this is a "narrow the render diff" job or a "switch to the existing stream" job.
- Is the same refresh helper used by other Oculus surfaces (spider run list, commission detail, writ views)? If yes, confirm whether fixing it centrally is in-scope or whether the sibling surfaces are deliberately out-of-scope for this petition.
- Current poll interval — is it aggressive enough that even a perfect diff-render would still flicker visibly on slower machines? If so, the interval itself may want a second look, but I'd rather land the diff-render fix first and judge from there.
