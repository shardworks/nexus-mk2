This commission ships a load-time standing-order validator as a separate pure module (per decision D16, mirroring `signal-validator.ts`). The validator is exported from `src/index.ts` so downstream consumers can import it.

Two natural future consumers worth surfacing for follow-up commissions:

1. A `nsg guild lint` / `nsg config check` CLI command that runs the validator (and other config validators) before changes are written, catching typos before the operator restarts the apparatus. Pairs with the existing `nsg signal` validator-sharing pattern that already lives in the framework CLI.

2. A `writeGuildConfig()` (in `nexus-core/src/guild-config.ts`) hook that runs registered config validators before writing the file, eliminating the runtime-only error path entirely. Today `writeGuildConfig` is a thin `JSON.stringify` + `fs.writeFileSync`; a hook registry would be a small extension.

Neither is in scope for this commission. Surfacing so the validator's exported shape is intentionally consumable rather than incidentally so. Affected files (future):
- `packages/plugins/clockworks/src/index.ts` (already exports validator after this commission)
- `packages/framework/cli/src/commands/` (future linter)
- `packages/framework/core/src/guild-config.ts` (future hook registry)