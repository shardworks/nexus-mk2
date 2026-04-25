# Claude-code babysitter-runtime toolkit extraction

## Intent

Move the small, single-purpose primitives currently embedded in `packages/plugins/claude-code/src/babysitter.ts` into a new sibling source file (the implementer chooses the name; `runtime.ts` is one option but not prescribed). The candidates for extraction are: the bespoke retry/HTTP helpers (`findRetryableCode`, `encodeParamsAsQuery`, `callGuildHttpApi`), the DLQ writer (`writeToDlq`), the stdin config reader plus required-field validator (`readConfigFromStdin`), the SQLite open/init/write trio (`openTranscriptDb`, `initTranscriptDb`, `writeTranscript`), the stderr redirect (`redirectStderrToFile`), and the lifecycle reporters (`reportRunning`, `reportResult`). After extraction, `babysitter.ts` imports the primitives from the toolkit; the public entry point and the call-site behavior are unchanged.

## Motivation

Per the April 25 claude-code complexity audit ([`packages/plugins/claude-code/COMPLEXITY-AUDIT.md`](packages/plugins/claude-code/COMPLEXITY-AUDIT.md)), `babysitter.ts` is ~1,013 LOC concentrating three distinct categories of code in one file: (a) the `runBabysitter` orchestrator at ~240 LOC, (b) the MCP/SSE proxy server at ~190 LOC, and (c) ~400 LOC of small primitives (retry/HTTP, DLQ, stdin reading, SQLite, stderr redirect, lifecycle reporters). Every reader of `babysitter.ts` pays the cost of the primitives' density even when their question is about lifecycle or proxy plumbing alone. Extracting the primitives is the highest-confidence smallest-effort intervention from the audit's three ranked candidates (Candidate A, ranked above the medium-effort orchestrator decomposition and the large-effort MCP/SSE proxy extraction), and it lays the groundwork for the orchestrator decomposition (Candidate B) by clearing the reading surface around the orchestrator.

The audit's tests-already-partition observation matters: `babysitter.test.ts` already contains separate `describe` blocks for `findRetryableCode`, `callGuildHttpApi`, `writeToDlq`, the SQLite trio, and the stderr redirect. The split is already implicit in the test structure; this commission makes it explicit in the source structure.

## Non-negotiable decisions

