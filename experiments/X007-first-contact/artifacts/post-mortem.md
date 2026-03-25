# X007 Post-Mortem: First Contact

## Summary

The first real commission — a local web dashboard for monitoring guild state — succeeded. The artificer produced a working, surprisingly polished application in a single session. The steward handled guild administration, troubleshooting, and commission dispatch effectively through natural conversation. Two framework bugs were discovered and worked around during setup.

The product quality exceeded expectations. The process quality revealed significant gaps in instruction delivery, agent role boundaries, and operational tooling.

## What Worked

### The commission spec
A concise, goal-oriented spec with a clear function contract and deliberate absence of layout prescription. The agent made good autonomous decisions about presentation, data organization, and technical approach (server-rendered HTML, zero framework dependencies). The spec struck the right balance between direction and freedom.

### The codex
The dependency selection policy — added to the codex minutes before dispatch — directly influenced the agent's behavior. It chose Node's built-in `http` module over Express, kept dependencies minimal (one runtime dep), and used only permissively-licensed packages. The codex concept proved uniquely powerful: it applies instructions to anything the guild builds, in any workshop, regardless of what repository agents are working in. This is a stickier, more global instruction mechanism than repo-level files like CLAUDE.md or .cursorrules.

### The steward
Handled the full administrative workflow: workshop creation, commission posting, clock running, codex editing, manifest capture, tool investigation, and infrastructure debugging. The patron's assessment: "The steward did awesome. Even the basic stuff was much better than fiddling with the shell, making multiple file edits, etc." The steward found and worked around two framework bugs without being asked to investigate them.

### The product
The dashboard has a dark theme with CSS custom properties, sticky navigation, responsive card grids, color-coded badges for standing order verbs, proper data tables, empty states, and HTML escaping. It exceeded both the patron's and Coco's quality predictions.

## What Didn't Work

### The curriculum is wrong for the job

The guild-operations curriculum is a comprehensive manual covering everything about guild operations: CLI reference, workshop management, guild restore, clockworks internals, commission posting, session lifecycle. An artificer building a web dashboard needs almost none of this.

**Consequences observed:**
- The agent shelled out to `nsg` CLI commands (turns 26-28) instead of using its MCP tools — it learned about the CLI from the curriculum and treated it as its own interface.
- The agent traversed from its workshop worktree to the guildhall filesystem to read type definitions and run commands — the curriculum taught it where things live, so it went looking.
- At ~35K characters, the system prompt is dominated by irrelevant content, contributing to instruction dilution and orientation cost.

**Action:** Build a lean artificer curriculum. An artificer needs to know: what are my tools, what is my job, how do I track progress with strokes, what are the boundaries of my role. Everything else is noise that actively confuses the agent about its role boundary.

### Stroke tracking was completely ignored

The system prompt contained at least six explicit directives to plan and record strokes, including a dedicated section with four bullet-point instructions. The agent had four stroke tools available. It used none of them. It built the thing, committed in one shot, and moved on.

This is an agent adherence problem, not an instruction omission. But it surfaces a design question: **should stroke tracking be enforced at the framework level?** The patron noted: "This is probably going to become a key observability and reliability tool for the system in the future. Does this mean we need to somehow inject this at a framework level, so that the guilds don't have to think about it (or get it wrong)?"

**Action (near-term):** Build a lean artificer curriculum with stroke tracking front-and-center — not one of twenty concepts in a guild-wide manual, but a core part of "this is how you do your job." Add codex entries reinforcing proper tool usage. Iterate on instructions until agents reliably use strokes.

