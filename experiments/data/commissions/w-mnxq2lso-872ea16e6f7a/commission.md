# Normalize tool permission strings to bare-level form

## Background

The Instrumentarium's role→tools resolver (`packages/plugins/tools/src/instrumentarium.ts`) uses a `matchesPermission(pluginId, permission, grants)` function where each grant is parsed from `"plugin:level"` into `{plugin, level}` and then compared against the tool's declared `permission` string.

Two incompatible conventions currently exist across plugin-contributed tools:

**Bare-level form** — the documented convention, per `packages/plugins/tools/src/tool.ts:78-90`:

> Format: a freeform string chosen by the tool author. Conventional names: `'read'`, `'write'`, `'delete'`, `'admin'`.

Plugins following this convention:

- `animator` — `read`, `write`, `animate`
- `codexes` — `read`, `write`, `delete`
- `parlour` — `read`, `write`
- `tools` — `read`

**Plugin-qualified form** — non-conforming, redundantly re-embeds the plugin id in the permission string:

- `clerk` — `clerk:read`, `clerk:write`
- `astrolabe` — `astrolabe:read`, `astrolabe:write`
- `spider` — `spider:read`, `spider:write`

## The bug

`matchesPermission` compares `grant.level === permission`. For a tool registered with `permission: 'astrolabe:read'` and a role granted `astrolabe:read`, the comparison becomes `'read' === 'astrolabe:read'` → false. The tool is excluded. The plugin-wildcard, level-wildcard, and superuser branches never catch it either unless the grant already uses `*`.

This has been latent because every live role in the system grants wildcards (`steward: *:*`, `artificer: tools:*`) — the wildcard branches short-circuit on `grant.level === '*'` without ever touching the tool's permission string. The **one** role that uses non-wildcard plugin-qualified grants — the kit-registered `astrolabe.sage` with `['astrolabe:read', 'astrolabe:write', 'clerk:read']` and `strict: true` — resolves to the empty tool set, and has been doing so since astrolabe shipped.

## Evidence

Across 51 recent astrolabe anima sessions recorded in `books_animator_transcripts` (22 reader / 17 analyst / 12 spec-writer), the count of `mcp__nexus-guild__*` tool calls is **zero**. The animas themselves explicitly acknowledge the missing tools in their output text; a sample:

- reader `ses-mnrvffmz-bc827921`: "the guild tools aren't available as standard deferred tools"
- reader `ses-mnrx07ny-69dca6c9`: "Since the `inventory-write` tool isn't available as an MCP tool in this environment, I'll write directly to the database."
- analyst `ses-mnrvsmsd-2ef5ea6a`: "The guild tools aren't available as deferred tools — they're runtime tools injected during anima sessions."
- spec-writer `ses-mnrzcjab-bbe7f7b7`: "Database workaround: Astrolabe MCP tools unavailable; all plan reads/writes done via direct SQLite access using better-sqlite3"

Several sage sessions routed around the missing tools by opening `better-sqlite3` from `node_modules` and writing directly to the guild database. The pipeline has been silently degraded but not visibly failing.

## Required changes

### Normalize plugin-qualified permissions to bare-level form

Update the `permission` field on every tool currently using the `plugin:level` form:

**clerk** (`packages/plugins/clerk/src/tools/`):
- `commission-post`, `writ-cancel`, `writ-complete`, `writ-edit`, `writ-fail`, `writ-link`, `writ-publish`, `writ-unlink` — `clerk:write` → `write`
- `writ-list`, `writ-show`, `writ-types` — `clerk:read` → `read`

**astrolabe** (`packages/plugins/astrolabe/src/astrolabe.ts`):
- `decisions-write`, `inventory-write`, `observations-write`, `scope-write`, `spec-write` — `astrolabe:write` → `write`
- `plan-list`, `plan-show` — `astrolabe:read` → `read`

**spider** (`packages/plugins/spider/src/tools/`):
- `crawl-continual`, `crawl-one`, `input-request-answer`, `input-request-complete`, `input-request-import`, `input-request-reject`, `rig-cancel`, `rig-resume` — `spider:write` → `write`
- (spider read tools already use bare `read`; verify during the sweep)

