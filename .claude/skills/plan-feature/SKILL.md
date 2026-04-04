---
description: Run the full spec pipeline for a feature — reader → analyst → patron checkpoint → writer. Produces a commissioning-ready spec.
---

# Plan Feature: Brief → Spec Pipeline

## When to use

When Sean says something like "plan a feature to..." or "plan a feature for that." The input might be a thin one-liner or a richer description after a longer discussion — the pipeline handles both. This skill orchestrates three agents with a patron checkpoint in the middle.

## Pipeline overview

```
plan-reader (reads codebase, writes inventory)
  ├─ fork → plan-analyst (scope + decisions)
  │            ↓
  │      Patron checkpoint (Coco-mediated)
  │            ↓
  └─ fork → plan-writer (reads locked scope/decisions, writes spec)
```

Both the analyst and writer fork from the **reader** session — the writer never inherits the analyst's conversation context, only its disk artifacts.

## Step 1: Formulate the brief

Turn Sean's request into a brief for the pipeline. The brief can range from a single sentence to a detailed description — the reader and analyst do the exploration work, so the brief doesn't need to be exhaustive.

**Always include:**
- **What to build** — the feature or change, in whatever level of detail Sean provided

**Include when available** (from prior conversation or Sean's request):
- **Scope boundaries** — what is explicitly OUT of scope
- **Design constraints** — any decisions already made (e.g., "use convention-based file paths, not guild.json config fields")
- **Target files/apparatus** — where in the codebase the change lives

If Sean's request is thin (e.g., "plan a feature to add charter composition to the loom"), that's fine — pass it through as-is. Don't interrogate for details the pipeline will discover on its own.

Pick a slug (kebab-case, e.g., `loom-charter-composition`). Create the spec directory and dispatch immediately:

```bash
mkdir -p specs/{slug}
```

## Step 2: Dispatch the reader

Pre-create a session ID for the reader — the analyst and writer will fork from it:

```bash
READER_SESSION=$(python3 -c "import uuid; print(uuid.uuid4())")
```

```bash
claude --agent plan-reader --print --dangerously-skip-permissions --max-budget-usd 3 \
  --session-id $READER_SESSION \
  "Brief: {the brief}

Slug: {slug}"
```

Use `run_in_background: true`. The reader writes `specs/{slug}/inventory.md` and — critically — builds conversation context that downstream agents will inherit.

## Step 3: Dispatch the analyst (forked from reader)

```bash
claude --agent plan-analyst --print --dangerously-skip-permissions --max-budget-usd 3 \
  --resume $READER_SESSION --fork-session \
  "Brief: {the brief}

Slug: {slug}

The inventory has been written to specs/{slug}/inventory.md. Produce scope and decisions."
```

Use `run_in_background: true`. The analyst writes `specs/{slug}/scope.yaml`, `specs/{slug}/decisions.yaml`, and `specs/{slug}/observations.md`.

## Step 4: Patron checkpoint

When the analyst finishes, tell Sean to run the review TUI:

```bash
npx tsx bin/plan-review.ts specs/{slug}
```

The TUI lets Sean:
1. Toggle category filters (product/api/implementation)
2. Review and toggle scope items (include/exclude)
3. Review decisions, select options, or enter freeform overrides
4. Save changes back to scope.yaml and decisions.yaml

When Sean confirms the TUI is done (or you detect the files have been modified), proceed to Step 5.

If the TUI isn't available (e.g., remote session), fall back to chat-based review:
- Present scope items with letter prefixes, Sean types letters to exclude
- Present observable decisions filtered by category, Sean types overrides or "accept all"
- For freeform overrides: set `selected: custom` and add `patron_override` to the decision in decisions.yaml
- Do NOT modify `analysis.recommendation`, `analysis.confidence`, or `analysis.rationale` — those are frozen

## Step 5: Dispatch the writer (forked from reader)

```bash
claude --agent plan-writer --print --dangerously-skip-permissions --max-budget-usd 5 \
  --resume $READER_SESSION --fork-session \
  "Brief: {the brief}

Slug: {slug}

The analyst has written scope.yaml and decisions.yaml in specs/{slug}/, and the patron has reviewed and locked them. Read those files plus inventory.md, then produce the spec."
```

Use `run_in_background: true`. The writer produces `specs/{slug}/spec.md`.

**Important:** Fork from the **reader** session, not the analyst session. The writer gets clean codebase context without the analyst's reasoning.

## Step 6: Review the output

When the writer finishes, check for:

1. **`gaps.yaml`** — if this file exists, the writer found decisions the analyst missed. Present the gaps to Sean, resolve them, and re-run the writer.

2. **Spec quality** (read `spec.md`):
   - Did it stay within the included scope?
   - Are type signatures complete and copy-pasteable?
   - Are the R↔V mappings specific?
   - Would an implementing agent need to ask any questions?

3. **Observations** — skim for anything worth adding to the backlog.

Present a summary to Sean: what looks good, what needs revision, and whether the spec is ready to commission.

## Notes

- The reader typically takes 2-5 minutes; the analyst 2-4 minutes; the writer 3-6 minutes
- Total wall-clock for the autonomous portions: ~10-15 minutes
- The patron checkpoint is the only synchronous step — target 30-60 seconds
- If the analyst produces a `clarification.md` instead of scope/decisions, the brief was too ambiguous — reformulate and re-run
- All artifacts live in `specs/{slug}/` and are committed for provenance
