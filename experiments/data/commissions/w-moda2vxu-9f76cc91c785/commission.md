`packages/plugins/animator/README.md` and `docs/architecture/apparatus/animator.md` both describe the pre-fixup shape:

- `packages/plugins/animator/README.md:213-229` documents `rateLimitBackoff: {initialMs, maxMs, factor}` — drifts after D9.
- `packages/plugins/animator/README.md:270` declares `source: 'ndjson-result' | 'stderr-pattern' | 'exit-code'` — drifts after D5+D6.
- `packages/plugins/animator/README.md:312` describes the `state` book as heartbeat-only — drifts after D1.
- `docs/architecture/apparatus/animator.md:454` describes the three-branch cascade — drifts after D5.
- `docs/architecture/apparatus/animator.md:462-477` describes the dedicated `status` book at id `'current'` — drifts after D1.
- `docs/architecture/apparatus/animator.md:499-513` documents the old config key — drifts after D9.

The implementer should update both documents in the same commits that land the corresponding code decisions so the repo never has a moment where docs and code disagree more than they do today.