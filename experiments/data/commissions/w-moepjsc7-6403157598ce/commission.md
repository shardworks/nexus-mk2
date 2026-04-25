Independent of the `nexus-clockworks` corrections, the plugin/apparatus example block at `docs/architecture/plugins.md` lines 105-132 (the `clockworksApi` apparatus declaration) and the analogous block at L138-152 use stale `nexus-stacks` plugin-id strings:

- L114: `requires: ["nexus-stacks"]`
- L123: `guild().apparatus<StacksApi>("nexus-stacks")`
- L147: `requires: ["nexus-stacks"]`

Per current convention these should be `"stacks"`. They sit outside the `nexus-clockworks` edit zone of the present commission (covered by S3 only if patron expands scope to all stale ids in the file), but they have the same defect. Same applies to L537 (`"nexus-spider"`), L539 (`"nexus-stacks"`) in the plugins-array example.

Fix: do a sweep of `docs/architecture/plugins.md` replacing every `nexus-(stacks|spider|sessions|ledger|...)` plugin-id string with the short derived id, taking care to preserve `import ... from "..."` package-name strings (those would become `@shardworks/<name>-apparatus`).

Worth a small follow-up commission once the `nexus-clockworks` fix lands.