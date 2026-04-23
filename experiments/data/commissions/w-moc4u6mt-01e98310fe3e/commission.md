The current *Default Kits* table in `docs/architecture/index.md` (lines 287–291) lists three kits — `nexus-stdlib`, the `clockworks` supportKit, and the `sessions` supportKit — none of which correspond to packages in `packages/plugins/`. Beyond the table, `nexus-stdlib` is referenced by:

- `packages/framework/cli/src/commands/init.ts` (success-message hint to install it)
- Several test fixtures and the CLI status command
- README files in arbor and tools

This brief drops the kits table (per D6); a separate commission should grep for all `nexus-stdlib` references and either (a) ship the package, (b) rename the references to whatever does ship, or (c) remove them. Same exercise for the named supportKits (`clockworks`, `sessions`) referenced from the architecture doc.