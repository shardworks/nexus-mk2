# Laboratory apparatus — framework recon

Findings from reading the live framework source (the live `/workspace/nexus`
monorepo, on whatever SHA `nsg` is currently dispatching to). Maps each
prerequisite the apparatus design depends on to what the framework actually
offers, and surfaces gaps.

## TL;DR

All the load-bearing prerequisites are satisfied:

- **Non-anima engines: yes.** The Fabricator's `EngineDesign.run()` returns
  `{ status: 'completed', yields }` for synchronous work — exactly the shape
  we need for fixture/probe/scenario engines. Real precedent exists
  (`spider.seal` does git ops via Scriptorium and returns completed inline).
- **Plugin install accepts SHAs: yes** — `nsg plugin install` shells out to
  `npm install --save <source>`, which natively handles git+URL refs (and
  `#<sha>` pins on those URLs). The framework code passes the source string
  through unchanged.
- **Writ types via kit contributions: yes** — `ClerkApi.registerWritType`
  is called from the plugin's `apparatus.start()`. The Astrolabe plugin
  registers two custom types (`step`, `observation-set`) this way.
- **Rig templates via kit contributions: yes** — `SpiderKit.rigTemplates`
  + `SpiderKit.rigTemplateMappings` carry plugin-contributed templates and
  writ-type mappings.
- **Engine designs via kit contributions: yes** — `kit.engines: Record<id,
  EngineDesign>` is the standard shape; the Fabricator scans every kit's
  `engines` field and registers it under the contributing plugin's id.
- **Plugin CLI tools: yes** — tools registered via `supportKit.tools`
  auto-discover into `nsg <tool-name>` (with auto-grouping when names
  share a hyphen prefix). `nsg lab trial post` would come from a tool
  named `lab-trial-post`.
- **gh org permissions: yellow.** Org membership active; token scope is
  `repo`. Repo-create probably works (member-permitted in most org
  policies); repo-delete may not — admin perms needed depending on org
  policy. Need to verify by attempting once before relying on it.

The single piece the apparatus design got wrong is `nsg codex add` —
**it does NOT take a base SHA.** It only takes `(name, remoteUrl)`. The
SHA pinning happens earlier in the flow: the run-init script clones
upstream at the base SHA, pushes that as a fresh GH repo, then `nsg codex
add <new-repo>` clones the fresh repo at HEAD (which IS the base SHA by
construction). The original spec already describes this flow correctly;
the misread was about which step does the pinning.

No design adjustments required from the recon.

## Detailed findings

### 1. `nsg init`

Source: `/workspace/nexus/packages/framework/cli/src/commands/init.ts`

Surface: `nsg init <path> [--name <name>] [--model <model>]`

- Creates `<path>/`, `<path>/.nexus/`, `<path>/guild.json`,
  `<path>/package.json`, `<path>/.gitignore`.
- Refuses if `<path>` exists and is non-empty.
- Does NOT git init.
- Does NOT install plugins (separate step).
- Default model is `sonnet`.
- When framework is published (`VERSION !== '0.0.0'`), pins
  `@shardworks/nexus` in deps and runs `npm install`. In dev (link
  mode, VERSION = '0.0.0'), no install.

Gap vs. apparatus design: none. Spec already calls `nsg init <guild-dir>`
and follows up with separate `plugin install` / `codex add` steps.

### 2. `nsg plugin install`

Source: `/workspace/nexus/packages/framework/cli/src/commands/plugin.ts`

Surface: `nsg plugin install <source> [--type registry|link]`

Handler logic:
- If source is a path that exists and is a directory → link mode
  (`npm install --save file:<dir>` or `pnpm add link:<dir>`).
- Otherwise → registry mode (`npm install --save <source>`).

The `<source>` string is passed unchanged to npm. So:
- `@shardworks/foo@1.2.3` — semver works
- `@shardworks/foo@latest` — dist-tag works
- `git+https://github.com/foo/bar#<sha>` — SHA pin works (npm-native)
- `github:foo/bar#<sha>` — short-form git ref works
- `./local/path` — local link works

Plugin-id derivation: the framework parses the package name out of the
source string; for git URLs it falls back to reading the most recently
added entry in the guild's `package.json` after install (relies on
key insertion order — explicitly noted in code as a known compromise).

Gap vs. apparatus design: none. The handoff prompt's Q "does install
accept git SHAs" is yes, via standard npm git+URL syntax.

### 3. `nsg codex add`

Source: `/workspace/nexus/packages/plugins/codexes/src/tools/codex-add.ts`

Surface: `nsg codex add --name <name> --remote-url <url>` (the auto-
grouping makes positional flags work too).

Handler logic: clones a bare copy to `.nexus/codexes/<name>.git`, registers
`{ remoteUrl }` under `codexes.registered[name]` in guild.json. **No SHA
parameter.** The clone is bare-default (HEAD is whatever the remote points
at).

Gap vs. apparatus design: the spec implied `nsg codex add <repo-url> --sha
<codex-base-sha>`; that flag does not exist. The fix is *order*, not
behavior: clone upstream at base SHA → push to fresh repo → `nsg codex add`
the fresh repo (which is at base SHA by construction). The spec text
"`gh repo create ... --source=<temp-dir> --push`" already describes this
correctly; only the example invocation `nsg codex add <repo-url> --sha
<codex-base-sha>` was misleading.

### 4. Engine designs (the load-bearing question)

