# Integration Checklist (Post-Stabilization)

This checklist identifies what can be integrated into the main app later and what refactors are required first.

## Candidate components for merge

- Telemetry adapter patterns from `src/metrics/telemetryStore.js`
- Graph rendering abstraction from `src/ui/liveGraphPanel.js`
- Benchmark reporting format from `scripts/benchmark-playground.mjs`
- Replay snapshot model (compact encoding + indexed retrieval)

## Required pre-merge refactors

1. **Config unification**
   - Introduce shared config surface for ports/feature flags
   - Keep playground defaults intact behind namespaced keys

2. **Telemetry contract extraction**
   - Define shared telemetry packet schema in one module
   - Avoid direct coupling to playground-specific metric keys

3. **UI shell separation**
   - Extract reusable control/panel primitives
   - Keep simulation-specific copy and controls local

4. **Asset and bundle governance**
   - Validate merged bundle impact against size budgets
   - Keep effects/replay toggles off by default where appropriate

5. **Feature flag gating**
   - Gate replay/effects/graph panel under explicit flags
   - Ensure safe fallback behavior when disabled

## Integration risks

- Over-coupling simulation UI into chess workflows
- Bundle growth from Three.js scene/effects paths
- Runtime contention if telemetry stream contracts diverge
- User confusion if replay semantics differ between domains

## Suggested merge order

1. Telemetry contract and graph abstraction
2. Benchmark schema and artifact pipeline
3. Optional replay snapshot utilities
4. Visual effects patterns (behind flags)
5. Any shared UI primitives (last)

## Validation gates before merging

- Main app build + playground build both green
- Playground benchmark still passes targets
- No regressions in chess UI controls/search/playback
- Feature flags verified for on/off behavior
