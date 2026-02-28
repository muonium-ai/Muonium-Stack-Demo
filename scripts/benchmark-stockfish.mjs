import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Chess } from 'chess.js';

const ROOT = process.cwd();

function parseArgs(argv) {
  const args = {
    dataset: 'carlsen',
    games: 1,
    depth: 1,
    gameIndex: 0,
    engine: 'stockfish',
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

    if (token.startsWith('--games=')) {
      args.games = Number(token.split('=')[1] || args.games);
      continue;
    }
    if (token === '--games') {
      args.games = Number(argv[index + 1] || args.games);
      index += 1;
      continue;
    }

    if (token.startsWith('--depth=')) {
      args.depth = Number(token.split('=')[1] || args.depth);
      continue;
    }
    if (token === '--depth') {
      args.depth = Number(argv[index + 1] || args.depth);
      index += 1;
      continue;
    }

    if (token.startsWith('--game-index=')) {
      args.gameIndex = Number(token.split('=')[1] || args.gameIndex);
      continue;
    }
    if (token === '--game-index') {
      args.gameIndex = Number(argv[index + 1] || args.gameIndex);
      index += 1;
      continue;
    }

    if (token.startsWith('--engine=')) {
      args.engine = token.split('=')[1] || args.engine;
      continue;
    }
    if (token === '--engine') {
      args.engine = argv[index + 1] || args.engine;
      index += 1;
      continue;
    }
  }

  args.games = Math.max(1, Number(args.games) || 1);
  args.depth = Math.max(1, Number(args.depth) || 1);
  args.gameIndex = Math.max(0, Number(args.gameIndex) || 0);
  return args;
}

function printHelp() {
  console.log('Stockfish benchmark CLI');
  console.log('');
  console.log('Usage:');
  console.log('  npm run bench:stockfish -- [--dataset carlsen|anand|/abs/path.pgn] [--games N] [--game-index N] [--depth N] [--engine stockfish]');
  console.log('');
  console.log('Defaults:');
  console.log('  --dataset carlsen');
  console.log('  --games 1');
  console.log('  --game-index 0');
  console.log('  --depth 1');
  console.log('  --engine stockfish');
}

function resolveDatasetPath(datasetArg) {
  const key = String(datasetArg || 'carlsen').toLowerCase();
  if (key === 'carlsen') {
    return path.resolve(ROOT, 'chess/games/Carlsen.pgn');
  }
  if (key === 'anand') {
    return path.resolve(ROOT, 'chess/games/Anand.pgn');
  }

  if (path.isAbsolute(datasetArg)) {
    return datasetArg;
  }
  return path.resolve(ROOT, datasetArg);
}

function stripPgnNoise(text) {
  let out = '';
  let inComment = false;
  let variationDepth = 0;

  for (const ch of text) {
    if (ch === '{') {
      inComment = true;
      continue;
    }
    if (ch === '}') {
      inComment = false;
      continue;
    }
    if (!inComment && ch === '(') {
      variationDepth += 1;
      continue;
    }
    if (!inComment && ch === ')' && variationDepth > 0) {
      variationDepth -= 1;
      continue;
    }

    if (!inComment && variationDepth === 0) {
      out += ch;
    }
  }

  return out;
}

function parseMoves(moveText) {
  return stripPgnNoise(moveText)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !/^\d+\.{1,3}$/.test(token))
    .filter((token) => !/^\$\d+$/.test(token))
    .filter((token) => !['1-0', '0-1', '1/2-1/2', '*'].includes(token))
    .map((token) => token.replace(/^\d+\.(\.\.)?/, '').replace(/[!?]+$/g, ''))
    .filter(Boolean);
}

function splitGames(pgnText) {
  const normalized = pgnText.replace(/\r\n/g, '\n');
  return normalized
    .split('\n\n[Event ')
    .map((chunk) => (chunk.startsWith('[Event ') ? chunk : `[Event ${chunk}`))
    .filter((chunk) => chunk.includes('[Event '));
}

function formatDuration(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  if (safe < 0.001) {
    return `${Math.max(1, Math.round(safe * 1_000_000))}µs`;
  }
  if (safe < 1) {
    return `${(safe * 1000).toFixed(3)}ms`;
  }
  return `${safe.toFixed(3)}s`;
}

