## What

The typed `VisionFilters` / `ChargeFilters` / `PieceFilters` shapes (`packages/plugins/cartograph/src/types.ts:133-166`) carry only `{ stage?, codex?, limit?, offset? }`. The patron's most natural ladder query — 'show me all charges under vision X' or 'show me all pieces under charge Y' — has no typed-API path. The CLI's `<type>-list` (D10 selected `match-typed-plus-format`) inherits this gap.

The fallback today is `nsg writ list --type charge --parent-id <vision-id>`, which works (clerk's `WritFilters` accepts `parentId`) but bypasses cartograph's typed surface and returns generic writ rows rather than charge companion-doc rows with stage data.

## Why this commission can't fix it

The brief forbids expanding the typed API. The CLI commission documents the workaround (D10 rationale: 'patrons wanting a parent-filtered list have `nsg writ list --type charge --parent-id <vision>` as a fallback').

## Suggested follow-up

Add `parentId?: string` to `ChargeFilters` and `PieceFilters` (visions are top-level, so `VisionFilters` doesn't need it). Thread it through `buildListQuery` in `cartograph.ts:161-178` — the writ row carries `parentId` but the companion doc does not, so the implementation either joins through `clerk.list({ parentId })` to get the writ ids and then `book.find({ where: ['id', 'in', ids] })`, or extends the companion doc to carry `parentId` (cheaper). Once the typed API supports it, `<type>-list` adds `--parent-id` to the Zod schema.