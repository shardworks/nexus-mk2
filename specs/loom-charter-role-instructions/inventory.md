# Inventory: loom-charter-role-instructions

Brief: Implement loom features to weave charter and role instructions into the system prompt.

---

## Affected Code

### Primary file: `/workspace/nexus/packages/plugins/loom/src/loom.ts`

Current `weave()` implementation (lines 101–135) returns `AnimaWeave` with `systemPrompt` always `undefined`. The comment at line 132 says:

```
// Future: compose system prompt from charter + curriculum +
// temperament + role instructions + tool instructions.
```

**Current signatures:**

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

The `createLoom()` factory:
- `start()` reads config: `config = g.guildConfig().loom ?? {};`
- Has access to `guild()` which provides `home` (guild root path) — needed for file reads.
- Currently `requires: ['tools']`.

**Key change points in `weave()`:**
1. Read charter file from guild home (e.g. `path.join(guild().home, 'charter.md')`)
2. Read role instructions file from a path in `RoleDefinition` (needs new field)
3. Compose `systemPrompt` from charter + role instructions sections
4. Return the composed string on `AnimaWeave.systemPrompt`

### Config type: `RoleDefinition`

Currently has `permissions` and `strict`. Needs an `instructions` field — a path relative to guild root pointing to a markdown file with role-specific instructions. Precedent from the legacy system (kit-components doc):

```json
{
  "steward": {
    "instructions": "roles/steward.md"
  }
}
```

### `LoomConfig`

May need a top-level `charter` field (e.g. a path string) or convention-based file path. The loom doc spec says "Guild charter — institutional policy, applies to all animas" as composition layer 1.

### Index file: `/workspace/nexus/packages/plugins/loom/src/index.ts`

Exports types from `loom.ts`. Also augments `GuildConfig` with `loom?: LoomConfig`. No change expected unless new types need exporting.

### Test file: `/workspace/nexus/packages/plugins/loom/src/loom.test.ts`

Uses `node:test` (describe/it), `node:assert/strict`, and Zod. Test patterns:
- `setupGuild()` helper creates a fake guild via `setGuild()` with configurable `loomConfig` and `apparatuses`
- `startLoom()` helper creates and starts a Loom instance, returns the API
- `mockInstrumentarium()` helper mocks the tools apparatus
- Tests check `weave()` return values for various config scenarios
- `afterEach(() => clearGuild())` cleanup
- No file system mocking currently — the loom does no file I/O today

**New tests needed:**
- Charter file read: when charter.md exists, systemPrompt includes its content
- Charter file missing: graceful behavior (undefined or empty systemPrompt)
- Role instructions file read: when instructions path configured and file exists
- Role instructions file missing: graceful behavior
- Combined: charter + role instructions compose in correct order
- No role provided: no role instructions, possibly still charter

**File I/O mocking consideration:** The current test setup uses `setGuild()` with fake home paths. For charter/role instruction reads, tests will need to either:
- Mock `fs.readFileSync` / `fs.readFile`
- Use temp directories with real files
- Inject a file reader for testability

### Downstream consumer: `/workspace/nexus/packages/plugins/animator/src/animator.ts`

The Animator's `summon()` (line 263) calls `loom.weave({ role: request.role })` and gets back `context`. The `buildProviderConfig()` function (line 66) maps `request.context.systemPrompt` to `SessionProviderConfig.systemPrompt`. **No changes needed** — the Animator already passes `systemPrompt` through; it just hasn't had a value to pass.

### Downstream consumer: `/workspace/nexus/packages/plugins/claude-code/src/index.ts`

Lines 61-65: if `config.systemPrompt` is defined, writes it to a temp file and adds `--system-prompt-file` flag. **No changes needed** — already handles non-undefined `systemPrompt`.

### Downstream consumer: `/workspace/nexus/packages/plugins/parlour/src/parlour.ts`

Line 333: `const context = await loom.weave({ role: undefined });` — Parlour currently weaves with no role. With charter support, it will start getting a systemPrompt (charter only, no role instructions). This is correct behavior — parlour sessions are interactive and should still receive the charter.

### Downstream consumer: `/workspace/nexus/packages/plugins/dispatch/src/dispatch.ts`

Lines 98-106: calls `animator.summon({ role, ... })`. Dispatch doesn't call loom directly — it goes through the Animator. **No changes needed.**

### Package.json: `/workspace/nexus/packages/plugins/loom/package.json`

No dependency changes expected — `fs` and `path` are Node.js builtins. Zod is already a dependency but unused in the main module (used in tests only, appears to be inherited).

---

## Adjacent Patterns

### Pattern 1: Instrumentarium's instructionsFile pre-loading

`/workspace/nexus/packages/plugins/tools/src/instrumentarium.ts` lines 196-218:

The Instrumentarium's `preloadInstructions()` reads tool instruction files at startup:
```typescript
private preloadInstructions(tool: ToolDefinition, packageName: string): ToolDefinition {
  if (!tool.instructionsFile) return tool;
  const packageDir = path.join(this.guildHome, 'node_modules', packageName);
  const filePath = path.join(packageDir, tool.instructionsFile);
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const { instructionsFile: _, ...rest } = tool;
    return { ...rest, instructions: content } as ToolDefinition;
  } catch {
    console.warn(`[instrumentarium] Could not read instructions file...`);
    const { instructionsFile: _, ...rest } = tool;
    return rest as ToolDefinition;
  }
}
```

**Key observations:**
- Uses `fs.readFileSync` (synchronous)
- Reads at startup, not at resolve time
- Gracefully handles missing files (warn + continue)
- Resolves paths relative to `guildHome`

