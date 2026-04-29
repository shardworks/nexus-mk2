---
status: active
---

# X011 — Context Debt

## Research Question

How much of an agent's context window is consumed by tool output it will never reference again, and can we reduce this without hurting agent effectiveness?

## Origin

Observed during X007 (First Contact): the artificer's context jumped from ~30K to ~36K tokens at `npm install` — output that was never referenced again but remained in the context window for the rest of the session, re-read (and paid for) on every subsequent turn.

The agent partially mitigated this itself (`npm install 2>&1 | tail -10`) but the output still entered the conversation. Every `ls`, `git log`, test run, and build output accumulates the same way — context debt that the agent pays interest on for the remainder of the session.

## Hypothesis

A significant fraction of context window usage (and therefore cost) comes from tool output that is consumed once and never referenced again. Providing agents with output-controlled execution tools — commands that suppress output on success, truncate to N lines, or summarize results — would reduce context growth without reducing agent effectiveness.

## Prior Evidence (motivation)

The April 25 implement-engine cost analysis ([`artifacts/2026-04-25-implement-cost-analysis.md`](artifacts/2026-04-25-implement-cost-analysis.md)) is the strongest motivating data we have for this experiment. Across April, implement-engine session cost grew ~13× (avg $0.65 → $8.56). Decomposition of token categories:

- Cache-read tokens: 668k → 11,934k avg/session (~18×)
- Output tokens: 8k → 50k avg/session (~6×)

Cache-read growth dominated cost growth. The mechanism is exactly what X011 hypothesizes at session scale: every additional turn re-reads the entire accumulated conversation history, and the conversation history has grown — partly because of structural changes (the Apr 16 task manifest forcing iterative verify cycles) and partly because tool output and intermediate work are not pruned.

The April analysis does not isolate "dead tool output" as a fraction of the cache-read total — it observes the aggregate effect. X011 proposes the targeted measurement: of the cache-read volume each turn re-pays, how much is referenced again vs how much is dead weight that could be summarized, truncated, or quietly suppressed?

A follow-on Apr 25 deep-dive ([`artifacts/2026-04-25-cost-density-and-cliffs.md`](artifacts/2026-04-25-cost-density-and-cliffs.md), n=74 implement sessions joined to seal-commit diffs) refined the picture further:

- **Files-touched is the single strongest cost predictor** (Pearson +0.81 vs cost) — beats spec size, beats task count, beats churn-LOC.
- A clear cost cliff sits at ~20 actual files / ~15 predicted files: 11% of sessions above the cliff account for ~38% of total post-Apr-16 implement cost.
- Per-package cost density splits into three patterns: volume hotspots (spider, clerk, astrolabe — 25-34% of sessions, average per-LOC), density hotspots (animator, claude-code — small footprint, 2× per-LOC), and cheap packages (ratchet, clockworks, lattice — half the per-LOC rate).
- Per-LOC cost varies 340× across the population — most of the spread is exploration cost, the agent reading the codebase to make a small change.

The full investigation arc, including refuted intervention hypotheses and the methodological lessons, is documented as a case study at [`docs/case-studies/2026-04-25-implement-cost-investigation.md`](../../docs/case-studies/2026-04-25-implement-cost-investigation.md).

Related clicks: `c-modxwx8c` (root cost-analysis), `c-modxx4nj` (interventions umbrella with the predicted-files-gate, animator-simplification, and spider-decomposition candidates), `c-modzr9w0` (project complexity measurement direction), `c-modzrgiu` (cost-drift sentinel under Stage 2 self-correction).

## Possible Approaches

- **A `run` or `exec` tool** that returns exit code + summary on success, last N lines on failure. Full output never enters context. Agent chooses when to use quiet mode vs. verbose Bash.
- **Instruction-level guidance** teaching agents to redirect verbose output to files and read selectively.
- **Framework-level truncation** in the session provider — auto-truncate tool results above a threshold.
- **Output policies** — per-command rules (suppress npm install on success, always show test failures, truncate build output to errors only).

## Open Questions

