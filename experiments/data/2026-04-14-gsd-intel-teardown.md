# GSD Intel / Map-Codebase Teardown

**Date:** 2026-04-14
**Related quest:** `w-mnyx6ajh-ae9d4622cf36` — GSD-intel-style atlas for Astrolabe reader
**Parent quest:** `w-mnt3t5h8-943e2a2ef85f` — Astrolabe efficiency
**Source:** `https://github.com/gsd-build/get-shit-done` @ main (shallow clone 2026-04-14)

## Headline findings

1. **GSD actually has *two* separate codebase-intel systems living side by side**, not one. They solve overlapping problems in different ways and appear to have evolved at different times.

   - **`/gsd-map-codebase`** → writes **markdown** documents to `.planning/codebase/` via parallel LLM mapper agents. This is the *narrative* layer that plan-phase reads. It's mature, templated, and tightly coupled into the planning lifecycle.
   - **`/gsd-intel`** → writes **JSON** data files to `.planning/intel/` via a single intel-updater agent. Config-gated (`intel.enabled=true`), opt-in, and much newer — the implementation is visibly simpler and the public docs are already out of sync with the code.

2. **The mapper agents write *exactly the shape of document our Astrolabe reader currently grinds out*.** Seven documents, fill-in-the-blank templates with strict formatting rules and a "must include file paths with backticks" invariant. This is the closest prior-art match to what reader is doing — and GSD runs it in parallel, once, ahead of time, then caches it.

3. **The planner uses a phase-type → document-subset map** to decide which codebase docs to load per commission. That's the "brief-shape-aware selective loading" primitive Astrolabe is missing. We should steal it.

4. **The `/gsd-intel` JSON layer is cruder than I expected.** Query is case-insensitive substring grep over JSON keys/values. Freshness is a hardcoded 24-hour wall-clock TTL. Diff is post-refresh hash comparison (not source-change detection). Refresh is a full-rebuild agent spawn with no incrementality. No embeddings, no BM25, no tree-sitter. The *pattern* is valuable; the *implementation* is load-bearing-duct-tape.

5. **Docs-vs-code drift in `/gsd-intel`.** Public docs list schemas as `stack`, `api-map`, `dependency-graph`, `file-roles`, `arch-decisions`. Actual code uses `stack.json`, `apis.json`, `deps.json`, `files.json`, `arch.md`. Names and shapes don't line up. Mild red flag about the maturity of this layer.

## System 1: `/gsd-map-codebase` (the markdown layer)

### Orchestration

Command file: `commands/gsd/map-codebase.md`
Workflow: `get-shit-done/workflows/map-codebase.md`
Agent: `agents/gsd-codebase-mapper.md`

Flow:

1. Check if `.planning/codebase/` exists → offer refresh/update/skip.
2. Detect whether `Task` tool is available. If yes, spawn parallel agents; if no, fall back to sequential in-context mapping.
3. **Spawn 4 parallel `gsd-codebase-mapper` agents** with `run_in_background=true`:
   - **tech** → writes `STACK.md` + `INTEGRATIONS.md`
   - **arch** → writes `ARCHITECTURE.md` + `STRUCTURE.md`
   - **quality** → writes `CONVENTIONS.md` + `TESTING.md`
   - **concerns** → writes `CONCERNS.md`
4. Wait for all 4 via `TaskOutput` (default timeout 300000ms / 5min, configurable via `workflow.subagent_timeout`).
5. **Agents return confirmation only (file paths + line counts), NOT document contents** — this is load-bearing for context economy. The whole point is "don't transfer large docs back through the orchestrator's context."
6. Verify all 7 files exist, each >20 lines.
7. Secret-scan the output (grep for `sk-`, `ghp_`, JWT shapes, private-key headers).
8. Commit via `gsd-tools.cjs commit "docs: map existing codebase"`.

### The mapper agent

Full agent file: `/tmp/gsd/agents/gsd-codebase-mapper.md` (782 lines). Highlights worth stealing:

