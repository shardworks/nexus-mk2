# Section L — Prefill / Response Anchoring: Empirical Findings

Data backing for the Prefill section of `prompt-engineering-landscape.md`.
Same measurement template as Section A (`section-a-cache-data.md`), applied
to the prefill family.

## Headline

**Section L is upstream-locked.** The Anthropic Messages API supports response
prefill (assistant-turn prefix), but the `claude` CLI we run through doesn't
expose it. Our engine wrappers can configure system prompt, model, MCP tools,
and resumption — nothing about response shaping.

A narrower L1-adjacent lever exists (`--json-schema`) but doesn't apply to
our current engine designs because we route structured data through MCP tool
calls rather than response-text JSON.

The investigation also surfaced a separate Section-A-adjacent flag worth
filing: `--exclude-dynamic-system-prompt-sections` claims to improve
cross-user prompt-cache reuse, but applies only when using Claude Code's
default system prompt — not when passing `--system-prompt-file` as we do.
See "Section A follow-up" at the bottom.

## What we measured

### Are we using prefill or response-anchoring today?

Method: across 54 sampled completed sessions (Apr 25 – May 12 2026, all 7
production engines), inspect the first main-agent assistant message — first
content-block type, leading text, and any prefill markers.

**First content block of first main-agent turn, by engine (n=54):**

| Engine | n | first=thinking | first=text | first=tool_use | consistent prefix? |
|---|---:|---:|---:|---:|---|
| implement | 8 | 3 | 1 | 4 | no |
| patron-anima | 8 | 8 | 0 | 0 | thinking always, but content varies |
| reader-analyst | 8 | 0 | 0 | 8 | tool_use always, tool name varies (Bash/Read/plan-show/writ-show) |
| review | 8 | 3 | 0 | 5 | no |
| revise | 8 | 4 | 2 | 2 | no |
| seal-manual-merge | 6 | 3 | 0 | 3 | no |
| spec-writer | 8 | 6 | 0 | 2 | no |

**Stop_reason / stop_sequence across all 54 sessions:** only two distinct
pairs appear — `(null, null)` for intra-completion events, and
`("tool_use", null)` for completion-end-on-tool-use. **No custom
`stop_sequence` is set anywhere.** That rules out any "fake prefill"
implemented via stop-sequence-driven loops.

**Leading-text inspection** of `thinking` and `text` first blocks: openings
vary freely ("Now I have a thorough understanding...", "The review passed
with no required changes...", "Now update vision-keeper tests..."). No
constant prefix. Not prefilled.

### Can we use prefill, given the agent loop?

The animator spawns `claude` via the `nsg`/animator detached-session path
(`packages/plugins/claude-code/src/detached.ts`). Args passed:

```
--setting-sources user
--dangerously-skip-permissions
--model <model>
--system-prompt-file <path>     (when set)
--resume <conversationId>       (when continuing)
--mcp-config <path>
--strict-mcp-config
--print -
--output-format stream-json
--verbose
```

The `claude` CLI exposes no `--prefill` flag. The available response-shaping
flag is **`--json-schema <schema>`** — JSON Schema for structured output
validation. That's L1-adjacent (anchoring response shape to a JSON schema)
but does not provide arbitrary-text prefill.

There are also no `--tool-choice` or "force first tool" flags — L4
(prefill decision-tree branches) is not available.

### Provider distribution

Every session in the books uses provider `claude-code`. Historically only
5 sessions used `copilot` (provider). Effectively, our entire LLM surface
runs through Claude Code, so any prefill-equivalent must come through
Claude Code's CLI affordances.

## Per-item status

| # | Idea | Original framing | Empirical reality | Status |
|---:|---|---|---|---|
| L1 | Prefill JSON-prefix for scorer/instrument engines | "quality" | `--json-schema` is the closest equivalent and is not in use. But our scorers/instruments write structured data via MCP tool calls, not via response text — so this flag would target a surface we don't use for structured output. | **non-actionable in current architecture** |
| L2 | Prefill `<plan>` tag for implementer first response | "~3-5% (less exploratory tool use)" | Claude Code CLI doesn't expose response prefill. No knob to flip. | **upstream-locked** |
| L3 | Prefill "Step 1:" trajectory anchoring | "quality" | Same — no prefill exposure. | **upstream-locked** |
| L4 | Prefill decision-tree branches | "quality" | Same — no prefill exposure. The `--agents <json>` flag for custom subagent dispatch is L4-adjacent but solves a different problem (delegation, not first-token anchoring). | **upstream-locked** |

## What the data points to

L1–L4 cannot be tested without one of:
1. Anthropic / Claude Code exposing prefill via CLI flag or SDK config.
2. Bypassing Claude Code for specific engines (custom Anthropic-API
   integration). This is a substantial architectural detour — every
   engine that bypassed Claude Code would lose MCP tool routing, session
   recording, resumption, the babysitter lifecycle, the rate-limit-backoff
   machinery, and the animator's transcript export.

Realistic conclusion: the prefill family is parked until upstream changes.
The L1 sub-question (JSON-shape constraint for structured output) is real
but solved by our tool-call discipline, not by prompt-engineering.

## Section A follow-up — `--exclude-dynamic-system-prompt-sections`

While reviewing the `claude` CLI surface for prefill-equivalents, surfaced
a flag that explicitly targets the same goal Section A investigated:

> `--exclude-dynamic-system-prompt-sections` — Move per-machine sections
> (cwd, env info, memory paths, git status) from the system prompt into
> the first user message. Improves cross-user prompt-cache reuse. Only
> applies with the default system prompt (ignored with `--system-prompt`).

Two notes:
1. The flag is **off** in our current config — animator passes
   `--system-prompt-file`, which Claude Code treats as equivalent to
   `--system-prompt`, which makes the flag **ignored**.
2. The fact that this flag exists and explicitly targets cross-user
   prompt-cache reuse implies the default system prompt *contains*
   per-machine sections that would otherwise bust cache across machines
   (or potentially across sessions, if these sections shift).

This raises a follow-up worth filing:
- By using `--system-prompt-file` (entirely replacing the default system
  prompt) we may be either (a) bypassing useful default content, or (b)
  bypassing the cache-busting per-machine sections — depending on what
  the default prompt contains and whether our replacement is more or
  less cache-friendly.
- Alternative: use `--append-system-prompt` instead of `--system-prompt-file`,
  which would *retain* the default prompt and add our content. Combined
  with `--exclude-dynamic-system-prompt-sections`, this might improve
  cross-session/cross-host cache reuse. But it also enlarges the prompt
  (we'd carry the default content too).

Caveat: implement first-turn warm-cache is already at 97% median (Section A
data). The headroom to capture from this is small in absolute terms. Worth
filing as a click for future investigation rather than a near-term trial.

## Data sources

- Database: `/workspace/vibers/.nexus/nexus.db`
- Tables: `books_animator_sessions`, `books_animator_transcripts`
- Sample window: 2026-05-08 → 2026-05-12 (5 days, 54 sessions across 7 engines)
- Animator/claude-code source: `packages/plugins/claude-code/src/detached.ts`, `packages/plugins/claude-code/src/babysitter.ts`
- Aggregation scripts: `/tmp/first_assistant_shape.sh`, `/tmp/stop_reasons.sh`
- Aggregated JSONL: `/tmp/first_turn_shape.jsonl`, `/tmp/engine_first_turn.jsonl`, `/tmp/stop_reasons.jsonl`
