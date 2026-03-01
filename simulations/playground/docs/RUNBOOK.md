# Runbook — Isolated Physics Playground

## Scope

This runbook covers isolated operation of `simulations/playground` only.
No chess runtime dependencies are required for dev/build/benchmark of this module.

## Prerequisites

- Node.js 20+
- npm 10+
- macOS/Linux shell with `make`

## Commands

Run from repository root.

### Development

```bash
make -C simulations/playground dev
```

Expected:
- Vite starts on `http://localhost:5174`
- COOP/COEP headers are enabled by playground Vite config

### Production build

```bash
make -C simulations/playground build
```

Output:
- `simulations/playground/dist/`

### Preview build

```bash
make -C simulations/playground preview
```

Expected:
- Vite preview on `http://localhost:4174`

### Performance benchmark harness

```bash
make -C simulations/playground bench
```

Equivalent npm command:

```bash
npm run playground:bench
```

Artifacts:
- `simulations/playground/artifacts/perf/benchmark-latest.json`
- timestamped snapshots in same directory

### Bundle size report

```bash
make -C simulations/playground bundle-report
```

Equivalent npm command:

```bash
npm run playground:bundle-report
```

Artifacts:
- `simulations/playground/artifacts/perf/bundle-size-latest.json`
- timestamped snapshots in same directory

### CI smoke checks

```bash
make -C simulations/playground smoke
```

Equivalent npm command:

```bash
npm run playground:smoke
```

Artifacts:
- `simulations/playground/artifacts/perf/smoke-latest.json`
- timestamped snapshots in same directory

Bundle budget policy:
- Total built output target: `< 3.0 MB` (tracked by benchmark harness)
- Current chunk warning limit is intentionally set to `2400 kB` to account for the precompiled Rapier vendor chunk while preserving warning signal for unexpected growth beyond that bound

## Operational checks before demo

1. Build succeeds (`make -C simulations/playground build`)
2. Benchmark reports `PASS` (`make -C simulations/playground bench`)
3. Bundle report command succeeds (`make -C simulations/playground bundle-report`)
4. CI smoke checks pass (`make -C simulations/playground smoke`)
5. Basic mode smoke check:
  - Select **Basic** tab
  - Set **Game** to `Chessboard`
  - Click **Run Showcase**
  - Confirm black/white board surface and black/white piece proxies are visible
  - Confirm Redis Capability panel shows increasing stream tick/ops/timeline values with mode-aware narrative
  - Switch **Game** back to `Chaos` and confirm baseline scene visuals return
6. Advanced mode smoke check:
  - Select **Advanced** tab
  - Verify replay controls work with capture enabled
  - Verify HUD + graph update continuously while simulation runs
  - Verify Effects toggle can disable/enable visual effects without simulation errors

## Mode entry points

- **Basic mode**: one-click scripted showcase for non-technical demos (`Run Showcase`).
- **Basic game variants**:
  - `Chaos`: original random placement flow.
  - `Chessboard`: board-relative placement + black/white piece proxies.
- **Advanced mode**: full simulation control plane for deep technical review.
- Active mode can be set by URL query parameter: `?mode=basic` or `?mode=advanced`.

## Troubleshooting

### Dev server doesn’t start

- Ensure port `5174` is free
- Retry with a clean install:

```bash
npm ci
make -C simulations/playground dev
```

### Build fails after dependency updates

- Reinstall and rebuild:

```bash
npm ci
make -C simulations/playground build
```

### Benchmark fails target checks

- Re-run benchmark to confirm consistency
- Inspect latest artifact:
  - `simulations/playground/artifacts/perf/benchmark-latest.json`
- If bundle-size fails, verify no large accidental assets were added

### Replay panel shows no snapshots

- Enable **Capture replay**
- Click **Apply Replay Config**
- Start simulation and let steps progress before opening replay

### Visual effects performance issues

- Click **Disable Effects** in controls
- Use this mode for low-end hardware or profiling sessions

## Exit criteria for isolated demo readiness

- Build command passes
- Benchmark command passes
- Demo script in `DEMO_SCRIPT.md` runs end-to-end without errors
- No runtime errors in browser console during standard flow
