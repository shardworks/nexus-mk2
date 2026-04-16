# Pilgrimage assessment: quest substrate migration to the click model

**Quest:** `w-mo0gias9` — Pilgrimage: explore alternative storage for quests beyond writs
**Date:** 2026-04-16
**Session:** `0f6580e9-2f6f-48a9-9669-14d11161734e`
**Recommendation:** Migrate. Build the Ratchet apparatus — a new plugin owning a clicks book in Stacks — with a dedicated CLI and Oculus view.

## Summary

The writ substrate's obligation semantics are structural, not removable. Five days of serious quest usage, a 38-item friction catalog, and a patron interview converge on the same finding: **the tree is the product, not the prose.** The current quest system optimizes for synthesis documents that neither the patron nor the agent reliably reads. The replacement — atomic, immutable decision-nodes in a tree ("clicks") — aligns with how quests actually produce value: small decisions, captured briefly, structured by hierarchy.

## Background

Quests were introduced as a `quest` writ type on the existing writ substrate (`w-mnswvmj7`). The core insight was sound: an unmapped writ type inherits tree, CDC, lifecycle, CLI, and UI for free, while remaining inert (no dispatch). This shipped fast and delivered real value for session continuity.

After ~5 days of serious use, Sean flagged friction in the Oculus UI, CLI, status model, and vocabulary. Quest `w-mo0gias9` was opened as a pilgrimage — an exploratory inquiry producing a written assessment, not code.

## Evidence

### Friction catalog

38 items cataloged across 11 surfaces (CLI, status model, Oculus/UI, vocabulary, body/row storage, tree semantics, event/history, observability, dispatch/integration, agent interaction, ID ergonomics). Full catalog: `.scratch/quest-substrate-friction-catalog.md`.

Key structural frictions (not removable by plugin/convention fixes):
- **Status model** (B1-B4): six obligation-shaped states collapse to two in practice for quests. Three states (`stuck`, `failed`, `completed`) have no meaningful quest interpretation.
- **Oculus** (C1-C3, C8-C9): dashboards built for obligation lifecycle; quests are invisible or misleading. Only one level of nesting visible; patron wants a graph view, not a table.
- **Body shape** (E5-E6): template optimized for synthesis documents; patron wants decision-nodes. Bodies are Coco-to-Coco artifacts neither party reads (J5).
- **Parent/child overload** (F1): decomposition vs. conceptual grouping share one primitive.
- **Continuity leak** (J1): Coco hesitates to load quest context; the patron ends up doing the remembering — the opposite of the system's purpose.

### Patron interview (2026-04-16)

Five-batch structured interview with Sean. Key findings:

1. **The tree is the product.** Primary value is the hierarchical map of the problem space — umbrellas, groupings, parent-child relationships. More "checklist" than "thesis."
2. **Quest interaction is 99.9% through Coco.** Sean rarely opens the quest tab in Oculus.
3. **"A lot of prose that nobody reads."** Neither Sean nor Coco reliably consumes the six-section quest bodies.
4. **Ideal shape: small decisions, captured briefly, structured by hierarchy.** 1-3 paragraph conclusion when a question is answered; spawn children for undecided sub-questions.
5. **The Coco-Sean dyad is bad at scope closure.** Neither party puts boundaries in; quests absorb open-ended exploration as narrative.

### Replay test

Replayed the quest-system restructure from session `166741dd` (2026-04-15) through the click model. Results: orientation dramatically faster (one `click tree` call vs. N file reads), decisions captured as atomic records instead of prose sections, umbrella creation/cancellation nearly frictionless, session wrap-up largely eliminated as a ritual. Two creak points identified (retroactive click-creation discipline, goal/conclusion accuracy) — both are habit problems, not model problems.

## The click model

### Core concept

Replace heavy synthesis-document quests with atomic, immutable decision-nodes in a tree. Each node ("click") captures one question and, when resolved, one decision. The tree structure expresses decomposition and relationships. Exploration lives in session transcripts (joinable via session ID); the click tree captures the decisions that exploration produced.

### Names

**Ratchet** — the apparatus (plugin). The mechanism that advances forward, one click at a time. Owns the clicks book in Stacks, enforces immutability and status transitions, exposes the click API. Analogous to Clerk (which owns writs) but for the inquiry/decision domain.

**Click** — the record type. The sound of a decision snapping into place. Each click is one irreversible advancement of the ratchet: small, permanent, accumulating into progress.

### Architecture

Ratchet is a **new framework plugin** — a peer to Clerk, Spider, Astrolabe, etc. It follows the same pattern as Clerk:

- Registers its books (`clicks`, `click_links`) with Stacks at guild init
- Owns all business logic: immutability enforcement, status transitions, link validation
- Exposes an API that other plugins and CLI commands call into
- Emits mutations through Stacks, giving Laboratory CDC observation for free
- Contributes CLI commands under `nsg click`

