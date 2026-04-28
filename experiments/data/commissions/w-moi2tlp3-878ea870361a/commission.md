This is a holding parent for observations and follow-ups about the Clockworks apparatus and event surface lifted from planning runs in late April 2026.

The Clockworks subsystem is in heavy churn:
- The C1–C5 events-kit ladder is mid-flight: events-kit infrastructure (C1) landed, signal validator was replaced, Clockworks event surface migration (C2), animator surface migration (C3/C4), tools/CLI cleanup (C5), and the `clockworks-stacks-signals` bridge plugin are all in active rotation.
- The standing-order canonical-form work concluded and dropped `summon:`/`brief:` sugar — but many docs still teach the old form.
- The Clockworks daemon, scheduled standing orders (cron), and per-event-id tick CLI all landed recently.
- CDC auto-wiring for book events is shipped; downstream events kit declarations are still being added.

Per patron direction, follow-ups in this subsystem should NOT be commissioned as discrete cleanup work — they will be subsumed by the in-flight C1–C5 ladder commissions as those land. When the events-ladder work settles, this parent can be reviewed and any genuinely unaddressed items promoted, with the rest cancelled.

Source: triage of 414 unpromoted observation-set children on 2026-04-28.