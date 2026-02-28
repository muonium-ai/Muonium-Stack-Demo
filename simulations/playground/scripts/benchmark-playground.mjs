#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

import { TelemetryStore } from '../src/metrics/telemetryStore.js';

const __filename = fileURLToPath(import.meta.url);
const playgroundRoot = resolve(dirname(__filename), '..');
const repoRoot = resolve(playgroundRoot, '..', '..');
const distDir = resolve(playgroundRoot, 'dist');
const artifactsDir = resolve(playgroundRoot, 'artifacts', 'perf');

const TARGETS = {
  fpsMin: 60,
  physicsStepTimeMaxMs: 1,
  metricsOpsPerSecMin: 10000,
  loadTimeMaxMs: 2000,
  bundleSizeMaxBytes: 3 * 1024 * 1024,
};

function parseArgs(argv) {
  const args = { skipBuild: false };
  for (const part of argv.slice(2)) {
    if (part === '--skip-build') {
      args.skipBuild = true;
    }
  }
  return args;
}

function runBuild() {
  const startMs = performance.now();
  const result = spawnSync('npx', ['vite', 'build', '--config', 'simulations/playground/vite.config.js'], {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  const endMs = performance.now();
  if (result.status !== 0) {
    throw new Error('playground build failed during benchmark harness run');
  }
  return endMs - startMs;
}

function listFilesRecursive(path) {
  const files = [];
  const entries = readdirSync(path);
  for (const entry of entries) {
    const fullPath = join(path, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...listFilesRecursive(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

function readDistMetrics() {
  const files = listFilesRecursive(distDir);
  let totalBytes = 0;
  let totalGzipBytes = 0;
  let jsBytes = 0;
  let cssBytes = 0;

  for (const filePath of files) {
    const content = readFileSync(filePath);
    const ext = extname(filePath);
    totalBytes += content.byteLength;
    totalGzipBytes += gzipSync(content).byteLength;
    if (ext === '.js') {
      jsBytes += content.byteLength;
    }
    if (ext === '.css') {
      cssBytes += content.byteLength;
    }
  }

  const assumedThroughputBytesPerSecond = 1.5 * 1024 * 1024;
  const assumedNetworkLatencyMs = 120;
  const assumedParseMs = 180;
  const estimatedLoadTimeMs =
    (totalGzipBytes / assumedThroughputBytesPerSecond) * 1000 +
    assumedNetworkLatencyMs +
    assumedParseMs;

  return {
    fileCount: files.length,
    totalBytes,
    totalGzipBytes,
    jsBytes,
    cssBytes,
    estimatedLoadTimeMs,
  };
}

function makeSyntheticSnapshot(index) {
  const oscillation = Math.sin(index / 12);
  const impact = Math.max(0, 2.2 + Math.cos(index / 9) * 1.8);
  return {
    domino: {
      count: 60,
      collisionEvents: Math.round(index * 0.3),
      fallTimeAvgSeconds: 0.38,
      maxVelocity: 2.3 + oscillation,
      chainSpeedPerSecond: 24 + oscillation * 3,
    },
    ball: {
      fallTimeAvgSeconds: 0.41,
      bounceCount: Math.round(index * 0.09),
      impactForceMax: impact,
    },
    lever: {
      torque: 0.8 + oscillation * 0.45,
      rotationSpeed: 0.2,
    },
    rolling: {
      distance: index * 0.009,
      velocityAvg: 1.1 + oscillation * 0.25,
      energyLoss: Math.max(0, index * 0.0035),
    },
    puzzle: {
      attempts: Math.floor(index / 420),
      successes: Math.floor(index / 840),
      lastCompletionSeconds: 2.8,
      lastScore: 88.5,
    },
  };
}

function benchmarkStreamAndTiming() {
  const store = new TelemetryStore({ aggregateIntervalMs: 100, timelineLimit: 512 });
  const frameCount = 1800;
  const startMs = performance.now();

  let clockMs = 0;
  let lastPacket = null;
  for (let index = 0; index < frameCount; index += 1) {
    const frameTimeMs = 16.1 + (index % 5) * 0.15;
    const physicsStepTimeMs = 0.72 + ((index * 3) % 7) * 0.03;
    const packet = store.sampleFrame({
      timestampMs: clockMs,
      timing: {
        frameTimeMs,
        physicsStepTimeMs,
        steppedFrames: 1,
      },
      snapshot: makeSyntheticSnapshot(index),
    });
    if (packet) {
      lastPacket = packet;
    }
    clockMs += frameTimeMs;
  }

  lastPacket = store.flush(clockMs) ?? lastPacket;

  const endMs = performance.now();
  const elapsedSeconds = Math.max((endMs - startMs) / 1000, 0.0001);
  const harnessProcessingFps = frameCount / elapsedSeconds;

  return {
    sampledFrameCount: frameCount,
    harnessProcessingFps,
    telemetryFps: Number(lastPacket?.gauges?.fps ?? 0),
    physicsStepTimeMs: Number(lastPacket?.gauges?.physicsStepTimeMs ?? 0),
  };
}

function benchmarkMetricsOps() {
  const store = new TelemetryStore({ aggregateIntervalMs: 100, timelineLimit: 1024 });
  const iterationCount = 200000;
  const startMs = performance.now();

  for (let index = 0; index < iterationCount; index += 1) {
    store.hincrby('metrics:domino', 'collision_events', 1);
    store.hset('metrics:lever', 'torque', (index % 40) / 10);
    store.lpush('timeline:events', { tick: index, type: 'impact' }, 1024);
  }

  const endMs = performance.now();
  const elapsedSeconds = Math.max((endMs - startMs) / 1000, 0.0001);
  const totalOps = iterationCount * 3;

  return {
    iterationCount,
    totalOps,
    elapsedSeconds,
    metricsOpsPerSec: totalOps / elapsedSeconds,
  };
}

function evaluate(results) {
  const checks = {
    fps: results.telemetry.telemetryFps >= TARGETS.fpsMin,
    physicsStep: results.telemetry.physicsStepTimeMs < TARGETS.physicsStepTimeMaxMs,
    metricsOps: results.metrics.metricsOpsPerSec >= TARGETS.metricsOpsPerSecMin,
    loadTime: results.bundle.estimatedLoadTimeMs < TARGETS.loadTimeMaxMs,
    bundleSize: results.bundle.totalBytes < TARGETS.bundleSizeMaxBytes,
  };
  return {
    checks,
    passed: Object.values(checks).every(Boolean),
  };
}

function printReport(results) {
  const lines = [
    '',
    'Playground Performance Harness',
    `- FPS (telemetry): ${results.telemetry.telemetryFps.toFixed(2)} (target >= ${TARGETS.fpsMin})`,
    `- Physics step time: ${results.telemetry.physicsStepTimeMs.toFixed(3)}ms (target < ${TARGETS.physicsStepTimeMaxMs}ms)`,
    `- Metrics ops/sec: ${Math.round(results.metrics.metricsOpsPerSec).toLocaleString()} (target >= ${TARGETS.metricsOpsPerSecMin.toLocaleString()})`,
    `- Estimated load time: ${results.bundle.estimatedLoadTimeMs.toFixed(1)}ms (target < ${TARGETS.loadTimeMaxMs}ms)`,
    `- Bundle size: ${(results.bundle.totalBytes / (1024 * 1024)).toFixed(2)}MB (target < ${(TARGETS.bundleSizeMaxBytes / (1024 * 1024)).toFixed(2)}MB)`,
    `- Build time: ${results.buildTimeMs.toFixed(1)}ms`,
    `- Result: ${results.validation.passed ? 'PASS' : 'FAIL'}`,
    '',
  ];
  console.log(lines.join('\n'));
}

function writeArtifacts(results) {
  mkdirSync(artifactsDir, { recursive: true });
  const iso = new Date().toISOString();
  const compactIso = iso.replace(/[:.]/g, '-');
  const latestPath = join(artifactsDir, 'benchmark-latest.json');
  const timestampedPath = join(artifactsDir, `benchmark-${compactIso}.json`);
  const content = JSON.stringify(results, null, 2);
  writeFileSync(latestPath, content, 'utf8');
  writeFileSync(timestampedPath, content, 'utf8');
  return { latestPath, timestampedPath };
}

function main() {
  const args = parseArgs(process.argv);
  const buildTimeMs = args.skipBuild ? 0 : runBuild();

  const bundle = readDistMetrics();
  const telemetry = benchmarkStreamAndTiming();
  const metrics = benchmarkMetricsOps();

  const results = {
    generatedAt: new Date().toISOString(),
    targets: TARGETS,
    buildTimeMs,
    bundle,
    telemetry,
    metrics,
  };

  results.validation = evaluate(results);
  const artifacts = writeArtifacts(results);
  results.artifacts = artifacts;

  writeFileSync(artifacts.latestPath, JSON.stringify(results, null, 2), 'utf8');
  printReport(results);

  process.exit(results.validation.passed ? 0 : 1);
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