- **Tool access:** `Read, Bash, Grep, Glob, Write`. No Task (no recursion), no Edit (writes fresh).
- **"Mandatory initial read":** if the prompt contains a `<required_reading>` block, the agent MUST `Read` every listed file before any other action. This is the primary context-injection mechanism.
- **Philosophy rules** (these would transplant directly into Astrolabe's reader prompt):
  - *Document quality over brevity.* Long useful docs beat short summaries.
  - *Always include file paths in backticks.* Vague descriptions like "UserService handles users" are banned.
  - *Write current state only.* No temporal language, no "was" or "used to."
  - *Be prescriptive, not descriptive.* "Use camelCase for functions" beats "Some functions use camelCase."
- **Per-focus-area exploration recipes**: each focus has a specific bash/grep/find incantation spelled out in the prompt. The model isn't asked to invent its exploration strategy — it's handed one.
- **Critical rules at the end**: `WRITE DOCUMENTS DIRECTLY`, `ALWAYS INCLUDE FILE PATHS`, `USE THE TEMPLATES`, `BE THOROUGH`, `RETURN ONLY CONFIRMATION`, `DO NOT COMMIT`.
- **Forbidden files list** (`.env`, `credentials.*`, `*.pem`, `id_rsa*`, etc.) with the instruction: "note existence only, never quote contents, never include values like `sk-...`." Explicit security framing because "your output gets committed to git."

### Templates

The agent carries seven full markdown templates inline in the prompt. Each template has:

- A fixed set of top-level sections.
- `[Placeholder]` tokens to replace with findings.
- `[YYYY-MM-DD]` date token.
- Trailing footer like `*Stack analysis: [date]*`.

Templates (with key section names):

- **STACK.md** — Languages (primary/secondary), Runtime, Frameworks (core/testing/build-dev), Key Dependencies (critical/infrastructure), Configuration (env/build), Platform Requirements (dev/prod).
- **INTEGRATIONS.md** — APIs & External Services, Data Storage (databases/file storage/caching), Auth & Identity, Monitoring & Observability, CI/CD & Deployment, Environment Configuration, Webhooks & Callbacks.
- **ARCHITECTURE.md** — Pattern Overview, Layers, Data Flow, Key Abstractions, Entry Points, Error Handling, Cross-Cutting Concerns.
- **STRUCTURE.md** — Directory Layout (ASCII tree), Directory Purposes, Key File Locations (entry points / config / core logic / testing), Naming Conventions, **Where to Add New Code** (this is the "actionable" section), Special Directories.
- **CONVENTIONS.md** — Naming Patterns (files/functions/variables/types), Code Style, Import Organization, Error Handling, Logging, Comments (JSDoc/TSDoc), Function Design, Module Design.
- **TESTING.md** — Test Framework, Test File Organization, Test Structure (with actual code excerpts), Mocking, Fixtures and Factories, Coverage, Test Types (unit/integration/e2e), Common Patterns.
- **CONCERNS.md** — Tech Debt, Known Bugs, Security Considerations, Performance Bottlenecks, Fragile Areas, Scaling Limits, Dependencies at Risk, Missing Critical Features, Test Coverage Gaps. Each entry keyed by `[Area/Component]` with fields: Issue, Files, Impact, Fix approach.

### The consumption map (critical for us)

From `agents/gsd-codebase-mapper.md` lines 42–58 — **this is how plan-phase decides which codebase docs to load**:

| Phase type | Documents loaded |
|---|---|
| UI, frontend, components | `CONVENTIONS.md`, `STRUCTURE.md` |
| API, backend, endpoints | `ARCHITECTURE.md`, `CONVENTIONS.md` |
| database, schema, models | `ARCHITECTURE.md`, `STACK.md` |
| testing, tests | `TESTING.md`, `CONVENTIONS.md` |
| integration, external API | `INTEGRATIONS.md`, `STACK.md` |
| refactor, cleanup | `CONCERNS.md`, `ARCHITECTURE.md` |
| setup, config | `STACK.md`, `STRUCTURE.md` |

**This is exactly the pattern Astrolabe is missing.** The planner doesn't dump all 7 codebase docs into every plan prompt — it picks a 2-doc subset based on phase shape. Plan-phase also explicitly says "Follow existing conventions when writing code / Know where to place new files / Match testing patterns / Avoid introducing more technical debt" — that's the *why* of loading these specific pairs.

For Astrolabe: commissions naturally have a shape (feature, bugfix, refactor, framework-internal, plugin, engine, etc.). A brief-type → intel-subset map is directly portable.

## System 2: `/gsd-intel` (the JSON layer)

### Files and shapes

Code: `get-shit-done/bin/lib/intel.cjs` (660 lines).

Constants:

```js
const INTEL_DIR = '.planning/intel';
const INTEL_FILES = {
  files: 'files.json',
  apis:  'apis.json',
  deps:  'deps.json',
  arch:  'arch.md',
  stack: 'stack.json',
};
```

Each JSON file is expected to look like:

```json
{
  "_meta": { "updated_at": "ISO8601", "version": 1 },
  "entries": { "<key>": <value>, ... }
}
```

Known entry shapes from the validator (`intelValidate`):

- **`files.json`** — keyed by *file path*. Each entry has an `exports` array of symbol names. Validator spot-checks the first 5 paths exist on disk, and flags any export name containing a space as "looks like a description."
- **`deps.json`** — keyed by *dependency name*. Each entry needs `version`, `type`, `used_by`.
- **`apis.json`** — shape not validated; inferred as keyed by API/endpoint with some description/location fields.
- **`stack.json`** — shape not validated; inferred as language/runtime/framework facts.
- **`arch.md`** — plain markdown. Freeform. Query works by line-level substring match.

### Operations

All ops gate on `.planning/config.json` having `config.intel.enabled === true`. If not set, every op returns `{ disabled: true, message: ... }`.

**`intel query <term>`**

Case-insensitive substring match. For JSON files: walks `data.entries`, checks each key, and recursively checks each value (strings, arrays of strings, nested objects). For `arch.md`: returns matching lines. Result shape: `{ matches: [{ source, entries }], term, total }`.

That's it. No ranking, no relevance score, no embeddings. Literally `String.prototype.toLowerCase().includes()`.

**`intel status`**

Per-file check: exists?, last `updated_at`?, stale? Staleness is hardcoded:

```js
const STALE_MS = 24 * 60 * 60 * 1000; // 24 hours
```

For `arch.md` it uses file mtime; for JSON files it reads `_meta.updated_at`. A file older than 24h is `stale: true`. Overall status is stale if *any* file is stale or missing.

**`intel diff`**

Reads `.planning/intel/.last-refresh.json` which holds `{ hashes: { filename: sha256 }, timestamp, version }`. Compares current file hashes against the snapshot. Returns `{ changed, added, removed }` filename arrays. **Important:** this is the diff of *our intel files*, not of source code. It tells you what changed in the last refresh, not what's drifted in the project since.

**`intel refresh` (aka `intel update`)**

Does not directly refresh — returns `{ action: 'spawn_agent', message: 'Run gsd-tools intel update or spawn gsd-intel-updater agent for full refresh' }`. The command file `/gsd-intel` handles the actual refresh by spawning a `Task` with an inline prompt (see below).

**`intel snapshot`**

Writes the current hash map to `.last-refresh.json`. Called by the updater agent post-refresh as the new diff baseline.

**`intel validate`**

Schema check: every intel file exists, JSON parses, `_meta.updated_at` present and within 24h, entry shape matches the key-specific checks above. Returns `{ valid, errors, warnings }`.

**`intel patch-meta <file>`**

Low-level helper the agent uses while writing individual files. Reads the file, sets `_meta.updated_at = now`, bumps `_meta.version`, writes it back. Does NOT gate on `intel.enabled` — designed to be called on arbitrary paths by the agent mid-refresh.

**`intel extract-exports <file>`**

The *only* structural-from-source helper. Regex-based parsing of JS/CJS/ESM export patterns:

- `module.exports = { ... }` blocks (matches the LAST one in the file, walks brace depth)
- `exports.X = ...` lines
- `export default function X` / `export default class X`
- `export default (anon)` → pushes `'default'`
- `export (async)? function X(`
- `export (const|let|var) X =`
- `export class X`
- `export { X, Y, Z }` with `as alias` stripping

Returns `{ file, exports, method }` where method is `module.exports`, `exports.X`, `esm`, `mixed`, or `none`. This is what the updater agent uses to populate `files.json` entries without having to LLM-parse source files — a non-LLM primitive for the structural layer.

### The refresh agent

From `commands/gsd/intel.md` Step 3 — the command literally spawns a `Task` with this inline prompt:

> You are the gsd-intel-updater agent. Your job is to analyze this codebase and write/update intelligence files in `.planning/intel/`.
>
> Project root: `${CWD}`
> gsd-tools path: `$HOME/.claude/get-shit-done/bin/gsd-tools.cjs`
>
> Instructions:
> 1. Analyze the codebase structure, dependencies, APIs, and architecture
> 2. Write JSON intel files to `.planning/intel/` (`stack.json`, `api-map.json`, `dependency-graph.json`, `file-roles.json`, `arch-decisions.json`)
> 3. Each file must have a `_meta` object with `updated_at` timestamp
> 4. Use `gsd-tools intel extract-exports <file>` to analyze source files
> 5. Use `gsd-tools intel patch-meta <file>` to update timestamps after writing
> 6. Use `gsd-tools intel validate` to check your output
>
> When complete, output: `## INTEL UPDATE COMPLETE`
> If something fails, output: `## INTEL UPDATE FAILED with details.`

**Drift alert:** the prompt says `api-map.json`, `dependency-graph.json`, `file-roles.json`, `arch-decisions.json`. The code uses `apis.json`, `deps.json`, `files.json`, `arch.md`. The prompt and the code will produce non-overlapping file sets — the agent will write five files the validator doesn't know how to check, while the validator looks for five files the agent won't have written. Either this layer is aspirational, or there's a dedicated updater agent somewhere that reconciles this and we haven't found it.

(Quick search confirmed: no `intel-updater.md` or equivalent agent file exists. The refresh prompt is the only specification.)

## What's worth porting, what isn't

### Port directly

- **The consumption map pattern.** Brief-type → intel-doc-subset selection is the most impactful primitive. It's how you get "brief-shape-aware selective loading" without needing retrieval.
- **Mapper agent philosophy rules.** Quality-over-brevity, file-paths-in-backticks, prescriptive-not-descriptive, current-state-only. Transplants straight into an Astrolabe-adjacent mapper prompt.
- **Per-focus exploration recipes.** Hand the mapper a set of concrete bash/grep incantations rather than asking it to invent exploration. This alone could collapse reader's turn count dramatically.
- **"Write documents directly, return confirmation only" pattern.** Load-bearing for context economy when orchestrating multiple mapping passes. Directly addresses our "reader's output isn't being consumed" finding by making the output a *file* rather than a conversation yield.
- **Forbidden-files list.** Security hygiene we're currently missing.
- **`extract-exports` as a non-LLM primitive.** A pattern to follow: give the agent a small CLI of cheap deterministic helpers so it can avoid regex-ing source files via the LLM.
- **Phase-aware required-reading block.** The mapper's `<required_reading>` mechanism + the plan-phase document subset map together form the "preloaded context" pattern that Astrolabe is missing.

### Port selectively

- **Markdown document templates** (STACK/ARCHITECTURE/STRUCTURE/…). Most map reasonably onto Astrolabe's planning context, but the shape is GSD-specific (e.g. CONCERNS.md is redundant with our quest system; INTEGRATIONS.md assumes SaaS apps and doesn't map cleanly onto framework-internal work). Take the four or five that fit, rewrite the rest.
- **Parallel-agent orchestration.** Worth it if we're building a one-time-per-codebase mapper rig. Probably overkill for per-commission work — per-commission reader should query the cached intel, not rebuild it.
- **Intel JSON layer as a whole.** The *idea* is right; the *implementation* is a prototype. Specifically:

