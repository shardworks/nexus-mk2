`ReckonerApi` (`packages/plugins/reckoner/src/types.ts:17`) exposes `source` and `triggerTypes`. Grep shows zero consumers across the monorepo — no codepath calls `guild().apparatus<ReckonerApi>('reckoner')`. The README documents the API as available "so surfaces (list views, dashboards) can enumerate the trigger types the Reckoner emits."

T4 doesn't add or remove a trigger; the `triggerTypes` array stays at three. But the API's continued absence of consumers is worth noting — either:
1. A future T5 (CLI / Oculus) becomes the first reader and the API earns its keep.
2. The API stays unread and could be removed for simplicity.

Not actionable today; flagging because reviewers of T4 are likely the next reviewers of T5, where the API's fate gets decided. If T5 doesn't use it, consider a follow-up to delete it (Three Defaults #1: prefer removal to deprecation).