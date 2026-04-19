EXEC := dock8s
DOCSITE_EXEC := docsite
THEME_FILES := $(wildcard web/theme-*.less)
CSS_FILES := $(THEME_FILES:less=css)

# Default target
all: check-setup test build

.PHONY: check-setup
check-setup:
	@echo "[CHECK] setup"
	@hack/check-setup.sh

.PHONY: build
build: themes $(EXEC) $(DOCSITE_EXEC)

.PHONY: $(EXEC)
$(EXEC):
	@echo "[BUILD] $@"
	go build -o $(EXEC) ./cmd/dock8s

.PHONY: $(DOCSITE_EXEC)
$(DOCSITE_EXEC):
	@echo "[BUILD] $@"
	go build -o $(DOCSITE_EXEC) ./cmd/docsite

.PHONY: test
test:
	@echo "[TEST]"
	go test ./pkg/... ./cmd/...

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
	rm -f $(EXEC) $(DOCSITE_EXEC)

.PHONY: clean-themes
clean-themes:
	@echo "[CLEAN] themes"
	rm -f $(CSS_FILES)
	@echo "✓ Themes cleaned."

.PHONY: test-js
test-js:
	@echo "[TEST] js"
	npm test

.PHONY: test-e2e
test-e2e: build
	@echo "[TEST] e2e"
	npx playwright test

