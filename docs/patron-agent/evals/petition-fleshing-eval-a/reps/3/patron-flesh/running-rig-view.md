# Wire up the Spider session-log tail

The Session Log box on the Spider page's running-rig view is a half-finished surface: the slot exists, the heading exists, the pulsing `[loading...]` pill exists, but nothing is wired to it. I want it filled in — the box should tail the live anima session's stdout the way `tail -f` tails a file, with new output appended as the anima produces it. The feature isn't "a realtime stream of session events" — I don't want structured event objects surfaced here. I want the raw text the anima is emitting, appearing as it happens.

## Reader and decision

The reader is me (or any operator) sitting on the Spider page while a commission is in flight, trying to answer one question: **"Is this anima making sensible progress right now, or is it stuck / flailing / doing something I need to interrupt?"** Frequency: whenever I've dispatched something non-trivial and want to watch it work — which during active development is often, several times a day. The decision is "let it run" vs "kill it and redispatch." That's the only decision this surface has to serve (#22, #25).

## Scope

**In:**
- Append-only text pane that tails the running anima session's output for the selected engine.
- Auto-scroll to bottom when new content arrives, *unless* the operator has scrolled up (don't yank them away from what they're reading).
- Three explicit, content-bearing display states for the heading/empty-state (#41): "Waiting for anima to begin…" (session dispatched, no output yet), "Streaming" (output arriving), and "Session ended" (the rig is still listed but the session has terminated — brief moment before it drops off the running list). Replace the `[loading...]` pill entirely; it's metadata masquerading as content.
- A visible, loud failure state if the stream disconnects or can't attach: "Stream disconnected — session may still be running. Reload to retry." Not a silent empty box (#2).

**Out:**
- Historical/completed-session logs. Running-rig view is for running rigs; once the rig is gone, the log is gone with it. Looking up what a finished session did is a separate surface (commission detail / session record) and not part of this slice.
- Filtering, search, regex, highlighting within the log text.
- Structured rendering of tool calls, thinking blocks, or other session-event richness. Raw output only. If we want structured introspection that's a different feature with a different reader.
- Multi-session-per-engine handling. One engine, one active anima session, one log. If the data model says otherwise, see deferred questions.
- Any new storage, cache, or aggregation layer. The session transcript is already being captured somewhere in the books / session record — tail *that*, don't build a parallel pipe (#27).
- Back-pressure / rate-limit UI. If the anima produces 10KB/sec, the box shows 10KB/sec. If that becomes a real problem we'll deal with it when a second consumer shows up (#18).

## How it works

When the operator selects a running rig whose engine has an active anima session, the Session Log pane subscribes to that session's output stream and begins appending. Heading reads "Session Log — Streaming" while chunks arrive; flips to "Waiting for anima to begin…" if the session exists but hasn't emitted yet; flips to "Session ended" on termination. No pulsing pill — the heading's text is the state (#41).

The stream itself should ride whatever mechanism Oculus already uses to push live data from the guild into the browser (SSE, websocket, long-poll, whichever the Spider page is already using for its existing live-refresh behavior). Don't introduce a new transport for this one pane — extend the existing surface's plumbing (#26). The source data is the session transcript that's already being recorded; Laboratory / session-record writes it, this pane reads from it, tail-style.

Auto-scroll is pinned-to-bottom by default. When the user scrolls up more than a few lines from the bottom, stop auto-scrolling (they're reading something). When they scroll back to the bottom, resume. Standard log-tail behavior; no settings, no toggle.

If the subscription fails to attach — session id unknown, endpoint error, permission issue, whatever — the pane shows an explicit failure message, not an empty box with a spinner forever (#2). Reload-to-retry is fine; no automatic exponential-backoff retry loop (#4).

## Assumptions I made

- There is already a structural source of truth for live session output (session transcript / book / record) that Oculus's backend can subscribe to. If not, that's a bigger piece of work and the planner should flag it — I am *not* commissioning a new session-capture layer here (#27).
- The Spider page already has at least one live-data mechanism in use (for the rig list itself refreshing). This feature reuses that transport.
- "Anima engine with an agent session" is a well-defined runtime distinction; non-anima engines or anima engines without a live session don't show the Session Log box at all (or show it disabled). I'm assuming the existing render logic already handles that gate correctly since the box only appears conditionally today.
- One active session per running engine at a time.

## Deferred questions

- **Where is session output currently being recorded, and is it tailable?** If it's only written to disk at session end, or only to a log file with no structured book entry, the shape of this work changes — it becomes "first make session output streamable" before "display the stream." Planner should verify before scoping.
- **What's the intended behavior the instant a session ends?** Does the rig drop off the running list immediately (log vanishes mid-read), or is there a grace window where "Session ended" stays visible? I'd prefer a short grace window so the last few lines are legible, but this depends on how running-rigs is already computed.
- **Is there a reason not to reuse the transcript verbatim?** If the recorded transcript includes framing/metadata that shouldn't be shown to the operator (internal system prompts, tool-call JSON), we'll need a view projection. I'd rather show the same thing the anima is emitting on stdout than invent a filtered view, but flag if the raw transcript is unsuitable.
