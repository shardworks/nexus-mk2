# doc update pass

### 1. CLI README lists aspirational commands
`/workspace/nexus/packages/framework/cli/README.md` line 187 lists `nsg dispatch list` as a nexus-stdlib command. This was never implemented (it's not from the Dispatch apparatus — it was an aspirational stdlib tool). The CLI README may have other aspirational entries that don't match reality. A full audit of the CLI README's command table against actual installed tools would be valuable.

### 2. review-loop.md needs a fresh design pass
The review-loop doc's "Decision" section (line 69) says "Adopt both Option A (MVP) and Option B (full design)" — Option A was the Dispatch-level MVP, Option B was Spider engine designs. Option A was never implemented. The doc should be revised to reflect Spider as the sole design, but doing it well requires understanding the current Spider review engine implementation, which is beyond this commission's scope.

### 3. _agent-context.md may be stale
`/workspace/nexus/docs/architecture/_agent-context.md` lists "Commission → mandate writ → dispatch flow" (line 108) and mentions the Dispatch is part of the commission pipeline. This file appears to be agent-facing context that should be kept current. A broader freshness audit of this file would catch other stale references.
