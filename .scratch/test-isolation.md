# Commission: Test Isolation & Data Safety

## Repository

https://github.com/shardworks/41fb92f2-30e1-4c42-8cfb-eb1a6b85a680

## What's Broken

When guild members run end-to-end tests during a commission, they create real animas and roster entries in the shared `~/.nexus/` store. We've already lost a guild member to an overzealous `rm -f *.json` that was meant to clean up test entries but wiped production data.

Agents working on this repository legitimately need access to guild data — they're building and testing the CLI that manages it. Full isolation would break that. But there's nothing protecting the guild from careless test cleanup.

## What I Need

Two things:

1. **A `NEXUS_HOME` environment variable.** If set, the CLI uses that directory instead of `~/.nexus/` for all data (register, roster, commissions, config — everything). This gives agents a tool for isolating their tests: run tests against `NEXUS_HOME=/tmp/test-whatever` and the real guild data is untouched. Without `NEXUS_HOME` set, everything works as before.

2. **Backup before dispatch.** Before the guild spawns an agent to work on a commission, it should snapshot `~/.nexus/` to a backup location. If an agent damages guild data, recovery is trivial. The backup doesn't need to be fancy — a timestamped copy is fine.
