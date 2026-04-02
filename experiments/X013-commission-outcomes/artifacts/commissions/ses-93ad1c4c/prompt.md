# C001 Prompt — Implement Clerk apparatus (MVP)

Dispatched: 2026-04-02
Outcome: abandoned (anima never committed)

---

Implement the Clerk apparatus as specified in docs/architecture/apparatus/clerk.md (MVP scope only — flat mandate writs, no hierarchy, no Clockworks integration, no decompose(), no signal()).

Create the package at packages/plugins/clerk/ following the same structure as packages/plugins/parlour/:
- package.json (@shardworks/clerk-apparatus, dependencies: nexus-core, stacks-apparatus, tools-apparatus, zod)
- src/index.ts (barrel + default export)
- src/types.ts (WritDoc, WritStatus, PostCommissionRequest, WritFilters, ClerkApi)
- src/clerk.ts (apparatus definition: requires stacks, supportKit with writs book + indexes + all 7 tools, provides ClerkApi)
- src/tools/ (commission-post, writ-show, writ-list, writ-accept, writ-complete, writ-fail, writ-cancel)
- src/clerk.test.ts (comprehensive tests covering: post commission, all status transitions, invalid transition rejection, writ queries with filters, config validation for writTypes)
- README.md per project conventions

Key implementation notes from the spec:
- ULID for writ ids
- transition() is the single choke point for all status changes
- Validate writ types against clerk.writTypes in guild config (strict)
- commission-post defaults type to config defaultType (or "mandate")
- clerk:read and clerk:write permissions on tools
- Status machine: ready→active, active→completed, active→failed, ready|active→cancelled. No transitions out of terminal states.

Reference packages/plugins/parlour/ and packages/plugins/tools/ for apparatus patterns, test patterns, and tool registration.
