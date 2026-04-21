# Running Rig — Session Log streams live, loses the "[loading...]" limbo

The Session Log box on Spider's running-rig detail is currently stuck in a pulsing "[loading...]" state and never populates. I want it fixed so it actually does what the label implies: a live running view of the anima's session, populated on open and appended as new events arrive. This is a bug with a product shape attached — the fleshing is mostly about pinning down what "connects to a realtime stream of session events" really means when someone opens the panel.

## Reader and decision

**Reader:** me (or whoever is at the Oculus Spider page supervising active work), watching a running anima engine that I suspect is drifting, stalled, or burning tokens.

**Decision:** should I let this engine keep cooking, or intervene (kill the rig, amend the commission, watch more carefully)?

**Frequency:** ad-hoc, during active runs. Seconds-to-minutes of attention per visit, not a passive dashboard I leave open.

The reader is not reading this as a historical artifact — that's what transcripts and books are for (#27). This surface exists because I want to catch a problem *while it's still fixable*, not read about it afterward.

## Scope

**In:**
- Session Log box on the existing Spider running-rig detail view populates on open with whatever the session has already emitted (historical backfill, bounded to what's in the session record).
- New events from the running session append live as they are produced.
- When the session terminates (completes, fails, is cancelled, or the engine exits), the log shows a clear terminus line and streaming stops — the contents stay visible, frozen.
- If the realtime stream disconnects or fails, the box says so explicitly — fail loud, not silent empty (#2). A disconnected indicator plus a "retry" affordance, or at minimum a readable error state.
- Events render at the grain the session already emits them at — one block per event (prompt turn, model response, tool call, tool result). Whatever shape the session record already carries, render it; don't invent a sub-grain (#27).

**Out:**
- Per-token streaming. The session's own event grain is the right grain; I don't want to reimplement token streaming on top of the event log when the event log is what's already there (#27, #17).
- Filtering, search, collapse/expand by event type, syntax highlighting. Those are v2 and earn themselves from a named second request (#18, #23).
- Historical session browsing from this panel. If the engine isn't running, there's no Session Log box (#11) — go look at the transcript.
- Cross-session views, comparison, replay scrubbing. Not this surface.
- A new page, a new route, a new websocket server specifically for this. Extend what Oculus already uses for its live subscriptions; it already streams other things (#26, #27).

## How it works

**On open:** the panel subscribes to the session's event stream. The first frame shows the backfill — events the session has already emitted, drawn from the same book/record the session is already writing to (#19, #27). No separate cache, no derived store. The panel walks the existing record on mount.

**Steady state:** as the session emits new events, they append to the bottom of the box in order. Autoscroll sticks to bottom when the user is at the bottom; if the user has scrolled up to read, it holds position and shows a "new events below" affordance at the bottom edge (small, unobtrusive — a content-bearing pill, not a badge count for its own sake) (#41).

**Event rendering:** each event is a block — a compact line or two with role (anima/tool/system), a timestamp, and the content. Text content renders as text; structured content (tool calls, tool results) renders in a readable but plain form — no collapsible JSON tree, no syntax-highlighted diff viewer in MVP (#23). If it reads like a transcript, we're done.

**Loading state (the current bug's replacement):** while the initial backfill is in flight, the box shows a content-bearing skeleton — "Loading session events..." with the session id, not a bare pulsing pill (#41). If backfill finishes with zero events (brand-new session, nothing emitted yet), the empty state says "Waiting for first event from <anima name>..." — not "No events."

**Terminus:** when the session ends, a final block renders with the termination reason (completed / failed / cancelled / engine exit) and the stream closes. The Session Log itself stays visible with its full contents — the rig card may transition out of "running" elsewhere in the UI, but the log doesn't evaporate under the reader.

**Disconnection:** if the stream connection drops while the session is still running, the panel shows a disconnected indicator inline and attempts reconnect. It does not silently reset to "[loading...]" forever — that's the current failure mode and the reason this petition exists (#2).

**Colocation:** the log sits where it already sits on the running-rig detail — below / adjacent to the engine identity and session-id header. I'm not moving it. The control conceptually adjacent to "this engine's live output" is the engine itself, and that's where it already lives (#40).

## Assumptions I made

- Oculus already has a live-subscription mechanism for Spider views (the "[loading...]" pill implies a stream subscription was wired but is not delivering). The fix is repairing that wiring, not inventing a new transport. Planner should verify.
- The session's emitted events are already persisted to a record/book that the Oculus backend can query for backfill. If that record doesn't exist at a usable grain, the scope shifts — flag it.
- The event grain produced by the session is human-readable when rendered plainly (role + timestamp + content). If events are currently raw provider frames with no role/content shape, some light normalization belongs in the Oculus backend adapter, not the frontend.
- The "Session Log [loading...]" label is the only affected surface on the running-rig detail. If other boxes on the same page (engine status, token counters, etc.) are similarly stuck, that's a sibling bug worth bundling (#36) — but I'm scoping this petition to the log specifically.

## Deferred questions

- What is the actual failure mode of the current "[loading...]" state? Is it a subscription that never fires, an event handler that drops on the client, a backend endpoint returning nothing, or a backfill-vs-live-join race? The planner should root-cause before patching (#31) — the fix depends on where the break is.
- Is there already a convention in Oculus for "live event stream panel" (used by any other view)? If yes, conform to it. If no, this is the first such panel and its shape becomes precedent (#13) — worth treating as load-bearing.
- Do we want a per-event link-out to the underlying session record / transcript for deeper inspection, or does the log stand alone? MVP says stand alone; confirm.
- Engine types other than anima engines: do any of them emit session-shaped events that this panel should also render, or is the "only for anima engines with an agent session" restriction still correct? I assumed yes — confirm.
