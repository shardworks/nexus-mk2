# Section B — Position Effects in Long Context: Empirical Findings

Data backing for the Position Effects section of `prompt-engineering-landscape.md`.
Same measurement template as Sections A and L. Made possible by the recent
`SessionDoc.prompt` / `systemPrompt` reconstruction backfill.

> **Revision note (May 12 2026, evening).** An earlier version of this
> appendix claimed the lost-in-the-middle zone of a ~75-100K assembled
> context is "entirely Claude Code's built-in tool definitions and
> accreted tool results, not our content." That was wrong. The 75-100K
> number was lifted from Section A's `cache_read_input_tokens` average,
> which a controlled `claude --print` measurement
> (`prompt-debug-experiment.md`) showed is inflated — likely an
> accumulation across internal API iterations per logical turn.
>
> The clean measurement: Claude-Code-baseline overhead is ~12K tokens
> (22 built-in tools + 10 skills + agent wrapper); our 15 MCP tool
> schemas add ~10K; total fixed Claude-Code-plus-MCP overhead is
> **~22K tokens** per session. The rest of the assembled context is
> dominated by **our user prompt** (brief + inlined inventory + plan
> content), which ranges 5K-100K tokens depending on commission size.
>
> The lost-in-the-middle zone for a typical implement session is
> therefore **mostly our brief content** at positions ~22K and beyond,
> not Claude Code's content. This is a different action surface than
> the earlier writeup suggested — see updated per-item statuses below.

## Coverage

The reconstruction populated `prompt` and `systemPrompt` for 502 of 810
completed sessions since Apr 25 2026 (~62% coverage). Coverage by engine:

| Engine | Sessions | With prompt data |
|---|---:|---:|
| implement | 155 | 125 |
| patron-anima | 126 | 126 |
| spec-writer | 126 | 126 |
| reader-analyst | 125 | 125 |
| review | 127 | 0 |
| revise | 111 | 0 |
| seal-manual-merge | 20 | 0 |

review / revise / seal-manual-merge have **zero** prompt data — the
backfill doesn't yet cover whatever launch path those engines use. The
four engines we *do* have are 65% of total sessions and 92% of total spend
($2.4K of $2.6K), so the sample is more than enough for a structural read.

## Headline (revised)

For a typical implement session, the assembled context layered roughly as:

| Layer | Tokens | Position |
|---|---:|---|
| Our systemPrompt (rendered MCP tool docs + role + standing rules) | ~1,400 | 0 – 1.4K |
| Claude Code built-in tools + skills (via API `tools` field and attachments) | ~12,000 | 1.4K – 13K |
| Our MCP tool schemas (via API `tools` field) | ~10,000 | 13K – 23K |
| Our user prompt (working-dir directive → brief → task manifest → execution rules) | 5K – 100K | 23K – end |

So our content occupies both ends: systemPrompt at the front (strong
primacy), user-prompt directives at the back (strong recency). The
Claude-Code-plus-MCP zone in between is **~22K tokens** of overhead — not
the ~72K I previously claimed.

The literature's "20-80% depth" lost-in-the-middle zone for a 50K-token
implement session maps to positions 10K-40K. That zone is:
- positions 10K-23K: Claude Code overhead + our MCP tool schemas
- positions 23K-40K: the first half of our user prompt (brief intent /
  rationale / scope sections)

The mid-context zone is therefore **half-Claude-Code-half-ours** for
medium-sized commissions, and **mostly ours** for big commissions with
rich briefs and inventories.

There is one real, available lever for position effects on **our** content:

- **B4-aligned: framework systemPrompt assembly order.** The loom plugin
  composes systemPrompt as `charter → tool instructions → role`
  (`/workspace/nexus/packages/plugins/loom/src/loom.ts:360-378`). This
  places our MCP tool docs in the primacy zone of the systemPrompt and
  role content at the back. Switching the order to `charter → role →
  tool instructions` would put role-content directives in the primacy
  zone of the systemPrompt. Small lever (the systemPrompt is itself in
  the primacy zone of the full context anyway), but untested and easily
  flippable.

The other items (B2 repeat-at-end, B3 XML tags, B5 length budget) are
non-actionable or misframed in our setup.

## What we measured

### Each engine's systemPrompt is constant

For the four engines with data, `length(systemPrompt)` is identical across
every session in the window. SystemPrompts don't vary per-session — they
are pure cache prefix.

| Engine | systemPrompt size | Tokens (~4 bytes/token) | Tools rendered | Role/Process section |
|---|---:|---:|---:|---|
| implement | 5,542 bytes | ~1,400 | 8 | `## Role` at 49% depth |
| spec-writer | 24,649 bytes | ~6,200 | 17 | `## Tools` at 26% depth |
| reader-analyst | 29,231 bytes | ~7,300 | 17 | `## Tools` at 22% depth |
| patron-anima | 23,137 bytes | ~5,800 | 2 | `## Sean's principles` at 5% depth |

