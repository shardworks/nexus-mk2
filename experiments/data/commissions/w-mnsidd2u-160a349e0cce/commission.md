## Opened With

Historical scratch file preserved for the record. Originally drafted in `.scratch/babysitter-mcp-handshake-race-brief.md`:

---

# Babysitter MCP handshake race — planner sessions launching with zero tools

## Why this brief exists

Detached anima sessions are occasionally launching with **no MCP tools attached at all**. The session still runs end-to-end (babysitter is alive, transcripts stream, lifecycle reports fire), but claude's view of the nexus-guild MCP server is empty — `tools/list` returns nothing, `ToolSearch` finds nothing, and skills hosted via the MCP server aren't discoverable.

Concrete case: planner session `ses-mnseaiv7-8ab40c93` (writ `w-mnseafoz-1ef8c8a748fc`, planning brief "Allow plugins to contribute new writ types"), launched 2026-04-10T04:17:46Z. The session's **sole `deferred_tools_delta`** at startup advertised 16 tools — all Claude Code built-ins, zero `mcp__nexus-guild__*`. Downstream symptoms in the transcript:

- `ToolSearch` for `plan-show`, `inventory-write`, `scope-write`, `decisions-write`, `observations-write`, `spec-write`, and `astrolabe` → all returned `"No matching deferred tools found"` (7 queries)
- `Skill plan-show` → `"Unknown skill: plan-show"`
- Planner fell back to Bash/Glob/Read/Agent hand-exploration, used ~$3 of tokens, and produced no plan artifacts because it had nothing to write them with.

Cross-session comparison against nearby draft sessions (all post-detached-sessions-rollout):

| Session | Start | `mcp__nexus-guild__*` tools |
|---|---|---|
| mnsbjlk8 | 03:06:36 | 4 (pre daemon restart) |
| mnsdtzcj | 04:10:20 | 2 (partial? or legitimately different rig) |
| **mnseait5** | **04:17:46** | **0** ← broken |
| mnsex66b | 04:35:19 | 4 (recovered) |

Daemon was restarted in foreground source mode at 03:36:37. Sessions before and after mnseait5 worked fine, so it's **not** a persistent break — it's a flake. The DLQ is empty for this session: the babysitter reached the guild for both `session-running` and `session-record`. Whatever failed was narrowly on the claude ↔ MCP proxy handshake, not on babysitter lifecycle.

## The suspicious code path

In `packages/plugins/claude-code/src/babysitter.ts:272-291`, the SSE request handler creates and connects the transport **inside** the request handler itself:

```ts
const httpServer = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/sse') {
    transport = new SSEServerTransport('/message', res);
    await server.connect(transport);          // ← awaited mid-request
  } else if (req.method === 'POST' && req.url?.startsWith('/message')) {
    if (!transport) {
      res.writeHead(400).end('No active SSE connection');
      return;
    }
    await transport.handlePostMessage(req, res);
  }
  ...
});
```

The MCP handler registrations (`tools/list`, `tools/call`) happen earlier, before `httpServer.listen()`, so that part is fine. The suspicious window is between:

1. Claude issues `GET /sse`, the handler runs, `transport` is assigned and `server.connect(transport)` starts awaiting.
2. Claude's SSE client receives the stream and fires its first `POST /message` (MCP `initialize` or `tools/list`).
3. If step 2 lands before step 1's `await server.connect` resolves, the POST handler finds `transport` non-null but potentially in a half-initialized state — message pump not yet attached, or race on the SDK's internal state.

This pattern is replicated from the attached-mode `mcp-server.ts`, which runs in the daemon's already-warm process. The babysitter is a **cold-booted child** with TS transform (`--experimental-transform-types` forwarded via `execArgv`), dynamic `import('better-sqlite3')` (native module load), and MCP SDK modules all loading for the first time. Cold-boot makes the race window wider than it ever was in the attached path.

Compounding factor: the babysitter launches claude with `--strict-mcp-config`, which tells claude this is the only allowed MCP config. If claude times out or errors on the handshake in strict mode, the behavior may be "record server as returned no tools and proceed" rather than hard-fail — which matches exactly what we observed (session proceeded, zero MCP tools).

## What planning should cover

The fix is probably small, but there are real planning decisions about **what to ship first** and **how to verify a flake**.