This is the closest precedent for the Loom reading charter/role files. Same guild home, same file-read pattern.

### Pattern 2: Legacy role instructions (kit-components.md)

The legacy system (pre-Loom) had `instructions` on role definitions in guild.json:
```json
{
  "roles": {
    "steward": { "instructions": "roles/steward.md" },
    "artificer": { "instructions": "roles/artificer.md" }
  }
}
```

And a `readRoleInstructions(home, config, animaRoles)` function (documented in core-api.md) that read these files. This has been replaced by the Loom's plugin-based role system, but the convention (relative path in config, file in guild root) is preserved.

### Pattern 3: Guild directory convention

The live guild at `/workspace/vibers/` has:
- `guild.json` with `loom.roles` config (steward, artificer, reviewer)
- `roles/` directory (exists, currently empty with `.gitkeep`)
- No `charter.md` file yet

The architecture index doc (line 95) says: `<guild content>/ ← versioned guild files (roles/, training/, tools/, engines/, etc.) — structure is guild-specific, not framework-prescribed`

The guild metaphor doc describes the charter as hanging "on the wall" of the guildhall, suggesting it lives at the guild root level.

---

## Full Pipeline: Charter + Role Instructions → System Prompt

```
guild.json["loom"]["roles"][role].instructions → path → fs.readFileSync → role instructions text
guild root / charter.md (or configured path)   → fs.readFileSync → charter text

Loom.weave({ role }) →
  1. Read charter file → charter text (or empty)
  2. Read role instructions file → role text (or empty)
  3. Compose: [charter]\n\n[role instructions] → systemPrompt
  4. Resolve tools (existing logic)
  5. Derive git identity (existing logic)
  → AnimaWeave { systemPrompt, tools, environment }

Animator.summon({ role, prompt, cwd }) →
  calls loom.weave({ role })
  builds SessionProviderConfig { systemPrompt, initialPrompt, model, tools, ... }
  passes to provider.launch()

claude-code provider →
  writes systemPrompt to temp file
  passes --system-prompt-file to claude CLI
```

---

## Existing Context

### Known gaps (sanctum)

`/workspace/nexus-mk2/docs/future/known-gaps.md` has two directly relevant entries:

1. **"Role instructions are not upgradeable"** — role instruction files are scaffolded once by `nsg init` and never updated. Notes they should become a versioned artifact category. Not blocking for this work but contextually relevant.

2. **"Animas don't know to commit their work"** — explicitly calls out that the Loom's role instruction system is not yet implemented. States: "When the Loom gains role instruction support, the artificer role instructions should include git workflow guidance." This is the motivating use case.

### Architecture doc: composition order

`/workspace/nexus/docs/architecture/apparatus/loom.md` lines 121-128 define future composition order:
1. Guild charter
2. Curriculum
3. Temperament
4. Role instructions
5. Tool instructions
6. Writ context

This commission covers layers 1 and 4. Layers 2, 3, 5, 6 are future work.

### Architecture doc: session funnel

`/workspace/nexus/docs/architecture/index.md` line 433:
```
│     future: + role instructions + tool instructions
│             + curriculum + temperament + charter
```

### Open question: system prompt appendix

The loom spec (lines 130-141) discusses whether a `systemPromptAppendix` belongs in the Loom or the caller. Not needed for this change but worth noting — the Dispatch currently puts work instructions in the work prompt, not the system prompt.

---

## Doc/Code Discrepancies

1. **Loom spec doc says `requires: []` for MVP** (line 23 of loom.md), but the actual code says `requires: ['tools']`. The doc's MVP section is stale — tool resolution was added after the MVP scope was written.

2. **kit-components.md shows `instructions` on role definitions** in guild.json (line 261), but the current `RoleDefinition` type in `loom.ts` only has `permissions` and `strict`. The kit-components doc describes the legacy role format, not the current Loom plugin format. However, the convention (an `instructions` path field on role config) is the pattern to follow.

3. **README.md for loom** (line 79) shows `AnimaWeave` without the `tools` field — stale, tools were added later.

4. **Architecture index line 438** says "MCP tool server attached (future: when Instrumentarium ships)" — stale, Instrumentarium has shipped and MCP tools are active.

5. **Loom spec shows `WeaveRequest.role` as required** in the future spec (line 98), but optional in the current code. The brief only adds charter + role instructions; role remains optional since charter applies to roleless sessions too.

---

## Files Summary

### Will be modified:
- `/workspace/nexus/packages/plugins/loom/src/loom.ts` — main logic: add file reading, compose systemPrompt
- `/workspace/nexus/packages/plugins/loom/src/loom.test.ts` — new tests for charter/role instruction composition

### May be modified:
- `/workspace/nexus/packages/plugins/loom/src/index.ts` — if new types need exporting
- `/workspace/nexus/packages/plugins/loom/README.md` — update API docs to reflect active systemPrompt
- `/workspace/nexus/docs/architecture/apparatus/loom.md` — update spec to reflect charter/role implementation

### Will NOT be modified (pass-through already works):
- `/workspace/nexus/packages/plugins/animator/src/animator.ts`
- `/workspace/nexus/packages/plugins/animator/src/types.ts`
- `/workspace/nexus/packages/plugins/claude-code/src/index.ts`
- `/workspace/nexus/packages/plugins/dispatch/src/dispatch.ts`
- `/workspace/nexus/packages/plugins/parlour/src/parlour.ts`

### Live guild may need updates (operational, not framework code):
- `/workspace/vibers/guild.json` — add `instructions` paths to role definitions, optionally a charter path
- `/workspace/vibers/roles/` — create actual role instruction markdown files
- `/workspace/vibers/charter.md` — create charter file (or wherever convention places it)
