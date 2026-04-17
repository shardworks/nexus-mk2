# Link-Substrate Rename Sweep

## Intent

Rename the link-meaning substrate's fields, types, and vocabulary to their load-bearing final names — `type → label`, `semanticMeaning → kind`, and the surrounding type/method/field names in lockstep — and unify the separator for plugin-namespaced identifiers to a single form (dot). No behavior change, no new consumer, no new UI. This commission is a pure refactor whose job is to land correct names *before* the first real consumer (Spider) arrives in a downstream commission.

## Motivation

The link-meaning substrate landed before any plugin pressure-tested it, and two naming choices are actively misleading readers:

- `type` on the link record reads as load-bearing, but explicitly is not — it is the casual human label. The load-bearing field is `semanticMeaning`. Readers reach for `type` and bind to it, which is the opposite of the design.
- `semanticMeaning` is a mouthful for what is conventionally called `kind` across most systems that distinguish identity from label (notably Kubernetes, which this codebase increasingly references).

Separately, plugin-namespaced identifiers across the guild (role contributions, rig templates, event patterns) use dots (`astrolabe.plan-init`). Link-kind ids were the outlier, using colons (`astrolabe:refines`). The inconsistency forces readers to remember which grammar applies where.

Both corrections are safe to land now because *no plugin currently registers a link kind*. The link-meaning substrate has zero production consumers — the first consumer (Spider) arrives in a separate downstream commission. Renaming now is the cheapest it will ever be.

## Non-negotiable decisions

### Field renames on the link record

| Old | New | Why |
|---|---|---|
| `type` | `label` | "type" misleads readers into binding to the field; "label" signals display/tagging. |
| `semanticMeaning` | `kind` | "kind" is the conventional name for a load-bearing classification id across most systems. |

### Vocabulary sweep across the substrate

All types, methods, kit fields, and prose follow the field rename in lockstep:

| Old | New |
|---|---|
| `linkMeanings` (kit contribution field) | `linkKinds` |
| `MeaningDoc` | `KindDoc` |
| `MeaningEntry` | `KindEntry` |
| `listMeanings()` | `listKinds()` |
| `consumes: ['linkMeanings']` | `consumes: ['linkKinds']` |
| Prose, docstrings, README examples, instructions text | Updated in lockstep |

### Id separator: colon → dot

Plugin-namespaced identifiers across the guild use dots. Link-kind ids (currently the lone outlier at `astrolabe:refines`) join the convention. After this commission, all plugin-namespaced ids — including link-kind ids — use the dot form. Convention captured at `c-mo34644p`.

**Scope of the separator sweep:** qualified identifiers that name a *thing* (link kinds, role contributions, rig templates, event patterns, standing-order patterns). Permissions stay on colons — they live in a distinct grammar (naming a *grant*, not a thing). The Clerk link record's composite primary key (`{sourceId}:{targetId}:{normalizedType}`) is a Stacks-key tuple delimiter, not a qualified id, and stays on colons.

Id-format validation that embeds the old separator in error message text is corrected to the new form.

### Authoring-surface rename propagation

Every surface that exposes these names to the operator is renamed in lockstep:

- **CLI.** The `writ link --meaning <id>` flag becomes `writ link --kind <id>`. The `writ link-meanings` command becomes `writ link-kinds` (and its sibling `writ link-meanings-show` becomes `writ link-kinds-show`). Tool names, HTTP routes, help/instructions text, and error messages all rename.
- **Oculus writ page.** The inline add-link form's field name and its unlink/row-rendering data attributes rename from `type` → `label` in DOM ids, form field names, unlink data attributes, and rendered text. No new controls are added — the form continues to expose only the label input (a `kind` control is out of scope for this commission; see below).

### No new consumers, no new behavior

The substrate's behavior is unchanged. Validation rules, idempotency semantics, the normalization pipeline, the upsert path, the migration-on-startup pass — all behave identically post-rename. The commission's only code-level deltas are renames, vocabulary shifts, and the separator swap.

## Out of scope

- **The status-convention work** (rename `WritDoc.status → WritDoc.phase`; introduce the per-plugin observation slot). Separate commission — it pressure-tests a different piece of substrate.
- **Spider gating, `spider.follows` registration, and any first-consumer wiring.** Separate commission. Builds on this rename and on the status convention.
- **New Oculus UI controls** — specifically the `kind` dropdown on the add-link form. That is first-consumer UI work and lands with the Spider gating commission, where a real kind (`spider.follows`) gives the dropdown meaningful content.
- **Database / data migration of existing records.** Handled out of band by the patron. The brief assumes the implementing artificer can do an in-place rename across code and docs without simultaneously migrating live records.
- **Changes to the link record's composite-id format.** The tuple delimiter inside the Stacks key is a structural primary-key detail, not a qualified id, and is untouched.
- **Changes to permission grammar.** Permissions stay on colons.

## References

- **Link-substrate naming sweep** (label, kind, vocabulary): click `c-mo34jdht-c9bbe8fe43f3`.
- **System-wide separator convention** (dots for plugin-namespaced ids): click `c-mo34644p-2aebcbb478bb`.
- **Downstream commissions** that build on this one:
  - Status convention on writs — introduces the observation slot and renames the lifecycle enum. Dispatched separately.
  - Spider dispatch gating via `spider.follows` — first real consumer of link kinds. Dispatched separately.