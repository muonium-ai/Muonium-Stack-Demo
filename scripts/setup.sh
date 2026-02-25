#!/usr/bin/env zsh
set -euo pipefail

echo "Initializing git submodules..."
git submodule update --init --recursive

if command -v rustup >/dev/null 2>&1; then
  echo "Adding wasm target through rustup..."
  rustup target add wasm32-unknown-unknown
else
  echo "rustup not found. Install rustup to add wasm target:"
  echo "  brew install rustup-init"
  echo "  rustup-init"
  echo "Then run: rustup target add wasm32-unknown-unknown"
fi

if ! command -v wasm-pack >/dev/null 2>&1; then
  echo "Installing wasm-pack..."
  cargo install wasm-pack
fi

echo "Installing npm dependencies..."
npm install

echo "Setup complete. Run: npm run dev"
