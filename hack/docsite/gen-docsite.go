package main

// USAGE
//
// Generate dock8s documentation for each repo described in /repos:
//
//	go run hack/docsite/gen-docsite.go -repos hack/docsite/repos -out ./docsite

import (
	"bufio"
	"flag"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

// repoEntry represent a repo to generate documentation for.
//
// The repo entries data is stored in a directory structure:
//
//	./repos/<domain>/<path>
type repoEntry struct {
	// url is the full HTTPS URL of the repo, e.g. "https://k8s.io/api".
	url string

	// meta is the file "metadata.yaml"
	meta repoMeta
}

// repoMeta is repos/<path...>/metadata.yaml
type repoMeta struct {
	// References are the branches and tags to generate
	// documentation for.
	Refs []string
}

// cachePath returns the local cache directory for this repo under cacheDir.
// e.g. for "https://k8s.io/api" → "<cacheDir>/k8s.io/api"
func (r repoEntry) cachePath(cacheDir string) string {
	rel := strings.TrimPrefix(r.url, "https://")
	return filepath.Join(cacheDir, filepath.FromSlash(rel))
}

var (
	repos    []repoEntry
	reposDir string
	outDir   string
	cacheDir string
	dock8sBin string
)

func init() {
	flag.StringVar(&reposDir, "repos", "hack/docsite/repos", "directory containing repo entries")
	flag.StringVar(&outDir, "out", "./docsite", "output directory for generated documentation")
	flag.StringVar(&cacheDir, "cache", "./cache", "directory for caching cloned repos")
	flag.StringVar(&dock8sBin, "dock8s", "./dock8s", "path to the dock8s binary")
}

// loadMeta parses a metadata.yaml file with the structure:
//
//	refs:
//	  - branch-or-tag
//	  - another-ref
func loadMeta(path string) (repoMeta, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return repoMeta{}, err
	}

	var meta repoMeta
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

// loadRepos walks reposDir and builds the repos list.
//
// Each leaf directory under <reposDir>/<domain>/<path...> becomes one entry.
// The URL is reconstructed as "https://<domain>/<path...>".
// A directory is considered a leaf when it contains no subdirectories.
func loadRepos() error {
	absRepos, err := filepath.Abs(reposDir)
	if err != nil {
		return fmt.Errorf("resolving repos dir: %w", err)
	}

	return filepath.WalkDir(absRepos, func(path string, d os.DirEntry, err error) error {
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
		meta, err := loadMeta(filepath.Join(path, "metadata.yaml"))
		if err != nil {
			return fmt.Errorf("loading metadata for %s: %w", urlPath, err)
		}

		repos = append(repos, repoEntry{
			url:  "https://" + urlPath,
			meta: meta,
		})
		return nil
	})
}

// checkoutRepo ensures the repo is present in its cache directory.
//
// If the cache directory already exists it is assumed to be a valid checkout
// and the function returns immediately (no fetch/pull is performed).
// Otherwise a plain `git clone <url> <dest>` is used.
func checkoutRepo(r repoEntry) error {
	dest := r.cachePath(cacheDir)

	// Already present — nothing to do.
	if _, err := os.Stat(dest); err == nil {
		fmt.Printf("  cache hit:  %s\n", dest)
		return nil
	}

	if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
		return fmt.Errorf("creating parent dirs for %s: %w", dest, err)
	}

	fmt.Printf("  cloning: %s → %s\n", r.url, dest)
	cmd := exec.Command("git", "clone", r.url, dest)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr

	if err := cmd.Run(); err != nil {
		return fmt.Errorf("checkout of %s failed: %w", r.url, err)
	}
	return nil
}

// generateDocsForRepo generates documentation for all refs of a repo.
//
// For each ref it:
//  1. Fetches the latest from origin.
//  2. Checks out the ref and resets to its tip (for branches).
//  3. Determines the source directories via repos/<path>/api-dirs.sh, or
//     falls back to the repo root if the script is absent.
//  4. Runs dock8s -generate <outDir>/<path>@<ref> <dirs...>.
func generateDocsForRepo(r repoEntry) error {
	dest := r.cachePath(cacheDir)
	repoRelPath := strings.TrimPrefix(r.url, "https://")

	for _, ref := range r.meta.Refs {
		fmt.Printf("\n  [%s @ %s]\n", r.url, ref)

		// Fetch all branches and tags so we have the latest refs.
		fetchCmd := exec.Command("git", "-C", dest, "fetch", "--all", "--tags")
		fetchCmd.Stdout = os.Stdout
		fetchCmd.Stderr = os.Stderr
		if err := fetchCmd.Run(); err != nil {
			return fmt.Errorf("git fetch for %s: %w", r.url, err)
		}

		// Checkout the ref (detaches HEAD for tags, switches branch otherwise).
		checkoutCmd := exec.Command("git", "-C", dest, "checkout", ref)
		checkoutCmd.Stdout = os.Stdout
		checkoutCmd.Stderr = os.Stderr
		if err := checkoutCmd.Run(); err != nil {
			return fmt.Errorf("git checkout %s for %s: %w", ref, r.url, err)
		}

		// For branches, reset to the remote tip. Silently ignored for tags
		// since origin/<tag> doesn't exist and tags don't move.
		resetCmd := exec.Command("git", "-C", dest, "reset", "--hard", "origin/"+ref)
		resetCmd.Stdout = os.Stdout
		resetCmd.Stderr = os.Stderr
		_ = resetCmd.Run()

		// Determine the source directories.
		apiDirsScript := filepath.Join(reposDir, filepath.FromSlash(repoRelPath), "api-dirs.sh")
		var srcDirs []string
		if _, err := os.Stat(apiDirsScript); err == nil {
			out, err := exec.Command(apiDirsScript, dest).Output()
			if err != nil {
				return fmt.Errorf("api-dirs.sh for %s@%s: %w", r.url, ref, err)
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
		generateDest := filepath.Join(outDir, repoRelPath+"@"+ref)
		args := append([]string{"-generate", generateDest}, srcDirs...)
		fmt.Printf("  running: %s %s\n", dock8sBin, strings.Join(args, " "))
		dock8sCmd := exec.Command(dock8sBin, args...)
		dock8sCmd.Stdout = os.Stdout
		dock8sCmd.Stderr = os.Stderr
		if err := dock8sCmd.Run(); err != nil {
			return fmt.Errorf("dock8s generate for %s@%s: %w", r.url, ref, err)
		}
	}
	return nil
}

func main() {
	flag.Parse()

	if err := loadRepos(); err != nil {
		log.Fatalf("loading repos: %v", err)
	}

	fmt.Printf("Loaded %d repos from %s\n", len(repos), reposDir)
	for _, r := range repos {
		fmt.Printf("  %s  refs: %v\n", r.url, r.meta.Refs)
	}

	fmt.Printf("\nChecking out repos into %s\n", cacheDir)
	for _, r := range repos {
		if err := checkoutRepo(r); err != nil {
			log.Fatalf("checkout failed: %v", err)
		}
	}

	fmt.Printf("\nGenerating documentation into %s\n", outDir)
	for _, r := range repos {
		if err := generateDocsForRepo(r); err != nil {
			log.Fatalf("generate failed: %v", err)
		}
	}
}
