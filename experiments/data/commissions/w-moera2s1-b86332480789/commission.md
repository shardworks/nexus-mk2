# Petitioner registration extension point design

## Intent

Produce a design document at `docs/architecture/petitioner-registration.md` proposing the contract that new petitioner classes (vision-keepers, tech-debt watchers, laboratory introspection, future patron-facing tools) must implement to participate in the Reckoner's petition pipeline. The doc covers the registration mechanism (declarative, programmatic, or both), the emit-petition interface, the feedback-receipt patterns, and any lifecycle hooks. Output is a decision-supporting design doc — no production code changes.

## Motivation

The Reckoner design (click `c-mod99ris`) settled the petition shape (carries source/intent/rationale/priority_signals/context_anchors per `c-mod9a2gh`), the lifecycle (pending → accepted/deferred/declined/withdrawn per `c-modaqnpt`), and the feedback channels (CDC-attached petition-state events plus the Reckonings book per `c-mod9a6x3`). What's not yet designed is HOW a new petitioner class plugs into this pipeline — the registration extension point.

Without this contract settled, the Reckoner core commission can't be drafted (it doesn't know what registration shape to accept), and downstream petitioner plugins (vision-keeper, future tech-debt watchers) can't build against a known surface. This is foundational for unlocking Reckoner implementation.

## Non-negotiable decisions

- **Output is a single markdown design doc** at `docs/architecture/petitioner-registration.md`. No code changes. No new packages. No alterations to existing plugins.
- **The doc must propose** (the implementer makes the actual proposals; the brief defines the surface):
  - **Registration mechanism**: declarative (plugin manifest field declaring "I'm a petitioner of class X") vs programmatic (plugin's start() calls reckoner.registerPetitioner({...})) vs hybrid. Identify the trade-off — declarative is queryable without instantiating, programmatic is more flexible. Recommend one.
  - **Petitioner identity**: how the Reckoner identifies a petitioner. The petition shape carries a `source` field — what's the registry of valid sources? Is it open (any string) or closed (only registered petitioners can submit)? If closed, how does the Reckoner authenticate that an emit-petition call is coming from the registered source?
  - **Emit-petition interface**: the API surface a registered petitioner uses to submit petitions. Likely something like `reckoner.emitPetition(petitionData)` returning a petition id. What about partial submissions / drafts? What about retraction (the `withdrawn` lifecycle terminal — how does a petitioner withdraw)?
  - **Feedback receipt patterns**: petitioners pick from event-driven (CDC standing-order on petition-state events for their source), polling (query the petitions book directly), or fire-and-forget (no subscription) per `c-mod9a6x3`. The doc should show concrete examples of each pattern — what does a CDC standing order look like for a vision-keeper subscribing to its own petition decline events?
  - **Lifecycle hooks**: does a petitioner need to declare anything beyond emit-petition? E.g., does it expose a `canRetry(petition, decline_reason)` hook the Reckoner calls before final decline? Or is everything observed via CDC after the fact? Propose what's load-bearing for v0 versus what's deferred.
  - **Built-in petitioner classes**: enumerate the petitioner classes the design must support (at minimum: patron — for direct posting; vision-keeper; the existing reckoner-apparatus's pulse-emitting role if subsumed). Are there shared patterns (e.g. "all internal petitioners subscribe to their own decline-CDC") that should land in a base class or shared utility?
  - **Authority / priority gating**: per `c-mod9a48y`, `priority=immediate` is authority-gated to `source=patron`. How is authority bound to source? Is it metadata on registration, or runtime-validated at emit-time? Propose the cleanest mechanism.
- **The doc must surface open questions** for follow-on resolution. Anything that can't be settled cleanly should be named with the trade-off captured.
- **Cite existing patterns**: how do plugins register with other apparatuses today? Astrolabe registers writ types via clerk's open registry; clockworks registers standing orders declaratively in guild.json; clerk's writ-type registry accepts plugin contributions. These are the precedents — name what fits and what's different here.

## Out of scope

- Implementing the registration mechanism (no code; no Reckoner-side handler; no plugin-side example registrations).
- Designing the Petition record itself or the Reckonings book (separate parallel commissions, clicks `c-mod9a2gh` resolved and `c-modc7m16` in flight).
- Designing the Reckoner's tick / weighing / decision logic (out of scope here).
- Resolving the existing reckoner-apparatus disposition (separate, `c-modeou1t`).
- Building any specific petitioner. The vision-keeper, tech-debt watchers, etc. are downstream consumers of the contract this doc proposes — not part of this commission.

## References

- Source click: `c-mod9a8fx`.
- Adjacent clicks (concluded, providing constraints): `c-mod9a2gh` (petition shape), `c-mod9a48y` (patron fast-path + four-level priority enum + authority-gating), `c-mod9a6x3` (decline feedback CDC channels), `c-modaqnpt` (lifecycle + deferred metadata), `c-mod9a54n` (scheduling trigger).
- Adjacent click (parallel, in flight): `c-modc7m16` (Reckonings book design) — this commission's CDC-feedback recommendations may interact with the Reckonings book's emitted events. Coordinate where they overlap.