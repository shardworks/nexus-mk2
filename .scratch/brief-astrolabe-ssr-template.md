# Astrolabe experimental rig template: single-shot reader

Add an experimental secondary rig template to the astrolabe plugin that replaces the existing multi-turn reader stage with a single-shot variant. The production `planning` template and its `brief` writ type mapping must remain **completely untouched** — this is an A/B experiment, not a migration. Commissions continue to route through the existing template unless explicitly posted under the new experimental writ type.

## Background

Profiling of 51 astrolabe sessions (2026-04-10) showed that the reader stage is 65% of astrolabe's total spend, and its cost is dominated by **turn count** rather than how much context it loads. Average reader session takes ~25 turns, each turn re-reading an accumulated ~107 k-token prompt cache. The agent already knows the deliverable shape — a structured markdown inventory with consistent sections — but spends 25 turns getting there via iterative filesystem exploration.

The hypothesis this commission tests: *if reader is prompted to produce the inventory in a single response (with at most 1–2 follow-up turns for targeted clarification), we can reduce reader cost by ~10–20× with acceptable quality.*

Full profile at `experiments/data/2026-04-10-astrolabe-profile.md` in the sanctum (`/workspace/nexus-mk2/`). You do not need to read it to implement this brief, but the "Intervention A" section describes the design intent.

## Deliverables

### 1. New rig template `planning-ssr`

Register a new rig template in `packages/plugins/astrolabe/src/` called `planning-ssr` (for "single-shot reader"). It must have the same stage pipeline as `planning` — `plan-init → draft → reader → inventory-check → analyst → decision-review → spec-writer → spec-publish → seal` — with **only the `reader` engine's prompt and stage configuration changed.**

The `reader` engine in `planning-ssr`:

- Uses `designId: 'anima-session'` and `role: 'astrolabe.sage'` exactly as the existing template does. Same tools available (`plan-show`, `inventory-write`, etc.).
- Uses a new prompt that instructs the agent to produce the inventory in its **first or second response**, with no more than one optional clarification turn in between. The prompt should make clear that:
  - The agent has access to the plan-show tool and the filesystem (via standard Read/Glob/Grep).
  - The agent should do any initial orientation via Glob/Read in a single batch of parallel tool calls, not iteratively turn-by-turn.
  - The expected output is the same structured markdown inventory that the current reader produces (file list, key findings, test files, adjacent patterns, doc/code discrepancies, etc.) — use the existing `sage.md` role instructions as the quality bar for what the inventory should contain.
  - After at most one orientation round, the agent must write the inventory via `inventory-write` and exit.

You have latitude on exact prompt wording. The constraint is the turn-count target: **mean 1–2 turns, max 3**. If the prompt alone can't hit that target reliably, you may add a pre-processing step to the rig template (e.g., a new non-anima engine that captures a file tree and/or selected file contents and passes them as a given to the reader engine). Document any such pre-processing in the commit message.

### 2. New writ type `brief-ssr` mapped to `planning-ssr`

Add `brief-ssr` to the astrolabe plugin's `writTypes` list and add a `rigTemplateMappings` entry routing `brief-ssr → astrolabe.planning-ssr`. The existing `brief → astrolabe.planning` mapping stays.

This gives commissioners a way to A/B test by posting a `brief-ssr` writ instead of a `brief` writ:

    nsg commission-post --type brief-ssr --title "..." --body "..."

### 3. Tests

Add unit tests that verify:

- `planning-ssr` is registered as a rig template on the astrolabe plugin.
- `brief-ssr` is registered as a writ type and maps to `astrolabe.planning-ssr`.
- The `planning-ssr` template's engine list is identical to `planning` except for the `reader` engine's `givens.prompt` (and any pre-processing stage you added).
- Posting a `brief-ssr` writ through a mock Spider dispatches to the `planning-ssr` template.

You do not need to run live end-to-end commissions through the new template — the patron will do that separately once this lands.

## Constraints

- **Do not modify** `planningTemplate`, the `brief` writ type, or the existing `brief → astrolabe.planning` mapping. Control must stay untouched so the comparison is valid.
- **Do not rename** or refactor any existing astrolabe engines.
- **Minimize diff to `astrolabe.ts`.** Prefer putting the new template and any new engine factories in their own file (e.g., `src/planning-ssr.ts`) and importing into `astrolabe.ts` only the pieces needed to register with the apparatus. Another commission is running concurrently against the same file — keep your edits to `astrolabe.ts` surgical to reduce conflict surface.
- The new template must pass all existing astrolabe tests without modification.
- The agent sessions spawned by the new reader engine must still emit `metadata.engineId = 'reader'` on their session records — same engine id, just a new prompt. This keeps profiling comparable between control and experiment.

## Success criteria

1. All existing astrolabe tests pass unchanged.
2. New unit tests for `planning-ssr` and `brief-ssr` registration pass.
3. Diff against `packages/plugins/astrolabe/src/astrolabe.ts` is small (ideally <30 lines added, zero lines removed).
4. Commit message documents the prompt design and any pre-processing added to the rig.
5. A `brief-ssr` commission can be posted via `nsg commission-post --type brief-ssr ...` and will be dispatched to the `planning-ssr` rig by Spider.

## Out of scope

- Profiling or measurement harness — profiling data will come from the session records naturally.
- Modifying production astrolabe prompts, engines, or templates.
- Running live briefs through the new template.
- Reader quality evaluation tooling — quality comparison happens manually after dispatch.

## Reference

- Profile findings: `/workspace/nexus-mk2/experiments/data/2026-04-10-astrolabe-profile.md` (sanctum).
- Parent quest: `w-mnt3t5h8-943e2a2ef85f` — astrolabe efficiency quest. This commission is the first of two experimental interventions dispatched against it.
- Sister commission: merged reader/analyst template (`brief-mra`) — running concurrently against the same plugin. Expect conflict on `astrolabe.ts` and structure your changes to minimize it.
