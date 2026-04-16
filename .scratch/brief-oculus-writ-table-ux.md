# Oculus writ table UX fixes

## Summary

Three usability issues on the Oculus writs tab that affect daily workflow. All are small, self-contained fixes to the existing writ table component.

## Issues

### 1. Writ IDs not copyable from the table

Click events on table rows capture the interaction (presumably opening a detail view or similar), which prevents selecting and copying the writ ID text. The ID column should allow copy-to-clipboard — either via a dedicated copy button/icon on hover, or by stopping propagation on the ID cell so text selection works normally.

### 2. Writ ID not shown on the detail/drawer page

When you open a writ's detail view, the ID is not displayed anywhere. You have to go back to the table to find it — where you can't copy it either (see #1). The detail view should show the full writ ID in a copyable form, ideally near the top alongside the title.

### 3. Writ type filter: default to all types, support multi-select

The writ type filter currently defaults to "mandate" and only allows single-type selection. Two changes:

- **Default to all types** (or at minimum mandate + brief, the two most common active types). The current mandate-only default hides briefs, which the patron frequently wants to see alongside mandates.
- **Support multi-select** on the type filter, so the patron can choose any combination (e.g., mandate + brief, or mandate + quest, etc.) without having to toggle back and forth.

## Acceptance Criteria

- [ ] Writ IDs are copyable from the table (copy button, text selection, or equivalent)
- [ ] Writ detail/drawer view displays the full writ ID in a copyable form
- [ ] Writ type filter defaults to showing all types (or a broader default than mandate-only)
- [ ] Writ type filter supports multi-select (show writs matching any of the selected types)
