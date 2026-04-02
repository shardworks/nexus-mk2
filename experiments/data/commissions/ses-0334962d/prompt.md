# C004 Prompt — Implement Dispatch apparatus

Dispatched: 2026-04-02
Outcome: success (commit 385a159)

---

Implement the Dispatch apparatus as specified in docs/architecture/apparatus/dispatch.md.

This is a small, disposable apparatus — interim rigging that bridges the Clerk and session machinery. One tool, one API method, pure orchestration.

Create the package at packages/plugins/dispatch/ following the same structure as packages/plugins/parlour/:
- package.json (@shardworks/dispatch-apparatus, dependencies: nexus-core, stacks-apparatus, tools-apparatus, zod, plus the apparatus it orchestrates: clerk, codexes, animator, loom)
- src/index.ts (barrel + default export)
- src/types.ts (DispatchApi, DispatchRequest, DispatchResult)
- src/dispatch.ts (apparatus definition: requires stacks/clerk/codexes/animator, recommends loom. Single next() method implementing the full dispatch lifecycle)
- src/tools/dispatch-next.ts (dispatch:write permission, cli-callable)
- src/tools/index.ts
- src/dispatch.test.ts (comprehensive tests)
- README.md per project conventions

Key implementation notes from the spec:
- next() queries Clerk for oldest ready writ (status=ready, ordered by createdAt asc, limit 1)
- Transitions writ ready→active before launching session
- Opens draft on writ.codex via Scriptorium (if codex specified), otherwise uses guild home as cwd
- Assembles prompt from writ title + body using the template in the spec
- Summons anima via Animator.summon() with the role parameter
- On success: seal draft, push, transition writ→completed
- On failure: abandon draft (force), transition writ→failed
- Dispatch owns writ transitions — anima does NOT call writ-complete/writ-fail
- dryRun mode: find and report writ without dispatching
- Return null if no ready writs exist
- No configuration, no state, no books

Reference packages/plugins/parlour/ and packages/plugins/clerk/ for apparatus patterns.

IMPORTANT: Commit your work. Make small, atomic commits as you complete each piece. Do not leave uncommitted files. Run tests before your final commit to ensure everything passes.
