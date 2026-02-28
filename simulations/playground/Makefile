.PHONY: dev build preview

ROOT := $(abspath ../..)
VITE_CONFIG := $(ROOT)/simulations/playground/vite.config.js

dev:
	cd $(ROOT) && npx vite --config $(VITE_CONFIG)

build:
	cd $(ROOT) && npx vite build --config $(VITE_CONFIG)

preview:
	cd $(ROOT) && npx vite preview --config $(VITE_CONFIG)
