---
description: Draft, refine, and post pre-Astrolabe briefs. Invoke when asked to draft, write, refine, or post a brief / commission.
---

# Briefs — Drafting and Dispatching Workflow

A **brief** is a pre-Astrolabe artifact that captures the *intent* of a unit of work and the *non-negotiable decisions* that constrain how it gets implemented. Briefs are the input to a sage commission; the sage (Astrolabe) consumes the brief and produces a spec, which the implementing artificer turns into code.

## Role chain

| Artifact | Author | Audience | Carries |
|---|---|---|---|
| Brief | Coco (with patron) | The sage (Astrolabe) | Design intent + non-negotiable decisions + scope fences + references to source clicks |
| Spec | The sage | The implementing artificer | Implementation plan, file-level changes, API signatures, test plan |
| Code | The artificer | Future agents reading the codebase | The actual implementation |

A brief that drifts into spec territory leaks decisions that should have been left to the implementer's judgment, makes the brief brittle to refactoring (file:line refs go stale), and collapses the role boundary that the guild's organization depends on. **The discipline is intent, not how-to.**

## Content discipline

### What a brief carries

- **Intent** — what this unit of work accomplishes, framed as motivation + design summary.
- **Non-negotiable decisions** — the design choices the implementer cannot revisit. Each should be the conclusion of a click (or set of clicks) from the design subtree.
- **Scope fences** — explicit out-of-scope items, especially ones the implementer might naturally drift into.
- **References to source clicks** — sages have click access and will resolve references to inline the substantive content when generating the spec. Click ids in briefs are fine; click ids in *specs* are not (specs are consumed by the artificer, who has no click access).

### What a brief does not carry

- **File paths and line numbers.** "In `clerk.ts:247-264`, replace X with Y" — that's the spec's job. The sage will figure out the right files and lines from the intent.
- **Exact API signatures or full type definitions.** A short shape sketch is fine when it's the cleanest way to express intent; full code blocks belong to the spec.
- **Numbered §1/§2/§3 implementation plans.** Briefs organize around design topics and decisions, not implementation steps.
- **Test file paths, helper names, mock setup, or assertion mechanics.**
- **Exit criteria that name specific files** ("`docs/architecture/foo.md` exists") — bake the artifact into the design intent if it matters, otherwise let the sage decide where it lives.
- **Commodity constraints** ("lint passes," "all tests pass") — those are always true and add noise.
- **Exit criteria that restate the design section verbatim** — redundant.

### The nuanced cases

Some content sits between intent and implementation. Apply the *gut check*: **is this design intent, or am I doing the spec's job?**

**Scenarios to verify** — briefs **may** include a list of behavioral cases that must hold ("writ in a 3-cycle transitions to `stuck` with all members listed"; "two failed blockers gets a resolution naming both short-ids"). Frame these as *behavioral cases the design depends on*, never as test prescriptions ("add a test in `spider.test.ts` that mocks…"). Especially valuable when the design conversation surfaced non-obvious edges (cycles, recovery paths, composition rules) that the implementer might not naturally surface. For simple briefs where the scenarios are obvious from the design text, omit.

**Behavioral exit criteria** — briefs **may** include a list of "after this lands, X must be true" checks when the design has multiple parts and a checklist helps confirm coverage. Frame these as *observable outcomes*, never as artifact-existence checks. If the brief has only a few decisions, the design section already implies the outcomes and the checklist is redundant.

The line is intent vs how-to, not test/no-test or criteria/no-criteria.

## Workflow

### Drafting

Draft in `.scratch/brief-<slug>.md`. The slug should be short and recognizable (e.g., `brief-spider-follows-gating.md`). This gives Sean a navigable file he can annotate and review in his editor — drafts are not collaborated inline in chat.

A typical brief structure (adapt as needed; this is a starting template, not a constraint):

```
# <Title>

## Intent
<one or two paragraphs: what this commission accomplishes, the gist of the design>

## Motivation
<why now, what's broken or missing, who/what is the natural consumer>

## Non-negotiable decisions
<organized by decision, not by file. Each section is one design choice
with a brief rationale. Reference the source click for each.>

## Out of scope
<explicit fences: things the implementer might drift into, with a
one-line reason for each exclusion>

## References
<the design subtree (parent click), supporting clicks, prior briefs
this one builds on or supersedes>
```

Other sections appear when the work warrants them — e.g., "Substrate changes" when the brief carries adjustments to existing substrate alongside the main work; "Authoring surfaces" when there are multiple consumer-facing entry points.

### Iteration

