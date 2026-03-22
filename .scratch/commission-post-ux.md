# Commission: Simplify `commission post` Input

## The Work

Make it easy to post commissions with a one-liner:

```sh
nx com post 'build something cool'
```

## Current Behavior

`commission post` requires a `<spec-file>` path as its first positional argument. The file is read and its contents become the commission spec. There is no support for inline text.

## Desired Behavior

1. **Add `--commission-file` / `-f` flag.** When provided, read the commission spec from this file path. If the path is `-`, read from stdin.
2. **First positional argument is inline commission text.** If `-f` is not provided, treat the first positional argument as the commission spec text directly (not a file path).
3. **No input is an error.** If neither `-f` nor a positional argument is provided, print an error and usage, then exit.

## Updated Usage

```
nexus-cli commission post <text> [--title <title>] [--repo <url>]
nexus-cli commission post --commission-file <path> [--title <title>] [--repo <url>]
nexus-cli commission post --commission-file - [--repo <url>]   # read from stdin
```

## Title Resolution

1. If `--title <text>` is provided, use that as the title.
2. Otherwise, take the first non-empty line of the spec content and strip any leading `#` and space characters. This naturally handles both markdown headings (`# My Commission` → `My Commission`) and plain text one-liners (`build something cool` → `build something cool`).

The input text is otherwise **unstructured** — no assumption of markdown or any other format.

## Notes

- `--repo` behavior is unchanged.
- Support both `--commission-file` and `-f` as aliases.