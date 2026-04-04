# Observations: loom-charter-role-instructions

Out-of-scope issues noticed during analysis.

---

## Stale documentation in loom spec

**File:** `/workspace/nexus/docs/architecture/apparatus/loom.md`

The MVP scope warning at the top and the `requires: []` declaration are both stale — the Loom now has tool resolution active and `requires: ['tools']`. The "What The Loom does NOT do (MVP)" section lists capabilities that are partially implemented (tool resolution is active). A focused doc update pass on this file would bring it current.

## Stale README for loom package

**File:** `/workspace/nexus/packages/plugins/loom/README.md`

The `AnimaWeave` type shown in the README (line 79) omits the `tools` field that was added when tool resolution shipped. The usage example (line 89) still shows `systemPrompt: undefined` with a comment "MVP — composition not yet implemented." After this commission, both need updating.

## Stale session funnel diagram in architecture index

**File:** `/workspace/nexus/docs/architecture/index.md` lines 428-438

The session funnel diagram still labels tool instructions and charter as "future" work. Tool resolution is already active, and charter/role instructions will be active after this commission. The diagram should be updated.

## Parlour weaves without a role

**File:** `/workspace/nexus/packages/plugins/parlour/src/parlour.ts` line 333

The Parlour calls `loom.weave({ role: undefined })`. This means interactive sessions receive no role instructions and no tool resolution — only charter (after this commission). This is likely correct for now, but as the system matures, interactive sessions may want role-based tools and instructions. Worth a future decision about whether `nsg consult` should accept a `--role` flag.

## Zod dependency unused in loom package

**File:** `/workspace/nexus/packages/plugins/loom/package.json`

Zod is listed as a dependency (`"zod": "4.3.6"`) but is only imported in the test file, not in the production code. It appears to have been included speculatively. Could be moved to `devDependencies` or removed.

## Role instruction upgradeability gap persists

**File:** `/workspace/nexus-mk2/docs/future/known-gaps.md` — "Role instructions are not upgradeable"

This commission implements the Loom's ability to *read* role instruction files, but the upgradeability gap (role instruction files are scaffolded once by `nsg init` and never updated) will persist. The known-gap doc should be updated to note that reading is now implemented but the versioning/upgrade path is still missing.

## Tool instructions pre-loaded but never consumed

**Files:** `/workspace/nexus/packages/plugins/tools/src/instrumentarium.ts`, `/workspace/nexus/packages/plugins/loom/src/loom.ts`

The Instrumentarium's `preloadInstructions()` eagerly reads tool instruction files at startup and stores the text on `ResolvedTool.definition.instructions`. But no code currently reads `definition.instructions` — the Loom resolves tools but never accesses their instructions. This commission (if S6 is included) will be the first consumer of that pre-loaded data, completing the pipeline the Instrumentarium set up.

## `workshops` legacy field in GuildConfig

**File:** `/workspace/nexus/packages/framework/core/src/guild-config.ts`

The architecture index (line 533) documents this as a known gap: the `GuildConfig` interface still carries a `workshops` field that should have been removed when codex registration moved to the Scriptorium plugin. Unrelated to this commission but noticed during inventory.

---

## Spec Verification Log (plan-writer)

**Date:** 2026-04-03 (revision 2)

Previous spec had errors relative to locked decisions: added config fields to `RoleDefinition` and `LoomConfig` (violating D1/D3 patron_overrides), used wrong composition order (charter → role → tools instead of D11's charter → tools → role), and missed the `charter/*.md` directory pattern from D1's patron_override. Rewrote spec from scratch.

Coverage checks performed:

- **Inventory coverage:** All files from inventory accounted for. Primary file (loom.ts), test file, index.ts, README, arch docs all addressed in spec or non-obvious touchpoints. Downstream files (animator, claude-code, dispatch, parlour) confirmed unaffected in Current State. package.json confirmed no changes needed (fs, path are builtins).
- **Decision coverage:** All 14 decisions (D1–D14) mapped to specific requirements and design sections. D1 patron_override (charter.md or charter/*.md) → R1, R2. D3 patron_override (convention only) → R4, R6. D11 selected b (tool instructions between charter and role) → R8. No locked decision absent from spec.
- **Scope coverage:** All 7 included scope items (S1–S7) have corresponding requirements. S5 (RoleDefinition config) is addressed via R6 — per D3 patron_override, the type is not modified; convention replaces config.
- **R↔V bidirectional:** All 13 requirements (R1–R13) appear in at least one V-item. All 13 V-items (V1–V13) reference at least one R-number.
- **Implementer perspective:** Spec provides no new public types (matching decisions), exact file paths, complete startup and weave algorithms, all edge cases including empty files and unknown roles, import additions, non-obvious touchpoints, and 24 concrete test scenarios with expected outcomes. No questions should be needed to implement.
