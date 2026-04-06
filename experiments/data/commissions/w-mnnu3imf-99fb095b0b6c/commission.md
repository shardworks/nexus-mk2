---
author: Sean
---

# Implement missing tests for writ: 'w-mnnmd63t-b62234c456d3'

The original commission (Engine Blocking on External Conditions) did not include unit tests. The spec contains an extensive Validation Checklist (V1–V22) and named Test Cases section — use these as the primary guide for test implementation. Add comprehensive test coverage for the full block lifecycle: block type registry, engine blocking, checker polling, unblocking, rig status transitions, resume, failEngine cancellation of blocked engines, CrawlResult variants, and built-in block types.

Reference the commission spec at `experiments/data/commissions/w-mnnmd63t-b62234c456d3/commission.md` in the sanctum (`/workspace/nexus-mk2/`) for requirements and test case guidance.