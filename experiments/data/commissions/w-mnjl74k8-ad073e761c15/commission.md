---
author: plan-writer 
author_tool_version: 2026-04-03
estimated_complexity: 8
---

# Loom: Charter, Role Instructions, and Tool Instructions Composition

## Summary

Implement system prompt composition in the Loom apparatus. The Loom reads the guild charter, per-role instruction files, and per-tool instruction text at startup, then assembles them into a `systemPrompt` string on every `weave()` call. This completes composition layers 1, 4, and 5 of the documented architecture.

## Current State

**`/workspace/nexus/packages/plugins/loom/src/loom.ts`** — The `createLoom()` factory produces a `Plugin` with a `LoomApi`. The `weave()` method resolves tools via the Instrumentarium and derives git identity, but always returns `systemPrompt: undefined`. A comment at line 132 marks system prompt composition as future work.

Current types:

```typescript
export interface WeaveRequest {
  role?: string;
}

export interface AnimaWeave {
  systemPrompt?: string;
  tools?: ResolvedTool[];
  environment?: Record<string, string>;
}

export interface LoomApi {
  weave(request: WeaveRequest): Promise<AnimaWeave>;
}

export interface RoleDefinition {
  permissions: string[];
  strict?: boolean;
}

export interface LoomConfig {
  roles?: Record<string, RoleDefinition>;
}
```

**`/workspace/nexus/packages/plugins/loom/src/index.ts`** — Barrel exports all public types from `loom.ts` and augments `GuildConfig` with `loom?: LoomConfig`.

**`/workspace/nexus/packages/plugins/loom/src/loom.test.ts`** — Tests use `setGuild()`/`clearGuild()` with fake guild objects and a `mockInstrumentarium()`. No file system operations. The fake guild uses `home: '/tmp/test-guild'`.

**Instrumentarium pre-loaded tool instructions:** The Instrumentarium's `preloadInstructions()` reads tool instruction files at startup and stores the text on `ResolvedTool.definition.instructions` (type `string | undefined` on `ToolDefinition`). This data is available on resolved tools returned by `instrumentarium.resolve()` but is currently never consumed.

**Downstream pipeline:** The Animator's `buildProviderConfig()` already maps `systemPrompt` from the weave to `SessionProviderConfig.systemPrompt`. The claude-code provider writes non-undefined `systemPrompt` to a temp file and passes `--system-prompt-file`. No downstream changes are needed.

## Requirements

- R1: When a guild has a `charter.md` file at the guild root, the Loom must read its content at startup and include it as the first section of every `systemPrompt`.
- R2: When a guild has no `charter.md` at the guild root but has a `charter/` directory containing `.md` files, the Loom must read all `*.md` files in that directory in lexicographic (alphabetical) order, concatenate them with double newlines, and use the result as charter content.
- R3: When neither `charter.md` nor `charter/*.md` files exist, the charter layer is silently omitted — no warning, no error.
- R4: When a role is provided to `weave()` and a file exists at `roles/{role}.md` relative to the guild root, the Loom must include that file's content in the `systemPrompt`. The file path is determined by convention — no configuration field.
- R5: When no file exists at `roles/{role}.md`, the role instructions layer is silently omitted — no warning, no error.
- R6: The `RoleDefinition` type must not be modified. Role instruction file paths are determined purely by convention (`roles/{role}.md`), not by configuration.
- R7: When resolved tools have `definition.instructions` text (pre-loaded by the Instrumentarium), `weave()` must include those tool instructions in the `systemPrompt`, formatted as `## Tool: {tool-name}\n\n{instructions-text}` for each tool with instructions.
- R8: The `systemPrompt` must be composed in this order: charter → tool instructions → role instructions. Sections are concatenated with double newlines (`\n\n`). No wrapper headers or delimiters are added around charter or role instruction content. Role instructions appear last so they can reference tools that were introduced in the tool instructions sections above.
- R9: When no layers produce content (no charter, no role instructions, no tool instructions), `systemPrompt` must be `undefined` — not an empty string.
- R10: `systemPrompt` remains optional on `AnimaWeave` (`systemPrompt?: string`).
- R11: Charter content must be included in the `systemPrompt` regardless of whether a role is provided. A `weave({})` or `weave({ role: undefined })` call must still receive charter content.
- R12: All file reads (charter and role instructions) must happen at startup in `start()`, using synchronous reads (`fs.readFileSync`). Content is cached in memory. Role instruction files for all configured roles are read at startup.
- R13: Charter content reads must also happen at startup: read `charter.md` or scan `charter/*.md` during `start()` and cache the result.

