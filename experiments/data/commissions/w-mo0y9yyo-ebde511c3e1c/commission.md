# CLI Short ID Resolution & Positional ID Arguments

## Summary

Add short ID prefix resolution and positional ID arguments to the `nsg` CLI, so users can type `nsg writ show w-mo0gias9` instead of `nsg writ show --id w-mo0gias9-e6a2a5553973`. A shared `resolvePrefix()` utility in the Stacks package handles the LIKE query; the CLI layer auto-detects ID params by naming convention and resolves them before calling tool handlers.

## Current State

### ID Generation

`packages/framework/core/src/id.ts` generates IDs in the format `{prefix}-{base36_timestamp}-{hex_random}` (e.g. `w-mo0gias9-e6a2a5553973`). The prefix encodes the entity type: `w` for writs, `ses` for sessions, `conv` for conversations, `rig` for rigs, `turn` for turns, `draft` for drafts.

### CLI Command Building

`packages/framework/cli/src/program.ts` exports `buildToolCommand(commandName, toolDef)` which creates a Commander `Command` from a `ToolDefinition`. It iterates `toolDef.params.shape` to generate `--flag <value>` options. The action handler pipeline is:

```typescript
const coerced = coerceCliOpts(shape, opts);
const validated = toolDef.params.parse(coerced);
const result = await toolDef.handler(validated);
```

There is no positional argument support — only `cmd.option()` / `cmd.requiredOption()` calls, no `cmd.argument()`.

### Tool Definitions

`packages/plugins/tools/src/tool.ts` defines the `ToolDefinition` interface. It has no metadata for positional arguments or ID param identification. Tools declare params as a flat Zod object shape.

### ID Param Naming Convention

All ID-accepting tools follow the same naming convention:

| Tool | Param name(s) |
|------|---------------|
| `writ-show`, `writ-complete`, `writ-cancel`, `writ-fail`, `writ-publish`, `writ-edit` | `id` (required) |
| `writ-list` | `parentId` (optional) |
| `writ-link`, `writ-unlink` | `sourceId`, `targetId` (required) |
| `commission-post` | `parentId` (optional) |
| `session-show` | `id` (required) |
| `conversation-show`, `conversation-end` | `id` (required) |

### Stacks Query Support

`packages/plugins/stacks/src/types.ts` defines `WhereCondition` which already supports the `LIKE` operator: `[field: string, op: 'LIKE', value: string]`. The `ReadOnlyBook<T>` interface provides `find(query: BookQuery): Promise<T[]>` and `get(id: string): Promise<T | null>`.

### Book Ownership

Each apparatus owns its books via a `(ownerId, bookName)` pair:

| ownerId | bookName | ID prefix | Entity |
|---------|----------|-----------|--------|
| `clerk` | `writs` | `w` | Writs |
| `animator` | `sessions` | `ses` | Sessions |
| `parlour` | `conversations` | `conv` | Conversations |
| `spider` | `rigs` | `rig` | Rigs |

### Stacks API Access

The `StacksApi` interface provides:
```typescript
readBook<T extends BookEntry>(ownerId: string, name: string): ReadOnlyBook<T>;
```

At CLI command execution time, the guild is already initialized (`createGuild(home)` is called in `main()` before `registerTools()`), so `guild().apparatus<StacksApi>('stacks')` is available.

## Requirements

