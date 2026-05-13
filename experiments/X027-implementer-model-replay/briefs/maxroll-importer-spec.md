# Maxroll Planner Importer

## Intent

Ship a Maxroll planner importer that turns a Maxroll planner reference (id, planner URL, planner URL with variant/tab hash, or build-guide URL) into a saved Character + default Build + equipped Items in d4-tools, with a structured per-category unmapped-reference report and patch-version-mismatch handling. The deliverable is a pure library function in `lib/import/maxroll/`, a thin server adapter that returns all variants in a single preview response, a dedicated four-state UI flow at `/import/maxroll`, and entry points from cmd-K, the builds-list page, and the new-character page.

## Rationale

The manual character editor is the only authoring path today, which is too costly for users who want to compare their thinking against a Maxroll theorycraft. The importer also unblocks the next-commission calibration harness — a batch comparison of our damage-engine output against Maxroll's planner numbers — which needs a programmatic Maxroll-to-our-schema mapper. Predecessor commission `w-mp2ocao3` was cancelled when the underlying catalog datamine pipeline was broken; substrate commits `c62b98e`, `9262619`, `dc115ef`, `b919cfd` repaired that — the `bnetFileName` join key the importer relies on now has near-complete coverage in `lib/catalog/affixes.json`, `aspects.json`, `uniques.json`, and the per-class `skills/` and `paragon/` catalogs.

## Scope & Blast Radius

This commission lands a new subsystem (`lib/import/maxroll/`), a new API route, a new UI route, three small UI edits, one optional schema extension, a verification test, and two doc updates. The damage engine, triage subsystem, persistence pipeline, and catalog files are not modified.

**Cross-cutting concerns the implementer must audit:**

- **Catalog join key.** The importer's only mapping mechanism is exact-match on `bnetFileName` — no label-match, no attribute-id, no tag-heuristic fallbacks. Every catalog entry type already carries optional `bnetFileName`; verify by grepping `bnetFileName` across `lib/catalog/*.json` and the per-class `lib/catalog/{paragon,skills}/*.json` files.
- **Persistence reuse.** The importer commits via the existing `POST /api/characters?withDefaultBuild=true` endpoint, which already handles atomic character + default-build creation with rollback on failure. No new persistence transaction logic exists in scope — verify nothing else writes characters/builds directly.
- **Cmd-K disambiguation.** The existing `import-build` command (JSON file round-trip) must be renamed in the same edit that adds the Maxroll command so fuzzy-match on the keyword "import" cannot route to the wrong command. Search `components/layout/CommandPalette.tsx` for `"Import Build…"` and update both the label and the new command together.
- **Provenance schema field.** `Build.importedFrom` is an optional new field on `BuildSchema`. Every consumer of `Build` must continue to work when the field is absent (default-undefined is the no-import case). Verify by grepping for `BuildSchema` and `Build.notes`/`Build.targetItems`-adjacent reads across `lib/persistence/`, `lib/damage/`, `lib/triage/`, `app/`, and `components/`.
- **Concurrent doc updates.** `docs/data-sources/01-armory.md` §2.2 currently states Maxroll has "no public API" — directly contradicted by this commission's data source. `docs/future-import-paths.md` Path A still lists Maxroll-URL importing as an open community pattern. Both must be edited in the same commission.

## Decisions

