# Writ Link Meaning Substrate

## Intent

Add a first-class `semanticMeaning` layer to writ links so that load-bearing relationships (parent/child, refines, supersedes) can be identified by stable, plugin-owned meaning ids while keeping the existing open-string `type` field for casual free-form labeling. Introduce a deterministic normalization pipeline for `type` so that the twelve observed spellings of the same relationship collapse to one canonical string, and a kit-contributed meaning registry that lets plugins reserve and document the load-bearing vocabulary.

## Rationale

Today `WritLinkDoc.type` is an open string and every caller invents their own spelling — `fixes`, `Fixes`, `depends-on`, `dependsOn`, `depends_on`, `depends on` all produce distinct links. That's fine for incidental labels but destroys any mechanism that wants to react to a *specific* relationship (rendering parent/child, gating publish on `refines`, hydrating a cross-reference panel). The semantic-meaning layer gives plugins a way to reserve canonical ids for the relationships they care about; the normalization pipeline cleans up the casual-label noise so identical-intent links actually identify as equal.

## Scope & Blast Radius

Primary package: `packages/plugins/clerk/`. Every surface of the link substrate is touched — the `WritLinkDoc` shape, the `link()`/`unlink()` API, the composite-id construction, the books registry, `start()`-time migration, the kit registry wiring, new tools, and the test suite.

Secondary surfaces flow automatically:

- **`packages/framework/cli/`** is NOT edited. New tools named in the clerk package auto-register under `nsg writ ...` via the existing tool→CLI mapping. The auto-grouping rule (split on first hyphen) must be respected when naming tools.
- **`packages/plugins/astrolabe/src/engines/spec-publish.ts`** calls `clerk.link(..., 'refines')`. It is not edited. `'refines'` is already canonical under normalization, so this caller is unaffected, but verify the three-arg signature still compiles cleanly after the optional fourth arg is added.
- **`packages/plugins/clerk/src/tools/writ-show.ts`** embeds `WritLinks` in its response. The new `semanticMeaning` field flows through automatically — no opt-in required. Oculus/anima rendering of that field is explicitly deferred (see What NOT To Do).

Cross-cutting concerns the implementer must track personally (grep-verifiable):

- **Every call site of `clerk.link()` and `clerk.unlink()`** across the monorepo must tolerate the new optional fourth argument (semanticMeaning) on `link()`. Audit with grep across all packages, not just the clerk tree.
- **Every place that reads `WritLinkDoc`** will now observe `semanticMeaning` on each row. Grep for `WritLinkDoc` and `WritLinks` across the monorepo and confirm that any destructuring, JSON output, or type narrowing tolerates the new field.
- **The test harness's book-index list** in `clerk.test.ts` mirrors `supportKit.books` by hand. No new index is required by this brief, but verify the two lists still agree.
- **Kit-contribution ingest runs for both standalone kits and apparatus support kits.** `KitEntry.pluginId` is the contributing apparatus's id when a support kit contributes — plugin-prefix validation must work identically in both paths.

## Decisions

