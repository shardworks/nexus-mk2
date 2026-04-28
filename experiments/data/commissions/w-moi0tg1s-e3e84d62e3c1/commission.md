**The gap.** Reckoner's planning run lifted observation `w-mohwpvhd`: 'Petition payload size limit — brief says opaque petitioner-defined data; consider a soft cap to prevent runaway payloads from blooming the writs book.' Vision-keeper is the canonical petitioner and the brief explicitly attaches structured snapshot data (vision-vs-reality delta, metric values) to `writ.ext.reckoner.payload`. A vision-keeper that snapshots a large product surface every fire could plausibly emit kilobyte-to-megabyte payloads, all of which materialize in the writs book row.

**Why this matters.** Vision-keeper is the first real consumer of `payload`, so vision-keeper's emission patterns set the implicit norm for every future petitioner's payload size discipline. Writ rows are queried per-vision, per-source, per-phase; bloated rows cost every read.

**Proposal.** Vision-keeper enforces a soft cap on payload size at the API boundary (e.g., 64KB JSON-stringified) and warns / fails-loud on overflow. The cap is documented in the contract document so other petitioners follow suit. Alternatively, the cap lives in Reckoner's helper boundary so every petitioner inherits it (the cap-everywhere approach).

**Concrete files.** A check inside vision-keeper's emit method (or in `reckoner.petition` itself if cap-everywhere wins). One README sentence.

**Atomicity.** Standalone commission — either at the keeper layer or at Reckoner's helper layer; pick the layer at lift time. Best lifted alongside `w-mohwpvhd` since the two observations want the same answer.