| # | Decision | Default | Rationale |
|---|----------|---------|-----------|
| D1 | Where the importer library lives | `lib/import/maxroll/` with `lib/import/index.ts` top-level re-export | Reserves dedicated import namespace for known-coming D4Builds/Mobalytics/TTS siblings already sketched in `docs/future-import-paths.md` |
| D2 | `ImportContext` shape | All-optional: `{ fetch?, cacheDir?, now? }` with sensible defaults (global fetch, `DATA_DIR/maxroll-cache`, `new Date()`). Catalog imported directly from `lib/catalog` at module scope | Both callers (server route, future calibration CLI) run server-side with global fetch available; Vitest mocks via the `fetch` slot |
| D3 | Public surface of the library | Export only the top-level `importMaxrollPlanner(input, ctx)`. No public parser/fetcher/mapper helpers (patron override) | #18 — exposing helpers earns its only justification from an unbuilt calibration harness; that is imagined-consumer scaffolding |
| D4 | `data.min.json` cache location/key | `DATA_DIR/maxroll-cache/data.min.<patch>.json` — filename keyed by catalog patch string | Patch-changes-trigger-refetch invalidation falls out of the filename automatically; stale files lingering at ~11MB each is benign |
| D5 | Cache TTL beyond patch | Patch-only invalidation; no sliding TTL | Matches brief's invalidation rule; user can manually delete the file to force refresh |
| D6 | Env-var endpoint overrides | Two overrides: `MAXROLL_PLANNER_API_BASE` (default `https://planners.maxroll.gg`) + `MAXROLL_DATA_BASE` (default `https://assets-ng.maxroll.gg`). Importer appends canonical path suffixes | Mirrors `ANTHROPIC_API_URL` / `ANTHROPIC_BASE_URL` precedent in `lib/triage/anthropic.ts`; needed for Vitest fixture-server testing |
| D7 | `ImportResult` discriminated shape | `{ ok: true, character, build, items, report: { unmappedAffixes, unmappedAspects, unmappedParagonNodes, unmappedGlyphs, unmappedSkills, versionMismatch? } } \| { ok: false, reason: 'not-found' \| 'private' \| 'patch-mismatch' \| 'zero-mapped' \| 'network' \| 'parse-error', message, details? }` | Success-with-warnings is the brief's intent; discriminated union lets calibration callers batch-collect failures without try/catch |
| D8 | Unmapped-reference shape | TypeScript discriminated union keyed by `category: 'affix' \| 'aspect' \| 'paragon-node' \| 'glyph' \| 'skill' \| 'unique'`, each variant carrying the per-category identifying fields | Preserves type-safety of per-category fields (e.g. `nid` on affix entries) while staying uniformly iterable |
| D9 | Patch-drift failure threshold | If patch versions differ AND fewer than 50% of explicit affixes mapped across all items in the variant → fail with `reason: 'patch-mismatch'`. Implicits/aspects/paragon-nodes/glyphs excluded from the ratio | Brief names this explicitly; counts only explicits to avoid penalizing a single absent uncommon glyph |
| D10 | Default `variantIndex` when neither input nor URL hash specifies | `0` (first variant) | Matches what Maxroll viewers default to; UI picker still exposes all variants for explicit choice after preview |
| D11 | `AspectInstance.source` default | `'legendary'` when Maxroll's payload is ambiguous about provenance | Endgame planner convention; codex rolls are a subset of legendary range |
| D12 | `Character.level` default | `100` when Maxroll omits a level | Endgame is the dominant Maxroll planner case and the named calibration target |
| D13 | `Item.itemPower` default | Leave `undefined` when Maxroll's payload doesn't carry an explicit IP. Trust Maxroll's value when present | Schema explicitly supports `undefined`; `lib/catalog/index.ts:getAffixValueRangeAtItemPower(undefined)` returns the highest band deterministically |
| D14 | `Item.rarity` default | If item maps to a `UniqueEntry` → `'unique'`; else if an aspect is present → `'legendary'`; else → `'rare'` | Three-tier rule maps cleanly to Maxroll's payload semantics; covers leveling-variant rares |
| D15 | `Item.isAncestral` default | `false` unless Maxroll explicitly marks the item ancestral | Honest "not certified" state; user flips post-import in the editor |
| D16 | Affix routing into `implicits` / `explicits` / `tempered` / `aspect` | Walk Maxroll's affix array; consult catalog `AffixEntry.isImplicit` to route into `implicits[]`; honor Maxroll's tempered marker to route into `tempered[]`; everything else → `explicits[]`; aspect goes to the single `aspect` slot | Catalog `isImplicit` is the authoritative cross-component position contract |
| D17 | `ParagonBoardAllocation.nodes` content | Maxroll's node ids stored verbatim as strings with `mr:` prefix (e.g. `['mr:1234', 'mr:1235']`). `spentPoints` is derived from `nodes.length`, not trusted from Maxroll as a parallel field | Lossless, sequence-preserving, forward-compatible: a future per-node catalog enables a one-time migration; the `mr:` prefix signals foreign-id provenance |
| D18 | Imported glyph level default | `21` (max) when Maxroll doesn't carry an explicit level | Endgame planner assumption — defaulting to 1 silently weakens the imported build's DPS |
| D19 | Build provenance recording | Add optional schema field `Build.importedFrom?: { source: 'maxroll', plannerId: string, variantIndex: number, importedAt: string, plannerVersion: string }`. Not written into `Build.notes` | Calibration harness is a named structural consumer; structured field is the right shape |
| D20 | UI flow location | New dedicated route `app/import/maxroll/page.tsx` with four states (paste → preview → confirm → post-confirm-redirect). Not a modal, not inline on `/characters/new` | URL-addressability of each state; matches cmd-K → `router.push` pattern used by every other navigate command |
| D21 | Entry points shipped | Cmd-K command + button on `/builds` page (header / empty-state) + affordance on `/characters/new` page. Three discoverable surfaces | Brief: "at least one must be discoverable without prior knowledge"; redundancy is cheap and the builds page is the natural empty-state surface |
| D22 | Existing "Import Build…" cmd-K label | Rename to `"Import Build from JSON file…"`; new Maxroll command label is `"Import Build from Maxroll planner…"` | Disambiguate cmd-K fuzzy match on keyword "import"; the existing JSON round-trip is not deleted |
| D23 | Server adapter shape and commit path | Stateless `POST /api/import/maxroll/preview` returns ALL variants' mapped `{ character, build, items, report }` in one response. The UI then POSTs the chosen variant's `character` payload directly to the existing `POST /api/characters?withDefaultBuild=true` endpoint. No second import-side commit route | Reuses existing commit endpoint with atomic rollback; no server-side preview state |
| D24 | Build-guide URL extraction | Fetch the page HTML and regex-match `/d4/planner/([a-zA-Z0-9]+)`. Take the first match if multiple | No DOM-parser dep; works for both `<iframe>`-embedded and `<a>`-linked planner refs |
| D25 | Verification test wiring | Vitest test using checked-in fixtures — one real planner payload + a subset of `data.min.json` covering only the fixture's referenced nids — fed via `ctx.fetch` override. Hermetic | No live-network suite; ToS-safe; matches `__tests__/datamine-import-realdata.test.ts` precedent |
| D26 | Standalone CLI verification script | Do not ship. Vitest is sufficient for "callable from Node CLI" (patron override) | #18 — pre-staging an unbuilt calibration harness via a CLI script is imagined-consumer scaffolding |
| D27 | Maxroll-slot → our-slot translation table location | Inline as a TypeScript const map in `lib/import/maxroll/slot-map.ts` (sibling module, not in `lib/catalog/`) | Maxroll-specific logic is importer-private, not catalog data; mirrors `lib/triage/anthropic.ts` keeping its prompt vocabulary local |
| D28 | Maxroll JSON payload validation | Zod schema with `.passthrough()` on every object — parse-or-throw on missing required fields, tolerate unknown extras | Fail-loud on real shape drift; benign Maxroll additions don't break the importer |

