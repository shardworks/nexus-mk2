# Anima Git Identity

Animas currently commit with the host's global git identity, making it impossible to attribute commits to specific roles or writs. This creates a concrete problem: inscribe's quality scoring uses `git diff BASE..HEAD` on the bare clone, which captures unrelated commits that land in the same window. We need per-writ commit attribution.

## Design

Git identity is modeled as two layers that merge:

1. **Identity layer (Loom)** — static environment variables derived from role configuration. Represents "who you are." Includes git author/committer name and a default email. Composed alongside system prompt, tools, and curriculum as part of the anima's weave.

2. **Task layer (orchestrator)** — dynamic environment variables set per-dispatch. Represents "what you're working on." Overrides the identity layer where keys collide. For commissioned work, Dispatch sets `GIT_AUTHOR_EMAIL` and `GIT_COMMITTER_EMAIL` to `{writId}@nexus.local`.

The Animator merges both layers (task overrides identity) and passes the result to the session provider, which spreads them into the spawned process environment.

### Example

A commissioned artificer session produces:

```
# From Loom (role defaults):
GIT_AUTHOR_NAME=Artificer
GIT_AUTHOR_EMAIL=artificer@nexus.local
GIT_COMMITTER_NAME=Artificer
GIT_COMMITTER_EMAIL=artificer@nexus.local

# From Dispatch (task override):
GIT_AUTHOR_EMAIL=w-mnhl7kt97066dce908b2@nexus.local
GIT_COMMITTER_EMAIL=w-mnhl7kt97066dce908b2@nexus.local

# Merged result on spawned process:
GIT_AUTHOR_NAME=Artificer
GIT_AUTHOR_EMAIL=w-mnhl7kt97066dce908b2@nexus.local
GIT_COMMITTER_NAME=Artificer
GIT_COMMITTER_EMAIL=w-mnhl7kt97066dce908b2@nexus.local
```

A freeform summon (no writ) just gets the Loom defaults — `Artificer <artificer@nexus.local>`.

## Changes

### 1. Loom — add `environment` to `AnimaWeave`

**Package:** `@shardworks/loom-apparatus`

Add an `environment` field to `AnimaWeave`:

```typescript
export interface AnimaWeave {
  systemPrompt?: string;
  tools?: ResolvedTool[];
  environment?: Record<string, string>;  // NEW
}
```

The Loom's `weave()` method populates `environment` from role configuration. For now, this means deriving git identity from the role name. Role names are lowercase in guild config (e.g. `'artificer'`), so capitalize for the display name and use lowercase for the email:

```typescript
const displayName = role.charAt(0).toUpperCase() + role.slice(1);
environment: {
  GIT_AUTHOR_NAME: displayName,
  GIT_AUTHOR_EMAIL: `${role}@nexus.local`,
  GIT_COMMITTER_NAME: displayName,
  GIT_COMMITTER_EMAIL: `${role}@nexus.local`,
}
```

Future: role configs could declare arbitrary environment variables. For now, git identity is the only use case — hardcode it from the role name rather than building a general config schema we don't need yet.

**Files:**
- `packages/plugins/loom/src/types.ts` — add `environment` to `AnimaWeave`
- `packages/plugins/loom/src/loom.ts` — populate `environment` in `weave()`

### 2. Animator — pass `environment` through the request chain

**Package:** `@shardworks/animator-apparatus`

Add `environment?: Record<string, string>` to:
- `SummonRequest`
- `AnimateRequest`
- `SessionProviderConfig`

In `buildProviderConfig()`, merge the two layers:

```typescript
environment: { ...request.context.environment, ...request.environment },
```

The weave's environment provides defaults; the request's environment overrides. This merge happens once, in one place.

In `summon()`, pass `request.environment` through to the `animate()` call (alongside context, prompt, cwd, etc.).

**Files:**
- `packages/plugins/animator/src/types.ts` — add `environment` to `SummonRequest`, `AnimateRequest`, `SessionProviderConfig`
- `packages/plugins/animator/src/animator.ts` — merge in `buildProviderConfig()`, pass through in `summon()`

### 3. Claude Code provider — spread `environment` into spawn

**Package:** `@shardworks/claude-code-provider`

In both `spawnClaudeStreamJson()` and `spawnClaudeStreamingJson()`, spread `config.environment` into the process environment:

```typescript
spawn('claude', args, {
  cwd,
  stdio: ['pipe', 'pipe', 'inherit'],
  env: { ...process.env, ...config.environment },
});
```

This requires threading `config.environment` (or the full config) into the spawn helpers — currently they only receive `args` and `cwd`.

Update `prepareSession` or the call sites in `launch()` to pass the environment through. Keep the change minimal: add an `env` parameter to the spawn helpers, or pass the full provider config.

**Files:**
- `packages/plugins/claude-code/src/index.ts` — update spawn calls to include environment

### 4. Dispatch — set writ-scoped email on summon

**Package:** `@shardworks/dispatch-apparatus`

When Dispatch summons an anima for a commissioned writ, set the git email to the writ ID:

```typescript
animator.summon({
  role,
  prompt,
  cwd,
  environment: {
    GIT_AUTHOR_EMAIL: `${writ.id}@nexus.local`,
    GIT_COMMITTER_EMAIL: `${writ.id}@nexus.local`,
  },
  metadata: { writId: writ.id, trigger: 'dispatch' },
});
```

This overrides the Loom's default `role@nexus.local` email with the writ-scoped identity. The author name stays as the role name from the Loom.

**Files:**
- `packages/plugins/dispatch/src/dispatch.ts` — add `environment` to the summon call

## Scope Boundary

- Do NOT add a general-purpose environment config schema to role definitions. Git identity derived from role name is sufficient for now.
- Do NOT change the Scriptorium. It is not involved in identity.
- Do NOT change `generateId` or any ID formats — this commission is about attribution, not ID structure.
- Do NOT modify anything outside the `packages/` directory. Sanctum-side tooling (inscribe, scoring) is updated separately.

## Verification

After all changes, a dispatched commission should produce commits with:
- Author name = capitalized role name (e.g., "Artificer")
- Author email = `{writId}@nexus.local`

Verify by inspecting `git log --format="%an <%ae>" -1` on the bare clone after a test dispatch.

Run all test suites for modified packages:
```bash
cd packages/plugins/loom && node --experimental-transform-types --test src/loom.test.ts
cd packages/plugins/animator && node --experimental-transform-types --test src/animator.test.ts
cd packages/plugins/claude-code && node --experimental-transform-types --test src/stream-parser.test.ts
cd packages/plugins/dispatch && node --experimental-transform-types --test src/dispatch.test.ts
```
