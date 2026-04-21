# Sessions view — list, details, live transcripts

I want a first-class Sessions view in the Spider: a list of all sessions (current and past) I can scan, click into for details, and watch live as they run. Right now I don't have a clean way to see what agents are doing across the guild or to kill a runaway session without digging through process state. Fix that, and fix the streaming transcript while we're in there.

## Reader and decision

The reader is **me (the patron)**, sitting in the Spider while work is in flight. Primary decisions:

1. **Is anything stuck or burning money?** Scan the list, spot a session that's been running too long or has climbed past an expected cost envelope, decide whether to let it run or cancel it.
2. **What did that agent actually do?** Open a past session's detail to read the transcript — usually because a writ landed in an unexpected state and I want to understand why.
3. **Is this session making progress right now?** Open a running session and watch the transcript stream live, the way I currently (try to) do on the engine detail page.

Usage cadence: several times a day during active development, ambient rather than heavy.

## Scope

**In:**

- A **Sessions list page** in the Spider web UI showing all sessions — running and completed — most recent first.
- Columns: session id (short), status, role (the anima name/role that ran it), writ title if the session is bound to a writ, started-at, duration, total cost USD.
- Cost USD column has an on-hover tooltip with the breakdown: USD subtotal, input tokens, output tokens, cache-read tokens, cache-write tokens. Just a plain tooltip, nothing fancy.
- A **Cancel button** on each row (and on the detail page) for sessions in a cancellable status. Confirmation prompt before it fires.
- A **Session detail page** reachable by clicking a row. Shows the metadata header, the linked writ (if any), and the transcript rendered the same way quick-engine transcripts render today in the Spider.
- **Live streaming** of the transcript for running sessions on the new detail page.
- **Fix the streaming bug on the existing engine detail page** so that page also streams live. Same underlying mechanism.

**Out:**

- Filtering, searching, sorting beyond the default reverse-chronological order. I can live without these for v1.
- Pagination polish — just load the most recent N (say 100) and call it done for now.
- Editing or re-running sessions from this view.
- Anything about the CLI. This is a Spider web-UI commission.
- Aggregate analytics (cost-per-day, session-count-by-role, etc.). Out of scope; different view.
- Authorization / multi-user concerns.

## How it works

**List page** lives at something like `/sessions`. Flat table. Status rendered as a coloured chip (`running` green, `completed` neutral, `failed` red, `cancelled` grey, `stuck` amber). Writ-title column links to the writ if present, dash if not. Cost shows as `$0.1234` to four decimal places; tooltip appears on hover over the cost cell and shows a small four-row table (input / output / cache read / cache write tokens, with their USD subtotals).

**Cancel button** is a small icon button in the rightmost column, visible only when status is `running` or `new`. Click opens a confirm dialog ("Cancel session `abc123`?") and on confirm calls whatever the existing cancel path is. Row status flips to `cancelling` immediately (optimistic) then settles.

**Detail page** at `/sessions/:id`. Header block with the same metadata as the list row plus model, start/end timestamps, and the full writ breadcrumb if linked. Body is the transcript, rendered with the same component the Spider already uses for quick-engine transcripts — I want visual consistency, not a new transcript renderer.

**Live streaming.** If status is `running`, the transcript appends new events as they arrive. The engine detail page is supposed to do this today and doesn't — the fix should share a transport with the sessions view so we only debug this once. I expect the root cause is either a subscription that isn't being re-established after the initial render or a backend stream that isn't flushing; the planner should confirm. Auto-scroll to bottom when new content arrives, but pause auto-scroll if the reader has scrolled up.

## Assumptions I made

- The Spider already has the data model for sessions, cost, and token breakdowns — I'm asking for a view, not a new schema. Planner should confirm.
- Cost and token counts are already recorded per session somewhere queryable. If they aren't, surface that before starting.
- The "quick engine transcript" component is reusable as-is. If it's tangled with engine-specific concerns, factor it out; don't fork it.
- `cancel` is already a supported operation on sessions at the API / runtime level. This commission is a UI affordance, not new backend capability.
- "Role" on a session means the anima's role (e.g. `coco`, `ethnographer`). If sessions carry something richer, use that.

## Deferred questions

- What statuses does a session actually have in the current model? I listed a plausible set; match reality.
- Is there a streaming channel already in place (WebSocket, SSE, polling) that I should reuse, or do we need to pick one? Prefer reusing whatever the engine detail page was *supposed* to use.
- Should cancelling a session also cancel the linked writ, or just the session? My lean: session only, writ stays open so a human can decide next steps. Confirm with me.
- Is there a retention policy for old sessions I should respect in the listing (e.g. older than 30 days hidden)?
