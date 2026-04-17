# Link-Substrate Rename Sweep

## Intent

Rename the clerk's link-meaning substrate to its load-bearing final names — row-level field names, registry types, API methods, kit contribution field, error wording, and the CLI/HTTP tool surface all shift in lockstep — and unify plugin-namespaced identifier separators on the dot form. Pure refactor; zero behavior change.

## Rationale

The substrate shipped before any plugin pressure-tested it, and two naming choices are actively misleading: `type` on the link record reads as load-bearing (but is explicitly not — it is the casual human label), and `semanticMeaning` is a mouthful for what Kubernetes and most adjacent systems call `kind`. Plugin-namespaced link-kind ids (`astrolabe:refines`) also use colons where the rest of the framework (engine ids, role contributions, event patterns) uses dots. The first real consumer arrives in a downstream commission; landing the rename now — while no shipping plugin registers a link kind — is cheapest before any plugin binds to the old vocabulary.

## Scope & Blast Radius

The change lives almost entirely in `packages/plugins/clerk/`. No shipping plugin currently contributes a `linkMeaning` kit entry, so the external blast radius is zero: the only in-tree consumers of the registry today are the clerk's own tests and the Oculus writs page.

**Affected surfaces:**

- The clerk substrate types (`types.ts`), implementation (`clerk.ts`), its three tools (`writ-link`; the renamed `writ-link-kinds` and `writ-link-kinds-show`), and the plugin's public re-exports (`src/index.ts`).
- The Oculus writs page (`packages/plugins/clerk/pages/writs/index.html`).
- The clerk README and `docs/architecture/apparatus/clerk.md`.
- The clerk test suite (`clerk.test.ts`, `link-normalize.ts` docstrings, `link-normalize.test.ts`).

**Cross-cutting concerns — name the concern, verify with grep, do not rely on the planner's file enumeration:**

- Every reader of `WritLinkDoc.type` / `.semanticMeaning` must speak `label` / `kind`. A monorepo-wide search for `semanticMeaning`, `MeaningDoc`, `MeaningEntry`, `listMeanings`, `linkMeanings`, `MeaningMeta`, `MEANING_SUFFIX_RE`, and `writ-link-meanings` must return no hits after the change.
- The clerk's startup migration pass is a **live reader** of `row.type` and a writer of `survivor.type` / `survivor.semanticMeaning`. Rows come back from the Stacks book as loosely-typed records; a missed rename there silently no-ops with no type error. Audit every field read/write in the startup pass explicitly.
- The tool rename propagates automatically through the framework's conventions: `findGroupPrefixes` / `toFlag` produce the CLI commands (`nsg writ link-kinds`, `--label`, `--kind`), and `toolNameToRoute` produces the HTTP routes. No CLI or tool-server source edits are required. Verify by listing discovered commands and routes after the rename.
- The colon-to-dot separator swap applies **only** to plugin-namespaced link-kind ids. The Stacks composite primary key (`{sourceId}:{targetId}:{normalizedLabel}`) stays colon-delimited — it is a key tuple, not a qualified id. Permission grammar (`astrolabe:read`) also stays on colons.

**Explicitly out of scope (despite superficial similarity):**

- Ratchet's `ClickLinkDoc.linkType` is a separate substrate with its own closed enum; unaffected.
- Astrolabe's `spec-publish` engine calls `clerk.link(src, tgt, 'refines')`. The positional argument order is unchanged by this commission and `'refines'` remains a valid casual label; the call site needs no edit.
- Framework CLI (`packages/framework/cli/`) and tool HTTP server (`packages/plugins/tools/src/tool-server.ts`) are convention-driven. No source changes there.

## Decisions

