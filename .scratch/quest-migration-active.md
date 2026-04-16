# Quest → Click Migration: Active Quests

Proposed click decomposition for all 51 open (new/open) quests. Each quest becomes one or more clicks based on the distinct questions/inquiries embedded within it. Indentation shows parent→child structure.

Goals use natural voice — questions for genuine decisions and mysteries, imperative/declarative for research activities, design exercises, and tracking umbrellas.

Legend: `→ N clicks` = number of clicks proposed from this quest

---

## 🌳 Unlocking Autonomous Operation
*Quest: w-mo0e2m9q — umbrella*

```
Unlock autonomous hopper-based operation for Nexus
├── Redesign Astrolabe planner for intent-and-constraints specs with tiered decision model
│   ├── Design the preference model that graduates patron corrections into planning defaults
│   ├── Design tiered decision model that proceeds on best-guess defaults
│   └── Design task session handoff notes for the implement-loop engine
│       ├── Where should handoff notes be stored — task writ, session record, or dedicated book?
│       └── Should all previous handoff notes be queryable, or just the immediately prior one?
├── Choose recovery policy for seal-engine rebase conflicts
│   └── Discard-and-recommission vs reconcile-engine vs stuck-escalation — which?
├── Why does the reviewer rarely reject?
│   └── Is the reviewer too weak, or are specs tight enough that pass-through is legitimate?
├── Design concurrency-control substrate for parallel planning rigs
│   ├── Design OCC validation of plans against observed read sets
│   ├── Resolve plan-vs-plan conflicts when two Astrolabe sessions overlap
│   ├── Design intake tier model (backlog / ready pool / parked) to decouple dump from dispatch
│   └── Design load-bearing blocked_by links as scheduler prerequisites
├── Replace narrative-blob specs with structured task decomposition and acceptance verification
│   ├── Produce prompt guidance for verify-command quality
│   └── Design multi-turn conversational analyst mode for plan refinement
├── Separate writs (obligations) from rigs (attempts) — the multi-rig refactor
│   ├── Untangle the three meanings overloaded onto parent-child relationships
│   ├── Design cross-rig data flow and workspace persistence
│   ├── Design rig template generation beyond 'one template per writ type'
│   └── Should brief → mandate collapse into a single writ under multi-rig?
├── Design background monitoring of in-flight commissions (Vigil)
├── Design first-class internal commission flow (Petition)
└── Design cost tracking and token budget allocation (Coinmaster/Purse/Tithe)
```
→ 27 clicks from 15 quests

**Notes:**
- The umbrella quest itself becomes the root click — imperative voice fits naturally for a strategic objective
- w-mo0v636y (Decision-centric planner) decomposes into design sub-clicks plus child quest w-mo0znvsz (handoff notes) which has 2 genuine open questions
- w-mo0e31ca (Concurrency control) has 4 distinct design problems embedded in its goal
- w-mnsx8cz2 (Multi-rig refactor) umbrella + 4 children → 5 clicks; the brief→mandate collapse is a genuine yes/no decision so stays as a question
- "Why does the reviewer rarely reject?" stays as a question — it's a mystery, not a design task
- Vigil, Petition, Coinmaster are each single design clicks

---

## 🌳 Astrolabe Agility
*Quest: w-mo0v5wpc — umbrella*

```
Cut Astrolabe per-commission time and cost for autonomous batch operation
├── Design GSD-intel-style atlas as pre-built interpretive context for Astrolabe
│   ├── Design Layer 1: prose preamble from LLM mapper with brief-type → subset mapping
│   ├── Design Layer 2: deterministic repository facts from non-LLM tooling
│   └── Design Layer 3: staleness detection, refresh policy, atlas-as-engine-precondition
└── Profile and cut reader stage full-inventory cost
    └── Where do Astrolabe's time and tokens actually go across stages?
```
→ 7 clicks from 6 quests

**Notes:**
- Root and atlas umbrella are strategic objectives — imperative voice
- Layer children are design exercises
- Reader efficiency starts with a profiling question (genuine unknown) that feeds into interventions

---

## 🌳 Click Implementation
*Quest: w-mo0xpqwr — umbrella*