Source: `/workspace/nexus/packages/plugins/fabricator/src/fabricator.ts`

```ts
export interface EngineDesign {
  id: string;
  run(givens, context): Promise<EngineRunResult>;
  collect?(sessionId, givens, context): Promise<unknown>;
  retry?: EngineRetryConfig;
}

export type EngineRunResult =
  | { status: 'completed'; yields: unknown }
  | { status: 'launched'; sessionId: string }
  | { status: 'blocked'; blockType: string; condition: unknown; message?: string };
```

The `'completed'` branch is exactly what shell/script-style engines need.
No anima, no session, no Loom involvement — the engine does its work
synchronously in `run()` and returns yields directly. The Spider treats
the result as `engine-completed` and moves on.

Concrete precedent: `spider.seal` (in
`/workspace/nexus/packages/plugins/spider/src/engines/seal.ts`) calls
`scriptorium.seal()` synchronously and returns
`{ status: 'completed', yields }`. Multiple Astrolabe engines do the
same (`plan-init`, `plan-finalize`, `inventory-check`, etc.).

Implication for the lab: every fixture, probe, and scenario engine I'll
write is a sync function that does shell/git/network/fs work and returns
yields. No new framework primitive needed.

Engines are registered via the plugin's `supportKit.engines: Record<id,
EngineDesign>`. The Fabricator scans every kit/supportKit's `engines`
field at startup. Two kits contributing the same id throws.

### 5. Writ-type registration

Source: `/workspace/nexus/packages/plugins/clerk/src/clerk.ts`

`ClerkApi.registerWritType(config: WritTypeConfig)` is called from the
plugin's `apparatus.start()`. The registration window closes at
`phase:started`; calling after that throws.

Astrolabe registers `step` and `observation-set` this way. The Laboratory
will register `trial`. The `WritTypeConfig` shape lives in
`writ-type-config.ts` (state machine, child behavior, etc.).

### 6. Rig templates and mappings

Source: `/workspace/nexus/packages/plugins/spider/src/spider.ts`

```ts
export interface SpiderKit {
  rigTemplates?: Record<string, RigTemplate>;
  rigTemplateMappings?: Record<string, string>;
}
```

Templates are keyed unqualified; the Spider registers them as
`<pluginId>.<key>`. Mappings map writ types to template names.

The Laboratory's `supportKit.rigTemplates` will carry
`'post-and-collect-default'`; mappings will route `trial` to
`'laboratory.post-and-collect-default'` (or whatever the resolved name is —
need to check whether mapping values use qualified or unqualified ids).

### 7. Plugin CLI tools

Source: `/workspace/nexus/packages/framework/cli/src/program.ts`

CLI surface for plugin-contributed tools: registered via the `tools`
apparatus (kit contribution `tools` field). The CLI auto-discovers and
auto-groups by hyphen prefix — `lab-trial-post`, `lab-trial-show`,
`lab-trial-list` would group under `nsg lab` as `trial-post`, etc. (need
to verify the exact grouping behavior — there's a `findGroupPrefixes`
function I didn't read yet).

### 8. gh permissions

Verified directly:
- Org membership in `shardworks`: active (role: member, direct).
- Token scopes: `gist`, `read:org`, `repo`. The `repo` scope is
  sufficient for `gh repo create` and `gh repo delete` IF the org policy
  permits.
- Permissions on `shardworks/nexus-mk2`: `{maintain: true, push: true,
  triage: true, pull: true, admin: false}`. Admin would simplify
  arbitrary repo mgmt; without it we depend on org-level repo policy.

What I haven't verified:
- Whether org members can create new repos in `shardworks` org. (Would
  need an org settings read or a test create.)
- Whether org members can delete repos they created. Default GitHub
  behavior is yes (creator can always delete), but it's worth confirming
  with a test once.

Recommendation: keep this as a yellow flag in the apparatus design.
Test it on the smoke run by attempting a real codex create + delete; if
it fails, surface to Sean and either bump token scopes / org perms or
adjust the apparatus to use a different repo namespace.

## What this changes about the apparatus design

Nothing fundamental. The design is implementable as written. Two minor
adjustments:

1. **`nsg codex add` invocation:** drop the imagined `--sha` flag. The
   codex-add step pins via the repo's HEAD (which is the base SHA after
   the gh repo create + push). The original spec text already describes
   this correctly; only the literal example invocation was wrong.

2. **Codex-fixture engine flow:** Make explicit that the engine must do
   the clone+push+create work BEFORE calling `nsg codex add`. Three
   substeps inside one engine, not three separate engines.

## Open questions for Sean

These are things the recon didn't decide for me; quick answers help shape
the implementation:

1. **Codex repo namespace.** Spec says "same GitHub org as the upstream
   codex" (`shardworks` for the dev case). Confirm that's the answer for
   v1, not e.g. a personal account or a dedicated `shardworks-experiments`
   org.

2. **Codex repo visibility.** Spec says `--private`. Confirm.

3. **Codex naming format.** Spec says
   `experiment-<X-num>-<slug>-run-<NNN>-<variant>`. With trial as the
   primary writ type now (no separate experiment), names will be
   `trial-<trialId-or-slug>` or similar. Need to pick the actual format
   — and decide whether the "experiment" concept survives in the slug
   even though it doesn't have a writ type yet.

4. **Archive target (the still-open design question).** Three options:
   lab-host guild's books, sanctum mirror, or hybrid. Not blocked by
   recon — needs a separate conversation.
