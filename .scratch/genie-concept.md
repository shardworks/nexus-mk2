# The Genie — Concept Note

## Problem

Agents self-limit to what's available in their sandbox. When the real solution requires something outside the walls — credentials, subscriptions, infrastructure, hardware — they route around the gap with degenerate workarounds instead of asking for what they actually need.

## Idea

Provide a "magic genie" mechanism: a way for agents to request *anything* from the human operator. The genie is Sean — the one actor who can reach outside the system.

Examples of things agents might request:
- Credentials to external systems they know about but can't self-register for
- Subscriptions to services that require human input (credit cards, identity verification)
- Additional VMs or compute resources
- New hardware
- API keys, tokens, access grants
- Anything else outside the sandbox walls

## Key Properties

- **Pull, not push.** The human doesn't try to anticipate needs. Agents identify their own gaps.
- **Unconstrained scope.** The whole point is that agents can ask for *anything*, not just items from a predefined menu.
- **Human-in-the-loop by design.** The genie is explicitly a human role — this isn't about automation, it's about unlocking agent ambition.

## Status

Concept captured. To be incorporated early in system design — likely as part of the agent-to-human communication channel.
