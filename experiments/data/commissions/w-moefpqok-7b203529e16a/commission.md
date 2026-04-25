`packages/plugins/spider/README.md` line 411 documents the `animator-paused` BlockType's condition shape as `{ sessionId? }`:

```
| `animator-paused` | 10s | `{ sessionId? }` | Blocks until the Animator's rate-limit back-off machine reports `state === 'running'` OR `pausedUntil` has elapsed. Entered via `tryCollect` when a session terminates with `status: 'rate-limited'`. |
```

After the schema-tolerance fix lands, the entire payload becomes optional — a legacy hold may persist without any `holdCondition` and the checker still resolves cleanly. Update the column to reflect that the condition object itself may be absent (e.g. `{ sessionId? }?` or a short footnote), so operators reading the README understand why pre-`attempts[]` rigs surface a hold with no condition payload.