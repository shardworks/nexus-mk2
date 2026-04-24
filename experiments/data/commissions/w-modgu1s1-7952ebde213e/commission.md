The `Apparatus` interface in `packages/framework/core/src/plugin.ts:138` declares `stop?: () => void | Promise<void>`, and two apparatus (stacks, oculus) implement it. A grep across `packages/framework` for `.stop(` finds no invocation site — Arbor's `createGuild()` only calls `start()` in dependency order; there is no symmetric shutdown path. Processes rely on OS-level teardown (process exit closes sqlite file handles, etc.), which works but leaks the abstraction.

Implications:
- The brief's behavioral case 'Stopping the guild cleanly shuts down the apparatus; no lingering handles' is not testable today because there is no API for stopping the guild.
- Apparatus `stop()` methods are load-bearing in aspiration only; any task relying on them must build its own teardown.

Fix requires an Arbor change (new `guildInstance.shutdown()` path invoking `stop()` in reverse topo order) plus wiring `nsg stop` to call it. Out of scope for the Clockworks skeleton but worth landing before any apparatus needs real teardown (task 10's daemon is the forcing function).