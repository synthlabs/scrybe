.DEFAULT_GOAL := dev

TOKE ?= toke
PNPM ?= pnpm
CARGO ?= cargo
NODE ?= node

INTERNAL_FILES := internal/frontend/index.ts internal/rust/commands.rs internal/rust/mod.rs
MISSING_INTERNAL_FILES = $(filter-out $(wildcard $(INTERNAL_FILES)),$(INTERNAL_FILES))

NODE_TESTS := \
	scripts/i18n-detect.test.mjs \
	scripts/overlay-canvas-text.test.mjs \
	scripts/overlay-layout-math.test.mjs \
	scripts/overlay-timing.test.mjs \
	scripts/overlay-ws-contract.test.mjs \
	scripts/updater-toast.test.mjs

.PHONY: check-internal
check-internal:
	$(if $(strip $(MISSING_INTERNAL_FILES)),$(error Missing internal checkout files: $(MISSING_INTERNAL_FILES)),@echo Internal checkout ready)

.PHONY: dev
dev:
	$(TOKE) -v $(PNPM) tauri dev

.PHONY: dev-internal
dev-internal: export ENABLE_INTERNAL := 1
dev-internal: check-internal
	$(TOKE) -v $(PNPM) tauri dev

.PHONY: build
build:
	$(TOKE) -v $(PNPM) tauri build

.PHONY: build-internal
build-internal: export ENABLE_INTERNAL := 1
build-internal: check-internal
	$(TOKE) -v $(PNPM) tauri build

.PHONY: check
check:
	$(TOKE) -v $(PNPM) run check
	$(TOKE) -v $(CARGO) check -p scrybe_core
	$(TOKE) -v $(CARGO) check -p scrybe

.PHONY: test
test:
	$(TOKE) -v $(NODE) --test $(NODE_TESTS)
	$(TOKE) -v $(CARGO) test -p scrybe_core
	$(TOKE) -v $(CARGO) test -p scrybe

.PHONY: validate-transcription
validate-transcription:
	$(TOKE) -v $(PNPM) run validate:transcription

.PHONY: validate-hallucinations
validate-hallucinations:
	$(TOKE) -v $(PNPM) run validate:hallucinations
