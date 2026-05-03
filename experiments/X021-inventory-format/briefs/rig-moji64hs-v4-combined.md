# Cleanup: delete vision-keeper plugin + redefine The Surveyor — X021 baseline
_Verbatim plan extracted from production guild for X021 baseline (planId w-moji63xm-9ebd9a8a302c)._

---

# Codebase Inventory — Cleanup: delete vision-keeper plugin + redefine The Surveyor

This is a cleanup commission with no implementation logic — purely deletions, doc rewrites, and a coordinated rename of "The Surveyor" semantics. The blast radius is wide because vision-keeper was authored as the canonical worked example for the Reckoner contract, so its name and source string thread through the Reckoner's package, the Reckoner's apparatus / contract / reckonings-book docs, the future-vocabulary doc, the Lattice apparatus doc, and three framework architecture docs that still describe The Surveyor in its now-superseded codex-mapping framing.

## Sources of truth

- **Brief (`writ.body` of `w-moji63xm`)** — the patron's prescription. Enumerates three "non-negotiable decisions" (delete the plugin; rewrite worked-example references in `petitioner-registration.md`; redefine The Surveyor in three named arch docs) plus an explicit out-of-scope list.
- **`c-moivkc4y` (concluded)** — output-contract design click. Concludes the rename: "vision-keeper role → surveyor (activity defines role; works on visions/charges/pieces, not just visions)." This is the load-bearing rename the brief implements.
- **`c-moji050w` (live)** — parent design click for the cartograph + surveying cascade. Hosts the Commission B (this writ) child; supersedes the c-moa42rxh vision-keeper subtree.
- **`docs/architecture/surveying-cascade.md`** — the brief cites this as the load-bearing replacement framing for The Surveyor. **It does NOT exist in this draft worktree.** The brief states it lives at `/workspace/nexus/docs/architecture/surveying-cascade.md`. Doc updates here forward-reference it; the file itself is presumed to land via a separate commission or already lives outside this draft.

## Plugin delete target

### `packages/plugins/vision-keeper/` (delete in full)

- `package.json` — name `@shardworks/vision-keeper-apparatus`, depends on clerk + clockworks + reckoner; dev-deps stacks + clockworks-stacks-signals + nexus-core.
- `tsconfig.json` — extends root tsconfig, standard apparatus shape.
- `README.md` — full installation + usage walkthrough; references the contract doc at §11 as the authoritative spec.
- `src/index.ts` — barrel export; ships `VISION_KEEPER_SOURCE`, `VISION_ID_LABEL_KEY`, `DECLINE_RELAY_NAME`, `createVisionKeeper`, `__internal`, type re-exports.
- `src/constants.ts` — three exported string constants (`'vision-keeper.snapshot'`, `'vision-keeper.io/vision-id'`, `'vision-keeper-on-decline'`). Each is a cross-component contract anchor — every consumer keys on these literal values.
- `src/types.ts` — `VisionKeeperApi`, `VisionSnapshotPayload`, `VisionSnapshotRequest`. Imports `WritDoc` (clerk) and `ComplexityTier`/`Priority` (reckoner).
- `src/vision-keeper.ts` — the apparatus factory `createVisionKeeper()`. Closure-scoped state (`outstandingByVision: Map<visionId, writId>`), three caller methods (`submitDriftSnapshot`, `submitElaborationNudge`, `superseded`), drift / elaboration dimension presets (D5/D6 in the v0 commission), auto-supersede invariant (D10), Reckoner handle resolution at `start()`. Exports `__internal` for tests.
- `src/decline-relay.ts` — `vision-keeper-on-decline` relay factory + `matchVisionKeeperDecline()` predicate. Filters CDC events to `vision-keeper.snapshot` writs transitioning into `cancelled`; logs a single decline line.
- `src/vision-keeper.test.ts` (842 lines) — apparatus-isolated unit tests against MemoryBackend + real Clerk + real Reckoner.
- `src/integration.test.ts` (657 lines) — full end-to-end harness booting Stacks + Clerk + Reckoner + Clockworks + clockworks-stacks-signals + Vision-keeper. Asserts the decline-feedback channel via real Clockworks dispatch.

### `pnpm-lock.yaml` (single block at line 529)

The `packages/plugins/vision-keeper` entry. Removed transparently by `pnpm install` after the package directory is deleted (workspace globs in `pnpm-workspace.yaml` already pull in `packages/plugins/*`; no manual lockfile editing needed).

### `pnpm-workspace.yaml`

No edit needed — uses globs (`packages/plugins/*`); deleting the directory is sufficient.

## Files referencing `'vision-keeper'` or `'vision-keeper.snapshot'` outside the deleted plugin

Cross-referenced via grep on the full tree (see Files Index below). Each falls into one of three buckets:

### Bucket A — directly enumerated by the brief

- **`docs/architecture/petitioner-registration.md`** — the Reckoner contract document. Every contract surface uses vision-keeper as the worked example.
  - Header callout (lines 16–17) names "any non-`vision-keeper` petitioner" as out-of-scope language.
  - §1 inline `clerk.post()` example (line 75) uses `source: 'vision-keeper.snapshot'`.
  - §3 labels paragraph (line 295) cites `'vision-keeper.io/vision-id': 'nexus'`.
  - §5 inline `petitioners` kit example (line 525) registers `'vision-keeper.snapshot'`.
  - §5 source-id-grammar bullets (line 581) lists `vision-keeper.snapshot` alongside `patron-bridge.commission` / `tech-debt.detected`.
  - §9 Channel-1 standing-order recipe (lines 758–760) wires `run: 'vision-keeper-on-decline'` with a `filterExtSource: 'vision-keeper.snapshot'` `with:` block.
  - §9 Channel-2 polling recipe (line 788) filters on `'ext.reckoner.source', '=', 'vision-keeper.snapshot'`.
  - §11 — the entire "Built-in example: vision-keeper" section (lines 825–870). The single largest worked-example block. Brief says: "if a section loses its purpose with the example removed, delete it." This whole section loses purpose.

- **`docs/guild-metaphor.md`** — section "The Surveyor" (lines 181–185). Currently describes a codex-awareness apparatus ("maintains the guild's knowledge of its codexes … determining what kinds of work are applicable"). Brief target: replace with the cartograph-decomposition framing (surveys cartograph nodes, produces structural decompositions, registers as a kit-contributable surveyor with the surveyor-apparatus substrate).

