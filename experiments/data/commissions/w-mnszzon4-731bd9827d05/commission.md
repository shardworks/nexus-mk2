_Vocabulary bookmark from `docs/future/guild-vocabulary.md` (2026-04-10) — Vigil._

## Goal

Give the guild a background watcher that monitors in-flight commissions automatically — detecting failures, stalls, and completion events without requiring the patron (or Coco) to manually run `nsg writ list`. The vocabulary tome calls this *Vigil*: someone (or something) keeping watch over dispatched work.

## Status

Parked — vocabulary bookmark, no work scheduled. The gap is real and increasingly felt: every Coco session today starts with manual status checks. As autonomous activity scales, this becomes more painful.

## Next Steps

If this becomes pressing — most likely trigger is either a stuck commission going unnoticed for too long, or wanting Sean to be alerted out-of-session when something completes — expand into a proper inquiry. The first design question is *where* the vigil lives: as a Clockworks standing order (T7 makes this trivially possible — `every: 5m` schedule + a relay that scans for stuck rigs), as a Laboratory periodic task, or as a dedicated apparatus. The second is *what* a vigil emits when it notices something — a CDC event? An alert in the Oculus? A summons to the patron's inbox?

## Context

**The vocabulary** (from the future-vocabulary tome):

> **Vigil** — A period of watching and waiting. After a commission is dispatched, someone (or something) keeps vigil — monitoring progress, watching for failures, waiting for completion. *System mapping: the background monitoring that checks commission status, detects failures, and triggers alerts. Currently a manual status check. An engine could keep vigil automatically.*

**What's missing today:**

- **Stuck-rig detection.** A rig in `active` with no session activity for >N minutes is almost certainly wedged. Nothing notices.
- **Failure surfacing.** When a rig fails, the failure lives in the writ status until someone runs `nsg writ list`. No push notification, no Oculus alert, no `coco.md` startup mention.
- **Completion notification.** When a commission seals successfully, the patron has no signal until the next session.
- **Cross-commission coherence.** Are two in-flight commissions touching the same files? Today: nobody checks. Vigil could.

**The Clockworks connection.** T7 (Clockworks MVP) is the natural substrate for vigil: timer events plus relays plus standing orders. The brief already lists "stale rig sweep" as an explicit use case (`every: 5m` schedule firing a `sweep-stale-rigs` relay). That's vigil-as-MVP-feature. The deeper Vigil concept is broader — "what's the full set of conditions worth watching for, and how does the guild surface them?" — and could absorb the Clockworks use case as one mechanism among several.

**Cross-links:**

- **T7 (Clockworks MVP)** — provides the timer/relay substrate vigil would naturally use. The "stale rig sweep" use case in the brief is an MVP-flavored vigil.
- **T5 (daemon hardening)** — vigil would live in (or alongside) the daemon. The same lifecycle that makes the daemon's `nsg start`/`nsg stop` story matter is what makes vigil possible.
- **T4 (X013 instrumentation)** — instruments are a different kind of "watching": post-hoc quality measurement rather than in-flight monitoring. Cousin, not duplicate.

## References

- Source tome: `docs/future/guild-vocabulary.md` § "Lifecycle & Ceremony" (Vigil)
- Cross-link: T7 Clockworks MVP (`w-mnszhk4z-2f01f7000566`) — natural substrate
- Cross-link: T5 daemon end-to-end integration tests (`w-mnszh3ry-514c1073034b`) — daemon lifecycle vigil would inhabit
- Cross-link: T4 X013 instrumentation review (`w-mnszgv1h-5890bcecc2e3`) — adjacent observability

## Notes

- The vocabulary tome also names *Herald* (event broadcasting) as the announcement layer. If vigil grows up, Herald is what it would talk to: vigil notices something, herald broadcasts. Bookmark Herald separately if/when this activates.
- 2026-04-10: opened as a vocabulary bookmark from the future-vocabulary tome.