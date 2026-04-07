package app

import (
	"bufio"
	"fmt"
	"html/template"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// Config holds the configuration for the docsite generator.
type Config struct {
	ReposDir  string
	OutDir    string
	CacheDir  string
	Dock8sBin string
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
	Refs []string
}

// CachePath returns the local cache directory for this repo under cacheDir.
// e.g. for "https://k8s.io/api" → "<cacheDir>/k8s.io/api"
func (r RepoEntry) CachePath(cacheDir string) string {
	rel := strings.TrimPrefix(r.URL, "https://")
	return filepath.Join(cacheDir, filepath.FromSlash(rel))
}

// LoadMeta parses a metadata.yaml file with the structure:
//
//	refs:
//	  - branch-or-tag
//	  - another-ref
func LoadMeta(path string) (RepoMeta, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return RepoMeta{}, err
	}

	var meta RepoMeta
	inRefs := false
	for _, line := range strings.Split(string(data), "\n") {
		stripped := strings.TrimSpace(line)
		if stripped == "refs:" {
			inRefs = true
			continue
		}
		if inRefs {
			if strings.HasPrefix(stripped, "- ") {
				meta.Refs = append(meta.Refs, strings.TrimSpace(strings.TrimPrefix(stripped, "- ")))
			} else if stripped != "" {
				inRefs = false
			}
		}
	}
	return meta, nil
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

// CheckoutRepo ensures the repo is present in its cache directory.
//
// If the cache directory already exists it is assumed to be a valid checkout
// and the function returns immediately (no fetch/pull is performed).
// Otherwise a plain `git clone <url> <dest>` is used.
func CheckoutRepo(cfg Config, r RepoEntry) error {
	dest := r.CachePath(cfg.CacheDir)

	// Already present — nothing to do.
	if _, err := os.Stat(dest); err == nil {
		fmt.Printf("  cache hit:  %s\n", dest)
		return nil
	}

	if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
		return fmt.Errorf("creating parent dirs for %s: %w", dest, err)
	}

	fmt.Printf("  cloning: %s → %s\n", r.URL, dest)
	cmd := exec.Command("git", "clone", r.URL, dest)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Run(); err != nil {
		return fmt.Errorf("checkout of %s failed: %w", r.URL, err)
	}
	return nil
}

