# Astrolabe MVP, Part 1

Implement the following pieces of the Astrolabe apparatus (defined in docs/architecture/apparatus/astrolabe.md):

  A — Astrolabe Foundation (complexity ~5)                                                                                                                                                                
  - Package scaffolding, plugin registration, dependency declarations
  - Book: astrolabe/plans with full PlanDoc/ScopeItem/Decision schema + indexes                                                                                                                           
  - All 7 tools (plan-show, inventory-write, scope-write, decisions-write, observations-write, spec-write, plan-list)
  - Kit contributions: brief writ type → Clerk, astrolabe.sage role → Loom                                                                                                                                
  - Kit contributions: rig template definition (8-step pipeline) + brief → template mapping                                                                                                               
  - Configuration (generatedWritType)
