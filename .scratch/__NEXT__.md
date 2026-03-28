# Before trip

- Designed 'change notification' system for books: /workspace/nexus-mk2/.scratch/design-book-watchers.md
  - Q1 and Q2 are really one question: what pre-read cost is acceptable? The answer probably falls out from "how important is prev to cascade
   use cases" — if cascades are a first-class use case, prev is nearly mandatory.                                                            
  - Q3 (error semantics) is the one I'd push you hardest to decide consciously. The "fail the write" vs "log and continue" choice has big    
  implications — a buggy clockworks watcher silently blocking all writ mutations would be painful to debug. The per-watcher failOnError flag 
  is in there as an escape hatch worth considering.
  - Q5 (defer declarative watches) I'd just say yes — onInitialize covers everything, sugar can come later.                                  
  - Q6 is probably already "yes" given the cascade example, just confirming.
- Was working on "plugin-fying" project into smaller components
- Unreviewed migration guide: /workspace/nexus-mk2/.scratch/spec-riggify-template.md
- AI generated 'nexus-sessions' rig
  - Not been reviewed yet, but has direct DB access instead of using books API
- AI generated 'nexus-clockworks' rig: /workspace/nexus/packages/nexus-clockworks
  - Not been reviewed yet, but one thing i noticed was it had direct DB access instead of using books API from mainspring
  - Session notes:

```
  What we did                                                     
                                                                                                                       
  - Drafted spec-riggify-template.md — a 10-step task template for extracting core subsystems into standalone rig      
  packages using the Books abstraction. Covers pre-flight analysis, denormalization strategy, document types, package  
  scaffold, Book declarations, tool implementation, TypeScript API surface, callsite updates, and tests.               
  - Applied the spec to create packages/nexus-clockworks/ (1b80790) — the first riggified core subsystem: events API
  library, clockworks runner (with V2 engine resolution via config.rigs + node_modules), daemon control, 8 tools, 51   
  tests passing.
  - Stripped backward compat and migration code (2f94d0e) — V1 config.engines shim, brief verb, guildPackageRoot()     
  wrapper; Steps 7 and 9 removed from the spec.                                                                        
  - Confirmed core is untouched — both commits are additive to packages/nexus-clockworks/ only.
                                                                                                                       
  Decisions made and/or deferred                                                                                       
                                                                                                                       
  - home: string library signatures kept — deliberate API design for cross-module use (not compat code).               
  - No V1 compat, no migration — Sean's direction: all preexisting guilds are decommissioned.
  - Callsite cleanup deferred — stdlib wrappers and core re-exports not yet removed.                                   
                                                                                                                       
  Next steps
                                                                                                                       
  - Callsite cleanup (Step 7): remove stdlib clock/event/signal wrappers, core re-exports, legacy/1/clockworks.ts,     
  legacy/1/events.ts
  - Continue riggification: nexus-writs → nexus-roster → nexus-sessions                                                
  - Publish spec-riggify-template.md once validated end-to-end    
```