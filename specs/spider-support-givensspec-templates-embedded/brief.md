# Spider: Support GivensSpec templates embedded in strings

## Current State

Full-value replacement only. The regex YIELD_REF_RE matches the entire string (^...$), and resolveGivens checks value.startsWith('$') — if the whole value isn't a reference, it's passed through as a literal. A string like "Here it is: ${yields.foo.bar}" would not match any pattern and would be passed through unchanged.

## Desired State

Support inline interpolation — specify givesn such as "Write a spec. Decisions: ${yields.decision-review.decisionSummary}" — we'd need to add string interpolation to both resolveGivens (for $writ/$vars.*) and   resolveYieldRefs (for $yields.*). The current implementation treats each givens value as either entirely-a-reference or entirely-a-literal.

## Other

- Use this opportunity to provide any general cleanup and tech debt fixes which have developed in how givens and yields are passed between engines
- Consider introducing a real templating library at this point instead of rolling our own. Prefer one with minimal and low-weight transitive dependencies. If a suitable library exists, but would require changing our templating syntax raise it as a decision for the patron -- a breaking change may be acceptable in this case.
