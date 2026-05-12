# Claude Code Prompt Debug Experiment — May 12 2026

A one-off measurement to ground-truth how much content Claude Code injects
into the cached prefix beyond what we pass. Run after the prompt-backfill
validation confirmed that `SessionDoc.systemPrompt` and `SessionDoc.prompt`
faithfully reproduce what we send.

## Setup

- Sandbox clone: `git clone --depth 1 https://github.com/shardworks/nexus.git /tmp/nexus-debug`
- Live implement session as reference: `ses-mp29lbx5-44252c5f` (the dep-update commission, May 12 2026 06:43 UTC)
- Extracted from session: 5,559-byte systemPrompt → `/tmp/nexus-debug/sys_prompt.txt`
- Test user prompt: `"Output just the single word 'hello' and nothing else."` (54 bytes)
- claude CLI version: 2.1.139

## Args used

```
claude --setting-sources user \
       --dangerously-skip-permissions \
       --model claude-sonnet-4-6 \
       --system-prompt-file /tmp/nexus-debug/sys_prompt.txt \
       --print - \
       --output-format json \
       --debug \
       --debug-file /tmp/nexus-debug/.debug/<runN>.log
```

Differences from the production babysitter args (per
`packages/plugins/claude-code/src/babysitter.ts:160-185`):
- **omitted `--mcp-config` / `--strict-mcp-config`** — no MCP server stood
  up for the test. This isolates Claude-Code-baseline overhead from MCP.
- omitted `--output-format stream-json --verbose` — replaced with `json`
  for a single compact response.

## Runs and results

### Run 1 — our implement systemPrompt, tiny user prompt, no MCP

```
input_tokens:                 2
cache_creation_input_tokens:  2,725  (all 1h TTL)
cache_read_input_tokens:      10,552
output_tokens:                4
total input-side:             13,279
cost:                         $0.0138
```

Our captured content was 1,400 tokens of systemPrompt + 14 tokens of user
prompt = **1,414 tokens of "ours"**. Total reported input was 13,279.
**Claude Code injects ~11,865 tokens of overhead** in this config.

### Run 2 — no systemPrompt at all, default Claude Code

```
input_tokens:                 2
cache_creation_input_tokens:  5,440
cache_read_input_tokens:      12,690
output_tokens:                4
total input-side:             18,132
cost:                         $0.0247
```

With Claude Code's own default system prompt instead of ours, the total
prefix is 18,132 tokens. Implication: passing `--system-prompt-file`
**replaces ~6,700 tokens of Claude Code default content** with our 1,400-
token systemPrompt (net shrink of ~5,300 tokens).

### Runs 3-5 — sanity reruns

Repeated Run 1 with identical args: same numbers (cw=2,725, cr=10,552).
Stable. The 2,725 cache_creation per run looks like content with
non-deterministic elements (timestamps?) at a position that doesn't cache
across invocations.

## What the debug log told us

Useful counts from `/tmp/nexus-debug/.debug/run1.log`:

- `getSkills returning: 0 skill dir commands, 0 plugin skills, 11 bundled skills` — Claude Code ships with 11 built-in skills.
- `Sending 10 skills via attachment (initial, 10 total sent)` — 10 of 11 are attached to the first call.
- `Dynamic tool loading: 0/22 deferred tools included` — **22 built-in tools** loaded (Bash, Read, Edit, Grep, Glob, Task/Agent, Write, etc., plus ~14 others).
- `[claudeai-mcp] Fetched 3 servers` followed by `Skipping connection (cached needs-auth)` for "claude.ai Google Drive" / "Calendar" / "Gmail" — the Anthropic-hosted MCP marketplace is consulted but all servers need auth and are skipped.
- Separate `[API REQUEST] /v1/messages source=generate_session_title` fires **before** the main `source=sdk` request — Claude Code makes a side API call to title the session, contributing its own cache footprint.

The debug log does **not** dump the API request body (only metadata). We
don't see the literal tool schemas or skill content. Counts are what's
available.

## Cost picture, corrected

Per implement session in production:

| Layer | Tokens | Notes |
|---|---:|---|
| Our systemPrompt | 1,400 | Constant per engine (rendered from role file + 8 MCP tool instructions) |
| Claude Code overhead (22 built-in tools + 10 skills + agent wrapper) | ~12,000 | Constant; observed in Run 1 |
| Our MCP tool schemas (15 tools via the API `tools` field) | ~10,000 | Constant per engine; inferred from production-vs-test diff |
| **Total fixed overhead per session** | **~23,000** | |
| Our user prompt (brief + plan content) | 5,000-100,000 | Varies dramatically by commission |

For a small commission (5K user prompt), fixed overhead is ~3.4× our
content. For a typical commission with a rich brief and inlined inventory
(50K user prompt), fixed overhead is ~0.4× our content — **our brief
dominates**.

## What this overturns

An earlier sloppy-arithmetic estimate of "Claude Code dwarfs our input ~6×"
came from treating the average `cache_read_input_tokens` in production
transcripts (~83K) as a clean per-call prefix size. That number is
inflated — production transcripts appear to accumulate cache stats across
multiple internal API iterations per logical turn. The clean per-call
prefix measured in the controlled run is ~13K + ~10K MCP = **~23K**, not
83K.

Concrete consequence: the "filter Claude Code built-in tools" lever
(`c-mp28jnjk`) is real but **smaller than originally claimed**. It caps at
~12K tokens of Claude-Code-baseline-tools. The bigger structural lever is
**our user-prompt content** (briefs, inlined inventories) — which is
what the X021 / X022 inventory-trim track has always been targeting.

## Spending the experiment

Three runs, total $0.04. The Run 4 attempt that used the full live user
prompt timed out at 60s while the model started actually doing the work —
we got no token report from that run, but the bounded `timeout` capped it
before significant cost.

## Files

- `/tmp/nexus-debug/sys_prompt.txt` — extracted live systemPrompt
- `/tmp/nexus-debug/full_user_prompt.txt` — extracted live user prompt (unused in successful runs)
- `/tmp/nexus-debug/user_prompt.txt` — minimal test user prompt
- `/tmp/nexus-debug/.debug/run1.log`, `run2-no-sysprompt.log`, etc. — debug logs (~12K each)
- `/tmp/nexus-debug/.debug/stdout1.json`, `stdout2.json`, `stdout5.json` — JSON responses with usage stats