| # | Decision | Default | Rationale |
|---|----------|---------|-----------|
| D1 | Name for the fully-resolved registry record type | `LinkKindDoc` | Preserves the subject-prefix convention of the clerk's other `*Doc` types and pairs symmetrically with `WritLinkDoc`. |
| D2 | Unknown-kind error message wording | `Unknown link kind "X". Registered link kinds: ...` at both the `clerk.link()` throw site and the `writ-link-kinds-show` throw site | Always prefixes with "link" for unambiguous domain; avoids collision with Ratchet's click-link substrate. |
| D3 | Rename the `type` tool param alongside `meaning` on `writ-link` | Rename both: `type → label`, `meaning → kind`. CLI becomes `nsg writ link --label <x> --kind <y>` | The tool schema mirrors the row-level rename; leaving `type` would reintroduce stale vocabulary on the surface the brief explicitly aims to clean. |
| D4 | Guard against stale colon-form ids at runtime | No guard. A colon-containing id simply won't match any registered kind and falls through the normal "Unknown link kind" error | Fail-loud; the brief carries no deprecation-window language. |
| D5 | Rename internal `normalizedType` local in the composite-key construction | Rename to `normalizedLabel` | The substrate-wide rename extends to internal locals speaking the old vocabulary; zero API-surface cost. |
| D6 | Oculus writs page fetch body field name sent to `/api/writ/link` | Rename `type → label` to match the new tool param. `kind` is not sent (no UI selects one) | The tool HTTP server validates the body against the tool's zod schema; the page must send the new field name or the POST fails validation. |
| D7 | Clerk architecture doc: close the pre-existing `linkKinds` registry gap during this commission | Include the gap fix: rename existing mentions **and** add a section describing the `linkKinds` registry (what a kit contributes, how the namespaced id is formed, what `listKinds()` returns, the `label` vs `kind` distinction) | Patron opted to close the gap in-place rather than defer. |
| D8 | Clerk `src/index.ts` re-exports: keep old names as aliases for backward compatibility? | Export only the new names; old names are gone entirely | Default preference is removal over deprecation; no current external consumer imports the old type names. |

## Acceptance Signal

- `pnpm -w typecheck` passes.
- `pnpm -w test` passes. The clerk's test suite has been updated to the new vocabulary; other packages' suites continue passing without edits.
- A monorepo-wide search for the old vocabulary finds nothing:
  `! grep -rE "semanticMeaning|MeaningDoc|MeaningEntry|MeaningMeta|listMeanings|linkMeanings|MEANING_SUFFIX_RE|writ-link-meanings|link-type-|data-type=|link-types\b" packages/ docs/` succeeds.
- No surviving colon-form link-kind ids in clerk source or prose: `! grep -rE "(astrolabe|testkit|alpha|beta|kit|support-app|ghost|spider)[:][a-z][a-z0-9-]*" packages/plugins/clerk/ docs/architecture/apparatus/clerk.md` succeeds. Every registered kind id uses a dot (`astrolabe.refines`). Composite-key tuples, permission ids, and URLs are unaffected.
- `nsg writ link-kinds` and `nsg writ link-kinds-show` are discoverable CLI commands; `nsg writ link-meanings` is not. `nsg writ link --label <x> --kind <y>` is accepted; `--type` / `--meaning` are rejected.
- `POST /api/writ/link` with a body containing `label` (and optionally `kind`) creates a link end-to-end. The Oculus writs-page add-link form still round-trips when exercised manually.
- The clerk architecture doc at `docs/architecture/apparatus/clerk.md` describes the `linkKinds` kit-contribution substrate in prose: what a kit contributes under `linkKinds`, how the namespaced id is formed (`pluginId.kebab-suffix`), what `listKinds()` returns, and the `label` (casual) vs `kind` (load-bearing) distinction.

## Existing Patterns

