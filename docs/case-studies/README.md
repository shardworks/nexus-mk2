# Case Studies

Narrative-with-data accounts of system shifts, investigations, and design arcs that hold up as standalone reading. The intended audience includes external readers (blog posts, articles, talks) as well as future-Sean and future-agents trying to understand why the system is the way it is.

## What goes here

- **Investigation arcs** — a problem surfaced, was investigated, and resolved (or didn't). Examples: a cost step-change, a quality regression, a substrate redesign. The narrative includes hypotheses considered and rejected, false starts, and methodological lessons — not just the final answer.
- **System shifts** — the story of a deliberate change that crossed a meaningful threshold (architectural, behavioral, economic). What was the motivation, what was tried, what changed, what's the new state.
- **Design retrospectives** — closed loops on a body of design work that's now landed. Different from `experiments/` (which test hypotheses) — case studies tell stories about a path through the work.

## What doesn't go here

- **Experiment artifacts** — those go in `experiments/X*/artifacts/`. Experiments test specific hypotheses; case studies are broader narratives that may cite experiments.
- **In-progress design notes** — those live in `.scratch/` until they become commissions or land somewhere durable.
- **API or feature reference** — that's framework-side documentation (`/workspace/nexus/docs/`).
- **Click conclusions** — clicks carry their own resolution. A case study may reference clicks as supporting evidence but shouldn't duplicate them.

## Format expectations

Written for someone who *wasn't there*. Bake in enough context that a reader can follow without already knowing the system's vocabulary or the prior conversation. Tables, charts, and concrete numbers carry the weight; prose connects them into a story.

Length is whatever the story requires. A small investigation might be 2 pages; a substrate redesign might be 10. Avoid padding.

Naming: `YYYY-MM-DD-<slug>.md`, where the date is when the investigation closed (or the case study was written, if it's a longer-running thread).

## Existing case studies

- [`2026-04-25-implement-cost-investigation.md`](2026-04-25-implement-cost-investigation.md) — investigation of the April implement-engine cost step-change; methodological retrospective and final intervention picture.
