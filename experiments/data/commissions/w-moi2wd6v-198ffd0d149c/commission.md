Three lifted observations point at the same cross-cutting refactor:
- Spider, Clerk, Fabricator, Reckoner each independently implement "kit collision = hard startup error" — extract a framework-wide validator.
- Lattice channel registry uses warn-and-skip while Fabricator throws — collision policy is divergent.
- Clerk link-kinds, Lattice trigger-types, Reckoner sources all validate `{pluginId}.{kebab-suffix}` with re-declared regex — extract a shared helper.

Real cross-cutting design click candidate. DO NOT DISPATCH; have Sean review the design surface first.