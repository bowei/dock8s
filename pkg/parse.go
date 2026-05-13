package pkg

import (
	"encoding/json"
	"fmt"
	"go/ast"
	"go/doc"
	"go/parser"
	"go/token"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"

	"k8s.io/klog/v2"
)

// ParseOptions configures optional behaviour of ParsePackages.
type ParseOptions struct {
	// SourceURLBase is a fallback GitHub-style URL base used when a package's
	// module cannot be automatically resolved to a public repository (e.g.
	// local development modules, private repos, or unknown vanity domains).
	//
	// Format: the URL up to and including the git ref, e.g.
	//   https://github.com/myorg/myrepo/blob/main
	//
	// The full field URL is then constructed as:
	//   <SourceURLBase>/<path-relative-to-module-root>#L<line>
	//
	// When empty, fields that cannot be auto-resolved produce no source link.
	SourceURLBase string
}

// ParsePackages from the files in the given directories.
func ParsePackages(pkgDirs []string, opts ParseOptions) (map[string]TypeInfo, error) {
	allTypes := make(map[string]TypeInfo)
	parsedPkgs := make(map[string]bool)
	topLevelPkgs := make(map[string]bool)

	var errs []error
	queue := []string{}

	for _, pkgDir := range pkgDirs {
		absPath, err := filepath.Abs(pkgDir)
		if err != nil {
			err2 := fmt.Errorf("error getting file path for %s (error was %w). Possible fix: `go get %s`",
				pkgDir, err, pkgDir)
			klog.V(2).Infof("%v", err2)
			errs = append(errs, err2)
			continue
		}

		apiDirs, err := findAPIPackageDirs(absPath)
		if err != nil {
			klog.V(2).Infof("Error scanning %s for API packages: %v", absPath, err)
			apiDirs = []string{absPath}
		}

		for _, dir := range apiDirs {
			pkgImportPath, err := getPkgPathFromDir(dir)
			if err != nil {
				klog.V(2).Infof("Skipping directory %s, not a Go package: %v", dir, err)
				continue
			}

			topLevelPkgs[pkgImportPath] = true
			if _, parsed := parsedPkgs[pkgImportPath]; !parsed {
				queue = append(queue, dir)
				parsedPkgs[pkgImportPath] = true
			}
		}
	}

	for len(queue) > 0 {
		pkgDir := queue[0]
		queue = queue[1:]

		externalPkgs, err := parsePackage(pkgDir, allTypes, opts.SourceURLBase)
		if err != nil {
			klog.V(2).Infof("Error parsing package %s: %v", pkgDir, err)
			continue
		}

		for pkgPath := range externalPkgs {
			if skipPackage(pkgPath) {
				continue
			}

			if _, parsed := parsedPkgs[pkgPath]; !parsed {
				dir, err := resolvePkgDir(pkgPath)
				if err != nil {
					err2 := fmt.Errorf("error getting file path for %s (error was %w). Possible fix: `go get %s`",
						pkgPath, err, pkgPath)
					klog.V(2).Infof("%v", err2)
					errs = append(errs, err2)
					continue
				}
				queue = append(queue, dir)
				parsedPkgs[pkgPath] = true
			}
		}
	}

	if len(errs) > 0 {
		klog.V(2).Infof("Errors:")
		for _, e := range errs {
			klog.V(2).Infof("- %v", e)
		}
	}

	for name, ti := range allTypes {
		if topLevelPkgs[ti.Package] {
			ti.IsTopLevel = true
			allTypes[name] = ti
		}
	}

	return allTypes, nil
}

// findAPIPackageDirs recursively scans rootDir and returns all subdirectories
// (including rootDir itself) that contain Go files importing the Kubernetes
// meta/v1 ObjectMeta package. If no such directories are found, returns
// []string{rootDir} so the caller falls back to the original behavior.
func findAPIPackageDirs(rootDir string) ([]string, error) {
	var result []string
	err := filepath.WalkDir(rootDir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if !d.IsDir() {
			return nil
		}
		// Skip hidden directories.
		if d.Name() != "." && strings.HasPrefix(d.Name(), ".") {
			return filepath.SkipDir
		}
		if hasObjectMetaImport(path) {
			result = append(result, path)
		}
		return nil
	})
	if err != nil {
		return nil, err
	}
	if len(result) == 0 {
		return []string{rootDir}, nil
	}
	return result, nil
}

