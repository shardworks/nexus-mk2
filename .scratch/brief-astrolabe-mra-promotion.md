# Promote MRA to default astrolabe pipeline, split sage role, end session reuse

## Background

Astrolabe currently ships two rig templates contributed to Spider: `planning` (baseline: `reader → analyst → spec-writer` as three separate anima-sessions sharing one `conversationId`) and `planning-mra` (experimental: `reader-analyst → spec-writer` as two anima-sessions). Both use a single shared role, `astrolabe.sage`, whose instructions file (`sage.md`) is mode-dispatched — the role's opening line tells the agent to "operate in one of three modes: **READER**, **ANALYST**, or **WRITER**. Your mode is specified at the start of each prompt. Follow ONLY the instructions for your current mode."

An A/B experiment (quest `w-mnt3t5h8-943e2a2ef85f`) concluded that the merged-session structure (`planning-mra`) wins on cost, wall-clock, and at-least-ties on plan quality versus the split-session baseline across both test briefs. A fresh cache-reuse analysis (`experiments/data/2026-04-15-astrolabe-cache-reuse-analysis.md`) also found that the "share a role file and conversation across stages for prefix caching" rationale underlying the baseline's design is not well supported by the measured data — cross-session cache inheritance delivers only ~27% analyst savings, while within-session file reuse (what MRA naturally gets) delivers ~42%.

The MRA template also carries a latent inconsistency: its `reader-analyst` stage sends `MODE: READER-ANALYST` as its mode header, but `sage.md` has no section for that mode. The inline prompt is self-contained enough that agents do the right thing anyway, but the contract is broken.

This writ refactors Astrolabe to promote the merged pipeline to the default, split the `sage` role into job-specific roles (fixing the mode-dispatch inconsistency), and end the cross-session conversation reuse that the cache analysis showed is not load-bearing.

## Deliverables

### 1. Rename and reshape the rig templates

Astrolabe contributes exactly two rig templates after this change, both exported from `packages/plugins/astrolabe/src/`:

- **`two-phase-planning`** — the promoted default. Shape: `plan-init → draft → reader-analyst → inventory-check → decision-review → spec-writer → spec-publish → seal`. This replaces today's `planning-mra`.
- **`three-phase-planning`** — preserved as a non-default fallback and as the reference template for future A/B experiments. Shape: `plan-init → draft → reader → inventory-check → analyst → decision-review → spec-writer → spec-publish → seal`. This replaces today's `planning`.

The engines registered by the plugin (`astrolabe.plan-init`, `astrolabe.inventory-check`, `astrolabe.decision-review`, `astrolabe.spec-publish`) are unchanged. The anima-session stages are the ones that change shape.

File organization: each template lives in its own file, `src/two-phase-planning.ts` and `src/three-phase-planning.ts`, exporting `twoPhasePlanningTemplate` and `threePhasePlanningTemplate` respectively. The existing `planning-mra.ts` and its test file (`planning-mra.test.ts`) should be deleted — their roles are taken by the new files. The existing inline `planningTemplate` in `astrolabe.ts` should be moved out into `three-phase-planning.ts` as part of this change.

### 2. Split the sage role into four job-specific roles

Replace the single `astrolabe.sage` role with four roles, each with its own instructions file. All four roles get the same permissions (`astrolabe:read`, `astrolabe:write`, `clerk:read`) and `strict: true`, same as today's `sage`.

- **`astrolabe.sage-reader`** → `sage-reader.md` — instructions for the READER job only.
- **`astrolabe.sage-analyst`** → `sage-analyst.md` — instructions for the ANALYST job only.
- **`astrolabe.sage-writer`** → `sage-writer.md` — instructions for the WRITER job only.
- **`astrolabe.sage-reading-analyst`** → `sage-reading-analyst.md` — instructions for the merged READER+ANALYST job used by `two-phase-planning`'s single `reader-analyst` stage.

Each role file is a **standalone set of instructions** — no mode-dispatch preamble, no "follow only the instructions for your current mode" contract, no references to other modes. The agent loading a role file sees exactly what its job is and nothing else.

The existing `astrolabe.sage` role registration and the `sage.md` file are removed. This is a pre-1.0 breaking change and is acceptable; no other plugin or user of this framework currently references `astrolabe.sage`.

