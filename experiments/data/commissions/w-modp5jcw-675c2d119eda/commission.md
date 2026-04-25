Lifted from the planning run of "Stacks CDC auto-wiring for book events" (w-modf652r-2daf24fb4deb). Each numbered observation below is a draft mandate ready for curator promotion.

1. Refresh clockworks.md auto-wiring sketch to use ctx.kits('books') and 3-arg emit
2. Reconcile verb tense of book CDC events across clockworks.md, stacks specification.md, and event-catalog
3. Phase-2 CDC handlers lack structural loop protection across transactions
4. Surface an audit inventory of what books become observable after auto-wiring
5. Consider factoring plugin-books enumeration into a shared nexus-core helper
6. event_dispatches CDC events will be emitted once task 4 lands — downstream standing-order authors need a schema
