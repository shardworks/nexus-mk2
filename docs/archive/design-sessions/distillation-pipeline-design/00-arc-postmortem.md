# Distillation pipeline — arc postmortem

**Status: reverted 2026-05-02.** Built and shipped on 2026-05-02 in commits
`2230e366` + `93e75a27`; reverted later the same day. This doc captures
the full arc through to the revert so the next attempt doesn't restart
from zero.

## How we got here

The session opened with a handoff from the prior session
(`clicks-evolution-handoff.md` in this folder) proposing a
click+body+materialize hybrid to address several pain points:

- Click conclusions were bloating because they were trying to carry
  full reasoning trails (avg 1064 chars; 7/13 sampled over 1000
  chars).
- Long-form content had no home — kept ending up in `.scratch/` and
  getting lost, or bloating click goals/conclusions.
- Sean had no quick verification surface; trust-but-cannot-verify.
- 286 live clicks, no aging mechanism.
- Click commands ate ~14% of context budget per session.

## What we explored

Sean pushed back on committing to the proposal and asked for prior-art
research. The survey at `clicks-prior-art-survey.md` covered:
Zettelkasten, PARA/CODE, Bullet Journal, Cornell, lab notebook
(scientific method), SOAP, Motivational Interviewing, CBT thought
records, qualitative-coding memos, ADR, distributed cognition (Hutchins),
epistemic actions (Kirsh), Mueller-Oppenheimer note-taking research,
Anki, Engelbart's "augmenting human intellect," and others.

The reframe that landed: **substrate vs. artifact** (lab notebook ≠
paper). The substrate is chronological, append-only, rarely re-read; the
artifact is curated, structured, navigable. Clicks had been trying to be
both, which was the source of conclusion bloat.

We then mapped functions onto cheapest mechanisms
(`clicks-functions-mechanisms.md`) and identified the AI-native moves
human knowledge-management disciplines don't have access to:

- **Subagents** (fresh context, no recall bias) — gives Cornell-style
  temporal separation without overnight delay.
- **Automated grounding-checks** — programmatic comparison of
  synthesized artifact against transcript; mechanically catches
  ungrounded claims.
- **Programmable hooks** — turns fragile human disciplines (BuJo
  migration, Cornell review) into rituals that fire automatically.

A Tier 1/2/3 split fell out: distill + verify + brief subagents at
Tier 1; aging + recall + pattern at Tier 2; substrate-and-render
storage changes at Tier 3.

## What we built (Tier 1)

The pipeline shipped at commit `2230e366`:

- `bin/coco-extract-conversation.py` — JSONL preprocessor; filters
  `tool_result` noise, compresses `tool_use` to one-line summaries.
  16x size reduction on the tested transcript.
- `.claude/agents/distiller.md` — Sonnet, no tools, conversation passed
  inline in prompt. Output format: hybrid (Intent / In-flight inquiries
  / Decisions / Next steps). In-flight inquiries carry full reasoning
  trail (Question / Considered / Ruled-out / Stuck) to prevent
  rehashing.
- `.claude/agents/verifier.md` — Sonnet, calibrated for high silence
  bar; surfaces only ungrounded claims or contradictions. Expected to
  noop ~99.999% of the time.
- `bin/coco-distill.sh` — orchestrator. Preprocess → distill → write to
  `docs/planning/<date>-<slug>.md` → verify → print only on
  discrepancy.
- `.claude/skills/wrap-up/SKILL.md` — invoke the wrapper before the
  ethnographer summary.
- `.claude/agents/coco.md` — added "In-session Checklist"
  (`.scratch/notes-<session-id>.md`, prepend-at-top via Edit tool) and
  "Session Distillation" sections.

End-to-end test produced clean distills in ~2 minutes wallclock. Three
concurrent Coco sessions used the pipeline during the build itself.

## What broke

Two issues surfaced *after* shipping:

### 1. Cross-session canonical state was lost

The click tree had been the single authoritative source for
"what's open / decided" across sessions. With per-session distills,
each session captures its own view of an inquiry; finding the current
state of "should we do X?" requires reading N distills and
reconstructing.

