# Architecture — Isolated Playground

## Intent

`simulations/playground` is an isolated simulation product slice.
It is intentionally separated from chess UI/runtime code.

## Top-level structure

- `index.html` — isolated HTML entrypoint
- `vite.config.js` — isolated build/dev config and ports
- `Makefile` — isolated dev/build/preview/bench commands
- `src/main.js` — UI composition and control wiring
- `src/physics/runtime.js` — Rapier world state, simulation stepping, module logic
- `src/render/scene.js` — Three.js renderer, transforms, event-driven visual effects
- `src/metrics/telemetryStore.js` — Redis-like hash/list/stream telemetry adapter
- `src/ui/liveGraphPanel.js` — graph renderer for stream-fed series
- `scripts/benchmark-playground.mjs` — isolated performance harness

## Runtime boundaries

### Physics layer (`runtime.js`)

Owns:
- Rapier world and fixed-step loop
- Module state (domino, balls, trigger, lever, rolling, puzzle)
- Telemetry stream publishing
- Optional replay snapshot capture and retrieval

Exposes:
- imperative control APIs (`init`, `start`, `pause`, `resetWorld`, module config methods)
- subscriptions (`onTiming`, `onState`, `onMetricsStream`)
- replay APIs (`setReplayCaptureConfig`, `getReplaySnapshot`, `clearReplaySnapshots`)

### Render layer (`scene.js`)

Owns:
- Three.js scene/camera/lights/meshes
- Snapshot-to-mesh transform synchronization
- Optional visual effects engine (spark, shockwave, celebration glow)

Constraint:
- Renderer reads snapshots and never mutates physics runtime state.

### UI layer (`main.js`)

Owns:
- DOM controls and telemetry panels
- command routing to runtime and renderer
- replay playback orchestration (non-mutating visualization path)

Constraint:
- UI does not directly step physics or edit Three.js internals beyond public renderer API.

### Metrics layer (`telemetryStore.js`)

Owns:
- frame-sample aggregation
- hash/list-style metric semantics (`hset`, `hincrby`, `lpush`)
- stream packet fan-out to consumers

Constraint:
- metrics processing remains side-channel and does not block simulation stepping.

## Isolation guarantees

1. No imports from chess app runtime files in `web/src/`
2. Separate Vite entry/config and ports
3. Separate Makefile operations
4. Separate benchmark harness and artifact directory

## Non-shared dependencies used by playground

- `@dimforge/rapier3d-compat`
- `three`
- browser-native APIs (`requestAnimationFrame`, `ResizeObserver`, Canvas)

## Extension points

- Replace graph renderer with chart library via `src/ui/liveGraphPanel.js`
- Swap telemetry backend while preserving runtime stream contract
- Add new simulation modules by extending runtime snapshot shape + renderer sync
