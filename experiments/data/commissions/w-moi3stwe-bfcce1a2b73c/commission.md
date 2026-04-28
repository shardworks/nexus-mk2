on Writs page:

- Add an additional toggle to show/hide writs with 'Cancelled' state. By default, cancelled writs should not be displayed
  - use similar appearance to the Children toggle
  - make sure that visual appearance for both toggles updates based on wehther it is selected or not
- Improve type filters as follows:
  - allow selecting more than one item at a time (e.g. show 'mandate'+'step', etc)
  - clicking a type filter should toggle that one filter, and leave the others untouched. Selected filters should be filled in with the blue color, unseelected should not. (Currently, they never change appearance)(
  - if all filters are selected, the 'All' button should show as selected
  - clicking 'all' should select all filters, UNLESS they were all already selected, in which case they should all become unselected
- Writ details page should be deep-linkable. Currently, clickign a writ shows the details without changing the URL. this breaks back button functionality, etc. We should make sure that details for writs updates the URL accordingly. APply tihs same logic to the rigs page of Spider, and any other list/detail pages as well