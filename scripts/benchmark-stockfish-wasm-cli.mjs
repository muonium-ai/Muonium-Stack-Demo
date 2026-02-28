import { Chess } from 'chess.js';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import StockfishModule from 'stockfish.wasm';

const require = createRequire(import.meta.url);

const StockfishFactory =
  typeof StockfishModule === 'function' ? StockfishModule : StockfishModule?.default;

function parseArgs(argv) {
  const args = {
    games: 1000,
    depth: 1,
    maxPly: 260,
    progressEvery: 25,
    threads: 1,
    hash: 16,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === '--help' || token === '-h') {
      args.help = true;
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

    if (token.startsWith('--max-ply=')) {
      args.maxPly = Number(token.split('=')[1] || args.maxPly);
      continue;
    }
    if (token === '--max-ply') {
      args.maxPly = Number(argv[index + 1] || args.maxPly);
      index += 1;
      continue;
    }

    if (token.startsWith('--progress-every=')) {
      args.progressEvery = Number(token.split('=')[1] || args.progressEvery);
      continue;
    }
    if (token === '--progress-every') {
      args.progressEvery = Number(argv[index + 1] || args.progressEvery);
      index += 1;
      continue;
    }

    if (token.startsWith('--threads=')) {
      args.threads = Number(token.split('=')[1] || args.threads);
      continue;
    }
    if (token === '--threads') {
      args.threads = Number(argv[index + 1] || args.threads);
      index += 1;
      continue;
    }

    if (token.startsWith('--hash=')) {
      args.hash = Number(token.split('=')[1] || args.hash);
      continue;
    }
    if (token === '--hash') {
      args.hash = Number(argv[index + 1] || args.hash);
      index += 1;
      continue;
    }
  }

  args.games = Math.max(1, Number(args.games) || 1000);
  args.depth = Math.max(1, Number(args.depth) || 1);
  args.maxPly = Math.max(20, Number(args.maxPly) || 260);
  args.progressEvery = Math.max(1, Number(args.progressEvery) || 25);
  args.threads = Math.max(1, Number(args.threads) || 1);
  args.hash = Math.max(1, Number(args.hash) || 16);
  return args;
}

function printHelp() {
  console.log('Stockfish WASM CLI self-play benchmark');
  console.log('');
  console.log('Usage:');
  console.log('  npm run bench:stockfish:wasm -- [--games 1000] [--depth 1] [--max-ply 260] [--threads 1] [--hash 16]');
  console.log('');
  console.log('Defaults:');
  console.log('  --games 1000');
  console.log('  --depth 1');
  console.log('  --max-ply 260');
  console.log('  --threads 1');
  console.log('  --hash 16');
}

function formatDuration(seconds) {
  const safe = Math.max(0, Number(seconds) || 0);
  if (safe < 0.001) {
    return `${Math.max(1, Math.round(safe * 1_000_000))}µs`;
  }
  if (safe < 1) {
    return `${(safe * 1000).toFixed(2)}ms`;
  }
  return `${safe.toFixed(2)}s`;
}

function formatNumber(value, fractionDigits = 1) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(Number.isFinite(value) ? value : 0);
}

function resultFromChess(chess) {
  if (!chess) {
    return '*';
  }
  if (chess.isCheckmate()) {
    return chess.turn() === 'w' ? '0-1' : '1-0';
  }
  if (chess.isDraw()) {
    return '1/2-1/2';
  }
  return '*';
}

function createEngineProtocol(engine) {
  const waitForLine = (predicate, timeoutMs = 20000) =>
    new Promise((resolve, reject) => {
      const listener = (raw) => {
        const lines = String(raw ?? '')
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean);

        for (const line of lines) {
          if (predicate(line)) {
            cleanup();
            resolve(line);
            return;
          }
        }
      };

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Stockfish WASM response timeout'));
      }, timeoutMs);

      const cleanup = () => {
        clearTimeout(timer);
        engine.removeMessageListener(listener);
      };

      engine.addMessageListener(listener);
    });

  const postAndWait = async (command, predicate, timeoutMs = 20000) => {
    const wait = waitForLine(predicate, timeoutMs);
    engine.postMessage(command);
    return wait;
  };

  const init = async ({ threads = 1, hash = 16 } = {}) => {
    await postAndWait('uci', (line) => line === 'uciok');
    engine.postMessage(`setoption name Threads value ${Math.max(1, Number(threads) || 1)}`);
    engine.postMessage(`setoption name Hash value ${Math.max(1, Number(hash) || 16)}`);
    await postAndWait('isready', (line) => line === 'readyok');
  };

  const getBestMove = async ({ uciMoves, depth }) => {
    const safeMoves = Array.isArray(uciMoves) ? uciMoves : [];
    engine.postMessage(`position startpos moves ${safeMoves.join(' ')}`.trim());
    const line = await postAndWait(`go depth ${Math.max(1, Number(depth) || 1)}`, (text) =>
      text.startsWith('bestmove '),
    );
    return String(line.split(/\s+/)[1] || '').trim().toLowerCase();
  };

  return { init, getBestMove };
}

