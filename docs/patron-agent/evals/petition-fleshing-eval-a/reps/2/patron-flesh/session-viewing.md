# Sessions view in the Spider

I want a sessions table in the Spider where I can watch what's running now, scan what ran recently, drill into a single session to read its transcript and see what it cost, and cancel anything that's gone sideways. This is a Spider extension, not a new surface (#26).

## Reader, decision, frequency

**Reader:** me, operating the guild during active work. Possibly another operator later, but I'm the only named reader today (#22).

**Decision:** "Is something running that shouldn't be? Is something stuck? Do I need to kill it? Did that commission cost more than I expected, and if so, where did the tokens go?"

**Frequency:** many times per working day while animas are dispatched. This is glance-and-act, not a report I read weekly.

## Reframe: one streaming fix, not two implementations

The brief reads "implement streaming here, and fix it in the Spider too." Reject that framing (#39, #31). The right move is: the realtime log stream is a *single* broken capability that two surfaces need. Find the source of the break and fix it once, then both surfaces consume the fixed stream. I do not want two parallel streaming implementations drifting out of sync. If the diagnosis reveals the engine-detail page and the new session-detail page genuinely need separate plumbing, that's a finding to surface back to me — but the default is one fix.

## Scope

**In:**

- A **Sessions** section in the Spider — table of current and recent sessions.
- Table columns: status, writ title (when the session is tied to a writ), role/anima name, started-at, duration, total cost in USD.
- Hover tooltip on the USD cell showing the cost broken down by model and by input/output/cache-read/cache-write tokens alongside the dollar subtotals.
- **Cancel** button on each row for sessions whose status admits cancellation (running/stuck). Verb is "cancel" to match the existing writ lifecycle vocabulary `completed/failed/cancelled` (#32, #34).
- Click-through to a session-detail view: transcript (same component the Spider already uses for quick-engine detail — reuse, don't rebuild #27), plus the metadata surfaced in the row, plus a cancel control colocated with the transcript (#40).
- **Realtime streaming** of the transcript on the detail view when the session is running. Shared fix with the engine-detail page — one source, two consumers.

**Out:**

- Filters, search, date pickers, bulk-select. Not MVP (#23). The default sort (running first, then most-recent) is the filter.
- Charts, cost-over-time graphs, aggregate spend dashboards — a category-named temptation (#25). I'm answering "what did *this* session cost," not "what's our burn rate."
- Per-session re-run or clone actions. Second consumer hasn't asked (#18).
- A separate page or webapp. Extends the Spider (#26).
- Cost thresholds, alerts, budget caps. Separate feature, separate decision.
- Role-based access, audit trail of who cancelled what. One operator today; earn the multi-user story later (#18).

## How it works

**Placement.** New Spider tab/section called **Sessions**, peer to whatever the current top-level Spider navigation offers. Drill-down table (#28) — Sean's default interaction pattern.

**Row shape.** One row per session. Status is first column because that's what drives my eye ("anything red? anything hung?"). Writ title second — it's the human handle on "what was this session *for*." Role third. Start/duration/cost trailing.

**Empty writ title.** When a session isn't bound to a writ, show a content-bearing fallback — the first meaningful line of the initial prompt, or the session's role + timestamp composite — not "(no writ)" or a raw UUID (#41).

**Cost cell.** Dollar amount as the visible value. Tooltip on hover shows a small table: per-model rows with input tokens, output tokens, cache reads, cache writes, and dollar subtotal for each. Totals at the bottom. This is the adequate answer to "where did the money go" (#24) without being a full analytics page.

**Cancel button.** On-row for quick kills, repeated in the detail view near the transcript (#40). Disabled/hidden for terminal statuses. Fail loud if cancel can't be delivered — no silent "tried our best" states (#2).

**Detail view.** Reuses the Spider's quick-engine transcript component. When the session is running, the transcript streams new entries as they arrive. When the session is terminal, it's a static read.

**Streaming fix.** Before touching either UI, diagnose why the engine-detail streaming broke. Fix at that source. Both the engine-detail page and the new session-detail page consume the fixed stream. If two separate fixes genuinely are needed, raise that to me as a decision — don't silently fork.

**Data source.** Session records are already written by the session funnel (#27). Read from there. No new aggregation layer, no cache, no sidecar. Compute cost-breakdown on demand from the same per-turn records the total is computed from.

## Assumptions I made

- Session records already carry per-turn token counts and per-model cost data sufficient to compute both the headline USD and the tooltip breakdown. If the data isn't there, the first finding is "instrument the session record," not "build a separate cost store."
- The Spider is the right home. If there's a specific reason sessions belong elsewhere (e.g., the Spider is framework-side and session records are sanctum-side and the boundary blocks this), raise it.
- The engine-detail transcript component is reusable as-is or with light props — not a rewrite.
- "Cancel" maps to an existing signal the session runner already understands. If there is no graceful-cancel path today, the petition grows a sibling: "add cancel signal to session runner." Flag this rather than papering over it.
- Sessions without writs exist and need a reasonable display — this is the content-bearing fallback call above.

## Deferred questions

- **What statuses can a session be in, exactly?** I've assumed running / stuck / completed / failed / cancelled by analogy to writs. Confirm the session-side enum before the table columns harden.
- **Is there a max rows / retention story?** I haven't scoped "show last N" vs. "show all." For MVP, "everything currently in the session records book" is fine unless that's unreasonably large — then ask me.
- **Streaming mechanism.** I don't know whether the existing stream uses SSE, websockets, poll-and-diff, or something else. The diagnosis of the engine-detail break will surface this; I want to see the root cause before picking an implementation (#31).
- **Role column — is that the anima name, the role id, or both?** I want the anima name (the human handle), but confirm the data is joinable cheaply.
- **Does "session" here include Coco sessions, or only dispatched anima sessions?** Default: all sessions in the session book. Push back if there's a reason to exclude.
