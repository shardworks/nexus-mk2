## Commission Spec

---
author: plan-writer (2026-04-03)
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

## Commission Diff

```
 docs/architecture/apparatus/loom.md    |  53 ++--
 docs/architecture/index.md             |   5 +-
 packages/plugins/loom/README.md        |  27 +-
 packages/plugins/loom/src/loom.test.ts | 438 ++++++++++++++++++++++++++++++++-
 packages/plugins/loom/src/loom.ts      |  85 ++++++-
 5 files changed, 560 insertions(+), 48 deletions(-)

diff --git a/docs/architecture/apparatus/loom.md b/docs/architecture/apparatus/loom.md
index 91d34c8..d6e6d81 100644
--- a/docs/architecture/apparatus/loom.md
+++ b/docs/architecture/apparatus/loom.md
@@ -1,25 +1,23 @@
 # The Loom — API Contract
 
-Status: **Draft — MVP**
+Status: **Active — Layers 1, 4, 5**
 
 Package: `@shardworks/loom-apparatus` · Plugin id: `loom`
 
-> **⚠️ MVP scope.** This spec covers the seam only — the Loom accepts a role name and returns an `AnimaWeave`, but does not yet compose a system prompt. Role resolution, tool instructions, anima identity, curricula, temperaments, and charter composition are all future work. See [Future: Full Composition](#future-full-composition) for the target design.
-
 ---
 
 ## Purpose
 
 The Loom weaves anima identity into session contexts. Given a role name, it produces an `AnimaWeave` — the composed identity context that The Animator uses to launch a session. The work prompt (what the anima should do) is not the Loom's concern — it bypasses the Loom and goes directly from the caller to the session provider.
 
-MVP: system prompt composition is not yet implemented — `weave()` returns an empty `AnimaWeave` (systemPrompt undefined). The role is accepted on the API surface but not yet used. The seam exists so The Animator never assembles prompts itself; as composition is built out, The Loom's internals change but its output shape stays the same.
+System prompt composition is active for layers 1 (guild charter), 4 (role instructions), and 5 (tool instructions). The Loom reads charter and role instruction files at startup and caches them; tool instructions come from the Instrumentarium's pre-loaded tool definitions. Layers 2 (curriculum) and 3 (temperament) remain future work.
 
 ---
 
 ## Dependencies
 
 ```
-requires: []    — MVP has no apparatus dependencies
+requires: ['tools']    — needs the Instrumentarium for tool resolution and tool instructions
 ```
 
 ---
@@ -31,8 +29,8 @@ interface LoomApi {
   /**
    * Weave an anima's session context.
    *
-   * Given a role name, produces an AnimaWeave containing the composed
-   * system prompt. MVP: returns undefined for systemPrompt.
+   * Given a role name, produces an AnimaWeave with a composed system prompt,
+   * resolved tool set, and git identity environment variables.
    */
   weave(request: WeaveRequest): Promise<AnimaWeave>
 }
@@ -40,21 +38,26 @@ interface LoomApi {
 interface WeaveRequest {
   /**
    * The role to weave context for (e.g. 'artificer', 'scribe').
-   * MVP: accepted but not used. Future: resolves role instructions,
-   * curriculum, temperament, and composes the system prompt.
+   * Determines tool resolution and role instructions. When omitted,
+   * only charter content is included in the system prompt.
    */
   role?: string
 }
 
 /**
  * The output of The Loom's weave() — the composed anima identity context.
- * Contains the system prompt produced from the anima's identity layers,
- * and environment variables for the session process.
+ * Contains the system prompt, resolved tool set, and environment variables.
  * The work prompt is not part of the weave.
  */
 interface AnimaWeave {
-  /** The system prompt for the AI process. Undefined until composition is implemented. */
+  /**
+   * The system prompt for the AI process. Composed from guild charter,
+   * tool instructions, and role instructions. Undefined when no
+   * composition layers produce content.
+   */
   systemPrompt?: string
+  /** The resolved tool set for this role. Undefined when no role is specified or no tools match. */
+  tools?: ResolvedTool[]
   /**
    * Environment variables for the session process.
    * Derived from role configuration. The Animator merges these with
@@ -68,18 +71,14 @@ interface AnimaWeave {
 }
 ```
 
-The MVP Loom is a stub for system prompt composition — the value is in the seam, not the logic. The contract is stable: as composition is built out, `systemPrompt` gains a value but the shape doesn't change.
-
 The `environment` field is active at MVP: the Loom derives git identity from the role name and populates `GIT_AUTHOR_NAME` and `GIT_AUTHOR_EMAIL`. The committer identity is intentionally left to the system default so that commit signatures remain verified on GitHub. The Animator merges these into the spawned process environment, giving each role a distinct author identity. Orchestrators (e.g. the Dispatch) can override specific variables per-request — for example, setting the email to a writ ID for per-commission attribution.
 
 ---
 
-## What The Loom does NOT do (MVP)
+## What The Loom does NOT do
 
-- **Compose system prompts** — the role is accepted but not used; systemPrompt is undefined.
-- **Resolve roles or tools** — no role instructions, no tool instructions, no charter.
-- **Read files from disk** — no file I/O at all.
-- **Look up anima identity** — no identity records exist in MVP.
+- **Compose curricula or temperaments** — layers 2 and 3 remain future work.
+- **Look up anima identity** — no identity records exist yet.
 - **Handle work prompts** — the work prompt bypasses the Loom entirely.
 - **Launch sessions** — that's The Animator's job.
 
@@ -116,16 +115,16 @@ interface AnimaWeave {
 }
 ```
 
-### Future composition order
+### Composition order
 
-The system prompt is woven by combining, in order:
+The system prompt is woven by combining active layers in order:
 
-1. **Guild charter** — institutional policy, applies to all animas
-2. **Curriculum** — what the anima knows (versioned, immutable per version)
-3. **Temperament** — who the anima is (versioned, immutable per version)
-4. **Role instructions** — read from the path in `guild.json` roles config
-5. **Tool instructions** — per-tool `instructions.md` for the resolved tool set
-6. **Writ context** — the specific work being done
+1. **Guild charter** ✅ active — `charter.md` or `charter/*.md` at the guild root
+2. **Curriculum** — future work (what the anima knows)
+3. **Temperament** — future work (who the anima is)
+4. **Role instructions** ✅ active — `roles/{role}.md` relative to the guild root
+5. **Tool instructions** ✅ active — `definition.instructions` from resolved tools, formatted as `## Tool: {name}`
+6. **Writ context** — future work (the specific work being done)
 
 ### Future: System Prompt Appendix
 
diff --git a/docs/architecture/index.md b/docs/architecture/index.md
index 8619bdc..9b45154 100644
--- a/docs/architecture/index.md
+++ b/docs/architecture/index.md
@@ -429,9 +429,8 @@ Every session passes through the same funnel regardless of how it was triggered:
   Trigger (summon relay / nsg consult / nsg convene)
     │
     ├─ 1. Weave context  (The Loom)
-    │     system prompt + initial prompt
-    │     future: + role instructions + tool instructions
-    │             + curriculum + temperament + charter
+    │     system prompt: charter + tool instructions + role instructions
+    │     future: + curriculum + temperament
     │
     ├─ 2. Launch process  (The Animator → Session Provider)
     │     AI process starts in a working directory
diff --git a/packages/plugins/loom/README.md b/packages/plugins/loom/README.md
index 2f65ac2..9ebaf63 100644
--- a/packages/plugins/loom/README.md
+++ b/packages/plugins/loom/README.md
@@ -1,12 +1,10 @@
 # `@shardworks/loom-apparatus`
 
-The Loom — the guild's session context composer. This apparatus owns system prompt assembly: given a role name, it weaves charter, curricula, temperament, and role instructions into an `AnimaWeave` that The Animator consumes to launch AI sessions. The work prompt (what the anima should do) bypasses The Loom — it is not a composition concern.
-
-MVP: system prompt composition is not yet implemented — `weave()` returns an empty `AnimaWeave` (systemPrompt undefined). The role is accepted but not yet used. The seam exists now so the contract is stable as composition logic is built out.
+The Loom — the guild's session context composer. This apparatus owns system prompt assembly: given a role name, it weaves charter, tool instructions, and role instructions into an `AnimaWeave` that The Animator consumes to launch AI sessions. The work prompt (what the anima should do) bypasses The Loom — it is not a composition concern.
 
 ```
 caller (Animator.summon)         → weave({ role })
-@shardworks/loom-apparatus       → AnimaWeave { systemPrompt? }
+@shardworks/loom-apparatus       → AnimaWeave { systemPrompt?, tools?, environment? }
 The Animator                     → launches session with weave + work prompt
 ```
 
@@ -44,8 +42,8 @@ interface LoomApi {
   /**
    * Weave an anima's session context.
    *
-   * Given a role name, produces an AnimaWeave containing the composed
-   * system prompt. MVP: returns undefined for systemPrompt.
+   * Given a role name, produces an AnimaWeave with a composed system prompt,
+   * resolved tool set, and git identity environment variables.
    */
   weave(request: WeaveRequest): Promise<AnimaWeave>;
 }
@@ -57,8 +55,8 @@ interface LoomApi {
 interface WeaveRequest {
   /**
    * The role to weave context for (e.g. 'artificer', 'scribe').
-   * MVP: accepted but not used. Future: resolves role instructions,
-   * curriculum, temperament, and composes the system prompt.
+   * Determines tool resolution and role instructions. When omitted,
+   * only charter content is included in the system prompt.
    */
   role?: string;
 }
@@ -68,8 +66,14 @@ interface WeaveRequest {
 
 ```typescript
 interface AnimaWeave {
-  /** The system prompt for the AI process. Undefined until composition is implemented. */
+  /**
+   * The system prompt for the AI process. Composed from guild charter,
+   * tool instructions, and role instructions. Undefined when no
+   * composition layers produce content.
+   */
   systemPrompt?: string;
+  /** The resolved tool set for this role. Undefined when no role is specified or no tools match. */
+  tools?: ResolvedTool[];
   /**
    * Environment variables for the session process.
    * Default: git identity derived from role name.
@@ -88,7 +92,8 @@ const loom = guild().apparatus<LoomApi>('loom');
 
 const weave = await loom.weave({ role: 'artificer' });
 // → {
-//     systemPrompt: undefined,  // MVP — composition not yet implemented
+//     systemPrompt: '...charter...\n\n## Tool: ...\n\n...role instructions...',
+//     tools: [...],
 //     environment: {
 //       GIT_AUTHOR_NAME: 'Artificer',
 //       GIT_AUTHOR_EMAIL: 'artificer@nexus.local',
@@ -115,7 +120,7 @@ const result = await animator.summon({
 
 The Loom reads role definitions from `guild.json["loom"]["roles"]`. See the [architecture spec](../../docs/architecture/apparatus/loom.md) for role configuration format.
 
-MVP: role configuration is used for tool resolution (permissions) and environment variables (git identity). System prompt composition is not yet implemented — future versions will also read anima identity records, charter content, and curricula from guild config and The Stacks.
+Role configuration is used for tool resolution (permissions), environment variables (git identity), and role instruction file lookup (`roles/{role}.md`). Future: curricula and temperament composition.
 
 ---
 
diff --git a/packages/plugins/loom/src/loom.test.ts b/packages/plugins/loom/src/loom.test.ts
index 1f4c27a..6850096 100644
--- a/packages/plugins/loom/src/loom.test.ts
+++ b/packages/plugins/loom/src/loom.test.ts
@@ -7,6 +7,9 @@
 
 import { describe, it, beforeEach, afterEach } from 'node:test';
 import assert from 'node:assert/strict';
+import fs from 'node:fs';
+import os from 'node:os';
+import path from 'node:path';
 import { z } from 'zod';
 
 import { setGuild, clearGuild } from '@shardworks/nexus-core';
@@ -46,10 +49,11 @@ function mockInstrumentarium(resolvedTools: ResolvedTool[] = []) {
 function setupGuild(opts: {
   loomConfig?: LoomConfig;
   apparatuses?: Record<string, unknown>;
+  home?: string;
 }) {
   const apparatuses = opts.apparatuses ?? {};
   setGuild({
-    home: '/tmp/test-guild',
+    home: opts.home ?? '/tmp/test-guild',
     apparatus: <T>(id: string): T => {
       const a = apparatuses[id];
       if (!a) throw new Error(`Apparatus '${id}' not installed`);
@@ -323,4 +327,436 @@ describe('The Loom', () => {
       assert.equal(weave.environment?.GIT_AUTHOR_EMAIL, 'unknown-role@nexus.local');
     });
   });
+
+  // ── System prompt composition ──────────────────────────────────────
+
+  describe('weave() — charter composition', () => {
+    let tmpDir: string;
+
+    beforeEach(() => {
+      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-test-'));
+    });
+
+    afterEach(() => {
+      clearGuild();
+      fs.rmSync(tmpDir, { recursive: true, force: true });
+    });
+
+    it('includes charter.md content in systemPrompt', async () => {
+      fs.writeFileSync(path.join(tmpDir, 'charter.md'), 'Guild policy: be excellent.');
+      setupGuild({ home: tmpDir });
+      const api = startLoom();
+      const weave = await api.weave({});
+      assert.equal(weave.systemPrompt, 'Guild policy: be excellent.');
+    });
+
+    it('composes charter from directory files in alphabetical order', async () => {
+      const charterDir = path.join(tmpDir, 'charter');
+      fs.mkdirSync(charterDir);
+      fs.writeFileSync(path.join(charterDir, '02-rules.md'), 'Rule 1');
+      fs.writeFileSync(path.join(charterDir, '01-values.md'), 'Value 1');
+      setupGuild({ home: tmpDir });
+      const api = startLoom();
+      const weave = await api.weave({});
+      assert.equal(weave.systemPrompt, 'Value 1\n\nRule 1');
+    });
+
+    it('charter.md takes priority over charter/ directory', async () => {
+      fs.writeFileSync(path.join(tmpDir, 'charter.md'), 'Single file');
+      const charterDir = path.join(tmpDir, 'charter');
+      fs.mkdirSync(charterDir);
+      fs.writeFileSync(path.join(charterDir, '01.md'), 'Dir file');
+      setupGuild({ home: tmpDir });
+      const api = startLoom();
+      const weave = await api.weave({});
+      assert.equal(weave.systemPrompt, 'Single file');
+    });
+
+    it('returns undefined systemPrompt when no charter exists', async () => {
+      setupGuild({ home: tmpDir });
+      const api = startLoom();
+      const weave = await api.weave({});
+      assert.strictEqual(weave.systemPrompt, undefined);
+    });
+
+    it('returns undefined systemPrompt when charter/ directory has no .md files', async () => {
+      const charterDir = path.join(tmpDir, 'charter');
+      fs.mkdirSync(charterDir);
+      fs.writeFileSync(path.join(charterDir, '.gitkeep'), '');
+      setupGuild({ home: tmpDir });
+      const api = startLoom();
+      const weave = await api.weave({});
+      assert.strictEqual(weave.systemPrompt, undefined);
+    });
+
+    it('charter directory with mixed file types only reads .md files', async () => {
+      const charterDir = path.join(tmpDir, 'charter');
+      fs.mkdirSync(charterDir);
+      fs.writeFileSync(path.join(charterDir, 'a.md'), 'A content');
+      fs.writeFileSync(path.join(charterDir, 'b.txt'), 'B content');
+      fs.writeFileSync(path.join(charterDir, 'c.md'), 'C content');
+      setupGuild({ home: tmpDir });
+      const api = startLoom();
+      const weave = await api.weave({});
+      assert.equal(weave.systemPrompt, 'A content\n\nC content');
+    });
+
+    it('includes charter when weave() is called without a role', async () => {
+      fs.writeFileSync(path.join(tmpDir, 'charter.md'), 'Charter text');
+      setupGuild({ home: tmpDir });
+      const api = startLoom();
+      const weave1 = await api.weave({});
+      const weave2 = await api.weave({ role: undefined });
+      assert.equal(weave1.systemPrompt, 'Charter text');
+      assert.equal(weave2.systemPrompt, 'Charter text');
+    });
+  });
+
+  describe('weave() — role instructions composition', () => {
+    let tmpDir: string;
+
+    beforeEach(() => {
+      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-test-'));
+    });
+
+    afterEach(() => {
+      clearGuild();
+      fs.rmSync(tmpDir, { recursive: true, force: true });
+    });
+
+    it('includes role instructions when roles/{role}.md exists', async () => {
+      const rolesDir = path.join(tmpDir, 'roles');
+      fs.mkdirSync(rolesDir);
+      fs.writeFileSync(path.join(rolesDir, 'artificer.md'), 'You are the artificer.');
+      setupGuild({
+        home: tmpDir,
+        loomConfig: { roles: { artificer: { permissions: ['*:*'] } } },
+      });
+      const api = startLoom();
+      const weave = await api.weave({ role: 'artificer' });
+      assert.ok(weave.systemPrompt?.includes('You are the artificer.'));
+    });
+
+    it('omits role instructions silently when roles/{role}.md is missing', async () => {
+      setupGuild({
+        home: tmpDir,
+        loomConfig: { roles: { scribe: { permissions: ['stacks:read'] } } },
+      });
+      const api = startLoom();
+      const weave = await api.weave({ role: 'scribe' });
+      assert.strictEqual(weave.systemPrompt, undefined);
+    });
+
+    it('omits role instructions for roles not in config even if file exists on disk', async () => {
+      const rolesDir = path.join(tmpDir, 'roles');
+      fs.mkdirSync(rolesDir);
+      fs.writeFileSync(path.join(rolesDir, 'ghost.md'), 'Ghost instructions');
+      setupGuild({
+        home: tmpDir,
+        loomConfig: { roles: { artificer: { permissions: ['*:*'] } } },
+      });
+      const api = startLoom();
+      const weave = await api.weave({ role: 'ghost' });
+      assert.strictEqual(weave.systemPrompt, undefined);
+    });
+
+    it('omits role instructions layer when no role is provided', async () => {
+      const rolesDir = path.join(tmpDir, 'roles');
+      fs.mkdirSync(rolesDir);
+      fs.writeFileSync(path.join(rolesDir, 'artificer.md'), 'Role text');
+      setupGuild({
+        home: tmpDir,
+        loomConfig: { roles: { artificer: { permissions: ['*:*'] } } },
+      });
+      const api = startLoom();
+      const weave = await api.weave({});
+      assert.strictEqual(weave.systemPrompt, undefined);
+    });
+
+    it('omits role instructions layer when role instruction file is empty', async () => {
+      const rolesDir = path.join(tmpDir, 'roles');
+      fs.mkdirSync(rolesDir);
+      fs.writeFileSync(path.join(rolesDir, 'artificer.md'), '');
+      setupGuild({
+        home: tmpDir,
+        loomConfig: { roles: { artificer: { permissions: ['*:*'] } } },
+      });
+      const api = startLoom();
+      const weave = await api.weave({ role: 'artificer' });
+      assert.strictEqual(weave.systemPrompt, undefined);
+    });
+  });
+
+  describe('weave() — tool instructions composition', () => {
+    afterEach(() => {
+      clearGuild();
+    });
+
+    it('includes tool instructions formatted with ## Tool: header', async () => {
+      const toolA = tool({
+        name: 'tool-a',
+        description: 'Tool A',
+        instructions: 'Guide A',
+        params: {},
+        handler: async () => ({}),
+      });
+      const toolB = tool({
+        name: 'tool-b',
+        description: 'Tool B',
+        instructions: 'Guide B',
+        params: {},
+        handler: async () => ({}),
+      });
+      const resolved: ResolvedTool[] = [
+        { definition: toolA, pluginId: 'test' },
+        { definition: toolB, pluginId: 'test' },
+      ];
+      const { api: instrumentarium } = mockInstrumentarium(resolved);
+      setupGuild({
+        loomConfig: { roles: { artificer: { permissions: ['*:*'] } } },
+        apparatuses: { tools: instrumentarium },
+      });
+      const api = startLoom();
+      const weave = await api.weave({ role: 'artificer' });
+      assert.ok(weave.systemPrompt?.includes('## Tool: tool-a\n\nGuide A'));
+      assert.ok(weave.systemPrompt?.includes('## Tool: tool-b\n\nGuide B'));
+    });
+
+    it('omits tool instructions layer when tools have no instructions', async () => {
+      const resolved: ResolvedTool[] = [
+        { definition: testTool('plain-tool'), pluginId: 'test' },
+      ];
+      const { api: instrumentarium } = mockInstrumentarium(resolved);
+      setupGuild({
+        loomConfig: { roles: { artificer: { permissions: ['*:*'] } } },
+        apparatuses: { tools: instrumentarium },
+      });
+      const api = startLoom();
+      const weave = await api.weave({ role: 'artificer' });
+      assert.strictEqual(weave.systemPrompt, undefined);
+    });
+
+    it('only includes tool instructions for tools that have them', async () => {
+      const toolWithInstructions = tool({
+        name: 'tool-a',
+        description: 'Tool A',
+        instructions: 'Use this carefully.',
+        params: {},
+        handler: async () => ({}),
+      });
+      const toolWithout = testTool('tool-b');
+      const resolved: ResolvedTool[] = [
+        { definition: toolWithInstructions, pluginId: 'test' },
+        { definition: toolWithout, pluginId: 'test' },
+      ];
+      const { api: instrumentarium } = mockInstrumentarium(resolved);
+      setupGuild({
+        loomConfig: { roles: { artificer: { permissions: ['*:*'] } } },
+        apparatuses: { tools: instrumentarium },
+      });
+      const api = startLoom();
+      const weave = await api.weave({ role: 'artificer' });
+      assert.ok(weave.systemPrompt?.includes('## Tool: tool-a'));
+      assert.ok(!weave.systemPrompt?.includes('## Tool: tool-b'));
+    });
+  });
+
+  describe('weave() — composition order and assembly', () => {
+    let tmpDir: string;
+
+    beforeEach(() => {
+      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-test-'));
+    });
+
+    afterEach(() => {
+      clearGuild();
+      fs.rmSync(tmpDir, { recursive: true, force: true });
+    });
+
+    it('assembles full composition in order: charter → tool instructions → role instructions', async () => {
+      fs.writeFileSync(path.join(tmpDir, 'charter.md'), 'Charter text');
+      const rolesDir = path.join(tmpDir, 'roles');
+      fs.mkdirSync(rolesDir);
+      fs.writeFileSync(path.join(rolesDir, 'artificer.md'), 'Role text');
+
+      const signalTool = tool({
+        name: 'signal',
+        description: 'Signal tool',
+        instructions: 'Signal guide',
+        params: {},
+        handler: async () => ({}),
+      });
+      const resolved: ResolvedTool[] = [{ definition: signalTool, pluginId: 'test' }];
+      const { api: instrumentarium } = mockInstrumentarium(resolved);
+
+      setupGuild({
+        home: tmpDir,
+        loomConfig: { roles: { artificer: { permissions: ['*:*'] } } },
+        apparatuses: { tools: instrumentarium },
+      });
+      const api = startLoom();
+      const weave = await api.weave({ role: 'artificer' });
+
+      assert.equal(
+        weave.systemPrompt,
+        'Charter text\n\n## Tool: signal\n\nSignal guide\n\nRole text',
+      );
+    });
+
+    it('charter only (no role) — systemPrompt equals charter content', async () => {
+      fs.writeFileSync(path.join(tmpDir, 'charter.md'), 'Charter text');
+      setupGuild({ home: tmpDir });
+      const api = startLoom();
+      const weave = await api.weave({});
+      assert.equal(weave.systemPrompt, 'Charter text');
+    });
+
+    it('role instructions only (no charter, no tool instructions)', async () => {
+      const rolesDir = path.join(tmpDir, 'roles');
+      fs.mkdirSync(rolesDir);
+      fs.writeFileSync(path.join(rolesDir, 'artificer.md'), 'Role text');
+
+      const resolved: ResolvedTool[] = [{ definition: testTool('plain'), pluginId: 'test' }];
+      const { api: instrumentarium } = mockInstrumentarium(resolved);
+
+      setupGuild({
+        home: tmpDir,
+        loomConfig: { roles: { artificer: { permissions: ['*:*'] } } },
+        apparatuses: { tools: instrumentarium },
+      });
+      const api = startLoom();
+      const weave = await api.weave({ role: 'artificer' });
+      assert.equal(weave.systemPrompt, 'Role text');
+    });
+
+    it('tool instructions only (no charter, no role.md)', async () => {
+      const toolA = tool({
+        name: 'my-tool',
+        description: 'My tool',
+        instructions: 'Tool guide',
+        params: {},
+        handler: async () => ({}),
+      });
+      const resolved: ResolvedTool[] = [{ definition: toolA, pluginId: 'test' }];
+      const { api: instrumentarium } = mockInstrumentarium(resolved);
+
+      setupGuild({
+        home: tmpDir,
+        loomConfig: { roles: { artificer: { permissions: ['*:*'] } } },
+        apparatuses: { tools: instrumentarium },
+      });
+      const api = startLoom();
+      const weave = await api.weave({ role: 'artificer' });
+      assert.equal(weave.systemPrompt, '## Tool: my-tool\n\nTool guide');
+    });
+
+    it('systemPrompt is undefined when all layers are empty', async () => {
+      const resolved: ResolvedTool[] = [{ definition: testTool('plain'), pluginId: 'test' }];
+      const { api: instrumentarium } = mockInstrumentarium(resolved);
+      setupGuild({
+        home: tmpDir,
+        loomConfig: { roles: { artificer: { permissions: ['*:*'] } } },
+        apparatuses: { tools: instrumentarium },
+      });
+      const api = startLoom();
+      const weave = await api.weave({ role: 'artificer' });
+      assert.strictEqual(weave.systemPrompt, undefined);
+    });
+  });
+
+  describe('weave() — startup caching', () => {
+    let tmpDir: string;
+
+    beforeEach(() => {
+      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-test-'));
+    });
+
+    afterEach(() => {
+      clearGuild();
+      fs.rmSync(tmpDir, { recursive: true, force: true });
+    });
+
+    it('content is cached at startup — deleting files after start does not affect weave()', async () => {
+      const charterPath = path.join(tmpDir, 'charter.md');
+      const rolesDir = path.join(tmpDir, 'roles');
+      fs.writeFileSync(charterPath, 'Cached charter');
+      fs.mkdirSync(rolesDir);
+      fs.writeFileSync(path.join(rolesDir, 'artificer.md'), 'Cached role');
+
+      setupGuild({
+        home: tmpDir,
+        loomConfig: { roles: { artificer: { permissions: ['*:*'] } } },
+      });
+      const api = startLoom();
+
+      // Delete the files after startup
+      fs.unlinkSync(charterPath);
+      fs.unlinkSync(path.join(rolesDir, 'artificer.md'));
+
+      const weave = await api.weave({ role: 'artificer' });
+      assert.ok(weave.systemPrompt?.includes('Cached charter'));
+      assert.ok(weave.systemPrompt?.includes('Cached role'));
+    });
+
+    it('roles not in config are not pre-read even if file exists on disk', async () => {
+      const rolesDir = path.join(tmpDir, 'roles');
+      fs.mkdirSync(rolesDir);
+      fs.writeFileSync(path.join(rolesDir, 'phantom.md'), 'Phantom instructions');
+
+      setupGuild({
+        home: tmpDir,
+        loomConfig: { roles: { artificer: { permissions: ['*:*'] } } },
+      });
+      const api = startLoom();
+      const weave = await api.weave({ role: 'phantom' });
+      assert.strictEqual(weave.systemPrompt, undefined);
+    });
+  });
+
+  describe('weave() — backward compatibility', () => {
+    let tmpDir: string;
+
+    beforeEach(() => {
+      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-test-'));
+    });
+
+    afterEach(() => {
+      clearGuild();
+      fs.rmSync(tmpDir, { recursive: true, force: true });
+    });
+
+    it('returns systemPrompt: undefined, tools: undefined, environment: undefined with no content', async () => {
+      setupGuild({ home: tmpDir });
+      const api = startLoom();
+      const weave = await api.weave({});
+      assert.strictEqual(weave.systemPrompt, undefined);
+      assert.strictEqual(weave.tools, undefined);
+      assert.strictEqual(weave.environment, undefined);
+    });
+
+    it('tool resolution and git identity are unaffected by composition logic', async () => {
+      const rolesDir = path.join(tmpDir, 'roles');
+      fs.mkdirSync(rolesDir);
+      fs.writeFileSync(path.join(rolesDir, 'artificer.md'), 'Role text');
+
+      const readTool = testTool('stack-query', 'read');
+      const resolved: ResolvedTool[] = [{ definition: readTool, pluginId: 'stacks' }];
+      const { api: instrumentarium } = mockInstrumentarium(resolved);
+
+      setupGuild({
+        home: tmpDir,
+        loomConfig: { roles: { artificer: { permissions: ['stacks:read'] } } },
+        apparatuses: { tools: instrumentarium },
+      });
+      const api = startLoom();
+      const weave = await api.weave({ role: 'artificer' });
+
+      assert.equal(weave.tools?.length, 1);
+      assert.equal(weave.tools?.[0]?.definition.name, 'stack-query');
+      assert.deepStrictEqual(weave.environment, {
+        GIT_AUTHOR_NAME: 'Artificer',
+        GIT_AUTHOR_EMAIL: 'artificer@nexus.local',
+      });
+    });
+  });
 });
diff --git a/packages/plugins/loom/src/loom.ts b/packages/plugins/loom/src/loom.ts
index f653ad2..1078c64 100644
--- a/packages/plugins/loom/src/loom.ts
+++ b/packages/plugins/loom/src/loom.ts
@@ -18,6 +18,8 @@
 import type { Plugin, StartupContext } from '@shardworks/nexus-core';
 import { guild } from '@shardworks/nexus-core';
 import type { InstrumentariumApi, ResolvedTool } from '@shardworks/tools-apparatus';
+import fs from 'node:fs';
+import path from 'node:path';
 
 // ── Public types ──────────────────────────────────────────────────────
 
@@ -42,7 +44,11 @@ export interface WeaveRequest {
  * prompt is not part of the weave — it goes directly to the Animator.
  */
 export interface AnimaWeave {
-  /** The system prompt for the AI process. Undefined until composition is implemented. */
+  /**
+   * The system prompt for the AI process. Composed from guild charter,
+   * tool instructions, and role instructions. Undefined when no
+   * composition layers produce content.
+   */
   systemPrompt?: string;
   /** The resolved tool set for this role. Undefined when no role is specified or no tools match. */
   tools?: ResolvedTool[];
@@ -56,9 +62,9 @@ export interface LoomApi {
    * Weave an anima's session context.
    *
    * Given a role name, produces an AnimaWeave containing the composed
-   * system prompt and the resolved tool set. System prompt composition
-   * (charter, curricula, temperament, role instructions) is future work —
-   * systemPrompt remains undefined until then.
+   * system prompt and the resolved tool set. The system prompt is assembled
+   * from the guild charter, tool instructions (for the resolved tool set),
+   * and role instructions — in that order.
    *
    * Tool resolution is active: if a role is provided and the Instrumentarium
    * is installed, the Loom resolves role → permissions → tools.
@@ -96,6 +102,8 @@ export interface LoomConfig {
  */
 export function createLoom(): Plugin {
   let config: LoomConfig = {};
+  let charterContent: string | undefined;
+  let roleInstructions: Map<string, string> = new Map();
 
   const api: LoomApi = {
     async weave(request: WeaveRequest): Promise<AnimaWeave> {
@@ -129,8 +137,30 @@ export function createLoom(): Plugin {
         };
       }
 
-      // Future: compose system prompt from charter + curriculum +
-      // temperament + role instructions + tool instructions.
+      // Compose system prompt from available layers: charter → tool instructions → role instructions.
+      const layers: string[] = [];
+
+      if (charterContent) {
+        layers.push(charterContent);
+      }
+
+      if (weave.tools && weave.tools.length > 0) {
+        for (const resolvedTool of weave.tools) {
+          const instructions = resolvedTool.definition.instructions;
+          if (instructions) {
+            layers.push(`## Tool: ${resolvedTool.definition.name}\n\n${instructions}`);
+          }
+        }
+      }
+
+      if (request.role && roleInstructions.has(request.role)) {
+        layers.push(roleInstructions.get(request.role)!);
+      }
+
+      if (layers.length > 0) {
+        weave.systemPrompt = layers.join('\n\n');
+      }
+
       return weave;
     },
   };
@@ -143,6 +173,49 @@ export function createLoom(): Plugin {
       start(_ctx: StartupContext): void {
         const g = guild();
         config = g.guildConfig().loom ?? {};
+        const home = g.home;
+
+        // Read charter content at startup and cache it.
+        charterContent = undefined;
+        const charterFilePath = path.join(home, 'charter.md');
+        try {
+          charterContent = fs.readFileSync(charterFilePath, 'utf-8');
+        } catch (err: unknown) {
+          if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
+          // No charter.md — check for charter/ directory.
+          const charterDir = path.join(home, 'charter');
+          try {
+            const stat = fs.statSync(charterDir);
+            if (stat.isDirectory()) {
+              const mdFiles = fs.readdirSync(charterDir)
+                .filter(f => f.endsWith('.md'))
+                .sort();
+              if (mdFiles.length > 0) {
+                charterContent = mdFiles
+                  .map(f => fs.readFileSync(path.join(charterDir, f), 'utf-8'))
+                  .join('\n\n');
+              }
+            }
+          } catch {
+            // No charter/ directory either — silently omit.
+          }
+        }
+
+        // Read role instruction files at startup for all configured roles.
+        roleInstructions = new Map();
+        if (config.roles) {
+          for (const roleName of Object.keys(config.roles)) {
+            const rolePath = path.join(home, 'roles', `${roleName}.md`);
+            try {
+              const content = fs.readFileSync(rolePath, 'utf-8');
+              if (content) {
+                roleInstructions.set(roleName, content);
+              }
+            } catch {
+              // File doesn't exist — silently omit.
+            }
+          }
+        }
       },
     },
   };

```

## Full File Contents (for context)

=== FILE: docs/architecture/apparatus/loom.md ===
# The Loom — API Contract

Status: **Active — Layers 1, 4, 5**

Package: `@shardworks/loom-apparatus` · Plugin id: `loom`

---

## Purpose

The Loom weaves anima identity into session contexts. Given a role name, it produces an `AnimaWeave` — the composed identity context that The Animator uses to launch a session. The work prompt (what the anima should do) is not the Loom's concern — it bypasses the Loom and goes directly from the caller to the session provider.

System prompt composition is active for layers 1 (guild charter), 4 (role instructions), and 5 (tool instructions). The Loom reads charter and role instruction files at startup and caches them; tool instructions come from the Instrumentarium's pre-loaded tool definitions. Layers 2 (curriculum) and 3 (temperament) remain future work.

---

## Dependencies

```
requires: ['tools']    — needs the Instrumentarium for tool resolution and tool instructions
```

---

## `LoomApi` Interface (`provides`)

```typescript
interface LoomApi {
  /**
   * Weave an anima's session context.
   *
   * Given a role name, produces an AnimaWeave with a composed system prompt,
   * resolved tool set, and git identity environment variables.
   */
  weave(request: WeaveRequest): Promise<AnimaWeave>
}

interface WeaveRequest {
  /**
   * The role to weave context for (e.g. 'artificer', 'scribe').
   * Determines tool resolution and role instructions. When omitted,
   * only charter content is included in the system prompt.
   */
  role?: string
}

/**
 * The output of The Loom's weave() — the composed anima identity context.
 * Contains the system prompt, resolved tool set, and environment variables.
 * The work prompt is not part of the weave.
 */
interface AnimaWeave {
  /**
   * The system prompt for the AI process. Composed from guild charter,
   * tool instructions, and role instructions. Undefined when no
   * composition layers produce content.
   */
  systemPrompt?: string
  /** The resolved tool set for this role. Undefined when no role is specified or no tools match. */
  tools?: ResolvedTool[]
  /**
   * Environment variables for the session process.
   * Derived from role configuration. The Animator merges these with
   * any per-request environment overrides (request overrides weave).
   *
   * Default: git identity derived from the role name.
   *   GIT_AUTHOR_NAME = capitalized role (e.g. "Artificer")
   *   GIT_AUTHOR_EMAIL = role@nexus.local
   */
  environment?: Record<string, string>
}
```

The `environment` field is active at MVP: the Loom derives git identity from the role name and populates `GIT_AUTHOR_NAME` and `GIT_AUTHOR_EMAIL`. The committer identity is intentionally left to the system default so that commit signatures remain verified on GitHub. The Animator merges these into the spawned process environment, giving each role a distinct author identity. Orchestrators (e.g. the Dispatch) can override specific variables per-request — for example, setting the email to a writ ID for per-commission attribution.

---

## What The Loom does NOT do

- **Compose curricula or temperaments** — layers 2 and 3 remain future work.
- **Look up anima identity** — no identity records exist yet.
- **Handle work prompts** — the work prompt bypasses the Loom entirely.
- **Launch sessions** — that's The Animator's job.

---

## Future: Full Composition

When the session infrastructure matures, The Loom becomes the system's composition engine. The API shape (`weave(request) → AnimaWeave`) remains stable; the request may gain fields and the internals gain logic.

### Future `WeaveRequest`

```typescript
interface WeaveRequest {
  /** The role to compose for. Determines tool set and role instructions. */
  role: string
  /** Optional anima id. Resolves identity → curriculum → temperament. */
  animaId?: string
  /** Optional writ id. The Loom reads writ context from The Stacks. */
  writId?: string
}
```

### Future `AnimaWeave`

```typescript
interface AnimaWeave {
  systemPrompt: string
  /** The resolved tool set for this role. */
  tools: ResolvedTool[]
  /** Environment variables for the session process. */
  environment?: Record<string, string>
  /** The role this context was woven for. */
  role: string
}
```

### Composition order

The system prompt is woven by combining active layers in order:

1. **Guild charter** ✅ active — `charter.md` or `charter/*.md` at the guild root
2. **Curriculum** — future work (what the anima knows)
3. **Temperament** — future work (who the anima is)
4. **Role instructions** ✅ active — `roles/{role}.md` relative to the guild root
5. **Tool instructions** ✅ active — `definition.instructions` from resolved tools, formatted as `## Tool: {name}`
6. **Writ context** — future work (the specific work being done)

### Future: System Prompt Appendix

The legacy session system supports a `systemPromptAppendix` — additional content appended to the system prompt after manifest assembly. This is used by clockworks to inject session protocol (e.g. writ completion requirements) without modifying the manifest itself.

**Open question:** Does this belong in The Loom or in the caller? Two options:

1. **Loom owns it** — `WeaveRequest` gains an `appendix?: string` field. The Loom appends it after composing the system prompt. Clean: all prompt assembly happens in one place.
2. **Caller owns it** — the caller (summon relay) concatenates the appendix to `AnimaWeave.systemPrompt` before passing to The Animator. Simple: no Loom changes needed.

The answer depends on whether the appendix is a *composition concern* (part of building the prompt) or a *dispatch concern* (context that only the caller knows). Writ protocol feels like dispatch — the Loom shouldn't need to know about writ lifecycle. But if other appendix use cases emerge (e.g. guild-wide policies injected per-session), it may belong in the Loom.

No decision required for MVP — the appendix feature is not needed until clockworks-driven sessions exist.

### Role Ownership and Permission Grants

The Loom is the owner of role definitions. Roles map to permission grants that the Instrumentarium uses to resolve tool sets. Role configuration lives in `guild.json` under the Loom's plugin id:

```json
{
  "loom": {
    "roles": {
      "artificer": {
        "permissions": ["stdlib:read", "stdlib:write", "stacks:read", "stacks:write"],
        "strict": false
      },
      "scribe": {
        "permissions": ["stdlib:read", "animator:read"],
        "strict": true
      },
      "admin": {
        "permissions": ["*:*"]
      }
    }
  }
}
```

Each role definition contains:

- **`permissions`** — an array of `plugin:level` grant strings. The Instrumentarium uses these to resolve which tools are available. See [The Instrumentarium § Permission Model](./instrumentarium.md#permission-model) for grant format and matching rules.
- **`strict`** (optional, default `false`) — when true, permissionless tools are excluded unless the role has `plugin:*` or `*:*` for that tool's plugin. Useful for locked-down roles that should only see explicitly granted tools.

The Loom resolves an anima's assigned roles into a flat permissions array (union across all roles), then passes it to `instrumentarium.resolve()` with `caller: 'anima'` — since the Loom only weaves anima sessions, this is a constant, not a parameter. The Instrumentarium is role-agnostic — it never sees role names, only permissions.

The resolved tool set is returned on the `AnimaWeave` so the Animator can pass it to the session provider for MCP server configuration. The Loom also reads each resolved tool's `instructions.md` and weaves them into the system prompt (see [Future composition order](#future-composition-order)).

### Future dependencies

```
requires: ['stacks', 'tools']
```

- **The Stacks** — reads anima identity records, writ context
- **The Instrumentarium** — resolves the permission-gated tool set and reads tool instructions

=== FILE: docs/architecture/index.md ===
# Nexus Architecture

**Nexus** is a framework for running an autonomous workforce of *animas* — AI agents who produce work in service of a guild, which ultimately delivers those works to a human patron. This is a technical document which describes the system itself — the structures, concepts, and machinery that any guild requires. It is meant to assist Nexus developers in their work, or provide users deeper insight into the workings of their guild. It is not intended as a general user guide for people who just want to run a guild.

For the conceptual vocabulary — what guilds, animas, commissions, writs, and apparatus *are* in the abstract — read [The Guild Metaphor](../guild-metaphor.md) first. This document describes how those concepts are implemented.

---

## System at a Glance

> This section describes the **standard guild** — the configuration `nsg init` produces. The framework itself is a plugin loader; every apparatus named below is part of the default plugin set, not a hard requirement. §4 ([Plugin Architecture](#plugin-architecture)) explains the underlying model; the [Standard Guild](#the-standard-guild) section catalogues what the default set includes.

A Nexus guild is a git repository with a `guild.json` at its root and a `.nexus/` directory holding runtime state. When the system starts, **Arbor** — the guild runtime — reads `guild.json`, loads the declared plugins, validates their dependencies, and starts each apparatus in order. From that point, the guild operates: the patron commissions work; **The Clerk** receives it and issues writs; **The Spider** assembles rigs and drives their engines to completion; **The Clockworks** turns events into action, activating relays in response to standing orders; and **anima sessions** — AI processes launched by **The Animator** — do the work that requires judgment. Results land in codexes and documents; the patron consumes what the guild delivers.

```
  PATRON
    │  commission                                        ▲  works
    ▼                                                    │
  ┌──────────────────────────────────────────────────────┴──────┐
  │  Guild  (guild.json + .nexus/)                               │
  │                                                              │
  │  ┌───────────────────────────────────────────────────────┐  │
  │  │  Arbor  —  runtime · plugin loader · lifecycle        │  │
  │  ├───────────────────────────────────────────────────────┤  │
  │  │  Stacks (persistence)                                 │  │
  │  ├───────────────────────────────────────────────────────┤  │
  │  │  Clockworks · Surveyor · Clerk                        │  │
  │  ├───────────────────────────────────────────────────────┤  │
  │  │  Spider · Fabricator · Executor                        │  │
  │  │  Loom · Animator                                      │  │
  │  └─────────────────────────┬─────────────────────────────┘  │
  │                            │                                 │
  │  Anima Sessions  ◄─────────┘                                │
  │  AI process · MCP server · permission-gated tools                 │
  │                   │                                          │
  │  Works  ◄─────────┘                                         │
  │  codexes · documents · yields                               │
  └──────────────────────────────────────────────────────────────┘
```

### Patron

The patron is the human outside the system. They commission work and consume what the guild delivers — and that is the full extent of their participation. The patron does not assign animas, orchestrate apparatus, or direct how labor is organized. The interface is intentionally narrow: commission in, works out. What happens in the guild to convert one to the other is the guild's concern.

### The Guild

Physically, a guild is a directory. Its configuration root is `guild.json` — a single file that declares the guild's name, the plugins it has installed, its anima roles, and the standing orders that govern its reactive behavior. Everything the guild *is* lives in that file and the versioned content alongside it. Runtime activity — the persistence database, daemon state, active worktrees — accumulates in `.nexus/`, which is gitignored. The guild's identity is versioned; its running state is not.

### Arbor

Arbor is the guild runtime. Its single entry point, `createGuild()`, reads `guild.json`, imports every declared plugin, validates the dependency graph, starts each apparatus in dependency order, and wires the `guild()` singleton. It is not a persistent server or a central process — it is a library that each entry point (the CLI, the MCP server, the Clockworks daemon) calls once at startup. There is no Arbor "service" to connect to; the `Guild` object it returns is alive for as long as the process that created it is running.

Arbor's scope is deliberately narrow: plugin loading, dependency validation, and apparatus lifecycle. It does not own tool discovery (that belongs to The Instrumentarium), persistence (that belongs to The Stacks), or any CLI commands.

### The CLI

The `nsg` command is the patron's and operator's entry point into the guild. It has two layers of commands:

**Framework commands** are defined in the CLI package itself — guild lifecycle (`init`, `status`, `version`, `upgrade`) and plugin management (`plugin list/install/remove`). These are always available, even without a guild.

**Plugin tools** are discovered dynamically from **The Instrumentarium** (the `tools` apparatus). At startup, the CLI calls `createGuild()` to boot the runtime, then queries the Instrumentarium for all installed tools that are CLI-callable. Each tool's Zod param schema is auto-converted to Commander flags. This means the plugin tool surface grows automatically as plugins are installed — `nsg --help` always reflects exactly what's available.

Tool names are auto-grouped by hyphen prefix — `session-list` and `session-show` become `nsg session list` and `nsg session show`.

Two additional commands bypass the tool registry: `nsg consult` and `nsg convene` (interactive sessions with streaming output — not simple tool invocations). These are built into the v1 CLI and will migrate when the Animator and Parlour expose the necessary APIs.

### The Apparatus

The guild's operational fabric is provided by apparatus — plugins with a start/stop lifecycle that Arbor starts in dependency order. **The Stacks** is the persistence substrate everything else reads from and writes to. **The Scriptorium** manages codexes — bare clones, draft bindings (worktrees), and the seal-and-push lifecycle. **The Clockworks** is the event-driven nervous system: standing orders bind events to relays, and the summon relay dispatches anima sessions in response. **The Surveyor** tracks what work applies to each registered codex. **The Clerk** handles commission intake, converting patron requests into writs and signaling when work is ready to execute. The Fabricator, Spider, Executor, Loom, and Animator then take it from there — covered in the next section.

Each of these is a plugin from the default set, not a built-in. The [Standard Guild](#the-standard-guild) section lists them; the sections that follow document each in detail.

### Execution, Sessions, and Works

When The Clerk signals a writ is ready, **The Spider** spawns a rig and begins driving it: traversing active engines, dispatching those whose upstream work is complete, and extending the rig by querying **The Fabricator** for engine chains that satisfy declared needs. **The Executor** runs each engine — clockwork engines run their code directly; quick engines launch an anima session.

An anima session is an AI process running against an MCP server loaded with the role's tools. Before launch, **The Loom** weaves the session context: system prompt, tool instructions, writ context. **The Animator** then starts the process, monitors it, and records the result. The session exits; the output persists. The Clockworks can also trigger sessions directly via the summon relay, bypassing the rig machinery entirely — The Animator handles both paths the same way.

Session output is concrete: modified files committed to a git branch, new documents written to disk, structured data passed as engine yields to downstream steps. When a rig completes, any pending git work is merged, and the result is whatever the patron commissioned — a working feature, a fixed bug, a written report. The patron's codexes are updated; the patron can pull, deploy, and use them.

---

## The Guild Root

A guild is a directory — a regular git repository with a `guild.json` at its root. The framework discovers the guild root the same way git discovers `.git/`: by walking up from the current working directory until it finds `guild.json`. The `--guild-root` flag overrides this for explicit invocation.

### Directory Structure

```
GUILD_ROOT/
  guild.json                    ← central configuration (versioned)
  package.json                  ← npm package; plugins are npm dependencies
  package-lock.json
  node_modules/                 ← gitignored; plugin code lives here
  <guild content>/              ← versioned guild files (roles/, training/,
                                   tools/, engines/, etc.) — structure is
                                   guild-specific, not framework-prescribed
  .nexus/                       ← runtime state, gitignored
    nexus.db                    ← persistence database (SQLite)
    clock.pid                   ← Clockworks daemon PID
    clock.log                   ← Clockworks daemon log
    sessions/                   ← per-session working files
    codexes/                    ← bare git clones of registered codexes
    worktrees/                  ← git worktrees for active draft bindings
```

The versioned files — `guild.json`, `package.json`, and the guild's own content — are the guild's identity. `.nexus/` is operational territory: it can be deleted and rebuilt without losing configuration. Nothing in `.nexus/` is committed; everything that matters is in the versioned files.

### `guild.json`

`guild.json` is the guild's central configuration file. Arbor reads it at startup; nothing in the guild system runs without it. It has a small number of framework-level keys that Arbor reads directly, plus any number of **plugin configuration sections** — top-level keys owned by individual plugins, keyed by their derived plugin id.

```json
{
  "name": "my-guild",
  "nexus": "0.1.x",
  "plugins": ["books", "clockworks", "sessions", "..."],
  "settings": {
    "model": "claude-opus-4-5"
  },

  "clockworks": {
    "events": {
      "craft.question": { "description": "An artificer hit a decision outside commission scope." }
    },
    "standingOrders": [
      { "on": "writ.ready",            "run": "draft-prepare" },
      { "on": "writ.workspace-ready",  "summon": "artificer", "prompt": "..." },
      { "on": "writ.completed",        "run": "draft-seal" }
    ]
  }
}
```

#### Framework keys

**`name`** — the guild's identifier, used as the npm package name for the guild's own content package.

**`nexus`** — the installed framework version. Written by `nsg init` and `nsg upgrade`; not edited by hand.

**`plugins`** — ordered list of installed plugin ids. Arbor loads them in this order, respecting the dependency graph. `nsg install` and `nsg remove` manage this list. Starts empty on `nsg init`; the standard guild adds the default set.

**`settings`** — operational configuration. Currently holds `model` (the default LLM model for anima sessions) and `autoMigrate` (whether to apply database migrations automatically on startup).

#### Plugin configuration

All remaining top-level keys are plugin configuration sections, keyed by derived plugin id (see [Plugin IDs](#plugin-ids)). Each plugin reads its own section via `guild().config(pluginId)` at startup or handler invocation time.

In the standard guild, `clockworks` contains events and standing orders; `codexes` tracks registered repositories and draft settings; `loom` holds role definitions and permission grants. These are all plugin config — not framework-owned fields — they get natural short keys because of the `@shardworks/` naming convention and `-(plugin|apparatus|kit)` suffix stripping (e.g. `@shardworks/tools-apparatus` → `tools`). See [Configuration](plugins.md#configuration) for the full model.

### Runtime State (`.nexus/`)

`.nexus/` is entirely gitignored. It is created on first run and can be deleted safely — the guild will rebuild it from `guild.json` and the versioned content files.

**`nexus.db`** — the SQLite database owned by The Stacks. All guild state that needs to survive process restarts lives here: anima records, writ history, session records, event and dispatch logs.

**`clock.pid` / `clock.log`** — daemon bookkeeping for The Clockworks. `clock.pid` holds the PID of the running daemon process; `clock.log` is its output. Both are absent when the daemon is not running.

**`sessions/`** — working files for active and recently-completed sessions. Each session gets a JSON record here at launch; The Animator writes the result back when the session exits.

**`codexes/`** — bare git clones of every registered codex, named `<codex-name>.git`. Managed by The Scriptorium. Draft worktrees are checked out from these clones rather than from the remotes directly, keeping network operations to `fetch` calls rather than repeated clones.

**`worktrees/`** — git worktrees for active draft bindings. Each draft gets a dedicated worktree here, isolated from other concurrent work. Drafts are opened when work begins and sealed or abandoned when the work completes. See [The Scriptorium](apparatus/scriptorium.md).

---

## Plugin Architecture

The apparatus described in §2 — The Stacks, The Clockworks, The Clerk, The Spider, and the rest — are all plugins. There is no privileged built-in layer. Arbor, the guild runtime, is only a plugin loader, a dependency graph, and the startup/shutdown lifecycle for what gets loaded. Every piece of operational infrastructure is contributed by a plugin package; the standard guild is simply a particular set of those packages.

Plugins come in two kinds: **kits** and **apparatus**. This section introduces them; [Plugin Architecture](plugins.md) is the full specification.

### Kit

A **kit** is a passive package contributing capabilities to the guild. Kits have no lifecycle — they are read at load time and their contributions are forwarded to consuming apparatus. Nothing about a kit participates in `start`/`stop` or requires a running system.

```typescript
// @shardworks/nexus-git — a kit contributing git-related tools, engines, and relays
export default {
  kit: {
    requires:   ["books"],
    recommends: ["clockworks", "spider"],
    engines: [createBranchEngine, mergeBranchEngine],
    relays:  [onMergeRelay],
    tools:   [statusTool, diffTool],
  },
} satisfies Plugin
```

A kit is an **open record**: the contribution fields (`engines`, `relays`, `tools`, etc.) are defined by the apparatus packages that consume them, not by the framework. The framework only reads `requires` (hard dependency on an apparatus — validated at startup) and `recommends` (advisory — generates a startup warning if absent). Everything else is forwarded opaquely to consuming apparatus via the `plugin:initialized` lifecycle event.

Type safety for contribution fields is opt-in — each apparatus publishes a kit interface (`ClockworksKit`, `SpiderKit`, etc.) that kit authors can import and `satisfies` against.

### Apparatus

An **apparatus** is a package contributing persistent running infrastructure. It has a `start`/`stop` lifecycle, may declare dependencies on other apparatus, and may expose a runtime API.

```typescript
// @shardworks/clockworks — the guild's event-driven nervous system
const clockworksApi: ClockworksApi = { ... }

export default {
  apparatus: {
    requires: ["books"],
    provides: clockworksApi,

    start: (ctx) => {
      const books = guild().apparatus<BooksApi>("books")
      clockworksApi.init(books)
    },
    stop: () => clockworksApi.shutdown(),

    supportKit: {
      relays: [signalRelay, drainRelay],
      tools:  [signalTool, clockStatusTool],
    },

    consumes: ["relays"],
  },
} satisfies Plugin
```

**`requires`** declares apparatus that must be started first — validated at startup, determines start ordering. **`provides`** is the runtime API other plugins retrieve via `guild().apparatus<T>(name)`. **`supportKit`** is the apparatus's own kit contributions (tools, relays, etc.) — treated identically to standalone kit contributions by consumers. **`consumes`** declares which kit contribution types this apparatus scans for, enabling startup warnings when kits contribute types no apparatus consumes.

### Plugin IDs

Plugin names are never declared in the manifest — they are derived from the npm package name at load time:

1. Strip the `@shardworks/` scope (the official Nexus namespace)
2. Retain other scopes as a prefix without `@` (`@acme/foo` → `acme/foo`)
3. Strip a trailing `-(plugin|apparatus|kit)` suffix

So `@shardworks/clockworks` → `clockworks`, `@shardworks/books-apparatus` → `books`, `@acme/cache-kit` → `acme/cache`. Plugin ids are used in `requires` arrays, `guild().apparatus()` calls, and as the key for plugin-specific configuration in `guild.json`. See [Plugin IDs](plugins.md#plugin-ids) for the full derivation table.

### Arbor and Contexts

**Arbor** is the runtime object. It reads `guild.json`, imports all declared plugins, validates the dependency graph, and starts each apparatus in dependency-resolved order. The CLI, MCP server, and Clockworks daemon each create one Arbor instance at startup; it lives for the process's lifetime.

All plugin code — apparatus `start()`, tool handlers, CDC handlers — accesses guild infrastructure through the **`guild()` singleton** from `@shardworks/nexus-core`. It provides access to apparatus APIs, plugin config, the guild root path, and the loaded plugin graph. Apparatus `start(ctx)` additionally receives a **`StartupContext`** for subscribing to lifecycle events via `ctx.on()`.

Startup validation is strict: missing dependencies and circular dependency graphs fail loudly before any apparatus starts. Kit contributions are forwarded to consuming apparatus reactively via the `plugin:initialized` lifecycle event. See [Plugin Architecture](plugins.md) for the full specification, including the [guild() singleton](plugins.md#the-guild-accessor), [StartupContext](plugins.md#startupcontext), and [Configuration](plugins.md#configuration).

### Installation

Plugins are listed in `guild.json` by their plugin id. The framework determines whether each is a kit or apparatus at load time from the package manifest — no user-side declaration needed.

```json
{
  "plugins": ["books", "clockworks", "spider", "sessions", "nexus-git"]
}
```

```sh
nsg install nexus-git     # add a plugin
nsg remove  nexus-git     # remove a plugin
nsg status                # show apparatus health + kit inventory
```

`nsg init` populates the default plugin set for a new guild.

---

## The Standard Guild

The plugin architecture described above is general-purpose: any guild can install any combination of kits and apparatus. In practice, nearly every guild uses the same foundational set — the apparatus and kits that `nsg init` installs by default. The sections that follow document this standard configuration.

Each section introduces one or more apparatus or kits from the default set. Understanding that they are plugins — replaceable, independently testable, authored against the same contracts as any community extension — is the main thing §4 provides. The remaining sections don't repeat it.

### Default Apparatus

| Apparatus | Plugin id | Function |
|-----------|-----------|----------|
| **The Stacks** | `books` | Persistence substrate — SQLite-backed document store and change-data-capture events |
| **The Scriptorium** | `codexes` | Codex management — repository registry, bare clones, draft binding lifecycle, sealing and push |
| **The Clockworks** | `clockworks` | Event-driven nervous system — standing orders, event queue, the summon relay |
| **The Surveyor** | `surveyor` | Codex knowledge — surveys registered codexes so the guild knows what work applies to each |
| **The Clerk** | `clerk` | Commission intake and writ lifecycle — receives commissions, creates writs, signals when work is ready |
| **The Loom** | `loom` | Session context composition — weaves role instructions, tool instructions, curricula, and temperaments into a session context |
| **The Instrumentarium** | `tools` | Tool registry — resolves installed tools, permission-gated tool sets |
| **The Animator** | `animator` | Session lifecycle — launches, monitors, and records anima sessions |
| **The Fabricator** | `fabricator` | Engine design registry — answers "what engine chain satisfies this need?" from installed kits |
| **The Spider** | `spider` | Rig lifecycle — spawns, traverses, extends, and strikes rigs as work progresses |
| **The Executor** | `executor` | Engine runner — executes clockwork and quick engines against a configured substrate |

### Default Kits

| Kit | Contributes |
|-----|-------------|
| **nexus-stdlib** | Base tools (commission-create, tool-install, anima-create, signal, writ/session CRUD, etc.) and the summon relay |
| **clockworks** (supportKit) | Clockworks tools (clock-start, clock-stop, clock-status, event-list, signal) |
| **sessions** (supportKit) | Session tools (session-list, session-show, conversation-list) |

> **Note:** The list above is provisional. The standard guild configuration is still being finalized as individual apparatus are built out. Some entries listed as apparatus are not yet implemented as separate packages — see [What's Implemented vs. Aspirational](_agent-context.md#whats-implemented-vs-aspirational) for the current state. Treat this as a working inventory, not a commitment.

---

## The Books

**The Stacks** (plugin id: `books`) is the guild's persistence layer — a document store backed by SQLite at `.nexus/nexus.db`, with change data capture (CDC) as its primary integration mechanism.

### Document Model

The Stacks stores JSON documents in named collections called **books**. Every document must include an `id: string` field; the framework adds nothing else — no envelopes, timestamps, or revision tracking. Domain types own their own fields.

Plugins declare the books they need via a `books` contribution field in their kit export:

```typescript
export default {
  kit: {
    requires: ['stacks'],
    books: {
      writs:    { indexes: ['status', 'createdAt', 'parent.id'] },
      sessions: { indexes: ['writId', 'startedAt', 'animaId'] },
    },
  },
} satisfies Plugin
```

The Stacks reads these declarations at startup and creates or reconciles the backing tables. Schema changes are additive only — new books and indexes are safe; nothing is dropped automatically.

### API Surface

Plugins access persistence through `guild().apparatus<StacksApi>('stacks')`, which exposes four methods:

- **`book<T>(ownerId, name)`** — returns a writable handle for the named book. Supports `put()` (upsert), `patch()` (top-level field merge), `delete()`, and the full read API (`get`, `find`, `list`, `count`). Queries support equality, range, pattern matching (`LIKE`), set membership (`IN`), null checks, multi-field sorting, and offset/limit pagination.

- **`readBook<T>(ownerId, name)`** — returns a read-only handle for another plugin's book. Cross-plugin writes are not supported; they go through the owning plugin's tools.

- **`watch(ownerId, bookName, handler, options?)`** — registers a CDC handler that fires on every write to the named book. CDC events carry the document's previous state (`prev`) for updates and deletes, enabling diff-based logic.

- **`transaction(fn)`** — executes a function within an atomic transaction. All writes inside `fn` commit or roll back together. Reads inside the transaction see uncommitted writes (read-your-writes).

### Change Data Capture

All writes go through The Stacks API — there is no raw SQL escape hatch. This is what makes CDC reliable: if the API is the only write path, the event stream is complete.

CDC handlers execute in two phases:

**Phase 1 (cascade)** — runs inside the transaction, before commit. The handler's writes join the same atomic unit. If the handler throws, everything rolls back — the triggering write, the handler's writes, and all nested cascades. This is the correct phase for maintaining referential integrity (e.g. cancelling child writs when a parent is cancelled).

**Phase 2 (notification)** — runs after the transaction commits. Data is already persisted. Handler failures are logged as warnings but cannot affect committed data. This is the correct phase for external notifications like Clockworks event emission.

Within a transaction, multiple writes to the same document are coalesced into a single CDC event reflecting the net change. External observers never see intermediate states.

### Backend

The Stacks depends on a `StacksBackend` interface, not SQLite directly. The default implementation uses SQLite via `better-sqlite3`; alternative backends (in-memory for tests, libSQL for edge) implement the same interface. No SQLite types leak into the public API.

See [The Stacks — API Contract](apparatus/stacks.md) for the full specification: complete type signatures, query language, transaction semantics, coalescing rules, use case coverage matrix, and backend interface.

---

## Animas

<!-- TODO: Identity and composition. An anima = name + curriculum + temperament + role assignments. Composition model: curriculum (what you know), temperament (who you are) — both versioned, immutable per version. The Loom weaves them at session time. Anima states: active / retired. MVP: no identity layer; The Loom returns a fixed composition per role. Link to forthcoming anima-composition.md. -->

---

## Work Model

<!-- TODO: The obligation pipeline. Commission (patron's request) → Mandate writ (guild's formal record, created by Clerk) → child writs as the guild decomposes the work → Rigs as the execution scaffolding for a writ. Writ lifecycle (ready → active → pending → completed/failed/cancelled). Writ hierarchy and completion rollup. Brief intro to rigs (assembled by Spider from engine designs contributed by kits via Fabricator). Link to rigging.md for rig execution detail. -->

---

## Kit Components: Tools, Engines & Relays

Kits contribute three kinds of installable artifacts. All three follow the same packaging pattern — a descriptor file, an entry point, and a registration entry — but they serve different roles in the guild.

### Tools

**Tools** are instruments animas wield during work. A tool is a handler with a defined contract (inputs in, structured result out), accessible through three paths:

- **MCP** — animas invoke tools as typed MCP calls during sessions. The framework launches a single MCP engine per session loaded with the anima's permitted tools.
- **CLI** — humans invoke tools via `nsg` subcommands.
- **Import** — engines, relays, and other tools can import handlers programmatically.

All three paths execute the same logic. Tool authors write the handler once using the `tool()` SDK factory from `@shardworks/tools-apparatus`, which wraps a Zod schema and handler function into a `ToolDefinition`:

```typescript
export default tool({
  description: "Look up an anima by name",
  params: { name: z.string() },
  handler: async ({ name }, ctx) => { ... },
})
```

Tools can be TypeScript modules or plain scripts (bash, Python, any executable). Script tools need no SDK — a one-line descriptor and an executable is enough. The framework infers the kind from the file extension.

**Permission gating:** Tools may declare a `permission` level (e.g. `'read'`, `'write'`, `'admin'`). Roles grant permission strings in `plugin:level` format (with wildcard support). The Loom resolves an anima's roles into a flat permissions array; the Instrumentarium matches those grants against each tool's declared permission to resolve the available set. Tools without a `permission` field are permissionless — included by default, or gated in strict mode.

**Instructions:** A tool can optionally ship with an `instructions.md` — a teaching document delivered to the anima as part of its system prompt. Instructions provide craft guidance (when to use the tool, when not to, workflow context) that MCP's schema metadata cannot convey.

### Engines

**Engines** are the workhorse components of rigs — bounded units of work the Spider mounts and sets in motion. An engine runs when its upstream dependencies (givens) are satisfied and produces yields when done. Two kinds:

- **Clockwork** — deterministic, no AI. Runs its code directly against the configured substrate.
- **Quick** — inhabited by an anima for work requiring judgment. The engine defines the work context; the anima brings the skill.

Kits contribute engine designs; the Spider draws on them (via The Fabricator) to extend rigs as work progresses. Engines are not role-gated — they are not wielded by animas directly; they are the work context an anima staffs.

### Relays

**Relays** are Clockworks handlers — purpose-built to respond to events via standing orders. A relay exports a standard `relay()` contract that the Clockworks runner calls when a matching event fires. All relays are clockwork (no anima involvement). The built-in **summon relay** is the mechanism that dispatches anima sessions in response to standing orders.

### Comparison

| | Tools | Engines | Relays |
|---|---|---|---|
| **Purpose** | Instruments animas wield | Rig workhorses | Clockworks event handlers |
| **Invoked by** | Animas (MCP), humans (CLI), code | Spider (within a rig) | Clockworks runner (standing order) |
| **Role gating?** | Yes | No | No |
| **Instructions?** | Optional | No | No |
| **Clockwork or quick?** | Neither (runs on demand) | Either | Always clockwork |

See [Kit Components](kit-components.md) for the full specification: descriptor schemas, on-disk layout, installation mechanics, the MCP engine, and local development workflow.

---

## Sessions

A **session** is a single AI process doing work. It is the fundamental unit of labor in the guild — every anima interaction, whether launched by a standing order or started interactively from the CLI, is a session. Three apparatus collaborate to make a session happen: **The Loom** composes the context, **The Animator** launches the process and records the result, and (when available) **The Instrumentarium** resolves the tools the anima can wield.

### The Session Funnel

Every session passes through the same funnel regardless of how it was triggered:

```
  Trigger (summon relay / nsg consult / nsg convene)
    │
    ├─ 1. Weave context  (The Loom)
    │     system prompt: charter + tool instructions + role instructions
    │     future: + curriculum + temperament
    │
    ├─ 2. Launch process  (The Animator → Session Provider)
    │     AI process starts in a working directory
    │     MCP tool server attached (future: when Instrumentarium ships)
    │
    ├─ 3. Session runs
    │     anima reads context, uses tools, produces output
    │
    └─ 4. Record result  (The Animator → The Stacks)
          status, duration, token usage, cost, exit code
          ALWAYS recorded — even on crash (try/finally guarantee)
```

The trigger determines *what* work is done (the prompt, the workspace, the metadata), but the funnel is identical. The Animator doesn't know or care whether it was called from a standing order or an interactive session.

### Context Composition (The Loom)

The Loom weaves anima identity into session contexts. Given a role name, it produces an `AnimaWeave` — the composed identity context (system prompt) that The Animator uses to launch a session. The work prompt (what the anima should do) bypasses The Loom and goes directly from the caller to the session provider. At MVP, the Loom accepts the role but does not yet compose a system prompt — the value is in the seam. The Animator never assembles prompts, so when The Loom gains real composition logic, nothing downstream changes.

The target design composes the system prompt from layers, in order: **guild charter** (institutional policy) → **curriculum** (what the anima knows) → **temperament** (who the anima is) → **role instructions** → **tool instructions** → **writ context**. Each layer is versioned and immutable per version, making sessions reproducible — given the same inputs, The Loom produces the same context.

The distinction between **system prompt** and **work prompt** matters: the system prompt is the anima's identity and operating instructions (persistent across turns in a conversation, composed by The Loom); the work prompt is the specific work request for this session (changes each turn, bypasses The Loom). The Animator sends both to the provider.

### Session Launch (The Animator)

The Animator brings animas to life. It takes an `AnimaWeave`, a working directory, and optional metadata, then delegates to a **session provider** — a pluggable backend that knows how to launch and communicate with a specific AI system. Both `summon()` and `animate()` return an `AnimateHandle` synchronously — a `{ chunks, result }` pair where `result` is a promise for the final `SessionResult` and `chunks` is an async iterable of output (empty unless `streaming: true` is set on the request). The MVP provider is `claude-code-apparatus`, which launches a `claude` CLI process in **bare mode** (no CLAUDE.md, no persistent project context — the session context is entirely what The Loom wove).

The Animator's error handling contract is strict: session results are **always** recorded to The Stacks, even when the provider crashes or times out. The launch is wrapped in try/finally — if the provider throws, the session record still gets written with `status: 'failed'` and whatever telemetry was available. If the Stacks write itself fails, that error is logged but doesn't mask the provider error. Session data loss is preferable to swallowing the original failure.

Every session record captures structured telemetry: wall-clock duration, exit code, token usage (input, output, cache read, cache write), and cost in USD. Callers attach opaque **metadata** — the Animator stores it without interpreting it. The summon relay attaches dispatch context (writ id, anima name, codex); `nsg consult` attaches interactive session context. Downstream queries against metadata use The Stacks' JSON path queries.

### Session Providers

Session providers are the pluggable backend behind The Animator. A provider implements `launch()` (blocking) and optionally `launchStreaming()` (yields output chunks as they arrive). When `streaming: true` is set on the request, The Animator uses `launchStreaming()` and pipes chunks through the returned `AnimateHandle`; if the provider doesn't support streaming, the chunks iterable completes immediately with no items.

Providers handle the mechanics of a specific AI system — process spawning, stdio communication, result parsing — but not session lifecycle. The Animator owns lifecycle (id generation, timing, recording); the provider owns the process. This split means adding a new AI backend (GPT, Gemini, local models) requires only a new provider package, not changes to The Animator.

MVP: one hardcoded provider (`claude-code`). Future: provider discovery via kit contributions or guild config.

### Tool-Equipped Sessions (Future)

At MVP, sessions run without tools — the anima can only read and respond. When **The Instrumentarium** ships, The Animator gains the ability to launch an MCP tool server alongside the AI process. The Loom resolves the anima's roles into permission grants; The Instrumentarium resolves the permission-gated tool set; The Animator starts an MCP server loaded with those tools; the provider connects to it via stdio JSON-RPC. One MCP server per session, torn down when the session exits.

Tools are the mechanism through which animas act on the guild — creating writs, reading documents, signaling events, modifying files. Without tools, a session is advisory; with tools, it is operational.

### Conversations (The Parlour)

A **conversation** groups multiple sessions into a coherent multi-turn interaction. Two kinds exist: **consult** (a human talks to an anima — the `nsg consult` command) and **convene** (multiple animas hold a structured dialogue — `nsg convene`). The Parlour manages both.

The Parlour orchestrates, it doesn't execute. For each turn, it determines whose turn it is, assembles the inter-turn context (what happened since this participant last spoke), and delegates the actual session to The Animator. Each anima participant maintains **provider session continuity** via the `--resume` mechanism — the provider's conversation id is stored on the participant record and passed back on the next turn, allowing the AI process to maintain its full context window across turns.

For convene conversations, The Parlour assembles inter-turn messages: when it's Participant A's turn, it collects the responses from all participants who spoke since A's last turn and formats them as the input message. Each participant sees a coherent dialogue without The Parlour re-sending the full history (the provider's `--resume` handles that).

Conversations have an optional **turn limit** — when reached, the conversation auto-concludes. The Parlour tracks all state in The Stacks (no in-memory state between turns), making it safe for concurrent callers and process restarts.

**Workspace constraint:** Provider session continuity depends on local filesystem state (e.g. Claude Code's `.claude/` directory). All turns in a conversation must run in the same working directory, or the session data needed for `--resume` won't be present. The Parlour enforces this by passing a consistent `cwd` to The Animator for every turn.

### Invocation Paths

Sessions enter the system through three paths:

1. **Clockworks summon relay** — a standing order fires, the summon relay calls The Loom and The Animator. This is the autonomous path — no human involved.
2. **`nsg consult`** — the patron starts an interactive session. The CLI calls The Loom and The Animator directly, with streaming output to the terminal. For multi-turn conversations, The Parlour manages the session sequence.
3. **`nsg convene`** — the patron convenes a multi-anima dialogue. The CLI creates a Parlour conversation and drives the turn loop, with each turn delegating to The Animator.

All three paths converge on the same `AnimatorApi.animate()` call. The Animator is the single chokepoint for session telemetry — every session, regardless of trigger, gets the same structured recording.

See [The Animator — API Contract](apparatus/animator.md), [The Loom — API Contract](apparatus/loom.md), and [The Parlour — API Contract](apparatus/parlour.md) for the full specifications.

---

## The Clockworks

<!-- TODO: Event-driven nervous system. Events as immutable persisted facts (not intents). Standing orders as guild policy in guild.json — bind event patterns to relays. The summon verb as sugar for the summon relay. Framework events (automatic, from nexus-core operations) vs. custom guild events (declared in guild.json, signaled by animas via signal tool). The runner: manual (nsg clock tick/run) vs. daemon (nsg clock start). Error handling: standing-order.failed, loop guard. Link to clockworks.md. -->

---

## Core Apparatus Reference

<!-- TODO: Quick-reference table of all standard apparatus — name, package, layer, what it provides, links to detailed docs where they exist. Covers the same set as the table in "The Standard Guild" section but with package names, API surface hints, and links. -->

---

## Future State

Known gaps in the framework infrastructure that will be addressed as apparatus are built out.

### Config write path on `Guild` interface

The `Guild` interface (`guild()` singleton) exposes `config<T>(pluginId)` for reading plugin configuration from `guild.json`, but has no corresponding write method. Currently, plugins that need to modify their config section must use the standalone `writeGuildConfig()` function from `@shardworks/nexus-core`, which reads the full file, modifies it, and writes it back. This works but has no atomicity guarantees and no event emission.

A `guild().writeConfig(pluginId, config)` method (or equivalent) would provide:
- Scoped writes (a plugin modifies only its own section)
- Atomic file updates (read-modify-write under a lock)
- Config change events (for downstream reactivity)

**First consumer:** [The Scriptorium](apparatus/scriptorium.md) — `codex-add` and `codex-remove` need to modify the `codexes` config section programmatically. Update the Scriptorium's implementation when this API ships.

### `workshops` → `codexes` migration in nexus-core

The `GuildConfig` interface in `@shardworks/nexus-core` (`guild-config.ts`) still carries a framework-level `workshops` field with an associated `WorkshopEntry` type. This is legacy — codex registration is plugin config owned by The Scriptorium (read via `guild().config<CodexesConfig>('codexes')`), not a framework-level concern.

Cleanup required:
- Remove `workshops` from `GuildConfig` and `WorkshopEntry` from `guild-config.ts`
- Remove `workshopsPath()` and `workshopBarePath()` from `nexus-home.ts`
- Remove corresponding exports from `index.ts`
- Update `createInitialGuildConfig()` to drop the empty `workshops: {}` default
- Update test helpers in arbor and CLI that set `workshops: {}`
- Update `README.md` in core and CLI packages

The Scriptorium defines its own config types and path helpers internally. Nothing in the framework needs workshop/codex awareness.


=== FILE: packages/plugins/loom/README.md ===
# `@shardworks/loom-apparatus`

The Loom — the guild's session context composer. This apparatus owns system prompt assembly: given a role name, it weaves charter, tool instructions, and role instructions into an `AnimaWeave` that The Animator consumes to launch AI sessions. The work prompt (what the anima should do) bypasses The Loom — it is not a composition concern.

```
caller (Animator.summon)         → weave({ role })
@shardworks/loom-apparatus       → AnimaWeave { systemPrompt?, tools?, environment? }
The Animator                     → launches session with weave + work prompt
```

---

## Installation

```json
{
  "dependencies": {
    "@shardworks/loom-apparatus": "workspace:*"
  }
}
```

Plugin id: `loom`

---

## API

The Loom exposes `LoomApi` via `provides`, accessed by other plugins as:

```typescript
import { guild } from '@shardworks/nexus-core';
import type { LoomApi } from '@shardworks/loom-apparatus';

const loom = guild().apparatus<LoomApi>('loom');
```

### `LoomApi`

```typescript
interface LoomApi {
  /**
   * Weave an anima's session context.
   *
   * Given a role name, produces an AnimaWeave with a composed system prompt,
   * resolved tool set, and git identity environment variables.
   */
  weave(request: WeaveRequest): Promise<AnimaWeave>;
}
```

### `WeaveRequest`

```typescript
interface WeaveRequest {
  /**
   * The role to weave context for (e.g. 'artificer', 'scribe').
   * Determines tool resolution and role instructions. When omitted,
   * only charter content is included in the system prompt.
   */
  role?: string;
}
```

### `AnimaWeave`

```typescript
interface AnimaWeave {
  /**
   * The system prompt for the AI process. Composed from guild charter,
   * tool instructions, and role instructions. Undefined when no
   * composition layers produce content.
   */
  systemPrompt?: string;
  /** The resolved tool set for this role. Undefined when no role is specified or no tools match. */
  tools?: ResolvedTool[];
  /**
   * Environment variables for the session process.
   * Default: git identity derived from role name.
   * The Animator merges these with any per-request overrides.
   */
  environment?: Record<string, string>;
}
```

### Usage Examples

**Weave a context for a role:**

```typescript
const loom = guild().apparatus<LoomApi>('loom');

const weave = await loom.weave({ role: 'artificer' });
// → {
//     systemPrompt: '...charter...\n\n## Tool: ...\n\n...role instructions...',
//     tools: [...],
//     environment: {
//       GIT_AUTHOR_NAME: 'Artificer',
//       GIT_AUTHOR_EMAIL: 'artificer@nexus.local',
//     }
//   }
```

**Via The Animator (typical path):**

```typescript
const animator = guild().apparatus<AnimatorApi>('animator');

// summon() calls loom.weave() internally — you don't need to call it directly
const result = await animator.summon({
  role: 'artificer',
  prompt: 'Build the frobnicator module with tests',
  cwd: '/path/to/workdir',
});
```

---

## Configuration

The Loom reads role definitions from `guild.json["loom"]["roles"]`. See the [architecture spec](../../docs/architecture/apparatus/loom.md) for role configuration format.

Role configuration is used for tool resolution (permissions), environment variables (git identity), and role instruction file lookup (`roles/{role}.md`). Future: curricula and temperament composition.

---

## Exports

```typescript
// Loom API types
import {
  type LoomApi,
  type WeaveRequest,
  type AnimaWeave,
  createLoom,
} from '@shardworks/loom-apparatus';
```

The default export is the apparatus plugin instance, ready for use in `guild.json`:

```typescript
import loom from '@shardworks/loom-apparatus';
// → Plugin with apparatus.provides = LoomApi
```

=== FILE: packages/plugins/loom/src/loom.test.ts ===
/**
 * The Loom — unit tests.
 *
 * Tests weave() with role → permissions → tool resolution via a mock
 * Instrumentarium, and the basic structural contract.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { z } from 'zod';

import { setGuild, clearGuild } from '@shardworks/nexus-core';
import { tool, type InstrumentariumApi, type ResolvedTool, type ResolveOptions } from '@shardworks/tools-apparatus';

import { createLoom, type LoomApi, type LoomConfig } from './loom.ts';
import loomDefault from './index.ts';

// ── Test fixtures ───────────────────────────────────────────────────

/** A minimal tool for testing. */
function testTool(name: string, permission?: string) {
  return tool({
    name,
    description: `Test tool: ${name}`,
    params: {},
    handler: async () => ({ ok: true }),
    ...(permission !== undefined ? { permission } : {}),
  });
}

/** A mock Instrumentarium that records calls and returns configured tools. */
function mockInstrumentarium(resolvedTools: ResolvedTool[] = []) {
  const calls: ResolveOptions[] = [];
  const api: InstrumentariumApi = {
    resolve(options: ResolveOptions): ResolvedTool[] {
      calls.push(options);
      return resolvedTools;
    },
    find: () => null,
    list: () => resolvedTools,
  };
  return { api, calls };
}

/** Set up a fake guild with the given loom config and apparatus map. */
function setupGuild(opts: {
  loomConfig?: LoomConfig;
  apparatuses?: Record<string, unknown>;
  home?: string;
}) {
  const apparatuses = opts.apparatuses ?? {};
  setGuild({
    home: opts.home ?? '/tmp/test-guild',
    apparatus: <T>(id: string): T => {
      const a = apparatuses[id];
      if (!a) throw new Error(`Apparatus '${id}' not installed`);
      return a as T;
    },
    guildConfig: () => ({
      name: 'test-guild',
      nexus: '0.0.0',
      workshops: {},
      plugins: [],
      loom: opts.loomConfig,
    }),
    kits: () => [],
    apparatuses: () => [],
  } as never);
}

/** Create a started Loom and return its API. */
function startLoom(): LoomApi {
  const plugin = createLoom();
  const apparatus = (plugin as { apparatus: { start: (ctx: unknown) => void; provides: unknown } }).apparatus;
  apparatus.start({ on: () => {} });
  return apparatus.provides as LoomApi;
}

// ── Tests ────────────────────────────────────────────────────────────

describe('The Loom', () => {
  afterEach(() => {
    clearGuild();
  });

  describe('createLoom()', () => {
    it('returns a plugin with apparatus shape', () => {
      const plugin = createLoom();
      assert.ok('apparatus' in plugin, 'should have apparatus key');

      const { apparatus } = plugin as { apparatus: Record<string, unknown> };
      assert.deepStrictEqual(apparatus.requires, ['tools']);
      assert.ok(apparatus.provides, 'should have provides');
      assert.ok(typeof apparatus.start === 'function', 'should have start()');
    });

    it('provides a LoomApi with weave()', () => {
      const plugin = createLoom();
      const api = (plugin as { apparatus: { provides: LoomApi } }).apparatus.provides;
      assert.ok(typeof api.weave === 'function');
    });
  });

  describe('default export', () => {
    it('is a plugin with apparatus shape', () => {
      assert.ok('apparatus' in loomDefault, 'default export should have apparatus key');
      const { apparatus } = loomDefault as { apparatus: Record<string, unknown> };
      assert.ok(apparatus.provides, 'should have provides');
      assert.ok(typeof (apparatus.provides as LoomApi).weave === 'function', 'provides should have weave()');
    });
  });

  describe('weave() — no role', () => {
    it('returns undefined systemPrompt', async () => {
      setupGuild({});
      const api = startLoom();
      const weave = await api.weave({});
      assert.strictEqual(weave.systemPrompt, undefined);
    });

    it('returns undefined tools when no role is provided', async () => {
      setupGuild({});
      const api = startLoom();
      const weave = await api.weave({});
      assert.strictEqual(weave.tools, undefined);
    });

    it('returns a promise', () => {
      setupGuild({});
      const api = startLoom();
      const result = api.weave({});
      assert.ok(result instanceof Promise, 'weave() should return a Promise');
    });

    it('returns an object without initialPrompt', async () => {
      setupGuild({});
      const api = startLoom();
      const weave = await api.weave({ role: 'artificer' });
      assert.ok(!('initialPrompt' in weave), 'AnimaWeave should not have initialPrompt');
    });

    it('returns undefined environment when no role is provided', async () => {
      setupGuild({});
      const api = startLoom();
      const weave = await api.weave({});
      assert.strictEqual(weave.environment, undefined);
    });
  });

  describe('weave() — role with tool resolution', () => {
    it('resolves tools for a configured role', async () => {
      const readTool = testTool('stack-query', 'read');
      const resolved: ResolvedTool[] = [
        { definition: readTool, pluginId: 'stacks' },
      ];
      const { api: instrumentarium, calls } = mockInstrumentarium(resolved);

      setupGuild({
        loomConfig: {
          roles: {
            scribe: {
              permissions: ['stacks:read'],
            },
          },
        },
        apparatuses: { tools: instrumentarium },
      });

      const api = startLoom();
      const weave = await api.weave({ role: 'scribe' });

      assert.equal(weave.tools?.length, 1);
      assert.equal(weave.tools![0]!.definition.name, 'stack-query');

      // Verify the Instrumentarium was called with correct args
      assert.equal(calls.length, 1);
      assert.deepStrictEqual(calls[0]!.permissions, ['stacks:read']);
      assert.equal(calls[0]!.caller, 'anima');
    });

    it('passes strict flag from role definition', async () => {
      const { api: instrumentarium, calls } = mockInstrumentarium([]);

      setupGuild({
        loomConfig: {
          roles: {
            scribe: {
              permissions: ['stacks:read'],
              strict: true,
            },
          },
        },
        apparatuses: { tools: instrumentarium },
      });

      const api = startLoom();
      await api.weave({ role: 'scribe' });

      assert.equal(calls[0]!.strict, true);
    });

    it('returns undefined tools for an unknown role', async () => {
      const { api: instrumentarium, calls } = mockInstrumentarium([]);

      setupGuild({
        loomConfig: {
          roles: {
            artificer: { permissions: ['*:*'] },
          },
        },
        apparatuses: { tools: instrumentarium },
      });

      const api = startLoom();
      const weave = await api.weave({ role: 'unknown-role' });

      assert.strictEqual(weave.tools, undefined);
      assert.equal(calls.length, 0, 'should not call instrumentarium for unknown role');
    });

    it('returns undefined tools when no roles configured', async () => {
      const { api: instrumentarium, calls } = mockInstrumentarium([]);

      setupGuild({
        loomConfig: {},
        apparatuses: { tools: instrumentarium },
      });

      const api = startLoom();
      const weave = await api.weave({ role: 'artificer' });

      assert.strictEqual(weave.tools, undefined);
      assert.equal(calls.length, 0);
    });

    it('returns undefined tools when loom config is absent', async () => {
      const { api: instrumentarium, calls } = mockInstrumentarium([]);

      setupGuild({
        apparatuses: { tools: instrumentarium },
      });

      const api = startLoom();
      const weave = await api.weave({ role: 'artificer' });

      assert.strictEqual(weave.tools, undefined);
      assert.equal(calls.length, 0);
    });

    it('always passes caller: anima to the Instrumentarium', async () => {
      const { api: instrumentarium, calls } = mockInstrumentarium([]);

      setupGuild({
        loomConfig: {
          roles: {
            admin: { permissions: ['*:*'] },
          },
        },
        apparatuses: { tools: instrumentarium },
      });

      const api = startLoom();
      await api.weave({ role: 'admin' });

      assert.equal(calls[0]!.caller, 'anima');
    });

    it('derives git identity environment from role name', async () => {
      const { api: instrumentarium } = mockInstrumentarium([]);

      setupGuild({
        loomConfig: {
          roles: {
            artificer: { permissions: ['*:*'] },
          },
        },
        apparatuses: { tools: instrumentarium },
      });

      const api = startLoom();
      const weave = await api.weave({ role: 'artificer' });

      assert.deepStrictEqual(weave.environment, {
        GIT_AUTHOR_NAME: 'Artificer',
        GIT_AUTHOR_EMAIL: 'artificer@nexus.local',
      });
    });

    it('capitalizes first letter of role name for display name', async () => {
      const { api: instrumentarium } = mockInstrumentarium([]);

      setupGuild({
        loomConfig: {
          roles: {
            scribe: { permissions: ['stacks:read'] },
          },
        },
        apparatuses: { tools: instrumentarium },
      });

      const api = startLoom();
      const weave = await api.weave({ role: 'scribe' });

      assert.equal(weave.environment?.GIT_AUTHOR_NAME, 'Scribe');
    });

    it('derives environment even for unknown roles', async () => {
      const { api: instrumentarium } = mockInstrumentarium([]);

      setupGuild({
        loomConfig: {
          roles: {
            artificer: { permissions: ['*:*'] },
          },
        },
        apparatuses: { tools: instrumentarium },
      });

      const api = startLoom();
      const weave = await api.weave({ role: 'unknown-role' });

      assert.ok(weave.environment, 'environment should be defined for any role string');
      assert.equal(weave.environment?.GIT_AUTHOR_NAME, 'Unknown-role');
      assert.equal(weave.environment?.GIT_AUTHOR_EMAIL, 'unknown-role@nexus.local');
    });
  });

  // ── System prompt composition ──────────────────────────────────────

  describe('weave() — charter composition', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-test-'));
    });

    afterEach(() => {
      clearGuild();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('includes charter.md content in systemPrompt', async () => {
      fs.writeFileSync(path.join(tmpDir, 'charter.md'), 'Guild policy: be excellent.');
      setupGuild({ home: tmpDir });
      const api = startLoom();
      const weave = await api.weave({});
      assert.equal(weave.systemPrompt, 'Guild policy: be excellent.');
    });

    it('composes charter from directory files in alphabetical order', async () => {
      const charterDir = path.join(tmpDir, 'charter');
      fs.mkdirSync(charterDir);
      fs.writeFileSync(path.join(charterDir, '02-rules.md'), 'Rule 1');
      fs.writeFileSync(path.join(charterDir, '01-values.md'), 'Value 1');
      setupGuild({ home: tmpDir });
      const api = startLoom();
      const weave = await api.weave({});
      assert.equal(weave.systemPrompt, 'Value 1\n\nRule 1');
    });

    it('charter.md takes priority over charter/ directory', async () => {
      fs.writeFileSync(path.join(tmpDir, 'charter.md'), 'Single file');
      const charterDir = path.join(tmpDir, 'charter');
      fs.mkdirSync(charterDir);
      fs.writeFileSync(path.join(charterDir, '01.md'), 'Dir file');
      setupGuild({ home: tmpDir });
      const api = startLoom();
      const weave = await api.weave({});
      assert.equal(weave.systemPrompt, 'Single file');
    });

    it('returns undefined systemPrompt when no charter exists', async () => {
      setupGuild({ home: tmpDir });
      const api = startLoom();
      const weave = await api.weave({});
      assert.strictEqual(weave.systemPrompt, undefined);
    });

    it('returns undefined systemPrompt when charter/ directory has no .md files', async () => {
      const charterDir = path.join(tmpDir, 'charter');
      fs.mkdirSync(charterDir);
      fs.writeFileSync(path.join(charterDir, '.gitkeep'), '');
      setupGuild({ home: tmpDir });
      const api = startLoom();
      const weave = await api.weave({});
      assert.strictEqual(weave.systemPrompt, undefined);
    });

    it('charter directory with mixed file types only reads .md files', async () => {
      const charterDir = path.join(tmpDir, 'charter');
      fs.mkdirSync(charterDir);
      fs.writeFileSync(path.join(charterDir, 'a.md'), 'A content');
      fs.writeFileSync(path.join(charterDir, 'b.txt'), 'B content');
      fs.writeFileSync(path.join(charterDir, 'c.md'), 'C content');
      setupGuild({ home: tmpDir });
      const api = startLoom();
      const weave = await api.weave({});
      assert.equal(weave.systemPrompt, 'A content\n\nC content');
    });

    it('includes charter when weave() is called without a role', async () => {
      fs.writeFileSync(path.join(tmpDir, 'charter.md'), 'Charter text');
      setupGuild({ home: tmpDir });
      const api = startLoom();
      const weave1 = await api.weave({});
      const weave2 = await api.weave({ role: undefined });
      assert.equal(weave1.systemPrompt, 'Charter text');
      assert.equal(weave2.systemPrompt, 'Charter text');
    });
  });

  describe('weave() — role instructions composition', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-test-'));
    });

    afterEach(() => {
      clearGuild();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('includes role instructions when roles/{role}.md exists', async () => {
      const rolesDir = path.join(tmpDir, 'roles');
      fs.mkdirSync(rolesDir);
      fs.writeFileSync(path.join(rolesDir, 'artificer.md'), 'You are the artificer.');
      setupGuild({
        home: tmpDir,
        loomConfig: { roles: { artificer: { permissions: ['*:*'] } } },
      });
      const api = startLoom();
      const weave = await api.weave({ role: 'artificer' });
      assert.ok(weave.systemPrompt?.includes('You are the artificer.'));
    });

    it('omits role instructions silently when roles/{role}.md is missing', async () => {
      setupGuild({
        home: tmpDir,
        loomConfig: { roles: { scribe: { permissions: ['stacks:read'] } } },
      });
      const api = startLoom();
      const weave = await api.weave({ role: 'scribe' });
      assert.strictEqual(weave.systemPrompt, undefined);
    });

    it('omits role instructions for roles not in config even if file exists on disk', async () => {
      const rolesDir = path.join(tmpDir, 'roles');
      fs.mkdirSync(rolesDir);
      fs.writeFileSync(path.join(rolesDir, 'ghost.md'), 'Ghost instructions');
      setupGuild({
        home: tmpDir,
        loomConfig: { roles: { artificer: { permissions: ['*:*'] } } },
      });
      const api = startLoom();
      const weave = await api.weave({ role: 'ghost' });
      assert.strictEqual(weave.systemPrompt, undefined);
    });

    it('omits role instructions layer when no role is provided', async () => {
      const rolesDir = path.join(tmpDir, 'roles');
      fs.mkdirSync(rolesDir);
      fs.writeFileSync(path.join(rolesDir, 'artificer.md'), 'Role text');
      setupGuild({
        home: tmpDir,
        loomConfig: { roles: { artificer: { permissions: ['*:*'] } } },
      });
      const api = startLoom();
      const weave = await api.weave({});
      assert.strictEqual(weave.systemPrompt, undefined);
    });

    it('omits role instructions layer when role instruction file is empty', async () => {
      const rolesDir = path.join(tmpDir, 'roles');
      fs.mkdirSync(rolesDir);
      fs.writeFileSync(path.join(rolesDir, 'artificer.md'), '');
      setupGuild({
        home: tmpDir,
        loomConfig: { roles: { artificer: { permissions: ['*:*'] } } },
      });
      const api = startLoom();
      const weave = await api.weave({ role: 'artificer' });
      assert.strictEqual(weave.systemPrompt, undefined);
    });
  });

  describe('weave() — tool instructions composition', () => {
    afterEach(() => {
      clearGuild();
    });

    it('includes tool instructions formatted with ## Tool: header', async () => {
      const toolA = tool({
        name: 'tool-a',
        description: 'Tool A',
        instructions: 'Guide A',
        params: {},
        handler: async () => ({}),
      });
      const toolB = tool({
        name: 'tool-b',
        description: 'Tool B',
        instructions: 'Guide B',
        params: {},
        handler: async () => ({}),
      });
      const resolved: ResolvedTool[] = [
        { definition: toolA, pluginId: 'test' },
        { definition: toolB, pluginId: 'test' },
      ];
      const { api: instrumentarium } = mockInstrumentarium(resolved);
      setupGuild({
        loomConfig: { roles: { artificer: { permissions: ['*:*'] } } },
        apparatuses: { tools: instrumentarium },
      });
      const api = startLoom();
      const weave = await api.weave({ role: 'artificer' });
      assert.ok(weave.systemPrompt?.includes('## Tool: tool-a\n\nGuide A'));
      assert.ok(weave.systemPrompt?.includes('## Tool: tool-b\n\nGuide B'));
    });

    it('omits tool instructions layer when tools have no instructions', async () => {
      const resolved: ResolvedTool[] = [
        { definition: testTool('plain-tool'), pluginId: 'test' },
      ];
      const { api: instrumentarium } = mockInstrumentarium(resolved);
      setupGuild({
        loomConfig: { roles: { artificer: { permissions: ['*:*'] } } },
        apparatuses: { tools: instrumentarium },
      });
      const api = startLoom();
      const weave = await api.weave({ role: 'artificer' });
      assert.strictEqual(weave.systemPrompt, undefined);
    });

    it('only includes tool instructions for tools that have them', async () => {
      const toolWithInstructions = tool({
        name: 'tool-a',
        description: 'Tool A',
        instructions: 'Use this carefully.',
        params: {},
        handler: async () => ({}),
      });
      const toolWithout = testTool('tool-b');
      const resolved: ResolvedTool[] = [
        { definition: toolWithInstructions, pluginId: 'test' },
        { definition: toolWithout, pluginId: 'test' },
      ];
      const { api: instrumentarium } = mockInstrumentarium(resolved);
      setupGuild({
        loomConfig: { roles: { artificer: { permissions: ['*:*'] } } },
        apparatuses: { tools: instrumentarium },
      });
      const api = startLoom();
      const weave = await api.weave({ role: 'artificer' });
      assert.ok(weave.systemPrompt?.includes('## Tool: tool-a'));
      assert.ok(!weave.systemPrompt?.includes('## Tool: tool-b'));
    });
  });

  describe('weave() — composition order and assembly', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-test-'));
    });

    afterEach(() => {
      clearGuild();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('assembles full composition in order: charter → tool instructions → role instructions', async () => {
      fs.writeFileSync(path.join(tmpDir, 'charter.md'), 'Charter text');
      const rolesDir = path.join(tmpDir, 'roles');
      fs.mkdirSync(rolesDir);
      fs.writeFileSync(path.join(rolesDir, 'artificer.md'), 'Role text');

      const signalTool = tool({
        name: 'signal',
        description: 'Signal tool',
        instructions: 'Signal guide',
        params: {},
        handler: async () => ({}),
      });
      const resolved: ResolvedTool[] = [{ definition: signalTool, pluginId: 'test' }];
      const { api: instrumentarium } = mockInstrumentarium(resolved);

      setupGuild({
        home: tmpDir,
        loomConfig: { roles: { artificer: { permissions: ['*:*'] } } },
        apparatuses: { tools: instrumentarium },
      });
      const api = startLoom();
      const weave = await api.weave({ role: 'artificer' });

      assert.equal(
        weave.systemPrompt,
        'Charter text\n\n## Tool: signal\n\nSignal guide\n\nRole text',
      );
    });

    it('charter only (no role) — systemPrompt equals charter content', async () => {
      fs.writeFileSync(path.join(tmpDir, 'charter.md'), 'Charter text');
      setupGuild({ home: tmpDir });
      const api = startLoom();
      const weave = await api.weave({});
      assert.equal(weave.systemPrompt, 'Charter text');
    });

    it('role instructions only (no charter, no tool instructions)', async () => {
      const rolesDir = path.join(tmpDir, 'roles');
      fs.mkdirSync(rolesDir);
      fs.writeFileSync(path.join(rolesDir, 'artificer.md'), 'Role text');

      const resolved: ResolvedTool[] = [{ definition: testTool('plain'), pluginId: 'test' }];
      const { api: instrumentarium } = mockInstrumentarium(resolved);

      setupGuild({
        home: tmpDir,
        loomConfig: { roles: { artificer: { permissions: ['*:*'] } } },
        apparatuses: { tools: instrumentarium },
      });
      const api = startLoom();
      const weave = await api.weave({ role: 'artificer' });
      assert.equal(weave.systemPrompt, 'Role text');
    });

    it('tool instructions only (no charter, no role.md)', async () => {
      const toolA = tool({
        name: 'my-tool',
        description: 'My tool',
        instructions: 'Tool guide',
        params: {},
        handler: async () => ({}),
      });
      const resolved: ResolvedTool[] = [{ definition: toolA, pluginId: 'test' }];
      const { api: instrumentarium } = mockInstrumentarium(resolved);

      setupGuild({
        home: tmpDir,
        loomConfig: { roles: { artificer: { permissions: ['*:*'] } } },
        apparatuses: { tools: instrumentarium },
      });
      const api = startLoom();
      const weave = await api.weave({ role: 'artificer' });
      assert.equal(weave.systemPrompt, '## Tool: my-tool\n\nTool guide');
    });

    it('systemPrompt is undefined when all layers are empty', async () => {
      const resolved: ResolvedTool[] = [{ definition: testTool('plain'), pluginId: 'test' }];
      const { api: instrumentarium } = mockInstrumentarium(resolved);
      setupGuild({
        home: tmpDir,
        loomConfig: { roles: { artificer: { permissions: ['*:*'] } } },
        apparatuses: { tools: instrumentarium },
      });
      const api = startLoom();
      const weave = await api.weave({ role: 'artificer' });
      assert.strictEqual(weave.systemPrompt, undefined);
    });
  });

  describe('weave() — startup caching', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-test-'));
    });

    afterEach(() => {
      clearGuild();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('content is cached at startup — deleting files after start does not affect weave()', async () => {
      const charterPath = path.join(tmpDir, 'charter.md');
      const rolesDir = path.join(tmpDir, 'roles');
      fs.writeFileSync(charterPath, 'Cached charter');
      fs.mkdirSync(rolesDir);
      fs.writeFileSync(path.join(rolesDir, 'artificer.md'), 'Cached role');

      setupGuild({
        home: tmpDir,
        loomConfig: { roles: { artificer: { permissions: ['*:*'] } } },
      });
      const api = startLoom();

      // Delete the files after startup
      fs.unlinkSync(charterPath);
      fs.unlinkSync(path.join(rolesDir, 'artificer.md'));

      const weave = await api.weave({ role: 'artificer' });
      assert.ok(weave.systemPrompt?.includes('Cached charter'));
      assert.ok(weave.systemPrompt?.includes('Cached role'));
    });

    it('roles not in config are not pre-read even if file exists on disk', async () => {
      const rolesDir = path.join(tmpDir, 'roles');
      fs.mkdirSync(rolesDir);
      fs.writeFileSync(path.join(rolesDir, 'phantom.md'), 'Phantom instructions');

      setupGuild({
        home: tmpDir,
        loomConfig: { roles: { artificer: { permissions: ['*:*'] } } },
      });
      const api = startLoom();
      const weave = await api.weave({ role: 'phantom' });
      assert.strictEqual(weave.systemPrompt, undefined);
    });
  });

  describe('weave() — backward compatibility', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'loom-test-'));
    });

    afterEach(() => {
      clearGuild();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('returns systemPrompt: undefined, tools: undefined, environment: undefined with no content', async () => {
      setupGuild({ home: tmpDir });
      const api = startLoom();
      const weave = await api.weave({});
      assert.strictEqual(weave.systemPrompt, undefined);
      assert.strictEqual(weave.tools, undefined);
      assert.strictEqual(weave.environment, undefined);
    });

    it('tool resolution and git identity are unaffected by composition logic', async () => {
      const rolesDir = path.join(tmpDir, 'roles');
      fs.mkdirSync(rolesDir);
      fs.writeFileSync(path.join(rolesDir, 'artificer.md'), 'Role text');

      const readTool = testTool('stack-query', 'read');
      const resolved: ResolvedTool[] = [{ definition: readTool, pluginId: 'stacks' }];
      const { api: instrumentarium } = mockInstrumentarium(resolved);

      setupGuild({
        home: tmpDir,
        loomConfig: { roles: { artificer: { permissions: ['stacks:read'] } } },
        apparatuses: { tools: instrumentarium },
      });
      const api = startLoom();
      const weave = await api.weave({ role: 'artificer' });

      assert.equal(weave.tools?.length, 1);
      assert.equal(weave.tools?.[0]?.definition.name, 'stack-query');
      assert.deepStrictEqual(weave.environment, {
        GIT_AUTHOR_NAME: 'Artificer',
        GIT_AUTHOR_EMAIL: 'artificer@nexus.local',
      });
    });
  });
});

=== FILE: packages/plugins/loom/src/loom.ts ===
/**
 * The Loom — session context composition apparatus.
 *
 * The Loom owns system prompt assembly. Given a role name, it produces
 * an AnimaWeave — the composed identity context that The Animator uses
 * to launch a session. The work prompt (what the anima should do) is
 * not the Loom's concern; it bypasses the Loom and goes directly to
 * the Animator.
 *
 * The Loom resolves the role's permission grants from guild.json, then
 * calls the Instrumentarium to resolve the permission-gated tool set.
 * Tools are returned on the AnimaWeave so the Animator can pass them
 * to the session provider for MCP server configuration.
 *
 * See: docs/specification.md (loom)
 */

import type { Plugin, StartupContext } from '@shardworks/nexus-core';
import { guild } from '@shardworks/nexus-core';
import type { InstrumentariumApi, ResolvedTool } from '@shardworks/tools-apparatus';
import fs from 'node:fs';
import path from 'node:path';

// ── Public types ──────────────────────────────────────────────────────

export interface WeaveRequest {
  /**
   * The role to weave context for (e.g. 'artificer', 'scribe').
   *
   * When provided, the Loom resolves role → permissions from guild.json,
   * then calls the Instrumentarium to resolve the permission-gated tool set.
   * Tools are returned on the AnimaWeave.
   *
   * When omitted, no tool resolution occurs — the AnimaWeave has no tools.
   */
  role?: string;
}

/**
 * The output of The Loom's weave() — the composed anima identity context.
 *
 * Contains the system prompt (produced by the Loom from the anima's
 * identity layers) and the resolved tool set for the role. The work
 * prompt is not part of the weave — it goes directly to the Animator.
 */
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

/** The Loom's public API, exposed via `provides`. */
export interface LoomApi {
  /**
   * Weave an anima's session context.
   *
   * Given a role name, produces an AnimaWeave containing the composed
   * system prompt and the resolved tool set. The system prompt is assembled
   * from the guild charter, tool instructions (for the resolved tool set),
   * and role instructions — in that order.
   *
   * Tool resolution is active: if a role is provided and the Instrumentarium
   * is installed, the Loom resolves role → permissions → tools.
   */
  weave(request: WeaveRequest): Promise<AnimaWeave>;
}

// ── Config types ─────────────────────────────────────────────────────

/** Role definition in guild.json under the Loom's plugin section. */
export interface RoleDefinition {
  /** Permission grants in `plugin:level` format. */
  permissions: string[];
  /**
   * When true, permissionless tools are excluded unless the role grants
   * `plugin:*` or `*:*` for the tool's plugin. Default: false.
   */
  strict?: boolean;
}

/** Loom configuration from guild.json. */
export interface LoomConfig {
  /** Role definitions keyed by role name. */
  roles?: Record<string, RoleDefinition>;
}

// ── Apparatus factory ─────────────────────────────────────────────────

/**
 * Create the Loom apparatus plugin.
 *
 * Returns a Plugin with:
 * - `requires: ['tools']` — needs the Instrumentarium for tool resolution
 * - `provides: LoomApi` — the context composition API
 */
export function createLoom(): Plugin {
  let config: LoomConfig = {};
  let charterContent: string | undefined;
  let roleInstructions: Map<string, string> = new Map();

  const api: LoomApi = {
    async weave(request: WeaveRequest): Promise<AnimaWeave> {
      const weave: AnimaWeave = {};

      // Resolve tools if a role is provided and has a definition.
      if (request.role && config.roles) {
        const roleDef = config.roles[request.role];
        if (roleDef) {
          try {
            const instrumentarium = guild().apparatus<InstrumentariumApi>('tools');
            weave.tools = instrumentarium.resolve({
              permissions: roleDef.permissions,
              strict: roleDef.strict,
              caller: 'anima',
            });
          } catch {
            // Instrumentarium not installed — no tools.
            // This shouldn't happen since we require 'tools', but
            // fail gracefully rather than crash the session.
          }
        }
      }

      // Derive git identity from role name.
      if (request.role) {
        const displayName = request.role.charAt(0).toUpperCase() + request.role.slice(1);
        weave.environment = {
          GIT_AUTHOR_NAME: displayName,
          GIT_AUTHOR_EMAIL: `${request.role}@nexus.local`,
        };
      }

      // Compose system prompt from available layers: charter → tool instructions → role instructions.
      const layers: string[] = [];

      if (charterContent) {
        layers.push(charterContent);
      }

      if (weave.tools && weave.tools.length > 0) {
        for (const resolvedTool of weave.tools) {
          const instructions = resolvedTool.definition.instructions;
          if (instructions) {
            layers.push(`## Tool: ${resolvedTool.definition.name}\n\n${instructions}`);
          }
        }
      }

      if (request.role && roleInstructions.has(request.role)) {
        layers.push(roleInstructions.get(request.role)!);
      }

      if (layers.length > 0) {
        weave.systemPrompt = layers.join('\n\n');
      }

      return weave;
    },
  };

  return {
    apparatus: {
      requires: ['tools'],
      provides: api,

      start(_ctx: StartupContext): void {
        const g = guild();
        config = g.guildConfig().loom ?? {};
        const home = g.home;

        // Read charter content at startup and cache it.
        charterContent = undefined;
        const charterFilePath = path.join(home, 'charter.md');
        try {
          charterContent = fs.readFileSync(charterFilePath, 'utf-8');
        } catch (err: unknown) {
          if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
          // No charter.md — check for charter/ directory.
          const charterDir = path.join(home, 'charter');
          try {
            const stat = fs.statSync(charterDir);
            if (stat.isDirectory()) {
              const mdFiles = fs.readdirSync(charterDir)
                .filter(f => f.endsWith('.md'))
                .sort();
              if (mdFiles.length > 0) {
                charterContent = mdFiles
                  .map(f => fs.readFileSync(path.join(charterDir, f), 'utf-8'))
                  .join('\n\n');
              }
            }
          } catch {
            // No charter/ directory either — silently omit.
          }
        }

        // Read role instruction files at startup for all configured roles.
        roleInstructions = new Map();
        if (config.roles) {
          for (const roleName of Object.keys(config.roles)) {
            const rolePath = path.join(home, 'roles', `${roleName}.md`);
            try {
              const content = fs.readFileSync(rolePath, 'utf-8');
              if (content) {
                roleInstructions.set(roleName, content);
              }
            } catch {
              // File doesn't exist — silently omit.
            }
          }
        }
      },
    },
  };
}



## Convention Reference (sibling files not modified by this commission)

=== CONTEXT FILE: docs/architecture/plugins.md ===
# Plugin Architecture

This document describes the plugin system — how the guild's capabilities are packaged, installed, and composed. For the broader system context, see [overview.md](overview.md).

---

## Overview

The guild framework ships with no running infrastructure of its own. The Clockworks, the Spider, the Surveyor — everything that makes a guild operational is contributed by plugins. `nsg init` installs a default plugin set; a guild's installed plugins determine what it can do.

This is a deliberate design choice. Keeping the framework core to a plugin loader and a set of type contracts means each piece of infrastructure is independently testable, replaceable, and comprehensible. There is no privileged built-in layer; a core apparatus and a community kit are the same kind of thing.

Plugins come in two kinds:

- **Kits** — passive packages contributing capabilities to consuming apparatuses. No lifecycle, no running state. Read at load time and forwarded to consuming apparatuses.
- **Apparatuses** — packages contributing persistent running infrastructure. Have a `start`/`stop` lifecycle. May include a `supportKit` that exposes their capabilities to the rest of the guild.

**Plugin** is retained as a framework-internal and technical term for "either of the above." It appears in error messages, internal types, and npm package conventions, but is not the primary vocabulary users encounter. The guild vocabulary is Kit and Apparatus.

---

## Kit

A kit is a passive package contributing capabilities to the guild. Kits have no lifecycle — they are read at load time and their contributions are forwarded to consuming apparatuses. Nothing about a kit participates in `start`/`stop` or requires a running system.

```typescript
type Kit = {
  requires?:   string[]
  recommends?: string[]
  [key: string]:  unknown
}
```

A kit is an open record. The contribution fields (`relays`, `engines`, `tools`, or anything else) are defined by the apparatus packages that consume them, not by the framework. `requires` and `recommends` are the only framework-level fields.

**`requires`** is an array of apparatus names whose runtime APIs this kit's contributions depend on at handler invocation time. If a tool contributed by this kit calls `guild().apparatus("books")`, the kit must declare `requires: ["books"]`. Validated at startup — if a declared apparatus is not installed, the guild refuses to start with a specific error. Hard failure, not advisory.

**`recommends`** is an advisory list of apparatus names the kit's contributions are most useful with, used to generate startup warnings when expected apparatuses are absent. Not enforced.

A kit package exports its manifest as the default export:

```typescript
import type { ClockworksKit } from "nexus-clockworks"
import type { SpiderKit }     from "nexus-spider"
import type { AnimaKit }      from "nexus-sessions"

export default {
  kit: {
    requires:   ["nexus-books"],
    recommends: ["nexus-clockworks", "nexus-spider"],
    engines: [createBranchEngine, deleteBranchEngine, mergeBranchEngine],
    relays:  [onMergeRelay],
    tools:   [statusTool, diffTool, logTool],
  } satisfies ClockworksKit & SpiderKit & AnimaKit,
} satisfies Plugin
```

Type safety for contribution fields is provided by the apparatus that consumes them — not by the framework. Each apparatus package publishes a kit interface that kit authors can import and `satisfies` against:

- `ClockworksKit` — defines `relays`. See [ClockworksKit](clockworks.md#clockworkskit).
- `SpiderKit` — defines `engines`. See [Engine Designs](engine-designs.md).
- `AnimaKit` — defines `tools`. See [Tools](anima-lifecycle.md#tools).

Kit authors who don't want or need static type checking simply write a plain object — both approaches are valid.

The framework never inspects contribution field contents. It sees kit records as opaque objects, forwards them to consuming apparatuses via `plugin:initialized`, and cross-references field keys against `consumes` tokens for startup warnings. See [Kit Contribution Consumption](#kit-contribution-consumption).

---

## Apparatus

An apparatus is a package contributing persistent running infrastructure to the guild. It implements a lifecycle in `start` and `stop`. The Clockworks, Spider, and Surveyor are all apparatuses.

```typescript
type Apparatus = {
  requires?:   string[]
  provides?:   unknown
  start:       (ctx: StartupContext) => void
  stop?:       () => void
  supportKit?: Kit
  consumes?:   string[]
}
```

**`requires`** is an array of apparatus names that must be started before this apparatus's `start()` runs. Validated at startup before any `start` is called. Determines start ordering — by the time an apparatus's `start` runs, all its declared dependencies are already started with their `provides` objects populated. Circular dependencies are rejected at load time.

**`provides`** is the runtime API object this apparatus exposes to other plugins. Retrieved via `guild().apparatus<T>(name)`. The reference is created at manifest-definition time and populated during `start`. See [Providing an API](#providing-an-api).

`start(ctx)` is where the apparatus initialises its internal state, registers lifecycle hooks, and wires up its dependencies. `stop()` tears it down. Both may be async — the framework awaits them in dependency-resolved order.

`stop` is optional for apparatuses that have no shutdown logic beyond garbage collection.

A `supportKit` is a Kit that an apparatus composes to expose its capabilities to the rest of the guild — the same open record as any other kit, populated with whatever contribution fields the apparatus's own consuming peers understand. Consuming apparatuses treat `supportKit` contributions identically to standalone kit contributions; the source is an implementation detail callers never see.

An apparatus without a `supportKit` is meaningful — infrastructure that exposes its capabilities only through `provides` (the inter-apparatus API) rather than through the tool/relay/engine surface.

**`consumes`** is an optional array of string tokens declaring which Kit contribution types this apparatus scans for and registers. The tokens correspond to Kit field names (`"engines"`, `"relays"`, `"tools"`, or custom extension types). This declaration enables the framework to generate startup warnings when kits contribute to a type that no installed apparatus consumes. See [Kit Contribution Consumption](#kit-contribution-consumption).

```typescript
const clockworksApi: ClockworksApi = {
  on:    (event, handler) => { ... },
  emit:  (event, payload) => { ... },
  drain: ()               => { ... },
}

export default {
  apparatus: {
    requires: ["nexus-stacks"],
    provides: clockworksApi,

    supportKit: {
      relays: [signalRelay, drainRelay],
      tools:  [signalTool, clockStatusTool],
    },

    start: (ctx) => {
      const stacks = guild().apparatus<StacksApi>("nexus-stacks")
      clockworksApi.init(stacks)
    },

    stop: () => {
      clockworksApi.shutdown()
    },
  },
} satisfies Plugin
```

### Providing an API (`provides`)

An apparatus that exposes a typed API to other plugins declares it via `provides` on the apparatus. This is the object returned when another plugin calls `guild().apparatus(name)`.

```typescript
const clockworksApi: ClockworksApi = {
  on:    (event, handler) => { ... },
  emit:  (event, payload) => { ... },
  drain: ()               => { ... },
}

export default {
  apparatus: {
    requires: ["nexus-stacks"],
    provides: clockworksApi,
    start: (ctx) => { ... },
  },
} satisfies Plugin
```

A stable object reference is created at manifest-definition time and populated during `start`. The reference is stable; the object gains its runtime contents when the apparatus starts.

Plugin authors ship their API type alongside their package so consumers can import and cast safely:

```typescript
import type { ClockworksApi } from "nexus-clockworks"
const clockworks = guild().apparatus<ClockworksApi>("nexus-clockworks")
```

---

## Plugin IDs

Every plugin has a derived **plugin id** — the name used in `guild.json`, `requires` arrays, `guild().apparatus()` calls, and configuration keys. The id is derived from the npm package name at load time and never declared in the manifest.

Derivation rules, applied in order:

1. **Strip the `@shardworks/` scope** — the official Nexus namespace. `@shardworks/clockworks` → `clockworks`. Plugins in this scope are referenced by bare name everywhere.
2. **Retain other scopes as a prefix** — `@acme/my-relay` → `acme/my-relay`. Preserves uniqueness across third-party publishers without special registry entries.
3. **Strip a trailing `-(plugin|apparatus|kit)` suffix** — allows package authors to use descriptive npm names without polluting the plugin id. `my-relay-kit` → `my-relay`. `@acme/cache-apparatus` → `acme/cache`.

Examples:

| npm package name              | Plugin id         |
|-------------------------------|-------------------|
| `@shardworks/clockworks`      | `clockworks`      |
| `@shardworks/books-apparatus` | `books`           |
| `@shardworks/nexus-git`       | `nexus-git`       |
| `@acme/cache-apparatus`       | `acme/cache`      |
| `my-relay-kit`                | `my-relay`        |
| `my-plugin`                   | `my-plugin`       |

Plugin ids are also the keys under which plugin-specific configuration lives in `guild.json` — see [Configuration](#configuration).

---

## The Plugin Type

```typescript
type Plugin =
  | { kit:       Kit }
  | { apparatus: Apparatus }
```

A plugin is either a kit or an apparatus — the discriminating field (`kit` or `apparatus`) is required. All plugin-level concerns (`requires`, `provides`) live inside the respective type where their semantics are defined. The plugin name is always inferred from the npm package name at load time — it is never declared in the manifest.

---

## Dependencies

Both kits and apparatuses may declare `requires`, but the semantics differ:

**Apparatus `requires`** — two effects: validates that declared dependencies are installed, and determines start ordering. By the time the apparatus's `start()` runs, all declared dependencies are already started.

```typescript
export default {
  apparatus: {
    requires: ["nexus-clockworks", "nexus-stacks"],
    start: (ctx) => {
      const clockworks = guild().apparatus<ClockworksApi>("nexus-clockworks")
      const stacks     = guild().apparatus<StacksApi>("nexus-stacks")
      // ...
    },
  },
} satisfies Plugin
```

**Kit `requires`** — one effect: validates that declared apparatuses are installed and will be started. No ordering concern (kits have no `start`). Ensures that tools contributed by the kit can safely call `guild().apparatus(name)` at handler invocation time without a runtime failure.

```typescript
export default {
  kit: {
    requires: ["nexus-books"],
    tools:    [writeNoteTool, readNoteTool],
  },
} satisfies Plugin
```

Both produce the same operator-facing failure: a loud, early, specific error at guild startup before any agent does any work.

The framework validates all `requires` declarations at startup — before any `start` is called. If a declared dependency is not installed, the guild refuses to start with a specific error naming the missing plugin. Circular dependencies are rejected at load time.

### `recommends`

Both kits and apparatuses may declare `recommends` — advisory dependencies that generate startup warnings but do not prevent startup. Use `recommends` for soft dependencies needed by optional capabilities:

```typescript
export default {
  apparatus: {
    requires:   ["stacks"],
    recommends: ["loom"],     // summon() needs it, animate() doesn't
    // ...
  },
} satisfies Plugin
```

If a recommended plugin is not installed, Arbor logs a warning at startup but proceeds normally. The apparatus is responsible for producing a clear runtime error if the missing dependency is actually needed (e.g. "summon() requires The Loom apparatus to be installed").

---

## Internal Model

The framework maintains two separate internal lists — `LoadedKit[]` and `LoadedApparatus[]` — because they have genuinely different lifecycles:

```typescript
type GuildManifest = {
  kits:        LoadedKit[]
  apparatuses: LoadedApparatus[]
}
```

Lifecycle management (start ordering, shutdown) operates on the apparatus list. Kit records are loaded and cached; their contributions are surfaced via `guild().kits()` and `guild().apparatuses()` for consuming apparatus to pull from.

Each consuming apparatus maintains its own registry of the contribution types it understands. A Clockworks apparatus maintains a relay registry populated from both standalone kit packages and apparatus `supportKit`s; callers of the Clockworks API see a single relay list regardless of source. The framework does not maintain cross-apparatus registries — contribution type semantics belong to the apparatus that defined them.

---

## Kit Contribution Consumption

A kit is passive — it declares contributions but has no awareness of whether any apparatus is present to consume them. The Clockworks doesn't know which relays are installed until it scans at startup; a relay kit doesn't know whether Clockworks is installed. This loose coupling is intentional: kits and apparatuses can be authored and published independently.

But loose coupling creates a practical problem. An operator installs a relay-heavy kit expecting event handling to work, forgets to install the Clockworks, and gets silent inertness with no indication anything is wrong. The framework addresses this without compromising kit purity or imposing hard couplings.

### Reactive Consumption

Consuming apparatuses register kit contributions reactively using the `plugin:initialized` lifecycle event. The Clockworks, for example, handles both kits already loaded and kits that arrive later in the load sequence:

```typescript
// inside Clockworks apparatus start()
start: (ctx) => {
  for (const p of [...guild().kits(), ...guild().apparatuses()]) { registerRelays(p) }
  ctx.on("plugin:initialized", (p) => registerRelays(p))
}
```

`guild().kits()` and `guild().apparatuses()` return snapshots of everything loaded so far. `ctx.on("plugin:initialized")` fires for each subsequent plugin as it completes loading. Together they cover the full sequence without requiring load-order guarantees between the Clockworks and any particular relay kit.

Kits declare; apparatuses consume. Neither needs to know about the other at authoring time.

### Startup Warnings

The Arbor cross-references Kit contributions against installed apparatus `consumes` declarations at startup and emits advisory warnings for mismatches. These are coherence checks, not hard errors — a guild without a Clockworks may be a perfectly valid configuration.

Warning conditions:
- A kit contributes a type (`relays`, `engines`, `tools`, or a custom token) and no installed apparatus declares `consumes` for that token.
- A kit declares `recommends: ["nexus-clockworks"]` and that apparatus is not installed.

```
warn: nexus-signals contributes relays but no installed apparatus consumes "relays"
      consider installing nexus-clockworks (recommended by nexus-signals)

warn: nexus-git contributes engines but no installed apparatus consumes "engines"
```

Warnings surface at startup where an operator can act on them — not silently at runtime when a commission fails because no Spider is present.

### Design Notes

Several alternatives were considered before arriving at this approach:

**Kits declare hard dependencies on consuming apparatuses** — rejected. Too strong. Prevents speculative installation, blurs the Kit/Apparatus distinction by giving kits lifecycle concerns, and makes kit authoring more complex for a case that is often not an error.

**Consuming apparatuses silently scan without declaring `consumes`** — rejected. Leaves the framework unable to generate useful warnings. An operator has no way to know whether inert contributions are intentional or a configuration mistake.

**Framework-owned contribution type registry** — rejected. Requires the framework to know about contribution types like `relays` or `engines`, coupling Arbor to apparatus semantics it doesn't need to understand. Type safety for contribution fields belongs to the apparatus packages that define them; kit authors opt into that safety by importing the relevant interfaces. Arbor's concern is loading and warning, not interpreting.

The chosen approach — open `Kit` record with apparatus-published interfaces for type safety, reactive apparatus consumption via `plugin:initialized`, optional `recommends` on kits, `consumes` on apparatuses, advisory startup warnings — keeps each concern where it belongs and surfaces configuration mistakes without imposing constraints that would make valid configurations impossible.

---

## StartupContext

The context passed to an apparatus's `start(ctx)`. Provides lifecycle event subscription — the only capability that is meaningful only during startup. All other guild access goes through `guild()`.

```typescript
interface StartupContext {
  on(event: string, handler: (...args: unknown[]) => void | Promise<void>): void
}
```

`ctx.on('plugin:initialized', handler)` fires after each plugin completes loading. Used by consuming apparatus to register kit contributions reactively — see [Reactive Consumption](#reactive-consumption).

---

## The Guild Accessor

Tool, engine, and relay handlers access guild infrastructure through the **guild accessor** — a process-level singleton set by Arbor at startup:

```typescript
import { guild } from '@shardworks/nexus-core'

// Inside a handler:
const { home } = guild()                          // guild root path
const stacks = guild().apparatus<StacksApi>('stacks')  // apparatus API
const cfg = guild().config<MyConfig>('my-plugin')       // plugin config
const full = guild().guildConfig()                       // full guild.json
```

```typescript
interface Guild {
  readonly home: string
  apparatus<T>(name: string): T
  config<T = Record<string, unknown>>(pluginId: string): T
  guildConfig(): GuildConfig
  kits():        LoadedKit[]
  apparatuses(): LoadedApparatus[]
}
```

The guild instance is created by Arbor before apparatus start and is available throughout startup and at runtime. Calling `guild()` at module scope (before Arbor runs) throws with a clear error message. Always call it inside a handler or `start()`, never at import time.

For testing, `setGuild()` and `clearGuild()` are exported from `@shardworks/nexus-core` to wire a mock instance.

---

## Configuration

Plugin-specific configuration lives in `guild.json` under the plugin's derived id — the same id used in `requires` arrays and `guild().apparatus()` calls.

### Config in `guild.json`

Plugin config sections sit alongside the framework-level keys at the top level of `guild.json`. Because plugin ids are derived from package names, the standard apparatus get natural short keys — no special handling required:

```json
{
  "name":     "my-guild",
  "nexus":    "0.1.x",
  "plugins":  ["clockworks", "stacks", "animator", "..."],
  "settings": { "model": "claude-opus-4-5" },

  "codexes": {
    "settings": { "maxMergeRetries": 3 },
    "registered": { "my-app": { "remoteUrl": "git@github.com:patron/my-app.git" } }
  },
  "clockworks": {
    "events":        { ... },
    "standingOrders": [...]
  },
  "animator": {
    "sessionProvider": "claude-code"
  }
}
```

Third-party apparatus follow the same pattern under their derived id:

```json
{
  "acme/cache": {
    "ttl": 3600
  }
}
```

### Typed config via module augmentation (recommended)

`GuildConfig` types only the framework-level keys (`name`, `nexus`, `plugins`, `settings`, etc.). Plugin config sections are additional top-level keys that the base type doesn't model. The recommended approach is **module augmentation**: each plugin declares its config interface and augments `GuildConfig` so the section is typed.

```typescript
// In your plugin's types file:

export interface ClockworksConfig {
  maxConcurrent?: number;
  events?: Record<string, EventDeclaration>;
  standingOrders?: StandingOrder[];
}

declare module '@shardworks/nexus-core' {
  interface GuildConfig {
    clockworks?: ClockworksConfig;
  }
}
```

Once augmented, code that imports your plugin's types gets typed access through `guildConfig()` with no manual cast:

```typescript
// Inside apparatus start():
const config = guild().guildConfig().clockworks ?? {};
const maxConcurrent = config.maxConcurrent ?? 2;
```

The augmentation is visible wherever your plugin's types are imported — which is exactly where it matters: inside the plugin itself, and in any consuming plugin that imports your types.

**Guidelines:**
- Define the config interface in your plugin's public types file, alongside the API types.
- Export the config interface from your package barrel so consumers can import it.
- Make the augmented property optional (`clockworks?: ClockworksConfig`) — the section may not be present in guild.json.
- Ship the augmentation in the same file as the config interface. It takes effect when any type from that file is imported.

### `config<T>(pluginId)` (untyped fallback)

For cases where module augmentation is not practical (dynamic plugin ids, third-party plugins whose types you don't import), `guild().config<T>(pluginId)` provides untyped access:

```typescript
const cfg = guild().config<{ maxConcurrent?: number }>('clockworks');
```

Returns `guild.json[pluginId]` cast to `T`, or `{}` if no section exists. The generic type parameter is an unchecked assertion — the framework does not validate config shape.

Prefer module augmentation over `config<T>()` for any plugin you control. The augmented path gives you type safety without a cast at every call site.

### `guildConfig()`

Returns the full parsed `GuildConfig` — includes both framework-level fields (`name`, `nexus`, `plugins`, `settings`) and any plugin config sections added via module augmentation:

```typescript
const { settings } = guild().guildConfig()
```

---

## Lifecycle Hooks

Apparatus plugins subscribe to guild lifecycle events inside `start` via `ctx.on()`:

```typescript
apparatus: {
  start: (ctx) => {
    ctx.on("plugin:initialized",  (p)    => { ... })  // a kit or apparatus has finished loading
    ctx.on("guild:shutdown",      ()     => { ... })
  },
}
```

Handlers may be async. The framework awaits each handler in turn before invoking the next — handlers for the same event run sequentially, not concurrently. This gives each handler predictable execution order without requiring them to be synchronous.

The interface is open-ended — new lifecycle events do not require interface changes. Apparatuses subscribe to what they need.

**`plugin:initialized`** fires after each plugin (kit or apparatus) completes loading, with the loaded plugin record as its argument. Used by consuming apparatuses to register kit contributions reactively — see [Reactive Consumption](#reactive-consumption).

---

## Static vs. Dynamic Contributions

**Static contributions** — anything knowable at manifest-definition time — belong in the manifest. The framework reads manifests before any `start` is called.

Examples: kit contents, the `provides` object reference.

**Dynamic contributions** — things that require a running apparatus — are registered in `start`.

The Kit/Apparatus split makes this concrete: everything contributed by a kit is inherently static (kits have no `start`). Dynamic wiring can only happen inside an apparatus's `start()`. Prefer declaring contributions in a kit or `supportKit` over wiring them dynamically in `start` wherever possible — every contribution moved from a runtime hook into a kit declaration eliminates a lifecycle ordering concern.

---

## Failure Modes

**Missing dependency** — a plugin declares `requires: ["nexus-clockworks"]` and that plugin is not installed. Loud startup failure before any apparatus starts: *"nexus-spider requires nexus-clockworks, which is not installed."*

**Plugin provides nothing** — `guild().apparatus("nexus-git")` where the apparatus has no `provides`. Returns a sentinel; throws with a useful message on access.

**Bad cast** — `guild().apparatus<WrongType>("nexus-clockworks")`. Runtime error when the wrong method is called. Accepted tradeoff: the coupling is explicit in `requires` and visible in the type import; the developer takes responsibility for getting the type right.

---

## Installation

Installed plugins are declared in `guild.json`:

```json
{
  "plugins": [
    "nexus-clockworks",
    "nexus-spider",
    "nexus-surveyor",
    "nexus-stacks",
    "nexus-git"
  ]
}
```

The `"plugins"` key uses the internal term — users simply list package names. The framework determines whether each is a kit or apparatus at load time by inspecting the package manifest. No user-side declaration of the type is needed.

The framework loads plugins in declaration order, resolves the dependency graph, validates all `requires` declarations, and calls `start` on each apparatus in dependency-resolved order. All kits are loaded and cached before any apparatus starts, ensuring that kit contributions are available when apparatus `start()` handlers run. `nsg init` populates a default plugin set; additional plugins are added via `nsg install`.

### CLI Surface

```sh
nsg install nexus-clockworks
nsg install nexus-git
nsg remove  nexus-git
```

The `nsg install` command does not require specifying kit or apparatus — the package declares what it is. The distinction surfaces in `nsg status`, where apparatuses and kits appear in separate sections: apparatuses as running infrastructure, kits as passive capability inventory.

---

## Future Enhancements

### Apparatus Health Checks

A `health()` method on `Apparatus` is a natural addition once operational tooling matures:

```typescript
health?: () => "ok" | "degraded" | "down"
```

This would enable `nsg status` to report live apparatus health, and give operators a fast signal when infrastructure is degraded without needing to inspect logs. Deferred until there is a concrete operational need to drive the contract design.

### Dynamic Kit Discovery in Handlers

The current model supports tool-to-tool calls via direct import — if a handler needs the logic from another tool in a known kit, it imports that handler function directly. No framework involvement is required for this case.

A second pattern — dynamic discovery of kit contributions at handler invocation time — is not yet supported. This would allow a handler to discover all installed contributions of a given type without knowing which kits are present at author time (e.g., "run all installed pre-commit hooks"). A `guild().fromKit(type, name?)` or similar API is the likely shape. Deferred until a concrete use case motivates the contract.

=== CONTEXT FILE: docs/architecture/kit-components.md ===
# Kit Components: Tools, Engines & Relays

This document describes the artifact model for the guild's installable capabilities — how tools, engines, and relays are structured, packaged, installed, and resolved. All three follow the same packaging pattern: a descriptor file, an entry point, and a registration entry in `guild.json`. For the broader system architecture, see [overview.md](overview.md). For how relays work within the Clockworks, see [clockworks.md](clockworks.md). For anima composition artifacts (curricula and temperaments), see [anima-composition.md](anima-composition.md).

---

## What they are

**Tools** are instruments wielded by animas during work — operations that animas invoke to interact with guild systems, query information, record notes, and perform operations. A tool can optionally ship with an instruction document (`instructions.md`) that is delivered to the anima when manifested for a session.

Tools are accessible through multiple paths: animas invoke them as MCP tools during sessions; humans invoke them via the `nexus` CLI; relays and other tools can import them programmatically. All paths execute the same logic with the same inputs and outputs — the tool author writes the logic once.

**Engines** are the workhorse components of rigs — the units of work the Spider mounts and sets in motion. An engine does one bounded piece of work, runs when its upstream dependencies are satisfied, and produces a yield when done. Kits contribute engine designs; the Spider draws on them to extend rigs as needed. An engine may be clockwork (deterministic, no anima required) or quick (inhabited by an anima for work requiring judgment). Engines are described by a `nexus-engine.json` descriptor.

**Relays** are Clockworks handlers — purpose-built to respond to events via standing orders. A relay exports a standard `relay()` contract that the Clockworks runner calls. All relays are clockwork. See [clockworks.md](clockworks.md) for the relay contract and standing order mechanics. Relays are described by a `nexus-relay.json` descriptor.

---

## Tool architecture

### The handler model

Every tool is, at its core, a **handler with a defined contract** — inputs, outputs, and the logic between them. The framework provides access paths:

```
┌─────────────────────────────────────┐
│  TOOL (what the author writes)      │
│                                     │
│  handler — a script or module       │
│  instructions.md — anima guidance   │
└──────────────┬──────────────────────┘
               │
    ┌──────────┼──────────┐
    │          │          │
  MCP        CLI       import
  (animas)  (humans)  (engines/relays)
    │          │          │
  same input → same code → same output
```

- **MCP** — The manifest engine configures an MCP server that exposes tools as typed, callable tools. The anima sees them as native tools alongside built-in tools like Read, Write, and Bash.
- **CLI** — The `nsg` CLI exposes tools as noun-verb subcommands (`nsg commission create`, `nsg tool install`, etc.).
- **Import** — Engines, relays, and other tools can import module-based handlers directly.

### Two kinds of tools

Tools come in two kinds, determined by the `kind` field in the descriptor (or inferred from the entry point):

#### `module` — a JavaScript/TypeScript module

The entry point exports a handler with a typed schema using the Nexus SDK:

```typescript
import { tool } from "@shardworks/nexus-core";
import { z } from "zod";

export default tool({
  description: "Look up an anima by name",
  params: {
    name: z.string().describe("Anima name"),
  },
  handler: async ({ name }, { home }) => {
    // look up anima using home to find the guild...
    return { found: true, status: "active" };
  },
});
```

The `tool()` factory wraps the params into a Zod object schema and returns a `ToolDefinition` — a typed object that the framework can introspect. The handler receives two arguments: validated params (typed from the Zod schemas) and a framework-injected context (`{ home }` — the guild root path).

For MCP, the Nexus MCP engine dynamically imports the module, reads `.params.shape` for the tool's input schema, and wraps `.handler` as the tool callback. For CLI, Commander options can be auto-generated from the Zod schema. For direct import, other code calls `.handler` as a function.

#### `script` — an executable script

The entry point is any executable — shell script, Python, compiled binary:

```bash
#!/usr/bin/env bash
# get-anima — look up an anima by name
GUILD_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
echo "$(sqlite3 "$GUILD_ROOT/.nexus/nexus.db" "SELECT * FROM animas WHERE name = '$1'" -json)"
```

Scripts receive arguments as CLI args and return results on stdout (plain text or JSON). The framework wraps them for MCP by shelling out to the script when the tool is called. For CLI, the `nexus` command delegates to the script directly.

This is the lowest-ceremony path — a tool can be a bash script with a one-line descriptor. No SDK, no TypeScript, no build step.

#### Kind inference

If `kind` is not specified in the descriptor, the framework infers it from the entry point:

| Entry point | Inferred kind |
|-------------|---------------|
| `.js`, `.mjs`, `.ts`, `.mts` | `module` |
| `.sh`, `.bash`, `.py`, or executable without extension | `script` |

An explicit `kind` always wins. Inference is a convenience, not magic — if the file extension is ambiguous, specify the kind.

### The MCP engine

Animas don't connect to individual MCP servers per tool. Instead, Nexus provides a single framework engine — the **MCP engine** — that runs as one stdio process per anima session. At session start, the manifest engine determines which tools the anima has access to (based on all of the anima's roles — see [role gating](#role-gating)), then launches the MCP engine configured with that set. The MCP engine loads each tool's handler (importing modules directly, wrapping scripts as shell-out calls) and registers them all as tools.

One process. All the anima's tools. Claude's runtime spawns it at session start and kills it at session end — no daemon management, no manual start/stop.

```
Session starts
  → manifest engine resolves tools for anima's roles
  → launches MCP engine with that tool set
  → Claude connects to MCP engine over stdio

Anima calls dispatch(...)
  → JSON-RPC over stdin to MCP engine
  → MCP engine calls dispatch handler
  → result back over stdout

Anima calls get_anima(...)
  → same process, same pipe

Session ends
  → Claude kills MCP engine process
```

Third-party MCP servers (GitHub, databases, external services) can be connected alongside the guild's MCP engine if needed. The manifest engine configures all of them as part of session setup.

### MCP as a standard protocol

[MCP (Model Context Protocol)](https://modelcontextprotocol.io/) is a standard for connecting AI agents to tools. An MCP server exposes typed, callable tools over a standardized protocol (JSON-RPC over stdio). The agent's runtime connects to the server, discovers its tools, and makes them available as native tool calls — typed parameters in, structured results out. No CLI argument parsing or stdout scraping by the agent.

Nexus uses MCP as the transport layer between animas and tools. The tool author doesn't need to know MCP exists — the framework handles the protocol. But because it's a standard, it also means:

- Third-party MCP servers work alongside guild tools with no wrapping
- Guild tools could be used by non-Nexus MCP clients if needed
- Schema validation happens at the protocol level — bad calls fail fast with clear errors

### Instructions: what MCP doesn't provide

MCP exposes three pieces of metadata about a tool: its **name**, a brief **description**, and the **parameter schema** (types, defaults, constraints). This is a reference card — enough to call the tool correctly. It is not enough to call the tool **wisely**.

A tool's `instructions.md` is an optional teaching document that is delivered to the anima as part of its composed identity (system prompt), not as MCP metadata. It provides what a reference card cannot:

- **When to use the tool** — "Always consult the Master Sage before dispatching to artificers"
- **When NOT to use it** — "Don't dispatch if the commission spec lacks acceptance criteria"
- **Workflow context** — "After dispatching, record the commission ID in your notes for the handoff"
- **Judgment guidance** — "Use priority:urgent sparingly — it preempts other work. Include justification in the spec"
- **Institutional conventions** — "Specs should follow the guild's spec format: problem statement, acceptance criteria, constraints"
- **Interaction with other tools** — "If dispatch returns a conflict, use get-anima to check the anima's current commission before retrying"

The MCP schema tells the anima what buttons a tool has. The instructions teach the **craft of using it** — when to reach for it, what judgment to apply, how it fits into the guild's workflows.

Not every tool needs instructions. A simple query tool (`anima-show`) may be fully described by its MCP schema and parameter descriptions. Instructions matter most for tools that require judgment: `commission-create`, `signal`, `anima-create` — tools where knowing the API isn't enough.

Instructions are also **institutional, not intrinsic**. The MCP schema is the tool's own contract — the same everywhere. Instructions reflect the guild's teaching about how to use the tool, and they compose with the rest of the anima's identity (codex, curriculum, temperament). The same tool installed in two different guilds could have different instructions reflecting different policies and workflows.

---

## The descriptor file

Every artifact has a descriptor at its root:

- **`nexus-tool.json`** for tools
- **`nexus-engine.json`** for engines and relays

### Schema

Required fields marked with `*`:

```json
{
  "entry": "index.js",                    // * entry point
  "kind": "module",                       // "module" or "script" (inferred from entry if omitted)
  "instructions": "instructions.md",      // tools only — delivered to animas (optional)
  "version": "1.11.3",                    // upstream version (semver)
  "description": "Post commissions and trigger the manifest engine",
  "repository": "https://github.com/nexus/dispatch",
  "license": "MIT",
  "nexusVersion": ">=0.1.0"              // compatible Nexus version range
}
```

Only `entry` is required. All other fields are optional.

There is no `name` field — the **directory name is the tool's identity**. After installation, the directory name (`dispatch/`, `my-relay/`) is the canonical name. During installation from npm, the directory name is derived from the package name (strip scope: `@shardworks/dispatch` → `dispatch`) or specified with `--name`.

### Kind

The `kind` field tells the framework what shape the entry point is:

| Kind | Entry point | MCP engine behavior | CLI behavior |
|------|-------------|--------------------|-|
| `module` | JS/TS module exporting a Nexus tool | Imports handler, registers as typed tool | Auto-generates Commander options from Zod schema |
| `script` | Any executable | Wraps as shell-out call | Delegates directly |

If `kind` is omitted, it is inferred from the entry point's file extension (see [kind inference](#kind-inference)). An explicit `kind` always takes precedence.

### `package.json` fallback

If a `package.json` also exists in the package, the descriptor fields take precedence. Fields present only in `package.json` (e.g. `version`, `description`, `repository`) are used as fallbacks. This means:

- An npm package can omit duplicated fields from the descriptor and let `package.json` provide them
- A hand-built tool with no `package.json` puts everything in the descriptor
- Either way, the installer resolves from the same merged view

For `entry` specifically: if absent from the descriptor, the installer falls back to `package.json`'s `main` / `exports` / `bin`.

---

## On-disk layout

Each artifact occupies a single directory named after the artifact:

```
GUILD_ROOT/
  tools/
    commission-create/
      nexus-tool.json           →  { "entry": "handler.js", ... }
      instructions.md
    tool-install/
    tool-remove/
    anima-create/
    my-tool/
      nexus-tool.json
      instructions.md
  engines/
    sealing/
      nexus-engine.json         →  { "entry": "index.js", ... }
    open-draft-binding/
      nexus-engine.json
    ci-check/
      nexus-engine.json
  relays/
    summon/
      nexus-relay.json          →  exports relay() default
    notify-patron/
    cleanup-worktree/
  nexus/
    migrations/
      001-initial-schema.sql
```

All artifacts share the same directory structure regardless of origin. Each directory contains a descriptor, and optionally an entry point, instructions, and other files depending on the artifact type and how it was installed.

For **registry** and **git-url** installs, only metadata (descriptor + instructions) is copied to the artifact directory — the runtime code lives in `node_modules/`, managed by npm. For **workshop** and **tarball** installs, the full package source is copied for durability. For **link** installs, only metadata is in the directory — the runtime code is symlinked from the developer's local directory.

All provenance and routing metadata lives in `guild.json`.

---

## Role gating

Tools are gated by role — an anima only has access to tools permitted by its roles. An anima may hold **multiple roles** (e.g. both artificer and sage), and its available tools are the **union** of all tools permitted across all of its roles.

Tools are registered in `guild.json` and assigned to roles:

```json
{
  "baseTools": ["nexus-version"],
  "roles": {
    "steward": {
      "seats": 1,
      "tools": ["commission-create", "commission-list", "anima-create", "tool-install", "signal"],
      "instructions": "roles/steward.md"
    },
    "artificer": {
      "seats": null,
      "tools": ["commission-show", "complete-session", "fail-writ", "create-writ", "list-writs", "show-writ", "signal"],
      "instructions": "roles/artificer.md"
    }
  },
  "tools": {
    "commission-create": {
      "upstream": "@shardworks/nexus-stdlib",
      "package": "@shardworks/nexus-stdlib",
      "installedAt": "2026-03-25T12:00:00Z",
      "bundle": "@shardworks/guild-starter-kit@0.1.0"
    }
  }
}
```

At manifest time, the manifest engine computes the tool set:

```
Anima "Valdris" has roles: [artificer, steward]

  nexus-version    — baseTools              → all animas     ✓
  commission-show  — roles: [artificer]     → artificer      ✓
  signal           — roles: [artificer, steward] → both match ✓
  commission-create — roles: [steward]      → steward matches ✓
  tool-install     — roles: [steward]       → steward matches ✓
  create-writ      — roles: [sage]          → no match       ✗

  Valdris gets: [nexus-version, commission-show, signal, commission-create, tool-install]
```

The MCP engine is launched with this resolved set. The anima sees exactly the tools its combined roles permit — no more, no less.

Engines and relays do not have role gating — they are not wielded by animas directly. Their `guild.json` entries have no role assignments:

```json
{
  "engines": {
    "sealing": {
      "upstream": "@acme/sealing-engine@1.0.0",
      "package": "@acme/sealing-engine",
      "installedAt": "2026-03-23T12:00:00Z"
    },
    "open-draft-binding": {
      "upstream": "@acme/open-draft-engine@1.0.0",
      "package": "@acme/open-draft-engine",
      "installedAt": "2026-03-23T12:00:00Z"
    }
  },
  "relays": {
    "summon": {
      "upstream": "@shardworks/relay-summon@0.1.11",
      "package": "@shardworks/relay-summon",
      "installedAt": "2026-03-23T12:00:00Z"
    },
    "cleanup-worktree": {
      "upstream": "@shardworks/relay-cleanup@0.1.11",
      "package": "@shardworks/relay-cleanup",
      "installedAt": "2026-03-23T12:00:00Z"
    }
  }
}
```

---

## Installation

### The `tool-install` tool

`tool-install` is a stdlib tool for installing new tools, engines, relays, and bundles. It accepts a polymorphic **tool source** argument and classifies it into one of five install types:

| Source pattern | Type | Example |
|----------------|------|---------|
| `--link` flag + local dir | link | `nsg tool install ~/projects/my-tool --link` |
| `workshop:<name>#<ref>` | workshop | `nsg tool install workshop:forge#tool/fetch-jira@1.0` |
| Starts with `git+` | git-url | `nsg tool install git+https://github.com/someone/tool.git#v1.0` |
| Ends with `.tgz` or `.tar.gz` | tarball | `nsg tool install ./my-tool-1.0.0.tgz` |
| Everything else | registry | `nsg tool install some-tool@1.0`, `nsg tool install @scope/tool` |

The install process:

1. Classify the source and install via npm (or symlink for link mode)
2. Find and validate the descriptor (`nexus-tool.json` or `nexus-engine.json`)
3. Determine the artifact name (from `--name`, or derived from package name)
4. Copy metadata or full source to the artifact directory (depending on install type)
5. Register in `guild.json` under `tools`, `engines`, or `relays` as appropriate (determined by descriptor type and module shape)
6. Commit to the guild

Both the CLI (`nsg tool install`) and the MCP tool (wielded by animas) share the same core logic.

### Framework artifacts: workspace packages

Base tools, engines, and relays are separate packages in the Nexus monorepo — each one a complete artifact with its own descriptor, handler module, and (for tools) instructions document. They follow the same artifact shape as any guild-authored component; they just happen to be maintained alongside the framework.

The monorepo is structured as a pnpm workspace:

```
packages/
  core/                          ← @shardworks/nexus-core — shared library (Books, config, paths, install logic)
  cli/                           ← @shardworks/nexus — the CLI operators run
  stdlib/                        ← @shardworks/nexus-stdlib — all standard tools, engines, and relays
  guild-starter-kit/             ← @shardworks/guild-starter-kit — bundle manifest
```

`nsg init` installs base tools, engines, and relays via the guild starter kit bundle, registering them in `guild.json` with bundle provenance.

---

## Local development

During development, use `--link` to symlink a local tool directory into the guild:

```
nsg tool install ~/projects/my-tool --link --roles artificer
```

Changes to the handler are reflected immediately — no reinstall needed. When done iterating, reinstall via a durable method (registry, tarball, workshop).

The simplest possible guild tool is a shell script and a one-line descriptor:

```
my-tool/
  package.json            →  { "name": "my-tool", "version": "0.1.0" }
  nexus-tool.json         →  { "entry": "run.sh" }
  run.sh                  →  #!/usr/bin/env bash ...
```

No SDK, no TypeScript, no build step. The framework infers `kind: "script"` from the `.sh` extension, wraps it for MCP automatically, and the anima can call it as a typed tool.

### Animas building kit components

An anima commissioned to build a new tool or relay works in a workshop worktree like any other commission. When the commission completes:

1. Leadership reviews the output
2. `nsg tool install workshop:forge#tool/my-tool@0.1.0` installs it into the guild from the workshop repo
3. The artifact is now operational — registered in `guild.json`, full source stored in the artifact directory, resolved by the manifest engine

The guildhall is never a workspace — artifacts flow in through deliberate install operations. Since `tool-install` is itself a tool, animas with appropriate access (stewards) can install artifacts directly — enabling the guild to extend its own toolkit autonomously.

---

## Comparison

| | Tools | Engines | Relays |
|---|---|---|---|
| Purpose | Instruments animas wield | Rig workhorses (Spider mounts them) | Clockworks handlers |
| Invoked by | Animas (MCP), humans (CLI), code (import) | Spider (event-driven within a rig) | Clockworks runner (standing order) |
| Descriptor | `nexus-tool.json` | `nexus-engine.json` | `nexus-relay.json` |
| SDK factory | `tool()` | none required (engine logic is the rig work) | `relay()` |
| Instructions doc? | Optional (anima guidance) | No | No |
| Role gating? | Yes | No | No |
| Standard contract? | Yes (MCP) | via rig yield/needs interface | Yes (`relay()`) |
| Triggerable by standing orders? | No | No | Yes (`run:`) |

=== CONTEXT FILE: docs/architecture/_agent-context.md ===
# Agent Context: Architecture Doc Codebase Scan

> **Purpose:** Notes for agents working on `docs/architecture/index.md` so they don't have to re-scan the codebase from scratch. Written during the initial scaffolding session (2026-03-31). May drift from reality — treat as orientation, not ground truth.

---

## Repo Layout

The Nexus framework lives at `/workspace/nexus/`. Key directories:

```
/workspace/nexus/
  packages/               ← TypeScript packages (pnpm workspace)
  docs/
    architecture/         ← THIS IS WHERE YOU ARE
    reference/            ← API reference (core-api.md, schema.md, event-catalog.md, conversations.md)
    guides/               ← How-to guides (building-engines.md, building-tools.md)
    guild-metaphor.md     ← Conceptual vocabulary; read this first
    philosophy.md         ← Project "why"
```

The live guild workspace (where animas operate) is at `/workspace/shardworks/`.

The patron-side sanctum (experiments, session notes, Coco config) is at `/workspace/nexus-mk2/`.

---

## Packages

| Package | npm name | What it is |
|---------|----------|------------|
| `core` | `@shardworks/nexus-core` | Shared library — Books, config, path utilities, writ/anima/event functions, `tool()` and `engine()` SDK factories, `Rig` type |
| `arbor` | `@shardworks/nexus-arbor` (approx) | Guild runtime object — loads plugins (currently "rigs"), manages tool registry, owns Books database connection |
| `cli` | `@shardworks/nexus` | The `nsg` CLI binary |
| `nexus-clockworks` | `@shardworks/nexus-clockworks` | Clockworks as a rig — contributes clockworks tools and events/dispatches Books tables |
| `nexus-sessions` | `@shardworks/nexus-sessions` | Sessions as a rig — contributes session tools and sessions Book |
| `guild-starter-kit` | `@shardworks/guild-starter-kit` | Starter bundle — curricula, temperaments, migration snapshots |
| `claude-code-apparatus` | `@shardworks/claude-code-apparatus` | Session provider implementation for Claude Code / claude CLI |
| `stdlib` | `@shardworks/nexus-stdlib` | Standard tools, engines, relays |

---

## The Rig Terminology Collision

**This is the most important thing to understand before touching this doc.**

The word "rig" means two completely different things in this codebase:

| Context | Meaning |
|---------|---------|
| **Guild metaphor / target architecture** | The execution scaffold assembled to fulfill a commission — seeded at commission time, built out by Spider with engines, struck when work is done |
| **Current code** (`Rig` type in `core/src/rig.ts`, loaded by Arbor) | A package contributing tools, Books declarations, and other capabilities to the guild — basically what the target architecture calls a Kit or Apparatus |

The current code's `Rig` is what we're moving toward calling a **Kit** (or Apparatus, for packages with a lifecycle). This rename is in progress. When reading source code, mentally substitute "plugin" for `Rig`.

The architecture docs use "rig" exclusively in the metaphor sense (execution scaffold). The source code uses it in the plugin sense. Both are in the same repo. Don't mix them up.

---

## Architecture Docs Status

### Exists and reasonably current

| Doc | Status | Notes |
|-----|--------|-------|
| `architecture/plugins.md` | Good | Describes the Kit/Apparatus model with full type signatures. This is aspirational architecture, not fully implemented. |
| `architecture/clockworks.md` | Good | Detailed; covers events, standing orders, relays, runner phases, daemon. Generally matches current implementation. |
| `architecture/kit-components.md` | Good | Tools, engines, relays — artifact model, descriptors, role gating, installation. Generally accurate. |
| `architecture/rigging.md` | Forward-looking | Describes Spider/Fabricator/Executor/Loom/Animator/Clerk as separate apparatus. This is the *target* design; currently much of this logic is either in core or not yet implemented. |
| `reference/schema.md` | Good | SQLite schema, ERD, entity ID prefixes. Reflects current database. |
| `reference/core-api.md` | Good | Function signatures for `@shardworks/nexus-core`. Generally accurate but some functions are in `legacy/1/` indicating in-flight migration. |
| `reference/event-catalog.md` | Not read | Should describe all framework events and payload shapes. |
| `guides/building-engines.md` | Good | How to write a clockwork engine. Code examples use `engine()` factory from nexus-core. Accurate for current implementation. |
| `guides/building-tools.md` | Not read | Parallel to building-engines.md for tools. |

### Outdated / moved

| Doc | Status | Notes |
|-----|--------|-------|
| `outdated-architecture/overview.md` (in nexus-mk2) | Outdated | Long overview doc from before the apparatus/kit fragmentation. Useful for historical context and some section content (instruction environment, data storage breakdown). Don't trust its package names or directory structures. |

### Exists in nexus-mk2 future/ but not yet written

| Doc | Where referenced | What it should cover |
|-----|-----------------|---------------------|
| `anima-composition.md` | kit-components.md | Curricula, temperaments, oaths — composition artifacts |
| `writs.md` | multiple places | Writ lifecycle, completion rollup, prompt templates, commission→mandate bridge |
| `engine-designs.md` | plugins.md, future/ | SpiderKit engine design specifications |
| `anima-lifecycle.md` | future/ | Anima states, instantiation, retirement |

---

## What's Implemented vs. Aspirational

The codebase is in active transition from a "rig-centric" model (current) toward the full "apparatus/kit" plugin model (target).

### Currently implemented (in actual packages)

- `Rig` type as the plugin interface (tools + books declarations)
- Arbor as the rig loader and runtime object
- Clockworks as a nexus-sessions-style rig (contributes tools + Books)
- Sessions as a rig (contributes tools + Books)
- `tool()` and `engine()` SDK factories in nexus-core
- SQLite Books database with schema migrations
- Standing orders, event queue, Clockworks daemon
- Writ lifecycle (create, activate, complete, fail, cancel)
- Anima instantiation, roster, role assignments
- Commission → mandate writ → dispatch flow
- Session funnel (manifest → MCP engine launch → session record)
- Session providers (pluggable; claude-code-apparatus exists)

### Target architecture (described in docs, not yet fully built)

- Formal `Plugin` type with explicit Kit/Apparatus discriminant
- `Apparatus` with `start`/`stop`/`health`/`supportKit`/`consumes`
- `GuildContext` with `ctx.plugin()`, `ctx.kits()`, `ctx.plugins()`
- Separate named apparatus: Stacks, Guildhall, Clerk, Loom, Animator, Fabricator, Spider, Executor, Surveyor, Warden
- Spider-driven rig execution (the commission → rig → engine chain)
- Fabricator (capability resolution from installed kits)
- `plugin:initialized` reactive consumption
- Startup validation with `requires` / `consumes` cross-referencing

---

## Key Files to Read

If you're working on a specific section of the architecture doc, start with:

| Section | Most relevant files |
|---------|-------------------|
| Plugin Architecture | `docs/architecture/plugins.md`, `packages/arbor/src/arbor.ts` |
| The Books | `docs/reference/schema.md`, `packages/core/src/book.ts`, `packages/arbor/src/db/` |
| Animas | `packages/core/src/legacy/1/anima.ts`, `guild-metaphor.md` (Anima section) |
| Work Model | `packages/core/src/legacy/1/writ.ts`, `docs/reference/schema.md` (writs table), `clockworks.md` |
| Kit Components | `docs/architecture/kit-components.md`, `packages/core/src/tool.ts` |
| Sessions | `packages/plugins/claude-code/src/`, `docs/reference/conversations.md` |
| Clockworks | `docs/architecture/clockworks.md`, `packages/nexus-clockworks/src/` |
| Rigging | `docs/architecture/rigging.md` (aspirational), `packages/arbor/src/arbor.ts` (current) |

---

## guild.json Shape

The V2 type (`GuildConfig` in `packages/core/src/guild-config.ts`) defines the framework keys. All other top-level keys are plugin configuration sections, keyed by derived plugin id.

**Framework keys:** `name`, `nexus`, `plugins` (string array), `settings` (object with `model`, `autoMigrate`).

**Plugin config keys (standard guild):** `clockworks`, `codexes`, `roles`, `baseTools` — owned by their respective apparatus, not by the framework. They sit at the top level because `@shardworks/clockworks` → `clockworks`, `@shardworks/codexes-apparatus` → `codexes`, etc.

Note: the live guild at `/workspace/shardworks/` is still running the V1 config shape (per-capability registries: `tools`, `engines`, `curricula`, `temperaments` as objects, no `plugins` array). V2 has `plugins` as a flat string array and drops per-capability registries. The architecture docs describe V2.

---

## Terminology Quick Reference

| Term in metaphor | Term in code (current) | Term in target architecture |
|-----------------|----------------------|----------------------------|
| Rig (execution scaffold) | (not yet implemented) | Rig |
| Kit / Apparatus | Rig (plugin package) | Kit / Apparatus |
| The Books | nexus.db / SQLite tables | The Stacks (`books` apparatus) |
| Summon relay | built-in clockworks dispatch | summon relay (installed via nexus-stdlib) |
| Arbor | Arbor | Arbor |
| Spider | (not yet implemented) | The Spider (`spider` apparatus) |
| Fabricator | (not yet implemented) | The Fabricator (`fabricator` apparatus) |

---

## Session Notes

- **2026-03-31 (session 1):** Initial scaffold session. Wrote §1–4 scaffold + "Standard Guild" bridge section. Created this context doc. Architecture doc is at `docs/architecture/index.md`. Companion detailed docs are already written for clockworks, plugins, kit-components, and rigging — they're good references even if partially aspirational.

- **2026-03-31 (session 2):** Wrote §2 content (intro paragraph, ASCII diagram, narrative subsections). Scoped §2 explicitly as the "standard guild" — blockquote caveat added before the intro paragraph. Established the intended narrative arc: §2 gives the standard-guild mental model → §4 peels it back ("everything in §2 is a plugin, there is no privileged built-in layer") → Standard Guild bridge lists the defaults → detail sections proceed without hedging. **When writing §4**, open with a callback to §2: *"The apparatus described in §2 — Clerk, Spider, Clockworks, and the rest — are all plugins..."* This converts §2 into setup and §4 into the architectural reveal.

- **2026-03-31 (session 3):** Completed §3 (Guild Root) and §4 (Plugin Architecture). Corrected `guild.json` key names from real V2 type. Documented real `.nexus/` contents. Identified and resolved a plugin configuration specification gap — see design decisions below. Rewrote §4 with the §2 callback opening, corrected Kit/Apparatus examples (new naming convention, correct manifest shape), added Plugin IDs and Configuration subsections, updated GuildContext/HandlerContext interfaces with `config<T>()` and `guildConfig()`. Cleaned up Standard Guild table (dropped Guildhall, dropped layer column, added plugin id column, updated Stacks description). Restructured `guild.json` section to separate framework keys (`name`, `nexus`, `plugins`, `settings`) from plugin config sections (everything else, keyed by plugin id). Updated `plugins.md` spec with Plugin IDs section, Configuration section, and updated context interfaces.

---

## Design Decisions (session 3)

### Plugin name derivation

Plugin ids are derived from npm package names with three rules applied in order:
1. Strip `@shardworks/` scope entirely (bare name)
2. Retain other scopes as prefix without `@` (`@acme/foo` → `acme/foo`)
3. Strip trailing `-(plugin|apparatus|kit)` suffix

This means `@shardworks/clockworks` → `clockworks`, `@shardworks/books-apparatus` → `books`, `@acme/cache-apparatus` → `acme/cache`. Documented in `plugins.md` (Plugin IDs section). **Not yet implemented** — see implementation plan.

### Plugin configuration access

Config sections live at the top level of `guild.json` under the plugin's derived id. Because `@shardworks/clockworks` → `clockworks`, the Clockworks apparatus gets `guild.json["clockworks"]` naturally — no privileged handling.

Access is via `guild().config<T>(pluginId)` — always requires an explicit plugin id (no implicit scoping). `guild().guildConfig()` is the escape hatch for framework-level fields.

Documented in `plugins.md` (Plugin IDs section + Configuration section). **Implemented** in session 4.

### guild() singleton — replaces HandlerContext

**Problem identified:** `HandlerContext` was injected into tool handlers as a second parameter, but the MCP server created a broken stub (all methods threw), and the pattern required a context factory in Arbor, the CLI, and the CDC registry.

**Decision:** Replace with a process-level singleton `guild()` from `@shardworks/nexus-core`. All plugin code — apparatus `start()`, tool handlers, CDC handlers — calls `guild()` to access `home`, `apparatus()`, `config()`, `guildConfig()`, `kits()`, `apparatuses()`.

Arbor creates the `Guild` instance before starting any apparatus (backed by the live `provides` Map, so dependency ordering works). `setGuild()` and `clearGuild()` are exported for testing.

`HandlerContext` and `GuildContext` removed from plugin.ts. `createHandlerContext` removed from Arbor interface. `createMinimalHandlerContext` removed from CLI. Tool handler signature: `(params) => unknown | Promise<unknown>` — no context parameter.

### GuildContext → StartupContext

**Problem:** `GuildContext` (passed to apparatus `start()`) overlapped with `guild()` — same methods (`apparatus()`, `config()`, `home`, etc.), different scoping behavior. Two contexts with similar methods but different semantics is confusing.

**Decision:** Strip `GuildContext` down to `StartupContext` with a single method: `on(event, handler)` for lifecycle event subscription. All other guild access in `start()` goes through `guild()`, same as everywhere else. No overlap, no confusion.

### GuildConfigV2 → GuildConfig

Renamed everywhere. Dropped V2 suffixes from `createInitialGuildConfig`, `readGuildConfig`, `writeGuildConfig`. Legacy V1 `GuildConfig` untouched in its own module scope (`legacy/1/guild-config.ts`).

### CDC handlers — no context injection

CDC handlers (`ChangeHandler`) no longer receive a context parameter. They capture dependencies via closure from the `start()` scope where they're registered. Signature: `(event: ChangeEvent<T>) => Promise<void> | void`.

---

## Next Steps for Architecture Doc (`index.md`)

### Completed sections
- **§1 Introduction** ✅
- **§2 System at a Glance** ✅ — scoped as standard guild, ASCII diagram, narrative subsections
- **§3 The Guild Root** ✅ — directory structure, guild.json (framework keys + plugin config), .nexus/ runtime state
- **§4 Plugin Architecture** ✅ — §2 callback, Kit/Apparatus examples, Plugin IDs, guild() singleton, StartupContext, Installation
- **The Standard Guild** ✅ — apparatus table (plugin ids) and kit table
- **The Books** ✅ — Stacks apparatus, document model, API surface, CDC, backend
- **Kit Components** ✅ — tools/engines/relays, comparison table, link to kit-components.md

### Remaining stub sections
All are `<!-- TODO -->` blocks. In rough priority order:

1. **Work Model** — Commission → Mandate writ → child writs → Rigs. Writ lifecycle states (`ready → active → pending → completed/failed/cancelled`). Writ hierarchy and completion rollup. Brief rig intro (Spider assembles from engine designs via Fabricator). Link to `rigging.md`.

2. **The Clockworks** — Abbreviate; `clockworks.md` is detailed and current. Cover: events as immutable facts, standing orders as guild policy, summon verb, framework vs custom events, runner (manual vs daemon), error handling. Link to `clockworks.md`.

3. **Animas** — MVP: no identity layer. Composition is per-role, not per-anima. The Loom weaves caller-provided system prompt into a session context (pass-through for MVP). Future: anima identity records, curricula, temperaments, states (active/retired). Keep section light on implementation since apparatus are being designed.

4. **Sessions** — Session funnel. Triggered by summon relay or `nsg consult`. Loom → Animator → AI process → result recorded. Session providers (pluggable). System prompt vs initial prompt. Bare mode. Link to `reference/conversations.md`.

5. **Core Apparatus Reference** — Quick-reference table with plugin ids, package names, API surface hints, links to detailed docs.

### Implementation work (not architecture doc)
- **guild() singleton** ✅ — implemented in session 4. `Guild` interface, `setGuild`/`clearGuild`, Arbor wiring, all handlers migrated.
- **GuildContext → StartupContext** ✅ — implemented in session 4. HandlerContext removed. createHandlerContext removed from Arbor.
- **GuildConfigV2 → GuildConfig** ✅ — renamed everywhere in session 4.
- **Plugin rename** — standard apparatus packages should be renamed to match new naming convention (e.g. `@shardworks/nexus-clockworks` → `@shardworks/clockworks`). Not yet commissioned. Scope TBD.
- **The Instrumentarium** — specs at `apparatus/instrumentarium.md`. Not yet implemented.
- **Loom MVP** — specs at `apparatus/loom.md`. Not yet implemented.
- **Animator MVP** — specs at `apparatus/animator.md`. Not yet implemented.

---

## Design Decisions (session 4)

### New apparatus: The Instrumentarium (`tools`)

**Problem:** Tools are currently owned by Arbor (`listTools()`, `findTool()`), but Arbor's design goal is "plugin loader only." Tools need a home that both the session layer (Loom/Animator) and the CLI can depend on, without coupling either to anima identity.

**Decision:** Create a new apparatus — **The Instrumentarium** (plugin id `tools`, package `@shardworks/tools-apparatus`). It owns:
- Tool registry — scanning kit `tools` contributions and apparatus `supportKit` tools at startup
- Role-gating resolution — given a set of roles + baseTools, return the resolved tool set
- CLI tool discovery — `nsg <tool>` resolves through The Instrumentarium

The Instrumentarium has no dependency on animas, sessions, or composition. Both The Loom and the CLI depend on it independently. Apparatus that need to invoke tools programmatically depend on it.

`consumes: ["tools"]` — scans kit and supportKit contributions for tool definitions.

### Loom MVP — composition without identity

**Problem:** Full anima composition (identity lookup → curriculum resolution → temperament resolution → charter + tool instructions) requires several systems that don't exist yet. But The Animator needs *some* composed context to launch sessions.

**Decision:** MVP Loom is a pass-through — the caller provides the system prompt and optional initial prompt. The Loom packages them into a `WovenContext` that The Animator consumes. No role resolution, no tool instructions, no file reading, no identity lookup.

The Loom exists as a separate apparatus even at MVP so that The Animator never assembles prompts itself. As composition grows (role instructions, tool instructions, curricula, temperaments, charter), The Loom's internals change but its output shape (`WovenContext`) stays stable — The Animator is unaffected.

### Animator MVP

**Decision:** MVP Animator takes a `WovenContext` (from Loom) + a working directory and:
1. Launches a session provider (e.g. `claude-code-apparatus`) with the system prompt
2. Monitors the process
3. Records the session result to The Stacks (sessions book)

No MCP tool server, no Instrumentarium dependency, no role awareness in MVP. Tool-equipped sessions with MCP are documented as future state in `apparatus/animator.md`.

### Dependency graph (MVP)

```
The Stacks (books)
    │
    └── The Animator (animator)
            │
            └── The Loom (loom)   ← zero apparatus dependencies, pass-through

The Clockworks (clockworks)
    │
    └── summon relay → The Loom → The Animator

The Instrumentarium (tools)   ← no dependencies in MVP, not yet wired to sessions
    │
    └── CLI (nsg)
```

Note: in MVP, The Loom and The Animator do not depend on The Instrumentarium. Tool-equipped sessions (Animator → Instrumentarium for MCP tool set) are future state.

=== CONTEXT FILE: docs/architecture/apparatus/animator.md ===
# The Animator — API Contract

Status: **Draft — MVP**

Package: `@shardworks/animator-apparatus` · Plugin id: `animator`

> **⚠️ MVP scope.** This spec covers session launch, structured telemetry recording, streaming output, error guarantees, and session inspection tools. There is no MCP tool server, no Instrumentarium dependency, no role awareness, and no event signalling. The Animator receives a woven context and a working directory, launches a session provider process, and records what happened. See the Future sections for the target design.

---

## Purpose

The Animator brings animas to life. It is the guild's session apparatus — the single entry point for making an anima do work. Two API levels serve different callers:

- **`summon()`** — the high-level "make an anima do a thing" call. Composes context via The Loom, launches a session, records the result. This is what the summon relay, the CLI, and most callers use.
- **`animate()`** — the low-level call for callers that compose their own `AnimaWeave` (e.g. The Parlour for multi-turn conversations).

Both methods return an `AnimateHandle` synchronously — a `{ sessionId, chunks, result }` triple. The `sessionId` is available immediately, before the session completes — callers that only need to know the session was launched can return without awaiting. The `result` promise resolves when the session completes. The `chunks` async iterable yields output when `streaming: true` is set; otherwise it completes immediately with no items. There is no separate streaming method — the `streaming` flag on the request controls the behavior, and the return shape is always the same.

The Animator does not assemble system prompts — that is The Loom's job. `summon()` delegates context composition to The Loom; `animate()` accepts a pre-composed `AnimaWeave` from any source. This separation means The Loom can evolve its composition model (adding role instructions, curricula, temperaments) without changing The Animator's interface.

---

## Dependencies

```
requires:   ['stacks']
recommends: ['loom']
```

- **The Stacks** (required) — records session results (the `sessions` book) and full transcripts (the `transcripts` book).
- **The Loom** (recommended) — composes session context for `summon()`. Not needed for `animate()`, which accepts a pre-composed context. Resolved at call time, not at startup — the Animator starts without the Loom, but `summon()` throws if it's not installed. Arbor emits a startup warning if the Loom is not installed.

---

## Kit Contribution

The Animator contributes two books and session tools via its supportKit:

```typescript
supportKit: {
  books: {
    sessions: {
      indexes: ['startedAt', 'status', 'conversationId', 'provider'],
    },
    transcripts: {
      indexes: ['sessionId'],
    },
  },
  tools: [sessionList, sessionShow, summon],
},
```

### `session-list` tool

List recent sessions with optional filters. Returns session summaries ordered by `startedAt` descending (newest first).

| Parameter | Type | Description |
|---|---|---|
| `status` | `'running' \| 'completed' \| 'failed' \| 'timeout'` | Filter by terminal status |
| `provider` | `string` | Filter by provider name |
| `conversationId` | `string` | Filter by conversation |
| `limit` | `number` | Maximum results (default: 20) |

Returns: `SessionResult[]` (summary projection — id, status, provider, startedAt, endedAt, durationMs, exitCode, costUsd).

Callers that need to filter by metadata fields (e.g. `metadata.writId`, `metadata.animaName`) use The Stacks' query API directly. The tool exposes filters for fields the Animator itself indexes.

### `session-show` tool

Show full detail for a single session by id.

| Parameter | Type | Description |
|---|---|---|
| `id` | `string` | Session id |

Returns: the complete session record from The Stacks, including `tokenUsage`, `metadata`, `output`, and all indexed fields.

### `summon` tool

Summon an anima from the CLI. Calls `animator.summon()` with the guild home as working directory. CLI-only (`callableBy: 'cli'`). Requires `animate` permission.

| Parameter | Type | Description |
|---|---|---|
| `prompt` | `string` (required) | The work prompt — what the anima should do |
| `role` | `string` (optional) | Role to summon (e.g. `'artificer'`, `'scribe'`) |

Returns: session summary (id, status, provider, durationMs, exitCode, costUsd, tokenUsage, error).

---

## `AnimatorApi` Interface (`provides`)

```typescript
interface AnimatorApi {
  /**
   * Summon an anima — compose context via The Loom and launch a session.
   *
   * This is the high-level entry point. Passes the role to The Loom for
   * identity composition, then animate() for session launch and recording.
   * The work prompt bypasses The Loom and goes directly to the provider.
   * Auto-populates session metadata with `trigger: 'summon'` and `role`.
   *
   * Returns synchronously — the async work lives inside `result` and `chunks`.
   * Requires The Loom apparatus to be installed. Throws if not available.
   */
  summon(request: SummonRequest): AnimateHandle

  /**
   * Animate a session — launch an AI process with the given context.
   *
   * This is the low-level entry point for callers that compose their own
   * AnimaWeave (e.g. The Parlour for multi-turn conversations).
   *
   * Returns synchronously — the async work lives inside `result` and `chunks`.
   * Records the session result to The Stacks before `result` resolves.
   *
   * Set `streaming: true` to receive output chunks as the session runs.
   * When streaming is disabled (default), `chunks` completes immediately.
   */
  animate(request: AnimateRequest): AnimateHandle
}

/** The return value from animate() and summon(). */
interface AnimateHandle {
  /** Session ID, available immediately after launch — before the session completes. */
  sessionId: string
  /** Output chunks. Empty iterable when not streaming. */
  chunks: AsyncIterable<SessionChunk>
  /** Resolves to the final SessionResult after recording. */
  result: Promise<SessionResult>
}

/** A chunk of output from a running session. */
type SessionChunk =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; tool: string }
  | { type: 'tool_result'; tool: string }

interface SummonRequest {
  /** The work prompt — sent directly to the provider, bypasses The Loom. */
  prompt: string
  /** The role to summon (e.g. 'artificer'). Passed to The Loom for composition. */
  role?: string
  /** Working directory for the session. */
  cwd: string
  /** Optional conversation id to resume a multi-turn conversation. */
  conversationId?: string
  /**
   * Additional metadata recorded alongside the session.
   * Merged with auto-generated metadata ({ trigger: 'summon', role }).
   * See § Caller Metadata.
   */
  metadata?: Record<string, unknown>
  /**
   * Environment variable overrides for the session process.
   * Merged with the AnimaWeave's environment (request overrides weave).
   * Use this for per-task identity — e.g. setting GIT_AUTHOR_EMAIL
   * to a writ ID for commit attribution.
   * See § Session Environment.
   */
  environment?: Record<string, string>
  /** Enable streaming output (default false). */
  streaming?: boolean
}

interface AnimateRequest {
  /** The anima weave — composed identity context from The Loom (or self-composed). */
  context: AnimaWeave
  /** The work prompt — sent directly to the provider as initialPrompt. */
  prompt?: string
  /**
   * Working directory for the session.
   * The session provider launches the AI process here.
   */
  cwd: string
  /**
   * Optional conversation id to resume a multi-turn conversation.
   * If provided, the session provider resumes the existing conversation
   * rather than starting a new one.
   */
  conversationId?: string
  /**
   * Caller-supplied metadata recorded alongside the session.
   * The Animator stores this as-is — it does not interpret the contents.
   * See § Caller Metadata.
   */
  metadata?: Record<string, unknown>
  /**
   * Environment variable overrides for the session process.
   * Merged with the AnimaWeave's environment (request overrides weave).
   * See § Session Environment.
   */
  environment?: Record<string, string>
  /** Enable streaming output (default false). */
  streaming?: boolean
}

interface SessionResult {
  /** Unique session id (generated by The Animator). */
  id: string
  /** Terminal status. */
  status: 'completed' | 'failed' | 'timeout'
  /** When the session started (ISO-8601). */
  startedAt: string
  /** When the session ended (ISO-8601). */
  endedAt: string
  /** Wall-clock duration in milliseconds. */
  durationMs: number
  /** Provider name (e.g. 'claude-code'). */
  provider: string
  /** Numeric exit code from the provider process. */
  exitCode: number
  /** Error message if failed. */
  error?: string
  /** Conversation id (for multi-turn resume). */
  conversationId?: string
  /** Session id from the provider (e.g. for --resume). */
  providerSessionId?: string
  /** Token usage from the provider, if available. */
  tokenUsage?: TokenUsage
  /** Cost in USD from the provider, if available. */
  costUsd?: number
  /** Caller-supplied metadata, recorded as-is. See § Caller Metadata. */
  metadata?: Record<string, unknown>
  /**
   * The final assistant text from the session.
   * Extracted from the last assistant message in the provider's transcript.
   * Useful for programmatic consumers that need the session's conclusion
   * without parsing the full transcript (e.g. the Spider's review collect step).
   */
  output?: string
}

interface TokenUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
}
```

---

## Session Lifecycle

### `summon()` — the high-level path

```
summon(request)
  │
  ├─ 1. Resolve The Loom (throws if not installed)
  ├─ 2. Compose identity: loom.weave({ role })
  │     (Loom produces systemPrompt from anima identity layers;
  │      MVP: systemPrompt is undefined — composition not yet implemented)
  ├─ 3. Build AnimateRequest with:
  │     - context (AnimaWeave from Loom — includes environment)
  │     - prompt (work prompt, bypasses Loom)
  │     - environment (per-request overrides, if any)
  │     - auto-metadata { trigger: 'summon', role }
  └─ 4. Delegate to animate() → full animate lifecycle below
```

### `animate()` — the low-level path

```
animate(request)  →  { chunks, result }  (returned synchronously)
  │
  ├─ 1. Generate session id, capture startedAt
  ├─ 2. Write initial session record to The Stacks (status: 'running')
  │
  ├─ 3. Call provider.launch(config):
  │     - System prompt, initial prompt, model, cwd, conversationId
  │     - environment (merged: weave defaults + request overrides)
  │     - streaming flag passed through for provider to honor
  │     → provider returns { chunks, result } immediately
  │
  ├─ 4. Wrap provider result promise with recording:
  │     - On resolve: capture endedAt, durationMs, extract output from
  │       provider transcript, record session to Stacks, record transcript
  │       to transcripts book
  │     - On reject: record failed result, re-throw
  │     (ALWAYS records — see § Error Handling Contract)
  │
  └─ 5. Return { chunks, result } to caller
        chunks: the provider's iterable (may be empty)
        result: wraps provider result with Animator recording
```

The Animator does not branch on streaming. It passes the `streaming` flag to the provider via `SessionProviderConfig` and returns whatever the provider gives back. Providers that support streaming yield chunks when the flag is set; providers that don't return empty chunks. Callers should not assume chunks will be emitted.

---

## Session Providers

The Animator delegates AI process management to a **session provider** — a pluggable apparatus that knows how to launch and communicate with a specific AI system. The provider is discovered at runtime via guild config:

```json
{
  "animator": {
    "sessionProvider": "claude-code"
  }
}
```

The `sessionProvider` field names the plugin id of an apparatus whose `provides` object implements `AnimatorSessionProvider`. The Animator looks it up via `guild().apparatus<AnimatorSessionProvider>(config.sessionProvider)` at animate-time. Defaults to `'claude-code'` if not specified.

```typescript
interface AnimatorSessionProvider {
  /** Human-readable name (e.g. 'claude-code'). */
  name: string

  /**
   * Launch a session. Returns { chunks, result } synchronously.
   *
   * The result promise resolves when the AI process exits.
   * The chunks async iterable yields output when config.streaming
   * is true and the provider supports streaming; otherwise it
   * completes immediately with no items.
   *
   * Providers that don't support streaming simply ignore the flag
   * and return empty chunks — no separate method needed.
   */
  launch(config: SessionProviderConfig): {
    chunks: AsyncIterable<SessionChunk>
    result: Promise<SessionProviderResult>
  }
}

interface SessionProviderConfig {
  /** System prompt from the AnimaWeave — may be undefined at MVP. */
  systemPrompt?: string
  /** Work prompt from AnimateRequest.prompt — what the anima should do. */
  initialPrompt?: string
  /** Model to use (from guild settings). */
  model: string
  /** Optional conversation id for resume. */
  conversationId?: string
  /** Working directory for the session. */
  cwd: string
  /** Enable streaming output. Providers may ignore this flag. */
  streaming?: boolean
  /**
   * Environment variables for the session process.
   * Merged by the Animator from the AnimaWeave's environment and any
   * per-request overrides (request overrides weave). The provider
   * spreads these into the spawned process environment.
   */
  environment?: Record<string, string>
}

interface SessionProviderResult {
  /** Exit status. */
  status: 'completed' | 'failed' | 'timeout'
  /** Numeric exit code from the process. */
  exitCode: number
  /** Error message if failed. */
  error?: string
  /** Provider's session id (e.g. for --resume). */
  providerSessionId?: string
  /** Token usage, if the provider can report it. */
  tokenUsage?: TokenUsage
  /** Cost in USD, if the provider can report it. */
  costUsd?: number
  /** Full session transcript — array of NDJSON message objects. */
  transcript?: TranscriptMessage[]
  /**
   * The final assistant text from the session.
   * Extracted from the last assistant message's text content blocks.
   */
  output?: string
}

/** A single message from the NDJSON stream. Shape varies by provider. */
type TranscriptMessage = Record<string, unknown>
```

The default provider is `@shardworks/claude-code-apparatus` (plugin id: `claude-code`), which launches a `claude` CLI process in autonomous mode with `--output-format stream-json`. Provider packages import the `AnimatorSessionProvider` type from `@shardworks/animator-apparatus` and export an apparatus whose `provides` satisfies the interface.

---

## Error Handling Contract

The Animator guarantees that **step 5 (recording) always executes**, even if the provider throws or the process crashes. The provider launch (steps 3–4) is wrapped in try/finally. If the provider fails:

- The session record is still updated in The Stacks with `status: 'failed'`, the captured `endedAt`, `durationMs`, and the error message.
- `exitCode` defaults to `1` if the provider didn't return one.
- `tokenUsage` and `costUsd` are omitted (the provider may not have reported them).

If the Stacks write itself fails (e.g. database locked), the error is logged but does not propagate — the Animator returns or re-throws the provider error, not a recording error. Session data loss is preferable to masking the original failure.

```
Provider succeeds  → record status 'completed', return result
Provider fails     → record status 'failed' + error, re-throw provider error
Provider times out → record status 'timeout', return result with error
Recording fails    → log warning, continue with return/re-throw
```

---

## Caller Metadata

The `metadata` field on `AnimateRequest` is an opaque pass-through. The Animator records it in the session's Stacks entry without interpreting it. This allows callers to attach contextual information that the Animator itself doesn't understand:

```typescript
// Example: the summon relay attaches dispatch context
const { result } = animator.animate({
  context: wovenContext,
  cwd: '/path/to/worktree',
  metadata: {
    trigger: 'summon',
    animaId: 'anm-3f7b2c1',
    animaName: 'scribe',
    writId: 'wrt-8a4c9e2',
    workshop: 'nexus-mk2',
    workspaceKind: 'workshop-temp',
  },
});
const session = await result;

// Example: nsg consult attaches interactive session context
const { chunks, result: consultResult } = animator.animate({
  context: wovenContext,
  cwd: guildHome,
  streaming: true,
  metadata: {
    trigger: 'consult',
    animaId: 'anm-b2e8f41',
    animaName: 'coco',
  },
});
for await (const chunk of chunks) { /* stream to terminal */ }
const consultSession = await consultResult;
```

The `metadata` field is indexed in The Stacks as a JSON blob. Callers that need to query by metadata fields (e.g. "all sessions for writ X") use The Stacks' JSON path queries against the stored metadata.

This design keeps the Animator focused: it launches sessions and records what happened. Identity, dispatch context, and writ binding are concerns of the caller.

---

## Session Environment

The Animator supports environment variable injection into the spawned session process. This is the mechanism for giving animas distinct identities (e.g. git author) without modifying global host configuration.

Environment variables come from two sources, merged at session launch time:

1. **AnimaWeave** (`context.environment`) — identity-layer defaults from The Loom. Set per-role. Example: `GIT_AUTHOR_NAME=Artificer`, `GIT_AUTHOR_EMAIL=artificer@nexus.local`.
2. **Request** (`request.environment`) — per-task overrides from the caller. Example: the Dispatch sets `GIT_AUTHOR_EMAIL=w-{writId}@nexus.local` for per-commission git attribution.

The merge is simple: `{ ...weave.environment, ...request.environment }`. Request values override weave values for the same key. The merged result is passed to the session provider as `SessionProviderConfig.environment`, which the provider spreads into the child process environment (`{ ...process.env, ...config.environment }`).

This keeps the Animator generic — it does not interpret environment variables or know about git. The Loom decides what identity defaults a role should have. Orchestrators decide what per-task overrides are needed. The Animator just merges and passes through.

---

## Invocation Paths

The Animator is called from three places:

1. **The summon relay** — when a standing order fires `summon: "role"`, the relay calls `animator.summon()`. This is the Clockworks-driven autonomous path.

2. **`nsg summon`** — the CLI command for direct dispatch. Calls `animator.summon()` to launch a session with a work prompt.

3. **`nsg consult`** — the CLI command for interactive multi-turn sessions. Uses The Parlour, which composes its own context and calls `animator.animate()` directly.

Paths 1 and 2 use `summon()` (high-level — The Loom composes the context). Path 3 uses `animate()` (low-level — The Parlour composes the context). The Animator doesn't know or care which path invoked it — the session lifecycle is identical.

### CLI streaming behavior

The `nsg summon` command invokes the `summon` tool through the generic CLI tool runner, which `await`s the handler and prints the return value. The tool contract (`ToolDefinition.handler`) returns a single value — there is no streaming return type. The CLI prints the structured session summary (id, status, cost, token usage) to stdout when the session completes.

However, **real-time session output is visible during execution via stderr**. The claude-code provider spawns `claude` with `--output-format stream-json` and parses NDJSON from the child process's stdout. As assistant text chunks arrive, the provider writes them to `process.stderr` as a side effect of parsing (in `parseStreamJsonMessage`). Because the CLI inherits the provider's stderr, users see streaming text output in the terminal while the session runs.

This is intentional: stderr carries progress output, stdout carries the structured result. The pattern is standard for CLI tools that produce both human-readable progress and machine-readable results. The streaming output is a provider-level concern — the Animator and the tool system are not involved.

---

## Open Questions

- ~~**Provider discovery.** How does The Animator find installed session providers?~~ **Resolved:** the `guild.json["animator"]["sessionProvider"]` config field names the plugin id of the provider apparatus. The Animator looks it up via `guild().apparatus()`. Defaults to `'claude-code'`.
- **Timeout.** How are session timeouts configured? MVP: no timeout (the session runs until the provider exits).
- **Concurrency.** Can multiple sessions run simultaneously? Current answer: yes, each `animate()` call is independent.

---

## Future: Event Signalling

When The Clockworks integration is updated, The Animator will signal lifecycle events:

- **`session.started`** — fired after step 2 (initial record written). Payload includes `sessionId`, `provider`, `startedAt`, and caller-supplied `metadata`.
- **`session.ended`** — fired after step 5 (result recorded). Payload includes `sessionId`, `status`, `exitCode`, `durationMs`, `costUsd`, `error`, and `metadata`.
- **`session.record-failed`** — fired if the Stacks write in step 5 fails. Payload includes `sessionId` and the recording error. This is a diagnostic event — it means session data was lost.

These events are essential for clockworks standing orders (e.g. retry-on-failure, cost alerting, session auditing). The Animator fires them best-effort — event signalling failures are logged but never mask session results.

Blocked on: Clockworks apparatus spec finalization.

---

## Future: Enriched Session Records

At MVP, the Animator records what it directly observes (provider telemetry) and what the caller passes via `metadata`. The session record in The Stacks looks like:

```typescript
// MVP session record (what The Animator writes)
{
  id: 'ses-a3f7b2c1',
  status: 'completed',
  startedAt: '2026-04-01T12:00:00Z',
  endedAt: '2026-04-01T12:05:30Z',
  durationMs: 330000,
  provider: 'claude-code',
  exitCode: 0,
  providerSessionId: 'claude-sess-xyz',
  tokenUsage: {
    inputTokens: 12500,
    outputTokens: 3200,
    cacheReadTokens: 8000,
    cacheWriteTokens: 1500,
  },
  costUsd: 0.42,
  conversationId: null,
  metadata: { trigger: 'summon', animaId: 'anm-3f7b2c1', writId: 'wrt-8a4c9e2' },
  output: '### Overall: PASS\n\n### Completeness\n...',  // final assistant message
}
```

When The Loom and The Roster are available, the session record can be enriched with anima provenance — a snapshot of the identity and composition at session time. This provenance is critical for experiment ethnography (understanding what an anima "was" when it produced a given output).

Enriched fields (contributed by the caller or a post-session enrichment step):

| Field | Source | Purpose |
|---|---|---|
| `animaId` | Roster / caller metadata | Which anima ran |
| `animaName` | Roster / caller metadata | Human-readable identity |
| `roles` | Roster | Roles the anima held at session time |
| `curriculumName` | Loom / manifest | Curriculum snapshot |
| `curriculumVersion` | Loom / manifest | Curriculum version for reproducibility |
| `temperamentName` | Loom / manifest | Temperament snapshot |
| `temperamentVersion` | Loom / manifest | Temperament version |
| `trigger` | Caller (clockworks / CLI) | What invoked the session |
| `workshop` | Caller (workspace resolver) | Workshop name |
| `workspaceKind` | Caller (workspace resolver) | guildhall / workshop-temp / workshop-managed |
| `writId` | Caller (clockworks) | Bound writ for traceability |
| `turnNumber` | Caller (conversation manager) | Position in a multi-turn conversation |

**Design question:** Should enrichment happen via (a) the caller passing structured metadata that The Animator promotes into indexed fields, or (b) a post-session enrichment step that reads the session record and augments it? Option (a) is simpler; option (b) keeps the Animator interface stable as the enrichment set grows. Both work with the current `metadata` bag — the difference is whether The Animator's Stacks schema gains named columns for these fields or whether they remain JSON-path-queried properties inside `metadata`.

---

## Transcripts

The Animator captures full session transcripts in a dedicated `transcripts` book, separate from the `sessions` book. This keeps the operational session records lean (small records, fast CDC) while making the full interaction history available for web UIs, operational logs, debugging, and research.

Each transcript record contains the complete NDJSON message stream from the session provider:

```typescript
interface TranscriptDoc {
  id: string                          // same as session id — 1:1 relationship
  messages: TranscriptMessage[]       // full NDJSON transcript
}

type TranscriptMessage = Record<string, unknown>
```

The transcript is written at session completion (step 4 in the animate lifecycle), alongside the session result. If the transcript write fails, the error is logged but does not propagate — same error handling contract as session recording.

The `output` field on the session record (the final assistant message text) is extracted from the transcript before storage. This gives programmatic consumers a fast path to the session's conclusion without parsing the full transcript.

### Data scale

Transcripts are typically 500KB–5MB per session. At ~60 sessions/day, this is ~30–300MB/day in the transcripts book. SQLite handles this comfortably — primary key lookups are microseconds regardless of row size. The transcripts book has no CDC handlers, so there is no amplification concern. Retention/archival is a future concern.

---

## Future: Tool-Equipped Sessions

When The Instrumentarium ships, The Animator gains the ability to launch sessions with an MCP tool server. Tool resolution is the Loom's responsibility — the Loom resolves role → permissions → tools and returns them on the `AnimaWeave`. The Animator receives the resolved tool set and handles MCP server lifecycle.

### Updated lifecycle

```
summon(request)
  │
  ├─ 1. Resolve The Loom
  ├─ 2. loom.weave({ role }) → AnimaWeave { systemPrompt, tools }
  │     (Loom resolves role → permissions, calls instrumentarium.resolve(),
  │      reads tool instructions, composes full system prompt)
  └─ 3. Delegate to animate()

animate(request)
  │
  ├─ 1. Generate session id
  ├─ 2. Write initial session record to The Stacks
  │
  ├─ 3. If context.tools is present, configure MCP server:
  │     - Register each tool from the resolved set
  │     - Each tool handler accesses guild infrastructure via guild() singleton
  │
  ├─ 4. Launch session provider (with MCP server attached)
  ├─ 5. Monitor process until exit
  ├─ 6. Record result to The Stacks
  └─ 7. Return SessionResult
```

The Animator does not call the Instrumentarium directly — it receives the tool set from the AnimaWeave. This keeps tool resolution and system prompt composition together in the Loom, where tool instructions can be woven into the prompt alongside the tools they describe.

### Updated `SessionProviderConfig`

```typescript
interface SessionProviderConfig {
  systemPrompt: string
  initialPrompt?: string
  /** Resolved tools to serve via MCP. */
  tools?: ToolDefinition[]
  model: string
  conversationId?: string
  cwd: string
  streaming?: boolean
  /** Environment variables for the session process. */
  environment?: Record<string, string>
}
```

The session provider interface gains an optional `tools` field. The provider configures the MCP server from the tool definitions. Providers that don't support MCP ignore it. The Animator handles MCP server lifecycle (start before launch, stop after exit).

---

## Future: Streaming Through the Tool Contract

The current CLI streaming path works via a stderr side-channel in the provider (see § CLI streaming behavior). This is pragmatic and works well for the `nsg summon` use case, but it has limitations:

- The CLI has no control over formatting or filtering of streamed output — it's raw provider text on stderr.
- MCP callers cannot receive streaming output at all — the tool contract returns a single value.
- Callers that want to interleave chunk types (text, tool_use, tool_result) with their own UI cannot — the stderr stream is unstructured text.

The Animator already supports structured streaming internally: `animate({ streaming: true })` returns an `AnimateHandle` whose `chunks` async iterable yields typed `SessionChunk` objects in real time. The gap is that the tool system has no way to expose this to callers.

### Design sketch

Extend `ToolDefinition.handler` to support an `AsyncIterable` return type:

```typescript
// Current
handler: (params: T) => unknown | Promise<unknown>

// Extended
handler: (params: T) => unknown | Promise<unknown> | AsyncIterable<unknown>
```

Each caller adapts the iterable to its transport:

- **CLI** — detects `AsyncIterable`, writes chunks to stdout as they arrive (e.g. text chunks as plain text, tool_use/tool_result as structured lines). Prints the final summary after iteration completes.
- **MCP** — maps the iterable to MCP's streaming response model (SSE or streaming content blocks, depending on MCP protocol version).
- **Engines** — consume the iterable directly for programmatic streaming.

The `summon` tool handler would change from:

```typescript
const { result } = animator.summon({ prompt, role, cwd });
const session = await result;
return { id: session.id, status: session.status, ... };
```

To:

```typescript
const { chunks, result } = animator.summon({ prompt, role, cwd, streaming: true });
yield* chunks;           // stream output to caller
const session = await result;
return { id: session.id, status: session.status, ... };
```

(Using an async generator handler, or a dedicated streaming return wrapper — exact syntax TBD.)

### What this enables

- CLI users see formatted, filterable streaming output on stdout instead of raw stderr.
- MCP clients (e.g. IDE extensions, web UIs) receive real-time session output through the standard tool response channel.
- The stderr side-channel in the provider becomes unnecessary — streaming is a first-class concern of the tool contract.

### Dependencies

- Tool contract change (`ToolDefinition` in tools-apparatus)
- CLI adapter for async iterable tool returns
- MCP server adapter for streaming tool responses
- Decision: should the streaming return include both chunks and a final summary, or just chunks (with the summary as the last chunk)?

Blocked on: tool contract design discussion, MCP streaming support.

=== CONTEXT FILE: docs/architecture/apparatus/spider.md ===
# The Spider — API Contract

Status: **Ready — MVP**

Package: `@shardworks/spider-apparatus` · Plugin id: `spider`

> **⚠️ MVP scope.** This spec covers a static rig graph: every commission gets the same five-engine pipeline (`draft → implement → review → revise → seal`). No origination, no dynamic extension, no capability resolution. The Spider runs engines directly — the Executor earns its independence later. See [What This Spec Does NOT Cover](#what-this-spec-does-not-cover) for the full list.

---

## Purpose

The Spider is the spine of the guild's rigging system. It replaces the Dispatch apparatus, which ran one writ in one session with no review. The Spider runs a structured engine pipeline for each commission, advancing the rig one step at a time via a `crawl()` step function.

The Spider owns the rig's structural lifecycle — spawn, traverse, complete — and delegates everything else. Engine designs come from the Fabricator. Sessions come from the Animator. Draft bindings come from the Scriptorium. Writ transitions are handled by a CDC handler, not inline. The Spider itself is stateless between `crawl()` calls; all state lives in the Stacks.

---

## Dependencies

```
requires: ['fabricator', 'clerk', 'stacks']
```

- **The Fabricator** — resolves engine designs by `designId`.
- **The Clerk** — queries ready writs; receives writ transitions via CDC.
- **The Stacks** — persists rigs book, reads sessions book, hosts CDC handler on rigs book.

Engines pull their own apparatus dependencies (Scriptorium, Animator, Loom) via the `guild()` singleton — these are not Spider dependencies.

### Reference docs

- **The Rigging System** (`docs/architecture/rigging.md`) — full rigging architecture (Spider, Fabricator, Executor, Manifester). This spec implements a subset.
- **The Fabricator** (`docs/architecture/apparatus/fabricator.md`) — engine design registry and `EngineDesign` type definitions.
- **The Scriptorium** (`docs/architecture/apparatus/scriptorium.md`) — draft binding API (`openDraft`, `seal`, `abandonDraft`).
- **The Animator** (`docs/architecture/apparatus/animator.md`) — session API (`summon`, `animate`), `AnimateHandle`, `SessionResult`.
- **The Clerk** (`docs/architecture/apparatus/clerk.md`) — writ lifecycle API.
- **The Stacks** (`docs/architecture/apparatus/stacks.md`) — CDC phases, cascade vs notification, `watch()` API.

---

## The Engine Interface

Engines are the unit of work in a rig. Each engine implements a standard interface defined by the Fabricator apparatus (`@shardworks/fabricator-apparatus`). The `EngineDesign`, `EngineRunContext`, and `EngineRunResult` types are owned and exported by the Fabricator — see the Fabricator spec (`docs/architecture/apparatus/fabricator.md`) for full type definitions. Engines pull their own apparatus dependencies via `guild().apparatus(...)` — same pattern as tool handlers.

The Spider resolves engine designs by `designId` from the Fabricator at runtime: `fabricator.getEngineDesign(id)`.

### Kit contribution

The Spider contributes its five engine designs via its support kit:

```typescript
// In spider-apparatus plugin
supportKit: {
  engines: {
    draft:     draftEngine,
    implement: implementEngine,
    review:    reviewEngine,
    revise:    reviseEngine,
    seal:      sealEngine,
  },
  tools: {
    walk:          crawlTool,           // single step — do one thing and return
    crawlContinual: crawlContinualTool,  // polling loop — walk every ~5s until stopped
  },
},
```

**Tool naming note:** Hyphenated tool names (e.g. `start-walking`) have known issues with CLI argument parsing and tool grouping in `nsg`. The names above use camelCase in code; the CLI surface (`nsg crawl`, `nsg crawl-continual`) needs to work cleanly with the Instrumentarium's tool registration. Final CLI naming TBD — may need to revisit how the Instrumentarium maps tool IDs to CLI commands.

The Fabricator scans kit `engines` contributions at startup (same pattern as the Instrumentarium scanning tools). The Spider contributes its engines like any other kit — no special registration path.

---

## The Walk Function

The Spider's core is a single step function:

```typescript
interface SpiderApi {
  /**
   * Examine guild state and perform the single highest-priority action.
   * Returns a description of what was done, or null if there's nothing to do.
   */
  crawl(): Promise<CrawlResult | null>
}

type CrawlResult =
  | { action: 'engine-completed'; rigId: string; engineId: string }
  | { action: 'engine-started'; rigId: string; engineId: string }
  | { action: 'rig-spawned'; rigId: string; writId: string }
  | { action: 'rig-completed'; rigId: string; writId: string; outcome: 'completed' | 'failed' }
```

Each `crawl()` call does exactly one thing. The priority ordering:

1. **Collect a completed engine.** Scan all running rigs for an engine with `status === 'running'`. Read the session record from the sessions book by `engine.sessionId`. If the session has reached a terminal status (`completed` or `failed`), update the engine: set its status and populate its yields (or error). **Yield assembly:** look up the `EngineDesign` by `designId` from the Fabricator. If the design defines a `collect(sessionId, givens, context)` method, call it to assemble the yields — passing the same givens and context that were passed to `run()`. Otherwise, use the generic default: `{ sessionId, sessionStatus, output? }`. This keeps engine-specific yield logic (e.g. parsing review findings) in the engine, not the Spider. If the engine failed, mark the rig `failed` (same transaction). If the completed engine is the terminal engine (`seal`), mark the rig `completed` (same transaction). Rig status changes trigger the CDC handler (see below). Returns `rig-completed` if the rig transitioned, otherwise `engine-completed`. This is the first priority because it unblocks downstream engines.
2. **Run a ready engine.** An engine is ready when `status === 'pending'` and all engines in its `upstream` array have `status === 'completed'`. Look up the `EngineDesign` by `designId` from the Fabricator. Assemble givens (from givensSpec) and context (with upstream yields), then call `design.run(givens, context)`. For clockwork engines (`status: 'completed'` result): store the yields on the engine instance, mark it completed, and check for rig completion (same as step 1). Returns `engine-completed` (or `rig-completed` if this was the terminal engine). For quick engines (`status: 'launched'` result): store the `sessionId`, mark the engine `running`. Returns `engine-started`. Completion is collected on subsequent crawl calls via step 1.
3. **Spawn a rig.** If there's a ready writ with no rig, spawn the static graph. Returns `rig-spawned`.

If nothing qualifies at any level, return null (the guild is idle or all work is blocked on running quick engines).

### Operational model: `start-walking`

The Spider exports a `start-walking` tool that runs the crawl loop:

```
nsg start-crawling    # starts polling loop, walks every ~5s
nsg crawl             # single step (useful for debugging/testing)
```

The loop: call `crawl()`, sleep `pollIntervalMs` (default 5000), repeat. When `crawl()` returns null, the loop doesn't stop — it keeps polling. New writs posted via `nsg commission-post` from a separate terminal are picked up on the next poll cycle.

---

## Rig Data Model

### Rig

```typescript
interface Rig {
  id: string
  writId: string
  status: 'running' | 'completed' | 'failed'
  engines: EngineInstance[]
}
```

Stored in the Stacks `rigs` book. One rig per writ. The Spider reads and updates rigs via normal Stacks `put()`/`patch()` operations.

### Engine Instance

```typescript
interface EngineInstance {
  id: string               // unique within the rig, e.g. 'draft', 'implement', 'review', 'revise', 'seal'
  designId: string         // engine design id — resolved from the Fabricator
  status: 'pending' | 'running' | 'completed' | 'failed'
  upstream: string[]       // ids of engines that must complete first (empty = first engine)
  givensSpec: Record<string, unknown>  // givens specification — literal values now, templates later
  yields: unknown          // set on completion — the engine's yields (see Yield Types below)
  error?: string           // set on failure
  sessionId?: string       // set when run() returns 'launched' — Spider polls for completion
  startedAt?: string       // ISO-8601, set when engine begins running (enables future timeout detection)
  completedAt?: string     // ISO-8601, set when engine reaches terminal status
}
```

An engine is **ready** when: `status === 'pending'` and all engines in its `upstream` array have `status === 'completed'`.

### The Static Graph

Every spawned rig gets this engine list:

```typescript
function spawnStaticRig(writ: Writ, config: SpiderConfig): EngineInstance[] {
  return [
    { id: 'draft',     designId: 'draft',     status: 'pending', upstream: [],
      givensSpec: { writ }, yields: null },
    { id: 'implement', designId: 'implement', status: 'pending', upstream: ['draft'],
      givensSpec: { writ, role: config.role }, yields: null },
    { id: 'review',    designId: 'review',    status: 'pending', upstream: ['implement'],
      givensSpec: { writ, role: 'reviewer', buildCommand: config.buildCommand, testCommand: config.testCommand }, yields: null },
    { id: 'revise',    designId: 'revise',    status: 'pending', upstream: ['review'],
      givensSpec: { writ, role: config.role }, yields: null },
    { id: 'seal',      designId: 'seal',      status: 'pending', upstream: ['revise'],
      givensSpec: {}, yields: null },
  ]
}
```

The `givensSpec` is populated from the Spider's config at rig spawn time. The rig is self-contained after spawning — no runtime config lookups needed. The `writ` is passed as a given to engines that need it (most do; `seal` doesn't). All engines start with `yields: null` — yields are populated when the engine completes (see [Yield Types](#yield-types-and-data-flow)).

The rig is **completed** when the terminal engine (`seal`) has `status === 'completed'`. The rig is **failed** when any engine has `status === 'failed'`.

---

## Yield Types and Data Flow

Each engine produces typed yields that downstream engines consume. The yields are stored on the `EngineInstance.yields` field in the Stacks.

**Serialization constraint:** Because yields are persisted to the Stacks (JSON-backed), all yield values **must be JSON-serializable**. The Spider should validate this at storage time — if an engine returns a non-serializable value (function, circular reference, etc.), the engine fails with a clear error. This is important because engines are a plugin extension point — kit authors need a hard boundary, not a silent corruption.

When the Spider runs an engine, it assembles givens from the givensSpec only — upstream yields are **not** merged into givens. Engines that need upstream data access it via the `context.upstream` escape hatch:

```typescript
function assembleGivensAndContext(rig: Rig, engine: EngineInstance) {
  // Collect all completed engine yields for the context escape hatch.
  // All completed yields are included regardless of graph distance —
  // simpler than chain-walking and equivalent for the static graph.
  const upstream: Record<string, unknown> = {}
  for (const e of rig.engines) {
    if (e.status === 'completed' && e.yields !== undefined) {
      upstream[e.id] = e.yields
    }
  }

  // Givens = givensSpec only. Upstream data stays on context.
  const givens = { ...engine.givensSpec }

  const context: EngineRunContext = {
    engineId: engine.id,
    upstream,
  }

  return { givens, context }
}
```

Givens contain only what the givensSpec declares — static values set at rig spawn time (writ, role, buildCommand, etc.). Engines that need upstream data (worktree path, review findings, etc.) pull it from `context.upstream` by engine id. This keeps the givens contract clean: what you see in the givensSpec is exactly what the engine receives.

### `DraftYields`

```typescript
interface DraftYields {
  draftId: string         // the draft binding's unique id (from DraftRecord.id)
  codexName: string       // which codex this draft is on (from DraftRecord.codexName)
  branch: string          // git branch name for the draft (from DraftRecord.branch)
  path: string            // absolute path to the draft worktree (from DraftRecord.path)
  baseSha: string         // commit SHA at draft open — used to compute diffs later
}
```

**Produced by:** `draft` engine
**Consumed by:** all downstream engines. Establishes the physical workspace.

> **Note:** Field names mirror the Scriptorium's `DraftRecord` type (`codexName`, `branch`, `path`) rather than inventing Spider-specific aliases. `baseSha` is the only field the draft engine adds itself — by reading `HEAD` after opening the draft.

### `ImplementYields`

```typescript
interface ImplementYields {
  sessionId: string
  sessionStatus: 'completed' | 'failed'
}
```

**Produced by:** `implement` engine (set by Spider's collect step when session completes)
**Consumed by:** `review` (needs to know the session completed)

### `ReviewYields`

```typescript
interface ReviewYields {
  sessionId: string
  passed: boolean                      // reviewer's overall assessment
  findings: string                     // structured markdown: what passed, what's missing, what's wrong
  mechanicalChecks: MechanicalCheck[]  // build/test results run before the reviewer session
}

interface MechanicalCheck {
  name: 'build' | 'test'
  passed: boolean
  output: string    // stdout+stderr, truncated to 4KB
  durationMs: number
}
```

**Produced by:** `review` engine
**Consumed by:** `revise` (needs `passed` to decide whether to do work, needs `findings` as context)

The `mechanicalChecks` are run by the engine *before* launching the reviewer session — their results are included in the reviewer's prompt.

### `ReviseYields`

```typescript
interface ReviseYields {
  sessionId: string
  sessionStatus: 'completed' | 'failed'
}
```

**Produced by:** `revise` engine (set by Spider's collect step when session completes)
**Consumed by:** `seal` (no data dependency — seal just needs revise to be done)

### `SealYields`

```typescript
interface SealYields {
  sealedCommit: string                     // the commit SHA at head of target after sealing (from SealResult)
  strategy: 'fast-forward' | 'rebase'      // merge strategy used (from SealResult)
  retries: number                          // rebase retry attempts needed (from SealResult)
  inscriptionsSealed: number               // number of commits incorporated (from SealResult)
}
```

**Produced by:** `seal` engine
**Consumed by:** nothing (terminal). Used by the CDC handler for the writ transition resolution message.

> **Note:** Field names mirror the Scriptorium's `SealResult` type. Push is a separate Scriptorium operation — the seal engine seals but does not push.

---

## Engine Implementations

Each engine is an `EngineDesign` contributed by the Spider's support kit. The engine's `run()` method receives assembled givens and a thin context, and returns an `EngineRunResult`. Engines pull apparatus dependencies via `guild().apparatus(...)`.

### `draft` (clockwork)

Opens a draft binding on the commission's target codex.

```typescript
async run(givens: Record<string, unknown>, _context: EngineRunContext): Promise<EngineRunResult> {
  const scriptorium = guild().apparatus<ScriptoriumApi>('codexes')
  const writ = givens.writ as Writ
  const draft = await scriptorium.openDraft({ codexName: writ.codex, associatedWith: writ.id })
  const baseSha = await getHeadSha(draft.path)

  return {
    status: 'completed',
    yields: { draftId: draft.id, codexName: draft.codexName, branch: draft.branch, path: draft.path, baseSha } satisfies DraftYields,
  }
}
```

### `implement` (quick)

Summons an anima to do the commissioned work.

```typescript
async run(givens: Record<string, unknown>, context: EngineRunContext): Promise<EngineRunResult> {
  const animator = guild().apparatus<AnimatorApi>('animator')
  const writ = givens.writ as Writ
  const draft = context.upstream.draft as DraftYields

  const prompt = `${writ.body}\n\nCommit all changes before ending your session.`

  const handle = animator.summon({
    role: givens.role as string,
    prompt,
    cwd: draft.path,
    environment: { GIT_AUTHOR_EMAIL: `${writ.id}@nexus.local` },
    metadata: { engineId: context.engineId, writId: writ.id },
  })

  return { status: 'launched', sessionId: handle.sessionId }
}
```

The implement engine wraps the writ body with a commit instruction — each engine owns its own prompt contract rather than relying on `dispatch.sh` to append instructions to the writ body.

**Collect step:** The implement engine has no `collect` method — the Spider uses the generic default: `{ sessionId, sessionStatus, output? }`.

### `review` (quick)

Runs mechanical checks, then summons a reviewer anima to assess the implementation.

```typescript
async run(givens: Record<string, unknown>, context: EngineRunContext): Promise<EngineRunResult> {
  const animator = guild().apparatus<AnimatorApi>('animator')
  const writ = givens.writ as Writ
  const draft = context.upstream.draft as DraftYields

  // 1. Run mechanical checks synchronously
  const checks: MechanicalCheck[] = []
  if (givens.buildCommand) {
    checks.push(await runCheck('build', givens.buildCommand as string, draft.path))
  }
  if (givens.testCommand) {
    checks.push(await runCheck('test', givens.testCommand as string, draft.path))
  }

  // 2. Compute diff since draft opened
  const diff = await gitDiff(draft.path, draft.baseSha)
  const status = await gitStatus(draft.path)

  // 3. Assemble review prompt
  const prompt = assembleReviewPrompt(writ, diff, status, checks)

  // 4. Launch reviewer session
  const handle = animator.summon({
    role: givens.role as string,
    prompt,
    cwd: draft.path,
    metadata: {
      engineId: context.engineId,
      writId: writ.id,
      mechanicalChecks: checks,  // stash for collect step to retrieve
    },
  })

  return { status: 'launched', sessionId: handle.sessionId }
}
```

**Review prompt template:**

```markdown
# Code Review

You are reviewing work on a commission. Your job is to assess whether the
implementation satisfies the spec, identify any gaps or problems, and produce
a structured findings document.

## The Commission (Spec)

{writ.body}

## Implementation Diff

Changes since the draft was opened:

```diff
{git diff draft.baseSha..HEAD in worktree}
```

## Current Worktree State

```
{git status --porcelain}
```

## Mechanical Check Results

{for each check}
### {name}: {PASSED | FAILED}
```
{output, truncated to 4KB}
```
{end for}

## Instructions

Assess the implementation against the spec. Produce your findings in this format:

### Overall: PASS or FAIL

### Completeness
- Which spec requirements are addressed?
- Which are missing or partially addressed?

### Correctness
- Are there bugs, logic errors, or regressions?
- Do the tests pass? If not, what fails?

### Quality
- Code style consistent with the codebase?
- Appropriate test coverage for new code?
- Any concerns about the approach?

### Required Changes (if FAIL)
Numbered list of specific changes needed, in priority order.

Produce your findings as your final message in the format above.
```

**Collect step:** The review engine defines a `collect` method that the Spider calls when the session completes. The engine looks up the session record itself and parses the reviewer's structured findings. No file is written to the worktree (review artifacts don't belong in the codebase).

```typescript
async collect(sessionId: string, _givens: Record<string, unknown>, _context: EngineRunContext): Promise<ReviewYields> {
  const stacks = guild().apparatus<StacksApi>('stacks')
  const session = await stacks.readBook<SessionDoc>('animator', 'sessions').get(sessionId)
  const findings = session?.output ?? ''
  const passed = /^###\s*Overall:\s*PASS/mi.test(findings)
  const mechanicalChecks = (session?.metadata?.mechanicalChecks as MechanicalCheck[]) ?? []
  return { sessionId, passed, findings, mechanicalChecks }
}
```

**Dependency:** The Animator's `SessionResult.output` field (the final assistant message text) must be available for this to work. See the Animator spec (`docs/architecture/apparatus/animator.md`) — the `output` field is populated from the session provider's transcript at recording time.

### `revise` (quick)

Summons an anima to address review findings.

```typescript
async run(givens: Record<string, unknown>, context: EngineRunContext): Promise<EngineRunResult> {
  const animator = guild().apparatus<AnimatorApi>('animator')
  const writ = givens.writ as Writ
  const draft = context.upstream.draft as DraftYields
  const review = context.upstream.review as ReviewYields

  const status = await gitStatus(draft.path)
  const diff = await gitDiffUncommitted(draft.path)
  const prompt = assembleRevisionPrompt(writ, review, status, diff)

  const handle = animator.summon({
    role: givens.role as string,
    prompt,
    cwd: draft.path,
    environment: { GIT_AUTHOR_EMAIL: `${writ.id}@nexus.local` },
    metadata: { engineId: context.engineId, writId: writ.id },
  })

  return { status: 'launched', sessionId: handle.sessionId }
}
```

**Revision prompt template:**

```markdown
# Revision Pass

You are revising prior work on a commission based on review findings.

## The Commission (Spec)

{writ.body}

## Review Findings

{review.findings}

## Review Result: {PASS | FAIL}

{if review.passed}
The review passed. No changes are required. Confirm the work looks correct
and exit. Do not make unnecessary changes or spend unnecessary time reassessing.
{else}
The review identified issues that need to be addressed. See "Required Changes"
in the findings above. Address each item, then commit your changes.
{end if}

## Current State

```
{git status --porcelain}
```

```diff
{git diff HEAD, if any uncommitted changes}
```

Commit all changes before ending your session.
```

**Collect step:** The revise engine has no `collect` method — the Spider uses the generic default: `{ sessionId, sessionStatus, output? }`.

### `seal` (clockwork)

Seals the draft binding.

```typescript
async run(_givens: Record<string, unknown>, ctx: EngineRunContext): Promise<EngineRunResult> {
  const scriptorium = guild().apparatus<ScriptoriumApi>('codexes')
  const draft = ctx.upstream.draft as DraftYields

  const result = await scriptorium.seal({
    codexName: draft.codexName,
    sourceBranch: draft.branch,
  })

  return {
    status: 'completed',
    yields: {
      sealedCommit: result.sealedCommit,
      strategy: result.strategy,
      retries: result.retries,
      inscriptionsSealed: result.inscriptionsSealed,
    } satisfies SealYields,
  }
}
```

The seal engine does **not** transition the writ — that's handled by the CDC handler on the rigs book.

---

## CDC Handler

The Spider registers one CDC handler at startup:

### Rig terminal state → writ transition

**Book:** `rigs`
**Phase:** Phase 1 (cascade) — the writ transition joins the same transaction as the rig update
**Trigger:** rig status transitions to `completed` or `failed`

```typescript
stacks.watch('rigs', async (event) => {
  if (event.type !== 'update') return
  const rig = event.doc
  const prev = event.prev

  // Only fire on terminal transitions
  if (prev.status === rig.status) return
  if (rig.status !== 'completed' && rig.status !== 'failed') return

  if (rig.status === 'completed') {
    const sealYields = rig.engines.find(e => e.id === 'seal')?.yields as SealYields
    await clerk.transition(rig.writId, 'completed', {
      resolution: `Sealed at ${sealYields.sealedCommit} (${sealYields.strategy}, ${sealYields.inscriptionsSealed} inscriptions).`,
    })
  } else {
    const failedEngine = rig.engines.find(e => e.status === 'failed')
    await clerk.transition(rig.writId, 'failed', {
      resolution: `Engine '${failedEngine?.id}' failed: ${failedEngine?.error ?? 'unknown error'}`,
    })
  }
})
```

Because this is Phase 1 (cascade), the writ transition joins the same transaction as the rig status update. If the Clerk call throws, the rig update rolls back too.

---

## Engine Failure

When any engine fails (throws, or a quick engine's session has `status: 'failed'`):

1. The engine is marked `status: 'failed'` with the error (detected during "collect completed engines" for quick engines, or directly during execution for clockwork engines)
2. The rig is marked `status: 'failed'` (same transaction)
3. CDC fires on the rig status change → handler calls Clerk API to transition the writ to `failed`
4. The draft is **not** abandoned — preserved for patron inspection

No retry. No recovery. The patron inspects and decides what to do. This is appropriate for the static rig — see [Future Evolution](#future-evolution) for the retry/recovery direction.

Quick engine "failure" definition: if the Animator session completes with `status: 'failed'`, the engine fails. If the session completes with `status: 'completed'`, the engine succeeds — even if the anima's work is incomplete (that's the review engine's job to catch, not the Spider's).

---

## Dependency Map

```
Spider
  ├── Fabricator  (resolve engine designs by designId)
  ├── Clerk       (query ready writs, transition writ state via CDC)
  ├── Stacks      (persist rigs book, read sessions book, CDC handler on rigs book)
  │
  Engines (via guild() singleton, not Spider dependencies)
  ├── Scriptorium (draft, seal engines — open drafts, seal)
  ├── Animator    (implement, review, revise engines — summon animas)
  └── Loom        (via Animator's summon — context composition)
```

---

## Future Evolution

These are known directions the Spider and its data model will grow. None are in scope for the static rig MVP.

- **givensSpec templates.** The givensSpec currently holds literal values set at rig spawn time. It will grow to support template expressions (e.g. `${draft.worktreePath}`) that resolve specific values from upstream yields into typed givens, replacing the current reliance on the `context.upstream` escape hatch.
- **Engine needs declarations.** Engine designs will declare a `needs` specification that controls which upstream yields are included and how they're mapped — making the data flow between engines explicit and type-safe.
- **Typed engine contracts.** The `Record<string, unknown>` givens map with type assertions is scaffolding. The needs/planning system will introduce typed contracts between engines — defining what each engine requires and provides. This scaffolding gets replaced, not extended.
- **Dynamic rig extension.** Capability resolution (via the Fabricator) and rig growth at runtime. Engines can declare needs that the Fabricator resolves to additional engine chains, grafted onto the rig mid-execution.
- **Retry and recovery.** The static rig has no retry. Recovery logic arrives with dynamic extension — a failed engine can trigger a recovery chain rather than failing the whole rig.
- **Engine timeouts.** The `startedAt` field on engine instances is included in the data model for future use. During the collect step, the Spider checks `startedAt` against a configurable timeout. If an engine has been running longer than the threshold, the Spider marks it failed (and optionally terminates the session).
- **Unified capability catalog.** The Fabricator may absorb tool designs from the Instrumentarium, becoming the single answer to "what can this guild do?" regardless of whether the answer is an engine or a tool.

---

## What This Spec Does NOT Cover

- **Origination.** Commission → rig mapping is hardcoded (static graph).
- **The Executor as a separate apparatus.** The Spider runs engines directly — clockwork engines inline, quick engines via the Animator. The Executor earns its independence when substrate switching (Docker, remote VM) is needed. Key design constraint: the Spider currently `await`s `design.run()`, meaning a slow or misbehaving engine blocks the entire crawl loop. The Executor must not have this property — engine execution should be fully non-blocking, with yields persisted to a book so the orchestrator can poll for completion. This is essential for remote and Docker runners where the process that ran the engine is not the process polling for results.
- **Concurrent rigs.** The priority system supports multiple rigs in principle, but the polling loop + single-guild model means we process one commission at a time in practice. Concurrency comes naturally when the Spider processes multiple ready engines across rigs.
- **Reviewer role curriculum/temperament.** The `reviewer` role exists with a blank identity. The review engine assembles the prompt. Loom content for the reviewer is a separate concern.

---

## Configuration

```json
{
  "spider": {
    "role": "artificer",
    "pollIntervalMs": 5000,
    "buildCommand": "pnpm build",
    "testCommand": "pnpm test"
  }
}
```

All fields optional. `role` defaults to `"artificer"`. `pollIntervalMs` defaults to `5000`. `buildCommand` and `testCommand` are run by the review engine before launching the reviewer; omitted means those mechanical checks are skipped (reviewer anima still does spec-vs-diff assessment).

=== CONTEXT FILE: docs/architecture/apparatus/scriptorium.md ===
# The Scriptorium — API Contract

Status: **Draft**

Package: `@shardworks/codexes-apparatus` · Plugin id: `codexes`

> **⚠️ MVP scope.** This spec covers codex registration, draft binding lifecycle, and sealing/push operations. Clockworks integration (events, standing orders) is future work — the Scriptorium will emit events when the Clockworks apparatus exists. The Surveyor's codex-awareness integration is also out of scope for now.

---

## Purpose

The Scriptorium manages the guild's codexes — the git repositories where the guild's inscriptions accumulate. It owns the registry of known codexes, maintains local bare clones for efficient access, opens and closes draft bindings (worktrees) for concurrent work, and handles the sealing lifecycle that incorporates drafts into the sealed binding.

The Scriptorium does **not** know what a codex contains or what work applies to it (that's the Surveyor's domain). It does **not** orchestrate which anima works in which draft (that's the caller's concern — rig engines, dispatch scripts, or direct human invocation). It is pure git infrastructure — repository lifecycle, draft isolation, and branch management.

### Vocabulary Mapping

The Scriptorium's tools use the [guild metaphor's binding vocabulary](../../guild-metaphor.md#binding-canonical). The mapping to git concepts:

| Metaphor | Git | Scriptorium API |
|----------|-----|-----------------|
| **Codex** | Repository | `add`, `list`, `show`, `remove`, `fetch` |
| **Draft binding** (draft) | Worktree + branch | `openDraft`, `listDrafts`, `abandonDraft` |
| **Sealed binding** | Default branch (e.g. `main`) | Target of `seal` |
| **Sealing** | Fast-forward merge (or rebase + ff) | `seal` |
| **Abandoning** | Remove worktree + branch | `abandonDraft` |
| **Inscription** | Commit | *(not managed by the Scriptorium — animas inscribe directly via git)* |

Use plain git terms (branch, commit, merge) in error messages and logs where precision matters; the binding vocabulary is for the tool-facing API and documentation.

---

## Dependencies

```
requires: ['stacks']
consumes: []
```

- **The Stacks** — persists the codex registry and draft tracking records. Configuration in `guild.json` is the source of truth for registered codexes; the Stacks tracks runtime state (active drafts, clone status).

---

## Kit Interface

The Scriptorium does not consume kit contributions. No `consumes` declaration.

---

## Support Kit

```typescript
supportKit: {
  tools: [
    codexAddTool,
    codexListTool,
    codexShowTool,
    codexRemoveTool,
    codexPushTool,
    draftOpenTool,
    draftListTool,
    draftAbandonTool,
    draftSealTool,
  ],
},
```

---

## `ScriptoriumApi` Interface (`provides`)

```typescript
interface ScriptoriumApi {
  // ── Codex Registry ──────────────────────────────────────────

  /**
   * Register an existing repository as a codex.
   * Clones a bare copy to `.nexus/codexes/<name>.git` and adds the
   * entry to the `codexes` config section in `guild.json`.
   * Blocks until the clone completes.
   */
  add(name: string, remoteUrl: string): Promise<CodexRecord>

  /**
   * List all registered codexes with their status.
   */
  list(): Promise<CodexRecord[]>

  /**
   * Show details for a single codex, including active drafts.
   */
  show(name: string): Promise<CodexDetail>

  /**
   * Remove a codex from the guild. Abandons all active drafts,
   * removes the bare clone from `.nexus/codexes/`, and removes the
   * entry from `guild.json`. Does NOT delete the remote repository.
   */
  remove(name: string): Promise<void>

  /**
   * Fetch latest refs from the remote for a codex's bare clone.
   * Called automatically before draft creation and sealing; can
   * also be invoked manually.
   */
  fetch(name: string): Promise<void>

  /**
   * Push a branch to the codex's remote.
   * Pushes the specified branch (default: codex's default branch)
   * to the bare clone's configured remote. Does not force-push.
   */
  push(request: PushRequest): Promise<void>

  // ── Draft Binding Lifecycle ─────────────────────────────────

  /**
   * Open a draft binding on a codex.
   *
   * Creates a new git branch from `startPoint` (default: the codex's
   * sealed binding) and checks it out as an isolated worktree under
   * `.nexus/worktrees/<codex>/<branch>`. Fetches from the remote
   * before branching to ensure freshness.
   *
   * If `branch` is omitted, generates one automatically as `draft-<ulid>`.
   * Rejects with a clear error if a draft with the same branch name
   * already exists for this codex.
   */
  openDraft(request: OpenDraftRequest): Promise<DraftRecord>

  /**
   * List active drafts, optionally filtered by codex.
   */
  listDrafts(codexName?: string): Promise<DraftRecord[]>

  /**
   * Abandon a draft — remove the draft's worktree and git branch.
   * Fails if the draft has unsealed inscriptions unless `force: true`.
   * The inscriptions persist in the git reflog but the draft is no
   * longer active.
   */
  abandonDraft(request: AbandonDraftRequest): Promise<void>

  /**
   * Seal a draft — incorporate its inscriptions into the sealed binding.
   *
   * Git strategy: fast-forward merge only. If ff is not possible,
   * rebases the draft branch onto the target and retries. Retries up
   * to `maxRetries` times (default: from settings.maxMergeRetries)
   * to handle contention from concurrent sealing. Fails hard if the
   * rebase produces conflicts — no auto-resolution, no merge commits.
   *
   * On success, abandons the draft (unless `keepDraft: true`).
   */
  seal(request: SealRequest): Promise<SealResult>
}
```

### Supporting Types

```typescript
interface CodexRecord {
  /** Codex name — unique within the guild. */
  name: string
  /** Remote repository URL. */
  remoteUrl: string
  /** Whether the bare clone exists and is healthy. */
  cloneStatus: 'ready' | 'cloning' | 'error'
  /** Number of active drafts for this codex. */
  activeDrafts: number
}

interface CodexDetail extends CodexRecord {
  /** Default branch name on the remote (e.g. 'main'). */
  defaultBranch: string
  /** Timestamp of last fetch. */
  lastFetched: string | null
  /** Active drafts for this codex. */
  drafts: DraftRecord[]
}

interface DraftRecord {
  /** Unique draft id (ULID). */
  id: string
  /** Codex this draft belongs to. */
  codexName: string
  /** Git branch name for this draft. */
  branch: string
  /** Absolute filesystem path to the draft's working directory (git worktree). */
  path: string
  /** When the draft was opened. */
  createdAt: string
  /** Optional association — e.g. a writ id. */
  associatedWith?: string
}

interface OpenDraftRequest {
  /** Codex to open the draft for. */
  codexName: string
  /** Branch name for the draft. If omitted, generates `draft-<ulid>`. */
  branch?: string
  /**
   * Starting point — branch, tag, or commit to branch from.
   * Default: remote HEAD (the codex's default branch).
   */
  startPoint?: string
  /** Optional association metadata (e.g. writ id). */
  associatedWith?: string
}

interface AbandonDraftRequest {
  /** Codex name. */
  codexName: string
  /** Git branch name of the draft to abandon. */
  branch: string
  /** Force abandonment even if the draft has unsealed inscriptions. */
  force?: boolean
}

interface SealRequest {
  /** Codex name. */
  codexName: string
  /** Git branch to seal (the draft's branch). */
  sourceBranch: string
  /** Target branch (the sealed binding). Default: codex's default branch. */
  targetBranch?: string
  /** Max rebase retry attempts under contention. Default: from settings.maxMergeRetries (3). */
  maxRetries?: number
  /** Keep the draft after successful sealing. Default: false. */
  keepDraft?: boolean
}

interface SealResult {
  /** Whether sealing succeeded. */
  success: boolean
  /** Strategy used: 'fast-forward' or 'rebase'. */
  strategy: 'fast-forward' | 'rebase'
  /** Number of retry attempts needed (0 = first try). */
  retries: number
  /** The commit SHA at head of target after sealing. */
  sealedCommit: string
  /** Number of inscriptions (commits) incorporated from the draft. 0 means no-op seal. */
  inscriptionsSealed: number
}

interface PushRequest {
  /** Codex name. */
  codexName: string
  /**
   * Branch to push. Default: codex's default branch.
   */
  branch?: string
}
```

---

## Configuration

The `codexes` key in `guild.json` has two sections: `settings` (apparatus-level configuration) and `registered` (the codex registry). Both can be edited by hand or through tools.

```json
{
  "codexes": {
    "settings": {
      "maxMergeRetries": 3,
      "draftRoot": ".nexus/worktrees"
    },
    "registered": {
      "nexus": {
        "remoteUrl": "git@github.com:shardworks/nexus.git"
      },
      "my-app": {
        "remoteUrl": "git@github.com:patron/my-app.git"
      }
    }
  }
}
```

### Settings

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `maxMergeRetries` | `number` | `3` | Max rebase-retry attempts during sealing under contention. |
| `draftRoot` | `string` | `".nexus/worktrees"` | Directory where draft worktrees are created, relative to guild root. |

### Registered Codexes

Each key in `registered` is the codex name (unique within the guild). The value:

| Field | Type | Description |
|-------|------|-------------|
| `remoteUrl` | `string` | The remote URL of the codex's git repository. Used for cloning and fetching. |

The config is intentionally minimal — a human can add a codex by hand-editing `guild.json` and the Scriptorium will pick it up on next startup (cloning the bare repo if needed).

---

## Tool Definitions

### `codex-add`

Register an existing repository as a codex.

```typescript
tool({
  name: 'codex-add',
  description: 'Register an existing git repository as a guild codex',
  permission: 'write',
  params: {
    name: z.string().describe('Name for the codex (unique within the guild)'),
    remoteUrl: z.string().describe('Git remote URL of the repository'),
  },
  handler: async ({ name, remoteUrl }) => {
    const api = guild().apparatus<ScriptoriumApi>('codexes')
    return api.add(name, remoteUrl)
  },
})
```

### `codex-list`

List all registered codexes.

```typescript
tool({
  name: 'codex-list',
  description: 'List all codexes registered with the guild',
  permission: 'read',
  params: {},
  handler: async () => {
    const api = guild().apparatus<ScriptoriumApi>('codexes')
    return api.list()
  },
})
```

### `codex-show`

Show details of a specific codex including active drafts.

```typescript
tool({
  name: 'codex-show',
  description: 'Show details of a registered codex including active draft bindings',
  permission: 'read',
  params: {
    name: z.string().describe('Codex name'),
  },
  handler: async ({ name }) => {
    const api = guild().apparatus<ScriptoriumApi>('codexes')
    return api.show(name)
  },
})
```

### `codex-remove`

Remove a codex from the guild (does not delete the remote).

```typescript
tool({
  name: 'codex-remove',
  description: 'Remove a codex from the guild (does not affect the remote repository)',
  permission: 'delete',
  params: {
    name: z.string().describe('Codex name to remove'),
  },
  handler: async ({ name }) => {
    const api = guild().apparatus<ScriptoriumApi>('codexes')
    return api.remove(name)
  },
})
```

### `codex-push`

Push a branch to the codex's remote.

```typescript
tool({
  name: 'codex-push',
  description: 'Push a branch to the codex remote',
  permission: 'write',
  params: {
    codexName: z.string().describe('Codex name'),
    branch: z.string().optional().describe('Branch to push (default: codex default branch)'),
  },
  handler: async (params) => {
    const api = guild().apparatus<ScriptoriumApi>('codexes')
    return api.push(params)
  },
})
```

### `draft-open`

Open a draft binding — create an isolated worktree for a codex.

```typescript
tool({
  name: 'draft-open',
  description: 'Open a draft binding on a codex (creates an isolated git worktree)',
  permission: 'write',
  params: {
    codexName: z.string().describe('Codex to open the draft for'),
    branch: z.string().optional().describe('Branch name for the draft (default: auto-generated draft-<ulid>)'),
    startPoint: z.string().optional().describe('Branch/tag/commit to start from (default: remote HEAD)'),
    associatedWith: z.string().optional().describe('Optional association (e.g. writ id)'),
  },
  handler: async (params) => {
    const api = guild().apparatus<ScriptoriumApi>('codexes')
    return api.openDraft(params)
  },
})
```

### `draft-list`

List active draft bindings.

```typescript
tool({
  name: 'draft-list',
  description: 'List active draft bindings, optionally filtered by codex',
  permission: 'read',
  params: {
    codexName: z.string().optional().describe('Filter by codex name'),
  },
  handler: async ({ codexName }) => {
    const api = guild().apparatus<ScriptoriumApi>('codexes')
    return api.listDrafts(codexName)
  },
})
```

### `draft-abandon`

Abandon a draft binding.

```typescript
tool({
  name: 'draft-abandon',
  description: 'Abandon a draft binding (removes the git worktree and branch)',
  permission: 'delete',
  params: {
    codexName: z.string().describe('Codex name'),
    branch: z.string().describe('Branch of the draft to abandon'),
    force: z.boolean().optional().describe('Force abandonment even with unmerged changes'),
  },
  handler: async (params) => {
    const api = guild().apparatus<ScriptoriumApi>('codexes')
    return api.abandonDraft(params)
  },
})
```

### `draft-seal`

Seal a draft — merge its branch into the sealed binding.

```typescript
tool({
  name: 'draft-seal',
  description: 'Seal a draft binding into the codex (ff-only merge or rebase; no merge commits)',
  permission: 'write',
  params: {
    codexName: z.string().describe('Codex name'),
    sourceBranch: z.string().describe('Draft branch to seal'),
    targetBranch: z.string().optional().describe('Target branch (default: codex default branch)'),
    maxRetries: z.number().optional().describe('Max rebase retries under contention (default: 3)'),
    keepDraft: z.boolean().optional().describe('Keep draft after sealing (default: false)'),
  },
  handler: async (params) => {
    const api = guild().apparatus<ScriptoriumApi>('codexes')
    return api.seal(params)
  },
})
```

---

## Session Integration

The Scriptorium and the Animator are **intentionally decoupled**. The Scriptorium manages git infrastructure; the Animator manages sessions. Neither knows about the other. They compose through a simple handoff: the `DraftRecord.path` returned by `openDraft()` is the `cwd` passed to the Animator's `summon()` or `animate()`.

### Composition pattern

The binding between a session and a draft is the caller's responsibility. The typical flow:

```
  Orchestrator (dispatch script, rig engine, standing order)
    │
    ├─ 1. scriptorium.openDraft({ codexName, branch })
    │     → DraftRecord { path: '.nexus/worktrees/nexus/writ-42' }
    │
    ├─ 2. animator.summon({ role, prompt, cwd: draft.path })
    │     → session runs, anima inscribes in the draft
    │     → session exits
    │
    ├─ 3. scriptorium.seal({ codexName, sourceBranch })
    │     → draft sealed into codex
    │
    └─ 4. scriptorium.push({ codexName })
          → sealed binding pushed to remote
```

The anima never touches draft lifecycle — it is launched *inside* the draft's working directory and inscribes there naturally. Infrastructure steps (open, seal, push) happen outside the session, ensuring they execute even if the session crashes or times out.

### The `DraftRecord` as handoff object

The `DraftRecord` carries everything the Animator needs:

- **`path`** — the session's `cwd`
- **`codexName`** — for session metadata (which codex this session worked on)
- **`branch`** — for session metadata (which draft)
- **`associatedWith`** — the writ id, if any (passed through to session metadata)

The Animator stores these as opaque metadata on the session record. The Scriptorium doesn't read session records; the Animator doesn't read draft records. They share data through the orchestrator that calls both.

### Why not tighter integration?

Animas cannot reliably manage their own draft lifecycle. A session's working directory is set at launch — the anima cannot relocate itself to a draft it opens mid-session. Even if it could (via absolute paths and `cd`), the failure modes are poor: crashed sessions leave orphaned drafts, forgotten seal steps leave inscriptions stranded, and every anima reimplements the same boilerplate. External orchestration is simpler and more reliable.

---

## Interim Dispatch Pattern

Before rig engines and the Clockworks exist, a shell script orchestrates the open → session → seal → push lifecycle. This is the recommended interim pattern:

```bash
#!/usr/bin/env bash
# dispatch-commission.sh — open a draft, run a session, seal and push
set -euo pipefail

CODEX="${1:?codex name required}"
ROLE="${2:?role required}"
PROMPT="${3:?prompt required}"

# 1. Open a draft binding (branch auto-generated)
DRAFT=$(nsg codex draft-open --codexName "$CODEX")

DRAFT_PATH=$(echo "$DRAFT" | jq -r '.path')
DRAFT_BRANCH=$(echo "$DRAFT" | jq -r '.branch')

# 2. Run the session in the draft
nsg summon \
  --role "$ROLE" \
  --cwd "$DRAFT_PATH" \
  --prompt "$PROMPT" \
  --metadata "{\"codex\": \"$CODEX\", \"branch\": \"$DRAFT_BRANCH\"}"

# 3. Seal the draft into the codex
nsg codex draft-seal \
  --codexName "$CODEX" \
  --sourceBranch "$DRAFT_BRANCH"

# 4. Push the sealed binding to the remote
nsg codex codex-push \
  --codexName "$CODEX"

echo "Commission sealed and pushed for $CODEX ($DRAFT_BRANCH)"
```

This script is intentionally simple — no error recovery, no retry logic beyond what `draft-seal` provides internally. A failed seal leaves the draft in place for manual inspection. A failed push leaves the sealed binding local — re-running `codex-push` is safe. The auto-generated branch name flows through the `DraftRecord` — the orchestrator never needs to invent one.

---

## Bare Clone Architecture

The Scriptorium maintains **bare clones** of each codex under `.nexus/codexes/<name>.git`. This is the local git infrastructure that makes draft operations fast and network-efficient.

```
.nexus/
  codexes/
    nexus.git/          ← bare clone of git@github.com:shardworks/nexus.git
    my-app.git/         ← bare clone of git@github.com:patron/my-app.git
  worktrees/
    nexus/
      writ-42/          ← draft: nexus, branch writ-42
      writ-57/          ← draft: nexus, branch writ-57
    my-app/
      writ-63/          ← draft: my-app, branch writ-63
```

### Why bare clones?

- **Single clone, many drafts.** A bare clone has no working tree of its own — it's just the git object database. Multiple draft worktrees can be created from it simultaneously without duplicating the repository data.
- **Network efficiency.** After the initial clone, updates are `git fetch` operations — fast, incremental, no full re-clone.
- **Transparent to animas.** An anima inscribing in a draft sees a normal git checkout. It doesn't know or care that the underlying repo is a bare clone. `git commit`, `git log`, `git diff` all work normally.
- **Clean separation.** The bare clone in `.nexus/codexes/` is infrastructure; the draft worktrees in `.nexus/worktrees/` are workspaces. Neither pollutes the guild's versioned content.

### Lifecycle

```
codex-add
  ├─ 1. Write entry to guild.json config
  ├─ 2. git clone --bare <remoteUrl> .nexus/codexes/<name>.git
  └─ 3. Record clone status in Stacks

draft-open
  ├─ 1. git fetch (in bare clone) — ensure refs are current
  ├─ 2. git worktree add .nexus/worktrees/<codex>/<branch> -b <branch> <startPoint>
  └─ 3. Record draft in Stacks

draft-seal
  ├─ 1. Fetch remote refs (git fetch --prune origin +refs/heads/*:refs/remotes/origin/*)
  │     → populates refs/remotes/origin/* without touching local sealed binding or draft branches
  ├─ 2. Advance local sealed binding if remote is ahead
  │     → if refs/remotes/origin/<target> is ahead of refs/heads/<target>: advance refs/heads/<target>
  │     → if local is ahead (unpushed seals): keep local — preserves inter-draft contention ordering
  ├─ 3. Attempt fast-forward merge
  │     └─ If ff not possible: rebase source onto target
  │        └─ If rebase conflicts: FAIL (no auto-resolution)
  │        └─ If rebase succeeds: retry ff (up to maxRetries)
  ├─ 4. Update target branch ref in bare clone
  └─ 5. Abandon draft (unless keepDraft)

codex-push
  ├─ 1. git push origin <branch> (from bare clone)
  └─ 2. Never force-push

codex-remove
  ├─ 1. Abandon all drafts for codex
  ├─ 2. Remove bare clone directory
  ├─ 3. Remove entry from guild.json
  └─ 4. Clean up Stacks records
```

### Sealing Strategy Detail

Sealing enforces **linear history** on the sealed binding — no merge commits, no force pushes. If a draft's inscriptions contradict the sealed binding (i.e. the sealed binding has advanced since the draft was opened), the sealing engine attempts to reconcile via rebase. If reconciliation fails, sealing seizes — the tool fails rather than creating non-linear history or silently resolving conflicts.

Git mechanics:

```
Seal Attempt:
  ├─ Try: git merge --ff-only <draft-branch> into <sealed-branch>
  │   ├─ Success → draft sealed
  │   └─ Fail (sealed binding has advanced) →
  │       ├─ Fetch latest sealed binding from remote
  │       ├─ Try: git rebase <sealed-branch> <draft-branch>
  │       │   ├─ Conflict → FAIL (sealing seizes — manual reconciliation needed)
  │       │   └─ Clean rebase →
  │       │       └─ Retry ff-only merge (loop, up to maxRetries)
  │       └─ All retries exhausted → FAIL
  └─ Never: merge commits, force push, conflict auto-resolution
```

The retry loop handles **contention** — when multiple animas seal to the same codex in quick succession, each fetch-rebase-ff cycle picks up the other's sealed inscriptions. Three retries (configurable via `settings.maxMergeRetries`) is sufficient for typical guild concurrency; the limit prevents infinite loops in pathological cases.

---

## Clone Readiness and Fetch Policy

### Initial clone

The `add()` API **blocks until the bare clone completes**. The caller gets back a `CodexRecord` with `cloneStatus: 'ready'` — registration isn't done until the clone is usable. This keeps the contract simple: if `add()` returns successfully, the codex is operational.

At **startup**, the Scriptorium checks each configured codex for an existing bare clone. Missing clones are initiated in the background — the apparatus starts without waiting. However, any tool invocation that requires the bare clone (everything except `codex-list`) **blocks until that codex's clone is ready**. The tool doesn't fail or return stale data; it waits. If the clone fails, the tool fails with a clear error referencing the clone failure.

### Fetch before branch operations

Every operation that creates or modifies branches **fetches from the remote first**:

- **`openDraft`** — fetches before branching, ensuring the start point reflects the latest remote state.
- **`seal`** — fetches the target branch before attempting ff-only, and again on each retry iteration. The fetch uses an explicit refspec (`+refs/heads/*:refs/remotes/origin/*`) to populate remote-tracking refs — a plain `git fetch origin` in a bare clone (which has no default fetch refspec) only updates `FETCH_HEAD` and leaves both `refs/heads/*` and `refs/remotes/origin/*` stale. After fetching, if `refs/remotes/origin/<target>` is strictly ahead of `refs/heads/<target>` (i.e. commits were pushed outside the Scriptorium), the local sealed binding is advanced to the remote position before the seal attempt. This ensures the draft is rebased onto the actual remote state and the subsequent push fast-forwards cleanly.
- **`push`** — does **not** fetch first (it's pushing, not pulling).

`fetch` is also exposed as a standalone API for manual use, but callers generally don't need it — the branch operations handle freshness internally.

### Startup reconciliation

On `start()`, the Scriptorium:

1. Reads the `codexes` config from `guild.json`
2. For each configured codex, checks whether a bare clone exists at `.nexus/codexes/<name>.git`
3. Initiates background clones for any missing codexes
4. Reconciles Stacks records with filesystem state (cleans up records for drafts that no longer exist on disk)

This means a patron can hand-edit `guild.json` to add a codex, and the Scriptorium will clone it on next startup.

---

## Draft Branch Collisions

If a caller requests a draft with a branch name that already exists for that codex, `openDraft` **rejects with a clear error**. Branch naming is the caller's responsibility. Auto-suffixing would hide real problems (two writs accidentally opening drafts on the same branch). Git enforces this at the worktree level — a branch can only be checked out in one worktree at a time — and the Scriptorium surfaces the constraint rather than working around it.

---

## Draft Cleanup

The Scriptorium does **not** automatically reap stale drafts. It provides the `abandonDraft` API; when and why to call it is an external concern. A future reaper process, standing order, or manual cleanup can use `draft-list` and `draft-abandon` as needed. This keeps the Scriptorium ignorant of writ lifecycle and other domain concerns.

---

## Future: Clockworks Events

When the Clockworks apparatus exists, the Scriptorium should emit events for downstream consumers (particularly the Surveyor):

| Event | Payload | When |
|-------|---------|------|
| `codex.added` | `{ name, remoteUrl }` | A codex is registered |
| `codex.removed` | `{ name }` | A codex is deregistered |
| `codex.fetched` | `{ name }` | A codex's bare clone is fetched |
| `draft.opened` | `{ codexName, branch, path, associatedWith? }` | A draft is opened |
| `draft.abandoned` | `{ codexName, branch }` | A draft is abandoned |
| `draft.sealed` | `{ codexName, sourceBranch, targetBranch, strategy }` | A draft is sealed |
| `codex.pushed` | `{ codexName, branch }` | A branch is pushed to remote |

Until then, downstream consumers query the Scriptorium API directly.

---

## Implementation Notes

- **`guild().writeConfig()`** — the Scriptorium uses `guild().writeConfig('codexes', ...)` to persist codex registry changes to `guild.json`. This API was added to the `Guild` interface in `@shardworks/nexus-core` and implemented in Arbor. It updates both the in-memory config and the disk file atomically.
- **Git operations.** All git operations use `child_process.execFile` (not shell) via a lightweight `git.ts` helper that handles error parsing and provides typed results (`GitResult`, `GitError`).
- **Concurrency.** Multiple animas may open/seal drafts concurrently. The bare clone's git operations need appropriate locking — git's own ref locking handles most cases, but the fetch-rebase-seal cycle should be serialized per codex to avoid ref races.
- **No downstream coupling.** The Scriptorium has no dependency on the Surveyor, the Spider, or any other consumer of codex state. It is pure infrastructure. Downstream apparatus query or (future) subscribe to the Scriptorium's state independently.

---

## Future State

### Draft Persistence via Stacks

The current implementation tracks active drafts **in memory**, reconstructed from filesystem state at startup. This is sufficient for MVP — draft worktrees are durable on disk and the Scriptorium reconciles on restart. However, this means:

- Draft metadata (`associatedWith`, `createdAt`) is approximate after a restart — the original values are lost.
- There is no queryable history of past drafts (abandoned or sealed).
- Other apparatus cannot subscribe to draft state changes via CDC.

A future iteration should persist `DraftRecord` entries to a Stacks book (`codexes/drafts`), enabling:

- Durable metadata that survives restarts
- Historical draft records (with terminal status: `sealed`, `abandoned`)
- CDC-driven downstream reactions (e.g. the Surveyor updating its codex-awareness when a draft is sealed)

### Per-Codex Sealing Lock

The sealing retry loop (fetch → rebase → ff) is not currently serialized per codex. Under high concurrency (multiple animas sealing to the same codex simultaneously), ref races are possible. Git's own ref locking prevents corruption, but the retry loop may exhaust retries unnecessarily.

A per-codex async mutex around the seal operation would eliminate this. The lock should be held only during the seal attempt, not during the preceding fetch or the subsequent draft cleanup.

### Clockworks Event Emission

Documented in the **Future: Clockworks Events** section above. When the Clockworks apparatus exists, the Scriptorium should emit events for each lifecycle operation. This replaces the current pattern where downstream consumers poll the API directly.

=== CONTEXT FILE: packages/plugins/loom/package.json ===
{
  "name": "@shardworks/loom-apparatus",
  "version": "0.0.0",
  "license": "ISC",
  "repository": {
    "type": "git",
    "url": "https://github.com/shardworks/nexus",
    "directory": "packages/plugins/loom"
  },
  "description": "The Loom — session context composition apparatus",
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "build": "tsc",
    "test": "node --disable-warning=ExperimentalWarning --experimental-transform-types --test 'src/**/*.test.ts'",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@shardworks/nexus-core": "workspace:*",
    "@shardworks/tools-apparatus": "workspace:*",
    "zod": "4.3.6"
  },
  "devDependencies": {
    "@types/node": "25.5.0"
  },
  "files": [
    "dist"
  ],
  "publishConfig": {
    "exports": {
      ".": {
        "types": "./dist/index.d.ts",
        "import": "./dist/index.js"
      }
    }
  }
}

=== CONTEXT FILE: packages/plugins/loom/tsconfig.json ===
{
  "extends": "../../../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": [
    "src"
  ],
  "exclude": [
    "src/**/*.test.ts"
  ]
}

=== CONTEXT FILE: packages/plugins/loom/src ===
tree fc63741acbf8d152fb17840bab576c8a1148f01d:packages/plugins/loom/src

index.ts
loom.test.ts
loom.ts

=== CONTEXT FILE: packages/plugins/loom/src/index.ts ===
/**
 * @shardworks/loom-apparatus — The Loom.
 *
 * Session context composition: weaves role instructions, curricula, and
 * temperaments into an AnimaWeave that The Animator can consume to
 * launch AI sessions.
 *
 * See: docs/specification.md (loom)
 */

import { createLoom } from './loom.ts';

// ── Loom API ─────────────────────────────────────────────────────────

export {
  type LoomApi,
  type WeaveRequest,
  type AnimaWeave,
  type LoomConfig,
  type RoleDefinition,
  createLoom,
} from './loom.ts';

// ── GuildConfig augmentation ────────────────────────────────────────

// Augment GuildConfig so `guild().guildConfig().loom` is typed without
// requiring a manual type parameter at the call site.
import type { LoomConfig } from './loom.ts';
declare module '@shardworks/nexus-core' {
  interface GuildConfig {
    loom?: LoomConfig;
  }
}

// ── Default export: the apparatus plugin ──────────────────────────────

export default createLoom();



## Codebase Structure (surrounding directories)

```
=== TREE: docs/architecture/ ===
_agent-context.md
apparatus
clockworks.md
index.md
kit-components.md
plugins.md
rigging.md

=== TREE: docs/architecture/apparatus/ ===
_template.md
animator.md
claude-code.md
clerk.md
dispatch.md
fabricator.md
instrumentarium.md
loom.md
parlour.md
review-loop.md
scriptorium.md
spider.md
stacks.md

=== TREE: packages/plugins/loom/ ===
README.md
package.json
src
tsconfig.json

=== TREE: packages/plugins/loom/src/ ===
index.ts
loom.test.ts
loom.ts


```

## Codebase API Surface (declarations available before this commission)

Scope: all 16 workspace projects
Lockfile is up to date, resolution step is skipped
Progress: resolved 1, reused 0, downloaded 0, added 0
Packages: +132
++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
Progress: resolved 132, reused 132, downloaded 0, added 132, done

devDependencies:
+ @tsconfig/node24 24.0.4
+ typescript 5.9.3

Done in 502ms using pnpm v10.32.1
=== packages/framework/arbor/dist/arbor.d.ts ===
/**
 * Arbor — the guild runtime.
 *
 * `createGuild()` is the single entry point. It reads guild.json, loads all
 * declared plugins, validates dependencies, starts apparatus in order, wires
 * the guild() singleton, and returns the Guild object.
 *
 * The full plugin lifecycle:
 *   1. Load    — imports all declared plugin packages, discriminates kit vs apparatus
 *   2. Validate — checks `requires` declarations, detects circular dependencies
 *   3. Start   — calls start(ctx) on each apparatus in dependency-resolved order
 *   4. Events  — fires `plugin:initialized` after each plugin loads
 *   5. Warn    — advisory warnings for mismatched kit contributions / recommends
 *
 * Pure logic (validation, ordering, events) lives in guild-lifecycle.ts.
 * This file handles I/O and orchestration.
 */
import type { Guild } from '@shardworks/nexus-core';
/**
 * Create and start a guild.
 *
 * Reads guild.json, loads all declared plugins, validates dependencies,
 * starts apparatus in dependency order, and returns the Guild object.
 * Also sets the guild() singleton so apparatus code can access it.
 *
 * @param root - Absolute path to the guild root. Defaults to auto-detection
 *               by walking up from cwd until guild.json is found.
 * @returns The initialized Guild — the same object guild() returns.
 */
export declare function createGuild(root?: string): Promise<Guild>;
//# sourceMappingURL=arbor.d.ts.map
=== packages/framework/arbor/dist/guild-lifecycle.d.ts ===
/**
 * Guild lifecycle — pure logic for plugin validation, ordering, and events.
 *
 * All functions here operate on in-memory data structures (LoadedKit[],
 * LoadedApparatus[], Maps) with no I/O. This makes them independently
 * testable with synthetic fixtures.
 *
 * `createGuild()` in arbor.ts is the orchestrator that performs I/O
 * (config reading, dynamic imports) then delegates to these functions.
 */
import type { StartupContext, LoadedKit, LoadedApparatus } from '@shardworks/nexus-core';
export type EventHandlerMap = Map<string, Array<(...args: unknown[]) => void | Promise<void>>>;
/**
 * Validate all `requires` declarations and detect circular dependencies.
 * Throws with a descriptive error on the first problem found.
 *
 * Checks:
 * - Apparatus requires: every named dependency must exist (kit or apparatus).
 * - Kit requires: every named dependency must be an apparatus (kits can't
 *   depend on kits).
 * - Cycle detection: no circular dependency chains among apparatuses.
 */
export declare function validateRequires(kits: LoadedKit[], apparatuses: LoadedApparatus[]): void;
/**
 * Sort apparatuses in dependency-resolved order using topological sort.
 * validateRequires() must be called first to ensure the graph is acyclic.
 */
export declare function topoSort(apparatuses: LoadedApparatus[]): LoadedApparatus[];
/**
 * Collect advisory warnings for kit contributions that no apparatus
 * consumes, and for missing recommended apparatuses.
 *
 * Returns an array of warning strings. The caller decides how to emit
 * them (console.warn, logger, etc.).
 */
export declare function collectStartupWarnings(kits: LoadedKit[], apparatuses: LoadedApparatus[]): string[];
/**
 * Build a StartupContext for an apparatus's start() call.
 * The context provides event subscription; handlers are stored in the
 * shared eventHandlers map so fireEvent can invoke them later.
 */
export declare function buildStartupContext(eventHandlers: EventHandlerMap): StartupContext;
/**
 * Fire a lifecycle event, awaiting each handler sequentially.
 */
export declare function fireEvent(eventHandlers: EventHandlerMap, event: string, ...args: unknown[]): Promise<void>;
//# sourceMappingURL=guild-lifecycle.d.ts.map
=== packages/framework/arbor/dist/index.d.ts ===
/**
 * @shardworks/nexus-arbor — guild runtime
 *
 * The arbor is the guild host: plugin loading, dependency validation,
 * apparatus lifecycle management. It does NOT own tool discovery — that
 * belongs to The Instrumentarium (tools-apparatus).
 *
 * Plugin authors never import from arbor — they import from @shardworks/nexus-core.
 * The CLI imports from arbor to create the guild runtime and trigger startup.
 *
 * Package dependency graph:
 *   core   — public SDK, types, tool() factory
 *   arbor  — guild host, createGuild()
 *   cli    — nsg binary, Commander.js, framework commands + Instrumentarium tools
 *   plugins — import from core only
 */
export { createGuild } from './arbor.ts';
//# sourceMappingURL=index.d.ts.map
=== packages/framework/cli/dist/cli.d.ts ===
#!/usr/bin/env node
/**
 * nsg — CLI entry point, built on the plugin architecture.
 *
 * Dynamically discovers installed tools via plugins, registers them as Commander
 * commands, and delegates argument parsing and invocation to Commander.
 *
 * Tools are filtered to those with 'cli' in callableBy (or no callableBy
 * set, which defaults to all callers). Tools marked 'anima'-only are invisible here.
 */
export {};
//# sourceMappingURL=cli.d.ts.map
=== packages/framework/cli/dist/commands/index.d.ts ===
/**
 * Framework commands — hardcoded CLI commands that work with or without a guild.
 *
 * These are guild lifecycle and plugin management commands that the CLI
 * registers directly, bypassing plugin discovery. They are the CLI's own
 * commands, not tools contributed by kits or apparatus.
 *
 * Plugin-contributed tools are discovered at runtime via The Instrumentarium
 * when a guild is present and the tools apparatus is installed.
 */
import type { ToolDefinition } from '@shardworks/tools-apparatus';
/** All framework commands, typed as the base ToolDefinition for uniform handling. */
export declare const frameworkCommands: ToolDefinition[];
//# sourceMappingURL=index.d.ts.map
=== packages/framework/cli/dist/commands/init.d.ts ===
/**
 * nsg init — create a new guild.
 *
 * A framework command — hardcoded in the CLI, not discovered via plugins.
 *
 * Writes the minimum viable guild: directory structure, guild.json,
 * package.json, .gitignore. Does NOT git init, install bundles, create
 * the database, or instantiate animas — those are separate steps.
 *
 * After init, the user runs `nsg plugin install` to add capabilities.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    path: z.ZodString;
    name: z.ZodOptional<z.ZodString>;
    model: z.ZodOptional<z.ZodString>;
}>;
export default _default;
//# sourceMappingURL=init.d.ts.map
=== packages/framework/cli/dist/commands/plugin.d.ts ===
/**
 * nsg plugin-* — manage guild plugins.
 *
 * Framework commands for plugin lifecycle. Available via CLI only (not MCP).
 *
 * Plugin install/remove are pure npm + guild.json operations. No tool
 * discovery at install time — tools are resolved at runtime by the
 * Instrumentarium via its permission-based model.
 */
import { z } from 'zod';
/**
 * Detect the package manager used by the guild.
 *
 * Checks for lockfiles in order of specificity. Falls back to 'npm'
 * when no lockfile is present (e.g. fresh guilds before first install).
 */
export declare function detectPackageManager(guildRoot: string): 'npm' | 'pnpm';
export declare const pluginList: import("@shardworks/tools-apparatus").ToolDefinition<{
    json: z.ZodOptional<z.ZodBoolean>;
}>;
export declare const pluginInstall: import("@shardworks/tools-apparatus").ToolDefinition<{
    source: z.ZodString;
    type: z.ZodOptional<z.ZodEnum<{
        link: "link";
        registry: "registry";
    }>>;
}>;
export declare const pluginRemove: import("@shardworks/tools-apparatus").ToolDefinition<{
    name: z.ZodString;
}>;
export declare const pluginUpgrade: import("@shardworks/tools-apparatus").ToolDefinition<{
    name: z.ZodString;
    version: z.ZodOptional<z.ZodString>;
}>;
//# sourceMappingURL=plugin.d.ts.map
=== packages/framework/cli/dist/commands/status.d.ts ===
/**
 * nsg status — guild status.
 *
 * A framework command. Shows guild identity, framework version, and installed plugins
 * separated into apparatuses (running infrastructure) and kits (passive capabilities).
 * Domain-specific status (writ counts, session history, clock state) belongs
 * to plugins, not here.
 *
 * Requires a booted guild — prints a friendly error if run outside one.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    json: z.ZodOptional<z.ZodBoolean>;
}>;
export default _default;
//# sourceMappingURL=status.d.ts.map
=== packages/framework/cli/dist/commands/test-helpers.d.ts ===
/**
 * Shared test helpers for CLI command tests.
 *
 * Provides guild accessor setup, temp directory management, and minimal
 * guild.json scaffolding. Extracted from status.test.ts, version.test.ts,
 * and plugin.test.ts where these were copy-pasted identically.
 */
/** Set up a minimal guild accessor pointing at the given directory. */
export declare function setupGuildAccessor(home: string): void;
/** Create a temp directory and register it for cleanup. */
export declare function makeTmpDir(prefix: string): string;
/** Write a minimal guild.json to dir, with optional overrides. */
export declare function makeGuild(dir: string, overrides?: Record<string, unknown>): void;
/** Write a guild-root package.json declaring the given npm dependencies. */
export declare function makeGuildPackageJson(dir: string, deps: Record<string, string>): void;
/** Clean up guild state and temp directories. Call from afterEach(). */
export declare function cleanupTestState(): void;
//# sourceMappingURL=test-helpers.d.ts.map
=== packages/framework/cli/dist/commands/upgrade.d.ts ===
/**
 * nsg upgrade — upgrade the guild framework.
 *
 * Stub — upgrade lifecycle not yet designed. Will handle framework version
 * bumps, guild.json schema reconciliation, and plugin-specific upgrade
 * hooks when implemented.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    dryRun: z.ZodOptional<z.ZodBoolean>;
}>;
export default _default;
//# sourceMappingURL=upgrade.d.ts.map
=== packages/framework/cli/dist/commands/version.d.ts ===
/**
 * nsg version — show framework and plugin version info.
 *
 * A framework command — hardcoded in the CLI, not discovered via plugins.
 *
 * Always shows framework and Node versions. When run inside a guild,
 * additionally shows installed plugin versions. Gracefully degrades
 * when run outside a guild (no error, just less info).
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    json: z.ZodOptional<z.ZodBoolean>;
}>;
export default _default;
//# sourceMappingURL=version.d.ts.map
=== packages/framework/cli/dist/helpers.d.ts ===
/**
 * Pure helper functions for CLI command generation.
 *
 * Extracted from program.ts so they can be tested independently
 * without pulling in heavy runtime dependencies (Arbor, Instrumentarium).
 */
import { z } from 'zod';
import type { ToolDefinition } from '@shardworks/tools-apparatus';
/**
 * Convert camelCase key to kebab-case CLI flag.
 * e.g. 'writId' → '--writ-id'
 */
export declare function toFlag(key: string): string;
/**
 * Detect whether a Zod schema accepts booleans (and only booleans).
 * Used to register Commander flags without <value> for boolean params.
 */
export declare function isBooleanSchema(schema: z.ZodTypeAny): boolean;
/**
 * Determine which hyphen prefixes have enough tools to warrant a group.
 *
 * Returns a Set of prefixes that have 2+ tools sharing them.
 * 'plugin-list' + 'plugin-install' → 'plugin' is a group.
 * 'show-writ' alone → 'show' is NOT a group.
 */
export declare function findGroupPrefixes(tools: ToolDefinition[]): Set<string>;
//# sourceMappingURL=helpers.d.ts.map
=== packages/framework/cli/dist/index.d.ts ===
export { VERSION } from '@shardworks/nexus-core';
export { main } from './program.ts';
export { frameworkCommands } from './commands/index.ts';
//# sourceMappingURL=index.d.ts.map
=== packages/framework/cli/dist/program.d.ts ===
/**
 * nsg program — dynamic Commander setup.
 *
 * Two command sources:
 *
 * 1. **Framework commands** — hardcoded in the CLI package (init, status,
 *    version, upgrade, plugin management). Always available, even without
 *    a guild.
 *
 * 2. **Plugin tools** — discovered at runtime via The Instrumentarium
 *    (tools apparatus). Only available when a guild is present and the
 *    tools apparatus is installed.
 *
 * Tool names are auto-grouped when multiple tools share a hyphen prefix:
 * 'plugin-list' + 'plugin-install' → 'nsg plugin list' / 'nsg plugin install'.
 * A tool like 'show-writ' stays flat ('nsg show-writ') since no other tool
 * starts with 'show-'.
 */
export declare function main(): Promise<void>;
//# sourceMappingURL=program.d.ts.map
=== packages/framework/core/dist/guild-config.d.ts ===
/** A custom event declaration in guild.json clockworks.events. */
export interface EventDeclaration {
    /** Human-readable description of what this event means. */
    description?: string;
    /** Optional payload schema hint (not enforced in Phase 1). */
    schema?: Record<string, string>;
}
/** A standing order — a registered response to an event. */
export type StandingOrder = {
    on: string;
    run: string;
} | {
    on: string;
    summon: string;
    prompt?: string;
} | {
    on: string;
    brief: string;
};
/** The clockworks configuration block in guild.json. */
export interface ClockworksConfig {
    /** Custom event declarations. */
    events?: Record<string, EventDeclaration>;
    /** Standing orders — event → action mappings. */
    standingOrders?: StandingOrder[];
}
/** Guild-level settings — operational flags and preferences. */
export interface GuildSettings {
    /**
     * Default LLM model for anima sessions (e.g. 'sonnet', 'opus').
     * Replaces the top-level `model` field from GuildConfig V1.
     */
    model?: string;
    /**
     * Automatically apply pending database migrations when the Books are opened.
     * Defaults to `true` when not specified. Set to `false` to require explicit
     * migration via `nsg guild upgrade-books`.
     */
    autoMigrate?: boolean;
}
/**
 * Guild configuration.
 *
 * The plugin-centric model: plugins are npm packages; capabilities (tools, engines,
 * training content) are declared by plugins and discovered dynamically at runtime.
 * Framework-level keys (`name`, `nexus`, `plugins`, `settings`) are defined here;
 * all other top-level keys are plugin configuration sections, keyed by plugin id.
 */
export interface GuildConfig {
    /** Guild name — used as the guildhall npm package name. */
    name: string;
    /** Installed Nexus framework version. */
    nexus: string;
    /** Installed plugin ids (derived from npm package names). Always present; starts empty. */
    plugins: string[];
    /** Clockworks configuration — events, standing orders. */
    clockworks?: ClockworksConfig;
    /** Guild-level settings — operational flags and preferences. Includes default model. */
    settings?: GuildSettings;
}
/**
 * Create the default guild.json content for a new guild.
 * All collections start empty. The default model is stored in settings.
 */
export declare function createInitialGuildConfig(name: string, nexusVersion: string, model: string): GuildConfig;
/** Read and parse guild.json from the guild root. */
export declare function readGuildConfig(home: string): GuildConfig;
/** Write guild.json to the guild root. */
export declare function writeGuildConfig(home: string, config: GuildConfig): void;
/** Resolve the path to guild.json in the guild root. */
export declare function guildConfigPath(home: string): string;
//# sourceMappingURL=guild-config.d.ts.map
=== packages/framework/core/dist/guild.d.ts ===
/**
 * Guild — the process-level singleton for accessing guild infrastructure.
 *
 * All plugin code — apparatus start(), tool handlers, engine handlers,
 * relay handlers, CDC handlers — imports `guild()` to access apparatus APIs,
 * plugin config, the guild root path, and the loaded plugin graph.
 *
 * Arbor creates the Guild instance before starting apparatus and registers
 * it via `setGuild()`. The instance is backed by live data structures
 * (e.g. the provides Map) that are populated progressively as apparatus start.
 *
 * See: docs/architecture/plugins.md
 */
import type { GuildConfig } from './guild-config.ts';
import type { LoadedKit, LoadedApparatus } from './plugin.ts';
/**
 * Runtime access to guild infrastructure.
 *
 * Available after Arbor creates the instance (before apparatus start).
 * One instance per process.
 */
export interface Guild {
    /** Absolute path to the guild root (contains guild.json). */
    readonly home: string;
    /**
     * Retrieve a started apparatus's provides object by plugin id.
     *
     * Throws if the apparatus is not installed or has no `provides`.
     * During startup, only apparatus that have already started are visible
     * (dependency ordering guarantees declared deps are started first).
     */
    apparatus<T>(name: string): T;
    /**
     * Read a plugin's configuration section from guild.json.
     *
     * Returns `guild.json[pluginId]` cast to `T`. Returns `{}` if no
     * section exists. The generic parameter is a cast — the framework
     * does not validate config shape.
     */
    config<T = Record<string, unknown>>(pluginId: string): T;
    /**
     * Write a plugin's configuration section to guild.json.
     *
     * Updates `guild.json[pluginId]` with `value` and writes the file
     * to disk. Also updates the in-memory config so subsequent reads
     * reflect the change.
     *
     * For framework-level keys (name, nexus, plugins, settings), use
     * the standalone `writeGuildConfig()` function instead.
     */
    writeConfig<T = Record<string, unknown>>(pluginId: string, value: T): void;
    /**
     * Read the full parsed guild.json.
     *
     * Escape hatch for framework-level fields (name, nexus, plugins,
     * settings) that don't belong to any specific plugin.
     */
    guildConfig(): GuildConfig;
    /** Snapshot of all loaded kits (including apparatus supportKits). */
    kits(): LoadedKit[];
    /** Snapshot of all started apparatuses. */
    apparatuses(): LoadedApparatus[];
}
/**
 * Get the active guild instance.
 *
 * Throws with a clear message if called before Arbor has initialized
 * the guild (e.g. at module import time, before startup begins).
 */
export declare function guild(): Guild;
/**
 * Set the guild instance. Called by Arbor before starting apparatus.
 *
 * Not for plugin use — this is framework infrastructure.
 */
export declare function setGuild(g: Guild): void;
/**
 * Clear the guild instance. Called by Arbor at shutdown or in tests.
 *
 * Not for plugin use — this is framework infrastructure.
 */
export declare function clearGuild(): void;
//# sourceMappingURL=guild.d.ts.map
=== packages/framework/core/dist/id.d.ts ===
/**
 * Generate a sortable, prefixed ID.
 *
 * Format: `{prefix}-{base36_timestamp}-{hex_random}`
 *
 * The timestamp component (Date.now() in base36) gives lexicographic sort
 * order by creation time. The random suffix prevents collisions without
 * coordination.
 *
 * @param prefix     Short, type-identifying string (e.g. `w`, `ses`, `turn`)
 * @param randomByteCount  Number of random bytes; produces 2× hex digits (default 6 → 12 hex chars)
 */
export declare function generateId(prefix: string, randomByteCount?: number): string;
//# sourceMappingURL=id.d.ts.map
=== packages/framework/core/dist/index.d.ts ===
export declare const VERSION: string;
export { type Kit, type Apparatus, type Plugin, type LoadedKit, type LoadedApparatus, type LoadedPlugin, type StartupContext, isKit, isApparatus, isLoadedKit, isLoadedApparatus, } from './plugin.ts';
export { type Guild, guild, setGuild, clearGuild, } from './guild.ts';
export { findGuildRoot, nexusDir, worktreesPath, clockPidPath, clockLogPath, } from './nexus-home.ts';
export { derivePluginId, readGuildPackageJson, resolvePackageNameForPluginId, resolveGuildPackageEntry, } from './resolve-package.ts';
export { type GuildConfig, createInitialGuildConfig, readGuildConfig, writeGuildConfig, type EventDeclaration, type StandingOrder, type ClockworksConfig, type GuildSettings, guildConfigPath, } from './guild-config.ts';
export { generateId } from './id.ts';
//# sourceMappingURL=index.d.ts.map
=== packages/framework/core/dist/nexus-home.d.ts ===
/**
 * Find the guild root by walking up from a starting directory looking for guild.json.
 *
 * This replaces the old NEXUS_HOME env var approach. The guild root IS the
 * guildhall — a regular git clone with guild.json at the root.
 *
 * @param startDir - Directory to start searching from (defaults to cwd).
 * @throws If no guild.json is found before reaching the filesystem root.
 */
export declare function findGuildRoot(startDir?: string): string;
/** Path to the .nexus framework-managed directory. */
export declare function nexusDir(home: string): string;
/** Path to the top-level worktrees directory (for writ worktrees). */
export declare function worktreesPath(home: string): string;
/** Path to the clockworks daemon PID file. */
export declare function clockPidPath(home: string): string;
/** Path to the clockworks daemon log file. */
export declare function clockLogPath(home: string): string;
//# sourceMappingURL=nexus-home.d.ts.map
=== packages/framework/core/dist/plugin.d.ts ===
/**
 * Plugin system — core types for the Kit/Apparatus model.
 *
 * Plugins come in two kinds:
 * - Kit:       passive package contributing capabilities to consuming apparatuses.
 *              No lifecycle, no running state. Read at load time.
 * - Apparatus: package contributing persistent running infrastructure.
 *              Has a start/stop lifecycle. Receives StartupContext at start.
 *
 * See: docs/architecture/plugins.md
 */
/** A kit as tracked by the Arbor runtime. */
export interface LoadedKit {
    readonly packageName: string;
    readonly id: string;
    readonly version: string;
    readonly kit: Kit;
}
/** An apparatus as tracked by the Arbor runtime. */
export interface LoadedApparatus {
    readonly packageName: string;
    readonly id: string;
    readonly version: string;
    readonly apparatus: Apparatus;
}
/** Union of loaded kit and loaded apparatus. */
export type LoadedPlugin = LoadedKit | LoadedApparatus;
/**
 * Startup context passed to an apparatus's start(ctx).
 *
 * Provides lifecycle-event subscription — the only capability that is
 * meaningful only during startup. All other guild access (apparatus APIs,
 * config, home path, loaded plugins) goes through the `guild()` singleton,
 * which is available during start() and in all handlers.
 *
 * See: docs/architecture/plugins.md
 */
export interface StartupContext {
    /** Subscribe to a guild lifecycle event. Handlers may be async; run sequentially. */
    on(event: string, handler: (...args: unknown[]) => void | Promise<void>): void;
}
/**
 * A kit — passive package contributing capabilities to consuming apparatuses.
 * Open record: contribution fields (engines, relays, tools, etc.) are defined
 * by the apparatus packages that consume them. `requires` and `recommends` are
 * the only framework-level fields.
 *
 * `requires`: apparatus names whose runtime APIs this kit's contributions depend
 *   on at handler invocation time. Hard startup validation failure if a declared
 *   apparatus is not installed.
 *
 * `recommends`: advisory apparatus names — generates startup warnings when
 *   expected apparatuses are absent. Not enforced.
 */
export type Kit = {
    requires?: string[];
    recommends?: string[];
    [key: string]: unknown;
};
/**
 * An apparatus — package contributing persistent running infrastructure.
 * Has a start/stop lifecycle. Receives StartupContext at start.
 *
 * `requires`: apparatus names that must be started before this apparatus's
 *   start() runs. Determines start ordering. Hard startup validation failure
 *   if a declared apparatus is not installed.
 *
 * `recommends`: advisory apparatus names — generates startup warnings when
 *   expected apparatuses are absent. Not enforced — the apparatus starts
 *   regardless. Use for soft dependencies needed by optional API methods
 *   (e.g. The Animator recommends The Loom for summon(), but animate()
 *   works without it).
 *
 * `provides`: the runtime API object this apparatus exposes to other plugins.
 *   Retrieved via guild().apparatus<T>(name). Created at manifest-definition time,
 *   populated during start.
 *
 * `supportKit`: kit contributions this apparatus exposes to consuming apparatuses.
 *   Treated identically to standalone kit contributions by consumers.
 *
 * `consumes`: kit contribution field types this apparatus scans for and registers.
 *   Enables framework startup warnings when kits contribute types with no consumer.
 */
export type Apparatus = {
    requires?: string[];
    recommends?: string[];
    provides?: unknown;
    start: (ctx: StartupContext) => void | Promise<void>;
    stop?: () => void | Promise<void>;
    supportKit?: Kit;
    consumes?: string[];
};
/**
 * The discriminated union plugin type. A plugin is either a kit or an apparatus.
 * The plugin name is always inferred from the npm package name at load time —
 * it is never declared in the manifest.
 */
export type Plugin = {
    kit: Kit;
} | {
    apparatus: Apparatus;
};
/** Type guard: is this value a kit plugin export? */
export declare function isKit(obj: unknown): obj is {
    kit: Kit;
};
/** Type guard: is this value an apparatus plugin export? */
export declare function isApparatus(obj: unknown): obj is {
    apparatus: Apparatus;
};
/** Type guard: narrows a LoadedPlugin to LoadedKit. */
export declare function isLoadedKit(p: LoadedPlugin): p is LoadedKit;
/** Type guard: narrows a LoadedPlugin to LoadedApparatus. */
export declare function isLoadedApparatus(p: LoadedPlugin): p is LoadedApparatus;
//# sourceMappingURL=plugin.d.ts.map
=== packages/framework/core/dist/resolve-package.d.ts ===
/**
 * Package resolution utilities for guild-installed npm packages.
 *
 * Resolves entry points from the guild's node_modules by reading package.json
 * exports maps directly. Needed because guild plugins are ESM-only packages
 * and createRequire() can't resolve their exports.
 *
 * Also owns:
 * - derivePluginId — canonical npm package name → plugin id derivation
 */
/**
 * Derive the guild-facing plugin id from an npm package name.
 *
 * Convention:
 * - `@shardworks/nexus-ledger`      → `nexus-ledger`   (official scope stripped)
 * - `@shardworks/books-apparatus`   → `books`           (descriptor suffix stripped)
 * - `@acme/my-plugin`               → `acme/my-plugin`  (third-party: drop @ only)
 * - `my-relay-kit`                  → `my-relay`        (descriptor suffix stripped)
 * - `my-plugin`                     → `my-plugin`       (unscoped: unchanged)
 *
 * The `@shardworks` scope is the official Nexus namespace — its plugins are
 * referenced by bare name in guild.json, CLI commands, and config keys.
 * Third-party scoped packages retain the scope as a prefix (without @) to
 * prevent collisions between `@acme/foo` and `@other/foo`.
 *
 * Descriptor suffixes (`-plugin`, `-apparatus`, `-kit`) are stripped after
 * scope resolution so that package naming conventions don't leak into ids.
 */
export declare function derivePluginId(packageName: string): string;
/**
 * Read a package.json from the guild's node_modules.
 * Returns the parsed JSON and version. Falls back gracefully.
 */
export declare function readGuildPackageJson(guildRoot: string, pkgName: string): {
    version: string;
    pkgJson: Record<string, unknown> | null;
};
/**
 * Resolve the npm package name for a plugin id by consulting the guild's root package.json.
 *
 * Scans all dependencies and runs `derivePluginId()` on each to find the
 * package whose derived id matches. This correctly handles descriptor
 * suffixes (-kit, -apparatus, -plugin) that derivePluginId strips.
 *
 * When multiple packages derive to the same id (unlikely but possible),
 * prefers @shardworks-scoped packages over third-party ones.
 *
 * Returns null if no matching dependency is found.
 */
export declare function resolvePackageNameForPluginId(guildRoot: string, pluginId: string): string | null;
/**
 * Resolve the entry point for a guild-installed package.
 *
 * Reads the package's exports map to find the ESM entry point.
 * Returns an absolute path suitable for dynamic import().
 */
export declare function resolveGuildPackageEntry(guildRoot: string, pkgName: string): string;
//# sourceMappingURL=resolve-package.d.ts.map
=== packages/plugins/animator/dist/animator.d.ts ===
/**
 * The Animator — session launch and telemetry recording apparatus.
 *
 * Two API levels:
 * - summon() — high-level: composes context via The Loom, then launches.
 * - animate() — low-level: takes a pre-composed AnimaWeave + prompt.
 *
 * See: docs/specification.md (animator)
 */
import type { Plugin } from '@shardworks/nexus-core';
/**
 * Create the Animator apparatus plugin.
 *
 * Returns a Plugin with:
 * - `requires: ['stacks']` — records session results
 * - `provides: AnimatorApi` — the session launch API
 * - `supportKit` — contributes `sessions` book + inspection tools
 */
export declare function createAnimator(): Plugin;
//# sourceMappingURL=animator.d.ts.map
=== packages/plugins/animator/dist/index.d.ts ===
/**
 * @shardworks/animator-apparatus — The Animator.
 *
 * Session launch and telemetry recording: takes an AnimaWeave from The Loom,
 * launches an AI process via a session provider, monitors it until exit, and
 * records the result to The Stacks.
 *
 * See: docs/specification.md (animator)
 */
export { type AnimatorApi, type AnimateHandle, type AnimateRequest, type SummonRequest, type SessionResult, type SessionChunk, type TokenUsage, type SessionDoc, type AnimatorConfig, type AnimatorSessionProvider, type SessionProviderConfig, type SessionProviderResult, } from './types.ts';
export { createAnimator } from './animator.ts';
declare const _default: import("@shardworks/nexus-core").Plugin;
export default _default;
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/animator/dist/tools/index.d.ts ===
/**
 * Animator tool re-exports.
 */
export { default as sessionList } from './session-list.ts';
export { default as sessionShow } from './session-show.ts';
export { default as summon } from './summon.ts';
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/animator/dist/tools/session-list.d.ts ===
/**
 * session-list tool — list recent sessions with optional filters.
 *
 * Queries The Animator's `sessions` book in The Stacks.
 * Returns session summaries ordered by startedAt descending (newest first).
 *
 * See: docs/specification.md (animator § session-list tool)
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    status: z.ZodOptional<z.ZodEnum<{
        completed: "completed";
        failed: "failed";
        timeout: "timeout";
        running: "running";
    }>>;
    provider: z.ZodOptional<z.ZodString>;
    conversationId: z.ZodOptional<z.ZodString>;
    limit: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}>;
export default _default;
//# sourceMappingURL=session-list.d.ts.map
=== packages/plugins/animator/dist/tools/session-show.d.ts ===
/**
 * session-show tool — show full detail for a single session by id.
 *
 * Reads the complete session record from The Animator's `sessions` book
 * in The Stacks, including tokenUsage, metadata, and all indexed fields.
 *
 * See: docs/specification.md (animator § session-show tool)
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    id: z.ZodString;
}>;
export default _default;
//# sourceMappingURL=session-show.d.ts.map
=== packages/plugins/animator/dist/tools/summon.d.ts ===
/**
 * summon tool — dispatch an anima session from the CLI.
 *
 * High-level entry point: composes context via The Loom (passing the
 * role for system prompt composition), then launches a session via
 * The Animator. The work prompt goes directly to the provider.
 *
 * Usage:
 *   nsg summon --prompt "Build the frobnicator" --role artificer
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    prompt: z.ZodString;
    role: z.ZodOptional<z.ZodString>;
}>;
export default _default;
//# sourceMappingURL=summon.d.ts.map
=== packages/plugins/animator/dist/types.d.ts ===
/**
 * The Animator — public types.
 *
 * These types form the contract between The Animator apparatus and all
 * callers (summon relay, nsg consult, etc.). No implementation details.
 *
 * See: docs/specification.md (animator)
 */
import type { AnimaWeave } from '@shardworks/loom-apparatus';
import type { ResolvedTool } from '@shardworks/tools-apparatus';
/** A chunk of output from a running session. */
export type SessionChunk = {
    type: 'text';
    text: string;
} | {
    type: 'tool_use';
    tool: string;
} | {
    type: 'tool_result';
    tool: string;
};
export interface AnimateRequest {
    /**
     * Optional pre-generated session id. When provided, the Animator uses
     * this id instead of generating a new one. Used by summon() to make the
     * session id available on the handle before the Loom weave resolves.
     */
    sessionId?: string;
    /** The anima weave from The Loom (composed identity context). */
    context: AnimaWeave;
    /**
     * The work prompt — what the anima should do.
     * Passed directly to the session provider as the initial prompt.
     * This bypasses The Loom — it is not a composition concern.
     */
    prompt?: string;
    /**
     * Working directory for the session.
     * The session provider launches the AI process here.
     */
    cwd: string;
    /**
     * Optional conversation id to resume a multi-turn conversation.
     * If provided, the session provider resumes the existing conversation
     * rather than starting a new one.
     */
    conversationId?: string;
    /**
     * Caller-supplied metadata recorded alongside the session.
     * The Animator stores this as-is — it does not interpret the contents.
     */
    metadata?: Record<string, unknown>;
    /**
     * Enable streaming output. When true, the returned `chunks` iterable
     * yields output as the session produces it. When false (default), the
     * `chunks` iterable completes immediately with no items.
     *
     * Either way, the return shape is the same: `{ chunks, result }`.
     */
    streaming?: boolean;
    /**
     * Task-layer environment variables. Overrides the identity-layer
     * environment from the AnimaWeave when keys collide. Spread into the
     * spawned process environment.
     */
    environment?: Record<string, string>;
}
export interface SessionResult {
    /** Unique session id (generated by The Animator). */
    id: string;
    /** Terminal status. */
    status: 'completed' | 'failed' | 'timeout';
    /** When the session started (ISO-8601). */
    startedAt: string;
    /** When the session ended (ISO-8601). */
    endedAt: string;
    /** Wall-clock duration in milliseconds. */
    durationMs: number;
    /** Provider name (e.g. 'claude-code'). */
    provider: string;
    /** Numeric exit code from the provider process. */
    exitCode: number;
    /** Error message if failed. */
    error?: string;
    /** Conversation id (for multi-turn resume). */
    conversationId?: string;
    /** Session id from the provider (e.g. for --resume). */
    providerSessionId?: string;
    /** Token usage from the provider, if available. */
    tokenUsage?: TokenUsage;
    /** Cost in USD from the provider, if available. */
    costUsd?: number;
    /** Caller-supplied metadata, recorded as-is. */
    metadata?: Record<string, unknown>;
    /**
     * The final assistant text from the session.
     * Extracted by the Animator from the provider's transcript.
     * Useful for programmatic consumers that need the session's conclusion
     * without parsing the full transcript (e.g. the Spider's review collect step).
     */
    output?: string;
}
export interface TokenUsage {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
}
export interface SummonRequest {
    /**
     * The work prompt — what the anima should do.
     * Passed directly to the session provider as the initial prompt.
     */
    prompt: string;
    /**
     * The role to summon (e.g. 'artificer', 'scribe').
     * Passed to The Loom for context composition and recorded in session metadata.
     */
    role?: string;
    /**
     * Working directory for the session.
     * The session provider launches the AI process here.
     */
    cwd: string;
    /**
     * Optional conversation id to resume a multi-turn conversation.
     */
    conversationId?: string;
    /**
     * Additional metadata to record alongside the session.
     * Merged with auto-generated metadata (trigger: 'summon', role).
     */
    metadata?: Record<string, unknown>;
    /**
     * Enable streaming output. When true, the returned `chunks` iterable
     * yields output as the session produces it. When false (default), the
     * `chunks` iterable completes immediately with no items.
     */
    streaming?: boolean;
    /**
     * Task-layer environment variables. Overrides the identity-layer
     * environment from the AnimaWeave when keys collide. Spread into the
     * spawned process environment.
     */
    environment?: Record<string, string>;
}
/** The return value from animate() and summon(). */
export interface AnimateHandle {
    /**
     * Session ID, available immediately after launch — before the session
     * completes. Callers that only need to know the session was launched
     * (e.g. quick engines returning `{ status: 'launched', sessionId }`)
     * can return without awaiting `result`.
     */
    sessionId: string;
    /**
     * Async iterable of output chunks from the session. When streaming is
     * disabled (the default), this iterable completes immediately with no
     * items. When streaming is enabled, it yields chunks as the session
     * produces output.
     */
    chunks: AsyncIterable<SessionChunk>;
    /**
     * Promise that resolves to the final SessionResult after the session
     * completes (or fails/times out) and the result is recorded to The Stacks.
     */
    result: Promise<SessionResult>;
}
export interface AnimatorApi {
    /**
     * Summon an anima — compose context via The Loom and launch a session.
     *
     * This is the high-level "make an anima do a thing" entry point.
     * Internally calls The Loom for context composition (passing the role),
     * then animate() for session launch and recording. The work prompt
     * bypasses the Loom and goes directly to the provider.
     *
     * Requires The Loom apparatus to be installed. Throws if not available.
     *
     * Auto-populates session metadata with `trigger: 'summon'` and `role`.
     *
     * Returns synchronously — the async work lives inside `result` and `chunks`.
     */
    summon(request: SummonRequest): AnimateHandle;
    /**
     * Animate a session — launch an AI process with the given context.
     *
     * This is the low-level entry point for callers that compose their own
     * AnimaWeave (e.g. The Parlour for multi-turn conversations).
     *
     * Records the session result to The Stacks before `result` resolves.
     *
     * Set `streaming: true` on the request to receive output chunks as the
     * session runs. When streaming is disabled (default), the `chunks`
     * iterable completes immediately with no items.
     *
     * Returns synchronously — the async work lives inside `result` and `chunks`.
     */
    animate(request: AnimateRequest): AnimateHandle;
}
/**
 * A session provider — pluggable backend that knows how to launch and
 * communicate with a specific AI system.
 *
 * Implemented as an apparatus plugin whose `provides` object satisfies
 * this interface. The Animator discovers the provider via guild config:
 * `guild.json["animator"]["sessionProvider"]` names the plugin id.
 *
 * The provider always returns `{ chunks, result }` — the same shape as
 * AnimateHandle. When `config.streaming` is true, the provider MAY yield
 * output chunks as the session runs. When false (or when the provider
 * does not support streaming), the chunks iterable completes immediately
 * with no items. The Animator does not branch on streaming capability —
 * it passes the flag through and trusts the provider to do the right thing.
 */
export interface AnimatorSessionProvider {
    /** Human-readable name (e.g. 'claude-code'). */
    name: string;
    /**
     * Launch a session. Returns `{ chunks, result }` synchronously.
     *
     * The `result` promise resolves when the AI process exits.
     * The `chunks` async iterable yields output when `config.streaming`
     * is true and the provider supports streaming; otherwise it completes
     * immediately with no items.
     *
     * Providers that don't support streaming simply ignore the flag and
     * return empty chunks — no separate method needed.
     */
    launch(config: SessionProviderConfig): {
        chunks: AsyncIterable<SessionChunk>;
        result: Promise<SessionProviderResult>;
    };
}
export interface SessionProviderConfig {
    /** System prompt for the AI process. May be undefined if composition is not yet implemented. */
    systemPrompt?: string;
    /** Initial user message (e.g. writ description). */
    initialPrompt?: string;
    /** Model to use (from guild settings). */
    model: string;
    /** Optional conversation id for resume. */
    conversationId?: string;
    /** Working directory for the session. */
    cwd: string;
    /**
     * Enable streaming output. When true, the provider should yield output
     * chunks as the session produces them. When false (default), the chunks
     * iterable should complete immediately with no items.
     *
     * Providers that don't support streaming may ignore this flag.
     */
    streaming?: boolean;
    /**
     * Resolved tools for this session. When present, the provider should
     * configure an MCP server with these tool definitions.
     *
     * The Loom resolves role → permissions → tools via the Instrumentarium.
     * The Animator passes them through from the AnimaWeave.
     */
    tools?: ResolvedTool[];
    /**
     * Merged environment variables to spread into the spawned process.
     * The Animator merges identity-layer (weave) and task-layer (request)
     * variables before passing them here — task layer wins on collision.
     */
    environment?: Record<string, string>;
}
/** A single message from the NDJSON stream. Untyped — shape varies by provider. */
export type TranscriptMessage = Record<string, unknown>;
export interface SessionProviderResult {
    /** Exit status. */
    status: 'completed' | 'failed' | 'timeout';
    /** Numeric exit code from the process. */
    exitCode: number;
    /** Error message if failed. */
    error?: string;
    /** Provider's session id (e.g. for --resume). */
    providerSessionId?: string;
    /** Token usage, if the provider can report it. */
    tokenUsage?: TokenUsage;
    /** Cost in USD, if the provider can report it. */
    costUsd?: number;
    /** The session's full transcript — array of NDJSON message objects. */
    transcript?: TranscriptMessage[];
    /**
     * The final assistant text from the session.
     * Extracted from the last assistant message's text content blocks.
     * Undefined if the session produced no assistant output.
     */
    output?: string;
}
/**
 * The session document stored in The Stacks' `sessions` book.
 * Includes all SessionResult fields plus the `id` required by BookEntry.
 */
export interface SessionDoc {
    id: string;
    /**
     * Session status. Initially written as `'running'` when the session is
     * launched (Step 2), then updated to a terminal status (`'completed'`,
     * `'failed'`, or `'timeout'`) after the provider exits (Step 5).
     * The `'running'` state is transient — it only exists between Steps 2 and 5.
     * `SessionResult.status` only includes terminal states.
     */
    status: 'running' | 'completed' | 'failed' | 'timeout';
    startedAt: string;
    endedAt?: string;
    durationMs?: number;
    provider: string;
    exitCode?: number;
    error?: string;
    conversationId?: string;
    providerSessionId?: string;
    tokenUsage?: TokenUsage;
    costUsd?: number;
    metadata?: Record<string, unknown>;
    /** The final assistant text from the session. */
    output?: string;
    /** Index signature required by BookEntry. */
    [key: string]: unknown;
}
/**
 * The transcript document stored in The Stacks' `transcripts` book.
 * One record per session — 1:1 relationship with SessionDoc.
 */
export interface TranscriptDoc {
    /** Same as the session id. */
    id: string;
    /** Full NDJSON transcript from the session. */
    messages: TranscriptMessage[];
    /** Index signature required by BookEntry. */
    [key: string]: unknown;
}
/** Plugin configuration stored at guild.json["animator"]. */
export interface AnimatorConfig {
    /**
     * Plugin id of the apparatus that implements AnimatorSessionProvider.
     * The Animator looks this up via guild().apparatus() at animate-time.
     * Defaults to 'claude-code' if not specified.
     */
    sessionProvider?: string;
}
declare module '@shardworks/nexus-core' {
    interface GuildConfig {
        animator?: AnimatorConfig;
    }
}
//# sourceMappingURL=types.d.ts.map
=== packages/plugins/claude-code/dist/index.d.ts ===
/**
 * Claude Code Session Provider
 *
 * Apparatus plugin that implements AnimatorSessionProvider for the
 * Claude Code CLI. The Animator discovers this via guild config:
 *
 *   guild.json["animator"]["sessionProvider"] = "claude-code"
 *
 * Launches sessions via the `claude` CLI in autonomous mode (--print)
 * with --output-format stream-json for structured telemetry.
 *
 * Key design choice: uses async spawn() instead of spawnSync().
 * This is required for stream-json transcript parsing, timeout enforcement,
 * and future concurrent session support.
 */
import type { Plugin } from '@shardworks/nexus-core';
import type { SessionChunk } from '@shardworks/animator-apparatus';
/**
 * Extract the final assistant text from a transcript.
 *
 * Walks the transcript backwards to find the last `assistant` message
 * and concatenates its text content blocks.
 *
 * @internal Exported for testing only.
 */
export declare function extractFinalAssistantText(transcript: Record<string, unknown>[]): string | undefined;
/**
 * Create the Claude Code session provider apparatus.
 *
 * The apparatus has no startup logic — it just provides the
 * AnimatorSessionProvider implementation. The Animator looks it up
 * via guild().apparatus('claude-code').
 */
export declare function createClaudeCodeProvider(): Plugin;
declare const _default: Plugin;
export default _default;
export { createMcpServer, startMcpHttpServer } from './mcp-server.ts';
export type { McpHttpHandle } from './mcp-server.ts';
/** Parsed result from stream-json output. @internal */
export interface StreamJsonResult {
    exitCode: number;
    transcript: Record<string, unknown>[];
    costUsd?: number;
    tokenUsage?: {
        inputTokens: number;
        outputTokens: number;
        cacheReadTokens?: number;
        cacheWriteTokens?: number;
    };
    providerSessionId?: string;
}
/**
 * Parse a single NDJSON message from stream-json output.
 *
 * Returns parsed chunks for streaming and accumulates data into the
 * provided accumulators (transcript, metrics).
 *
 * @internal Exported for testing only.
 */
export declare function parseStreamJsonMessage(msg: Record<string, unknown>, acc: {
    transcript: Record<string, unknown>[];
    costUsd?: number;
    tokenUsage?: StreamJsonResult['tokenUsage'];
    providerSessionId?: string;
}): SessionChunk[];
/**
 * Process NDJSON buffer, calling handler for each complete line.
 * Returns the remaining incomplete buffer.
 *
 * @internal Exported for testing only.
 */
export declare function processNdjsonBuffer(buffer: string, handler: (msg: Record<string, unknown>) => void): string;
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/claude-code/dist/mcp-server.d.ts ===
/**
 * MCP Tool Server — serves guild tools as typed MCP tools during anima sessions.
 *
 * Two entry points:
 *
 * 1. **`createMcpServer(tools)`** — library function. Takes an array of
 *    ToolDefinitions (already resolved by the Instrumentarium) and returns
 *    a configured McpServer.
 *
 * 2. **`startMcpHttpServer(tools)`** — starts an in-process HTTP server
 *    serving the MCP tool set via Streamable HTTP on an ephemeral localhost
 *    port. Returns a handle with the URL (for --mcp-config) and a close()
 *    function for cleanup.
 *
 * The MCP server is one-per-session. The claude-code provider owns the
 * lifecycle — starts before the Claude process, stops after it exits.
 *
 * See: docs/architecture/apparatus/claude-code.md
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolDefinition } from '@shardworks/tools-apparatus';
/**
 * Handle returned by startMcpHttpServer().
 *
 * Provides the URL for --mcp-config and a close() function for cleanup.
 */
export interface McpHttpHandle {
    /** URL for --mcp-config (e.g. "http://127.0.0.1:PORT/mcp"). */
    url: string;
    /** Shut down the HTTP server and MCP transport. */
    close(): Promise<void>;
}
/**
 * Create and configure an MCP server with the given tools.
 *
 * Each tool's Zod param schema is registered directly with the MCP SDK
 * (which handles JSON Schema conversion). The handler is wrapped to
 * validate params via Zod and format the result as MCP tool output.
 *
 * Tools with `callableBy` set that does not include `'anima'` are
 * filtered out. Tools without `callableBy` are included (available
 * to all callers by default).
 */
export declare function createMcpServer(tools: ToolDefinition[]): Promise<McpServer>;
/**
 * Start an in-process HTTP server serving the MCP tool set via SSE.
 *
 * Uses the MCP SDK's SSE transport: the client GETs /sse to establish
 * the event stream, then POSTs messages to /message. Claude Code's
 * --mcp-config expects `type: "sse"` for HTTP-based MCP servers.
 *
 * The server binds to 127.0.0.1 only — not network-accessible.
 *
 * Returns a handle with the URL (for --mcp-config) and a close() function.
 * The caller is responsible for calling close() after the session exits.
 *
 * Each session gets its own server instance. Concurrent sessions get
 * independent servers on different ports.
 */
export declare function startMcpHttpServer(tools: ToolDefinition[]): Promise<McpHttpHandle>;
//# sourceMappingURL=mcp-server.d.ts.map
=== packages/plugins/clerk/dist/clerk.d.ts ===
/**
 * The Clerk — writ lifecycle management apparatus.
 *
 * The Clerk manages the lifecycle of writs: lightweight work orders that flow
 * through a fixed status machine (ready → active → completed/failed, or
 * ready/active → cancelled). Each writ has a type, a title, a body, and
 * optional codex and resolution fields.
 *
 * Writ types are validated against the guild config's writTypes field plus the
 * built-in type ('mandate'). An unknown type is rejected at post time.
 *
 * See: docs/architecture/apparatus/clerk.md
 */
import type { Plugin } from '@shardworks/nexus-core';
export declare function createClerk(): Plugin;
//# sourceMappingURL=clerk.d.ts.map
=== packages/plugins/clerk/dist/index.d.ts ===
/**
 * @shardworks/clerk-apparatus — The Clerk.
 *
 * Writ lifecycle management: post commissions, accept work, complete or fail
 * writs, and cancel them at any pre-terminal stage. Writs flow through a fixed
 * status machine and are persisted in The Stacks.
 *
 * See: docs/architecture/apparatus/clerk.md
 */
export { type ClerkApi, type ClerkConfig, type WritTypeEntry, type WritDoc, type WritStatus, type PostCommissionRequest, type WritFilters, } from './types.ts';
export { createClerk } from './clerk.ts';
declare const _default: import("@shardworks/nexus-core").Plugin;
export default _default;
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/clerk/dist/tools/commission-post.d.ts ===
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    title: z.ZodString;
    body: z.ZodString;
    type: z.ZodOptional<z.ZodString>;
    codex: z.ZodOptional<z.ZodString>;
}>;
export default _default;
//# sourceMappingURL=commission-post.d.ts.map
=== packages/plugins/clerk/dist/tools/index.d.ts ===
export { default as commissionPost } from './commission-post.ts';
export { default as writShow } from './writ-show.ts';
export { default as writList } from './writ-list.ts';
export { default as writAccept } from './writ-accept.ts';
export { default as writComplete } from './writ-complete.ts';
export { default as writFail } from './writ-fail.ts';
export { default as writCancel } from './writ-cancel.ts';
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/clerk/dist/tools/writ-accept.d.ts ===
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    id: z.ZodString;
}>;
export default _default;
//# sourceMappingURL=writ-accept.d.ts.map
=== packages/plugins/clerk/dist/tools/writ-cancel.d.ts ===
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    id: z.ZodString;
    resolution: z.ZodOptional<z.ZodString>;
}>;
export default _default;
//# sourceMappingURL=writ-cancel.d.ts.map
=== packages/plugins/clerk/dist/tools/writ-complete.d.ts ===
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    id: z.ZodString;
    resolution: z.ZodString;
}>;
export default _default;
//# sourceMappingURL=writ-complete.d.ts.map
=== packages/plugins/clerk/dist/tools/writ-fail.d.ts ===
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    id: z.ZodString;
    resolution: z.ZodString;
}>;
export default _default;
//# sourceMappingURL=writ-fail.d.ts.map
=== packages/plugins/clerk/dist/tools/writ-list.d.ts ===
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    status: z.ZodOptional<z.ZodEnum<{
        ready: "ready";
        active: "active";
        completed: "completed";
        failed: "failed";
        cancelled: "cancelled";
    }>>;
    type: z.ZodOptional<z.ZodString>;
    limit: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    offset: z.ZodOptional<z.ZodNumber>;
}>;
export default _default;
//# sourceMappingURL=writ-list.d.ts.map
=== packages/plugins/clerk/dist/tools/writ-show.d.ts ===
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    id: z.ZodString;
}>;
export default _default;
//# sourceMappingURL=writ-show.d.ts.map
=== packages/plugins/clerk/dist/types.d.ts ===
/**
 * Clerk public types.
 *
 * All types exported from @shardworks/clerk-apparatus.
 */
/**
 * A writ's position in its lifecycle.
 *
 * Transitions:
 *   ready → active (accept)
 *   active → completed (complete)
 *   active → failed (fail)
 *   ready | active → cancelled (cancel)
 *
 * completed, failed, cancelled are terminal — no further transitions.
 */
export type WritStatus = 'ready' | 'active' | 'completed' | 'failed' | 'cancelled';
/**
 * A writ document as stored in The Stacks.
 */
export interface WritDoc {
    /** Index signature required to satisfy BookEntry constraint. */
    [key: string]: unknown;
    /** Unique writ id (`w-{base36_timestamp}{hex_random}`). Sortable by creation time. */
    id: string;
    /** Writ type — must be a type declared in guild config, or a built-in type. */
    type: string;
    /** Current lifecycle status. */
    status: WritStatus;
    /** Short human-readable title. */
    title: string;
    /** Detail text. */
    body: string;
    /** Target codex name. */
    codex?: string;
    /** ISO timestamp when the writ was created. */
    createdAt: string;
    /** ISO timestamp of the last mutation. */
    updatedAt: string;
    /** ISO timestamp when the writ was accepted (transitioned to active). */
    acceptedAt?: string;
    /** ISO timestamp when the writ reached a terminal state. */
    resolvedAt?: string;
    /** Summary of how the writ resolved (set on any terminal transition). */
    resolution?: string;
}
/**
 * Request to post a new commission (create a writ).
 */
export interface PostCommissionRequest {
    /**
     * Writ type. Defaults to the guild's configured defaultType, or "mandate"
     * if no default is configured. Must be a valid declared type.
     */
    type?: string;
    /** Short human-readable title describing the work. */
    title: string;
    /** Detail text. */
    body: string;
    /** Optional target codex name. */
    codex?: string;
}
/**
 * Filters for listing writs.
 */
export interface WritFilters {
    /** Filter by status. */
    status?: WritStatus;
    /** Filter by writ type. */
    type?: string;
    /** Maximum number of results (default: 20). */
    limit?: number;
    /** Number of results to skip. */
    offset?: number;
}
/**
 * A writ type entry declared in clerk config.
 */
export interface WritTypeEntry {
    /** The writ type name (e.g. "mandate", "task", "bug"). */
    name: string;
    /** Optional human-readable description of this writ type. */
    description?: string;
}
/**
 * Clerk apparatus configuration — lives under the `clerk` key in guild.json.
 */
export interface ClerkConfig {
    /** Additional writ type declarations. The built-in type "mandate" is always valid. */
    writTypes?: WritTypeEntry[];
    /** Default writ type when commission-post is called without a type (default: "mandate"). */
    defaultType?: string;
}
declare module '@shardworks/nexus-core' {
    interface GuildConfig {
        clerk?: ClerkConfig;
    }
}
/**
 * The Clerk's runtime API — retrieved via guild().apparatus<ClerkApi>('clerk').
 */
export interface ClerkApi {
    /**
     * Post a new commission, creating a writ in 'ready' status.
     * Validates the writ type against declared types in guild config.
     */
    post(request: PostCommissionRequest): Promise<WritDoc>;
    /**
     * Show a writ by id. Throws if not found.
     */
    show(id: string): Promise<WritDoc>;
    /**
     * List writs with optional filters, ordered by createdAt descending.
     */
    list(filters?: WritFilters): Promise<WritDoc[]>;
    /**
     * Count writs matching optional filters.
     */
    count(filters?: WritFilters): Promise<number>;
    /**
     * Transition a writ to a new status, optionally setting additional fields.
     * Validates that the transition is legal.
     */
    transition(id: string, to: WritStatus, fields?: Partial<WritDoc>): Promise<WritDoc>;
}
//# sourceMappingURL=types.d.ts.map
=== packages/plugins/codexes/dist/git.d.ts ===
/**
 * Lightweight git helper — typed wrapper around child_process.execFile.
 *
 * All git operations in the Scriptorium go through this module for
 * safety (no shell injection) and consistent error handling.
 */
export interface GitResult {
    stdout: string;
    stderr: string;
}
export declare class GitError extends Error {
    readonly command: string[];
    readonly stderr: string;
    readonly exitCode: number | null;
    constructor(message: string, command: string[], stderr: string, exitCode: number | null);
}
/**
 * Run a git command with typed error handling.
 *
 * @param args - git subcommand and arguments (e.g. ['clone', '--bare', url])
 * @param cwd - working directory for the command
 */
export declare function git(args: string[], cwd?: string): Promise<GitResult>;
/**
 * Resolve the default branch of a bare clone by reading HEAD.
 *
 * Returns the branch name (e.g. 'main'), not the full ref.
 */
export declare function resolveDefaultBranch(bareClonePath: string): Promise<string>;
/**
 * Get the commit SHA at the tip of a branch in a bare clone.
 */
export declare function resolveRef(bareClonePath: string, ref: string): Promise<string>;
/**
 * Check if a branch has commits ahead of another branch.
 * Returns the number of commits ahead.
 */
export declare function commitsAhead(bareClonePath: string, branch: string, base: string): Promise<number>;
//# sourceMappingURL=git.d.ts.map
=== packages/plugins/codexes/dist/index.d.ts ===
/**
 * @shardworks/codexes-apparatus — The Scriptorium.
 *
 * Guild codex management: bare clone registry, draft binding lifecycle
 * (git worktrees), sealing (ff-only merge or rebase+ff), and push.
 * Default export is the apparatus plugin.
 *
 * See: docs/architecture/apparatus/scriptorium.md
 */
export type { ScriptoriumApi, CodexRecord, CodexDetail, DraftRecord, OpenDraftRequest, AbandonDraftRequest, SealRequest, PushRequest, SealResult, CodexesConfig, CodexesSettings, CodexConfigEntry, } from './types.ts';
export { createScriptorium } from './scriptorium.ts';
declare const _default: import("@shardworks/nexus-core").Plugin;
export default _default;
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/codexes/dist/scriptorium-core.d.ts ===
/**
 * The Scriptorium — core logic.
 *
 * Manages the codex registry (bare clones), draft binding lifecycle
 * (worktrees), and sealing (ff-only merge or rebase+ff). All git
 * operations go through the git helper for safety.
 *
 * Draft tracking is in-memory — drafts are reconstructed from
 * filesystem state at startup and maintained in memory during the
 * process lifetime.
 *
 * See: docs/architecture/apparatus/scriptorium.md
 */
import type { CodexRecord, CodexDetail, DraftRecord, OpenDraftRequest, AbandonDraftRequest, SealRequest, SealResult, PushRequest, ScriptoriumApi } from './types.ts';
export declare class ScriptoriumCore {
    private codexes;
    private drafts;
    private maxMergeRetries;
    private draftRoot;
    private get home();
    private codexesDir;
    private bareClonePath;
    private draftWorktreePath;
    start(): void;
    /**
     * Load a codex from config. Checks for existing bare clone;
     * initiates background clone if missing.
     */
    private loadCodex;
    /**
     * Reconcile in-memory draft tracking with filesystem state.
     * Scans the worktree directories and rebuilds the draft map.
     */
    private reconcileDrafts;
    /**
     * Ensure a codex's bare clone is ready. Blocks if a background
     * clone is in progress. Throws if the codex is unknown or clone failed.
     */
    private ensureReady;
    private performClone;
    /**
     * Advance refs/heads/<branch> to the remote's position if the remote is
     * strictly ahead of the local sealed binding.
     *
     * This handles commits pushed to the remote outside the Scriptorium:
     * if the remote has advanced past the local sealed binding, sealing must
     * rebase the draft onto the remote position — not the stale local one.
     *
     * If the local sealed binding is already ahead of (or equal to) the remote
     * (e.g. contains unpushed seals from contention scenarios), it is kept.
     */
    private advanceToRemote;
    private performFetch;
    createApi(): ScriptoriumApi;
    add(name: string, remoteUrl: string): Promise<CodexRecord>;
    list(): Promise<CodexRecord[]>;
    show(name: string): Promise<CodexDetail>;
    remove(name: string): Promise<void>;
    fetchCodex(name: string): Promise<void>;
    push(request: PushRequest): Promise<void>;
    openDraft(request: OpenDraftRequest): Promise<DraftRecord>;
    listDrafts(codexName?: string): Promise<DraftRecord[]>;
    abandonDraft(request: AbandonDraftRequest): Promise<void>;
    seal(request: SealRequest): Promise<SealResult>;
    private draftsForCodex;
    private toCodexRecord;
}
//# sourceMappingURL=scriptorium-core.d.ts.map
=== packages/plugins/codexes/dist/scriptorium.d.ts ===
/**
 * The Scriptorium — apparatus implementation.
 *
 * Wires together the ScriptoriumCore (git operations, draft lifecycle)
 * and exposes the ScriptoriumApi as the `provides` object. Tools are
 * contributed via supportKit.
 *
 * See: docs/architecture/apparatus/scriptorium.md
 */
import type { Plugin } from '@shardworks/nexus-core';
export declare function createScriptorium(): Plugin;
//# sourceMappingURL=scriptorium.d.ts.map
=== packages/plugins/codexes/dist/tools/codex-add.d.ts ===
/**
 * codex-add tool — register an existing git repository as a guild codex.
 *
 * Clones a bare copy to `.nexus/codexes/<name>.git` and adds the entry
 * to guild.json. Blocks until the clone completes.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    name: z.ZodString;
    remoteUrl: z.ZodString;
}>;
export default _default;
//# sourceMappingURL=codex-add.d.ts.map
=== packages/plugins/codexes/dist/tools/codex-list.d.ts ===
/**
 * codex-list tool — list all registered codexes.
 */
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{}>;
export default _default;
//# sourceMappingURL=codex-list.d.ts.map
=== packages/plugins/codexes/dist/tools/codex-push.d.ts ===
/**
 * codex-push tool — push a branch to the codex's remote.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    codexName: z.ZodString;
    branch: z.ZodOptional<z.ZodString>;
}>;
export default _default;
//# sourceMappingURL=codex-push.d.ts.map
=== packages/plugins/codexes/dist/tools/codex-remove.d.ts ===
/**
 * codex-remove tool — remove a codex from the guild.
 *
 * Abandons all active drafts, removes the bare clone, and removes
 * the entry from guild.json. Does NOT delete the remote repository.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    name: z.ZodString;
}>;
export default _default;
//# sourceMappingURL=codex-remove.d.ts.map
=== packages/plugins/codexes/dist/tools/codex-show.d.ts ===
/**
 * codex-show tool — show details of a specific codex including active drafts.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    name: z.ZodString;
}>;
export default _default;
//# sourceMappingURL=codex-show.d.ts.map
=== packages/plugins/codexes/dist/tools/draft-abandon.d.ts ===
/**
 * draft-abandon tool — abandon a draft binding.
 *
 * Removes the git worktree and branch. Fails if the draft has
 * unsealed inscriptions unless force: true.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    codexName: z.ZodString;
    branch: z.ZodString;
    force: z.ZodOptional<z.ZodBoolean>;
}>;
export default _default;
//# sourceMappingURL=draft-abandon.d.ts.map
=== packages/plugins/codexes/dist/tools/draft-list.d.ts ===
/**
 * draft-list tool — list active draft bindings.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    codexName: z.ZodOptional<z.ZodString>;
}>;
export default _default;
//# sourceMappingURL=draft-list.d.ts.map
=== packages/plugins/codexes/dist/tools/draft-open.d.ts ===
/**
 * draft-open tool — open a draft binding on a codex.
 *
 * Creates an isolated git worktree for concurrent work. Fetches from
 * the remote before branching to ensure freshness.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    codexName: z.ZodString;
    branch: z.ZodOptional<z.ZodString>;
    startPoint: z.ZodOptional<z.ZodString>;
    associatedWith: z.ZodOptional<z.ZodString>;
}>;
export default _default;
//# sourceMappingURL=draft-open.d.ts.map
=== packages/plugins/codexes/dist/tools/draft-seal.d.ts ===
/**
 * draft-seal tool — seal a draft into the codex.
 *
 * Incorporates the draft's inscriptions into the sealed binding via
 * ff-only merge. If ff is not possible, rebases and retries. Fails
 * hard on conflicts — no merge commits, no auto-resolution.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    codexName: z.ZodString;
    sourceBranch: z.ZodString;
    targetBranch: z.ZodOptional<z.ZodString>;
    maxRetries: z.ZodOptional<z.ZodNumber>;
    keepDraft: z.ZodOptional<z.ZodBoolean>;
}>;
export default _default;
//# sourceMappingURL=draft-seal.d.ts.map
=== packages/plugins/codexes/dist/tools/index.d.ts ===
/**
 * Scriptorium tool re-exports.
 */
export { default as codexAdd } from './codex-add.ts';
export { default as codexList } from './codex-list.ts';
export { default as codexShow } from './codex-show.ts';
export { default as codexRemove } from './codex-remove.ts';
export { default as codexPush } from './codex-push.ts';
export { default as draftOpen } from './draft-open.ts';
export { default as draftList } from './draft-list.ts';
export { default as draftAbandon } from './draft-abandon.ts';
export { default as draftSeal } from './draft-seal.ts';
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/codexes/dist/types.d.ts ===
/**
 * The Scriptorium — type definitions.
 *
 * All public types for the codexes apparatus: the ScriptoriumApi
 * (provides interface), supporting record types, and request/result
 * types for draft lifecycle and sealing operations.
 *
 * See: docs/architecture/apparatus/scriptorium.md
 */
export interface CodexRecord {
    /** Codex name — unique within the guild. */
    name: string;
    /** Remote repository URL. */
    remoteUrl: string;
    /** Whether the bare clone exists and is healthy. */
    cloneStatus: 'ready' | 'cloning' | 'error';
    /** Number of active drafts for this codex. */
    activeDrafts: number;
}
export interface CodexDetail extends CodexRecord {
    /** Default branch name on the remote (e.g. 'main'). */
    defaultBranch: string;
    /** Timestamp of last fetch. */
    lastFetched: string | null;
    /** Active drafts for this codex. */
    drafts: DraftRecord[];
}
export interface DraftRecord {
    /** Unique draft id (ULID). */
    id: string;
    /** Codex this draft belongs to. */
    codexName: string;
    /** Git branch name for this draft. */
    branch: string;
    /** Absolute filesystem path to the draft's working directory (git worktree). */
    path: string;
    /** When the draft was opened. */
    createdAt: string;
    /** Optional association — e.g. a writ id. */
    associatedWith?: string;
}
export interface OpenDraftRequest {
    /** Codex to open the draft for. */
    codexName: string;
    /** Branch name for the draft. If omitted, generates `draft-<ulid>`. */
    branch?: string;
    /**
     * Starting point — branch, tag, or commit to branch from.
     * Default: remote HEAD (the codex's default branch).
     */
    startPoint?: string;
    /** Optional association metadata (e.g. writ id). */
    associatedWith?: string;
}
export interface AbandonDraftRequest {
    /** Codex name. */
    codexName: string;
    /** Git branch name of the draft to abandon. */
    branch: string;
    /** Force abandonment even if the draft has unsealed inscriptions. */
    force?: boolean;
}
export interface SealRequest {
    /** Codex name. */
    codexName: string;
    /** Git branch to seal (the draft's branch). */
    sourceBranch: string;
    /** Target branch (the sealed binding). Default: codex's default branch. */
    targetBranch?: string;
    /** Max rebase retry attempts under contention. Default: from settings.maxMergeRetries (3). */
    maxRetries?: number;
    /** Keep the draft after successful sealing. Default: false. */
    keepDraft?: boolean;
}
export interface SealResult {
    /** Whether sealing succeeded. */
    success: boolean;
    /** Strategy used: 'fast-forward' or 'rebase'. */
    strategy: 'fast-forward' | 'rebase';
    /** Number of retry attempts needed (0 = first try). */
    retries: number;
    /** The commit SHA at head of target after sealing. */
    sealedCommit: string;
    /** Number of inscriptions (commits) incorporated from the draft. 0 means no-op seal. */
    inscriptionsSealed: number;
}
export interface PushRequest {
    /** Codex name. */
    codexName: string;
    /**
     * Branch to push. Default: codex's default branch.
     */
    branch?: string;
}
export interface CodexesConfig {
    settings?: CodexesSettings;
    registered?: Record<string, CodexConfigEntry>;
}
export interface CodexesSettings {
    /** Max rebase-retry attempts during sealing under contention. Default: 3. */
    maxMergeRetries?: number;
    /** Directory where draft worktrees are created, relative to guild root. Default: '.nexus/worktrees'. */
    draftRoot?: string;
}
export interface CodexConfigEntry {
    /** The remote URL of the codex's git repository. */
    remoteUrl: string;
}
export interface ScriptoriumApi {
    /**
     * Register an existing repository as a codex.
     * Clones a bare copy to `.nexus/codexes/<name>.git` and adds the
     * entry to the `codexes` config section in `guild.json`.
     * Blocks until the clone completes.
     */
    add(name: string, remoteUrl: string): Promise<CodexRecord>;
    /**
     * List all registered codexes with their status.
     */
    list(): Promise<CodexRecord[]>;
    /**
     * Show details for a single codex, including active drafts.
     */
    show(name: string): Promise<CodexDetail>;
    /**
     * Remove a codex from the guild. Abandons all active drafts,
     * removes the bare clone from `.nexus/codexes/`, and removes the
     * entry from `guild.json`. Does NOT delete the remote repository.
     */
    remove(name: string): Promise<void>;
    /**
     * Fetch latest refs from the remote for a codex's bare clone.
     * Called automatically before draft creation and sealing; can
     * also be invoked manually.
     */
    fetch(name: string): Promise<void>;
    /**
     * Push a branch to the codex's remote.
     * Pushes the specified branch (default: codex's default branch)
     * to the bare clone's configured remote. Does not force-push.
     */
    push(request: PushRequest): Promise<void>;
    /**
     * Open a draft binding on a codex.
     *
     * Creates a new git branch from `startPoint` (default: the codex's
     * sealed binding) and checks it out as an isolated worktree under
     * `.nexus/worktrees/<codex>/<branch>`. Fetches from the remote
     * before branching to ensure freshness.
     *
     * If `branch` is omitted, generates one automatically as `draft-<ulid>`.
     * Rejects with a clear error if a draft with the same branch name
     * already exists for this codex.
     */
    openDraft(request: OpenDraftRequest): Promise<DraftRecord>;
    /**
     * List active drafts, optionally filtered by codex.
     */
    listDrafts(codexName?: string): Promise<DraftRecord[]>;
    /**
     * Abandon a draft — remove the draft's worktree and git branch.
     * Fails if the draft has unsealed inscriptions unless `force: true`.
     * The inscriptions persist in the git reflog but the draft is no
     * longer active.
     */
    abandonDraft(request: AbandonDraftRequest): Promise<void>;
    /**
     * Seal a draft — incorporate its inscriptions into the sealed binding.
     *
     * Git strategy: fast-forward merge only. If ff is not possible,
     * rebases the draft branch onto the target and retries. Retries up
     * to `maxRetries` times (default: from settings.maxMergeRetries)
     * to handle contention from concurrent sealing. Fails hard if the
     * rebase produces conflicts — no auto-resolution, no merge commits.
     *
     * On success, abandons the draft (unless `keepDraft: true`).
     */
    seal(request: SealRequest): Promise<SealResult>;
}
//# sourceMappingURL=types.d.ts.map
=== packages/plugins/dashboard/dist/dashboard.d.ts ===
/**
 * The Dashboard — web-based guild operations dashboard apparatus.
 *
 * Contributes the `dashboard-start` CLI tool which launches a web server
 * serving a live operations UI. The apparatus itself is passive — no
 * background server runs at guild startup. The server only runs when
 * the operator explicitly invokes `nsg dashboard start`.
 *
 * See: docs/architecture/apparatus/dashboard.md
 */
import type { Plugin } from '@shardworks/nexus-core';
export declare function createDashboard(): Plugin;
//# sourceMappingURL=dashboard.d.ts.map
=== packages/plugins/dashboard/dist/html.d.ts ===
/**
 * Dashboard web UI — embedded HTML/CSS/JS as a single-file SPA.
 *
 * Returned by the server's root handler. All API calls go to /api/*.
 */
export declare function getDashboardHtml(): string;
//# sourceMappingURL=html.d.ts.map
=== packages/plugins/dashboard/dist/index.d.ts ===
/**
 * @shardworks/dashboard-apparatus — The Dashboard.
 *
 * Web-based guild operations dashboard. Exposes the `dashboard-start` CLI
 * tool which launches a local web server with a live operations UI including
 * tabs for Overview, Clerk, Spider, Animator, and Codexes.
 *
 * Usage:
 *   nsg dashboard start
 *   nsg dashboard start --port 8080
 *   nsg dashboard start --no-open
 */
export { createDashboard } from './dashboard.ts';
declare const _default: import("@shardworks/nexus-core").Plugin;
export default _default;
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/dashboard/dist/rig-types.d.ts ===
/**
 * Local type stubs for Spider rig documents read via Stacks readBook().
 */
export interface EngineInstance {
    id: string;
    designId: string;
    status: 'pending' | 'running' | 'completed' | 'failed';
    upstream: string[];
    givensSpec: Record<string, unknown>;
    yields?: unknown;
    error?: string;
    sessionId?: string;
    startedAt?: string;
    completedAt?: string;
}
export interface RigDoc {
    id: string;
    writId: string;
    status: 'running' | 'completed' | 'failed';
    engines: EngineInstance[];
    [key: string]: unknown;
}
//# sourceMappingURL=rig-types.d.ts.map
=== packages/plugins/dashboard/dist/server.d.ts ===
/**
 * Dashboard HTTP server.
 *
 * Serves the web UI at / and REST API endpoints at /api/*.
 * Uses only Node built-ins — no express or other dependencies.
 */
export interface DashboardServer {
    port: number;
    url: string;
    close(): Promise<void>;
}
export declare function startServer(port: number): Promise<DashboardServer>;
//# sourceMappingURL=server.d.ts.map
=== packages/plugins/dashboard/dist/tool.d.ts ===
/**
 * dashboard-start tool — CLI-only.
 *
 * Starts the web dashboard server and opens the browser.
 * Runs until the process is interrupted (Ctrl+C).
 */
import { z } from 'zod';
export declare const dashboardStart: import("@shardworks/tools-apparatus").ToolDefinition<{
    port: z.ZodOptional<z.ZodNumber>;
    'no-open': z.ZodOptional<z.ZodBoolean>;
}>;
//# sourceMappingURL=tool.d.ts.map
=== packages/plugins/dashboard/dist/types.d.ts ===
/**
 * Local type stubs for apparatus documents read via Stacks readBook().
 * These mirror the shapes declared by the respective apparatus packages
 * without importing from them (to keep dashboard dependencies minimal).
 */
/** Minimal shape of a session document from the Animator's sessions book. */
export interface SessionDoc {
    id: string;
    status: 'running' | 'completed' | 'failed' | 'timeout';
    startedAt: string;
    endedAt?: string;
    durationMs?: number;
    provider: string;
    exitCode?: number;
    error?: string;
    conversationId?: string;
    providerSessionId?: string;
    tokenUsage?: {
        inputTokens: number;
        outputTokens: number;
        cacheReadTokens?: number;
        cacheWriteTokens?: number;
    };
    costUsd?: number;
    metadata?: Record<string, unknown>;
    output?: string;
    [key: string]: unknown;
}
//# sourceMappingURL=types.d.ts.map
=== packages/plugins/dispatch/dist/dispatch.d.ts ===
/**
 * The Dispatch — interim work runner.
 *
 * Bridges the Clerk (which tracks obligations) and the session machinery
 * (which runs animas). Finds the oldest ready writ and executes it:
 * opens a draft binding, composes context, launches a session, and handles
 * the aftermath (seal the draft, transition the writ).
 *
 * This apparatus is temporary rigging — designed to be retired when the
 * full rigging system (Spider, Fabricator, Executor) is implemented.
 *
 * See: docs/architecture/apparatus/dispatch.md
 */
import type { Plugin } from '@shardworks/nexus-core';
/**
 * Create the Dispatch apparatus plugin.
 *
 * Returns a Plugin with:
 * - `requires: ['clerk', 'codexes', 'animator']`
 * - `recommends: ['loom']` — used indirectly via Animator.summon()
 * - `provides: DispatchApi` — the dispatch API
 * - `supportKit` — contributes the `dispatch-next` tool
 */
export declare function createDispatch(): Plugin;
//# sourceMappingURL=dispatch.d.ts.map
=== packages/plugins/dispatch/dist/index.d.ts ===
/**
 * @shardworks/dispatch-apparatus — The Dispatch.
 *
 * Interim work runner: finds the oldest ready writ and executes it through
 * the guild's session machinery. Opens a draft binding on the target codex,
 * summons an anima via The Animator, and handles the aftermath (seal the
 * draft, transition the writ). Disposable — retired when the full rigging
 * system (Spider, Fabricator, Executor) is implemented.
 *
 * See: docs/architecture/apparatus/dispatch.md
 */
export { type DispatchApi, type DispatchRequest, type DispatchResult, } from './types.ts';
export { createDispatch } from './dispatch.ts';
declare const _default: import("@shardworks/nexus-core").Plugin;
export default _default;
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/dispatch/dist/tools/dispatch-next.d.ts ===
/**
 * dispatch-next tool — find the oldest ready writ and dispatch it.
 *
 * The primary entry point for running guild work. Picks the oldest ready
 * writ (FIFO order), opens a draft on its codex (if any), summons an anima
 * to fulfill it, and transitions the writ to completed or failed based on
 * the session outcome.
 *
 * Usage:
 *   nsg dispatch-next
 *   nsg dispatch-next --role scribe
 *   nsg dispatch-next --dry-run
 *
 * See: docs/architecture/apparatus/dispatch.md
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    role: z.ZodOptional<z.ZodString>;
    dryRun: z.ZodDefault<z.ZodOptional<z.ZodBoolean>>;
}>;
export default _default;
//# sourceMappingURL=dispatch-next.d.ts.map
=== packages/plugins/dispatch/dist/tools/index.d.ts ===
/**
 * Dispatch tool re-exports.
 */
export { default as dispatchNext } from './dispatch-next.ts';
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/dispatch/dist/types.d.ts ===
/**
 * The Dispatch — public types.
 *
 * These types form the contract between The Dispatch apparatus and all
 * callers (CLI, clockworks). No implementation details.
 *
 * See: docs/architecture/apparatus/dispatch.md
 */
export interface DispatchApi {
    /**
     * Find the oldest ready writ and execute it.
     *
     * The full dispatch lifecycle:
     *   1. Query the Clerk for the oldest ready writ
     *   2. Transition the writ to active
     *   3. Open a draft binding on the writ's codex (if specified)
     *   4. Summon an anima session with the writ context as prompt
     *   5. Wait for session completion
     *   6. On success: seal the draft, push, transition writ to completed
     *   7. On failure: abandon the draft, transition writ to failed
     *
     * Returns null if no ready writs exist.
     *
     * If the writ has no codex, steps 3/6/7 (draft lifecycle) are
     * skipped — the session runs in the guild home directory with
     * no codex binding.
     */
    next(request?: DispatchRequest): Promise<DispatchResult | null>;
}
export interface DispatchRequest {
    /** Role to summon. Default: 'artificer'. */
    role?: string;
    /** If true, find and report the writ but don't dispatch. */
    dryRun?: boolean;
}
export interface DispatchResult {
    /** The writ that was dispatched. */
    writId: string;
    /** The session id (from the Animator). Absent if dryRun. */
    sessionId?: string;
    /** Terminal writ status after dispatch. Absent if dryRun. */
    outcome?: 'completed' | 'failed';
    /** Resolution text set on the writ. Absent if dryRun. */
    resolution?: string;
    /** Whether this was a dry run. */
    dryRun: boolean;
}
//# sourceMappingURL=types.d.ts.map
=== packages/plugins/fabricator/dist/fabricator.d.ts ===
/**
 * The Fabricator — guild engine design registry apparatus.
 *
 * Scans installed engine designs from kit contributions and apparatus supportKits,
 * and serves them to the Spider on demand.
 *
 * The Fabricator does not execute engines. It is a pure query service:
 * designs in, designs out.
 */
import type { Plugin } from '@shardworks/nexus-core';
/** Minimal execution context passed to an engine's run() method. */
export interface EngineRunContext {
    /** Simple string identity for this engine instance (e.g. 'draft', 'implement'). */
    engineId: string;
    /** All upstream yields, keyed by engine id. Escape hatch for engines that need to inspect the full upstream chain. */
    upstream: Record<string, unknown>;
}
/**
 * The result of an engine run.
 *
 * 'completed' — synchronous work done inline, yields are available immediately.
 * 'launched'  — async work launched in a session; the Spider polls for completion.
 */
export type EngineRunResult = {
    status: 'completed';
    yields: unknown;
} | {
    status: 'launched';
    sessionId: string;
};
/**
 * An engine design — the unit of work the Fabricator catalogues and the
 * Spider executes. Kit authors import this type from @shardworks/fabricator-apparatus.
 */
export interface EngineDesign {
    /** Unique identifier for this engine design (e.g. 'draft', 'implement', 'review'). */
    id: string;
    /**
     * Execute this engine.
     *
     * @param givens   — the engine's declared inputs, assembled by the Spider.
     * @param context  — minimal execution context: engine id and upstream yields.
     */
    run(givens: Record<string, unknown>, context: EngineRunContext): Promise<EngineRunResult>;
    /**
     * Assemble yields from a completed session.
     *
     * Called by the Spider's collect step when a quick engine's session
     * reaches a terminal state. The engine looks up whatever it needs
     * via guild() — same dependency pattern as run().
     *
     * @param sessionId — the session to collect yields from (primary input).
     * @param givens    — same givens that were passed to run().
     * @param context   — same execution context that was passed to run().
     *
     * If not defined, the Spider uses a generic default:
     *   { sessionId, sessionStatus, output? }
     *
     * Only relevant for quick engines (those that return { status: 'launched' }).
     * Clockwork engines return yields directly from run().
     */
    collect?(sessionId: string, givens: Record<string, unknown>, context: EngineRunContext): Promise<unknown>;
}
/** The Fabricator's public API, exposed via `provides`. */
export interface FabricatorApi {
    /**
     * Look up an engine design by ID.
     * Returns the design if registered, undefined otherwise.
     */
    getEngineDesign(id: string): EngineDesign | undefined;
}
/**
 * Create the Fabricator apparatus plugin.
 *
 * Returns a Plugin with:
 * - `consumes: ['engines']` — scans kit/supportKit contributions
 * - `provides: FabricatorApi` — the engine design registry API
 */
export declare function createFabricator(): Plugin;
//# sourceMappingURL=fabricator.d.ts.map
=== packages/plugins/fabricator/dist/index.d.ts ===
/**
 * @shardworks/fabricator-apparatus — The Fabricator.
 *
 * Guild engine design registry: scans kit contributions, stores engine designs
 * by ID, and provides the FabricatorApi for design lookup.
 *
 * The EngineDesign, EngineRunContext, and EngineRunResult types live here
 * canonically — kit authors import from this package to contribute engines.
 */
export type { EngineDesign, EngineRunContext, EngineRunResult, } from './fabricator.ts';
export type { FabricatorApi } from './fabricator.ts';
export { createFabricator } from './fabricator.ts';
declare const _default: import("@shardworks/nexus-core").Plugin;
export default _default;
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/loom/dist/index.d.ts ===
/**
 * @shardworks/loom-apparatus — The Loom.
 *
 * Session context composition: weaves role instructions, curricula, and
 * temperaments into an AnimaWeave that The Animator can consume to
 * launch AI sessions.
 *
 * See: docs/specification.md (loom)
 */
export { type LoomApi, type WeaveRequest, type AnimaWeave, type LoomConfig, type RoleDefinition, createLoom, } from './loom.ts';
import type { LoomConfig } from './loom.ts';
declare module '@shardworks/nexus-core' {
    interface GuildConfig {
        loom?: LoomConfig;
    }
}
declare const _default: import("@shardworks/nexus-core").Plugin;
export default _default;
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/loom/dist/loom.d.ts ===
/**
 * The Loom — session context composition apparatus.
 *
 * The Loom owns system prompt assembly. Given a role name, it produces
 * an AnimaWeave — the composed identity context that The Animator uses
 * to launch a session. The work prompt (what the anima should do) is
 * not the Loom's concern; it bypasses the Loom and goes directly to
 * the Animator.
 *
 * The Loom resolves the role's permission grants from guild.json, then
 * calls the Instrumentarium to resolve the permission-gated tool set.
 * Tools are returned on the AnimaWeave so the Animator can pass them
 * to the session provider for MCP server configuration.
 *
 * See: docs/specification.md (loom)
 */
import type { Plugin } from '@shardworks/nexus-core';
import type { ResolvedTool } from '@shardworks/tools-apparatus';
export interface WeaveRequest {
    /**
     * The role to weave context for (e.g. 'artificer', 'scribe').
     *
     * When provided, the Loom resolves role → permissions from guild.json,
     * then calls the Instrumentarium to resolve the permission-gated tool set.
     * Tools are returned on the AnimaWeave.
     *
     * When omitted, no tool resolution occurs — the AnimaWeave has no tools.
     */
    role?: string;
}
/**
 * The output of The Loom's weave() — the composed anima identity context.
 *
 * Contains the system prompt (produced by the Loom from the anima's
 * identity layers) and the resolved tool set for the role. The work
 * prompt is not part of the weave — it goes directly to the Animator.
 */
export interface AnimaWeave {
    /** The system prompt for the AI process. Undefined until composition is implemented. */
    systemPrompt?: string;
    /** The resolved tool set for this role. Undefined when no role is specified or no tools match. */
    tools?: ResolvedTool[];
    /** Environment variables derived from role identity (e.g. git author/committer). */
    environment?: Record<string, string>;
}
/** The Loom's public API, exposed via `provides`. */
export interface LoomApi {
    /**
     * Weave an anima's session context.
     *
     * Given a role name, produces an AnimaWeave containing the composed
     * system prompt and the resolved tool set. System prompt composition
     * (charter, curricula, temperament, role instructions) is future work —
     * systemPrompt remains undefined until then.
     *
     * Tool resolution is active: if a role is provided and the Instrumentarium
     * is installed, the Loom resolves role → permissions → tools.
     */
    weave(request: WeaveRequest): Promise<AnimaWeave>;
}
/** Role definition in guild.json under the Loom's plugin section. */
export interface RoleDefinition {
    /** Permission grants in `plugin:level` format. */
    permissions: string[];
    /**
     * When true, permissionless tools are excluded unless the role grants
     * `plugin:*` or `*:*` for the tool's plugin. Default: false.
     */
    strict?: boolean;
}
/** Loom configuration from guild.json. */
export interface LoomConfig {
    /** Role definitions keyed by role name. */
    roles?: Record<string, RoleDefinition>;
}
/**
 * Create the Loom apparatus plugin.
 *
 * Returns a Plugin with:
 * - `requires: ['tools']` — needs the Instrumentarium for tool resolution
 * - `provides: LoomApi` — the context composition API
 */
export declare function createLoom(): Plugin;
//# sourceMappingURL=loom.d.ts.map
=== packages/plugins/parlour/dist/index.d.ts ===
/**
 * @shardworks/parlour-apparatus — The Parlour.
 *
 * Multi-turn conversation management: creates conversations, registers
 * participants, orchestrates turns (with streaming), enforces turn limits,
 * and ends conversations. Delegates session launch to The Animator and
 * context composition to The Loom.
 *
 * See: docs/architecture/apparatus/parlour.md
 */
export { type ParlourApi, type ConversationDoc, type TurnDoc, type ParticipantRecord, type Participant, type CreateConversationRequest, type CreateConversationResult, type ParticipantDeclaration, type TakeTurnRequest, type TurnResult, type ConversationChunk, type ConversationSummary, type ConversationDetail, type TurnSummary, type ListConversationsOptions, } from './types.ts';
export { createParlour } from './parlour.ts';
declare const _default: import("@shardworks/nexus-core").Plugin;
export default _default;
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/parlour/dist/parlour.d.ts ===
/**
 * The Parlour — multi-turn conversation management apparatus.
 *
 * Manages two kinds of conversation:
 * - consult: a human talks to an anima
 * - convene: multiple animas hold a structured dialogue
 *
 * The Parlour orchestrates turns — it decides when and for whom to call
 * The Animator, and tracks conversation state in The Stacks. It does not
 * launch sessions itself (delegates to The Animator) or assemble prompts
 * (delegates to The Loom).
 *
 * See: docs/architecture/apparatus/parlour.md
 */
import type { Plugin } from '@shardworks/nexus-core';
/**
 * Create the Parlour apparatus plugin.
 *
 * Returns a Plugin with:
 * - `requires: ['stacks', 'animator', 'loom']` — conversation orchestration
 * - `provides: ParlourApi` — the conversation management API
 * - `supportKit` — contributes `conversations` + `turns` books + management tools
 */
export declare function createParlour(): Plugin;
//# sourceMappingURL=parlour.d.ts.map
=== packages/plugins/parlour/dist/tools/conversation-end.d.ts ===
/**
 * conversation-end tool — end an active conversation.
 *
 * Sets conversation status to 'concluded' or 'abandoned'.
 * Idempotent — no error if the conversation is already ended.
 *
 * See: docs/architecture/apparatus/parlour.md
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    id: z.ZodString;
    reason: z.ZodDefault<z.ZodOptional<z.ZodEnum<{
        concluded: "concluded";
        abandoned: "abandoned";
    }>>>;
}>;
export default _default;
//# sourceMappingURL=conversation-end.d.ts.map
=== packages/plugins/parlour/dist/tools/conversation-list.d.ts ===
/**
 * conversation-list tool — list conversations with optional filters.
 *
 * Queries The Parlour's conversations via the ParlourApi.
 * Returns conversation summaries ordered by createdAt descending (newest first).
 *
 * See: docs/architecture/apparatus/parlour.md
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    status: z.ZodOptional<z.ZodEnum<{
        active: "active";
        concluded: "concluded";
        abandoned: "abandoned";
    }>>;
    kind: z.ZodOptional<z.ZodEnum<{
        consult: "consult";
        convene: "convene";
    }>>;
    limit: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
}>;
export default _default;
//# sourceMappingURL=conversation-list.d.ts.map
=== packages/plugins/parlour/dist/tools/conversation-show.d.ts ===
/**
 * conversation-show tool — show full detail for a conversation.
 *
 * Returns the complete conversation record including all turns,
 * participant list, and aggregate cost.
 *
 * See: docs/architecture/apparatus/parlour.md
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    id: z.ZodString;
}>;
export default _default;
//# sourceMappingURL=conversation-show.d.ts.map
=== packages/plugins/parlour/dist/tools/index.d.ts ===
/**
 * Parlour tool re-exports.
 */
export { default as conversationList } from './conversation-list.ts';
export { default as conversationShow } from './conversation-show.ts';
export { default as conversationEnd } from './conversation-end.ts';
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/parlour/dist/types.d.ts ===
/**
 * The Parlour — public types.
 *
 * These types form the contract between The Parlour apparatus and all
 * callers (CLI consult command, clockworks convene handlers, etc.).
 * No implementation details.
 *
 * See: docs/architecture/apparatus/parlour.md
 */
import type { SessionResult, SessionChunk } from '@shardworks/animator-apparatus';
export interface ConversationDoc {
    id: string;
    status: 'active' | 'concluded' | 'abandoned';
    kind: 'consult' | 'convene';
    topic: string | null;
    turnLimit: number | null;
    createdAt: string;
    endedAt: string | null;
    eventId: string | null;
    participants: ParticipantRecord[];
    /** Stored once at creation — all turns must use the same cwd for --resume. */
    cwd: string;
    /** Index signature required by BookEntry. */
    [key: string]: unknown;
}
export interface ParticipantRecord {
    /** Stable participant id (generated at creation). */
    id: string;
    kind: 'anima' | 'human';
    name: string;
    /** Anima id, resolved at creation time. Null for human participants. */
    animaId: string | null;
    /**
     * Provider session id for --resume. Updated after each turn so
     * the next turn can continue the provider's conversation context.
     */
    providerSessionId: string | null;
}
/**
 * Internal turn record stored in the turns book.
 * One entry per takeTurn() call — both human and anima turns.
 */
export interface TurnDoc {
    id: string;
    conversationId: string;
    turnNumber: number;
    participantId: string;
    participantName: string;
    participantKind: 'anima' | 'human';
    /** The message passed to this turn (human message or inter-turn context). */
    message: string | null;
    /** Session id from The Animator (null for human turns). */
    sessionId: string | null;
    startedAt: string;
    endedAt: string | null;
    /** Index signature required by BookEntry. */
    [key: string]: unknown;
}
export interface CreateConversationRequest {
    /** Conversation kind. */
    kind: 'consult' | 'convene';
    /** Seed topic or prompt. Used as the initial message for the first turn. */
    topic?: string;
    /** Maximum allowed turns (anima turns only). Null = unlimited. */
    turnLimit?: number;
    /** Participants in the conversation. */
    participants: ParticipantDeclaration[];
    /** Working directory — persists for the conversation's lifetime. */
    cwd: string;
    /** Triggering event id, for conversations started by clockworks. */
    eventId?: string;
}
export interface ParticipantDeclaration {
    kind: 'anima' | 'human';
    /** Display name. For anima participants, this is the anima name
     *  used to resolve identity via The Loom at turn time. */
    name: string;
}
export interface CreateConversationResult {
    conversationId: string;
    participants: Participant[];
}
export interface Participant {
    id: string;
    name: string;
    kind: 'anima' | 'human';
}
export interface TakeTurnRequest {
    conversationId: string;
    participantId: string;
    /** The message for this turn. For consult: the human's message.
     *  For convene: typically assembled by the caller, or omitted to
     *  let The Parlour assemble it automatically. */
    message?: string;
}
export interface TurnResult {
    /** The Animator's session result for this turn. Null for human turns. */
    sessionResult: SessionResult | null;
    /** Turn number within the conversation (1-indexed). */
    turnNumber: number;
    /** Whether the conversation is still active after this turn. */
    conversationActive: boolean;
}
/** A chunk of output from a conversation turn. */
export type ConversationChunk = SessionChunk | {
    type: 'turn_complete';
    turnNumber: number;
    costUsd?: number;
};
export interface ConversationSummary {
    id: string;
    status: 'active' | 'concluded' | 'abandoned';
    kind: 'consult' | 'convene';
    topic: string | null;
    turnLimit: number | null;
    createdAt: string;
    endedAt: string | null;
    participants: Participant[];
    /** Computed from turn records. */
    turnCount: number;
    /** Aggregate cost across all turns. */
    totalCostUsd: number;
}
export interface ConversationDetail extends ConversationSummary {
    turns: TurnSummary[];
}
export interface TurnSummary {
    sessionId: string | null;
    turnNumber: number;
    participant: string;
    message: string | null;
    startedAt: string;
    endedAt: string | null;
}
export interface ListConversationsOptions {
    status?: 'active' | 'concluded' | 'abandoned';
    kind?: 'consult' | 'convene';
    limit?: number;
}
export interface ParlourApi {
    /**
     * Create a new conversation.
     *
     * Sets up conversation and participant records. Does NOT take a first
     * turn — that's a separate call to takeTurn().
     */
    create(request: CreateConversationRequest): Promise<CreateConversationResult>;
    /**
     * Take a turn in a conversation.
     *
     * For anima participants: weaves context via The Loom, assembles the
     * inter-turn message, and calls The Animator to run a session. Returns
     * the session result. For human participants: records the message as
     * context for the next turn (no session launched).
     *
     * Throws if the conversation is not active or the turn limit is reached.
     */
    takeTurn(request: TakeTurnRequest): Promise<TurnResult>;
    /**
     * Take a turn with streaming output.
     *
     * Same as takeTurn(), but yields ConversationChunks as the session
     * produces output. Includes a turn_complete chunk at the end.
     */
    takeTurnStreaming(request: TakeTurnRequest): {
        chunks: AsyncIterable<ConversationChunk>;
        result: Promise<TurnResult>;
    };
    /**
     * Get the next participant in a conversation.
     *
     * For convene: returns the next anima in round-robin order.
     * For consult: returns the anima participant (human turns are implicit).
     * Returns null if the conversation is not active or the turn limit is reached.
     */
    nextParticipant(conversationId: string): Promise<Participant | null>;
    /**
     * End a conversation.
     *
     * Sets status to 'concluded' (normal end) or 'abandoned' (e.g. timeout,
     * disconnect). Idempotent — no error if already ended.
     */
    end(conversationId: string, reason?: 'concluded' | 'abandoned'): Promise<void>;
    /**
     * List conversations with optional filters.
     */
    list(options?: ListConversationsOptions): Promise<ConversationSummary[]>;
    /**
     * Show full detail for a conversation.
     */
    show(conversationId: string): Promise<ConversationDetail | null>;
}
//# sourceMappingURL=types.d.ts.map
=== packages/plugins/spider/dist/engines/draft.d.ts ===
/**
 * Draft engine — clockwork.
 *
 * Opens a draft binding via the Scriptorium. Returns DraftYields
 * containing the worktree path and branch name for downstream engines.
 */
import type { EngineDesign } from '@shardworks/fabricator-apparatus';
declare const draftEngine: EngineDesign;
export default draftEngine;
//# sourceMappingURL=draft.d.ts.map
=== packages/plugins/spider/dist/engines/implement.d.ts ===
/**
 * Implement engine — quick (Animator-backed).
 *
 * Summons an anima to do the commissioned work. Wraps the writ body with
 * a commit instruction, then calls animator.summon() with the draft
 * worktree as the working directory. Returns `{ status: 'launched', sessionId }`
 * so the Spider's collect step can poll for completion on subsequent walks.
 */
import type { EngineDesign } from '@shardworks/fabricator-apparatus';
declare const implementEngine: EngineDesign;
export default implementEngine;
//# sourceMappingURL=implement.d.ts.map
=== packages/plugins/spider/dist/engines/index.d.ts ===
export { default as draftEngine } from './draft.ts';
export { default as implementEngine } from './implement.ts';
export { default as reviewEngine } from './review.ts';
export { default as reviseEngine } from './revise.ts';
export { default as sealEngine } from './seal.ts';
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/spider/dist/engines/review.d.ts ===
/**
 * Review engine — quick (Animator-backed).
 *
 * Runs mechanical checks (build/test) synchronously in the draft worktree,
 * then summons a reviewer anima to assess the implementation against the spec.
 * Returns `{ status: 'launched', sessionId }` so the Spider's collect step
 * can call this engine's collect() method on subsequent crawls.
 *
 * Collect method:
 *   - Reads session.output as the reviewer's structured markdown findings
 *   - Parses `passed` from /^###\s*Overall:\s*PASS/mi
 *   - Retrieves mechanicalChecks from session.metadata
 */
import type { EngineDesign } from '@shardworks/fabricator-apparatus';
declare const reviewEngine: EngineDesign;
export default reviewEngine;
//# sourceMappingURL=review.d.ts.map
=== packages/plugins/spider/dist/engines/revise.d.ts ===
/**
 * Revise engine — quick (Animator-backed).
 *
 * Summons an anima to address review findings. If the review passed, the
 * prompt instructs the anima to confirm and exit without unnecessary changes.
 * If the review failed, the prompt directs the anima to address each item
 * in the findings and commit the result.
 *
 * Returns `{ status: 'launched', sessionId }` so the Spider's collect step
 * can store ReviseYields on completion.
 */
import type { EngineDesign } from '@shardworks/fabricator-apparatus';
declare const reviseEngine: EngineDesign;
export default reviseEngine;
//# sourceMappingURL=revise.d.ts.map
=== packages/plugins/spider/dist/engines/seal.d.ts ===
/**
 * Seal engine — clockwork.
 *
 * Seals the draft binding via the Scriptorium. Reads the draft branch
 * from context.upstream['draft'] (the DraftYields from the draft engine).
 * Returns SealYields with the sealed commit info.
 */
import type { EngineDesign } from '@shardworks/fabricator-apparatus';
declare const sealEngine: EngineDesign;
export default sealEngine;
//# sourceMappingURL=seal.d.ts.map
=== packages/plugins/spider/dist/index.d.ts ===
/**
 * @shardworks/spider-apparatus — The Spider.
 *
 * Rig execution engine: spawns rigs for ready writs, drives engine pipelines
 * to completion, and transitions writs via the Clerk on rig completion/failure.
 *
 * Public types (RigDoc, EngineInstance, CrawlResult, SpiderApi, etc.) are
 * re-exported for consumers that inspect walk results or rig state.
 */
export type { EngineStatus, EngineInstance, RigStatus, RigDoc, CrawlResult, SpiderApi, SpiderConfig, DraftYields, SealYields, } from './types.ts';
declare const _default: import("@shardworks/nexus-core").Plugin;
export default _default;
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/spider/dist/spider.d.ts ===
/**
 * The Spider — rig execution engine apparatus.
 *
 * The Spider drives writ-to-completion by managing rigs: ordered pipelines
 * of engine instances. Each crawl() call performs one unit of work:
 *
 *   collect > run > spawn   (priority order)
 *
 * collect — check running engines for terminal session results
 * run     — execute the next pending engine (clockwork inline, quick → launch)
 * spawn   — create a new rig for a ready writ with no existing rig
 *
 * CDC on the rigs book (Phase 1 cascade) transitions the associated writ
 * when a rig reaches a terminal state (completed or failed).
 *
 * See: docs/architecture/apparatus/spider.md
 */
import type { Plugin } from '@shardworks/nexus-core';
export declare function createSpider(): Plugin;
//# sourceMappingURL=spider.d.ts.map
=== packages/plugins/spider/dist/tools/crawl-continual.d.ts ===
/**
 * crawlContinual tool — runs the crawl loop continuously.
 *
 * Polls crawl() on a configurable interval until stopped or no remaining
 * work exists for the configured number of consecutive idle cycles.
 */
import { z } from 'zod';
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{
    maxIdleCycles: z.ZodDefault<z.ZodOptional<z.ZodNumber>>;
    pollIntervalMs: z.ZodOptional<z.ZodNumber>;
}>;
export default _default;
//# sourceMappingURL=crawl-continual.d.ts.map
=== packages/plugins/spider/dist/tools/crawl.d.ts ===
/**
 * crawl tool — executes a single step of the crawl loop.
 *
 * Returns the CrawlResult or null (idle) from one crawl() call.
 * Useful for manual step-through or testing.
 */
declare const _default: import("@shardworks/tools-apparatus").ToolDefinition<{}>;
export default _default;
//# sourceMappingURL=crawl.d.ts.map
=== packages/plugins/spider/dist/tools/index.d.ts ===
export { default as crawlTool } from './crawl.ts';
export { default as crawlContinualTool } from './crawl-continual.ts';
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/spider/dist/types.d.ts ===
/**
 * The Spider — public types.
 *
 * Rig and engine data model, CrawlResult, SpiderApi, and configuration.
 * Engine yield shapes (DraftYields, SealYields) live here too so downstream
 * packages can import them without depending on the engine implementation files.
 */
export type EngineStatus = 'pending' | 'running' | 'completed' | 'failed';
/**
 * A single engine slot within a rig.
 *
 * `id` is the engine's position identifier (e.g. 'draft', 'implement').
 * For the static pipeline it matches `designId`.
 *
 * `givensSpec` holds literal values set at spawn time (writ, role, commands).
 * The Spider assembles `givens` from this directly; upstream yields arrive
 * via `context.upstream` as the escape hatch.
 */
export interface EngineInstance {
    /** Unique identifier within the rig (e.g. 'draft', 'implement'). */
    id: string;
    /** The engine design to look up in the Fabricator. */
    designId: string;
    /** Current execution status. */
    status: EngineStatus;
    /** Engine IDs that must be completed before this engine can run. */
    upstream: string[];
    /** Literal givens values set at rig spawn time. */
    givensSpec: Record<string, unknown>;
    /** Yields from a completed engine run (JSON-serializable). */
    yields?: unknown;
    /** Error message if this engine failed. */
    error?: string;
    /** Session ID from a launched quick engine, used by the collect step. */
    sessionId?: string;
    /** ISO timestamp when execution started. */
    startedAt?: string;
    /** ISO timestamp when execution completed (or failed). */
    completedAt?: string;
}
export type RigStatus = 'running' | 'completed' | 'failed';
/**
 * A rig — the execution context for a single writ.
 *
 * Stored in The Stacks (`spider/rigs` book). The `engines` array is the
 * ordered pipeline of engine instances. The Spider updates this document
 * in-place as engines run and complete.
 */
export interface RigDoc {
    /** Index signature required to satisfy BookEntry constraint. */
    [key: string]: unknown;
    /** Unique rig id. */
    id: string;
    /** The writ this rig is executing. */
    writId: string;
    /** Current rig status. */
    status: RigStatus;
    /** Ordered engine pipeline. */
    engines: EngineInstance[];
}
/**
 * The result of a single crawl() call.
 *
 * Four variants, ordered by priority:
 * - 'engine-completed' — an engine finished (collected or ran inline); rig still running
 * - 'engine-started'   — launched a quick engine's session
 * - 'rig-spawned'      — created a new rig for a ready writ
 * - 'rig-completed'    — the crawl step caused a rig to reach a terminal state
 *
 * null means no work was available.
 */
export type CrawlResult = {
    action: 'engine-completed';
    rigId: string;
    engineId: string;
} | {
    action: 'engine-started';
    rigId: string;
    engineId: string;
} | {
    action: 'rig-spawned';
    rigId: string;
    writId: string;
} | {
    action: 'rig-completed';
    rigId: string;
    writId: string;
    outcome: 'completed' | 'failed';
};
/**
 * The Spider's public API — retrieved via guild().apparatus<SpiderApi>('spider').
 */
export interface SpiderApi {
    /**
     * Execute one step of the crawl loop.
     *
     * Priority ordering: collect > run > spawn.
     * Returns null when no work is available.
     */
    crawl(): Promise<CrawlResult | null>;
}
/**
 * Spider apparatus configuration — lives under the `spider` key in guild.json.
 */
export interface SpiderConfig {
    /**
     * Role to summon for quick engine sessions.
     * Default: 'artificer'.
     */
    role?: string;
    /**
     * Polling interval for crawlContinual tool (milliseconds).
     * Default: 5000.
     */
    pollIntervalMs?: number;
    /**
     * Build command to pass to quick engines.
     */
    buildCommand?: string;
    /**
     * Test command to pass to quick engines.
     */
    testCommand?: string;
}
/**
 * Yields from the `draft` clockwork engine.
 * The Spider stores these in the engine instance and passes them
 * to downstream engines via context.upstream['draft'].
 */
export interface DraftYields {
    /** The draft's unique id. */
    draftId: string;
    /** Codex this draft belongs to. */
    codexName: string;
    /** Git branch name for the draft. */
    branch: string;
    /** Absolute filesystem path to the draft's worktree. */
    path: string;
    /** HEAD commit SHA at the time the draft was opened. Used by review engine to compute diffs. */
    baseSha: string;
}
/**
 * Yields from the `seal` clockwork engine.
 */
export interface SealYields {
    /** The commit SHA at head of the target branch after sealing. */
    sealedCommit: string;
    /** Git strategy used. */
    strategy: 'fast-forward' | 'rebase';
    /** Number of retry attempts. */
    retries: number;
    /** Number of inscriptions (commits) sealed. */
    inscriptionsSealed: number;
}
/**
 * Yields from the `implement` quick engine.
 * Set by the Spider's collect step when the Animator session completes.
 */
export interface ImplementYields {
    /** The Animator session id. */
    sessionId: string;
    /** Terminal status of the session. */
    sessionStatus: 'completed' | 'failed';
}
/**
 * A single mechanical check (build or test) run by the review engine
 * before launching the reviewer session.
 */
export interface MechanicalCheck {
    /** Check name. */
    name: 'build' | 'test';
    /** Whether the command exited with code 0. */
    passed: boolean;
    /** Combined stdout+stderr, truncated to 4KB. */
    output: string;
    /** Wall-clock duration of the check in milliseconds. */
    durationMs: number;
}
/**
 * Yields from the `review` quick engine.
 * Assembled by the Spider's collect step from session.output and session.metadata.
 */
export interface ReviewYields {
    /** The Animator session id. */
    sessionId: string;
    /** Reviewer's overall assessment — true if the review passed. */
    passed: boolean;
    /** Structured markdown findings from the reviewer's final message. */
    findings: string;
    /** Mechanical check results run before the reviewer session. */
    mechanicalChecks: MechanicalCheck[];
}
/**
 * Yields from the `revise` quick engine.
 * Set by the Spider's collect step when the Animator session completes.
 */
export interface ReviseYields {
    /** The Animator session id. */
    sessionId: string;
    /** Terminal status of the session. */
    sessionStatus: 'completed' | 'failed';
}
declare module '@shardworks/nexus-core' {
    interface GuildConfig {
        spider?: SpiderConfig;
    }
}
//# sourceMappingURL=types.d.ts.map
=== packages/plugins/stacks/dist/backend.d.ts ===
/**
 * StacksBackend — persistence abstraction for The Stacks.
 *
 * All SQLite-specific types stay behind this interface. The apparatus
 * and all consuming plugins depend only on these types. Backend
 * implementations (SQLite, in-memory) implement this interface.
 *
 * See: docs/specification.md §8
 */
import type { BookEntry, BookSchema, Scalar } from './types.ts';
export interface BookRef {
    ownerId: string;
    book: string;
}
export interface BackendOptions {
    home: string;
}
export interface PutResult {
    created: boolean;
    prev?: BookEntry;
}
export interface PatchResult {
    entry: BookEntry;
    prev: BookEntry;
}
export interface DeleteResult {
    found: boolean;
    prev?: BookEntry;
}
export type InternalCondition = {
    field: string;
    op: 'eq' | 'neq';
    value: Scalar;
} | {
    field: string;
    op: 'gt' | 'gte' | 'lt' | 'lte';
    value: number | string;
} | {
    field: string;
    op: 'like';
    value: string;
} | {
    field: string;
    op: 'in';
    values: Scalar[];
} | {
    field: string;
    op: 'isNull' | 'isNotNull';
};
export interface InternalQuery {
    where?: InternalCondition[];
    orderBy?: Array<{
        field: string;
        dir: 'asc' | 'desc';
    }>;
    limit?: number;
    offset?: number;
}
/** Narrowed query type for count() — conditions only, no pagination. */
export interface CountQuery {
    where?: InternalCondition[];
}
export interface BackendTransaction {
    put(ref: BookRef, entry: BookEntry, opts?: {
        withPrev: boolean;
    }): PutResult;
    patch(ref: BookRef, id: string, fields: Record<string, unknown>): PatchResult;
    delete(ref: BookRef, id: string, opts?: {
        withPrev: boolean;
    }): DeleteResult;
    get(ref: BookRef, id: string): BookEntry | null;
    find(ref: BookRef, query: InternalQuery): BookEntry[];
    count(ref: BookRef, query: CountQuery): number;
    commit(): void;
    rollback(): void;
}
export interface StacksBackend {
    open(options: BackendOptions): void;
    close(): void;
    ensureBook(ref: BookRef, schema: BookSchema): void;
    beginTransaction(): BackendTransaction;
}
//# sourceMappingURL=backend.d.ts.map
=== packages/plugins/stacks/dist/cdc.d.ts ===
/**
 * CDC registry — handler registration, event buffering, and coalescing.
 *
 * Two-phase execution model:
 * - Phase 1 (failOnError: true):  runs INSIDE the transaction
 * - Phase 2 (failOnError: false): runs AFTER commit with coalesced events
 *
 * See: docs/specification.md (stacks § CDC)
 */
import type { BookEntry, ChangeEvent, ChangeHandler, WatchOptions } from './types.ts';
interface WatcherEntry {
    handler: ChangeHandler;
    failOnError: boolean;
}
export interface BufferedEvent {
    ref: string;
    ownerId: string;
    book: string;
    docId: string;
    type: 'create' | 'update' | 'delete';
    entry?: BookEntry;
    prev?: BookEntry;
}
/**
 * Coalesce buffered events per-document.
 *
 * Rules:
 *   create                    → create (final state)
 *   create → update(s)        → create (final state)
 *   create → delete           → (no event)
 *   update(s)                 → update (first prev, final state)
 *   update(s) → delete        → delete (first prev)
 *   delete                    → delete (prev)
 */
export declare function coalesceEvents(buffer: BufferedEvent[]): ChangeEvent<BookEntry>[];
export declare class CdcRegistry {
    private readonly watchers;
    private locked;
    /**
     * Register a CDC handler for a book.
     * Must be called before any writes (enforced by `locked` flag).
     */
    watch(ownerId: string, bookName: string, handler: ChangeHandler, options?: WatchOptions): void;
    /** Mark the registry as locked — called on first write. */
    lock(): void;
    /** Check if any handlers are registered for a book (controls pre-read). */
    hasWatchers(ownerId: string, bookName: string): boolean;
    /** Get Phase 1 handlers (failOnError: true) for a book. */
    getPhase1Handlers(ownerId: string, bookName: string): WatcherEntry[];
    /** Get Phase 2 handlers (failOnError: false) for a book. */
    getPhase2Handlers(ownerId: string, bookName: string): WatcherEntry[];
    /**
     * Fire Phase 1 handlers for a single event. Throws on handler error
     * (caller is responsible for rolling back the transaction).
     */
    firePhase1(ownerId: string, bookName: string, event: ChangeEvent<BookEntry>): Promise<void>;
    /**
     * Fire Phase 2 handlers for coalesced events. Errors are logged, not thrown.
     */
    firePhase2(events: ChangeEvent<BookEntry>[]): Promise<void>;
}
export {};
//# sourceMappingURL=cdc.d.ts.map
=== packages/plugins/stacks/dist/conformance/helpers.d.ts ===
/**
 * Conformance test helpers — create a StacksApi from a bare backend,
 * bypassing the guild startup machinery.
 *
 * Each test gets a fresh backend + API instance. No state leaks.
 */
import type { StacksBackend, BookRef } from '../backend.ts';
import type { BookEntry, StacksApi, ChangeEvent, CreateEvent, UpdateEvent, DeleteEvent, WatchOptions } from '../types.ts';
export interface TestStacks {
    stacks: StacksApi;
    backend: StacksBackend;
    /** Ensure a book exists (bypasses kit contribution flow). */
    ensureBook(ownerId: string, bookName: string, schema?: {
        indexes?: (string | string[])[];
    }): void;
}
export declare function createTestStacks(backendFactory: () => StacksBackend): TestStacks;
export declare function seedDocument(backend: StacksBackend, ref: BookRef, entry: BookEntry): void;
export declare function collectEvents<T extends BookEntry = BookEntry>(stacks: StacksApi, ownerId: string, bookName: string, options?: WatchOptions): ChangeEvent<T>[];
export interface PutCall {
    ref: BookRef;
    entry: BookEntry;
    withPrev: boolean;
}
/**
 * Wraps a backend factory to record put() calls on transactions,
 * so tests can verify whether withPrev was requested.
 */
export declare function spyingBackendFactory(factory: () => StacksBackend): {
    factory: () => StacksBackend;
    putCalls: PutCall[];
};
/** Assert the event is a `create` and check its fields. */
export declare function assertCreateEvent(event: ChangeEvent<BookEntry>, expected: {
    entry: BookEntry;
    ownerId?: string;
    book?: string;
}): asserts event is CreateEvent<BookEntry>;
/** Assert the event is an `update` and check its fields. */
export declare function assertUpdateEvent(event: ChangeEvent<BookEntry>, expected: {
    entry: BookEntry;
    prev: BookEntry;
    ownerId?: string;
    book?: string;
}): asserts event is UpdateEvent<BookEntry>;
/** Assert the event is a `delete` and check its fields. */
export declare function assertDeleteEvent(event: ChangeEvent<BookEntry>, expected: {
    id: string;
    prev: BookEntry;
    ownerId?: string;
    book?: string;
}): asserts event is DeleteEvent<BookEntry>;
export declare const OWNER = "test-owner";
export declare const BOOK = "testbook";
export declare const REF: BookRef;
//# sourceMappingURL=helpers.d.ts.map
=== packages/plugins/stacks/dist/conformance/suite.d.ts ===
/**
 * Stacks conformance test suite — parametric registration.
 *
 * Exports a single function that registers all conformance tiers
 * against a given backend factory. Each backend test file calls
 * this with its own factory function.
 */
import type { StacksBackend } from '../backend.ts';
export declare function runConformanceSuite(suiteName: string, backendFactory: () => StacksBackend): void;
//# sourceMappingURL=suite.d.ts.map
=== packages/plugins/stacks/dist/conformance/testable-stacks.d.ts ===
/**
 * Testable Stacks — a minimal StacksApi wired directly to a backend,
 * without requiring the guild startup machinery.
 *
 * Uses the same StacksCore as the production apparatus, ensuring
 * behavioral identity by construction.
 */
import type { StacksBackend } from '../backend.ts';
import type { StacksApi } from '../types.ts';
export declare function createTestableStacks(backend: StacksBackend): StacksApi;
//# sourceMappingURL=testable-stacks.d.ts.map
=== packages/plugins/stacks/dist/conformance/tier1-data-integrity.d.ts ===
/**
 * Tier 1 — Data Integrity conformance tests.
 *
 * Failures here mean data loss or corruption. Non-negotiable.
 */
import type { StacksBackend } from '../backend.ts';
export declare function tier1DataIntegrity(backendFactory: () => StacksBackend): void;
//# sourceMappingURL=tier1-data-integrity.d.ts.map
=== packages/plugins/stacks/dist/conformance/tier2-cdc.d.ts ===
/**
 * Tier 2 — CDC Behavioral Correctness conformance tests.
 *
 * Failures here mean the CDC contract is violated.
 */
import type { StacksBackend } from '../backend.ts';
export declare function tier2Cdc(backendFactory: () => StacksBackend): void;
//# sourceMappingURL=tier2-cdc.d.ts.map
=== packages/plugins/stacks/dist/conformance/tier2.5-transactions.d.ts ===
/**
 * Tier 2.5 — Transaction Semantics conformance tests.
 */
import type { StacksBackend } from '../backend.ts';
export declare function tier25Transactions(backendFactory: () => StacksBackend): void;
//# sourceMappingURL=tier2.5-transactions.d.ts.map
=== packages/plugins/stacks/dist/conformance/tier3-queries.d.ts ===
/**
 * Tier 3 — Query Correctness conformance tests.
 */
import type { StacksBackend } from '../backend.ts';
export declare function tier3Queries(backendFactory: () => StacksBackend): void;
//# sourceMappingURL=tier3-queries.d.ts.map
=== packages/plugins/stacks/dist/conformance/tier4-edge-cases.d.ts ===
/**
 * Tier 4 — Edge Cases and Ergonomics conformance tests.
 */
import type { StacksBackend } from '../backend.ts';
export declare function tier4EdgeCases(backendFactory: () => StacksBackend): void;
//# sourceMappingURL=tier4-edge-cases.d.ts.map
=== packages/plugins/stacks/dist/field-utils.d.ts ===
/**
 * Shared field access and order-by utilities.
 *
 * Used by both the apparatus-level logic (stacks-core.ts) and the
 * memory backend (memory-backend.ts). Kept in a minimal module with
 * no heavy dependencies.
 */
import type { BookEntry, OrderBy } from './types.ts';
/**
 * Access a potentially nested field via dot-notation (e.g. "parent.id").
 */
export declare function getNestedField(obj: BookEntry | Record<string, unknown>, field: string): unknown;
/**
 * Normalize the public OrderBy type into a uniform array of { field, dir }.
 *
 * Does NOT validate field names — callers are responsible for ensuring
 * fields have already been validated (e.g. via translateQuery) before
 * reaching this point. translateQuery calls validateFieldName after
 * normalizing because it sits at the untrusted-input boundary.
 */
export declare function normalizeOrderBy(orderBy: OrderBy): Array<{
    field: string;
    dir: 'asc' | 'desc';
}>;
/**
 * Compare two entries by a list of order-by entries.
 *
 * Shared by the memory backend's sortEntries and the apparatus-level
 * OR query re-sort in stacks-core.ts. Null values sort before non-null
 * in ascending order, after non-null in descending order.
 */
export declare function compareByOrderEntries(a: BookEntry | Record<string, unknown>, b: BookEntry | Record<string, unknown>, orderEntries: Array<{
    field: string;
    dir: 'asc' | 'desc';
}>): number;
//# sourceMappingURL=field-utils.d.ts.map
=== packages/plugins/stacks/dist/index.d.ts ===
/**
 * @shardworks/stacks-apparatus — The Stacks apparatus.
 *
 * Guild persistence layer: NoSQL document store with CDC, transactions,
 * and swappable backend. Default export is the apparatus plugin.
 *
 * See: docs/specification.md
 */
export type { StacksConfig, BookEntry, BookSchema, Book, ReadOnlyBook, Scalar, WhereCondition, WhereClause, OrderEntry, OrderBy, Pagination, BookQuery, ListOptions, ChangeEvent, CreateEvent, UpdateEvent, DeleteEvent, ChangeHandler, WatchOptions, StacksApi, TransactionContext, } from './types.ts';
export type { StacksBackend, BackendTransaction, BackendOptions, BookRef, InternalQuery, InternalCondition, CountQuery, PutResult, PatchResult, DeleteResult, } from './backend.ts';
export { createStacksApparatus } from './stacks.ts';
declare const _default: import("@shardworks/nexus-core").Plugin;
export default _default;
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/stacks/dist/memory-backend.d.ts ===
/**
 * In-memory StacksBackend for tests.
 *
 * Exported via `@shardworks/stacks-apparatus/testing`. No SQLite dependency.
 * Implements the same contract as the SQLite backend.
 */
import type { BackendOptions, BackendTransaction, BookRef, StacksBackend } from './backend.ts';
import type { BookSchema } from './types.ts';
export declare class MemoryBackend implements StacksBackend {
    private store;
    open(_options: BackendOptions): void;
    close(): void;
    ensureBook(ref: BookRef, _schema: BookSchema): void;
    beginTransaction(): BackendTransaction;
}
//# sourceMappingURL=memory-backend.d.ts.map
=== packages/plugins/stacks/dist/query.d.ts ===
/**
 * Query translation — public WhereClause tuples → InternalQuery.
 *
 * Validates field names against a safe allowlist, then maps the
 * user-facing operator strings to the backend's internal enum.
 */
import type { BookQuery, WhereClause } from './types.ts';
import type { InternalCondition, InternalQuery } from './backend.ts';
export declare function validateFieldName(field: string): string;
export declare function translateQuery(query: BookQuery): InternalQuery;
/**
 * Translate a WhereClause into conditions only (no pagination fields).
 * OR clauses are handled at the apparatus level — this only handles AND.
 */
export declare function translateWhereClause(where?: WhereClause | {
    or: WhereClause[];
}): {
    where?: InternalCondition[];
};
//# sourceMappingURL=query.d.ts.map
=== packages/plugins/stacks/dist/sqlite-backend.d.ts ===
/**
 * SQLite backend for The Stacks — backed by better-sqlite3.
 *
 * Implements the StacksBackend interface. All SQLite-specific details
 * (json_extract, table naming, WAL mode) are encapsulated here.
 *
 * Documents are stored as JSON blobs in a `content` TEXT column.
 * Field queries use json_extract() against declared indexes.
 */
import type { BackendOptions, BackendTransaction, BookRef, StacksBackend } from './backend.ts';
import type { BookSchema } from './types.ts';
export declare function tableName(ref: BookRef): string;
export declare class SqliteBackend implements StacksBackend {
    private db;
    open(options: BackendOptions): void;
    close(): void;
    ensureBook(ref: BookRef, schema: BookSchema): void;
    beginTransaction(): BackendTransaction;
    private requireDb;
}
//# sourceMappingURL=sqlite-backend.d.ts.map
=== packages/plugins/stacks/dist/stacks-core.d.ts ===
/**
 * Stacks core — shared implementation logic for both the production
 * apparatus (stacks.ts) and the testable harness (testable-stacks.ts).
 *
 * This module contains ALL read/write/transaction/CDC logic. The two
 * consumer modules only add their own wiring: the apparatus adds guild()
 * startup and plugin schema reconciliation; the testable harness adds
 * nothing (just exposes createApi() directly).
 *
 * This ensures behavioral identity by construction, not by copy-paste.
 */
import type { BookRef, StacksBackend } from './backend.ts';
import type { BookEntry, BookQuery, StacksApi, TransactionContext, WhereClause } from './types.ts';
export declare class StacksCore {
    readonly backend: StacksBackend;
    private readonly cdc;
    private activeTx;
    constructor(backend: StacksBackend);
    createApi(): StacksApi;
    runTransaction<R>(fn: (tx: TransactionContext) => Promise<R>): Promise<R>;
    private createTransactionContext;
    doPut(ref: BookRef, entry: BookEntry): Promise<void>;
    private doPutInTx;
    doPatch(ref: BookRef, id: string, fields: Record<string, unknown>): Promise<BookEntry>;
    private doPatchInTx;
    doDelete(ref: BookRef, id: string): Promise<void>;
    private doDeleteInTx;
    doGet(ref: BookRef, id: string): BookEntry | null;
    doFind(ref: BookRef, query: BookQuery): Promise<BookEntry[]>;
    /**
     * OR queries: run each branch as a separate backend query, deduplicate
     * by id, re-sort, and paginate the merged result set.
     *
     * V1 trade-off: when called outside an active transaction, each branch
     * opens its own throwaway read transaction. For synchronous backends
     * like better-sqlite3, the data can't change between branches so this
     * is safe. A hypothetical async backend could see different snapshots
     * per branch, producing inconsistent results — a known limitation
     * documented in the spec's implementation notes.
     *
     * Performance note: each branch is a separate backend query. count()
     * with OR cannot use the backend's efficient count path since
     * deduplication requires knowing which IDs overlap. Acceptable for v1.
     */
    private doFindOr;
    doCount(ref: BookRef, where?: WhereClause | {
        or: WhereClause[];
    }): Promise<number>;
    private requireTx;
}
//# sourceMappingURL=stacks-core.d.ts.map
=== packages/plugins/stacks/dist/stacks.d.ts ===
/**
 * The Stacks — apparatus implementation.
 *
 * Wires together the backend, CDC registry, and transaction model
 * to provide the StacksApi `provides` object. All core read/write/
 * transaction logic lives in stacks-core.ts.
 *
 * See: docs/specification.md
 */
import type { Plugin } from '@shardworks/nexus-core';
import type { StacksBackend } from './backend.ts';
export declare function createStacksApparatus(backend?: StacksBackend): Plugin;
//# sourceMappingURL=stacks.d.ts.map
=== packages/plugins/stacks/dist/types.d.ts ===
/**
 * The Stacks — public API types.
 *
 * These types form the contract between The Stacks apparatus and all
 * consuming plugins. No SQLite types, no implementation details.
 *
 * See: docs/specification.md
 */
/** Plugin configuration stored at guild.json["stacks"]. */
export interface StacksConfig {
    /**
     * Automatically apply pending database migrations when the Books are opened.
     * Defaults to `true` when not specified.
     */
    autoMigrate?: boolean;
}
declare module '@shardworks/nexus-core' {
    interface GuildConfig {
        stacks?: StacksConfig;
    }
}
/** Every document stored in a book must satisfy this constraint. */
export type BookEntry = {
    id: string;
} & Record<string, unknown>;
/**
 * Schema declaration for a single book in a kit's `books` contribution.
 *
 * `indexes` is a list of fields to create efficient query indexes for.
 * Field names use plain notation ('status') or dot-notation for nested
 * fields ('parent.id'). The Stacks translates internally.
 */
export interface BookSchema {
    indexes?: (string | string[])[];
}
export type Scalar = string | number | boolean | null;
export type WhereCondition = [field: string, op: '=' | '!=', value: Scalar] | [field: string, op: '>' | '>=' | '<' | '<=', value: number | string] | [field: string, op: 'LIKE', value: string] | [field: string, op: 'IN', value: Scalar[]] | [field: string, op: 'IS NULL' | 'IS NOT NULL'];
export type WhereClause = WhereCondition[];
export type OrderEntry = [field: string, direction: 'asc' | 'desc'];
export type OrderBy = OrderEntry | OrderEntry[];
export type Pagination = {
    limit: number;
    offset?: number;
} | {
    limit?: never;
    offset?: never;
};
export type BookQuery = {
    where?: WhereClause | {
        or: WhereClause[];
    };
    orderBy?: OrderBy;
} & Pagination;
export type ListOptions = {
    orderBy?: OrderBy;
} & Pagination;
/** Read-only view of a book — returned by `readBook()` for cross-plugin access. */
export interface ReadOnlyBook<T extends BookEntry> {
    get(id: string): Promise<T | null>;
    find(query: BookQuery): Promise<T[]>;
    list(options?: ListOptions): Promise<T[]>;
    count(where?: WhereClause | {
        or: WhereClause[];
    }): Promise<number>;
}
/** Writable book handle — returned by `book()` for own-plugin access. */
export interface Book<T extends BookEntry> extends ReadOnlyBook<T> {
    /**
     * Upsert a document. Creates if `entry.id` is new; replaces entirely
     * if it already exists. Fires a `create` or `update` CDC event.
     */
    put(entry: T): Promise<void>;
    /**
     * Partially update a document. Merges top-level fields into the existing
     * document. Throws if the document does not exist. Returns the updated
     * document. Fires an `update` CDC event.
     */
    patch(id: string, fields: Partial<Omit<T, 'id'>>): Promise<T>;
    /**
     * Delete a document by id. Silent no-op if it does not exist.
     * Fires a `delete` CDC event only if the document existed.
     */
    delete(id: string): Promise<void>;
}
export interface CreateEvent<T extends BookEntry> {
    type: 'create';
    ownerId: string;
    book: string;
    entry: T;
}
export interface UpdateEvent<T extends BookEntry> {
    type: 'update';
    ownerId: string;
    book: string;
    entry: T;
    prev: T;
}
export interface DeleteEvent<T extends BookEntry> {
    type: 'delete';
    ownerId: string;
    book: string;
    id: string;
    prev: T;
}
export type ChangeEvent<T extends BookEntry> = CreateEvent<T> | UpdateEvent<T> | DeleteEvent<T>;
export type ChangeHandler<T extends BookEntry = BookEntry> = (event: ChangeEvent<T>) => Promise<void> | void;
export interface WatchOptions {
    /**
     * Controls when the handler runs relative to the transaction commit.
     *
     * true  (default) — Phase 1: runs INSIDE the transaction. Handler writes
     *   join the same transaction. If the handler throws, everything rolls back.
     *
     * false — Phase 2: runs AFTER the transaction commits. Errors are logged
     *   as warnings but do not affect committed data.
     *
     * @default true
     */
    failOnError?: boolean;
}
export interface TransactionContext {
    book<T extends BookEntry>(ownerId: string, name: string): Book<T>;
    readBook<T extends BookEntry>(ownerId: string, name: string): ReadOnlyBook<T>;
}
export interface StacksApi {
    book<T extends BookEntry>(ownerId: string, name: string): Book<T>;
    readBook<T extends BookEntry>(ownerId: string, name: string): ReadOnlyBook<T>;
    watch<T extends BookEntry>(ownerId: string, bookName: string, handler: ChangeHandler<T>, options?: WatchOptions): void;
    transaction<R>(fn: (tx: TransactionContext) => Promise<R>): Promise<R>;
}
//# sourceMappingURL=types.d.ts.map
=== packages/plugins/tools/dist/index.d.ts ===
/**
 * @shardworks/tools-apparatus — The Instrumentarium.
 *
 * Guild tool registry: scans kit contributions, resolves permission-gated
 * tool sets, and provides the InstrumentariumApi for tool lookup and resolution.
 *
 * The tool() factory and ToolDefinition type live here canonically.
 *
 * See: docs/specification.md (instrumentarium)
 */
export { type ToolCaller, type ToolDefinition, tool, isToolDefinition, } from './tool.ts';
export { type InstrumentariumApi, type ResolvedTool, type ResolveOptions, } from './instrumentarium.ts';
declare const _default: import("@shardworks/nexus-core").Plugin;
export default _default;
//# sourceMappingURL=index.d.ts.map
=== packages/plugins/tools/dist/instrumentarium.d.ts ===
/**
 * The Instrumentarium — guild tool registry apparatus.
 *
 * Scans installed tools from kit contributions and apparatus supportKits,
 * resolves permission-gated tool sets on demand, and serves as the single
 * source of truth for "what tools exist and who can use them."
 *
 * The Instrumentarium is role-agnostic — it receives an already-resolved
 * permissions array from the Loom and returns the matching tool set.
 * Role definitions and permission grants are owned by the Loom.
 */
import type { Plugin } from '@shardworks/nexus-core';
import type { ToolDefinition, ToolCaller } from './tool.ts';
/** A resolved tool with provenance metadata. */
export interface ResolvedTool {
    /** The tool definition (name, description, params schema, handler). */
    definition: ToolDefinition;
    /** Plugin id of the kit or apparatus that contributed this tool. */
    pluginId: string;
}
/** Options for resolving a permission-gated tool set. */
export interface ResolveOptions {
    /**
     * Permission grants in `plugin:level` format.
     * Supports wildcards: `plugin:*`, `*:level`, `*:*`.
     */
    permissions: string[];
    /**
     * When true, permissionless tools are excluded unless the role grants
     * `plugin:*` or `*:*` for the tool's plugin. When false (default),
     * permissionless tools are included unconditionally.
     */
    strict?: boolean;
    /** Filter by invocation caller. Tools with no callableBy pass all callers. */
    caller?: ToolCaller;
}
/** The Instrumentarium's public API, exposed via `provides`. */
export interface InstrumentariumApi {
    /**
     * Resolve the tool set for a given set of permissions.
     *
     * Evaluates each registered tool against the permission grants:
     * - Tools with a `permission` field: included if any grant matches
     * - Permissionless tools: always included (default) or gated by `strict`
     * - Caller filtering applied last
     */
    resolve(options: ResolveOptions): ResolvedTool[];
    /**
     * Find a single tool by name. Returns null if not installed.
     */
    find(name: string): ResolvedTool | null;
    /**
     * List all installed tools, regardless of permissions.
     */
    list(): ResolvedTool[];
}
/**
 * Create the Instrumentarium apparatus plugin.
 *
 * Returns a Plugin with:
 * - `consumes: ['tools']` — scans kit/supportKit contributions
 * - `provides: InstrumentariumApi` — the tool registry API
 */
export declare function createInstrumentarium(): Plugin;
//# sourceMappingURL=instrumentarium.d.ts.map
=== packages/plugins/tools/dist/tool.d.ts ===
/**
 * Tool SDK — the primary authoring interface for module-based tools.
 *
 * Use `tool()` to define a typed tool with Zod parameter schemas.
 * The returned definition is what the MCP engine imports and registers as a tool,
 * what the CLI uses to auto-generate subcommands, and what engines import directly.
 *
 * A package can export a single tool or an array of tools:
 *
 * @example Single tool
 * ```typescript
 * import { tool } from '@shardworks/tools-apparatus';
 * import { z } from 'zod';
 *
 * export default tool({
 *   name: 'lookup',
 *   description: 'Look up an anima by name',
 *   instructionsFile: './instructions.md',
 *   params: {
 *     name: z.string().describe('Anima name'),
 *   },
 *   handler: async ({ name }) => {
 *     const { home } = guild();
 *     return { found: true, status: 'active' };
 *   },
 * });
 * ```
 *
 * @example Tool collection
 * ```typescript
 * export default [
 *   tool({ name: 'commission', description: '...', params: {...}, handler: ... }),
 *   tool({ name: 'signal', description: '...', params: {...}, handler: ... }),
 * ];
 * ```
 */
import { z } from 'zod';
type ZodShape = Record<string, z.ZodType>;
/**
 * The caller types a tool can be invoked by.
 * - `'cli'` — accessible via `nsg` commands (human-facing)
 * - `'anima'` — accessible via MCP server (anima-facing, in sessions)
 * - `'library'` — accessible programmatically via direct import
 *
 * Defaults to all caller types if `callableBy` is unspecified.
 */
export type ToolCaller = 'cli' | 'anima' | 'library';
/**
 * A fully-defined tool — the return type of `tool()`.
 *
 * The MCP engine uses `.params.shape` to register the tool's input schema,
 * `.description` for the tool description, and `.handler` to execute calls.
 * The CLI uses `.params` to auto-generate Commander options.
 * Engines call `.handler` directly.
 */
export interface ToolDefinition<TShape extends ZodShape = ZodShape> {
    /** Tool name — used for resolution when a package exports multiple tools. */
    readonly name: string;
    readonly description: string;
    /** Per-tool instructions injected into the anima's session context (inline text). */
    readonly instructions?: string;
    /**
     * Path to an instructions file, relative to the package root.
     * Resolved by the manifest engine at session time.
     * Mutually exclusive with `instructions`.
     */
    readonly instructionsFile?: string;
    /**
     * Caller types this tool is available to.
     * Always a normalized array. Absent means available to all callers.
     */
    readonly callableBy?: ToolCaller[];
    /**
     * Permission level required to invoke this tool. Matched against role grants.
     *
     * Format: a freeform string chosen by the tool author. Conventional names:
     * - `'read'` — query/inspect operations
     * - `'write'` — create/update operations
     * - `'delete'` — destructive operations
     * - `'admin'` — configuration and lifecycle operations
     *
     * Plugins are free to define their own levels.
     * If omitted, the tool is permissionless — included by default in non-strict
     * mode, excluded in strict mode unless the role grants `plugin:*` or `*:*`.
     */
    readonly permission?: string;
    readonly params: z.ZodObject<TShape>;
    readonly handler: (params: z.infer<z.ZodObject<TShape>>) => unknown | Promise<unknown>;
}
/** Input to `tool()` — instructions are either inline text or a file path, not both. */
type ToolInput<TShape extends ZodShape> = {
    name: string;
    description: string;
    params: TShape;
    handler: (params: z.infer<z.ZodObject<TShape>>) => unknown | Promise<unknown>;
    /**
     * Caller types this tool is available to.
     * Accepts a single caller or an array. Normalized to an array in the returned definition.
     */
    callableBy?: ToolCaller | ToolCaller[];
    /**
     * Permission level required to invoke this tool.
     * See ToolDefinition.permission for details.
     */
    permission?: string;
} & ({
    instructions?: string;
    instructionsFile?: never;
} | {
    instructions?: never;
    instructionsFile?: string;
});
/**
 * Define a Nexus tool.
 *
 * This is the primary SDK entry point for module-based tools. Pass a
 * name, description, a params object of Zod schemas, and a handler function.
 * The framework handles the rest — MCP registration, CLI generation, validation.
 *
 * The handler receives one argument:
 * - `params` — the validated input, typed from your Zod schemas
 *
 * To access guild infrastructure (apparatus, config, home path), import
 * `guild` from `@shardworks/nexus-core` and call `guild()` inside the handler.
 *
 * Return any JSON-serializable value. The MCP engine wraps it as tool output;
 * the CLI prints it; engines use it directly.
 *
 * Instructions can be provided inline or as a file path:
 * - `instructions: 'Use this tool when...'` — inline text
 * - `instructionsFile: './instructions.md'` — resolved at manifest time
 */
export declare function tool<TShape extends ZodShape>(def: ToolInput<TShape>): ToolDefinition<TShape>;
/** Type guard: is this value a ToolDefinition? */
export declare function isToolDefinition(obj: unknown): obj is ToolDefinition;
export {};
//# sourceMappingURL=tool.d.ts.map
=== packages/plugins/tools/dist/tools/tools-list.d.ts ===
/**
 * tools-list — administrative view of all tools installed in the guild.
 *
 * Lists the full registry with optional filters for caller type, permission
 * level, and contributing plugin. This is an inventory tool, not a
 * permission-resolved view — use MCP native tool listing for that.
 *
 * Requires `tools:read` permission.
 */
import { z } from 'zod';
import type { InstrumentariumApi } from '../instrumentarium.ts';
/** Summary returned for each tool in the list. */
export interface ToolSummary {
    name: string;
    description: string;
    pluginId: string;
    permission: string | null;
    callableBy: string[] | null;
}
export declare function createToolsList(getApi: () => InstrumentariumApi): import("../tool.ts").ToolDefinition<{
    caller: z.ZodOptional<z.ZodEnum<{
        cli: "cli";
        anima: "anima";
        library: "library";
    }>>;
    permission: z.ZodOptional<z.ZodString>;
    plugin: z.ZodOptional<z.ZodString>;
}>;
//# sourceMappingURL=tools-list.d.ts.map
=== packages/plugins/tools/dist/tools/tools-show.d.ts ===
/**
 * tools-show — show full details for a single tool.
 *
 * Returns name, description, plugin, permission, callableBy, parameter
 * schema, and instructions for the named tool. Returns null if not found.
 *
 * Requires `tools:read` permission.
 */
import { z } from 'zod';
import type { InstrumentariumApi } from '../instrumentarium.ts';
/** Parameter info derived from the Zod schema. */
export interface ParamInfo {
    type: string;
    description: string | null;
    optional: boolean;
}
/** Full detail returned for a single tool. */
export interface ToolDetail {
    name: string;
    description: string;
    pluginId: string;
    permission: string | null;
    callableBy: string[] | null;
    params: Record<string, ParamInfo>;
    instructions: string | null;
}
export declare function createToolsShow(getApi: () => InstrumentariumApi): import("../tool.ts").ToolDefinition<{
    name: z.ZodString;
}>;
//# sourceMappingURL=tools-show.d.ts.map