// hasObjectMetaImport returns true if any non-test .go file in dir imports
// k8s.io/apimachinery/pkg/apis/meta/v1.
func hasObjectMetaImport(dir string) bool {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return false
	}
	for _, e := range entries {
		name := e.Name()
		if e.IsDir() || !strings.HasSuffix(name, ".go") || strings.HasSuffix(name, "_test.go") {
			continue
		}
		if fileImportsObjectMeta(filepath.Join(dir, name)) {
			return true
		}
	}
	return false
}

// fileImportsObjectMeta returns true if the Go source file at filePath imports
// k8s.io/apimachinery/pkg/apis/meta/v1. Uses parser.ImportsOnly for speed.
func fileImportsObjectMeta(filePath string) bool {
	fset := token.NewFileSet()
	f, err := parser.ParseFile(fset, filePath, nil, parser.ImportsOnly)
	if err != nil {
		return false
	}
	for _, imp := range f.Imports {
		if imp.Path.Value == `"k8s.io/apimachinery/pkg/apis/meta/v1"` {
			return true
		}
	}
	return false
}

func skipPackage(pkgPath string) bool {
	// Ignore packages in the Go standard library. A common
	// heuristic is that standard library packages do not have a dot in their
	// first path component.
	firstPart := strings.Split(pkgPath, "/")[0]
	if !strings.Contains(firstPart, ".") {
		return true
	}
	// Skip some common packages that seem to be included but are not relevant.
	for _, skip := range []string{
		"golang.org/x",
		"k8s.io/klog",
		"github.com/modern-go",
		"github.com/json-iterator",
		"sigs.k8s.io/json",
		"k8s.io/apimachinery/pkg/runtime",
		"k8s.io/apimachinery/pkg/third_party",
		"sigs.k8s.io/randfill",
	} {
		if strings.HasPrefix(pkgPath, skip) {
			return true
		}
	}
	return false
}

// getPkgPathFromDir uses `go list` to find the import path of a package in a directory.
func getPkgPathFromDir(pkgDir string) (string, error) {
	args := []string{"list", "-f", "{{.ImportPath}}", "."}
	klog.V(2).Infof("getPkgPathFromDir %v", args)

	cmd := exec.Command("go", args...)
	cmd.Dir = pkgDir
	out, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("could not run 'go list' in dir %s: %w", pkgDir, err)
	}

	ret := strings.TrimSpace(string(out))
	klog.V(2).Infof("getPkgPathFromDir %v = %q", args, ret)

	return ret, nil
}

// resolvePkgDir uses `go list` to find the directory of a package.
func resolvePkgDir(pkgPath string) (string, error) {
	args := []string{"list", "-f", "{{.Dir}}", pkgPath}
	klog.V(2).Infof("resolvePkgDir %v", args)

	cmd := exec.Command("go", args...)
	out, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("could not run 'go list' for package %s: %w", pkgPath, err)
	}

	ret := strings.TrimSpace(string(out))
	klog.V(2).Infof("resolvePkgDir %v = %q", args, ret)

	return ret, nil
}

// moduleInfo holds the Go module metadata needed to construct source URLs.
type moduleInfo struct {
	Path    string // module import path, e.g. "k8s.io/api"
	Version string // semver or pseudo-version, e.g. "v0.28.0"; empty for the main module
	Dir     string // absolute path to the module root on disk
}

// getModuleInfo runs `go list -m -json` in pkgDir and returns the module
// metadata. Returns an empty moduleInfo (no error) when the directory is not
// part of a versioned module (e.g. the main module, or no go.mod).
func getModuleInfo(pkgDir string) (moduleInfo, error) {
	cmd := exec.Command("go", "list", "-m", "-json")
	cmd.Dir = pkgDir
	out, err := cmd.Output()
	if err != nil {
		return moduleInfo{}, nil
	}
	var info moduleInfo
	if err := json.Unmarshal(out, &info); err != nil {
		return moduleInfo{}, nil
	}
	return info, nil
}

