import initWasm from './wasm_pkg/wasm_core.js';
import { createGameDb } from './db.js';
import { GrafeoAdapter } from './graph.js';
import { createReplayer } from './replay.js';
import './styles.css';
import { MuonVecAdapter } from './vector.js';

const INITIAL_COUNTS = {
  P: 8,
  N: 2,
  B: 2,
  R: 2,
  Q: 1,
  p: 8,
  n: 2,
  b: 2,
  r: 2,
  q: 1,
};

const CAPTURE_ORDER_WHITE = ['p', 'n', 'b', 'r', 'q'];
const CAPTURE_ORDER_BLACK = ['P', 'N', 'B', 'R', 'Q'];
const PIECE_TO_UNICODE = {
  P: '♙',
  N: '♘',
  B: '♗',
  R: '♖',
  Q: '♕',
  K: '♔',
  p: '♟',
  n: '♞',
  b: '♝',
  r: '♜',
  q: '♛',
  k: '♚',
};

function formatElapsedMs(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
}

function pieceCountsFromFen(fen) {
  const board = (fen ?? '').split(' ')[0] ?? '';
  const counts = {
    P: 0,
    N: 0,
    B: 0,
    R: 0,
    Q: 0,
    p: 0,
    n: 0,
    b: 0,
    r: 0,
    q: 0,
  };

  for (const ch of board) {
    if (counts[ch] !== undefined) {
      counts[ch] += 1;
    }
  }

  return counts;
}

function capturesToUnicode(counts, order) {
  let out = '';
  for (const piece of order) {
    const missing = Math.max(0, (INITIAL_COUNTS[piece] ?? 0) - (counts[piece] ?? 0));
    for (let index = 0; index < missing; index += 1) {
      out += PIECE_TO_UNICODE[piece] ?? '';
    }
  }
  return out;
}

function resultText(game) {
  if (!game) {
    return '';
  }

  switch (game.result) {
    case '1-0':
      return `${game.white_player} won`;
    case '0-1':
      return `${game.black_player} won`;
    case '1/2-1/2':
      return 'Draw';
    default:
      return `Result: ${game.result ?? '*'}`;
  }
}

