# Normalize ID Formats — Fixup

Fix the issues from the initial normalize-IDs commission (w-mnhjg4deb43b581c763e). That commission extracted a shared `generateId(prefix, randomByteCount?)` utility into `@shardworks/nexus-core` and migrated three packages. Two things were missed: the Clerk still has its own duplicate implementation, and the animator test breaks because it asserts the old ID format. Additionally, add a hyphen separator between the timestamp and random portions of generated IDs for readability.

## Task 1: Add Hyphen Separator in `generateId`

**File:** `packages/framework/core/src/id.ts`

Line 18 currently reads:
```typescript
return `${prefix}-${ts}${rand}`;
```

Change it to:
```typescript
return `${prefix}-${ts}-${rand}`;
```

This inserts a hyphen between the base36 timestamp and the hex random suffix, making IDs easier to read visually. The new format is `{prefix}-{base36_timestamp}-{hex_random}`.

**Do NOT change anything else in this function.**

## Task 2: Fix the Animator Test

**File:** `packages/plugins/animator/src/animator.test.ts`

Line 574 currently asserts:
```typescript
assert.match(result.id, /^ses-[a-f0-9]{8}$/);
```

Update the regex to match the new format (with hyphen separator). The pattern should be:
- Starts with `ses-`
- Followed by one or more base36 characters (alphanumeric: `[a-z0-9]+`)
- Followed by a literal hyphen `-`
- Followed by exactly 8 hex characters (`[a-f0-9]{8}`)
- Nothing else

**Verification:** Run the animator test suite. All tests must pass.

```bash
cd packages/plugins/animator && node --experimental-transform-types --test src/animator.test.ts
```

## Task 3: Migrate the Clerk to Use Shared `generateId`

**File:** `packages/plugins/clerk/src/clerk.ts`

The Clerk currently has its own `generateWritId()` function (around line 46):
```typescript
function generateWritId(): string {
  const ts = Date.now().toString(36);
  const rand = crypto.randomBytes(6).toString('hex');
  return `w-${ts}${rand}`;
}
```

This is identical to `generateId('w', 6)` from `@shardworks/nexus-core`. Replace it:

1. Remove the `generateWritId` function and its `crypto` import (if no other code in the file uses `crypto`)
2. Import `generateId` from `@shardworks/nexus-core` (add to existing import)
3. Replace the call site (around line 112) — change `generateWritId()` to `generateId('w', 6)`

**Verification:** Run the Clerk test suite. All tests must pass.

```bash
cd packages/plugins/clerk && node --experimental-transform-types --test src/clerk.test.ts
```

Check if the Clerk tests assert on writ ID format. If so, update the regex to match the new format with hyphen separator (`w-{base36_ts}-{hex}`).

## Task 4 (Optional): Add Unit Test for `generateId`

**File:** Create `packages/framework/core/src/id.test.ts`

Test the following properties:
- Returns a string matching `{prefix}-{base36_ts}-{hex_random}` (note the hyphen between timestamp and random)
- Prefix is included verbatim
- Default random suffix is 12 hex characters (6 bytes)
- Custom `randomByteCount` produces `2 × N` hex characters
- Two calls produce different IDs (non-deterministic, but virtually certain)
- IDs are lexicographically sortable by creation time (call twice with a small delay, assert second > first)

Use the existing test style in the codebase (node:test + node:assert, no external test framework). See `packages/framework/core/src/resolve-package.test.ts` for the pattern.

```bash
cd packages/framework/core && node --experimental-transform-types --test src/id.test.ts
```

## Scope Boundary

- Do NOT change the `generateId` function beyond the single-line format change in Task 1.
- Do NOT change any other packages besides Core, Animator, and Clerk.
- Do NOT change ID formats beyond adding the hyphen separator described in Task 1.

---

**Important:** When you are finished, commit all changes in a single commit with a clear, descriptive message. Do not leave uncommitted changes — they will be lost when the session closes.
