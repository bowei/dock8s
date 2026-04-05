package pkg

import (
	"bytes"
	"encoding/json"
	"go/ast"
	"go/doc"
	"go/parser"
	"go/token"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"
)

func TestAutoStartType(t *testing.T) {
	tests := []struct {
		name  string
		types map[string]TypeInfo
		want  string
	}{
		{
			name:  "empty map",
			types: map[string]TypeInfo{},
			want:  "",
		},
		{
			name: "no root types",
			types: map[string]TypeInfo{
				"pkg.Foo": {IsRoot: false},
				"pkg.Bar": {IsRoot: false},
			},
			want: "",
		},
		{
			name: "single root type",
			types: map[string]TypeInfo{
				"pkg.Pod": {IsRoot: true},
				"pkg.Aux": {IsRoot: false},
			},
			want: "pkg.Pod",
		},
		{
			name: "multiple root types returns alphabetically first",
			types: map[string]TypeInfo{
				"pkg.Service":    {IsRoot: true},
				"pkg.Deployment": {IsRoot: true},
				"pkg.Pod":        {IsRoot: true},
			},
			want: "pkg.Deployment",
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := AutoStartType(tc.types)
			if got != tc.want {
				t.Errorf("AutoStartType() = %q, want %q", got, tc.want)
			}
		})
	}
}

func TestGenerateDataJS(t *testing.T) {
	types := map[string]TypeInfo{
		"pkg.Foo": {
			Package:  "pkg",
			TypeName: "Foo",
			IsRoot:   true,
		},
	}

	var buf bytes.Buffer
	if err := GenerateDataJS(types, &buf, "pkg.Foo"); err != nil {
		t.Fatalf("GenerateDataJS() error = %v", err)
	}

	out := buf.String()
	if !strings.HasPrefix(out, "const typeData = ") {
		t.Errorf("output does not start with 'const typeData = ', got: %q", out[:min(50, len(out))])
	}
	if !strings.Contains(out, `"pkg.Foo"`) {
		t.Errorf("output does not contain type key 'pkg.Foo'")
	}
	if !strings.Contains(out, "const startTypes = ['pkg.Foo']") {
		t.Errorf("output does not contain expected startTypes, got:\n%s", out)
	}
}

func TestGenerateDataJS_EmptyStartType(t *testing.T) {
	types := map[string]TypeInfo{}

	var buf bytes.Buffer
	if err := GenerateDataJS(types, &buf, ""); err != nil {
		t.Fatalf("GenerateDataJS() error = %v", err)
	}

	out := buf.String()
	if !strings.HasPrefix(out, "const typeData = ") {
		t.Errorf("output does not start with 'const typeData = '")
	}
}

func TestCopyFS(t *testing.T) {
	srcFS := fstest.MapFS{
		"index.html":  {Data: []byte("<html/>")},
		"sub/app.js":  {Data: []byte("var x = 1;")},
	}

	destDir := t.TempDir()
	if err := copyFS(destDir, srcFS); err != nil {
		t.Fatalf("copyFS() error = %v", err)
	}

	checkFile := func(rel, want string) {
		t.Helper()
		data, err := os.ReadFile(filepath.Join(destDir, filepath.FromSlash(rel)))
		if err != nil {
			t.Errorf("expected file %q: %v", rel, err)
			return
		}
		if string(data) != want {
			t.Errorf("file %q: got %q, want %q", rel, data, want)
		}
	}
	checkFile("index.html", "<html/>")
	checkFile("sub/app.js", "var x = 1;")
}

func TestWriteWebsite(t *testing.T) {
	types := map[string]TypeInfo{
		"pkg.Pod": {Package: "pkg", TypeName: "Pod", IsRoot: true},
	}
	webFS := fstest.MapFS{
		"index.html": {Data: []byte("<html/>")},
	}

	destDir := t.TempDir()
	if err := WriteWebsite(types, destDir, webFS, "pkg.Pod"); err != nil {
		t.Fatalf("WriteWebsite() error = %v", err)
	}

	// index.html should be copied
	if _, err := os.Stat(filepath.Join(destDir, "index.html")); err != nil {
		t.Errorf("index.html missing: %v", err)
	}

	// data.js should be generated
	data, err := os.ReadFile(filepath.Join(destDir, "data.js"))
	if err != nil {
		t.Fatalf("data.js missing: %v", err)
	}
	if !strings.Contains(string(data), "const typeData =") {
		t.Errorf("data.js missing typeData, got: %s", data)
	}
}

func TestWriteWebsite_AutoStartType(t *testing.T) {
	types := map[string]TypeInfo{
		"pkg.Pod": {Package: "pkg", TypeName: "Pod", IsRoot: true},
	}
	webFS := fstest.MapFS{
		"index.html": {Data: []byte("<html/>")},
	}

	destDir := t.TempDir()
	// Pass empty startType — should use AutoStartType.
	if err := WriteWebsite(types, destDir, webFS, ""); err != nil {
		t.Fatalf("WriteWebsite() error = %v", err)
	}

	data, err := os.ReadFile(filepath.Join(destDir, "data.js"))
	if err != nil {
		t.Fatalf("data.js missing: %v", err)
	}
	if !strings.Contains(string(data), "pkg.Pod") {
		t.Errorf("data.js missing auto-selected start type, got: %s", data)
	}
}