**Sourcing role file content.** The existing `sage.md` contains three sections (`## Mode: READER`, `## Mode: ANALYST`, `## Mode: WRITER`) plus a shared preamble (`# Astrolabe Sage — Planning Agent Instructions`, the Tools section, the opening "you do not implement" boundary, and the `# Finishing Your Work` footer). Build the three job-specific files by combining:

- The shared preamble framing (minus the mode-dispatch sentence), plus
- The corresponding `## Mode: X` section content, plus
- The relevant Boundaries subsection and the `# Finishing Your Work` footer.

Strip the `## Mode: X` heading from each file — each file is single-purpose and the heading is now redundant. Adjust the opening line in each file accordingly (e.g. `sage-reader.md` starts with "You are a codebase inventory agent" rather than "You are a planning agent that operates in one of three modes").

**Drafting `sage-reading-analyst.md`.** This role has no existing section to copy — it's the merged READER+ANALYST job performed by `two-phase-planning`'s `reader-analyst` stage. Draft it by:

1. Starting from the same shared preamble framing.
2. Explaining the merged job shape — one session does both inventory and analysis, interleaving reading and writing as understanding grows.
3. Incorporating the full content of the READER process section (codebase inventory requirements, what to read, how exhaustive to be) and the ANALYST process section (scope decomposition, decision analysis with classification metadata, observations).
4. Explicitly allowing interleaved reading and writing — the current MRA inline prompt in `planning-mra.ts` has useful language on this point: *"You may interleave reading and writing — for example, write partial inventory as you go and refine it, or write scope items as they become clear and adjust later. The key constraint is that when you finish, all four artifacts (inventory, scope, decisions, observations) must be complete and written to the plan via the write tools."* Port that language verbatim or with minor polish.
5. Ending with a combined Boundaries section (no implementation, no spec writing — those belong to the writer) and the `# Finishing Your Work` footer.

The goal is that `sage-reading-analyst.md` reads as a single coherent job description, not a bolt-together of two role files. The implementer should use editorial judgment to unify voice and remove redundancy where the READER and ANALYST sections overlap (e.g. the "call plan-show first" instruction only needs to appear once).

### 3. Simplify engine prompts

With role-per-job, each anima-session engine's inline `prompt` given no longer needs a `MODE: X` header or a re-statement of what the role does. The prompt becomes a thin shim that provides stage-specific runtime context — the plan ID, cwd, and any handoff material from upstream engines.

For the `two-phase-planning` template:

- **`reader-analyst` stage** — `role: 'astrolabe.sage-reading-analyst'`, prompt: `'Plan ID: ${yields.plan-init.planId}'`. No mode header. No re-description of the job.
- **`spec-writer` stage** — `role: 'astrolabe.sage-writer'`, prompt: `'Plan ID: ${yields.plan-init.planId}\n\nDecision summary:\n${yields.decision-review.decisionSummary}'`. Decision summary preserved — this is stage-specific runtime context the role file can't provide.

For the `three-phase-planning` template:

- **`reader` stage** — `role: 'astrolabe.sage-reader'`, prompt: `'Plan ID: ${yields.plan-init.planId}'`.
- **`analyst` stage** — `role: 'astrolabe.sage-analyst'`, prompt: `'Plan ID: ${yields.plan-init.planId}'`. No `conversationId` given (see deliverable 5).
- **`spec-writer` stage** — `role: 'astrolabe.sage-writer'`, prompt: `'Plan ID: ${yields.plan-init.planId}\n\nDecision summary:\n${yields.decision-review.decisionSummary}'`. No `conversationId` given.

Keep the existing `metadata.engineId` on each stage unchanged (`reader`, `analyst`, `spec-writer`, `reader-analyst`) so that Laboratory session records and downstream profiling stay aligned across the rename.

### 4. Writ type and mapping changes

- **Keep `brief`** as the only first-class astrolabe writ type contributed to Clerk.
- **Remove `brief-mra`** from the `writTypes` list — the merged pipeline is now the default, so the distinguishing writ type is unnecessary.
- **Map `brief` → `astrolabe.two-phase-planning`** in `rigTemplateMappings`. This is the only mapping Astrolabe contributes by default.
- **`three-phase-planning` has no default mapping.** It's registered in `rigTemplates` so it exists and can be referenced, but guild operators who want to use it must add their own mapping in `guild.json` (e.g. `"spider": { "rigTemplateMappings": { "brief": "astrolabe.three-phase-planning" } }` to override the default, or map it to a custom writ type).

### 5. End cross-session conversation reuse

