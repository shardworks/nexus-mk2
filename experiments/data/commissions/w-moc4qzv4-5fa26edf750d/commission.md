This commission creates the `docs/future/` directory as a side effect of writing `docs/future/guild-vocabulary.md`. No `README.md` exists at `docs/future/`. A reader browsing the docs tree won't know whether `docs/future/` holds drafts, speculation, staged vocabulary, or deprecated content.

Tactical detail:
- Concrete follow-up: add `docs/future/README.md` with a one-paragraph description: 'This directory holds staged content intended to graduate into the canonical docs (`docs/guild-metaphor.md`, `docs/architecture/`) once stable. Files here are draft-quality but referenced from live specs.'
- Out of scope for this commission because the mandate is specifically about creating `guild-vocabulary.md`; spinning up a README is adjacent, not required.
- Low priority — the file is discoverable via its one inbound link from `ratchet.md`.