# Spider Dispatch Gating via `spider.follows`

## Intent

Wire the Spider so that writ dispatch can be gated on outbound links of a load-bearing kind that expresses precedence. A writ that depends on others is held until those others reach a terminal state; success releases the gate, non-success terminal states put the dependent into `stuck`. Recovery (a previously failed dependency eventually succeeding) auto-unsticks the dependent. Cycles in the dependency graph are detected by Spider and surfaced as a stuck condition. This is the first real consumer of the link-kind substrate and the first writer of the per-plugin observation slot on writs.

## Motivation

Two pieces of substrate have been landed in prior commissions — the link-meaning layer (renamed to link-*kinds* with `label`/`kind` fields) and the per-plugin observation slot on writs (`status.<pluginId>`). Both are in place but unused. No plugin currently reacts to a kind. No plugin currently writes into the observation slot.

The Spider currently dispatches every `open` writ of a dispatchable type as soon as concurrency allows, with no awareness of relationships between writs. Any real workflow with ordering (build before deploy, parent before child wrap-up, one commission depends on another, etc.) has to rely on the operator authoring writs in a specific sequence and never benefits from the substrate that exists for exactly this purpose.

Spider is the natural first consumer because it already owns the dispatch decision. The questions that needed answering — composition, re-evaluation mechanism, cycle handling, recovery semantics, provenance — were worked through in the click subtree at `c-mo2e88aw-f4d5684cf385`.

## Non-negotiable decisions

### The kind: `spider.follows`

A new link-kind contributed by the Spider plugin.

**Description (verbatim):** *"The source writ is a precedence-successor of the target: source cannot be dispatched until the target reaches a terminal state. Consumers define their own policy for what happens on each terminal state."*

The kind is a pure temporal-ordering contract. Spider's specific policy (stuck-on-failure, auto-unstick on recovery) is its own consumer-side behavior, not part of the kind's meaning. A future consumer with different recovery semantics could legitimately bind to the same kind.

Spider registers the kind through the existing `supportKit.linkKinds` contribution mechanism; Clerk consumes it through the existing kit substrate.

### Composition: conjunctive

Multiple outbound `spider.follows` links from a single writ are conjunctive — *all* targets must release before the dependent dispatches. Any single non-terminal blocker keeps the gate closed; any single failed blocker puts the dependent into `stuck`.

### Direction: outbound from the dependent

A writ's own dependencies are its *outbound* `spider.follows` links (source → target means "source depends on target"). Spider reads the candidate writ's outbound links and inspects the target writs' phases. "Inbound on the target" and "outbound on the source" are the same edges; the outbound reading matches the directional semantics and avoids inverting the kind's meaning at the read site.

### Re-evaluation: Spider's poll

Gate state is re-evaluated on Spider's existing crawl loop. No new event-dispatch substrate is required. The same poll that picks up newly-eligible writs also re-walks the dependencies of currently-gated and currently-stuck writs.

### Cycle handling: Spider detects, Clerk stays thin

Cycles in the `spider.follows` graph are detected by Spider during gate evaluation, not prevented by Clerk at link-creation. Clerk remains link-kind-agnostic. Cycle detection runs per-evaluation (during the same graph walk that evaluates gates), not as a separate periodic scan. A cycle puts every writ in the cycle into `stuck` with a clear cycle-related reason; cycles are recoverable (when one member transitions out via external action, the others auto-unstick on the next poll).

### Auto-unstick on recovery

When a previously-failed blocker eventually reaches success (typically via operator-driven retry), Spider auto-unsticks the gated dependent on the next poll, returning it to `open`. Rationale: the operator's action *was* fixing the dependency; requiring a second manual unstick step is redundant ceremony. The gated state is purely derived from blocker state; once the cause is resolved, the symptom is resolved.

### Provenance: Spider records its own causes

Spider only auto-unsticks writs whose stuck transition Spider itself authored. The mechanism is the per-plugin observation slot established in the prior status-convention commission: Spider writes its stuck-cause provenance into its own sub-slot (`status.spider`). This cleanly separates Spider-authored stucks from stucks caused by other actors (operator, future plugins, engine cascade), which Spider will not touch.

