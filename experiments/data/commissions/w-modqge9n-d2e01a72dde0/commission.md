`packages/plugins/reckoner/src/predicates.ts` exports `isTerminalStuck` and `parseChildFailures` — both purely mandate-specific (the cap logic is mandate-stuck-shape; the parse looks for the cascade resolution string format that mandate's children-behavior writes). T4 leaves these unchanged because the brief restricts mandate-specific pulses to mandate.

If/when the future generalization commission lands (per obs-3), `predicates.ts` will need either:
- Per-type predicate files (`predicates/mandate.ts`, `predicates/<type>.ts`)
- A namespace re-organization (`predicates/mandate-stuck.ts`)
- The current names re-imagined as `isMandateTerminalStuck`, `parseMandateChildFailures` to make the mandate-shape explicit

Not actionable today; surfacing so the post-T4 reader doesn't think these predicates are type-agnostic.