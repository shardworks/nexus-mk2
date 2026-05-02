# Clicks evolution — prior art survey

Sean's prompt: hold off on committing to the click+body+materialize hybrid;
look at formal knowledge-management practice, structured-conversation
techniques from clinical/scientific/qualitative research, and any other
relevant traditions before deciding.

This doc surveys what's out there and maps it back to the specific problems
the click system has surfaced. Not all of these are adoption candidates —
some are framing aids, some are full systems, some are single mechanics worth
borrowing.

---

## The problem, restated in neutral terms

We need a system that:

1. Captures a **running stream of thought** during conversation, low-friction.
2. Distills a **structured residue** of decisions, open questions, and next
   steps from that stream.
3. Lets us **resume threads** (return to a topic days later with full context).
4. **Ages stale material** out of view without losing it.
5. Produces **rendered views** Sean can browse and verify against his memory.
6. Doesn't itself eat the conversation it's trying to capture.

Different fields have solved subsets of this for decades or centuries. None
have solved all of it; each solution carries assumptions worth surfacing.

---

## Personal knowledge management

### Zettelkasten (Luhmann, 1950s–1990s)

- Atomic notes, one idea each.
- Links between notes; **no hierarchy**.
- Three types: fleeting (scratch), literature (extracts from sources),
  permanent (your distilled thoughts).
- Index notes (Strukturzettel) provide entry points; the corpus organizes
  itself emergently via links.

**Map to clicks:** atomic = matches click model. Anti-hierarchy = directly
contradicts our tree. The fleeting / literature / permanent split roughly
corresponds to scratch / transcript-evidence / conclusion — but we don't
distinguish them as note types.

**Borrowable:** the **fleeting → permanent** workflow. A fleeting note isn't
expected to last; it's a stepping-stone. We treat every click as permanent
the moment it's opened, which is part of why the live pile bloats.

### PARA + CODE (Tiago Forte, *Building a Second Brain*, 2022)

- PARA = Projects / Areas / Resources / Archives (organize by actionability,
  not topic).
- CODE = Capture / Organize / Distill / Express.
- **Progressive summarization** — across multiple passes, bold the
  important, then highlight the most important, then write a one-line
  summary. The note "develops" as you reread it.

**Borrowable:** progressive summarization is a direct answer to "long-form
vs. decision" tension. You keep both; distillation happens in *passes*, not
upfront. Maps neatly to: append rich body during work → distill conclusion
later → eventually only the conclusion survives in views.

### Bullet Journal (Ryder Carroll, 2013)

- **Rapid logging** with symbols: `•` task, `○` event, `–` note, `>`
  migrated, `<` scheduled, `*` priority, `!` insight, `x` done.
- Daily log is chronological stream-of-everything; periodic ritual to
  "migrate" undone items forward (or strike them as no longer relevant).
- **Collections** = topical pages (recipes, project X). The daily stream and
  collections are both append-only.
- **Index** at the front lists collection page numbers.

**Map to clicks:** very high overlap with what we've improvised. Symbols
disambiguate the entry type (task / observation / decision / question)
without needing separate stores. Migration is **explicit** — the user
periodically asks "is this still relevant?" — which solves our live-pile
aging problem head-on.

**Borrowable:** *all of it.* Especially the migration ritual; we have no
analog.

### Commonplace books (Renaissance → 19th c.)

Manual collections of quotations, observations, fragments — indexed by
topic. Predecessor to Zettelkasten. Locke wrote a treatise on indexing them.
Less applicable directly, but the spirit (stuff goes in raw, structure
emerges through the index) is interesting.

### Outliner + backlinks (Roam Research, Logseq, Obsidian)

- Daily notes are the primary writing surface.
- Bullets are first-class blocks; you can `((reference))` any block from
  anywhere.
- Tags and backlinks build the graph automatically.
- "Block references" = transclusion: include content by reference, edits
  propagate.

**Map to clicks:** this is the **closest off-the-shelf system** to what we'd
build with click+body+materialize. Daily note ≈ session log; bullets ≈
bodies; backlinks ≈ supersedes / parent links; tags ≈ status filters.

**Borrowable:** the daily-note-as-primary-surface idea. Sean could be
writing into a daily file; clicks emerge from it via tags and structure
rather than each click being a separate write.

---

## Structured conversation in clinical / scientific practice