Remove the `conversationId` given from the `analyst` and `spec-writer` stages of `three-phase-planning`. Each anima-session starts fresh. The `two-phase-planning` template already has no `conversationId` reuse (the merged `reader-analyst` stage doesn't need to share state with anything), so no change needed there.

Rationale: the 2026-04-10 profile and the 2026-04-15 A/B cache analysis together showed that cross-session cache inheritance via `conversationId` delivers only ~27% analyst savings — real but modest, and substantially less than the ~42% benefit MRA gets from within-session file reuse. Removing the reuse simplifies the template, removes a latent ordering dependency (analyst must run after reader in the same conversation context), and makes the two templates structurally symmetric: both are fresh-session pipelines, differing only in whether reader and analyst are merged.

### 6. README updates

Update `packages/plugins/astrolabe/README.md` to describe the new shape:

- Writ Types table: single entry `brief`.
- Rig Templates table: two entries (`astrolabe.two-phase-planning` default, `astrolabe.three-phase-planning` non-default). Explain the engine sequence for each.
- New "Rig Template Selection" section: briefly explains that `two-phase-planning` is the default (it wins on cost, wall-clock, and quality per the A/B experiment), and that `three-phase-planning` is preserved as a fallback and as a reference for future A/B experiments. Show the guild.json snippet a guild operator would add to route `brief` writs through the three-phase template instead of the default.
- Roles table: four entries (`sage-reader`, `sage-analyst`, `sage-writer`, `sage-reading-analyst`), each annotated with which template stage uses it.
- Remove all references to `brief-mra`, `planning-mra`, `planning` (the old name), the `sage` role, and the "three modes" language.

## Out of scope

- Quality scoring or further A/B work. This is a structural refactor; the A/B verdict stands.
- Changes to the `plan-init`, `inventory-check`, `decision-review`, or `spec-publish` engines. Their behavior is unchanged.
- Changes to the plan schema or the Astrolabe tools (`plan-show`, `inventory-write`, etc.).
- Migrations for existing plans or in-flight rigs. There are no production users of astrolabe outside the experimental guild; any open rigs can be cancelled manually.
- Adding new tests beyond what's needed to cover the renamed/new code surface. Port existing tests from `planning-mra.test.ts` into `two-phase-planning.test.ts` and port/retain equivalent tests for `three-phase-planning.test.ts`. Update `supportkit.test.ts` to assert the new four-role registration and the new default mapping.

## Acceptance

- `packages/plugins/astrolabe/src/` contains `two-phase-planning.ts` and `three-phase-planning.ts`, each exporting a `RigTemplate`. `planning-mra.ts` and `planning-mra.test.ts` are gone.
- `packages/plugins/astrolabe/` contains `sage-reader.md`, `sage-analyst.md`, `sage-writer.md`, and `sage-reading-analyst.md`. `sage.md` is gone.
- `astrolabe.ts` registers all four roles in `supportKit.roles`, registers both templates in `rigTemplates`, maps only `brief → astrolabe.two-phase-planning` in `rigTemplateMappings`, and declares only `brief` in `writTypes`.
- Each anima-session stage in both templates uses the stage-appropriate role and a minimal prompt (plan ID + any stage-specific runtime context only).
- No `conversationId` given appears in either template's engine list.
- Plugin test suite (`pnpm test` in `packages/plugins/astrolabe/`) passes. Tests cover: both templates register correctly, both templates' engine sequences match the declared shape, the four roles register with correct permissions, the default mapping is `brief → astrolabe.two-phase-planning`, and `brief-mra` / `sage` / `planning-mra` / `astrolabe.sage` identifiers do not appear anywhere.
- README reflects the new shape per deliverable 6.

## Notes

- The rationale for all five deliverables lives in quest `w-mnt3t5h8-943e2a2ef85f` (Astrolabe efficiency) and its linked analysis file `experiments/data/2026-04-15-astrolabe-cache-reuse-analysis.md`. Read both before making any scope-widening or scope-narrowing judgment calls during implementation.
- The `sage-reading-analyst.md` drafting task is the only place real editorial judgment is required. Everything else is mechanical: rename files, split the role file, strip mode headers from prompts, remove `conversationId` givens, update the mappings table, update the README.
- Keep commits atomic and sequenced: (1) split the role file, (2) rename and reshape templates, (3) update registrations and mappings, (4) update README, (5) update tests. This makes review and any bisecting easier if something regresses.
