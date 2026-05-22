package app

import (
	"errors"
	"fmt"
	"html/template"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strings"
	"sync"

	"gopkg.in/yaml.v3"
)

// Config holds the configuration for the docsite generator.
type Config struct {
	ReposDir    string
	OutDir      string
	CacheDir    string
	Dock8sBin   string
	Parallelism int
}

// RepoEntry represents a repo to generate documentation for.
//
// The repo entries data is stored in a directory structure:
//
//	./repos/<domain>/<path>
type RepoEntry struct {
	// URL is the full HTTPS URL of the repo, e.g. "https://k8s.io/api".
	URL string

	// Meta is the file "metadata.yaml"
	Meta RepoMeta
}

// RepoMeta is repos/<path...>/metadata.yaml
type RepoMeta struct {
	// Refs are the branches and tags to generate documentation for.
	Refs []string `yaml:"refs"`
	// ApiDirs are the default relative paths within the repo to pass to dock8s.
	// When empty, the repo root is used.
	ApiDirs []string `yaml:"apiDirs"`
	// ApiDirsForRef are per-ref overrides. When a ref matches an entry here,
	// that entry's Dirs take precedence over ApiDirs.
	ApiDirsForRef []RefDirs `yaml:"apiDirsForRef"`
}

// RefDirs holds per-ref directory overrides for a single ref.
type RefDirs struct {
	Name string   `yaml:"name"`
	Dirs []string `yaml:"dirs"`
}

// repoRef is a (repo, ref) work unit used when parallelizing operations.
type repoRef struct {
	repo RepoEntry
	ref  string
}

// runParallel runs fn on each item with up to parallelism concurrent goroutines.
// All items are processed; errors from failed items are joined and returned.
func runParallel[T any](items []T, parallelism int, fn func(T) error) error {
	sem := make(chan struct{}, parallelism)
	var wg sync.WaitGroup
	var mu sync.Mutex
	var errs []error

	for _, item := range items {
		item := item
		wg.Add(1)
		sem <- struct{}{}
		go func() {
			defer wg.Done()
			defer func() { <-sem }()
			if err := fn(item); err != nil {
				mu.Lock()
				errs = append(errs, err)
				mu.Unlock()
			}
		}()
	}
	wg.Wait()
	return errors.Join(errs...)
}

// CachePathForRef returns the local cache directory for a specific ref of this
// repo under cacheDir. e.g. for "https://k8s.io/api" and ref "main" →
// "<cacheDir>/k8s.io/api/main"
func (r RepoEntry) CachePathForRef(cacheDir, ref string) string {
	rel := strings.TrimPrefix(r.URL, "https://")
	return filepath.Join(cacheDir, filepath.FromSlash(rel), ref)
}

// LoadMeta parses a metadata.yaml file with the structure:
//
//	refs:
//	  - branch-or-tag
//	apiDirs:
//	  - relative/path
//	apiDirsForRef:
//	  - name: branch-or-tag
//	    dirs:
//	    - relative/path
func LoadMeta(path string) (RepoMeta, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return RepoMeta{}, err
	}
	var meta RepoMeta
	if err := yaml.Unmarshal(data, &meta); err != nil {
		return RepoMeta{}, fmt.Errorf("parsing %s: %w", path, err)
	}
	return meta, nil
}

// DirsForRef returns the source directories to use for the given ref.
// It checks ApiDirsForRef for a matching entry first, then falls back to
// ApiDirs. Returns nil when no dirs are configured (caller should use the
// repo root).
func DirsForRef(meta RepoMeta, ref string) []string {
	for _, rd := range meta.ApiDirsForRef {
		if rd.Name == ref {
			return rd.Dirs
		}
	}
	return meta.ApiDirs
}

