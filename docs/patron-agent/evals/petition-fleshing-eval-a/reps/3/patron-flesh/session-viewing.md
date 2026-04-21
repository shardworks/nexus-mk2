# Session viewing — list, detail, and live transcript

I want to see what's running right now, what it's costing me, and what it just said — without tailing a log file or grepping the books. Put this in the Spider, not in a new surface. The Spider already owns engine views and already tries to stream transcripts; sessions are the conceptually adjacent thing and the infrastructure is 80% there (#26).

Before any feature work: **the realtime streaming bug in the Spider's engine detail page is the root, not a side note.** Fix the streaming plumbing first, then both the existing engine view and the new session view benefit from one fix. I don't want the session view built on top of the same broken streaming and then "we'll fix it later." Source, not consumer (#31).

## Reader and decision

**Reader:** me (Sean), operating the guild day-to-day. This is a patron surface.

**Decisions:**
- *Is anything still running that I should kill?* (cancel)
- *What did that run cost me?* (cost column + tooltip)
- *What did the agent actually say during that session?* (transcript drill-down)

**Frequency:** many times per day during active work — I open the Spider, glance at the sessions tab, decide whether to intervene. The common interaction is scan-the-table, occasionally click-to-inspect, rarely cancel.

## Scope

**In:**
- A **Sessions** tab/section in the Spider (not a new top-level page).
- Table of sessions — current + past — with columns: status, role, writ title (when the session is attached to a writ), started-at, duration, total cost USD.
- Hover-tooltip on the cost cell showing the token-level breakdown (input tokens, output tokens, cache reads/writes, model, USD per component, USD total).
- A **Cancel** action colocated on the row for sessions in a running state (#40). Confirmation is fine; a second click is fine; don't make me open a detail panel first.
- Click-through to session detail: metadata header + transcript display, using the same transcript component the Spider already uses for quick engines (#26, #27).
- **Realtime streaming** of transcript output when the session is live — on both the new session detail and the existing Spider engine detail. Same underlying streaming mechanism, fixed once.
- Fallback display when there's no writ title: role + first human/prompt line, truncated. Not a timestamp, not `<untitled>` (#41).

**Out (defer, not never):**
- Filtering, search, sort-by-column beyond default ordering. Scan works for my current session volume; filters are speculation until I ask for them (#18, #23).
- A cost **chart** or cost **analytics** view. "Analytics" is a category name, not a workflow (#25). If I want to investigate cost later I'll ask for a drill-in from the table.
- Session-to-session comparison, diffing, replay.
- Session tagging, notes, annotations.
- Alerting on runaway cost / long-running sessions.
- Aggregated cost across sessions (roll-ups by role, by day, by writ). Second consumer, second feature (#18).

## How it works

**Placement.** Spider gets a **Sessions** tab alongside its existing views. No new webapp, no new top-level dashboard. The new content reuses Spider shell, transcript renderer, streaming client (#26, #27).

**Data.** All of this reads from existing session records and transcripts in the books. Cost is **computed on read** from the usage records already written during the session — do not add a persisted `totalCostUsd` field to the session record (#19, #27). If the computation is expensive enough that someone proposes caching it, that's a conversation, but the default is compute-on-demand.

**Table shape.** Default drill-down table (#28). Rows are sessions, newest first. Columns: **Status · Role · Writ · Started · Duration · Cost · Actions**. Status is the session lifecycle state (running / completed / failed / cancelled — whatever the existing session record already carries, don't invent new states). The Writ column shows the writ title when the session is attached to a writ (mandate or other type); when it isn't, show `—` and let the row's Role + first-prompt-line fallback carry recognition in detail view.

**Cost cell.** Single USD figure in the cell. Hover opens a tooltip with the breakdown: model name, input tokens → USD, output tokens → USD, cache read/write → USD, total USD. Tooltip is derived from the same usage records. No separate aggregation layer.

**Cancel.** Button on the row, visible only when the session is in a cancellable state. Click cancels. Failure-mode: if the session isn't actually cancellable anymore (race), **fail loud** with a toast/error — don't silently show success (#2). No retries, no backoff (#4).

**Detail view.** Click a row → detail pane. Header: same columns as the row plus the cost breakdown inline (no tooltip needed here, just render the table). Below: the transcript component the Spider already uses, exactly as-is (#3, #27). If the session is live, the transcript streams; if it's complete, it renders static.

**Streaming fix.** The Spider streaming mechanism is broken on engine detail. Diagnose and fix at the streaming layer — whatever component owns "subscribe to new transcript lines for an active run" — not by adding a polling workaround on the page (#31). Once fixed, the session detail consumes the same subscription. I expect one fix, two consumers.

**Register.** Column header is "Writ", not "Task" or "Job". Role is the anima's role name. Guild vocabulary, not industry vocabulary (#34). "Session" is already our term.

## Assumptions I made

- The Spider is the right host. I'm confident, but the planner should confirm the Spider can accept a new tab without a significant shell refactor. If it can't, flag it — don't silently build a new page.
- Per-session cost can be reconstructed from existing usage records on the session. If usage isn't already recorded at the granularity needed for the tooltip, that's a separate upstream conversation before this feature is viable.
- "Cancellable" is a state the session record already exposes. If not, infer from lifecycle state rather than adding a new field.
- Streaming is broken at the subscription/transport layer, not at the data layer. If it turns out the bug is actually "transcripts aren't being written as they're produced," the scope shifts and I want to hear about it before you proceed.

## Deferred questions

- Does the Spider currently have a tab/section architecture that accepts a new top-level view cheaply, or is this a shell change? Answer shapes the effort estimate.
- Is there a session record already, at a well-defined path in the books, that carries status + role + writ-ref + usage? I assume yes. If the "session record" is currently a log artifact rather than a structured writ, surface that — I'd want to talk about it before the feature is built on a shaky substrate (#20).
- What's the volume? If there are 10k historical sessions in the books, scan-the-table breaks and we revisit the "no filter" call. I'd guess my volume is closer to hundreds; confirm.
- The streaming bug's actual root cause — worth a brief diagnostic pass before the planner commits to "fix the streaming layer." If the fix is bigger than expected, I want to know.
