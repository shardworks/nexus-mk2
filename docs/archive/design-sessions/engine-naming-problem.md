# The Engine Naming Problem

## The problem in one sentence

"Engine" is the most load-bearing term in the vocabulary and the least distinctive word in it.

## What engines actually are

An engine is the guild's unit of chartered, mechanical work. Engines appear in two contexts:

**In the Clockworks** — named in standing orders and set in motion when events fire. This is how the guild acts on itself: something happens, an engine responds.

**In a rig** — the unit of work in the execution graph, mounted by the Walker. Two kinds:
- **Autonomous** — deterministic, no creative judgment required. Runs on the yield of upstream work; produces its own yield when done.
- **Animated** — requires an anima. The engine defines the work and holds the anima's context; the anima brings the judgment the work requires.

The autonomous/animated distinction is conceptually valuable — it maps precisely to "AI work vs. mechanical work" and gives the system a clean way to describe mixed rigs. The word *engine* carries neither distinction.

## Why the name falls flat

Every software system has engines — search engines, rendering engines, game engines, workflow engines. The word is entirely generic. In isolation, it communicates almost nothing about what a guild engine is. A reader who encounters "the sealing engine" or "the deploy engine" will likely understand it immediately — but because of the modifier, not the word itself.

Compare to the top-level sticky terms: *anima*, *commission*, *Walker*, *rig*, *writ*. Each of those raises a question. "Anima?" What's that? "The Walker?" What does it walk? Engines raises no question. It just sits there, competent and invisible.

## Prior considerations from this session

**The clutch metaphor** was explored earlier as a physical mechanism that could give engines a more vivid character — engines as things that engage and disengage from the rig's mechanism. The clutch language was ultimately deemphasized (engine states simplified to idle/working/complete) because it introduced mechanical detail that didn't clarify the system.

**The clockwork register** is the source of vocabulary for this system. Candidate directions from horology:
- **Complication** — too broad (it names a category of mechanisms, not the mechanism itself), and now reserved for a different system concept
- **Movement** — a clock movement is the working mechanism inside the case. Could work as a category but sounds odd as a count noun ("mount a movement," "three movements in this rig")
- **Cam, gear, lever, spring, wheel** — too granular; parts of a mechanism, not complete mechanisms
- **Arbor** — the shaft that carries a gear. Precise but obscure; stickiness in the wrong direction
- **Train** — a gear train is a sequence of gears transmitting force. "A rig is built from trains" could work but risks confusion with other uses of train

**The staffed/animated decision** was made this session (animated replacing staffed), which improved the language around the anima-within-engine relationship. But the container concept — engine itself — still needs attention.

## What a replacement needs to do

1. **Name the unit of chartered work** — a bounded, purposeful mechanical thing the guild puts to work
2. **Support the autonomous/animated distinction** — "autonomous X" and "animated X" must both sound natural
3. **Fit the clockwork register** — horology or guild craft, not generic software
4. **Work as a count noun** — "mount an X," "three Xs in this rig," "the Clockworks runs Xs"
5. **Stand out enough to be memorable** — it should raise a mild question on first encounter

## Starting candidates

None have been fully explored. Opening the design space:

| Candidate | Pros | Cons |
|-----------|------|------|
| **Mechanism** | Precise, clockwork-native, elevated | Long, abstract, doesn't pluralize well in casual use |
| **Works** | Guild register, "the works" is vivid | Conflicts with the works taxonomy just adopted |
| **Contrivance** | Period-appropriate, raises questions | Slightly comical register |
| **Piece** | Watchmaking term ("a fine piece"), concise | Too generic in other directions |
| **Movement** | Watchmaking, evokes purposeful motion | Sounds odd as count noun; "movements" has other meanings |
| **Fitment** | Suggests purpose-built mechanical part | Obscure; may confuse |
| **Device** | Clear, purposeful | Generic (same problem as engine) |
| **Treadle** | Period-appropriate foot-powered mechanism | Sounds quaint; no natural modifier |

None of these are obviously right. The design space hasn't been fully explored.

---

## Addendum — Extended Vocabulary Search

The following documents a broader search across four vocabulary spaces: horology (beyond the first pass), Hermeticism and Paracelsian natural philosophy, Victorian engineering, and occult/craft practice. The search was collaborative across two sessions.

### Key finding