## Acceptance Signal

1. **Library callable in isolation.** A Vitest test (`__tests__/maxroll-import.test.ts`) imports `importMaxrollPlanner` from `lib/import/maxroll`, feeds it a checked-in planner-payload fixture + `data.min.json`-subset fixture via `ctx.fetch`, and asserts an `ok: true` result with non-empty `equippedItems`, a `class` set, a populated `paragonAllocation`, at least one mapped aspect, and at least one mapped paragon glyph.
2. **All input shapes parse.** The library accepts and resolves: a bare planner id, a `https://maxroll.gg/d4/planner/<id>` URL, the same URL with `#<n>&equipment`-style hash, and a `/d4/build-guides/<slug>` URL.
3. **Reports never lie.** Run a planner that includes an affix/aspect/skill/glyph not present in the catalog and confirm every unmapped reference appears in the appropriate report bucket — none silently dropped. Verifiable by grepping the test fixtures for unmapped references against the result's `report` arrays.
4. **Patch drift fails appropriately.** A test that supplies a `data.min.json` whose `version` differs from `verifiedAgainst.patch` AND whose explicit-affix mapping rate falls below 50% returns `{ ok: false, reason: 'patch-mismatch' }`. A drifted-but-above-threshold case returns `{ ok: true, report: { versionMismatch: {...} } }`.
5. **UI flow lands the user on the new build.** Manual e2e: paste a planner URL on `/import/maxroll`, pick a variant in the preview, confirm, land on `/builds/<id>` with that build active (the build-detail page already calls `setActiveBuildId(id)` server-side on visit).
6. **Cmd-K is unambiguous.** Press cmd-K, type "import", and observe two distinct labels — `"Import Build from JSON file…"` and `"Import Build from Maxroll planner…"` — both in the `File` group, fuzzy-match selecting either deterministically.
7. **Repo-wide checks green.** `pnpm typecheck`, `pnpm lint`, and `pnpm test` all pass with no new warnings introduced.

