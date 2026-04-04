# doc-update-pass — Decisions

## D1: CLI README — replace aspirational section, don't annotate it

**Options considered:**
- (A) Add "(not yet implemented)" annotations to each aspirational command
- (B) Replace the entire Standard Guild Commands section with actual tools

**Decision: B.** The aspirational commands reference a `nexus-stdlib` package that was never created and isn't on any roadmap. Annotating phantom commands adds clutter without value. The section should document what exists. If future tools are added, the README gets updated with the implementing commission.

## D2: CLI README — `commission-post` stays flat, not grouped under `writ`

The actual tool name in clerk is `commission-post`, not `writ-post`. Since there's only one `commission-*` tool, auto-grouping won't activate — it renders as `nsg commission-post`, not `nsg commission post`. The README documents the actual CLI surface (`nsg commission-post`), not a wished-for grouping.

## D3: review-loop.md — no changes, already correct

The brief describes a stale Decision section ("Adopt both Option A and Option B"). The current file already has Option B as the sole chosen design with no mention of Option A. The file was revised between when the brief was written and when this commission started. No action needed.

## D4: _agent-context.md — update summaries, preserve session history

The file has two kinds of content: (1) summary sections (package table, implemented/aspirational lists, terminology table, key files) that agents use for orientation, and (2) session notes and design decisions that are historical records of past sessions.

**Decision:** Update the summary sections to reflect current reality. Leave session notes and design decisions untouched — they describe what was true at the time and are useful as historical context. Falsifying them would remove the only record of how and why decisions were made.

## D5: _agent-context.md — scope of freshness audit

The brief asks for a "broader freshness audit" beyond the specific line-108 reference. The audit covers: package table, implemented/aspirational sections, terminology table, key files table, rig terminology collision section, and architecture doc status table. This is every summary section in the file.

Sections explicitly excluded: guild.json shape (not flagged, needs type-level verification), session notes, design decisions (historical — see D4).
