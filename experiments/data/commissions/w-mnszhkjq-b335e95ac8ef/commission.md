_Imported from `.scratch/todo/unify-capability-registries.md` (2026-04-10)._

## Goal

Move tools into the same apparatus that holds engines, so the guild has one capability catalog instead of three near-empty registries. Engines and tools are both kit-contributed capabilities (engines run in rig pipelines, tools are invoked by animas during sessions); a unified capability apparatus answers "what can this guild do?" regardless of granularity. Relays stay in Clockworks because their registry is inseparable from event dispatch.

## Status

Parked. Not blocking the Spider MVP — just want to get the seam right so tools can move in later without breaking things.

## Next Steps

When the Spider apparatus design (which currently owns engines via the Fabricator) reaches a stable shape, design the tools-into-Fabricator move. Specifically: enumerate what the Instrumentarium holds today beyond the tools Map, decide whether the Instrumentarium dissolves entirely or becomes something else, and confirm Spider's Fabricator interface can accept tool-flavored contributions without warping its engine-shaped abstractions.

## Context

**Today's three registries:**

- **Engines → Fabricator** (currently being designed as part of the Spider spec)
- **Tools → Instrumentarium** (thin — basically just a `Map`)
- **Relays → Clockworks** (deeply entangled with event dispatch)

**Proposal.** Engines and tools live in the same capability apparatus. Relays stay in Clockworks (the registry is inseparable from the dispatch logic). The Instrumentarium either dissolves or becomes something else.

**Why now / why parked.** Not blocking the Spider MVP. The point of opening the inquiry is to keep the seam right so tools can move in later — i.e., don't bake assumptions into the Fabricator that would make adding tools expensive when the time comes.

**Open questions:**

- What does the Instrumentarium hold beyond the tools Map? If it's truly just a Map, dissolution is clean. If there's lifecycle/dispatch logic, that needs a home.
- Does Fabricator's capability model (currently engine-shaped) generalize to tools without warping?
- How does this interact with the plugin-contribution patterns (T1.2)? If `contributes` becomes a general mechanism, both engines and tools become symmetric contribution kinds.
- Migration path for existing tool consumers — keep the Instrumentarium as a thin facade during transition, or bulk-rewrite call sites?

## References

- Source doc: `.scratch/todo/unify-capability-registries.md`
- Spider apparatus design (in flight)
- Cross-link: T1.2 plugin-contributed writ types — same `contributes` pattern question
- Cross-link: T7 Clockworks MVP — confirms relays stay in Clockworks

## Notes

- 2026-04-10: opened from .scratch import as a standalone root quest.