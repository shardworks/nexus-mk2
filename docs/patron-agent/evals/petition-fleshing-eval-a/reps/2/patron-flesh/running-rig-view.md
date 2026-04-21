# Running Rig — Session Log That Actually Streams

The Session Log box on the Spider page's running-rig view is a broken promise: the slot and the pill are already in the DOM, but the stream behind it was never wired up. I want it wired up. When I'm looking at a running rig with an anima session attached, that box shows the session's output as it's produced, appended live.

## Reader and decision

Me (or anyone else with Oculus access) peeking at a running rig to answer one of three questions:

- **Is this anima actually making progress, or is it stuck?**
- **What is it working on *right now*?** (before I decide whether to intervene)
- **What did it just do?** (when something smells off and I want to see the last few turns without opening the transcript book)

Ad-hoc frequency — I pull up the Spider page when a commission is in flight and I want a live look. This is the "watch the anima think" surface (#22, #25).

## Scope

**In:**

- The existing `Session Log` box on the Spider page, for rigs currently running an anima session.
- Streaming session events (anima messages, tool calls, tool results, turn markers) from the live session and appending them as they arrive.
- An honest empty/idle/ended state in the same slot.
- Reconnection on transient disconnect.

**Out:**

- Any new page, tab, modal, or sidecar panel. The slot exists; extend it (#26).
- Historical transcript replay for *completed* rigs. The brief names *running* rigs — that's the workflow. A completed rig already has a transcript book to open. Don't widen the scope (#23).
- Filtering, search, export, or controls inside the log. The reader's question is "what's happening now"; a text-append view answers it. Anything else is v2 or never (#23).
- Anima controls (pause/stop/intervene) on this surface. Separate decision, separate petition.
- A new event schema. Whatever the session already writes to its transcript book is what we render (#27).

## How it works

The session already writes structured events to its transcript book as it runs — that's the existing infrastructure and I want the view to read from it, not from a new aggregator (#27). The backend for the box subscribes to the transcript book for the active session and pushes appends over the existing Oculus realtime channel (SSE or whatever the Spider page already uses for its live data — match what's there, don't invent a parallel pipe (#3, #15)).

On open, the box:

1. Loads the transcript-so-far for the current session (bounded — say the last ~200 events or last ~50KB, whichever is smaller; enough to give context on what's in flight without dumping the entire history).
2. Subscribes to new events and appends them as they arrive.
3. Auto-scrolls to the tail by default; if the reader has scrolled up, pause auto-scroll and show a small "jump to latest" affordance at the bottom.

Render is a plain text-ish transcript view — one block per event, with minimal styling to distinguish role (anima message / tool call / tool result). Same register as the transcript book, because that's literally what it is. No charts, no expandable cards, no message-threading UI. It's a log (#28 — drill-down tables are my default, but this isn't tabular data; a transcript slot wants transcript rendering).

**States and transitions** (#2, #41 — fail loud, content-bearing defaults):

- **No session attached to this rig:** box reads `No active anima session on this rig.` — not loading, not empty.
- **Session attached, no events yet:** `Session started HH:MM:SS — waiting for first output…` — the timestamp is content-bearing, the pill can stay while we genuinely wait on the first event.
- **Session running:** events stream in, appended.
- **Session ended (completed/failed/cancelled):** stream closes cleanly, final line reads `Session <outcome> at HH:MM:SS.` and stays. The box does not reset to loading. If the rig is still "running" but the session is done, that's its own visible state, not a silent empty.
- **Stream dropped mid-session:** one retry with a short backoff, then surface `Stream disconnected — retrying…` inline. If it stays down past a threshold, show `Stream unavailable. Refresh to retry.` Do not silently keep a dead socket open behind a hopeful pill (#2).

The pill above the box should reflect the *actual* state — `streaming`, `idle`, `ended`, `disconnected` — not a permanent `[loading…]` lie.

## Assumptions I made

- Anima sessions already write structured events to a transcript book in realtime. If they don't — if the transcript is only written at session end — then this petition collapses into "first fix the transcript to be append-as-you-go," and that's a different shape of work. Planner should verify.
- The Spider page already has a realtime channel it uses for other live data on that page. If not, and this would be the first realtime surface, that's a bigger commission than I'm fleshing here.
- "Session events" means anima messages, tool calls, and tool results — the things a reader wants to see. Framework-internal bookkeeping events (token counts, cache stats, etc.) are out of scope for this box.

## Deferred questions

- Bound on initial backfill: I suggested "last ~200 events or ~50KB" — the planner should pick the actual cutoff that matches how big a typical in-flight transcript gets and how fast the UI can render it without jank. I don't care about the exact number; I care that we don't dump a 10MB history into the DOM.
- If a rig's session is swapped mid-view (one session ends, another begins on the same rig), does the box reset and restart, or show both sequentially? My instinct: reset on new-session-attached, because the reader's question is "what's happening now," not "what has ever happened on this rig." Confirm.
- Does the Oculus Spider page already distinguish "rig running, no session" from "rig running, session attached" visually elsewhere? If so, match that vocabulary in the empty-state copy (#32, #34).
