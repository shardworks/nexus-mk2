<!-- Live body for this quest is a file in the vibers guild. See .claude/skills/quests/SKILL.md. -->
<!-- Do not edit this row body while the quest is live. -->

## Goal

Run every anima session inside its own container with only its worktree mounted, so sessions get both (a) a deterministic filesystem boundary — an agent literally cannot see sibling worktrees, the sanctum, or other codexes — and (b) collision-free parallel execution, since independent rigs live in independent filesystems and cannot stomp on each other's work. Deliverables: a Docker image with the full anima toolchain, a mount strategy that hands each session its worktree as working directory, credential and MCP bridging from host to container, and a session lifecycle that builds/runs/cleans up containers in step with the existing detached-session plumbing.