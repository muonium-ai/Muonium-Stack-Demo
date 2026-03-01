# Deterministic Demo Script

Use this sequence for repeatable reviewer walkthroughs.

## Pre-demo

1. Start dev server:

```bash
make -C simulations/playground dev
```

2. Open `http://localhost:5174`

## Walkthrough sequence

### 1) Basic mode one-click showcase (primary reviewer path)

- Select **Basic** tab
- Set **Game** to `Chessboard`
- Click **Run Simulation** once
- Let the random-iteration showcase run for at least 2-3 iterations
- Observe chessboard behavior:
	- black/white 8x8 board surface visible
	- black/white piece proxy entities spawned each iteration
	- board-relative placement patterns (not free-form chaos scatter)
- Observe Redis Capability panel updates:
	- stream tick/rate increase
	- ops counters (`HSET`, `HINCRBY`, `LPUSH`) change live
	- timeline mapping line updates
	- narrative line references active mode (`Chaos` vs `Chessboard`)

Expected: chessboard variant runs without errors and telemetry continues to stream.

### 2) Basic chaos regression check

- Keep **Basic** tab active
- Set **Game** back to `Chaos`
- Click **Run Simulation**

Expected: baseline chaos behavior remains available with the same Redis panel responsiveness.

### 3) Optional Advanced deep dive (technical reviewers)

- Select **Advanced** tab
- Click **Initialize Rapier**

Expected: full controls and telemetry panels are available.

### 4) Advanced baseline runtime and telemetry

- Click **Start**
- Verify timing telemetry updates
- Verify HUD values update in top-right overlay
- Click **Pause**

Expected: no errors, stable updates in HUD and stream panel.

### 5) Advanced module spot checks

- Click **Create Chain**, then **Trigger Chain**, then **Run Trigger Sequence**
- Click **Spawn Balls**
- Click **Apply Rolling Setup**
- Click **Start Puzzle Attempt** and wait for completion/failure

Expected: module metrics and status fields update correctly.

### 6) Advanced live graph panel

- Set **Graph window** to `short`, observe response
- Set back to `medium`

Expected: velocity/torque/impact lines continue updating without UI lag.

### 7) Advanced effects verification

- Ensure effects visible during active impacts/fast chains
- Click **Disable Effects**, re-run trigger/ball actions
- Click **Enable Effects**

Expected: simulation remains correct with effects on/off.

### 8) Advanced replay verification

- Enable **Capture replay**
- Set interval to `6`, click **Apply Replay Config**
- Click **Start** for ~5 seconds, then **Pause**
- Click **Open Replay**
- Scrub slider to different indices
- Click **Play Replay** then **Pause Replay**
- Click **Restart From Scrub**
- Click **Exit Replay**

Expected: replay renders recorded snapshots and does not mutate live world state.

## Post-demo validation

Run benchmark harness:

```bash
make -C simulations/playground bench
```

Expected: `Result: PASS` in benchmark summary.
