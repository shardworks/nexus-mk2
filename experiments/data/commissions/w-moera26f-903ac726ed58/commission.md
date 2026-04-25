# Reckonings book schema design

## Intent

Produce a design document at `docs/architecture/reckonings-book.md` proposing the schema, retention policy, query patterns, CDC attachment, and relationship-to-petition-state for the Reckoner's evaluation log book. The Reckonings book records every Reckoner consideration event (whether or not it produced a state transition), giving petitioners a structured audit trail and the patron observability into what the Reckoner is doing. The output is a decision-supporting design doc — no production code changes.

## Motivation

The Reckoner design (click `c-mod99ris`) settled several load-bearing decisions: petition shape (carries source/intent/rationale/priority_signals/context_anchors), petition lifecycle (pending → accepted/deferred/declined/withdrawn), patron fast-path (immediate priority bypasses weighing), scheduling trigger (timer-based polling), and decline-feedback mechanism (CDC events on petition state plus an evaluation log). What remains undesigned is the *evaluation log itself* — the Reckonings book that captures every consideration event.

This is foundational for the rest of the Reckoner. Several already-concluded design clicks reference the Reckonings book without specifying its shape:
- `c-mod9a6x3` (decline feedback) names "Reckonings — append-only evaluation log capturing every Reckoner consideration event whether or not it produced a state transition" as one of the two CDC channels petitioners subscribe to.
- `c-modaqnpt` (deferred-petition metadata) explicitly defers the Reckonings book schema to a separate click (this one).

Without this schema settled, the Reckoner core commission can't be drafted, and downstream petitioners (vision-keeper, future tech-debt watchers, laboratory introspection) can't build CDC standing orders against the evaluation log.

## Non-negotiable decisions

- **Output is a single markdown design doc** at `docs/architecture/reckonings-book.md`. No code changes. No new packages. No book-creation in any guild config.
- **The doc must propose** (the implementer makes the actual proposals; the brief defines the surface):
  - **Record schema**: what fields each Reckonings record carries. Must include at minimum: a unique record id; the petition id being evaluated; the Reckoner tick id (or timestamp); the consideration outcome (accepted / deferred / declined / no-op); reason metadata (decline reason enum + remediation hint per `c-mod9a6x3`; deferral metadata per `c-modaqnpt`'s shape — defer_reason / defer_until / defer_signal / defer_count / first_deferred_at / last_deferred_at / defer_note; acceptance metadata — writ_id, accepted_at). Account for the no-op case where Reckoner ticked but produced no state change for a given petition (still record what was considered? or skip silently?).
  - **Retention policy**: append-only forever, or rolling window with archival? What's the storage growth trajectory? At ~one-tick-per-minute and ~10 petitions per tick, what's a year of activity? Propose a default and identify when retention becomes a real concern.
  - **Query patterns**: what queries downstream consumers must run efficiently. At minimum: "all Reckonings for petition X" (petitioners tracking their own work); "all Reckonings since timestamp T" (CDC-style observers); "all decline events with reason R" (patron audit). Propose stacks indexes that match.
  - **CDC attachment**: per `c-mod9a6x3`, Reckonings is one of two CDC channels petitioners subscribe to. What standing-order patterns subscribe to the Reckonings book? Propose the event names emitted on each Reckonings write (e.g., `reckoning.accepted` / `reckoning.declined` / `reckoning.deferred` / `reckoning.no-op`). Or rely on the framework's existing CDC auto-wiring (`book.reckoner.reckonings.created`)?
  - **Relationship to petition state**: per `c-mod9a6x3`, petitioners have two CDC channels — petition state transitions on the petition record, and the Reckonings book. Are these duplicative? Why two? Propose the clean conceptual split — likely "petition record holds CURRENT STATE" vs "Reckonings book holds EVENT HISTORY" (journal vs materialized view). Confirm or argue against.
- **The doc must surface open questions** the implementer leaves for follow-on resolution. Anything that can't be settled cleanly should be named explicitly with the trade-off captured.
- **Cite existing patterns**: clockworks `events` book, animator `sessions` book, animator `transcripts` book are precedents for append-only event-log books. Reference what they do well and what trade-offs apply.

## Out of scope

- Building the actual book (no code, no plugin, no schema in stacks). Implementation lands in a separate Reckoner core commission later.
- Designing the Petition record itself or its book — the petition lifecycle and shape are settled in `c-mod9a2gh` and `c-modaqnpt`. The Reckonings book is the audit log of *consideration events*, distinct from the petition record book.
- Designing the Reckoner's tick / weighing / decision logic — that's out of scope here; this commission designs the EVIDENCE of those decisions, not the decisions themselves.
- Designing the petitioner registration extension point (separate parallel commission, click `c-mod9a8fx`).
- Resolving the existing reckoner-apparatus plugin disposition (separate concern, `c-modeou1t`). The new Reckoner is a forward-looking design; it doesn't have to interoperate with the existing narrow-MVP reckoner-apparatus while in design phase.

## References

- Source click: `c-modc7m16`.
- Adjacent clicks (concluded, providing constraints): `c-mod9a2gh` (petition shape), `c-mod9a6x3` (decline feedback), `c-modaqnpt` (deferred-petition metadata), `c-mod9a48y` (patron fast-path), `c-mod9a54n` (scheduling trigger).
- Adjacent click (parallel, in flight): `c-mod9a8fx` (petitioner registration extension point) — this commission's output may inform the registration contract since registration likely involves declaring CDC subscriptions.