1. **Diagnose first, fix second?** The race is plausible but unconfirmed. Options:
   - **a. Diagnostic first.** Add stderr logging in `babysitter.ts` around `server.connect(transport)` (entry/exit timestamps) and every incoming `/sse` / `/message` request. Ship and wait for the next flake — the daemon's foreground terminal will show whether a `POST /message` arrived before `server.connect` resolved. Cheap and conclusive.
   - **b. Fix blind.** Refactor the SSE handler to create+connect the transport before `httpServer.listen()` returns, and ship without waiting for confirmation. Cheaper in calendar time; risks missing the actual root cause if the hypothesis is wrong.
   - **c. Both in sequence.** Ship diagnostic logging now. When the next flake hits (expected within a day or two given observed frequency), land the fix with confidence.
   - Recommendation from the patron's side: **(c)**, but the plan should weigh them.

2. **Structural fix shape.** Assuming the hypothesis is correct, the fix is roughly:
   - Hoist transport creation and `server.connect()` out of the request handler. Either pre-create a transport in `createProxyMcpHttpServer` before `listen()`, or make the first `/sse` GET wait on a "connect completed" promise before handing the response back.
   - Consider whether the attached-mode `mcp-server.ts` needs the same fix (same code shape, lower exposure because the process is warm, but the race window exists there too).
   - Decide whether to keep the "one transport per connection" model (SSE library pattern) or switch to something more deterministic.

3. **Reproducer.** Can we build a tight-loop harness that spawns the babysitter with a dummy tool set and a scripted "claude" that immediately requests `tools/list`, and count how many come back empty? If yes, this gives us a regression test AND an existence proof of the race without waiting for production flakes.

4. **Detection going forward.** Currently we only notice this by reading session transcripts after the fact. Worth thinking about:
   - Should the babysitter log a warning if its MCP server receives zero `tools/list` requests from claude before the session ends? That would catch "claude never successfully handshook" as a first-class signal.
   - Should the Laboratory flag sessions with unexpectedly-short `deferred_tools_delta` arrays (e.g., planner sessions missing `mcp__nexus-guild__*` prefixed tools)?
   - Both are orthogonal to the root-cause fix but would turn silent failures into loud ones. Plan should note them as follow-ups, not bundle them into this commission.

5. **Cross-path consistency.** `packages/plugins/claude-code/src/mcp-server.ts` (attached mode) has the same SSE handler pattern at lines 121-141. The plan should decide whether to fix both or explicitly document why only the babysitter path needs changing.

## Files likely affected

- `packages/plugins/claude-code/src/babysitter.ts` — primary fix location (`createProxyMcpHttpServer`)
- `packages/plugins/claude-code/src/babysitter.test.ts` — add race-window test (and regression test if reproducer pans out)
- Possibly `packages/plugins/claude-code/src/mcp-server.ts` — same pattern, attached-mode exposure
- Possibly `packages/plugins/claude-code/src/mcp-server.test.ts`

## Not in scope

- Tool-set-size variance across sessions (2 vs 4 `mcp__nexus-guild__*` tools) — initially flagged as suspicious, but likely just reflects different rig template tool lists. Plan should not chase this unless the diagnostic logging reveals otherwise.
- The daemon restart itself — this is the trigger that made the race observable (it forced the system into babysitter-spawning mode), but the daemon restart is not the bug. The fix belongs in the babysitter path, not in daemon startup.
- Laboratory detection (mentioned above as follow-up) — separate brief.

## Evidence trail

- Broken session transcript: `~/.claude/projects/-workspace-vibers-tmp-nexus-drafts-nexus-draft-mnseait5-07aee63b/d2c4feea-ea64-4d2a-8720-757cf4b98f25.jsonl`
- Session record: `experiments/data/commissions/w-mnseafoz-1ef8c8a748fc/sessions/ses-mnseaiv7-8ab40c93.yaml`
- Neighboring sessions for comparison: `~/.claude/projects/-workspace-vibers-tmp-nexus-drafts-nexus-draft-{mnsbjlk8,mnsdtzcj,mnsex66b}-*`
- No DLQ entries (`/workspace/vibers/.nexus/dlq/` empty) — confirms babysitter-guild path was healthy.

---

## Summary

Work shipped via writ w-mnsgjhm0-926903a74a6a. This quest exists as a historical record of the design thinking that fed the commission.

## Notes

- 2026-04-10: migrated from scratch file .scratch/babysitter-mcp-handshake-race-brief.md to quest for historical preservation.
- 2026-04-10: marked complete and linked (fulfilled_by) to w-mnsgjhm0-926903a74a6a.