The engine-cascade stuck path (when a rig's engine fails and Spider transitions the writ to stuck with a resolution) does *not* write into the Spider sub-slot. Absence-of-cause on a stuck writ uniquely means "not Spider's gating doing this."

### Terminal-state handling on blockers

| Blocker state | Gate behavior |
|---|---|
| `completed` | Release the gate (contributes to the "all blockers terminal and successful" predicate). |
| `cancelled` | Treated the same as `completed` for gate-release purposes. Cancellation is an operator-chosen terminal outcome; dependent writs should not stuck-cascade from it. |
| `failed` | Cascade to `stuck` on the dependent with `stuckCause = 'failed-blocker'`. |
| Any non-terminal (`new`, `open`, `stuck`) | Gate remains closed; dependent stays `open`. |

### Stuck cascade scope: direct dependents only

When a blocker ends in `failed`, Spider transitions only the *directly* dependent writ to `stuck`. Transitive cascade (sticking writs that depend on the newly-stuck one) is not done as a single atomic pass — the next Spider poll naturally evaluates those writs against their own blockers and sticks them through the same mechanism. This keeps each per-poll action scoped to one edge.

### Stuck reason text

Operator-facing `resolution` text on a Spider-stuck writ is human-readable and names the specific blockers by short id:

- *"Blocked by failed dependency: w-abc123"*
- *"Blocked by failed dependencies: w-abc123, w-def456"* (multiple)
- *"Cycle detected in spider.follows graph"*

The structured detail (which blockers, which phases, when observed) lives in `status.spider` — `resolution` is the human summary; the status slot is the machine-readable truth.

### Lifecycle of a gated writ

Gating happens entirely from `open`. The `new` phase means draft (author still amending) and is out of scope for Spider gating.

| Transition | Trigger |
|---|---|
| `new` (draft) — out of scope | Author amending; Spider does not touch. |
| `open` (gated) — Spider sees, skips dispatch | Outbound `spider.follows` blocker is non-terminal. |
| `open` → dispatched | All blockers in terminal success states (completed or cancelled). |
| `open` → `stuck` (failed dependency) | A blocker reached `failed`. Spider writes `status.spider.stuckCause = 'failed-blocker'` and the human resolution text. |
| `open` → `stuck` (cycle) | Spider detected a cycle. All cycle members stuck with `stuckCause = 'cycle'`. |
| `stuck` → `open` (auto-unstick) | All previously-failed blockers eventually reached terminal success (or the cycle was broken). Spider clears its `status.spider.stuckCause`. |

A known visibility gap: `open` overloads "finalized-and-waiting-on-gate", "finalized-and-eligible", and "actively-running". Captured separately at `c-mo301yp9` (parked) for future surfacing work — likely an Oculus column reading from the Spider status sub-slot.

### Authoring surfaces expose both `label` and `kind`

Wherever a link can be created interactively, both fields are first-class inputs with the right control type for each. This commission completes the Oculus side of that story:

- **CLI.** `nsg writ link` already exposes both `label` and `--kind` (landed with the link-substrate rename commission). No further CLI work here.
- **Oculus writ page.** The inline add-link form today exposes only the casual label input. This commission adds a `kind` dropdown sourced from the kit-contributed registry (`listKinds()`). Operators do not type kind ids by hand. The label input and its autocomplete datalist are preserved; the dropdown is additive. When the operator submits a link, if the kind is rejected by Clerk (unknown/unregistered) the error surfaces inline on the form, not as a page-level failure.

Authoring with `kind` omitted creates a documentary link (`kind = null`); this is the casual-tagging path and remains supported.

## Out of scope

- **Database / data migration of existing data.** Handled out of band by the patron. No existing links carry `kind = 'spider.follows'`; a retroactive cycle scan is moot.
- **New CLI command for `spider.follows`.** The existing `nsg writ link` is the authoring surface — no Spider-specific command.
- **A richer link-authoring UI in Oculus** (writ picker with search, kind-aware suggestions, etc.). The existing inline add-link form on the writ page is extended to add the `kind` dropdown; no broader UX redesign.
- **Oculus rendering of the Spider sub-slot** on the writ table (e.g. a gate column). Natural next step but a separate commission.
- **Introducing the status convention on non-writ runtime objects.** The slot remains writ-only in this commission. Rigs, engines, sessions adopt it when their first consumer needs it.
- **Closing the open-phase visibility gap.** Captured at `c-mo301yp9` (parked).
- **Hopper concurrency interactions.** Gate evaluation is upstream of concurrency; no change to existing concurrency limits or scheduler behavior.
- **Event-dispatch substrate / Clockworks integration.** The polling decision is deliberate; this commission does not introduce or rely on event-dispatch substrate.
- **Any change to the existing engine-cascade stuck path** (where a rig's engine failure transitions the writ to stuck). That path is untouched; Spider's auto-unstick logic simply skips writs whose sub-slot cause is absent.

## References

- **Design subtree** (this commission): click `c-mo2e88aw-f4d5684cf385` and its concluded children.
- **Prior substrate commissions this one depends on** (both dispatched separately before this one):
  - Link-substrate rename sweep — introduces the `kind` field, `listKinds()`, and the dot-form id separator that `spider.follows` uses.
  - Status convention on writs — introduces the `status: Record<PluginId, unknown>` observation slot that `status.spider` lives in.
- **Status-convention design** (referenced by the prior brief; relevant here for the sub-slot semantics Spider consumes): click `c-mo33duvq-7f774446c6c9` and its concluded children.
- **Final kind naming** (`spider.follows`): click `c-mo2zim46-8a9e69f209f3` (name + description), with the id-format adjustment at `c-mo3465sf-d9187bc9322a`.
- **Visibility-gap follow-up** (parked): click `c-mo301yp9-c186db746a77`.