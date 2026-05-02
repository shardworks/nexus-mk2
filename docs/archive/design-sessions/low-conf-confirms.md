# Low-confidence confirms — last 25 completed mandates

Total: 106 decisions across 25 plandocs.

**Universal rationale pattern: "no principle speaks/fires" — confirming the primer.**
All 106 low-confidence confirms cite the same reason: the patron-anima review surface has no principled basis to override or endorse, so it confirms but flags low confidence.

## Category breakdown

| Category | Count |
|---|---:|
| Docs / wording | 29 |
| Naming / identifiers | 17 |
| Test shape | 8 |
| Log / error text | 3 |
| Transaction / event shape | 2 |
| Migration / legacy data | 4 |
| Control flow / ordering | 20 |
| Internal data shape | 7 |
| CLI / config / defaults | 8 |
| Validation | 1 |
| Type system minutiae | 1 |
| Package / file org | 2 |
| Other | 4 |
| **Total** | **106** |

## Docs / wording (29)

| Writ | Dec | Question | Selected |
|---|---|---|---|
| `w-mojmj0rc` — Cartograph: collapse companion docs into `writ.ext['car… | D6 | Do the `VisionDoc` / `ChargeDoc` / `PieceDoc` projection types keep their `[key: string]: unknown` index signature? | `retain_verbatim_per_brief` |
| `w-mojmj0rc` — Cartograph: collapse companion docs into `writ.ext['car… | D15 | Should the cartograph README's documentation of the create/transition atomic transaction be tightened to call out the new ext-stam… | `rewrite_minimal` |
| `w-moji63xm` — Cleanup: delete vision-keeper plugin + redefine The Sur… | D6 | How should the new Surveyor framing forward-reference `docs/architecture/surveying-cascade.md`, given that file is not present in… | `forward-link-relative` |
| `w-moji63xm` — Cleanup: delete vision-keeper plugin + redefine The Sur… | D7 | Should the System-at-a-Glance ASCII block in `architecture/index.md` (line 27) listing 'Clockworks · Surveyor · Clerk' be edited a… | `keep-block-unchanged` |
| `w-moji5a2z` — Vision authoring on disk: `nsg vision apply` CLI | D22 | Where in cartograph/README.md does the apply tool's documentation live — a new top-level section, an extension of the existing CLI… | `table-row-plus-section` |
| `w-moiy7bmo` — Scheduler kit-contribution registry for the Reckoner | D34 | Does the apparatus contract document (docs/architecture/apparatus/reckoner.md) get the schedulers section in this commission, or i… | `scoped-addition` |
| `w-moix2b56` — Rename `spider.follows` to `depends-on` and establish C… | D3 | How does the `depends-on` description string handle word-wrapping and inline emphasis, given the brief's verbatim text? | `verbatim-single-string` |
| `w-moix2b56` — Rename `spider.follows` to `depends-on` and establish C… | D13 | Where does the doc text for the naming-primacy principle land — Clerk's architecture doc, the Clerk README, or both? | `both-docs` |
| `w-moix1zoj` — Oculus list pages should deep link with configured filt… | D7 | How are boolean filters (writs showChildren, showCancelled) encoded? | `true-false-string` |
| `w-moix1zoj` — Oculus list pages should deep link with configured filt… | D12 | Should the feedback page's per-detail tag filter use the same URL contract, or is per-detail state different enough to skip? | `same-contract` |
| `w-moi6ik0k` — Doc-hygiene sweep: docs/architecture/index.md (legacy p… | D4 | How should the plugin-id derivation example at line 233 be updated? | `use-real` |
| `w-moi6ik0k` — Doc-hygiene sweep: docs/architecture/index.md (legacy p… | D7 | What link target should the new Clockworks table row use? | `match-prose` |
| `w-moi6ik0k` — Doc-hygiene sweep: docs/architecture/index.md (legacy p… | D8 | What one-line function summary should the new Clockworks row use? | `nervous-system` |
| `w-moi6ik0k` — Doc-hygiene sweep: docs/architecture/index.md (legacy p… | D9 | What edit shape should the Future State `workshops → codexes` entry receive? | `rewrite-with-xref` |
| `w-moi6iioe` — Doc-hygiene sweep: docs/reference/core-api.md (post-v2… | D4 | How should the rewritten doc treat the framework-internal exports (setGuild, clearGuild) and the lower-traffic utility helpers (pi… | `A_mirror_README_compact_table` |
| `w-moi6iioe` — Doc-hygiene sweep: docs/reference/core-api.md (post-v2… | D8 | Should the rewritten doc add a section on findGuildRoot's signature change (now `startDir?: string`, defaults to cwd)? | `A_per_function_signature_correct` |
| `w-moi6e32j` — Default codex on commission-post when guild has one cod… | D4 | What exact error wording does commission-post use for the multi-codex and zero-codex cases? | `verbatim` |
| `w-moi6e32j` — Default codex on commission-post when guild has one cod… | D9 | Should the docstring/instructions strings on the commission-post tool be updated to describe the new defaulting/throw behavior? | `update-both` |
| `w-moi2wcmo` — Animator complexity-diagnosis follow-ups holding-pen | D3 | Should the README §Startup Routines refresh enumerate the hook registrations and validateBackoffConfig as their own numbered stage… | `prose` |
| `w-moi2wcmo` — Animator complexity-diagnosis follow-ups holding-pen | D6 | Should the spider/README.md animator-paused row's condition shape document the missing-condition path explicitly (e.g. `{ sessionI… | `footnote` |
| `w-moi2wcmo` — Animator complexity-diagnosis follow-ups holding-pen | D7 | Should the spider/README.md animator-paused row's prose duplicate of the isDispatchable predicate body be rewritten, or should the… | `trim-prose` |
| `w-moi2wcmo` — Animator complexity-diagnosis follow-ups holding-pen | D13 | Should the holding-pen mandate's status remain held (the brief's explicit "DO NOT DISPATCH yet") or transition to ready-for-dispat… | `release-framework-first` |
| `w-mohuvshq` — Vision-keeper: petitioner kit declaration and worked ex… | D4 | What is the exact `description` text on the petitioner descriptor? | `verbatim` |
| `w-mohuvk8x` — Clerk: add WritDoc.ext field and setWritExt API | D16 | Where is the metadata-vs-status semantic distinction documented? | `both-doc-surfaces` |
| `w-mohuoygf` — Tools/CLI events cleanup and Astrolabe events kit decla… | D3 | When deleting the bootstrap-emit calls from pluginInstall / pluginRemove, should any companion code (numbered comment headers, lef… | `minimal-deletion` |
| `w-mohuoygf` — Tools/CLI events cleanup and Astrolabe events kit decla… | D7 | Exact `description` string for the EventSpec entry? | `brief-text` |
| `w-mohuoygf` — Tools/CLI events cleanup and Astrolabe events kit decla… | D9 | How should the docs/architecture/clockworks.md line 17 code-comment example be updated when removing 'tool.installed'? | `replace-with-astrolabe` |
| `w-mohuoygf` — Tools/CLI events cleanup and Astrolabe events kit decla… | D10 | How aggressively should the cli/README.md `nsg signal` paragraph (lines 132-135) be rewritten when removing the `tool.` token from… | `surgical` |
| `w-mohuoxgh` — Create `clockworks-stacks-signals` bridge plugin | D13 | What is the apparatus doc file's exact name? | `plugin-id-md` |

## Naming / identifiers (17)

| Writ | Dec | Question | Selected |
|---|---|---|---|
| `w-moji5a2z` — Vision authoring on disk: `nsg vision apply` CLI | D15 | How does apply write the updated sidecar — direct overwrite (`writeFile`) or write-temp-then-rename (atomic-ish)? | `temp-then-rename` |
| `w-moji5a2z` — Vision authoring on disk: `nsg vision apply` CLI | D18 | What is the plugin id used as the second argument to `clerk.setWritExt(writId, pluginId, value)` for the surveyor slot — the liter… | `local-constant` |
| `w-moiy7bmo` — Scheduler kit-contribution registry for the Reckoner | D6 | What is the new kit-contribution type name — 'schedulers' or another label? | `schedulers` |
| `w-moiy7bmo` — Scheduler kit-contribution registry for the Reckoner | D13 | What is the field name in guild.json for the scheduler selector? | `scheduler` |
| `w-moi6ik0k` — Doc-hygiene sweep: docs/architecture/index.md (legacy p… | D2 | Should the kit-contribution-field name `books:` (at lines 315 and 321) be renamed alongside the plugin id? | `keep` |
| `w-moi6ik0k` — Doc-hygiene sweep: docs/architecture/index.md (legacy p… | D10 | What three plugin ids should the rewritten notifications-stack composition statement list? | `lattice-sentinel-discord` |
| `w-moi6e32j` — Default codex on commission-post when guild has one cod… | D5 | How should registered codex names be ordered in the multi-codex error message? | `alphabetical` |
| `w-moi2wc2i` — Claude-code complexity-diagnosis follow-ups holding-pen | D13 | What is the new value for STDERR_DIAGNOSTIC_TAIL_LIMIT? | `2048` |
| `w-mohuvshq` — Vision-keeper: petitioner kit declaration and worked ex… | D2 | What package name and plugin id does vision-keeper use? | `vision-keeper-apparatus` |
| `w-mohuvpu2` — Reckoner: CDC handler for held-writ scheduling and life… | D6 | What is the idempotency identity for CDC re-delivery dedupe? | `writId-plus-writUpdatedAt` |
| `w-mohuvpu2` — Reckoner: CDC handler for held-writ scheduling and life… | D8 | What decline-reason value does the unregistered-source decline carry? | `source-unregistered` |
| `w-mohuvpu2` — Reckoner: CDC handler for held-writ scheduling and life… | D17 | What value does `consideredAt` carry — the event's observed time or `Date.now()` at handler entry? | `now-at-entry` |
| `w-mohuvn8h` — Reckoner apparatus: skeleton, registry, configuration,… | D18 | Where do the contract's type symbols (Priority, ComplexityTier, PetitionRequest, ReckonerExt, PetitionerDescriptor, ReckonerApi, R… | `single-types-ts` |
| `w-mohuoxy7` — Animator event surface migration | D12 | Should the `FRAMEWORK_EMITTER` constant in `session-emission.ts` be retained, renamed, or inlined? | `keep-const` |
| `w-mohuoxgh` — Create `clockworks-stacks-signals` bridge plugin | D1 | What is the npm package name for the new plugin? (`@shardworks/clockworks-stacks-signals` vs `@shardworks/clockworks-stacks-signal… | `with-apparatus-suffix` |
| `w-mohuoxgh` — Create `clockworks-stacks-signals` bridge plugin | D4 | What is the factory function name? | `createClockworksStacksSignals` |
| `w-mohuoxgh` — Create `clockworks-stacks-signals` bridge plugin | D20 | Should the `book.<owner>.<book>.<verb>` name composition use the verbatim `event.ownerId` and `event.book` from the delivered Chan… | `from-delivered-event` |

## Test shape (8)

| Writ | Dec | Question | Selected |
|---|---|---|---|
| `w-mojmj0rc` — Cartograph: collapse companion docs into `writ.ext['car… | D13 | What event count should the createVision test assert after the cleanup — given that one tx now writes to the writs book twice (cle… | `assert_one_create_event` |
| `w-moji5a2z` — Vision authoring on disk: `nsg vision apply` CLI | D17 | Where do the apply tool's tests live — extend tools.test.ts (current single-file integration suite for cartograph CLI tools) or ad… | `dedicated-file` |
| `w-moji5a2z` — Vision authoring on disk: `nsg vision apply` CLI | D24 | How does the apply test fixture verify the single-CDC-event-per-apply guarantee — count events via stacks.book(...).watch(...) han… | `watch-handler` |
| `w-moix4pe8` — Kit-contributed standing orders for Clockworks | D19 | What test coverage does the new path require, and where does it live? | `full-stack-coverage` |
| `w-mohzif1s` — Reattach detached-HEAD branch ref in the seal flow | D9 | How does the test detach HEAD before sealing? | `checkout-detach` |
| `w-mohuvpu2` — Reckoner: CDC handler for held-writ scheduling and life… | D20 | Test scaffolding: extend the existing `reckoner.test.ts` fixture, or create a new `reckoner-cdc.test.ts` file alongside it? | `new-file` |
| `w-mohuvpu2` — Reckoner: CDC handler for held-writ scheduling and life… | D24 | Does the vision-keeper integration test get updated as part of this commission to use the real CDC handler instead of the manually… | `both` |
| `w-mohuoygf` — Tools/CLI events cleanup and Astrolabe events kit decla… | D8 | How thorough should the supportkit.test.ts coverage of the new events kit field be? | `shape-form-and-uniqueness` |

## Log / error text (3)

| Writ | Dec | Question | Selected |
|---|---|---|---|
| `w-moi2wc2i` — Claude-code complexity-diagnosis follow-ups holding-pen | D11 | Which logging style is the package standard? | `stderr_write` |
| `w-mohzif1s` — Reattach detached-HEAD branch ref in the seal flow | D5 | Which logging channel and prefix carries the reattach line? | `console-warn-scriptorium-prefix` |
| `w-mohzif1s` — Reattach detached-HEAD branch ref in the seal flow | D6 | What format does the reattach log line take? | `short-shas` |

## Transaction / event shape (2)

| Writ | Dec | Question | Selected |
|---|---|---|---|
| `w-mojmj0rc` — Cartograph: collapse companion docs into `writ.ext['car… | D3 | How is atomicity composed for createX (writ creation + ext stamp)? | `replicate_clerk_post_internally` |
| `w-mohuvpu2` — Reckoner: CDC handler for held-writ scheduling and life… | D2 | Phase-1 (in-transaction) or Phase-2 (post-commit) Stacks CDC watcher on `clerk/writs`? | `phase-2` |

## Migration / legacy data (4)

| Writ | Dec | Question | Selected |
|---|---|---|---|
| `w-mojmj0rc` — Cartograph: collapse companion docs into `writ.ext['car… | D10 | When the three companion books are removed from `supportKit.books`, what happens to the existing-on-disk SQLite tables? | `leave_tables_in_place` |
| `w-moix2b56` — Rename `spider.follows` to `depends-on` and establish C… | D7 | Where does the `kind: 'spider.follows' → 'depends-on'` link-row migration live, and what is its loop shape? | `third-pass-after-link-normalization` |
| `w-moix2b56` — Rename `spider.follows` to `depends-on` and establish C… | D8 | What write API does the migration use, and does it preserve `createdAt`? | `patch` |
| `w-moix2b56` — Rename `spider.follows` to `depends-on` and establish C… | D9 | What does the migration log when it encounters rows to rewrite? | `summary-log` |

## Control flow / ordering (20)

| Writ | Dec | Question | Selected |
|---|---|---|---|
| `w-moji5a2z` — Vision authoring on disk: `nsg vision apply` CLI | D14 | How is the visionId binding written back to the sidecar — overwrite the file with a re-serialized YAML, or surgically edit the YAM… | `preserve-doc` |
| `w-mojdwk37` — Deferred-petition staleness diagnostic | D9 | When does the deferCount counter advance? | `deferred-only` |
| `w-mojdwk37` — Deferred-petition staleness diagnostic | D10 | What happens to the running counters (deferCount, firstDeferredAt, lastDeferredAt) when a writ transitions from deferred to accept… | `preserve` |
| `w-mojdwk37` — Deferred-petition staleness diagnostic | D11 | How does stalled / stalledSince behave on the dependency_pending ↔ dependency_failed transitions? | `brief-rules` |
| `w-moizema2` — Reckoner: stamp-only `petition()` overload + internal r… | D4 | In what order should the stamp-only form run its guards (input validation, writ load, phase check, existing-ext check)? | `input-first` |
| `w-moiyh0jz` — Reckoner dependency-aware consideration | D1 | Where in the rule sequence does the new dependency check fire? | `between-r4-and-r5` |
| `w-moiyh0jz` — Reckoner dependency-aware consideration | D2 | How does the classifier admit cancelled dependencies as cleared in v0? | `attrs-success-or-cancelled` |
| `w-moiyh0jz` — Reckoner dependency-aware consideration | D8 | How does the classifier read the target writ's current phase + writ-type config? | `writs-readonly-book` |
| `w-moiy8hkv` — Periodic tick for the Reckoner | D10 | When the tick's candidate set is empty (no held writs), what does the tick do? | `early-return` |
| `w-moiy7bmo` — Scheduler kit-contribution registry for the Reckoner | D12 | When does the registry seal — at phase:started, end of start(), or some other lifecycle hook? | `phase-started` |
| `w-moiy7bmo` — Scheduler kit-contribution registry for the Reckoner | D20 | How does the new evaluation flow integrate with considerWrit's existing rule sequence — does it replace Rule 5 (the always-approve… | `extract-helper` |
| `w-moiy7bmo` — Scheduler kit-contribution registry for the Reckoner | D25 | Where in considerWrit does the dedupe lookup (alreadyConsidered) sit relative to the new scheduler-evaluate step? | `dedupe-before-evaluate` |
| `w-moix4pe8` — Kit-contributed standing orders for Clockworks | D11 | What is the order-of-operations inside start() between the new kit-layer build and the existing schedule-table seed? | `kit-build-before-schedule-seed` |
| `w-moix4pe8` — Kit-contributed standing orders for Clockworks | D15 | How are kit-contributed standing orders presented to handlers at runtime — held by reference or cloned on snapshot? | `shallow-copy-on-snapshot` |
| `w-moix1zoj` — Oculus list pages should deep link with configured filt… | D4 | When the filter is at its default (e.g. classification = 'All', children-toggle on, every status selected), should the URL still c… | `omit-defaults` |
| `w-mohuvshq` — Vision-keeper: petitioner kit declaration and worked ex… | D23 | How does the keeper acquire the Reckoner handle — lazy-resolved per call, or cached at start()? | `cache-at-start` |
| `w-mohuvshq` — Vision-keeper: petitioner kit declaration and worked ex… | D24 | Does the decline-feedback relay handler also lazy-resolve dependencies, or are they passed in at relay registration? | `lazy-resolve-in-handler` |
| `w-mohuvpu2` — Reckoner: CDC handler for held-writ scheduling and life… | D11 | How does the handler stamp the decline reason on the cancelled writ? | `structured-resolution` |
| `w-mohuvn8h` — Reckoner apparatus: skeleton, registry, configuration,… | D5 | When does the registry seal — at `phase:started` (framework-wide signal) or at `apparatus:started` (Reckoner-specific signal)? | `phase-started` |
| `w-mohuoygf` — Tools/CLI events cleanup and Astrolabe events kit decla… | D6 | Where in the supportKit object literal should the `events:` field be placed? | `after-books` |

## Internal data shape (7)

| Writ | Dec | Question | Selected |
|---|---|---|---|
| `w-mojmj0rc` — Cartograph: collapse companion docs into `writ.ext['car… | D19 | Does the `patchVision/patchCharge/patchPiece` continue to require at least one mutable field, or does it become a no-op when calle… | `keep_cli_throw_typed_api_silent` |
| `w-moji63xm` — Cleanup: delete vision-keeper plugin + redefine The Sur… | D3 | How should the inline `vision-keeper.snapshot` / `vision-keeper.io/vision-id` / `vision-keeper-on-decline` citations in `petitione… | `replace-generic` |
| `w-moji5a2z` — Vision authoring on disk: `nsg vision apply` CLI | D2 | If D1 = extend-create: should the extended createVision accept BOTH initial phase and initial stage, or only one with the other de… | `both-explicit` |
| `w-mojdwk37` — Deferred-petition staleness diagnostic | D1 | What is the field set and shape of the ReckonerStatus snapshot stored at writ.status['reckoner']? | `brief-shape` |
| `w-moiy7bmo` — Scheduler kit-contribution registry for the Reckoner | D1 | What is the Scheduler interface shape — fields, generics, and method signatures? | `as-prescribed` |
| `w-moiy7bmo` — Scheduler kit-contribution registry for the Reckoner | D7 | What is the kit-side value shape — array of Scheduler instances, record keyed by id, or something else? | `array` |
| `w-moix4pe8` — Kit-contributed standing orders for Clockworks | D10 | Where is the kit-layer snapshot stored and how is its lifecycle scoped? | `closure-array-cleared-on-restart` |

## CLI / config / defaults (8)

| Writ | Dec | Question | Selected |
|---|---|---|---|
| `w-mojmj0rc` — Cartograph: collapse companion docs into `writ.ext['car… | D11 | Should the `recommends: ['oculus']` declaration be revisited after the companion books are removed? | `keep_recommends` |
| `w-mojdwk37` — Deferred-petition staleness diagnostic | D17 | What metric does the stalled threshold check against — defer_count or wall-clock? | `defer-count` |
| `w-moiy7bmo` — Scheduler kit-contribution registry for the Reckoner | D15 | What happens when reckoner.scheduler is unset or absent — default to reckoner.always-approve, fail-loud, or leave a null reference… | `default-info-log` |
| `w-moiy7bmo` — Scheduler kit-contribution registry for the Reckoner | D27 | What is the canonical id for the default scheduler — 'reckoner.always-approve' verbatim or a different label? | `always-approve` |
| `w-moi6ik0k` — Doc-hygiene sweep: docs/architecture/index.md (legacy p… | D6 | Where should the new Clockworks row be inserted in the Default Apparatus table at lines 271–283? | `after-clerk` |
| `w-moi3stwe` — Oculus: Filtering for 'Cancelled' writs | D4 | What is the default state of the Cancelled toggle on first render, and how is the visual rendered for that state? | `off_unfilled_default` |
| `w-moi3stwe` — Oculus: Filtering for 'Cancelled' writs | D8 | What is the new behavior of the type-filter 'All' button click? | `true_toggle` |
| `w-mohuvn8h` — Reckoner apparatus: skeleton, registry, configuration,… | D20 | Does the Reckoner expose a `writeConfig` or mutation API for `disabledSources`, or is it purely read-only out of guild.json? | `read-on-each-call` |

## Validation (1)

| Writ | Dec | Question | Selected |
|---|---|---|---|
| `w-moiy7bmo` — Scheduler kit-contribution registry for the Reckoner | D30 | Does reckoner.always-approve declare a validateConfig method? | `no-validate` |

## Type system minutiae (1)

| Writ | Dec | Question | Selected |
|---|---|---|---|
| `w-mojmj0rc` — Cartograph: collapse companion docs into `writ.ext['car… | D9 | Do `VisionStage` / `ChargeStage` / `PieceStage` enums stay as-is, or do they collapse into a unified type? | `keep_per_type_enums` |

## Package / file org (2)

| Writ | Dec | Question | Selected |
|---|---|---|---|
| `w-mohuvshq` — Vision-keeper: petitioner kit declaration and worked ex… | D3 | What is vision-keeper's package directory and source layout? | `mirror-reckoner` |
| `w-mohuoxgh` — Create `clockworks-stacks-signals` bridge plugin | D19 | Does the bridge plugin's `package.json` go under `dependencies` or `peerDependencies` for the apparatus packages it consumes types… | `match-siblings` |

## Other (4)

| Writ | Dec | Question | Selected |
|---|---|---|---|
| `w-moiyh0jz` — Reckoner dependency-aware consideration | D5 | Do dependency-defer Reckonings rows populate deferNote with the gating/failed dep ids? | `populate-with-dep-ids` |
| `w-moiyh0jz` — Reckoner dependency-aware consideration | D11 | Does the dependency-defer path interact with disabledSources / enforceRegistration the same way other paths do? | `disabled-and-registration-win` |
| `w-moiy7bmo` — Scheduler kit-contribution registry for the Reckoner | D24 | How is the non-candidate-writ-id failure mode detected and handled? | `filter-warn` |
| `w-moi2wc2i` — Claude-code complexity-diagnosis follow-ups holding-pen | D6 | What is the dependency relationship between S1 (orchestrator decomposition) and S2 (proxy extraction)? | `s2_first` |
