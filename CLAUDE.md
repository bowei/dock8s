# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## What This Project Does

`dock8s` (Resource Explorer) is a CLI tool that parses Go source code and
generates an interactive, multi-column HTML documentation viewer for Go
plain-old-data APIs (primarily Kubernetes). The output is a single
self-contained HTML file with a Finder-style column browser.

## Commands

```bash
make              # Run Go tests + build binary (default)
make test         # Run Go unit tests (./pkg/...)
make test-js      # Run Jest tests for app.js
make build        # Build rex binary and compile CSS themes from LESS
make themes       # Compile CSS themes only (requires lessc)
make clean        # Remove binary and compiled CSS
./test.sh         # Run integration tests (compares JSON output against sample/expected.json)
```

Run a single Go test:
```bash
go test ./pkg/... -run TestName
```

Build and run:
```bash
./rex -output=/tmp/index.html -type k8s.io/api/core/v1.Pod ~/work/api/core/v1
```

## Architecture

The tool has two main parts: a Go backend (parsing + output generation) and a self-contained HTML/CSS/JS frontend.

### Backend Pipeline (`pkg/`)

1. **Parsing** (`parse.go`): Uses `go/parser` + `go/doc` to build an AST, extracts struct fields and enum types, resolves imported package paths via `go list`, and recursively discovers dependencies. Standard library packages (no dot in first path component) and some common infra packages (klog, etc.) are skipped.

2. **Data model** (`json.go`): The core type graph is `map[string]TypeInfo` keyed by fully-qualified type name (e.g., `k8s.io/api/core/v1.Pod`). `TypeInfo` contains fields, enum values, docstrings, and `IsRoot` (true for types with `TypeMeta`+`ObjectMeta` or names ending in `Request`/`Response`). `FieldInfo` includes `TypeDecorators` like `["Ptr"]`, `["List"]`, `["Map[string]"]` to represent pointer/slice/map wrappers.

3. **Output** (`generate.go`): Marshals the type graph to JSON and embeds it into `index.html` as a JS variable (`typeData`), producing a single self-contained HTML file. With `-json` flag, writes JSON directly instead.

4. **Docstring parsing** (`godoc.go`): Converts raw godoc comments into structured `GoDocString` with typed elements: `p` (paragraph), `h` (heading), `l` (list), `c` (code block), `d` (directive like "Deprecated:").

### Frontend (`web/app.js`, `web/*.js`, `web/index.html`, `web/app*.less`)

- **Column view**: Dynamic multi-column browser. Clicking a field with a known type appends a new column showing that type's fields. Columns to the right are removed on navigation.
- **Search dialog** (`/` key): Filters root types by substring match. Enter selects first result.
- **Keyboard nav**: Arrow keys move between columns/fields; Enter expands docstrings.
- **URL hash state**: Column state (types + selections) is encoded in `window.location.hash` for shareable links and browser history.
- **Themes**: 5 themes (light, dark, blue, green, brown) compiled from `theme-*.less` + `app.less` via `lessc`.

### Testing

- Go unit tests in `pkg/*_test.go` with shared helpers in `pkg/common_test.go`
- Jest tests in `web/*.test.js` (uses `jest-environment-jsdom`)
- Integration tests in `test.sh` run `rex -json` on `sample/` and `sample2/` and diff against `sample/expected.json` and `sample2/expected.json`

When adding new Go types or changing JSON output structure, update the expected JSON files in `sample/` and `sample2/`.
