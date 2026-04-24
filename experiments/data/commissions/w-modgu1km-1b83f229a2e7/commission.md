`packages/framework/core/src/nexus-home.ts:37-45` exports `clockPidPath(home)` → `<home>/.nexus/clock.pid` and `clockLogPath(home)` → `<home>/.nexus/clock.log`, both re-exported from the package barrel at `index.ts:42`. No code reads these helpers today. They're declared for the future Phase 2 daemon (task 10).

Consider moving them into `@shardworks/clockworks-apparatus/src/nexus-home.ts` (or similar) when the daemon code lands in task 10 — the path helpers are part of the daemon's public surface, same ownership logic as `clockPidPath` belonging to the Clockworks apparatus package. Keeps nexus-core lean and keeps all Clockworks-shaped surface on one package.

Do NOT move them in this commission — there's no caller yet and the paths are 'declaration only.' Log as follow-up tied to task 10.