Purpose: Allow writs to be created, but not immediately implemented.

There is no new, draft, or held state. The commission-post tool hardcodes status: 'ready' on creation, and the Spider's spawn phase queries exclusively for writs in 'ready' state — so anything posted is immediately eligible to be picked up on the very next crawl tick.

If you want to stage a writ — draft it, review it, maybe link it to other writs — before it enters the queue, there's currently no mechanism for that.

I would like to implement a new (draft) state as a pre-ready holding state. The work would involve:

- Adding 'new' to WritStatus in the clerk plugin
- Making commission-post accept an optional draft: true flag (defaulting to false for backwards compatibility)
- Adding a writ-publish tool (or extending writ-accept / adding a new transition) to move new → ready
- Ensuring the Spider's spawn phase ignores 'new' writs (it already does, since it only queries 'ready')
- Updating writ-cancel to allow cancelling from 'new' state as well
- Let me know if you'd like me to proceed, and whether the design above matches what you have in mind.
- Update documentation, including state diagrams, as needed

Oculus Updates:

- Add a '[ ] Draft' checkbox on the new writ page
- Allow writs to be transitioned from 'new' to 'ready' via the UI
- Add a new column to the writs table with context-aware actions such as 'Start' (transition new->ready), 'Cancel', etc