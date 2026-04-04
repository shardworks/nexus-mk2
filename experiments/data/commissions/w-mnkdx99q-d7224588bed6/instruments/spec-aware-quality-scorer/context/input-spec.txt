---
author: plan-writer
estimated_complexity: 1
---

# more-doc-updates

## Summary

Fix the Scriptorium architecture doc (`scriptorium.md`) to reflect the actual implementation: no Stacks dependency, in-memory draft tracking, guild.json-based config. Confirm the Spider doc (`spider.md`) seal+push note is already accurate and requires no change.

## Current State

### `docs/architecture/apparatus/scriptorium.md`

**Dependencies section (lines 34–43):**

```markdown
## Dependencies

\```
requires: ['stacks']
consumes: []
\```

- **The Stacks** — persists the codex registry and draft tracking records. Configuration in `guild.json` is the source of truth for registered codexes; the Stacks tracks runtime state (active drafts, clone status).
```

The actual apparatus declaration in `packages/plugins/codexes/src/scriptorium.ts` line 39 is `requires: []`. The implementation in `packages/plugins/codexes/src/scriptorium-core.ts` uses:
- `guild().config<CodexesConfig>('codexes')` for reading the codex registry from guild.json
- `guild().writeConfig('codexes', ...)` for persisting registry changes to guild.json
- An in-memory `Map<string, CodexState>` for codex clone status
- An in-memory `Map<string, DraftRecord>` for active draft tracking

No Stacks import or usage exists anywhere in the codexes package.

**Bare Clone Architecture lifecycle (lines 550–586):**

Three lifecycle steps reference Stacks operations that do not exist in code:
- `codex-add` step 3: `Record clone status in Stacks`
- `draft-open` step 3: `Record draft in Stacks`
- `codex-remove` step 4: `Clean up Stacks records`

**Startup reconciliation (lines 630–639):**

Point 4 reads: `Reconciles Stacks records with filesystem state (cleans up records for drafts that no longer exist on disk)`

The code (`scriptorium-core.ts` `reconcileDrafts()` method) reconciles the in-memory `drafts` Map with filesystem state — no Stacks involved.

**Future State section (lines 684–697):**

The "Future State: Draft Persistence via Stacks" section already correctly describes draft persistence as future work. No change needed here (decision D4).

### `docs/architecture/apparatus/spider.md`

**Line 284 SealYields note:**

```markdown
> **Note:** Field names mirror the Scriptorium's `SealResult` type. The Scriptorium's `seal()` method pushes the target branch to the remote after sealing.
```

This is accurate. The `seal()` method in `scriptorium-core.ts` calls `git push origin <targetBranch>` after updating the target branch ref (lines 522–526, 559–563). The seal engine (`packages/plugins/spider/src/engines/seal.ts`) calls only `scriptorium.seal()` — push is handled internally. No change needed (decision D3).

## Requirements

- R1: The `scriptorium.md` Dependencies code block must show `requires: []` (not `requires: ['stacks']`).
- R2: The `scriptorium.md` Dependencies description must describe the actual storage mechanism: codex registry persisted via `guild.json` config, draft tracking in-memory and reconstructed from filesystem at startup. It must not reference Stacks. It must include a forward reference to the "Future State: Draft Persistence via Stacks" section.
- R3: The `scriptorium.md` Bare Clone Architecture lifecycle diagram must replace Stacks references with accurate in-memory tracking descriptions, preserving the existing step numbering and diagram structure.
- R4: The `scriptorium.md` Startup reconciliation point 4 must say "Reconciles in-memory draft tracking with filesystem state" instead of "Reconciles Stacks records with filesystem state".
- R5: The `spider.md` line 284 note must remain unchanged — it is already accurate.

## Design

### Dependencies section replacement

Lines 34–43 of `docs/architecture/apparatus/scriptorium.md` become:

