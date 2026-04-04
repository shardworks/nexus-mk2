# doc-update-pass — Scope

## Item 1: CLI README command table audit

**File:** `packages/framework/cli/README.md`

### Findings

The "Standard Guild Commands" section (lines 119–189) was written against a planned `nexus-stdlib` package that was never implemented. The entire section uses `nexus-stdlib` as the source for commands that either don't exist or now live in individual apparatus packages.

**Commands that don't exist anywhere:**
- `nsg dispatch list`, `nsg audit list` (Operations) — aspirational stdlib tools, never built
- `nsg signal` — aspirational stdlib tool
- `nsg event list`, `nsg event show` — aspirational stdlib tools
- All 6 `nsg anima *` commands — anima management tools never built
- `nsg writ update` — no such tool in any plugin

**Commands with wrong names or sources:**
- `nsg writ post` → actual tool is `commission-post` in clerk (not grouped under `writ`)
- `nsg writ list/show` → exist in clerk, not nexus-stdlib
- Session/conversation tools → correct names but wrong sources (animator and parlour, not nexus-stdlib)

**Undocumented tools that exist:**
- Clerk: `writ-accept`, `writ-complete`, `writ-fail`, `writ-cancel`, `writ-link`, `writ-unlink`
- Animator: `summon`
- Spider: `crawl-one`, `crawl-continual`, `rig-for-writ`, `rig-list`, `rig-show`
- Tools: `tools-list`, `tools-show`

### Changes

- Rewrite the "Standard Guild Commands" section to reflect actual installed tools
- Replace `nexus-stdlib` source attributions with correct apparatus names
- Add new sections for Spider tools and Introspection tools
- Remove aspirational note banner — the section will reflect reality, not targets
- Fix the Migration Status "Remaining in v1" list (remove codex entry — already migrated)

### Out of scope

- The Auto-Grouping example on line 46 mentions `signal (no group)` — this is illustrative and correct as documentation of the grouping algorithm, not a claim that `signal` exists. Left as-is.
- The `nsg init` example on line 99 references `@shardworks/nexus-stdlib` — this is in the Framework Commands section describing `nsg plugin install` syntax. The package name is illustrative. Left as-is.

---

## Item 2: review-loop.md design decision section

**File:** `docs/architecture/apparatus/review-loop.md`

### Findings

The brief states the Decision section says "Adopt both Option A (MVP) and Option B (full design)." This does not match the current file. The current Decision section (line 61–65) reads:

> **Option B (review engines in the rig) is the chosen design.**

Option A does not appear anywhere in the document. The file lists only Option B and Option C, with Option B as the sole chosen design. The document already reflects Spider as the sole design path — no Dispatch-level MVP is mentioned.

The brief was likely written against an earlier version of this file that has since been revised.

### Changes

None. The document is already in the state the brief intended.

---

## Item 3: `_agent-context.md` freshness audit

**File:** `docs/architecture/_agent-context.md`

### Findings

This file was written 2026-03-31 as orientation for agents working on `docs/architecture/index.md`. It has drifted significantly from reality. The file's own header warns "May drift from reality — treat as orientation, not ground truth," but since it's actively consumed by agents as context, keeping it current prevents wasted investigation.

**Stale package table (lines 35–39):** Lists 5 defunct packages — `nexus-clockworks`, `nexus-sessions`, `guild-starter-kit`, `claude-code-apparatus` (wrong name format), `stdlib`. The actual plugin set is 10 apparatus packages under `packages/plugins/`.

**"Currently implemented" section (lines 97–110):**
- Line 108: "Commission → mandate writ → dispatch flow" — Dispatch apparatus was removed. The pipeline is now Spider-driven (crawl → rig → engine).
- Lists `Rig` type as the plugin interface — the Kit/Apparatus model is now in use.
- Lists Clockworks and Sessions as "rigs" — they're now apparatus.
- Missing: Spider, Fabricator, Clerk, Stacks, Instrumentarium, Codexes, Parlour, Loom, Animator.

**"Target architecture" section (lines 112–121):**
- Many items listed as aspirational are now implemented: Spider, Fabricator, Clerk, Loom, Animator, Stacks, guild() singleton, StartupContext, Plugin type with Kit/Apparatus discriminant.
- `GuildContext` with `ctx.plugin()` was replaced by `guild()` singleton (documented in the file's own session 4 notes but not reflected in the summary).

**Terminology table (lines 158–164):**
- Spider listed as "(not yet implemented)" — exists as `spider` apparatus
- Fabricator listed as "(not yet implemented)" — exists as `fabricator` apparatus
- Rig (execution scaffold) listed as "(not yet implemented)" — Spider assembles rigs
- Kit/Apparatus listed as "Rig (plugin package)" — rename is largely complete
- Stacks listed as "`books` apparatus" — plugin id is `stacks`
- Summon relay listed as "installed via nexus-stdlib" — `summon` is a tool in animator

**Key Files table (lines 131–138):** Uses old package paths (`packages/arbor/`, `packages/nexus-clockworks/`). Current layout is `packages/framework/{core,arbor,cli}/` and `packages/plugins/{name}/`.

**Rig Terminology Collision section (lines 43–56):** States the rename is "in progress" and tells agents to "mentally substitute 'plugin' for Rig." The rename is largely complete — the codebase now uses Kit/Apparatus terminology. The `Rig` type in Spider refers to the execution scaffold (metaphor sense).

**rigging.md status (line 69):** Listed as "Forward-looking" — Spider and Fabricator are now implemented.

**"Next Steps" section (lines 247–254):** Lists Instrumentarium, Loom MVP, and Animator MVP as "not yet implemented" — all three exist.

### Changes

- Replace defunct package table with current 10-plugin inventory
- Rewrite "Currently implemented" to reflect actual state (Spider, Fabricator, Clerk, Stacks, tools, guild() singleton, etc.)
- Narrow "Target architecture" to what's genuinely still aspirational (anima identity, full Loom composition, Animator MCP, startup validation, dynamic rig extension)
- Update terminology table entries for Spider, Fabricator, Rig, Kit/Apparatus, Stacks, Summon
- Fix all package paths in Key Files table
- Update Rig Terminology Collision section to reflect completed rename
- Update rigging.md status from "Forward-looking" to "Good"

### Out of scope

- The Session Notes (lines 168–175) and Design Decisions sections (lines 178–308) are historical records of past sessions. They describe what was true at the time. Updating them would falsify the historical record. Left as-is.
- The "Next Steps" section (lines 224–254) is part of session notes context. Same rationale — historical record, left as-is.
- The guild.json Shape section (lines 142–150) — would need verification against current `GuildConfig` type. Not flagged in the brief. Left for a future audit.