// vanityPrefixes maps known Go vanity import domain prefixes to their
// equivalent github.com owner prefixes. Entries are checked in order; the
// first match wins.
//
// Format of each entry:
//
//	vanity  — the import-path prefix to match, must end with "/"
//	github  — the replacement prefix, must start with "github.com/" and end with "/"
//
// To add a new vanity domain, append a new struct literal here and document
// why the mapping exists. The repo name is taken as the first path component
// after the vanity prefix (e.g. "k8s.io/api" → repo "api").
var vanityPrefixes = []struct{ vanity, github string }{
	// k8s.io/* → github.com/kubernetes/*
	// The Kubernetes core project (k8s.io) hosts its repositories on GitHub
	// under the "kubernetes" organisation using k8s.io as a vanity domain.
	{"k8s.io/", "github.com/kubernetes/"},

	// sigs.k8s.io/* → github.com/kubernetes-sigs/*
	// Kubernetes Special Interest Groups publish APIs under the sigs.k8s.io
	// vanity domain; the actual repos live in the "kubernetes-sigs" org.
	{"sigs.k8s.io/", "github.com/kubernetes-sigs/"},

	// golang.org/x/* → github.com/golang/*
	// The Go extended standard library (golang.org/x) is developed in the
	// "golang" GitHub organisation with one repo per sub-path component.
	{"golang.org/x/", "github.com/golang/"},
}

// githubSourceURL constructs a GitHub blob URL pointing to the given source
// position. Returns "" when the module is not hosted on a known public GitHub
// path (see vanityPrefixes) or when version information is unavailable (local
// / main module).
func githubSourceURL(mod moduleInfo, absFile string, line int) string {
	if mod.Dir == "" || mod.Version == "" {
		return "" // local or main module — no remote URL to link to
	}

	// Compute the file path relative to the module root.
	relFile := strings.TrimPrefix(absFile, mod.Dir+"/")
	if relFile == absFile {
		return "" // file is not under the declared module dir
	}

	// Derive the GitHub repository base URL from the module path.
	ghBase := ""
	if strings.HasPrefix(mod.Path, "github.com/") {
		// Direct github.com module: take owner/repo (first two components),
		// discarding any major-version suffix (e.g. "/v2").
		parts := strings.SplitN(strings.TrimPrefix(mod.Path, "github.com/"), "/", 3)
		if len(parts) >= 2 {
			ghBase = "https://github.com/" + parts[0] + "/" + parts[1]
		}
	} else {
		for _, vp := range vanityPrefixes {
			if strings.HasPrefix(mod.Path, vp.vanity) {
				repo := strings.SplitN(strings.TrimPrefix(mod.Path, vp.vanity), "/", 2)[0]
				ghBase = "https://" + vp.github + repo
				break
			}
		}
	}

	if ghBase == "" {
		return ""
	}

	return fmt.Sprintf("%s/blob/%s/%s#L%d", ghBase, versionToRef(mod.Version), relFile, line)
}

// versionToRef converts a Go module version string to the git ref used in a
// GitHub blob URL.
//
//   - Tagged releases (v1.2.3, v2.0.0-alpha.1) → used as-is.
//   - Pseudo-versions (v0.0.0-YYYYMMDDHHMMSS-<12-char-hash>) → the 12-character
//     commit hash is extracted and used as the ref, since no tag exists.
func versionToRef(version string) string {
	parts := strings.Split(version, "-")
	if len(parts) >= 3 {
		hash := parts[len(parts)-1]
		if len(hash) == 12 {
			return hash
		}
	}
	return version
}

// resolveType resolves an ast.Expr to a type name and decorators.
func resolveType(
	expr ast.Expr,
	pkgImportPath string,
	importMap map[string]string,
	externalPkgs map[string]bool,
) (string, []string) {
	typeName, decorators := resolveTypeRecursive(expr, pkgImportPath, importMap, externalPkgs, 0)
	klog.V(2).Infof("resolveType(%q) = %s, %v", pkgImportPath, typeName, decorators)
	return typeName, decorators
}

func isPrimitive(typeName string) bool {
	switch typeName {
	case "bool", "string", "int", "int8", "int16", "int32", "int64":
		return true
	case "uint", "uint8", "uint16", "uint32", "uint64", "uintptr", "byte", "rune":
		return true
	case "float32", "float64", "complex64", "complex128":
		return true
	}
	return false
}

