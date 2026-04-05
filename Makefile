EXEC := dock8s
THEME_FILES := $(wildcard web/theme-*.less)
CSS_FILES := $(THEME_FILES:less=css)

# Default target
all: test build

.PHONY: build
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
	@echo "All themes built successfully!"

web/theme-%.css: web/theme-%.less web/app.less
	@echo "[BUILD] $*"
	lessc $< $@
	@echo "✓ theme generated: $@"

.PHONY: clean
clean: clean-themes
	@echo "[CLEAN]"
	rm -f $(EXEC)

.PHONY: clean-themes
clean-themes:
	@echo "[CLEAN] themes"
	rm -f $(CSS_FILES)
	@echo "✓ Themes cleaned."

.PHONY: test-js
test-js:
	@echo "[TEST] js"
	npm test