### SystemPrompt internal layout

All four engines begin with `## Tool: <name>` blocks rendered from MCP tool
`instructions` fields. The role / process / principles content always
follows. End-of-systemPrompt content is a "Finishing Your Work" instruction
section.

**Section ordering across all four engines:**

```
[charter — empty in all observed sessions]
[## Tool: X ...]
[## Tool: Y ...]
... (one block per MCP tool with instructions)
[role/process content]
[Finishing Your Work / Boundaries]
```

This ordering comes from `loom.ts`:

```typescript
// Compose system prompt from available layers: charter → tool instructions → role instructions.
const layers: string[] = [];
if (charterContent) layers.push(charterContent);
if (weave.tools && weave.tools.length > 0) {
  for (const resolvedTool of weave.tools) {
    const instructions = resolvedTool.definition.instructions;
    if (instructions) layers.push(`## Tool: ${resolvedTool.definition.name}\n\n${instructions}`);
  }
}
if (request.role && roleInstructions.has(request.role)) {
  layers.push(roleInstructions.get(request.role)!);
}
```

### Within the assembled context, our content is at the primacy *and* recency edges

Direct measurement on the dep-update implement session's first turn
(`ses-mp29lbx5`, May 12), plus a controlled `claude --print` run with our
implement systemPrompt + minimal user prompt + no MCP
(`prompt-debug-experiment.md`):

| Layer | Tokens | Position |
|---|---:|---|
| Our systemPrompt | ~1,400 | 0 – 1.4K |
| Claude Code baseline (22 built-in tools, 10 skills, agent wrapper) | ~12,000 | 1.4K – 13K |
| Our 15 MCP tool schemas | ~10,000 | 13K – 23K |
| Our user prompt | varies (5K-100K) | 23K – end |

**Mapping the literature's "20-80% depth" lost-in-the-middle zone:**
- For a 50K-token session (typical-ish implement): positions 10K-40K.
  Roughly half Claude-Code-overhead, half our brief content.
- For a 100K-token session (long brief with full inventory): positions
  20K-80K. **Mostly our brief and inventory content.**

The "directives buried in the middle" concern therefore points at *our*
brief content for most implement sessions — specifically the middle
sections of long briefs (rationale, scope, decisions). Not at Claude
Code's content as I previously claimed.

### User prompt structure (implement example)

A representative implement user prompt (38,904 bytes / ~9.7K tokens):

1. **Front (~250 bytes):** "Your working directory is..." — sandbox confinement directive
2. **Middle (~30K bytes):** Implementation brief (intent, rationale, scope & blast radius, decisions, acceptance signal, what NOT to do)
3. **Late-middle (~8K bytes):** Task manifest (XML-tagged `<task-manifest>` / `<task>` template OUTPUT, not prompt structure)
4. **End (~600 bytes):** "If the specification above contains a `<task-manifest>`, follow these execution rules: 1. Work through tasks in order. 2. After each task run its verify command..."

The end-of-user-prompt execution rules are in the recency zone of the
assembled context.

### XML structural tags: not used

Across all four engines' systemPrompts, zero use of `<role>`, `<task>`,
`<context>`, `<example>`, `<instruction>`, `<thinking>`, `<brief>` as
structural delimiters. spec-writer uses `<task-manifest>` / `<task>` but
only as the *output template* (telling the model what shape to produce),
not as a structural prompt boundary.

The recommended Anthropic pattern of `<role>...</role><task>...</task>`
section delimiters is **not in use**.

### Imperative directive density (rough count)

Lines matching `^Do |^Don't |^Never |^Always |^MUST |^Important`:

| Engine | Count |
|---|---:|
| spec-writer | 12 |
| implement | 3 |
| reader-analyst | 2 |
| patron-anima | 0 |

Notable: patron-anima has zero imperative-form directives. It's framed
descriptively ("Sean's principles", "Anti-patterns to name out loud") — a
distinct register. This is consistent with the patron-anima role's framing
as standin-for-Sean rather than executor-of-tasks.

## Per-item status (revised)

