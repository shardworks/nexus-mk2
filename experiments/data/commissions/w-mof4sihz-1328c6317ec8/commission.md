Lines 223–226 of `docs/architecture/apparatus/reckoner.md` read:

```
isQueueDrained = (writsCount('phase = open') === 0)
                  AND (rigsCount('status IN (running, blocked)') === 0)
```

This is the **pre-T4** form of the predicate. The implementation in `packages/plugins/reckoner/src/drain.ts` (line 47) uses `clerk.countActive()` — the classification-aware successor that counts every registered writ type's `active`-classified states (so a stuck mandate now holds drain back, per the comment in `drain.ts:14–16`). The doc and the code disagree on which states count.

The code is the source of truth (the comment in `drain.ts:11–17` explicitly calls out the post-T4 behavior shift and references the `drain.test.ts` coverage). Update the doc's drain section to use the classification-aware phrasing matching `drain.ts`.

Out of scope for this rename commission — this is a separate doc-staleness fix — but worth lifting because it lives in the same apparatus doc the rename is touching, so a follow-up author will be in the same file shortly.