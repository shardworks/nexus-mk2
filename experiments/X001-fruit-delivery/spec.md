---
status: complete
completedAt: 2026-03-20
relatedCommissions:
  - nexus-cli
---

# X001 — Fruit Delivery

## The Goal

Agents build something in a system repo. Sean can run it on his machine without touching their code.

## Why This Is First

Every fruit the factory produces has to cross the boundary — from the system's repos to Sean's hands. If there's no delivery mechanism, nothing is touchable, and "if you can't touch it, it doesn't exist." This is the pipe that all future fruits travel through.

## What "Done" Looks Like

Sean runs a one-liner and gets a working tool on his machine. The tool was built by agents in a system repo. Sean didn't clone that repo, read its code, or participate in its build process.

The delivered artifact must do something that requires real computation — not just echo a string. It should be a small but genuine program (e.g., a utility that processes input and produces output).

## Requirements

- **One-line execution.** Sean can run the tool with a single command. The agent decides the delivery mechanism.
- **Documentation.** The repo includes a README (or equivalent) that tells Sean exactly how to execute it.
- **Real computation.** The output must demonstrate that actual code was written and is running.

## Setup

- A repo will be pre-provisioned for the agent to build in.
- The agent decides everything else: language, tooling, delivery mechanism, what the tool actually does.

## Internal Notes (not for the agent)

Possible delivery mechanisms we've considered — for our own reference, not to be prescribed:

1. GitHub release + curl
2. npx from GitHub repo
3. npm publish
4. Docker image
