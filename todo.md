# Muonium Physics Playground — Isolated Build Plan

Date: 2026-02-28
Owner: demo track (isolated until functional)

## Scope

Build a fully isolated physics playground demo inside this repository, without coupling to the existing chess app runtime, assets, or build pipeline.

## Isolation Requirements (non-negotiable)

1. Separate app root (no shared entrypoint with current web app).
2. Separate HTML entry file and static asset root.
3. Separate build/dev scripts and output directory.
4. Separate config surface (env vars, vite config, ts/js config as needed).
5. No imports from current chess UI modules unless explicitly copied/adapted behind a dedicated adapter boundary.
6. Integration work deferred until feature-complete stabilization.

## Proposed Isolated Layout

```text
simulations/playground/
  index.html
  package.json (or scripts namespace in root package.json, but isolated commands)
  vite.config.js
  Makefile
  src/
    main.ts
    render/
    physics/
    metrics/
    modules/
    ui/
    effects/
    replay/
  public/
    wasm/
    textures/
```

If using root `package.json`, all commands must be namespaced, e.g.:
- `npm run playground:dev`
- `npm run playground:build`
- `npm run playground:preview`

## Phase Plan

## Phase 0 — Foundation and Isolation

- [ ] Create isolated app scaffold and folder boundaries.
- [ ] Add dedicated `simulations/playground/index.html`.
- [ ] Add dedicated build config and output path.
- [ ] Wire dedicated scripts (`playground:*`) and verify no impact to existing app scripts.

Exit criteria:
- Playground runs standalone in dev and build mode.
- Existing app commands still work unchanged.

## Phase 1 — Core Runtime

- [ ] Implement Rapier WASM bootstrap with deterministic step loop.
- [ ] Implement Three.js scene bootstrap (camera, lights, renderer lifecycle).
- [ ] Add world clock, pause/resume, reset, and simulation speed controls.

Exit criteria:
- Blank world can step at stable frame cadence.

## Phase 2 — Simulation Feature Modules

- [ ] Domino chain module (50–200 pieces, spacing/material controls, triggerable).
- [ ] Falling balls module (material profiles, height presets, gravity toggle).
- [ ] Trigger mechanism chain (ball → plank → domino → lever → gate).
- [ ] Lever system with hinge constraints and torque readout.
- [ ] Rolling objects with ramp angle, friction, mass controls.
- [ ] Puzzle mode with measurable completion objective.

Exit criteria:
- Every module can run independently and in composed scenario mode.

## Phase 3 — Telemetry and UX

- [ ] Build Redis-like WASM metrics adapter and frame/event aggregation.
- [ ] Add HUD (FPS, step time, collisions, energy state).
- [ ] Add live graph panel (velocity, torque, impact forces).
- [ ] Add threshold-based visual cues (glow states).

Exit criteria:
- Metrics are visible live and match simulation events.

## Phase 4 — Visual Delight + Optional Replay

- [ ] Add particle effects for chain speed, strong impacts, perfect puzzle solve.
- [ ] Add optional time-travel replay snapshots and playback controls.

Exit criteria:
- Visual feedback is event-driven and performant.

## Phase 5 — Performance + Hardening

- [ ] Add benchmark harness for FPS, physics step time, metrics throughput.
- [ ] Enforce targets: 60 FPS, physics step <1ms target, load <2s target, bundle target tracking.
- [ ] Add failure-mode handling (WASM load errors, reset behavior, guardrails).

Exit criteria:
- Repeatable benchmark report available.

## Phase 6 — Demo Readiness and Integration Handoff

- [ ] Demo script with reproducible scenarios.
- [ ] Documentation for architecture, runbook, and extension points.
- [ ] Integration checklist (what can be merged later and how).

Exit criteria:
- Playground is self-contained, documented, and ready for selective integration.

## Ticket Map

- [x] T-000045: Create isolated playground scaffold + separate HTML/build entrypoints (under `simulations/playground`)
- [x] T-000046: Implement Rapier WASM bootstrap and simulation loop
- [x] T-000047: Implement Three.js rendering bootstrap and lifecycle
- [x] T-000048: Domino chain simulation module
- [x] T-000049: Falling balls simulation module
- [x] T-000050: Trigger mechanism scenario module
- [x] T-000051: Lever system module
- [x] T-000052: Rolling objects module
- [x] T-000053: Puzzle mode with scoring
- [x] T-000054: Redis-like WASM metrics ingestion/aggregation layer
- [x] T-000055: HUD overlay for real-time operational stats
- [x] T-000056: Live graph panel from telemetry stream
- [x] T-000057: Particle/impact visual effects module
- [x] T-000058: Performance harness + target validation
- [x] T-000059: Optional time-travel replay snapshots
- [x] T-000060: Demo hardening, docs, and integration handoff pack

## Execution Policy

- Build all playground features in isolation first.
- No shared runtime wiring into existing app until T-000060 is accepted.
- Integration tasks to be planned in a separate ticket wave after functional sign-off.

## Post-Isolation Ticket Wave (Dual-Mode UX)

- [x] T-000061: Tabbed UI shell for Basic and Advanced modes
- [x] T-000062: Promote current UI as Advanced mode
- [x] T-000063: Basic mode one-click demo scenario
- [x] T-000064: Redis capability showcase panel for Basic mode
- [x] T-000065: Dual-mode UX polish and final demo script update

## Post-Demo Optimization Wave

- [x] T-000066: Bundle splitting strategy for playground app
- [x] T-000067: Reduce chunk-size warning and formalize bundle budget
- [x] T-000068: Add scripted CI smoke checks for dual-mode playground