Neither Victorian engineering nor Hermeticism has a clean generic term for "a bounded functional unit on the critical path of a mechanism." Victorian engineers named specific mechanisms brilliantly but never needed a generic abstraction above the specific part name. Hermeticism is rich in cosmological structures, spiritual entities, and philosophical principles — but not operational units. This explains why "engine" (a Victorian engineering borrow) was chosen originally: it was filling a gap that horology itself doesn't cover. The best candidates therefore come from: horology (still), Paracelsian natural philosophy (same tradition as *anima*), and natural philosophy's organism/mechanism dichotomy.

### Candidate Summary Table

| Candidate | Count noun | "Animated X" | "Autonomous X" | "Summon-X" | Raises question? | Register | Primary issue |
|-----------|-----------|--------------|----------------|-----------|-----------------|---------|--------------|
| **Complication** | ✓ | ✓ | ✓ | ✓ | ✓✓ | Perfect clockwork | Maps to *optional features*, not critical-path mechanisms |
| **Escapement** | ⚠️ singular in real watches | ✓ (rich tension) | ⚠️ tautological | ✓ | ✓✓ | Perfect clockwork | "Autonomous" is redundant — escapements are definitionally mechanical |
| **Mechanism** | ✓ | ✓ | ✓ | ✓ | mild | Natural philosophy / clockwork-adjacent | Correct but not distinctive; doesn't raise much of a question |
| **Archaeus** | ✓ (*archaei*) | ✓✓ precise | ✓ | ⚠️ long | ✓✓ | Paracelsian — same tradition as *anima* | Archaea (microorganism domain) collision; obscure; long compounds |
| **Organ** | ✓ | ✓ | ✓ | ✓ | ✓ | Natural philosophy / Hermetic | "Instrument" sense (organon) is correct but body-part meaning dominates in modern usage |
| **Relay** | ✓ | ✓ | ✓ | ✓ | ✓ | Victorian electrical | Modern primary meaning is "simple pass-through"; electrical register conflicts with clockwork aesthetic |
| **Armature** | ✓ | ✓ | ✓ | ✓ | ✓ | Victorian steampunk | Specifically electromagnetic; imports an electrical register that conflicts with the clockwork vocabulary |
| **Working** | ✓ | ✓ | ✓ | ✓ | ✓ | Occult / craft | Informal; shifts register away from mechanical and toward mystical |
| **Contrivance** | ✓ | ✓ | ✓ | ✗ unwieldy | ✓ | Period craft / Victorian | Comic register; "summon-contrivance" is too long |
| **Tourbillon** | ⚠️ singular and precious | ✓ | ✓ | ✓✓ | ✓✓✓ | Extreme clockwork prestige | Singular and rare in real watches — wrong character for a common unit term |
| **Alembic** | ✓ | ✓ | ✓ | ✓ | ✓ | Strong alchemical | A vessel, not a worker — implies passive containment rather than active operation |
| **Piece** | ✓ | ✓ | ✓ | ✓ | ✗ | Watchmaking ("a fine piece") | Too generic outside that specific context |
| **Movement** | ✓ | ✓ | ✓ | ✓ | mild | Watchmaking | Denotes the *entire* movement of a watch — wrong scale; pre-draft architecture used it for the rig concept |
| **Device** | ✓ | ✓ | ✓ | ✓ | ✗ | Generic | Same problem as "engine" — too common to raise any question |
| **Contrivance** | ✓ | ✓ | ✓ | ✗ | ✓ | Period craft | See above |

### Notes on specific entries

**Escapement.** The conceptual tension in "animated escapement" is genuinely interesting — an escapement is definitionally the most inanimate, precisely mechanical component in a clock, so an *animated* one creates meaningful drama. But the autonomous/animated distinction doesn't hold up: "autonomous escapement" is nearly tautological, since all real escapements are autonomous by definition. The distinction is load-bearing in this vocabulary; a term that can't carry it cleanly is disqualified.

**Tourbillon.** Considered seriously because the word is stunning and the clockwork register is unimpeachable. A tourbillon is a rotating cage that holds the escapement, turning once per minute to counteract gravitational drift — the most celebrated and expensive complication in watchmaking. But calling the *common general unit of work* by the name of the rarest, most prestigious watchmaking mechanism creates a tonal mismatch. Tourbillons are exceptional; engines are ordinary.

**Alembic.** The transformation metaphor is apt — an engine takes upstream yield, works it, produces output, exactly as an alembic takes raw material and produces distillate. But an alembic is a vessel: it holds and contains rather than acts. The word emphasizes the container over the process. Also, "summon-alembic" is clunky.