```
Implement the click model end-to-end [MOSTLY DONE — conclude after migration]
├── Design Coco's scope-closure discipline: explore/decide modes + context checkpoints
├── Design top-level click orientation as a focusing tool
│   ├── CLI: filter for top-level writs directly [SUPERSEDED by click tree]
│   ├── CLI: re-parent writs in any status [SUPERSEDED by click reparent]
│   └── CLI: generate quest tree index artifact [SUPERSEDED by click tree]
└── Design event-log layer for quest writs [SUPERSEDED by click immutability]
```
→ 3 live clicks from 7 quests (4 superseded)

**Notes:**
- Scope-closure is a genuine open design exercise — how should explore/decide modes work in practice?
- The focusing-tool concept migrates but its CLI-prereq children are all superseded by Ratchet's native capabilities
- Event-log is moot — clicks are immutable, no events to track

---

## 🌳 Improvements to the Quest System
*Quest: w-mo0ffbff — umbrella*

```
[LARGELY SUPERSEDED — click model replaces quest system]
├── Quest substrate MVP (w-mnswvmj7) [SUPERSEDED]
│   └── Design first-class queryable decision records with ratification flow → MIGRATES as standalone click
└── Rename 'quest' [COMPLETED → renamed to 'click']
```
→ 1 live click from this cluster

**Notes:**
- w-mnswwzdv (Decisions & ratification) transcends the quest→click migration — the question of making decisions queryable records with attribution and ratification is genuinely open and applies to the click model too
- Everything else in this tree is either shipped or superseded

---

## 🌳 Containerized Anima Sessions
*Quest: w-mo0f2led — umbrella*

```
Run every anima session in its own container for isolation and parallel safety
└── Achieve deterministic session directory isolation — container vs flag hardening
```
→ 2 clicks from 2 quests

**Notes:**
- Both are naturally imperative — they're engineering objectives, not open questions
- The child (w-mnszh806) is the concrete sub-problem

---

## 🌳 Standalone Root Clicks

These root quests each represent a single inquiry and map 1:1 to clicks:

```
├── Design Clockworks MVP timer apparatus
├── Scope daemon end-to-end integration test coverage
├── Diagnose MCP tool-server 500s dropping mid-session on astrolabe reader
├── Design engine-declared MCP tool preconditions with pre-session verification
├── Design session consult — entering an existing autonomous session interactively
├── Should engine completion be predicated on tool-call trace rather than session exit?
├── Design recovery from daemon restarts that strand engines in running state
├── Track X013 quality scorer open issues (umbrella)
│   ├── Design unified instrument context for cache efficiency
│   └── Design structured concern lists on quality scorers (QS-2)
├── Rethink commission-log granularity when briefs spawn multiple mandates
├── Codify the explicit-contracts principle — make implicit shared understanding into upfront artifacts
├── Evaluate work-tracking primitives beyond writs+clicks (backlog, seeds, threads)
├── Evaluate explicit design contracts as first-class planning artifacts (beyond UI)
├── Adopt assumptions mode as the default interaction style for design conversations
└── Design prompt-injection hardening for commission-sourced prompts
```
→ 16 clicks from 16 quests

**Notes:**
- "Diagnose MCP 500s" and "Should engine completion be predicated on..." are the two that stay as questions — one is a genuine mystery, the other is a genuine yes/no decision
- "Rethink commission-log granularity" uses natural deliberative voice — it's neither a pure question nor a design directive
- The explicit-contracts pair (principle + planning-artifact application) remain distinct clicks
- "Adopt assumptions mode" is imperative because the quest body already has a strong directional hypothesis — the click is about validating and codifying it, not deciding whether to do it

---

## Summary

| Cluster | Quests | Proposed Clicks | Superseded |
|---------|--------|----------------|------------|
| Unlocking autonomous operation | 15 | 27 | 0 |
| Astrolabe agility | 6 | 7 | 0 |
| Click implementation | 7 | 3 | 4 |
| Quest system improvements | 5 | 1 | 4 |
| Containerized sessions | 2 | 2 | 0 |
| Standalone roots | 16 | 16 | 0 |
| **Total** | **51** | **56** | **8** |

8 quests are superseded by the click model itself and should be concluded/dropped rather than migrated. The remaining 43 quests decompose into 56 clicks (some quests embed multiple distinct questions).

### Two clicks already exist in Ratchet:
- `c-mo1itggx` "How should Coco's click-based session continuity work end-to-end?"
- `c-mo1itn3x` (child) "How do we prevent concluded clicks from becoming forgotten knowledge?"

These should be incorporated as standalone roots in the final tree.