- R1: A `resolvePrefix()` function must be exported from the Stacks package (`@shardworks/stacks-apparatus`). It must accept a `ReadOnlyBook<T>` and a prefix string, query with `LIKE`, and return the single matching full ID or throw a descriptive error.
- R2: When the LIKE query returns zero results, `resolvePrefix()` must throw with a message including the prefix that was searched: `No match for prefix "{prefix}"`.
- R3: When the LIKE query returns two or more results, `resolvePrefix()` must throw with a message listing up to 10 matching IDs: `Ambiguous prefix "{prefix}" — matches: {id1}, {id2}, ...`. If more than 10 matches exist, append `(and N more)`.
- R4: The LIKE query must use `limit: 10` to cap the database scan.
- R5: `resolvePrefix()` must always run the LIKE query regardless of input length — no special-casing for full-length IDs.
- R6: The `buildToolCommand()` function must auto-detect ID params by naming convention: any param named `id` or ending with `Id` (e.g. `parentId`, `sourceId`, `targetId`).
- R7: For each detected ID param, after coercion and before Zod validation, `buildToolCommand()` must resolve the value through `resolvePrefix()` using the correct book, determined by the ID value's prefix characters.
- R8: A static prefix-to-book mapping must exist in the CLI package, mapping ID prefix strings to `{ ownerId, book }` pairs.
- R9: When a param value's prefix is not found in the mapping, the CLI must skip resolution and pass the value through unchanged — allowing Zod validation or the tool handler to produce the error.
- R10: Short ID resolution must only occur in the CLI path. MCP/anima tool calls must continue to require full IDs with no resolution.
- R11: When a tool's params shape has a required `id` key (non-optional `z.string()`), `buildToolCommand()` must register it as an optional Commander positional argument (`[id]`) in addition to the `--id` option.
- R12: When both the positional argument and `--id` flag are provided, the CLI must reject with the error: `Cannot specify ID both as positional argument and --id flag.`
- R13: When only the positional argument is provided, it must be merged into opts as the `id` value before coercion/resolution/validation.
- R14: Resolution must apply to optional ID params (e.g. `parentId` on `writ-list`) when a value is provided. Undefined/missing optional params must pass through unchanged.
- R15: S4 (backward compatibility for `--writ-id`) is a confirmed no-op. No tool uses `writId` as a param name; all use `id`. No alias or compatibility shim is needed.

## Design

### Type Changes

**New export from `packages/plugins/stacks/src/resolve-prefix.ts`:**

```typescript
import type { BookEntry, ReadOnlyBook } from './types.ts';

/**
 * Resolve a short ID prefix to a full ID by querying the book with LIKE.
 *
 * Always runs the LIKE query regardless of input length.
 * Returns the unique matching ID, or throws if zero or multiple matches.
 *
 * @param book  - A ReadOnlyBook to query against
 * @param prefix - The ID prefix string (e.g. "w-mo0gias9")
 * @returns The full matching ID string
 * @throws Error if no match or ambiguous match
 */
export async function resolvePrefix<T extends BookEntry>(
  book: ReadOnlyBook<T>,
  prefix: string,
): Promise<string> {
  const matches = await book.find({
    where: [['id', 'LIKE', `${prefix}%`]],
    limit: 10,
  });

  if (matches.length === 0) {
    throw new Error(`No match for prefix "${prefix}"`);
  }

  if (matches.length === 1) {
    return matches[0].id;
  }

  // Ambiguous: 2+ matches
  const ids = matches.map((m) => m.id);
  const listed = ids.join(', ');
  // If we got exactly 10 results, there may be more
  const suffix = matches.length === 10 ? ' (and possibly more)' : '';
  throw new Error(
    `Ambiguous prefix "${prefix}" — matches: ${listed}${suffix}`,
  );
}
```

**New file `packages/framework/cli/src/id-resolution.ts`:**

```typescript
/**
 * Static mapping from ID prefix to the Stacks book that stores entities
 * with that prefix. Used by the CLI to route short ID resolution to the
 * correct book.
 *
 * The key is the prefix string before the first hyphen in the ID
 * (e.g. 'w' from 'w-mo0gias9-e6a2a5553973').
 */
export interface BookRef {
  ownerId: string;
  book: string;
}

export const ID_PREFIX_MAP: Record<string, BookRef> = {
  w:     { ownerId: 'clerk',    book: 'writs' },
  ses:   { ownerId: 'animator', book: 'sessions' },
  conv:  { ownerId: 'parlour',  book: 'conversations' },
  rig:   { ownerId: 'spider',   book: 'rigs' },
};

/**
 * Extract the entity-type prefix from an ID value.
 *
 * IDs have the format "{prefix}-{timestamp}-{random}" or shortened
 * "{prefix}-{timestamp}". The prefix is everything before the first hyphen.
 *
 * Returns undefined if the value contains no hyphen.
 */
export function extractIdPrefix(value: string): string | undefined {
  const idx = value.indexOf('-');
  return idx > 0 ? value.slice(0, idx) : undefined;
}

/**
 * Determine whether a param key is an ID field by naming convention.
 *
 * Returns true for:
 * - 'id' (exact match)
 * - any key ending with 'Id' (e.g. 'parentId', 'sourceId', 'targetId')
 */
export function isIdParam(key: string): boolean {
  return key === 'id' || key.endsWith('Id');
}
```