### Don't port

- **Case-insensitive substring grep as "query."** Good enough for GSD's current scale, not good enough for Astrolabe. Start with BM25 (trivial) if we want a retrieval layer at all, or skip retrieval entirely and rely on the document-subset map.
- **24-hour hardcoded TTL for staleness.** Wall-clock TTLs are the worst way to detect drift in source code. Use git SHA tracking: staleness = "mapper hasn't run since commit X" or "file F has changed since its intel entry's `updated_at`." Cheap, correct, and doesn't false-positive overnight.
- **Post-refresh hash-diff-of-intel as the "diff" operation.** It answers the wrong question. We want "what changed in the *source* since last refresh," which is a plain `git diff --name-only <last-refresh-sha>..HEAD`.
- **Docs-code-prompt drift.** Lesson by counterexample: whatever schema we commit to, the mapper prompt, the validator, the consumer loaders, and the docs all have to share a single source of truth. In our system this points at defining the intel shape in the framework's ontology (or domain/ontology) rather than in prose.

## Implications for our atlas design

Three design positions have firmed up as a result of this teardown:

1. **The markdown+consumer-map pattern beats the JSON+query-layer pattern.** GSD's mature system is the markdown one, and it solves "get brief-specific context into the planner" via a static phase→docs map. The JSON/query layer is newer, rougher, and optional. We should start with the markdown pattern (well-scoped documents, brief-type-aware selective loading) and only add a JSON/query layer if we have an actual use case for free-form term search. Right now, we don't.

