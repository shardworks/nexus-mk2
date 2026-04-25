Three signal-handling sites currently exist in the framework:

- `packages/framework/cli/src/commands/start.ts:286-287` — guild daemon, registers SIGTERM/SIGINT.
- `packages/plugins/clockworks/src/daemon.ts:486-491` — clockworks daemon, registers SIGTERM/SIGINT.
- `packages/plugins/oculus/src/oculus.ts:752-760` — `oculus` tool foreground mode, registers SIGINT/SIGTERM only to call `api.stopServer()`.

The oculus tool's signal handler is a vestige from before the apparatus owned the server lifecycle; once `stop()` is wired through `shutdown()` (S2), the oculus tool's foreground mode could trust the daemon teardown path or, when run standalone, could call `guildInstance.shutdown()` instead of bypassing it. Worth a once-over to remove drift.