// GenerateDocsForRepo generates documentation for all refs of a repo.
//
// For each ref it:
//  1. Fetches the latest from origin.
//  2. Checks out the ref and resets to its tip (for branches).
//  3. Determines the source directories via repos/<path>/api-dirs.sh, or
//     falls back to the repo root if the script is absent.
//  4. Runs dock8s -generate <outDir>/<path>@<ref> <dirs...>.
func GenerateDocsForRepo(cfg Config, r RepoEntry) error {
	dest := r.CachePath(cfg.CacheDir)
	repoRelPath := strings.TrimPrefix(r.URL, "https://")

	for _, ref := range r.Meta.Refs {
		fmt.Printf("\n  [%s @ %s]\n", r.URL, ref)

		// Fetch all branches and tags so we have the latest refs.
		fetchCmd := exec.Command("git", "-C", dest, "fetch", "--all", "--tags")
		fetchCmd.Stdout = os.Stdout
		fetchCmd.Stderr = os.Stderr
		if err := fetchCmd.Run(); err != nil {
			return fmt.Errorf("git fetch for %s: %w", r.URL, err)
		}

		// Checkout the ref (detaches HEAD for tags, switches branch otherwise).
		checkoutCmd := exec.Command("git", "-C", dest, "checkout", ref)
		checkoutCmd.Stdout = os.Stdout
		checkoutCmd.Stderr = os.Stderr
		if err := checkoutCmd.Run(); err != nil {
			return fmt.Errorf("git checkout %s for %s: %w", ref, r.URL, err)
		}

		// For branches, reset to the remote tip. Silently ignored for tags
		// since origin/<tag> doesn't exist and tags don't move.
		resetCmd := exec.Command("git", "-C", dest, "reset", "--hard", "origin/"+ref)
		resetCmd.Stdout = os.Stdout
		resetCmd.Stderr = os.Stderr
		_ = resetCmd.Run()

		// Determine the source directories.
		apiDirsScript := filepath.Join(cfg.ReposDir, filepath.FromSlash(repoRelPath), "api-dirs.sh")
		var srcDirs []string
		if _, err := os.Stat(apiDirsScript); err == nil {
			out, err := exec.Command(apiDirsScript, dest).Output()
			if err != nil {
				return fmt.Errorf("api-dirs.sh for %s@%s: %w", r.URL, ref, err)
			}
			scanner := bufio.NewScanner(strings.NewReader(string(out)))
			for scanner.Scan() {
				line := strings.TrimSpace(scanner.Text())
				if line != "" {
					srcDirs = append(srcDirs, filepath.Join(dest, line))
				}
			}
		} else {
			srcDirs = []string{dest}
		}

		// Run dock8s to generate the documentation website.
		generateDest := filepath.Join(cfg.OutDir, repoRelPath+"@"+ref)
		args := append([]string{"-generate", generateDest}, srcDirs...)
		fmt.Printf("  running: %s %s\n", cfg.Dock8sBin, strings.Join(args, " "))
		dock8sCmd := exec.Command(cfg.Dock8sBin, args...)
		dock8sCmd.Stdout = os.Stdout
		dock8sCmd.Stderr = os.Stderr
		if err := dock8sCmd.Run(); err != nil {
			return fmt.Errorf("dock8s generate for %s@%s: %w", r.URL, ref, err)
		}
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
  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 1rem;
    max-width: 1200px;
  }
  .card {
    background: #fff;
    border: 1px solid #d0d7de;
    border-radius: 6px;
    padding: 1rem 1.25rem;
  }
  .card-repo {
    font-size: 0.8rem;
    color: #57606a;
    margin-bottom: 0.4rem;
    word-break: break-all;
  }
  .card-name {
    font-size: 1rem;
    font-weight: 600;
    margin-bottom: 0.6rem;
    word-break: break-all;
  }
  .refs { display: flex; flex-wrap: wrap; gap: 0.4rem; }
  .ref-link {
    display: inline-block;
    padding: 0.2rem 0.6rem;
    background: #ddf4ff;
    color: #0550ae;
    border: 1px solid #54aeff66;
    border-radius: 2rem;
    font-size: 0.78rem;
    text-decoration: none;
    font-weight: 500;
  }
  .ref-link:hover { background: #54aeff33; }
</style>
</head>
<body>
<h1>API Reference</h1>
<div class="grid">
{{- range .}}
  <div class="card">
    <div class="card-repo">{{.Domain}}</div>
    <div class="card-name">{{.Name}}</div>
    <div class="refs">
      {{- range .Refs}}
      <a class="ref-link" href="{{.Href}}">{{.Label}}</a>
      {{- end}}
    </div>
  </div>
{{- end}}
</div>
</body>
</html>
`))

type indexRef struct {
	Label string
	Href  string
}

type indexEntry struct {
	Domain string
	Name   string
	Refs   []indexRef
}

// GenerateIndex writes an index.html to outDir linking all generated docs.
func GenerateIndex(outDir string, repos []RepoEntry) error {
	var entries []indexEntry
	for _, r := range repos {
		relPath := strings.TrimPrefix(r.URL, "https://")
		// Split into domain and the rest for display.
		parts := strings.SplitN(relPath, "/", 2)
		domain := parts[0]
		name := relPath
		if len(parts) == 2 {
			name = parts[1]
		}

		var refs []indexRef
		for _, ref := range r.Meta.Refs {
			refs = append(refs, indexRef{
				Label: ref,
				Href:  relPath + "@" + ref + "/",
			})
		}
		entries = append(entries, indexEntry{
			Domain: domain,
			Name:   name,
			Refs:   refs,
		})
	}

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

	fmt.Printf("\nChecking out repos into %s\n", cfg.CacheDir)
	for _, r := range repos {
		if err := CheckoutRepo(cfg, r); err != nil {
			return fmt.Errorf("checkout failed: %w", err)
		}
	}

	fmt.Printf("\nGenerating documentation into %s\n", cfg.OutDir)
	for _, r := range repos {
		if err := GenerateDocsForRepo(cfg, r); err != nil {
			return fmt.Errorf("generate failed: %w", err)
		}
	}

	fmt.Printf("\nGenerating index into %s/index.html\n", cfg.OutDir)
	if err := GenerateIndex(cfg.OutDir, repos); err != nil {
		return fmt.Errorf("generate index: %w", err)
	}
	return nil
}
