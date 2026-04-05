# Search

## Triggering

- Press / anywhere on the page (outside an input field) to open the search dialog
- Clicking the help text in the top bar also opens it

## Dialog behavior

- Opens an overlay with a text input and results list
- The input is auto-focused on open
- Pressing Escape or clicking outside the dialog closes it and clears the input

## Filtering (search.js:populateSearchDialogList)

- Only shows types where isRoot === true (types with TypeMeta+ObjectMeta, or names ending 
  in Request/Response)
- Filters by case-insensitive substring match against the fully-qualified type name
- Results are sorted alphabetically by short name (the part after the last .), with the full name as a
  tiebreaker
- Each result shows the short type name and its package path
- The first result is auto-selected

## Keyboard navigation within the dialog

- ArrowDown / ArrowUp: moves selection through the results list
- Enter: navigates to the selected type — closes the dialog and sets window.location.hash 
  to that type name,
  which triggers the column view to load it

## Mouse selection

- Clicking any result item selects that type (same as pressing Enter)

## On type selection

- The dialog is hidden and the input is cleared
- The hash is updated to #TypeName, which the hashchange handler picks up and calls restoreFromHash to
  rebuild the column view starting from that type