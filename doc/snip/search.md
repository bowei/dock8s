# Search

## Triggering

- Press `/` anywhere on the page (outside an input field) to open the search dialog
- Clicking the help text in the top bar also opens it

## Dialog behavior

- Opens an overlay with a text input, three filter checkboxes (**alpha**, **beta**, **ref**),
  a status line, and a scrollable results list
- The input is auto-focused on open; checkbox state persists across opens
- Pressing `Escape` or clicking outside the dialog closes it and clears the input and status

## Search modes

The mode is determined by the prefix of the input value.

### Type search (default)

With no prefix, the dialog searches root types — types that have `TypeMeta`+`ObjectMeta`
(i.e. top-level Kubernetes resources), or whose names end in `Request`/`Response`.

Three checkboxes filter the result set:

- **alpha** (checked by default): when unchecked, hides types from packages whose path
  contains the string `alpha`
- **beta** (checked by default): when unchecked, hides types from packages whose path
  contains the string `beta`
- **ref** (unchecked by default): when unchecked, only shows types from the source
  directories passed to `-serve` or `-generate` (and their subdirectories); when checked,
  shows all root types including those pulled in as transitive dependencies

- Filters by case-insensitive substring match against the short type name
- Results are sorted alphabetically by short name, with the fully-qualified name as a
  tiebreaker
- Each result shows the short type name and its package path
- No result cap; all matching root types are shown

### Field search (`f:` prefix)

Typing `f:` followed by a filter string searches field names across all types reachable
from any root type via field references. Non-reachable (orphan) types are excluded. The
**alpha**, **beta**, and **ref** checkboxes control which root types the search starts from,
using the same logic as type search.

- Filters field names by case-insensitive substring match
- Each result represents a specific path from a root type down to the matching field
- The same root type can appear multiple times if multiple paths lead to the matching field
- Results are sorted by field name, then root type name, then path depth, then full path
- DFS traversal is capped at a path depth of 10 to prevent runaway traversal on deeply
  nested graphs (see `MAX_FIELD_SEARCH_DEPTH` in `search.js`)
- Results are capped at 50 (`FIELD_SEARCH_LIMIT` in `search.js`); when the cap is hit,
  a status message "Showing top 50 results — refine your search" appears above the list

Each result shows:
- The matching field name
- A breadcrumb: `RootType / field1 / field2 / ...` showing the path from the root type
  down to (but not including) the matching field

## Result status line

A status line sits between the input and the result list. It is only populated for field
search when the result cap is reached. It remains empty (but occupies space to prevent
layout shift) at all other times.

## Keyboard navigation within the dialog

- `ArrowDown` / `ArrowUp`: moves selection through the results list; ArrowDown stops at
  the last real result and does not select the status line item
- `Enter`: navigates to the selected result and closes the dialog

## Mouse selection

- Clicking any result item navigates to it (same as pressing `Enter`)

## On selection

For both modes the dialog is hidden, the input and status are cleared, and
`window.location.hash` is updated, which causes the `hashchange` handler to call
`restoreFromHash` and rebuild the column view.

- **Type search**: hash is set to `#FullyQualifiedTypeName`, opening that type as the
  first column
- **Field search**: hash is set to `#RootTypeName/field1/field2/.../matchingField`, which
  restores the full column chain — each field in the path is selected and its type opened
  as the next column, landing the user directly at the matching field
