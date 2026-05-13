# Prompt-Engineering Landscape — May 12 2026

A consolidated reference catalog of prompt-engineering and agent-prompt-design
techniques from the broader literature and practitioner community, surveyed
for applicability to Nexus's animas (chiefly the artificer/implementer but
also sage roles, astrolabe stages, and engine wrappers). Sibling document to
`cost-optimization-landscape.md` (Apr 29) — that one cataloged interventions
derived from analyzing our own session economics; this one catalogs techniques
from the field that we may or may not have applied.

The motivating premise: our prompts are artisanally built. The artificer.md,
sage roles, astrolabe stages, and engine wrappers grew incrementally as we
needed them. No one has systematically audited them against published
prompting guidance or the practitioner state-of-the-art. Some techniques in
this catalog will be redundant with what we already do; some have been tested
empirically and found wanting; some are genuinely untouched.

## Catalog discipline

- **Status tags.** Each idea carries one of:
  - `untested` — never tried in any of our experiments
  - `partial-overlap` — adjacent to something we've tested, but the technique itself wasn't tested cleanly
  - `tested-refuted` — directly tested in an experiment, did not sustain
  - `tested-sustained` — tested and adopted
  - `in-flight` — open click or active experiment covers it
- **Behavioral nudges included.** Some categories below (notably I — behavioral
  framing) overlap with X022/X024 which were largely refuted. They're included
  per Sean's direction — the question isn't "did this nudge work" but "does
  the literature claim it should work, and if so why didn't ours?"
- **Provenance.** Sources are training-data knowledge of the field as of the
  Coco model cutoff: Anthropic's prompting guide, public agent frameworks
  (Cursor, Cline, Aider, Continue, Roo), prompt-optimization research (DSPy,
  OPRO, PromptBreeder), and the lost-in-the-middle / position-effects
  literature. This is not a fresh literature search — call out anything that
  feels stale or under-cited and we can chase it down.
- **Estimates context.** "Est. savings" are directional, drawn from literature
  claims or analogous-system results. Treat them as a relative ranking, not
  absolute predictions. Our X021/X022/X024 trial cost overruns (50x in one
  case) are a reminder to budget conservatively.

---

## A. Cache-aware prompt structure

Anthropic's prompt cache: cache writes cost 1.25× base input, cache reads
cost 0.1× base. Up to 4 cache breakpoints per request, 5-minute default
TTL, 1-hour extended TTL available. The cost saving from cache reuse is
~10× on cached content — by far the largest pricing dial available at the
request level.

**Empirical finding: this section is effectively closed.** Direct measurement
on 776 completed engine sessions (Apr 25 – May 12 2026, $2.6K spend, vibers
guild books) shows the cache infrastructure is already at the ceiling on the
cost-dominant engines. Cross-session reuse is happening, extended TTL is in
use, and the per-session volatile content is already small. See the data
appendix `section-a-cache-data.md` (next door in this directory) for the full
analysis.

### What we measured

**Cache-read share of input-side tokens, per engine (n=776 sessions):**

| Engine | Cost share | Cache-read share | Notes |
|---|---:|---:|---|
| implement | $1,547 (58%) | **98.5%** | dominant cost engine; median first-turn warm = 99% |
| reader-analyst | $600 (23%) | 96.6% | |
| review | $170 (6%) | 95.1% | |
| spec-writer | $155 (6%) | 87.9% | short sessions, modest write tail (Q1 below) |
| revise | $92 | 97.4% | |
| seal-manual-merge | $43 | 97.3% | |
| patron-anima | $38 | 54.9% | tiny sessions, ignore |

For the cost-dominant implement engine, **median first-turn warm cache = 99%**.
Even sessions starting > 24h after the prior implement session land on a 98%
warm cache — likely because shared role/system-prompt content is being kept
hot by intervening sessions of other roles.

**TTL split for implement (n=71 sessions, broken out by model):**
- claude-sonnet-4-6 (workhorse): 96% of cache-writes go to 1h TTL
- claude-opus-4-7 (when used): 100% of cache-writes go to 1h TTL
- claude-haiku-4-5 (Claude Code internal side-helper): 100% of cache-writes go to 5m TTL

Claude Code is choosing TTL tiers correctly on its own.

### Per-item status

| # | Idea | Est. savings (original) | Empirical reality | Status |
|---:|---|---:|---|---|
| A1 | **Measure cache-hit rate per session** | instrumentation | Done. Baseline established (this section). Keep as a recurring regression detector — re-run if implement cache-read share drops below 90%. | **measured** |
| A2 | **Stable→volatile prompt ordering** | ~5-15% | Implicitly satisfied. 97% first-turn warm cache means stable content is already at the front of Claude Code's assembled prompt. | **non-actionable** |
| A3 | **Explicit cache breakpoints** | compounds | Likely placed correctly. High cross-session reuse implies breakpoints are landing where they should; the breakpoint API isn't exposed to us at the agent loop anyway. | **non-actionable** |
| A4 | **Cross-session cache reuse audit** | depends | Audit done. Implement median 99% first-turn warm; even >24h-gap sessions stay warm. Cold-start cases (n=3/71) bounded at < $3 savings if entirely eliminated. | **shipped (implicit)** |
| A5 | **Move volatile timestamps/IDs out of prefix** | ~1-5% | Negligible. Sum of all first-turn cache-write across 71 implement sessions = 129K tokens (~$0.50–$2.50). | **non-actionable** |
| A6 | **Extended-TTL cache for stable artifacts** | ~2-5% | Already shipped. Sonnet/Opus turns use 1h TTL automatically; 5m correctly reserved for Haiku side-helper turns. No knob to flip. | **shipped (implicit)** |

### What the data points to

Cache hit-rate is at the ceiling. The cost driver for implement is **prefix
size × turn count**, not cache layout. Per a controlled one-off `claude
--print` measurement (`prompt-debug-experiment.md`), the per-API-call
prefix layers as:

