.DEFAULT_GOAL := dev

TOKE ?= toke
PNPM ?= pnpm
CARGO ?= cargo
NODE ?= node
POWERSHELL ?= powershell

TAURI_PACKAGING_PROJECT_ROOT := $(CURDIR)
TAURI_PACKAGING_TOKE := $(TOKE)
TAURI_PACKAGING_PNPM := $(PNPM)
TAURI_PACKAGING_POWERSHELL := $(POWERSHELL)
TAURI_PACKAGING_PASSTHROUGH_VARS := ENABLE_INTERNAL

INTERNAL_FILES := internal/frontend/index.ts internal/rust/commands.rs internal/rust/mod.rs
MISSING_INTERNAL_FILES = $(filter-out $(wildcard $(INTERNAL_FILES)),$(INTERNAL_FILES))

NODE_TESTS := \
	scripts/audio-devices.test.mjs \
	scripts/settings-editor.test.mjs \
	scripts/overlay-editor.test.mjs \
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

build-internal: export ENABLE_INTERNAL := 1
build-internal: check-internal

include utils/packaging/tauri/tauri.mk

# Keep checkout paths with spaces intact.
TAURI_PACKAGING_SHARED_DIR := $(CURDIR)/utils/packaging/tauri

.PHONY: check
check:
	$(TOKE) -v $(PNPM) run check
	$(TOKE) -v $(CARGO) check -p scrybe_core
	$(TOKE) -v $(CARGO) check -p scrybe

.PHONY: test
test: test-packaging
	$(TOKE) -v $(CARGO) test -p synth-tauri-runtime
	$(TOKE) -v $(NODE) --test $(NODE_TESTS)
	$(TOKE) -v $(CARGO) test -p scrybe_core
	$(TOKE) -v $(CARGO) test -p scrybe

.PHONY: test-packaging
test-packaging:
ifeq ($(OS),Windows_NT)
	$(POWERSHELL) -NoProfile -ExecutionPolicy Bypass -File utils/packaging/tauri/install.test.ps1
else
	bash scripts/packaging-integration.test.sh
endif

.PHONY: validate-transcription
validate-transcription:
	$(TOKE) -v $(PNPM) run validate:transcription

.PHONY: validate-hallucinations
validate-hallucinations:
	$(TOKE) -v $(PNPM) run validate:hallucinations
