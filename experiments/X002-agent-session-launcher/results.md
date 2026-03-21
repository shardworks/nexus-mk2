# X002 Results — Agent Session Launcher

## Outcome: Success (Attempt 3)

The system produced a working session launcher as a subcommand of the existing Nexus CLI. Sean can run it without cloning the repo:

```sh
npx github:shardworks/41fb92f2-30e1-4c42-8cfb-eb1a6b85a680 run "do the thing"
```

Streaming agent activity goes to stderr; structured JSON report goes to stdout.

---

## Attempt 1 — Failed (permissions: settings.json format)

The `bypassPermissions` config in `.claude/settings.json` included extra fields (`permissions.allow`, `permissions.deny`, `additionalDirectories`) that may have interfered with the bypass flag. The agent couldn't write files.

Additionally, the agent hit the self-testing paradox — it tried to run `claude -p` from inside its own session to test the launcher, but the sandbox blocked nested Claude invocations. After ~10 failed attempts, it adapted and tried to build from knowledge, but the write permissions issue was fatal.

**Session log lost** — directory was deleted before artifact capture.

### Fix Applied
- Simplified settings.json to just `{"bypassPermissions":true}`

---

## Attempt 2 — Failed (permissions: sandbox-level restrictions)

File write permissions worked (the simplified config fixed that), but two sandbox-level restrictions remained:

1. **Nested Claude invocations blocked.** `claude -p` commands "required approval" that couldn't be granted in autonomous mode.
2. **Bash output redirection blocked.** Even redirecting to files within the working directory was caught by a separate security layer.

The agent explored the codebase thoroughly and began implementation but couldn't test or empirically discover Claude Code's output format.

**Session log:** `artifacts/agent-session-attempt2.jsonl`

### Fix Applied
- Added `--dangerously-skip-permissions` CLI flag to the commission runner
- Removed `.claude/settings.json` setup entirely — the CLI flag supersedes it

---

## Attempt 3 — Success

**Model:** Claude Opus
**Duration:** 294s (268s API)
**Turns:** 26
**Cost:** $0.74
**Sub-agents used:** Yes — Haiku ($0.06) for exploration tasks, Opus ($0.68) for main work

### What the Agent Did (turn by turn)

1. **Parallel exploration (turns 1–10).** Spawned two sub-agents simultaneously: one to explore the existing codebase, one to research Claude Code CLI flags. Smart delegation.
2. **Deep codebase read (turns 11–25).** Read every file, checked git history, understood the existing CLI structure. Methodical.
3. **Empirical format discovery (turns 26–32).** Ran `claude -p --output-format stream-json` with various flags to see the actual output format. Discovered that `stream-json` requires `--verbose` with `--print`. Also tested `--include-partial-messages` for streaming text deltas.
4. **Implementation (turns 33–34).** Wrote two files: restructured `bin/nexus-cli.js` (892 chars) as a subcommand router, and `bin/run.js` (6888 chars) as the session launcher.
5. **Self-testing (turns 35–42).** Ran 5 end-to-end tests:
   - Simple prompt → verified JSON output matches schema
   - Tool-using prompt with `--cwd /tmp` → confirmed multi-turn works
   - Missing prompt → verified error message
   - Help commands → confirmed all work
   - Bad `--cwd` → verified failure produces JSON (not crash)
   - Stream separation → verified stdout/stderr split works with redirection
6. **Polish (turns 43–46).** Fixed a model default reference, updated README, updated package.json description, committed, pushed.

### What Went Right