- **`docs/architecture/index.md`** — System at a Glance description of The Surveyor.
  - ASCII block at line 27 lists `Clockworks · Surveyor · Clerk` — apparatus layer above Stacks. (The Surveyor stays as an apparatus; only its meaning changes.)
  - §"The Apparatus" prose at line 69 says "The Surveyor tracks what work applies to each registered codex." Stale framing.
  - Line 286 footnote: "The Surveyor and The Executor are described elsewhere in this document as part of the guild's operational fabric, but they are not yet extracted as standalone packages." Brief explicitly calls this line out: update or remove depending on whether the future surveyor-apparatus is anticipated as a planned package. Per Commission C in the parent click subtree (`c-moji0ggh`), the surveyor-apparatus substrate IS now an anticipated planned package.

- **`docs/architecture/plugins.md`** — line 9 prose ("The Clockworks, the Spider, the Surveyor — everything that makes a guild operational"), line 72 ("The Clockworks, Spider, and Surveyor are all apparatuses"), line 538 example `plugins` array `["clockworks", "spider", "surveyor", "stacks", "nexus-git"]`. The Surveyor stays as an apparatus identity; the question is whether any reference frames it specifically as the codex-mapping concept (none of these three references do, on close reading — they treat it as a generic apparatus name). Brief language is "any references to the codex-mapping surveyor concept. Replace with the cartograph-decomposition framing or remove if no longer relevant" — implies the audit is light here.

### Bucket B — indirect docs the brief does NOT enumerate but that carry stale `vision-keeper` references

Reading: the brief says the Reckoner contract doc should "stand on its abstract description … without requiring an in-tree example." The same logic applies by extension to every other doc that uses vision-keeper as illustrative example data — those examples become stale citations to a deleted plugin. The brief is silent on these specifically; they're decision territory.

- **`docs/architecture/apparatus/reckoner.md`** — the Reckoner apparatus shape doc.
  - §"Kit Interface" inline kit example (line 103) uses `source: 'vision-keeper.snapshot'`.
  - §"Source-id grammar" bullets (line 128) — `vision-keeper.snapshot` alongside other examples.
  - §"Workflow-2: petition()" inline create+stamp example (lines 705–719) — full request shape using `vision-keeper.snapshot` source and the `vision-keeper.io/vision-id` label.
  - §"Workflow-2: petition()" stamp-only example (line 757) — same pattern.

- **`docs/architecture/reckonings-book.md`** — the Reckonings book schema doc.
  - Schema field comment (line 144) — `// e.g. 'vision-keeper.snapshot'`.
  - Filter-query example prose (line 307) — "show me everything the Reckoner did with writs from `vision-keeper.snapshot`".
  - Index-rationale prose (line 742) — "vision-keeper's 'what changed since my last poll' check".
  - CDC subscription example (line 858–860) — illustrative `relay({ name: 'vision-keeper-on-accept', … })`.

- **`packages/plugins/reckoner/README.md`** — Reckoner package README.
  - Worked-example create+stamp block (lines 152–166) using `'vision-keeper.snapshot'`.
  - Worked-example stamp-only block (line 203) using same.
  - Worked-example kit declaration block (lines 220–233) declaring `'vision-keeper.snapshot'` source.

- **`docs/future/guild-vocabulary.md`** — staging vocabulary doc.
  - Line 29 — Lattice description references "vision-keepers" as future emitter.
  - Line 37 — Reckoner description references "a vision-keeper noticing drift" as petitioner example.

- **`docs/architecture/apparatus/lattice.md`** — line 25, "future emitters … vision-keeper".

### Bucket C — code comments inside the surviving Reckoner package

Code comments naming the deleted plugin / its files. They will be left dangling-but-harmless (compiles fine) until edited, but they read as drift the moment vision-keeper/ is deleted.

- `packages/plugins/reckoner/src/types.ts:8` — JSDoc names "the vision-keeper kit" as a downstream consumer.
- `packages/plugins/reckoner/src/tick.ts:75` — JSDoc cites `packages/plugins/vision-keeper/src/decline-relay.ts` as a sibling-relay precedent.
- `packages/plugins/reckoner/src/integration.test.ts:4–5` — describe-block intro names the vision-keeper integration test as a counterpart fixture; counterpart no longer exists.

### Bucket D — Reckoner test fixtures using `'vision-keeper'` literal strings

Tests that hardcode the literal strings `'vision-keeper'` (as fake `pluginId`) or `'vision-keeper.snapshot'` (as fake source) when wiring kit-contribution test entries or constructing `ext.reckoner` payloads. **None of these tests import from the vision-keeper package** — they use the strings as fixture values. Functionally independent of the package deletion; cosmetically stale once the plugin is gone.

