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

## Operational checks before demo

1. Build succeeds (`make -C simulations/playground build`)
2. Benchmark reports `PASS` (`make -C simulations/playground bench`)
3. Replay controls work with capture enabled
4. HUD + graph update continuously while simulation runs
5. Effects toggle can disable/enable visual effects without simulation errors

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
