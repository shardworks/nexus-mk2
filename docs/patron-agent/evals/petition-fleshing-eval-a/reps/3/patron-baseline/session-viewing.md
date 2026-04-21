# Session viewer — current and past sessions, with live-streaming transcripts

I want a first-class Sessions page in the Spider UI that lets me see what's running right now across the guild, what ran recently, what it cost, and what was actually said inside it. When something is stuck or runaway, I want to kill it with one click. When something is running, I want the transcript to stream live — not refresh-on-poll, not "reload to see more." The engine detail page already gets this wrong; I want this new page to get it right, and I want the engine page fixed to match.

## Reader and decision

The reader is **me (the patron) monitoring the guild**, plus any operator doing the same role. The decisions this view supports, in order of frequency:

1. **"What is running right now, and is any of it stuck or burning money?"** — glance at the list, see status, see live cost; if something looks wrong, cancel it.
2. **"What did that anima actually do in that session?"** — click in, read the transcript, follow the reasoning.
3. **"How much are sessions costing, and which ones are expensive?"** — scan cost column, sort, spot outliers.

Expected usage pattern: I open this page multiple times a day, often while a session is mid-flight. It's a live operations console, not an analytics dashboard.

## Scope

**In:**
- A Sessions list view (table) showing current + past sessions in one unified list, sorted newest-first by default.
- Columns: session id (short), status, writ title (if bound to a writ — else em-dash), role/anima name, started-at (relative), duration, total cost in USD.
- The cost cell has a hover tooltip breaking down: input tokens, output tokens, cache-read tokens, cache-write tokens, and the USD cost derived from each.
- A Cancel button on any row whose status is a live/running state. Clicking it cancels the session (confirmation modal — one click to confirm).
- A Session detail view reachable by clicking a row. Shows metadata (everything from the row, plus launched-by, model, guild path) and the full transcript, rendered the same way the Spider's quick-engine view renders it.
- **Live streaming** of the transcript when the session is running — new turns/tool calls/output appear in the detail page without a reload. Auto-scroll to the tail unless the user has scrolled up.
- Fix the existing streaming bug on the engine detail page so it behaves the same way.

**Out:**
- Filtering/search beyond a simple status filter (running / completed / failed / cancelled / all). No free-text search this round.
- Retry/re-dispatch from the UI. Not now.
- Cost rollups across sessions (totals by day, by anima, etc.). Not now — single-session cost only.
- Editing session metadata. Read-only view.
- Auth / multi-user access controls. This is my operator console; same trust model as the rest of Spider.

## How it works

**List view.** Default sort: started-at desc. Running sessions pinned at the top with a subtle "live" dot. Status rendered as a coloured pill (green=running, grey=completed, red=failed, amber=stuck, slate=cancelled). The list polls every 5s for new rows and status changes; individual rows with live cost update inline as tokens accrue.

**Cost display.** Column shows e.g. `$0.0423`. Tooltip on hover (or tap on mobile) expands to a small table:
```
Input tokens        12,431    $0.0124
Output tokens        3,201    $0.0160
Cache read         102,883    $0.0103
Cache write          1,204    $0.0036
———————————————————————————————
Total                         $0.0423
```

**Cancel button.** Visible only on running sessions. Opens a confirmation ("Cancel session X? This will terminate the anima mid-turn."). On confirm, issues the cancel and the row transitions to a `cancelling` state, then `cancelled`. If cancel fails, row shows an error toast with the reason.

**Detail view.** Route: `/sessions/:id`. Top panel: metadata block. Main panel: transcript, rendered identically to the quick-engine transcript view — same components, same styling, no divergence. Side panel or header: cost breakdown (same data as tooltip, but persistent).

**Live streaming.** The transcript subscribes to a server-sent stream (or WebSocket — planner's call) keyed on session id. New events append to the bottom. The same streaming mechanism gets wired into the engine detail page, replacing whatever is currently broken there. Acceptance: I can open a session detail page, kick off a task that takes 90 seconds, and watch each tool call and each assistant turn appear as it happens, with no manual refresh.

**Stuck/finished transitions.** When a streaming session ends, the live indicator clears, status pill updates, and a "Session ended" divider appears at the tail of the transcript. No surprise jumps.

## Assumptions I made

- The framework already exposes a cost-tracking mechanism per session with the token-category breakdown I described. If it doesn't, the planner needs to surface what's actually available and we'll cut the tooltip accordingly.
- "Cancel" is already possible at the API level for a running session. If it isn't, that's a prerequisite, not something to build inside this commission.
- Sessions are identifiable by a stable id usable as a route param and a stream key.
- The quick-engine transcript component in Spider is reusable / factorable out — not a one-off tied to the engine page.
- "Role" in the brief means the anima role/name (e.g. Coco, Ethnographer). If it means something else (writ role? engine role?), flag it.

## Deferred questions

- Does the existing engine-detail streaming bug have a known root cause, or is diagnosis part of this commission? I'd like the planner to scope both the fix and the new implementation as one piece of work so they share the plumbing.
- How long do we retain past sessions in the list? Forever, last N days, or pagination with no hard cutoff? My default is "pagination, no cutoff" but confirm.
- Is there a notion of "session tree" (parent/child sessions via `--resume`) I should expose here, or do we treat each session as a flat row for this first cut? I'd lean flat-row for v1 unless surfacing the tree is cheap.
- Should cancelling a session that's bound to a writ also mark the writ `cancelled`, or leave the writ alone? My instinct: leave the writ alone, let me decide separately — but confirm.
