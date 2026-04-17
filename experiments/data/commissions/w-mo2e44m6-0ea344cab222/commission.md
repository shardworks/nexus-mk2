# Writ Link Meaning Substrate

Introduce a `semanticMeaning` layer on writ links so that load-bearing relationships (e.g. scheduler dependency gates) can be expressed with machine-consumable contracts, while preserving the current open-string label space for documentary use.

This is **substrate only**. No specific meaning is declared by this brief and no consumer (e.g. Spider) is wired up. Those are separate briefs.

## Motivation

The current `WritLinkDoc.type` field is an open string. A guild-wide audit of 100 links found 12 distinct types with realised footguns: `depends on` (9) and `depends-on` (1) are the same concept with two spellings; `relates-to`/`related` are synonyms; `refines`/`builds-on`/`enhances` overlap; three separator conventions coexist (space, hyphen, underscore). Any consumer that string-matches type names will silently miss variants.

The chosen mechanism (see click `c-mo2c3bs8` and its children) decouples the label from the contract:

- **`type`** — human-readable label, free-form with normalization applied; consumer code does **not** bind to it.
- **`semanticMeaning`** — optional id referencing a plugin-owned registered meaning; consumer code **does** bind to it.

Multiple distinct types may map to the same meaning (synonymy is first-class). Links with `semanticMeaning = null` are documentary only.

## Changes

### 1. `WritLinkDoc` schema — add `semanticMeaning`

**Current** (`packages/plugins/clerk/src/types.ts:162`):

```typescript
export interface WritLinkDoc {
  [key: string]: unknown;
  id: string;              // composite: {sourceId}:{targetId}:{type}
  sourceId: string;
  targetId: string;
  type: string;            // open string
  createdAt: string;
}
```

**Required:**

- Add `semanticMeaning?: string | null`. Null on links without a registered meaning attached; otherwise the id of a registered meaning (see §3).
- `type` field **retained** (no rename). Its role shifts from "structural type" to "human-readable label."
- Composite `id` remains `{sourceId}:{targetId}:{type}`. `semanticMeaning` is **not** part of link identity — it is a mutable attribute of the link. Changing a link's meaning is an update, not a new link. (See §5 for the API affordance.)
- Update the docstring on `type` to describe it as a human-readable label, not a structural type.

### 2. Type normalization pipeline

**Required:** apply the following transforms, in order, to every `type` value at insert time and at every query-by-type call site. The stored value is always the canonical form.

1. Lowercase.
2. Trim leading and trailing whitespace.
3. Convert `camelCase` to space-delimited: `dependsOn` → `depends on`.
4. Convert `snake_case` to space-delimited: `depends_on` → `depends on`.
5. Convert `kebab-case` to space-delimited: `depends-on` → `depends on`.
6. Collapse runs of internal whitespace to a single space.

After normalization: `"Depends On"`, `"depends-on"`, `"depends_on"`, `"dependsOn"`, and `"depends on"` all collapse to `"depends on"`.

Implementation note: the composite `id` is built from the **normalized** `type`, so inserting `"depends-on"` after `"depends on"` already exists is an idempotent no-op (matches existing idempotency semantics for `link()`).

Normalization is **purely syntactic**. It does not resolve synonymy (`"requires"` and `"depends on"` remain distinct types). Synonymy, if desired, is expressed by attaching both to the same `semanticMeaning`.

### 3. Semantic meaning registry (Clerk-owned)

A new in-memory registry held by the Clerk apparatus, populated at startup from plugin kit contributions.

**Registry entry shape:**

```typescript
export interface MeaningDoc {
  /** Plugin-qualified id, e.g. "spider.precedence-gate". */
  id: string;
  /** Plugin that contributed this meaning. Inferred from the KitEntry. */
  ownerPlugin: string;
  /** Human-readable description of the meaning's semantics, direction, and intended use. */
  description: string;
}
```

**Id format validation** at registration time:

- Must be two segments joined by a single `.`: `<pluginName>.<meaningName>`.
- Each segment: lowercase letters, digits, and `-` only. No leading/trailing `-`. No empty segments.
- The `pluginName` segment **must match** the contributing plugin's id. Clerk rejects attempts to register under another plugin's namespace.
- Duplicate ids rejected (first-to-register wins within a startup; subsequent duplicates cause Clerk startup to fail with a clear error naming the colliding plugins).