## Design

### Type Changes

No changes to the public types. `AnimaWeave`, `WeaveRequest`, `LoomApi`, `RoleDefinition`, and `LoomConfig` all remain exactly as they are today. The only change to `AnimaWeave` is updating the JSDoc comment on `systemPrompt` to reflect that it is now populated:

```typescript
export interface AnimaWeave {
  /**
   * The system prompt for the AI process. Composed from guild charter,
   * tool instructions, and role instructions. Undefined when no
   * composition layers produce content.
   */
  systemPrompt?: string;
  /** The resolved tool set for this role. Undefined when no role is specified or no tools match. */
  tools?: ResolvedTool[];
  /** Environment variables derived from role identity (e.g. git author/committer). */
  environment?: Record<string, string>;
}
```

The structural change is internal state within `createLoom()`:

```typescript
// Internal state — not exported
let charterContent: string | undefined;
let roleInstructions: Map<string, string>;  // role name → instructions text
```

### Imports

Add to the top of `loom.ts`:

```typescript
import fs from 'node:fs';
import path from 'node:path';
```

### Behavior

#### Startup (`start()`)

When `start()` is called:

1. Read config as today: `config = g.guildConfig().loom ?? {};`
2. Resolve the guild home path: `const home = guild().home;`
3. Read charter content:
   - Compute `charterPath = path.join(home, 'charter.md')`.
   - If `charter.md` exists (wrap `fs.readFileSync` in try/catch; catch `ENOENT`), read it with `fs.readFileSync(charterPath, 'utf-8')` and store as `charterContent`.
   - If `charter.md` does not exist, check for a `charter/` directory at `path.join(home, 'charter')`. If it exists and is a directory (`fs.statSync` + `isDirectory()`, also in try/catch), read all entries with `fs.readdirSync`, filter for files ending in `.md` (case-sensitive), sort alphabetically with default string sort, read each with `fs.readFileSync`, and concatenate with `'\n\n'`. Store the result as `charterContent`. If the directory exists but contains no `.md` files, `charterContent` remains `undefined`.
   - If neither exists, `charterContent` remains `undefined`.
4. Read role instruction files:
   - Initialize `roleInstructions = new Map()`.
   - If `config.roles` is defined, iterate over all role names (`Object.keys(config.roles)`). For each role name, compute `rolePath = path.join(home, 'roles', `${roleName}.md`)`. Try to read with `fs.readFileSync(rolePath, 'utf-8')`. If successful and non-empty, store in the map. If the file does not exist (catch `ENOENT`), skip silently.

All file reads use `fs.readFileSync` wrapped in try/catch — same pattern as the Instrumentarium's `preloadInstructions()`.

#### Weave (`weave()`)

After the existing tool resolution and git identity logic, compose the system prompt:

1. Initialize an empty array `layers: string[]`.
2. If `charterContent` is defined and non-empty, push it to `layers`.
3. If `weave.tools` is defined and non-empty, iterate the resolved tools. For each tool where `tool.definition.instructions` is a non-empty string, push `## Tool: ${tool.definition.name}\n\n${tool.definition.instructions}` to `layers`.
4. If `request.role` is defined and `roleInstructions.has(request.role)`, push the cached instructions text to `layers`.
5. If `layers.length > 0`, set `weave.systemPrompt = layers.join('\n\n')`. Otherwise, leave `systemPrompt` undefined.

Tool instructions come from the already-resolved tools (this step happens after the existing tool resolution block). This means tool instructions are only included when a role is provided and tools are resolved. Charter is always included when present — it does not depend on role or tool resolution.

#### Edge cases

