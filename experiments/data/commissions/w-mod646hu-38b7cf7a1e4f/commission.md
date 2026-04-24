# CLI and Oculus — multi-type writ rendering

## Intent

Update `nsg writ` commands and Oculus writ list/show views to render multi-type writs cleanly. Type appears alongside state; per-type state vocabulary is respected; no presentation layer assumes mandate's phase strings. Introduce classification-based filters as the multi-type-safe alternative to phase-string filters.

## Motivation

Post-T2, the guild can have writs of multiple types with type-specific state names (e.g., a `capability` in `ratified` alongside a `mandate` in `open`). Current CLI and Oculus views assume mandate vocabulary (column headers, filter options, status indicators). Non-mandate writs render confusingly — or, worse, indistinguishably from mandates — under the current implementation.

## Non-negotiable decisions

- **`nsg writ list` shows type and state as distinct columns.** Type column identifies the writ type; state column uses the type's own vocabulary. Mandate writs display `mandate | open`; a capability displays `capability | ratified`.
- **`nsg writ show` renders the type's lifecycle.** Output includes the type name, the current state, and contextual indicators (classification and attrs) derived from the type's config.
- **`nsg writ tree` remains type-agnostic.** Parent/child relationships display across types in one tree; each node shows its own type and state.
- **Filter policy.** Current phase-string filters (`--status open`, etc.) continue to work and continue to be mandate-semantic (they match mandate's `open` specifically, not "any active writ"). Add classification-based filters (`--classification active`, `--classification terminal`) as the multi-type-safe query path.
- **Oculus writ views follow the same pattern.** The list view and detail view use the same type + state vocabulary. No hardcoded mandate lifecycle assumptions in the UI.

## Scenarios to verify

- Listing writs in a guild that has a mix of mandate and non-mandate types: each writ's type and state display correctly with the type's own vocabulary.
- `nsg writ show` on a non-mandate writ: the rendered lifecycle is the non-mandate type's declared lifecycle, not mandate's.
- `--classification active` filter returns all non-terminal writs across all types.
- `--status open` filter returns only mandate writs in `open` (still mandate-semantic); does not accidentally match a non-mandate writ whose lifecycle happens to have an `open` state.
- `nsg writ tree` with a cross-type parent/child chain renders correctly.

## Out of scope

- **Search / full-text query redesign** — scope is display and filter flags only.
- **Oculus design refresh** — existing layout preserved; only vocabulary changes.
- **Reckoner migration** — T4.
- **Documentation** — T7.

## References

- Parent design click: `c-mo1mqp0q`.
- Predecessor: T2 (Clerk refactor).