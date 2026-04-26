The petitioner-registration design doc operates on the assumption that *some* book holds petitions — the CDC-feedback patterns route through `book.<owner>.<bookName>.updated` Clockworks events, and the doc's worked examples filter on `event.payload.entry.source`. The doc references `book.reckoner.petitions.updated` as the canonical filter target.

But nothing in the design clicks (`c-mod9a2gh`, `c-modaqnpt`, `c-mod9a6x3`, `c-mod9a54n`, `c-mod9a48y`) has settled:

- Which plugin *owns* the petitions book — the Reckoner itself, or a separate intake plugin? The Reckoner is the natural owner; it's also the only writer.
- Petition id grammar — framework precedent is single-letter prefix (`w-`, `c-`, `p-`, `rig-`); 'petition' could be `pt-` (clashes with point/?), `pn-`, or just `p-` (clashes with `pulse`).
- Whether the petitions book is the same artifact as the 'petition state book' referenced in `c-mod9a6x3`, or a separate book.

The registration-design doc can land without these settled — it doesn't depend on book details — but the worked examples will reference `book.reckoner.petitions.updated`. If the eventual book name differs, the doc will need a small fix-up.

Follow-up: file a click under the Reckoner subtree to settle book ownership and id grammar before the Reckoner core commission begins implementation. Coordinates well with the Reckonings-book commission `c-modc7m16`, which will face the same questions for the evaluation log.