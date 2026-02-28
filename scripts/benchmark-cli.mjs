import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import initSqlJs from 'sql.js';
import { Chess } from 'chess.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const DATASET_PRESETS = {
  carlsen: path.join(ROOT, 'public', 'data', 'carlsen.sqlite'),
  anand: path.join(ROOT, 'public', 'data', 'anand.sqlite'),
};

function parseArgs(argv) {
  const args = {
    dataset: 'carlsen',
    mode: 'parse',
    limit: 0,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === '--help' || token === '-h') {
      args.help = true;
      continue;
    }

    if (token.startsWith('--dataset=')) {
      args.dataset = token.split('=')[1] || args.dataset;
      continue;
    }
    if (token === '--dataset') {
      args.dataset = argv[index + 1] || args.dataset;
      index += 1;
      continue;
    }

    if (token.startsWith('--mode=')) {
      args.mode = token.split('=')[1] || args.mode;
      continue;
    }
    if (token === '--mode') {
      args.mode = argv[index + 1] || args.mode;
      index += 1;
      continue;
    }

    if (token.startsWith('--limit=')) {
      args.limit = Number(token.split('=')[1] || 0);
      continue;
    }
    if (token === '--limit') {
      args.limit = Number(argv[index + 1] || 0);
      index += 1;
      continue;
    }
  }

  return args;
}

function printHelp() {
  console.log('Chess CLI benchmark');
  console.log('');
  console.log('Usage:');
  console.log('  npm run bench:cli -- [--dataset carlsen|anand|/abs/path.sqlite] [--mode summary|parse|replay] [--limit N]');
  console.log('');
  console.log('Defaults:');
  console.log('  --dataset carlsen');
  console.log('  --mode parse');
  console.log('  --limit 0 (all games)');
}

function resolveDatasetPath(datasetArg) {
  const key = String(datasetArg || 'carlsen').toLowerCase();
  return DATASET_PRESETS[key] || path.resolve(ROOT, datasetArg);
}

function formatDuration(seconds) {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  if (safeSeconds < 0.001) {
    const microseconds = Math.max(1, Math.round(safeSeconds * 1_000_000));
    return `${microseconds}µs`;
  }
  if (safeSeconds < 1) {
    return `${(safeSeconds * 1000).toFixed(3)}ms`;
  }
  return `${safeSeconds.toFixed(3)}s`;
}

function formatMps(moves, seconds) {
  const safe = seconds > 0 ? moves / seconds : 0;
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(safe);
}

async function loadDb(datasetPath) {
  const sqlWasmDir = path.join(ROOT, 'node_modules', 'sql.js', 'dist');
  const SQL = await initSqlJs({
    locateFile: (file) => path.join(sqlWasmDir, file),
  });

  const bytes = await fs.readFile(datasetPath);
  return new SQL.Database(bytes);
}

function getGames(db, limit) {
  const safeLimit = Math.max(0, Number(limit) || 0);
  const sql =
    safeLimit > 0
      ? `SELECT id, move_count, moves_json FROM games ORDER BY id LIMIT ${safeLimit}`
      : 'SELECT id, move_count, moves_json FROM games ORDER BY id';

  const stmt = db.prepare(sql);
  const rows = [];

  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }

  stmt.free();
  return rows;
}

function runSummaryBenchmark(rows) {
  let totalMoves = 0;
  for (const row of rows) {
    totalMoves += Number(row.move_count || 0);
  }
  return { totalMoves, invalidGames: 0 };
}

function runParseBenchmark(rows) {
  let totalMoves = 0;
  let invalidGames = 0;

  for (const row of rows) {
    try {
      const moves = JSON.parse(row.moves_json || '[]');
      if (!Array.isArray(moves)) {
        invalidGames += 1;
        continue;
      }
      totalMoves += moves.length;
    } catch {
      invalidGames += 1;
    }
  }

  return { totalMoves, invalidGames };
}

function runReplayBenchmark(rows) {
  let totalMoves = 0;
  let invalidGames = 0;

  for (const row of rows) {
    try {
      const moves = JSON.parse(row.moves_json || '[]');
      if (!Array.isArray(moves)) {
        invalidGames += 1;
        continue;
      }

      const chess = new Chess();
      for (const san of moves) {
        const applied = chess.move(String(san), { strict: false, sloppy: true });
        if (applied) {
          totalMoves += 1;
        }
      }
    } catch {
      invalidGames += 1;
    }
  }

  return { totalMoves, invalidGames };
}

function runMode(rows, mode) {
  switch (mode) {
    case 'summary':
      return runSummaryBenchmark(rows);
    case 'parse':
      return runParseBenchmark(rows);
    case 'replay':
      return runReplayBenchmark(rows);
    default:
      throw new Error(`Invalid mode '${mode}'. Use summary|parse|replay.`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const datasetPath = resolveDatasetPath(args.dataset);
  const mode = String(args.mode || 'parse').toLowerCase();
  const startedAt = performance.now();

  let db;
  try {
    db = await loadDb(datasetPath);
  } catch (error) {
    throw new Error(`Unable to open dataset '${datasetPath}'. Run npm run db:build first. ${error.message}`);
  }

  try {
    const rows = getGames(db, args.limit);
    if (rows.length === 0) {
      throw new Error('No games found in dataset.');
    }

    const runStartedAt = performance.now();
    const { totalMoves, invalidGames } = runMode(rows, mode);
    const runSeconds = (performance.now() - runStartedAt) / 1000;
    const totalSeconds = (performance.now() - startedAt) / 1000;

    console.log(`Dataset: ${datasetPath}`);
    console.log(`Mode: ${mode}`);
    console.log(`Games: ${rows.length}`);
    console.log(`Moves: ${totalMoves}`);
    console.log(`Invalid games: ${invalidGames}`);
    console.log(`Benchmark time: ${formatDuration(runSeconds)}`);
    console.log(`Moves/sec: ${formatMps(totalMoves, runSeconds)}`);
    console.log(`Total CLI time: ${formatDuration(totalSeconds)}`);
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(`bench:cli failed: ${error.message}`);
  process.exit(1);
});
