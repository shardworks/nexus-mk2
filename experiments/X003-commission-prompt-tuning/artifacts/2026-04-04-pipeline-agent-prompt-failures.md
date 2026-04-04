# Pipeline Agent Prompt Failures — Field Report

**Date:** 2026-04-04
**Context:** Plan workshop pipeline (reader → analyst → writer) running via `claude --print`
**Session:** 8953a89d-3e82-42c0-8e54-8ffe8d624f8b

## Background

The plan workshop runs three specialized agents sequentially — reader (inventories codebase), analyst (produces scope/decisions), writer (produces spec). Each runs as a `claude --print` invocation with agent-specific instructions. These agents worked reliably when running from the sanctum (`cwd: /workspace/nexus-mk2`). After switching to temp codex clones (`cwd: /tmp/plan-nexus-xxx/`), the agents began failing in varied and inconsistent ways.

## Failure Modes Observed

### 1. Role abandonment — agent ignores specialization

**Symptom:** Reader agent, whose only job is to inventory codebase files, instead attempted to *implement the brief directly* — using Edit tool to modify doc files in the clone, treating the brief as a task rather than something to inventory.

**Evidence:** Session transcript shows reader using `Agent` (subagent), `Read`, and `Edit` tools. Never attempted to write `inventory.md`. When Edit was permission-blocked, it gave up and dumped a short text summary to stdout.

**Root cause (confirmed via transcript):** The `--agent` flag layers custom instructions *on top of* Claude Code's default system prompt, which includes general-purpose coding assistant framing. The default framing ("be helpful, implement changes") competed with the agent's specialized role instructions. When the agent's cwd was a source code repo (the codex clone), the default framing won — the agent saw source code and a bug-report-style brief, and its instinct was to fix rather than inventory.

**Key insight:** `--agent` is additive, not replacement. For specialized roles that deliberately restrict behavior (read-only agents, analysis-only agents), the default system prompt actively undermines the specialization. The agent has two competing instruction sets and picks whichever feels more natural given the context.

### 2. Tool availability leakage

**Symptom:** Reader agent used `Agent` (subagent dispatch) tool despite agent frontmatter specifying `tools: Read, Glob, Grep, Write`. The subagent explored the filesystem without the reader's role constraints.

**Root cause:** The `tools` field in agent frontmatter may not restrict the tool palette as strictly as expected, or Claude Code's defaults re-enable tools not listed. Not fully diagnosed — resolved by switching to `--tools` CLI flag which explicitly sets the available toolset.

### 3. Cross-project write failures

**Symptom:** Agent's `cwd` is the temp clone (`/tmp/plan-nexus-xxx/`). Output must be written to the sanctum specs dir (`/workspace/nexus-mk2/specs/`). Write tool calls to the specs dir path were silently blocked or permission-denied.

**Observed agent behavior:** The agent tried the absolute path, then relative path, then various reformulations — all blocked. Eventually gave up and dumped output as text to stdout.

**Contributing factors:**
- `--add-dir` grants read access for tools but does not automatically grant write permission
- Without `--dangerously-skip-permissions`, the Write tool requires explicit permission grants. In `--print` mode (non-interactive), there's no human to approve, so writes outside the project root fail silently.
- The agent interpreted write failures as "try a different path" rather than "this is a permission issue" — burning turns on futile retries.

### 4. Inconsistent behavior across identical agents

**Symptom:** Given the same setup (`--agent`, `--print`, same cwd, same `--add-dir`), the analyst reliably wrote files to the specs dir while the reader never did. Both had `tools: Read, Glob, Grep, Write` in frontmatter.

**Possible explanations (not fully resolved):**
- The analyst ran with `--resume --fork-session` (inheriting the reader's conversation context), which may have primed tool-use patterns
- The analyst's structured output format (YAML schemas) may naturally lead to file-writing, while the reader's prose inventory format is more naturally expressed as text response
- The brief's content read like a bug report, which primed implementation behavior in the reader more than in the analyst (whose role is explicitly analytical)

### 5. CLAUDE.md context pollution

**Symptom:** When cwd changed from the sanctum to a codex clone, agents picked up the codex's `.claude/CLAUDE.md` via auto-discovery. This established a "framework source repo" identity context that primed implementation behavior.

**Not fully confirmed as causal** — the analyst succeeded with the same CLAUDE.md. But it likely contributed to the role abandonment (Failure #1) by reinforcing the "you're working in a code repo, implement things" framing.

## What Didn't Work

| Approach | Result |
|----------|--------|
| Adding "You MUST use the Write tool" to instructions | Helped some agents, not others |
| Removing tree-diagram output examples | No clear effect |
| Hardcoding absolute output paths in instructions | Agent tried to write there but was permission-blocked |
| `--add-dir` for the output directory | Grants read but not necessarily write |
| Removing `--dangerously-skip-permissions` | Broke writes entirely in non-interactive mode |

## Solution (confirmed working)

**Approach:** Replace `--agent` with `--system-prompt-file` + targeted CLI flags:

- `--system-prompt-file` — agent instructions become the *only* system-level context (no competing Claude Code defaults)
- `--tools Read,Glob,Grep,Write` — explicit toolset, no Agent/Edit/Bash leakage
- `--setting-sources user` — suppresses CLAUDE.md auto-discovery from the clone
- `--permission-mode acceptEdits` — auto-approves file writes in non-interactive mode
- `--print -` with stdin prompt — avoids arg-length limits and dash-prefix parsing
- Explicit output paths in the user prompt: "Following your instructions, create an inventory at: /full/path/to/inventory.md"

**Result:** Full pipeline (reader → analyst → writer) completed successfully on first run. Reader produced 118-line inventory, analyst produced scope/decisions/observations, writer produced spec. All files written to correct locations.

**Why it works:** Every failure traced back to the agent receiving mixed signals — role instructions competing with default system prompt, tool restrictions not enforced, identity context from the wrong CLAUDE.md. The fix eliminates all ambient context and makes every instruction explicit.

## Broader Implications for X003

These findings suggest several dimensions for commission prompt tuning that weren't in the original X003 spec:

1. **System prompt layering matters.** When custom instructions are additive (appended to defaults), the defaults can override specialized roles. For agents with constrained roles, replacement (`--system-prompt`) is more reliable than addition (`--agent`).

2. **Environment primes behavior.** The same agent instructions produced different behavior depending on cwd, available CLAUDE.md, and what the surrounding files "looked like." An agent in a source code repo defaults to implementation; in a docs repo it might default to writing. The instruction text has to overcome environmental priming, not just state the desired behavior.

3. **Tool availability shapes role compliance.** Giving an agent Edit/Bash tools when it's supposed to be read-only is asking it to resist temptation. Restricting the toolset to match the role (`--tools`) is more reliable than instructing the agent not to use certain tools.

4. **Write path salience matters.** Placeholder paths (`{specs_dir}/{slug}/file.md`) with values passed in the prompt require the agent to do substitution. Concrete paths in the user prompt ("write to: /workspace/nexus-mk2/specs/foo/inventory.md") are more reliable. The agent can copy-paste rather than compose.

5. **Auto-chain should gate on output, not exit code.** An agent exiting code=0 doesn't mean it produced the expected output. Pipeline orchestration should verify artifacts exist before triggering downstream steps.
