# install-tool

Install a new tool into the guild from a local directory, npm package, or tarball.

## Usage

```
install-tool <source> [--name <name>] [--slot <slot>] [--roles <roles>] [--link]
```

## Arguments

- `<source>` — Local directory path, npm package specifier (e.g. `foo@1.0`, `@scope/tool`), or tarball path (`.tgz`)
- `--name <name>` — Override the tool name (defaults to package name or directory basename)
- `--slot <slot>` — Override the version slot (defaults to version from descriptor)
- `--roles <roles>` — Comma-separated roles for implement access gating
- `--link` — Symlink a local directory instead of copying (for active development)

## Source types

The source is automatically classified:

- **Local directory with `package.json`** — installed via `npm install` into the guild's `node_modules`. Dependencies are resolved automatically.
- **Local directory without `package.json`** — copied directly to the guild. No dependency resolution.
- **npm specifier** (e.g. `my-tool@1.0`, `@scope/tool`) — installed from the npm registry.
- **Tarball** (`.tgz`/`.tar.gz`) — installed via npm from a local archive.

## Examples

Install a locally-built implement:
```
install-tool ./path/to/my-tool --roles artificer
```

Install from npm registry:
```
install-tool some-published-tool@1.2.0 --roles herald
```

Link a tool for active development (changes are live):
```
install-tool ~/projects/my-tool --link --roles artificer
```

Install with explicit slot and roles:
```
install-tool ./my-tool --slot 0.1.0 --roles artificer,sage
```

The tool will detect the descriptor type (implement, engine, curriculum, or temperament), install it to the correct location, and register it in guild.json.