### Behavior

**`resolvePrefix()` (Stacks package):**

- When called with a book and prefix string, queries `book.find({ where: [['id', 'LIKE', prefix + '%']], limit: 10 })`.
- When exactly 1 result: returns `result[0].id`.
- When 0 results: throws `Error('No match for prefix "w-mo0g"')`.
- When 2–9 results: throws `Error('Ambiguous prefix "w-mo0g" — matches: w-mo0g..., w-mo0g...')`.
- When 10 results: throws `Error('Ambiguous prefix "w-mo0g" — matches: w-mo0g..., ... (and possibly more)')`. The 10-result limit means there could be more matches not shown.
- The query is always executed regardless of whether the input looks like a full ID. A full ID will simply match exactly one result (or zero if it doesn't exist in the book).

**`buildToolCommand()` positional argument (S2):**

- When iterating the Zod shape, if a key named `id` exists and is non-optional (detected by `!schema.isOptional()`), register a Commander positional argument: `cmd.argument('[id]', schema.description ?? 'id')`.
- In the action handler, Commander passes positional args as leading parameters before `opts`. The handler signature becomes `async (positionalId: string | undefined, opts: Record<string, unknown>) => { ... }`.
- When `positionalId` is defined and `opts.id` is also defined: throw `Error('Cannot specify ID both as positional argument and --id flag.')`.
- When `positionalId` is defined and `opts.id` is undefined: set `opts.id = positionalId`.
- When `positionalId` is undefined: no-op, proceed with `opts` as-is.
- This merge happens before coercion.

**`buildToolCommand()` ID resolution pipeline (S1, S3):**

The action handler pipeline changes from:

```
coerce → validate → handle
```

to:

```
merge positional → coerce → resolve IDs → validate → handle
```

After coercion and before Zod validation, the handler iterates all keys in the Zod shape. For each key where `isIdParam(key)` returns true and the coerced value is a non-empty string:

1. Call `extractIdPrefix(value)` to get the prefix string.
2. Look up the prefix in `ID_PREFIX_MAP`. If not found, skip resolution for this param (pass through unchanged).
3. Get a `ReadOnlyBook` via `guild().apparatus<StacksApi>('stacks').readBook(bookRef.ownerId, bookRef.book)`.
4. Call `resolvePrefix(book, value)` and replace the param value with the resolved full ID.

If `resolvePrefix()` throws, the error propagates to the existing try/catch in the action handler, which prints `Error: {message}` and exits with code 1.

Resolution only applies to non-undefined values. Optional ID params that are not provided (undefined) are skipped. This handles S3 naturally — `parentId` on `writ-list` is resolved when provided, ignored when omitted.

**MCP path unchanged (D11):**

The resolution logic lives entirely in `buildToolCommand()`'s action handler. MCP tool invocation goes through `toolDef.handler(validated)` directly, bypassing the CLI layer. No changes to the MCP path.

**S4 no-op (D13):**

No tool in the codebase uses `writId` as a param name. All tools use `id`, which generates `--id`. No backward-compatibility alias is needed.

### Non-obvious Touchpoints

- **`packages/plugins/stacks/src/index.ts`** — must re-export `resolvePrefix` from the new `resolve-prefix.ts` file so it's available as `import { resolvePrefix } from '@shardworks/stacks-apparatus'`.
- **`packages/framework/cli/src/helpers.ts`** — the `isIdParam()` and `extractIdPrefix()` utilities could live here, but placing them in a dedicated `id-resolution.ts` file keeps the helpers module focused on its current concerns (Zod coercion, flag generation). The choice is the implementer's — both locations work.
- **`packages/framework/cli/package.json`** — may need a dependency on `@shardworks/stacks-apparatus` for the `resolvePrefix` import if it isn't already listed. The CLI package currently depends on `@shardworks/nexus-core` and `@shardworks/tools-apparatus`; it accesses Stacks at runtime via `guild().apparatus()`, but the `resolvePrefix` function import requires a compile-time dependency.

### Dependencies

The CLI package (`packages/framework/cli`) currently has no compile-time dependency on the Stacks package (`packages/plugins/stacks`). Adding the `resolvePrefix` import requires adding `@shardworks/stacks-apparatus` as a dependency in the CLI's `package.json`. This is a minimum enabling change — the alternative of duplicating the LIKE query logic in the CLI package would be worse.

The StacksApi types (`ReadOnlyBook`, `BookEntry`) are already exported from `@shardworks/stacks-apparatus`.

## Validation Checklist

- V1 [R1, R5]: Call `resolvePrefix(book, 'w-mo0gias9')` on a book containing `w-mo0gias9-e6a2a5553973`. Verify it returns `'w-mo0gias9-e6a2a5553973'`. Also call with the full ID `'w-mo0gias9-e6a2a5553973'` and verify the same result (no short-circuit).
- V2 [R2]: Call `resolvePrefix(book, 'w-nonexistent')` on a book with no matching IDs. Verify it throws with message containing `No match for prefix "w-nonexistent"`.
- V3 [R3, R4]: Insert 12 entries with IDs starting with `w-abc` into a book. Call `resolvePrefix(book, 'w-abc')`. Verify it throws with message containing `Ambiguous prefix "w-abc"`, lists exactly 10 IDs, and includes `(and possibly more)`.
- V4 [R6, R7]: Run `nsg writ show w-mo0gias9` (short prefix). Verify the handler receives the full ID `w-mo0gias9-e6a2a5553973`.
- V5 [R8, R9]: Run a tool with an ID param whose value starts with an unknown prefix (e.g. `zzz-abc`). Verify the value passes through unresolved to the handler/validator.
- V6 [R10]: Invoke `writ-show` via MCP with a short ID. Verify it does NOT resolve — the tool receives the short ID as-is (and likely errors from the tool handler, not from resolution).
- V7 [R11, R13]: Run `nsg writ show w-mo0gias9` (positional argument, no `--id` flag). Verify the handler receives the resolved full ID.
- V8 [R12]: Run `nsg writ show w-abc --id w-xyz`. Verify the CLI rejects with `Cannot specify ID both as positional argument and --id flag.`
- V9 [R11]: Run `nsg writ show --id w-mo0gias9` (flag only, no positional). Verify it works as before, handler receives the resolved full ID.
- V10 [R14]: Run `nsg writ list --parent-id w-mo0gias9`. Verify `parentId` is resolved to the full ID before reaching the handler. Run `nsg writ list` without `--parent-id` — verify no resolution attempt, handler receives `parentId: undefined`.
- V11 [R6, R14]: Run `nsg writ link --source-id w-short1 --target-id w-short2`. Verify both `sourceId` and `targetId` are independently resolved to their full IDs.
- V12 [R15]: Confirm no tool in the codebase uses `writId` as a param name: `grep -r 'writId' packages/plugins/*/src/tools/` returns no results.

## Test Cases

### resolvePrefix() unit tests (in Stacks package)

1. **Single match** — Book contains `{id: 'w-abc123-deadbeef'}`. Call `resolvePrefix(book, 'w-abc123')` → returns `'w-abc123-deadbeef'`.
2. **Full ID match** — Book contains `{id: 'w-abc123-deadbeef'}`. Call `resolvePrefix(book, 'w-abc123-deadbeef')` → returns `'w-abc123-deadbeef'`.
3. **No match** — Empty book. Call `resolvePrefix(book, 'w-nope')` → throws `Error('No match for prefix "w-nope"')`.
4. **Ambiguous match (2 results)** — Book contains `{id: 'w-abc-111'}` and `{id: 'w-abc-222'}`. Call `resolvePrefix(book, 'w-abc')` → throws with message containing `Ambiguous prefix "w-abc"` and both IDs.
5. **Ambiguous match (10+ results)** — Insert 12 entries with IDs `w-abc-001` through `w-abc-012`. Call `resolvePrefix(book, 'w-abc')` → throws with exactly 10 IDs listed and `(and possibly more)`.
6. **Partial prefix** — Book contains `{id: 'w-mo0gias9-aaa'}` and `{id: 'w-mo0gibbb-bbb'}`. Call `resolvePrefix(book, 'w-mo0gi')` → throws ambiguous (both match). Call `resolvePrefix(book, 'w-mo0gia')` → returns `'w-mo0gias9-aaa'` (only one matches).

### isIdParam() unit tests (in CLI package)

7. **Exact 'id'** — `isIdParam('id')` → `true`.
8. **Suffixed 'Id'** — `isIdParam('parentId')` → `true`, `isIdParam('sourceId')` → `true`, `isIdParam('targetId')` → `true`.
9. **Non-ID params** — `isIdParam('title')` → `false`, `isIdParam('status')` → `false`, `isIdParam('identity')` → `false`, `isIdParam('bodyId')` → `true`.

### extractIdPrefix() unit tests

10. **Standard ID** — `extractIdPrefix('w-mo0gias9-deadbeef')` → `'w'`.
11. **Session ID** — `extractIdPrefix('ses-abc123')` → `'ses'`.
12. **No hyphen** — `extractIdPrefix('nohyphen')` → `undefined`.

### buildToolCommand() positional argument tests

13. **Positional arg registered** — Build a command for a tool with required `id: z.string()`. Verify the command has a registered argument named `id` (check `cmd.registeredArguments`).
14. **Positional arg NOT registered for optional id** — Build a command for a tool with `id: z.string().optional()`. Verify no positional argument is registered.
15. **Positional arg NOT registered for non-id required params** — Build a command for a tool with `title: z.string()`. Verify no positional argument is registered.
16. **Positional arg merges into opts** — Parse `['my-id-value']` (positional only). Verify handler receives `id: 'my-id-value'`.
17. **Flag-only still works** — Parse `['--id', 'my-id-value']`. Verify handler receives `id: 'my-id-value'`.
18. **Both positional and flag rejects** — Parse `['pos-id', '--id', 'flag-id']`. Verify error message contains `Cannot specify ID both as positional argument and --id flag`.

### buildToolCommand() ID resolution integration tests

These tests require a mock Stacks apparatus or a memory-backend book.

19. **Single ID param resolved** — Register a tool with `id: z.string()`. Set up a book with one writ. Parse `['--id', 'w-short']`. Verify handler receives the full ID.
20. **Optional ID param resolved when present** — Register a tool with `parentId: z.string().optional()`. Parse `['--parent-id', 'w-short']`. Verify handler receives the resolved full ID.
21. **Optional ID param skipped when absent** — Same tool. Parse with no `--parent-id`. Verify handler receives `parentId: undefined`, no resolution attempted.
22. **Multiple ID params independently resolved** — Register a tool with `sourceId: z.string()` and `targetId: z.string()`. Parse `['--source-id', 'w-s', '--target-id', 'w-t']`. Verify both are independently resolved.
23. **Unknown prefix passes through** — Parse `['--id', 'zzz-unknown']`. Verify the value passes through unresolved.
24. **Resolution error propagates** — Parse `['--id', 'w-nonexistent']`. Verify the command exits with an error containing `No match for prefix`.
