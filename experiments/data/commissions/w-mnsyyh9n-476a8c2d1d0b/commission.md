## Goal

Design and implement defense-in-depth against prompt-injection attacks through the surfaces where patron-supplied text flows into agent system prompts: commission bodies, writ titles, spec content, plan artifacts, and any user-controlled field that a downstream agent eventually reads as an instruction. The outcome is (a) a threat model that enumerates the injection surfaces, (b) a minimum set of defensive measures proportional to the threat at each surface, and (c) a sketch of where in the framework those measures live (tool handlers, Clerk validation, Astrolabe stages, etc.).

## Status

parked — idea captured from GSD research, no immediate pressure to act

## Next Steps

Next session: decide whether to pursue this or keep parked. If pursuing: (1) walk the writ → rig → engine → session path and enumerate every place where a patron string becomes part of a prompt (should be a small number); (2) assess blast radius at each point — is the injection reading the patron's own data, or is it privilege-escalating into another tenant's surface? (3) draft a minimum-viable scanner that runs at commission-post time and flags high-confidence injection patterns without blocking. If parking deeper: add a trigger condition — "revisit when the guild has externally-facing commission intake" — so this surfaces when the threat becomes real.

## Context

The concern came out of reading GSD's defense-in-depth section in their user guide. GSD treats planning artifacts as untrusted input because they become LLM system prompts downstream. Their mitigations: path traversal validation on file params, a `security.cjs` module that scans for known injection patterns (role overrides, instruction bypasses, system-tag injection), a runtime hook on writes to `.planning/`, and a CI scanner that checks all agent/workflow/command files for embedded injection vectors.

Nexus has the same structural issue. A mandate writ's body becomes part of the rig's context, which becomes part of an anima session's prompt. Writ titles appear in reviewer prompts. Spec content from Astrolabe flows into implementing agents. We don't currently scan any of it.

The honest current threat level is low because there's only one patron and all commissions are self-authored. But the model has known injection surfaces the moment a guild accepts commissions from anywhere that isn't Sean's own terminal — web intake, a PR-driven handler, a multi-tenant guild, a delegated agent posting commissions. When that arrives, we'd want the scaffolding already in place rather than retrofitting under pressure.

Note that agent-to-agent writs are inside the trust boundary, so the scan surface is really just patron-entry points — commission-post, clerk writ-post, anything that accepts user-controlled strings through an HTTP or CLI boundary. This narrows the problem considerably.

## References

- GSD user guide § Defense-in-Depth (v1.27): `.scratch/gsd-research/USER-GUIDE.md:332-348`
- GSD quest for the same concept doesn't exist here — this is Nexus-specific
- Clerk writ-post tool: `/workspace/nexus/packages/plugins/clerk/src/tools/writ-post.ts`
- commission-post CLI path: `/workspace/nexus/packages/framework/cli/src/commands/commission-post.ts`
- Related consideration: writ-edit and writ-edit tools also accept arbitrary body text; same surface.

## Notes

- 2026-04-10: opened after this session's GSD research pass. Sean's explicit guidance on scope: skipped Nyquist and retroactive writ-edit CLI as quest candidates because they're already covered elsewhere; this one is genuinely new ground.