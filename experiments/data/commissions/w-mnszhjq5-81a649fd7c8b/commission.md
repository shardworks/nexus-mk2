_Imported from `.scratch/todo/todo-setting-sources-user.md` (2026-04-10)._

## Goal

Decide whether to relax the `--setting-sources user` flag the claude-code session provider passes when spawning animas. Removing it would let animas working in codex worktrees automatically pick up the codex's `.claude/CLAUDE.md`, giving per-codex orientation without piping it through the Loom's system prompt — a possible complement to the curriculum system rather than a replacement.

## Status

Parked. Research question, not a shipping decision yet.

## Next Steps

Answer the four questions below before committing to a change. Start with "why was `--setting-sources user` added originally?" — the git blame on `packages/plugins/claude-code/src/index.ts:56` should reveal whether it was intentional isolation or a safe default. If safe-default, the relaxation is low-risk. If intentional isolation, understand what it was protecting against before reversing.

## Context

The claude-code session provider passes `--setting-sources user` when spawning animas (see `packages/plugins/claude-code/src/index.ts` line 56). This skips project-level CLAUDE.md auto-discovery — animas don't pick up any `.claude/CLAUDE.md` from the directory they're running in.

**Why it matters.** If we relax this, animas working in codex worktrees would automatically pick up the codex's `.claude/CLAUDE.md` — giving per-codex orientation without needing to pipe it through the Loom's system prompt. This could complement the curriculum system rather than replace it.

**Questions to answer:**

- Why was `--setting-sources user` added originally? Intentional isolation, or safe default?
- What would break if we removed it? Would animas pick up unwanted project-level settings?
- Is there a middle ground — `--setting-sources user,project`, or `--add-dir` for the worktree's `.claude/`?
- How does this interact with the Loom's charter/role/curriculum layers? Complementary or conflicting?

**Origin context.** Came up during the plan pipeline path fix (2026-04-04). Plan agents intentionally don't use `--setting-sources user`, so they get CLAUDE.md auto-discovery. Sean wants to explore doing the same for animas.

**Why this is a child of T6.** Per-codex `.claude/CLAUDE.md` is one of the candidate mechanisms for codex boundary awareness — if animas auto-pick-up the codex's CLAUDE.md, that's a natural place for "you are working inside codex X; don't reach into other codexes" instructions.

## References

- Parent quest: T6 (`codex-boundaries-and-agent-permissions`)
- Source doc: `.scratch/todo/todo-setting-sources-user.md`
- Code path: `/workspace/nexus/packages/plugins/claude-code/src/index.ts` line 56
- Origin context: plan pipeline path fix (2026-04-04)

## Notes

- 2026-04-10: opened as child of T6.