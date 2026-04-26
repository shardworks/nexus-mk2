Click `c-mod9a48y` settled the patron's two petition modes (imperative `priority=immediate` and discretionary). This commission settles how `'patron'` is registered as a source (D12: Reckoner self-registers) and how authority is gated (D7: registration metadata). What's *not* designed anywhere yet is the actual patron-emit surface — the tool, CLI command, or anima-side method the patron uses to issue a petition.

The registration-design doc says (in the cited brief) that surface is a downstream commission. But there's no live click yet under the Reckoner subtree (`c-mod99ris`) that owns it. Open questions:

- Does the existing `commission-post` tool become a thin wrapper that emits a `priority=immediate` patron petition (and the Reckoner immediately auto-accepts and re-posts via the Clerk)? Or do they stay parallel — `commission-post` for patron-direct writs, a new `petition-emit` for patron-petition flow?
- How does the patron from Oculus / interactive `nsg consult` get its `priority` field? UI affordance? Default to `urgent` for discretionary?
- Anima-side: does an anima carrying patron authority have a `petition-emit` MCP tool, or does it always go through `commission-post`?

File a follow-up commission to design the patron-emit surface once the Reckoner core commission has set up the registration handle for `'patron'`. This is the bridge from 'patron is registered' to 'patron actually emits'; without it, the registration design is half-wired.