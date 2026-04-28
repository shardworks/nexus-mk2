The contract §2 declares `payload?: unknown` as 'Opaque petitioner-defined structured data'. The Stacks book stores writs row-wise; a multi-megabyte snapshot blob in `ext.reckoner.payload` lands in every read of the writ.

No brief-level guidance on size. Vision-keeper's snapshots could include the entire vision document — might exceed a reasonable per-row size. The Reckoner could enforce a soft cap (warn over N KB) at petition() time.

Follow-up: when the v0 Reckoner sees real petitioner traffic, measure payload sizes. If they grow unbounded, add a `petition()` soft-warn on payload over (e.g.) 64 KB and a hard-fail on over 1 MB. Out of v0 scope; record for the calibration commission.