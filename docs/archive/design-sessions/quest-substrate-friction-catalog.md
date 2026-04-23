# Quest-substrate friction catalog — working draft

**Context:** Starting draft for pilgrimage quest `w-mo0gias9` ("Pilgrimage: explore alternative storage for quests beyond writs"). Collected from (1) the pilgrimage quest body itself, (2) the quest tree under `w-mo0ffbff` and siblings, and (3) recent Coco transcripts (2026-04-10 through 2026-04-15). Organized by surface, not yet categorized as removable-vs-structural.

**Next step:** Interview pass with Sean to fill blind spots and add Sean-specific Oculus/workflow frictions, then the removable-vs-structural sort.

---

## A. CLI surface

**A1. Constant `nsg writ` → "I'm working on a quest" translation tax.**
Every quest operation routes through `nsg writ list/show/edit`. Coco's muscle memory wants to type `nsg quest …` and has to be corrected. Low-per-op cost, high frequency. *(Source: quest body "What the friction feels like in practice"; the existence of `w-mnt106rv` quest-helper CLI wrapper is a direct symptom.)*

**A2. No `nsg writ edit --parent-id` for non-new writs.**
Re-parenting is a recurring operation during quest reorganization (umbrella moves, promotion/demotion between levels). Not supported on live writs today — tracked as its own quest `w-mo0ffwwc` ("CLI: re-parent writs in any status"). Called out in session `cc54f34a` as "a clearly recurring friction point, not a one-off."

**A3. Body edits are heavy when done through the CLI.**
Historical: `nsg writ edit --body "$(cat <<EOF…)"` round-trip was heavy enough to discourage synthesis. *Dissolved* by file-canonical bodies (`w-mnt0jin1`), but worth keeping on the catalog as a "friction the substrate created and a convention layer solved" — informs the removable-vs-structural axis.

**A4. The closure ritual is multi-step and bespoke.**
File-canonical closure requires: finalize file → snapshot to row via `nsg writ edit --body` → `nsg writ complete/cancel/fail` → delete file → commit. Four separate operations that can't be atomic from `nsg`. Tracked as `w-mnt106rv` wrapper.

## B. Status model

**B1. The six-state model is obligation-shaped; three states fit quests awkwardly.**
`new | open | stuck | completed | failed | cancelled` — designed for obligation lifecycle. For quests:
- `stuck` — no meaning ("what does 'stuck on a quest' mean? there's no escalation channel")
- `failed` — no meaning ("what's a failed inquiry?")
- `completed` — carries task-done connotation; inquiries *conclude with a verdict*, which isn't the same thing

**B2. The model collapses to two states in practice.**
"We use `open` for everything live, which collapses the model to effectively two states (`open` / `closed-of-some-kind`), defeating the six-value design intent."

**B3. Quest status hints desired shape: `live | parked | concluded`.**
Three states, with `parked` as a first-class terminal-ish state. Would let Coco distinguish "quest is dormant on purpose" from "quest is stalled." Currently impossible; both look like `open`.

**B4. "Parking lot confound" — no distinction between dormant-on-purpose and stalled.**
Transcript 166741dd names this as one of three "broken layers" of the quest rollout. Sean pushed back on bulk-cancelling old April-10 imports because they were parked-with-intent, not clutter. Destroying captured thinking because the list looks cluttered is the wrong tradeoff — but without a `parked` state, the system can't tell the difference.

## C. Oculus / UI surface

**C1. Oculus dashboards are obligation-shaped; quests don't appear meaningfully.**
"The Oculus view is effectively unused for quests. Quests don't appear on the dashboards Sean looks at because the dashboards are built around obligation lifecycle." The "writs get the Oculus for free" benefit of the original insight *didn't actually land* for the quest subtype.

**C2. Status pills read "stalled mandate" for live quests.**
"A quest sitting 'open' indefinitely reads as a stalled mandate, not a live area of inquiry. Status pills convey 'hasn't moved in N days, should it be stuck?' rather than 'standing thread.'"

