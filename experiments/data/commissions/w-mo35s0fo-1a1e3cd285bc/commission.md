# Spider Dispatch Gating via `spider.follows`

## Intent

Wire the Spider so that writ dispatch can be gated on inbound links of a load-bearing kind that expresses precedence. A writ that depends on others is held until those others reach a terminal state; success releases the gate, non-success terminal states put the dependent into `stuck`. Recovery (a previously failed dependency eventually succeeding) auto-unsticks the dependent. Cycles in the dependency graph are detected by Spider and surfaced as a stuck condition.

This commission is the first real consumer of the link-meaning substrate. Alongside the Spider gating work, it tightens two pieces of substrate that this consumer pressure-tests:

- **Status convention** for runtime objects (Kubernetes-style spec/status split). Spider needs a place to record its own observed state and the provenance of stuck transitions. This first slot is named here; the convention generalizes to other plugins.
- **Naming sweep on the link-meaning substrate** — its current field names actively mislead readers and its id format is inconsistent with the rest of the system. This commission lands the corrections.

## Motivation

The link-meaning substrate is in place but unused. No plugin reacts to a meaning yet. The Spider currently dispatches every `open` writ of a dispatchable type as soon as concurrency allows, with no awareness of relationships between writs. Any real workflow with ordering (build before deploy, parent before child wrap-up, etc.) has to rely on the operator authoring writs in a specific sequence and never benefits from the substrate that exists for exactly this purpose.

Spider is the natural first consumer because it already owns the dispatch decision. The questions that needed answering — composition, re-evaluation mechanism, cycle handling, recovery semantics, provenance — were worked through in the click subtree at `c-mo2e88aw-f4d5684cf385`.

## Non-negotiable decisions

### The kind: `spider.follows`

A new link-kind contributed by the Spider plugin.

**Description (verbatim):** *"The source writ is a precedence-successor of the target: source cannot be dispatched until the target reaches a terminal state. Consumers define their own policy for what happens on each terminal state."*

The kind is a pure temporal-ordering contract. Spider's specific policy (stuck-on-failure, auto-unstick on recovery) is its own consumer-side behavior, not part of the kind's meaning. A future consumer with different recovery semantics could legitimately bind to the same kind.

### Composition: conjunctive

Multiple inbound `spider.follows` links are conjunctive — *all* must release before the dependent dispatches. Any single non-terminal blocker keeps the gate closed; any single failed blocker puts the dependent into `stuck`.

### Re-evaluation: Spider's poll

Gate state is re-evaluated on Spider's existing crawl loop. No new event-dispatch substrate is required. The same poll that picks up newly-eligible writs also re-walks the dependencies of currently-gated and currently-stuck writs.

### Cycle handling: Spider detects, Clerk stays thin

Cycles in the `spider.follows` graph are detected by Spider during gate evaluation, not prevented by Clerk at link-creation. Clerk remains link-kind-agnostic. A cycle puts every writ in the cycle into `stuck` with a clear cycle-related reason; cycles are recoverable (when one member transitions out via external action, the others auto-unstick on the next poll).

### Auto-unstick on recovery

When a previously-failed blocker eventually reaches success (typically via operator-driven retry), Spider auto-unsticks the gated dependent on the next poll, returning it to `open`. Rationale: the operator's action *was* fixing the dependency; requiring a second manual unstick step is redundant ceremony. The gated state is purely derived from blocker state; once the cause is resolved, the symptom is resolved.

### Provenance: Spider records its own causes

Spider only auto-unsticks writs whose stuck transition Spider itself authored. The mechanism is the new status convention (see below): Spider records `stuckCause` and supporting detail in its own status slot. This cleanly separates Spider-authored stucks from stucks caused by other actors (operator, future plugins, engine cascade), which Spider will not touch.

### Authoring surfaces expose both `label` and `kind`

Wherever a link can be created interactively, both fields are first-class inputs with the right control type for each:

- **CLI** (`nsg writ link …`) accepts `label` as a positional/named argument and `kind` as an optional flag. Both are documented in the command's help text. (The existing command already supports the equivalent shape under the old names; this commission carries the rename through and tightens the help text.)
- **Oculus writ page** has an inline add-link form on each writ. Today it exposes only the casual label (under the old name); this commission completes it: `label` stays as a free text input (its existing autocomplete datalist is preserved), and a new `kind` control is added as a dropdown sourced from the kit-contributed registry (`listKinds()`). Operators don't type kind ids by hand. The unlink controls and link-row rendering rename in lockstep with the underlying field.

Authoring with `kind` omitted creates a documentary link (`kind = null`); this is the casual-tagging path and remains supported on every authoring surface.

### Stuck reason text

Operator-facing `resolution` text on a Spider-stuck writ is human-readable and names the specific blockers by short id:

- *"Blocked by failed dependency: w-abc123"*
- *"Blocked by failed dependencies: w-abc123, w-def456"* (multiple)
- *"Cycle detected in spider.follows graph"*

The structured detail (which blockers, which states, when observed) lives in the Spider status slot — `resolution` is the human summary; status is the machine-readable truth.

### Lifecycle of a gated writ

Gating happens entirely from `open`. The `new` status means draft (author still amending) and is out of scope for Spider gating.

