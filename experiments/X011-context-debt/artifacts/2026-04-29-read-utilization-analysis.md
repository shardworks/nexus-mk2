# Read Utilization Analysis — Implementer Pure-Read Bloat

**Date:** 2026-04-29
**Question:** Of the files the implementer Reads into context during a session,
which ones are actually edited or otherwise used to inform changes — and which
ones are pulled into context but never touched (pure context bloat)?

**Click:** Companion to the Apr 29 cost-optimization landscape under
`c-mok4nke6` — empirical motivation for Category 2 (Spec & inventory format)
and Priority 1 (Inventory excerpting).

## Method

For two recent implement transcripts, walk the tool call sequence:

1. Extract every `Read` call with file path and result size.
2. Extract every `Edit` and `Write` call, and any Bash call that modifies
   files (rm, mv, sed -i, git rm, etc.).
3. Classify each Read against subsequent modifications:
   - **Read AND edited** — file was Read, then later Edit/Written (legitimate work)
   - **Read AND bash-modified** — file was Read, then deleted/moved/sed-i'd via Bash
   - **Read but NEVER touched** — pure context bloat
4. Compute per-category breakdowns and total token weights.

Script: `scripts/h4_read_utilization.py`.

## Results

### Rig 1 — Vision-Keeper Cleanup (mechanical task)

| Category | Bytes | Files |
|---|---:|---:|
| Total Read content | 143,751 | 11 |
| Read AND edited | 140,997 | 10 |
| Read but NEVER touched | **2,754 (1.9%)** | **1** |

The single pure-read file was `docs/architecture/plugins.md` (Read twice
during exploration, never edited).

The implementer was efficient: it read what it needed to edit, with
minimal exploratory reads that didn't pay off in changes.

### Rig 2 — Reckoner Tick (substantive code change)

| Category | Bytes | Files |
|---|---:|---:|
| Total Read content | 458,640 | 21 |
| Read AND edited | 233,544 | 8 |
| Read but NEVER touched | **225,096 (49.1%)** | **13** |

Pure-read content was **~56K tokens** that sat in context for the rest
of the session. Across 147 turns of cumulative replay, this contributed
~8M cache reads — roughly **20% of the rig's total cache-read cost**.

Top pure-read files (read, never touched):

| File | Chars | Category |
|---|---:|---|
| `docs/architecture/reckonings-book.md` | 61,732 | doc |
| `clockworks/src/clockworks.ts` | 43,517 | source |
| `reckoner/src/reckoner.test.ts` | 33,684 | test |
| `clockworks/src/types.ts` | 26,952 | source |
| `clockworks/src/summon-relay.ts` | 23,021 | source |
| `reckoner/README.md` | 9,952 | doc |
| `clockworks/src/relay.ts` | 8,620 | source |
| `vision-keeper/src/decline-relay.ts` | 8,181 | source |
| (5 smaller files) | ~13K | mixed |

## The mechanism — astrolabe inventory format

Reading the inventory section of rig 2's plan (`nsg plan show
w-moiy8hkv`) reveals the source of the bloat:

The reader-analyst's inventory contains explicit sections directing the
implementer to read files for understanding, not for editing:

- **"Key types and interfaces (read-points, not copied verbatim)"** —
  lists files the implementer should consult for type definitions,
  citing path + line number rather than inlining the type:
  - `clockworks/src/relay.ts` for `RelayDefinition`, `RelayHandler`, etc.
  - `clockworks/src/types.ts` for `StandingOrder`, `ClockworksKit`
  - `reckoner/src/types.ts` for `Scheduler`, `SchedulerInput`, etc.

- **"Adjacent patterns"** — lists files the implementer should study as
  reference implementations:
  - `clockworks/src/summon-relay.ts` ("the template")
  - `vision-keeper/src/decline-relay.ts` ("much narrower")

- **"Affected files"** entries marked "no changes expected" still get
  Read by curious implementers:
  - `reckoner/src/index.ts` — "no changes expected"
  - `reckoner/src/reckoner.test.ts` — "(not opened) ... should pass unchanged"
  - `reckoner/src/schedulers/always-approve.ts` — "no changes"
  - `reckoner/package.json` — "no changes expected"

The implementer Read every single one. The inventory format communicates
"go look at this file" when what the implementer actually needs is "here's
the type signature" or "here's the pattern in 30 lines." Files are 10-100×
larger than their relevant excerpts.

A few additional observations:

- `vision-keeper/src/decline-relay.ts` was cited as a pattern even though
  vision-keeper was about to be deleted in the parallel rig 1 commission.
  Vestigial pattern reference — no detection mechanism caught it.
- `reckoner.test.ts` was Read (33K chars) despite being explicitly noted
  "(not opened) ... should pass unchanged." The implementer opened it
  anyway, presumably to confirm it didn't reference the deleted CDC code.

## Why rig 1 didn't suffer

Rig 1's task was mechanical: delete a plugin, rename strings, rewrite §11
of a doc. The inventory for that kind of task names files-to-modify, not
files-to-understand. Almost every Read mapped 1:1 to a subsequent Edit.

Substantive code changes (rig 2 type) are where the inventory pattern
bites. The agent legitimately needs to know how clockworks works to
register a tick relay correctly. The current inventory format conveys
that need by directing full-file Reads.

## Estimated savings if inventory was excerpted

For rig 2, replacing 56K tokens of pure-read content with ~5K of inline
excerpts:

- Final context: 375K → ~324K (drop ~51K)
- Average context per turn: 266K → ~230K
- Cumulative cache reads: 40.8M → ~33M
- Cost: $25.86 → ~$21 (saves ~$5, ~20%)

## Implications

1. **The inventory pattern is a structural cost driver for substantive
   commissions.** It doesn't show up in cleanup-style work.
2. **The fix is purely sage-side prompt work.** The reader-analyst /
   sage-writer should inline excerpts rather than emit pointers. No
   architecture changes, no engine restructure.
3. **This is a separate cost lever from H4 (handoff splitting).** They
   compound — H4 reduces carry-forward replay cost; inventory excerpting
   reduces what gets carried forward in the first place.

The Apr 29 cost-optimization landscape (`c-mok4nke6`) tags this as
**Priority 1 — Inventory excerpting**, bundling four ideas:

- Inline type signatures (idea #3, click `c-mok4qbtb`)
- Inline pattern templates (idea #4, click `c-mok4qc82`)
- "Do not Read" markers (idea #5, click `c-mok4qcmz`)
- Pre-quote source excerpts (idea #7, click `c-mok4qdh4`)

## Caveats

1. **N=2 sessions.** This finding is striking but the sample is tiny.
   Broadening to more substantive-code-change implements would confirm
   whether 49% pure-read share is typical or extreme.
2. **The classification doesn't account for "Read for context-setting
   that informed an edit but didn't directly map to one."** Some pure-reads
   may be legitimately useful — the agent reads X, doesn't edit X but
   makes a smarter edit to Y because of what it learned in X. We can't
   distinguish that from pure waste mechanically.
3. **Vestigial cleanup signal isn't free.** The reader-analyst would
   need access to a "files about to be deleted in concurrent commissions"
   index, which we don't have today.

## Data Sources

- Analysis script: `scripts/h4_read_utilization.py`
- Rig 1 transcript: see X010 simulation artifact (same path)
- Rig 2 transcript: see X010 simulation artifact (same path)
- Rig 2 inventory: `nsg plan show w-moiy8hkv-dfb884cac01b`