**C3. Quest work happens entirely outside the Oculus.**
Chat + filesystem + CLI; the database serves only as the canonical store. The visibility-to-patron win that justified the writ-substrate decision hasn't materialized.

## D. Vocabulary surface

**D1. "Quest" carries heroic-journey connotations that overshoot mundane reality.**
Standalone quest `w-mnsx3onr` exists specifically for this. Candidates floated: `sketch`, `jotting`, `scribble`.

**D2. It's unclear whether the word is wrong, the concept is wrong, or the word-concept fit is wrong.**
The vocabulary quest and the pilgrimage quest may be two faces of the same structural question.

## E. Body/row storage

**E1. Body/row split ergonomics — stub-in-row, real-body-in-file dance.**
File-canonical (`w-mnt0jin1`) shipped, but the writ substrate still wants a row body, so every live quest carries a duplicate generic stub. Not catastrophic; it's a *tell* that the fit isn't native.

**E2. The row-body-edit trap.**
Nothing prevents a future session from calling `nsg writ edit --body` on a live quest and silently overwriting the stub. Mitigated by warning comments but unenforced.

**E3. Row and file are two places of truth during a quest's life.**
Goal section is duplicated into both; Status is a column AND sometimes referenced in the file body. Every edit creates a risk of drift.

## F. Tree / parent-child semantics

**F1. Parent/child is overloaded: decomposition vs conceptual grouping.**
Writs use `parentId` for decomposition ("sub-mandate is work toward the mandate"); quests use it for both decomposition *and* umbrella grouping ("this is a sub-inquiry under a topic"). Same primitive, two semantics. Standalone quest `w-mnsx9lbz` ("Parent-child relationship semantics — three meanings, one primitive").

**F2. No discovery ritual — flat listing scales badly.**
Transcript 166741dd's quest-rollout diagnosis named "no discovery ritual" as one of the three broken layers. The pilgrimage's sibling `w-mo0ffnhw` ("Use top-level quests as focusing tool") is the workflow fix proposal. Root cause: no view that distinguishes "stuff worth surfacing at orientation" from "stuff reachable via parent traversal."

**F3. Premature umbrella risk.**
One-child umbrellas get opened and immediately cancelled (see `w-mo0ffh3c`). The tree invites them because parent-child is the only grouping primitive.

## G. Event / history surface

**G1. No event-log layer for quest state-over-time.**
The body synthesizes the *current picture*; the timeline of how it got there is not captured queryably. Standalone quest `w-mnt0i31e` ("Event-log layer for quest writs") exists for this. Writs' existing CDC events cover lifecycle (created, status changed) but not decisions, re-parenting, edit messages.

**G2. Decisions live as prose inside bodies, only discoverable by grep.**
Standalone quest `w-mnswwzdv` ("Decisions & ratification") tracks this. Downstream consumer of any event-log design.

## H. Observability / staleness

**H1. Stale state gets hidden under tidy parents.**
The anti-hiding discipline in `w-mo0ffnhw` exists because nested quest trees can bury decaying planning under a pretty umbrella label. Named failure mode, not a theoretical one.

**H2. Self-stale quest bodies — "Status:" headers drift.**
Multiple transcript incidents (sessions `5ae4c570`, `cc54f34a`) of Coco repeating a stale `## Status` line because a later section had the actual current state. Convention-layer problem, not framework — but it happens because the body is synthesis-by-hand.

**H3. Row-level metadata (title, status) and file-level narrative can drift out of sync.**
No mechanical coupling — if the file says "concluded with verdict X" but the row is still `open`, nothing reconciles it.

## I. Dispatch / guild-integration friction

**I1. No dispatch → inert-by-construction is a feature, not a bug.**
Worth naming as a *non-friction* because it's load-bearing for the substrate decision: the quest-as-writ-type insight depended on writ types with no rig template being inert. Keep in the catalog so the weighing step doesn't accidentally discard it.

**I2. Laboratory/CDC only sees lifecycle events, not body edits.**
Body changes on disk don't emit CDC. Lab observability for quest work is thin compared to obligation work.