- How much context is actually "dead" output by the end of a typical session? Need to measure this across multiple sessions.
- Does truncating output hurt agent effectiveness? Some agents use earlier output for reference (e.g., re-reading an `ls` result to remember file structure).
- Is this better solved by the agent (instructions to use `tail`/redirect), the tools (quiet-mode execution), or the framework (auto-truncation)?
- How does this interact with X010 (Staged Sessions)? If context debt drives sessions to fill up faster, reducing it extends the useful life of a single session.

## Depends On

- Session transcript data from multiple commissions (for measuring dead output)
- X007/X010 cost analysis tooling (for quantifying the cost impact)

## First Instrument: Read Utilization Analysis (Apr 29, 2026)

X011 was activated on 2026-04-29 alongside the publication of its first
empirical instrument: a transcript analyzer that classifies every Read
in an implementer session against subsequent edits, measuring the
fraction of read content that is *never modified* — i.e., context bloat
in the precise sense the X011 hypothesis names. The artifact and script
land in this experiment:

- [`artifacts/2026-04-29-read-utilization-analysis.md`](artifacts/2026-04-29-read-utilization-analysis.md) — initial findings on the rig pair (1.9% vs 49.1% pure-read share) plus root-cause tracing to the astrolabe inventory format
- [`artifacts/scripts/h4_read_utilization.py`](artifacts/scripts/h4_read_utilization.py) — the analyzer, generalizable to any Claude Code transcript

The analyzer output classifies each Read as one of:

- **Read AND edited** — file was Read, then later Edit/Written (legitimate work)
- **Read AND bash-modified** — file was Read, then deleted/moved/sed-i'd via Bash
- **Read but NEVER touched** — pure context bloat

Aggregate stats per session: total read content size, share of each
class, top files in each class, category breakdown (test / doc /
source / config).

### Generalizing the Instrument

The Apr 29 instrument is purpose-built for Claude Code transcripts and
the framework's tool repertoire (Edit, Write, Read, Bash with
filesystem-modifying commands). To turn it into a standing X011
measurement that runs across the full implement-session population — not
just one-off rigs — three generalizations are needed:

1. **Schema-stable per-session output.** Today the script prints a
   human-readable table. To support trend tracking, it should also emit
   a YAML or JSON record per session with a stable schema:

   ```yaml
   session_id: ses-...
   transcript_path: ...
   total_read_chars: 458640
   total_read_files: 21
   read_and_edited: { chars: 233544, files: 8 }
   read_and_bash_modified: { chars: 0, files: 0 }
   pure_read: { chars: 225096, files: 13, share: 0.491 }
   pure_read_top_files: [{path, chars}, ...]
   pure_read_by_category: { source: ..., doc: ..., test: ..., config: ... }
   ```

   This output should land in `experiments/data/X011/<session_id>.yaml`
   alongside the existing session record.

2. **Batch driver across the session corpus.** A wrapper script that
   walks all archived transcripts (or filters by engine role / date
   window), runs the analyzer on each, and produces both per-session
   YAML and a cohort-level summary (median pure-read share, distribution
   by engine, distribution by commission size). This lets X011 track
   pure-read share as a metric that drifts over time — useful for
   measuring intervention impact.

3. **Laboratory integration (eventual).** Once the schema stabilizes,
   the analyzer becomes a Laboratory standing-instrument: when a session
   completes, the lab automatically runs the analyzer and records the
   pure-read profile alongside the session yaml. Operators see
   pure-read share as a dashboard metric. Pre-and-post-intervention
   measurements happen automatically.

Generalizations 1 and 2 are sanctum-side data work, low effort. They
should ship soon to support the **Apr 29 cost-optimization landscape's
Priority 1** (inventory excerpting): the acceptance signal for that
intervention is "median pure-read share on substantive commissions
drops below 15%." Without instrument generalization, that signal can
only be measured one rig at a time.

Generalization 3 (Laboratory integration) is medium-effort framework
work and depends on the X011 schema being stable.

## Status

X011 is active as of 2026-04-29. The first instrument (read-utilization
analysis) is published; current open work is:

- Generalize the instrument for cohort measurement (schema stabilization
  + batch driver)
- Run baseline measurement across the post-Apr-16 implement corpus
- Coordinate with the cost-optimization umbrella `c-mok4nke6` Priority 1
  to measure the impact of inventory excerpting on pure-read share
