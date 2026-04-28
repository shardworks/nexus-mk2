`packages/framework/cli/src/program.ts` `buildToolCommand` has accumulated five lifted observations:
- No clean path for non-throw nonzero exit (e.g. `nsg clock tick` with status: error)
- Cannot promote optional positionals (`[id]` shape)
- Zod record/object/JSON schemas degrade ("pass raw string, let Zod reject")
- No caller context in the tool handler contract (animas needing to know "who called me" hand-roll an explicit param)
- Auto-grouping has no namespace-level help text customization

DO NOT DISPATCH — gather one more observation cycle, then propose v2 as a single design.