---

## C (continued) — Oculus / UI surface (from interview)

**C5. Writ ID not copyable from table; not shown on detail page.**
Click events on the table capture the interaction, preventing copy. The detail/drawer view also doesn't expose the ID. Cross-cutting (affects all writ types), but quests surface it more because quest IDs are referenced constantly in chat.

**C6. Writ type filter defaults to mandates, can't multi-select.**
Sean often wants mandates + briefs together. Changing filter to "Quest" is an extra step, and you can't see quests alongside mandates. The default privileges obligations.

**C7. Astrolabe tab status column "always seems wrong."**
Not quest-specific, but contributes to the general sense that Oculus status indicators aren't trustworthy. Plandoc details are actually good when you drill in — the summary view misleads.

**C8. Quest nesting only shows one level deep.**
Quests use 2-3 levels of tree depth (umbrella → area → specific question). Only one level of nesting is visible. The tree — which is the primary value of quests per Sean — is flattened.

**C9. Dream view is a graph, not a table.**
Sean's wand-wave answer: a graph visualization with quests as nodes, relationships as edges, tooltip/pane access to goal and status. Possibly drag-and-drop rearrangement, notecard-style grouping. The table shape is fundamentally wrong for how the patron thinks about quests.

## E (continued) — Body/row storage (from interview)

**E4. Quest files named by ID — opaque to human filesystem browsing.**
`w-mo0gias9-e6a2a5553973.md` on disk. Can't tell what a quest is about without opening it. The title lives on line 1 of the file, not in the filename.

**E5. Coco's synthesis doesn't reliably reflect Sean's actual takeaways.**
Coco emphasizes and concludes differently than Sean would. The quest body is Coco's interpretation, not Sean's — and Sean can't easily verify or correct it because the bodies are long and hard to navigate.

**E6. Template optimized for synthesis documents; patron wants decision-nodes in a tree.**
Goal / Status / Next Steps / Context / References / Notes is a thesis shape. Sean wants a checklist shape: one-line goal, status sentence, linked items, and 1-3 paragraph decision rationale when concluded. The value lives in the *structure* (tree, relationships), not the *prose*.

## F (continued) — Tree / promotion (from interview)

**F4. The tree structure is the primary value — more "checklist" than "thesis."**
Identifying groupings, creating umbrellas, parenting smaller quests under larger areas of inquiry — this is where quests earn their keep. Hierarchy expressing dependencies and relationships. The map of the problem space, not the territory.

**F5. Quest→commission handoff is manual copy-paste with no linking.**
Coco writes a brief → Sean copy-pastes into Oculus → extracts title → posts. Then gives Coco the generated writ ID. No link back to the originating quest. Context transfer quality is a black box.

**F6. No promotion workflow — dispatch-candidates sitting in quests.**
Session 166741dd found 7 of 29 quests were actually dispatchable work. No ritual or mechanism for promoting a mature quest into a commission.

## J. Agent interaction surface (from interview)

**J1. Coco hesitates to load quest context; continuity leaks back to patron.**
Coco reads a bare minimum of quest bodies at session start. Sean ends up being the one remembering what's in flight and prompting Coco to retrieve specific things. The continuity mechanism is leaking continuity back onto the human — the opposite of its purpose.

**J2. No non-Coco agent has ever accessed a quest.**
The "visible to autonomous planning agents" benefit from the original quest-substrate rationale is completely unrealized.

**J3. CLI tool-call failures from non-standard `nsg` conventions.**
`nsg` is generic over tool APIs, meaning it doesn't always follow normal CLI conventions. E.g., `nsg writ-show <id>` fails; you need `nsg writ-show --writ-id <id>`. Coco fails tool calls regularly. Cross-cutting but quests pay the tax most because quest operations are the most frequent CLI usage.

**J4. Coco-Sean dyad bad at scope closure; quests accumulate narrative instead of decisions.**
Sean generates alternatives and novel approaches; Coco "yes-ands" them. Neither puts boundaries in or closes scope. Quests absorb the resulting open-ended exploration as running narrative rather than capturing small decisions and spawning children for undecided items.

