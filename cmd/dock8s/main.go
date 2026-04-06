package main

import (
	"flag"
	"fmt"
	"io"
	"io/fs"
	"os"

	dock8s "github.com/bowei/dock8s"
	"github.com/bowei/dock8s/pkg"
	"k8s.io/klog/v2"
)

func main() {
	klog.InitFlags(nil)

	outputFile := flag.String("output", "-", "output file. '-' will write to stdout")
	jsonOutput := flag.Bool("json", false, "output JSON instead of HTML")
	startType := flag.String("type", "k8s.io/api/core/v1.Pod", "initial type to display")
	serve := flag.Bool("serve", false, "serve API docs on localhost:8080, watching for changes (source directories are positional args)")
	generateDir := flag.String("generate", "", "generate API docs website to this directory (source directories are positional args)")

	flag.Usage = func() {
		fmt.Fprintf(os.Stderr, "Generate Go API documentation.\n\n")
		fmt.Fprintf(os.Stderr, "Usage: %s [flags] <package-directories...>\n", os.Args[0])
		fmt.Fprintf(os.Stderr, "       %s -serve <source-dirs...>\n", os.Args[0])
		fmt.Fprintf(os.Stderr, "       %s -generate <dest-dir> <source-dirs...>\n", os.Args[0])
		flag.PrintDefaults()
	}
	flag.Parse()

	webFS, err := fs.Sub(dock8s.WebFS, "web")
	if err != nil {
		klog.Fatalf("Error loading web assets: %v", err)
	}

	if *serve {
		args := flag.Args()
		if len(args) == 0 {
			fmt.Fprintf(os.Stderr, "-serve requires at least one source directory as a positional argument\n")
			flag.Usage()
			os.Exit(1)
		}
		runServe(args, webFS)
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
			klog.Fatalf("Error parsing packages: %v", err)
		}
		if err := pkg.WriteWebsite(allTypes, *generateDir, webFS, *startType); err != nil {
			klog.Fatalf("Error generating website: %v", err)
		}
		klog.Infof("Website written to %s", *generateDir)
		return
	}

	args := flag.Args()
	if len(args) == 0 {
		flag.Usage()
		os.Exit(1)
	}

	klog.V(2).Infof("[flag] -output=%q", *outputFile)
	klog.V(2).Infof("[flag] -json=%t", *jsonOutput)
	klog.V(2).Infof("[flag] -type=%v", *startType)
	klog.V(2).Infof("[flag] packages=%v", args)

	allTypes, err := pkg.ParsePackages(args)
	if err != nil {
		klog.Fatalf("Error parsing packages: %v", err)
	}

	var writer io.Writer
	if *outputFile == "-" {
		writer = os.Stdout
	} else {
		f, err := os.Create(*outputFile)
		if err != nil {
			klog.Fatalf("Error creating file: %v", err)
		}
		defer f.Close()
		writer = f
	}

	if *jsonOutput {
		if err := pkg.WriteJSON(allTypes, writer); err != nil {
			klog.Fatalf("Error writing JSON: %v", err)
		}
		return
	}

	klog.Infof("Found %d types.", len(allTypes))

	if err := pkg.GenerateDataJS(allTypes, writer, *startType); err != nil {
		klog.Fatalf("Error generating HTML: %v", err)
	}
}
