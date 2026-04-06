package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io/fs"
	"net/http"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/bowei/dock8s/pkg"
	"k8s.io/klog/v2"
)

// reloadBroker fans out reload notifications to SSE clients.
type reloadBroker struct {
	mu   sync.Mutex
	subs []chan struct{}
}

func (b *reloadBroker) subscribe() chan struct{} {
	ch := make(chan struct{}, 1)
	b.mu.Lock()
	b.subs = append(b.subs, ch)
	b.mu.Unlock()
	return ch
}

func (b *reloadBroker) unsubscribe(ch chan struct{}) {
	b.mu.Lock()
	for i, s := range b.subs {
		if s == ch {
			b.subs = append(b.subs[:i], b.subs[i+1:]...)
			break
		}
	}
	b.mu.Unlock()
}

func (b *reloadBroker) notify() {
	b.mu.Lock()
	for _, ch := range b.subs {
		select {
		case ch <- struct{}{}:
		default:
		}
	}
	b.mu.Unlock()
}

type liveData struct {
	Types     json.RawMessage `json:"types"`
	StartType string          `json:"startType"`
}

func runServe(srcDirs []string, webFS fs.FS) {
	var mu sync.RWMutex
	var dataJS []byte
	var dataJSON []byte
	broker := &reloadBroker{}

	reparse := func() {
		absDirs := make([]string, 0, len(srcDirs))
		for _, srcDir := range srcDirs {
			abs, err := filepath.Abs(srcDir)
			if err != nil {
				klog.V(2).Infof("Error resolving path %q: %v", srcDir, err)
				return
			}
			absDirs = append(absDirs, abs)
		}
		types, err := pkg.ParsePackages(absDirs)
		if err != nil {
			klog.V(2).Infof("Error parsing packages: %v", err)
			return
		}
		startType := pkg.AutoStartType(types)

		var jsBuf bytes.Buffer
		if err := pkg.GenerateDataJS(types, &jsBuf, startType); err != nil {
			klog.V(2).Infof("Error generating data.js: %v", err)
			return
		}
		typesJSON, err := json.Marshal(types)
		if err != nil {
			klog.V(2).Infof("Error marshaling types: %v", err)
			return
		}
		jsonBytes, err := json.Marshal(liveData{Types: json.RawMessage(typesJSON), StartType: startType})
		if err != nil {
			klog.V(2).Infof("Error marshaling data.json: %v", err)
			return
		}

		mu.Lock()
		dataJS = jsBuf.Bytes()
		dataJSON = jsonBytes
		mu.Unlock()

		klog.V(2).Infof("Regenerated data.js (%d bytes, %d types)", jsBuf.Len(), len(types))
		broker.notify()
	}

	reparse()

	go func() {
		lastMtime := latestGoMtimeAll(srcDirs)
		for {
			time.Sleep(2 * time.Second)
			t := latestGoMtimeAll(srcDirs)
			if t.After(lastMtime) {
				lastMtime = t
				klog.Infof("Changes detected, regenerating...")
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
	mux.HandleFunc("/data.json", func(w http.ResponseWriter, r *http.Request) {
		mu.RLock()
		data := dataJSON
		mu.RUnlock()
		w.Header().Set("Content-Type", "application/json")
		w.Write(data)
	})
	mux.HandleFunc("/events", func(w http.ResponseWriter, r *http.Request) {
		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "streaming not supported", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")

		ch := broker.subscribe()
		defer broker.unsubscribe(ch)

		for {
			select {
			case <-r.Context().Done():
				return
			case <-ch:
				fmt.Fprintf(w, "event: reload\ndata: {}\n\n")
				flusher.Flush()
			}
		}
	})
	mux.Handle("/", http.FileServer(http.FS(webFS)))

	addr := "localhost:8080"
	klog.Infof("Serving on http://%s", addr)
	if err := http.ListenAndServe(addr, mux); err != nil {
		klog.Fatalf("Server error: %v", err)
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
