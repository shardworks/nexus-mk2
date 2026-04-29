# Cleanup: delete vision-keeper plugin + redefine The Surveyor

## Intent

Two-part cleanup of the framework architecture in preparation for the surveying-cascade work:

1. Delete the `@shardworks/vision-keeper-apparatus` plugin entirely. It exists as a Reckoner-contract worked-example petitioner that submits drift snapshots; its semantics differ fundamentally from the cartograph-decomposition surveyor that the new architecture defines, and its presence creates a naming collision and conceptual landmine for anyone reading the codebase.

2. Update the framework architecture documentation to redefine "The Surveyor" as the cartograph-decomposition apparatus described in the new architecture document. The previous codex-mapping framing of Surveyor is superseded by the new meaning.

This is a sanctum-coordinated framework change with no implementation logic — purely deletions and doc updates.

## Motivation

The vision-keeper plugin was built as a worked example for the Reckoner contract document — a reference petitioner exercising every contract surface. With the cartograph + surveying-cascade architecture now settled (see `docs/architecture/surveying-cascade.md`), the vision-keeper concept is being subsumed: surveying is what we now mean by the role formerly called "vision-keeper", and it operates on cartograph nodes (visions/charges/pieces), not on drift snapshots.

The legacy plugin's continued presence creates two problems:

- **Naming collision.** The architecture's "Surveyor" reservation now points at the cartograph-decomposition apparatus; the existing `vision-keeper` plugin name is a stale framing.
- **Conceptual landmine.** Anyone reading the codebase sees `vision-keeper` and assumes it's the apparatus described in the new arch doc — which it isn't.

The Reckoner contract document can stand without an in-tree worked example, or a fresh worked example can be authored later when there's a real consumer to model.

## Non-negotiable decisions

### Delete the entire `vision-keeper-apparatus` plugin

Remove `packages/plugins/vision-keeper/` and all references. This includes:

- The plugin's source files, tests, and package metadata.
- Any `guild.json` entries that include `'vision-keeper'` in their plugins list (test fixtures, example guild configs).
- Any test fixtures or integration tests that depend on it.
- Any Clockworks standing orders referencing `vision-keeper-on-decline` or other relays the plugin contributed.

### Rewrite worked-example references in the petitioner-registration contract doc

`docs/architecture/petitioner-registration.md` cites the vision-keeper plugin as the canonical worked example. After this commission:

- Remove or rewrite worked-example sections that depend on the deleted plugin.
- The contract document should stand on its abstract description of the contract without requiring an in-tree example. If a section loses its purpose with the example removed, delete it.

### Redefine The Surveyor in framework architecture docs

Update the following to describe The Surveyor as the cartograph-decomposition apparatus (per the new arch doc at `docs/architecture/surveying-cascade.md`):

- `docs/guild-metaphor.md` — the section on The Surveyor (currently describes a codex-awareness apparatus). Replace with the cartograph-decomposition framing: surveys cartograph nodes, produces structural decompositions, registers as a kit-contributable surveyor with the surveyor-apparatus substrate.
- `docs/architecture/index.md` — the System at a Glance description of The Surveyor (currently describes "tracks what work applies to each registered codex"). Replace with the new meaning. The sentence at line 286 ("not yet extracted as standalone packages") should be updated or removed depending on whether the future surveyor-apparatus is now anticipated as a planned package.
- `docs/architecture/plugins.md` — any references to the codex-mapping surveyor concept. Replace with the cartograph-decomposition framing or remove if no longer relevant.

The substrate apparatus (surveyor-apparatus) doesn't yet exist as code — its package will land in a separate future commission. The doc updates here describe the role conceptually so the architecture docs stop pointing at the obsolete codex-mapping framing.

### No replacement worked example needed

The Reckoner contract document is the load-bearing reference for petitioners. After this commission, the contract doc no longer cites an in-tree example; it stands on its own. A fresh worked example can be added later if a real consumer benefits from one.

## Out of scope

- Any new functionality. This is purely cleanup.
- The new surveyor-apparatus substrate plugin. Separate commission.
- Updates to the `cartograph` plugin's `vision-keeper.md` placeholder file — that file is an unused stub; address it during the substrate commission.
- Any sanctum-side vocabulary registry updates — those are already in place.

## Behavioral cases

- After this commission lands, `pnpm -r build` and `pnpm -r test` succeed across the entire monorepo. No dangling references to the deleted plugin.
- `guild.json` files in test fixtures that previously included `'vision-keeper'` no longer do.
- Architecture docs no longer describe The Surveyor as a codex-awareness apparatus.
- The `petitioner-registration.md` contract doc reads coherently without the worked-example anchor.

## References

- Parent click: c-moji0d5n (Commission B).
- Arch doc: `docs/architecture/surveying-cascade.md` (the load-bearing replacement framing for The Surveyor).
- Source clicks: c-moivkc4y (output contract, originator of the rename); c-moa42rxh (vision-keeper subtree, now superseded by c-moji050w).