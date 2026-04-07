package main

// USAGE
//
// Generate dock8s documentation for each repo described in /repos:
//
//	go run cmd/docsite/main.go -repos hack/docsite/repos -out ./docsite

import (
	"flag"
	"log"

	"github.com/bowei/dock8s/cmd/docsite/app"
)

func main() {
	var cfg app.Config
	flag.StringVar(&cfg.ReposDir, "repos", "hack/docsite/repos", "directory containing repo entries")
	flag.StringVar(&cfg.OutDir, "out", "./docsite", "output directory for generated documentation")
	flag.StringVar(&cfg.CacheDir, "cache", "./cache", "directory for caching cloned repos")
	flag.StringVar(&cfg.Dock8sBin, "dock8s", "./dock8s", "path to the dock8s binary")
	flag.Parse()

	if err := app.Run(cfg); err != nil {
		log.Fatal(err)
	}
}
