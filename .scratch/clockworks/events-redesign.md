# Clockworks events redesign — working document

> **Status:** active design conversation, not yet a brief.
> Started: 2026-04-26 / 2026-04-27 (sessions "free", "clockworks").
> Root click: `c-mog0glxx`.

This document captures the locked decisions, open questions, and the
currently-emitted event inventory for the Clockworks events redesign.
It exists so we can annotate, share, and iterate without re-deriving
context every session. Once the design stabilizes, content here
graduates into a brief (or set of briefs) for dispatch.

---

## 1. Motivation

Two intertwined gaps in today's Clockworks events surface:

- **No kit-contribution path for events.** `RESERVED_EVENT_NAMESPACES`
  is a hardcoded const in two places (`signal-validator.ts` plus a
  hand-mirrored copy in the framework CLI). New plugins claiming a
  prefix have to either edit the hardcoded const or declare each event
  individually in `guild.json`. There is no `supportKit.events`
  channel.
- **The aspirational doc claim is fictional.** Type comments say
  "framework events are declared by the plugins that produce them";
  the only mechanism actually backing that claim is the
  reserved-namespace bypass — plugins emit via direct `api.emit()`
  with a reserved prefix, no declaration anywhere.

Symptoms include: `book.` and `reckoning.` not being reserved despite
being framework-emitted (a current spoofing vector); the two-place
hardcoded const drifting silently; the CLI's hand-mirror requiring a
test-asserted lockstep; observation-set writs surfacing repeatedly to
flag the same kinds of namespace gaps. The structural fix is one
mechanism that closes all of these together.

---

## 2. Locked decisions

### 2.1 Events stay in Clockworks
Events, `emit()`, dispatch, schedule, validator, and the events book
all stay in the Clockworks plugin. Pattern C (move events book to
Stacks) was rejected — events are *messaging*, not *substrate*. The
fact that emit happens to write a row is an implementation detail of
how Clockworks persists messages, not a reason to relocate the
abstraction.

### 2.2 Strict declaration-emission coupling (advisory, not enforced)
A plugin only emits events it declared in its kit. Declaring without
emitting is nonsense; emitting without declaring is nonsense. This
is the principle the design rests on.

**Enforcement is documentation-only in v0.** The kit declaration is
the authoritative source of truth for a plugin's event vocabulary;
matching emit call sites to that declaration is the plugin author's
responsibility, guided by docs and convention. No compile-time
union, no build-time audit, no runtime check on framework emissions.
Unprivileged callers (anima `signal` tool, operator `nsg signal`)
are still gated by the runtime validator against the merged
kit-declaration set — that's the only enforcement boundary.
Resolves `c-mog4iwo1`.

### 2.3 Kit-events replaces the hardcoded const
`RESERVED_EVENT_NAMESPACES` goes away (or shrinks to a tiny
framework-internal core). Plugins declare event vocabulary via
`supportKit.events`. The CLI's hand-mirrored copy of the const dies
along with it.

### 2.4 Kit shape: flat map, static or function

```ts
type EventsKitContribution =
  | Record<string, EventSpec>
  | ((ctx: StartupContext) => Record<string, EventSpec>);

type EventSpec = {
  description?: string;
  // schema?: ...   // reserved for future, non-breaking addition
};
```

A plugin's events kit contribution is **the declared set itself** —
event-name → spec — with no wrapper field. No `namespaces` /
prefix-claim channel for v0; if genuine demand surfaces later we
can add it non-breakingly by widening the contribution type.

The function form is the escape hatch for runtime-derived
contributions: a plugin whose declared set depends on other plugins'
kit contributions (e.g., `clockworks-stacks-signals` walks
`ctx.kits('books')` to enumerate every observed book × verb
combination). Function contributions must be pure — read from
`ctx`, return data. Future per-event metadata (payload schemas,
deprecation flags, etc.) lands on `EventSpec`, not on a wrapper —
keeps the contribution shape flat.

Resolves the `declared`-naming concern by removing the wrapper.

### 2.5 `guild.json` overrides plugin declarations
When the merged plugin kit declarations and `guild.json
clockworks.events` declarations include the same event name,
**`guild.json` takes precedence — its declaration replaces the
plugin's**, not augments. This gives operators a clear escape hatch
for redefining (or temporarily overriding) plugin-contributed event
metadata without forking the plugin. Resolves `c-mog0gsq0`.

### 2.6 Bridge-translator plugin: `clockworks-stacks-signals`
A separate plugin sits above Stacks and Clockworks, watches Stacks
CDC, formats observations into events, and emits them through
Clockworks. Clockworks itself stops carrying observational events.

- **Plugin id: `clockworks-stacks-signals`** — names the relationship
  precisely (a Clockworks extension that sends signals for Stacks
  events). Generalizes for future siblings if needed
  (`clockworks-<source>-signals`).
