# Cartograph + Surveying Cascade — Planning & Commission Synthesis

> Sanctum-side planning artifact. The settled architecture lives in
> the framework repo at
> [`docs/architecture/surveying-cascade.md`](/workspace/nexus/docs/architecture/surveying-cascade.md).
> This doc holds the planning structure, phased commissions, click
> tree, and source-click traceability. Read the arch doc first if
> you want the design itself.

---

## 1. State of the system

### 1.1 What's shipped

| Component | Package | Key commits | Status |
|---|---|---|---|
| Cartograph data layer (vision/charge/piece writ types + companion docs) | `@shardworks/cartograph-apparatus` | `f69f1c6` (scaffold) | **Shipped** |
| Cartograph CLI (vision/charge/piece × create/show/list/patch/transition) | (in cartograph-apparatus) | `a04cd6c` | **Shipped** |
| Reckoner core (registry, source-id grammar, ext slot, petition/withdraw helpers) | `@shardworks/reckoner-apparatus` | `89fb1ab`, `64113e0`, `f7fb5b0` | **Shipped** |
| Reckoner CDC handler + Reckonings book + startup catch-up | (reckoner) | `e59abd6` | **Shipped** |
| Reckoner scheduler kit-contribution (always-approve default) | (reckoner) | `d068b65` | **Shipped** |
| Reckoner periodic tick (replaces CDC handler) | (reckoner) | `7bed456` | **Shipped** |
| Reckoner dependency-aware consideration gate | (reckoner) | `0e1e81f` | **Shipped** |
| `depends-on` link kind (Clerk-contributed) | clerk + spider | `5f4a0f1` | **Shipped** |
| Vision-keeper worked-example petitioner | `@shardworks/vision-keeper-apparatus` | `4147d4f`, `b92dc90` | **To delete (Commission B)** |

### 1.2 What's in flight

Nothing currently in flight in this domain.

### 1.3 What hasn't been built

The entire surveying cascade machinery:

- Disk-authored visions (`<GUILD>/vision/<slug>/vision.md` + sidecar)
- `nsg vision apply` CLI verb (and its priority flags)
- Survey writ types (`survey-vision` / `survey-charge` / `survey-piece`)
- SurveyDoc companion type and `books.surveys`
- `ext['surveyor']` slot — priority hints
- Surveyor-apparatus substrate plugin
- Default scaffold-surveyor plugin
- Spider extension: dispatch survey-* writ types in addition to mandates

---

## 2. Commission readiness — what can ship now vs what needs more design

### 2.1 Readiness summary

| Commission | Status | Gating open questions |
|---|---|---|
| **B** Cleanup (delete vision-keeper plugin + redefine The Surveyor) | **Ready now** | None — fully settled |
| **A** Vision authoring on disk + apply CLI | **Ready now** (with v0 leans) | Stage gating (arch §5.1; v0 lean: every apply triggers); sidecar layout (arch §5.13; v0 lean: keep merged) |
| **C** Surveyor-apparatus substrate | **Needs design first** | Dynamic rig templates (arch §5.2); writ type shape 1 vs 3 (§5.3); substrate scope (§5.6); rig failure handling (§5.10); zero-children behavior (§5.14) |
| **D** Spider rig-resolution audit + dispatch extension | **Needs design first** | Spider audit (§5.2 prerequisite) |
| **E** scaffold-surveyor default | **Needs design first** | Rig template shape (§5.4); mandate priority handoff (§5.5); depends on C + D |

### 2.2 What this means in practice

- **Dispatch B and A immediately.** Both bounded; both unblock real
  patron value (B clears the conceptual landmines, A delivers the
  authoring loop standalone). Neither needs more design.
- **Resolve the C/D/E gating questions before commissioning the
  substrate.** Each is a small design conversation; collectively a
  focused session or two before substrate brief is draftable.
- **F and G stand alone.** Vision-completion criteria (§5.9) and
  walkthrough CLI (§5.11) don't block the substrate but the
  substrate's value is incomplete without them. Walkthrough in
  particular is half the patron's experience.

---

## 3. Commission briefs

### 3.1 Ready-now commissions

#### Commission A — Vision authoring on disk

- `nsg vision apply <slug>` CLI verb (single code path for
  first/Nth import)
- Sidecar schema (`vision-metadata.yml` with `visionId`, stage,
  codex, optional `severity`/`deadline`/`decay`)
- CLI flags `--severity`, `--deadline`, `--decay` (override sidecar)
- Writes `ext['surveyor']` to vision writ
- Stale-binding detection (warn at scan, error on apply)
- Tests: import a fresh vision, re-import after edits, error on
  stale binding, priority flag merging