**J5. Quest bodies are Coco-to-Coco artifacts that neither party reliably reads.**
Sean doesn't read them (filtered through Coco). Coco hesitates to read them (context cost). The document exists but doesn't serve either end of the collaboration.

## K. ID ergonomics (from interview)

**K1. IDs cumbersome for humans; short form used in conversation, full form required by tooling.**
`w-mo0gias9` in chat, `w-mo0gias9-e6a2a5553973` required by `nsg`. Cross-cutting, but quests surface it constantly because quest IDs appear in every Coco session. Adds to the "opaque naming" problem (see E4).

---

## Quick stats (updated post-interview)

- **Items:** 38 (across 11 surfaces: A-K)
- **Pre-interview items:** 21 | **Interview-surfaced items:** 17
- **Items with their own standalone quest:** 8 (A1, A2, B1, D1, E1/E2, F1, F2, G1, G2)
- **Items dissolved by a convention-layer fix:** 2 (A3, concurrent-writes)
- **Items that look structural on first read:** B1–B4, C1–C3, C8–C9, E5–E6, F1, F4, J1, J4–J5
- **Items that look removable-in-place:** A1, A2, A4, C5–C7, E2, E4, F2, F3, H1, K1
- **Items genuinely unsure:** D1/D2, E1/E3, F5/F6, G1/G2, H2/H3, J2, J3

## Interview coverage (2026-04-16)