- Concerns separate cleanly: Clockworks = messaging; this plugin =
  "I observe Stacks state and announce it."
- Optional install: guilds that don't want CDC-as-events skip it.
- Events emitted by this plugin use **domain naming** rather than
  plugin-id prefix (see §2.8).

### 2.7 Plugin-id prefix is recommended default, not enforced
The kit-merge collision check enforces uniqueness across the merged
declaration set. The convention guides authors toward plugin-id
prefix (`<plugin>.<...>`) as the default for events the plugin owns
about its own behavior.

### 2.8 Domain naming for cross-plugin domains
Two recognized exceptions to the plugin-id-prefix default, both
falling out of the same principle: when an event describes a
**domain that crosses plugin boundaries**, the domain noun wins over
the emitter's plugin id.

- **`writ.*`** — multiple plugins register writ types (Clerk owns
  `mandate`; Astrolabe owns `step`, `observation-set`; Cartograph
  owns `vision`, `charge`, `piece`). The writ lifecycle is a
  substrate-level concept, not Clerk-specific.
- **`book.*`** — emitted by `clockworks-stacks-signals` about the
  union of all plugin-declared books. The event is about the book,
  not about the bridge plugin.

The principle: when multiple plugins legitimately contribute to a
shared domain, names live in that domain rather than in any one
plugin's prefix.

### 2.9 Migration is in scope
This redesign rewrites the existing event surface, not just the
declaration mechanism. The §3 tables specify the migration: which
events are renamed, which are deleted, which are generalized. Net
effect (see §3.8): 23 distinct names today → 8 surviving patterns
post-migration.

### 2.10 The two tactical drafts are parked
Two existing `new`-phase mandate writs are subsumed by this design
and stay parked as references:
- `w-moet01j7` — reserve `book.` namespace
- `w-moewkq8a` — reserve `reckoning.` namespace

Whatever ships from this design supersedes both.

---

## 3. Migration plan — events table by emitter

Every `emit()` call site in the framework source as of 2026-04-27.
Excludes tests, `dist/`, `node_modules/`. Lattice `pulse` events not
listed (different system).

Each surviving event has a **post-migration name** and a **was**
column showing the source name. Deleted events are listed in §3.7.

### 3.1 Clockworks-internal events

| Post-migration name | Was | Call site | What it signals |
|---|---|---|---|
| `clockworks.standing-order.failed` | `standing-order.failed` | `clockworks.ts:239,280` | Dispatcher or scheduler-sweep failed to invoke a relay |
| `clockworks.timer` | `schedule.fired` | `scheduler.ts:240` (direct `events.put`) | A scheduled standing order fired at its next-fire-time boundary |

### 3.2 Writ lifecycle (Clockworks observer on Clerk's writs book)

The `<type>.{ready,stuck,completed,failed}` pattern generalizes to
`writ.<type>.<status>` — both axes dynamic. This unlocks plugin
writ types that register non-canonical statuses (the current
`lifecycleSuffix()` function returns null for any phase outside the
hardcoded four; under the new shape every registered status fires).

| Post-migration name | Was | Trigger | What it signals |
|---|---|---|---|
| `writ.<type>.<status>` | `<type>.{ready,stuck,completed,failed}` | any phase delta where the new phase is a registered status | Writ entered the named status |

Domain-named (`writ.`) per §2.8 — writ types come from multiple
plugins; the lifecycle is a cross-plugin domain.

### 3.3 `clockworks-stacks-signals` events

Emitted by the new bridge plugin. Domain-named per §2.8.
Implementation owned by `clockworks-stacks-signals/start()`; today's
inline CDC auto-wiring code in `clockworks.ts:454` relocates here.

| Post-migration name | Was | Trigger | What it signals |
|---|---|---|---|
| `book.<owner>.<book>.<verb>` | `book.<owner>.<book>.<verb>` (relocated; same name) | Phase-2 CDC observation on any non-events book | A row was created/updated/deleted |

Declared via the kit's function form: walks `ctx.kits('books')` at
plugin start, enumerates every `book.<owner>.<bookName>.<verb>` for
the three verbs, produces a flat declared map.

### 3.4 Animator session events

| Post-migration name | Was | Trigger | What it signals |
|---|---|---|---|
| `animator.session.started` | `session.started` | session enters `running` | Anima session begun |
| `animator.session.ended` | `session.ended` | session terminal-emit | Anima session ended (any outcome) |
| `animator.session.record-failed` | `session.record-failed` | session record write failed | Detached session recording failed |

### 3.5 Astrolabe (no change)