Ships in the cartograph-apparatus package. Note: `ext['surveyor']`
slot is owned by surveyor-apparatus substrate (which doesn't exist
yet in v0). This commission contributes the writes; the substrate
will read them when it lands. For v0 the writes are inert until the
substrate exists.

Single-event-per-apply guarantee: the apply CLI must wrap
create + transition in one Stacks transaction, or
`cartograph.createVision` must accept the initial stage as a
parameter. (Picking which is part of the commission's spec phase.)

#### Commission B — Delete vision-keeper-apparatus + redefine The Surveyor

Sanctum-coordinated framework change:
- Delete `packages/plugins/vision-keeper/` (whole directory)
- Update `guild-metaphor.md`: redefine The Surveyor as the
  cartograph-decomposition apparatus (replacing the codex-mapping
  framing)
- Update `architecture/index.md` and `architecture/plugins.md`:
  remove codex-mapping framing of Surveyor
- Update `petitioner-registration.md`: remove worked-example
  references to the vision-keeper plugin
- Update any test fixtures or `guild.json` files that include
  vision-keeper
- Update the new architecture doc
  (`architecture/surveying-cascade.md`) is already in place; this
  commission completes the cleanup around it

Lands first to clear the path for substrate work later.

### 3.2 Design-pending commissions

These are scoped here for visibility, but should not be drafted as
briefs until their gating questions resolve.

#### Commission C — Surveyor-apparatus substrate

- New plugin `@shardworks/surveyor-apparatus`
- Three survey writ types (`survey-vision`, `survey-charge`,
  `survey-piece`)
- SurveyDoc + `books.surveys`
- Surveyor registry (kit-contribution surface)
- `ext['surveyor']` slot ownership + dimension-translation logic
- CDC observer on cartograph book events
- Rig-template routing (substrate looks up registered surveyor's
  templates)
- SurveyDoc stamping on rig completion
- Surveyor anima tool surface (create_charge[s], create_piece[s],
  create_mandate[s])
- Tests: CDC fires → survey writ created → ext.reckoner stamped per
  hints + defaults → SurveyDoc populated on completion

Depends on resolution of arch §5.2 (dynamic rig-template
registration).

#### Commission D — Spider extension for survey writ dispatch

- Audit Spider's current rig-resolution mechanism (§5.2 prerequisite)
- Extend dispatchable-type set to include survey writ types
- Template lookup integrates with the substrate's surveyor registry
- Tests: a typed survey writ in `open` phase dispatches the
  registered surveyor's rig

May fold into Commission C or stand alone depending on audit scope.

#### Commission E — scaffold-surveyor default

- New plugin `@shardworks/scaffold-surveyor`
- Three rig templates (vision, charge, piece) — basic LLM prompts
- Registers with the substrate via kit contribution
- Tests: end-to-end smoke test (vision applied → survey writ
  created → rig dispatched → charges created → recursion fires →
  mandates created)

Depends on C + D. First-light commission for the whole cascade.

### 3.3 Phase 3 commissions (independent — patron-experience completion)

#### Commission F — Vision completion criteria

Design what "vision complete" means and the CLI/UX for getting
there. Per arch §5.9 — current lean is "patron-explicit, no
auto-completion." Commission turns that into a designed surface.

#### Commission G — Patron walkthrough CLI

The patron-contract validation step at the charge layer. Per arch
§5.11 — substantial design problem. Half of the patron's value lives
here. Independent of substrate work but needed for end-to-end
patron value.

---

## 4. Order of operations

```
[Phase 1 — dispatch immediately]
B (cleanup)        ──→  unblocks substrate naming
A (vision apply)   ──→  delivers authoring loop standalone

[Phase 2 — design conversation, then dispatch]
        ┌───→ C (substrate)
audit ──┤
        └───→ D (Spider extension)
                                │
                                ▼
                         E (default surveyor) ──→ E2E smoke

[Phase 3 — independent of substrate, but completes patron value]
F (vision completion)
G (walkthrough CLI)
```

Phase 1 commissions can dispatch today. Phase 2 needs a design pass
on the gating questions before briefs are drafted. Phase 3 is
independent.

---

## 5. Proposed click tree (replacing c-moa42rxh subtree)

```
c-NEW-ROOT  Cartograph + surveying cascade — patron-vision authoring
            and recursive surveying through to mandate dispatch  [live]
│
├── [Phase 1 — ready to dispatch]
├── c-NEW-A  Vision authoring on disk + apply CLI                 [live]
│   ├── c-NEW-A1  Stage gating policy (arch §5.1)                 [live]
│   └── c-NEW-A2  Sidecar file organization (arch §5.13)          [live]
├── c-NEW-B  Cleanup: delete vision-keeper plugin + redefine      [live]
│            Surveyor in architecture docs
│
├── [Phase 2 — design pending]
├── c-NEW-C  Surveyor-apparatus substrate                         [live]
│   ├── c-NEW-C1  Substrate scope detail (was c-moje49pk)         [live]
│   ├── c-NEW-C2  Survey writ type shape — one or three (§5.3)    [live]
│   ├── c-NEW-C3  Cascading supersedes policy (§5.8)              [live]
│   ├── c-NEW-C4  Survey rig failure handling (§5.10)             [live]
│   └── c-NEW-C5  Zero-children survey behavior (§5.14)           [live]
├── c-NEW-D  Spider rig-resolution audit + dispatch extension     [live]
│   └── c-NEW-D1  Dynamic rig-template registration               [live]
│                  (was c-moje41iq)
├── c-NEW-E  Default scaffold-surveyor                            [live]
│   ├── c-NEW-E1  Rig template shape per layer (was c-moje4dj9)   [live]
│   └── c-NEW-E2  Mandate-creation priority handoff (§5.5)        [live]
│
├── [Phase 3 — independent, patron-experience completion]
├── c-NEW-F  Vision completion criteria (§5.9)                    [live]
├── c-NEW-G  Patron walkthrough CLI surface (§5.11)               [live]
│
├── [Documentation only — no commission needed]
├── c-NEW-H  Re-survey upstream-cascade behavior — document and   [live]
│            confirm; not a code change (§5.15)
│
└── [Parked — future]
    ├── c-NEW-Y  Plural surveyors — future                         [parked]
    └── c-NEW-Z  Per-charge priority nudge CLI — future (§5.12)    [parked]
```

The reorg shifts focus from "design questions about a vision-keeper"
to "commissions and their open sub-questions." Old design questions
either resolved (concluded) or got absorbed into commission scope.

---

## Appendix: source clicks

The clicks this synthesis draws from. Concluded conclusions are the
authoritative record; live clicks are open design (now subsumed by
the c-NEW-* tree).

**Concluded (load-bearing decisions):**

- `c-mod53o6h` — Product as first-class writ type; cartograph scaffold
- `c-mod53ood` — Ladder shape (vision/charge/piece/mandate)
- `c-modee576` — Companion-book pattern keyed by writ id
- `c-modee5kb` — Parent/child via writ.parentId
- `c-modee5x4` — Ladder invariants enforced at typed-API surface
- `c-modeor2d` — Naming finalized (vision/charge/piece, XxxDoc convention)
- `c-moeplgm5` — Cartograph scaffold dispatched + sealed
- `c-moerc0vf` — Cartograph CLI dispatched + sealed
- `c-moiu7yc1` — Recursive cascade pattern (now refined: survey
  writs are first-class at every layer; superseded by arch doc)
- `c-moivk7pd` — Lifecycle interactions (Reckoner gating, draft
  idiom, WIP-cap deadlock)
- `c-moiwnb9i` — `reckoner.petition()` stamp-only overload
- `c-moiwnmoc` — Reckoner dependency-aware consideration
- `c-moiwnzw6` — `spider.follows` → `depends-on` rename
- `c-moivkc4y` — Output contract for survey rigs (now refined:
  notes in writ.body)
- `c-moiu8pm9` — Initial petition timing (CDC observation;
  concluded this session)
- `c-moiu8tm4` — Periodic re-evaluation (subsumed by apply CLI;
  concluded this session)
- `c-mojeikyh` — Vision authoring moves to disk

**Live (now subsumed by c-NEW-* tree):**

- `c-moa42rxh` — Vision-keeper role (parent click; superseded by
  c-NEW-ROOT)
- `c-moivkfgb` — Priority dimension cascade (subsumed by arch §3.10)
- `c-moje41iq` — Dynamic rig-template registration (now c-NEW-D1)
- `c-moje45l8` — Plugin packaging amender (subsumed by arch §3.7)
- `c-moje49pk` — Substrate scope detail (now c-NEW-C1)
- `c-moje4dj9` — Default scaffold surveyor design (now c-NEW-E1)

**Parked:**

- `c-moje4foc` — Plural surveyors (now c-NEW-Y)
- `c-mod53p9w`, `c-mod53rbz`, `c-mod53rpa` — Dogfooding /
  first-vision-capture / cross-product edges (future)
