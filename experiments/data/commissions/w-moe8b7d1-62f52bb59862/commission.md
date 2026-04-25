`docs/architecture/clockworks.md` (L151, inside the 'The summon relay' subsection) describes the soft dependency on the Animator and the Loom. As more stdlib relays ship in `supportKit.relays` (or third-party kits with their own apparatus dependencies), this framing will need to live at a higher header level — probably a 'Stdlib relays' or 'Apparatus dependencies' section.

Not urgent: today the summon-relay is the only stdlib relay with a non-trivial dependency story. But as soon as a second stdlib relay arrives with its own `recommends`, the per-relay framing becomes repetitive and hard to maintain.

Follow-up commission should refactor the soft-dependency framing into a shared section the moment a second stdlib relay needs it. Until then, leave alone.