- **Dotted plugin-namespaced ids.** Astrolabe engine ids in `packages/plugins/astrolabe/src/astrolabe.ts` (`astrolabe.plan-init`, `astrolabe.inventory-check`, `astrolabe.spec-publish`) and role contribution ids demonstrate the dotted form this rename adopts.
- **Kit contribution pattern.** The clerk itself shows the shape: an apparatus declares `consumes: ['writTypes', ...]` and iterates `ctx.kits('<field>')`. The `linkMeanings → linkKinds` field rename follows this established wiring.
- **Subject-prefixed `*Doc` types.** `WritDoc`, `WritLinkDoc` — and, post-rename, `LinkKindDoc`. Follow this pattern for D1.
- **Idempotent-startup-migration loop.** The existing normalization pass in `clerk.ts` around the idempotent write path is the shape to mirror — read, normalize, write back. The patron handles data migration out of band, so field reads/writes only need to speak the new names; no dual-path read-old / write-new shim.
- **Tool naming → CLI / HTTP inference.** `packages/framework/cli/src/program.ts` + `helpers.ts` (`findGroupPrefixes`, `toFlag`) and `packages/plugins/tools/src/tool-server.ts` (`toolNameToRoute`) derive command and route shapes from the tool `name`. Renaming the tool is sufficient.
- **Oculus writs page template.** `packages/plugins/clerk/pages/writs/index.html` is a template-string + vanilla-JS page; mirror its existing DOM-id conventions (`link-target-${writ.id}`, `link-error-${writ.id}`) when renaming the affected `link-type-*` ids to `link-label-*`.

## What NOT To Do

- Do not add a `kind` selector / dropdown to the Oculus add-link form. New UI is explicitly first-consumer (Spider) work in a separate commission.
- Do not introduce backward-compatibility aliases for the renamed types, kit field, tool names, or flag names. Clean rename only.
- Do not add a "colon-form is deprecated" migration hint to the validator. Stale colon ids fail as any other unknown id does.
- Do not change the Stacks composite primary key structure `{sourceId}:{targetId}:{normalizedLabel}`. Those colons are key-tuple delimiters, not qualified-id separators.
- Do not change permission grammar. Permissions stay on colons.
- Do not rename Ratchet's `ClickLinkDoc.linkType` or its closed enum. Separate substrate.
- Do not edit Astrolabe's `spec-publish` engine `clerk.link(..., 'refines')` call site. Positional arg order is unchanged and `'refines'` is still a valid casual label.
- Do not migrate existing data records. The patron handles data migration out of band; code only needs to speak the new field names.
- Do not perform the downstream `WritDoc.status → WritDoc.phase` rename, Spider `spider.follows` wiring, or any first-consumer UI. All dispatched separately.

