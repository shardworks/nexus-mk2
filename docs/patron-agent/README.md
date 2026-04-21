# Patron Agent — Operational Records

This directory holds everything related to **Sean's patron agent** — the AI identity that stands in for Sean's taste and judgment when decisions need to be made about in-flight work. It's not an experiment (experiments live under `experiments/`); it's an operational concern that will evolve continuously as we learn what principles and behaviors best capture patron judgment.

## What is the patron agent?

The patron agent has two jobs:

- **Job 1 — Decision-fill.** When an Astrolabe planner generates a plan with open decisions, the patron agent picks one option per decision, citing which principle fired and at what confidence. Unfilled decisions fall through to a decision-review engine.
- **Job 2 — Petition-fleshing.** When a planner or Distiller needs thin-brief expansion, the patron agent produces a petition that names the reader, the decision, the scope cut, and the assumptions / deferred questions — fabricating specifics under Sean's taste rather than hedging.

The agent is a **principle bank** — a numbered list of principles extracted from Sean's past decisions, design conversations, and style markers. Each agent-output cites the principles that fired by number.

## Current canonical version

The active role file lives at `/workspace/nexus-mk2/.claude/agents/patron-flesh.md`. It must stay there — Claude Code's `--agent` flag reads from that path.

Version notes:

- **v4 (current)** — 41 principles, includes customs #36–#41 added during v3→v4 refinement.
- **v3** — 35 principles, no customs. Preserved in `history/patron-v3.md`.

There is also a control agent at `/workspace/nexus-mk2/.claude/agents/patron-baseline.md` (no principles). Used in Eval A to isolate the contribution of the principle bank; not a production artifact.

## Directory contents

- `README.md` — this file
- `v4-customs-review.md` — pending manual review of the 15 v4 customs (tag each as `endorse` / `partially-endorse` / `context-gap` / `wrong`). See open loops below.
- `evals/` — evaluation runs, each preserving inputs, scripts, outputs, and reports
  - `petition-fleshing-eval-a/` — Eval A (2026-04-20). n=3 reliability study on 8 thin briefs comparing v4-flesh vs. no-principles baseline. Findings in `n3-report.md`.
  - `decision-fill/` — Job-1 eval. Runs the patron agent on stripped plandoc decisions (v3 and v4) and classifies agreement with Sean's recorded selections via `compare.py`.
- `history/` — superseded role files and evolution-trail drafts
  - `patron-v3.md` — v3 bank
  - `v3-candidate-draft.md` — earlier draft that evolved into `patron-v3.md`
  - `v4-additions-draft.md` — draft of the v4 customs (#36–#41) before they were folded into the role file

## Open loops

Three refinement tasks are tracked as children of the patron-agent refinement umbrella click (`c-mo81527r`):

1. **v4 customs review** (`c-mo7jrraz`) — tag each of the 15 customs in `v4-customs-review.md` with `endorse` / `partially-endorse` / `context-gap` / `wrong`. Prunes dead-weight customs (Opus reaches them unprompted) and flags overreach. ~30–45 min.
2. **v3-vs-v4 comparison** (`c-mo8158c8`) — rerun `evals/petition-fleshing-eval-a/` with a v3 role file (swap bank content) to isolate whether v4 additions are load-bearing. Bank-sizing intel; not a dispatch blocker. ~45 min.
3. **Decision-fill manual review** (`c-mo815bgg`) — run `compare.py --details divergent` in `evals/decision-fill/`, then tag each divergent case as defensibly-principled disagreement or agent-got-it-wrong. The (wrong) bucket reveals Job-1 bank gaps. Complements Eval A (which covered Job 2 only).

## How to (re)use this

### Running the petition-fleshing eval on a new bank version

```bash
cd docs/patron-agent/evals/petition-fleshing-eval-a/
# Update /workspace/nexus-mk2/.claude/agents/patron-flesh.md to the new bank
./run-rep.sh 4    # writes outputs to reps/4/
python reliability.py
```

Inputs live in `inputs/`; compare reps against each other or against the rep-1–3 data from the v4 run.

### Running the decision-fill eval on a new bank version

```bash
cd docs/patron-agent/evals/decision-fill/
./run-all.sh
python compare.py --json comparison-v5.json
python compare.py --details divergent
```

The stripped inputs live in `stripped/`; real plandoc specs are read from `/workspace/nexus-mk2/specs/` at strip time (rerun `strip-decisions.py` if specs have changed).

### Running the v3-vs-v4 comparison

1. Save the current `/workspace/nexus-mk2/.claude/agents/patron-flesh.md` somewhere safe (or snapshot it into `history/`).
2. Copy `history/patron-v3.md` over it, adjusting the frontmatter so Claude Code still recognizes the agent.
3. Run `./run-rep.sh 4` under `evals/petition-fleshing-eval-a/` (rep number can be any unused slot).
4. Run `python reliability.py` and compare the v3 replication rates to the v4 matrix in `n3-report.md`.
5. Restore the v4 role file when done.

### Adding a new eval

Create `evals/<name>/` with its own inputs, runner, outputs, and report. Cross-link from this README.

## Conventions

- Role files are markdown with numbered principles. Principle ids are stable across versions — don't renumber. Additions take the next available number; removals leave a gap.
- Every agent output cites principles inline as `(#N)`. Density (per-output citation count) is a bank-health signal — stable density across reps means the bank is being *applied*, not invoked at random.
- When updating the canonical role file, snapshot the superseded version into `history/<slug>.md` first.
- Evaluation artifacts live under `evals/<eval-name>/` — scripts, inputs, outputs, logs, reports. Keep everything together so future reruns are self-contained.