**Organ.** In the Aristotelian and Hermetic tradition, *organon* (organ) means *instrument* — the thing through which a higher power acts. Aristotle's logical works are the *Organon*; a hand is an organ (instrument of grasping); the liver is an organ (instrument of blood production). This is philosophically precise for the engine concept: an organ performs bounded, purposeful work within a larger system. The anima/organ pairing maps cleanly to spirit/instrument. However, modern readers reach for the biological or musical meaning before the philosophical one — the word would need to fight its context.

**Relay.** A Victorian relay receives an incoming signal and uses it to actuate a separate circuit — a triggered mechanism that produces a subsequent action. This maps well to how engines work in a rig. But the modern meaning of "relay" has drifted to mean a simple repeater/pass-through, which understates what an engine does (transformation, judgment, production). The register is also electrical rather than clockwork.

**Armature.** The working element of an electric motor or generator — the component in which electromagnetic force converts to motion. Period-appropriate Victorian industrial hardware, and it looks good in steampunk aesthetics. But it's specifically electromagnetic, importing an electrical register that sits uneasily alongside the clockwork vocabulary.

**Working.** In magical traditions from medieval grimoires to modern practice, a *working* is a discrete magical operation — bounded, purposeful, set in motion to produce a specific effect. The occult register fits the system's arcane aesthetic, and "a working" as a noun is usefully unexpected. But it shifts the register away from the mechanical-industrial and toward the mystical, which runs against the Clockworks / Walker / rig vocabulary.

---

### Top Candidates — Extended Analysis

---

#### Complication

**Source.** In watchmaking, a *complication* is any functional mechanism added to a watch beyond basic timekeeping — a chronograph, perpetual calendar, moon phase display, alarm. The term comes directly from the fact that each such addition *complicated* the movement: it required more parts, more precision, more craft. A watch with no complications simply tells the time. A grand complication might have twenty additional mechanisms.

**Why it was a strong candidate.** The clockwork register is perfect and unforced — this is a genuine technical term, not a metaphor. "Three complications in this rig" works as a count noun. "Animated complication" and "autonomous complication" both sound natural. The word raises a question on first encounter without being impenetrable. "The sealing complication," "the summon complication" — both work as functional descriptors. The definition can play with the double meaning productively: *a complication is not a difficulty — it is any mechanism the guild puts to work*.

**Issues.**

*Double meaning.* The word primarily means difficulty or problem in everyday English. "Three complications are running" could read as "three problems have developed." This is navigable — the definition can address it directly — but it creates friction for readers who haven't internalized the vocabulary.

*Wrong horological mapping — the disqualifying concern.* In a real watch, complications are the *optional, non-critical features*: the chronograph and moon phase are complications; the going train (the gear train that actually drives the hands) is not. But in a rig, engines are on the **critical path** — they are the going train, not the optional additions. Calling them "complications" inverts the metaphor's most important structural relationship. A patron or reader who knows watchmaking would immediately sense something wrong. This concern appears difficult to reconcile without distorting either the horological meaning or the system's architecture.

---

#### Mechanism

**Source.** "Mechanism" entered English in the seventeenth century from French *mécanisme*, ultimately from Greek *mēkhanē* (machine, contrivance). In Victorian natural philosophy — particularly in debates about life and matter — the *mechanism/organism* distinction became foundational: an organism has inherent life, teleology, and spirit; a mechanism operates by physical law alone. Clockmakers, engineers, and natural philosophers all used the word for a purposeful machine-like device operating by deterministic rules.

**Why it is a strong candidate.** The philosophical pairing of *anima* and *mechanism* has conceptual depth that the *anima/engine* pairing never had. The Victorian organism/mechanism distinction maps directly onto the system's animated/inanimate distinction: **animas are the animating spirits; mechanisms are the deterministic instruments they inhabit or that run without them**. The word is clockwork-native without being as specific as "escapement" or as misaligned as "complication." It works cleanly as a count noun ("three mechanisms in the rig"), supports both adjective forms naturally ("animated mechanism," "autonomous mechanism"), and compounds acceptably ("the summon-mechanism," "the sealing mechanism"). Unlike most other candidates, mechanism can be understood immediately without definition — it raises no confusion, only mild interest.

**Issues.**

*Insufficient distinctiveness.* Every software system has mechanisms. The word is more elevated than "engine" but it doesn't raise the mild question that the system's best vocabulary terms raise — it doesn't make a reader pause the way "anima," "Walker," or "writ" does. It does the job but doesn't sing.

