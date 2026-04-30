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

**Default: post the brief directly as a draft-phase writ.** No scratch files, no editor dance. Sean reviews the draft in Oculus; if it needs changes, iterate via `nsg writ edit` (or re-post and cancel the old draft). The draft-phase writ is the reviewable surface.

```bash
nsg commission-post --codex <codex> --draft \
  --title "<brief title>" \
  --body "$(cat .scratch/brief-<slug>.md)"
```

The body is the full brief, including its markdown. The title must be supplied explicitly (typically the brief's `# Title` heading text, sans the `#`).

**Do not draft in `.scratch/` by default.** The "draft a markdown file, get Sean to review it in his editor, iterate in chat, then post" cycle is dead — Sean explicitly asked to skip it. The only exception is when Sean specifically requests offline editor review of a file (e.g., for a large, complex brief where annotation-in-place is the right collaboration mode). In that case, use `.scratch/brief-<slug>.md`; otherwise, direct-to-system.

A typical brief structure (adapt as needed; this is a writing template, not a file-location directive):

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

### Draft phase vs immediate dispatch

The direct-to-system workflow gives you two dispatch modes:

- **Draft (`--draft`)** — the default when any of the following apply: the brief is part of a multi-commission batch, depends on other writs (via `depends-on`), or Sean hasn't yet seen the final body. Sean reviews in Oculus; publish via `nsg writ publish --id <writ-id>` when ready.
- **Open (no `--draft`)** — appropriate when the brief was fully worked out in chat, is a single unit, has no dependencies, and Sean has signaled he wants it to go immediately. The writ enters the dispatch queue at post time.

When in doubt, use `--draft`. A draft is cheap to review and publish; an already-dispatched writ is harder to retract.

### Iteration

Sean iterates on a draft by reviewing it in Oculus and telling Coco what to change. When he provides feedback — edits, annotations, or out-of-band comments — **restate a summary of that feedback in chat**, using Sean's direct words as much as possible. This "states it for the record" so the substance appears in the transcript where Scribe can capture it (transcript-capture habit, per coco.md). Apply the feedback via `nsg writ edit` (for narrow body tweaks) or by re-posting a corrected draft and cancelling the old one (for substantial rewrites).

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

Use `nsg commission-post` directly:

    nsg commission-post --codex <codex> [--draft] \
      --title "<title>" \
      --body "$(cat path/to/brief.md)"

- `--codex` is required. Common values: `nexus` (the framework). Ask Sean if uncertain.
- `--title` is required. Use the brief's first heading verbatim (sans `#`); truncate to ~100 chars if longer.
- `--draft` creates the writ in draft phase (does not dispatch until published). See "Draft phase vs immediate dispatch" above for when to use it.
- The command emits a JSON object with `id` (the new writ id) on stdout. Parse and capture it for any follow-on work (depends-on links, publish, bookkeeping).

### Multi-commission batches

When dispatching multiple related commissions (e.g., a decomposed refactor with dependencies), post all of them as drafts, wire the `depends-on` links between them, then leave them draft for Sean's Oculus review. Publish the leaves last, once Sean has ratified the batch. Link syntax:

    nsg writ link --source-id <dependent> --target-id <prerequisite> --kind depends-on --label depends-on

Both `--label` and `--kind` are required — `--label` is the casual relationship name; `--kind` is the load-bearing registered link type that Spider's dispatch logic and the Reckoner's dependency-aware consideration both read.

## Post-dispatch bookkeeping

"Dispatch" means the writ enters the Spider's queue — at post time for open-phase writs, at publish time for draft-phase writs. The bookkeeping fires on the actual dispatch moment.

Three things follow:

1. **Conclude the parent design click.** The click whose subtree drove the design is now resolved by the act of dispatch. Conclude it with a short summary of the final shape and the dispatched writ id(s). Example conclusion:

       Design fully resolved and dispatched as commission w-mo35s0fo-1a1e3cd285bc.
       Final shape: <one-paragraph summary of the locked-in design>.

2. **Delete any scratch file.** If the offline-review exception was used and a `.scratch/brief-*.md` file was created, delete it after dispatch — the writ carries the content now. In the default direct-to-system flow, there's nothing to delete.

3. **Coco-log entry.** The dispatch is part of a session of work; the coco-log entry covers the design conversation and the act of dispatching. Reference the writ id(s) in the log so future sessions can join the design session to the resulting commission(s).

For multi-commission batches, conclude the parent click once (naming all dispatched writ ids) rather than per-commission.

## Common pitfalls

- **Drifting into spec.** The most common failure. Symptoms: file paths appearing in the brief, full TypeScript code blocks beyond a shape sketch, test file names, exit criteria like "the foo.ts file at line N is updated." When you catch this, ask the gut-check question and rewrite.
- **Drafting in `.scratch/` by default.** The old editor-review dance is dead. Post directly as a draft-phase writ and let Sean review in Oculus; only use `.scratch/` when Sean explicitly asks for offline file review.
- **Leaking sanctum references into the brief.** `.scratch/...` paths, sanctum doc paths, experiment directories. Dead links from the artificer's perspective. See "Stay inside the target repository" above.
- **Stripping click references.** Don't try to make briefs self-contained by inlining the substance of their source clicks — that's the sage's job. Briefs reference; specs inline.
- **Forgetting `--label` on a `depends-on` link.** The `nsg writ link` command requires both `--label` (casual name) and `--kind` (registered load-bearing type). Passing only `--kind` fails.
- **Forgetting to conclude the parent click.** Leaves the design click sitting in `live` indefinitely, pretending there's still active design work when the work is actually in flight as a commission.
