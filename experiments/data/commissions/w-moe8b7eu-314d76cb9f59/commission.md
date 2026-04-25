`packages/plugins/clockworks/src/standing-order-validator.ts` L60 lists `prompt` in `DROPPED_SUGAR_KEYS` alongside `summon` and `brief`. The settled architecture (per concluded click `c-modgto1o`) names only `summon:` and `brief:` as dropped sugar forms; `prompt:` was never proposed as a sugar key independently — it was a sub-field of the `summon:` sugar shape.

Two paths forward:
1. Document `prompt:` as a top-level sugar field that's also rejected (operators copy-pasting old `{ on, summon, prompt }` shapes get a clearer error). Add a single-line comment to `DROPPED_SUGAR_KEYS` explaining why `prompt:` is in the list, and mention it in the validator's module docstring.
2. Remove `prompt:` from `DROPPED_SUGAR_KEYS`. The unknown-key check would catch a top-level `prompt:` anyway, just with a generic 'unknown key' message rather than the dedicated migration message.

Option 1 is the lower-risk path — the dedicated message is operator-friendly during the initial rollout. Recommend Option 1 with a one-line code comment.