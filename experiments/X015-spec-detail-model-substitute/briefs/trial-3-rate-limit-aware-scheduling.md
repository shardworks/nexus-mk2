# Rate-limit-aware scheduling

## Intent

Teach the guild to recognize when the anima provider is rate-limited, stop dispatching sessions until the limit clears, and resume automatically when tokens return. Rate-limit awareness moves from an implicit failure mode into first-class observable state owned by the Animator apparatus, so every session-spawning caller (Spider, Parlour, future consumers) inherits the gate without needing to know about rate limits directly.

## Rationale

Today a quota blow mid-batch produces cascading generic failures: every in-flight and subsequent session surfaces as `claude exited with code 1`, every engine stucks its rig via the engine-failure path, and whole-rig retry spawns duplicate rigs that collide with the original's artifacts. Ten commissions become twenty dead rigs with no self-healing. The underlying gap is that nothing in the system knows a rate limit happened — detection has to live on the provider boundary (Animator) so that one gate protects every caller.

## Scope & Blast Radius

Affected packages — name the concern, verify the ripple yourself:

- **`packages/plugins/animator/`** — owns the new status book, the back-off state machine, the detection tag consumer, the read API, the pre-dispatch rejection path, and the new CLI tool + HTTP route. All new Animator types, books, tools, routes, and configs land here.
- **`packages/plugins/claude-code/`** — the single detection site. The provider inspects its own signals (NDJSON result messages, stderr, exit code) and emits a structured termination tag on the `session-record` payload so Animator (and everything downstream) consumes a tag instead of pattern-matching a freeform string.
- **`packages/plugins/spider/`** — two integration points. The scheduler gate short-circuits dispatch phases when Animator is paused; the collect-side branches on the rate-limit signature and transitions the engine into the existing `blocked` state with a new `animator-paused` block type. Also owns the Oculus Spider page banner that surfaces the pause to patrons.
- **`packages/plugins/parlour/`** — propagation only. The new session status value flows through `TurnResult.sessionResult` unchanged; no pre-check, no new error path, no UI rendering. Parlour's existing shape must keep compiling and the new value must be reachable by the UI layer.
- **`docs/architecture/apparatus/animator.md`** — documents a fourth-outcome → fifth-outcome upgrade to match the new status value.

**Cross-cutting concern — new `SessionDoc.status` / `SessionResult.status` value (`'rate-limited'`).** This is the load-bearing ripple of the commission. Every exhaustive switch on session status, every zod schema that enumerates statuses, every terminal-status set, every UI filter, and every provider-side status mapping must learn the new variant. **Do not enumerate files — verify with grep across the monorepo for status references and TypeScript exhaustiveness must be in an error-producing state locally before you stop auditing.** Use the inventory's "Doc/code discrepancies" notes as a starting list but not as an exhaustive list.

**Cross-cutting concern — `animate()` rejection shape.** Callers that today await `handle.result` and match on `status` must receive a synthesized rate-limited `SessionResult` on pre-check rejection, with no SessionDoc ever written for the rejected call. Every Animator-calling site must be re-read to confirm the returned handle still resolves and the new status is handled (or deliberately defaulted).

**Cross-cutting concern — config validation posture.** The existing `animator.*` config convention is silent-default; the patron has overridden that convention *for the new back-off block*. The startup validator throws on bad `rateLimitBackoff` values. Do not regress other animator config fields to fail-loud without explicit direction; the override is scoped to this block.

## Decisions

