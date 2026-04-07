# anima-session generic engine

We ned something like the following.. ideally, givenSpec tempalte variables can be part of the prompt

### `anima-session` (quick)

A generic engine that summons an anima session. Unlike the other quick engines which embed prompt logic, `anima-session` is a reusable building block — the prompt, role, and conversation context are supplied entirely through givens.

```typescript
async run(givens: Record<string, unknown>, context: EngineRunContext): Promise<EngineRunResult> {
  const animator = guild().apparatus<AnimatorApi>('animator')
  const writ = givens.writ as WritDoc | undefined
  const draft = context.upstream['draft'] as DraftYields | undefined

  const handle = animator.summon({
    role: givens.role as string,
    prompt: givens.prompt as string,
    cwd: givens.cwd as string ?? draft?.path,
    ...(givens.conversationId ? { conversationId: givens.conversationId as string } : {}),
    environment: writ ? { GIT_AUTHOR_EMAIL: `${writ.id}@nexus.local` } : {},
    metadata: { engineId: context.engineId, ...(writ ? { writId: writ.id } : {}) },
  })

  return { status: 'launched', sessionId: handle.sessionId }
}
```

**Givens:**
- `role` *(required)* — the Loom role to summon
- `prompt` *(required)* — the work prompt for this session
- `cwd` *(optional)* — working directory; falls back to `upstream.draft.path` if available
- `conversationId` *(optional)* — conversation to resume (typically wired from an upstream engine's yields via `${yields.<engineId>.conversationId}`)
- `writ` *(optional)* — the writ, if the engine needs it for git identity or metadata

**Yields:** The default quick-engine yields: `{ sessionId, sessionStatus, output?, conversationId }`. The `conversationId` in yields enables downstream engines to resume the same conversation by referencing `${yields.<engineId>.conversationId}` in their givens.

**Collect step:** No custom `collect` — uses the Spider's generic default.

This engine is contributed by the Spider's support kit alongside the five existing engines. Kit-contributed rig templates and guild-configured templates can both reference `anima-session` as a `designId`.
