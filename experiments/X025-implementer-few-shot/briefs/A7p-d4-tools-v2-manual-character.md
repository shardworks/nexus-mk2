# v2: Manual character and build entry

## Intent

Introduce real data flow into the v1 foundation by allowing the user to author characters and builds by hand — entering class, level, paragon points, equipped gear (per slot, with rolled affixes), aspects, and skill selection — and to save and load these as files. The deliverable is an end-to-end loop where the user types in their actual character, saves it, closes the app, reopens, and finds it. From this point the tool has real data to operate on, and v3 (API import) can be built as an alternative ingestion path against the same data model.

This commission also locks the v1+ data model. Whatever shape characters, builds, items, and affixes take in v2 is the shape v3 must conform to and the shape later scoring work consumes.

## Motivation

Manual entry before API integration forces the data model to be designed without inheriting any quirks of the Blizzard API response shape. It also gives the user a usable tool sooner — even if entry is tedious, theorycrafting hypothetical characters does not require a real Battle.net account or working API endpoints. v3 then plugs into the established model rather than dictating it.

## Non-negotiable decisions

### Data model authority

This commission produces the canonical TypeScript types for characters, builds, items, affixes, aspects, paragon allocation, and skill selection. Subsequent commissions (v3 API import, the scoring engine, comparison logic) consume these types. Their design is the most important deliverable in this brief, ahead of any UI.

The data model must accommodate the inputs the scoring engine needs (see `docs/scoring-engine.md` §3). Specifically: class and character level are first-class; equipped items carry rolled affix values; each slot can carry both a current item and a target item (full hypothetical or partial constraint); aspects are recorded with rolled values; paragon allocation is recorded across boards / glyphs / nodes; playstyle constraints have a place to live (even if no UI surfaces them in v2). The scoring engine doc enumerates the categories — the data model accepts them; the v2 UI does not need to expose all of them.

### Data layer integration

v2 references the canonical D4 entity catalog — classes, skills, item slots, affix definitions, aspects, paragon nodes — sourced as documented in `docs/data-sources/`. The implementer chooses how to bootstrap the catalog (which dataset to seed, what subset to ship in v2). At minimum: enough catalog data to support entering a character's gear with picked-from-list affixes, not free-text strings. Free-text affix entry is not acceptable.

### Authoring surfaces

Three user-facing surfaces, composed from v1 components:

1. **Character editor** — class, character level, paragon level, paragon-point allocation. Skill selection (skills equipped, ranks).
2. **Gear editor** — for each of the 13 slots, the user can place an item, edit its affixes (picked from the affix catalog with rolled values typed in), assign an aspect (picked from the aspect catalog), and remove the item. Item rarity tokens follow `docs/visual-spec.md` rarity rules.
3. **Build list and detail** — list-detail layout per `docs/visual-spec.md` §15.1. Saved builds visible in a list; clicking opens the detail view (the v1 build-summary view, now populated with the saved build's data).

The split between "character" (the persistent entity belonging to the user) and "build" (an optimization target layered on a character) follows the vision doc and scoring engine doc. v2's UI may treat the relationship simply (e.g., one build per character to start), but the data model accommodates the eventual one-to-many.

### Persistence

Saves and loads characters and builds as files via the persistence mechanism established in v1. File format is JSON. One file per character or per build is preferred over a single combined file, for Git-friendly diffs. The implementer picks the directory layout.

### Validation

Affix values, paragon-point totals, and skill-rank totals are validated against the catalog (max values, total points by level). Validation errors are inline at the edited field per `docs/visual-spec.md` §9.14 and §10.5.

### Cmd-K palette

The empty cmd-K shell from v1 gains a small set of commands relevant to v2: navigate to a character / build by name, create new character / build, import / export build file. The palette is now functional, not a stub.

## Out of scope

- Blizzard API integration. v3 covers this.
- The scoring engine, stat priorities, item scoring, comparison logic.
- Build cloning and theorycrafting variations as a discrete UI surface (the data model supports the underlying operation; the surface is a later commission).
- Acquisition planning (gap between current and target gear) as a discrete UI surface.
- Visual paragon-board rendering. Recommended paragon paths from later scoring work will ship as lists; visual is a future possibility.
- Automatic detection of legendary aspects from item names. The user picks aspects from the catalog explicitly.
- OCR, screenshot import, or any non-keyboard input path.

## References

- `docs/vision.md` — particularly §4 (use cases) and §5 (domain glossary), which name the entities this commission encodes.
- `docs/scoring-engine.md` §3 — what the engine expects as build input. The v2 data model must accommodate this even where v2's UI does not expose every dimension.
- `docs/visual-spec.md` — components, layouts, validation patterns, density, microcopy.
- `docs/data-sources/` — particularly `02-stats.md`, `03-affixes.md`, `04-crafting.md`, `06-skills.md` for catalog seeding.

Links:
→ w-movye3hq  (depends on)
← w-movyfv53  (depends on)