// resolveTypeRecursive is the recursive implementation for resolveType.
func resolveTypeRecursive(
	expr ast.Expr,
	pkgImportPath string,
	importMap map[string]string,
	externalPkgs map[string]bool,
	depth int,
) (string, []string) {
	switch t := expr.(type) {
	case *ast.StarExpr:
		klog.V(2).Infof("resolving StarExpr (pointer)")
		baseType, decorators := resolveTypeRecursive(t.X, pkgImportPath, importMap, externalPkgs, depth+1)
		return baseType, append(decorators, "Ptr")
	case *ast.ArrayType:
		klog.V(2).Infof("resolving ArrayType (list/slice)")
		baseType, decorators := resolveTypeRecursive(t.Elt, pkgImportPath, importMap, externalPkgs, depth+1)
		return baseType, append(decorators, "List")
	case *ast.MapType:
		klog.V(2).Infof("resolving MapType")
		keyType, _ := resolveTypeRecursive(t.Key, pkgImportPath, importMap, externalPkgs, depth+1)
		valueType, decorators := resolveTypeRecursive(t.Value, pkgImportPath, importMap, externalPkgs, depth+1)
		return valueType, append(decorators, fmt.Sprintf("Map[%s]", keyType))
	case *ast.Ident:
		if t.Obj == nil {
			if isPrimitive(t.Name) {
				klog.V(2).Infof("resolving Ident: built-in type %s", t.Name)
				return t.Name, nil // Built-in type
			}
			klog.V(2).Infof("resolving Ident: alias of built-in type %s", t.Name)
			return pkgImportPath + "." + t.Name, nil // Type in the same package
		}
		klog.V(2).Infof("resolving Ident: same-package type %s", t.Name)
		return pkgImportPath + "." + t.Name, nil // Type in the same package
	case *ast.SelectorExpr:
		if x, ok := t.X.(*ast.Ident); ok {
			pkgName := x.Name
			if pkgPath, ok := importMap[pkgName]; ok {
				externalPkgs[pkgPath] = true
				klog.V(2).Infof("resolving SelectorExpr: external type %s.%s (from %s)", pkgName, t.Sel.Name, pkgPath)
				return pkgPath + "." + t.Sel.Name, nil
			}
			klog.V(2).Infof("resolving SelectorExpr: unknown type %s.%s", pkgName, t.Sel.Name)
			return pkgName + "." + t.Sel.Name, nil
		}
	}
	klog.V(2).Infof("resolving unknown type %T", expr)
	return "", nil
}

func findFileForTypeSpec(typeSpec *ast.TypeSpec, files []*ast.File) *ast.File {
	for _, f := range files {
		if f.Pos() <= typeSpec.Pos() && typeSpec.Pos() < f.End() {
			return f
		}
	}
	return nil
}

func buildImportMap(file *ast.File) map[string]string {
	importMap := make(map[string]string)
	for _, i := range file.Imports {
		path := strings.Trim(i.Path.Value, `"`)
		if i.Name != nil {
			importMap[i.Name.Name] = path
		} else {
			parts := strings.Split(path, "/")
			importMap[parts[len(parts)-1]] = path
		}
	}
	return importMap
}

func makeFieldInfo(fieldName, fieldType, fieldPkg string, decorators []string, fieldDoc, sourceURL string) FieldInfo {
	return FieldInfo{
		FieldName:       fieldName,
		TypeName:        fieldType,
		Package:         fieldPkg,
		TypeDecorators:  decorators,
		SourceURL:       sourceURL,
		DocString:       fieldDoc,
		ParsedDocString: *parseGoDocString(fieldDoc),
	}
}