// LoadRepos walks cfg.ReposDir and builds the list of repos.
//
// Each leaf directory under <reposDir>/<domain>/<path...> becomes one entry.
// The URL is reconstructed as "https://<domain>/<path...>".
// A directory is considered a leaf when it contains no subdirectories.
func LoadRepos(cfg Config) ([]RepoEntry, error) {
	absRepos, err := filepath.Abs(cfg.ReposDir)
	if err != nil {
		return nil, fmt.Errorf("resolving repos dir: %w", err)
	}

	var repos []RepoEntry
	err = filepath.WalkDir(absRepos, func(path string, d os.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !d.IsDir() {
			return nil
		}

		// Skip the root itself.
		if path == absRepos {
			return nil
		}

		// Check whether this directory has any subdirectories.
		// If it does, it's an intermediate node — skip it but keep descending.
		entries, err := os.ReadDir(path)
		if err != nil {
			return fmt.Errorf("reading dir %s: %w", path, err)
		}

		hasSubdir := false
		for _, e := range entries {
			if e.IsDir() {
				hasSubdir = true
			}
		}

		if hasSubdir {
			return nil
		}

		// Leaf directory: reconstruct the URL from the relative path.
		rel, err := filepath.Rel(absRepos, path)
		if err != nil {
			return fmt.Errorf("computing relative path: %w", err)
		}
		// filepath.Rel uses OS separators; normalize to forward slashes.
		urlPath := strings.ReplaceAll(rel, string(filepath.Separator), "/")

		// Load metadata.yaml from the leaf directory.
		meta, err := LoadMeta(filepath.Join(path, "metadata.yaml"))
		if err != nil {
			return fmt.Errorf("loading metadata for %s: %w", urlPath, err)
		}

		repos = append(repos, RepoEntry{
			URL:  "https://" + urlPath,
			Meta: meta,
		})
		return nil
	})
	return repos, err
}

// CheckoutRef ensures a shallow clone of the given ref is present and current.
//
// On cache miss: git clone --depth 1 --branch <ref> --single-branch <url> <dest>.
// On cache hit: git fetch --depth 1 origin <ref> + git reset --hard FETCH_HEAD.
//
// Note: refs must be branch or tag names. Bare commit SHAs are not supported
// by --branch and will cause the clone to fail.
func CheckoutRef(cfg Config, r RepoEntry, ref string) error {
	dest := r.CachePathForRef(cfg.CacheDir, ref)

	if _, err := os.Stat(dest); err == nil {
		fmt.Printf("  updating: %s @ %s\n", r.URL, ref)
		fetchCmd := exec.Command("git", "-C", dest, "fetch", "--depth", "1", "origin", ref)
		fetchCmd.Stdout = os.Stdout
		fetchCmd.Stderr = os.Stderr
		if err := fetchCmd.Run(); err != nil {
			return fmt.Errorf("git fetch for %s@%s: %w", r.URL, ref, err)
		}
		resetCmd := exec.Command("git", "-C", dest, "reset", "--hard", "FETCH_HEAD")
		resetCmd.Stdout = os.Stdout
		resetCmd.Stderr = os.Stderr
		if err := resetCmd.Run(); err != nil {
			return fmt.Errorf("git reset for %s@%s: %w", r.URL, ref, err)
		}
		return nil
	}

	if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
		return fmt.Errorf("creating parent dirs for %s: %w", dest, err)
	}

	fmt.Printf("  cloning: %s @ %s → %s\n", r.URL, ref, dest)
	cloneCmd := exec.Command("git", "clone", "--depth", "1", "--branch", ref, "--single-branch", r.URL, dest)
	cloneCmd.Stdout = os.Stdout
	cloneCmd.Stderr = os.Stderr
	if err := cloneCmd.Run(); err != nil {
		return fmt.Errorf("checkout of %s@%s failed: %w", r.URL, ref, err)
	}
	return nil
}

// generateDocsForRef generates documentation for a single (repo, ref) pair.
//
// It determines the source directories from Meta, then runs dock8s.
// CheckoutRef must be called for this ref before calling this function.
func generateDocsForRef(cfg Config, r RepoEntry, ref string) error {
	repoRelPath := strings.TrimPrefix(r.URL, "https://")
	fmt.Printf("\n  [%s @ %s]\n", r.URL, ref)

	dest := r.CachePathForRef(cfg.CacheDir, ref)

	var srcDirs []string
	if dirs := DirsForRef(r.Meta, ref); len(dirs) > 0 {
		for _, d := range dirs {
			srcDirs = append(srcDirs, filepath.Join(dest, d))
		}
	} else {
		srcDirs = []string{dest}
	}

	generateDest := filepath.Join(cfg.OutDir, repoRelPath+"@"+ref)
	sourceURLBase := r.URL + "/blob/" + ref
	absOutDir, _ := filepath.Abs(cfg.OutDir)
	absGenerateDest, _ := filepath.Abs(generateDest)
	relToRoot, _ := filepath.Rel(absGenerateDest, absOutDir)
	homeURL := filepath.ToSlash(relToRoot) + "/"
	args := append([]string{"-generate", generateDest, "-source-url-base", sourceURLBase, "-home-url", homeURL}, srcDirs...)
	fmt.Printf("  running: %s %s\n", cfg.Dock8sBin, strings.Join(args, " "))
	dock8sCmd := exec.Command(cfg.Dock8sBin, args...)
	dock8sCmd.Stdout = os.Stdout
	dock8sCmd.Stderr = os.Stderr
	if err := dock8sCmd.Run(); err != nil {
		return fmt.Errorf("dock8s generate for %s@%s: %w", r.URL, ref, err)
	}
	return nil
}

