# Fix the engine-detail flicker on the Spider page in Oculus

The engine-detail view inside the Spider page is currently re-rendering on every poll tick, which makes the panel flicker and — worse — yanks the scroll position back to the top of every text area inside it. That makes the transcript essentially unreadable while a session is active. I want the auto-refresh reworked so updates land surgically, without disturbing scroll, selection, or focus.

## Reader and decision

The reader is me (or anyone else operating the guild) sitting on the Spider page in Oculus, watching a live engine session. The decision being supported is "what is this engine doing right now, and do I need to intervene?" — which means I'm reading the transcript as it streams, scrolling back to re-read a tool call, sometimes selecting text to copy. This view gets used continuously during any active session, often for many minutes at a stretch. If I can't keep my place in the transcript, the page is useless for its main job.

## Scope

**In:**
- The engine-detail view as it appears on the Spider page in Oculus (the panel that shows the transcript, current status, recent tool calls, and any other per-engine fields).
- The polling/refresh mechanism that drives that view's updates.
- Preserving scroll position, text selection, and focus across updates for every scrollable region in the panel — transcript, tool-call list, and any other long text area.

**Out:**
- Other Oculus pages (Clerk, Books, etc.) — even if they have similar polling patterns, leave them alone unless the fix is a trivially shared component.
- Changing the polling cadence itself unless that falls out naturally from the fix. The bug is the re-render scope, not the frequency.
- Redesigning the engine-detail layout. Same fields, same arrangement.
- Server-side push (SSE/WebSocket). If polling-with-diff is enough to fix the symptom, ship that; don't expand into a transport rewrite.

## How it works

The fix I want, in order of preference:

1. **Diff-and-patch updates.** The poll fetches fresh engine state, but the view only re-renders the parts that actually changed. A new transcript line appends to the bottom of the transcript region without re-mounting the scroll container. A status-field change updates that field's text node. If nothing changed, nothing re-renders.

2. **Stable component identity.** Whatever framework piece holds the transcript (and other scrollable regions) must keep its DOM node and React/Solid/whatever-component instance across updates. The scroll container is not unmounted, replaced, or re-keyed on each tick.

3. **Auto-scroll behavior preserved, but only when the user is already at the bottom.** If I've scrolled up to read something, new transcript lines append silently and the scroll stays put. If I'm pinned to the bottom (within ~40px), new lines scroll into view as they arrive. This is the standard chat/log-tail behavior and it's what I expect here.

4. **No flicker.** Even on slow networks, the panel should not visibly blank, swap, or flash between polls. If a fetch is in flight, the existing rendered content stays visible until new data is ready to merge in.

Acceptance, concretely: I open the engine-detail view on a live session, scroll halfway up the transcript, select a line of text, and walk away for two minutes. When I come back, my scroll position is unchanged, my selection is intact, and new transcript lines have accumulated below the fold.

## Assumptions I made

- Oculus is polling on an interval (a few seconds) and re-rendering the whole engine-detail subtree on each response. The planner should confirm this is the actual mechanism — if it's something weirder (e.g., a full-page reload, or a parent component remounting), the fix shape changes.
- The transcript and other text areas are standard scrollable divs whose scroll position is lost when the node is unmounted/remounted. If they're using a virtualized list, the fix may need to thread through that library's API instead.
- The engine-state payload is small enough that diffing client-side is cheap. If it's actually huge, we may want a server-side "changed since" endpoint — but try the client-side diff first.

## Deferred questions

- Are there any fields on the engine-detail view where I *want* a hard refresh (e.g., something that should visibly "tick")? My default answer is no, but flag it if you find one.
- Is the same broken refresh pattern used on adjacent Oculus views? If yes and the fix is a shared component, fine to fix in place; if it requires touching unrelated views, stop and check with me first.