| # | Decision | Default | Rationale |
|---|----------|---------|-----------|
| D1 | Stored shape for `semanticMeaning` when no meaning is provided | Explicit `null` on every row | Uniform doc shape; mirrors `WritTypeInfo.description`'s existing `string \| null` convention. |
| D2 | Order of empty/whitespace validation vs normalization in `link()`/`unlink()` | Normalize first, then reject empty canonical form | Single source of truth: the stored form is what is validated. Existing `/non-empty/` assertions continue to hold because `''` and whitespace-only inputs still canonicalize to `''`. |
| D3 | Location of the normalization function | Dedicated module under `src/` (importable for tests) | Brief requires a dedicated test file; a pure helper in its own module tests cleanly in isolation. |
| D4 | Kit-contribution shape vs registry-projection shape | Two shapes: `MeaningEntry { id, description }` for kit contributions; `MeaningDoc { id, ownerPlugin, description }` for the projection returned by `listMeanings()` | Kit authors don't repeat their plugin id; registry consumers see a fully-populated record. |
| D5 | Behavior on malformed kit entries (non-object, missing fields, wrong types) | Hard fail at startup | Consistent with the brief's hard-fail intent for all `linkMeanings` validation; a malformed contribution must never silently disappear. |
| D6 | When and how the one-shot link migration runs | Inline loop inside `clerk.start()`, mirroring the existing `legacyStatuses` precedent | Matches the only working migration pattern in the codebase; `migration.applied` has no producer or consumer, and building a generic migration framework is out of scope. |
| D7 | How the migration resolves id collisions produced by normalization | Two-pass: group rows by `(sourceId, targetId, normalizedType)`, keep the oldest by `createdAt`, discard younger siblings with a warn log | Deterministic "older wins" regardless of iteration order; avoids ordering hazards inherent in single-pass upsert. |
| D8 | CLI form for the single-meaning detail command | `nsg writ link-meanings-show <id>` (tool named `writ-link-meanings-show`, kebab-extended) | Existing CLI auto-grouping splits on the first hyphen only; this form is produced by the existing convention without changing `program.ts`. |
| D9 | Default table + `--json` flag output for the meanings-list tool | Handler formats the table string itself; the tool exposes a `json` Zod param defaulting `false` | Matches brief verbatim; requires no CLI infrastructure changes; pattern is reusable. |
| D10 | Zod param key for the new `writ-link` meaning argument | `meaning` (yields `--meaning`) | Brief prescribes `--meaning`; `toFlag()` kebab-cases camelCase keys, so the param key determines the flag spelling. |
| D11 | Whether clerk's `consumes` array declares `linkMeanings` | Add `'linkMeanings'` to `consumes` | Mirrors the `writTypes` precedent; enables the framework's no-consumer warning. |
| D12 | Whether `ClerkKit` is typed with `linkMeanings?: MeaningEntry[]` | Extend `ClerkKit`; export `MeaningEntry` and `MeaningDoc` from the package index | Mirrors `writTypes` pattern; compile-time guidance for kit authors. |
| D13 | Behavior of `listMeanings()` and the CLI when the registry is empty | `listMeanings()` returns `[]`; CLI prints `"No meanings registered."` in table mode and `[]` in `--json` mode | Operator-friendly; empty table body can look like a bug; JSON stays machine-parseable. |

## Acceptance Signal

1. `pnpm -w typecheck` passes with no new errors.
2. `pnpm -w test` passes. The clerk test suite's existing assertions about composite id format (`link.id === '<source>:<target>:fixes'`) remain green — `'fixes'` is already canonical.
3. New unit tests exist for the normalization function in a dedicated test file, covering at minimum: lowercase conversion, trim, camelCase splitting, snake_case splitting, kebab-case splitting, whitespace collapsing, and the composed pipeline on representative inputs.
4. New clerk tests cover: (a) link upserts `semanticMeaning` when the same `(source, target, type)` is linked again with a new meaning; (b) `link()` and `unlink()` both normalize the `type` argument before composite-id construction, so variant spellings resolve to the same link; (c) `linkMeanings` kit contributions register successfully; (d) malformed kit entries, duplicate ids, id-format violations, and plugin-prefix mismatches each cause `clerk.start()` to throw with a clear, greppable error message; (e) the migration two-pass keeps the older row on collision and warns.
5. `nsg writ link --meaning <id>` creates a link carrying the given meaning when the meaning is registered; rejects with a clear error when the meaning id is not in the registry.
6. `nsg writ link-meanings` prints a table with `ID / OWNER / DESCRIPTION` columns by default and the raw array as JSON under `--json`; an empty registry prints `"No meanings registered."` in table mode and `[]` under `--json`.
7. `nsg writ link-meanings-show <id>` prints the single meaning's detail (or exits with a clear not-found error).
8. Grep across the monorepo for residual non-normalized link-type spellings in test fixtures and docs (e.g. `depends-on`, `depends_on`, `dependsOn`) shows that any such strings are either intentionally demonstrating normalization, or have been updated to the canonical form.
9. On a guild database that contains pre-normalization link rows, booting clerk rewrites each row's `id` and `type` to the canonical form, leaves `semanticMeaning = null` on every migrated row, and logs the expected warnings for any collisions.

