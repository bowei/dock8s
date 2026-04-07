# docsite

`cmd/docsite` is a batch generator that clones a set of Git repositories,
runs `dock8s -generate` against each one at each declared ref (branch or tag),
and produces a static documentation website in an output directory.

## Usage

```bash
go run ./cmd/docsite \
  -repos  hack/docsite/repos \   # directory describing which repos to build
  -out    ./docsite \            # where to write the generated HTML files
  -cache  ./cache \              # where to cache cloned repos between runs
  -dock8s ./dock8s               # path to the dock8s binary
```

The output directory ends up with one sub-directory per `(repo, ref)` pair and
a top-level `index.html` that links to all of them:

```
docsite/
  index.html                                     ← landing page
  github.com/kubernetes/api@master/
    index.html                                   ← dock8s viewer
  github.com/kubernetes-sigs/gateway-api@main/
    index.html
  …
```

## Repo registry (`-repos`)

The registry is a directory tree whose structure mirrors the HTTPS URL of each
repository:

```
repos/
  github.com/
    kubernetes/
      api/
        metadata.yaml
        api-dirs.sh          ← optional
    kubernetes-sigs/
      gateway-api/
        metadata.yaml
        api-dirs.sh
```

Every **leaf directory** (one with no subdirectories) is treated as one repo
entry. Its URL is reconstructed as `https://<path-from-root>`.

### `metadata.yaml`

Declares which branches and tags to build:

```yaml
refs:
  - main
  - v1.28.0
```

### `api-dirs.sh` (optional)

A shell script that receives the path to the cloned repo as its first argument
and prints one subdirectory per line. Those subdirectories are passed to
`dock8s -generate` as the source directories. If the script is absent, the
entire repo root is used.

```bash
#!/bin/bash
echo "apis"          # → dock8s will scan <repo>/apis/
```

## Pipeline

For each repo the tool runs the following steps once per ref:

1. **Clone** — if the repo is not already in the cache directory, clone it with
   `git clone <url> <cacheDir>/<domain>/<path>`.
2. **Fetch** — `git fetch --all --tags` to pull the latest remote state.
3. **Checkout** — `git checkout <ref>` to switch to the target branch or tag.
4. **Reset** — `git reset --hard origin/<ref>` to advance a branch to its
   remote tip (silently ignored for tags).
5. **Source dirs** — run `api-dirs.sh` if present; otherwise use the repo root.
6. **Generate** — `dock8s -generate <outDir>/<domain>/<path>@<ref> <srcDirs…>`,
   which writes a self-contained `index.html` viewer.
7. **Index** — after all repos are processed, write `<outDir>/index.html`, a
   landing page that lists every `(repo, ref)` pair with links to its viewer.

## Code layout

| Path | Purpose |
|------|---------|
| `cmd/docsite/main.go` | Flag parsing; calls `app.Run` |
| `cmd/docsite/app/app.go` | All pipeline logic (`LoadRepos`, `CheckoutRepo`, `GenerateDocsForRepo`, `GenerateIndex`, `Run`) |
| `cmd/docsite/app/app_test.go` | Unit tests for parsing and index generation |
| `cmd/docsite/repos/` | The repo registry shipped with this project |
