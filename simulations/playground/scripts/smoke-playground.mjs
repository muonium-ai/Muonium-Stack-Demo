#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const playgroundRoot = resolve(dirname(__filename), '..');
const repoRoot = resolve(playgroundRoot, '..', '..');
const artifactsDir = resolve(playgroundRoot, 'artifacts', 'perf');

function runBuild() {
  const result = spawnSync('npx', ['vite', 'build', '--config', 'simulations/playground/vite.config.js'], {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (result.status !== 0) {
    throw new Error('build step failed');
  }
}

function assertIncludes(content, needle, label) {
  if (!content.includes(needle)) {
    throw new Error(`missing expected marker: ${label}`);
  }
}

function runChecks() {
  const mainJs = readFileSync(resolve(playgroundRoot, 'src', 'main.js'), 'utf8');

  const checks = [
    {
      id: 'basic-entry-tab',
      description: 'Basic mode entry tab exists',
      run: () => assertIncludes(mainJs, "id=\"tabBasicBtn\"", 'tabBasicBtn'),
    },
    {
      id: 'basic-showcase-hook',
      description: 'Basic one-click showcase hook exists',
      run: () => {
        assertIncludes(mainJs, "id=\"basicRunShowcaseBtn\"", 'basicRunShowcaseBtn');
        assertIncludes(mainJs, 'const runBasicShowcase = async () => {', 'runBasicShowcase function');
        assertIncludes(mainJs, "basicRunShowcaseBtn.addEventListener('click'", 'basic showcase click listener');
      },
    },
    {
      id: 'advanced-entry-tab',
      description: 'Advanced mode entry tab exists',
      run: () => assertIncludes(mainJs, "id=\"tabAdvancedBtn\"", 'tabAdvancedBtn'),
    },
    {
      id: 'advanced-controls-hook',
      description: 'Advanced controls and replay hooks exist',
      run: () => {
        assertIncludes(mainJs, "id=\"initBtn\"", 'initBtn');
        assertIncludes(mainJs, "id=\"replayOpenBtn\"", 'replayOpenBtn');
      },
    },
  ];

  const results = [];
  for (const check of checks) {
    check.run();
    results.push({
      id: check.id,
      description: check.description,
      status: 'pass',
    });
  }
  return results;
}

function writeArtifacts(report) {
  mkdirSync(artifactsDir, { recursive: true });
  const compactIso = report.generatedAt.replace(/[:.]/g, '-');
  const latestPath = join(artifactsDir, 'smoke-latest.json');
  const timestampedPath = join(artifactsDir, `smoke-${compactIso}.json`);
  const content = JSON.stringify(report, null, 2);
  writeFileSync(latestPath, content, 'utf8');
  writeFileSync(timestampedPath, content, 'utf8');
  return { latestPath, timestampedPath };
}

function main() {
  runBuild();
  const checks = runChecks();
  const report = {
    generatedAt: new Date().toISOString(),
    status: 'pass',
    checks,
  };
  const artifacts = writeArtifacts(report);

  console.log('Playground Smoke Checks');
  console.log(`- Status: ${report.status.toUpperCase()}`);
  for (const check of checks) {
    console.log(`- ${check.id}: ${check.status}`);
  }
  console.log(`- Latest artifact: ${artifacts.latestPath}`);
}

try {
  main();
} catch (error) {
  const report = {
    generatedAt: new Date().toISOString(),
    status: 'fail',
    error: error instanceof Error ? error.message : String(error),
  };
  writeArtifacts(report);
  console.error(report.error);
  process.exit(1);
}
