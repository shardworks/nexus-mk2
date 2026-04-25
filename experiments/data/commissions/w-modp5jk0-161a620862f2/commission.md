Once this commission lands, every book declared by any installed plugin becomes a first-class event source with emitter `framework`. The existing Wire phase does not log a summary of what it collected (book names and owners), which means the operator has no visible inventory of what standing orders can hook onto.

Minimal fix: the clockworks apparatus could log a one-line summary at the end of `start()`, e.g. `[clockworks] auto-wiring 9 books: clerk/writs, clerk/links, spider/rigs, ...` at info level or as part of a startup banner. This mirrors how Stacks could report schema reconciliation counts (it currently doesn't).

Optionally: expose the list via a `guild()` singleton method or a new CLI `nsg clock books` command. Probably too speculative for this observation — a log line is enough.

Files:
- `packages/plugins/clockworks/src/clockworks.ts` — startup logging hook.
- `packages/plugins/stacks/src/stacks.ts` — consider a parallel logging line.

Low priority; ergonomic polish, not correctness.