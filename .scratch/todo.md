# Scratch TODO

## Urgent

- **Worktree engine: which repo?** Commission worktrees are currently created from the guildhall bare repo, but commissions target a *workshop* repo (the actual codebase). The worktree engine needs a project/workshop repo path, not just NEXUS_HOME. The guildhall bare repo is for guild infrastructure; workshop repos are where animas do real work.

## Design

- **Dispatch: workshop auto-selection.** Currently `--workshop` is required. For single-workshop guilds this is clunky. Consider auto-selecting when there's only one workshop, or defaulting based on context.

- Commission CLI: consider an `amend` command (`nexus commission amend <id> <amendment-file>`) — append amendments to a posted commission without recreating it. Carries forward the amendment pattern.
- Commission dispatch: capture session logs (session.jsonl) somewhere durable — currently lost when tmpdir is cleaned up. Needed for cost tracking, debugging, and experiment data.
- Generic ability to plugin "agents" (spirits?) into commissions (basically hooks)