| Post-migration name | Was | Call site | What it signals |
|---|---|---|---|
| `astrolabe.plan.files-over-threshold` | (unchanged) | `engines/plan-finalize.ts:115` | Plan finalize detected manifest file count exceeded the configured threshold (soft warn) |

### 3.6 CLI plugin commands

All deleted — see §3.7.

### 3.7 Deleted events

| Deleted name | Source | Reason |
|---|---|---|
| `guild.initialized` | `clockworks.ts:472` | Single-fire-per-guild signal not pulling its weight |
| `migration.applied` | `clockworks.ts:594` | Per-`(plugin,book)` first-observation signal not pulling its weight |
| `commission.posted` | writ-lifecycle observer | Commissions no longer treated as a special case — covered by `writ.mandate.<status>` |
| `commission.state.changed` | writ-lifecycle observer | Same |
| `commission.sealed` | writ-lifecycle observer | Same (was already a duplicate of `commission.completed`) |
| `commission.completed` | writ-lifecycle observer | Same |
| `commission.failed` | writ-lifecycle observer | Same |
| `commission.session.ended` | Animator `session-emission.ts` | Commissions not a special case; cross-plugin emit was the symptom of the wrong abstraction |
| `anima.manifested` | Animator `session-emission.ts` | Subsumed by `animator.session.started` for v0 |
| `anima.session.ended` | Animator `session-emission.ts` | Subsumed by `animator.session.ended` |
| `tool.installed` | CLI `plugin.ts:175` | Bootstrap-and-emit pattern not earning its complexity |
| `tool.removed` | CLI `plugin.ts:222` | Same |

### 3.8 Tally

- **Pre-migration:** 23 distinct event names emitted in source.
- **Post-migration:** 8 surviving patterns:
  - `clockworks.standing-order.failed`
  - `clockworks.timer`
  - `writ.<type>.<status>`
  - `book.<owner>.<book>.<verb>` (relocated to `clockworks-stacks-signals`)
  - `animator.session.started`
  - `animator.session.ended`
  - `animator.session.record-failed`
  - `astrolabe.plan.files-over-threshold`
- **12 events deleted outright**, 3 renamed in place, 3 prefix-added,
  4 generalized into 1 pattern, 1 relocated.
- **Cross-plugin emit anomaly resolved.** The Animator-emits-into-Clerk's-namespace
  case (`commission.session.ended`) is gone via deletion.
- **Naming distribution post-migration:** 5 plugin-id-prefixed,
  2 domain-named (`writ.*`, `book.*`), 1 unprefixed-but-singular
  (`clockworks.timer` is plugin-id-prefixed).

---

## 4. Open questions

### 4.1 Subclicks under the kit-events design (`c-mog0glxx`)

| Click | Status | Question |
|---|---|---|
| `c-mog0gsbb` | resolved (§2.4) — flat map, static or function | Kit shape |
| `c-mog4iwo1` | resolved (§2.2) — advisory only, no enforcement | Compile-time enforcement of declaration-emission coupling |
| `c-mog0gsq0` | resolved (§2.5) — `guild.json` replaces, doesn't merge | Layering with `guild.json` |
| `c-mog0gt4l` | open | How does the framework CLI's signal validator consume the merged event set without depending on plugin packages? |
| `c-mog0gtja` | open (partly resolved by §3 deletions; transition mechanics remain) | Migration of the 8 currently-hardcoded prefixes |

### 4.2 Adjacent: CDC scalability subtree (`c-mofxdnp3`)

Separate but interacting umbrella — the answers there shape what
the events book actually has to handle. Subclicks:

| Click | Question |
|---|---|
| `c-mofxqo95` | Where are the write-volume cliffs? |
| `c-mofxqons` | Retention strategy for `clockworks/events`? |
| `c-mofxqp25` | Crash-window lost-message implications? |
| `c-mofxrqqc` | Substitute substrate with a third-party MQ? |
| `c-mog0mnlj` | Suppress emission when no standing order would consume the event? |

---

## 5. Click index (for navigation)

Top-level umbrellas:
- `c-mog0glxx` — Kit-events redesign (this design's root).
- `c-mofxdnp3` — CDC scalability (the runtime-cost umbrella).
- `c-mof8ixy2` (parked) — Observation-set volume management.

Tactical drafts parked as references:
- Writ `w-moet01j7` (reserve `book.` namespace) — `new` phase.
- Writ `w-moewkq8a` (reserve `reckoning.` namespace) — `new` phase.

---

## 6. Editing convention

- This file is the single source of design truth for the events
  redesign until a brief is dispatched.
- Sean annotates the §3 tables directly when proposing changes.
- Decisions get promoted from §4 to §2 as they lock; mark them with
  the click id whose conclusion records the call.
- When the design is ready to ship, this file becomes the input to a
  brief (or batch of briefs); this file gets deleted post-dispatch
  per the briefs skill.
