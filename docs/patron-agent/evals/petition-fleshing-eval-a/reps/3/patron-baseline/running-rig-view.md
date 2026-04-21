# Fix Session Log on the Spider running-rig view

The Session Log box on the Spider page of oculus needs to actually work. Right now, for any running anima engine that has an agent session attached, the box sits empty under a `Session Log [loading...]` heading that pulses forever. I want that box to fill with live session output — streamed in as the anima generates it — so I can watch an anima think in real time without leaving oculus.

## Reader and decision

The reader is me (or another operator standing in for me) sitting on the Spider page while an anima is mid-run. I'm looking at this box because a rig is doing something I want to observe or debug — e.g., a commission that's taking longer than expected, an anima that looks stuck, or a new engine I'm piloting and want to eyeball. The decision it informs is immediate and operational: **do I let this session keep running, do I intervene, or do I kill it?** This is a glance-and-react surface, checked dozens of times a day during active work, ideally within a couple of seconds of a glance.

## Scope

**In:**
- Fixing the `[loading...]` stuck-state on the existing Session Log box for running anima engines with an agent session.
- Wiring the box to a realtime stream of session events for the specific engine/session shown on the Spider page.
- Appending new content to the box as events arrive, auto-scrolling to the bottom unless the user has scrolled up.
- Showing a sensible backlog on first load (the last ~200 lines of the session so far) before the live tail kicks in, so the box isn't empty if you open it mid-run.
- Indicating connection state: `[live]` when streaming, `[reconnecting…]` during transient drops, `[ended]` when the session concludes.

**Out:**
- Redesigning the Spider page layout, the surrounding rig view, or the engine list.
- Persisting session logs anywhere new — use whatever the session funnel already records.
- Search, filter, download, or copy-all affordances inside the box (nice-to-have, not now).
- Non-anima engines. If an engine has no agent session, the box should not be shown at all (or should say "No session attached").
- Multi-session views. One engine, one session, one box.

## How it works

The heading reads **Session Log** followed by a small status pill: `[live]` (green), `[reconnecting…]` (amber, pulsing), `[ended]` (grey), or `[error]` (red) with a tooltip on hover. No more indefinite `[loading...]`.

The body is a monospaced, dark-background text region, fixed height (~24 lines) with internal scroll. Content is whatever the anima is emitting through its session — assistant text, tool call summaries, tool results — rendered as plain text, one event per line or block, in the order the session funnel records them. Ordering must match what you'd see if you tailed the session record on disk.

Behavior:
- On open: fetch the last ~200 lines of the session so far, render them, then subscribe to the live stream.
- On new event: append to the bottom. If the user is scrolled to the bottom (within ~40px), auto-scroll; otherwise hold position and show a small "↓ new output" chip at the bottom-right that scrolls to tail when clicked.
- On disconnect: switch pill to `[reconnecting…]` and retry with backoff. On reconnect, resume from the last event seen (no duplicates, no gaps — if gapless resume isn't possible, insert a visible `— reconnected, some output may be missing —` marker).
- On session end: switch pill to `[ended]`, stop the stream, leave the final output visible.

Unhappy paths: if the engine has no session, show `No session attached to this engine.` instead of the box. If the stream endpoint 404s or errors, show `[error]` and a one-line reason under the heading.

## Assumptions I made

- The session funnel already records session events somewhere the oculus backend can read (files, a log table, or an in-process event bus). I'm not asking for new persistence.
- There's an existing transport story in oculus for server-to-client streaming (SSE or websocket). Use whatever's already there; don't add a new one.
- "Session events" means the same stream you'd get tailing the session's record — the planner should confirm what fields/shape that is and pick a sensible plain-text rendering.
- The Spider page already knows which engine/session is selected; plumbing that id through to the stream subscription is straightforward.
- 200 lines of backlog is about right for a glance surface. Planner can tune.

## Deferred questions

- Is there an existing streaming endpoint for sessions we can reuse, or does one need to be added to the oculus backend? If the latter, is that in scope here or a prerequisite commission?
- What exactly lives in a session event record today — raw model output chunks, or already-structured turns? This shapes the rendering.
- Do we want tool calls/results visually distinguished (e.g., dim colour for tool output)? My default is "not yet, plain text is fine" — confirm before I change my mind.
- Should the box survive an engine transitioning from running → completed on the same page load, or reset? My default: keep it, switch pill to `[ended]`.
