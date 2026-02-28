# Muonium Physics Playground

### Three.js + Rapier (WASM) + Redis WASM Metrics Engine

------------------------------------------------------------------------

## 1. Objective

Build a browser-based physics simulation demo that showcases:

-   Domino chains\
-   Falling balls\
-   Trigger mechanisms\
-   Levers\
-   Rolling objects\
-   Basic physics puzzles

Powered entirely by WebAssembly for performance and real-time telemetry.

The experience should feel:

-   Smooth\
-   Cinematic\
-   Data-rich\
-   Visually delightful\
-   Technically impressive

------------------------------------------------------------------------

## 2. Technology Stack

-   **Three.js** → Rendering layer (WebGL visuals)
-   **Rapier (WASM)** → Physics engine (Rust → WebAssembly)
-   **Muon Redis WASM Clone** → Real-time metrics + telemetry storage
-   **Custom HUD + Graph Layer** → Live visualization of metrics

------------------------------------------------------------------------

## 3. System Architecture

Browser ├── Three.js (Rendering Layer) ├── Rapier WASM (Physics Layer)
├── Muon Redis WASM (Metrics Layer) ├── HUD Overlay └── Real-time
Metrics Graph Engine

------------------------------------------------------------------------

## 4. Core Simulation Modules

### A. Domino Chain Module

Features: - 50--200 dominoes - Physics-driven falling chain - Adjustable
spacing & material - Triggered by falling ball

Metrics Stored: - domino:count - domino:fall_time_avg -
domino:collision_events - domino:max_velocity

Impressive Metric: - Chain reaction speed (dominoes per second)

------------------------------------------------------------------------

### B. Falling Balls Module

Features: - Multiple spheres at varying heights - Different materials
(metal, rubber, wood) - Adjustable gravity toggle

Metrics: - ball:fall_time - ball:bounce_count - ball:max_height -
ball:impact_force

Visual Effect: - Impact pulse animation - Slow-motion replay

------------------------------------------------------------------------

### C. Trigger Mechanism

Example Flow: Ball → plank → domino → lever → gate opens

Metrics: - trigger:sequence_time - trigger:latency_between_events -
trigger:event_order - trigger:precision_score

------------------------------------------------------------------------

### D. Lever System

Features: - Hinged constraint using Rapier - Adjustable weight on both
ends - Torque visualization

Metrics: - lever:torque - lever:rotation_speed - lever:equilibrium_time

------------------------------------------------------------------------

### E. Rolling Objects

Features: - Adjustable ramp angle - Friction slider - Mass variation

Metrics: - roll:distance - roll:velocity_avg - roll:friction_coeff -
roll:energy_loss

------------------------------------------------------------------------

### F. Puzzle Mode

Example: "Trigger all dominoes in under 3 seconds using only one ball."

Metrics: - puzzle:attempts - puzzle:completion_time -
puzzle:physics_efficiency_score

------------------------------------------------------------------------

## 5. Redis WASM Metrics Layer

Strategy: - Capture physics data every frame (60 FPS) - Aggregate every
100ms - Store in Redis WASM clone - Stream to HUD and graphs

Example Usage:

redis.hincrby("metrics:domino", "collision_events", 1)
redis.hset("metrics:lever", "torque", currentTorque)
redis.lpush("timeline:events", eventData)

------------------------------------------------------------------------

## 6. Delightful Visual Feedback

### HUD (Top-Right)

-   FPS
-   Physics step time
-   Collision count
-   Energy state

Animated numbers with glow effects on threshold events.

------------------------------------------------------------------------

### Live Graph Panel

-   Real-time velocity
-   Torque curves
-   Impact force lines

Pulled from Redis telemetry stream.

------------------------------------------------------------------------

### Particle Effects

-   High-speed domino chain → spark trail
-   Strong impact → shockwave ring
-   Perfect puzzle solve → golden glow

------------------------------------------------------------------------

## 7. Performance Targets

  Component          Target
  ------------------ --------
  FPS                60
  Physics Step       \< 1ms
  Redis Ops/sec      10k+
  Load Time          \< 2s
  WASM Bundle Size   \< 3MB

------------------------------------------------------------------------

## 8. Advanced Feature (Optional)

### Time Travel Replay

-   Snapshot physics states
-   Store compressed snapshots in Redis
-   Replay full chain reactions

Keys: - state:snapshot:001 - state:snapshot:002

------------------------------------------------------------------------

## 9. Suggested Folder Structure

/src /render (Three.js) /physics (Rapier wrapper) /metrics (Redis WASM
client) /ui (HUD + graphs) /modules domino.ts ball.ts lever.ts
trigger.ts puzzle.ts

------------------------------------------------------------------------

## 10. Strategic Value for Muonium

This demo proves:

-   Rust → WASM performance
-   Redis clone viability in browser
-   Real-time telemetry engine
-   Physics + data synergy
-   Agent-ready architecture

Positioning Statement:

"Muonium is a real-time computational substrate for physics-native web
applications."
