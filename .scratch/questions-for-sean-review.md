# Questions for Sean — Review Queue

## `--print` mode for commissioned sessions

**Context:** The summon handler launches commissioned anima sessions using `claude --print`, which gives the anima a single-shot, non-interactive session with the commission spec as the prompt. This is the simplest starting point and matches the "autonomous, non-interactive" intent.

**Concern:** This might be too restrictive for complex commissions. A multi-turn approach (e.g., `--input-format stream-json` or piping to an interactive session) could let the anima iterate, but adds complexity.

**Status:** Monitor and evaluate once we run real commissions. If animas consistently fail to complete work in a single turn, revisit.

## Circular dependency: summon handler callback pattern

**Context:** The Clockworks runner lives in `nexus-core`. The session launcher (manifest + MCP config + spawn claude) lives in the CLI package. Core can't depend on CLI (circular), and core shouldn't depend on engine-manifest (core is lower-level than engines).

**Solution implemented:** Core defines a `registerSummonHandler()` slot — a callback that the CLI fills at startup in `program.ts`. When the Clockworks runner hits a `summon:` standing order, it calls the registered handler. If no handler is registered (e.g., core used as a library without the CLI), summon orders are recorded in the audit trail but skipped — no crash, no missing dependency.

```
Dependency graph:
  cli → core       ✅ (normal)
  cli → manifest   ✅ (normal)
  core → cli       ❌ (would be circular)
  core → manifest  ❌ (core is lower-level)
```

**Why this matters:** This is dependency inversion — core defines the contract, CLI provides the implementation. It's clean but adds indirection. The alternative would be moving the entire clockworks runner into the CLI package, but then engines like `workshop-prepare` couldn't signal events through core without also depending on the CLI.

**Question for review:** Is this the right boundary? Should session launching eventually move into its own package (e.g., `engine-session-launcher`) that both core and CLI could depend on? Or is the callback pattern the right long-term shape?
