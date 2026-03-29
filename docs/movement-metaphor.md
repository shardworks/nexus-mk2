# The Clockwork System — Vocabulary & Description

## Physical Description

A **movement** is a three-dimensional machine. Viewed from outside, you see a plane of gears — the **train** — their teeth meshed, some turning, some still. But the movement has depth.

Where two gears meet an **apparatus**, a **drive shaft** passes *through* a black box mounted behind the gear plane. The input gears spin the shaft. Inside the box, machinery hums — pistons, cams, secondary wheels — doing work you cannot see from the front. The shaft runs all the way through and connects to the output gear on the far side, but that gear is **latched** — held disengaged by a small detent arm.

As the apparatus works, it produces **distillate** — a refined substance that collects in a chamber inside the box. When the chamber reaches the required state, the distillate's pressure **trips the detent**. The output gear engages the shaft and begins turning, carrying the movement forward.

Off the output gear, smaller gears branch sideways — **complications**. They spin freely once the output gear turns, each driving a small secondary mechanism. These produce their own minor distillates, quietly, automatically, while the main train continues forward.

To the side of the movement, connected by a great tangle of conduits and wire, sits **the Matrix** — the arcane substance of the thing being built. It is not mechanical. Its interior is crystalline: logic suspended in material, structure encoded in lattice. Distillate flows into it from the apparatus, incorporating into its structure — strengthening a region, manifesting a layer, verifying an integrity. Distillate also flows *back out*, feeding downstream apparatus that need to read the state of what has already been built. From the clockwork side, the conduit paths into and out of the Matrix are opaque. They disappear into its housing and cannot be traced.

The gears visible on the front face tell you everything about system state at a glance. A still gear means work is waiting or underway upstream. A turning gear means distillate has been produced and energy is flowing forward. A seized gear means something inside an apparatus has jammed.

---

## Technical Description

A **movement** is the complete dependency graph for a commission. It is composed of **trains** — dependency chains — whose nodes are **gears** and **apparatuses**.

**Gears** are state nodes. They carry no logic. A gear is **idle** when upstream prerequisites are incomplete, **turning** when power and distillate have arrived, and **seized** when an upstream failure has propagated forward.

**Apparatuses** are work units interposed in the train. An apparatus has:

- A **drive shaft** — engaged when all upstream gears are turning, running through the apparatus from input to output
- An **internal process** — an anima or engine performing work while the shaft spins
- A **distillate** — the artifact, state change, or signal produced by that work
- A **detent** — holds the output gear latched until distillate conditions are met
- An **output gear** — engages the shaft and turns when the detent trips, carrying the train forward

An apparatus is **idle** when its drive shaft is not yet spinning. It is **working** when the shaft is spinning but the detent has not tripped. It is **turning** when the output gear is engaged and distillate is flowing forward.

Apparatus interiors are not uniform. An **automatic apparatus** houses pistons, cams, and governors — once the shaft spins, the machinery runs without intervention and distillate accumulates deterministically. A **workshop apparatus** houses a powered environment: tools become available, materials are fed in from conduits, the space activates. But nothing is produced until an anima arrives and applies their craft. The anima trips the detent themselves — a deliberate act — when their work is complete.

**Distillate** is the meaningful output of an apparatus — a build artifact, a deployment record, a test report, a published package. It is not carried by the gear train itself. It is produced inside the apparatus and passed forward through **conduits** to downstream apparatuses that declare it as a requirement. A downstream apparatus's detent will not trip until all required conduits are filled.

**Complications** are minor automatic processes driven off an apparatus's output gear. They run in parallel with the main train, powered by the same output, and produce their own secondary distillates. They are typically engine-operated. A downstream apparatus may require a complication's distillate just as it would a primary one.

**The Matrix** is the arcane artifact being constructed by the movement — the codebase, system, or application the commission is delivering. It exists alongside the movement, connected by a chaotic tangle of conduits. Its interior is not mechanical but crystalline: information suspended in substance, logic encoded in lattice. Apparatus distillates flow into the Matrix and are incorporated into its structure. The Matrix also emits distillate back into the movement — prior state that downstream apparatus may need to read before their own work can proceed. The paths of these conduits are not visible from within the clockwork; the Matrix manages its own internal routing.

The result: **power flows through the drive shaft and gears**. **Work happens inside apparatuses**. **Distillate flows through conduits**. **The Matrix grows** as distillate is incorporated into it. The gears are the visible ledger of the system's state. The conduits are the invisible substance of what is actually being built.

---

## Vocabulary Reference

| Term | Role |
|---|---|
| **Movement** | The complete dependency graph for a commission; the largest unit |
| **Train** | A dependency chain of gears and apparatuses |
| **Gear** | A state node; visible indicator of whether a stage is idle, turning, or seized |
| **Apparatus** | A work unit interposed in the train; houses either automatic machinery or an anima workshop |
| **Drive shaft** | The power conduit running through an apparatus; spins when input gears turn |
| **Detent** | The latch holding an apparatus's output gear until distillate conditions are met |
| **Distillate** | The meaningful output produced by an apparatus; flows forward through conduits |
| **Conduit** | The channel carrying distillate between apparatuses, and to and from the Matrix |
| **Complication** | A minor automatic process branching off an apparatus's output gear |
| **Impulse** | The discrete signal emitted when a gear turns; animates the next stage |
| **Matrix** | The arcane artifact being constructed; receives and emits distillate via conduit tangle |
| **Automatic apparatus** | An apparatus whose interior runs without intervention once powered |
| **Workshop apparatus** | An apparatus whose interior requires an anima's presence and judgment to produce distillate |

### Gear States

| State | Meaning |
|---|---|
| **Idle** | Drive shaft not yet spinning; upstream prerequisites incomplete |
| **Working** | Shaft spinning; distillate accumulating; output gear latched |
| **Turning** | Detent tripped; output gear engaged; distillate flowing forward |
| **Seized** | Apparatus failed; output gear will not turn |

---

*Footnote — alternative names considered for the Matrix:*
*The **Substrate** (base material being worked upon); the **Lattice** (emphasizing crystalline structure); the **Corpus** (body of encoded substance); the **Locus** (convergence point); the **Edifice** (constructed artifact); the **Work** (guild tradition term for the piece being made).*
