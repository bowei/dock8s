EXEC := dock8s
DOCSITE_EXEC := docsite
THEME_FILES := $(wildcard web/theme-*.less)
CSS_FILES := $(THEME_FILES:less=css)

NODE_BUILD_IMAGE := dock8s-node
CONTAINER_ENGINE ?= docker

# Default target
all: check-setup test build

.PHONY: check-setup
check-setup:
	@echo "[CHECK] setup"
	@hack/check-setup.sh

.PHONY: build
build: $(EXEC) $(DOCSITE_EXEC)

.PHONY: $(EXEC)
$(EXEC): themes
	@echo "[BUILD] $@"
	go build -o $(EXEC) ./cmd/dock8s

.PHONY: $(DOCSITE_EXEC)
$(DOCSITE_EXEC):
	@echo "[BUILD] $@"
	go build -o $(DOCSITE_EXEC) ./cmd/docsite

.PHONY: test
test: test-go test-js test-e2e

.PHONY: test-go
test-go:
	@echo "[TEST] go"
	go test ./pkg/... ./cmd/...

.PHONY: test-js
test-js:
	@echo "[TEST] js"
	npm test

.PHONY: test-e2e
test-e2e: build
	@echo "[TEST] e2e"
	npx playwright test


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

# --- Container-based targets ---
# Node targets (themes, test-js, test-e2e) run inside a container with lessc and npm.
# Usage: make container-<target> (e.g. make container-themes, make container-test-js)

.PHONY: node-image
node-image:
	@echo "[BUILD] node image $(NODE_BUILD_IMAGE)"
	$(CONTAINER_ENGINE) build -f Dockerfile.build -t $(NODE_BUILD_IMAGE) .

CONTAINER_NODE = $(CONTAINER_ENGINE) run --rm -u $(shell id -u):$(shell id -g) -v $(CURDIR):/workspace:Z $(NODE_BUILD_IMAGE)

.PHONY: container-themes
container-themes: node-image
	@echo "[CONTAINER] themes"
	$(CONTAINER_NODE) themes

.PHONY: container-test-js
container-test-js: node-image
	@echo "[CONTAINER] test-js"
	$(CONTAINER_NODE) test-js

.PHONY: container-test-e2e
container-test-e2e: node-image
	@echo "[CONTAINER] test-e2e"
	$(CONTAINER_NODE) test-e2e

.PHONY: container-build
container-build: container-themes $(EXEC) $(DOCSITE_EXEC)