## Reference Material

### `lib/schema/build.ts` — full file (the `Build.importedFrom` extension lands here)

```typescript
import { z } from "zod";
import { ItemSchema } from "./item";

/**
 * Canonical Build entity (v2+).
 *
 * A Build belongs to a Character via characterId (FK).
 * targetItems: the hypothetical/goal item per slot (empty by default).
 * In v2, UI only surfaces current character items; target slots are reserved
 * for the comparison surface in a future commission.
 * No schemaVersion field (D4 patron override).
 */
export const BuildSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, "ID must be lowercase alphanumeric with hyphens"),
  characterId: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1, "Build name is required"),
  notes: z.string().default(""),
  targetItems: z.record(z.string(), ItemSchema).default({}),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});

export type Build = z.infer<typeof BuildSchema>;
```

The new field is optional and never required by existing readers; persistence/damage/triage/UI ignore it. Role: API surface to extend per D19.

### `lib/schema/item.ts` — the four-way affix split D16 routes into

```typescript
export const ItemSchema = z.object({
  slot: z.string().min(1),
  name: z.string().default(""),
  rarity: ItemRaritySchema,            // 'common'|'magic'|'rare'|'legendary'|'unique'|'mythic'
  itemPower: z.number().int().min(0).optional(),
  isAncestral: z.boolean().default(false),
  implicits: z.array(AffixInstanceSchema).default([]),
  explicits: z.array(AffixInstanceSchema).default([]),
  tempered: z.array(AffixInstanceSchema).default([]),
  aspect: AspectInstanceSchema.optional(),
  masterworkRank: z.number().int().min(0).max(12).default(0),
  runes: z.array(z.string()).default([]),
  sockets: z.array(z.string()).default([]),
});
```

Role: target shape per imported item. D14/D15/D16 inform `rarity`/`isAncestral`/`implicits|explicits|tempered` routing.

### `lib/schema/character.ts` — `CharacterSchema` (importer's primary output) and `D4_CLASSES`

```typescript
export const D4_CLASSES = [
  "Barbarian","Druid","Necromancer","Rogue","Sorcerer","Spiritborn","Paladin","Warlock",
] as const;
export const D4ClassSchema = z.enum(D4_CLASSES);

export const CharacterSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(1),
  class: D4ClassSchema,
  level: z.number().int().min(1).max(100).default(1),
  paragonAllocation: ParagonAllocationSchema.default({ paragonLevel: 0, boards: [] }),
  skillSelections: z.array(SkillSelectionSchema).default([]),
  equippedItems: z.record(z.string(), ItemSchema).default({}),
  playstyleConstraints: z.array(PlaystyleConstraintSchema).default([]),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
});
```

Role: shape the library returns inside `ImportResult.character`. `id` is omitted at the wire; server generates it. `playstyleConstraints` always empty on import.

### Persistence commit pattern — `components/d4/CharacterEditor.tsx` lines 91-105

```typescript
// Atomically create character + default build (server handles rollback on failure)
const res = await fetch("/api/characters?withDefaultBuild=true", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(data),
});
if (!res.ok) {
  const err = await res.json();
  throw new Error(err.error ?? "Failed to create character");
}
const { build } = await res.json();

// Navigate to the new build's detail page
router.push(`/builds/${build.id}`);
```

Role: pattern the UI confirm step mirrors per D23. The body is the chosen variant's `character` payload (after `Build.importedFrom` has been attached to the build the server creates — see D19 note below).

> **D19 / D23 follow-on.** `POST /api/characters?withDefaultBuild=true` today saves a server-derived default build (`name: character.name`, `notes: ""`, `targetItems: {}`) — it has no input slot for `Build.importedFrom`. The implementer chooses how to attach provenance: (a) pass the `importedFrom` payload alongside the character body and extend the route handler to forward it into `saveBuild(...)`; or (b) PATCH the just-created build via the existing `PATCH /api/builds/[id]` route immediately after the create. Either is consistent with D19's "structured field" mandate.

