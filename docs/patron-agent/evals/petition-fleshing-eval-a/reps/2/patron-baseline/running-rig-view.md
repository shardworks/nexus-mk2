# Fix the Session Log panel on the Spider running-rig view

I want the Session Log box on the Spider page in Oculus to actually work. Right now it sits empty under a `Session Log [loading...]` header with a pulsing pill, and it never resolves. That's the bug I want fixed. The panel should stream the running anima's session output in realtime and behave like a live tail I can watch without refreshing.

## Reader and decision

The reader is me (or another operator) supervising a running guild through Oculus. I open the Spider page to see what's currently running, click into an active anima engine, and I'm trying to answer one of two questions:

1. **Is this session healthy and making progress, or is it stuck / looping / off-track?**
2. **What is the anima actually doing right now?** — enough to decide whether to let it run, intervene, or kill it.

I'll open this view opportunistically, often several times a day, sometimes for minutes at a time. It is not an archival log reader. It's a shoulder-surfing window.

## Scope

**In:**
- Anima-engine rigs that have an active agent session (the existing `Session Log` box only appears for these).
- Realtime append of new session content as the anima generates it.
- The transition out of the `[loading...]` state: once the stream is attached, the pill clears and the box shows content (or an explicit empty-but-connected state).
- Backfill of the session so far when the panel first opens, so I'm not staring at a blank box for a running session that started before I opened the page.
- Autoscroll-to-bottom by default, with a "pause scroll" behavior if I scroll up.

**Out:**
- A full log archive / search UI. This panel is the live tail only; archived/completed sessions are a separate concern.
- Rich rendering of tool calls, diffs, thinking blocks, etc. Plain text stream is fine for v1 — whatever the session emits, rendered as a monospace running text.
- Editing, replying, or interacting with the anima from this panel. Read-only.
- Sessions for non-anima engines. If the engine isn't an anima session, the Session Log box shouldn't appear at all (existing behavior — leave it alone).
- Multi-session aggregation. One engine, one panel, one stream.

## How it works

- When the rig detail panel mounts for an anima engine with an active session, Oculus opens a streaming connection (SSE or websocket, planner's call) to a session-events endpoint keyed by the engine/session id.
- The header reads `Session Log` with a small status affordance on the right: `connecting…` (pulsing), `live` (steady dot), `disconnected` (muted), `ended` (when the session completes). The current `[loading...]` pill is what `connecting…` replaces.
- On connect, the server sends a backfill of existing session output (bounded — say last 500 lines or last 64 KB, whichever is smaller), then switches to live append.
- New events append to the bottom of the box. Monospace, wrapped, preserving whitespace.
- The box autoscrolls to the bottom as new content arrives. If I scroll up past some threshold, autoscroll pauses and a small "jump to live" button appears in the corner; clicking it re-sticks to the bottom.
- If the stream disconnects, the status flips to `disconnected` and the client retries with backoff. On reconnect, it resumes from the last event id it saw (no duplicates, no gaps — planner should confirm the session-events source supports resume-from-cursor; if not, accept a short gap and surface it inline as `… reconnected …`).
- When the session ends (engine transitions out of running), the status flips to `ended` and the stream closes cleanly. Content stays visible until I navigate away.
- Empty-but-connected state: if the session has genuinely produced no output yet, show a muted `waiting for output…` line inside the box rather than a blank pulsing pill forever.

## Assumptions I made

- There is already a session-events source somewhere in the guild (the anima's session is being recorded — the framework's session funnel writes this). The fix is wiring Oculus to it, not inventing the stream.
- The Spider page already knows which engine is selected and has access to its session id / engine id. If not, that plumbing is part of this work.
- SSE is acceptable; we don't need bidirectional. If the existing Oculus stack already uses websockets for other live views, match that.
- "Realtime" means sub-second latency from anima emission to browser paint, not millisecond-hard. Buffering up to ~250ms to batch DOM updates is fine and probably desirable.
- The `[loading...]` pill today is literally a placeholder that was never wired up, not a bug in an existing stream. Planner should confirm.

## Deferred questions

- Does the session-events source support resume-from-cursor (event ids) for clean reconnect, or do we need to add that? If adding it is heavy, I'll accept a visible gap marker instead.
- Is there a reasonable cap on how much backfill to send? I suggested 500 lines / 64 KB — planner should check what's actually cheap vs. expensive on the server side.
- Do we want a "copy log" / "open in full view" affordance in v1, or is the panel read-only with no actions? My instinct is skip for v1, add if I start wanting it.
- Should `ended` sessions still be viewable from the Spider page after the engine transitions out of running, or does the panel disappear? For this commission I only care about the running case.
