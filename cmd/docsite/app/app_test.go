package app

import (
	"os"
	"path/filepath"
	"testing"
)

func TestCachePath(t *testing.T) {
	tests := []struct {
		url      string
		cacheDir string
		want     string
	}{
		{
			url:      "https://k8s.io/api",
			cacheDir: "/cache",
			want:     "/cache/k8s.io/api",
		},
		{
			url:      "https://github.com/foo/bar",
			cacheDir: "/tmp/cache",
			want:     "/tmp/cache/github.com/foo/bar",
		},
		{
			url:      "https://example.com/a/b/c",
			cacheDir: "/cache",
			want:     "/cache/example.com/a/b/c",
		},
	}
	for _, tt := range tests {
		r := RepoEntry{URL: tt.url}
		got := r.CachePath(tt.cacheDir)
		if got != tt.want {
			t.Errorf("CachePath(%q, %q) = %q, want %q", tt.url, tt.cacheDir, got, tt.want)
		}
	}
}

func TestLoadMeta(t *testing.T) {
	tests := []struct {
		name    string
		content string
		want    RepoMeta
		wantErr bool
	}{
		{
			name: "single ref",
			content: `refs:
  - main
`,
			want: RepoMeta{Refs: []string{"main"}},
		},
		{
			name: "multiple refs",
			content: `refs:
  - main
  - v1.28.0
  - release-1.27
`,
			want: RepoMeta{Refs: []string{"main", "v1.28.0", "release-1.27"}},
		},
		{
			name:    "empty file",
			content: ``,
			want:    RepoMeta{},
		},
		{
			name: "refs section followed by other keys",
			content: `refs:
  - main
other:
  - ignored
`,
			want: RepoMeta{Refs: []string{"main"}},
		},
		{
			name: "no refs key",
			content: `other:
  - value
`,
			want: RepoMeta{},
		},
		{
			name:    "file not found",
			content: "",
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var path string
			if tt.wantErr {
				path = filepath.Join(t.TempDir(), "nonexistent.yaml")
			} else {
				f, err := os.CreateTemp(t.TempDir(), "metadata*.yaml")
				if err != nil {
					t.Fatal(err)
				}
				if _, err := f.WriteString(tt.content); err != nil {
					t.Fatal(err)
				}
				f.Close()
				path = f.Name()
			}

			got, err := LoadMeta(path)
			if (err != nil) != tt.wantErr {
				t.Fatalf("LoadMeta() error = %v, wantErr %v", err, tt.wantErr)
			}
			if tt.wantErr {
				return
			}
			if len(got.Refs) != len(tt.want.Refs) {
				t.Fatalf("LoadMeta() refs = %v, want %v", got.Refs, tt.want.Refs)
			}
			for i, ref := range got.Refs {
				if ref != tt.want.Refs[i] {
					t.Errorf("LoadMeta() refs[%d] = %q, want %q", i, ref, tt.want.Refs[i])
				}
			}
		})
	}
}

// makeReposDir builds a temporary repos directory tree for testing LoadRepos.
// entries is a map from relative path (e.g. "k8s.io/api") to metadata.yaml content.
func makeReposDir(t *testing.T, entries map[string]string) string {
	t.Helper()
	root := t.TempDir()
	for relPath, meta := range entries {
		dir := filepath.Join(root, filepath.FromSlash(relPath))
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(dir, "metadata.yaml"), []byte(meta), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	return root
}

func TestLoadRepos(t *testing.T) {
	t.Run("single repo", func(t *testing.T) {
		root := makeReposDir(t, map[string]string{
			"k8s.io/api": "refs:\n  - main\n",
		})
		repos, err := LoadRepos(Config{ReposDir: root})
		if err != nil {
			t.Fatal(err)
		}
		if len(repos) != 1 {
			t.Fatalf("got %d repos, want 1", len(repos))
		}
		if repos[0].URL != "https://k8s.io/api" {
			t.Errorf("URL = %q, want %q", repos[0].URL, "https://k8s.io/api")
		}
		if len(repos[0].Meta.Refs) != 1 || repos[0].Meta.Refs[0] != "main" {
			t.Errorf("Refs = %v, want [main]", repos[0].Meta.Refs)
		}
	})

	t.Run("multiple repos under same domain", func(t *testing.T) {
		root := makeReposDir(t, map[string]string{
			"k8s.io/api":             "refs:\n  - main\n",
			"k8s.io/apimachinery":    "refs:\n  - main\n  - v0.28.0\n",
		})
		repos, err := LoadRepos(Config{ReposDir: root})
		if err != nil {
			t.Fatal(err)
		}
		if len(repos) != 2 {
			t.Fatalf("got %d repos, want 2", len(repos))
		}
		urls := map[string]bool{}
		for _, r := range repos {
			urls[r.URL] = true
		}
		for _, want := range []string{"https://k8s.io/api", "https://k8s.io/apimachinery"} {
			if !urls[want] {
				t.Errorf("missing repo %q", want)
			}
		}
	})

	t.Run("repos under different domains", func(t *testing.T) {
		root := makeReposDir(t, map[string]string{
			"k8s.io/api":          "refs:\n  - main\n",
			"github.com/foo/bar":  "refs:\n  - v1.0.0\n",
		})
		repos, err := LoadRepos(Config{ReposDir: root})
		if err != nil {
			t.Fatal(err)
		}
		if len(repos) != 2 {
			t.Fatalf("got %d repos, want 2", len(repos))
		}
	})

	t.Run("empty repos dir", func(t *testing.T) {
		root := t.TempDir()
		repos, err := LoadRepos(Config{ReposDir: root})
		if err != nil {
			t.Fatal(err)
		}
		if len(repos) != 0 {
			t.Errorf("got %d repos, want 0", len(repos))
		}
	})

	t.Run("missing repos dir", func(t *testing.T) {
		_, err := LoadRepos(Config{ReposDir: filepath.Join(t.TempDir(), "nonexistent")})
		if err == nil {
			t.Fatal("expected error for missing repos dir, got nil")
		}
	})
}

func TestCheckoutRepo_CacheHit(t *testing.T) {
	// When the cache directory already exists, CheckoutRepo should return
	// immediately without trying to clone.
	cacheDir := t.TempDir()
	r := RepoEntry{URL: "https://k8s.io/api"}
	dest := r.CachePath(cacheDir)
	if err := os.MkdirAll(dest, 0o755); err != nil {
		t.Fatal(err)
	}

	cfg := Config{CacheDir: cacheDir}
	if err := CheckoutRepo(cfg, r); err != nil {
		t.Errorf("CheckoutRepo() unexpected error on cache hit: %v", err)
	}
}