### Build-detail post-confirm landing — `app/builds/[id]/page.tsx` lines 18-23

```typescript
export default async function BuildDetailPage({ params }: Props) {
  const { id } = await params;

  // Mark this build as active server-side on each visit (D5).
  // Best-effort — don't block render on write failure.
  setActiveBuildId(id).catch(() => undefined);
  // ...
}
```

Role: explains why D20's post-confirm step is a `router.push` and nothing more — the build becomes the active triage target by routing alone.

### `lib/triage/anthropic.ts` — env-var endpoint override pattern

```typescript
function getAnthropicApiUrl(): string {
  const fullOverride = process.env.ANTHROPIC_API_URL;
  if (fullOverride && fullOverride.length > 0) return fullOverride;
  const base = (process.env.ANTHROPIC_BASE_URL ?? "https://api.anthropic.com").replace(/\/$/, "");
  return `${base}/v1/messages`;
}
```

Role: precedent D6 follows. Apply the same shape with two functions (one per upstream origin per D6): `MAXROLL_PLANNER_API_BASE` (default `https://planners.maxroll.gg`) and `MAXROLL_DATA_BASE` (default `https://assets-ng.maxroll.gg`). Native fetch only, no SDK dep, fail-loud on non-2xx.

### `components/layout/CommandPalette.tsx` — `import-build` command entry (~lines 233-238)

```typescript
{
  id: "import-build",
  label: "Import Build…",
  description: "Load a build from a JSON file",
  icon: Upload,
  group: "File",
  // ...
}
```

Role: the existing command. Per D22, rename the label in place to `"Import Build from JSON file…"` (the existing JSON round-trip behavior stays; only the label changes). Add a sibling new command with `id: "import-build-maxroll"` and `label: "Import Build from Maxroll planner…"` whose `run` does `router.push("/import/maxroll")`.

### `docs/data-sources/01-armory.md` §2.2 — current text (the section to rewrite)

```markdown
### 2.2 Maxroll.gg D4 Planner

Maxroll's D4 planner at `https://maxroll.gg/d4/planner/` provides build sharing and planning.

- URL: `https://maxroll.gg/d4/planner/`
- Accessed: 2026-05-07
- Patch: Season 13 (Maxroll coverage dated May 6, 2026)
- provenance: `planner`
- verification: `verified working` (HTTP 200 confirmed at access date)

**Battle.net import:** Not confirmed in research. Maxroll's planner is primarily a manual
build-entry tool for sharing builds; direct character import is not a known feature.

**API:** No public API. Internal API endpoints are observable via browser devtools but use of
those undocumented endpoints violates Maxroll's ToS.

