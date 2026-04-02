# C003 — Scriptorium Seal/Push Sync Hardening

## Commission

Harden the Scriptorium's seal and push lifecycle to handle codexes whose remote has advanced outside the codex system.

### Problem

When commits are pushed to a codex's remote outside the Scriptorium (e.g. directly from a local clone), the bare clone's sealed binding (main ref) diverges from the remote. The seal operation succeeds locally (fast-forward onto the stale main), but the subsequent push fails with a non-fast-forward rejection.

The Scriptorium already fetches before `openDraft` and before `seal`, but the fetch updates `refs/remotes/origin/*` in the bare clone — the seal compares against `refs/heads/main` (the local main ref), which may be behind origin. Verify this diagnosis and fix if confirmed.

### Acceptance Criteria

1. **Seal uses fresh remote refs.** After fetching, the seal operation should compare the draft against the remote's latest target branch position, not a potentially stale local ref. If main has advanced on the remote, the rebase path should handle it — verify this works end-to-end.

2. **SealResult includes inscription count.** Add an `inscriptionsSealed: number` field to `SealResult` so orchestrators can detect no-op seals (where the draft had zero inscriptions ahead of the sealed binding). This lets callers implement their own commit guards without reimplementing the git inspection. Use the guild metaphor vocabulary — "inscriptions" not "commits" — since this is the Scriptorium's public API surface.

3. **Update docs.** Update `docs/architecture/apparatus/scriptorium.md` and `packages/plugins/codexes/README.md` to reflect any changes to `SealResult` or seal behavior. The spec and README are the source of truth — implementation changes without doc updates are incomplete.

4. **Tests.** Add test coverage for the diverged-remote scenario: remote advances between draft open and seal, seal should rebase and succeed. Also test the `inscriptionsSealed` field for both zero-inscription and multi-inscription cases.

### Context

- Spec: `docs/architecture/apparatus/scriptorium.md`
- Implementation: `packages/plugins/codexes/src/scriptorium-core.ts`
- The rebase path exists and is tested for draft-to-draft contention, but may not cover remote-advanced-outside-scriptorium scenarios
- Bare clone ref layout: `refs/heads/*` are local, `refs/remotes/origin/*` are fetched — verify which the seal actually resolves
