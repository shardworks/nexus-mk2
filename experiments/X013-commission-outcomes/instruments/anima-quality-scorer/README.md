# Anima Quality Scorer

**Status: draft — not yet commissioned or operational**

An autonomous code quality reviewer that examines commission output
against a published rubric and produces structured quality scores.
Designed as both a general-purpose acceptance review tool and an
experimental instrument for X013.

See [proposal.md](proposal.md) for full motivation and design rationale.

## Directory Structure

```
anima-quality-scorer/            # instrument definition (this directory)
├── README.md                    # this file
├── proposal.md                  # motivation, design rationale, decisions log
└── v1/                          # versioned instrument (prompt version 1)
    ├── system-prompt-blind.md   # system prompt for spec-blind mode
    ├── system-prompt-aware.md   # system prompt for spec-aware mode
    ├── user-template-blind.md   # user message template for spec-blind
    └── user-template-aware.md   # user message template for spec-aware

bin/quality-review.sh            # runner script (lives in bin/ with other ops scripts)
```

Each prompt file's entire contents are fed directly to the LLM. No
preamble, no metadata — the file is the prompt.

## Prompt Versioning

The prompt files are the instrument. Both the system prompt (rubric,
scoring guidance, output schema) and the user template (how code and
context are presented) affect scores. Changing either between reviews
introduces a confound.

**Protocol:**
- Each version is a directory: `v1/`, `v2/`, etc.
- A version contains the complete set of prompt files for both modes
- Any change — rubric, framing, output schema, template structure —
  requires a new version directory
- Each review artifact records which version produced it
- Analysis should control for prompt version — scores from different
  versions are not directly comparable without calibration
- Old versions are kept for reproducibility; do not edit in place

## Quick Reference

- **Dimensions:** test quality, code structure, error handling, codebase
  consistency (4 dimensions, 3-point scale)
- **Runs:** 3 by default; increase to 5 if inter-run composite SD > 0.5
- **Modes:** spec-blind (experimental instrument) and spec-aware
  (acceptance review)
- **Output:** per-run scores + aggregated composite in
  `X013/artifacts/reviews/quality/<commission-id>/quality-blind.yaml`
  and `quality-aware.yaml`