func processStruct(
	typeInfo *TypeInfo,
	typeSpec *ast.TypeSpec,
	structType *ast.StructType,
	files []*ast.File,
	pkgImportPath string,
	externalPkgs map[string]bool,
	fset *token.FileSet,
	mod moduleInfo,
	sourceURLBase string,
) error {
	klog.V(2).Infof("processing struct %s", typeInfo.TypeName)
	file := findFileForTypeSpec(typeSpec, files)
	if file == nil {
		return fmt.Errorf("file not found for type %s", typeInfo.TypeName)
	}

	importMap := buildImportMap(file)

	if structType.Fields != nil {
		for _, field := range structType.Fields.List {
			if len(field.Names) > 0 {
				var fieldNamesForLog []string
				for _, name := range field.Names {
					fieldNamesForLog = append(fieldNamesForLog, name.Name)
				}
				klog.V(2).Infof("processing field(s): %s", strings.Join(fieldNamesForLog, ", "))
			} else {
				klog.V(2).Infof("processing embedded field")
			}

			fieldType, decorators := resolveType(field.Type, pkgImportPath, importMap, externalPkgs)
			if fieldType == "" {
				klog.V(2).Infof("skipping field, could not resolve type")
				continue
			}

			var fieldPkg string
			lastDot := strings.LastIndex(fieldType, ".")
			if lastDot != -1 {
				fieldPkg = fieldType[:lastDot]
			}

			// Reverse decorators to get the correct order (e.g., Ptr to List)
			for i, j := 0, len(decorators)-1; i < j; i, j = i+1, j-1 {
				decorators[i], decorators[j] = decorators[j], decorators[i]
			}

			fieldDoc := ""
			if field.Doc != nil {
				fieldDoc = strings.TrimSpace(field.Doc.Text())
			}

			pos := fset.Position(field.Pos())
			sourceURL := githubSourceURL(mod, pos.Filename, pos.Line)
			if sourceURL == "" && sourceURLBase != "" && mod.Dir != "" {
				relFile := strings.TrimPrefix(pos.Filename, mod.Dir+"/")
				if relFile != pos.Filename {
					sourceURL = fmt.Sprintf("%s/%s#L%d", strings.TrimRight(sourceURLBase, "/"), relFile, pos.Line)
				}
			}

			if len(field.Names) > 0 {
				for _, name := range field.Names {
					if !ast.IsExported(name.Name) {
						klog.V(2).Infof("skipping unexported field: %s", name.Name)
						continue
					}
					klog.V(2).Infof("found exported field: %s %s", name.Name, fieldType)
					typeInfo.Fields = append(typeInfo.Fields, makeFieldInfo(name.Name, fieldType, fieldPkg, decorators, fieldDoc, sourceURL))
				}
			} else { // Embedded field
				klog.V(2).Infof("found embedded field of type: %s", fieldType)
				parts := strings.Split(fieldType, ".")
				fieldName := parts[len(parts)-1]
				typeInfo.Fields = append(typeInfo.Fields, makeFieldInfo(fieldName, fieldType, fieldPkg, decorators, fieldDoc, sourceURL))
			}
		}
	}

	// Check if this is a root type (e.g. k8s resource or compute RPC)
	// TODO: split this mode and make it a command line flag.
	hasTypeMeta := false
	hasObjectMeta := false

	for _, field := range typeInfo.Fields {
		if field.FieldName == "TypeMeta" {
			hasTypeMeta = true
		}
		if field.FieldName == "ObjectMeta" {
			hasObjectMeta = true
		}
	}
	if hasTypeMeta && hasObjectMeta && rootObjectFilter(typeInfo) {
		typeInfo.IsRoot = true
	}
	return nil
}

func rootObjectFilter(typeInfo *TypeInfo) bool {
	// Filter out meta.v1.PartialObjectMetadata, which embeds TypeMeta+ObjectMeta
	// but is not itself a real API resource.
	return typeInfo.TypeName != "PartialObjectMetadata"
}

// collectDeclsForType collects all GenDecl nodes from docPkg that may contain
// constants or variables for the given type name.
func collectDeclsForType(docPkg *doc.Package, targetTypeName string) []*ast.GenDecl {
	var decls []*ast.GenDecl
	// Consts parsed at the package level.
	for _, c := range docPkg.Consts {
		if c.Decl != nil {
			decls = append(decls, c.Decl)
		}
	}
	// Consts/vars parsed into the type decl.
	for _, ty := range docPkg.Types {
		if ty.Name == targetTypeName {
			for _, c := range ty.Consts {
				decls = append(decls, c.Decl)
			}
			for _, v := range ty.Vars {
				decls = append(decls, v.Decl)
			}
			break
		}
	}
	return decls
}

// extractLiteralValue returns the source-level string for a constant value
// expression. specIndex is the 0-based position of the ValueSpec within its
// GenDecl, used to evaluate iota. Returns "" when the value cannot be
// determined from the AST alone (e.g. references to other named constants).
func extractLiteralValue(expr ast.Expr, specIndex int) string {
	switch e := expr.(type) {
	case *ast.BasicLit:
		return e.Value
	case *ast.Ident:
		if e.Name == "iota" {
			return strconv.Itoa(specIndex)
		}
	case *ast.UnaryExpr:
		if e.Op == token.SUB {
			if v, err := strconv.Atoi(extractLiteralValue(e.X, specIndex)); err == nil {
				return strconv.Itoa(-v)
			}
		}
	case *ast.BinaryExpr:
		lv, lerr := strconv.Atoi(extractLiteralValue(e.X, specIndex))
		rv, rerr := strconv.Atoi(extractLiteralValue(e.Y, specIndex))
		if lerr == nil && rerr == nil {
			switch e.Op {
			case token.ADD:
				return strconv.Itoa(lv + rv)
			case token.SUB:
				return strconv.Itoa(lv - rv)
			case token.MUL:
				return strconv.Itoa(lv * rv)
			case token.SHL:
				if rv >= 0 {
					return strconv.Itoa(lv << uint(rv))
				}
			}
		}
	}
	return ""
}

