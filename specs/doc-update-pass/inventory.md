# Inventory: doc-update-pass

## Files to Modify

### 1. `packages/framework/cli/README.md`
The CLI README. 208 lines. Contains framework command tables (accurate) and "Standard Guild Commands" tables (lines 119-208) which mix implemented tools, aspirational tools, and incorrect source attributions.

### 2. `docs/architecture/apparatus/review-loop.md`
The review loop design spec. 355 lines. Status says "Design (not yet implemented)".

### 3. `docs/architecture/_agent-context.md`
Agent-facing codebase orientation doc. 308 lines. Written 2026-03-31, updated across 4 sessions. Contains repo layout, package tables, terminology, architecture status, and design decisions.

---

## Brief Item 1: CLI README Audit

### The command table problem

Lines 119-208 list "Standard Guild Commands" — these are tools contributed by plugins, discoverable at runtime via The Instrumentarium. The table uses source attributions that don't match the actual codebase.

**Line 121 caveat note:** The README already flags this: _"Some commands listed here are only available via `nsg1` (v1 legacy) until migration is complete. Update this section once the standard kit set is finalized."_

### Actual tools that exist (from `packages/plugins/*/src/tools/*.ts`)

| Tool name | Plugin package | CLI grouping |
|-----------|---------------|--------------|
| `commission-post` | clerk | `nsg commission post` |
| `writ-list` | clerk | `nsg writ list` |
| `writ-show` | clerk | `nsg writ show` |
| `writ-accept` | clerk | `nsg writ accept` |
| `writ-complete` | clerk | `nsg writ complete` |
| `writ-fail` | clerk | `nsg writ fail` |
| `writ-cancel` | clerk | `nsg writ cancel` |
| `writ-link` | clerk | `nsg writ link` |
| `writ-unlink` | clerk | `nsg writ unlink` |
| `session-list` | animator | `nsg session list` |
| `session-show` | animator | `nsg session show` |
| `summon` | animator | `nsg summon` |
| `conversation-list` | parlour | `nsg conversation list` |
| `conversation-show` | parlour | `nsg conversation show` |
| `conversation-end` | parlour | `nsg conversation end` |
| `codex-add` | codexes | `nsg codex add` |
| `codex-list` | codexes | `nsg codex list` |
| `codex-show` | codexes | `nsg codex show` |
| `codex-remove` | codexes | `nsg codex remove` |
| `codex-push` | codexes | `nsg codex push` |
| `draft-open` | codexes | `nsg draft open` |
| `draft-list` | codexes | `nsg draft list` |
| `draft-abandon` | codexes | `nsg draft abandon` |
| `draft-seal` | codexes | `nsg draft seal` |
| `rig-list` | spider | `nsg rig list` |
| `rig-show` | spider | `nsg rig show` |
| `rig-for-writ` | spider | `nsg rig for-writ` |
| `crawl-one` | spider | `nsg crawl one` |
| `crawl-continual` | spider | `nsg crawl continual` |
| `tools-list` | tools | `nsg tools list` |
| `tools-show` | tools | `nsg tools show` |

### Discrepancies between README table and reality

**Commands in README that DON'T EXIST as tools:**

| README command | Listed source | Status |
|---|---|---|
| `nsg writ post` (line 127) | nexus-stdlib | **Renamed.** Actual tool is `commission-post` in clerk. |
| `nsg writ update` (line 130) | nexus-stdlib | **Does not exist.** No `writ-update` tool found anywhere. |
| `nsg anima create` (line 136) | nexus-stdlib | **Does not exist.** No anima tools found in any plugin. |
| `nsg anima list` (line 137) | nexus-stdlib | **Does not exist.** |
| `nsg anima show` (line 138) | nexus-stdlib | **Does not exist.** |
| `nsg anima update` (line 139) | nexus-stdlib | **Does not exist.** |
| `nsg anima remove` (line 140) | nexus-stdlib | **Does not exist.** |
| `nsg anima manifest` (line 141) | nexus-stdlib | **Does not exist.** |
| `nsg consult` (line 147) | cli (v1) | **Does not exist in v2.** Listed as v1-only. |
| `nsg convene` (line 148) | cli (v1) | **Does not exist in v2.** Listed as v1-only. |
| `nsg signal` (line 159) | nexus-stdlib | **Does not exist.** No signal tool found. |
| `nsg clock *` (lines 160-165) | cli (v1) | **Does not exist in v2.** Listed as v1-only. |
| `nsg event list` (line 166) | nexus-stdlib | **Does not exist.** No event tools found. |
| `nsg event show` (line 167) | nexus-stdlib | **Does not exist.** |
| `nsg dispatch list` (line 187) | nexus-stdlib | **Does not exist.** The specific item called out in the brief. |
| `nsg audit list` (line 188) | nexus-stdlib | **Does not exist.** No audit tools found. |
| `nsg dashboard` (line 189) | cli (v1) | **Does not exist in v2.** Listed as v1-only. |

**Commands in README with WRONG SOURCE attribution:**