function formatNumber(value) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(Math.max(0, Number(value) || 0));
}

function runStockfishSearch({ enginePath, uciMoves, depth }) {
  return new Promise((resolve, reject) => {
    const engine = spawn(enginePath);
    let done = false;
    let sentReady = false;
    let sentGo = false;

    const finish = (error, result) => {
      if (done) {
        return;
      }
      done = true;
      try {
        engine.kill();
      } catch {
        // ignore
      }
      if (error) {
        reject(error);
      } else {
        resolve(result);
      }
    };

    engine.on('error', (error) => finish(error));

    engine.stdout.on('data', (chunk) => {
      const lines = chunk
        .toString()
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      for (const line of lines) {
        if (line === 'uciok' && !sentReady) {
          sentReady = true;
          engine.stdin.write('isready\n');
          continue;
        }

        if (line === 'readyok' && !sentGo) {
          sentGo = true;
          engine.stdin.write(`position startpos moves ${uciMoves.join(' ')}\n`);
          engine.stdin.write(`go depth ${depth}\n`);
          continue;
        }

        if (line.startsWith('bestmove ')) {
          finish(null, line);
          return;
        }
      }
    });

    engine.stdin.write('uci\n');
    setTimeout(() => finish(new Error('Timeout waiting for Stockfish bestmove')), 20000);
  });
}

function toUciMoves(sanMoves) {
  const chess = new Chess();
  const uciMoves = [];

  for (const san of sanMoves) {
    const move = chess.move(san, { strict: false, sloppy: true });
    if (!move) {
      continue;
    }
    uciMoves.push(`${move.from}${move.to}${move.promotion ?? ''}`);
  }

  return uciMoves;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const datasetPath = resolveDatasetPath(args.dataset);
  const pgnText = await fs.readFile(datasetPath, 'utf8');
  const games = splitGames(pgnText);

  if (games.length === 0) {
    throw new Error(`No games found in ${datasetPath}`);
  }

  const startIndex = Math.min(args.gameIndex, games.length - 1);
  const endExclusive = Math.min(games.length, startIndex + args.games);

  let totalSanMoves = 0;
  let totalLegalMoves = 0;
  let totalParseSec = 0;
  let totalEngineSec = 0;
  let lastBestMove = 'bestmove (none)';

  for (let index = startIndex; index < endExclusive; index += 1) {
    const chunk = games[index];
    const separator = chunk.indexOf('\n\n');
    const moveBlock = separator === -1 ? '' : chunk.slice(separator + 2);
    const sanMoves = parseMoves(moveBlock);
    totalSanMoves += sanMoves.length;

    const parseStarted = performance.now();
    const uciMoves = toUciMoves(sanMoves);
    const parseSec = (performance.now() - parseStarted) / 1000;
    totalParseSec += parseSec;
    totalLegalMoves += uciMoves.length;

    const engineStarted = performance.now();
    lastBestMove = await runStockfishSearch({
      enginePath: args.engine,
      uciMoves,
      depth: args.depth,
    });
    totalEngineSec += (performance.now() - engineStarted) / 1000;
  }

  const gameCount = endExclusive - startIndex;
  console.log(`Dataset: ${datasetPath}`);
  console.log(`Games benchmarked: ${gameCount} (start index ${startIndex})`);
  console.log(`Depth: ${args.depth}`);
  console.log(`SAN moves parsed: ${totalSanMoves}`);
  console.log(`Legal moves applied: ${totalLegalMoves}`);
  console.log(`Parse time (SAN->UCI): ${formatDuration(totalParseSec)}`);
  console.log(`Parse throughput: ${formatNumber(totalLegalMoves / Math.max(totalParseSec, 1e-9))} moves/sec`);
  console.log(`Stockfish time (total): ${formatDuration(totalEngineSec)}`);
  console.log(`Stockfish avg/game: ${formatDuration(totalEngineSec / Math.max(gameCount, 1))}`);
  console.log(`Last ${lastBestMove}`);
}

main().catch((error) => {
  console.error(`bench:stockfish failed: ${error.message}`);
  process.exit(1);
});
