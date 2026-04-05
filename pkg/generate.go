package pkg

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
)

// AutoStartType returns the first root type alphabetically.
// TODO: Allow specifying the start type via command line flag.
func AutoStartType(types map[string]TypeInfo) string {
	var rootTypes []string
	for name, ti := range types {
		if ti.IsRoot {
			rootTypes = append(rootTypes, name)
		}
	}
	if len(rootTypes) == 0 {
		return ""
	}
	sort.Strings(rootTypes)
	return rootTypes[0]
}

// WriteWebsite generates a complete website to destDir, copying webFS assets
// and writing a generated data.js. webFS should be rooted at the web assets
// directory (i.e. index.html at the root of the FS).
func WriteWebsite(types map[string]TypeInfo, destDir string, webFS fs.FS) error {
	if err := os.MkdirAll(destDir, 0755); err != nil {
		return fmt.Errorf("creating destination directory: %w", err)
	}
	if err := copyFS(destDir, webFS); err != nil {
		return fmt.Errorf("copying web assets: %w", err)
	}
	f, err := os.Create(filepath.Join(destDir, "data.js"))
	if err != nil {
		return fmt.Errorf("creating data.js: %w", err)
	}
	defer f.Close()
	return GenerateDataJS(types, f, AutoStartType(types))
}

func copyFS(destDir string, srcFS fs.FS) error {
	return fs.WalkDir(srcFS, ".", func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		dest := filepath.Join(destDir, filepath.FromSlash(path))
		if d.IsDir() {
			return os.MkdirAll(dest, 0755)
		}
		data, err := fs.ReadFile(srcFS, path)
		if err != nil {
			return err
		}
		return os.WriteFile(dest, data, 0644)
	})
}

// GenerateDataJS writes the self-contained HTML to `w`.
func GenerateDataJS(types map[string]TypeInfo, w io.Writer, startType string) error {
	typeData, err := json.Marshal(types)
	if err != nil {
		return err
	}

	_, err = w.Write([]byte("const typeData = "))
	if err != nil {
		return err
	}
	_, err = w.Write(typeData)
	if err != nil {
		return err
	}
	_, err = w.Write([]byte(";\n"))
	if err != nil {
		return err
	}
	_, err = w.Write([]byte(fmt.Sprintf("const startTypes = ['%s'];", startType)))
	if err != nil {
		return err
	}
	return nil
}
