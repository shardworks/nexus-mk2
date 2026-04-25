Decision D5 in this commission's plandoc says `clockStatus` cleans up stale pidfiles as a side effect ('clean-and-report'). That makes `clockStatus` non-idempotent: the first call returns `{ running: false, stalePidfile: true, ... }`; subsequent calls return `{ running: false }` (no stalePidfile flag because the file is gone).

For an anima calling `clock-status` in a polling loop, this means the staleness signal is observed exactly once. If the anima samples the tool slowly, it may miss the staleness signal entirely (if some other process called `clockStop` and cleaned up first).

This is the desired behavior per the brief and the reference doc, but worth documenting that the `stalePidfile` flag is a one-shot signal not a steady-state indicator. Future enhancement: emit a `clockworks.daemon-stale` event when the stale-pidfile cleanup happens, so observability tooling can react.

Tactical detail: out of scope for this commission. Once SOF events are flowing, an analogous daemon-lifecycle event family (`daemon.started`, `daemon.stopped-cleanly`, `daemon.stale-pidfile-cleaned`) would let standing orders observe daemon state without polling.