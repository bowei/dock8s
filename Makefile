EXEC := dock8s
THEME_FILES := $(wildcard web/variables-*.less)
CSS_FILES := $(THEME_FILES:less=css)

# Default target
all: test build

# Build the rex binary
.PHONY: themes
build: themes $(EXEC)

$(EXEC):
	@echo "[BUILD] $@"
	go build -o $(EXEC) ./cmd/dock8s

.PHONY: test
test:
	@echo "[TEST]"
	go test ./pkg/...

.PHONY: themes
themes: $(CSS_FILES)
	@echo "[BUILD] themes"
	@rm -f pkg/variables.less
	@echo "All themes built successfully!"

web/app-%.css: pkg/variables-%.less pkg/app.less
	@echo "[BUILD] $*"
	@cp $< web/variables.less
	lessc web/app.less $@
	@echo "✓ $* theme generated: $@"
	@rm web/variables.less

.PHONY: clean
clean: clean-themes
	@echo "[CLEAN]"
	rm -f $(EXEC)

.PHONY: clean-themes
clean-themes:
	@echo "[CLEAN] themes"
	@rm -f $(CSS_FILES)
	@echo "✓ Themes cleaned."

.PHONY: test-js
test-js:
	@echo "[TEST] js"
	npm test

