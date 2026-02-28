# Muonium-Stack-Demo

Rust + WASM chess replay demo using Muonium stack concepts.

## What is implemented

- Browser-based chess replay UI with transport controls (start/prev/play/next/end), random autoplay, and PGN move viewer sync
- Move-arrow visualization with top-level toggle (`Move arrow`)
- Opening classification system powered by ECO lines:
	- Dedicated `eco_lines` table in generated SQLite datasets
	- Live opening name at game start and variant name as moves progress
	- Top-level toggle (`Opening names`), enabled by default
- Search modal with filters (White/Black/Year/text), direct game ID open/play, and result list
- Counts tab in search modal (players/tournaments/years with pagination)
- In-browser PGN upload (drag/drop or file picker), with parsing/import progress and in-memory SQLite creation
- Multi-dataset selector in header (`PGN`) for switching bundled datasets (Carlsen/Anand)
- Benchmarking tools:
	- Regular benchmark (throughput summary)
	- Visual benchmark (live progress, pause/resume, stop)
	- Hide button for benchmark panel
- Theme system with runtime switcher + persistence (Default, Midnight, Forest, Ocean, Sunset), including themed board/pieces/buttons
- Rust WASM replay engine integration and build-time PGN → SQLite generation
- Streamed SQLite loading in browser with progress updates
- Mini redis style cache shim for browser persistence
- MuonVec adapter seam for vector search over game metadata
- Grafeo adapter seam with `@grafeo-db/wasm` package

## Repository layout

- `wasm-core/` - Rust WASM chess parsing and replay engine
- `web/src/` - Frontend app, DB/cache/vector/graph adapters
- `chess/games/` - Source PGN datasets (Anand, Carlsen)
- `chess/eco.pgn` - ECO opening/variation reference lines used for live classification
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

`npm run dev` no longer runs `db:build`. If PGN/DB generation changed, run:

```bash
npm run db:build
```

Or use full startup:

```bash
npm run dev:full
```

## CLI Benchmark

Run the benchmark from terminal (defaults to Magnus Carlsen dataset):

```bash
npm run bench:cli
```

Options:

```bash
npm run bench:cli -- --dataset carlsen --mode parse --limit 0
```

- `--dataset`: `carlsen` (default), `anand`, or absolute path to `.sqlite`
- `--mode`: `summary`, `parse` (default), or `replay`
- `--limit`: number of games to benchmark (`0` means all games)

## Rust CLI Benchmark

Native Rust benchmark (default: Magnus Carlsen PGN):

```bash
npm run bench:rust
```

Options:

```bash
npm run bench:rust -- --dataset carlsen --mode replay --limit 1000
```

- `--dataset`: `carlsen` (default), `anand`, or path to `.pgn`
- `--mode`: `parse` (default) or `replay`
- `--limit`: number of games to benchmark (`0` means all games)

## Stockfish Benchmark

Run PGN parsing + Stockfish search benchmark (default: first Carlsen game, depth 1):

```bash
npm run bench:stockfish
```

Options:

```bash
npm run bench:stockfish -- --dataset carlsen --games 3 --game-index 0 --depth 4
```

- `--dataset`: `carlsen` (default), `anand`, or path to `.pgn`
- `--games`: number of games to benchmark (default `1`)
- `--game-index`: start index within dataset (default `0`)
- `--depth`: Stockfish search depth per game (default `1`)
- `--engine`: engine binary path/name (default `stockfish`)

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
