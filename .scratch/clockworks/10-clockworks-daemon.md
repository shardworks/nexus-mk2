# Clockworks daemon — `nsg clock start/stop/status`

## Intent

Ship the background daemon that polls the events book at a configurable interval and processes events automatically. Three subcommands under the `nsg clock` namespace: `start`, `stop`, `status`. The daemon spawns as a detached child process with a PID file, a log file, and a registered session provider so the summon relay can dispatch anima sessions without an operator in the loop. This is the architecture doc's "Phase 2" — the system is trusted enough to run unattended.

## Motivation

The manual CLI (task 6) requires a human to run `nsg clock run` whenever events need processing. That's fine for bring-up but fails the "living system" premise — the Clockworks is supposed to be the guild's nervous system, reacting to events as they happen. The daemon is the piece that closes that loop.

Landing the daemon *after* error handling (task 9) means when unattended processing hits a failure, it emits `standing-order.failed` events the guild can route however it wants, rather than swallowing errors silently in the background.

## Non-negotiable decisions

### `nsg clock start [--interval <ms>]`

Spawns the daemon as a detached child process. The daemon:

- Polls the events book every `interval` milliseconds (default 2000ms).
- Calls the same dispatcher function the manual CLI (task 6) uses.
- Registers the session provider at startup so the summon relay (task 5) can dispatch anima sessions autonomously — a key difference from the manual flow, where the operator's shell owns the session provider.
- Writes a PID file at `<home>/.nexus/clock.pid` on startup; deletes it on clean shutdown.
- Appends to a log file at `<home>/.nexus/clock.log`. Only event-processing cycles are logged; idle polls (empty queue) are silent.

If a PID file already exists and the named PID is alive, `start` refuses with a message and exits nonzero.

### `nsg clock stop`

Reads the PID file, sends SIGTERM to the daemon, waits briefly for clean shutdown (short bounded wait — implementer picks a reasonable value), then deletes the PID file. If no PID file exists, print a message and exit zero (nothing to stop). If the PID file exists but the process is dead, clean up the stale PID file and exit zero.

### `nsg clock status`

Prints daemon state: running vs not, PID, uptime (wall-clock since PID file creation), and the log file path. If not running but a stale PID file exists, report that separately.

### Core API surface

Expose `clockStart(home, options?)`, `clockStop(home)`, `clockStatus(home)` as pure functions on the Clockworks apparatus's public API. The CLI subcommands thin-wrap these so programmatic consumers (tests, orchestration scripts) can drive the daemon without shelling out.

### `clock-status` MCP tool

Per the architecture doc: expose daemon status to animas as an MCP tool. An anima can check whether the daemon is running via the same substrate it uses for other apparatus-introspection tools. Reads the same data as `nsg clock status`.

### Phase 1 commands coexist with the daemon

The manual CLI (`list`, `tick`, `run`) from task 6 continues to work while the daemon is running. If the daemon is running, `tick` and `run` print a warning but still execute — SQLite handles concurrent access safely, per the architecture doc's guidance.

### Idle polls are silent; event processing is always logged

The log file captures every dispatch (success and failure) with event id, relay name, duration, status. It does not log "polled, nothing to do" — otherwise the log balloons with noise. Failures land in the log as well as in the `event_dispatches` table and the `standing-order.failed` event.

## Out of scope

- **Log rotation.** The architecture doc lists this as a Phase 2 enhancement, deferred. Append-only; operator can rotate manually if needed.
- **External event injection** (webhooks, file watchers). Listed as deferred in the architecture doc.
- **Concurrent processing** — the daemon processes events sequentially per the dispatcher's contract. Multi-process or thread-pool concurrency is a later concern.
- **Cron / scheduled standing orders.** Task 11 composes cron on top of the daemon.
- **Crash recovery with partial-dispatch state.** If the daemon crashes mid-event, restart reprocesses the whole event (per task 4's checkpointing contract). Per-handler checkpointing is a later concern.
- **Health endpoints.** `nsg clock status` is the observability surface; no HTTP listener, no Prometheus metrics.

## Behavioral cases the design depends on

- `nsg clock start` spawns a detached daemon; `nsg clock status` reports it running with a PID and uptime.
- The daemon processes events within one poll-interval of their emission (for default 2000ms, within ~2 seconds).
- `nsg clock stop` sends SIGTERM; the daemon exits within its clean-shutdown window and the PID file is removed.
- `nsg clock start` called when a daemon is already running exits nonzero with a message; does not spawn a second instance.
- Running `nsg clock run` while the daemon is running prints a warning but still executes; no data corruption.
- An anima calling the `clock-status` MCP tool receives the same status as `nsg clock status`.
- A summon relay invoked from the daemon (unattended) launches an anima session using the daemon-registered session provider.
- A relay throwing inside the daemon emits `standing-order.failed` (per task 9); the daemon does not crash.
- A stale PID file (daemon killed uncleanly) is cleaned up by the next `nsg clock start` or `nsg clock stop` without manual intervention.

## References

- `docs/architecture/clockworks.md` — Phase 2 — daemon section
- `c-mo1mql8a` — Clockworks MVP timer apparatus
