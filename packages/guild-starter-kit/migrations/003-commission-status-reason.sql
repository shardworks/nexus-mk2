-- Add status_reason to commissions for tracking why each state transition happened.
-- Every status change should include a reason: "posted by patron", "merged to main",
-- "merge conflict in src/foo.ts", etc.

ALTER TABLE commissions ADD COLUMN status_reason TEXT;
