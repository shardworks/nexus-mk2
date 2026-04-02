# Anima Git Identity — Test Coverage

Follow-up to the Anima Git Identity commission (`w-mnho6jxd-c8139f50006c`). That commission implemented per-writ git identity attribution across four packages but shipped zero new tests. This commission adds the missing test coverage.

## Context

The implementation threads environment variables through four layers:

1. **Loom** derives git identity from role name → `AnimaWeave.environment`
2. **Animator** merges identity-layer (weave) + task-layer (request) → `SessionProviderConfig.environment`
3. **Claude Code provider** spreads `config.environment` into spawned process env
4. **Dispatch** sets writ-scoped `GIT_*_EMAIL` overrides on summon

Layers 1, 2, and 4 have existing test infrastructure that makes coverage straightforward. Layer 3 (Claude Code provider) spawns real processes and is not unit-testable without mocking `child_process` — skip it.

## Changes

### 1. Loom — test `environment` derivation

**File:** `packages/plugins/loom/src/loom.test.ts`

Add tests to the existing `weave()` describe blocks:

**In `weave() — no role`:**
- `it('returns undefined environment when no role is provided')` — call `weave({})`, assert `weave.environment` is `undefined`.

**In `weave() — role with tool resolution`:**
- `it('derives git identity environment from role name')` — call `weave({ role: 'artificer' })`, assert `weave.environment` deep-equals:
  ```typescript
  {
    GIT_AUTHOR_NAME: 'Artificer',
    GIT_AUTHOR_EMAIL: 'artificer@nexus.local',
    GIT_COMMITTER_NAME: 'Artificer',
    GIT_COMMITTER_EMAIL: 'artificer@nexus.local',
  }
  ```
  Use an existing `setupGuild()` call that includes a role config for `artificer` (or add a minimal one).

- `it('capitalizes first letter of role name for display name')` — call `weave({ role: 'scribe' })`, assert `weave.environment.GIT_AUTHOR_NAME` equals `'Scribe'` and `weave.environment.GIT_COMMITTER_NAME` equals `'Scribe'`.

- `it('derives environment even for unknown roles')` — call `weave({ role: 'unknown-role' })` (a role not in guild config). Assert `weave.environment` is still populated with git identity vars using `'unknown-role'` / `'Unknown-role'`. The Loom derives environment from the role string itself, independent of whether the role has a config entry.

### 2. Animator — test environment merge in provider config

**File:** `packages/plugins/animator/src/animator.test.ts`

The existing `createSpyProvider` captures `SessionProviderConfig`, which now includes `environment`. Add tests using this spy.

**In `summon()`:**
- `it('passes Loom environment to provider when no request environment')` — summon with `role: 'artificer'` and no `environment` on the request. Use the spy provider. Assert `capturedConfig.environment` deep-equals the Loom-derived git identity for `'artificer'` (same values as Loom test above). This verifies the Loom → Animator → provider pipeline.

- `it('merges request environment over Loom environment')` — summon with `role: 'artificer'` and `environment: { GIT_AUTHOR_EMAIL: 'override@nexus.local' }`. Assert `capturedConfig.environment` has `GIT_AUTHOR_NAME: 'Artificer'` (from Loom) but `GIT_AUTHOR_EMAIL: 'override@nexus.local'` (from request). This verifies task-layer-wins merge semantics.

**In `animate()`:**
- `it('passes context environment through to provider')` — animate with `context: { systemPrompt: 'Test', environment: { GIT_AUTHOR_NAME: 'Custom' } }` and no request environment. Use the spy provider. Assert `capturedConfig.environment` deep-equals `{ GIT_AUTHOR_NAME: 'Custom' }`.

- `it('merges request environment over context environment')` — animate with both `context.environment` and `request.environment` set with overlapping keys. Assert the request values win.

### 3. Dispatch — test writ-scoped email override

**File:** `packages/plugins/dispatch/src/dispatch.test.ts`

The dispatch tests use a real Loom + real Animator + fake provider. To capture the environment passed to the provider, replace `createFakeProvider` with a spy variant for the relevant tests.

Create a `createSpyFakeProvider` helper in the test file (or inline it). It should capture the `SessionProviderConfig` like the animator's spy provider does, while still returning a successful result.

```typescript
function createSpyFakeProvider(): {
  provider: AnimatorSessionProvider;
  getCapturedConfig: () => SessionProviderConfig | null;
} {
  let capturedConfig: SessionProviderConfig | null = null;
  return {
    provider: {
      name: 'fake-spy',
      launch(config: SessionProviderConfig) {
        capturedConfig = config;
        return {
          chunks: emptyChunks,
          result: Promise.resolve({
            status: 'completed' as const,
            exitCode: 0,
            providerSessionId: 'fake-spy-sess',
          }),
        };
      },
    },
    getCapturedConfig: () => capturedConfig,
  };
}
```

**Add a new describe block `next() — git identity environment`:**

- `it('passes writ-scoped GIT_*_EMAIL to the session provider')` — post a commission, call `dispatch.next()` with the spy provider, assert `capturedConfig.environment` includes `GIT_AUTHOR_EMAIL` and `GIT_COMMITTER_EMAIL` matching `${writ.id}@nexus.local`. Also assert `GIT_AUTHOR_NAME` and `GIT_COMMITTER_NAME` are present (from Loom defaults).

- `it('preserves Loom role name in GIT_*_NAME while overriding email')` — same as above, but explicitly assert `GIT_AUTHOR_NAME` equals `'Artificer'` (the default role) and `GIT_AUTHOR_EMAIL` equals `${writId}@nexus.local`, verifying the two-layer merge end-to-end.

## Scope Boundary

- Do NOT modify any production code. This commission is test-only.
- Do NOT add tests for the Claude Code provider's env spreading — it spawns real processes and is not unit-testable without adding mock infrastructure we don't need yet.
- Do NOT refactor existing tests. Add new test cases only.
- Do NOT modify anything outside the three test files listed above.

## Verification

Run all test suites for modified packages:
```bash
cd packages/plugins/loom && node --experimental-transform-types --test src/loom.test.ts
cd packages/plugins/animator && node --experimental-transform-types --test src/animator.test.ts
cd packages/plugins/dispatch && node --experimental-transform-types --test src/dispatch.test.ts
```

All existing tests must continue to pass. All new tests must pass.