### SOAP notes (medicine, 1960s–)

Every patient encounter ends with:

- **S**ubjective — what the patient reported.
- **O**bjective — what was measured/observed.
- **A**ssessment — diagnosis/interpretation.
- **P**lan — what we're going to do.

This is a **mandatory structured residue** of every clinical conversation.
Doctors run conversations naturally but the chart entry has fixed slots.

**Borrowable:** every Coco↔Sean session could end with a 4-slot residue:
*here's what you said you wanted, here's what we observed about the system,
here's the assessment, here's the plan.* Forces extraction. Cheap to verify
("does the S match what I said?").

### Cornell Note-Taking System (Walter Pauk, 1950s)

Page divided into three regions:

- **Right (notes)** — written *during* lecture/conversation, raw.
- **Left (cues)** — written *immediately after*, questions and key terms
  that the right column answers.
- **Bottom (summary)** — written *that day*, 1–3 sentences.

Three-pass discipline: write during, extract questions after, summarize
that night.

**Borrowable:** the **temporal separation** of capture, extraction, and
summary. Currently Coco does all three in one motion, badly. Pauk's
research showed students who delayed the summary pass had better recall
than those who summarized inline.

### Lab notebooks (scientific method, 17th c.–)

- **Strictly chronological** — never go back and edit, only append. Errors
  are struck through, not erased.
- Page numbers + dates + signatures (some labs require dual signatures).
- Cross-references by page number.
- The **paper is derived later** from the notebook; it is *not* the
  notebook. The notebook stays raw.

**Map to clicks:** this is the cleanest frame for what Sean wants. The
session transcript is the lab notebook. Threads/records are the *paper*.
We've been trying to make clicks be both the notebook *and* the paper, and
this is why conclusions bloat — they're trying to carry both functions.

**Borrowable:** the substrate / artifact distinction, sharply. The substrate
is the raw transcript + light structured tags. The artifact is curated
output produced (or derived) afterward.

### Qualitative research coding (grounded theory; Glaser, Strauss, Corbin)

Process for analyzing interview/ethnography data:

- **Open coding** — line-by-line tags applied to transcript ("frustration,"
  "trust loss," "tooling issue").