async function createWasmEngine() {
  if (typeof StockfishFactory !== 'function') {
    throw new Error('stockfish.wasm module unavailable');
  }
  const wasmPath = require.resolve('stockfish.wasm/stockfish.wasm');
  const wasmBinary = await fs.readFile(wasmPath);
  return StockfishFactory({ wasmBinary });
}

async function runSingleGame({ protocol, depth, maxPly }) {
  const chess = new Chess();
  const uciMoves = [];

  while (!chess.isGameOver() && uciMoves.length < maxPly) {
    const bestMove = await protocol.getBestMove({ uciMoves, depth });
    const match = bestMove.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/i);
    if (!match) {
      break;
    }
    const [, from, to, promotion] = match;
    const played = chess.move({ from, to, promotion: promotion?.toLowerCase() });
    if (!played) {
      break;
    }
    uciMoves.push(`${from}${to}${promotion ?? ''}`.toLowerCase());
  }

  return {
    result: resultFromChess(chess),
    plies: uciMoves.length,
    reachedTerminal: chess.isGameOver(),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const startedAt = performance.now();
  const engine = await createWasmEngine();
  const protocol = createEngineProtocol(engine);

  try {
    await protocol.init({ threads: args.threads, hash: args.hash });

    let whiteWins = 0;
    let blackWins = 0;
    let draws = 0;
    let unfinished = 0;
    let totalPlies = 0;
    let minPlies = Number.POSITIVE_INFINITY;
    let maxPlies = 0;

    const runStartedAt = performance.now();

    for (let game = 1; game <= args.games; game += 1) {
      const played = await runSingleGame({
        protocol,
        depth: args.depth,
        maxPly: args.maxPly,
      });

      totalPlies += played.plies;
      minPlies = Math.min(minPlies, played.plies);
      maxPlies = Math.max(maxPlies, played.plies);

      if (played.result === '1-0') {
        whiteWins += 1;
      } else if (played.result === '0-1') {
        blackWins += 1;
      } else if (played.result === '1/2-1/2') {
        draws += 1;
      } else {
        unfinished += 1;
      }

      if (game % args.progressEvery === 0 || game === args.games) {
        const elapsed = (performance.now() - runStartedAt) / 1000;
        const mps = elapsed > 0 ? totalPlies / elapsed : 0;
        console.log(
          `[${game}/${args.games}] moves=${totalPlies} mps=${formatNumber(mps)} white=${whiteWins} black=${blackWins} draw=${draws} unfinished=${unfinished}`,
        );
      }
    }

    const runSeconds = (performance.now() - runStartedAt) / 1000;
    const totalSeconds = (performance.now() - startedAt) / 1000;
    const avgPlies = args.games > 0 ? totalPlies / args.games : 0;
    const minSafe = Number.isFinite(minPlies) ? minPlies : 0;

    console.log('');
    console.log('Stockfish WASM CLI benchmark complete');
    console.log(`Games: ${args.games}`);
    console.log(`Depth: ${args.depth}`);
    console.log(`Threads: ${args.threads}`);
    console.log(`Hash MB: ${args.hash}`);
    console.log(`Total plies: ${totalPlies}`);
    console.log(`Moves/sec: ${formatNumber(totalPlies / Math.max(runSeconds, 1e-9))}`);
    console.log(`Avg plies/game: ${formatNumber(avgPlies)}`);
    console.log(`Min plies/game: ${minSafe}`);
    console.log(`Max plies/game: ${maxPlies}`);
    console.log(`White wins: ${whiteWins}`);
    console.log(`Black wins: ${blackWins}`);
    console.log(`Draws: ${draws}`);
    console.log(`Unfinished: ${unfinished}`);
    console.log(`Engine run time: ${formatDuration(runSeconds)}`);
    console.log(`Total CLI time: ${formatDuration(totalSeconds)}`);
  } catch (error) {
    const hint =
      'If initialization fails on older Node versions, try running with --experimental-wasm-threads and --experimental-wasm-bulk-memory.';
    throw new Error(`${error?.message ?? 'unknown error'}\n${hint}`);
  } finally {
    if (engine && typeof engine.terminate === 'function') {
      engine.terminate();
    }
  }
}

main().catch((error) => {
  console.error(`bench:stockfish:wasm failed: ${error.message}`);
  process.exit(1);
});
