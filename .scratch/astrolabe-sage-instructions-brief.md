# Brief: Astrolabe Sage Instructions

## Context

The Astrolabe planning pipeline runs three `anima-session` engine stages (reader → analyst → spec-writer) that all share a single role: `astrolabe.sage`. The conversation chains across stages — the analyst resumes the reader's conversation, the spec-writer resumes the analyst's.

Today, the sage role instructions (`sage.md` in the astrolabe package) are a 12-line placeholder:

```
You are the Astrolabe sage — a planning anima that refines patron briefs into structured specifications.
...
```

The *real* planning instructions — battle-tested across ~50 commissions in the plan workshop — live in `bin/plan-prompts/`. These need to be migrated into the Astrolabe's tool-based world.

## Inventory: Current Instruction Sources

### 1. System prompt (role-level): `bin/plan-prompts/planner.md`
- **What it is:** A unified system prompt covering all four modes (READER, ANALYST, ANALYST-REVISE, WRITER) in one document.
- **How it's used:** Passed as `--system-prompt-file` to every `claude` CLI invocation. The mode is selected by the user prompt.
- **Destination:** Should become the content of `sage.md` (the `instructionsFile` on the sage role definition). This file lives at the package root and gets resolved by the Loom at startup via the `instructionsFile` mechanism.

### 2. Per-step standalone prompts: `bin/plan-prompts/{reader,analyst,analyst-revise,writer}.md`
- **What they are:** Standalone per-mode documents. Each duplicates its section from `planner.md` with minor wording tweaks.
- **How they're used:** They're NOT referenced by `plan-review.ts` — it uses `planner.md` exclusively. These appear to be earlier standalone versions kept around for reference.
- **Destination:** Not needed. The unified `planner.md` approach is the right model for the Astrolabe too, since the conversation chains across stages and the system prompt stays constant.

### 3. Per-engine work prompts (inline in `astrolabe.ts`)
- **What they are:** The `prompt` givens in the rig template — short, engine-specific task instructions.
- **Current content:**
  - **Reader:** `'MODE: READER\n\nPlan ID: ${yields.plan-init.planId}\n\nYou are beginning a new planning session. Use plan-show to read the plan, then inventory the codebase and write the inventory using inventory-write.'`
  - **Analyst:** `'MODE: ANALYST\n\nPlan ID: ${yields.plan-init.planId}\n\nYou are continuing the reader conversation. Use plan-show to read the current plan state, then produce scope, decisions, and observations using the write tools.'`
  - **Spec-writer:** `'MODE: WRITER\n\nPlan ID: ${yields.plan-init.planId}\n\nYou are continuing the analyst conversation. Use plan-show to read the full plan including patron-reviewed decisions, then write the specification using spec-write.\n\nDecision summary:\n${yields.decision-review.decisionSummary}'`
- **Assessment:** These are adequate as engine prompts — they select the mode and provide the context. They match how `plan-review.ts` works: the system prompt contains the mode definitions, and the user prompt selects the mode + provides runtime context (plan ID, paths, etc.).

### 4. `sage.md` placeholder (current)
- **Where:** `/workspace/nexus/packages/plugins/astrolabe/sage.md` (also in `package.json` files array)
- **Content:** 12-line stub — name, three bullet points, one instruction.
- **Mechanism:** Referenced via `instructionsFile: 'sage.md'` in the supportKit role definition. The Loom resolves this at startup: reads the file from `{guildRoot}/node_modules/{package}/sage.md` and injects it as the system prompt for any session in the `astrolabe.sage` role.

## What Needs to Happen

### A. Replace `sage.md` with real instructions (primary deliverable)

Adapt `planner.md` into `sage.md` with these changes:

1. **Remove filesystem references.** The plan-workshop version tells the agent to use the Write tool to write files to disk paths. The Astrolabe version must use Astrolabe tools instead:
   - Inventory → `inventory-write` tool (not Write to a file path)
   - Scope → `scope-write` tool
   - Decisions → `decisions-write` tool
   - Observations → `observations-write` tool
   - Spec → `spec-write` tool
   - Read current plan state → `plan-show` tool

