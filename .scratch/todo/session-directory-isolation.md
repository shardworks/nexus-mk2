# Session Directory Isolation

**Status:** Parked — findings complete, no change shipped yet  
**Date:** 2026-04-07  
**Session:** 54f055db-ed26-4f89-963e-93bf6118dedf

## The Incident

Commission `w-mnonwi2y` (block-checker-failure-signal) contaminated Sean's personal `/workspace/nexus/` clone. The revise session's Haiku subagent ran `find /workspace -type d -name spider`, discovered three copies of the spider codebase (correct worktree, stale worktree from an old commission, and Sean's clone), chose the shortest path (`/workspace/nexus/`), and the main revise session followed those paths — reading from and ultimately committing to Sean's clone instead of its worktree.

**Root cause:** The claude-code provider uses `--dangerously-skip-permissions`, which bypasses all permission checks including directory scoping. The agent had unrestricted filesystem access.

### Forensic Evidence

The full chain, traced through Claude session transcripts at `~/.claude/projects/-workspace-vibers--nexus-worktrees-nexus-draft-mnonwlxn-1eb403c0/`:

1. **Subagent** (session `88e64036`, line 25): `find /workspace -type d -name spider 2>/dev/null | head -5`
2. **Subagent** (line 26): Result returned three paths including `/workspace/nexus/packages/plugins/spider`
3. **Subagent** (line 28+): Read all spider source files from `/workspace/nexus/...` instead of the worktree
4. **Subagent** (line 58): Summary reported file locations as `/workspace/nexus/...`
5. **Main session** (line 6): Received subagent summary with `/workspace/nexus/` paths
6. **Main session** (line 190): `cd /workspace/nexus && git status`
7. **Main session** (line 192): `cd /workspace/nexus && git add ... && git commit`

The build session (`1b53ef30`) used relative paths and committed correctly to the worktree. Only the revise session (`88e64036`) escaped.

### Resolution of the Divergence

Local nexus repo was reset to `origin/main` and the oculus architecture doc cherry-picked back on top (commit `2f1cbd2`). The earlier build-session commit (`6d9ee37`) was discarded in favor of the sealed revise-session commit (`f1864a1`).

---

## Option B: Permission Flag Hardening

Replace `--dangerously-skip-permissions` with `--permission-mode auto` plus selective `--allowedTools`.

### Proposed Flag Set

```typescript
// In packages/plugins/claude-code/src/index.ts, line 54-58
const args: string[] = [
  '--setting-sources', 'user',
  '--permission-mode', 'auto',
  '--allowedTools', 'Edit Write Bash(git:*) Bash(pnpm:*) Bash(npm:*) Bash(npx:*) Bash(node:*) Bash(tsc:*)',
  '--model', config.model,
];
```

For MCP tools (guild tools served via the in-process MCP server), add to allowedTools if auto mode blocks them:
```
mcp__nexus-guild__writ-show mcp__nexus-guild__writ-complete mcp__nexus-guild__tools-list mcp__nexus-guild__codex-list
```
(MCP tool naming convention confirmed from transcripts: `mcp__nexus-guild__<tool-name>`)

### Empirical Test Results (2026-04-07)

All tests run from `/tmp/coco-test/` (an isolated temp directory) with `--print` mode.

#### `--permission-mode auto` (no `--allowedTools`)

| Operation | Result |
|---|---|
| Read file in cwd | Approved |
| Write file in cwd | **Blocked** (asks for permission, dead end in --print) |
| Edit file in cwd | **Blocked** (asks for permission) |
| `echo`, `cat`, `ls`, `grep`, `wc` in cwd | Approved |
| `mkdir`, `rm` in cwd | **Blocked** |
| `git status` in cwd | Approved |
| `git add && git commit` in cwd | **Blocked** |
| `npm --version` | **Blocked** |
| `find /workspace` (escape) | **Blocked** — "outside the allowed working directory" |
| Read `/workspace/nexus/...` (escape) | **Blocked** — "I don't have permission" |

**Assessment:** Auto mode has good directory scoping but is too restrictive for autonomous dev work. Blocks all file writes and many Bash commands even within the cwd.

#### `--permission-mode auto` + `--allowedTools "Edit Write Bash(git:*) Bash(pnpm:*) ..."`

| Operation | Result |
|---|---|
| Write file in cwd | Approved (via allowedTools) |
| Edit file in cwd | Approved (via allowedTools) |
| `git add && git commit` in cwd | Approved (via Bash(git:*)) |
| `pnpm build` / `pnpm test` | Approved (via Bash(pnpm:*)) |
| `npm --version` | Approved (via Bash(npm:*)) |
| `mkdir -p src` in cwd | **Blocked** — `Bash(mkdir:*)` not recognized |
| `rm -f file` in cwd | **Blocked** — `Bash(rm:*)` not recognized |
| `find /workspace` (escape) | **Blocked** |
| Read `/workspace/nexus/...` (escape) | **Blocked** |
| Write `/workspace/nexus/...` (escape) | **Escapes** — allowedTools bypasses directory scope |
| `cd /workspace/nexus && git status` (escape) | **Non-deterministic** — sometimes blocked, sometimes allowed |
| `cd /workspace/nexus && git add` (escape) | **Blocked** (in tests, but classifier is non-deterministic) |

#### `--allowedTools` behavior — key findings

- `--allowedTools "Bash"` or `--allowedTools "Bash(*)"` = **full bypass** of all Bash restrictions including directory scoping.
- `--allowedTools "Bash(git:*)"` = pre-approves git commands, **auto-mode directory scoping still applies** (but non-deterministically for compound `cd + git` commands).
- `--allowedTools "Bash(mkdir:*)"`, `Bash(rm:*)`, etc. = **not recognized**. Only a handful of command prefixes work: `git`, `pnpm`, `npm`, `npx`, `node`, `tsc`, `sed`.
- `--allowedTools "Edit"` or `"Write"` = pre-approves the tool **with no directory restriction**. Write can create files anywhere on the filesystem.
- `--allowedTools "Read"` = pre-approves Read **with no directory restriction**. Breaks containment.

#### `--permission-mode acceptEdits` (alternative)

| Operation | Result |
|---|---|
| Write in cwd | Approved (auto) |
| Write escape | **Blocked** — asks for permission |
| Read in cwd | Approved |
| Read escape | **Blocked** |
| Bash in cwd (basic) | Approved |
| Bash escape (`find /workspace`) | **Blocked** |
| `Bash(git:*)` + `cd /workspace/nexus && git status` | **Escapes** — acceptEdits has no classifier for Bash args |

**Assessment:** acceptEdits has clean Write/Edit scoping (in-cwd approved, out-of-cwd blocked) but no classifier to catch Bash(git:*) commands that cd to other repos. Opposite strength/weakness profile from auto mode.

### Overall Assessment of Option B

**What it prevents:** The specific incident chain (Bash discovery → Read context → Bash commit in wrong repo). The auto-mode classifier blocks `find /workspace` and Read on external paths, cutting off the discovery path.

**What it doesn't prevent:**
1. **Write/Edit escape** — allowedTools bypasses directory scope. Agent can write to any path it knows about. Low practical risk since discovery is blocked, but not zero.
2. **Non-deterministic Bash scoping** — the auto-mode classifier is AI-powered. Same command may be approved or denied on different runs. Not a deterministic security boundary.
3. **`mkdir`/`rm` via Bash** — blocked in cwd because the Bash scope pattern isn't recognized for these commands. Agent must use Write tool (which auto-creates parent dirs) as a workaround.
4. **Read-only git escape** — `cd /workspace/nexus && git log` sometimes passes the classifier. Information leakage, not contamination.

**Verdict:** A probabilistic fence, not a wall. Significantly better than the current `--dangerously-skip-permissions` (which is no fence at all), but doesn't achieve "full autonomy in this directory, zero access outside it."

---

## Option A: Container Isolation

Run each `claude` session inside a Docker container (or similar) with only the worktree mounted.

### What It Achieves

Deterministic directory isolation. The agent literally cannot see `/workspace/nexus/` because it doesn't exist in the container's filesystem. No classifier, no flag gymnastics, no edge cases.

### What It Requires

1. **Docker image** with `claude` CLI + Node.js + pnpm + git
2. **Mount strategy** — mount the worktree as the container's working directory
3. **API credential forwarding** — `ANTHROPIC_API_KEY` (or OAuth) must reach the container
4. **SSH key forwarding** — git push needs SSH access to GitHub (though the seal engine pushes from the bare clone on the host, not from the session container — verify this)
5. **MCP server bridging** — the MCP HTTP server runs in the host Nexus process. The container needs network access to `127.0.0.1:<port>`. May need host networking or explicit port forwarding.
6. **Build/test dependencies** — the container needs the same toolchain the worktree expects (Node version, pnpm version, etc.)

### Complexity Estimate

8–10. The container image and mount logic aren't hard individually, but the credential/MCP/network bridging has a lot of integration surface. Testing requires running actual commissions through the containerized pipeline.

### Key Design Question

Does `--dangerously-skip-permissions` stay inside the container? If the container IS the sandbox, then full permission bypass inside it is fine — the container boundary provides the isolation that the permission system can't.

---

## Recommendation

**Don't ship Option B alone.** The non-deterministic classifier and the Write/Edit escape gap mean it's not a reliable boundary. It would prevent the specific incident we had, but it's patching a symptom.

**Ship Option A (containers) as the real fix.** It's the only way to get deterministic "full autonomy in this directory, nothing outside it" semantics. Inside the container, keep `--dangerously-skip-permissions` — the container IS the sandbox.

**If we want a quick interim hardening** while building containers: Option B's flag change is a one-line diff that makes escape significantly harder. Worth considering as a stopgap, but not as the final answer.

---

## Related

- `codex-boundaries-and-agent-permissions.md` — earlier thinking on agent permission models
- Commission `w-mnonwi2y` — the incident commission
- Git reflog in `/workspace/nexus/` — forensic evidence of the contamination
