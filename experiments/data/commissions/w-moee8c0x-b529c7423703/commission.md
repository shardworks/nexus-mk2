`packages/plugins/animator/src/startup.ts:107 cleanupLegacyStatusBook` is a best-effort, idempotent migration that drops the orphan `books_animator_status` SQLite table left behind by installs that ran the Animator before commit 6cb832a relocated the dispatch-status doc into the shared `animator/state` book. The function uses `better-sqlite3` directly because Stacks doesn't expose a drop-table primitive.

This is dead weight for any install that has already run it once, and almost certainly dead weight on every install that came up after commit 6cb832a shipped. Carrying it forever:

- Adds ~70 LOC to `startup.ts` that boots reading on every animator change.
- Pulls a direct `better-sqlite3` import that bypasses the Stacks abstraction (and would block any future move to a non-SQLite backend).
- The boot-time message log (`'[animator] Dropped orphan books_animator_status table (post-rename cleanup).'`) becomes vestigial.

Propose to schedule its removal: either tag it with a TODO citing a target version (e.g. "remove after release X"), or open a follow-up commission to delete it once all known installs are confirmed past 6cb832a. Keep `docs/architecture/detached-sessions.md` clean of any reference to it.