<task-manifest>
  <task id="t1">
    <name>Rename substrate types, kit field, and clerk implementation in lockstep</name>
    <files>packages/plugins/clerk/src/types.ts, packages/plugins/clerk/src/clerk.ts, packages/plugins/clerk/src/index.ts</files>
    <action>Rename the row-level `WritLinkDoc` fields (`type → label`, `semanticMeaning → kind`) and the matching positional parameter names on `ClerkApi.link()` (argument order unchanged). Rename the registry substrate in lockstep: the kit contribution field (`linkMeanings → linkKinds`), the kit entry shape (`MeaningEntry → KindEntry`), the fully-resolved registry record (`MeaningDoc → LinkKindDoc` per D1), and the API method (`listMeanings → listKinds`). Rename the internal symbols in `clerk.ts`: the `MeaningMeta` interface, the `linkMeaningRegistry` map, the `registerKitLinkMeanings` function, the `MEANING_SUFFIX_RE` regex symbol, and the local `normalizedType` variable in the composite-key construction (per D5 — rename to `normalizedLabel`; the composite key itself remains colon-delimited). Update the apparatus `consumes` declaration and `ctx.kits('linkMeanings')` call to `linkKinds`. In the startup migration pass, every field read/write that referenced `row.type` / `survivor.type` / `survivor.semanticMeaning` must speak the new names — this is the highest-risk silent-no-op point, audit it explicitly. In `src/index.ts`, export only the new names (per D8); remove any old re-exports entirely with no deprecation aliases.</action>
    <verify>cd packages/plugins/clerk &amp;&amp; pnpm typecheck &amp;&amp; ! grep -rE "semanticMeaning|MeaningDoc|MeaningEntry|MeaningMeta|listMeanings|linkMeanings|MEANING_SUFFIX_RE|normalizedType" src/types.ts src/clerk.ts src/index.ts</verify>
    <done>Clerk typechecks clean; grep for the old vocabulary inside `src/types.ts`, `src/clerk.ts`, and `src/index.ts` returns nothing.</done>
  </task>

  <task id="t2">
    <name>Swap id separator from colon to dot and reword unknown-kind errors</name>
    <files>packages/plugins/clerk/src/clerk.ts (kind registration and link() validation paths)</files>
    <action>In the kind registration function (renamed in t1), change the separator parsing from colon-based to dot-based: the `indexOf(':')` / `split(':')` logic that splits a namespaced id into `{pluginId}` and `{kebab-suffix}` switches to dot. The error-message literal that formats the expected id shape changes `"{pluginId}:{kebab-suffix}"` to `"{pluginId}.{kebab-suffix}"`. Per D4 there is no special guard for colon-containing ids — an id with a colon simply won't match and falls through the normal unknown-kind error. Replace the unknown-kind error message at the `clerk.link()` throw site with the D2 wording: `Unknown link kind "X". Registered link kinds: ...` (the sibling site inside `writ-link-kinds-show` is rewritten in t3). The kebab-case suffix regex behavior itself is unchanged; only the split separator moves.</action>
    <verify>cd packages/plugins/clerk &amp;&amp; pnpm typecheck &amp;&amp; ! grep -E "Unknown semanticMeaning|Unknown link meaning|indexOf\(':'\)" src/clerk.ts</verify>
    <done>Clerk typechecks; no old error wording or colon-based split helpers survive in `clerk.ts`; registration and validation paths use the dot separator.</done>
  </task>

  <task id="t3">
    <name>Rename the clerk tool surface (file names, tool names, params, handler bodies, exports)</name>
    <files>packages/plugins/clerk/src/tools/writ-link.ts; rename writ-link-meanings.ts → writ-link-kinds.ts; rename writ-link-meanings-show.ts → writ-link-kinds-show.ts; packages/plugins/clerk/src/tools/index.ts; packages/plugins/clerk/src/index.ts</files>
    <action>Rename the two tool files and update their tool `name` strings (`writ-link-meanings → writ-link-kinds`, `writ-link-meanings-show → writ-link-kinds-show`). On `writ-link`, rename both zod params per D3 (`type → label`, `meaning → kind`) and update the handler body's `clerk.link(src, tgt, params.type, params.meaning)` call to use the new param names. Update all user-facing strings — instructions text, tool descriptions, example ids (`astrolabe:refines → astrolabe.refines`), output table headers/labels — to the new vocabulary. Apply the D2 wording to the `writ-link-kinds-show` unknown-id throw. Update the tool module's exports (`writLinkMeanings → writLinkKinds`, `writLinkMeaningsShow → writLinkKindsShow`) in `tools/index.ts` and ensure `src/index.ts` re-exports match. Do not add backward-compat aliases.</action>
    <verify>cd packages/plugins/clerk &amp;&amp; pnpm typecheck &amp;&amp; ! grep -rE "writ-link-meanings|writLinkMeanings|writLinkMeaningsShow" src/</verify>
    <done>All three tool files compile; no old tool-name strings or export identifiers remain in clerk source. Running the workspace CLI's help (`pnpm --filter @nexus/cli dev --help` or equivalent) shows `writ link-kinds` and `writ link-kinds-show` under the `writ` group with `--label` and `--kind` flags on `writ link`.</done>
  </task>

  <task id="t4">
    <name>Update the Oculus writs page (DOM ids, datalist, data attributes, fetch body)</name>
    <files>packages/plugins/clerk/pages/writs/index.html</files>
    <action>Rename the per-row input DOM ids `link-type-${writ.id} → link-label-${writ.id}`, the suggestion `<datalist id="link-types"> → link-labels`, and the rendered link-chip `data-type → data-label` attributes. Rename the `doAddLink` handler's local `type` parameter to `label` for clarity. Update the fetch body sent to `/api/writ/link`: rename the `type` field to `label` per D6 (no `kind` field is sent — the page has no UI to select one, and a kind selector is explicitly out of scope). Neutral attributes (`link-target-*`, `link-error-*`, `data-action="addlink"`/`"unlink"`) stay as-is.</action>
    <verify>! grep -E "link-type-|link-types|data-type=" packages/plugins/clerk/pages/writs/index.html</verify>
    <done>No residual `type`-vocabulary ids, attributes, or body fields in the page. Manual spot-check: opening the Oculus writs page, adding a link via the form, and unlinking it all round-trip through `POST /api/writ/link`.</done>
  </task>

  <task id="t5">
    <name>Update clerk tests and link-normalize docstrings to the new vocabulary</name>
    <files>packages/plugins/clerk/src/clerk.test.ts, packages/plugins/clerk/src/link-normalize.ts, packages/plugins/clerk/src/link-normalize.test.ts</files>
    <action>Sweep `clerk.test.ts` for the three rename patterns: fixture kit fields (`linkMeanings: [...] → linkKinds: [...]`), prefixed id literals (`testkit:refines`, `alpha:refines`, `beta:refines`, `kit:refines`, `support-app:refines`, `ghost:meaning`, etc. — every colon-form switches to dot-form), and assertion text (`semanticMeaning: 'testkit:refines'` → `kind: 'testkit.refines'`; error regexes `/Unknown semanticMeaning/` and `/Unknown link meaning "ghost:meaning"/` → the D2 wording with dot-form ids). In `link-normalize.ts`, correct any docstring that references `semanticMeaning` — the normalization logic operates on the casual `label` field, not on `kind`, and the docstring should reflect that. Update `link-normalize.test.ts` similarly if any references survive.</action>
    <verify>cd packages/plugins/clerk &amp;&amp; pnpm test &amp;&amp; ! grep -rE "semanticMeaning|linkMeanings|Unknown semanticMeaning|Unknown link meaning|(testkit|alpha|beta|kit|support-app|ghost):[a-z]" src/clerk.test.ts src/link-normalize.ts src/link-normalize.test.ts</verify>
    <done>All clerk tests pass; no residual old-vocabulary tokens in test files or `link-normalize.ts`.</done>
  </task>

  <task id="t6">
    <name>Update documentation: clerk README and architecture doc (including the D7 registry section)</name>
    <files>packages/plugins/clerk/README.md, docs/architecture/apparatus/clerk.md</files>
    <action>In the clerk README: update the API section (signature of `link()` with `label`, `kind` positional params; `listKinds()` replacing `listMeanings()`; `LinkKindDoc` / `KindEntry` replacing `MeaningDoc` / `MeaningEntry`), the command table (rows for `writ-link`, the renamed `writ-link-kinds`, `writ-link-kinds-show`, and the `--label` / `--kind` flags), and all examples using colon-form ids (`astrolabe:refines → astrolabe.refines`). In `docs/architecture/apparatus/clerk.md`: rename any existing `linkMeanings` / `semanticMeaning` / `type` mentions and update the `link(...)` signature snippet to use `label: string`. Per D7, also add a new prose section describing the `linkKinds` kit-contribution substrate: what a kit contributes under `linkKinds`, the `pluginId.kebab-suffix` id shape, what `listKinds()` returns, and the distinction between the casual `label` (display/tagging) and the load-bearing `kind` (registered classification id). Update the apparatus's `consumes` entry from `['writTypes']` to `['writTypes', 'linkKinds']` to reflect actual code. Sweep inline JSDoc/TSDoc on all renamed symbols (across `types.ts`, `clerk.ts`, and the tools) for stale vocabulary while this task has the prose context loaded.</action>
    <verify>! grep -rE "semanticMeaning|MeaningDoc|MeaningEntry|listMeanings|linkMeanings|writ-link-meanings|(astrolabe|testkit|alpha|beta|kit|spider):[a-z]" packages/plugins/clerk/README.md docs/architecture/apparatus/clerk.md</verify>
    <done>Both docs read cleanly in the new vocabulary; the architecture doc's `consumes` list includes `linkKinds`; the new registry section covers contribution shape, id format, `listKinds()` return shape, and the `label`/`kind` distinction.</done>
  </task>
</task-manifest>