*Slight register mismatch.* "Mechanism" reads as natural philosophy or scientific vocabulary more than guild craft vocabulary. It fits alongside "apparatus" — but the system is intentionally not apparatus-heavy. The word is honest but slightly clinical next to the more evocative entries in the vocabulary.

---

#### Archaeus

**Source.** The *archaeus* (also spelled *archeus*) is a concept from Paracelsian medicine and natural philosophy, developed in the sixteenth century by Theophrastus Bombastus von Hohenheim — Paracelsus — the same thinker who gave us the concept of the *anima* as used in this system. In Paracelsian thought, the archaeus is the functional governing principle of each bounded thing: the archaeus of the stomach governs digestion; the archaeus of a mineral governs its characteristic behavior. It is not the soul (*anima*) — which is the animating spirit of the whole — but the operational principle that makes a specific part *do what it does*. Each organ, each substance, each bounded system has its own archaeus. The term comes from Greek *arkhaios* (ancient, original) via the Paracelsian *spiritus archaeus* — the original governing spirit of a thing.

**Why it is a strong candidate.** The etymological coherence with *anima* is the most compelling feature: both terms come from the same philosophical tradition, designed by the same thinker to describe complementary aspects of how things work. The *anima* is the animating spirit of a being; the *archaeus* is the functional governing principle of a bounded mechanism within that being. Applied to the guild: **the anima is the spirit that inhabits and directs; the archaeus is the instrument that holds the work and governs its execution**. An animated archaeus is one through which an anima works; an autonomous archaeus is one whose governing principle operates by mechanism alone. This is conceptually precise in a way no other candidate achieves — the distinction between anima and archaeus was designed to be clear.

The word is distinctive, raises questions, and sits firmly in the arcane/alchemical register that the vocabulary already occupies. "The Walker mounts three archaei in the rig" has a character consistent with the system's existing vocabulary. The compound forms work: "summon-archaeus," "sealing archaeus."

**Issues.**

*The archaea collision.* *Archaea* is also the name of a domain of single-celled organisms in biology — the third domain of life alongside Bacteria and Eukaryota. In technical documentation, the capitalized *Archaeus* / *Archaei* would distinguish them, but the collision is real and could cause confusion in documentation that spans both technical and philosophical registers.

*Obscurity.* The archaeus is not well-known even among people with interest in alchemical or Hermetic history. Readers will not be able to guess what it means from the word alone — it demands explanation in a way that "mechanism" or "contrivance" do not. This may be acceptable given the system's register (anima also demands explanation), but it should be weighed deliberately.

*Compound length.* "Summon-archaeus" is the longest compound in the vocabulary by some distance. This may matter in code, configuration, and documentation where the term appears frequently.

*Variant spellings.* The word appears as *archaeus*, *archeus*, and *archæus* across historical sources. A canonical spelling would need to be chosen and held consistently.

---

## Addendum — The Relay Split and Modifier Pair

Before reaching a final verdict on the noun, two other vocabulary improvements were identified and adopted independently of the noun question.

### The Relay Split

The word "engine" covers two meaningfully different things: engines in rigs (units of work on the critical path) and engines in the Clockworks (event handlers that fire in response to signals). These have different characters — Clockworks handlers are always mechanical, always stimulus-response, never animated. Rig engines can be either kind.

Giving Clockworks handlers their own name clarifies the distinction and is worthwhile regardless of what we call the rig unit. **Relay** was the obvious choice: a Victorian electrical relay receives an incoming signal and actuates a separate circuit — precisely what a Clockworks handler does. The word is period-appropriate and doesn't compete with any other vocabulary term in the system.

This split was adopted. Clockworks handlers are now called **relays** in the guild vocabulary.

### The Modifier Pair: Quick / Clockwork

The existing modifiers for rig engine types — *animated* and *autonomous* — were functional but flat. They described the distinction accurately but didn't carry register.

The adopted pair is **quick / clockwork**:

- **Clockwork** — runs by mechanism alone, deterministic. Reinforced by the idiom "like clockwork." The lowercase form is distinguishable in writing from the Clockworks apparatus (capital C), and in context the two concepts never appear together.
- **Quick** — alive, inhabited by an anima. From Early Modern English: *the quick and the dead*, meaning the living and the dead. A quick engine has an anima inside it; a clockwork engine does not.

The pair is adopted. Rig engines are now **quick** (animated by an anima) or **clockwork** (running by mechanism alone).

---

## Addendum — Final Verdict: Keep Engine