The fix discussed (but not implemented before the revert): keep clicks
as canonical cross-session state; distills become rich detail layered
on top. Click conclusions can return to being terse because depth
lives in the distill ("Decided X. See `<date>-<slug>.md` D7"). This
is a discipline boundary, not a code change.

### 2. The audience for distill files became unclear

Walking through it honestly:

| Audience | Wants | Distill fits? |
|---|---|---|
| Sean's end-of-session verification | 500-word skim, structured slots | No — distills are 10K, not skimmable. SOAP-shaped at ~1 page would fit; what we built didn't. |
| Future-Coco orientation | "What's open about X?" | No — click tree answers this canonically. Distills are a curated middle layer that duplicates without adding. |
| Research / publishing | Design-evolution narrative | Marginally — transcripts already cover this; distills are slightly nicer but not essential. |

Distills sat between layers without a job they uniquely did. That was
the proximate trigger for the revert.

## What's worth preserving for next attempt

Even with the pipeline reverted, several pieces earned their keep
conceptually:

- **The substrate vs. artifact frame.** Right diagnosis. The fix
  doesn't have to be "distill artifacts" — could be tighter click
  conclusions + accessible transcripts.
- **The JSONL preprocessor.** 16x reduction makes transcripts
  *actually readable*. Useful regardless of whether we layer distills
  on top. (Reverted with the rest, but trivially resurrectable from
  git when wanted.)
- **Subagent-as-CLI pattern.** `claude -p --agent <name>` is the
  entire mechanism for spawning fresh-context worker agents. Three
  prompt files + shell wrapper. Useful for many other things beyond
  distillation.
- **Verifier severity-bar discipline.** The "stay silent unless
  materially misleading" calibration is a transferable design pattern.
- **Hybrid distill format insight.** *If* we end up wanting a
  structured residue, the four-section shape (Intent / In-flight
  inquiries / Decisions / Next steps) is solid. Especially the
  in-flight-inquiry shape with the reasoning trail.

## What didn't work / what we got wrong

- **Implicitly substituting distills for clicks.** The boundary was
  never made explicit; drift toward "the distill captures everything"
  was on me. The audience question revealed it.
- **Format size for verification surface.** A 10K distill isn't a
  verification surface — it's a document. SOAP is supposed to be
  small. We over-shot.
- **No clear answer to "who reads this?"** before shipping.
  Architecturally we knew the layers; we never asked "who needs this
  layer to exist?" early enough.

## Original problems still open

The pain points that motivated the arc remain:

1. **Click conclusion bloat.** Maybe the fix is just discipline — cap
   conclusions at ~400 chars hard, point to transcripts for depth.
   The transcript extractor (if we reintroduce it) makes this real.
2. **Long-form has no home.** Same problem; same possible answer
   (transcripts are the home, made accessible).
3. **Trust-but-cannot-verify.** The existing wrap-up
   ethnographer-summary already serves this for the brief case. May
   not need a second surface.
4. **Live-pile aging (286 clicks).** Untouched. Tier 2 territory if/when
   we revisit.
5. **Click bookkeeping context cost (~14%).** Untouched. Possibly
   addressable with terser conclusions and reduced click-on-create
   ceremony.

## Things to actually try next time

If/when this gets picked up:

1. **Start with a single-page session-end summary in chat, no file.**
   Test whether that alone solves the verification need. If yes, skip
   distill files entirely.
2. **Resurrect the transcript extractor as a standalone tool.** Useful
   for other purposes (research analysis, ethnographer input,
   publishing prep) regardless of distillation.
3. **Discipline experiment: hard-cap click conclusions at 400 chars.**
   See if depth naturally shifts to transcripts when forced. No
   tooling, just rule-following.
4. **If distills come back, define the audience first.** Write down
   the three-line "this exists for X who reads it at Y because Z"
   before building anything. If that paragraph is hard to write, the
   feature isn't earned.
5. **Address the live-pile aging problem on its own merits.** It's
   independent of distillation and was always a real issue.

## Anchor commits

- `2230e366` — pipeline shipped
- `93e75a27` — design path archived
- (this commit) — revert + this postmortem
