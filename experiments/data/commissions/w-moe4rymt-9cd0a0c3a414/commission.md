Decision D16 has `nsg clock run` and `nsg clock tick` print a warning when the daemon is running. For interactive operators this is helpful. For CI / scripted use — e.g. a test harness that explicitly drains the queue from a non-daemon process — the warning is noise on stderr.

A future enhancement: suppress the warning when stderr is not a TTY, or expose a `--quiet` flag. Out of scope for this commission; the brief mandates the warning unconditionally.

Tactical detail: precedent in other CLI tools is to detect TTY via `process.stderr.isTTY` and gate ANSI/color/warning output accordingly. The clockworks CLI does not do TTY detection today. If observed in real friction, a single helper would address several similar future concerns.