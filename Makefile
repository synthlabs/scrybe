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

.PHONY: screenshot update-readme-screenshot test-screenshots screenshot-smoke
screenshot: export SCRYBE_SCREENSHOT_PAGE = $(or $(PAGE),home)
screenshot: export SCRYBE_SCREENSHOT_LOCALE = $(or $(LOCALE),en)
screenshot: export SCRYBE_SCREENSHOT_WIDTH = $(or $(WIDTH),1300)
screenshot: export SCRYBE_SCREENSHOT_HEIGHT = $(or $(HEIGHT),900)
screenshot:
	$(NODE) scripts/screenshots/run.mjs

update-readme-screenshot: export SCRYBE_SCREENSHOT_IMAGE = $(IMAGE)
update-readme-screenshot:
	$(NODE) scripts/screenshots/update-readme.mjs

test-screenshots:
	$(NODE) --test tests/screenshots/tooling.test.mjs

screenshot-smoke:
	$(NODE) scripts/screenshots/smoke.mjs

.PHONY: check
check:
	$(TOKE) -v $(PNPM) run check
	$(TOKE) -v $(CARGO) check -p scrybe_core
	$(TOKE) -v $(CARGO) check -p scrybe

.PHONY: test verify
test:
	$(TOKE) -v $(PNPM) test

verify:
	$(TOKE) -v $(PNPM) verify

.PHONY: test-packaging
test-packaging:
	$(TOKE) -v $(PNPM) run test:packaging

.PHONY: test-unit test-shared test-python test-rust
.PHONY: test-browser
test-browser:
	$(TOKE) -v $(PNPM) run test:browser

test-unit:
	$(TOKE) -v $(PNPM) run test:unit

test-shared:
	$(TOKE) -v $(PNPM) run test:shared

test-python:
	$(TOKE) -v $(PNPM) run test:python

test-rust:
	$(TOKE) -v $(PNPM) run test:rust

.PHONY: test-internal
test-internal:
	$(TOKE) -v $(PNPM) run test:internal

.PHONY: test-webkit test-native test-audio test-inference test-packaging-artifacts
test-webkit:
	$(TOKE) -v $(PNPM) run test:webkit

test-native:
	$(TOKE) -v $(PNPM) run test:native

test-audio:
	$(TOKE) -v $(PNPM) run test:audio

test-inference:
	$(TOKE) -v $(PNPM) run test:inference

test-packaging-artifacts:
	$(TOKE) -v $(PNPM) run test:packaging:artifacts
