# Unify capability registries

Consider moving tools into the same apparatus that holds engines (currently being designed as part of the Walker spec). Both are kit-contributed capabilities — engines run in rig pipelines, tools are invoked by animas during sessions. A unified capability catalog answers "what can this guild do?" regardless of granularity.

Today:
- Engines → Fabricator
- Tools → Instrumentarium (thin — basically just a Map)
- Relays → Clockworks (deeply entangled with event dispatch)

Proposal: engines and tools live in the same capability apparatus. Relays stay in Clockworks (the registry is inseparable from the dispatch logic). The Instrumentarium either dissolves or becomes something else.

Not blocking the Walker MVP — just get the seam right so tools can move in later.
