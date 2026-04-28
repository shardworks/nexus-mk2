**The gap.** Once vision-keeper, Reckoner, and the future Reckoner-CDC-handler all land, an operator that wants to wire the full petitioner stack needs to:

1. Add `@shardworks/clerk-apparatus`, `@shardworks/stacks-apparatus`, `@shardworks/clockworks-apparatus`, `@shardworks/reckoner-apparatus`, `@shardworks/vision-keeper-apparatus` to their guild.json's `plugins` array.
2. Add the vision-keeper-on-decline standing-order entry to `clockworks.standingOrders`.
3. Optionally configure `reckoner.enforceRegistration` and `reckoner.disabledSources`.

There is no in-tree sample bundle showing the full configuration. Each operator reconstructs it from each package's README in turn.

**Proposal.** Ship a `docs/guides/petitioner-stack-onboarding.md` (or a sample-config bundle) showing the canonical full guild.json for the petitioner stack. Vision-keeper is the worked example, so this guide is the sibling artifact — prose for operators rather than typed code for developers.

**Atomicity.** A standalone documentation commission, lifts cleanly when the full petitioner stack is operational (after `w-mohuvpu2`).