- `packages/plugins/reckoner/src/reckoner-tick.test.ts` — eleven hits across lines 291, 292, 324, 422, 433, 442, 451, 464, 495, 567, 575, 705, 730 (and similar density throughout the 1000-line file).
- `packages/plugins/reckoner/src/reckoner.test.ts` — ~50+ hits using vision-keeper as fixture pluginId / source / label.
- `packages/plugins/reckoner/src/integration.test.ts` (the Reckoner's own one — distinct from the deleted vision-keeper integration test) — does NOT use `'vision-keeper'` strings; uses `'tester.kind'` instead. Sets a precedent for a generic test source.

## Concurrent doc-drift candidates (Surveyor codex-mapping framing, not enumerated by the brief)

Adjacent docs that describe The Surveyor in the now-obsolete codex-mapping framing. The brief enumerates three docs (`guild-metaphor.md`, `architecture/index.md`, `plugins.md`); these two are not enumerated but carry the same obsolete framing.

- **`docs/architecture/apparatus/scriptorium.md`** — three references:
  - Line 7 "Future work" callout: "the Surveyor's codex-awareness integration are not yet implemented".
  - Line 15 prose: "The Scriptorium does not know what a codex contains or what work applies to it (that's the Surveyor's domain)".
  - Line 650 "Future: Clockworks Events" prose names the Surveyor as the canonical downstream consumer of `codex.added` / `draft.sealed` events.
  - Line 671 prose: "no dependency on the Surveyor, the Spider, or any other consumer of codex state".
  - Line 689 prose: "the Surveyor updating its codex-awareness when a draft is sealed".
- **`docs/architecture/apparatus/review-loop.md`** — line 367: "Review loop data feeds Surveyor codex profiles (this codex has a 60% first-try rate → seed richer review graph by default)".

These references frame Surveyor's role as codex-awareness / codex-mapping, which is the framing the brief identifies as a conceptual landmine. Tagged in inventory as **concurrent doc updates needed** — under the brief's stated framework-architecture-rename intent, they would naturally be updated alongside the three enumerated docs.

## Cross-cutting concerns

### Cross-package coupling

There are no production-code import paths from any other package into `@shardworks/vision-keeper-apparatus`. The Reckoner package consumes the *string values* (`'vision-keeper.snapshot'` as a fixture) but does not import any symbol. Verified via grep — no `from '@shardworks/vision-keeper-apparatus'` exists anywhere outside the package itself.

### Workspace / dependency-graph implications

- pnpm-lock.yaml: regenerates cleanly via `pnpm install` after directory deletion (no version pins outside the workspace cite this package).
- `packages/plugins/reckoner/package.json` — does NOT declare a dev-dep on vision-keeper. Confirmed.
- `packages/plugins/vision-keeper/package.json` declares dev-deps on stacks, clockworks-stacks-signals, nexus-core, and runtime deps on clerk, clockworks, reckoner — all stay.

### Source-string consistency

The decline-relay's name (`vision-keeper-on-decline`), the source id (`vision-keeper.snapshot`), and the label key (`vision-keeper.io/vision-id`) are tied to the plugin's identity. The brief deletes the plugin; every illustrative reference downstream of the deletion becomes a citation to a non-existent source. Whether to sweep those citations across Bucket B/C/D is the load-bearing decision-axis of this commission beyond the brief's enumerated three doc updates.

### Standing orders referencing the decline relay

The brief calls out: "Any Clockworks standing orders referencing `vision-keeper-on-decline` or other relays the plugin contributed." Searched the tree: no `guild.json` files exist anywhere in the worktree. The only inline `vision-keeper-on-decline` standing-order example in source/docs is in `petitioner-registration.md` §9, which is in Bucket A (already enumerated). No fixture / no live config carries it.

### Forward-reference to `surveying-cascade.md`

The brief instructs the doc updates to describe The Surveyor as "the cartograph-decomposition apparatus described in the new architecture document" and explicitly cites `docs/architecture/surveying-cascade.md`. That file is not present in this worktree. The doc updates here will therefore forward-link to a path not yet (in this draft) populated. This is consistent with the brief's framing — the substrate apparatus (surveyor-apparatus) is also acknowledged as not yet extracted, and the click conclusion notes the arch doc lives at the absolute path `/workspace/nexus/docs/architecture/surveying-cascade.md`. Treat as a deliberate forward-reference; the artificer should use a relative-path link of the form `architecture/surveying-cascade.md` (from `guild-metaphor.md`) and `surveying-cascade.md` (from `architecture/index.md` and `architecture/plugins.md`).

## Out-of-scope per brief

- **`packages/plugins/cartograph/vision-keeper.md`** — placeholder role file for the cartograph's vision-keeper agent runtime. Brief explicitly out of scope: "address it during the substrate commission."
- **`packages/plugins/cartograph/package.json` `"files": [..., "vision-keeper.md"]`** — distributes the placeholder. By extension out of scope (would be addressed when the placeholder is renamed/deleted in the substrate commission).
- **`packages/plugins/cartograph/README.md`** line 211 ("No vision-keeper agent runtime. `vision-keeper.md` is a placeholder stub") — by extension out of scope.
- The new surveyor-apparatus substrate plugin — separate commission (`c-moji0ggh`).
- Sanctum-side vocabulary registry updates — already in place.
- A fresh worked-example petitioner — brief says "can be added later if a real consumer benefits from one."

## Adjacent-pattern notes

- **`@shardworks/sentinel-apparatus`** is the structural sibling pattern for the rename: the legacy stall/fail/drain pulse emitter formerly named "the Reckoner" was migrated under the `sentinel` plugin id, and the historical name was reclaimed for the petitioner-scheduler. Same shape as vision-keeper → surveyor: an old name is reclaimed for a new framework concept and the old behavior moves under a new package name. Confirmed via `apparatus/reckoner.md` ⚠️ callout (line 25).
- **`docs/future/guild-vocabulary.md` "Aliases" section** documents prior renames (e.g., `piece` → `step`, line 57) as historical bridges — captures the existing pattern for documenting renames. This commission's scope does NOT add an alias entry (sanctum-side vocab is out of scope), but the pattern is the precedent for if/when one is wanted.

## Doc/code discrepancy notes (data points; not lifted as observations per the bar)

- The cartograph package still ships `vision-keeper.md` as a placeholder role file, with the cartograph README naming "the vision-keeper agent runtime." Per the click conclusion (`c-moivkc4y`) the role formerly called vision-keeper is now called surveyor, and the placeholder file would naturally be renamed `surveyor.md` or similar in the substrate commission. Brief explicitly defers; not load-bearing for this commission.
- Reckoner package code comments cite `packages/plugins/vision-keeper/src/decline-relay.ts` as a sibling-relay precedent (`tick.ts:75`), and JSDoc in `types.ts:8` and `integration.test.ts:4–5` similarly cite the deleted package as a downstream consumer or counterpart. Tagged here as **concurrent doc updates needed** in the touched-by-this-commission Reckoner-package surface — the artificer will see the dangling refs while editing the README's worked examples and resolve them inline.

## Files index (one-stop reference)

| File | Bucket | Action class |
|---|---|---|
| `packages/plugins/vision-keeper/` (whole dir) | — | Delete |
| `pnpm-lock.yaml` | — | Regenerate via `pnpm install` |
| `docs/architecture/petitioner-registration.md` | A | Rewrite (delete §11; sweep inline examples; strike v0-scope language) |
| `docs/guild-metaphor.md` | A | Rewrite "The Surveyor" section |
| `docs/architecture/index.md` | A | Rewrite "The Apparatus" Surveyor sentence; update line 286 |
| `docs/architecture/plugins.md` | A | Light-touch audit (Surveyor used as a generic apparatus name) |
| `docs/architecture/apparatus/reckoner.md` | B | Sweep illustrative examples |
| `docs/architecture/reckonings-book.md` | B | Sweep illustrative examples |
| `packages/plugins/reckoner/README.md` | B | Sweep illustrative examples |
| `docs/future/guild-vocabulary.md` | B | Sweep illustrative references |
| `docs/architecture/apparatus/lattice.md` | B | Sweep one reference |
| `packages/plugins/reckoner/src/types.ts` | C | Concurrent: edit JSDoc |
| `packages/plugins/reckoner/src/tick.ts` | C | Concurrent: edit JSDoc |
| `packages/plugins/reckoner/src/integration.test.ts` | C | Concurrent: edit describe-block intro |
| `packages/plugins/reckoner/src/reckoner-tick.test.ts` | D | Audit: rename literal fixture strings (decision-gated) |
| `packages/plugins/reckoner/src/reckoner.test.ts` | D | Audit: rename literal fixture strings (decision-gated) |
| `docs/architecture/apparatus/scriptorium.md` | concurrent | Sweep Surveyor codex-mapping framing (decision-gated) |
| `docs/architecture/apparatus/review-loop.md` | concurrent | Sweep one Surveyor codex-profile reference (decision-gated) |


---

## Scope

### S1



### S2



### S3



### S4



### S5



---

## Decisions

### D1

**Options:**
- `rename`: Rename literal fixture strings across `reckoner.test.ts` and `reckoner-tick.test.ts` to a generic placeholder (e.g., `tester` for `pluginId`, `tester.kind` for `source`) following the existing precedent in the Reckoner's `integration.test.ts`. **Precedent inlined below; do not Read `integration.test.ts` for it:**

  ```ts
  // packages/plugins/reckoner/src/integration.test.ts (excerpt, lines 184-194)
  const reckonerKitEntries: KitEntry[] = [
    {
      pluginId: 'tester',
      packageName: '@test/tester',
      type: 'petitioners',
      value: [
        {
          source: 'tester.kind',
          description: 'a tester petitioner',
        },
      ],
    },
    // ...
  ];
  ```
- `leave`: Leave the strings as-is. They do not import from the deleted package, the tests pass, and the strings document a historical example. Accept that grep for 'vision-keeper' in the codebase will continue to surface them.
- `comment-only`: Leave the strings but add a one-line comment near each test fixture explaining the strings are illustrative and do not depend on the deleted plugin.

**Recommended:** `rename`. Three Defaults: prefer removal to deprecation. A literal string named after a deleted plugin is deprecation. Renaming follows the precedent already established in the Reckoner's own `integration.test.ts`.

**Selected:** `rename` (patron confirm: #1 fires cleanly: when removal and deprecation both work, remove — a literal string named after a deleted plugin is deprecation.)

### D2

**Options:**
- `delete-section`: Delete §11 in full. The contract is fully described in §§1–10 and §§12–14; §11's role was to provide an illustrative concrete instance which now has no in-tree implementation.
- `abstract-rewrite`: Rewrite §11 as a generic abstract walkthrough that does not reference any in-tree petitioner — describes the contract surfaces a hypothetical petitioner exercises, without naming a specific plugin.
- `swap-example`: Rewrite §11 to use a generic placeholder petitioner (e.g., `acme-detector` or one of the hypothetical examples from §5's grammar table), so the worked-example pedagogy is preserved without the deleted plugin.

**Recommended:** `delete-section`. Brief explicitly says delete sections that lose their purpose; §11's purpose is the in-tree example, which no longer exists. The Reckoner contract is already fully described in §§1–10 + §§12–14.

**Selected:** `delete-section` (patron confirm: #1 fires cleanly: the section's purpose was the in-tree worked example, which no longer exists; delete over deprecate.)

### D3

**Options:**
- `replace-generic`: Replace every inline citation with a generic placeholder source (e.g., `acme-detector.alert` or `tech-debt.detected`) — the latter already appears in the §5 source-id-grammar examples bullet.
- `keep-as-grammar-only`: Strip the inline-example citations entirely; describe the shape in prose only. Keep the §5 grammar bullet (where source-id examples are inherently illustrative).
- `leave`: Leave the citations. The strings illustrate the shape; the deleted plugin's name surviving in a doc example is cosmetic.

**Recommended:** `replace-generic`. Three Defaults: prefer removal of the deleted-plugin name to having it survive as a phantom citation. Replacing with `tech-debt.detected` keeps the worked-shape pedagogy without inventing an unfamiliar new placeholder. Brief intent: 'no naming collision, no conceptual landmine'.

**Selected:** `replace-generic` (patron confirm: No principle speaks to replace-vs-strip once the deleted-plugin name is removed — confirming the primer.)

### D4

**Options:**
- `strike-clause`: Strike the 'any non-`vision-keeper` petitioner' clause. The remaining callout retains the rest of the v0-scope description (combination function, Reckonings-book schema beyond the eval-log shape, patron-emit surface) which remains accurate.
- `rewrite-callout`: Rewrite the entire callout to describe the v0 scope without enumerating petitioner-specific items. The clause naming patron-emit / combination function / non-vision-keeper as out-of-scope was structured around the original vision-keeper-as-canonical pedagogy.
- `leave`: Leave the callout. Historical artifact of the v0 commission framing; downstream readers can interpret around it.

**Recommended:** `strike-clause`. Three Defaults: prefer removal to deprecation. The clause is now stale. Striking the single clause is the smallest edit that keeps the rest of the callout's scope description (which is still accurate) intact. Rewriting is over-edit; leaving is silent fallback.

**Selected:** `strike-clause` (patron confirm: #1 fires cleanly: the clause is stale; strike rather than rewrite or leave-as-deprecated.)

### D5

**Options:**
- `update-anticipated`: Update the sentence to reflect that The Surveyor is now anticipated as a planned package (the surveyor-apparatus substrate, landing in a separate commission). Keep The Executor's not-yet-extracted status verbatim.
- `remove`: Remove the footnote entirely. The substrate's actual landing will eventually update the doc; meanwhile the line carries little information.
- `leave-with-note`: Update minimally — note that The Surveyor's substrate is a planned future commission, but keep the 'not yet extracted' framing accurate at this commission's landing time.

**Recommended:** `update-anticipated`. Brief explicitly invites updating to reflect the planned-package status; that is the more informative state of the doc. Removing or leaving understates what is actually known.

**Selected:** `update-anticipated` (patron confirm: #37 fires cleanly: scaffold the slot when future content is known-coming — the substrate is a named queued commission.)

### D6

**Options:**
- `forward-link-relative`: Forward-link with relative paths matching the existing doc-link conventions (`architecture/surveying-cascade.md` from `guild-metaphor.md`; `surveying-cascade.md` from `architecture/index.md` and `architecture/plugins.md`). Reader sees a normal markdown link that resolves once the doc lands.
- `absolute-cite`: Use an absolute or repo-rooted citation form (e.g., 'see `docs/architecture/surveying-cascade.md`') without a markdown link, signaling the file may not yet be present.
- `no-link-just-prose`: Describe the new framing in the doc updates without any link to `surveying-cascade.md`. Reader gets a self-contained description; the link gets added in a follow-up once the cascade doc lands.

**Recommended:** `forward-link-relative`. Brief itself uses the relative-path form ('see `docs/architecture/surveying-cascade.md`'). Existing arch-doc convention uses relative-path markdown links. A dangling link in a draft is normal and resolves cleanly once the upstream commission lands.

**Selected:** `forward-link-relative` (patron confirm: No principle speaks to link form when the convention is well-established — confirming the primer.)

### D7

**Options:**
- `keep-block-unchanged`: Leave the ASCII block alone. Surveyor remains a layered apparatus name; the block's accuracy is unaffected.
- `edit-block-comment`: Add a comment-style annotation in the block (e.g., a footnote arrow) signaling the redefinition. Increases visual noise.
- `remove-surveyor-from-block`: Remove the Surveyor from the block until the substrate apparatus actually exists. The new Surveyor is a planned-not-yet-built package; the block currently shows it as a peer of Clockworks/Clerk which are real default-set apparatus.

**Recommended:** `keep-block-unchanged`. The Surveyor stays an apparatus identity; the ASCII block names apparatus by layer, not by role. Editing the block would over-touch a doc artifact that is correct at the right level of abstraction. The line-69 prose and line-286 footnote (which the brief specifically calls out) carry the load.

**Selected:** `keep-block-unchanged` (patron confirm: No principle speaks — the block is accurate at the apparatus-name level; confirming the primer.)

### D8

**Options:**
- `rewrite-now`: Rewrite all five docs in this commission, replacing illustrative `vision-keeper.snapshot` citations with a generic placeholder source. Keeps the framework's documented surface coherent at this commission's landing time.
- `leave-and-observe`: Leave them; observe the drift in observations for a downstream cleanup commission to address. Smaller blast radius for this commission, but leaves a phantom citation in the docs.
- `rewrite-load-bearing-only`: Rewrite only the most load-bearing docs (`apparatus/reckoner.md`, `reckonings-book.md`, `reckoner/README.md`); leave staging-vocabulary references (`future/guild-vocabulary.md`, `apparatus/lattice.md`) for a follow-up since those are list-of-future-emitters items.

**Recommended:** `rewrite-now`. Three Defaults: prefer removal to deprecation. The brief's anti-naming-collision intent applies one ring out. The rewrites are mechanical sed-style replacements; doing them now keeps the framework's documented surface coherent. Brief allows it ('any references to the codex-mapping surveyor concept' / 'the contract document should stand on its abstract description') even if it does not enumerate every doc.

**Selected:** `rewrite-now` (patron confirm: #1 fires cleanly: phantom citations to a deleted plugin across documented surface are deprecation; remove now.)

### D9

**Options:**
- `tech-debt-detected`: Use `tech-debt.detected` consistently across all rewrites. Already appears in the §5 source-id-grammar bullet of `petitioner-registration.md`. Plausible-real petitioner shape; reads as a coherent illustrative example.
- `patron-bridge-commission`: Use `patron-bridge.commission`. Also appears in the §5 grammar bullet. Risk: the patron-bridge apparatus is genuinely anticipated; using its name as a placeholder may be confused for a real consumer when the apparatus actually lands.
- `acme-detector-alert`: Use a fresh fictional name (e.g., `acme-detector.alert`). Unambiguous placeholder; no risk of confusion with a real future petitioner. Cost: introduces a new name not previously cited in the docs.
- `no-source-cite`: Strip source-id citations entirely from rewritten examples; describe the shape with `<source-id>` placeholders instead. Maximally abstract; loses the worked-shape pedagogy.

**Recommended:** `tech-debt-detected`. Three Defaults: extend at the right layer; do not invent new vocabulary needlessly. `tech-debt.detected` already exists in the contract doc's grammar bullet, plausibly represents a real future petitioner, and reuses an established example name. Patron-bridge risks confusion when the patron-bridge apparatus actually lands; a fresh acme-detector name introduces vocabulary noise.

**Selected:** `tech-debt-detected` (patron confirm: #18 fires cleanly: reuse vocabulary already cited in the grammar bullet rather than invent a new placeholder name.)

### D10

**Options:**
- `rewrite-both-now`: Rewrite both docs in this commission. Replace 'the Surveyor's domain' / 'codex-awareness' framing with neutral language consistent with the new cartograph-decomposition Surveyor (e.g., 'the apparatus that surveys cartograph nodes' or simply removing the Surveyor reference where it no longer applies).
- `rewrite-scriptorium-only`: Rewrite Scriptorium only (it has the heaviest concentration); leave the single review-loop.md reference as drift.
- `leave-and-observe`: Leave both. Observe as drift for a downstream cleanup commission. Smaller blast radius for this commission, accepts the framing inconsistency until then.
- `rewrite-light-touch`: Light-touch edit — remove or neutralize the Surveyor references where they no longer make sense (e.g., 'codex profiles', 'codex-awareness integration') without proactively rewriting them as cartograph-decomposition references. Lets the Scriptorium-Surveyor relationship be re-described when the substrate actually lands.

**Recommended:** `rewrite-both-now`. Three Defaults: prefer removal to deprecation. The brief's intent is to redefine The Surveyor consistently across the framework architecture; leaving the obsolete framing in two adjacent apparatus docs reproduces the conceptual landmine the brief identifies. Light-touch is acceptable if the patron prefers to defer the proactive cartograph-decomposition framing in those docs until the substrate actually lands.

**Selected:** `rewrite-both-now` (patron confirm: #1 fires cleanly: leaving obsolete codex-mapping framing in adjacent apparatus docs reproduces the conceptual landmine the brief identifies.)

### D11

**Options:**
- `update-now`: Update all three JSDoc sites in this commission. The artificer is already editing the Reckoner README's worked examples (per S4); these JSDoc edits are concurrent.
- `leave-and-observe`: Leave the JSDoc refs as code-comment drift. They do not affect compilation or runtime; can be cleaned up incidentally when the surrounding code is next edited.

**Recommended:** `update-now`. Concurrent doc updates pattern from the primer's principles: when the artificer is already touching the file (Reckoner README is in S4 scope, the test file is adjacent), JSDoc cleanups belong inline. Three Defaults: prefer removal to deprecation. The cost is one-line edits per site.

**Selected:** `update-now` (patron confirm: #1 fires cleanly: dangling JSDoc refs to a deleted package are drift; remove inline while the artificer is already touching the package.)

---

## Specification

# Cleanup: delete vision-keeper plugin + redefine The Surveyor

## Intent

Delete the `@shardworks/vision-keeper-apparatus` plugin in full, and redefine "The Surveyor" across the framework architecture documentation to mean the cartograph-decomposition apparatus described in `docs/architecture/surveying-cascade.md`. This is a coordinated cleanup with no implementation logic — purely deletions, doc rewrites, and a sweep of stale citations.

## Rationale

The vision-keeper plugin was authored as the canonical worked example for the Reckoner contract — a reference petitioner exercising every contract surface. With the cartograph + surveying-cascade architecture now settled, the role formerly called "vision-keeper" has been renamed "surveyor" and reframed: it operates on cartograph nodes (visions/charges/pieces), not on drift snapshots, and the activity defines the role rather than the input shape. Leaving the legacy plugin in place creates a naming collision (the architecture's reserved "Surveyor" identity now points at the new apparatus) and a conceptual landmine (any reader encountering `vision-keeper` will conflate it with the new framing). The obsolete codex-mapping description of The Surveyor in adjacent architecture docs reproduces the same failure mode one ring out and must be cleared at the same time.

## Scope & Blast Radius

**Plugin deletion.** The entire `packages/plugins/vision-keeper/` directory — package metadata, source, tests, README — is removed. The `pnpm-workspace.yaml` glob already covers `packages/plugins/*`; deleting the directory is sufficient and `pnpm install` regenerates the lockfile cleanly. No production code in any other package imports a symbol from `@shardworks/vision-keeper-apparatus` — verified by grep — so the deletion has no compile-time consumers to update.

**Reckoner-package internal sweep.** Although no symbol is imported, the Reckoner package retains stale references to the deleted plugin in three places:
- Literal `'vision-keeper'` / `'vision-keeper.snapshot'` / `'vision-keeper.io/vision-id'` strings used as fixture values throughout the Reckoner's unit tests (`reckoner.test.ts`, `reckoner-tick.test.ts`). Rename to a generic placeholder following the precedent already set by `packages/plugins/reckoner/src/integration.test.ts`, which uses `'tester.kind'`.
- JSDoc comments in `packages/plugins/reckoner/src/types.ts`, `packages/plugins/reckoner/src/tick.ts`, and `packages/plugins/reckoner/src/integration.test.ts` that name the deleted package as a downstream consumer or counterpart. Update inline.
- The Reckoner package README (`packages/plugins/reckoner/README.md`) carries worked-example blocks (create+stamp, stamp-only, kit-declaration) using `'vision-keeper.snapshot'`. Sweep these.

**Petitioner-registration contract doc.** `docs/architecture/petitioner-registration.md` is the largest single edit:
- Section 11 ("Built-in example: vision-keeper") is deleted in full.
- Inline `vision-keeper.snapshot` / `vision-keeper.io/vision-id` / `vision-keeper-on-decline` citations in §§1, 3, 5, 9 are replaced with the generic placeholder source `tech-debt.detected` (already cited in §5's source-id-grammar bullets).
- The v0-scope callout near the top of the doc has its "any non-`vision-keeper` petitioner are explicitly out of scope" clause stricken; the remainder of the callout (which describes other v0-scope items accurately) stays.

**The Surveyor redefinition.** Three enumerated architecture docs are rewritten so The Surveyor is described as the cartograph-decomposition apparatus — surveying cartograph nodes, producing structural decompositions, registering as a kit-contributable surveyor with the surveyor-apparatus substrate:
- `docs/guild-metaphor.md` — "The Surveyor" section.
- `docs/architecture/index.md` — the apparatus prose at line 69 and the line-286 footnote (updated to reflect that the surveyor-apparatus substrate is now anticipated as a planned package; The Executor's not-yet-extracted status is preserved verbatim). The System-at-a-Glance ASCII block at line 27 is unchanged — it lists apparatus by layer-name, which is accurate at that level of abstraction.
- `docs/architecture/plugins.md` — light-touch audit; the existing references treat Surveyor as a generic apparatus name, so no codex-mapping framing needs to be replaced. Verify nothing slipped in.

Each rewrite forward-links to `docs/architecture/surveying-cascade.md` using a relative-path markdown link (`architecture/surveying-cascade.md` from `docs/guild-metaphor.md`; `surveying-cascade.md` from the two `docs/architecture/` files). The cascade doc itself is not present in this worktree — it lands via a separate commission — and the dangling link is deliberate.

**Adjacent Surveyor codex-mapping docs.** Two apparatus docs carry the same obsolete codex-mapping framing the brief enumerates and must be swept in this commission:
- `docs/architecture/apparatus/scriptorium.md` — five references describing "the Surveyor's domain" / "codex-awareness" / "codex profiles" (lines 7, 15, 650, 671, 689).
- `docs/architecture/apparatus/review-loop.md` — one reference to "Surveyor codex profiles" (line 367).

Replace with neutral language consistent with the new cartograph-decomposition framing, or remove the reference outright where the original sentence loses its purpose.

**Secondary docs with illustrative citations.** Five docs cite vision-keeper as a worked-example source or future emitter without being the load-bearing contract surface. Sweep illustrative `vision-keeper.snapshot` / `vision-keeper-on-*` citations and replace with `tech-debt.detected`:
- `docs/architecture/apparatus/reckoner.md`
- `docs/architecture/reckonings-book.md`
- `docs/future/guild-vocabulary.md`
- `docs/architecture/apparatus/lattice.md`
- (Reckoner package README is listed under the Reckoner-package internal sweep above.)

**Cross-cutting verification.** After all edits, a grep for `vision-keeper` across the entire worktree must return only the intentional residues — there is exactly one: `packages/plugins/cartograph/vision-keeper.md`, the cartograph placeholder role file, which the brief explicitly defers to the substrate commission. Any other hit is drift the implementer must resolve.

## Decisions

| # | Decision | Default | Rationale |
|---|----------|---------|-----------|
| D1 | Reckoner test-fixture `'vision-keeper'` literal strings | rename | Removal beats deprecation; Reckoner's `integration.test.ts` already uses `'tester.kind'` — follow the precedent. |
| D2 | `petitioner-registration.md` §11 ("Built-in example: vision-keeper") | delete-section | Section's purpose was the in-tree worked example, which no longer exists; the rest of the contract doc stands on its own. |
| D3 | Inline `vision-keeper.*` citations in §§1, 3, 5, 9 | replace-generic | Replace with a generic placeholder source rather than strip examples or leave the deleted plugin's name as a phantom citation. |
| D4 | v0-scope callout clause naming "any non-vision-keeper petitioner" | strike-clause | Smallest correct edit; the remainder of the callout still describes the v0 scope accurately. |
| D5 | `architecture/index.md` line-286 footnote about not-yet-extracted apparatus | update-anticipated | The surveyor-apparatus substrate is a named queued commission; reflect that. The Executor's not-yet-extracted state is preserved verbatim. |
| D6 | Forward-reference form for `surveying-cascade.md` | forward-link-relative | Use relative-path markdown links matching the existing arch-doc convention; dangling link is normal in a draft and resolves cleanly. |
| D7 | System-at-a-Glance ASCII block listing "Clockworks · Surveyor · Clerk" | keep-block-unchanged | The block lists apparatus by name; The Surveyor remains an apparatus identity. The block is correct at the right level of abstraction. |
| D8 | Illustrative `vision-keeper.*` citations in secondary docs | rewrite-now | Phantom citations to a deleted plugin reproduce the naming-collision failure mode one ring out; sweep them now while the artificer is in the area. |
| D9 | Generic placeholder source-id replacing `vision-keeper.snapshot` | tech-debt.detected | Already cited in `petitioner-registration.md` §5's source-id grammar; reuse established vocabulary instead of inventing a new placeholder. |
| D10 | Scriptorium / review-loop obsolete codex-mapping framing | rewrite-both-now | Leaving the framing intact in two adjacent apparatus docs reproduces the conceptual landmine the brief identifies. |
| D11 | Reckoner JSDoc references to the deleted package (`tick.ts`, `types.ts`, `integration.test.ts`) | update-now | Dangling JSDoc refs are drift; the artificer is already touching the package for the README sweep — concurrent edit. |

## Acceptance Signal

1. `pnpm install` completes cleanly after the package directory is deleted; the `pnpm-lock.yaml` no longer contains a `packages/plugins/vision-keeper` entry.
2. `pnpm -r build` succeeds across the entire monorepo.
3. `pnpm -r test` passes across the entire monorepo, including all Reckoner tests after fixture renames.
4. `grep -r vision-keeper` across the worktree returns exactly one path: `packages/plugins/cartograph/vision-keeper.md` (the deferred placeholder). No other hits anywhere — no doc reference, no test fixture, no code comment.
5. `docs/architecture/petitioner-registration.md` reads coherently end-to-end without §11; no broken section cross-references; the v0-scope callout no longer names the deleted plugin.
6. The three enumerated framework architecture docs (`docs/guild-metaphor.md`, `docs/architecture/index.md`, `docs/architecture/plugins.md`) describe The Surveyor consistently as the cartograph-decomposition apparatus, each with a working relative-path forward-link to `surveying-cascade.md`.
7. `docs/architecture/apparatus/scriptorium.md` and `docs/architecture/apparatus/review-loop.md` no longer describe The Surveyor in codex-mapping / codex-awareness / codex-profile terms.

## Existing Patterns

- **`packages/plugins/reckoner/src/integration.test.ts`** — uses `'tester.kind'` as a generic source-id for fixture values. Established precedent for what to rename the Reckoner unit-test `'vision-keeper.snapshot'` strings to.
- **`packages/plugins/sentinel/`** — structural sibling pattern. The legacy stall/fail/drain pulse emitter formerly named "the Reckoner" was migrated under the `sentinel` plugin id when the Reckoner name was reclaimed for the petitioner-scheduler. Same shape as vision-keeper → surveyor: an old name is reclaimed for a new framework concept and the previous behavior moves under a new package name. Useful reference if any unexpected coupling surfaces during the deletion.
- **`docs/architecture/petitioner-registration.md` §5 source-id-grammar bullets** — the existing list of example source-ids (including `tech-debt.detected` and `patron-bridge.commission`) shows the established vocabulary for placeholder source names. Reuse `tech-debt.detected` for every replacement.
- **Existing arch-doc cross-link convention** — relative-path markdown links between docs (e.g., from `docs/guild-metaphor.md` to `docs/architecture/*.md` use `architecture/foo.md`; from one `docs/architecture/*.md` to another use `foo.md`). Match this exactly when forward-linking `surveying-cascade.md`.

## What NOT To Do

- Do **not** touch `packages/plugins/cartograph/vision-keeper.md`, the cartograph package's `package.json` `files` array, or the cartograph README's reference to the placeholder. The brief explicitly defers the cartograph placeholder to the substrate commission.
- Do **not** create the new `surveyor-apparatus` substrate plugin. That is a separate queued commission.
- Do **not** add a fresh worked example to the Reckoner contract doc. The contract is intended to stand on its abstract description; a new worked example may be added later if a real consumer benefits.
- Do **not** add sanctum-side vocabulary registry entries or aliases for the rename. Sanctum-side vocab is already in place and out of scope.
- Do **not** preserve `vision-keeper` as a deprecated alias, redirect file, or backward-compat shim. The plugin is deleted; references are removed, not deprecated.
- Do **not** edit the System-at-a-Glance ASCII block in `docs/architecture/index.md` (line 27). The block names apparatus by layer; The Surveyor remains an apparatus identity.
- Do **not** invent a new placeholder source-id name. Use `tech-debt.detected` consistently for every replacement.
- Do **not** modify `pnpm-workspace.yaml`. Its glob already handles the deleted directory.

<task-manifest>
  <task id="t1">
    <name>Rename Reckoner test fixtures off vision-keeper literals</name>
    <files>packages/plugins/reckoner/src/reckoner.test.ts, packages/plugins/reckoner/src/reckoner-tick.test.ts</files>
    <action>Audit both files for the literal strings `'vision-keeper'` (used as fixture pluginId), `'vision-keeper.snapshot'` (used as fixture source), and `'vision-keeper.io/vision-id'` (used as fixture label key). Replace consistently with the generic-tester convention already established by `packages/plugins/reckoner/src/integration.test.ts`: use `'tester'` for pluginId and `'tester.kind'` for source. Choose a parallel generic label key in keeping with that convention. The strings are fixture values, not symbols — no imports change.</action>
    <verify>pnpm --filter @shardworks/reckoner-apparatus test</verify>
    <done>Both Reckoner unit-test files pass with no `'vision-keeper'` literals remaining; the renamed fixture values are consistent with the precedent in `integration.test.ts`.</done>
  </task>

  <task id="t2">
    <name>Sweep Reckoner package JSDoc and README of vision-keeper references</name>
    <files>packages/plugins/reckoner/src/types.ts, packages/plugins/reckoner/src/tick.ts, packages/plugins/reckoner/src/integration.test.ts, packages/plugins/reckoner/README.md</files>
    <action>Update three JSDoc / describe-block sites that name the deleted package as a downstream consumer or counterpart fixture (`types.ts`, `tick.ts`, `integration.test.ts`) so the comments either cite a generic petitioner or simply omit the now-broken reference, whichever reads cleaner. Sweep the README's worked-example blocks (create+stamp, stamp-only, kit-declaration) replacing every `'vision-keeper.snapshot'` and `'vision-keeper.io/vision-id'` citation with `tech-debt.detected` and a parallel generic label key. Preserve the pedagogical shape of each example.</action>
    <verify>pnpm --filter @shardworks/reckoner-apparatus build &amp;&amp; pnpm --filter @shardworks/reckoner-apparatus test</verify>
    <done>The Reckoner package contains no references to vision-keeper in code comments, JSDoc, or README; the package builds and tests pass.</done>
  </task>

  <task id="t3">
    <name>Delete the vision-keeper plugin directory and regenerate the lockfile</name>
    <files>packages/plugins/vision-keeper/ (entire directory), pnpm-lock.yaml</files>
    <action>Remove the entire `packages/plugins/vision-keeper/` directory — package metadata, source, tests, README, every file. Then run `pnpm install` from the repo root to regenerate the lockfile. The `pnpm-workspace.yaml` glob already covers `packages/plugins/*`, so no workspace edit is needed. No other package imports any symbol from `@shardworks/vision-keeper-apparatus` (verified at planning time), so this should not cascade compile errors anywhere.</action>
    <verify>pnpm install &amp;&amp; pnpm -r build</verify>
    <done>The directory is gone, the lockfile no longer carries a `packages/plugins/vision-keeper` block, and the monorepo builds end-to-end.</done>
  </task>

  <task id="t4">
    <name>Rewrite petitioner-registration.md as a stand-alone contract doc</name>
    <files>docs/architecture/petitioner-registration.md</files>
    <action>Delete §11 ("Built-in example: vision-keeper") in full. Sweep every inline citation of `vision-keeper.snapshot`, `vision-keeper.io/vision-id`, and `vision-keeper-on-decline` in §§1, 3, 5, 9; replace each with `tech-debt.detected` (and a parallel generic label key / standing-order name where applicable, keeping the example shape coherent). Strike the v0-scope callout clause naming "any non-`vision-keeper` petitioner are explicitly out of scope"; preserve the rest of the callout. Reread the doc end-to-end and resolve any cross-references that broke when §11 was removed (e.g., "as shown in §11" pointers, table-of-contents entries).</action>
    <verify>grep -n "vision-keeper" docs/architecture/petitioner-registration.md (must return zero hits) and a manual readthrough confirming no broken §11 references</verify>
    <done>The doc reads coherently as an abstract contract description with no in-tree example, no surviving vision-keeper citations, and no dangling section cross-references.</done>
  </task>

  <task id="t5">
    <name>Redefine The Surveyor in the three enumerated framework architecture docs</name>
    <files>docs/guild-metaphor.md, docs/architecture/index.md, docs/architecture/plugins.md</files>
    <action>In `docs/guild-metaphor.md`, rewrite "The Surveyor" section so it describes the apparatus that surveys cartograph nodes (visions / charges / pieces), produces structural decompositions, and registers as a kit-contributable surveyor with the surveyor-apparatus substrate. Forward-link to `architecture/surveying-cascade.md`. In `docs/architecture/index.md`, rewrite the apparatus-layer prose at line 69 to match the new framing and update the line-286 footnote to indicate that the surveyor-apparatus substrate is now anticipated as a planned package landing in a separate commission, while preserving The Executor's not-yet-extracted status verbatim. Forward-link to `surveying-cascade.md`. Do NOT modify the System-at-a-Glance ASCII block at line 27. In `docs/architecture/plugins.md`, audit the three Surveyor mentions; the existing references treat Surveyor as a generic apparatus name and likely need no rewrite — confirm by reading each in context, and only edit if a codex-mapping framing has slipped in. If any rewrite is needed there, forward-link to `surveying-cascade.md` matching the existing arch-doc relative-path convention.</action>
    <verify>grep -n "codex-aware\|codex profile\|codex-mapping\|tracks what work applies" docs/guild-metaphor.md docs/architecture/index.md docs/architecture/plugins.md (must return zero hits relating to The Surveyor) and a manual readthrough of the three docs</verify>
    <done>All three docs describe The Surveyor as the cartograph-decomposition apparatus; each rewrite has a working relative-path forward-link to `surveying-cascade.md`; the line-286 footnote reflects the surveyor-apparatus's planned-package status; the ASCII block is unchanged.</done>
  </task>

  <task id="t6">
    <name>Sweep adjacent Surveyor codex-mapping framing from Scriptorium and review-loop</name>
    <files>docs/architecture/apparatus/scriptorium.md, docs/architecture/apparatus/review-loop.md</files>
    <action>In `scriptorium.md`, audit every reference to The Surveyor (the planning inventory identified five: lines 7, 15, 650, 671, 689). Replace codex-mapping / codex-awareness / codex-profiles framing with neutral language consistent with the new cartograph-decomposition Surveyor, or remove the sentence outright where the original sentence loses its purpose under the new framing. In `review-loop.md`, do the same for the single reference at line 367 ("Surveyor codex profiles"). Do not introduce new claims about how Scriptorium and Surveyor relate under the new architecture — that is the surveying-cascade doc's job; just clear the obsolete framing here.</action>
    <verify>grep -n "Surveyor" docs/architecture/apparatus/scriptorium.md docs/architecture/apparatus/review-loop.md and confirm every remaining hit is consistent with the cartograph-decomposition framing or has been removed</verify>
    <done>Neither doc describes The Surveyor in codex-mapping / codex-awareness / codex-profile terms; remaining mentions (if any) are framing-neutral and accurate.</done>
  </task>

  <task id="t7">
    <name>Sweep illustrative vision-keeper citations from secondary docs</name>
    <files>docs/architecture/apparatus/reckoner.md, docs/architecture/reckonings-book.md, docs/future/guild-vocabulary.md, docs/architecture/apparatus/lattice.md</files>
    <action>In each of the four docs, replace illustrative citations of `vision-keeper.snapshot`, `vision-keeper.io/vision-id`, `vision-keeper-on-accept`, `vision-keeper-on-decline`, and bare `vision-keeper` / `vision-keepers` references (used as a future-emitter or worked-example name) with `tech-debt.detected` (for source-ids), parallel generic label / relay names, and a generic petitioner descriptor (for prose mentions). Preserve the pedagogical shape of each example. Do NOT introduce a new petitioner concept; reuse `tech-debt.detected` for every replacement, matching the established vocabulary in `petitioner-registration.md` §5.</action>
    <verify>grep -rn "vision-keeper" docs/ packages/ (must return exactly one hit: `packages/plugins/cartograph/vision-keeper.md`, the deferred placeholder)</verify>
    <done>All four secondary docs are coherent without the deleted-plugin name; the only surviving `vision-keeper` reference anywhere in the worktree is the cartograph placeholder file (deferred to the substrate commission).</done>
  </task>
</task-manifest>
