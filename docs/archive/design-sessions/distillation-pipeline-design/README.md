# Design session — Tier-1 distillation pipeline

This folder archives the design conversation that produced the Tier-1
session distillation pipeline (commit `2230e366`, 2026-05-02). The arc
started as an attempt to evolve the click system to better support
session continuity and ended up replacing in-session click-bookkeeping
ceremony with a wrap-up-driven distillation pipeline backed by
subagents.

## Reading order

1. **`clicks-evolution-handoff.md`** — handoff doc from the prior
   session (clicks-rework, 2026-04-29). Documents the
   click+body+materialize hybrid proposal, the body-vs-child-click
   decision framework, and the live questions that opened this
   session.

2. **`clicks-prior-art-survey.md`** — survey of formal knowledge
   management practice and structured-conversation traditions
   (Zettelkasten, PARA/CODE, Bullet Journal, Cornell, lab notebook,
   qualitative-coding memos, MI, CBT records, ADR, distributed
   cognition, Anki). Reframed the problem as substrate-vs-artifact
   (lab notebook ≠ paper) rather than a click-mechanics tweak.

3. **`clicks-functions-mechanisms.md`** — table mapping the
   functions the system needed to perform onto the cheapest mechanism
   for each. Identified the AI-native moves (subagent for
   fresh-context distillation, automated grounding-check verifier,
   programmable hooks/rituals) that no human knowledge-management
   discipline has access to. Tier-1/2/3 split lives here.

4. **`clicks-data-and-agents.md`** — concrete enumeration of every
   data item, its format and location, and the agent responsible for
   producing it. Specified the substrate / artifact / in-memory tiers
   and the "next session distills the previous one" ritual that was
   later abandoned in favor of wrap-up-driven invocation (because
   concurrent sessions break the linear-chain assumption).

5. **`distill-worked-example/`** — applied the proposal to a real
   session (`0cb4907e-adf3-41d2-92f3-6e88dc76565b`, the laboratory
   archive design session). Contains: hand-written distill and verify
   reports, BuJo-annotated transcript, three subagent-generated
   distills (raw vs annotated input × v1/v2 prompt), and the prompts
   used. The A/B test in this folder showed that BuJo-style inline
   symbols in the chat surface don't help the distiller (and may
   constrain it); symbols were dropped from the final design.

## Key decisions captured here

- **Substrate vs artifact split** — JSONL transcript is the substrate;
  curated distill in `docs/planning/` is the artifact. Don't make one
  surface do both jobs.
- **Subagent for distillation** — fresh-context model run forces real
  distillation rather than transcribe-via-summary (the
  Mueller-Oppenheimer effect on Coco's hot context). `claude -p
  --agent <name>` is the entire mechanism.
- **Hybrid distill format** — Intent / In-flight inquiries / Decisions
  / Next steps. In-flight inquiries carry full reasoning trail
  (Question / Considered / Ruled-out / Stuck) to prevent rehashing.
  Resolved questions disappear into Decisions; they don't get a
  separate redundant section.
- **Verifier with high silence-bar** — surfaces only ungrounded claims
  or contradictions; expected to noop ~99.999% of the time.
- **Wrap-up triggers, not next-session-startup** — concurrent sessions
  break the linear-chain assumption. Backstop sweep deferred
  post-MVP.
- **In-session checklist as side surface, not chat ceremony** — small
  markdown file at `.scratch/notes-<session-id>.md`, prepend-at-top
  via Edit tool. BuJo discipline applies to the side surface only,
  not chat.

## What shipped

The pipeline implementation lives at:

- `bin/coco-distill.sh` — orchestrating wrapper.
- `bin/coco-extract-conversation.py` — JSONL → chat-only preprocessor
  (16x size reduction; strips `tool_result`, compresses `tool_use`).
- `.claude/agents/distiller.md` — distill agent (Sonnet, no tools;
  conversation passed inline in prompt).
- `.claude/agents/verifier.md` — verify agent (Sonnet, no tools;
  distill + transcript passed inline; calibrated for silence on
  green).
- `.claude/skills/wrap-up/SKILL.md` — invokes the wrapper before the
  ethnographer summary.
- `.claude/agents/coco.md` — In-session Checklist + Session
  Distillation discipline sections.

Distills land at `docs/planning/<YYYY-MM-DD>-<slug>.md`; the slug is
chosen by the distiller from the conversation focus.

## What's deferred

- **Tier 2 subagents** — aging (cron-driven click-pile
  classification), recall (session-start surfacing of
  forgotten-but-relevant clicks), pattern (cross-session theme
  detection). Keep watching whether Tier 1 carries enough weight on
  its own.
- **Tier 3 storage changes** — explicit session-log substrate and
  full `threads/` + `records/` materialization layer. Likely
  unnecessary if Tier 1 fixes the felt pain.
- **Backstop cron sweep** — for sessions that skip wrap-up; only
  needed once we see drift in the distill coverage.
- **Verifier reliability stress-test** — both initial test runs
  returned `STATUS: clean`. Worth deliberately corrupting a distill
  to confirm the verifier catches the corruption.
