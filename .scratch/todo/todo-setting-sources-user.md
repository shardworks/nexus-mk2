# Research: `--setting-sources user` on guild-side animas

The claude-code session provider passes `--setting-sources user` when spawning animas (see `packages/plugins/claude-code/src/index.ts` line 56). This skips project-level CLAUDE.md auto-discovery.

**Why it matters:** If we relax this, animas working in codex worktrees would automatically pick up the codex's `.claude/CLAUDE.md` — giving per-codex orientation without needing to pipe it through the Loom's system prompt. This could complement the curriculum system rather than replace it.

**Questions to answer:**
- Why was `--setting-sources user` added originally? Was it intentional isolation, or just a safe default?
- What would break if we removed it? Would animas pick up unwanted project-level settings?
- Is there a middle ground — e.g., `--setting-sources user,project` or `--add-dir` for the worktree's `.claude/`?
- How does this interact with the Loom's charter/role/curriculum layers? Complementary or conflicting?

**Context:** Came up during the plan pipeline path fix (2026-04-04). Plan agents intentionally don't use `--setting-sources user`, so they get CLAUDE.md auto-discovery. Sean wants to explore doing the same for animas.