**ToS:** Maxroll's Terms of Service explicitly prohibit scraping. For a personal build tool
analyzing your own character, the sanctioned path would be Blizzard's Game Data API (§1.2) — but
as noted, those endpoints do not currently exist.
```

Role: this section must be rewritten to describe the shipped importer's data source (`planners.maxroll.gg/profiles/load`, plus the `assets-ng.maxroll.gg`-hosted `data.min.json`), the actual import surface (build sharing, not "my actual character"), and the patron-accepted ToS posture (single user-pasted planner reference for personal use, consistent with `docs/future-import-paths.md` Path A's existing framing).

### `docs/future-import-paths.md` Path A — current framing

The doc currently lists "Build-URL imports" (Path A) as a research summary of community implementations with no shipped d4-tools manifestation. After this commission, Path A is **partially shipped** for Maxroll; D4Builds and Mobalytics remain open commission ideas. Update the Path A subsection to mark Maxroll as shipped (mirroring the `✅ Shipped (v11 + v12)` annotation on Path B), keeping the other two planner bullets open. `Do not Read.` other Path sections beyond the heading.

### `lib/persistence/characters.ts:saveCharacter` canonicalization note (do not edit)

`saveCharacter` performs write-time canonicalization of skill and paragon board/glyph ids via `findSkillById` / `findParagonBoardById` / `findParagonGlyphById` and drops unresolvable ids with `console.warn`. The importer must **pre-validate against the catalog** so the warning never fires — any reference that would silently drop becomes an `UnmappedSkill` / `UnmappedParagonNode` / `UnmappedGlyph` entry in the import report instead. `Do not Read.` — verify behavior by grepping for `console.warn` in that file if needed.

### Prior art (do not transliterate)

- `d4lfteam/d4lf` Python: `src/gui/importer/maxroll.py` — same API endpoint, same `bnetFileName` join key, same URL-shape parsing.
- `LeiZheng/d4-build` Python: `src/d4_build/parsers/planner_remix.py` — clean pydantic schema mirroring the success-with-warnings result shape.

These are external repositories accessed only as confirmation that the join key works; do not source-port code.

## What NOT To Do

- **No standalone CLI script.** D26 patron override. Vitest satisfies "callable from a Node CLI."
- **No public helper exports.** D3 patron override. Only `importMaxrollPlanner(input, ctx)` is exported. The parser, fetcher, and mapper remain private to `lib/import/maxroll/`.
- **No live-network tests.** D25. The Vitest suite is fixture-based and hermetic.
- **No per-node paragon catalog work.** D17 stores Maxroll node ids verbatim with `mr:` prefix. Building a canonical paragon-node catalog is observation `obs-2` follow-up, not this commission.
- **No aspect-catalog encoding fix-up.** The mixed `valueRange` encoding flagged in observation `obs-1` (some entries in decimal form, most in percentage-point form) is a separate cross-cutting catalog commission. The importer copies Maxroll's rolled value verbatim into `AspectInstance.rolledValue` and does not attempt to reconcile units.
- **No `Build.targetItems` population.** Only current gear is imported. `targetItems` stays the schema's default empty record.
- **No schema changes beyond optional `Build.importedFrom`.** `CharacterSchema`, `ItemSchema`, `AffixInstanceSchema`, `AspectInstanceSchema`, `ParagonAllocationSchema`, `SkillSelectionSchema` are not modified.
- **No damage-engine or triage changes.** Both subsystems consume the canonical schemas and are agnostic to authoring path; the importer commits via the standard persistence pipeline and that's the whole interaction.
- **No sliding TTL on the data.min cache.** D5. Patch-only invalidation.
- **No DOM-parser dependency** for build-guide URL extraction. D24. Regex against the fetched HTML.
- **No alternative join heuristics.** D4 (decision-3 in the brief lineage) — `bnetFileName` is the only join key. No label-match, attribute-id, or tag-based fallbacks.
- **No new sidebar nav entry.** D21 ships cmd-K + builds-page button + characters/new affordance; the sidebar stays as it is.
- **No deletion of the existing JSON-file `import-build` command.** D22 — rename it, do not remove it. The JSON round-trip serves the existing export-and-share path.

<task-manifest>
  <task id="t1">
    <name>Extend BuildSchema with optional importedFrom field</name>
    <files>lib/schema/build.ts, lib/schema/index.ts (re-exports if needed); audit blast radius across lib/persistence/, lib/damage/, lib/triage/, app/, components/, __tests__/</files>
    <action>Add an optional structured provenance field to BuildSchema carrying the source, planner id, variant index, import timestamp, and observed Maxroll planner version, per D19 in the brief. Field must be optional and ignored by every existing consumer — verify nothing breaks when the field is absent. Audit Build readers across the repo to confirm no consumer assumes its absence is invalid.</action>
    <verify>pnpm typecheck && pnpm test -- --run lib/schema</verify>
    <done>BuildSchema accepts and round-trips an optional importedFrom field; all existing tests pass with the field unset; no consumer regressions surfaced by typecheck.</done>
  </task>

  <task id="t2">
    <name>Build importer library scaffolding — parser, env-var overrides, slot-map, payload schema, data.min cache</name>
    <files>lib/import/maxroll/ (new dir, sibling modules — index.ts, parser, fetch client, slot-map.ts, payload schema, data-min cache), lib/import/index.ts (new top-level re-export), DATA_DIR/maxroll-cache/ runtime layout</files>
    <action>Create the lib/import/maxroll/ subsystem with the lib/import/index.ts top-level re-export per D1. Implement the source-reference parser per D2/D24 resolving all four input shapes (bare id, planner URL, planner URL with variant/tab hash, build-guide URL); build-guide URLs require fetching the page HTML and regex-matching /d4/planner/&lt;id&gt; (take first match). Implement env-var endpoint accessors for both Maxroll origins per D6, mirroring the lib/triage/anthropic.ts pattern shown in the brief's Reference Material; use native fetch only, fail-loud on non-2xx. Define the Maxroll-slot → our-slot const map in slot-map.ts per D27. Define the Zod payload schema with .passthrough() on every object per D28. Implement the data.min.json fetcher + disk cache keyed by catalog patch string per D4 (filename DATA_DIR/maxroll-cache/data.min.&lt;patch&gt;.json, no sliding TTL per D5) with an in-memory layer on top. Export only importMaxrollPlanner from the library per D3; keep all helpers private to the package.</action>
    <verify>pnpm typecheck && pnpm test -- --run lib/import</verify>
    <done>lib/import/maxroll exports only importMaxrollPlanner; source-reference parser resolves all four input shapes deterministically; env-var overrides exist for both upstream origins; Zod payload schema validates a real fixture without throwing on unknown fields; first call populates a patch-keyed cache file and subsequent in-process calls do not re-fetch.</done>
  </task>

  <task id="t3">
    <name>Implement the schema-mapping pipeline — catalog join, affix routing, paragon/glyph/aspect, report builder, ImportResult assembly</name>
    <files>lib/import/maxroll/ (mapper modules — catalog index builders, item mapper, paragon mapper, skill mapper, report builder, result assembly)</files>
    <action>Build the catalog join indices — Map&lt;bnetFileName, AffixEntry&gt;, parallel maps for aspects/uniques, plus lazy per-class indices for skills and paragon boards/glyphs — at module load (one-time cost). Translate Maxroll's nid/id references into canonical catalog ids by exact bnetFileName match only; no label-match or tag-based fallbacks. Route mapped affixes into implicits/explicits/tempered/aspect per D16 (catalog isImplicit + Maxroll tempered marker). Apply per-item defaults per D11–D15 (rarity D14, isAncestral D15, itemPower D13 leave undefined when absent, aspect.source D11 default legendary). Set Character.level default 100 per D12. Default glyph level 21 per D18. Store paragon node ids verbatim with mr: prefix per D17 and derive spentPoints from nodes.length. Construct the per-category UnmappedRef discriminated union per D8 — every unmapped reference must land in the appropriate report bucket; zero silent drops. Build the discriminated ImportResult shape per D7. Apply the patch-mismatch fail rule per D9 (different patch versions AND &lt;50% explicits mapped → ok: false, reason: 'patch-mismatch'; drift above threshold → ok: true with versionMismatch warning in the report).</action>
    <verify>pnpm typecheck && pnpm test -- --run lib/import/maxroll</verify>
    <done>The mapping pipeline produces an ok: true result for a fixture planner with at least one mapped aspect, one mapped paragon glyph, and a populated equippedItems map; every unmapped reference in the fixture appears in the appropriate report bucket; the patch-mismatch failure threshold fires under the test conditions described in acceptance signal 4.</done>
  </task>

  <task id="t4">
    <name>Acceptance test with checked-in fixtures</name>
    <files>__tests__/maxroll-import.test.ts (new), __tests__/fixtures/maxroll-planner-&lt;id&gt;.json (new), __tests__/fixtures/maxroll-data-min-subset.json (new)</files>
    <action>Add a Vitest acceptance test per D25 that imports importMaxrollPlanner and feeds it the checked-in fixture payloads via ctx.fetch override. Assert mappable output per acceptance signal 1: ok: true, non-empty equippedItems, class set, paragonAllocation populated, at least one mapped aspect, at least one mapped paragon glyph. Add a second test for the patch-mismatch failure (acceptance signal 4): the data.min fixture's version differs from verifiedAgainst.patch AND the explicit mapping rate is below 50%. Add a third test for the warning-but-success case where patch differs but mapping rate stays above threshold. Choose one real Maxroll planner id for the fixture; the data.min subset includes only the nids referenced by that fixture.</action>
    <verify>pnpm test -- --run __tests__/maxroll-import.test.ts</verify>
    <done>All three Vitest cases pass; fixtures committed under __tests__/fixtures/.</done>
  </task>

  <task id="t5">
    <name>Server adapter route — POST /api/import/maxroll/preview</name>
    <files>app/api/import/maxroll/preview/route.ts (new)</files>
    <action>Add a stateless POST route per D23 that accepts a planner reference body, invokes the library, and returns ALL variants' mapped { character, build, items, report } in one response. No server-side preview state; no second commit route on the import side. Surface library failures (ok: false variants of ImportResult) as appropriate HTTP error responses (400 for parse-error, 404 for not-found/private, 502 for network, 409 for patch-mismatch, 422 for zero-mapped, etc.).</action>
    <verify>pnpm typecheck && pnpm test -- --run app/api/import</verify>
    <done>The preview route is reachable via POST, returns the multi-variant preview payload for a successful planner, and maps each library failure reason to a distinct HTTP status with the failure message in the body.</done>
  </task>

  <task id="t6">
    <name>UI route /import/maxroll with paste → preview → confirm → redirect flow</name>
    <files>app/import/maxroll/page.tsx (new), supporting client components under app/import/maxroll/ as needed</files>
    <action>Build the four-state UI per D20: a paste/URL-input state with an Import action; a preview state showing build summary, variant picker, gear-by-slot list, and unmapped-reference aggregate counts (from the report); a confirm state with a single commit action and a cancel that returns to preview; a post-confirm step that POSTs the chosen variant's character payload directly to POST /api/characters?withDefaultBuild=true per D23 and router.pushes to /builds/&lt;id&gt; per the existing CharacterEditor pattern (see brief Reference Material — CharacterEditor.tsx lines 91-105). Attach Build.importedFrom provenance per D19 — either by extending the create-character POST body and forwarding it server-side into saveBuild, or by a follow-up PATCH /api/builds/[id] after create. The build-detail page already calls setActiveBuildId(id) on visit, so no additional plumbing is needed for the imported build to become the active triage target.</action>
    <verify>pnpm typecheck && pnpm lint && pnpm dev (manual e2e: paste a planner URL, walk through to /builds/&lt;id&gt;)</verify>
    <done>The /import/maxroll route is navigable; the four states render cleanly; confirm lands the user on /builds/&lt;id&gt; with the imported build active; Build.importedFrom is populated on the just-created build.</done>
  </task>

  <task id="t7">
    <name>Wire entry points — cmd-K command (+ rename existing), builds-page button, characters/new affordance</name>
    <files>components/layout/CommandPalette.tsx, app/builds/page.tsx, app/characters/new/page.tsx</files>
    <action>In CommandPalette.tsx: rename the existing import-build command's label from "Import Build…" to "Import Build from JSON file…" per D22. Add a sibling command id: "import-build-maxroll" with label "Import Build from Maxroll planner…" in the same File group; its run navigates to /import/maxroll per D20/D21. In app/builds/page.tsx: add a secondary "Import from Maxroll" button alongside the primary New Character action — visible both in the populated-state header and the empty-state per D21. In app/characters/new/page.tsx: add a small "Import from Maxroll" affordance near the CharacterEditor entry point per D21.</action>
    <verify>pnpm typecheck && pnpm lint && grep -n "Import Build" components/layout/CommandPalette.tsx</verify>
    <done>Cmd-K shows the two distinct labels per acceptance signal 6; the builds-list page and the characters/new page both surface a discoverable "Import from Maxroll" affordance.</done>
  </task>

  <task id="t8">
    <name>Concurrent doc updates</name>
    <files>docs/data-sources/01-armory.md (§2.2 rewrite), docs/future-import-paths.md (Path A annotation)</files>
    <action>Rewrite docs/data-sources/01-armory.md §2.2 to reflect the shipped importer's data source (planners.maxroll.gg/profiles/load endpoint + assets-ng.maxroll.gg-hosted data.min.json), the actual import surface (user-shared planner builds — not "my actual character"), and the patron-accepted ToS posture (single user-pasted planner reference for personal use, consistent with Path A's framing in future-import-paths.md). The current "No public API" and "Battle.net import: Not confirmed" framings are directly contradicted by this commission and must be replaced. In docs/future-import-paths.md, annotate Path A as partially shipped — Maxroll specifically is shipped (✅ Shipped, mirroring the Path B annotation), while D4Builds and Mobalytics remain open. Do not edit Paths B/B'/C/D.</action>
    <verify>grep -n "No public API\|Battle.net import: Not confirmed" docs/data-sources/01-armory.md (should return nothing); grep -n "Maxroll" docs/future-import-paths.md (should show the new shipped annotation)</verify>
    <done>Both docs reflect the shipped importer; no stale "no public API" or "open commission idea" language remains for Maxroll; the other planner paths are not modified.</done>
  </task>
</task-manifest>

