Today `nsg start` (the *guild* daemon, `packages/framework/cli/src/commands/start.ts`) boots the tool HTTP server, oculus, and spider crawl loop — but it does NOT process events. After this commission lands, the operator must run TWO commands to get a fully autonomous guild: `nsg start` for tools/oculus/spider, AND `nsg clock start` for events.

This is a UX wart. A future commission could either:

1. Have `nsg start` automatically also call `clockStart(home)` so a single `nsg start` boots the full guild stack, OR
2. Have `nsg start --foreground` integrate the clockworks dispatch loop directly into its existing main loop (alongside the spider crawl loop).

Option 2 is cleaner (one process, one PID file, one log surface) but requires merging the spider's idle-vs-progress branching with the clockworks' poll loop. Option 1 keeps the daemons independent (matching this commission's design) but doubles the operator's mental model.

This is explicitly out of scope for this commission — the brief separately specifies a dedicated daemon — but worth a follow-up commission once both daemons are in production. Tactical detail: brief calls out 'Phase 1 commands coexist with the daemon' (referring to manual `list`/`tick`/`run`) but is silent on guild-daemon coexistence.