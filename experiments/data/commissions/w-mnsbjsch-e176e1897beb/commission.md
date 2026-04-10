# Auto-refresh the spider rig view while a rig is in flight

## Problem

The spider web UI's rig list and rig detail panel do not auto-refresh. They only refetch when the user clicks the refresh button (or selects a rig). For long-running rigs this means the patron sees stale state — engines that are actually running show as queued, sessionIds that have just been assigned don't appear, completed rigs still appear as running, and so on.

This becomes especially noticeable with the new detached session path, where launching a session is no longer instantaneous (spawning the babysitter, pre-writing the pending SessionDoc) and there are observable windows where an engine is in `running` status but `sessionId` is not yet set in the rig snapshot. The patron caught one of these on `rig-mnsat1fz-23ccfaac` — the review engine appeared in `running` state with no session data because the UI snapshot predated the second patch that writes `sessionId`.

The session log inside the engine detail view *does* now auto-refresh (separate fix already shipped), but the rig list and engine pipeline around it do not. So the engine's session log can update while the engine pipeline view itself stays frozen — strange and confusing.

## Scope

1. **Rig list polling.** While the currently-displayed rig (or visible rig list) contains any rig in `running` or `blocked` status, refetch the rig list every ~2 seconds. Stop polling when no in-flight rigs remain.
2. **Current rig polling.** When a single rig is open in the detail panel and that rig is in `running` or `blocked` status, refetch that specific rig (`/api/rig/show?id=...`) every ~2 seconds. Stop when the rig reaches a terminal status (`completed`, `failed`, `cancelled`).
3. **Engine detail re-render.** When the current rig's poll lands a fresh snapshot, re-render the pipeline strip and — if the user has a specific engine selected — re-render the engine detail panel with the updated engine entry. Preserve the user's selection (don't deselect the engine on every refresh).
4. **Stop polling on terminal.** Once the rig hits a terminal status, stop polling and leave the final snapshot in place.
5. **Stop polling on navigation.** If the user navigates away from the rig (or selects a different rig, or closes the panel), stop the existing poll timer cleanly. No leaks.
6. **Don't fight the session log poll.** The engine detail panel already starts a polling timer for the session transcript when a detached session is shown. Make sure the new rig poll doesn't conflict with — or duplicate the work of — the session transcript poll. They should be independent timers with independent stop conditions.

## What this does NOT include

- **Underlying race fix.** The window where `engine.status === 'running'` but `engine.sessionId` is unset is a real cross-apparatus race in `spider.ts`'s `tryStart` (two sequential `rigsBook.patch` calls around `design.run`). That's a separate brief in flight (`eliminate-running-without-sessionId-race`); this UI fix only papers over the symptom by refreshing more often.
- **Real-time push.** No SSE or WebSocket subscription. Polling is sufficient and matches the existing pattern in the static client.
- **Changes to non-spider plugin UIs.** Astrolabe, Loom, Clerk, etc. have their own pages — leave them alone.

## Suggested approach

The session log already has a working poll pattern in `static/spider.js` using `sessionPollTimer`. Mirror that with two new module-level timer handles — one for the rig list, one for the current rig — and the same start/stop discipline. The existing manual refresh button should still work (and should reset the polling cycle).

Pay attention to the case where the user has selected an engine that the next poll's snapshot still contains: re-render the detail panel with the updated engine entry rather than wiping the selection.

## Files

- `/workspace/nexus/packages/plugins/spider/src/static/spider.js` — only file expected to change
- Possibly `/workspace/nexus/packages/plugins/spider/src/spider-oculus.test.ts` if there's an ergonomic way to test polling behavior, though static-JS testing is awkward and a careful manual verification may be the practical answer

## Acceptance check

Open the spider UI, post a commission, watch the rig view without touching the refresh button:

- The rig should appear in the list automatically as it picks up.
- The pipeline strip should advance through engines automatically.
- An engine selected in the detail panel should update its status, sessionId, and yields blocks automatically as the engine progresses.
- When the rig completes, the polling should stop (no continued network traffic in DevTools).