// findConstantsByType finds constants that have an explicit type matching the target type
func findConstantsByType(docPkg *doc.Package, targetTypeName string) []EnumInfo {
	var enumValues []EnumInfo

	// log.Printf("docPkg = %s", pretty.Sprint(docPkg))

	decls := collectDeclsForType(docPkg, targetTypeName)

	for _, d := range decls {
		specIndex := 0
		for _, spec := range d.Specs {
			vs, ok := spec.(*ast.ValueSpec)
			if !ok {
				continue
			}
			// Check if this constant has an explicit type that matches our target
			if vs.Type != nil {
				if ident, ok := vs.Type.(*ast.Ident); ok && ident.Name == targetTypeName {
					// Found a constant with explicit type matching our target
					for i, name := range vs.Names {
						klog.V(2).Infof("Looking at %v %s", ident, name.Name)

						if ast.IsExported(name.Name) {
							docString := ""
							if vs.Doc != nil {
								docString = vs.Doc.Text()
							}
							var value string
							if i < len(vs.Values) {
								value = extractLiteralValue(vs.Values[i], specIndex)
							}
							klog.V(2).Infof("Found exported enum const value with explicit type: %s", name.Name)
							enumValues = append(enumValues, EnumInfo{
								Name:            name.Name,
								Value:           value,
								DocString:       strings.TrimSpace(docString),
								ParsedDocString: *parseGoDocString(docString),
							})
						}
					}
				}
			} else if vs.Values != nil {
				// Check if the value is a type conversion like MyType("value")
				for i, name := range vs.Names {
					if ast.IsExported(name.Name) && i < len(vs.Values) {
						if callExpr, ok := vs.Values[i].(*ast.CallExpr); ok {
							if ident, ok := callExpr.Fun.(*ast.Ident); ok && ident.Name == targetTypeName {
								klog.V(2).Infof("Looking at %v %s", ident, name.Name)

								docString := ""
								if vs.Doc != nil {
									docString = vs.Doc.Text()
								}
								var value string
								if len(callExpr.Args) > 0 {
									value = extractLiteralValue(callExpr.Args[0], specIndex)
								}
								klog.V(2).Infof("Found exported enum const value with type conversion: %s", name.Name)
								enumValues = append(enumValues, EnumInfo{
									Name:            name.Name,
									Value:           value,
									DocString:       strings.TrimSpace(docString),
									ParsedDocString: *parseGoDocString(docString),
								})
							}
						}
					}
				}
			}
			specIndex++
		}
	}

	return enumValues
}

func processEnum(typeInfo *TypeInfo, ident *ast.Ident, docPkg *doc.Package) bool {
	klog.V(2).Infof("processEnum %s", typeInfo.TypeName)

	validUnderlying := map[string]bool{
		"string":  true,
		"int":     true,
		"int8":    true,
		"int16":   true,
		"int32":   true,
		"int64":   true,
		"uint":    true,
		"uint8":   true,
		"uint16":  true,
		"uint32":  true,
		"uint64":  true,
		"uintptr": true,
		"float32": true,
		"float64": true,
		"byte":    true,
		"rune":    true,
	}
	if _, ok := validUnderlying[ident.Name]; !ok {
		klog.V(2).Infof("type %s is not an enum (base type %s)", typeInfo.TypeName, ident.Name)
		return false
	}

	consts := findConstantsByType(docPkg, typeInfo.TypeName)
	if len(consts) == 0 {
		klog.V(2).Infof("type %s does not have consts or values", typeInfo.TypeName)
		return false
	}

	klog.V(2).Infof("type %s is an enum (base type %s)", typeInfo.TypeName, ident.Name)
	typeInfo.EnumValues = append(typeInfo.EnumValues, consts...)

	return true
}

