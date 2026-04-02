# Patron Review: w-mnhjg4deb43b581c763e

**Commission:** Normalize ID Formats Across Apparatus  
**Outcome:** Partial  
**Reviewed:** 2026-04-02

## Summary

The anima extracted a shared `generateId(prefix, randomByteCount?)` utility into `nexus-core/src/id.ts` and migrated three packages (Animator, Codexes/Scriptorium, Parlour) to use it. The core extraction is clean: good JSDoc, proper barrel export, correct format (`{prefix}-{base36_ts}{hex_random}`). Code is net-negative lines, which is the right direction for a deduplication task.

## What Worked

- **Shared utility is well-designed.** Signature is `generateId(prefix: string, randomByteCount: number = 6)` — clean, documented, flexible. Matches the Clerk's convention exactly.
- **All three target packages migrated.** Animator, Codexes, and Parlour all had their local ID generators removed and replaced with imports from core.
- **Good commit message.** Single commit, clear description of what changed in each package, notes the behavioral changes. Better than average anima output.
- **Turns get explicit 6 bytes** as the spec suggested for high-volume types.

## Issues

### 1. Clerk not migrated (spec gap)

The Clerk — the *origin* of this convention — still has its own `generateWritId()` with identical logic. The spec's table of "Proposed Changes" only listed Codexes/Animator/Parlour, so technically the anima followed the spec. But the spec also said "consider extracting a shared utility into `nexus-core` to eliminate duplication" — the Clerk is the most obvious candidate to delegate. This is a spec weakness, not really an anima failure. Still, a thoughtful anima would have caught it.

**Verdict:** Minor. Easy follow-up.

### 2. Animator test will break

The existing test in `animator.test.ts` line 574 asserts:
```typescript
assert.match(result.id, /^ses-[a-f0-9]{8}$/);
```
The new format produces `ses-{base36_ts}{8_hex}` which is longer and includes non-hex characters in the timestamp portion. This test will fail. The anima should have updated it.

**Verdict:** Must fix. This is a regression.

### 3. Branch name semantics changed in Scriptorium

The old code was:
```typescript
const branch = request.branch ?? `draft-${generateDraftId()}`;
// generateDraftId() returned `{ts}{hex}` (no prefix)
// so branch = `draft-{ts}{hex}`
```

The new code is:
```typescript
const branch = request.branch ?? generateId('draft', 4);
// generateId('draft', 4) returns `draft-{ts}{hex}`
// so branch = `draft-{ts}{hex}`
```

This actually works out — the old code prepended `draft-` to the unprefixed ID, and the new code gets the prefix from `generateId` directly. The commit message correctly describes this. End result is the same format: `draft-{ts}{hex}`. **No issue here** — the scorer's concern about "draft-draft-" was wrong; the anima handled this correctly by removing the `draft-` prefix literal.

### 4. No tests for new utility

The new `id.ts` has no test file. Given that it's 4 lines of straightforward logic and is implicitly tested through every consumer, this is low priority — but a proper codebase would have a unit test for format validation. Low priority.

### 5. Turn byte count is spec-compliant but subtle

The spec said "high-volume types (turns) might want more bytes." Turns got explicit `6` (12 hex chars) while conversations and participants use the default `6`. So turns don't actually get *more* than the default — they just get it explicitly. Meanwhile, the old Parlour used 4 bytes for everything. So all Parlour IDs went from 8 hex chars to 12, which is fine. This is adequate.

## Scorer Assessment

The automated scorer flagged the right things:
- **test_quality: 1.00** — Correct. Broken test is a real problem.
- **code_structure: 3.00** — Correct. The extraction is clean.
- **requirement_coverage: 2.00** — Correct. Missing Clerk migration and the test fix.
- **error_handling: 2.00** — Slightly harsh; there's nothing to error-handle in a pure function. But the broken test is arguably an error-handling gap.

Blind vs aware scoring: blind gave codebase_consistency 2.00, aware gave 3.00. The aware scorer correctly recognized that the changes *are* consistent with the codebase conventions — the deduction in blind mode was likely due to the broken test appearing as inconsistency.

## Disposition

**Outcome: Partial.** The core work is solid and the design is right, but the broken animator test is a blocker — we can't merge code that breaks existing tests. The Clerk migration is a nice-to-have that can be a follow-up.

**Revision required:** Yes — at minimum, fix the animator test regex. Ideally also migrate the Clerk to use the shared utility.

## Follow-up Commission

Needed:
1. Fix `animator.test.ts` regex to match the new ID format
2. Migrate Clerk's `generateWritId()` to delegate to `generateId('w', 6)` from core
3. (Optional) Add a unit test for `generateId` in core
