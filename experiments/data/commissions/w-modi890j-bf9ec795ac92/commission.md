The brief says `relay()` "mirrors the existing engine/tool/channel factories" and locates it in `@shardworks/nexus-core`. In practice:

- `tool()` lives in `@shardworks/tools-apparatus` (`packages/plugins/tools/src/tool.ts`), not nexus-core.
- `engine()` is documented as a nexus-core export but does not exist anywhere (see obs-3).
- Lattice's channel system has no `channel()` factory — just a `LatticeChannelFactory` interface kits implement directly.

Placing `relay()` in nexus-core is a reasonable design choice (no runtime deps, stable SDK surface, matches the planned engine() placement) — but it is not consistent with how `tool()` is structured. Worth documenting a principle: which SDK factories belong in nexus-core vs. in their owning apparatus package. Could be captured in a short ADR or in the nexus-core README.