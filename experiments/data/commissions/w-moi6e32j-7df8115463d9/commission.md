`nsg commission-post --draft --title ... --body ...` does not require `--codex`. The created writ then enters the queue with `codex: null`, and Spider's `plan-init` engine throws fatally:

```
Engine "plan-init" failed: Writ "<writId>" has no codex — cannot create a plan.
```

This caused six draft sweep writs to fail dispatch in a single session before the issue was diagnosed, requiring a DB patch to repair them.

## Goal

When a commission is posted without an explicit codex, the system should:

- **In a guild with exactly one registered codex** — default the writ's codex to that single codex automatically. No operator action needed.
- **In a guild with two or more registered codexes** — fail loud at post time with a message like `commission-post: --codex is required when the guild has multiple codexes (registered: nexus, vibers)`. Do not create a writ that will inevitably fail at plan-init.
- **In a guild with zero registered codexes** — fail loud at post time with a message naming the gap (e.g. `no codexes are registered; install a codex package or declare one in guild.json before posting commissions`).

## Where to put the logic — planner's decision

Three plausible layers, each a different scope. Pick one and document the reasoning:

1. **CLI / commission-post handler.** Resolve before calling the underlying API. Pro: keeps the API contract honest (`codex` is required at the API layer, the CLI just helps you fill it in). Con: every other entry point (Oculus dashboard "post commission" form, future MCP tool, programmatic callers) has to re-implement the same defaulting logic.
2. **Clerk / `clerk.post`.** Default-or-throw inside the API itself. Pro: every caller benefits automatically. Con: the API now has a behavior that depends on guild state (codex registry contents), which can surprise testers and may interact poorly with the writ-type registry's startup window.
3. **Spider / `plan-init` engine.** Catch the missing codex earlier in the engine and try to default. Pro: closest to where the failure currently surfaces. Con: probably the wrong layer — by the time the engine runs, the writ exists and has been published. Defaulting at execution time creates a bookkeeping mismatch.

The planner should weigh these and pick the layer that best matches the framework's existing patterns. Defaulting probably belongs at one of the upper two layers, not inside the engine.

## Acceptance signal

- `nsg commission-post --title ... --body ...` (no `--codex`) in a single-codex guild succeeds and the resulting writ has the correct `codex` set.
- `nsg commission-post ...` (no `--codex`) in a multi-codex guild fails fast at post time with a clear error naming the registered codexes.
- The Oculus "post commission" form (or any other entry point) inherits the same behavior — the chosen layer should not require touching every entry point separately.
- Tests cover: single-codex default-success, multi-codex throw, zero-codex throw.

## What NOT to do

- Do not change `clerk.post`'s API surface to make `codex` optional in the type — it should remain required at the API layer; defaulting happens at a layer above.
- Do not touch `plan-init` to "tolerate" missing codexes by inventing one — that masks the bug class instead of fixing it.

## Out of scope

- Multi-codex commission handling beyond "throw if ambiguous" — full multi-codex selection UX is its own future commission.
- Oculus form rework beyond ensuring the chosen layer covers it.