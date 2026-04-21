# Sessions view — list, detail, live transcript

I want a first-class **Sessions** page in the Spider UI where I can see every session the guild has run or is running right now, drill into any one of them to read the transcript, watch live sessions stream in real time, and cancel a session with a single click. Today sessions are visible only indirectly (through the engine a writ happened to dispatch to), and the live-streaming behavior on the existing engine detail page is broken. This commission replaces that indirection with a proper session-centric view, and fixes streaming in both places.

## Reader and decision

The primary reader is **me, as patron, mid-work** — I've just dispatched a commission (or several) and I want to know: *is my work progressing, how much is it costing me, and do I need to intervene?* I'll hit this page many times a day, often with a session still running. The secondary reader is **me in post-mortem mode** the next morning, trying to reconstruct what an anima did and why — I need the full transcript and final cost to be legible a day or a week later.

The decisions this view supports:
1. "Is this session stuck — should I cancel it?" (live triage)
2. "What did the anima actually do, and did it do it well?" (transcript review)
3. "What is the guild costing me this week?" (cost awareness, at-a-glance)

## Scope

**In:**
- A `/sessions` route in the Spider with a paginated, filterable list of all sessions (running + historical).
- List columns: session id (short), status, role/anima, writ title (if dispatched from a writ), started-at, duration, **total cost in USD**, and a cancel button for running sessions.
- Hover tooltip on the cost cell: breakdown of USD cost per model tier *and* token counts (input / output / cache-read / cache-write).
- Session detail page at `/sessions/:id` showing metadata at the top and the full transcript below, styled the same way quick-engine transcripts render today on engine detail.
- **Live streaming** of the transcript on the session detail page when the session is running — new turns appear without a manual refresh.
- Fix the same streaming bug on the **existing engine detail page** so quick-engine transcripts stream live again.
- Cancel action wired to whatever the guild's existing session-cancellation mechanism is (not inventing new semantics).

**Out:**
- No editing, re-running, or forking of sessions from this view.
- No cost *aggregation* across sessions (no weekly total, no per-anima spend chart) — just per-session totals. I'll commission that separately once I'm living in this view.
- No search over transcript contents. Filtering is by status / role / writ only.
- No changes to how sessions are recorded or stored. This is a view layer commission.

## How it works

**List page.** Default sort is started-at descending. Running sessions pin to the top regardless of sort, with a pulsing status dot so I can spot them instantly. Status values I expect: `running`, `completed`, `failed`, `cancelled`. Filter chips across the top: status, role, "has writ / no writ." Clicking a row navigates to the detail page.

**Cost cell.** Display formatted as `$0.0423` (four decimal places — most sessions are cents). Hover tooltip is a small two-column table:

```
Input tokens       12,450    $0.0037
Output tokens       3,120    $0.0468
Cache read         98,201    $0.0029
Cache write         1,024    $0.0038
────────────────────────────────────
Total                        $0.0572
```

If cost data is missing for a session (e.g., old data), show `—` and no tooltip rather than crashing.

**Cancel button.** Inline on each running-session row. One click, no confirm modal — but the row visibly transitions to `cancelling` then `cancelled` so the action is legible. If cancellation fails, surface a toast with the error.

**Detail page.** Header block: session id, status, role, writ title (linked to the writ if present), started-at, ended-at (if applicable), duration, total cost with the same tooltip. Below that, the transcript, rendered identically to the quick-engine transcript view in the Spider today — I want visual consistency so I don't have to re-learn the UI.

**Live streaming.** For a running session, the detail page subscribes to the session's event stream and appends new turns as they arrive. A small "● Live" indicator near the header. When the session transitions out of `running`, the indicator disappears and the page settles into its final state without a reload. The fix on the engine detail page should use the same streaming mechanism — I expect the planner to consolidate, not fork.

## Assumptions I made

- The guild already records per-session cost and token breakdowns somewhere queryable. If not, that's a prerequisite and the planner should flag it.
- A session-cancellation API already exists (since sessions can already be cancelled via CLI/other means). The button just calls it.
- The streaming transport used by quick engines is reusable for arbitrary sessions — the bug is in the consumer, not the protocol. If the protocol itself is the problem, that's in scope to fix.
- "Role" is a meaningful per-session field (anima name or role tag). If sessions don't carry that directly, fall back to the writ's assigned role.

## Deferred questions

- Should cancelled sessions retain their partial transcript, or is it discarded? (My preference: retain.)
- Is there a session-retention policy I should respect? If sessions older than N days are pruned, the list needs to reflect that boundary.
- Do I want keyboard shortcuts on this page (e.g., `j`/`k` to move through rows, `x` to cancel)? Not in this commission, but flag if cheap.
- The streaming bug on engine detail — is there an existing issue/ticket describing the failure mode? If so, link it into the plan.
