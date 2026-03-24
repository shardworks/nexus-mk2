# install-tool

Install a new tool into the guild from a local directory, tarball, or npm package.

## Usage

```
install-tool <source> [--name <name>] [--slot <slot>] [--roles <roles>]
```

## Arguments

- `<source>` — Path to a local directory containing a nexus descriptor
- `--name <name>` — Override the tool name (defaults to directory name)
- `--slot <slot>` — Override the version slot (defaults to version from descriptor)
- `--roles <roles>` — Comma-separated roles for implement access gating

## Examples

Install a locally-built implement:
```
install-tool ./path/to/my-tool
```

Install with explicit slot and roles:
```
install-tool ./my-tool --slot 0.1.0 --roles artificer,sage
```

The tool will detect the descriptor type (implement, engine, curriculum, or temperament), copy it to the correct location, and register it in guild.json.