- **Covered:** Oculus (deep), quest→commission handoff, non-Coco agent access, Coco-as-interface model, body verbosity/template shape, scope closure dynamics, ID ergonomics, CLI friction, quest body audience problem
- **Not probed (low priority):** multi-guild visibility (no signal it matters yet), backup/export/portability, link model details (Sean confirmed links aren't visible/used anyway)

---

## Emerging themes from interview

1. **The tree is the product, not the prose.** Sean's primary value from quests is the hierarchical map of the problem space — umbrellas, groupings, parent-child relationships. The body content is secondary at best, noise at worst. This inverts the original design assumption (bodies are the primary artifact, tree is the organizational mechanism).

2. **"Coco as sole interface" works conceptually but fails in practice.** Coco doesn't load enough context; Sean ends up doing the remembering. The intermediation that was supposed to shield Sean from substrate complexity instead creates an opaque layer where Sean can't verify Coco's interpretations.

3. **The obligation model leaks everywhere.** Status model, Oculus views, default filters, status pills, nesting depth — the writ substrate's obligation assumptions show up in every surface quests touch. Each is individually patchable; collectively they suggest the substrate is pulling toward its designed purpose.

4. **Quests want to be small, linked, and structured; they're currently big, isolated, and narrative.** The ideal shape (one-line goal, status sentence, linked items, brief decision rationale) is almost the opposite of the current template (six-section synthesis document).

5. **The promotion boundary is undesigned.** Quest→commission is manual copy-paste through Coco with no linking back. The system has no concept of "this inquiry produced this work."

## Design direction emerging from interview + analysis (2026-04-16)

### The click model — Ratchet apparatus

**Ratchet** — the apparatus (new framework plugin, peer to Clerk/Spider/Astrolabe). The mechanism that advances forward. Owns the clicks book in Stacks, enforces immutability and status transitions, exposes the click API.

**Click** — the record type. The sound of a decision snapping into place. Each click is one irreversible advancement of the ratchet.

**Core concept:** Replace heavy synthesis-document quests with atomic, immutable decision-nodes in a tree. The tree is the product; prose is minimal. Exploration lives in transcripts; the click tree captures the *decisions* that exploration produced.

**Architecture:** Ratchet is a separate plugin from Clerk. Clerk manages obligations (writs); Ratchet manages inquiry (clicks). They share the Stacks storage layer but are separate concerns. Cross-substrate links (click → writ) are typed references.

**Data model:**

```
clicks (Ratchet's Stacks book)
├── id                    (string, generated)
├── parent_id             (string, nullable — null = root)
├── goal                  (string, immutable after creation)
├── status                (enum: live | parked | concluded | dropped)
├── conclusion            (string, nullable — write-once at resolution)
├── created_session_id    (string — Claude session ID)
├── resolved_session_id   (string, nullable — session ID at conclusion/drop)
├── created_at            (timestamp)
├── resolved_at           (timestamp, nullable)

click_links
├── source_id             (string, FK to clicks)
├── target_id             (string — can be click ID or writ ID, cross-substrate)
├── link_type             (enum: related | commissioned | supersedes | depends-on)
├── created_at            (timestamp)
```

**Key properties:**
- Immutable on create: goal never changes. Drop and reframe if wrong.
- Append-only conclusion: write-once at resolution. 1-3 paragraphs of rationale.
- No body editing, no file-canonical dance, no closure ritual.
- Four statuses: live | parked | concluded | dropped.
- Cross-substrate links: clicks can link to writs (mandates, briefs) via `commissioned` link type.
- Children are the todo list: open questions become child clicks, not prose sections.
- Boundary: clicks are always questions/inquiries, never tasks. Tasks are mandates (writs).

**Boundary principle:** clicks are always questions/inquiries, never tasks. Tasks are mandates (writs). A click's conclusion may *imply* work, which becomes a commission linked back via `commissioned`. The click tree is the reasoning record; the writ tree is the work record.

**CLI surface:**

```bash
# Create
nsg click create --goal "Should we migrate to a Stacks book?" [--parent <id>]

# Navigate
nsg click tree [--root <id>] [--status live] [--depth 3]
nsg click show --id <id>
nsg click list [--status live] [--root <id>] [--limit 100]
nsg click extract --id <id> [--full]    # subtree as structured document

# Lifecycle
nsg click park --id <id>
nsg click resume --id <id>
nsg click conclude --id <id> --conclusion "..."
nsg click drop --id <id> --conclusion "..."

# Links and structure
nsg click link --from <id> --to <id> --type related
nsg click commission --id <id> --conclusion "..." --brief "..."
nsg click reparent --id <id> --parent <new-parent-id>
```

**Short IDs everywhere:** CLI accepts prefix matches (e.g., `w-mo0gias9`), errors on ambiguity.

**`extract` is the continuity mechanism:** renders a subtree as a structured markdown document on demand. Always current by construction. Replaces file-canonical quest bodies as the way Coco loads context.

**Catalog items dissolved by the click model:** A3, A4, B1-B4, C1-C3, C8, D1-D2, E1-E5, E6, F1, H2, H3, J4, J5 — roughly 20 of 38 items eliminated by the shape change alone.

### What the click model does NOT solve (still needs work)

- **C5, C6, C9** — Oculus needs a purpose-built click view (graph, not table). Separate commission.
- **C7** — Astrolabe tab status is its own bug.
- **F2** — Discovery/orientation ritual still needs design (but `nsg click tree` is a much better primitive than `nsg writ list`).
- **J1** — Coco loading enough context at startup. `extract` helps but the habit needs to change too.
- **J3** — CLI convention friction. Addressed by click having its own native CLI, but `nsg` baseline conventions still need attention.
- **K1** — Short ID support. Designed into the click CLI; needs implementation.

## Session carryover notes

- Parent quest: `w-mo0gias9-e6a2a5553973` (pilgrimage)
- Umbrella: `w-mo0ffbff-1f1af99fe6c8` (Improvements to the quest system)
- Interview completed 2026-04-16 with Sean (5 batches).
- Post-interview analysis converged on the **click model**: atomic immutable decision-nodes in a tree, stored as a new Stacks book, with cross-substrate links to writs.
- Name adopted: **click** (the sound of a decision snapping into place).
- **Next step:** Write the pilgrimage assessment as a formal design note. The recommendation is "migrate" — new substrate (Stacks book), new shape (click tree), new CLI. The friction catalog and interview are the evidence base. Then scope the implementation as a commission (or series of commissions).
- Output of the pilgrimage is a written assessment, not implementation.
