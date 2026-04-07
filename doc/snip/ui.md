# UI Overview

The viewer is a single-page Finder-style column browser for Go API types.

## Layout

The page has a top bar with a theme picker and help text, and a main area that
holds one or more horizontally scrolling columns.

## Column browser

Each column represents one type and lists its fields (or enum values). Columns
are added to the right as the user navigates into nested types; navigating away
removes columns to the right of the active one.

### Column structure

- **Header**: shows the short type name and its package path.
- **Field list**: each field shows the field name, type (with decorators like
  `[]`, `*`, `map[string]`), and the field's package path on a second line.
  Fields that expand to a known type show a chevron (`›`). Fields without a
  known type are not clickable.
- **Enum list**: enum types show their constant values in a non-clickable list.

### Docstrings

Each field may have a docstring. Long docstrings are collapsed to a summary
line; pressing `Enter` (keyboard) or clicking the expand button toggles the
full text. Expansion state is remembered in memory: if the user navigates away
and back to a field, its docstring remains expanded or collapsed as they left
it.

## Navigation

### Mouse / click

- Click a field with a chevron to open its type as a new column to the right.
  Any columns further right are removed. Expanding text does not change the
  current selection.
- Click outside a dialog to close it.

### Keyboard

| Key | Action |
|-----|--------|
| `↑` / `↓` | Move selection up or down within the current column |
| `→` | Expand the selected field into a new column (if the field has a known type); select the first item in the new column |
| `←` | Remove the rightmost column (go back) |
| `Enter` | Toggle the docstring for the selected field |
| `/` | Open the search dialog |
| `?` | Open the help dialog |
| `Escape` | Close the search or help dialog |

Arrow keys and Enter are inactive while a dialog is open.

## URL hash state

The column state is encoded in `window.location.hash` as
`#RootType/field1/field2/...`. Every navigation action updates the hash, making
the current view bookmarkable and shareable. The browser Back/Forward buttons
work because each hash change is a new history entry.

On load (or on a `hashchange` event), the app restores the full column chain
from the hash: it opens the root type as the first column, then walks the field
path — selecting each field and opening its type — until the chain is exhausted.
If the hash is empty, the search dialog is opened automatically.

## Search

Press `/` (or click the help text in the top bar) to open the search dialog.
See [search.md](search.md) for full details. In summary:

- **Type search** (default): filter root types by name; selecting one opens it
  as the first column. By default only types from the source directories are
  shown; checking **Include dependency APIs** reveals all root types.
- **Field search** (`f:` prefix): search field names across all types reachable
  from root types; selecting a result restores the full column path to that
  field. Respects the same source-directory filter as type search.

## Themes

A dropdown in the top bar switches between five visual themes (light, dark,
blue, green, brown). The selection is saved to `localStorage` and restored on
the next visit.

## Live reload

When served in development mode, the app connects to a `/events` SSE endpoint.
On a `reload` event, it fetches fresh type data from `/data.json` and rebuilds
the current view without a full page reload.
