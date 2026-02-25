# Muonium-Stack-Demo

Rust + WASM chess replay demo using Muonium stack concepts.

## What is implemented

- Browser-based chess game replay UI (auto-play, speed, move seek)
- Rust WASM PGN parser + replay state generator
- Build-time PGN → SQLite generation and streamed SQLite loading in browser
- Mini redis style cache shim for browser persistence
- MuonVec adapter seam for vector search over game metadata
- Grafeo adapter seam with `@grafeo-db/wasm` package

## Repository layout

- `wasm-core/` - Rust WASM chess parsing and replay engine
- `web/src/` - Frontend app, DB/cache/vector/graph adapters
- `chess/games/Anand.pgn` - Source PGN dataset
- `vendor/` - Muonium and Grafeo submodule targets

## Setup (macOS)

```bash
chmod +x scripts/setup.sh
./scripts/setup.sh
```

If your Rust installation is from Homebrew (without `rustup`), install rustup first so `wasm-pack` can find the `wasm32-unknown-unknown` target.

## Run

```bash
npm run dev
```

Open the local URL printed by Vite.

## Make Tasks

```bash
make build
make dev
```

`make build`/`npm run build` now generate `public/data/anand.sqlite` from PGN first, then build WASM + web assets.

## Notes

- Submodule URLs for Muonium repositories are configured in `.gitmodules`.
- If private repository access is required, authenticate Git before running setup.
- Grafeo source is included as a submodule target and browser bindings are added via npm.
