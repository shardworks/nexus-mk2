# Clicks evolution — functions and mechanisms

The prior-art survey gave us a menu of disciplines. The right framing is:
**don't pick disciplines as a checklist; identify functions the system needs
to perform, then pick the cheapest mechanism for each.**

Our mechanism toolkit includes capabilities biological knowledge workers
don't have:

- **Subagents** — fresh context, no recall bias, parallel execution. A
  Cornell-style "summarize that night" pass becomes "spawn a distill
  subagent now"; the temporal separation is replaced by *contextual*
  separation. A new model session is, for these purposes, the same as a
  next-day version of yourself with no memory of writing the notes.
- **Automated checks** — programmatic comparison of a synthesized artifact
  against the evidentiary transcript. "Did the SOAP capture what was
  actually said?" is a *retrieval-grounded check*, not a human spot-check.
  This is something no clinician can do.
- **Hooks and session rituals** — programmable triggers (session start,
  session end, click-create, cron, writ-complete) let us encode discipline
  as automation rather than relying on human practice.
- **Bounded-context restarts** — we can deliberately "forget" by spawning a
  subagent. Humans can't choose to forget the last hour for fresh
  perspective.
- **Continuous re-indexing** — every new artifact can trigger overlap /
  contradiction / consolidation checks against the existing corpus. Humans
  can't maintain this.

These change the calculus on every prior-art discipline.

---

## Functions the system needs to perform

