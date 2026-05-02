# Clicks evolution — data, artifacts, and responsible agents

Enumeration of every data item involved in the proposed system, its
format, where it lives (or doesn't), and which agent generates and
consumes it.

Organized by **persistence tier** — substrate (raw evidentiary record),
artifacts (synthesized, derived, persisted), in-memory (working state,
not persisted).

---

## Resolution of the missing session-end hook

We don't have a session-end hook. Sessions go idle for hours/days before
the next one picks up. The wrap-up skill exists but depends on Sean
remembering to invoke it.

**Resolution: shift end-of-session work to the *start* of the next session.**

- Coco's startup ritual (specified in `coco.md`) checks: does the prior
  session have a distill artifact?
- If not, Coco's first move is to **spawn a distill subagent** and a
  **verify subagent** on the prior session before starting any new work.
- The distill artifact lands on disk; Coco reads it as orientation.
- Sean spot-checks if he wants — verify report flags inconsistencies
  automatically.

This means the previous session's residue is **always available before
substantive new work begins**. If two sessions go by without the trick
firing (e.g. crash, manual override), a periodic cron sweep catches
orphaned-undistilled sessions and processes them in the background.

The "next session distills the previous" pattern is also philosophically
nice: distillation *is* the next session's preparation. You literally
can't start fresh until you've closed out what came before.

---

## Tier 1 — Substrate (raw, evidentiary, append-only)

### S1. JSONL session transcript

- **Format**: JSON Lines, one message per line. Defined by Claude Code,
  not us.
- **Location**: `experiments/data/transcripts/<session-id>.jsonl`
- **Generator**: Claude Code itself (automatic, not an agent).
- **Consumers**: distill subagent, verify subagent, brief subagent,
  Sean (rarely; spot-checks).
- **Persistence**: forever. The legal record of what was said.
- **Notes**: This is the only substrate we strictly require. Everything
  derives from it.

### S2. Click corpus (DB)

- **Format**: SQLite tables (clicks, body entries if added, links).
- **Location**: guild books (`clerk/clicks` etc., per existing schema).
- **Generator**: Coco (via `nsg click *` commands). Subagents may also
  emit clicks.
- **Consumers**: Coco, all subagents, `nsg click tree/show/extract`.
- **Persistence**: forever (with status transitions).
- **Notes**: Already exists. No format changes required for Tier 1.

---

## Tier 2 — Artifacts (synthesized, derived, persisted)

### A1. Session distill (SOAP-shaped)

- **Format**: Markdown with fixed sections.
  ```markdown
  # Session distill — <session-id>
  **Date**: <YYYY-MM-DD>
  **Conversation focus**: <one line>

  ## Subjective — what Sean said he wanted
  - <bullets, sourced from transcript>

  ## Objective — what was observed
  - corpus state, files read, numerical findings

  ## Assessment — interpretation
  - <Coco's analysis as represented in the transcript>

  ## Plan — next steps
  - [ ] <action items>
  ```
- **Location**: `experiments/data/distills/<session-id>.md`
- **Generator**: **Distill subagent** — fresh context, reads only the
  transcript. Triggered by next-session startup ritual or cron sweep.
- **Consumers**: Coco (orientation), Sean (verification), brief subagent
  (input for thread briefs).
- **Persistence**: forever. One per session.
- **Notes**: The SOAP shape forces separation of *what was said* from
  *what was observed* from *what was concluded* from *what's planned*.
  Spot-checking the S column is the cheapest verification surface.

### A2. Verify report

- **Format**: Markdown with categorized findings.
  ```markdown
  # Verify — <session-id>
  **Distill**: distills/<session-id>.md
  **Transcript**: transcripts/<session-id>.jsonl

  ## Grounding (claims supported by transcript)
  - ✓ "Sean wanted prior-art research" — msg 7
  - ✗ "Sean rejected the click+body proposal" — NOT FOUND
       (closest: msg 13 "I'm not quite ready to commit")

  ## Contradictions (claims that conflict with transcript)
  - (none)

  ## Omissions (significant transcript content missing from distill)
  - Sean's subagent-capability framing (msg 35) — not in A or P

  ## Summary
  - 1 grounding gap, 0 contradictions, 1 omission. Recommend Coco
    revise S section with msg 13 wording, add subagent reframe to A.
  ```
- **Location**: `experiments/data/distills/<session-id>.verify.md`
- **Generator**: **Verify subagent** — fresh context, reads distill +
  transcript. Triggered immediately after distill.
- **Consumers**: Coco (must address findings before closing
  distillation), Sean (spot-check; flagged items are obvious).
- **Persistence**: forever (paired with distill).
- **Notes**: This is the breakthrough capability — mechanical
  retrieval-grounded fact-check that no human discipline can do.

### A3. Thread brief (on-demand)

- **Format**: Markdown, ~500 tokens.
  ```markdown
  # Brief — <topic>
  Generated <date> from: clicks <ids>; transcripts <session-ids>

  ## Question on the table
  <one line>

  ## Where we are
  <3-5 sentences narrative>

  ## What's been decided
  - <bullets with click/transcript pointers>

  ## What's open
  - <bullets>

  ## Pointers
  - Key clicks: <ids>
  - Key transcripts: <session-id> msgs <range>
  ```
- **Location**: `.scratch/briefs/<topic-slug>.md` (ephemeral) or kept
  in-context (no disk write). Probably ephemeral cache so we can
  regenerate if stale.
- **Generator**: **Brief subagent** — fresh context, reads click subtree
  + relevant distills + transcript ranges. Triggered on-demand by Coco.
- **Consumers**: Coco (orientation; replaces current `extract` walking).
- **Persistence**: ephemeral / regenerable. Worth caching to avoid
  redoing work.
- **Notes**: Replaces the "Coco loads 5 clicks into context to
  orient" pattern. Brief is generated *outside* Coco's context, then
  loaded *as a single ~500-token chunk*. Big win on context budget.

### A4. Aging report (periodic)

- **Format**: YAML or Markdown with classifications.
  ```yaml
  date: 2026-05-01
  clicks_reviewed: 286
  classifications:
    active:    [<ids>]    # touched in last 7 days
    recent:    [<ids>]    # 8-30 days
    dormant:   [<ids>]    # 31-90 days, topic still relevant per recent activity
    cold:      [<ids>]    # 90+ days, no recent topic activity
  recommendations:
    park:        [<ids>]   # cold + low signal
    resurface:   [<ids>]   # dormant but topic touched recently
    consolidate: [[<id-pairs>]]  # likely duplicates / same topic
  ```
- **Location**: `experiments/data/aging/<date>.md`
- **Generator**: **Aging subagent** — fresh context, reads click corpus
  + recent transcripts/distills. Triggered by weekly cron.
- **Consumers**: Coco at session-start (surfaces resurface items),
  Sean (reviews park/consolidate recommendations).
- **Persistence**: keep last N reports for trend analysis.
- **Notes**: Tier 2; not Tier 1.

### A5. Recall surface (per-session at startup)

- **Format**: Short markdown block, ~200 tokens.
- **Location**: not persisted; produced for Coco's startup context.
- **Generator**: **Recall subagent** — reads recent transcripts +
  click corpus, picks 3-5 aged clicks worth re-attending given recent
  activity.
- **Consumers**: Coco (read at session start).
- **Persistence**: ephemeral.
- **Notes**: Tier 2.

### A6. Pattern report (periodic)

- **Format**: Markdown with proposed themes.
- **Location**: `experiments/data/patterns/<date>.md`
- **Generator**: **Pattern subagent** — reads transcript + click corpus.
  Triggered by weekly cron.
- **Consumers**: Sean (reviews proposed themes).
- **Persistence**: kept; trend analysis.
- **Notes**: Tier 2/3.

### A7. Materialized views (threads / records / todo)

- **Format**: Markdown files per topic.
- **Location**: `threads/`, `records/`, `todo.md`
- **Generator**: **Materializer subagent** or post-write hook.
- **Consumers**: Sean (browse), Coco (read for context).
- **Persistence**: regenerable from clicks + distills.
- **Notes**: **Tier 3** — only build if Tier 1+2 don't solve the felt
  pain. The original proposal's main feature; demoted to optional.

---

## Tier 3 — In-memory (working state, not persisted)

### M1. Coco's conversation context

- The chat itself: messages, tool calls, file reads.
- Lives in Coco's session context; dies on session close.
- Recovered for next session via the session distill artifact (A1).

### M2. Coco's running understanding

- "What Sean wants right now," "current hypotheses," "recent
  decisions."
- Implicit in Coco's chat context.
- Memo-stream entries (qualitative-coding style) could be made explicit
  by Coco writing them in chat ("`[memo] noticing X`") so they survive
  in the transcript and get picked up by the distill subagent.

### M3. Loaded clicks / files

- Clicks Coco has run `extract`/`show` on this session.
- Files Coco has read.
- Lives in chat context; dies on session close.

---

## Agents — responsibility map

### Coco (interactive, primary)

- **Generates**: chat messages, click writes (`nsg click *`), file
  reads, memo-stream lines in chat.
- **Consumes**: distill artifacts, verify reports, brief artifacts,
  recall surface (at startup).
- **Triggers**: distill subagent (at startup, if prior session lacks
  distill), brief subagent (on-demand during conversation).
- **Notes**: Coco's role narrows. No more in-conversation summarizing
  for posterity; the distill subagent does that with fresh eyes.

### Distill subagent (the SOAP-writer)

- **Generates**: A1 session distill.
- **Consumes**: S1 transcript only. Strictly *not* Coco's working
  context — fresh model session.
- **Triggered by**: next-session startup ritual (Coco), or cron sweep
  for orphaned sessions.
- **Notes**: Fresh-context discipline is load-bearing. If we let Coco
  generate the distill, we lose the Mueller-Oppenheimer benefit.

### Verify subagent (the auditor)

- **Generates**: A2 verify report.
- **Consumes**: A1 distill + S1 transcript.
- **Triggered by**: post-distill (chained).
- **Notes**: Mechanically grounded. Reports findings categorically:
  grounding gaps, contradictions, omissions.

### Brief subagent (the orienter)

- **Generates**: A3 thread brief.
- **Consumes**: click subtree, relevant distills, transcript ranges.
- **Triggered by**: Coco on-demand (`nsg brief --topic <slug>`).
- **Notes**: Replaces `extract`-walking for orientation. ~500 tokens
  out, regardless of input size.

### Aging subagent (the curator)  *[Tier 2]*

- **Generates**: A4 aging report.
- **Consumes**: click corpus + recent transcripts/distills.
- **Triggered by**: weekly cron.

### Recall subagent (the bell)  *[Tier 2]*

- **Generates**: A5 recall surface.
- **Consumes**: recent transcripts + click corpus.
- **Triggered by**: Coco at session start.

### Pattern subagent (the weaver)  *[Tier 2/3]*

- **Generates**: A6 pattern report.
- **Consumes**: transcript + click corpus.
- **Triggered by**: weekly cron.

### Materializer  *[Tier 3]*

- **Generates**: A7 materialized views.
- **Consumes**: clicks + distills.
- **Triggered by**: post-write hook on click ops, or daemon tick.

---

## What we're committing to in Tier 1

Three subagents, two artifacts, one ritual:

- Subagents: **distill**, **verify**, **brief**.
- New persisted artifacts: A1 distill, A2 verify report.
- Ritual: Coco's startup checks for prior-session distill; runs distill
  + verify if missing; backstop is a cron sweep for orphans.

No new substrate. No new storage in clicks. No materialize layer. All
existing data shapes preserved. The only schema-ish change is two new
directories under `experiments/data/`: `distills/` and (later) `aging/`,
`patterns/`.

---

## Open questions

1. Does the **next-session-does-prior-session-wrap-up** ritual feel
   reliable enough? Backstop is cron; primary is Coco's startup
   instructions. Risk: if Coco's startup forgets, two sessions of
   undistilled work pile up before cron catches it.
2. Should the **distill subagent be a real subagent** (Task tool /
   spawn) or just a CLI command Coco runs that fires its own LLM call
   with the transcript piped in? Practical: the latter is simpler if
   it works.
3. **Verify report severity** — is Coco *required* to address findings
   before closing distillation, or is it informational? I lean
   "required for grounding gaps and contradictions, informational for
   omissions."
4. **Where does the memo stream go?** Coco writing `[memo] noticing X`
   in chat is one option (lands in transcript). A separate
   `experiments/data/memos/<session-id>.md` is another. The chat
   approach is cheaper.
5. **Brief subagent caching** — regenerate every time, or cache to
   `.scratch/briefs/`? Cache invalidation on click changes is annoying;
   fresh-every-time is simpler but pays a generation cost on every
   reference.