- **Discovered the format on its own.** We gave zero hints about JSONL, stream-json, or Claude Code's output structure. The agent ran `claude --help`, figured out the flags, ran test sessions to see the format, and built a correct parser. "Mountain not trail" validated.
- **Extended existing code correctly.** Didn't rewrite from scratch — restructured the CLI entry point as a subcommand router while preserving the original version-info behavior.
- **Output contract matched exactly.** The JSON schema matches what we specified: camelCase fields, costs as numbers, token breakdowns, per-model usage. Even stripped the `[1m]` context window suffix from model names.
- **Thorough error handling.** Three distinct error paths: result event present (happy path), no result event (fallback report), spawn error (process-level failure). All produce valid JSON.
- **Self-testing was comprehensive.** Five distinct test scenarios, including failure cases. The agent didn't just check "does it run" — it verified stream separation, error handling, and edge cases.
- **Sub-agent delegation.** Used Haiku for exploration (cheap) and Opus for implementation (capable). Cost-efficient architecture choice.
- **Added features we didn't ask for.** `--max-turns`, `--permission-mode` flags, `--include-partial-messages` for streaming text deltas. All sensible additions.

### Debatable Points

- **Chose plain Node.js again.** Same as X001. Not wrong, but the clean room didn't push it elsewhere.
- **Hardcoded `bypassPermissions` as default permission mode.** Reasonable for an autonomous launcher, but worth noting — it assumes the caller wants full permissions.
- **Streaming output shows tool names and result previews.** We said "thinking and commentary, not raw tool-use events." It shows `[tool: Bash]` markers and result previews, which is more than we asked for but arguably useful.

### Session Stats

| Metric | Value |
|--------|-------|
| Duration | 294s (268s API) |
| Turns | 26 |
| Cost | $0.74 |
| Opus cost | $0.68 |
| Haiku cost | $0.06 |
| Input tokens | 965 |
| Output tokens | 9,008 |
| Cache creation | 25,478 |
| Cache read | 582,915 |

---

## Attempt 4 — Amendment Run (A1 + A2)

**Model:** Claude Opus
**Duration:** 188s
**Turns:** 24
**Cost:** $0.59

First test of the commission amendment pattern. Two amendments added to the existing commission:
- **A1:** Version info should require explicit `version` subcommand; no-args shows help
- **A2:** Stderr streaming should show agent thinking/reasoning, not just tool name markers

### What the Agent Did

1. **Exploration (~20 turns).** Read every file, checked git history — same thorough exploration as the greenfield run, despite the "you are iterating" framing. This is the X004 baseline: the "no prior context" variant spends nearly half its turns re-reading code it wrote yesterday.
2. **Implementation (3 edits).** Surgical `Edit` calls to `nexus-cli.js`, `run.js`, and `README.md`. Did not rewrite — iterated on existing code. Exactly what we hoped.
3. **Testing (~8 turns).** Tested both amendments explicitly:
   - No-args → shows help ✅
   - `version` subcommand → shows version ✅
   - `--help` flag → shows help ✅
   - End-to-end `run` with simple prompt → JSON correct ✅
   - Multi-tool prompt → checked stderr for thinking ✅
   - Complex reasoning prompt → confirmed thinking streams ✅
   - Error case (missing prompt) → verified ✅
4. **Committed and pushed.** Clean commit message referencing both amendments.

### Validation Results

**A1 (version subcommand):** ✅ Working. No-args shows usage, `version` shows version info.

**A2 (stderr thinking):** ✅ Partially working — but the "bug" was more of an expectations mismatch. The agent added `thinking_delta` event handling, and thinking *does* stream when the agent thinks. On simple tasks, agents just don't think much between tool calls — they go tool-tool-tool-done. When tested with a prompt that forced deep reasoning ("think deeply at each step"), rich narrative paragraphs streamed between tool calls perfectly.

**Regressions:** None detected. JSON schema still matches, error handling still works, stream separation still works. The cumulative "How I'll Evaluate" section did its job — the agent tested the full list, not just the new amendments.

### Amendment Pattern Observations