- **Extract the primitives, leave the orchestrator and proxy in place.** `runBabysitter`, `createProxyMcpHttpServer`, and the `main` entry point at the bottom of `babysitter.ts` stay where they are. The MCP/SSE proxy is explicitly out of scope for this commission — its extraction is a separate larger candidate that depends on this one but is not part of it.
- **Public re-exports.** Anything that's currently exported from `babysitter.ts` must continue to be exported from `babysitter.ts` after the move. The extracted module is the new source of truth, but the babysitter file may re-export from it as needed to preserve the entry-point shape. External consumers of the package (and the babysitter's own callers via `node …/babysitter.ts`) see no change.
- **Behavior-preserving.** The retry/HTTP error-cause-chain walk depth, exponential backoff timing, retryable error code list, DLQ file-naming convention, stdin parsing semantics, SQLite WAL mode + single-row INSERT-OR-REPLACE shape, stderr redirect file-open mode, and lifecycle reporter HTTP call → DLQ-fallback fallthrough — all preserved. The audit's "What NOT to refactor" section enumerates the load-bearing invariants; this commission must preserve all of them. In particular: the `process.kill(-pgid, 'SIGTERM')` pattern is in `index.ts` and unaffected by this refactor; the babysitter's stdin contract (write config, end stdin, unref) is preserved; the single-row transcript with `INSERT OR REPLACE` shape is preserved.
- **Tests follow the source split.** Existing `describe` blocks in `babysitter.test.ts` for the extracted primitives move into new test files alongside the new module (one combined file is fine; the implementer's choice on granularity). Tests for `runBabysitter` and the MCP/SSE proxy stay in `babysitter.test.ts`. Total test count (currently ~1,535 LOC across the babysitter test file alone) and pass/fail outcomes are identical before and after.
- **No public-API change.** `createClaudeCodeProvider`, the provider's `cancel()` and `launch()` methods, the `StreamJsonResult` type, `parseStreamJsonMessage`, `processNdjsonBuffer`, `extractFinalAssistantText`, `detectRateLimitFromNdjson`, and the entire `detached.ts` surface (`launchDetached`, `buildBabysitterConfig`, `computeToolManifest`, etc.) are not modified. Cross-package consumers (animator, spider) see no contract change.
- **Internal API decisions are the implementer's.** Whether the new module exports each primitive directly, groups them into named namespaces, or wraps them in a class is a code-shape decision the implementer makes after reading the existing call sites. The contract is "these primitives live in a sibling file; the babysitter imports them from there."

## Behavioral cases the design depends on

- `findRetryableCode` continues to walk error-cause chains up to its existing depth cap (the audit notes this is 5-deep to handle Node's fetch wrapping the underlying ECONN error, and that the cap prevents infinite loops on circular cause chains). The cap and walk depth are preserved exactly.
- `callGuildHttpApi` continues to: shape GET vs POST per method, encode GET params via `encodeParamsAsQuery`, retry on classified retryable codes with exponential backoff, respect the deadline, and surface unclassifiable errors verbatim.
- `writeToDlq` continues to write to the existing DLQ directory with the existing file-naming convention. Guild DLQ-drain expects to read these files on the next start; the format is part of the cross-process contract.
- `readConfigFromStdin` continues to read stdin to completion (the babysitter's stdin contract requires this; the launcher ends stdin to signal "config delivered"), parse JSON, and validate the fixed required-field list.
- The SQLite trio continues to dynamic-import `better-sqlite3`, open in WAL mode, prepare one `INSERT OR REPLACE` statement on a single-row table, and write the transcript on every meaningful boundary. Concurrent reads from external processes (the guild reading the transcript live) must continue to see coherent snapshots.
- `redirectStderrToFile` continues to replace `process.stderr.write` with an fs-backed implementation against an owned fd, write the startup banner, and return the fd for caller-managed close. The replacement is what prevents EPIPE crashes when the guild restarts and invalidates an inherited stderr fd.
- `reportRunning` and `reportResult` continue their HTTP-call-with-DLQ-fallback pattern: try the guild's HTTP API with retries, fall through to `writeToDlq` only on retry exhaustion. The terminal-write at-least-once delivery guarantee depends on this fallback path; the duplicate-tolerance is on the guild side (terminal-state immutability handles duplicates).
- All tests in `babysitter.test.ts` plus any new tests in the extracted module's test file pass. Counts may go up if the implementer adds unit tests on the extracted module's seam, but no existing test fails.

## Out of scope

- The orchestrator decomposition (`runBabysitter` along its numbered-step seams). Candidate B from the audit; depends on this commission landing first but is itself a separate medium-effort commission.
- The MCP/SSE proxy extraction (`createProxyMcpHttpServer` and its surrounding sub-machines). Candidate C from the audit; large-effort, depends on resolving the MCP-vs-tools-package contract surface.
- Source-mode detection deduplication (the two `.ts` extension checks in `detached.ts`). Audit hotspot §5; bundled into Candidate B in the audit's framing — not this commission.
- Any change to `index.ts` (the provider plugin shell, the rate-limit detector, NDJSON parsing, `cancel()`, `StreamJsonResult` type).
- Any change to `detached.ts` (`launchDetached`, `buildBabysitterConfig`, `computeToolManifest`, source-mode detection sites, the triple-promise pattern).
- The package README's two-branch-vs-one-branch rate-limit detector drift (audit Hotspot 3 observation). Out of scope; flagged for downstream pickup elsewhere.
- Any modifications to the rate-limit detector's tombstoned commentary in `detectRateLimitFromNdjson`.
- Sharing the extracted toolkit across packages. The new module is package-private; cross-package extraction is a future question if multiple packages end up needing the same primitives.

## References

- Audit document: [`packages/plugins/claude-code/COMPLEXITY-AUDIT.md`](packages/plugins/claude-code/COMPLEXITY-AUDIT.md) — Candidate A in the audit's ranked refactor list. The audit's "What NOT to refactor" section enumerates the load-bearing invariants any claude-code refactor must preserve; this brief reproduces the relevant ones above but the audit is the authoritative inventory.
- Cost-density context: April 25 per-package cost analysis identified claude-code at $0.019/LOC (1.9× the substrate-plugin average) across n=2 sessions. The audit explicitly flags the small-sample caveat — the structural reasoning, not the cost number, is the basis for ranking.