- ~1.4K tokens — our systemPrompt
- ~12K tokens — Claude Code baseline (22 built-in tools + 10 skills + agent wrapper)
- ~10K tokens — our 15 MCP tool schemas
- 5-100K tokens — our user prompt (varies by commission)

Total **fixed** Claude-Code-plus-MCP overhead is ~22K tokens per session.

Levers:
- Lever 1 — **shrink the user-prompt brief content** (the variable slice): tracked by X021 / X022 inventory-trim work. By far the largest available knob.
- Lever 2 — **filter Claude Code built-in tools** via `--allowedTools` / `--disallowedTools`: filed as click `c-mp28jnjk`. Caps at ~12K savings; real but smaller than the earlier writeup implied.
- Lever 3 — **trim our MCP tool surface** per engine: investigate whether each engine genuinely needs all 15 advertised MCP tools. Modest lever (~10K total budget).
- Lever 4 — **reduce turn count**: tracked elsewhere (X-series on session-boundary policy and turn-discipline).
- Lever 5 — **subagent dispatch for big-file analysis**: already in flight (`c-mok4qihw`, `c-mok4qix1`).

These are *structural* levers (size and turn count), not *cache-aware* levers
(layout). The original Section A framing — "make the cache layout better" —
overstates the available room. There is essentially no high-value
cache-layout work to do.

> **Correction note.** Earlier drafts of this section claimed the cached
> prefix is "75-100K tokens" of which "~72K is Claude Code injection."
> That number came from reading `cache_read_input_tokens` averages in
> production transcripts as a clean per-call prefix size. A controlled
> one-off showed the real per-call prefix is ~13K (no MCP) to ~23K (with
> MCP) of fixed overhead; the production numbers appear to accumulate
> across multiple internal API iterations per logical turn. See
> `prompt-debug-experiment.md` and the appendix revision notes.

### Open questions resolved

- **Q1: What is spec-writer writing to cache each session?** The full writ
  JSON (codex, status, inlined inventory) sits in a `tool_result` block at
  the front of the first user message — ~43KB per session. The cache-write
  delta (~6K tokens) is the per-plan portion of this. Inherently per-session
  volatile. At $155 total spec-writer spend over 17 days, halving this
  saves ~$5. Not worth dedicated work; X021/X022 inventory-trim is the right
  place for any movement.

- **Q2: Are cold-start outliers from TTL expiry or new prefix shape?**
  Mostly neither — once the dedup bug was corrected (Claude Code emits
  multiple events per API completion sharing `message.id`), only 3/71
  implement sessions came in below 80% first-turn warm. Two of those had
  intervening sessions of other roles within the 1h TTL window (likely
  cache-slot eviction by other-role traffic), and one was over the 1h TTL.
  Aggregate savings opportunity from eliminating all cold-starts: < $3.

### Overlap notes
- The Sonnet swap (`c-mokdz3sr`) attacked the per-token price dimension and
  has largely shipped: 24/25 recent implement sessions are primarily on
  Sonnet. Cache utilization is identical structurally regardless of model.
- X021's inventory-content interventions are the lever in this area — they
  attack what *goes into* the cached region. The layout discipline of that
  region is, per the data, already correct.

---

## B. Position effects in long context

Documented effect across most LLMs (Liu et al. 2023, "Lost in the Middle"):
instructions at positions ~20-80% of a long context are followed worse than
instructions at the beginning or end. Claude is reported less affected than
GPT-4 but the effect is present. Recency bias is also documented: when
instructions conflict, the later one tends to win.

**Empirical finding: the lost-in-the-middle concern points partly at Claude
Code overhead and partly at our brief content, depending on session size.**
Direct measurement on 502 sessions across 4 engines (Apr 25 – May 12 2026)
using the backfilled `SessionDoc.prompt` / `systemPrompt`, augmented by a
controlled `claude --print` one-off measurement (`prompt-debug-experiment.md`),
shows the assembled context for a typical implement session layered as:

- 0 – 1.4K: our systemPrompt (primacy zone)
- 1.4K – 13K: Claude Code baseline (built-in tools, skills, agent wrapper)
- 13K – 23K: our MCP tool schemas
- 23K – end: our user prompt (brief + manifest + execution rules)

For a small commission (5K user prompt → 28K total), the mid-context zone
is dominated by Claude Code overhead. For a larger commission (50K user
prompt → 73K total), the mid-context zone is mostly *our* brief content.

> **Correction note.** An earlier writeup claimed the mid-context zone is
> "entirely Claude Code's built-in tool definitions and accreted tool
> results — not our role files," with a "~72K-token gap" of Claude Code
> injection. That came from misreading production `cache_read_input_tokens`
> averages as a clean per-call prefix size. A controlled `claude --print`
> run with our implement systemPrompt + no MCP showed only ~13K of total
> prefix; with MCP it grows to ~23K. The 75-100K-token-prefix figure
> appears to be an artifact of multi-iteration cache accumulation in
> production transcripts. See `prompt-debug-experiment.md` for the
> ground-truth measurement.

One real lever surfaced: the framework's systemPrompt assembly order
(`charter → tools → role` in `loom.ts:360-378`) puts role content *after*
MCP tool docs. Switching to `charter → role → tools` would put role
directives in the primacy zone of the systemPrompt. See data appendix
`section-b-position-data.md`.

### What we measured

**Per-engine systemPrompt structure (n=502 sessions, 4 engines):**

| Engine | systemPrompt size | Tokens | MCP tool blocks | Role section appears at |
|---|---:|---:|---:|---|
| implement | 5,542 bytes | ~1,400 | 8 | 49% depth (in recency half) |
| spec-writer | 24,649 bytes | ~6,200 | 17 | 26% depth |
| reader-analyst | 29,231 bytes | ~7,300 | 17 | 22% depth |
| patron-anima | 23,137 bytes | ~5,800 | 2 | 5% depth |

All four engines follow the same `loom.ts` assembly: `[empty charter] →
[## Tool: X blocks] → [role/process content] → [Finishing Your Work]`. The
systemPrompt is **constant per engine** across all sessions in the window
(it's pure cache prefix — confirms Section A's cross-session-reuse finding).

