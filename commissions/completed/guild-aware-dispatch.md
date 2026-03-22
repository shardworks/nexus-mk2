# Commission: Guild-Aware Dispatch

## Repository

https://github.com/shardworks/41fb92f2-30e1-4c42-8cfb-eb1a6b85a680

## What I Need

When I post a commission, the guild should act on it immediately — look up the right anima on the roster, load their identity and instructions, and dispatch them to do the work. No separate "send" step. Post it, and the guild handles it.

The dispatched anima must know who they are. They're not a generic agent — they're a named guild member undertaking a commission.

## Requirements

1. **`post` triggers dispatch.** Posting a commission should kick off the guild's dispatch process. The current `send` command is being retired — `post` is now the single entry point.

2. **Dispatch is roster-aware.** The system looks up the appropriate anima on the roster, reads their instructions from the register, and establishes their identity in the agent session before presenting the commission spec.

3. **The commission record tracks who did the work.** `status` should show which anima was dispatched.

4. **Clear errors when the guild can't staff it.** If the needed role isn't on the roster, fail with a helpful message.

5. **The dispatch process should be configurable, not hard-coded.** How the guild routes commissions to members is the guild's business, and it should be able to evolve over time without code changes. Today there's one step (dispatch to the artificer). Tomorrow there might be more.

## How I'll Evaluate

- I will post a commission and verify the guild dispatches it to the right anima without a separate send step.
- I will run `nexus commission status <id>` and see which anima handled it.
- I will change which anima is assigned to a role and verify the next dispatch uses the new anima.
- I will remove the role assignment and verify posting fails helpfully.
