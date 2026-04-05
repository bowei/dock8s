package main

import (
	"bytes"
	"io/fs"
	"log"
	"net/http"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/bowei/dock8s/pkg"
)

func runServe(srcDirs []string, webFS fs.FS) {
	var mu sync.RWMutex
	var dataJS []byte

	reparse := func() {
		absDirs := make([]string, 0, len(srcDirs))
		for _, srcDir := range srcDirs {
			abs, err := filepath.Abs(srcDir)
			if err != nil {
				log.Printf("Error resolving path %q: %v", srcDir, err)
				return
			}
			absDirs = append(absDirs, abs)
		}
		types, err := pkg.ParsePackages(absDirs)
		if err != nil {
			log.Printf("Error parsing packages: %v", err)
			return
		}
		var buf bytes.Buffer
		if err := pkg.GenerateDataJS(types, &buf, pkg.AutoStartType(types)); err != nil {
			log.Printf("Error generating data.js: %v", err)
			return
		}
		mu.Lock()
		dataJS = buf.Bytes()
		mu.Unlock()
		log.Printf("Regenerated data.js (%d bytes, %d types)", buf.Len(), len(types))
	}

	reparse()

	go func() {
		lastMtime := latestGoMtimeAll(srcDirs)
		for {
			time.Sleep(2 * time.Second)
			t := latestGoMtimeAll(srcDirs)
			if t.After(lastMtime) {
				lastMtime = t
				log.Printf("Changes detected, regenerating...")
				reparse()
			}
		}
	}()

	mux := http.NewServeMux()
	mux.HandleFunc("/data.js", func(w http.ResponseWriter, r *http.Request) {
		mu.RLock()
		data := dataJS
		mu.RUnlock()
		w.Header().Set("Content-Type", "application/javascript")
		w.Write(data)
	})
	mux.Handle("/", http.FileServer(http.FS(webFS)))

	addr := "localhost:8080"
	log.Printf("Serving on http://%s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		log.Fatalf("Server error: %v", err)
	}
}

// latestGoMtimeAll returns the most recent modification time among .go files across all dirs.
func latestGoMtimeAll(dirs []string) time.Time {
	var latest time.Time
	for _, dir := range dirs {
		filepath.WalkDir(dir, func(path string, d fs.DirEntry, err error) error {
			if err != nil || d.IsDir() || !strings.HasSuffix(path, ".go") {
				return nil
			}
			info, err := d.Info()
			if err != nil {
				return nil
			}
			if info.ModTime().After(latest) {
				latest = info.ModTime()
			}
			return nil
		})
	}
	return latest
}
