The architecture docs (`docs/architecture/clockworks.md`, `docs/architecture/plugins.md`, `docs/architecture/index.md`, `README.md`) uniformly write `nexus-clockworks` in every Clockworks example — `import type { ClockworksKit } from "nexus-clockworks"`, `recommends: ["nexus-clockworks"]`, `requires: ["nexus-clockworks", "nexus-stacks"]`, `guild().apparatus<ClockworksApi>("nexus-clockworks")`, `nsg install nexus-clockworks`, etc. Every actual apparatus in the codebase uses a short plugin id derived from `-apparatus` stripping: `stacks`, `clerk`, `lattice`, `clockworks-retry`, `ratchet`, `spider`. The docs pre-date the current derivation convention.

Affected lines (non-exhaustive):
- `docs/architecture/clockworks.md:309,315,318,324`
- `docs/architecture/plugins.md:43,50,153,154,205,207,305,309,513,517,528,544`
- `docs/architecture/index.md:199-211` (the big `@shardworks/clockworks` example)
- `README.md:83`

Also update `docs/architecture/apparatus/stacks.md:329` which mentions 'Direct database access in `nexus-clockworks` and `nexus-sessions`.'

Replace `nexus-clockworks` → `clockworks` and (for the one occurrence) `nexus-stacks` → `stacks` / `nexus-sessions` → the current session-owning plugin id.

Critical before downstream Clockworks commissions (tasks 2–10) start citing the docs for plugin-id lookups.