| Transition | Trigger |
|---|---|
| `new` (draft) — out of scope | Author amending; Spider does not touch. |
| `open` (gated) — Spider sees, skips dispatch | Inbound `spider.follows` blocker is non-terminal. Spider records waiting-state in its status slot. |
| `open` → dispatched | All blockers reached success terminal state. |
| `open` → `stuck` (failed dependency) | A blocker reached a non-success terminal state (failed/cancelled). |
| `open` → `stuck` (cycle) | Spider detected a cycle during gate-graph walk. |
| `stuck` → `open` (auto-unstick) | All previously-failed blockers eventually reached success (or cycle resolved). |

A known visibility gap: `open` now overloads "finalized-and-waiting", "finalized-and-eligible", and "actively-running". Captured separately at `c-mo301yp9` (parked) for future surfacing work — likely an Oculus column reading from the Spider status slot.

## Substrate changes

Two substrate adjustments land alongside the Spider work. Both are informed and motivated by Spider being the first real consumer; the substrate as it exists today carries decisions made before any consumer pressure-tested it.

### Status convention for runtime objects

Adopt a Kubernetes-style spec/status split for runtime objects. Each runtime object carries a per-plugin status namespace; each plugin owns the slot at `status.<pluginId>` and writes only its own slot. Other plugins (and Oculus) read freely. The convention is enforced by convention only — no runtime permission system in v1.

Decisions that apply to the convention (full design at `c-mo33duvq-7f774446c6c9`):

- **Ownership** — convention only, not enforced.
- **Change events** — status mutations emit Stacks events the same as any other field mutation. Watchers can react to status changes.
- **Persistence** — status persists for the lifetime of the object, including across terminal states.
- **Concurrent writes** — last-writer-wins per key, no merge semantics. Plugins serialize their own writes if they need stronger semantics.
- **Typed contributions (deferred)** — eventually plugins may declare their status shape via kit contribution for type-checking. Not required in v1.

In this commission, the convention is added to writs only — Spider is the only consumer. The convention is documented as guild-wide; other runtime objects (rigs, engines, sessions, etc.) adopt it when their first consumer needs the slot.

### Link-kind substrate naming sweep

The link-meaning substrate landed before any consumer used it. Two naming choices need correcting before the substrate has a real consumer.

**Field renames on the link record:**

| Old | New | Why |
|---|---|---|
| `type` | `label` | "type" misleads readers into thinking the field is load-bearing; it is explicitly not. "label" signals display/tagging. |
| `semanticMeaning` | `kind` | "semanticMeaning" is a mouthful; "kind" is the conventional name for a load-bearing classification id (consistent with Kubernetes' `kind` field, which the status convention also references). |

**Vocabulary sweep across the substrate** for consistency:

| Old | New |
|---|---|
| `linkMeanings` (kit field) | `linkKinds` |
| `MeaningDoc` | `KindDoc` |
| `listMeanings()` | `listKinds()` |
| `MeaningEntry` and other related names | `KindEntry`, etc. |
| All prose, docstrings, README examples | Updated in lockstep |

**Id separator: colon → dot.** Plugin-namespaced identifiers across the system (role contributions like `astrolabe.plan-init`, event patterns like `writ.created`, etc.) use dots. The link-kind substrate using colons (`astrolabe:refines`) was the outlier. Convention captured at `c-mo34644p`. After this commission, all plugin-namespaced ids — including link-kind ids — use the dot form.

## Out of scope

- **Database / data migration of existing data.** Handled out of band by the patron. The brief assumes the implementing artificer can do an in-place rename across code and docs without simultaneously migrating live records.
- **New CLI command for `spider.follows`.** The existing `nsg writ link` (post-rename) is the authoring surface — no `spider`-specific command. The CLI's `label`/`kind` exposure is in scope (see "Authoring surfaces" above) but no new commands are introduced.
- **A richer link-authoring UI in Oculus** (writ picker with search, kind-aware suggestions, etc.). The existing inline add-link form on the writ page is extended in scope (see "Authoring surfaces"), but no broader UX redesign.
- **Oculus rendering of Spider's status slot.** A natural next step (gate column on the writ table, etc.) but a separate commission.
- **Status convention for non-writ runtime objects.** Status is added to writs only in this commission. Other runtime objects adopt it when their first consumer needs it.
- **Ownership enforcement of status slots** at runtime. Convention only in v1.
- **Typed contributions for plugin status shapes.** Deferred (parked at `c-mo33e194`).
- **Closing the open-status visibility gap.** Captured at `c-mo301yp9` (parked).
- **Retroactive cycle scan of existing data.** No existing links are `spider.follows`; a scan is moot.
- **Hopper concurrency interactions.** Gate evaluation is upstream of concurrency; no change to existing concurrency limits.
- **Anything that depends on Clockworks / standing orders.** The polling decision is deliberate; this commission does not introduce event-dispatch substrate.

## References

- **Design subtree** (this commission): click `c-mo2e88aw-f4d5684cf385` and its concluded children.
- **Status convention** design: click `c-mo33duvq-7f774446c6c9` and its five concluded children (one parked: typed contributions).
- **System-wide separator convention** (dots for plugin-namespaced ids): click `c-mo34644p-2aebcbb478bb`.
- **Link-substrate naming sweep** (label, kind, vocabulary): click `c-mo34jdht-c9bbe8fe43f3`.
- **Final kind naming** (`spider.follows`): click `c-mo2zim46-8a9e69f209f3` (name + description), with the id-format adjustment captured at `c-mo3465sf-d9187bc9322a`.
- **Visibility-gap follow-up** (parked): click `c-mo301yp9-c186db746a77`.
- **Prior substrate brief** (introduces the link-meaning layer this commission consumes and renames): `.scratch/brief-writ-link-meaning-substrate.md`.