**Kit contribution mechanism.** Plugins declare meanings as a new kit contribution type — by convention, the kit field is `linkMeanings`. Example:

```typescript
// Hypothetical future spider.ts — this brief does NOT add this declaration.
supportKit: {
  linkMeanings: [
    {
      id: 'spider.precedence-gate',
      description: 'Source writ is blocked until target writ completes.',
    },
  ],
},
```

The Clerk's `start()` calls `ctx.kits('linkMeanings')` to aggregate every `MeaningDoc`-shaped contribution across loaded plugins, validates each entry (id format, plugin ownership, no duplicates), and populates its registry.

**Validation on link creation.** If `semanticMeaning` is provided on a `link()` call, Clerk verifies the id exists in the registry. Unknown meaning ids are rejected with a clear error. Null / absent meaning is always allowed.

### 4. Migration of existing links

One-time migration of the `books_clerk_links` table at plugin-migration time (the standard framework mechanism — see `migration.applied` event).

**For each existing link row:**

1. Normalize the stored `type` per §2.
2. Recompute the composite `id` from the normalized `type`.
3. Set `semanticMeaning = null`.
4. Upsert the updated row under the new `id`; delete any row with the old `id` that differs.
5. **Collision handling:** if two pre-migration links collapse to the same post-normalization `id` (same `sourceId`, same `targetId`, types that differ only in separator/case), keep the **older** by `createdAt`; discard the younger. Log both ids at warn level. This is exceedingly unlikely given the current data (collision check was run: no conflicts expected) but must be handled correctly.

**Do not** attempt to assign meanings to existing links during migration. All existing links start as documentary (`semanticMeaning = null`). Meaning attribution is the responsibility of whatever process cares (typically the author of a new link, or a later targeted migration when a specific meaning is introduced).

### 5. Clerk API changes

Update `ClerkApi` in `packages/plugins/clerk/src/types.ts`.

**`link` — 4th parameter added:**

```typescript
link(
  sourceId: string,
  targetId: string,
  type: string,
  semanticMeaning?: string | null,
): Promise<WritLinkDoc>;
```

- `type` is normalized before use (per §2).
- If `semanticMeaning` is provided, it is validated against the registry (per §3).
- Idempotent on `(sourceId, targetId, normalizedType)`. If a link with that composite id already exists:
  - If `semanticMeaning` is omitted: return the existing link unchanged.
  - If `semanticMeaning` is provided and matches the existing value: return the existing link.
  - If `semanticMeaning` is provided and differs from the existing value: **update** the link's `semanticMeaning` to the new value and return the updated link. (This is the mechanism for changing a link's meaning — no separate `updateLink` method.)
- Null vs absent: `semanticMeaning: null` is treated the same as omitting the argument (both leave existing meaning unchanged on an already-existing link, or create with `null` on a new link).

**`unlink` — unchanged signature:**

```typescript
unlink(sourceId: string, targetId: string, type: string): Promise<void>;
```

- `type` is normalized before lookup.
- Meaning is not part of identity, so no meaning parameter.

**`links` — returns docs with both fields:**

No signature change; `WritLinkDoc` now carries `semanticMeaning`, so callers see it automatically.

**New: `listMeanings`:**

```typescript
listMeanings(): Promise<MeaningDoc[]>;
```

Returns the full registry. Used by CLI and Oculus for discovery.

### 6. CLI changes (`packages/framework/cli/`)

**`nsg writ link`** — add `--meaning <id>` flag. Passes through to `ClerkApi.link`. Help text shows examples of both documentary (no `--meaning`) and load-bearing usage.

**New command `nsg writ link-meanings`** — lists registered meanings. Default output is a table with columns `ID`, `OWNER`, `DESCRIPTION`. Supports `--json` for machine consumption. Thin wrapper over `ClerkApi.listMeanings()`.

**`nsg writ link-meanings show <id>`** — shows a single meaning's full detail. Low priority but natural to include.

### 7. Tests

Per-item tests (in the closest existing test file in `packages/plugins/clerk/src/`):

- Normalization:
  - Each of the five transforms is exercised with distinct inputs that converge on the same canonical output.
  - Idempotent on already-canonical input.
  - Applied at `link`, `unlink`, and composite-id construction.