var indexTmpl = template.Must(template.New("index").Parse(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>API Reference</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: #f6f8fa;
    color: #24292f;
    padding: 2rem 1rem;
  }
  h1 {
    font-size: 1.5rem;
    font-weight: 600;
    margin-bottom: 1.5rem;
    color: #1f2328;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    max-width: 1100px;
    background: #fff;
    border: 1px solid #d0d7de;
    border-radius: 6px;
    overflow: hidden;
  }
  thead th {
    text-align: left;
    font-size: 0.78rem;
    font-weight: 600;
    color: #57606a;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 0.6rem 0.75rem;
    background: #f6f8fa;
    border-bottom: 1px solid #d0d7de;
  }
  thead th:first-child { width: 2rem; padding-right: 0; }
  tbody tr { border-bottom: 1px solid #eaeef2; }
  tbody tr:last-child { border-bottom: none; }
  tbody tr:hover { background: #f6f8fa; }
  tbody td { padding: 0.55rem 0.75rem; vertical-align: middle; }
  tbody td:first-child { padding-right: 0; width: 2rem; }
  .col-org { width: 14rem; color: #57606a; font-size: 0.88rem; white-space: nowrap; }
  .col-repo { font-weight: 600; font-size: 0.95rem; }
  .col-refs { display: flex; flex-wrap: wrap; gap: 0.35rem; }
  .ref-link {
    display: inline-block;
    padding: 0.15rem 0.55rem;
    background: #ddf4ff;
    color: #0550ae;
    border: 1px solid #54aeff66;
    border-radius: 2rem;
    font-size: 0.75rem;
    text-decoration: none;
    font-weight: 500;
  }
  .ref-link:hover { background: #54aeff33; }
  .star-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 1.1rem;
    color: #d0d7de;
    padding: 0 0.25rem;
    line-height: 1;
    transition: color 0.1s;
  }
  .star-btn:hover { color: #d4a017; }
  .star-btn.starred { color: #d4a017; }
  .gh-link {
    position: fixed;
    bottom: 1rem;
    right: 1rem;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.78rem;
    color: #57606a;
    text-decoration: none;
  }
  .gh-link:hover { color: #24292f; }
  .gh-link svg { flex-shrink: 0; }
</style>
</head>
<body>
<h1>API Reference</h1>
<table>
  <thead>
    <tr>
      <th></th>
      <th>Org</th>
      <th>Repo</th>
      <th>Versions</th>
    </tr>
  </thead>
  <tbody>
    {{- range .}}
    <tr data-key="{{.Key}}">
      <td><button class="star-btn" title="Star this repo" aria-label="Star">☆</button></td>
      <td class="col-org">{{.Org}}</td>
      <td class="col-repo">{{.RepoName}}</td>
      <td><div class="col-refs">{{range .Refs}}<a class="ref-link" href="{{.Href}}">{{.Label}}</a>{{end}}</div></td>
    </tr>
    {{- end}}
  </tbody>
</table>
<a class="gh-link" href="https://github.com/bowei/dock8s" target="_blank" rel="noopener">
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"/></svg>
  github.com/bowei/dock8s
</a>
<script>
(function() {
  var STARS_KEY = 'docsite-stars';
  function getStars() { try { return JSON.parse(localStorage.getItem(STARS_KEY) || '[]'); } catch(e) { return []; } }
  function setStars(s) { localStorage.setItem(STARS_KEY, JSON.stringify(s)); }

  function applyStars() {
    var stars = getStars();
    var tbody = document.querySelector('tbody');
    var rows = Array.prototype.slice.call(tbody.querySelectorAll('tr'));

    rows.forEach(function(row) {
      var starred = stars.indexOf(row.dataset.key) >= 0;
      var btn = row.querySelector('.star-btn');
      btn.textContent = starred ? '★' : '☆';
      btn.classList.toggle('starred', starred);
    });

    rows.sort(function(a, b) {
      var aS = stars.indexOf(a.dataset.key) >= 0 ? 0 : 1;
      var bS = stars.indexOf(b.dataset.key) >= 0 ? 0 : 1;
      return aS - bS;
    });
    rows.forEach(function(row) { tbody.appendChild(row); });
  }

  document.addEventListener('DOMContentLoaded', function() {
    applyStars();
    document.querySelector('tbody').addEventListener('click', function(e) {
      var btn = e.target.closest('.star-btn');
      if (!btn) return;
      var key = btn.closest('tr').dataset.key;
      var stars = getStars();
      var idx = stars.indexOf(key);
      if (idx >= 0) { stars.splice(idx, 1); } else { stars.push(key); }
      setStars(stars);
      applyStars();
    });
  });
})();
</script>
</body>
</html>
`))

type indexRef struct {
	Label string
	Href  string
}

type indexEntry struct {
	Domain   string
	Org      string
	RepoName string
	Key      string
	Refs     []indexRef
}

// GenerateIndex writes an index.html to outDir linking all generated docs.
func GenerateIndex(outDir string, repos []RepoEntry) error {
	var entries []indexEntry
	for _, r := range repos {
		relPath := strings.TrimPrefix(r.URL, "https://")
		parts := strings.SplitN(relPath, "/", 2)
		domain := parts[0]
		name := ""
		if len(parts) == 2 {
			name = parts[1]
		}

		// Split name into org and repo. For single-component names (e.g. k8s.io/api
		// where name="api"), use domain as org.
		var org, repoName string
		nameParts := strings.SplitN(name, "/", 2)
		if len(nameParts) == 2 {
			org = nameParts[0]
			repoName = nameParts[1]
		} else {
			org = domain
			repoName = name
		}

		var refs []indexRef
		for _, ref := range r.Meta.Refs {
			refs = append(refs, indexRef{
				Label: ref,
				Href:  relPath + "@" + ref + "/",
			})
		}
		entries = append(entries, indexEntry{
			Domain:   domain,
			Org:      org,
			RepoName: repoName,
			Key:      relPath,
			Refs:     refs,
		})
	}

	sort.Slice(entries, func(i, j int) bool {
		oi, oj := strings.ToLower(entries[i].Org), strings.ToLower(entries[j].Org)
		if oi != oj {
			return oi < oj
		}
		return strings.ToLower(entries[i].RepoName) < strings.ToLower(entries[j].RepoName)
	})

	f, err := os.Create(filepath.Join(outDir, "index.html"))
	if err != nil {
		return fmt.Errorf("creating index.html: %w", err)
	}
	defer f.Close()

	if err := indexTmpl.Execute(f, entries); err != nil {
		return fmt.Errorf("rendering index.html: %w", err)
	}
	return nil
}

// Run executes the full docsite generation pipeline.
func Run(cfg Config) error {
	repos, err := LoadRepos(cfg)
	if err != nil {
		return fmt.Errorf("loading repos: %w", err)
	}

	fmt.Printf("Loaded %d repos from %s\n", len(repos), cfg.ReposDir)
	for _, r := range repos {
		fmt.Printf("  %s  refs: %v\n", r.URL, r.Meta.Refs)
	}

	// Flatten repos × refs into individual work units.
	var pairs []repoRef
	for _, r := range repos {
		for _, ref := range r.Meta.Refs {
			pairs = append(pairs, repoRef{r, ref})
		}
	}

	fmt.Printf("\nChecking out repos into %s (parallelism=%d)\n", cfg.CacheDir, cfg.Parallelism)
	if err := runParallel(pairs, cfg.Parallelism, func(p repoRef) error {
		return CheckoutRef(cfg, p.repo, p.ref)
	}); err != nil {
		return fmt.Errorf("checkout failed: %w", err)
	}

	fmt.Printf("\nGenerating documentation into %s (parallelism=%d)\n", cfg.OutDir, cfg.Parallelism)
	if err := runParallel(pairs, cfg.Parallelism, func(p repoRef) error {
		return generateDocsForRef(cfg, p.repo, p.ref)
	}); err != nil {
		return fmt.Errorf("generate failed: %w", err)
	}

	fmt.Printf("\nGenerating index into %s/index.html\n", cfg.OutDir)
	if err := GenerateIndex(cfg.OutDir, repos); err != nil {
		return fmt.Errorf("generate index: %w", err)
	}
	return nil
}
