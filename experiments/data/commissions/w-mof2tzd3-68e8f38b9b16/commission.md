This commission ships a depth-counter safety net but does not enumerate the actual graph of Phase-2 cross-book write paths in the codebase. Today the relevant edges are:

- `lattice/pulses` watcher (`packages/plugins/lattice/src/lattice.ts:364`) writes to `lattice/pulses` (self-loop, terminates via `deliveryState` state machine).
- `clerk/writs` watcher in Reckoner (`packages/plugins/reckoner/src/reckoner.ts:523`) writes pulses via `lattice.emit` → `lattice/pulses`.
- `clerk/writs` watcher in Clockworks writ-lifecycle observer (`packages/plugins/clockworks/src/clockworks.ts:513`) writes to `clockworks/events`.
- Clockworks book-auto-wiring (`clockworks.ts:427`) watches every plugin book except `clockworks/events`; emits to `clockworks/events`.

If the Reckoner ever starts emitting pulses that other Phase-2 watchers feed back into `clerk/writs`, or if a future apparatus watches `lattice/pulses` and writes to `clerk/writs`, an arbitrary-length cycle becomes possible. The brief flags task 10 (the daemon) as the trigger for more Phase-2 writers landing.

A follow-up commission should produce an explicit `(watched-book, written-book)` adjacency inventory and call out any cycles longer than 1 hop. Worth doing before the next round of Phase-2 emitters lands so the substrate counter is documented as the safety net, not the design contract. This is observation #4 in the parent observation set ("Surface an audit inventory of what books become observable after auto-wiring", `w-modp5jk0`) but extended to specifically cover the Phase-2 write graph.