Ratchet does NOT live inside Clerk or Stacks. Clerk manages obligations (writs); Ratchet manages inquiry (clicks). They are separate concerns in separate plugins, sharing only the Stacks storage layer. Cross-substrate links (click → writ) are typed references, not shared tables.

### Data model

```
clicks (Ratchet's Stacks book)
├── id                    (string, generated)
├── parent_id             (string, nullable — null = root)
├── goal                  (string, immutable after creation)
├── status                (enum: live | parked | concluded | dropped)
├── conclusion            (string, nullable — write-once, required for concluded/dropped)
├── created_session_id    (string — Claude session ID at creation)
├── resolved_session_id   (string, nullable — session ID at conclusion/drop)
├── created_at            (timestamp)
├── resolved_at           (timestamp, nullable)

click_links
├── source_id             (string, FK to clicks)
├── target_id             (string — click ID or writ ID, cross-substrate)
├── link_type             (enum: related | commissioned | supersedes | depends-on)
├── created_at            (timestamp)
```

### Properties

- **Immutable on create.** Goal never changes. If the framing is wrong, drop and reframe as a new click.
- **Append-only conclusion.** Write-once at resolution. 1-3 paragraphs of decision rationale.
- **No body editing.** No file-canonical dance, no closure ritual, no synthesis maintenance.
- **Four statuses.** `live` (actively explored), `parked` (deliberately dormant), `concluded` (decision reached), `dropped` (abandoned — reason required).
- **Cross-substrate links.** Clicks can link to writs via `commissioned` type. The click tree is the reasoning record; the writ substrate is the work record.
- **Children are the todo list.** Open questions become child clicks, not prose sections.
- **Session-joinable.** `created_session_id` and `resolved_session_id` link to archived transcripts.

### Boundary principle

Clicks are always questions or inquiries, never tasks. Tasks are mandates (writs). A click's conclusion may imply work, which becomes a commission linked back via `commissioned`. The two substrates are separated; the only connection is explicit typed links.

### CLI surface

```bash
# Create
nsg click create --goal "..." [--parent <id>]

# Navigate
nsg click tree [--root <id>] [--status live] [--depth N]
nsg click show --id <id>
nsg click list [--status live] [--root <id>] [--limit 100]
nsg click extract --id <id> [--full]     # subtree as structured document

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

Short IDs accepted everywhere (prefix match, error on ambiguity).

### What the click model dissolves

~20 of 38 catalog items eliminated by the shape change: body editing ergonomics, closure ritual, status model misfit, body/row split, file-canonical convention layer, synthesis drift, stale headers, row/file dual truth, narrative accumulation, unread bodies, vocabulary mismatch, parent/child overload (separated substrates), Oculus obligation-shaped views (purpose-built view replaces them).

### What remains (needs separate work)

- Oculus click view (graph visualization, not table)
- Discovery/orientation ritual design (but `click tree` is a much better primitive)
- Coco startup habits (load tree, not individual bodies)
- CLI convention consistency across `nsg`
- Short ID support in the framework
- Migration of existing quest data

### Deferred by design

- **Attachments** (large prose documents on a click). Deferred until the need proves itself. Workaround: artifact lives in a known location, conclusion references it.
- **Draft mode** (mutable exploration before immutable capture). Deferred — exploration lives in conversation; clicks capture decisions retroactively.

## Recommendation

**Migrate.** Build the Ratchet apparatus — a new framework plugin owning its own Stacks books — with a dedicated CLI and Oculus view. Migrate existing quest data. Deprecate the `quest` writ type.

The friction is structural, not removable. The obligation model leaks into every surface quests touch — status, UI, CLI, defaults, nesting. Each leak is individually patchable, but collectively they indicate the substrate is pulling toward its designed purpose (obligations), and quests are fighting it. A dedicated apparatus aligned with the actual use pattern (small decision-nodes in a tree) is cheaper long-term than continuously patching a misfit.

The writ substrate remains the right home for mandates, briefs, and other obligation-shaped work. Ratchet and Clerk coexist as peer plugins sharing the Stacks storage layer, connected by typed cross-substrate links.

## References

- Friction catalog: `.scratch/quest-substrate-friction-catalog.md`
- Parent quest: `w-mo0gias9-e6a2a5553973`
- Umbrella: `w-mo0ffbff-1f1af99fe6c8` (Improvements to the quest system)
- Original quest-as-writ insight: `w-mnswvmj7-2112b86f710a`
- Adjacent substrate question: `w-mnsz2ku6` (work-tracking primitives beyond writs+quests)
- Vocabulary rename quest (superseded by "click"): `w-mnsx3onr-6e9e21cd3f30`
- Interview session: `0f6580e9-2f6f-48a9-9669-14d11161734e`
- Trigger session: `166741dd-3d2c-4997-a0e1-55f9e98eb5cc`