- When `request.role` is `undefined`: charter is included, tool instructions and role instructions are not (no tools resolved without a role, no role to look up).
- When `request.role` is provided but has no role definition in config: charter is included, no tools resolved (existing behavior), no role instructions (no file read at startup because the role wasn't in `config.roles`). Git identity still derived.
- When `charter.md` exists, the `charter/` directory is not checked — `charter.md` takes priority.
- When charter content is whitespace-only: treat as non-empty (include it). The Loom does not trim or validate content — it passes through what the file contains.
- When a role instruction file is empty (0 bytes): `fs.readFileSync` returns `''`. An empty string is falsy, so it is not stored in the map. This means an empty file produces no role instructions layer.
- When the `charter/` directory exists but contains non-`.md` files: those files are ignored. Only files ending in `.md` (case-sensitive) are read.
- A role not in `config.roles` will have no instructions even if `roles/{role}.md` exists on disk — only roles declared in config are pre-read.

### Non-obvious Touchpoints

- **`/workspace/nexus/packages/plugins/loom/src/index.ts`** — The `GuildConfig` augmentation at line 29 types `guild().guildConfig().loom` as `LoomConfig`. Since `LoomConfig` is not changing, no updates needed here. But if the implementing agent adds new types, they must be re-exported from this barrel file.

- **`/workspace/nexus/packages/plugins/loom/README.md`** — Shows `AnimaWeave` without the `tools` field (already stale) and has a comment "MVP — composition not yet implemented." Both need updating to reflect active system prompt composition.

- **`/workspace/nexus/docs/architecture/apparatus/loom.md`** — The spec doc has a "What The Loom does NOT do (MVP)" section that lists system prompt composition as future work. The composition order section (lines 121–128) is reference material. Update the MVP section and any "future work" markers to reflect that layers 1, 4, and 5 are now active.

- **`/workspace/nexus/docs/architecture/index.md`** lines 428–438 — The session funnel diagram labels charter and tool instructions as "future." Update to reflect that layers 1, 4, and 5 are now active.

- **`/workspace/nexus/packages/plugins/loom/src/loom.ts` import additions** — The file currently imports from `@shardworks/nexus-core` and `@shardworks/tools-apparatus`. It will need `import fs from 'node:fs'` and `import path from 'node:path'` for file I/O.

## Validation Checklist

- V1 [R1, R13]: Create a temp guild directory with a `charter.md` file containing known text. Start the Loom with no special config. Call `weave({})`. Verify `systemPrompt` contains the charter text.

- V2 [R2, R13]: Create a temp guild directory with a `charter/` directory containing `a.md` and `b.md` (no `charter.md` at root). Start the Loom. Call `weave({})`. Verify `systemPrompt` contains content of `a.md` followed by content of `b.md`, separated by `\n\n`, in alphabetical order.

- V3 [R3]: Create a temp guild with no `charter.md` and no `charter/` directory. Start the Loom. Call `weave({})`. Verify `systemPrompt` is `undefined`.

- V4 [R4, R12]: Create a temp guild with `roles/artificer.md` containing known text. Configure `loomConfig.roles` with an `artificer` role. Start the Loom. Call `weave({ role: 'artificer' })`. Verify `systemPrompt` contains the role instructions text.

- V5 [R5]: Configure a role `scribe` in `loomConfig.roles` but do not create `roles/scribe.md`. Start the Loom. Call `weave({ role: 'scribe' })`. Verify no error is thrown and role instructions are absent from `systemPrompt`.

- V6 [R6]: Verify that `RoleDefinition` has no `instructions` or `instructionsFile` field — only `permissions` and `strict`. (Compile-time check.)

- V7 [R7]: Set up a mock Instrumentarium that returns resolved tools where one tool has `definition.instructions = 'Use this tool carefully.'` and `definition.name = 'my-tool'`. Start the Loom with a role configured. Call `weave({ role })`. Verify `systemPrompt` contains `## Tool: my-tool\n\nUse this tool carefully.`.

- V8 [R8]: Create a temp guild with `charter.md` and `roles/artificer.md`. Configure mock tools with instructions. Call `weave({ role: 'artificer' })`. Verify the `systemPrompt` has charter text first, then tool instruction sections, then role instructions text — separated by `\n\n`.

- V9 [R9, R10]: Create a temp guild with no charter, no role instruction files, and mock tools without instructions. Call `weave({})`. Verify `systemPrompt` is `undefined` (not `''`).

- V10 [R11]: Create a temp guild with `charter.md`. Start the Loom. Call `weave({})` (no role). Verify `systemPrompt` equals the charter content. Also call `weave({ role: undefined })` and verify same result.

- V11 [R7]: Set up mock tools where `tool-a` has instructions and `tool-b` does not. Verify only `tool-a`'s instructions appear in `systemPrompt`, with the `## Tool: tool-a` header.

- V12 [R12, R13]: Start the Loom with charter and role files present on disk. After `start()`, delete the charter file. Call `weave()`. Verify the cached charter content still appears in `systemPrompt` (confirms startup caching, not per-weave reads).

- V13 [R2]: Create a `charter/` directory with `02-second.md`, `01-first.md`, and `readme.txt`. Verify only the `.md` files are read, in alphabetical order (`01-first.md` before `02-second.md`), and `readme.txt` is excluded.

## Test Cases

All tests use real temp directories (via `os.tmpdir()` + `fs.mkdtempSync`) with real files. Clean up in `afterEach`. No mocking of `fs` modules.

### Charter composition

1. **Charter from single file:** Guild has `charter.md` with content `"Guild policy: be excellent."`. `weave({})` → `systemPrompt` equals `"Guild policy: be excellent."`.

2. **Charter from directory:** Guild has `charter/01-values.md` (`"Value 1"`) and `charter/02-rules.md` (`"Rule 1"`). No `charter.md`. `weave({})` → `systemPrompt` equals `"Value 1\n\nRule 1"`.

3. **`charter.md` takes priority over `charter/` directory:** Guild has both `charter.md` (`"Single file"`) and `charter/01.md` (`"Dir file"`). `weave({})` → `systemPrompt` equals `"Single file"` (directory is not read).

4. **No charter:** Guild has neither `charter.md` nor `charter/` directory. `weave({})` → `systemPrompt` is `undefined`.

5. **Empty charter directory:** Guild has `charter/` directory with no `.md` files (only `.gitkeep`). `weave({})` → `systemPrompt` is `undefined`.

6. **Charter directory with mixed file types:** `charter/` contains `a.md`, `b.txt`, `c.md`. Only `a.md` and `c.md` are read, in that order.

### Role instructions composition

7. **Role instructions present:** Guild has `roles/artificer.md` with `"You are the artificer."`. Config has `artificer` role. `weave({ role: 'artificer' })` → `systemPrompt` contains `"You are the artificer."`.

8. **Role instructions missing:** Config has `scribe` role but no `roles/scribe.md`. `weave({ role: 'scribe' })` → no error, role instructions layer omitted.

9. **Unknown role (not in config):** `weave({ role: 'ghost' })` where `ghost` is not in `config.roles`. File `roles/ghost.md` was never read at startup. Role instructions layer absent from `systemPrompt`.

10. **No role provided:** `weave({})` → role instructions layer omitted. Charter still included if present.

11. **Empty role instructions file:** `roles/artificer.md` exists but is 0 bytes. Config has `artificer` role. Role instructions layer omitted (empty string treated as absent).

### Tool instructions composition

12. **Tools with instructions:** Two resolved tools: `tool-a` with `instructions: 'Guide A'`, `tool-b` with `instructions: 'Guide B'`. `systemPrompt` contains `## Tool: tool-a\n\nGuide A\n\n## Tool: tool-b\n\nGuide B`.

13. **Tools without instructions:** Resolved tools have no `instructions` field (or `undefined`). Tool instructions layer omitted from `systemPrompt`.

14. **Mixed tools:** `tool-a` has instructions, `tool-b` does not. Only `tool-a`'s instructions appear in `systemPrompt`.

### Composition order and assembly

15. **Full composition (charter + tools + role):** Charter (`"Charter text"`), tool with instructions (`"Signal guide"`, name `signal`), role instructions (`"Role text"`). `systemPrompt` equals `"Charter text\n\n## Tool: signal\n\nSignal guide\n\nRole text"`. Charter first, then tool section, then role instructions.

16. **Charter only (no role):** `weave({})` with charter present. `systemPrompt` equals charter content exactly — no trailing newlines or separators.

17. **Role instructions only (no charter):** No charter, role with instructions, tools without instructions. `systemPrompt` equals role instructions content exactly.

18. **Tool instructions only:** No charter, role with tools that have instructions but no role instruction file. `systemPrompt` contains only the tool instruction sections.

19. **All layers empty:** No charter, no role instructions, tools without instructions. `systemPrompt` is `undefined`.

### Startup caching

20. **Content cached at startup:** Start the Loom with charter and role files present. Delete the files. Call `weave()`. `systemPrompt` still contains the original content (reads happened at startup, not at weave time).

21. **Roles not in config are not pre-read:** Guild has `roles/phantom.md` on disk but `phantom` is not in `config.roles`. `weave({ role: 'phantom' })` → no role instructions for `phantom` (file was not read at startup).

### Interaction with existing features

22. **Tool resolution unchanged:** With charter and role instructions active, `weave({ role: 'artificer' })` still returns the correct `tools` array from the Instrumentarium. New composition logic does not interfere with existing tool resolution.

23. **Git identity unchanged:** `weave({ role: 'artificer' })` still returns `environment` with `GIT_AUTHOR_NAME: 'Artificer'` and `GIT_AUTHOR_EMAIL: 'artificer@nexus.local'`.

24. **Backward compatibility:** `weave({})` on a guild with no charter and no role instructions returns the same shape as today — `systemPrompt: undefined`, `tools: undefined`, `environment: undefined`.

---

**Important:** When you are finished, commit all changes in a single commit with a clear, descriptive message. Do not leave uncommitted changes — they will be lost when the session closes.