### The full vocabulary search

The search covered five broad areas:

- **Horology** — escapement, complication, tourbillon, movement, arbor, train, cam, wheel, piece
- **Paracelsian natural philosophy** — archaeus (the functional governing principle of a bounded mechanism, from the same tradition as *anima*)
- **Victorian engineering** — relay, armature, mechanism, device, contrivance, fitment
- **Occult and craft practice** — working, mystery (the medieval guild's craft, from Old French *mestier*)
- **Kinetic and found terms** — ark, tilt, labor, march, ray, crach, hand, stint, span, eddy, gust, phase, shard, mote, chase, slug

### Disqualifications

Most candidates fell on one of four grounds:

1. **Wrong horological mapping** — *complication* (optional extras, not critical-path mechanisms), *escapement* (tautological with "autonomous" — real escapements are definitionally mechanical), *tourbillon* (rarest mechanism in watchmaking; wrong character for a common unit term)
2. **Competing technical meanings** — *span* (distributed tracing spans), *slug* (URL slug), *relay* (already adopted for Clockworks handlers)
3. **Wrong character** — *eddy* (secondary/backflow current — engines are on the critical path), *mote* (tiny passive particle), *gust* (momentary, uncontrolled)
4. **Too generic** — *phase*, *device*, *movement*, *piece*

### The short list

Six candidates survived to serious consideration:

| Candidate | Strongest case | Disqualifying concern |
|-----------|---------------|----------------------|
| **Mechanism** | Philosophically apt pairing with *anima* (organism/mechanism dichotomy); clockwork-adjacent; correct | Not distinctive — raises no question; every software system has mechanisms |
| **Archaeus** | From the same Paracelsian tradition as *anima*; the functional governing principle of a bounded mechanism; etymologically precise | *Archaea* (microorganism domain) collision; very obscure; "summon-archaeus" is unwieldy; variant spellings |
| **Ark** | Short, evocative, count noun works perfectly, compounds cleanly; biblical weight ("vessel carrying what is essential") fits the register | Vessel metaphor is slightly passive — arks carry, they don't run; "running arks" is a mild mismatch |
| **Tilt** | Medieval jousting run — bounded, committed, kinetic, complete; jousting register fits guild vocabulary; "quick tilt" / "clockwork tilt" both natural; "SealingTilt" in code is striking | Modern meanings compete (lean/angle, pinball, windmills); "SealingTilt" has mild verb-action ambiguity |
| **Mystery** | Medieval guild term — the guild's craft and trade; startlingly evocative in documentation prose; "SealingMystery" in code has character | Log lines break: "mystery seal-binding → complete" reads as a puzzle being solved, not a work unit finishing; `upstreamMysteries` strains; requires etymological scaffolding on every verbal explanation |
| **Contrivance** | Period-appropriate, raises questions | Comic register; "summon-contrivance" is too long |

**Ark** and **tilt** were the strongest noun contenders. Both cleared all disqualifying tests. Tilt had more kinetic character; ark had cleaner vessel metaphor.

### Why we kept engine

The relay split and quick/clockwork modifier pair provide the vocabulary improvements that matter most. Running these through documentation prose, verbal explanation, TypeScript, configuration, and log lines:

**The modifier pair carries the distinction; the noun doesn't need to.** Once a reader understands "quick engine" (alive, inhabited by an anima) and "clockwork engine" (runs by mechanism alone), the vocabulary has done its work. The noun just needs to not mislead — and "engine" doesn't mislead. These things are engines: chartered, mechanical, purposeful units of work.

**"Engine" doesn't import wrong associations.** The vocabulary terms that most needed replacement were those importing incorrect mental models — "agent" implies too much autonomy for an *anima*, "ticket" implies the wrong formality for a *writ*. "Engine" implies mechanical, purposeful, chartered work. That's exactly right.

**The switching costs aren't worth the modest gain.** The improvement from "engine → tilt" (or "engine → ark") is distinctiveness at the noun level — a reader pauses where they didn't before. Real, but modest. Against this: explanation burden for a novel noun, mild code friction (SealingTilt vs. SealingEngine), and a pervasive rename across every document, config file, and codebase that touches the concept. That trade doesn't clear the bar.

**The vocabulary as updated is already coherent.** Quick engine. Clockwork engine. Relay. Alongside anima, writ, Walker, rig, commission, codex. The register holds. "Engine" no longer reads as the flat word in a distinctive vocabulary — the modifier pair has brought it into the fold.
