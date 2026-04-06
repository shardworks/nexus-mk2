# Configurable rig templates via guild config

## Problem

Every writ gets the same hardcoded 5-engine rig (draft → implement → review → revise → seal), regardless of writ type. Different kinds of work need different pipelines — a spec-writing commission doesn't need review/revise, a hotfix might skip drafting, a doc update might use a different role. Today the only way to change the pipeline is to modify Spider source code. This is a stop-gap before the full needs-discovery system: let guilds pre-compose writ-type-to-rig-structure mappings in guild config.

## Desired behavior

The Spider's `spider` config section gains a `rigTemplates` map: keyed by writ type, each entry defines an ordered list of engine instances with their designIds, upstream dependencies, and givens. When spawning a rig, the Spider looks up the template matching the writ's type, falling back to a default template. Givens support a small set of named variable references (`$writ`, `$role`, `$buildCommand`, `$testCommand`) that the Spider resolves from the writ and SpiderConfig at spawn time — undefined variables are omitted from givens. If no templates are configured, the current hardcoded 5-engine pipeline is used unchanged (full backwards compatibility).

## Validation

At startup, the Spider validates all configured templates: every `designId` must exist in the Fabricator's engine registry, upstream references must point to engine ids within the same template, and the dependency graph must be acyclic. Invalid templates fail guild startup with a clear error message. The rig-completion CDC currently hardcodes a lookup for an engine with `id: 'seal'` to extract the resolution summary — this needs a fallback for templates that don't include a seal engine (use the last completed engine's yields, or allow the template to declare which engine provides the resolution).