### Update the `astrolabe.sage` role's permission grants

`packages/plugins/astrolabe/src/astrolabe.ts` (around line 353) currently grants:

```ts
permissions: ['astrolabe:read', 'astrolabe:write', 'clerk:read'],
```

Those grant strings are correct per the parser (`plugin:level`), and should stay in that form — the fix is strictly on the tool-definition side. **Do not** change the role's permissions array. Verify post-fix that `sage` resolves to the full set of astrolabe tools plus clerk's read-side tools (`writ-list`, `writ-show`, `writ-types`).

### Add a registration-time guard in the Instrumentarium

In `packages/plugins/tools/src/instrumentarium.ts`, inside `ToolRegistry.registerTool` (and/or `registerToolsFromKit`), warn or throw if a tool's `permission` string contains a colon. This prevents this class of drift from re-emerging:

```ts
if (definition.permission && definition.permission.includes(':')) {
  throw new Error(
    `Tool "${definition.name}" (plugin "${pluginId}") declares permission "${definition.permission}" ` +
    `which contains a colon. Permission strings are bare levels (e.g. "read", "write"); ` +
    `the plugin id is attached automatically. See packages/plugins/tools/src/tool.ts docstring.`
  );
}
```

Throw is preferred over warn — this is a correctness bug that should not ship.

### Tests

Add a focused test in `packages/plugins/tools/src/instrumentarium.test.ts` that:

1. Registers a tool with `permission: 'read'` under a synthetic plugin id.
2. Calls `resolve({ permissions: ['<pluginId>:read'], strict: true, caller: 'anima' })`.
3. Asserts the tool is present in the resolved set.

Add a second test that asserts `registerTool` throws when given a tool whose permission contains a colon.

Add a third test that **codifies the bare-level convention** by asserting the failure mode when someone uses the wrong form. This test must remain in the suite as a living specification of the convention:

1. Register a tool with `permission: 'myplugin:read'` under a synthetic plugin id `myplugin` (do this via a direct-registry path that bypasses the new guard, e.g. a test-only helper — or structure the assertion to verify the guard catches it). If the guard throws, the test captures the thrown message and asserts it references the bare-level convention.
2. Alternatively, or additionally: register such a tool via the guard-bypassing path, then call `resolve({ permissions: ['myplugin:read'], strict: false, caller: 'anima' })`, and assert the tool does **not** appear in the resolved set. This proves the matcher only recognizes the bare-level form and documents why the convention matters.

The goal is that a future contributor who forgets the convention and writes `permission: 'foo:read'` will have both the registration guard *and* an explicit test pointing them at the documented form.

Add a test in `packages/plugins/astrolabe/src/supportkit.test.ts` (or a new integration test) that:

1. Simulates `loom.weave({ role: 'astrolabe.sage' })` against a guild with astrolabe + clerk installed.
2. Asserts the returned `tools` array contains `plan-show`, `plan-list`, `inventory-write`, `scope-write`, `decisions-write`, `observations-write`, `spec-write`, `writ-show`, `writ-list`, `writ-types`.

## Out of scope

- **Do not** change the permission convention away from bare-level — keep the `tool.ts` docstring as the source of truth.
- **Do not** rework `matchesPermission` to "also accept" the qualified form. That codifies the inconsistency rather than resolving it, and masks future drift.
- **Do not** touch `animator`, `codexes`, `parlour`, or `tools` plugin tool definitions — they already follow the correct convention.
- **Do not** change how grant strings are spelled (`plugin:level` in role configs stays as-is).
- **Do not** touch the `sage.md` prose in `packages/plugins/astrolabe/` — once the tools resolve, the anima will find them.
- The separate observation that `oculus:oculus` tool has `callableBy: ['patron']` is correct and unrelated; leave it alone.

## Validation

- `pnpm -r test` passes, including new tests above.
- `pnpm -r build` passes.
- After installing the rebuilt plugins into a guild, a fresh astrolabe planning run (brief → reader → analyst → writer) produces `mcp__nexus-guild__plan-show`, `mcp__nexus-guild__inventory-write`, etc. in the session transcripts, and no "tools aren't available" fallback language.