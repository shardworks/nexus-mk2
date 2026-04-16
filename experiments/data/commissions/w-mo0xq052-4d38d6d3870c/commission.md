Draft instruction language for Coco's agent file implementing scope-closure discipline. Two modes (explore/decide) with a context-based checkpoint trigger at ~25-30% context intervals.

Key behaviors to codify:
- Explore mode (default): "yes-and" is fine, but always name new tangents/alternatives explicitly and force a keep/park choice
- Decide mode (triggered by checkpoint or explicit call): drive toward conclusions, resist new branches, capture decisions as clicks
- Context checkpoint (~25-30% intervals): pause, list decisions reached, list open threads, propose clicks, suggest which thread to focus next
- Either party can call a mode switch explicitly

The tangent-naming habit is always-on regardless of mode — every new branch gets named and a keep/park decision is forced.

Depends on: Ratchet P2 (CLI) — instructions reference nsg click create. Draft the language now; activate when CLI lands.

Source: patron interview during pilgrimage w-mo0gias9 (session 0f6580e9). Sean described the dyad problem: "I'm a big idea person, adept at generating alternatives. Coco is very good at yes-and. Neither of us is good at putting boundaries in or closing scope."