# Deterministic Demo Script

Use this sequence for repeatable reviewer walkthroughs.

## Pre-demo

1. Start dev server:

```bash
make -C simulations/playground dev
```

2. Open `http://localhost:5174`
3. Click **Initialize Rapier**

## Walkthrough sequence

### 1) Baseline runtime and telemetry

- Click **Start**
- Verify timing telemetry updates
- Verify HUD values update in top-right overlay
- Click **Pause**

Expected: no errors, stable updates in HUD and stream panel.

### 2) Domino + trigger chain

- Click **Create Chain** (default values)
- Click **Trigger Chain**
- Click **Run Trigger Sequence**

Expected: domino metrics and trigger order/latencies update.

### 3) Ball and rolling modules

- Click **Spawn Balls**
- Click **Apply Rolling Setup**
- Click **Start** for a few seconds, then **Pause**

Expected: ball impacts/rolling energy metrics move from baseline.

### 4) Puzzle mode objective

- Click **Start Puzzle Attempt**
- Wait for completion/failure

Expected: puzzle attempts/status/completion score update.

### 5) Live graph panel

- Set **Graph window** to `short`, observe response
- Set back to `medium`

Expected: velocity/torque/impact lines continue updating without UI lag.

### 6) Effects verification

- Ensure effects visible during active impacts/fast chains
- Click **Disable Effects**, re-run trigger/ball actions
- Click **Enable Effects**

Expected: simulation remains correct with effects on/off.

### 7) Replay verification

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
