#!/usr/bin/env node
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const __filename = fileURLToPath(import.meta.url);
const playgroundRoot = resolve(dirname(__filename), '..');
const distDir = resolve(playgroundRoot, 'dist');
const artifactsDir = resolve(playgroundRoot, 'artifacts', 'perf');

function listFilesRecursive(path) {
  const files = [];
  for (const entry of readdirSync(path)) {
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

function collectBundleStats() {
  const files = listFilesRecursive(distDir);
  const assets = files
    .map((filePath) => {
      const content = readFileSync(filePath);
      return {
        path: filePath.replace(`${playgroundRoot}/`, ''),
        ext: extname(filePath),
        bytes: content.byteLength,
        gzipBytes: gzipSync(content).byteLength,
      };
    })
    .sort((a, b) => b.bytes - a.bytes);

  const totals = assets.reduce(
    (acc, asset) => {
      acc.bytes += asset.bytes;
      acc.gzipBytes += asset.gzipBytes;
      if (asset.ext === '.js') {
        acc.jsBytes += asset.bytes;
      }
      if (asset.ext === '.css') {
        acc.cssBytes += asset.bytes;
      }
      return acc;
    },
    { bytes: 0, gzipBytes: 0, jsBytes: 0, cssBytes: 0 }
  );

  return {
    generatedAt: new Date().toISOString(),
    totals,
    largestAssets: assets.slice(0, 12),
  };
}

function writeArtifacts(report) {
  mkdirSync(artifactsDir, { recursive: true });
  const compactIso = report.generatedAt.replace(/[:.]/g, '-');
  const latestPath = join(artifactsDir, 'bundle-size-latest.json');
  const timestampedPath = join(artifactsDir, `bundle-size-${compactIso}.json`);
  const content = JSON.stringify(report, null, 2);
  writeFileSync(latestPath, content, 'utf8');
  writeFileSync(timestampedPath, content, 'utf8');
  return { latestPath, timestampedPath };
}

try {
  const report = collectBundleStats();
  const artifacts = writeArtifacts(report);

  console.log('Playground Bundle Report');
  console.log(`- Total bytes: ${report.totals.bytes}`);
  console.log(`- Total gzip bytes: ${report.totals.gzipBytes}`);
  console.log(`- JS bytes: ${report.totals.jsBytes}`);
  console.log(`- CSS bytes: ${report.totals.cssBytes}`);
  console.log(`- Latest artifact: ${artifacts.latestPath}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
