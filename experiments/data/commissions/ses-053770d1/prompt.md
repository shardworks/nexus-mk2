# Commission: Clerk apparatus — align implementation with spec

Fix the Clerk apparatus at packages/plugins/clerk/ to match the API contract spec at docs/architecture/apparatus/clerk.md. The initial implementation deviated from the spec in several areas. This commission corrects all deviations.

## Changes required

### 1. WritDoc fields (src/types.ts)

The current WritDoc does not match the spec. Make these changes:

**Rename fields:**
- `postedAt` → `createdAt`
- `closedAt` → `resolvedAt`

**Add fields:**
- `updatedAt: string` — ISO timestamp, set on creation and updated on every mutation
- `codex?: string` — target codex name, optional
- `resolution?: string` — summary of how the writ resolved (set on any terminal transition: completed, failed, or cancelled)

**Remove fields:**
- `assignee: string | null` — remove entirely (deferred, not in spec)
- `failReason: string | null` — replaced by `resolution`

**Change field types:**
- `body` should be `string` (required), not `string | null`
- `acceptedAt` should be `string | undefined` (optional), not `string | null`
- `resolvedAt` should be `string | undefined` (optional), not required

**Remove the index signature** `[key: string]: unknown` — not in the spec.

The resulting WritDoc should match this exactly:

```typescript
interface WritDoc {
  id: string
  type: string
  status: WritStatus
  title: string
  body: string
  codex?: string
  createdAt: string
  updatedAt: string
  acceptedAt?: string
  resolvedAt?: string
  resolution?: string
}
```

### 2. PostCommissionRequest (src/types.ts)

Change to match spec:
- `body` should be `string` (required), not optional
- Add `codex?: string` — optional target codex name
- Remove `assignee?: string`

```typescript
interface PostCommissionRequest {
  title: string
  body: string
  codex?: string
  type?: string  // default: "mandate"
}
```

### 3. WritFilters (src/types.ts)

Change to match spec:
- Remove `assignee?: string`
- Add `offset?: number`

```typescript
interface WritFilters {
  status?: WritStatus
  type?: string
  limit?: number
  offset?: number
}
```

### 4. ClerkApi interface (src/types.ts)

Replace the current named-method API with the spec's API:

```typescript
interface ClerkApi {
  post(request: PostCommissionRequest): Promise<WritDoc>
  show(id: string): Promise<WritDoc>   // throws if not found (NOT null)
  list(filters?: WritFilters): Promise<WritDoc[]>
  count(filters?: WritFilters): Promise<number>
  transition(id: string, to: WritStatus, fields?: Partial<WritDoc>): Promise<WritDoc>
}
```

Key differences from current:
- `postCommission()` → `post()`
- `show()` must THROW if not found, not return null
- Add `count()` method
- Replace `accept()`, `complete()`, `fail()`, `cancel()` with single `transition()` method
- `transition()` accepts a `fields` parameter for setting additional fields atomically (e.g. `resolution`)

### 5. ClerkConfig (src/types.ts)

Remove ClerkConfig interface entirely. The current implementation reads `defaultType` from plugin config and `writTypes` from guild config — this is fine as runtime behavior, but ClerkConfig is not in the spec's public types. Keep the runtime behavior (reading from config) but don't export a ClerkConfig type.

### 6. Core implementation (src/clerk.ts)

- Update `createClerk()` to implement the new ClerkApi shape
- `post()`: set `codex` from request, set both `createdAt` and `updatedAt` to now, `body` is required
- `show()`: throw `Error('Writ "${id}" not found.')` instead of returning null
- `transition()`: single method replacing accept/complete/fail/cancel. Validate the transition is legal, set `updatedAt` to now, set `acceptedAt` when transitioning to active, set `resolvedAt` when reaching a terminal state, merge any `fields` into the patch
- `count()`: use `writs.count()` or `writs.find()` with the same filter logic as `list()`, return the count
- `list()`: remove `assignee` filter, add `offset` support, order by `createdAt` desc

### 7. Tools (src/tools/)

Update all tools to use the new API:

**commission-post.ts:**
- Add `body` as required string parameter
- Add `codex` as optional string parameter
- Remove `assignee` parameter
- Call `clerk.post()` instead of `clerk.postCommission()`

**writ-show.ts:**
- No handler change needed (show already throws via new API), but remove the null-check-and-throw in the tool handler since the API now throws directly

**writ-list.ts:**
- Remove `assignee` filter parameter
- Remove the `as WritStatus` cast if possible (use proper typing)

**writ-accept.ts:**
- Call `clerk.transition(params.id, 'active')` instead of `clerk.accept()`

**writ-complete.ts:**
- Add `resolution` as a REQUIRED string parameter
- Call `clerk.transition(params.id, 'completed', { resolution: params.resolution })`

**writ-fail.ts:**
- Rename `reason` parameter to `resolution` and make it REQUIRED
- Call `clerk.transition(params.id, 'failed', { resolution: params.resolution })`

**writ-cancel.ts:**
- Add `resolution` as an OPTIONAL string parameter
- Call `clerk.transition(params.id, 'cancelled', { resolution: params.resolution })` (only pass resolution if provided)

### 8. Indexes (src/clerk.ts supportKit)

Change indexes to match spec:

```typescript
indexes: ['status', 'type', 'createdAt', ['status', 'type'], ['status', 'createdAt']]
```

Remove the `assignee` and `postedAt` indexes.

### 9. Tests (src/clerk.test.ts)

Update all tests to use the new API shape:
- `postCommission()` → `post()`
- `accept()` → `transition(id, 'active')`
- `complete()` → `transition(id, 'completed', { resolution: '...' })`
- `fail()` → `transition(id, 'failed', { resolution: '...' })`
- `cancel()` → `transition(id, 'cancelled')`
- Update WritDoc field assertions (createdAt, updatedAt, resolvedAt, resolution, codex)
- Remove assignee-related tests
- Add tests for `count()`
- Add test that `show()` throws on missing writ
- Add test that `post()` requires body
- Add test for `codex` field passthrough
- Add test that `resolution` is set on terminal transitions
- Add test that `updatedAt` changes on mutations

### 10. README.md

Update the README to reflect all API changes. Ensure examples use the new method names and field names.

## Reference

- Spec: docs/architecture/apparatus/clerk.md (MVP scope only)
- Pattern reference: packages/plugins/parlour/ for apparatus structure
- The Dispatch apparatus (packages/plugins/dispatch/) is a consumer of ClerkApi — it will be updated separately. Do NOT modify the dispatch package.

IMPORTANT: Commit your work. Make small, atomic commits as you complete each piece. Do not leave uncommitted files. Run tests before your final commit to ensure everything passes.