2. **The atlas should be populated by a one-time mapper commission, not a standing daemon.** GSD's mapper agents run parallel under a single orchestrator command — they do not run on file change. Refresh is an explicit operation. For us, that means: an Astrolabe-adjacent rig template, commissioned when the atlas is stale, that writes documents to a known path. No file-watch infrastructure, no incremental maintenance in v1. Staleness tracked against git SHA.

3. **We don't need embeddings or retrieval in v1.** GSD's "query" is grep-over-JSON and their planner doesn't even use it — the planner uses the phase-type map to pick 2 of 7 docs. If GSD can ship a working system without a retrieval layer, we can start without one. Retrieval becomes valuable at some later inflection point (when the doc set grows past what we can subset by brief type alone).

The quest's Next Steps stay roughly the same, but with updated weight:

- **Step 3 (Astrolabe-tailored schema)**: start from the seven GSD markdown templates, cut the ones that don't fit (INTEGRATIONS, CONCERNS-as-tech-debt), add what we need (likely a framework-oriented MODULE-MAP that lists packages/plugins/their public APIs).
- **Step 4 (build split)**: structural intel lives as generated markdown via a mapper rig, not as JSON generated by tree-sitter. Non-LLM helpers exist (like `extract-exports`) but they're called by the mapper agent, not standalone builders.
- **Step 5 (where intel lives)**: sanctum-side artifacts under `experiments/atlas/` or a sibling path seems right. Guild-side feels heavier than needed since the atlas is cross-commission reference material, not first-class writ data.
- **Step 6 (reader/MRA consumption)**: define an Astrolabe-internal brief-type → atlas-subset map. Reader (or MRA) receives the subset as preamble, not as a separate retrieval step. Cache friendliness comes for free because the subset is deterministic per brief type.

