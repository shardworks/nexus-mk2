# Fix the Spider page's Session Log so it actually streams

The Session Log box on the Spider page's running-rigs view is supposed to show the live anima session as it unfolds. Right now it sits empty with a pulsing `[loading...]` pill forever. I want it to connect to a realtime stream and append new content as the anima generates it — so when I'm watching a running engine, I can actually watch it think.

## Reader and decision

The reader is me (or another operator) sitting on the Spider page of Oculus while an anima engine is mid-run. The decision I'm making is almost always **"is this session healthy, or do I need to intervene?"** — am I watching coherent tool use and reasoning, or is the anima stuck in a loop, hallucinating paths, waiting on something, or burning tokens on nothing? I check this several times a day when commissions are in flight, and I want to be able to glance at it without refreshing or reloading.

## Scope

**In:**
- Fix the Session Log box on the running-rigs view for anima engines that have an agent session attached.
- Wire the box to a live event stream for that session — new assistant text, tool calls, and tool results appended as they arrive.
- On initial mount, backfill whatever has already happened in the session so I'm not staring at a blank box when I open the page mid-run.
- Auto-scroll to the bottom as new content streams in, but pause auto-scroll if I've manually scrolled up (so I can read history without getting yanked back).
- Clear the `[loading...]` pill once the stream is connected; replace with a small "● live" indicator while connected and "○ disconnected" if the stream drops.

**Out:**
- No filtering, search, or per-event-type toggles in this pass — one flat transcript is fine.
- No export/download button yet.
- No styling overhaul of surrounding running-rigs UI.
- Non-anima engines (anything without an agent session) — leave current behavior, just don't show the Session Log box at all for those.
- Historical sessions (completed / failed engines) — out of scope for this fix; this is for *running* rigs.

## How it works

The Session Log shows a scrolling transcript of the live session, rendered as a simple chronological list of entries. Each entry is one of:

- **assistant text** — plain prose the anima emitted, rendered as-is.
- **tool call** — rendered as a single compact line: `→ ToolName(short arg summary)`.
- **tool result** — rendered as a collapsed line showing tool name + truncated first line of output, expandable on click.
- **system/meta events** (session start, model switch, errors) — rendered as muted italic lines.

Streaming should feel live: assistant text appends token-by-token (or in small chunks) rather than waiting for the whole turn to complete. If that's not cheap, turn-level granularity is acceptable as long as there's no multi-second stall between the anima finishing a turn and it appearing in the box.

The "live" dot sits in the heading where `[loading...]` currently lives. If the underlying session ends while I'm watching, swap the dot for a small "session ended" label and stop streaming — don't hide the transcript.

Reasonable scrollback cap: keep the last ~2000 entries in the DOM, trim older ones with a "…earlier history trimmed" marker at the top. I don't need infinite retention in the browser.

## Assumptions I made

- There is already a server-side record of session events for running anima engines (the loading state implies *something* is being fetched). The fix is connecting the UI to an existing feed, not inventing one. If no feed exists, that's a bigger petition — flag it.
- The transport will be SSE or WebSocket; I don't care which, planner picks what fits the existing Oculus stack.
- "Engine" in this view maps 1:1 to a single anima session while it's running. If one engine can have multiple concurrent sessions, we'll need to rethink the box, but I'm assuming not.
- Tool call arguments and results can be large; truncation at render time is fine.

## Deferred questions

- Is the empty-box bug a frontend wiring problem, a missing backend endpoint, or both? I'd like the planner to diagnose before scoping the fix — the petition assumes "mostly frontend wiring" but I want that confirmed.
- Do we already have a session-event schema I should conform to, or does this petition also cover defining one?
- Are there auth/permission concerns for streaming session content to Oculus that aren't already handled by whatever loads the running-rigs view itself?
