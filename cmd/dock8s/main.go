package main

import (
	"flag"
	"fmt"
	"io"
	"io/fs"
	"log"
	"os"

	dock8s "github.com/bowei/dock8s"
	"github.com/bowei/dock8s/pkg"
)

func main() {
	outputFile := flag.String("output", "-", "output file. '-' will write to stdout")
	jsonOutput := flag.Bool("json", false, "output JSON instead of HTML")
	startType := flag.String("type", "k8s.io/api/core/v1.Pod", "initial type to display")
	serveDir := flag.String("serve", "", "serve API docs from this directory on localhost:8080, watching for changes")
	generateDir := flag.String("generate", "", "generate API docs website to this directory (source directory is a positional arg)")

	flag.Usage = func() {
		fmt.Fprintf(os.Stderr, "Generate Go API documentation.\n\n")
		fmt.Fprintf(os.Stderr, "Usage: %s [flags] <package-directories...>\n", os.Args[0])
		fmt.Fprintf(os.Stderr, "       %s -serve <source-dir>\n", os.Args[0])
		fmt.Fprintf(os.Stderr, "       %s -generate <dest-dir> <source-dir>\n", os.Args[0])
		flag.PrintDefaults()
	}
	flag.Parse()

	webFS, err := fs.Sub(dock8s.WebFS, "web")
	if err != nil {
		log.Fatalf("Error loading web assets: %v", err)
	}

	if *serveDir != "" {
		runServe(*serveDir, webFS)
		return
	}

	if *generateDir != "" {
		args := flag.Args()
		if len(args) == 0 {
			fmt.Fprintf(os.Stderr, "-generate requires a source directory as a positional argument\n")
			flag.Usage()
			os.Exit(1)
		}
		allTypes, err := pkg.ParsePackages(args)
		if err != nil {
			log.Fatalf("Error parsing packages: %v", err)
		}
		if err := pkg.WriteWebsite(allTypes, *generateDir, webFS); err != nil {
			log.Fatalf("Error generating website: %v", err)
		}
		log.Printf("Website written to %s", *generateDir)
		return
	}

	args := flag.Args()
	if len(args) == 0 {
		flag.Usage()
		os.Exit(1)
	}

	log.Printf("[flag] -output=%q", *outputFile)
	log.Printf("[flag] -json=%t", *jsonOutput)
	log.Printf("[flag] -type=%v", *startType)
	log.Printf("[flag] packages=%v", args)

	allTypes, err := pkg.ParsePackages(args)
	if err != nil {
		log.Fatalf("Error parsing packages: %v", err)
	}

	var writer io.Writer
	if *outputFile == "-" {
		writer = os.Stdout
	} else {
		f, err := os.Create(*outputFile)
		if err != nil {
			log.Fatalf("Error creating file: %v", err)
		}
		defer f.Close()
		writer = f
	}

	if *jsonOutput {
		if err := pkg.WriteJSON(allTypes, writer); err != nil {
			log.Fatalf("Error writing JSON: %v", err)
		}
		return
	}

	log.Printf("Found %d types.\n", len(allTypes))

	if err := pkg.GenerateDataJS(allTypes, writer, *startType); err != nil {
		log.Fatalf("Error generating HTML: %v", err)
	}
}