// parseGoFiles reads and parses all non-test .go files in pkgDir.
func parseGoFiles(pkgDir string) ([]*ast.File, *token.FileSet, error) {
	fset := token.NewFileSet()
	entries, err := os.ReadDir(pkgDir)
	if err != nil {
		return nil, nil, err
	}
	var files []*ast.File
	for _, entry := range entries {
		name := entry.Name()
		if !strings.HasSuffix(name, ".go") || strings.HasSuffix(name, "_test.go") {
			continue
		}
		f, err := parser.ParseFile(fset, filepath.Join(pkgDir, name), nil, parser.ParseComments)
		if err != nil {
			return nil, nil, err
		}
		files = append(files, f)
	}
	return files, fset, nil
}

func parsePackage(pkgDir string, allTypes map[string]TypeInfo, sourceURLBase string) (map[string]bool, error) {
	pkgImportPath, err := getPkgPathFromDir(pkgDir)
	if err != nil {
		klog.V(2).Infof("Skipping directory %s, not a Go package: %v", pkgDir, err)
		return nil, nil
	}
	klog.V(2).Infof("parsing package: %s", pkgImportPath)

	files, fset, err := parseGoFiles(pkgDir)
	if err != nil {
		return nil, err
	}

	externalPkgs := make(map[string]bool)

	if len(files) == 0 {
		return externalPkgs, nil
	}

	klog.V(2).Infof("processing package AST: %s", files[0].Name.Name)
	docPkg, err := doc.NewFromFiles(fset, files, pkgImportPath)
	if err != nil {
		return nil, err
	}

	for _, file := range files {
		for _, i := range file.Imports {
			path := strings.Trim(i.Path.Value, `"`)
			externalPkgs[path] = true
		}
	}

	mod, err := getModuleInfo(pkgDir)
	if err != nil {
		klog.V(2).Infof("could not get module info for %s: %v", pkgDir, err)
	}

	for _, t := range docPkg.Types {
		processType(t, pkgImportPath, allTypes, files, externalPkgs, docPkg, fset, mod, sourceURLBase)
	}

	return externalPkgs, nil
}

func processType(
	t *doc.Type,
	pkgImportPath string,
	allTypes map[string]TypeInfo,
	files []*ast.File,
	externalPkgs map[string]bool,
	docPkg *doc.Package,
	fset *token.FileSet,
	mod moduleInfo,
	sourceURLBase string,
) {
	klog.V(2).Infof("found type: %s", t.Name)
	typeSpec, ok := t.Decl.Specs[0].(*ast.TypeSpec)
	if !ok {
		return
	}

	typeName := typeSpec.Name.Name
	if !ast.IsExported(typeName) {
		klog.V(2).Infof("skipping unexported type: %s", typeName)
		return
	}

	qualifiedTypeName := pkgImportPath + "." + typeName
	if _, exists := allTypes[qualifiedTypeName]; exists {
		klog.V(2).Infof("skipping already processed type: %s", qualifiedTypeName)
		return
	}

	typeInfo := TypeInfo{
		Package:         pkgImportPath,
		TypeName:        typeName,
		Fields:          []FieldInfo{},
		EnumValues:      []EnumInfo{},
		DocString:       strings.TrimSpace(t.Doc),
		ParsedDocString: *parseGoDocString(t.Doc),
	}

	isProcessed := false

	switch spec := typeSpec.Type.(type) {
	case *ast.StructType:
		klog.V(2).Infof("type %s is a struct", qualifiedTypeName)
		if err := processStruct(&typeInfo, typeSpec, spec, files, pkgImportPath, externalPkgs, fset, mod, sourceURLBase); err != nil {
			klog.V(2).Infof("Error processing struct %s: %v", qualifiedTypeName, err)
			return
		}
		isProcessed = true
	case *ast.Ident:
		klog.V(2).Infof("type %s is an ident, checking for enum", qualifiedTypeName)
		if processEnum(&typeInfo, spec, docPkg) {
			isProcessed = true
		}
	}

	if isProcessed {
		klog.V(2).Infof("successfully processed type: %s", qualifiedTypeName)
		allTypes[qualifiedTypeName] = typeInfo
	} else {
		klog.V(2).Infof("type %s was not processed (not a struct or enum)", qualifiedTypeName)
	}
}