- Schema:
  - `semanticMeaning = null` roundtrips through create → query → serialize.
  - `semanticMeaning` set to a registered id roundtrips.
  - Missing `semanticMeaning` argument produces `null` on the stored doc (or equivalent — stored shape is an implementation choice).
- Meaning registry:
  - Valid kit contribution populates the registry.
  - Duplicate id across two plugins fails Clerk startup with a message naming both plugins.
  - Id-format violations (wrong segment count, wrong chars, mismatched plugin prefix) fail at registration.
  - Unknown meaning id on `link()` is rejected with a clear error.
- Link API idempotency:
  - Same (source, target, normalized type) with different original spellings is a single link.
  - Adding a meaning to an existing link updates that link, does not create a duplicate.
  - Changing a meaning on an existing link updates in place.
- Migration:
  - A pre-migration row with `type: "depends-on"` becomes `type: "depends on"` with a recomputed `id`.
  - A pre-migration row with no meaning has `semanticMeaning: null` post-migration.
  - Synthetic collision case (two pre-migration rows that collapse post-normalization) keeps the older and drops the younger, with a warn log.

## Out of scope

- **Declaring any specific meaning.** This brief creates the registry substrate but declares nothing in it. In particular: `spider.precedence-gate` is **not** introduced here.
- **Spider wiring.** Spider reading meanings off links to gate dispatch is a separate brief.
- **Hopper / concurrency changes.** Any change to `maxConcurrentEngines`, scheduler ordering, or the autonomous-hopper MVP is out of scope.
- **Structured `direction`, `cardinality`, or hook fields on `MeaningDoc`.** The minimal three-field schema is deliberate; extension is deferred until a second consumer or a concrete cross-plugin coordination need exists.
- **Consumer-side wiring infrastructure.** Meanings are not self-wiring; they are name-reservation plus description. Consumers (Spider, eventually Oculus) wire their own reactive behaviour via existing Clockworks standing orders.
- **Renaming `WritLinkDoc.type`.** The field name stays.
- **Oculus display of meanings on the writ page.** Nice to have, not required here.
- **Retroactive assignment of meanings to existing links.** Migration sets all existing links to `semanticMeaning: null`. Attribution campaigns are separate work.

## Constraints

- Single package primarily touched: `packages/plugins/clerk/`. CLI changes in `packages/framework/cli/`. No other plugin source modified.
- No change to the `WritDoc` schema, the `books_clerk_links` index set, or the composite-id format beyond the normalization of its `type` component.
- Backward compatibility: existing `link(sourceId, targetId, type)` 3-argument calls continue to work unchanged; `semanticMeaning` is strictly additive. After normalization, some 3-arg calls that previously created distinct links may now collapse to one — this is the intended outcome and is covered by idempotency tests.
- `pnpm -w lint && pnpm -w test` must pass. New tests added per §7.

## Exit criteria

- `WritLinkDoc` carries `semanticMeaning?: string | null`, null on all existing data post-migration.
- `type` normalization is applied at insert, query, and composite-id construction, with a dedicated test file covering the five transform cases.
- Clerk holds an in-memory meaning registry populated from `linkMeanings` kit contributions at startup, with id-format and duplicate-detection validation.
- `ClerkApi.link` accepts and validates `semanticMeaning`; `ClerkApi.listMeanings` exposes the registry.
- `nsg writ link --meaning <id>` and `nsg writ link-meanings` both work against a running guild.
- Migration of the 100 existing links has run; querying the books yields canonicalized `type` values and `semanticMeaning: null` on every row.
- No specific meaning is registered by this commission. A fresh guild without any consumer-declaring plugin loads with an empty registry and the new CLI commands report zero meanings gracefully.
- All new and existing tests pass.

## References

- Design subtree: click `c-mo1mqdk0` → `c-mo2c3bs8` and its five concluded children (split, assignment, pairing, normalization, polarity).
- Research data: click `c-mo2c33rv` — the audit of 100 links across 12 types that motivated the design.
- Kit-contribution pattern: `packages/framework/core/src/plugin.ts` `KitEntry`, with examples in `loom/src/loom.ts:382` and `tools/src/instrumentarium.ts:368`.
- Existing `WritLinkDoc` and `ClerkApi.link`: `packages/plugins/clerk/src/types.ts:162` and `:243`.