```markdown
## Dependencies

```
requires: []
consumes: []
```

No apparatus dependencies. The codex registry is persisted via `guild.json` config (`guild().config()` / `guild().writeConfig()`). Active draft tracking is in-memory, reconstructed from filesystem state at startup. See [Future State: Draft Persistence via Stacks](#future-state) for the planned Stacks integration.
```

### Bare Clone Architecture lifecycle replacement

The three Stacks-referencing steps in the lifecycle diagram (lines 550–586) change as follows. The rest of the diagram is untouched.

**`codex-add` step 3** (line 556):
- Before: `└─ 3. Record clone status in Stacks`
- After: `└─ 3. Track clone status in memory`

**`draft-open` step 3** (line 561):
- Before: `└─ 3. Record draft in Stacks`
- After: `└─ 3. Track draft in memory`

**`codex-remove` step 4** (line 585):
- Before: `└─ 4. Clean up Stacks records`
- After: `└─ 4. Remove in-memory tracking`

### Startup reconciliation replacement

Line 637 of `docs/architecture/apparatus/scriptorium.md` changes:

- Before: `4. Reconciles Stacks records with filesystem state (cleans up records for drafts that no longer exist on disk)`
- After: `4. Reconciles in-memory draft tracking with filesystem state (cleans up tracking for drafts that no longer exist on disk)`

### spider.md — no change

Line 284 of `docs/architecture/apparatus/spider.md` remains as-is. The current text is accurate.

### Non-obvious Touchpoints

The `docs/architecture/index.md` file (line 69) mentions the Scriptorium in passing ("The Scriptorium manages codexes — bare clones, draft bindings (worktrees), and the seal-and-push lifecycle") but does not reference its dependency declarations. No change needed there.

## Validation Checklist

- V1 [R1]: In `docs/architecture/apparatus/scriptorium.md`, the Dependencies code block shows `requires: []`. Verify: `grep "requires: \['stacks'\]" docs/architecture/apparatus/scriptorium.md` returns no matches; `grep "requires: \[\]" docs/architecture/apparatus/scriptorium.md` returns one match.
- V2 [R2]: The Dependencies description paragraph does not contain the word "Stacks" and does contain "guild.json" and "in-memory". Verify: `grep -A5 "requires: \[\]" docs/architecture/apparatus/scriptorium.md` shows the new description. The phrase "Future State" or a section link appears in the paragraph.
- V3 [R3]: The Bare Clone Architecture lifecycle diagram contains no Stacks references. Verify: `grep -c "Stacks" docs/architecture/apparatus/scriptorium.md` returns exactly the count from the "Future State" section (the word "Stacks" should appear only in the Future State heading and body, plus the Kit Interface section reference "No `consumes` declaration" — not in Dependencies, not in lifecycle, not in startup). Specifically: `grep "Record.*in Stacks\|Clean up Stacks" docs/architecture/apparatus/scriptorium.md` returns no matches. The three replacement lines are present: `grep "Track clone status in memory" docs/architecture/apparatus/scriptorium.md`, `grep "Track draft in memory" docs/architecture/apparatus/scriptorium.md`, `grep "Remove in-memory tracking" docs/architecture/apparatus/scriptorium.md` each return one match.
- V4 [R4]: Startup reconciliation point 4 says "in-memory draft tracking" not "Stacks records". Verify: `grep "Reconciles in-memory draft tracking" docs/architecture/apparatus/scriptorium.md` returns one match; `grep "Reconciles Stacks" docs/architecture/apparatus/scriptorium.md` returns no matches.
- V5 [R5]: `docs/architecture/apparatus/spider.md` line 284 is unchanged. Verify: `sed -n '284p' docs/architecture/apparatus/spider.md` outputs `> **Note:** Field names mirror the Scriptorium's \`SealResult\` type. The Scriptorium's \`seal()\` method pushes the target branch to the remote after sealing.`

## Test Cases

No automated tests apply. These are documentation-only changes to markdown files. The validation checklist grep commands serve as the verification mechanism. No source code, types, or runtime behavior is affected.