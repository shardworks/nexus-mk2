# Clicks assessment — 2026-04-29

A snapshot review of how Coco's click-based session-continuity tool is performing, drawn from quantitative analysis of 10 recent transcripts (Apr 24 → May 1, ~1,500 user messages, 78 click ops) and from Sean's qualitative pain points captured during the Apr 29 review session.

Captured under click `c-mo1itggx` (parked) — "How should Coco's click-based session continuity work end-to-end?"

## Data

| Command type | Calls | Mean chars | Total |
|---|---|---|---|
| `tree` (startup scan) | 14 | 11,430 | 160K |
| `extract` (subtree dive) | 16 | 7,828 | 125K |
| `show` (single click) | 11 | 2,395 | 26K |
| create/conclude/amend (writes) | 37 | 1,039 | 38K |

Click commands eat ~14% of total tool output across these sessions (range 3.6%–38.4%; design/handoff sessions skew higher). Per-session: ~31K chars of click reads on average.

**Tree utility ratio**: ~1.4% of clicks listed in the startup tree are accessed in the same session (range 0%–3.6%). 98% of the tree-load is passive orientation; some unread context is the point of a tree, but the ratio is low enough to flag.

**Live pile size**: 291 live clicks. 78% are leaves. None older than 14 days (median 6, p75 13) — no aging mechanism keeps the pile honest.

**Conclusion verbosity**: the skill says "decision + one-line reasoning, a small paragraph." Reality: conclusions average **1,064 chars**, with 7/13 sampled over 1,000 chars — Coco writes essays despite explicit guidance to the contrary.

**ID-in-prose leakage**: 38, 54, 41 click-id mentions in assistant *free text* per session, despite the rule "Keep click IDs out of prose." The rule isn't being followed because there's no good substitute referent.

## What's working

1. **Sean uses clicks as navigational vocabulary.** "The cost reduction umbrella click." "Phase 2 clicks." "Find or create a relevant top-level click." That's the test of an internalized tool: it has become shared language.
2. **Tree → extract is the working pattern.** Every startup `tree` is followed by an `extract` within 3 events. The tree does its job as a launchpad.
3. **Handoff fidelity is high** within a tightly-scoped arc (e.g., the Laboratory MVP across sessions 0cb / cb9 / 88f).

## What's not working — Sean's pain (Apr 29 review)

These were articulated in conversation and matter more than the metrics; they reframe the assessment.

1. **No place for larger content.** Clicks were supposed to be short, with the assumption that *volume* of tiny clicks would replace long-form content. That assumption was wrong. Real ideas need long-form rationale, alternatives considered, examples. As a result, Coco bloats goals and conclusions, and other long-form ends up in `.scratch/` where it gets lost.

2. **Lost / can't verify.** Sean has no mental model of the click tree. He can't verify that what Coco captures matches his understanding. Hence the constant "give me a summary of X" pattern and the imprecise pseudo-slugs ("the cost-opt umbrella," "the phase 2 clicks"). A trust-but-cannot-verify dynamic is producing slow erosion of confidence — he suspects things are being lost.

3. **No standardized patterns.** When to create a child vs sibling. Click granularity. How comprehensive to click. When to click a todo vs a question. The skill has guidance but not a playbook. Coco improvises and Sean has no anchor for "is this being done right."

4. **LLM impedance mismatch.** Models work better with longer-form structured markdown than with many tiny atomic edits. The micro-write cadence of clicks may be working against model comprehension. `extract` flattens to markdown as a workaround; whether it's good enough is open.

## What's not working — additional Coco-side observations

5. **`nsg` output pollution.** Every click command result is suffixed by 3 lines of `[scriptorium] Background clone... failed`. Every. Single. Command. Pure context noise.

6. **No live-pile pruning.** Nothing ages out of `live`. The tree grows monotonically until something is concluded. 226 live leaves is too many.

7. **Acknowledged gaps still live in the tree.** `c-mo1itn3x` ("How do we prevent concluded clicks from becoming forgotten knowledge?") and `c-mobzwczn` ("Surface supersedes links prominently") have been live since mid-April with no movement.

