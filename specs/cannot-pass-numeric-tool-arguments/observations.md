# Observations: cannot-pass-numeric-tool-arguments

## Duplicate Zod type introspection logic

`tools-show.ts` has `extractSingleParam()` and `zodTypeToJsonType()` for unwrapping and classifying Zod types. The CLI's `helpers.ts` will now add similar unwrapping logic for coercion. A shared utility could serve both, but the two use cases are different enough (one extracts metadata, the other coerces values) that merging them would be forced. Worth noting for a future cleanup pass if more Zod introspection appears elsewhere.

## isBooleanSchema behavioral probing is fragile

`isBooleanSchema` uses `safeParse` probing which could false-positive on union types or custom refinements that happen to accept true/false but reject numbers/strings. In practice this hasn't been a problem because no tool uses such schemas, but the technique doesn't generalize cleanly. The instanceof approach used in tools-show.ts is more reliable.

## No end-to-end CLI tests exist

`buildToolCommand` is untested — only its helper functions are tested. A future commission could add lightweight integration tests (construct a Command, parse mock argv, verify the handler receives correctly typed params) without needing a full guild. This would have caught the numeric coercion bug before it shipped.

## Commander's built-in argParser is unused

Commander's `option()` accepts a processing function as the third argument (`cmd.option('--limit <value>', 'desc', Number)`) which could handle per-flag coercion at parse time. The current code doesn't use this feature. If coercion needs expand beyond numbers in the future, the argParser approach may be cleaner than a post-parse walk. Not worth switching now for one type.
