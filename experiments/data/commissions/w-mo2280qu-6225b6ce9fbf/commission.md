--BEGIN--
# Manual-merge Recovery Tail for the Sealing Engine

## Intent

When the Spider seal engine cannot fast-forward a draft branch onto its target because of a rebase conflict, it should recover by grafting a two-engine tail — an anima-driven manual merge followed by a retry push — instead of throwing and stranding the rig in `stuck`. One recovery attempt; if it also fails, the rig goes stuck as before.

## Rationale

Today, any concurrent push to a target branch causes seal to seize on rebase conflicts and the rig becomes unrecoverable except by a human spawning a fresh rig. This is increasingly common as crawl concurrency grows, and the work an anima just produced is not actually broken — only the merge needs human-or-LLM judgement. Pushing recovery into a grafted tail keeps the rig alive for one more bounded attempt without changing the rig-stuck contract for cases that genuinely need human intervention.

## Scope & Blast Radius

This change is contained to the Spider plugin and its docs. Apparatus-level scriptorium primitives are unchanged.

- **Spider engines** — the `seal` engine gains a `recover` given (default true) and a catch-and-graft branch for rebase-conflict failures only. A new `manual-merge` quick engine is introduced. Both engines are registered in Spider's `supportKit.engines`.
- **Spider roles** — Spider gains its first loom role, `mender`, with a permissions allowlist and an instructions file. This requires Spider to grow a `loom-roles/` directory and the corresponding registration in `supportKit.roles`. Verify Spider's existing `supportKit` shape and follow Astrolabe's `sage-*` registration pattern for layout.
- **Rig templates that terminate in seal** — every existing template that uses `seal` (Spider's standard mandate template, Astrolabe's two-phase and three-phase planning templates) inherits the new recovery behavior automatically. Verify with grep across the monorepo that no template depends on seal *throwing* as a control-flow signal — it shouldn't, but the audit is mandatory because the change is observable to any consumer that branched on seal failure.
- **`abandon: true` callers** — planning templates pass `abandon: true` to seal. The recovery branch must NOT engage on abandon — abandon failures continue to throw exactly as today.
- **Failure-mode discrimination** — only failures matching scriptorium's rebase-conflict throw (the `Sealing seized:` message family) trigger recovery. All other seal failures (auth, network, missing branch, abandon errors) re-throw unchanged. Verify scriptorium's seal throw site has exactly one rebase-conflict signature; if multiple, the discriminator must cover all of them.
- **Docs** — `docs/architecture/apparatus/spider.md` and `docs/architecture/apparatus/scriptorium.md` both currently describe sealing failure as terminal-for-the-rig. Both need updating to describe the engine-level recovery path while preserving the apparatus-level invariant that scriptorium's `seal()` itself still throws.
- **Tests** — Spider's behavioral test suite gains a regression test exercising the full recovery path.

## Decisions