## Cost of the micro-edit cadence

Each `nsg click create / conclude / amend` is a separate Bash invocation = a turn. Per session: ~7 click write ops × ~250–500 tokens of model output to construct each command + 200 chars of response ≈ 1,000–1,500 tokens per write. Total: **10–15K tokens per session in click write overhead**, on top of the ~31K chars of reads.

Compared to a typical Coco session of 50K–100K input tokens, that's 10–25% of context budget going to click bookkeeping rather than substantive work. Significant but not crushing — and it's the *cadence* (turns) that costs more than the *volume* (chars).

## Replace or evolve?

**The substrate is right** — hierarchical decomposition of inquiries with immutable goals matches how Sean thinks about the work, and the tree has become shared vocabulary. Replacing it wholesale would discard real, working continuity.

**But the click as currently shaped is wrong for the actual workload.** It collapsed two distinct things — *short atomic decisions* and *long-form deliberations* — into one type that suits neither well. Sean's pain points all root in this collapse.

The evolution path is to **separate the structural skeleton from the content body**. Two concrete shapes worth designing:

- **Hybrid: click + optional attached body.** Click stays the lightweight metadata node (id, goal, status, parent, links — DB-backed, query-able). Each click MAY have an attached markdown body in a known canonical location (e.g., `clicks/<id>-<slug>.md`). `extract` includes body inline. Long-form is opt-in per click; routine micro-decisions stay short.
- **Click types: question vs decision-record.** A `question` click is short, fast-cycle, low-weight (current default behavior). A `decision-record` click is heavyweight, expects long-form rationale, gets a body file by default. Different defaults, same query graph.

Both keep the tree, both add long-form, both require the canonical-file convention to solve the lost-in-scratch problem.

## Recommendations (ordered by leverage)

1. **Separate structural skeleton from content body.** Pick a hybrid shape (click + optional attached body file in a canonical location). This addresses Sean's #1 (long-form) and #2 (lost-in-scratch) directly, and unblocks tightening conclusions (#1 of original recommendations).

2. **Build Sean a navigation surface.** The Oculus click page (already a live click: `c-mo1nf6ca`) needs to ship — Sean needs a UI he can browse, search, and verify against his mental model. Even a simple flat-text dump (`clicks/index.md`, generated, always-current) would close the trust-but-cannot-verify loop.

3. **Formalize a clicks playbook.** Decision matrix (chat / new click / child click / no click), granularity rules with examples, click-type guidance (question / todo / decision-record / umbrella), anti-patterns. Write it once, link from `coco.md` and the skill.

4. **Squash the scriptorium error suffix.** Either fix the underlying clone failures or filter daemon-side stderr from CLI output. Pure-noise reduction.

5. **Default `tree` to umbrella-scan only.** Top-level with child counts, not full subtree. Drops startup cost from 11K → ~1K chars while preserving orientation. Full tree opt-in via `--depth`.

6. **Active-subtree filtering.** `--touched-since 7d` or `--has-recent-activity`. 78% of the live pile is dead weight in any given session.

7. **Aging mechanism for live clicks.** Weekly stale-live triage (Coco-driven) or auto-park after N days idle. Keeps the live pile honest.

8. **Resolve the ID-in-prose debate.** Drop the rule (data shows it's not followed and Sean reads IDs fine) OR add memorable aliases (`nsg click alias <id> cost-umbrella`).

9. **Conclusion length cap or `--rationale-doc <path>` flag.** Hard cap at ~600 chars, with body-file escape valve. Forces tight conclusions while preserving long-form when warranted.

## Open questions for follow-up

- What's the right canonical home for click body files? `clicks/<id>.md` at sanctum root? Co-located with the experiment if a click belongs to one?
- Should body files be DB-tracked (synced via `nsg`) or pure filesystem (just convention)?
- For the playbook: should we generate it inductively from the existing tree (cluster patterns, surface what we've actually been doing) or top-down from theory?
- LLM-impedance: is `extract`'s flattened markdown actually good enough for model comprehension, or do we need to deliver clicks-as-doc more often?
