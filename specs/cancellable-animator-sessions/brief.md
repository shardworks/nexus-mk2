# Cancellable Animator Sessions

We need a way to cancel Animator sessions which are currently running. This includes killing the claude process, closing API connects, etc. Ideally, this is something that could be done from another process than the one that spawned it -- so the session itself must persist some sort of metadata that can be used to cancel the session, rather than requiring an in-memory handle or such. Consider support for currently in-memory process based sessions, but also a future state where sessions run in docker containers or remote vms.

This change should include:

- any new statuses for SessionDoc that make sense
- new tool(s) for cancelling sessions
