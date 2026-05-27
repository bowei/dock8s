# Browser Testing with Playwright

End-to-end browser tests run the full pipeline: build the `dock8s` binary, generate
a site from a fixture Go package, serve it statically, and exercise the UI in a
headless Chromium browser.

## Running

```bash
make test-e2e        # build binary + run all Playwright tests
npx playwright test  # run tests directly (binary must already be built)
npx playwright test e2e/search.spec.js  # run a single spec file
```

## How it works

`playwright.config.js` defines a `webServer` that runs automatically before tests:

1. `./dock8s -generate e2e/dist -type example.com/widget/v1.Widget -source-url-base https://github.com/example/widget/blob/main e2e/fixture e2e/fixture/v1alpha1 e2e/fixture/v1beta1`
   — generates the full site (HTML + JS + CSS + `data.js`) into `e2e/dist/`
2. `python3 -m http.server 3001 --directory e2e/dist`
   — serves the site on `http://localhost:3001`

Tests run against `http://localhost:3001`. When `CI` is not set, an existing
server on port 3001 is reused (faster local iteration); in CI it is always
regenerated.

## Fixture package

`e2e/fixture/` is a self-contained Go module (`module example.com/widget/v1`)
with enough type variety to exercise the full UI:

| Type | Package | Role |
|---|---|---|
| `Widget` | `v1` | Root resource (has `TypeMeta` + `ObjectMeta`) |
| `WidgetList` | `v1` | Root resource (list variant) |
| `WidgetSpec` | `v1` | Nested struct — pointer, slice, map, multi-para doc, deprecated field |
| `WidgetStatus` | `v1` | Nested struct — references enum type |
| `Phase` | `v1` | Enum (`string` + constants: Pending, Running, Failed) |
| `TypeMeta`, `ObjectMeta` | `v1` | Embedded meta types (same package — no external deps) |
| `AlphaWidget`, `AlphaWidgetSpec` | `v1alpha1` | Root + spec for alpha filter testing |
| `BetaWidget`, `BetaWidgetSpec` | `v1beta1` | Root + spec for beta filter testing |

The fixture is intentionally self-contained so `go list` works without any
network access or module cache.

## Test files

| File | What it covers |
|---|---|
| `e2e/column-navigation.spec.js` | Column open/replace, chevrons, selected class, enum columns |
| `e2e/hash.spec.js` | Hash restore (single/multi-column), hash updates on click, invalid/empty fallback |
| `e2e/search.spec.js` | Dialog open/close/filter, Enter navigation, `f:` field search, overlay click |
| `e2e/keyboard.spec.js` | Arrow navigation, ArrowRight opens column, ArrowLeft removes column, `/` `?` Escape Enter |
| `e2e/docstring.spec.js` | Expand button, expand/collapse via Enter, paragraph text, deprecated marker |
| `e2e/theme.spec.js` | Theme switching via the settings dialog (5 of 12 themes exercised), localStorage persistence across reload |

## Key behaviours to be aware of

- **Search dialog on load**: the app shows the search dialog when there is no
  URL hash. Tests that need columns loaded directly should navigate to a hash
  URL such as `/#example.com/widget/v1.Widget`.
- **Docstring collapse**: the expand button is inside the summary `div` which
  is hidden when expanded. Collapsing requires pressing `Enter` on the selected
  field, not a second button click.
- **ArrowLeft scope**: ArrowLeft only removes the active column when the active
  selection is in a column other than the first. Tests that exercise this must
  ensure a field in the second (or later) column is selected first — easiest
  done by loading a hash with a deeper path, e.g. `/#Widget/ObjectMeta/Name`.
