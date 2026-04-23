Design subtree: c-mo1z3teo (Implement notifications when the system requires human intervention).

Concluded subclicks driving this work:
- c-mob1vyb2 — triggers (A-level blocked transitions + queue-drained)
- c-mob1vyyi — channel (Discord webhook + CLI inbox; Lattice has channel abstraction)
- c-mob1w04q — response surface (read-only; no ack)
- c-mob1w0ql — rate-limit (nothing for MVP; principle: rate-limit/digest live on the Lattice)
- c-mob1w13b — authoritative source (writ-state CDC; Reckoner observes; queue-drained derived in-stream)
- c-mobzl35x — pulse shape (immutable event records; supersedes payload click c-mob1vzjy)

Vocabulary introduced and adopted: the Lattice (general-purpose messaging apparatus), the Reckoner (guild command-and-control — scoped narrowly for MVP), Pulse (immutable signal record). See guild-vocabulary.md.

Related Reckoner-scope clicks (informational, not in MVP scope): c-moa42rxh (vision-keeper), c-moaj06ty (overseer), c-mo1mqgf9 (background monitoring).