func TestWriteWebsite_BadDestDir(t *testing.T) {
	// Use a file path as destination — MkdirAll will fail.
	f, err := os.CreateTemp("", "notadir")
	if err != nil {
		t.Fatal(err)
	}
	f.Close()
	defer os.Remove(f.Name())

	// Attempt to create a subdirectory of a file — should fail.
	destDir := filepath.Join(f.Name(), "subdir")
	webFS := fstest.MapFS{}
	if err := WriteWebsite(nil, destDir, webFS, ""); err == nil {
		t.Error("WriteWebsite() expected error for bad destDir, got nil")
	}
}

func TestCopyFS_ErrorOnRead(t *testing.T) {
	// An FS that returns an error when reading a file.
	srcFS := errorFS{}
	destDir := t.TempDir()
	if err := copyFS(destDir, srcFS); err == nil {
		t.Error("copyFS() expected error from errorFS, got nil")
	}
}

// errorFS is an fs.FS that always returns an error on Open.
type errorFS struct{}

func (errorFS) Open(name string) (fs.File, error) {
	if name == "." {
		return errorDir{}, nil
	}
	return nil, fs.ErrInvalid
}

// errorDir is an fs.File for "." that lists one entry which will fail to read.
type errorDir struct{}

func (errorDir) Stat() (fs.FileInfo, error) { return nil, fs.ErrInvalid }
func (errorDir) Read([]byte) (int, error)   { return 0, fs.ErrInvalid }
func (errorDir) Close() error               { return nil }
func (errorDir) ReadDir(n int) ([]fs.DirEntry, error) {
	return []fs.DirEntry{errorDirEntry{}}, nil
}

type errorDirEntry struct{}

func (errorDirEntry) Name() string               { return "bad.txt" }
func (errorDirEntry) IsDir() bool                { return false }
func (errorDirEntry) Type() fs.FileMode          { return 0 }
func (errorDirEntry) Info() (fs.FileInfo, error) { return nil, fs.ErrInvalid }

// failWriter returns an error after `failAfter` successful bytes.
type failWriter struct {
	written   int
	failAfter int
}

func (f *failWriter) Write(p []byte) (int, error) {
	if f.written >= f.failAfter {
		return 0, fs.ErrInvalid
	}
	n := len(p)
	if f.written+n > f.failAfter {
		n = f.failAfter - f.written
	}
	f.written += n
	return n, nil
}

func TestGenerateDataJS_WriteError(t *testing.T) {
	types := map[string]TypeInfo{}

	// Fail immediately on first Write (the "const typeData = " header).
	w := &failWriter{failAfter: 0}
	if err := GenerateDataJS(types, w, ""); err == nil {
		t.Error("expected error when first Write fails")
	}

	// Fail after the header — on the typeData write.
	w = &failWriter{failAfter: len("const typeData = ")}
	if err := GenerateDataJS(types, w, ""); err == nil {
		t.Error("expected error when typeData Write fails")
	}

	// Fail after header + typeData JSON — on the ";\n" write.
	typeData, _ := json.Marshal(types)
	w = &failWriter{failAfter: len("const typeData = ") + len(typeData)}
	if err := GenerateDataJS(types, w, ""); err == nil {
		t.Error("expected error when terminator Write fails")
	}

	// Fail after header + typeData + ";\n" — on the startTypes write.
	w = &failWriter{failAfter: len("const typeData = ") + len(typeData) + len(";\n")}
	if err := GenerateDataJS(types, w, ""); err == nil {
		t.Error("expected error when startTypes Write fails")
	}
}

func TestProcessType_ProcessStructError(t *testing.T) {
	src := `package p; type A struct{ X string }`
	fset := token.NewFileSet()
	f, err := parser.ParseFile(fset, "p.go", src, parser.ParseComments)
	if err != nil {
		t.Fatal(err)
	}
	docPkg, err := doc.NewFromFiles(fset, []*ast.File{f}, "p")
	if err != nil {
		t.Fatal(err)
	}

	allTypes := make(map[string]TypeInfo)
	externalPkgs := make(map[string]bool)

	// Pass nil files so findFileForTypeSpec returns nil, making processStruct fail.
	// processType should log the error and NOT add the type to allTypes.
	for _, typ := range docPkg.Types {
		processType(typ, "example.com/p", allTypes, nil, externalPkgs, docPkg)
	}
	if len(allTypes) != 0 {
		t.Errorf("expected no types added when processStruct fails, got %d", len(allTypes))
	}
}

func TestProcessEnum_InvalidUnderlying(t *testing.T) {
	// A type whose underlying type is not in the valid-underlying set (e.g. a pointer base).
	// processEnum should return false without adding any enum values.
	src := `package p; type A *int`
	fset := token.NewFileSet()
	f, err := parser.ParseFile(fset, "p.go", src, 0)
	if err != nil {
		t.Fatal(err)
	}
	docPkg, err := doc.NewFromFiles(fset, []*ast.File{f}, "p")
	if err != nil {
		t.Fatal(err)
	}
	// A pointer type parses as *ast.StarExpr, not *ast.Ident, so processType won't
	// call processEnum for it. Instead, test directly with an ident whose Name is
	// not in the valid-underlying map.
	bogusIdent := &ast.Ident{Name: "SomeStructType"}
	typeInfo := TypeInfo{Package: "p", TypeName: "A"}
	result := processEnum(&typeInfo, bogusIdent, docPkg)
	if result {
		t.Error("processEnum should return false for non-primitive underlying type")
	}
	if len(typeInfo.EnumValues) != 0 {
		t.Errorf("expected no enum values, got %d", len(typeInfo.EnumValues))
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