- **The agent iterated, not rewrote.** Three surgical edits. The "you are iterating, not starting over" framing worked — or the agent just naturally preferred to edit existing code. Hard to attribute causation.
- **Exploration cost is real.** ~20 turns of re-exploration for 3 edits. Prior session context (X004) could cut this significantly.
- **Cumulative evaluation held.** The agent tested original requirements alongside new amendments. No regressions. This is the key finding for the amendment pattern.
- **Cost was reasonable.** $0.59 for an amendment run vs $0.74 for the greenfield build. Not dramatically cheaper — exploration dominates.

### Session Stats

| Metric | Value |
|--------|-------|
| Duration | 188s |
| Turns | 24 |
| Cost | $0.59 |

---

## Comparison: X001 vs X002

| Metric | X001 (attempt 2) | X002 (attempt 3) |
|--------|------------------|------------------|
| Duration | 106s | 294s |
| Turns | 17 | 26 |
| Cost | $0.30 | $0.74 |
| Attempts to success | 2 | 3 |
| Self-tested | Yes | Yes (5 scenarios) |
| Sub-agents | No | Yes (Haiku for exploration) |
| Files written | 4 | 2 (but more complex) |

Commission complexity roughly doubled cost and time, which feels proportional. The agent needed more exploration and testing turns, but the core implementation was still fast.

---

## Meta-Learnings

### The self-testing paradox is real but solvable
Tools that invoke Claude can't be tested from inside a Claude session — unless the sandbox permissions are fully open (`--dangerously-skip-permissions`). Attempts 1 and 2 proved the paradox; attempt 3 proved the solution. The self-testing mandate was valuable once the environment supported it.

### Permission configuration has layers
Three layers discovered:
1. `.claude/settings.json` `bypassPermissions` — covers file read/write via tools
2. Sandbox-level command approval — covers bash commands that invoke certain binaries
3. Bash output redirection security — covers shell redirects to files

Only `--dangerously-skip-permissions` as a CLI flag covers all three. The settings.json approach is insufficient for autonomous agents that need full system access.

### "Mountain not trail" works for data discovery
The agent was given an output contract and zero implementation hints. It discovered Claude Code's `stream-json` format by running the CLI and inspecting the output — the exact scientific approach we would have taken. It even discovered the `--verbose` requirement and `--include-partial-messages` flag on its own.

### Commission-driven development scales
X001 was a trivial CLI. X002 required process orchestration, stream parsing, structured output, and error handling. The same pattern (commission → clean room → fruit) worked. The agent's cost scaled roughly linearly with complexity.

### Agents delegate when they can
The agent chose to use sub-agents (Haiku for exploration, Opus for implementation) without being told to. This is an emergent cost optimization — it spent $0.06 on exploration instead of ~$0.20+ if it had used Opus for everything.

### Infrastructure issues dominate early experiments
All three attempts used the same commission. Attempts 1 and 2 failed on infrastructure (permissions), not on task complexity. The commission was fine — the clean room setup wasn't. This suggests that perfecting the execution environment is higher leverage than perfecting commissions, at least in the bootstrap phase.

### The amendment pattern works — but exploration cost is the bottleneck
Amendments added to the commission were addressed correctly, existing behavior didn't regress, and the agent iterated surgically rather than rewriting. The cumulative "How I'll Evaluate" section served as a natural-language regression suite. However, the agent spent ~20 turns re-exploring its own code before making 3 edits — nearly the same exploration cost as a greenfield run. Prior session context (X004) is the obvious optimization.

### "Thinking" in stderr depends on the task, not the tool
The A2 amendment appeared to partially fail — stderr still showed mostly tool markers on simple tasks. But testing with prompts that required deep reasoning produced rich streaming narrative. The tool was working correctly; the agent just didn't have much to say between tool calls on trivial tasks. This is an expectations management issue, not a bug.

## Artifacts

- `artifacts/agent-session-attempt2.jsonl` — JSONL log from attempt 2 (permissions failure)
- `artifacts/agent-session-attempt3.jsonl` — JSONL log from attempt 3 (success)
- `artifacts/agent-session-attempt4-amendments.jsonl` — JSONL log from attempt 4 (amendment run)
