# Reckoner: CDC handler for held-writ scheduling and lifecycle transitions

## Intent

Build the Reckoner's behavioral core: a CDC handler subscribed to
the writs book that watches for held writs (in `new` phase carrying
`ext.reckoner`), evaluates them, and transitions them through the
contract's approve/defer/decline lifecycle. Also writes evaluation
records to the Reckonings book.

This is the commission that turns the Reckoner from a passive
helper-API provider (the previous commission) into an active
scheduler of held writs.

## Motivation

The Reckoner contract (`docs/architecture/petitioner-registration.md`)
specifies that the Reckoner watches CDC events on the writs book,
makes scheduling decisions for held petitions, and transitions them
to active phases (approve), keeps them in `new` (defer), or
transitions them to `cancelled` (decline). It also writes one
reckoning record per non-skip consideration tick to the Reckonings
book as the durable evaluation log.

## Non-negotiable decisions

### CDC subscription on `book.clerk.writs`

The Reckoner subscribes to the auto-wired
`book.clerk.writs.{created,updated}` events via Stacks's CDC
substrate. For each event, it processes per the contract's behavior
spec (§1 of the contract).

### Phase-and-ext gating

Per contract §1's Reckoner-behavior section:

1. Skip writs not in `new` phase.
2. Skip writs without `ext.reckoner`.
3. Source check (use registry from previous commission). Behavior
   under unregistered sources follows `enforceRegistration` config:
   - `false` (default): warn and proceed.
   - `true`: decline (transition to `cancelled` with unknown-source
     reason).
4. Disabled-source check. If source is in `disabledSources`, **skip
   silently** — no transition, no reckoning entry. The writ remains
   eligible if the source is later re-enabled (next consideration
   tick processes it normally).
5. Otherwise: evaluate via the scheduling decision (see below) and
   transition.

### Stub scheduling decision in v0

The combination function (how dimensions become a scheduling
weight) is owned by the Reckoner-core or Reckonings-book commission;
it is out of scope for this contract.

For v0, this commission ships a **stub decision function** that
unblocks downstream development. The exact stub strategy is the
implementer's call — examples:

- Always-approve-immediately (any held writ with valid source is
  approved on first consideration).
- Manual-approval API (`reckoner.markApproved(writId)`) exposed for
  test harnesses.
- Simple severity-based stub (approve if `severity === 'critical'`,
  defer otherwise).

The only requirement is that the lifecycle mechanics work end-to-
end so downstream commissions (and the vision-keeper worked
example) can exercise the contract surface.

### Transition mechanics

- **Approve** → call `clerk.transition(writId, 'open', ...)`. (The
  exact target phase depends on the writ type's lifecycle config; if
  a type's lifecycle uses a different active state, the Reckoner
  uses that. For v0 with `mandate` type, the target is `open`.)
- **Defer** → no transition; append a reckoning entry noting the
  deferral and reason.
- **Decline** → `clerk.transition(writId, 'cancelled', {reason})`.

### Reckonings book writes

For every non-skip consideration, write a reckoning record to the
Reckoner's `reckonings` book. Skipped writs (per
`disabledSources`) do NOT produce reckoning entries. The exact
record schema follows the parallel Reckonings-book commission's
output.

### Idempotent CDC handling

The CDC handler must be idempotent against re-delivery — receiving
the same event twice should not produce two reckoning entries or
two transitions. Standard Stacks CDC idempotency patterns apply.

## Out of scope

- **Combination function for dimension scoring.** Stub-only in v0;
  full implementation belongs to a downstream Reckoner-core or
  Reckonings-book scheduling commission.
- **Operational throttling beyond the simple `disabledSources` skip
  list.** Future enhancement (per contract §6).
- **Patron-bridge integration.** Out of scope per the contract.
- **Vision-keeper example.** Separate commission.

## Behavioral cases

- A writ posted in `new` with valid `ext.reckoner` is approved
  (per stub) and transitioned to `open` (or type-equivalent), with
  a reckoning entry recording the approve decision.
- A writ posted with an unregistered source and
  `enforceRegistration: false` is processed normally; a warning is
  logged.
- A writ posted with an unregistered source and
  `enforceRegistration: true` is transitioned to `cancelled` with
  reason naming the unknown source; a reckoning entry records the
  decline.
- A writ posted with a source in `disabledSources` is left in `new`
  phase indefinitely; no transition happens, no reckoning entry is
  written. After config update removes the source from
  `disabledSources`, the next consideration tick processes the
  writ normally.
- Withdrawal mid-flight: a `cancelled` transition while the writ
  is in `new` causes the Reckoner to stop considering it (the writ
  is in a terminal state).
- CDC re-delivery: the same event delivered twice produces one
  reckoning entry and one transition (idempotent).
- A writ in `new` without `ext.reckoner` is ignored entirely — no
  reckoning entry, no transition; some other authority owns the
  writ's transition.

## Dependencies

- **Required: Clerk `WritDoc.ext` and `setWritExt` API** (separate
  commission, transitively).
- **Required: Reckoner core** (registry, configuration, helper APIs)
  — separate commission this one follows.
- **Required: Reckonings book schema** — owned by the parallel
  Reckonings-book commission. The exact record schema and write API
  for evaluation log entries comes from there. This commission
  cannot land until that schema is finalized.

## References

The Reckoner contract: `docs/architecture/petitioner-registration.md`
(§1 reckoner-behavior section, §8 Reckonings book).