| # | Function | Prior art | Cheapest mechanism for us |
|---|----------|-----------|----------------------------|
| F1 | Capture as we talk | Lab notebook, BuJo rapid log | Coco-as-captor (already free); session-log markdown file with BuJo symbols |
| F2 | Distill structured residue | SOAP, ADR, Cornell summary, minute-taking | **Distill subagent** triggered by session-end hook; reads transcript, produces SOAP-shaped artifact |
| F3 | Verify residue against source | Cornell cue-recall, MI summarizing reflection | **Verify subagent**: programmatic retrieval-grounded check of artifact claims against transcript; flags inconsistencies |
| F4 | Resume thread with context | BuJo collections, Zettelkasten links | **Brief subagent**: given a thread/click subtree, produce a fresh 500-token orientation in a clean context |
| F5 | Age stale material | Anki, BuJo migration | **Aging subagent** on cron: classify live clicks as active / dormant / dead based on recent activity |
| F6 | Surface forgotten-but-relevant | Anki spaced surfacing | **Recall subagent**: given recent activity, suggest aged clicks worth re-attending |
| F7 | Detect cross-thread patterns | Qualitative axial coding | **Pattern subagent** on cron: scan corpus, find emerging themes ("we keep talking about retry semantics") |
| F8 | Decide and commit | (the actual conversation) | **Sean** (still the human; the only function we don't automate) |
| F9 | Capture meta-thoughts | Qualitative memos | Memo stream — Coco writes "noticing X" / "contradicts Y" inline in session log; no special tooling needed |
| F10 | Render navigable views | Lab notebook → paper | Materialize threads/records/todo from clicks + session log (the prior proposal's render layer) |
| F11 | Verify intent capture in real time | MI summarizing reflection | Coco discipline: periodic "let me restate what I'm hearing" passes; no tooling, just practice |

The prior art is the **left column**: human disciplines that solve each
function. The right column is what we'd actually build, given our
toolkit.

---

## What's interesting about the subagent move

A core failure mode of the current system: Coco distills the conversation
*from inside the conversation*. Mueller-Oppenheimer says this is the
worst case for summarization quality — you have full recall, low
constraint, and produce verbatim-via-summary. Cornell solved this with
24-hour delay; the next-day-you doesn't have full recall, so they have
to actually distill.

A subagent gets us Cornell's delay without waiting overnight:

- Distill subagent has *no memory* of the conversation. Only the transcript.
- It must reconstruct what mattered from the source.
- It can't shortcut by remembering "we agreed X" — it has to find X in the
  transcript.
- The result is closer to true distillation.

Same logic for verify subagent: it can't be fooled by "I remember Sean
saying that" because it has no memory. Either the transcript supports the
claim or it doesn't.

This isn't *better than* Cornell — it's the same insight (separation
between writer and summarizer / verifier) implemented differently.

---

## What's interesting about automated checks

A clinician writes a SOAP note. Verification options:
- Self-review (weak — Mueller-Oppenheimer effect)
- Peer review (expensive, async)
- Patient reads back (rare in practice)

Audit happens months later, if at all. The note is mostly trusted on the
clinician's word.

We have something stronger: the transcript exists, structured, queryable.
A verify subagent can take any synthesized artifact and check:

- **Grounding**: does every claim in the artifact appear in the transcript?
  ("You wrote 'Sean wants the system to age clicks.' Locate the
  utterance.")
- **Faithfulness**: are there no claims that *contradict* the transcript?
  ("You wrote Sean prefers approach A. The transcript shows him preferring
  approach B at message 47.")
- **Completeness**: are the major decisions / questions / commitments
  represented? ("Sean asked X at message 23; not represented in the
  artifact.")

This is *cheap* (one subagent call) and *uncoupled* from Coco. It's a new
verification mode that no prior-art discipline has access to.

This is the killer feature for "trust but cannot verify." Sean reads the
distill artifact + the verify report. Inconsistencies are flagged
mechanically. He can spot-check a small number of items, knowing the
machine already swept for the obvious failures.

---

## What's interesting about hooks

Cornell's "review weekly" works only if the student does it. BuJo's
"migration ritual" works only if the journaler sits down each month. The
disciplines fail when human attention lapses.

We can make them not fail:

- **Session-end hook** runs the distill subagent, produces SOAP residue,
  posts to chat for Sean's spot-check before session closes.
- **Session-start hook** runs the brief subagent for live threads, summary
  of last session's plan, aged-click recall. Coco gets oriented without
  spending tokens on tree-walking.
- **Click-create hook** runs an overlap-check subagent: "does this
  duplicate an existing live click? does it logically belong under a
  different parent?"
- **Daily/weekly cron** runs the aging subagent: classifies stale clicks,
  surfaces dormant-but-relevant ones for review.
- **Click-conclude hook** runs a length-check + a body-required check —
  enforces conclusion discipline structurally.

This is the deepest reframe. The prior art's *disciplines* are mostly
fragile human practices. We can replace them with rituals that fire
automatically and don't depend on remembering to perform them.

---

## What this means for the original proposal

The click+body+materialize hybrid was missing aging, temporal separation,
render shape, summarization friction. Reframed through this lens:

- **Aging** ← aging subagent on cron + click-conclude hook for length
- **Temporal separation** ← distill subagent gives us Cornell's delay
- **Render shape** ← materialize layer + inverted-pyramid template
- **Summarization friction** ← verify subagent catches drift; distill
  subagent (fresh context) doesn't have the bandwidth-bloat failure mode

The hybrid isn't *wrong* — it's *underspecified*. The substrate / artifact
split makes sense; the missing piece is the suite of hook-driven subagents
that operate on the substrate to produce the artifacts and verify them.

Restated: it's not click+body+materialize. It's:

- **Substrate**: session log + transcript + click corpus.
- **Artifacts**: distilled SOAP, threads, records, todo.
- **Mechanisms**: capture (Coco, live), distill (subagent, end-of-session
  hook), verify (subagent, post-distill hook), age (subagent, cron),
  recall (subagent, session-start hook), brief (subagent, on-demand).

---

## Function map — minimum viable build

If we want to test the framework cheaply rather than build the full thing:

**Tier 1 — high leverage, cheap to prototype, low risk:**
- F2 distill subagent (session-end hook)
- F3 verify subagent (post-distill hook)
- F4 brief subagent (on-demand, replaces extract for orientation)

These three would let us test: does an end-of-session SOAP residue +
mechanical verification + cheap orientation actually solve "trust but
cannot verify" and the bandwidth-bloat problem? Doesn't require any new
storage layer; works with current click data + transcripts.

**Tier 2 — add if Tier 1 wins:**
- F5 aging subagent (cron)
- F6 recall subagent (session-start)
- F7 pattern subagent (cron)

These attack the live-pile problem and surface emergent themes. Higher
implementation cost.

**Tier 3 — bigger structural changes:**
- F1 explicit session-log substrate (changes write surface)
- F10 materialize layer (the render half of the original proposal)

These are the storage-architecture changes. They might not be necessary
if Tier 1 fixes the actual pain.

---

## Open questions for Sean

1. Does the function/mechanism reframe make picking easier? (I think yes —
   it turns "which disciplines do we adopt?" into "which subagents and
   hooks do we build?")
2. Tier 1 — distill + verify + brief subagents — small enough to
   prototype this week. Want to spec one of those rather than commit to
   the whole thing?
3. The verify-subagent feels like the breakthrough capability. Does
   mechanical retrieval-grounded fact-checking against transcripts seem
   as powerful to you as it does to me, or am I overweighting?
4. What hooks does our infrastructure actually have today? Session-end,
   session-start, click-* are the ones I'm assuming exist or are
   buildable. Cron is trivial. Anything I'm missing or wrongly
   assuming?
