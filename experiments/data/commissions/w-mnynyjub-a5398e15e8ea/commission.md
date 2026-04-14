# Prompt-injection hardening for commission-sourced prompts

Design and implement defense-in-depth against prompt-injection attacks through the surfaces where patron-supplied text flows into agent system prompts. Specifically: scan inbound strings at the patron-entry boundary (commission-post CLI, clerk `writ-post` tool, writ-edit tools) for high-confidence injection patterns, flag them on the writ for downstream awareness, and optionally block posting at configurable strictness levels. The threat today is low — single patron, self-authored commissions — but the scaffolding needs to exist before any externally-sourced intake is added (web hooks, multi-tenant guilds, delegated posting agents).

## Background

A mandate writ's body becomes part of its rig's context, which becomes part of an anima session's system prompt. Writ titles appear in reviewer prompts. Astrolabe-generated specs flow into implementing agents. None of this content is currently scanned. GSD's user guide documents a defense-in-depth approach with a scanner module, runtime hooks, and a CI pass — we want a proportional version for nexus.

The sharp narrowing: **agent-to-agent writ creation is inside the trust boundary** (agents running in the guild are already trusted code). The scan surface is only the **patron-entry points** where user-controlled strings cross a CLI or HTTP boundary into the writs book. In practice this is a small set of call sites.

## Deliverables

### 1. Threat model (short, enumerated)

Produce a focused enumeration (in commit message or a short doc committed under `packages/plugins/clerk/docs/`) of every surface where patron-supplied text becomes part of a downstream prompt:

- `nsg commission-post` CLI → writ body and title.
- Clerk's `writ-post` tool (HTTP / MCP callable).
- Clerk's `writ-edit` tool (body and title overwrite).
- Any other entry point where a patron-controlled string lands in a writ field that downstream sessions read.

For each surface, classify:

- **Source trust**: patron CLI (trusted), MCP tool (inside trust boundary when agent-called, untrusted if externally routed), HTTP (untrusted by default).
- **Blast radius**: reading patron's own data, escalating into another tenant, escalating tool privileges.
- **Recommended scan strictness**: scan-and-log, scan-and-flag, or scan-and-block.

Keep it tight — this should be a one-page artifact, not a security white paper.

### 2. Injection pattern scanner module

Add a scanner (e.g., `packages/plugins/clerk/src/injection-scanner.ts`) that takes a string and returns a structured result:

```ts
type ScanResult = {
  clean: boolean;
  matches: Array<{ pattern: string; severity: 'low' | 'medium' | 'high'; excerpt: string }>;
};
```

Initial pattern set should cover the well-known high-confidence vectors:

- Role-override attempts (`You are now...`, `Ignore previous instructions`, `System:`, `<|im_start|>system`, etc.).
- Instruction-bypass markers (`DAN`, `jailbreak`, `developer mode`, `ignore the above`, etc.).
- System-tag injection (embedded `<system>`, `</system>`, fake tool-call markup, fabricated function-call syntax).
- Path-traversal in any file-reference-looking fragments (`../`, absolute-path escapes from expected roots).
- Obvious prompt-boundary escapes (triple-backtick-fenced "system" blocks, markdown-headed "SYSTEM PROMPT" sections).

The scanner must be fast enough to run on every commission-post and writ-post without user-visible latency (single-pass regex set, <10ms for a ~10 kB body). Keep patterns in a data table so they can be extended without code changes. Document that this is a signal, not a guarantee — the scanner catches the unsophisticated cases, not determined attackers.

### 3. Integration at the patron-entry surfaces

Wire the scanner into:

1. **`commission-post` CLI**: scan the body and title before posting. On any match, surface the matches to the patron (stderr), and proceed to post unless `--strict` is specified (which blocks on any medium-or-higher match).
2. **Clerk `writ-post` tool**: scan the body and title at post time. Record the scan result on the writ as a new field (e.g., `injectionScan: { scannedAt, clean, matches }`). On high-severity matches, refuse the post with a clear error unless a guild-config-level override is set (`clerk.injectionScanMode: 'block' | 'flag' | 'off'`, default `'flag'`).
3. **Clerk `writ-edit` tool**: same treatment as `writ-post` for body and title fields.