## Appendix A: file inventory of what we read

From the GSD repo shallow clone at `/tmp/gsd`:

- `docs/COMMANDS.md` — public command reference (lines covering map-codebase, scan, intel).
- `commands/gsd/intel.md` — `/gsd-intel` command specification (179 lines).
- `commands/gsd/map-codebase.md` — `/gsd-map-codebase` command specification (71 lines).
- `commands/gsd/scan.md` — `/gsd-scan` lightweight variant (26 lines, not yet read in depth).
- `agents/gsd-codebase-mapper.md` — mapper agent system prompt and templates (782 lines, read fully).
- `get-shit-done/workflows/map-codebase.md` — orchestration workflow for map-codebase (379 lines, read fully).
- `get-shit-done/bin/lib/intel.cjs` — intel operations implementation (660 lines, read fully).
- `get-shit-done/bin/gsd-tools.cjs` — CLI dispatcher (1158 lines, only scanned for intel dispatch entries).

Not yet read — candidates for a second pass if we need more detail:

- `commands/gsd/plan-phase.md` — for the exact mechanics of "which docs does plan-phase actually load."
- `commands/gsd/scan.md` — the single-agent lightweight variant of map-codebase.
- `agents/gsd-pattern-mapper.md` — possibly a different mapper shape worth comparing.
- `sdk/prompts/agents/gsd-roadmapper.md` — may contain reusable prompt patterns.

## Appendix B: quick notes on what surprised me

- **GSD's query layer is a string grep.** I expected at least a tokenizer and case folding; got `toLowerCase().includes()`. The pragmatic lesson is "don't let schema sophistication gate shipping the pattern."
- **Freshness is wall-clock, not content-derived.** Seems like a deliberate simplicity choice, but it means a cold-cached intel file is considered fresh for 24h even if the source has changed wildly.
- **The markdown-mapper is more rigorous than the JSON-intel.** The markdown system has templates, validators-by-template-checklist, forbidden-files rules, security scanning, and a clear consumption map. The JSON system has 660 lines of code and a refresh prompt that references files the code doesn't know about. This suggests the markdown layer is the well-trodden path and the JSON layer is a prototype or an abandoned second attempt.
- **Agents write to disk, return confirmations only.** This pattern matches what our Astrolabe session funnel does with inventories, but the contrast with our reader is sharp: our reader produces structured output that lives in a conversation yield and ends up partially unused. GSD's structured output lives in durable files that subsequent commands re-open.
- **Plan-phase already does the thing SSR failed at.** It gets structured context about the codebase without the planning model doing its own exploration. The difference is that the context is *pre-built and document-subsetted*, not *generated inline*. This is the most actionable single insight from the teardown.