2. **Remove YAML format specs.** The plan-workshop version prescribes exact YAML schemas for `scope.yaml`, `decisions.yaml`, etc. because agents write raw files. In the Astrolabe, the tools have typed parameters (Zod schemas) — the agent calls `scope-write` with a `scope` array, not writes a YAML file. The instructions should describe *what* to produce (semantics, quality criteria) without prescribing file formats.

3. **Simplify output instructions.** Replace "Use the Write tool to write to the output path specified in the user prompt" with "Use the appropriate Astrolabe tool" — the planId comes from the engine prompt, not a file path.

4. **Remove ANALYST-REVISE mode.** The Astrolabe's decision-review engine handles patron input via the `InputRequestDoc` / `patron-input` block mechanism. There's no analyst-revise stage in the planning rig. If revision is needed in the future, it'll be a rig-level retry, not a mode in the system prompt.

5. **Adapt the decisions schema.** The plan-workshop decisions have fields like `audience`, `stakes`, `confidence`, `observable`, `category`. The Astrolabe's `Decision` type (from `types.ts`) has: `id`, `scope`, `question`, `context`, `options`, `recommendation`, `rationale`, `selected`, `patronOverride`. The sage instructions should align with the actual `Decision` type — the classification metadata from the workshop (`audience`, `stakes`, `confidence`, `observable`, etc.) can be folded into the `context` or `rationale` fields as prose rather than structured fields.

6. **Adapt the writer mode.** The plan-workshop writer reads `decisions-digest.yaml` (a pre-processed file). The Astrolabe writer gets `decisionSummary` (a string) via the engine prompt's `${yields.decision-review.decisionSummary}` interpolation, plus can call `plan-show` for the full plan. The instructions should reference `plan-show` + the decision summary in the prompt, not file paths.

7. **Keep the mode structure.** The `MODE: READER / ANALYST / WRITER` pattern works well with the engine prompts selecting the mode. The system prompt (sage.md) defines what each mode does; the engine prompt (rig template givens) selects the mode and provides runtime context.

8. **Preserve the quality of the writer instructions.** The writer mode in `planner.md` has excellent, hard-won instructions about: not making decisions, gap checking, decision compliance auditing, coverage verification, spec format, and spec style rules. All of this should carry over — it's the most valuable part.

### B. Review engine prompt coherence (secondary)

Verify the per-engine prompts in `astrolabe.ts` are coherent with the new sage instructions. Specifically:
- Do the MODE labels in the engine prompts match the mode names in sage.md?
- Does the engine prompt provide all the runtime context the mode needs (planId, decision summary, etc.)?
- Are the tool names referenced in the engine prompts correct?

### C. No changes needed to guild config

The sage role is contributed via the Astrolabe's supportKit — it's not declared in `guild.json`. The guild can override it in `guild.json`'s `loom.roles` section if desired, but the default from the package should be self-sufficient.

## Scope of the Commission

- **In scope:** Rewrite `sage.md` to contain the full planning instructions adapted from `planner.md`. Verify engine prompt coherence.
- **Out of scope:** Changes to `astrolabe.ts` (engine prompts, rig template, tool definitions). Changes to the plan-workshop (`bin/plan-review.ts`, `bin/plan-prompts/`). The workshop continues to work independently.
- **Out of scope:** ANALYST-REVISE mode (no rig stage for it).

## Key Files

| File | Role |
|---|---|
| `/workspace/nexus/packages/plugins/astrolabe/sage.md` | TARGET — replace with real instructions |
| `/workspace/nexus-mk2/bin/plan-prompts/planner.md` | SOURCE — unified system prompt to adapt from |
| `/workspace/nexus/packages/plugins/astrolabe/src/astrolabe.ts` | REFERENCE — rig template with engine prompts (lines 41-132) |
| `/workspace/nexus/packages/plugins/astrolabe/src/types.ts` | REFERENCE — PlanDoc, Decision, ScopeItem types |
| `/workspace/nexus-mk2/bin/plan-prompts/{reader,analyst,writer}.md` | REFERENCE — standalone versions (for cross-checking, not as source) |