**Action (if instructions aren't enough):** Add a framework-level directive injected into every artificer session prompt, separate from the curriculum. Make it non-negotiable and prominent.

**Action (if directives aren't enough):** Consider enforcement — the session funnel checks for stroke records before accepting a clean completion. No strokes recorded = session flagged for review. This guarantees compliance for observability and staged session continuity.

### No in-flight visibility

The patron had no way to monitor the commission while it was running. "No good way to tell how it went" was a pre-dispatch prediction that proved accurate. The steward provided some after-the-fact visibility, but during the session itself the patron was blind.

**Action:** Automate the clockworks (manual clock-running is painful) and build status tooling so the patron can see what's happening. Ironic that the first commission was a monitoring dashboard for a system that couldn't monitor its own commissions.

## Code Quality Issues

The agent hand-rolled utilities that should come from standard library or established packages:

- **HTML escaping function.** A custom 4-line `esc()` replacing `&`, `<`, `>`, `"`. This has security implications — hand-rolled escaping is a common source of XSS vulnerabilities. Should use a proven library or Node built-in.
- **Date formatting.** Custom `formatDate()` wrapping `Date.toLocaleDateString()`. Minor, but unnecessary when libraries like `Intl.DateTimeFormat` or lightweight formatters exist.
- **Inline HTML template strings.** The entire dashboard is built from template literals in TypeScript. Acceptable at this scale, but a yellow flag for maintainability as the dashboard grows.
- **Inline CSS as a const string.** 200+ lines of CSS embedded in a TypeScript file. Harder to review, lint, and maintain than a separate `.css` file or CSS-in-JS solution.

**Action:** Add a codex entry: "Do not hand-roll security-sensitive utilities (HTML encoding, URL encoding, cryptographic operations, etc.) when established standard library or well-maintained packages exist. Lightweight dependency footprint does not mean reimplementing solved problems."

This creates a useful tension with the existing "lightweight deps" policy. The agent would need to navigate the tradeoff — use a library for escaping (adding a dependency) rather than rolling its own (keeping deps minimal but risking correctness). That's the right kind of judgment call to push to the agent.

## UI Observations

The UI exceeded expectations but had specific issues:

- **Font size too small.** Combined with tight spacing, the overall impression was slightly "off" despite the polish — like a well-designed dashboard viewed at the wrong zoom level.
- **Low contrast in places.** Muted text colors against the dark background created minor accessibility/readability issues.
- **Non-uniform table columns.** Multiple tables stacked vertically with different column counts and widths looked messy.

These are typical of agent-generated UIs that optimize for feature completeness over visual refinement. A follow-up commission specifically targeting styling and accessibility would likely resolve them.

## Framework Bugs Discovered

1. **Session provider not registered via MCP path.** The `clock-run` MCP tool doesn't go through CLI startup where `registerSessionProvider()` is called. First commission silently failed (dispatch "skipped"). Workaround: run `nsg clock run` via CLI directly.

2. **`baseTools` overrides role gating.** The starter kit populates `baseTools` with all tools, delivering every tool to every anima regardless of role configuration. Had to be manually cleared.

3. **No re-signaling of framework events.** When `commission.ready` dispatch was skipped, there was no way to retry. Had to cancel and resubmit the entire commission.

**Action:** Commission fixes for all three. The session provider gap is the most critical — it breaks the autonomous dispatch pipeline when the steward (or any MCP-based tool) tries to run the clockworks.

## Changes Before Next Commission

### Must-do
- [ ] Build lean artificer curriculum (strip guild-ops to role essentials, strokes front-and-center)
- [ ] Add codex entry: don't hand-roll security-sensitive utilities
- [ ] Add codex entry: use MCP tools, not CLI commands
- [ ] Fix session provider MCP registration gap
- [ ] Fix baseTools override in starter kit

### Should-do
- [ ] Automate clockworks (remove manual clock-running requirement)
- [ ] Build status/monitoring tooling for in-flight commissions
- [ ] Commission packaging/publishing guidance (how does agent-built code get distributed?)

### If instructions don't fix stroke adherence
- [ ] Add framework-level stroke directive (injected by system, not curriculum)
- [ ] If that's still not enough: enforcement at session completion (no strokes = flagged for review)

### Consider
- [ ] Workshop filesystem isolation (containers or access controls)
- [ ] Role-specific curricula as a framework concept (not just guild policy)

## Metrics

| Metric | Value |
|--------|-------|
| Commission cost | ~$4.16 (Opus) |
| Session duration | 51 assistant turns |
| Orientation turns | 22 (43%) |
| First productive turn | Turn 37 |
| Orientation cost (estimated) | ~$1.40 (34% of tokens) |
| Framework bugs found | 3 |
| Stroke tools used | 0 of 4 |
| Acceptance criteria met | 3 of 3 |

## Experiment Verdicts (Preliminary)

**H1 (Manifest Gap): Confirmed.** Three infrastructure bugs, curriculum mismatch, tool/role boundary confusion. Components that work in isolation failed to compose correctly for the first real dispatch.

*H1 "if true" actions:* Build a manifest review step — a dry-run mode that lets the patron or Coco audit the full manifested context before dispatch. We did this ad hoc (steward dumped the manifest JSON to a file), but it should be a formal part of the dispatch workflow. Consider `nsg anima manifest <name> --review` or similar that presents the context in a human-reviewable format rather than raw JSON.

**H2 (Orientation Cost Dominates): Confirmed.** 43% of turns, 34% of input token cost was orientation. First productive action at turn 37. Warm-session optimization is worth investigating.

*H2 "if true" actions:*
- Invest in reducing orientation time: better tool instructions, worked examples in curricula, leaner system prompts.
- Build `nsg session analyze` — the orientation cost analysis tool is fully specced (`artifacts/orientation-cost-analysis-spec.md`) and we now have real data to validate against. This gives us repeatable measurement for future commissions.
- Evaluate warm-session forking (`artifacts/warm-session-spec.md`) — pre-loading codebase context via Claude CLI's `--resume --fork-session` to eliminate repeated orientation. The 34% orientation cost is the ceiling that warm sessions would target.

**H3 (Commission Spec Is the Bottleneck): Partially confirmed, but needs more data.** H3 predicts the spec matters more than infrastructure — and that's roughly what happened. The infrastructure had three bugs, the curriculum was bloated and confused the agent about its role boundary, but the commission spec was clear and the output was good. A well-written spec compensated for rough infrastructure. However, this was a single bounded commission — the infrastructure problems caused process failures (no stroke tracking, wrong tool usage, guildhall traversal) that didn't hurt *this* deliverable but would compound across multiple commissions or larger work. The spec carried the day for a one-shot job; whether it remains the binding constraint at scale is an open question.

*H3 "if true" actions:*
- X003 (Commission Prompt Tuning) is now unblocked — the guild monitor commission serves as the reference task, with this session as the detailed-spec baseline. Run minimal and bare-mountain variants to test whether spec detail actually matters.
- Consider commission templates for common work types (feature addition, bug fix, greenfield project) to codify what makes a good spec.
- Evaluate sage consultation as a spec-writing aid — can a sage help the patron draft better commissions?
