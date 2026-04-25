`docs/architecture/apparatus/reckoner.md` §"Open Questions" already notes that patron-initiated cancellations produce no per-writ pulse (only `reckoner.writ-stuck` and `reckoner.writ-failed` are mandate-shaped emissions). The T4 migration doesn't change this — a `cancelled` mandate transition still produces no `reckoner.writ-cancelled` pulse, but it does evaluate the drain predicate (it's a terminal transition).

This is a known MVP gap that the brief acknowledges ("reckoner.writ-cancelled" item in Open Questions). T4 doesn't make it better or worse, but the work of generalizing terminal-transition pulses to a `reckoner.writ-terminal-non-success` shape (or per-attr emission) is the natural T4-next follow-up.

No files to touch here — logging because anyone reading the post-T4 code will notice the asymmetry between drain (type-agnostic) and per-writ pulses (mandate-only) and may want to chase it. Future commission could:
- Define a generic `reckoner.writ-failure` keyed on the `failure`-attr terminal state of each type
- Define a generic `reckoner.writ-completion` similarly for `success`-attr terminals
- Or keep the asymmetry permanent if the patron decides per-type pulse families are the better long-term shape