function renderPgnViewer(container, moves, moveIndex) {
  if (!container) {
    return;
  }

  container.innerHTML = '';
  const fragment = document.createDocumentFragment();

  for (let index = 0; index < moves.length; index += 1) {
    const span = document.createElement('span');
    span.className = 'pgnMove';
    if (index === moveIndex - 1) {
      span.classList.add('active');
    }

    if (index % 2 === 0) {
      span.textContent = `${Math.floor(index / 2) + 1}. ${moves[index]}`;
    } else {
      span.textContent = moves[index];
    }
    fragment.appendChild(span);
  }

  container.appendChild(fragment);

  const active = container.querySelector('.pgnMove.active');
  if (active) {
    active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}

async function bootstrap() {
  const loadStartedAt = performance.now();
  const statusEl = document.querySelector('#status');
  const boardEl = document.querySelector('#board');
  const gameSelect = document.querySelector('#gameSelect');
  const speedRange = document.querySelector('#speedRange');
  const playBtn = document.querySelector('#playBtn');
  const pauseBtn = document.querySelector('#pauseBtn');
  const resetBtn = document.querySelector('#resetBtn');
  const randomBtn = document.querySelector('#randomBtn');
  const benchmarkBtn = document.querySelector('#benchmarkBtn');
  const moveRange = document.querySelector('#moveRange');
  const loadProgress = document.querySelector('#loadProgress');
  const loadProgressText = document.querySelector('#loadProgressText');
  const benchmarkGames = document.querySelector('#benchmarkGames');
  const benchmarkMps = document.querySelector('#benchmarkMps');
  const benchmarkState = document.querySelector('#benchmarkState');
  const whiteName = document.querySelector('#whiteName');
  const blackName = document.querySelector('#blackName');
  const whiteCaptures = document.querySelector('#whiteCaptures');
  const blackCaptures = document.querySelector('#blackCaptures');
  const resultBanner = document.querySelector('#resultBanner');
  const pgnViewer = document.querySelector('#pgnViewer');

  let activeGame = null;
  let benchmarkRunning = false;

  statusEl.textContent = 'Initializing WASM...';
  await initWasm();

  statusEl.textContent = `Downloading prebuilt SQLite... (${formatElapsedMs(performance.now() - loadStartedAt)})`;
  const db = await createGameDb({
    dbUrl: '/data/anand.sqlite',
    onProgress: (progress) => {
      if (!loadProgress || !loadProgressText) {
        return;
      }

      if (progress.phase === 'download') {
        const totalBytes = Math.max(1, Number(progress.totalBytes ?? 1));
        const loadedBytes = Math.min(totalBytes, Number(progress.loadedBytes ?? 0));
        loadProgress.max = totalBytes;
        loadProgress.value = loadedBytes;
        const pct = Math.round((loadedBytes / totalBytes) * 100);
        const elapsed = formatElapsedMs(performance.now() - loadStartedAt);
        loadProgressText.textContent = `Downloading DB ${pct}% • ${elapsed}`;
        statusEl.textContent = `Downloading prebuilt SQLite... ${pct}% (${elapsed})`;
        return;
      }

      if (progress.phase === 'games') {
        const total = Number(progress.total ?? 0);
        const loaded = Number(progress.loaded ?? 0);
        loadProgress.max = Math.max(1, total);
        loadProgress.value = loaded;
        const elapsed = formatElapsedMs(performance.now() - loadStartedAt);
        loadProgressText.textContent = `Loaded ${loaded} / ${total} games • ${elapsed}`;
        statusEl.textContent = `Loaded ${loaded} / ${total} games (${elapsed})`;
      }
    },
  });

  if (loadProgressText) {
    const elapsed = formatElapsedMs(performance.now() - loadStartedAt);
    loadProgressText.textContent = `${loadProgressText.textContent} (ready in ${elapsed})`;
  }

  const games = db.listGames();
  if (games.length === 0) {
    statusEl.textContent = `No game loaded (loaded 0 games in ${formatElapsedMs(performance.now() - loadStartedAt)})`;
    return;
  }

  for (const game of games) {
    const opt = document.createElement('option');
    opt.value = String(game.id);
    opt.textContent = `${game.white_player} vs ${game.black_player} | ${game.event}`;
    gameSelect.appendChild(opt);
  }

  const replayer = createReplayer({
    boardEl,
    statusEl,
    moveRange,
    getEmptyMessage: () =>
      `No game loaded (startup time ${formatElapsedMs(performance.now() - loadStartedAt)})`,
    onUpdate: ({ moveIndex, totalMoves, fen, moves, isComplete }) => {
      if (activeGame) {
        if (whiteName) {
          whiteName.textContent = `White: ${activeGame.white_player}`;
        }
        if (blackName) {
          blackName.textContent = `Black: ${activeGame.black_player}`;
        }
      }

      const counts = pieceCountsFromFen(fen);
      if (whiteCaptures) {
        const captured = capturesToUnicode(counts, CAPTURE_ORDER_WHITE);
        whiteCaptures.textContent = captured || 'No captures yet';
      }
      if (blackCaptures) {
        const captured = capturesToUnicode(counts, CAPTURE_ORDER_BLACK);
        blackCaptures.textContent = captured || 'No captures yet';
      }

      if (resultBanner) {
        if (isComplete) {
          resultBanner.textContent = `Game finished • ${resultText(activeGame)}`;
        } else {
          resultBanner.textContent = `In progress • Move ${moveIndex}/${totalMoves}`;
        }
      }

      renderPgnViewer(pgnViewer, moves, moveIndex);
    },
  });

  const vectorAdapter = new MuonVecAdapter();
  vectorAdapter.upsertGames(games);

  const graphAdapter = new GrafeoAdapter();
  await graphAdapter.init();
  await graphAdapter.indexGames(games.slice(0, 20));

  const loadReplay = () => {
    const gameId = Number(gameSelect.value || 0);
    activeGame = games[gameId] ?? null;
    const replay = db.getReplay(gameId);
    replayer.loadReplay(replay);
    const similar = vectorAdapter.search(
      `${games[gameId]?.white_player ?? ''} ${games[gameId]?.black_player ?? ''}`,
      3,
    );
    if (similar.length > 0) {
      statusEl.textContent = `${statusEl.textContent} | Similar: ${similar
        .map((s) => `${s.game.white_player}-${s.game.black_player}`)
        .join(', ')}`;
    }
  };

  const setBenchmarkStats = ({ completed, total, totalMoves, elapsedSec, state }) => {
    if (benchmarkGames) {
      benchmarkGames.textContent = `Games: ${completed} / ${total}`;
    }
    if (benchmarkMps) {
      const mps = elapsedSec > 0 ? totalMoves / elapsedSec : 0;
      benchmarkMps.textContent = `Moves/s: ${mps.toFixed(1)}`;
    }
    if (benchmarkState) {
      benchmarkState.textContent = state;
    }
  };

  const runBenchmark = async () => {
    if (benchmarkRunning || games.length === 0) {
      return;
    }

    benchmarkRunning = true;
    const startedAt = performance.now();
    let completed = 0;
    let totalMoves = 0;
    let invalidGames = 0;

    if (benchmarkBtn) {
      benchmarkBtn.disabled = true;
      benchmarkBtn.textContent = 'Benchmark Running...';
    }

    setBenchmarkStats({
      completed,
      total: games.length,
      totalMoves,
      elapsedSec: 0,
      state: 'Running',
    });

    try {
      for (let gameId = 0; gameId < games.length; gameId += 1) {
        try {
          const replay = db.getReplay(gameId);
          const moves = replay.moves ?? [];
          if (!Array.isArray(moves)) {
            throw new Error(`Replay moves missing for game ${gameId}`);
          }

          for (let index = 0; index < moves.length; index += 1) {
            totalMoves += 1;
          }
        } catch {
          invalidGames += 1;
        }

        completed += 1;
        if (completed % 50 === 0 || completed === games.length) {
          const elapsedSec = (performance.now() - startedAt) / 1000;
          setBenchmarkStats({
            completed,
            total: games.length,
            totalMoves,
            elapsedSec,
            state: 'Running',
          });
          await new Promise((resolve) => requestAnimationFrame(resolve));
        }
      }

      const elapsedSec = (performance.now() - startedAt) / 1000;
      setBenchmarkStats({
        completed,
        total: games.length,
        totalMoves,
        elapsedSec,
        state: `Completed in ${elapsedSec.toFixed(2)}s${
          invalidGames > 0 ? ` (invalid games: ${invalidGames})` : ''
        }`,
      });
    } finally {
      benchmarkRunning = false;
      if (benchmarkBtn) {
        benchmarkBtn.disabled = false;
        benchmarkBtn.textContent = 'Run Benchmark';
      }
    }
  };

  gameSelect.addEventListener('change', loadReplay);
  speedRange.addEventListener('input', (event) => replayer.setSpeed(event.target.value));
  playBtn.addEventListener('click', () => replayer.play());
  pauseBtn.addEventListener('click', () => replayer.pause());
  resetBtn.addEventListener('click', () => replayer.reset());
  benchmarkBtn?.addEventListener('click', () => {
    runBenchmark();
  });
  randomBtn?.addEventListener('click', () => {
    if (games.length === 0) {
      return;
    }

    const current = Number(gameSelect.value || 0);
    let next = Math.floor(Math.random() * games.length);
    if (games.length > 1 && next === current) {
      next = (next + 1) % games.length;
    }

    gameSelect.value = String(next);
    loadReplay();
    replayer.play();
  });
  moveRange.addEventListener('input', (event) => replayer.setMove(event.target.value));

  gameSelect.value = '0';
  loadReplay();
}

bootstrap().catch((error) => {
  const statusEl = document.querySelector('#status');
  if (statusEl) {
    statusEl.textContent = `Startup failed: ${error.message}`;
  }
});
