# Fix the flicker and scroll-reset on the Spider engine detail view

When I open an engine's detail view on the Spider page in Oculus, the whole panel re-renders on every poll tick. The flicker is annoying, but the real problem is that the transcript and other long text areas reset their scroll position every refresh, which makes them unreadable for anything longer than the viewport. I want the view to keep updating in the background but stop clobbering what I'm looking at.

## Reader and decision

The reader is me (or a guild operator playing the same role) doing live triage on a running engine — most often while the engine is mid-run and I'm trying to read back through its transcript to understand why it's stuck, what it just produced, or whether to cancel. The decision the view supports is "do I let this keep running, intervene, or kill it?" I do this many times a day, and I routinely spend 30+ seconds scrolled mid-transcript while I read. Today that's the failure mode: by the time I've scanned two paragraphs, the poll fires and I'm back at the top (or bottom) and have to find my place again.

## Scope

**In:**
- The engine detail view on the Spider page in Oculus — specifically the panel that shows engine status, the transcript, and any other streamed text fields (tool output, last message, error details).
- The auto-refresh mechanism behind that view: whatever polls or subscribes to engine state and triggers the re-render.
- Preserving scroll position in the transcript and in every other scrollable text region on that view.
- Eliminating the visible flicker on tick.

**Out:**
- The Spider page's engine *list* (left rail, or wherever engines are enumerated). If it has the same issue, note it but don't fix it here.
- Other Oculus pages (Clerk, books, clicks view). Same deal — note, don't fix.
- Redesigning the detail view layout or adding new fields.
- Switching the backend transport (e.g., moving from polling to SSE/websockets) unless that's genuinely the cleanest fix. If it is, propose it; otherwise keep the current transport.
- Changing the poll interval as the primary fix. Slowing the poll just makes the bug less frequent; I want it actually fixed.

## How it works

The fix I'm picturing:

1. **Targeted updates, not full re-render.** Each field on the view (status, started-at, transcript, tool output, etc.) should update independently when its value changes. If only `status` changed from `running` to `stuck`, the transcript DOM shouldn't re-mount. Use stable keys / memoization / whatever the Oculus stack calls for so React (or equivalent) doesn't throw away and rebuild the scroll container.
2. **Scroll position is owned by the container, not by the data.** The transcript pane keeps its own scrollTop across refreshes. If the user is scrolled to the bottom (within some small threshold, say 40px), new content auto-scrolls to follow — that's the useful "tail -f" behavior. If they've scrolled up, leave them alone. Don't snap them to the bottom on every tick.
3. **No visible flicker.** Whatever causes the flash today (probably a loading-state swap or a full unmount/remount) goes away. If data is in-flight, show a subtle indicator in a fixed spot (e.g., a small dot near the "last updated" timestamp), not a skeleton that replaces the content.
4. **Updates stay frequent.** I don't want the fix to be "poll every 10s instead of every 1s." Keep it feeling live — 1–2s is fine — but make the updates cheap.

Acceptance, concretely: I can open an engine detail view on a running engine, scroll to the middle of a long transcript, and leave it there for a minute. The status indicator and timestamp update in place, new transcript lines append below without moving my view, and I see no flash.

## Assumptions I made

- The underlying refresh is polling-based, not a push subscription. If it's already push-based, the bug is in the render layer, not the transport — still in scope.
- The transcript is rendered as a single scrollable container with the full text re-serialized each tick. If it's actually virtualized / append-only already, the bug is narrower than I think.
- "Other text areas" on the view include tool output, last error, and any long message blob. Planner can inventory them.
- Oculus is the React-based web UI under the framework repo. If I'm wrong about the stack, adapt the guidance.

## Deferred questions

- Is there a shared polling hook used across Oculus that I should fix once rather than per-view? If so, what else depends on its current behavior?
- Is the "follow the tail when scrolled to bottom" behavior already present and just broken, or does it not exist yet? I want it either way, but it affects how the fix is framed.
- Any existing tests around this view, or do we need to add coverage for the scroll-preservation and no-remount behaviors as part of the fix?