The scan result stored on the writ lets downstream tooling (rig execution, reviewers, the oculus) display a warning on flagged writs without re-scanning. It's also the primary audit trail if something slips through and causes harm later.

### 4. Tests

- Unit tests for the scanner: each pattern category gets a positive fixture (should match) and a negative fixture (should not falsely match).
- Synthetic benign-corpus tests: construct 8–12 realistic-looking benign commission bodies as test fixtures — including ones that *discuss* prompt injection, that reference system prompts in quoted form, that contain code blocks with role-looking strings, and that use markdown headings like "System Design" or "Instructions for Reviewers". All must pass as clean at `high` severity. These fixtures are the primary guard against over-broad patterns and should live alongside the scanner tests.
- Integration tests for each entry point: scanning runs, clean inputs pass, known-malicious inputs get flagged/blocked per config mode, the writ's `injectionScan` field is populated correctly.
- A test that confirms scanning is cheap: scanning a 10 kB body completes in <10ms on the CI runner.

### 5. Guild-config strictness knob

Add a `clerk.injectionScanMode: 'off' | 'flag' | 'block'` field to the clerk config (default `'flag'`). `'off'` skips scanning entirely (escape hatch for single-patron local development). `'flag'` scans and records the result but never blocks. `'block'` refuses posts that contain any high-severity match. Document the field in the clerk README.

## Constraints

- **Do not scan agent-to-agent writ creation.** Writs posted by engines running inside the guild are inside the trust boundary and must not be scanned — that would be both wasteful and likely to false-positive on legitimate agent output that *discusses* prompt-injection patterns (like this brief). The distinguishing signal is the caller identity at the tool-post site; use it.
- **Do not modify downstream agent prompts, rig templates, or session startup.** This brief defends the entry boundary only. Downstream defenses (prompt structure, context isolation) are separate concerns.
- **Do not introduce a runtime dependency on an external ML classifier.** Scanner patterns must be static regex / string matchers. This keeps the scanner fast, deterministic, and reviewable.
- **False-positive discipline.** The benign-corpus fixtures described in the tests section must all pass clean at high severity. If any realistic benign body trips a high-severity pattern, the pattern is too broad and must be narrowed or demoted to medium/low.
- **The scanner module must be importable without pulling in the full clerk apparatus**, so other surfaces (future HTTP intake, future delegated-posting agents) can reuse it without an apparatus dependency.

## Success criteria

1. Scanner module exists, is covered by unit tests for each pattern category, and completes a 10 kB body scan in <10ms.
2. `commission-post`, `writ-post`, and `writ-edit` all run the scanner and populate `injectionScan` on the writ.
3. `clerk.injectionScanMode` config field works in all three modes (off/flag/block) and is documented.
4. The 8–12 synthetic benign fixtures all pass clean at high severity (zero false positives on realistic commission-shaped content).
5. A crafted malicious fixture (role-override + instruction-bypass + system-tag injection) is caught at all three entry points and blocked under `mode: 'block'`.
6. All existing clerk and framework tests pass unchanged.
7. Commit message documents the threat model, the pattern set, and the reasoning for which entry points got which strictness default.

## Out of scope

- **Downstream prompt-structure defenses.** Delimiter hardening, context isolation between patron content and system instructions, agent-side secondary scanning — all separate concerns.
- **ML-based injection detection.** Static patterns only.
- **Scanning agent-generated writs.** Trust-boundary principle — agents inside the guild are trusted.
- **Retroactive scanning of existing writs.** If desired later, it's a trivial loop over the writs book; not worth doing until someone actually wants the audit data.
- **CI-level scanning of agent/workflow/command files.** GSD does this; we can add it if the surface grows, but it's not today's priority.
- **Rate limiting or abuse detection on commission-post.** Orthogonal concern.

## Reference

- Source quest: `w-mnsyyh9n-476a8c2d1d0b` — prompt-injection hardening.
- `packages/plugins/clerk/src/tools/writ-post.ts` — clerk's writ-post tool, one integration point.
- `packages/framework/cli/src/commands/commission-post.ts` — commission-post CLI, one integration point.
- Writ-edit tool (same clerk plugin) — third integration point.