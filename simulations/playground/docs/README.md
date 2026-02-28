# Muonium Physics Playground — Handoff Pack

This folder contains the isolated demo handoff package for T-000060.

## Documents

- `RUNBOOK.md` — setup, dev/build/preview, benchmark commands, and troubleshooting
- `ARCHITECTURE.md` — runtime/module boundaries and explicit isolation constraints
- `INTEGRATION_CHECKLIST.md` — what can be merged later + required refactor steps
- `DEMO_SCRIPT.md` — deterministic showcase flow for reviewer walkthrough

## Quick Start

From repository root:

```bash
make -C simulations/playground dev
```

Build + benchmark:

```bash
make -C simulations/playground build
make -C simulations/playground bench
```
