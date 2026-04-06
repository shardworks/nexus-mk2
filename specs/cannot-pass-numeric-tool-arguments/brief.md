# Cannot pass numeric tool arguments via CLI

Example:

```
vscode ➜ /workspace/nexus (main) $ pnpm -s vibe writ list --limit '1'
Error: [
  {
    "expected": "number",
    "code": "invalid_type",
    "path": [
      "limit"
    ],
    "message": "Invalid input: expected number, received string"
  }
]
```

It looks like all CLI arguments are passed as strings. We need to detect other zod types and do whatever casting/etc. is required. (Numbers, probably booleans, maybe others.)
