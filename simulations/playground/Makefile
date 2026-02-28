.PHONY: dev build preview bench bundle-report smoke

ROOT := $(abspath ../..)
VITE_CONFIG := $(ROOT)/simulations/playground/vite.config.js

dev:
	cd $(ROOT) && npx vite --config $(VITE_CONFIG)

build:
	cd $(ROOT) && npx vite build --config $(VITE_CONFIG)

preview:
	cd $(ROOT) && npx vite preview --config $(VITE_CONFIG)

bench:
	cd $(ROOT) && node simulations/playground/scripts/benchmark-playground.mjs

bundle-report:
	cd $(ROOT) && node simulations/playground/scripts/report-bundle-size.mjs

smoke:
	cd $(ROOT) && node simulations/playground/scripts/smoke-playground.mjs