| # | Idea | Empirical reality | Status |
|---:|---|---|---|
| B1 | **Position-audit the artificer role file** | Done (this section). Role directives sit at positions 0.7-1.4K of the assembled context — strong primacy zone. The literature's 20-80% depth zone of a 50K-100K-token implement session is half-Claude-Code half-our-brief; for long-brief sessions it is mostly our brief content. Within the systemPrompt itself, role content is in the recency zone (after MCP tool docs). | **measured** |
| B2 | **Repeat critical directives at the end** | Not done. Each systemPrompt has a "Finishing Your Work" section at the end, but it contains *new* operational rules rather than *repetition* of front-of-prompt directives. The literature claim (~5-10% adherence improvement) is small; our X022/X024 behavioral-nudge experiments came in at -3.5% to -13% (wrong direction). Risky lever for the expected gain. | **untested, but priors against** |
| B3 | **XML-tag section delimiters** | Not in use. All engines use Markdown headers. spec-writer uses XML tags as output template, not structural delimiters. Genuine untested lever. | **untested** |
| B4 | **Front-load with goal, not background** | Violated by all four engines. Tool descriptions (~22-49% of systemPrompt) precede role/goal content. Lever exists at the framework level: switch `loom.ts:360-378` assembly order from `charter → tools → role` to `charter → role → tools`. | **untested — concrete framework lever available** |
| B5 | **Length-budget the role file** (~4K-token soft ceiling) | Partially relevant. Implement systemPrompt is ~1,400 tokens (under). Other three engines are 5.8K-7.3K tokens (over). But the 4K-token attention threshold applies to total assembled context, not role file in isolation. Assembled context is 25K-100K+ regardless of role-file size. | **misframed in current setup** |

**Newly visible lever from the revised picture (not in original catalog):**
- **Trim our user-prompt brief content for sessions whose mid-context falls
  in the lost-in-the-middle zone.** For commissions producing 50K+ user
  prompts, the brief's "Decisions" or "Scope" sections sit at 30-60K depth.
  This is already the X021/X022 target — the position-effects framing
  reinforces what we already knew about prefix-size pressure. Not a new
  experiment, just additional motivation for the in-flight inventory-trim
  work.

## What the data points to

The single concrete, available lever is **B4 (assembly order in loom.ts)**.
Three things to keep in mind before pursuing it:

1. **The systemPrompt is itself in the primacy zone of the assembled
   context.** Moving role to the front of the systemPrompt is rearranging
   within the strong primacy zone, not moving content out of a weak zone.
   The expected effect is therefore smaller than the literature's
   primacy-zone claims.
2. **Recency effect competes.** Putting role at the *back* of the
   systemPrompt (current behavior) gives role-content the recency benefit
   relative to subsequent tool descriptions. Moving role to the front
   trades recency-of-role for primacy-of-role and recency-of-tools.
3. **Our behavioral-nudge experiments (X022, X024) found marginal-to-
   negative effects from prompt structure changes.** Adherence-side
   experiments here have a track record of underperforming literature
   claims.

A conservative trial: test the assembly-order flip on the implement engine
only (the largest cost slice). Expected cost effect: small. Expected
quality effect: unclear-but-tracked-via-existing-review-pipeline. Cheap
(one-line code change, fully reversible) — could be a lab trial under the
existing infrastructure.

## Side discovery — Claude Code's built-in tool burden (revised)

The captured systemPrompt for implement is 5.5K bytes (8 MCP tool blocks
rendered as Markdown plus ~2.8K bytes of role/process content). Section A's
earlier framing implied a much larger Claude Code injection (~70K tokens)
based on production `cache_read_input_tokens` averages, but a controlled
`claude --print` run with no MCP and our implement systemPrompt showed
total prefix of only ~13K tokens. Claude Code's baseline overhead is
therefore ~12K (22 built-in tools + 10 skills + agent wrapper), and our
15 MCP tool schemas add another ~10K, for ~22K total fixed overhead.

The lost-in-the-middle zone of a 50-100K-token implement session is
therefore part Claude-Code-overhead, part our brief — not "entirely Claude
Code" as I previously claimed. See `prompt-debug-experiment.md` for the
controlled measurement details.

We can't directly reduce or reorder Claude Code's content — it's injected
by Claude Code. But we *could* configure the available toolset:

- `--allowedTools` / `--disallowedTools` Claude Code flags exist; we don't
  currently pass either.
- Filtering down to the tools actually used in each engine would shrink the
  ~12K-token built-in-tool zone (not the ~50K I previously claimed) and
  tighten the assembled prompt.

This is a Section A-adjacent / Section E-adjacent lever rather than a
Section B intervention. Already filed as click `c-mp28jnjk`. The lever is
real but **smaller than originally pitched** — caps at ~12K tokens of
Claude-Code-baseline-tools rather than the 50K I earlier implied.

## Data sources

- Database: `/workspace/vibers/.nexus/nexus.db`
- Tables: `books_animator_sessions` (now carrying `prompt`, `systemPrompt`, `promptReconstructed`, `frameworkSha`)
- Sample window: 2026-04-25 → 2026-05-12 (17 days, 502 sessions with prompt data)
- Framework assembly source: `/workspace/nexus/packages/plugins/loom/src/loom.ts:360-378`
- Captured systemPrompts: `/tmp/sys_{implement,specwriter,reader,patron}.txt`
- Captured user prompt example: `/tmp/user_implement.txt`