**Within the assembled context** (~25K for a small commission, up to ~75K for a heavy brief):
- Our captured systemPrompt: positions 0 – 1.4K (implement) up to 0 – 7.3K (reader-analyst)
- Claude Code baseline (22 built-in tools + 10 skills + agent wrapper): positions ~1.4K – 13K
- Our MCP tool schemas (15 tools): positions ~13K – 23K
- Our captured user prompt: positions ~23K and beyond, varies 5K-100K with brief size

The literature's 20-80% depth zone:
- For a small (~30K) implement session: positions 6K-24K, mostly Claude Code + MCP overhead.
- For a heavy (~75K) implement session: positions 15K-60K, mostly our brief content.

### Per-item status

| # | Idea | Empirical reality | Status |
|---:|---|---|---|
| B1 | **Position-audit the artificer role file** | Done (this section). Role directives sit at positions 0.7-1.4K of the assembled context — strongest primacy zone. The "20-80% depth" concern maps to Claude Code overhead + our brief content (mix varies by commission size). | **measured** |
| B2 | **Repeat critical directives at the end** | Not done. Each engine's systemPrompt ends with a "Finishing Your Work" section containing *new* operational rules, not repetition of earlier directives. Literature claim is ~5-10% on adherence, but our X022/X024 behavioral-nudge experiments came in at -3.5% to -13% (wrong direction). | **untested, with priors against** |
| B3 | **XML-tag section delimiters** | **Tested by X026** (May 12-13 2026). Combined with B4 in one variant (XML tags wrapping `<task>`/`<testing>`/`<documentation>`/`<persona>`/`<finishing>` sections). Cross-workload result (A10 n=3 + A3 n=5): refuted. A10 showed apparent −21% effect (driven by one baseline outlier); A3 showed +2.3% (essentially null). Variance-compression hypothesis suggested by A10 (combined CV 4.3% vs baseline 22%) also did not transport to A3 (combined CV 7.1% > baseline 5.7%). | **tested-refuted (X026)** |
| B4 | **Front-load with goal, not background** | **Tested by X026** alongside B3 in the combined variant. Same cross-workload refutation as B3. The variant placed a `<task>` block at the top of the role file's content (and the framework-level `loom.ts` reorder lever `c-mp28jkau` remains untested). | **tested-refuted (X026)** |
| B5 | **Length-budget the role file** (~4K-token soft ceiling) | Partially relevant. Implement systemPrompt is ~1.4K tokens (under). Other three engines exceed 4K. But the 4K threshold concerns total assembled context, not role file alone; our context is 25K-100K+ regardless of role-file size. | **misframed in current setup** |

### What the data points to (post-X026)

**X026 closes the action surface in Section B at the cost-effect level.** Pattern across four experiments testing prompt-modification levers on Sonnet implementer:

- X022 (imperative tool-use nudges): −13% n=3, marginal
- X024 (goal-stated reframe of X022): −3.5% n=3, refuted
- X025 (few-shot demonstrations): central estimate +2% to −9% across cells, refuted at detection-threshold but deployed at deployment-threshold
- X026 (XML structural tags + goal-first ordering): refuted across workloads (A10 −21% driven by outlier, A3 +2.3%)

Aggregate signal: structural and behavioral prompt-modification on the role file produces marginal-to-null cost effects. The B4 framework-level lever (`loom.ts:360-378` reorder, click `c-mp28jkau`) is technically still untested but the priors against now run X022/X024/X025/X026 — running it has low expected value.

The `--allowedTools` / `--disallowedTools` lever (`c-mp28jnjk`, side discovery from Section B measurement) remains the more promising structural intervention in this neighborhood: it caps at ~12K tokens of Claude-Code-baseline-tool overhead. Cost-side lever, not behavior-side.

### Side discovery — Claude Code's built-in tool burden (corrected)

Claude Code injects ~12K tokens per session via the API `tools` parameter:
the 22 built-in tools (Bash, Read, Edit, Write, Grep, Glob, Task, etc.)
plus the 10 bundled skills it attaches by default. Together with our 15
MCP tool schemas (another ~10K), the fixed Claude-Code-plus-MCP overhead
is **~22K tokens per session** — smaller than the "~50K tool zone" the
earlier writeup claimed.

