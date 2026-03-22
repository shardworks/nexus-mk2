# Commission: Consult in a Workshop

## Repository

https://github.com/shardworks/41fb92f2-30e1-4c42-8cfb-eb1a6b85a680

## What I Need

When I consult with a guild member (`nexus consult`), they should be standing in a proper workshop — not wherever I happen to be. Right now, consult drops the anima into my current directory, which means they see whatever's around them and get confused about where they are.

I want `consult` to automatically set up a clean workshop context for the conversation. The anima should feel like they're in the guild hall, not the patron's study.

## Requirements

1. **Consult sessions run in a proper workshop.** The anima should be working from a clean clone of the guild's repository, not the patron's current directory.

2. **This should be invisible to the patron.** I just run `nexus consult --role artificer` and talk. The clean room setup happens automatically.

3. **Cleanup after the session ends.** The temporary workspace should be removed when the conversation is over.

4. **No permission prompts.** The interactive session must launch with full permissions bypassed (`--dangerously-skip-permissions`). The anima should never hang waiting for permission approvals that interrupt the conversation.

## Constraints

- The `consult` command already exists. Modify it, don't replace it.
- The `commission post` command already does clean-room setup for dispatched commissions — use the same pattern.
- Commit and push all of your work when done.

## How I'll Evaluate

- I will run `nexus consult --role artificer` from a random directory and verify the anima sees the guild's repository, not my directory.
- I will verify the session is still fully interactive.
- I will verify the temporary workspace is cleaned up after the session ends.