| # | Decision | Default | Rationale |
|---|----------|---------|-----------|
| D1 | Status doc location | Dedicated `books_animator_status` book | Brief-prescribed; isolates CDC stream for Laboratory |
| D2 | Status doc id | `'current'` | Brief-prescribed identifier |
| D3 | Status doc shape | Adopt brief's sketch verbatim (`state`, `pausedSince`, `pausedUntil`, `pauseReason`, `backoffLevel`, `backoffLastHitAt`, `lastTriggeringSession`) | Least-surprise for cross-reference between brief and code |
| D4 | Rate-limit signature parser | claude-code provider tags the signal structurally on `session-record`; Animator consumes the tag | Fix at the source; provider is the boundary that observes raw signals |
| D5 | Which claude-code signal(s) to sample | Cascade: NDJSON `result` message first, then stderr pattern, then exit code | Wire shape is unknown; cascade fires on whichever signal appears |
| D6 | Rate-limit travel on SessionResult/SessionDoc | New enum value `'rate-limited'` on status (not a side-channel discriminator) | Fail-loud via TypeScript exhaustiveness; side channels silently fall through |
| D7 | "Successful dispatch after resume" definition (reset trigger) | Any terminal status other than `'rate-limited'` resets `backoffLevel` | Back-off tracks provider-tokens, not engine outcomes |
| D8 | Multiple rate-limit hits within a single pause window | Post-resume-only: hits during a paused window coalesce (no increment); only a hit after a resume attempt fails increments `backoffLevel` | "Consecutive" reads as successive probe failures; thundering-herd during one window should not escalate |
| D9 | Config shape | `animator.rateLimitBackoff: { initialMs, maxMs, factor }` (flat, no umbrella) | Brief-prescribed verbatim; earn nesting from a second consumer |
| D10 | Config validation posture | Fail-loud at startup — throw on bad values (**patron override**) | Silent fallback hides drift; matching existing convention is not itself a principle |
| D11 | AnimatorApi read method | `getStatus()` returning the status doc verbatim | Matches existing `getSessionCosts` naming; consumers compose their own dispatchability predicates |
| D12 | Pre-check rejection shape on `animate()` | `handle.result` resolves with a synthesized `SessionResult { status: 'rate-limited', … }` and no SessionDoc is written | Unified rejection shape shared with in-flight rate-limited termination |
| D13 | Pre-check location in `animate()` lifecycle | At the top of `animate()`, before any id generation or SessionDoc write | Fail-fast; no orphan pending docs for rejected calls |
| D14 | Spider crawl phase gated | Only `tryRun` and `trySpawn` are short-circuited; `tryCollect`, `tryProcessGrafts`, `tryCheckBlocked`, `autoUnstick` continue | `tryCollect` must run to ingest the very signals that trigger pause; `tryCheckBlocked` drives auto-resume |
| D15 | `crawl()` return value when gate fires | `null` (no new `CrawlResult` variant) | Pause observability lives on the Animator status CDC stream, not the tick output |
| D16 | Engine state model for rate-limit termination | Reuse existing `blocked` with a new block type `animator-paused`; no new `EngineStatus` variant | `blocked` + block-types is already the "waiting on external reversible condition" primitive |
| D17 | Auto-resume mechanism | The `animator-paused` block type's checker polls Animator status and returns `'cleared'` when state is `running` OR `pausedUntil <= now`; `tryCheckBlocked` drives the transition | Block checkers already carry pollIntervalMs/cleared semantics |
| D18 | Parlour's rate-limit surface | Inherit: `TurnResult.sessionResult` carries the new status; no pre-check; no shape change | `animate()` owns the pre-check, no duplication; single inspection path for all callers |
| D19 | CLI tool name | `animator-status` (flat registration as `nsg animator-status`) | Brief leaves name open; flat is self-describing, no speculative grouping |
| D20 | CLI output format | Human multi-line text by default, `--json` flag for structured output | Matches the framework `status` tool pattern |
| D21 | Oculus pause indication placement | Conditional banner at the top of `<main>`, above the tab bar, visible on all tabs | Brief's "cannot miss" constraint — badges are overlookable, tab-scoped rows hide |
| D22 | HTTP endpoint for Oculus | New `GET /api/animator/status` alongside existing animator routes | Ownership: Animator owns the state, Animator owns the endpoint |
| D23 | Oculus page poll strategy | Independent status-poll timer at modest cadence, regardless of rig activity | Banner must be truthful precisely when no rigs are running (that is often why they're not running) |
| D24 | Daemon-restart reconciliation | Passive: leave `state` as persisted; consumers check both `state === 'running'` AND `pausedUntil <= now` for dispatchability; the first successful dispatch naturally flips state | "Natural probe" semantic — `running` means "we dispatched successfully since the last pause", a stronger operational claim than clock-elapsed |

## Acceptance Signal

1. **Build and typecheck pass across the whole monorepo.** Every consumer of `SessionDoc.status` / `SessionResult.status` has been updated to handle `'rate-limited'`; no TypeScript exhaustiveness warnings remain.
2. **End-to-end rate-limit cycle is observable.** A synthesized rate-limit termination (via the claude-code provider tag path) causes: (a) the Animator status book `current` doc to transition `state: 'paused'` with `pausedUntil` set and `backoffLevel: 0`, (b) Spider's next `crawl()` tick to return `null`, (c) the rate-limited engine's status to be `blocked` with block type `animator-paused`, (d) after `pausedUntil` elapses, the block to clear, the engine to return to `pending`, and Spider to re-dispatch a fresh session on the next tick. Run the chain and confirm each transition occurs.
3. **`nsg animator-status` prints the current status document.** Default invocation is human-readable; `--json` prints the status doc as JSON.
4. **`GET /api/animator/status` returns the status doc.** The Oculus Spider page shows a conditional top-of-`<main>` banner with reason and resume time when paused; the banner disappears within one poll cadence of resume.
5. **Config validation fails loud at startup.** Booting the daemon with a malformed `animator.rateLimitBackoff` block throws at startup. Booting without the block uses the defaults (15 min / 1 h / factor 2).
6. **Back-off math matches the state machine.** First hit: `pausedUntil = now + initialMs`, `backoffLevel: 0`. Hits arriving during an already-paused window do not increment. A hit that occurs after a resume attempt fails increments `backoffLevel` and multiplies the window by `factor`, capped at `maxMs`. Any terminal status other than `'rate-limited'` resets `backoffLevel` to 0 on the next pause.
7. **In-flight sessions are not proactively cancelled.** When the transition to paused fires, sessions already running continue to completion; verify by grep that no new cancel call was added on the pause-transition path.
8. **Parlour propagates the new status without shape change.** `takeTurn()` continues to return `TurnResult`; the `sessionResult.status` field carries `'rate-limited'` through to Parlour's callers; grep confirms no pre-check was added to Parlour.

## Existing Patterns

Read these before writing new code:

- **Single-row book + well-known doc id** — `packages/plugins/animator/src/animator.ts` uses the `state` book with `GUILD_HEARTBEAT_DOC_ID = 'guild-heartbeat'`. The new status book follows the same shape with id `'current'`.
- **Read-permission tool** — `packages/plugins/animator/src/tools/session-list.ts` and `session-show.ts` are the templates for the new `animator-status` tool (declaration shape, registration via `supportKit.tools`, zod result schemas).
- **Oculus route** — `packages/plugins/animator/src/oculus-routes.ts` registers `/api/animator/sessions` and related routes; `/api/animator/status` follows the same pattern.
- **Blocked engine + block type** — find Spider's existing block-type registration, checker interface (`pollIntervalMs`, `lastCheckedAt`, `'cleared' | 'pending' | 'failed'` result), and `tryCheckBlocked` consumer in `packages/plugins/spider/src/spider.ts`. The new `animator-paused` block type plugs into the same machinery.
- **Declaration-merge config** — `packages/plugins/animator/src/types.ts` extends `GuildConfig` with an `animator?: AnimatorConfig` slot; the new `rateLimitBackoff` field extends `AnimatorConfig` the same way.
- **Startup config validation** — look for existing guild-level validators that throw at boot for structural config errors; if none exists locally, the validation lives inside `animator.start()` before the book is opened. The patron override (D10) is scoped to `animator.rateLimitBackoff` — do not retrofit fail-loud onto other animator config fields.
- **Oculus page DOM polling** — `packages/plugins/spider/src/static/spider.js` demonstrates the plain-DOM + `setInterval` polling idiom. The independent status poll mirrors `fetchRigListQuiet` but runs unconditionally.
- **CLI auto-registration** — `packages/framework/cli/src/program.ts` picks up new tools via the Instrumentarium apparatus automatically; no wiring change is needed. Compare `packages/framework/cli/src/commands/status.ts` for the `status` tool text-default-with-`--json` output convention.
- **Provider failure signalling** — `packages/plugins/claude-code/src/babysitter.ts` (`reportResult` around line 578) is where the exit-code-to-status mapping currently lives; the NDJSON handler `parseStreamJsonMessage` and the stderr redirection `redirectStderrToFile` are the three signal sites the detection cascade samples.

## What NOT To Do

- **Do not implement engine-level retry or rig-status rollup.** That is sibling commission `c-mocdm2o7`. Landing an engine in `blocked(animator-paused)` is sufficient for this commission; do not introduce a `retrying` engine state.
- **Do not implement operator-triggered pause.** The `pauseReason` field is extensible to support future operator-pause, but only the `'rate-limit'` reason is produced by this commission.
- **Do not add Coinmaster / Purse integration.** Back-off and token-budget are independent apparatus; no coupling is built here.
- **Do not proactively cancel in-flight sessions on pause.** Sessions already running complete naturally or surface a rate-limit signature on their own.
- **Do not add heartbeats, probes, usage-endpoint polls, or synthetic pings.** Resume is implicit: the next real dispatch after `pausedUntil` elapses *is* the probe. No Haiku probe, no `/v1/usage` poll, no scheduled test prompt.
- **Do not eagerly reconcile pause state on daemon boot.** Leave the persisted doc as-is; consumers combine `state` and `pausedUntil` to decide dispatchability. Do not flip `state` → `running` at startup based on clock alone.
- **Do not add a new `CrawlResult` variant for the gate.** When the pause gate suppresses `tryRun` and `trySpawn`, `crawl()` returns `null` (today's "no work" signal).
- **Do not add a new `EngineStatus` value.** Reuse `blocked` with the new block type. A `stuck` engine state (distinct from rig-level `stuck`) is out of scope and not needed.
- **Do not store pause history in a separate events table.** Laboratory's CDC ingestion of the status book's change events is the historical record.
- **Do not generalize the Oculus banner to a framework-level component yet.** The Spider page banner is a self-contained affordance here; the broader pattern is flagged as a follow-up observation.
- **Do not extend startup-fail-loud to other animator config fields.** The D10 override is scoped to `animator.rateLimitBackoff` only.
- **Do not forward the full babysitter stderr to the guild.** Sample-and-tag is sufficient for this commission; general stderr forwarding is flagged as a follow-up observation and out of scope.
- **Do not generalize rate-limit to non-claude providers.** The detection logic lives in the claude-code provider; the status shape does not preclude future per-provider state but no multi-provider infrastructure is built.

<task-manifest>
  <task id="t1">
    <name>Introduce rate-limited session status and termination tag</name>
    <files>packages/plugins/animator/ (types, TERMINAL_STATUSES, session-record handler, tools zod schemas, oculus-routes filters), packages/plugins/claude-code/ (detached.ts docToProviderResult, session-record payload types), packages/plugins/spider/ (tryCollect switch on session.status), and every other call site that switches on session.status or references TERMINAL_STATUSES.</files>
    <action>Add the new `'rate-limited'` value to the SessionDoc.status and SessionResult.status unions, and add a structured termination tag (carrying the detected reason) on the session-record payload that flows from provider → Animator. Update every exhaustive switch, zod enum, TERMINAL_STATUSES set, and status filter to recognize the new value. Use placeholder/default branches where later tasks will attach specific behavior — the goal of this task is that the type system compiles end-to-end and nothing silently falls through to the `'failed'` branch anymore. Grep the monorepo for `session.status`, `SessionDoc.status`, `SessionResult.status`, `TERMINAL_STATUSES`, `'failed'`, `'timeout'` to find the ripple set; verify exhaustiveness before stopping. Do not include behavior specific to Animator back-off or Spider blocked-engine transitions here — those arrive in later tasks.</action>
    <verify>pnpm -w typecheck && pnpm -w build</verify>
    <done>The new status value is accepted everywhere it can appear; no TypeScript errors or exhaustiveness warnings; no consumer silently treats a rate-limited session as a generic failure (placeholder branches may exist but must be explicit).</done>
  </task>

  <task id="t2">
    <name>Detect rate-limit signature in claude-code provider</name>
    <files>packages/plugins/claude-code/src/babysitter.ts, packages/plugins/claude-code/src/detached.ts, packages/plugins/claude-code/src/index.ts (signal parsing helpers).</files>
    <action>Wire the detection cascade inside the claude-code provider so that rate-limit-indicating signals on any of three sources — NDJSON `result` message fields, stderr text pattern, or distinguished exit code — cause the `reportResult()` call to set the session's status to the new rate-limited value and attach the structured termination tag. NDJSON inspection comes first (in `parseStreamJsonMessage`), stderr pattern match second (requires observing stderr in babysitter rather than only redirecting to log — scope the change narrowly to pattern detection, do not forward full stderr to the guild), exit code mapping third. The actual claude CLI signal shape is not documented in the repo — the implementer must observe a real rate-limit hit (or mock one) to pick the NDJSON field name / stderr regex / exit code value. Keep the detection logic encapsulated so non-claude providers need not carry it.</action>
    <verify>pnpm -w test --filter @shardworks/nexus-plugin-claude-code && pnpm -w typecheck</verify>
    <done>A session whose terminal signal matches any cascade branch is reported with the new rate-limited status and the structured termination tag; a session that terminates normally is reported as completed; a session that terminates with a non-rate-limit failure is reported as failed with no rate-limit tag.</done>
  </task>

  <task id="t3">
    <name>Animator status book, back-off machine, read API, and animate() rejection</name>
    <files>packages/plugins/animator/src/animator.ts, packages/plugins/animator/src/types.ts, packages/plugins/animator/src/session-record-handler.ts, packages/plugins/animator/src/startup.ts (config validation), and new modules for the back-off state machine.</files>
    <action>Declare a new `books_animator_status` book with a single well-known document id `'current'`. The doc carries `state`, `pausedSince`, `pausedUntil`, `pauseReason`, `backoffLevel`, `backoffLastHitAt`, `lastTriggeringSession` per the brief's sketch. Extend `AnimatorConfig` via declaration-merging with a `rateLimitBackoff: { initialMs, maxMs, factor }` block; at animator startup, validate the block and throw on bad values (missing block is fine — use defaults 15min / 1h / factor 2). Implement the back-off state machine: on a rate-limited session terminal (detected via the termination tag from T2), if state is `running`, transition to `paused` with `pausedUntil = now + initialMs`, `backoffLevel: 0`, `lastTriggeringSession = <sessionId>`. If a rate-limited terminal arrives while already paused, coalesce — do not increment. Only a rate-limited terminal arriving after a resume attempt has already dispatched a session increments `backoffLevel` and multiplies the window by `factor`, capped at `maxMs`. Any non-rate-limit terminal (completed, failed, cancelled, timeout — but not rate-limited) resets `backoffLevel` to 0 and transitions state to `running` if paused. Read the back-off config from `guild().guildConfig().animator?.rateLimitBackoff` at each transition (not cached at startup). Add `AnimatorApi.getStatus()` returning the current status document verbatim. Modify `animator.animate()` to pre-check status at the top of the function (before id generation, before any SessionDoc write) — if state is paused AND `pausedUntil > now`, resolve `handle.result` with a synthesized SessionResult carrying the new rate-limited status and the same termination-tag shape used by in-flight rate-limited terminals (unified rejection shape). No SessionDoc is written for the rejected call. Do not proactively cancel in-flight sessions when transitioning to paused.</action>
    <verify>pnpm -w test --filter @shardworks/nexus-plugin-animator && pnpm -w typecheck</verify>
    <done>Animator owns a status book whose `current` doc accurately reflects pause state; `getStatus()` returns it verbatim; `animate()` rejects with a synthesized rate-limited SessionResult when called while paused, never writing a SessionDoc; back-off arithmetic matches the state machine (coalesce during pause, post-resume-only increment, reset on non-rate-limit terminal); malformed `rateLimitBackoff` throws at startup.</done>
  </task>

  <task id="t4">
    <name>Spider crawl gate, tryCollect branch, and animator-paused block type</name>
    <files>packages/plugins/spider/src/spider.ts, packages/plugins/spider/src/types.ts (if block-type registration is typed there), and any block-type registry module.</files>
    <action>Register a new block type `animator-paused` with a checker that reads Animator status (via `g.apparatus<AnimatorApi>('animator').getStatus()` or the status book read-only handle) and returns `'cleared'` when `state === 'running'` OR `pausedUntil <= now`, otherwise `'pending'`. In `tryCollect`, detect the rate-limited session status (ingested from the provider) and branch before the existing `failEngine(…, retryable: true)` path — transition the engine from `running` to `blocked` with the new `animator-paused` block type (the block-cleared path already returns engine to pending and Spider re-dispatches with a fresh session next tick; no changes to tryRun's dispatch logic needed). In `crawl()`, add a pause gate that short-circuits only `tryRun` and `trySpawn` when Animator reports state `paused` AND `pausedUntil > now`; `tryCollect`, `tryProcessGrafts`, `tryCheckBlocked`, and `autoUnstick` continue normally. When the gate suppresses both dispatch phases and no other phase produced work, `crawl()` returns `null` — do not add a new CrawlResult variant. Do not extend `autoUnstick` for this commission; the block-type machinery handles resume. Do not cancel in-flight sessions on pause transition.</action>
    <verify>pnpm -w test --filter @shardworks/nexus-plugin-spider && pnpm -w typecheck</verify>
    <done>A rate-limited session causes its engine to transition to `blocked` with type `animator-paused`; `crawl()` returns `null` when paused; `tryCheckBlocked` observes the status transition to running and clears the block on the next tick; the engine returns to `pending` and is re-dispatched on the subsequent tick.</done>
  </task>

  <task id="t5">
    <name>Operator CLI tool and Oculus HTTP route for status</name>
    <files>packages/plugins/animator/src/tools/ (new animator-status tool), packages/plugins/animator/src/animator.ts (tool registration), packages/plugins/animator/src/oculus-routes.ts.</files>
    <action>Add an `animator-status` tool with `permission: 'read'`, modeled on `session-list` and `session-show`. The tool reads the status book's `current` doc and returns it. Framework CLI auto-registration picks it up as `nsg animator-status`. Default invocation prints a human-readable multi-line summary (state, pausedUntil with relative time, reason, triggering session); the `--json` flag prints the raw status doc as JSON. Add a new Oculus route `GET /api/animator/status` that returns the same status doc as JSON. Follow the existing oculus-routes.ts pattern for route registration and response shape.</action>
    <verify>pnpm -w typecheck && pnpm -w build && nsg animator-status --json (manual) && curl -s http://localhost:PORT/api/animator/status (manual)</verify>
    <done>The `nsg animator-status` command returns the current status; `--json` produces a machine-parseable representation; `GET /api/animator/status` returns the status doc over HTTP.</done>
  </task>

  <task id="t6">
    <name>Oculus Spider page pause banner and independent status poll</name>
    <files>packages/plugins/spider/src/static/index.html, packages/plugins/spider/src/static/spider.js (and any shared CSS).</files>
    <action>Add a conditional banner element at the top of `<main>`, above the tab bar, hidden by default. Add an independent polling timer in spider.js that fetches `/api/animator/status` on a modest fixed cadence (e.g. 10s) regardless of rig activity (do not gate the status poll on whether any rig is in-flight — the banner must update precisely when no rigs are running). On each response: if `state === 'paused'` AND `pausedUntil > now`, show the banner with the pause reason, formatted `pausedUntil`, and `lastTriggeringSession`; otherwise hide the banner. Keep the implementation in the plain-DOM + `setInterval` style of the existing page — no framework additions. Do not piggyback the status fetch on the rig-list poll.</action>
    <verify>pnpm -w build && manually load the Spider page and trigger a paused state (or mock `/api/animator/status` returning paused) and confirm the banner appears on both tabs and disappears on resume.</verify>
    <done>Banner is visible on both tabs when Animator is paused, shows reason and resume time, and disappears within one poll cadence of Animator transitioning back to running. Status poll runs unconditionally.</done>
  </task>

  <task id="t7">
    <name>Update animator.md apparatus spec to document the rate-limited outcome</name>
    <files>docs/architecture/apparatus/animator.md.</files>
    <action>Update the outcomes enumeration (currently four: provider succeeds / provider fails / provider times out / recording fails) to include the fifth outcome — provider-rate-limited — with a short description of the termination tag, the resulting SessionResult status value, and the effect on Animator's status book. Add a brief note that the status book's CDC stream is designed to be observable by a future Sentinel apparatus (no Sentinel is instantiated here). Do not document operator-triggered pause, Coinmaster integration, or multi-provider state — these are out of scope.</action>
    <verify>Read the updated file and confirm the fifth outcome reads in parallel with the existing four; grep docs for `'rate-limited'` to ensure the status value is documented where onboarding readers will look.</verify>
    <done>animator.md enumerates the rate-limited outcome alongside the existing four; the CDC-Sentinel-substrate note is present; no out-of-scope follow-ups are documented as in-scope.</done>
  </task>
</task-manifest>
