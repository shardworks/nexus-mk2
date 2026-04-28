**The gap.** The brief explicitly out-of-scopes multi-vision orchestration ('Single-vision flow is the v0 scope; multi-product/multi-vision orchestration follows'). Vision-keeper supports the *labels* surface for multi-instance discrimination (D8), but offers no opinion on:

- How an operator declares which visions are tracked.
- Whether the keeper handles vision-creation (a new visionId arrives with no prior outstanding) versus vision-retirement (a visionId stops having drift to report).
- Whether multiple vision-keeper apparatuses (one per product) coexist under one source-id (the contract suggests yes; the framework gives one apparatus per plugin id).
- How patron-tunable per-vision dimension defaults would compose with the keeper's hardcoded presets (D6).

**Why this matters.** When the multi-vision commission lands, it will need vision-keeper's API to support either operator-side per-vision configuration or per-vision keeper handles (factory pattern, considered and rejected at D8). The v0 API design must not paint that future commission into a corner.

**Proposal.** Surface this as an open click before the multi-vision commission starts, so the design conversation happens before vision-keeper's surface congeals. Specifically: should multi-vision orchestration live in a parent apparatus that fans out to per-vision keepers, or inside a single keeper that owns a vision registry, or inside guild.json as a per-vision config block?

**Atomicity.** A research click — not a code commission. Promotes when the multi-vision orchestration commission is drafted.