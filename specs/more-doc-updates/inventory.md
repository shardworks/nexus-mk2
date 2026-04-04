# Inventory: more-doc-updates

## Brief Summary

Two doc fixes:
1. scriptorium.md says `requires: ['stacks']` but code has `requires: []` — doc is aspirational, not accurate
2. spider.md line 284 note about seal+push — brief says it reads "Push is a separate Scriptorium operation — the seal engine seals but does not push" but actual line 284 reads: "The Scriptorium's `seal()` method pushes the target branch to the remote after sealing." — this is already accurate per the code

---

## Affected Files

### Files to modify

1. **`docs/architecture/apparatus/scriptorium.md`**
   - Line 37: `requires: ['stacks']` → should be `requires: []`
   - Line 41: description says Stacks tracks runtime state — but the implementation uses in-memory tracking + `guild().config()`/`guild().writeConfig()`, not Stacks
   - Lines 556, 561, 585: Bare Clone Architecture lifecycle references "Record clone status in Stacks", "Record draft in Stacks", "Clean up Stacks records" — code does none of these; drafts are in-memory, codex registry is guild.json
   - Lines 684-697: "Future State: Draft Persistence via Stacks" section correctly describes this as future — consistent with the fix (confirms the `requires: ['stacks']` was aspirational)

2. **`docs/architecture/apparatus/spider.md`**
   - Line 284: Note reads `> **Note:** Field names mirror the Scriptorium's SealResult type. The Scriptorium's seal() method pushes the target branch to the remote after sealing.`
   - **Discrepancy with brief:** The brief quotes this line as "Push is a separate Scriptorium operation — the seal engine seals but does not push" but that text does NOT appear in the current file. The current text at line 284 is already accurate — the Scriptorium's `seal()` method DOES push (see scriptorium-core.ts lines 522-526 and 559-563). This item may already be resolved or the brief references stale content.

### Files NOT modified (reference only)

3. **`packages/plugins/codexes/src/scriptorium.ts`** — line 39: `requires: []` (the ground truth)
4. **`packages/plugins/codexes/src/scriptorium-core.ts`** — the actual implementation
   - Drafts tracked in-memory via `Map<string, DraftRecord>` (line 51)
   - Config read via `guild().config<CodexesConfig>('codexes')` (line 77)
   - Config written via `guild().writeConfig('codexes', ...)` (lines 298, 352)
   - No Stacks import or usage anywhere in the file
   - `seal()` method pushes after sealing (lines 522-526, 559-563)
5. **`packages/plugins/spider/src/engines/seal.ts`** — calls `scriptorium.seal()` which handles push internally; seal engine does not call push separately
6. **`packages/plugins/spider/src/spider.ts`** — for context on how seal engine is used

---

## Actual Code Signatures (ground truth)

### scriptorium.ts apparatus declaration (lines 37-40)
```typescript
apparatus: {
  requires: [],
  consumes: [],
  // ...
}
```

### scriptorium-core.ts seal method push behavior (lines 520-527, 558-565)
```typescript
// Push before abandoning draft — if push fails the draft survives for inspection
try {
  await git(['push', 'origin', targetBranch], clonePath);
} catch (pushErr) {
  throw new Error(
    `Push failed after successful seal: ${pushErr instanceof Error ? pushErr.message : pushErr}`,
  );
}
```

### scriptorium-core.ts storage mechanism
```typescript
// In-memory:
private codexes = new Map<string, CodexState>();  // line 50
private drafts = new Map<string, DraftRecord>();   // line 51

// Persistent config (guild.json, not Stacks):
guild().config<CodexesConfig>('codexes')           // line 77
guild().writeConfig('codexes', { ...config, registered })  // line 298
```

---

## Doc/Code Discrepancies (the actual bugs to fix)

### scriptorium.md

1. **Dependencies block** (lines 36-39): Doc says `requires: ['stacks']`, code says `requires: []`
2. **Dependencies description** (line 41): Doc says "The Stacks — persists the codex registry and draft tracking records. Configuration in guild.json is the source of truth for registered codexes; the Stacks tracks runtime state (active drafts, clone status)." — Code uses no Stacks; drafts are in-memory, codex registry is guild.json config only.
3. **Bare Clone Architecture lifecycle** (lines 553-586): Three lifecycle steps reference Stacks that don't exist in code:
   - `codex-add` step 3: "Record clone status in Stacks" — code stores in-memory `CodexState.cloneStatus`
   - `draft-open` step 3: "Record draft in Stacks" — code stores in `this.drafts` Map
   - `codex-remove` step 4: "Clean up Stacks records" — code just deletes from `this.codexes` Map
4. **Startup reconciliation** (line 638, point 4): "Reconciles Stacks records with filesystem state" — code reconciles in-memory map with filesystem, no Stacks involved

### spider.md

5. **Line 284 note**: The current text says "The Scriptorium's `seal()` method pushes the target branch to the remote after sealing" — this is **accurate** per the code. The brief's quoted text ("Push is a separate Scriptorium operation — the seal engine seals but does not push") does not appear in the current file. **This item may be a no-op** or the brief references a prior version that was already corrected.

---

## Adjacent Patterns

### How other apparatus docs handle `requires`
- spider.md: `requires: ['fabricator', 'clerk', 'stacks']` — spider.ts line 400: `requires: ['stacks', 'clerk', 'fabricator']` — names match, order differs (cosmetic)
- Pattern: docs and code should list the same dependency names

### Doc update conventions
- Architecture docs use fenced code blocks for `requires`/`consumes` declarations
- Lifecycle diagrams use indented tree format with `├─` and `└─` glyphs
- These are prose/documentation files, not code — no tests exist for them

---

## Test Files

No test files exist for the documentation files. The only relevant test files:
- `packages/plugins/codexes/src/scriptorium-core.test.ts` — tests the core implementation (not affected by doc changes)
- `packages/plugins/spider/src/spider.test.ts` — tests the spider (not affected by doc changes)

---

## Existing Context

- The "Future State: Draft Persistence via Stacks" section (scriptorium.md lines 684-697) explicitly acknowledges the current in-memory approach and describes the planned Stacks integration. The `requires: ['stacks']` in the Dependencies section jumped the gun on this future state.
- No commission log entries found for this area.
- No scratch notes or TODOs found in either doc file.
