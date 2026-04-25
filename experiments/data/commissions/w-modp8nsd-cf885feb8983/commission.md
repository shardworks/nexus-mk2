Lifted from the planning run of "Event-triggered standing order dispatcher" (w-modf5zgc-fa1e67868426). Each numbered observation below is a draft mandate ready for curator promotion.

1. Architecture doc still teaches dropped sugar shapes for standing orders
2. Brief mislocates the StandingOrder type as living in nexus-core
3. event_dispatches.noticeType column is likely vestigial post-canonical-shape
4. Standing-order validator should be reusable by a future guild.json linter and writeConfig hook
5. ClockworksApi.processEvents() lacks a per-event-id surface that task 6 will need
6. guild.json hot-edits to standing orders may surprise running daemons
