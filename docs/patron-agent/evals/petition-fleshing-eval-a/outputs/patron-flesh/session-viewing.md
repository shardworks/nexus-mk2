# Sessions view — list, inspect, cancel, with live transcript streaming

I want a single surface where I can see every session that's running right now or has run recently, drill into one to read its transcript, watch it stream live if it's in-flight, and kill it if it's going sideways. The streaming is the load-bearing capability — everything else is table-stakes around it.

## Reader and decision

**Reader:** me, as patron-operator, watching commissions execute. Secondary reader: Coco, when I ask "what's happening with X" or "why is this stuck."

**Decision:** (a) is this session progressing or should I cancel it? (b) what did it actually produce — did the role answer the question? (c) where did the cost go?

**Frequency:** dozens of times a day. This is a core operational surface, not a monthly analytics visit. It has to load fast and the streaming has to actually work (#24).

## Reframe — before scope

Two things about the brief's framing I want to correct:

**"Implement on this page, and fix in the spider as well" is the wrong shape for the streaming fix.** The transcript-streaming bug isn't a spider bug and a sessions-view bug — it's one bug in the streaming mechanism with two visible surfaces. Fix it at the source; both consumers inherit the fix (#31). Any plan that lists "fix streaming in spider" and "implement streaming in sessions view" as two separate work-items is misframed — it's one upstream fix plus two thin render layers.

**"A new page" — is it? The spider already renders session transcripts for quick engines.** Before committing to a brand-new sessions page, I want the engineer to check whether the spider's existing session/engine rendering is the natural extension point (#26). Sessions are the broader concept; engines are one flavor. Growing the spider to list *all* sessions (with an engines-only filter preserving today's view) is my preferred framing. A separate page is the answer only if the spider's shape genuinely doesn't fit — and that claim needs a specific reason, not "it feels cleaner." This is flagged under Deferred Questions.

## Scope

**In:**
- **Table of recent + live sessions.** Columns: status chip, role, writ title (if any), started-at, cost (USD). Sorted newest-first; live sessions visually distinguished.
- **Inspect view** drilled down from a row click (#28): status, role, parent writ, cost breakdown, full transcript. Same visual shape as the spider's quick-engine transcript — reuse the component, don't rebuild (#27).
- **Cost column tooltip** on hover: USD subtotals per model plus token counts (input, output, cache-read, cache-write). One tooltip, no separate cost page.
- **Cancel button** on the inspect view, visible only when the session is live. Confirms before sending cancel.
- **Live transcript streaming** in the inspect view for running sessions. Shared mechanism with the spider (see reframe).

**Out:**
- Session search / advanced filters beyond status and writ. Add when a second consumer asks (#18).
- Retry / re-dispatch of cancelled sessions — different workflow, different decision (#23).
- Cost roll-ups, charts, dashboards. Per-session cost is enough to answer the reader's question; aggregation is a v2 petition (#23, #25).
- A separate "session history" archive view. One table, filterable by status, handles both live and recent (#23).

## How it works

- **Row treatment:** status chip colocated with role (#40) — the role produced the status, they belong next to each other. Don't stuff the chip into a global header or a far column.
- **Writ title fallback (#41):** if the session has no parent writ (one-off dispatch), show the manifest source or the first human-side message truncated — not "session-<uuid>" or just the timestamp. The row should be recognizable.
- **Cost presentation:** USD to 4 decimal places in the cell (costs are small); tooltip carries the breakdown. Tooltip is the detail surface for cost; the inspect view repeats it in full.
- **Cancel:** button, not a menu item. Confirm dialog names the session (role + writ title). After cancel, the session transitions to `cancelled` — no silent failure, no optimistic local state (#2).
- **Streaming:** one upstream fix. The spider's engine-detail and this sessions inspect view both consume from the same transcript stream. When the fix lands, both surfaces work; neither gets a bespoke streaming implementation (#31, #15).
- **Transcript rendering:** reuse the spider's existing component. If it needs generalization to accept non-engine sessions, generalize it in place — don't fork (#38, #3).

## Assumptions I made

- Sessions have canonical cost capture already written to books / session records; cost is readable, not derived-at-query-time (#19, #27).
- A cancel channel for live sessions exists or is a modest addition — not a novel control plane.
- Transcripts are structured records readable from existing books (#27); no new aggregation layer needed.
- The spider's transcript component is reusable or generalizable without a rewrite.
- "Status" vocabulary for sessions aligns with writ lifecycle (`new → open → stuck → completed/failed/cancelled`) or has an established session-side equivalent.

## Deferred questions

- **Which surface is this?** My preference is "grow the spider," not "new page." If the engineer has a specific reason the spider doesn't fit, I want to hear it before commissioning a new surface (#26).
- **What counts as a session in this list?** All manifest-launched sessions, or only those tied to commissions? If both, they should share the table with writ-title empty for one-offs — but confirm.
- **Cancel semantics:** hard-stop vs. graceful-shutdown? If the runtime already has a preferred cancel path, use it; otherwise this is its own small decision.
- **Streaming scope of the upstream fix:** is the bug one mechanism or two (e.g., transcript vs. status updates)? Planner should scope the fix before estimating.