Claude Code exposes `--allowedTools` / `--disallowedTools` flags we don't
currently pass. Filtering the tool surface per engine — many engines don't
need WebFetch, many don't need Task — would shrink the ~12K-token built-in
zone. Section A-adjacent and Section E-adjacent (E5 — "strip unused tools
from the surface"). Filed as click `c-mp28jnjk`; lever is real but smaller
than initially pitched.

### Overlap notes
- Adjacent to X021 (which inlined content into the inventory) but X021 didn't
  audit *where* the inlined content sat. Confirmed: X021's content went into
  the user prompt at positions ~1.4K-15K of the assembled context — also in
  the strong primacy zone.
- B2 and B4 are the behavioral-nudge slice of this section. Section I
  experiments (X022, X024) tested similar levers; X026 closed B3+B4 with the
  same refuted verdict. The framework-level `loom.ts:360-378` lever
  (`c-mp28jkau`) is technically still untested but priors are now strongly
  against it producing meaningful cost movement.
- **Variance compression as its own claim** is an open question surfaced by
  X025 and X026 A10. Both observed combined cells with substantially lower
  CV than baseline (X026 A10: 22% → 4.3%). X026 A3 did not replicate. Could
  be a small-sample artifact or a real cost-stability effect; would need a
  focused trial holding workload fixed and varying n to distinguish.

---

## C. Few-shot / in-context examples

Documented to improve task performance, especially on tasks with implicit
quality criteria. 3-5 examples typically optimal; diversity matters more
than count. Negative examples ("don't do it this way") help when the
desired behavior is poorly specified by rules alone.

Our artificer.md contains **zero in-context demonstrations** of good
implementer trajectory. This is conspicuous — most published agent prompts
include at least one worked example.

| # | Idea | What it changes | Est. savings | Effort | Status |
|---:|---|---|---:|---|---|
| C1 | **Add a "good trajectory" example to artificer** | One annotated walkthrough of a clean implementer session: "Read spec → Grep for entrypoint → 3 targeted Reads → 4 Edits → 1 filtered test → 1 commit." Demonstrates the cheap-run trajectory X021 observed. | ~5-15% (literature claim) | small | untested |
| C2 | **Add an anti-example** | Show a bloated trajectory (repeat greps, full-workspace tests, speculative refactors) marked as the wrong path. Counterfactual demonstration. | ~3-8% | small | untested |
| C3 | **Few-shot in sage-writer for inventory format** | Show 2-3 examples of well-formed inventories (inlined types, do-not-read markers, etc.) rather than describing the format abstractly. | compounds with X021 | small | untested |
| C4 | **Few-shot in planner for plandoc structure** | Same pattern — show example plandocs rather than describing the schema. | quality on planning | small | partial-overlap (planner has informal templates) |
| C5 | **Negative few-shot for plan-vs-implement drift** | Show "the plan said X, the implementer did Y — this is a fidelity failure" examples in the reviewer engine. | quality on review | small | untested |

Overlap notes:
- The artificer role contains a lot of imperative rules but no demonstrations.
  This is a structural gap, not a behavioral question.
- X021's intervention was to put concrete content in the inventory; C1-C5
  put concrete content (examples) in the role files. Different files, same
  underlying principle (concrete > abstract).

---

## D. Output format / response shaping

Constraining response shape via schema, prefill, or explicit format
directives is documented to improve quality and reduce token spend on
formatting decisions. JSON/YAML constraints reduce hallucination of
malformed outputs. Explicit "think then act" preambles (Anthropic's
recommended `<thinking>` pattern) reduce premature tool calls.

Our engines currently don't constrain response shape beyond prose +
tool calls. The implementer can stream-of-consciousness arbitrarily
before each tool call.

| # | Idea | What it changes | Est. savings | Effort | Status |
|---:|---|---|---:|---|---|
| D1 | **`<thinking>` preamble before each major decision** | Direct the implementer to wrap reasoning in `<thinking>` tags. Anthropic-specific pattern, documented to improve quality with minor token cost. | quality | trivial | untested |
| D2 | **Structured "next action" preamble before tool calls** | Force `<plan>next: Edit file X to add type Y</plan>` before the tool call. Surfaces drift, makes transcripts auditable, reduces speculative tool use. | ~5-10% | small | untested |
| D3 | **Length budgets per response** | "Respond in ≤200 tokens unless writing code." Discourages narrative bloat. | ~5-10% on output tokens | trivial | tested-refuted (X024 goal-stated framing failed) |
| D4 | **Structured handoff format** | When implement ends with handoff (revise pipeline, retry-rig, etc.), force a YAML schema rather than prose. | quality + small cost | small | partial-overlap (rig handoff exists but is prose) |
| D5 | **Prefill the assistant turn** | Force first tokens like `<plan>` or `{"action":` to constrain shape immediately. Anthropic-specific affordance. | quality | trivial | untested |

Overlap notes:
- D3 directly overlaps X024 (turn-discipline goal-stated framing — refuted).
  The conciseness-as-framing approach failed; D3 reframes it as a hard format
  constraint, which is a different lever. Worth re-testing.

---

## E. Tool description quality

Anthropic publishes specific guidance on writing tool descriptions: 3-4+
sentences, explicit when-to-use and when-NOT-to-use, parameter descriptions
that name the consumer's perspective. Tool description quality directly
affects tool selection accuracy and parameter correctness.

Our MCP tool surface (`nsg` subcommands, writ tools, click tools, etc.)
has descriptions but we haven't audited them against this guidance.

| # | Idea | What it changes | Est. savings | Effort | Status |
|---:|---|---|---:|---|---|
| E1 | **Tool-description audit per Anthropic guidance** | Walk every MCP tool description and rewrite to spec: purpose, when-to-use, when-NOT-to-use, parameter docs. | quality (selection accuracy) | medium | untested |
| E2 | **Add "when NOT to use" to ambiguous tools** | E.g. `nsg writ post` vs `nsg commission post` — when do you use which? Most tool failures are wrong-tool-selection, not wrong-parameter. | quality | small | untested |
| E3 | **Parameter examples in descriptions** | Each parameter gets `Example: <concrete value>`. Documented to improve parameter correctness. | quality | small | untested |
| E4 | **Tool-ordering hints in system prompt** | "For file reads, prefer Grep before Read when seeking patterns." Reduces wasted Reads. | ~3-5% | small | partial-overlap (idea #9 in cost landscape — already at ceiling) |
| E5 | **Strip unused tools from the surface** | Every tool in the surface adds to system-prompt size. If a tool is used <1% of sessions, remove it from default surface or gate it behind opt-in. | ~2-5% (prompt size) | small | untested |

Overlap notes:
- Our tooling surface has accreted (writ tools, click tools, lab tools, MCP
  tools) without a quality audit. This is a maintenance issue more than a
  research question — but worth doing systematically.

---

## F. Decomposition patterns

Plan-then-execute, ReAct (reason+act loops), subagent dispatch,
tree-of-thoughts. These are the classic agentic-prompting patterns from
the 2023-2024 literature wave.

| # | Idea | What it changes | Est. savings | Effort | Status |
|---:|---|---|---:|---|---|
| F1 | **Explicit plan-then-execute in implementer** | Before any tool use, the implementer outputs a numbered plan. Subsequent tool calls reference plan steps. Reduces backtracking and exploratory churn. | ~5-15% | small (prompt) | partial-overlap (astrolabe plans externally, implementer plans informally) |
| F2 | **ReAct-style explicit reason/act labeling** | Every tool call preceded by `Thought: ... Action: ...`. Documented to reduce hallucinated tool calls. | quality + small cost | small | untested |
| F3 | **Subagent dispatch for big-file analysis** | Task subagent reads 50K file, returns 1K summary. Big content stays in subagent context. | ~10-15% | small (prompt) | in-flight (idea #20 / `c-mok4qihw`) |
| F4 | **Subagent dispatch for cross-package source** | Same pattern, applied to "how does package X integrate with Y." | ~10-15% on cross-package | small | in-flight (idea #21 / `c-mok4qix1`) |
| F5 | **Tree-of-thoughts for hard architectural choices** | When the implementer faces a real design decision (rare in mechanical work), branch and evaluate alternatives explicitly. Expensive but high-quality. | quality on hard work, +cost | medium | untested — likely too expensive for routine |
| F6 | **Self-consistency on critical outputs** | Sample multiple completions, take majority. Used in reasoning research; very expensive. Possibly useful only for final-gate decisions. | quality, large cost | large | untested |

Overlap notes:
- F3/F4 are already in the cost-optimization landscape and have open clicks;
  including here for completeness of the decomposition family.
- F1 is the in-session sibling of what astrolabe does between sessions —
  worth distinguishing those clearly.

---

## G. Self-correction / reflection

"Check your work" prompts, confidence-conditioned escalation, verifier
subagents, constitutional self-prompting. Documented to improve quality;
mixed evidence on cost (some patterns add turns, some catch errors that
would otherwise propagate).

Our pipeline has post-implement review at the rig level. In-session
self-correction is unstructured.

| # | Idea | What it changes | Est. savings | Effort | Status |
|---:|---|---|---:|---|---|
| G1 | **In-session reflection pass before commit** | Implementer pauses, reads its own diff, and asks "does this match the spec?" before committing. Catches drift earlier. | quality + small cost | small | untested |
| G2 | **Confidence-conditioned escalation** | "If you're not sure how to do this, output `ESCALATE: <reason>` instead of guessing." Reduces hallucinated changes. | quality | small | untested |
| G3 | **Output self-critique** | After writing a chunk of code, force a "what could go wrong here?" pass. Verifier-style but in-session. | quality + medium cost | small | untested |
| G4 | **Separate verifier subagent** | Implementer writes; subagent verifies the diff against spec independently. Decouples roles. | quality + medium cost | medium | partial-overlap (rig has reviewer; this is intra-rig) |
| G5 | **Constitutional self-prompting** | Embed a short "rules I will follow" list at the start of each session; periodically re-anchor. Anthropic-adjacent. | quality | small | untested |
| G6 | **Stop-when-uncertain over fail-loud** | When confidence drops below threshold, stop and ask the patron rather than barrel through. (Inverse of "block when implement contradicts spec" — `c-mo21aqo6`.) | quality | small | partial-overlap (existing patron-anima pattern) |

Overlap notes:
- The reviewer engine already does post-hoc verification; G1-G4 are
  in-session/intra-rig versions. Cheaper feedback loop, smaller scope.
- G6 is adjacent to the patron-anima principle and `c-mod66upj` (override
  rate monitoring).

---

## H. Skill files / just-in-time competence loading

Claude Code introduced skill files: `/skills/<name>/SKILL.md`, loaded on
demand via the standard tool surface. The idea: keep the base role
prompt slim, load specialized competence only when needed.

We use one skill in nexus-mk2 (briefs). Vibers' artificer role does not
decompose into skills — it's a monolithic ~3K-token role file covering
all situations.

| # | Idea | What it changes | Est. savings | Effort | Status |
|---:|---|---|---:|---|---|
| H1 | **Decompose artificer into base + skills** | Slim base role; load `skills/typescript-edit`, `skills/test-fix`, `skills/commit-discipline` on demand. Base prompt shrinks, specialized guidance loads when relevant. | ~5-10% on base context + targeted quality | medium | untested |
| H2 | **Skill file for "handling a failing test"** | Most common debugging scenario; currently improvised every time. Codify as a skill. | quality + ~3-5% | small | untested |
| H3 | **Skill file for "modifying a shared interface"** | Cross-package impact pattern; codify the workflow. | quality | small | untested |
| H4 | **Skill auto-loading via grep-trigger** | When the implementer sees a specific pattern (e.g., a failing test in transcript), the skill loads automatically. Bridges static prompts and dynamic context. | quality | medium | untested — experimental |

Overlap notes:
- This is the structural cousin of behavioral nudging: instead of telling the
  implementer how to behave in every situation, give it the relevant chunk of
  guidance only when the situation arises.
- Naturally pairs with C (few-shot) — skills can include examples.

---

## I. Behavioral framing — language and form of directives

This is the family our X022/X024 experiments targeted. Imperative vs
goal-stated, negation vs affirmation, concrete vs abstract, persona
intensity, reward/consequence framing. Literature claims modest effects;
our empirical results showed marginal-to-refuted at the cost-effect level.

Included per Sean's direction: even refuted findings deserve the "why
didn't it work for us" follow-up.

| # | Idea | What it changes | Est. savings | Effort | Status |
|---:|---|---|---:|---|---|
| I1 | **Imperative vs goal-stated framing** | "Do X" vs "your goal is to do X." X024 tested goal-stated, found wrong-direction. | tested as -3.5% n=3 | trivial | tested-refuted (X024) |
| I2 | **Affirmation over negation** | "Use sed for bulk renames" beats "don't use sequential Edits for bulk renames." Negation is documented to add cognitive load. | ~2-5% (literature claim) | small | untested — distinct from X022 |
| I3 | **Concrete vs abstract directives** | "Run `pnpm --filter <pkg> test`" beats "narrow your test scope." X022 used both registers; results were muddled. | ~3-8% | small | partial-overlap (X022) |
| I4 | **Persona intensity** | "You are a senior engineer" vs "you are an autonomous implementer agent." Documented mixed results — sometimes helpful, sometimes adds noise. | varies | trivial | untested |
| I5 | **Reward/consequence framing** | "If you do X, your work will pass review." Documented to be ineffective or counterproductive on Claude (well-aligned model, doesn't respond to fake incentives). | likely ~0% | trivial | untested — literature suggests skip |
| I6 | **Repetition of critical rules** | Same rule stated twice in different forms within the role file. Documented to improve adherence. | ~3-5% on adherence | small | untested |
| I7 | **First-person vs second-person framing** | "I will follow these rules" (assistant-perspective prefill) vs "You will follow these rules." Anthropic guidance suggests first-person is stronger. | small | trivial | untested |

Overlap notes:
- Strong overlap with X022 (combined-nudges) and X024 (goal-stated reframe).
  Both refuted at -13% and -3.5% respectively, with mechanism stories muddled.
- The pattern across X022/X024: behavioral framing produces marginal effects
  that don't compound, and reducing the directive count (X024 had a slimmer
  prompt) doesn't beat the imperative bundle (X022). My read of "why" — see
  Open Questions section.

---

## J. Context engineering — what loads, when, and how

JIT retrieval, context compression, eviction, pre-summarization, working
memory hints. The "context window management" family. Some of these are
upstream-limited (Claude Code doesn't expose context-eviction primitives);
some are buildable on our side.

| # | Idea | What it changes | Est. savings | Effort | Status |
|---:|---|---|---:|---|---|
| J1 | **JIT retrieval — load context as tool results, not upfront** | Already mostly happening via Grep/Read. The question is whether we ever pre-load context that should be JIT-loaded. | varies | small (audit) | partial-overlap (X021 attacked spec-side preloading) |
| J2 | **Context compression (LLMLingua-style)** | Pre-process long inputs through a compression LLM. Trades a small upstream cost for big downstream cache savings. | ~10-20% on long-context work | large (new tooling) | untested |
| J3 | **Aggressive context eviction primitive** | Drop tool results from context when no longer needed. Upstream-limited — not exposed by Claude Code today. | ~10-30% if available | depends on upstream | in-flight (idea #27 / `c-mok4qlem`) |
| J4 | **Pre-summarization of large attachments** | Before loading a 50K file into context, summarize it. Same pattern as F3 (big-file subagent) but applied upstream of session start. | ~10-15% | medium | partial-overlap (F3) |
| J5 | **Working memory hint** | "Track these files/patterns you've already searched: ..." Pre-loaded list updates over the session. | ~2-5% | medium (engine wrapper) | untested |
| J6 | **Auto-compaction tuning** | Deliberately invoke compaction earlier rather than at threshold. Documented to work gracefully on Claude Code. | varies | small | in-flight (idea #28 / `c-mok4qltw`) |

Overlap notes:
- The cost-optimization landscape covers J3 and J6 in detail; including here
  for landscape completeness.

---

## K. Meta-prompting / automatic optimization

DSPy (declarative pipelines + auto-compilation), OPRO (LLM-as-optimizer),
PromptBreeder (evolutionary search), EvoPrompt. Treat prompts as
hyperparameters and let an optimizer tune them.

Our laboratory apparatus is essentially this infrastructure — A/B trials on
prompt variants. But we've used it for hand-authored variants, not for
optimizer-driven search.

| # | Idea | What it changes | Est. savings | Effort | Status |
|---:|---|---|---:|---|---|
| K1 | **Hand off prompt variants to an LLM optimizer** | Give Claude/Opus N rounds: "here's the prompt, here's the cost result, propose a variant." Each round emits a hypothesis the lab can test. | varies, novel mechanism | medium (orchestration) | untested |
| K2 | **DSPy-style compile pass on the artificer role** | Express the role file as a declarative spec, let an optimizer compile to a concrete prompt. Heavy machinery. | varies | large (new tooling) | untested |
| K3 | **Evolutionary prompt search** | Genetic-algorithm over prompt mutations. Expensive but principled. | varies | large | untested |
| K4 | **A/B testing harness for prompts as a first-class lab feature** | Make "post a prompt variant, get a cost/quality measurement back" a 30-minute operation, not a 2-day experiment. | unlocks K1/K3 | medium | partial-overlap (lab apparatus exists; not optimized for this loop) |
| K5 | **LLM-authored skill files** | Have an LLM observe N sessions and propose new skill files based on recurring patterns. Promote skills bottom-up. | varies | medium | untested |

Overlap notes:
- We have the apparatus (laboratory). What we don't have is the loop — a
  cheap, fast way to express a prompt variant and get back a measurement.
  K4 is the precondition for K1/K3.

---

## L. Prefill / response anchoring

Anthropic-specific affordance: prefill the assistant turn with the first
tokens of the response. Strong constraint on response shape; commonly used
for JSON output, decision-tree navigation, language switching.

**Empirical finding: this section is upstream-locked.** Direct inspection of
the `claude` CLI surface (which all 1,800+ historical sessions go through)
shows no prefill flag is exposed; no `tool_choice` either. Measurement across
54 sampled sessions confirms no prefill or custom stop-sequence is in use,
and the leading content of first assistant turns varies freely. See the
data appendix `section-l-prefill-data.md` for the full analysis.

A narrower L1-adjacent lever exists (`--json-schema` for structured output
validation) but doesn't apply because our structured data is routed through
MCP tool calls, not response text.

### What we measured

- **54 sessions across 7 production engines.** No session shows a consistent
  first-token prefix per engine. No custom `stop_sequence` is set anywhere.
  Leading content of `thinking` / `text` first blocks varies freely.
- **`claude` CLI flag survey.** Animator-spawned `claude` processes pass:
  `--setting-sources`, `--dangerously-skip-permissions`, `--model`,
  `--system-prompt-file`, `--resume`, `--mcp-config`, `--strict-mcp-config`,
  `--print -`, `--output-format stream-json`, `--verbose`. No `--prefill`,
  no `--tool-choice`, no first-token anchoring of any form is exposed.
- **Provider lock-in.** 1,811 of 1,816 historical sessions use the `claude-code`
  provider; the other 5 used `copilot`. Effectively the entire LLM surface
  runs through Claude Code, so any prefill-equivalent must come through
  Claude Code's CLI affordances.

### Per-item status

| # | Idea | Est. savings (original) | Empirical reality | Status |
|---:|---|---:|---|---|
| L1 | **Prefill JSON-prefix for scorer/instrument engines** | quality | `--json-schema` is the closest equivalent and not in use, but our scorers/instruments write structured data via MCP tool calls, not via response text. Targets a surface we don't use for structured output. | **non-actionable in current architecture** |
| L2 | **Prefill `<plan>` tag for implementer first response** | ~3-5% | Claude Code CLI doesn't expose response prefill. No knob to flip. | **upstream-locked** |
| L3 | **Prefill "Step 1:" trajectory anchoring** | quality | Same — no prefill exposure. | **upstream-locked** |
| L4 | **Prefill decision-tree branches** | quality | Same — no prefill exposure. `--agents <json>` for custom subagent dispatch is L4-adjacent but solves a different problem. | **upstream-locked** |

### What the data points to

The prefill family is parked until upstream changes. The L1 sub-question
(JSON-shape constraint for structured output) is already addressed by our
tool-call discipline, not by prompt-engineering.

### Side discovery — Section A follow-up

The `claude` CLI surface review surfaced a flag explicitly targeting
Section A's concern: `--exclude-dynamic-system-prompt-sections` claims to
"improve cross-user prompt-cache reuse" by moving per-machine sections
(cwd, env, memory paths, git status) from the system prompt into the first
user message. But the flag is **ignored** when `--system-prompt-file` is
passed — and we pass `--system-prompt-file`. Two implications worth a
follow-on click:

1. By replacing the default system prompt entirely, we may be skipping
   useful default content (or, alternatively, dodging cache-busting
   per-machine sections — direction unknown without inspecting the
   default content).
2. Switching to `--append-system-prompt` (which keeps the default) plus
   `--exclude-dynamic-system-prompt-sections` could improve cross-host
   cache reuse — at the cost of a larger total prompt.

Section A's measurement showed implement first-turn warm cache already
at 97% median, so this is a small-headroom lever. Filing as future-work
rather than near-term trial.

### Overlap notes
- Section L was originally framed as "the cheapest family in the catalog —
  prefill is a single config knob per engine." That assumed the knob exists
  in our agent loop. It doesn't.

---

## M. Multi-turn / agentic patterns

Memory/scratchpad, stop conditions, loop guards, inter-turn reflection.
The "session-as-a-process" family. Our writs/clicks are the persistent
versions; in-session memory is unmanaged.

| # | Idea | What it changes | Est. savings | Effort | Status |
|---:|---|---|---:|---|---|
| M1 | **Explicit in-session scratchpad** | Reserve a section of context as "things I've learned this session." Update over time. Documented to improve multi-turn coherence. | quality | small | untested |
| M2 | **Stop conditions / termination criteria** | Make the "you are done" signal explicit and structured rather than vibes. Reduces over-iteration. | ~3-5% | small | partial-overlap (rig has terminal-status; in-session is vibes) |
| M3 | **Loop guards / max-iteration caps** | Hard cap on tool calls per session, max retries per pattern. Backstop against runaway sessions (the 7213-second hang). | bounds outlier cost | small | untested |
| M4 | **Inter-turn reflection ("what did I just learn")** | Force a 1-2 sentence reflection between tool calls when the previous result was unexpected. | quality | small | untested |
| M5 | **Sub-task budgets** | "Spend at most N turns on this sub-task before moving on or escalating." | ~5-10% on tail outliers | small | untested |

Overlap notes:
- M3 is the prompt-level cousin of the apparatus-level workspace-test guards
  (idea #13 turborepo, plus wedge-detection clicks). Different mechanism, same
  outlier-failure-mode target.

---

## Priority bundles

After surveying the catalog, the highest-value-untested bundles are below.
The original Priority 1 — cache layout audit — has been measured and is
effectively closed; see Section A. The numbering below reflects the post-
measurement priority order.

### ~~Priority 1 — Cache layout audit + restructure~~ (closed)

**Outcome:** Direct measurement showed implement engine median first-turn
warm cache = 99%, cache-read share = 98.5% across $1.5K of implement spend.
Cross-session reuse, extended TTL, and stable→volatile ordering are all
already happening implicitly via Claude Code's prompt assembly. No
high-value layout work remains. The lever this section pointed at
(prefix-size reduction) is tracked by the X021 family. See Section A for
the full data.

### Priority 1 — Few-shot demonstrations in artificer role

(Promoted from previous P2 after the cache layout bundle was retired.)

**Bundle:** C1 (good-trajectory example), C2 (anti-example), I6 (repetition),
L2 (prefill `<plan>`).

**Why first:** Conspicuously absent from current role files. Cheap to add
(one role-file edit). Pure prompt-engineering work in the artificer role
file — no architecture change, no engine restructure, fully reversible.
Demonstrably more aligned with Anthropic's official prompting guidance than
the current role.

**Estimated stack savings:** ~5-15% on substantive commissions (literature
claim; would need empirical confirmation).

**Effort:** Small. Author one annotated good-trajectory transcript and one
anti-example based on X021 cheap-vs-expensive runs.

**Acceptance signal:** Comparison trial on a substantive workload (X021/X023
shape) shows lower per-session output tokens and turn count without quality
regression.

### Priority 2 — Tool description audit

(Promoted from previous P3.)

**Bundle:** E1 (audit per Anthropic guidance), E2 (when-NOT-to-use),
E3 (parameter examples), E5 (strip unused tools).

**Why second:** Quality lever more than cost lever, but the failure-mode
audit (E2 — wrong-tool-selection causes session waste) is real and
unaddressed. The MCP tool surface has accreted without a quality pass.

**Estimated savings:** Hard to quantify — quality and selection accuracy
gains, with some cost reduction from removed unused tools.

**Effort:** Medium. ~1 day of audit-and-rewrite work across the tool surface.

**Acceptance signal:** Reduced rate of "tool selected but immediately abandoned"
patterns in transcripts.

---

## Compounding model

With the original P1 (cache layout) now closed at zero recovered cost,
the remaining priority bundles model differently than the first draft.

P1 (few-shot demonstrations) at expected rates: ~5-15% cost reduction on
substantive commissions. P2 (tool description audit) is primarily a
quality lever with modest cost movement. Realistic combined: **~5-12%
additional cost reduction on top of the Sonnet swap**, materially below
the original ~10-20% headline.

The original framing assumed cache layout was the largest untouched lever.
The measurement showed it wasn't a lever at all. The remaining cost-side
movement in this catalog is incremental; the larger structural levers
(prefix size, turn count, decomposition) live in other tracking surfaces.

The bigger question, addressed in the next section: are these the right
*kinds* of techniques to be chasing?

---

## Open questions

These came up while drafting the catalog. Worth thinking through before
committing to which bundles to actually run.

1. **Why do prompt-modification levers consistently underperform literature
   claims on Sonnet implementer cost?** Pattern is now wider: X022 marginal,
   X024 refuted, X025 marginal at detection-threshold (deployed at deployment-
   threshold), X026 refuted across two workloads. Several hypotheses:
   - Claude is too well-aligned to respond to coercive framing.
   - Our role files are already long enough that incremental nudges get
     lost in the middle (B1-B5 above).
   - The cost mechanism is dominated by structural factors (cache layout,
     context size, model choice) and behavioral nudges target a smaller
     surface than expected.
   - The mechanism stories were always weak — adherence-without-effect is
     possible if the nudged behavior isn't actually the cost driver.
   - Sonnet's behavioral variance is high enough that detectable effects
     at n=3-5 require ≥20% effect sizes, and prompt-modification just
     doesn't produce effects that large.

   The aggregate pattern argues against continued investment in this
   intervention surface for cost reduction. The variance compression
   anomaly observed in X025 v3 and X026 A10 (but not X026 A3) remains an
   open question worth a focused trial if cost-stability matters
   independent of mean cost.

2. ~~**Are we already implicitly doing the structural techniques?**~~
   **Resolved (May 12 2026).** Direct measurement on $2.6K of session
   spend across 776 sessions showed yes for cache (A2–A6 all implicit
   or already shipped via Claude Code's prompt assembly and TTL
   selection). Worth re-asking the same question for the other
   "structural-overlap" families — B (position effects) and L (prefill)
   may have the same property. The measurement template is in
   `section-a-cache-data.md`.

3. **Should this catalog drive experiment authoring or operational changes?**
   Some entries (A2, B2, I6) are 1-hour operational fixes. Others (K1, J2)
   are multi-month projects. The catalog flattens that. A prioritization
   pass that separates "do now" from "experiment-worthy" from "long-term
   research" would help.

4. **How much of this is upstream-locked?** Several entries (A3 cache
   breakpoints, D5 prefill, J3 eviction) depend on what Claude Code exposes
   to us. Need to check which are accessible from the agent loop vs only at
   the request level.

5. **What's the budget for testing this catalog?** If we spent $258 on X021
   (one structural intervention) and $110 each on X022/X024 (two behavioral
   interventions) to learn "behavioral nudges are marginal," budgeting
   honestly for catalog-driven experiments means assuming ~$200-400 per
   intervention tested. With 30+ ideas, the catalog can't all be tested —
   it's a ranking tool, not an experiment plan.

---

## References

External:
- Anthropic prompting guide (training-data version, likely stale)
- Anthropic prompt caching documentation
- Liu et al. 2023, "Lost in the Middle: How Language Models Use Long Contexts"
- DSPy framework documentation
- ReAct paper (Yao et al. 2022)
- Tree of Thoughts (Yao et al. 2023)
- Self-Refine (Madaan et al. 2023)
- Constitutional AI papers (Anthropic)
- Public agent framework prompts (Cursor, Cline, Aider, Continue, Roo)

Internal:
- `cost-optimization-landscape.md` — sibling document, Apr 29 catalog
- `section-a-cache-data.md` — data appendix backing the Section A measurements (May 12 2026)
- `section-b-position-data.md` — data appendix backing the Section B measurements (May 12 2026)
- `section-l-prefill-data.md` — data appendix backing the Section L measurements (May 12 2026)
- `prompt-debug-experiment.md` — controlled `claude --print` one-off measurement that ground-truths the Claude-Code overhead vs production cache_read numbers (May 12 2026)
- X021 results (spec/inventory content) — `experiments/X021-inventory-format/artifacts/results.md`
- X022 results (tool-use nudges) — `experiments/X022-implementer-behavior-nudges/artifacts/runlog.md`
- X024 results (turn discipline) — `experiments/X024-implementer-turn-discipline/artifacts/results.md`
- X025 results (few-shot demonstrations) — `experiments/X025-implementer-few-shot/spec.md`
- X026 results (XML structural tags + goal-first) — `experiments/X026-implementer-xml-role-ordering/spec.md`
- Click `c-mok4nke6` — Apr 29 cost-optimization landscape
- Click `c-mokdz3sr` — Sonnet swap (Priority 0, recently pulled)
- Click `c-mp2o2m5h` (concluded) — X026 experiment click
- Click `c-mp2viid4` — lab verify silent-exit bug (X026 side discovery)
- Click `c-mp28jnjk` — `--allowedTools` Claude Code built-in filtering (Section B side discovery)

---

## Status

Draft. Sections A, B, and L are measurement-backed (May 12 2026; see
`section-a-cache-data.md`, `section-b-position-data.md`,
`section-l-prefill-data.md`). All other sections still hold their original
"untested" / "partial-overlap" tags from the initial draft.

Gates still open for promotion to `docs/`:
- Has Sean reviewed and pruned the remaining sections?
- Has the literature/citations been verified against current state of the field?
- Has the catalog been cross-referenced against vibers' actual role files (not just nexus-mk2's)?

Promote to `docs/` once these gates clear.