## Existing Patterns

- **Kit-contribution registry.** `registerKitWritTypes()` in `packages/plugins/clerk/src/clerk.ts` is the closest template. The new `linkMeanings` ingest follows the same four-step shape (declare `consumes`, iterate `ctx.kits('linkMeanings')`, validate per-entry, populate in-memory Map) but with stricter failure behavior per D5/D11.
- **Composite-id construction.** `link()` in `clerk.ts` already builds `id = ${sourceId}:${targetId}:${type}`. The new behavior is to normalize `type` before this string is assembled, in both `link()` and `unlink()`.
- **One-shot startup migration.** The `legacyStatuses` loop in `clerk.ts` (the block that rewrites `'ready' / 'active' / 'waiting'` status values) is the precedent for the link migration. Copy its shape, including the comment noting CDC-registry-sealing safety.
- **Sibling `listWritTypes()` projection API.** The new `listMeanings()` method mirrors this pattern, with the divergences called out in decisions (async return, two-shape separation, different field set). The `WritTypeInfo` shape in `types.ts` is the model for `MeaningDoc`.
- **Tool scaffolding.** Copy `writ-link.ts` / `writ-unlink.ts` / `writ-types.ts` for the new tool files. `writ-types.ts` is the closest analogue for `writ-link-meanings` (registry projection) and `writ-link-meanings-show` (single-entry detail). The handler-formats output pattern for the table (D9) has no in-tree precedent — it is being introduced by this commission.
- **Clerk tests.** `packages/plugins/clerk/src/clerk.test.ts` has a `describe('link()')` block and nearby `unlink()` block; add new blocks contiguously following the established naming and setup conventions (`setupCore`, `setup`, `buildClerkCtx`, `buildKitEntries`). The kit-writ-type tests are the closest template for kit-meaning tests.

## What NOT To Do

- Do NOT modify `packages/plugins/ratchet/` or its `ClickLinkDoc` substrate. A parallel substrate there is appealing but explicitly excluded.
- Do NOT introduce a generic plugin-migration framework or wire the `migration.applied` event. The inline `start()` loop is the chosen mechanism.
- Do NOT render `semanticMeaning` in Oculus pages or anima output. The field flows through `writ-show` automatically; consumption beyond that is deferred.
- Do NOT add new indexes to the `links` book. `semanticMeaning` is queried via the existing `links()` projection, not as a primary filter.
- Do NOT change the three-argument signature of `clerk.link()` in a breaking way — the fourth argument is optional. Existing callers like `spec-publish.ts` must compile unchanged.
- Do NOT treat normalization as synonymy. `requires` and `depends on` are distinct types; synonymy is expressed by attaching both to the same `semanticMeaning`. State this explicitly in the new docstring on `WritLinkDoc.type` and in test names.
- Do NOT extend `packages/framework/cli/src/program.ts` to support multi-level nesting for the `link-meanings show` subcommand. Use the kebab-extended tool name per D8.
- Do NOT fix the pre-existing doc/code drift (`summon` vs `mandate` in the README, the two different `writTypes` config shapes in docs, the `migration.applied` event with no producer). Flag, but defer.
- Do NOT rename the existing `type` field on `WritLinkDoc` or deprecate it. It stays as a casual-label affordance alongside the new `semanticMeaning` field.

