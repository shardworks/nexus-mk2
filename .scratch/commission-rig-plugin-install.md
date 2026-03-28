# Commission: Rig — Plugin Install

> **Stub.** Depends on `commission-rig-cli.md` shipping first.
> See `commission-rig.md` for full north star context.

Implement `nsg plugin install` and `nsg plugin remove` — the commands that make the plugin model real. A plugin is an npm package with a `nexus-plugin.json` descriptor that declares its tools, engines, and migrations. Installing a plugin registers it in `guild.json`, copies its migrations, regenerates `nexus/plugin-manifest.json`, and runs `ledger-migrate`.

## Rough Scope

- `nexus-plugin.json` descriptor format (tools, engines, migrations, dependencies)
- `nsg plugin install <source>` — install from registry, git-url, workshop, tarball, or link
- `nsg plugin remove <name>`
- `guild.json` gains `plugins: string[]` array
- `nexus/plugin-manifest.json` generated and committed on install/remove; lazily regenerated if stale
- `ledger-migrate` updated to discover and apply plugin migrations from the manifest (namespaced by plugin name)
- Dependency checking: fail clearly if declared plugin dependencies are not installed
- `rig.resolveGuildCommands()` updated to read from manifest rather than raw `guild.json` tools section

## Key Decisions (to be refined at commission time)

- Plugin identity derived from npm package name (strip scope)
- Plugin migrations copied to `nexus/migrations/<plugin-name>/` at install time
- Applied migrations not rolled back on remove
- `nsg plugin install` is itself a `allowedContexts: ['cli']` tool registered through the new CLI infrastructure from `commission-rig-cli`