Sean iterates on the brief by editing the scratch file directly (or in chat). When he provides feedback — file edits, annotations, or out-of-band comments — **restate a summary of that feedback in chat**, using Sean's direct words as much as possible. This "states it for the record" so the substance appears in the transcript where Scribe can capture it (transcript-capture habit, per coco.md).

### Click references in briefs

Click ids are first-class in briefs — they're how the brief connects to the design conversation. The sage extracts and inlines the substance when generating the spec. Don't strip click ids out of briefs to "make them self-contained"; that's the sage's job, not Coco's.

### Stay inside the target repository

A brief is posted as the body of a writ in a specific codex, and every downstream reader (the sage, the artificer, the reviewer) operates inside the codex's target repository. **Do not reference any path or artifact that lives outside that repository** — in particular, nothing under the sanctum (`/workspace/nexus-mk2/...`), nothing under `.scratch/`, nothing under `experiments/`, nothing in sibling repos. Those paths are dead links from the artificer's perspective.

This applies to:

- File path references (`.scratch/brief-foo.md`, `experiments/X008/spec.md`, etc.) — omit entirely.
- Cross-commission references — when pointing at prior or parallel briefs, name them by intent ("the link-substrate rename sweep commission") rather than by scratch path. If the relationship is load-bearing, the brief should stand on its own intent without requiring the reader to fetch a sibling artifact.
- Sanctum-side documentation, data, or tooling paths — not available to agents operating in the framework repo.

Click ids are the exception — clicks live in the guild's books and are resolvable by any sage with click access regardless of which repository the commission targets.

When drafting, do the grep before handing the brief to Sean: `grep -n '\.scratch\|nexus-mk2\|sanctum' brief-*.md` should return nothing.

## Posting

Use `bin/commission.sh` from the sanctum:

    ./bin/commission.sh --codex <codex> [--complexity N] -- @.scratch/brief-<slug>.md

- `--codex` is required. Common values: `nexus` (the framework). Ask Sean if uncertain.
- `--complexity` is the patron's dispatch-time estimate on the Fibonacci scale (1, 2, 3, 5, 8, 13, 21). If Sean hasn't volunteered one when he says "dispatch this," ask before posting — it's a primary data point for X008 and missing-at-dispatch entries become a cleanup task at the next session.
- The `@<path>` form reads the body from a file. The title is auto-extracted from the brief's first heading.
- The script returns the writ id (`w-…`) on success. Capture it for the post-dispatch bookkeeping below.

Underlying CLI: `bin/commission.sh` wraps `nsg commission-post` and additionally patches the complexity into the Laboratory's commission log entry. **Always** prefer the wrapper — calling `nsg commission-post` directly skips the log-patching step.

## Post-dispatch bookkeeping

When a brief is dispatched, three things must follow:

1. **Conclude the parent design click.** The click whose subtree drove the design is now resolved by the act of dispatch. Conclude it with a short summary of the final shape and the dispatched writ id. Example conclusion:

       Design fully resolved and dispatched as commission w-mo35s0fo-1a1e3cd285bc.
       Final shape: <one-paragraph summary of the locked-in design>.

2. **Delete the scratch file.** The brief has been published into the writ system; the scratch copy is no longer the source of truth. Per the "Collaborating on Documents" directive in coco.md, scratch files are deleted when their content is published. Don't let `.scratch/` accumulate stale dispatched briefs.

3. **Coco-log entry.** The dispatch is part of a session of work; the coco-log entry covers the design conversation and the act of dispatching. Reference the writ id in the log so future sessions can join the design session to the resulting commission.

## Common pitfalls

- **Drifting into spec.** The most common failure. Symptoms: file paths appearing in the brief, full TypeScript code blocks beyond a shape sketch, test file names, exit criteria like "the foo.ts file at line N is updated." When you catch this, ask the gut-check question and rewrite.
- **Leaking sanctum references into the brief.** `.scratch/...` paths, sanctum doc paths, experiment directories. Dead links from the artificer's perspective. See "Stay inside the target repository" above.
- **Stripping click references.** Don't try to make briefs self-contained by inlining the substance of their source clicks — that's the sage's job. Briefs reference; specs inline.
- **Forgetting the complexity rating.** Missing-at-dispatch complexity becomes a session-startup cleanup task. Ask before posting.
- **Skipping the wrapper script.** `nsg commission-post` works but skips the log-patching step. Always go through `bin/commission.sh`.
- **Forgetting to conclude the parent click.** Leaves the design click sitting in `live` indefinitely, pretending there's still active design work when the work is actually in flight as a commission.