| README command | Listed source | Actual source |
|---|---|---|
| `nsg writ list` (line 128) | nexus-stdlib | clerk-apparatus |
| `nsg writ show` (line 129) | nexus-stdlib | clerk-apparatus |
| `nsg session list` (line 149) | animator (supportKit) | animator-apparatus (correct package, "supportKit" label may be stale) |
| `nsg session show` (line 150) | animator (supportKit) | animator-apparatus |
| `nsg conversation list` (line 151) | parlour (supportKit) | parlour-apparatus |
| `nsg conversation show` (line 152) | parlour (supportKit) | parlour-apparatus |
| `nsg conversation end` (line 153) | parlour (supportKit) | parlour-apparatus |

**Commands that EXIST but are NOT in the README:**

| Tool | Plugin | Notes |
|---|---|---|
| `writ-accept` | clerk | New tool not in README |
| `writ-complete` | clerk | New tool not in README |
| `writ-fail` | clerk | New tool not in README |
| `writ-cancel` | clerk | New tool not in README |
| `writ-link` | clerk | New tool not in README |
| `writ-unlink` | clerk | New tool not in README |
| `commission-post` | clerk | README has `writ post`; actual name is `commission-post` |
| `summon` | animator | New tool not in README |
| `rig-list` | spider | New tool not in README |
| `rig-show` | spider | New tool not in README |
| `rig-for-writ` | spider | New tool not in README |
| `crawl-one` | spider | New tool not in README |
| `crawl-continual` | spider | New tool not in README |
| `tools-list` | tools | New tool not in README |
| `tools-show` | tools | New tool not in README |

**Key finding: `nexus-stdlib` does not exist.** There is no stdlib package in the monorepo. All tools are contributed by specific apparatus packages (clerk, animator, codexes, parlour, spider, tools). Every `nexus-stdlib` attribution in the README is wrong.

**The codex/draft commands** (lines 173-181) are correctly attributed to `codexes-apparatus` and all exist.

### Migration Status section (lines 193-208)

Lists items "Remaining in v1 only" including `codex * / draft *` with note "(migrated to codexes-apparatus)" — contradictory (says remaining in v1 but also says migrated). The codex tools exist in the v2 codexes-apparatus package.

---

## Brief Item 2: review-loop.md

### Current state of the doc

The doc is 355 lines. Status: "Design (not yet implemented)."

**Brief claims:** The Decision section (line 69) says "Adopt both Option A (MVP) and Option B (full design)" — Option A was the Dispatch-level MVP, Option B was Spider engine designs.

**Actual content:** The Decision section is at lines 61-65. It says: "**Option B (review engines in the rig) is the chosen design.**" There is no "Option A" anywhere in the document. The options listed are Option B (line 45) and Option C (line 53). Option B was chosen. The doc appears to have already been revised to remove Option A and reflect Spider as the sole design.

**Line 69** is actually the heading "## Review Engines in the Rig" — not a Decision section.

**Conclusion:** The review-loop.md may have already been updated since the brief was written. The current doc describes only Spider-based engine designs (Option B). There is no mention of a Dispatch-level MVP (Option A). The doc's status still says "Design (not yet implemented)" which is accurate — the Spider's `engines/review.ts` and `engines/revise.ts` exist but the full loop pattern described in the doc may not be wired.

### Spider implementation of review engines

Files exist at:
- `packages/plugins/spider/src/engines/review.ts`
- `packages/plugins/spider/src/engines/revise.ts`
- `packages/plugins/spider/src/engines/implement.ts`
- `packages/plugins/spider/src/engines/seal.ts`
- `packages/plugins/spider/src/engines/draft.ts`

This aligns with the review-loop.md's rig pattern (implement → review → revise → seal).

---

## Brief Item 3: `_agent-context.md` Staleness Audit

### Line 108: "Commission → mandate writ → dispatch flow"
Listed under "Currently implemented (in actual packages)" at line 108. The brief flags this as potentially stale because it mentions "Dispatch" as part of the commission pipeline. However, looking at the actual line, it says "Commission → mandate writ → dispatch flow" — "dispatch" here likely refers to the clockworks event dispatch mechanism (event_dispatches table), not a "Dispatch apparatus." This may or may not be stale depending on interpretation.

### Stale references found

**Line 9: Repo path is wrong.**
Says: `The Nexus framework lives at /workspace/nexus/`
The package.json repo URL is `https://github.com/shardworks/nexus-mk2`, and `.claude/CLAUDE.md` line 17 says `nexus/` — so either `/workspace/nexus/` or `/workspace/nexus-mk2/` is correct depending on local setup. The _agent-context.md line 24 says "The patron-side sanctum ... is at `/workspace/nexus-mk2/`" suggesting the framework repo is at `/workspace/nexus/` and nexus-mk2 is something else. This is confusing but may be accurate for the local dev environment.