- **Axial coding** — relationships between codes ("frustration *because of*
  tooling issue").
- **Selective coding** — themes that emerge across the corpus.
- **Memos** — the researcher's running analytic notes, written *alongside*
  the codes. Memos preserve the analyst's evolving thinking; they are a
  separate stream from the data.

**Borrowable:** the **memo-stream** idea. The researcher writes "I'm
noticing X" / "this contradicts Y from earlier" / "should I revisit Z" as a
running document parallel to the structured codes. Coco currently has
nowhere to put these meta-observations except as new clicks (which is
overkill) or in chat (lost). A standing memo file per session would be
cheap.

### Motivational Interviewing (William Miller, clinical psychology)

OARS framework for goal-directed clinical conversation:

- **O**pen-ended questions.
- **A**ffirmations.
- **R**eflective listening.
- **S**ummarizing — periodic "let me restate what I've heard…" passes.

The summarizing move is a **deliberate verification mechanism** — the
clinician restates the patient's position to confirm it was heard
correctly, before proceeding.

**Borrowable:** Coco doing periodic explicit reflective summaries during
long conversations would address Sean's "trust but cannot verify" problem
in real time, not just at end-of-session.

### CBT thought records

Predefined slot-form for capturing a single cognitive event:

- Situation.
- Automatic thought.
- Evidence for / against.
- Alternative thought.
- Outcome.

The form **structures the conversation itself**. The therapist doesn't
take notes; the patient fills out the form during/after the session.

**Map to clicks:** clicks are basically a thought-record schema (goal,
context, conclusion). The form *is* the structure. CBT records suggest
adding "evidence for / against" slots explicitly (currently mashed into
context).

### Decision Records (Michael Nygard, ADR, 2011)

Architecture Decision Record format:

- Title, status, context, decision, consequences.
- Numbered, chronological, **append-only** (a decision is superseded but
  never edited).
- Status transitions: proposed → accepted → deprecated → superseded.

**Map to clicks:** the click "concluded" state is essentially an accepted
ADR. The supersedes link maps directly. We've already absorbed most of
this without crediting the source.

### Minute-taking / Robert's Rules

Parliamentary minutes capture **only** motions, votes, and decisions —
*not* the discussion. The discussion is in the audio/transcript or in
people's memories. The minute is deliberately tiny.

**Borrowable:** the discipline of "the minute is a tiny artifact pointing
into a large substrate." Our conclusions try to be both minute and
discussion-summary, and that's what makes them bloat.

---

## Cognitive science framing

### Distributed cognition (Edwin Hutchins, 1995)

Cognition extends into artifacts. The classic study: a ship's navigation
team's collective cognition lives in the *charts and instruments*, not
just in heads. Removing the artifacts breaks the cognition; the artifacts
are part of the thinking, not just records of it.

**Map to clicks:** the click tree isn't a record of Sean+Coco's joint
thinking — it *is* part of the thinking. This reframes the design
constraint: it has to be cheap to manipulate **during thought**, not just
after.

### Epistemic actions (Kirsh & Maglio, 1994)

Some actions exist only to make thinking easier (rotating a Tetris piece
to see if it fits, vs. rotating to actually drop it). These are
**epistemic** rather than **pragmatic** actions.

**Map to clicks:** opening a click to think is an epistemic action;
opening one to record a real decision is pragmatic. Currently we have one
verb for both. Bullet Journal's symbol set distinguishes them implicitly.

### Cognitive load / external memory (Sweller; Card, Moran & Newell)

Working memory is ~4 chunks. Externalizing structure frees working memory
for the actual problem. But poorly structured external memory **adds**
load (you have to maintain the structure).

**Map to clicks:** the live-pile size (286 clicks) is past every working
memory threshold. The startup tree dump asking Coco to scan it is asking
Coco to load 286 things into context to find the 4 that matter. This is
why `extract` works better than `tree` for orientation.

### Mueller & Oppenheimer (2014): "The Pen is Mightier than the Keyboard"

Students taking handwritten notes *understood* lectures better than
laptop-typers, despite recording fewer words. The constraint of
slow-writing forces in-the-moment summarization. Verbatim capture
*reduces* understanding.

**Map to clicks:** Coco's speed advantage is a hazard. Conclusions bloat
because Coco can transcribe-via-summary at high bandwidth. A discipline
that mimicked the handwriting bottleneck (sharply capped conclusion length;
forced summarization-not-transcription) might be more important than any
new storage layer.

---

## Other angles worth a glance

### Inverted pyramid (journalism)

Lede → key facts → supporting detail → background. Reader can stop at any
depth and have something useful.

**Map to clicks:** rendered threads currently show everything in nested
order. An inverted-pyramid render (decision first, then exploration) would
make the long files readable. This is a render-side fix the prior proposal
underspecified.

### After Action Review (military, 1970s; widely adopted)

End-of-engagement four-question format:
1. What was supposed to happen?
2. What actually happened?
3. Why was there a difference?
4. What can we learn?

**Borrowable:** end-of-session AAR could be a Coco standing practice. Maps
loosely to SOAP but specifically retrospective.

### GROW (coaching)

- **G**oal of this session.
- **R**eality of the current situation.
- **O**ptions on the table.
- **W**ill — what will you actually do?

A session structure, not a notes structure. But it's a useful frame for
*opening* a conversation, which we currently don't structure at all.

### Spaced repetition (Anki, SuperMemo)

Atomic cards surfaced via algorithm rather than directory structure.
Forgetting is built in — cards you remember are surfaced less often,
cards you fail are surfaced more.

**Map to clicks:** the live pile needs Anki-style aging. A click that
hasn't been touched in 30 days isn't dead, but it shouldn't be in the
default tree dump. A rotation mechanism (resurface 5 random aged clicks
per session?) is the spaced-repetition analog.

### Engelbart, "Augmenting Human Intellect" (1962)

Bret Victor / Doug Engelbart: tools should restructure your *capability*,
not record what you'd do anyway. Engelbart's NLS (1968) demoed outliners +
cross-references + multi-window editing as a thinking-amplifier system.

**Map to clicks:** the system should be measured by "did we think better?"
not "did we capture more?" Current pain (14% of context on bookkeeping)
suggests it's currently subtracting capability. Any change should pass
this test before shipping.

---

## Where the prior proposal lands against this survey

The click+body+materialize hybrid pulls from:

- **ADR** (decision records) — already absorbed, this is what clicks were.
- **Lab notebook + paper** — the materialize step. ✓
- **Append-only** writes — preserved. ✓

But it **misses**:

- **BuJo migration ritual** — no aging mechanism survives in the proposal.
- **Cornell temporal separation** — the proposal still asks Coco to write
  conclusions inline, which is where bloat comes from.
- **Memo stream** (qualitative coding) — no place for analyst's running
  meta-thoughts.
- **Progressive summarization** — bodies appended once, not refined across
  passes.
- **Inverted pyramid render** — long thread files unreadable as
  chronological dumps.
- **Anki-style aging** — live pile still grows monotonically.
- **Mueller/Oppenheimer constraint** — no friction force on summarization;
  bloat can recur.

So the proposal is a defensible distillation of *some* of the prior art
(ADR + lab notebook + append-only) but underrepresents *aging*,
*temporal separation*, *render shape*, and *summarization friction*.

---

## Frames worth presenting back

If I had to pick the **disorientingly useful** ones — the frames that
genuinely change the question rather than confirming the brainstorm —
they'd be:

1. **Lab notebook ≠ paper.** The substrate (chronological transcript) is
   not the artifact (curated record). We've been making clicks try to be
   both. Sharper separation could simplify the whole thing.

2. **Bullet Journal migration.** No prior art treats "stuff that didn't
   get done" as a passive collection — every system has a *ritual*
   (BuJo migration, AAR retrospective, sprint review). We have nothing.

3. **Cornell temporal separation.** Capture during, extract questions
   immediately after, summarize that night. Three passes, three
   purposes. Currently Coco compresses all three into one act and the
   conclusion suffers for it.

4. **Mueller-Oppenheimer constraint.** The bloat may be a *mode* problem
   (Coco transcribing via summary), not a *storage* problem (no place
   for long form). Cheap to test before adding a body store.

5. **Memo stream (qualitative coding).** Coco needs a place for "I'm
   noticing…" / "this contradicts…" / "worth revisiting…" that isn't a
   click and isn't lost in chat. Could be as simple as a per-session
   memo file.

6. **SOAP / minute-taking.** Sessions could end with a fixed-slot residue
   (here's what you wanted / here's what we did / here's the assessment /
   here's the plan) generated by Coco and verified by Sean. Cheap
   verification that doesn't require Sean to read the click tree.

7. **Anki-style aging.** Live-pile is the unsolved problem; spaced-
   surfacing is the field-tested solution.

---

## A different shape this survey suggests

Not a recommendation yet — just sketching what the survey points toward
that the brainstorm didn't:

- **Session log as primary surface** (lab notebook / Roam daily-note).
  Cheap append, chronological, never edited. One file per session.
- **Inline symbols** in the session log (BuJo): `?` open question,
  `!` decision, `>` migrated forward, `*` priority. Coco writes the
  log; Sean can scan it visually.
- **End-of-session SOAP residue** — Coco distills decisions / questions /
  plan into structured slots, append to a running record.
- **Clicks as a curated index, not a stream.** Promote items from the
  session log into clicks only when they pass the "needs its own
  identity" test. Live pile shrinks because most thinking lives in
  session logs.
- **Migration ritual** at session start: scan recent unresolved items,
  decide stay / drop / promote / commission.
- **Threads as inverted-pyramid renders** — decision lede, then sources,
  then exploration. Generated from clicks + session log refs.

This is a bigger redesign than the body+materialize hybrid. It might be
better; it might be too much; worth talking through.

---

## Open questions for Sean

1. Does the **substrate / artifact** split (lab notebook ≠ paper) feel
   right? If yes, what's the substrate — JSONL transcript? a daily
   markdown file? both?
2. Is the **bloat a mode problem or a storage problem**? Could be tested
   with a one-week experiment of capped conclusions + no body store.
3. **Migration ritual** — willing to do a 5-minute end-of-session pass on
   live items? That's the BuJo cost.
4. **Symbol-based stream entries** — appealing, or too cute?
5. **End-of-session SOAP residue** — useful as a verification surface, or
   just more ceremony?
6. How much of this should be **Coco's discipline** vs. **tool-enforced**?
   Cornell works as a discipline with no tooling; BuJo is just a notebook.
   The current click system is heavily tool-mediated; we could swing back.
