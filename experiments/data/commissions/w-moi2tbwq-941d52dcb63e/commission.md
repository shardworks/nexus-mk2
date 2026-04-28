This is a holding parent for observations and follow-ups about the Reckoner subsystem (both the legacy queue-observer and the new petition-scheduler) lifted from planning runs in late April 2026.

The Reckoner subsystem is in heavy churn:
- The legacy queue-observer apparatus is being renamed to `sentinel-apparatus` to free the `reckoner` plugin id.
- A new petition-scheduler Reckoner is being built (skeleton landed; CDC handler and petitioner registration in flight).
- The `reckonings` book design and petitioner-registration extension point are still being designed.

Per patron direction, follow-ups in this subsystem should NOT be commissioned as discrete cleanup work — they will be subsumed by the in-flight design and refactor commissions as those land. This parent collects the lifted observations as a record. When the Reckoner subtree work settles, this parent can be reviewed and any genuinely unaddressed items promoted, with the rest cancelled.

Source: triage of 414 unpromoted observation-set children on 2026-04-28.