<task-manifest>
  <task id="t1">
    <name>Normalization helper module and unit tests</name>
    <files>packages/plugins/clerk/src/ (new normalization module and its dedicated test file)</files>
    <action>Introduce a dedicated module exposing a pure normalization function for link-type strings. The function composes: lowercase, trim, split camelCase into space-separated tokens, replace snake_case and kebab-case separators with spaces, collapse runs of whitespace to a single space. Add a dedicated test file covering each transform independently plus a handful of composed inputs that exercise the twelve observed spellings collapsing to a single canonical form. Do not wire the module into clerk.ts yet — this task ships the helper and its tests standalone so regressions surface locally.</action>
    <verify>pnpm --filter @nexus-sage/clerk test</verify>
    <done>New module exports a pure function; dedicated test file passes; function is not yet called from clerk.ts.</done>
  </task>

  <task id="t2">
    <name>WritLinkDoc shape, type exports, and ClerkKit typing</name>
    <files>packages/plugins/clerk/src/types.ts, packages/plugins/clerk/src/index.ts, packages/plugins/clerk/src/clerk.ts (ClerkKit interface)</files>
    <action>Extend `WritLinkDoc` with an optional `semanticMeaning` field whose runtime shape is always present as either `string` or `null` per D1. Document in the field's docstring that `type` is a casual label and `semanticMeaning` is the load-bearing identifier; explicitly note that normalization is syntactic (not synonymy). Introduce the two registry shapes per D4: a kit-input shape and a registry-projection shape. Extend the exported `ClerkKit` interface with the optional `linkMeanings` field per D12 and re-export both new types from the package index.</action>
    <verify>pnpm -w typecheck</verify>
    <done>Types compile across the monorepo; no call sites broken; new types exported from the clerk package index.</done>
  </task>

  <task id="t3">
    <name>Meaning registry ingest and listMeanings API</name>
    <files>packages/plugins/clerk/src/clerk.ts</files>
    <action>Add `'linkMeanings'` to the apparatus `consumes` declaration per D11. During `start()`, iterate `ctx.kits('linkMeanings')` and populate a new in-memory Map keyed by meaning id. Per D5 hard-fail on: non-object entries, missing/empty id, missing/non-string description, id-format violations (the grammar the brief defines), plugin-prefix mismatches against `KitEntry.pluginId`, and duplicate ids across kits. Error messages must name the offending kit, the offending entry, and the violated rule clearly. Expose an async `listMeanings()` method on the Clerk API that projects the Map into the registry-projection shape. Validation in `link()` that rejects unknown meanings is added here (it is a startup-time registry query even though called at link-time).</action>
    <verify>pnpm --filter @nexus-sage/clerk test</verify>
    <done>Kit-contributed meanings register on startup; malformed/duplicate/mismatched contributions cause `start()` to throw; `listMeanings()` returns the registry projection; `link()` rejects unknown `semanticMeaning` ids.</done>
  </task>

  <task id="t4">
    <name>link/unlink normalization, semanticMeaning, and upsert semantics</name>
    <files>packages/plugins/clerk/src/clerk.ts</files>
    <action>Wire the normalization helper into both `link()` and `unlink()` so the `type` argument is normalized before composite-id construction. Apply the validation order from D2 — normalize first, then reject if the canonical form is empty. Extend `link()` with an optional fourth `semanticMeaning` argument; validate it against the registry when present; store `null` when absent per D1. Implement upsert semantics per S1: when a link with the same composite id already exists, update its `semanticMeaning` to the newly provided value (including back to `null` when omitted on a subsequent call — re-read the brief decision text to confirm exact behavior; if ambiguous, update only when a non-null value is supplied).</action>
    <verify>pnpm --filter @nexus-sage/clerk test</verify>
    <done>Variant spellings of the same `type` produce the same composite id; `link()` attaches and updates `semanticMeaning`; existing composite-id assertions still pass.</done>
  </task>

  <task id="t5">
    <name>One-shot startup migration for existing link rows</name>
    <files>packages/plugins/clerk/src/clerk.ts</files>
    <action>Add an inline migration loop inside `start()`, modeled on the existing `legacyStatuses` precedent. Per D7, implement a two-pass flow: first pass scans all existing link rows and groups them by `(sourceId, targetId, normalizedType)`; second pass per group keeps the row with the earliest `createdAt`, discards the rest with a warn log naming both ids, and rewrites the survivor with the canonicalized `type`, recomputed composite `id`, and `semanticMeaning = null`. Include the CDC-safety comment from the precedent, extended to note that writes here fire no `links`-book watcher today but could in the future.</action>
    <verify>pnpm --filter @nexus-sage/clerk test</verify>
    <done>Booting against pre-normalization data produces canonical rows; collisions resolve older-wins with a warn log; re-running is a no-op.</done>
  </task>

  <task id="t6">
    <name>writ-link tool gains --meaning flag</name>
    <files>packages/plugins/clerk/src/tools/writ-link.ts, packages/plugins/clerk/src/tools/index.ts (if tool registration changes)</files>
    <action>Add an optional `meaning` Zod param per D10 (param key `meaning` yields flag `--meaning`). Pass it through to `clerk.link()` as the fourth argument. Update the tool's `description` and `instructions` to mention `--meaning` for load-bearing usage; keep the open-string examples for casual labels. Validate that the end-to-end CLI invocation works and the rejection path (unknown meaning id) surfaces a readable error.</action>
    <verify>pnpm --filter @nexus-sage/clerk test && pnpm -w typecheck</verify>
    <done>`nsg writ link --meaning <id>` creates a link carrying the meaning; unknown ids produce a clear error; existing calls without `--meaning` continue to work.</done>
  </task>

  <task id="t7">
    <name>writ-link-meanings list and show tools</name>
    <files>packages/plugins/clerk/src/tools/ (two new tool files), packages/plugins/clerk/src/tools/index.ts, packages/plugins/clerk/src/clerk.ts (supportKit.tools registration)</files>
    <action>Add a `writ-link-meanings` tool that calls `listMeanings()`. Per D9, the tool accepts an optional `json` Zod param defaulting `false`; when `json` is true the handler returns the array (CLI JSON-stringifies by default); when `json` is false the handler returns a formatted table string with `ID / OWNER / DESCRIPTION` columns, or the explicit message from D13 when the registry is empty. Add a `writ-link-meanings-show` tool that accepts an `id` param and returns either the full meaning doc (clear not-found error when absent) — name it with the kebab-extended form per D8 so CLI mapping produces `nsg writ link-meanings-show <id>`. Register both tools in the apparatus's `supportKit.tools` array.</action>
    <verify>pnpm --filter @nexus-sage/clerk test</verify>
    <done>`nsg writ link-meanings` renders a table by default and JSON under `--json`; empty registry prints the explicit message / `[]`; `nsg writ link-meanings-show <id>` returns the single meaning or a clear not-found.</done>
  </task>

  <task id="t8">
    <name>Clerk test-suite coverage for the new substrate</name>
    <files>packages/plugins/clerk/src/clerk.test.ts</files>
    <action>Extend the clerk test suite with new `describe` blocks contiguous to the existing `link()` / `unlink()` blocks. Cover every acceptance-signal behavior: upsert of `semanticMeaning`, normalization at both `link()` and `unlink()` entry, kit ingest success, each of the hard-fail cases for malformed/duplicate/mismatched entries, migration two-pass with a fabricated collision, the new tools' default-table output, `--json` output, and empty-registry output. Use the existing `setupCore` / `setup` / `buildClerkCtx` / `buildKitEntries` helpers; add new assertions without editing the existing composite-id assertions (which continue to pass because `'fixes'` is already canonical).</action>
    <verify>pnpm --filter @nexus-sage/clerk test</verify>
    <done>Full clerk test suite passes including the new coverage; no existing assertion is modified or deleted.</done>
  </task>

  <task id="t9">
    <name>Final repository-wide typecheck and test pass</name>
    <files>Monorepo-wide verification pass</files>
    <action>Run the full repository typecheck and test suite. Grep across the monorepo for any remaining non-normalized link-type spellings in test fixtures or docs and either update them to canonical form or explicitly note they are exercising normalization. Verify `spec-publish.ts` still compiles against the new `clerk.link()` signature.</action>
    <verify>pnpm -w typecheck && pnpm -w test</verify>
    <done>Typecheck and test pass across the monorepo; no residual pre-normalization spellings remain except where intentional.</done>
  </task>
</task-manifest>
