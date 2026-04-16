# Click model implementation — work packages

Scoped from the pilgrimage assessment (`w-mo0gias9`). Each package is sized for a single commission unless noted otherwise.

**Apparatus:** Ratchet — a new framework plugin, peer to Clerk/Spider/Astrolabe. Owns the clicks book in Stacks. Manages the inquiry/decision domain, analogous to Clerk managing the obligation domain.

## Package 1: Ratchet apparatus (foundation)

**What:** Build the Ratchet plugin. It owns the `clicks` and `click_links` books in Stacks, handles CRUD, enforces immutability (goal frozen after create, conclusion write-once), and validates status transitions (live→parked→live, live/parked→concluded/dropped). Registers its books with Stacks at guild init. Follows the Clerk plugin as architectural reference.

**Depends on:** Nothing. This is the foundation.

**Delivers:**
- Ratchet plugin (`packages/plugins/ratchet/` or similar)
- `clicks` book in Stacks (schema as specified in assessment)
- `click_links` book in Stacks
- Ratchet API: create, update-status, conclude, drop, reparent, link operations
- Status transition enforcement (live | parked | concluded | dropped)
- Immutability enforcement (goal cannot change after creation; conclusion is write-once)
- CDC events emitted through Stacks for all mutations (Laboratory can observe)

**Does NOT deliver:** CLI, Oculus view, migration. This is the apparatus + data layer only.

**Estimated complexity:** Medium. Schema is simple; the plugin pattern is established (Clerk is the reference). Main design work is ensuring the Stacks book registration API generalizes cleanly for a second plugin (Clerk is currently the primary consumer), and the immutability constraints.

## Package 2: Click CLI commands

**What:** `nsg click` subcommand tree contributed by the Ratchet plugin. All commands listed in the assessment CLI surface sketch.

**Depends on:** Package 1 (Ratchet apparatus must exist to call into).

**Delivers:**
- `nsg click create --goal "..." [--parent <id>]`
- `nsg click show --id <id>`
- `nsg click list [--status ...] [--root <id>] [--limit N]`
- `nsg click tree [--root <id>] [--status ...] [--depth N]` — tree renderer with status indicators
- `nsg click extract --id <id> [--full] [--format md|json]` — subtree-as-document
- `nsg click park/resume/conclude/drop --id <id> [--conclusion "..."]`
- `nsg click link --from <id> --to <id> --type <type>`
- `nsg click reparent --id <id> --parent <id> [--orphan]`
- `nsg click commission --id <id> --conclusion "..." --brief "..."` — sugar that concludes + posts commission + creates link
- Short ID prefix matching on all `--id` parameters

**Does NOT deliver:** Oculus view, migration.

**Estimated complexity:** Medium-high. Many commands, but each is thin (validate args, call plugin, format output). The `tree` and `extract` renderers are the most involved pieces. Short ID resolution needs a prefix-match query helper.

## Package 3: Oculus click view

**What:** Purpose-built click visualization in Oculus. NOT a table — a tree or graph view. Reads from Ratchet's Stacks books.

**Depends on:** Package 1 (Ratchet apparatus must exist; needs data to display).

**Delivers:**
- Click tree view with expandable nesting (full depth, not one-level)
- Status indicators per node (live/parked/concluded/dropped with distinct visual treatment)
- Goal visible at each node without drilling in
- Conclusion visible on hover/click/pane for concluded/dropped nodes
- Cross-substrate links visible (click → writ references)
- Copyable click IDs
- Filter by status, root node

**Stretch / future:**
- Graph visualization (nodes + edges) — may be a follow-up commission
- Drag-and-drop reparenting
- Notecard-style spatial arrangement

**Does NOT deliver:** Migration, CLI.

**Estimated complexity:** Medium-high. The tree renderer is the core; Oculus already has component patterns to follow. The graph visualization (Sean's dream view) is probably a separate follow-up unless it's cheap to prototype.

## Package 4: Migration from quest writs to clicks

**What:** Migrate existing quest writ data from Clerk's writs book into Ratchet's clicks book. Map quest writs to clicks, preserve tree structure, map statuses, extract goals from bodies.

**Depends on:** Package 1 (Ratchet apparatus must exist as target), Package 2 (nice-to-have for verification via CLI but not strictly required).

**Delivers:**
- Migration script that reads all `quest` type writs from Clerk books
- Maps each quest to a click: extracts goal from body (first line or Goal section), maps status (`open→live`, `completed→concluded`, `cancelled→dropped`), preserves parent-child relationships
- For concluded/dropped quests: extracts conclusion from body (resolution field or final status section)
- Preserves created_at timestamps
- Cross-references: creates `click_links` entries for any writ references found in quest bodies (best-effort extraction)
- Verification report: before/after counts, orphan check, tree integrity check
- Deprecation of `quest` writ type from guild.json after migration

**Does NOT deliver:** Removal of quest files from vibers repo (separate cleanup), Oculus view, historical quest body archival (bodies are already in git history via vibers repo).

**Estimated complexity:** Medium. The mapping is straightforward for most quests. The tricky part is extracting goals and conclusions from free-form quest bodies — some will need manual review. A "migration review" pass with Coco is probably needed after the script runs.

## Package 5: Coco integration (skill + habits)

**What:** Update Coco's quest skill, startup ritual, and session habits to use clicks instead of quests.

**Depends on:** Packages 1-2 (Ratchet apparatus + CLI must exist). Package 4 (migration should be done so the data is there).

**Delivers:**
- New `.claude/skills/clicks/SKILL.md` replacing the quest skill
- Updated Coco agent file: startup uses `nsg click tree` instead of `nsg writ list --type quest`
- Session checkpoint discipline: at natural conversation seams, create clicks for decisions reached
- Wrap-up ritual: simplified (no bodies to update, no files to snapshot)
- Retirement of `.claude/skills/quests/SKILL.md`

**Does NOT deliver:** This is a documentation/configuration change, not code.

**Estimated complexity:** Low. Mostly writing skill docs and updating agent instructions.

---

## Recommended sequencing

```
Package 1 (Ratchet apparatus)   ← commission first, foundation
    │
    ├── Package 2 (CLI)         ← commission after P1 lands
    │       │
    │       └── Package 5 (Coco integration) ← after P2, needs working CLI
    │
    ├── Package 3 (Oculus view) ← can parallel with P2
    │
    └── Package 4 (migration)   ← after P1, before P5
```

**Critical path:** P1 → P2 → P5. Once P2 lands, Coco can start using clicks for new work even before migration (P4) or Oculus (P3).

**Parallelizable:** P3 (Oculus) can run in parallel with P2+P4 once P1 is done.

**Total estimated commissions:** 5 (possibly 6 if the Oculus graph view splits from the Oculus tree view).