**Lines 30-38: Package table is stale.**
Lists packages that no longer exist or have been renamed:
- `nexus-clockworks` / `@shardworks/nexus-clockworks` — not in the monorepo. No `packages/plugins/clockworks` or `packages/nexus-clockworks` exists.
- `nexus-sessions` / `@shardworks/nexus-sessions` — not in the monorepo. Sessions are handled by the animator apparatus.
- `guild-starter-kit` / `@shardworks/guild-starter-kit` — not in the monorepo.
- `stdlib` / `@shardworks/nexus-stdlib` — not in the monorepo.
- Missing from table: stacks, tools, loom, animator, clerk, codexes, fabricator, spider, parlour (all exist as `packages/plugins/*`).

**Lines 34-35: `cli` npm name wrong.**
Says `@shardworks/nexus` — may still be correct (it's the published name), but `.claude/CLAUDE.md` also says `@shardworks/nexus`.

**Lines 45-56: Rig terminology collision section.**
Says the `Rig` type in `core/src/rig.ts` is being renamed to Kit/Apparatus. The current monorepo has the full apparatus model implemented (10 plugin packages). This section is outdated — the rename happened.

**Lines 69-70: Architecture docs status table.**
References `architecture/rigging.md` as "Forward-looking" — may still be true. References `reference/core-api.md` as mentioning `legacy/1/` migration — may still be true.

**Lines 96-109: "What's Implemented vs. Aspirational"**
Several items listed as "target architecture (not yet fully built)" are now implemented:
- Line 114: "Formal Plugin type with explicit Kit/Apparatus discriminant" — the plugin model exists.
- Line 115: "Apparatus with start/stop/health/supportKit/consumes" — 10 apparatus packages exist.
- Line 117: "Separate named apparatus: Stacks, Guildhall, Clerk, Loom, Animator, Fabricator, Spider, Executor, Surveyor, Warden" — Stacks, Clerk, Loom, Animator, Fabricator, Spider all exist. Guildhall, Executor, Surveyor, Warden do not.
- Line 118: "Spider-driven rig execution" — Spider exists with engines.
- Line 119: "Fabricator (capability resolution)" — Fabricator package exists.

**Lines 125-138: Key Files to Read table.**
References paths that may not exist:
- `packages/arbor/src/arbor.ts` — actual path is `packages/framework/arbor/src/arbor.ts`
- `packages/core/src/book.ts` — actual path is `packages/framework/core/src/...` (not verified but likely under `packages/framework/core/`)
- `packages/core/src/legacy/1/anima.ts` — same prefix issue
- `packages/core/src/tool.ts` — same prefix issue
- `packages/plugins/claude-code/src/` — this path is correct
- `packages/nexus-clockworks/src/` — does not exist, should reference actual clockworks location

**Lines 156-164: Terminology Quick Reference.**
Says Spider is "(not yet implemented)" and Fabricator is "(not yet implemented)" — both now have packages.

**Lines 247-254: Next steps for implementation.**
Lists Instrumentarium, Loom MVP, Animator MVP as "Not yet implemented" — all three now exist as packages.

### Summary of staleness

The `_agent-context.md` was written during sessions 1-4 (2026-03-31 era) and has not been updated to reflect the significant apparatus buildout that happened since. The package table, implementation status, terminology table, and key files table are all substantially stale.

---

## Adjacent Patterns

### How docs are structured in this repo
- Architecture docs live in `docs/architecture/` with per-apparatus detail in `docs/architecture/apparatus/`
- `_agent-context.md` is a special agent-facing orientation doc (prefixed with underscore)
- README files in package directories describe the package's CLI surface and API
- `docs/DEVELOPERS.md` (line 255) says: "The README must match the shipped code. If the API changes, the README changes in the same commit."

### No existing test files for docs
Documentation files are not tested. There are no doc-validation scripts.

---

## Existing Context

### Scratch notes / TODOs
- `docs/architecture/index.md` contains multiple `<!-- TODO -->` blocks (lines 355, 361, 507, 513) for unwritten sections
- `_agent-context.md` lines 234-245 list remaining stub sections for the architecture index doc
- `docs/in-progress/parlour-implementation-tracker.md` exists as an in-progress doc

### No prior commissions found for this slug
No files matching `doc-update-pass` found in the repo.

---

## Doc/Code Discrepancies

1. **CLI README `nexus-stdlib` references:** No `nexus-stdlib` package exists. Every attribution to it is wrong.
2. **CLI README `writ post`:** Actual tool is `commission-post` (in clerk), not `writ-post`.
3. **CLI README migration status:** Says `codex * / draft *` are "Remaining in v1 only" then says "(migrated to codexes-apparatus)" — contradictory.
4. **`_agent-context.md` package table:** Lists 4 packages that don't exist in the monorepo; missing 10 packages that do.
5. **`_agent-context.md` implementation status:** Lists Spider, Fabricator, Instrumentarium, Loom, Animator as "not yet implemented" — all exist.
6. **`_agent-context.md` file paths:** Uses `packages/arbor/` and `packages/core/` paths — actual paths are `packages/framework/arbor/` and `packages/framework/core/`.
7. **review-loop.md:** The brief describes an "Option A (MVP)" that no longer appears in the document — the doc may have already been revised, or the brief references an earlier version.