| #   | Decision                                                                                | Default                                                                                                                                                              | Rationale                                                                                                       |
| --- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| D1  | How does seal encode "failed → graft recovery"?                                         | Catch the scriptorium throw inside seal; return `completed` with `yields: { ok: false, reason, grafted: true }` plus `graft` and `graftTail`.                        | Matches `implement-loop`'s graft pattern; needs no changes to Spider's run-result types.                        |
| D2  | EngineId for the new manual-merge quick engine                                          | `manual-merge`                                                                                                                                                       | Direct, searchable, matches the brief's wording.                                                                |
| D3  | EngineId for the retry clockwork engine                                                 | Reuse `seal` with a `recover: false` given                                                                                                                           | Identical behavior minus the graft branch — a flag is the minimum-surface expression.                           |
| D4  | Manual-merge engine: purpose-built or generic anima-session config?                     | Purpose-built `manual-merge` engine with internal prompt composition and a custom `collect()`                                                                        | Mirrors `review`/`revise`; co-locates the marker contract with the prompt.                                      |
| D5  | Retry engine: separate file or seal parameterized?                                      | Add `recover?: boolean` to seal (default `true`); when `false`, seal throws on scriptorium failure as it does today                                                  | Single engine, single file, flag-controlled — mirrors how seal already exposes `abandon`.                       |
| D6  | RoleId for the manual-merge anima                                                       | `mender`                                                                                                                                                             | Short, single-word, fits Spider's role vocabulary.                                                              |
| D7  | Which plugin hosts the mender role and instructions?                                    | Spider plugin (register in Spider's `supportKit.roles`; instructions live under `packages/plugins/spider/loom-roles/`)                                               | Co-locates the role with the engine that consumes it; Astrolabe owns sage-*, Spider owns its own.               |
| D8  | Structured marker format from the merge anima                                           | `### Merge: SUCCESS` / `### Merge: FAILURE` on its own line in the anima's final message                                                                             | Mirrors `review`'s `### Overall: PASS` pattern with a distinct prefix to avoid collision.                       |
| D9  | Which seal failure modes trigger recovery?                                              | Only scriptorium rebase-conflict failures (message-sniff on the `Sealing seized:` prefix). All other failures re-throw unchanged.                                    | Anima-mediated merge can only address rebase conflicts; scriptorium has one throw site with a stable prefix.    |
| D10 | Should recovery fire when `abandon: true`?                                              | No. Abandon-path failures throw as today; no graft.                                                                                                                  | Abandon cannot produce merge conflicts — recovery would be dead code.                                           |
| D11 | `maxRetries` for the retry seal call                                                    | Default (3)                                                                                                                                                          | "One attempt" refers to the anima merge, not the underlying ff-only push retries.                               |
| D12 | How does the manual-merge engine signal anima failure?                                  | Throw inside `collect()` when the marker is missing or `FAILURE`                                                                                                     | Spider already treats a `collect()` throw as engine failure; no Spider core change needed.                      |
| D13 | Mender role permissions                                                                 | Minimal-merge: only rebase / merge / status / diff / log / show / add / commit and Read / Edit. Push is explicitly denied.                                           | Matches the brief — the anima reconciles files; pushing is the retry engine's job.                              |
| D14 | What `graftTail` should seal set?                                                       | Always set `graftTail` to the retry engine's id (e.g. the second grafted engine), even though no current rig has engines downstream of seal.                         | Cheap, future-proof, mirrors `implement-loop` convention; pointless to make conditional.                        |

## Acceptance Signal

- `pnpm -w typecheck` passes.
- `pnpm -w test` passes, including a new Spider behavioral test that drives the full recovery sequence: scriptorium's seal throws a rebase-conflict signal → seal engine reports `completed` with `ok: false` and a graft → the grafted manual-merge quick engine runs → its `collect()` parses a `### Merge: SUCCESS` marker → the grafted retry seal engine pushes successfully → the rig reaches its terminal state without ever entering `stuck`.
- A second test variant where the manual-merge anima emits `### Merge: FAILURE` (or no marker) shows the rig transitions to `stuck` after the manual-merge engine fails, with the retry engine never running.
- A third test variant where seal is invoked with `abandon: true` and abandonDraft throws shows the rig goes `stuck` immediately with no graft attempted.
- A fourth test variant where seal is invoked with `recover: false` and scriptorium throws a rebase-conflict signal shows the engine fails by throw with no graft (used by the retry engine itself).
- `grep -r 'manual-merge' packages/plugins/spider/src/spider.ts` and `grep -r "'mender'" packages/plugins/spider/src/spider.ts` (or your chosen quote style) both match — i.e. both new engine and the new role are registered in Spider's supportKit.
- `docs/architecture/apparatus/spider.md` and `docs/architecture/apparatus/scriptorium.md` both contain text describing the recovery-tail behavior and continue to describe scriptorium's `seal()` primitive as still throwing on conflict.

## Existing Patterns

- **`packages/plugins/spider/src/engines/implement-loop.ts`** — the canonical clockwork-engine-that-grafts pattern. It returns `{ status: 'completed', yields, graft, graftTail }` after building a chain of `RigTemplateEngine` entries with sequential `upstream` links. Mirror the shape and the templating conventions (`${writ}`, `${yields.<engineId>.<field>}`) when seal builds its recovery graft.
- **`packages/plugins/spider/src/engines/review.ts`** — the canonical purpose-built quick engine with structured-marker parsing in `collect()`. Mirror the structure for the new `manual-merge` engine, but **throw** in `collect()` on failure rather than returning a `passed: false` yield (per D12).
- **`packages/plugins/spider/src/engines/revise.ts`** — another purpose-built quick engine that composes its own anima prompt; useful as a second reference for the prompt-composition shape.
- **`packages/plugins/astrolabe/src/astrolabe.ts`** (the `supportKit.roles` block) — model for role registration with `permissions`, `strict`, and `instructionsFile`. Spider's `supportKit` lives in `packages/plugins/spider/src/spider.ts` (around the engines registry); the new `roles` entry follows the same shape.
- **`packages/plugins/astrolabe/sage-*.md`** — model for role-instruction files (concise role mandate, output contract, behavior under uncertainty). The `mender.md` instructions should explicitly direct the anima to (a) work in the existing draft worktree, (b) defend against an inconsistent rebase state by aborting any in-progress rebase before starting, (c) refuse to fabricate a merge it cannot justify, and (d) emit exactly the structured marker decided in D8 as its final message.
- **`packages/plugins/codexes/src/scriptorium-core.ts`** — read this to confirm the exact throw message used for rebase conflicts (the regex used by D9's discriminator must match this throw site and only this throw site).

## What NOT To Do

- **Do not modify scriptorium.** The `seal()` primitive continues to throw on rebase conflict. Do not introduce a typed error code, retry contract, or recovery hook on the apparatus side — that is a separate refactor noted in observations.
- **Do not extend `SpiderEngineRunResult`.** No new `failed-with-graft` or `blocked-with-graft` variant. Recovery is encoded as `completed` with a graft, per D1.
- **Do not generalize `anima-session` to support markers.** The `manual-merge` engine is purpose-built; resist the temptation to factor a shared helper across `review` and `manual-merge` in this brief — that's noted in observations as a follow-up.
- **Do not give the mender role push permissions.** Push is the retry engine's job. If the role file ends up with `git push` allowed, revisit D13.
- **Do not graft on `abandon: true`.** Abandon failures throw as today. No exceptions.
- **Do not attempt a second recovery layer.** The retry engine must run with `recover: false`. If it fails, the rig goes stuck. No nested grafts.
- **Do not change the rig-`stuck` contract.** Grafted recovery is internal to the seal engine; the rig still goes stuck if recovery itself fails.


--END--