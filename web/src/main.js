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

function formatEtaSec(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '--';
  }

  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }

  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}s`;
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
  const randomBtn = document.querySelector('#randomBtn');
  const benchmarkFastBtn = document.querySelector('#benchmarkFastBtn');
  const benchmarkBtn = document.querySelector('#benchmarkBtn');
  const benchmarkPauseBtn = document.querySelector('#benchmarkPauseBtn');
  const benchmarkStopBtn = document.querySelector('#benchmarkStopBtn');
  const navStart = document.querySelector('#navStart');
  const navPrev = document.querySelector('#navPrev');
  const navPlay = document.querySelector('#navPlay');
  const navNext = document.querySelector('#navNext');
  const navEnd = document.querySelector('#navEnd');
  const loadProgressText = document.querySelector('#loadProgressText');
  const benchmarkModeLabel = document.querySelector('#benchmarkModeLabel');
  const benchmarkRowRegular = document.querySelector('#benchmarkRowRegular');
  const benchmarkRowVisual = document.querySelector('#benchmarkRowVisual');
  const benchmarkRegularGames = document.querySelector('#benchmarkRegularGames');
  const benchmarkRegularMoves = document.querySelector('#benchmarkRegularMoves');
  const benchmarkRegularMps = document.querySelector('#benchmarkRegularMps');
  const benchmarkRegularEta = document.querySelector('#benchmarkRegularEta');
  const benchmarkRegularState = document.querySelector('#benchmarkRegularState');
  const benchmarkVisualGames = document.querySelector('#benchmarkVisualGames');
  const benchmarkVisualMoves = document.querySelector('#benchmarkVisualMoves');
  const benchmarkVisualMps = document.querySelector('#benchmarkVisualMps');
  const benchmarkVisualEta = document.querySelector('#benchmarkVisualEta');
  const benchmarkVisualState = document.querySelector('#benchmarkVisualState');
  const whiteName = document.querySelector('#whiteName');
  const blackName = document.querySelector('#blackName');
  const whiteCaptures = document.querySelector('#whiteCaptures');
  const blackCaptures = document.querySelector('#blackCaptures');
  const resultBanner = document.querySelector('#resultBanner');
  const pgnViewer = document.querySelector('#pgnViewer');

  let activeGame = null;
  let benchmarkRunning = false;
  let benchmarkPaused = false;
  let benchmarkStopRequested = false;
  let benchmarkPauseStartedAt = 0;
  let benchmarkPausedTotalMs = 0;
  let benchmarkMode = 'idle';

  statusEl.textContent = 'Initializing WASM...';
  await initWasm();

  statusEl.textContent = `Downloading prebuilt SQLite... (${formatElapsedMs(performance.now() - loadStartedAt)})`;
  const db = await createGameDb({
    dbUrl: '/data/anand.sqlite',
    onProgress: (progress) => {
      if (!loadProgressText) {
        return;
      }

      if (progress.phase === 'download') {
        const totalBytes = Math.max(1, Number(progress.totalBytes ?? 1));
        const loadedBytes = Math.min(totalBytes, Number(progress.loadedBytes ?? 0));
        const pct = Math.round((loadedBytes / totalBytes) * 100);
        const elapsed = formatElapsedMs(performance.now() - loadStartedAt);
        loadProgressText.textContent = `Downloading DB ${pct}% • ${elapsed}`;
        statusEl.textContent = `Downloading prebuilt SQLite... ${pct}% (${elapsed})`;
        return;
      }

      if (progress.phase === 'games') {
        const total = Number(progress.total ?? 0);
        const loaded = Number(progress.loaded ?? 0);
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
    getEmptyMessage: () =>
      `No game loaded (startup time ${formatElapsedMs(performance.now() - loadStartedAt)})`,
    onPlayState: (playing) => {
      if (navPlay) {
        navPlay.textContent = playing ? '⏸' : '▶';
      }
    },
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

  const setReplayControlsDisabled = (disabled) => {
    if (gameSelect) {
      gameSelect.disabled = disabled;
    }
    if (randomBtn) {
      randomBtn.disabled = disabled;
    }
    if (navStart) {
      navStart.disabled = disabled;
    }
    if (navPrev) {
      navPrev.disabled = disabled;
    }
    if (navPlay) {
      navPlay.disabled = disabled;
    }
    if (navNext) {
      navNext.disabled = disabled;
    }
    if (navEnd) {
      navEnd.disabled = disabled;
    }
  };

  const setBenchmarkButtons = ({ runningMode }) => {
    const isRunning = runningMode !== 'idle';
    const isVisual = runningMode === 'visual';

    if (benchmarkFastBtn) {
      benchmarkFastBtn.disabled = isRunning;
      benchmarkFastBtn.textContent = 'Run Benchmark';
    }
    if (benchmarkBtn) {
      benchmarkBtn.disabled = isRunning;
      benchmarkBtn.textContent = 'Run Visual Benchmark';
    }
    if (benchmarkPauseBtn) {
      benchmarkPauseBtn.disabled = !isVisual;
      benchmarkPauseBtn.textContent = 'Pause';
    }
    if (benchmarkStopBtn) {
      benchmarkStopBtn.disabled = !isVisual;
    }

    if (benchmarkRowRegular) {
      benchmarkRowRegular.classList.toggle('isActive', runningMode === 'regular');
    }
    if (benchmarkRowVisual) {
      benchmarkRowVisual.classList.toggle('isActive', runningMode === 'visual');
    }
  };

  const setBenchmarkModeLabel = (modeText) => {
    if (benchmarkModeLabel) {
      benchmarkModeLabel.textContent = `Mode: ${modeText}`;
    }
  };

  const benchmarkRows = {
    regular: {
      games: benchmarkRegularGames,
      moves: benchmarkRegularMoves,
      mps: benchmarkRegularMps,
      eta: benchmarkRegularEta,
      state: benchmarkRegularState,
    },
    visual: {
      games: benchmarkVisualGames,
      moves: benchmarkVisualMoves,
      mps: benchmarkVisualMps,
      eta: benchmarkVisualEta,
      state: benchmarkVisualState,
    },
  };

  const setBenchmarkStats = (mode, {
    completed,
    total,
    totalMoves,
    elapsedSec,
    state,
    moveTarget = 0,
    etaSec = null,
  }) => {
    const row = benchmarkRows[mode];
    if (!row) {
      return;
    }

    if (row.games) {
      row.games.textContent = `Games: ${completed} / ${total}`;
    }
    if (row.moves) {
      row.moves.textContent = `Moves: ${totalMoves} / ${moveTarget}`;
    }
    if (row.mps) {
      const mps = elapsedSec > 0 ? totalMoves / elapsedSec : 0;
      row.mps.textContent = `Moves/s: ${mps.toFixed(1)}`;
    }
    if (row.eta) {
      row.eta.textContent = `ETA: ${formatEtaSec(etaSec ?? -1)}`;
    }
    if (row.state) {
      row.state.textContent = state;
    }
  };

  const raf = () => new Promise((resolve) => requestAnimationFrame(resolve));

  const runRegularBenchmark = async () => {
    if (benchmarkRunning || games.length === 0) {
      return;
    }

    benchmarkRunning = true;
    benchmarkMode = 'regular';
    let completed = 0;
    let totalMoves = 0;
    let invalidGames = 0;
    const startedAt = performance.now();

    setBenchmarkButtons({ runningMode: benchmarkMode });
    setBenchmarkModeLabel('Regular');

    setBenchmarkStats('regular', {
      completed,
      total: games.length,
      totalMoves,
      moveTarget: 0,
      elapsedSec: 0,
      state: 'Running (regular)',
      etaSec: null,
    });

    try {
      for (let gameId = 0; gameId < games.length; gameId += 1) {
        try {
          const replay = db.getReplay(gameId);
          const moves = replay.moves ?? [];
          if (!Array.isArray(moves)) {
            throw new Error(`Replay moves missing for game ${gameId}`);
          }

          totalMoves += moves.length;
        } catch {
          invalidGames += 1;
        }

        completed += 1;
        if (completed % 50 === 0 || completed === games.length) {
          const elapsedSec = Math.max(0, (performance.now() - startedAt) / 1000);
          setBenchmarkStats('regular', {
            completed,
            total: games.length,
            totalMoves,
            moveTarget: totalMoves,
            elapsedSec,
            state: 'Running (regular)',
            etaSec: null,
          });
          await raf();
        }
      }

      const elapsedSec = Math.max(0, (performance.now() - startedAt) / 1000);
      setBenchmarkStats('regular', {
        completed,
        total: games.length,
        totalMoves,
        moveTarget: totalMoves,
        elapsedSec,
        state: `Completed regular in ${elapsedSec.toFixed(2)}s${
          invalidGames > 0 ? ` (invalid games: ${invalidGames})` : ''
        }`,
        etaSec: 0,
      });
    } finally {
      benchmarkRunning = false;
      benchmarkMode = 'idle';
      setBenchmarkButtons({ runningMode: benchmarkMode });
      setBenchmarkModeLabel('Idle');
    }
  };

  const runVisualBenchmark = async () => {
    if (benchmarkRunning || games.length === 0) {
      return;
    }

    benchmarkRunning = true;
    benchmarkMode = 'visual';
    benchmarkPaused = false;
    benchmarkStopRequested = false;
    benchmarkPauseStartedAt = 0;
    benchmarkPausedTotalMs = 0;
    const startedAt = performance.now();
    let completed = 0;
    let totalMoves = 0;
    let invalidGames = 0;
    let moveTarget = 0;

    const elapsedSecNow = () => {
      const now = performance.now();
      const activePauseMs = benchmarkPaused ? now - benchmarkPauseStartedAt : 0;
      return Math.max(0, (now - startedAt - benchmarkPausedTotalMs - activePauseMs) / 1000);
    };

    for (let gameId = 0; gameId < games.length; gameId += 1) {
      try {
        const replay = db.getReplay(gameId);
        const moves = replay.moves ?? [];
        if (Array.isArray(moves)) {
          moveTarget += moves.length;
        }
      } catch {
        // ignore here; counted in main loop
      }
    }

    setBenchmarkButtons({ runningMode: benchmarkMode });
    setBenchmarkModeLabel('Visual');
    if (benchmarkPauseBtn) {
      benchmarkPauseBtn.disabled = false;
    }
    if (benchmarkStopBtn) {
      benchmarkStopBtn.disabled = false;
    }

    setReplayControlsDisabled(true);
    replayer.pause();

    setBenchmarkStats('visual', {
      completed,
      total: games.length,
      totalMoves,
      moveTarget,
      elapsedSec: 0,
      state: 'Running (visual)',
      etaSec: null,
    });

    try {
      for (let gameId = 0; gameId < games.length; gameId += 1) {
        if (benchmarkStopRequested) {
          break;
        }

        while (benchmarkPaused && !benchmarkStopRequested) {
          const elapsedSec = elapsedSecNow();
          const mps = elapsedSec > 0 ? totalMoves / elapsedSec : 0;
          const etaSec = mps > 0 ? Math.max(0, (moveTarget - totalMoves) / mps) : null;
          setBenchmarkStats('visual', {
            completed,
            total: games.length,
            totalMoves,
            moveTarget,
            elapsedSec,
            state: 'Paused',
            etaSec,
          });
          await new Promise((resolve) => setTimeout(resolve, 50));
        }

        if (benchmarkStopRequested) {
          break;
        }

        try {
          const replay = db.getReplay(gameId);
          const moves = replay.moves ?? [];
          if (!Array.isArray(moves)) {
            throw new Error(`Replay moves missing for game ${gameId}`);
          }

          gameSelect.value = String(gameId);
          activeGame = games[gameId] ?? null;
          replayer.loadReplay(replay);
          await raf();

          for (let index = 1; index <= moves.length; index += 1) {
            if (benchmarkStopRequested) {
              break;
            }

            while (benchmarkPaused && !benchmarkStopRequested) {
              const elapsedSec = elapsedSecNow();
              const mps = elapsedSec > 0 ? totalMoves / elapsedSec : 0;
              const etaSec = mps > 0 ? Math.max(0, (moveTarget - totalMoves) / mps) : null;
              setBenchmarkStats('visual', {
                completed,
                total: games.length,
                totalMoves,
                moveTarget,
                elapsedSec,
                state: 'Paused',
                etaSec,
              });
              await new Promise((resolve) => setTimeout(resolve, 50));
            }

            if (benchmarkStopRequested) {
              break;
            }

            replayer.setMove(index);
            totalMoves += 1;

            if (index % 2 === 0 || index === moves.length) {
              const elapsedSec = elapsedSecNow();
              const mps = elapsedSec > 0 ? totalMoves / elapsedSec : 0;
              const etaSec = mps > 0 ? Math.max(0, (moveTarget - totalMoves) / mps) : null;
              setBenchmarkStats('visual', {
                completed,
                total: games.length,
                totalMoves,
                moveTarget,
                elapsedSec,
                state: 'Running (visual)',
                etaSec,
              });
              await raf();
            }
          }
        } catch {
          invalidGames += 1;
        }

        completed += 1;
        const elapsedSec = elapsedSecNow();
        const mps = elapsedSec > 0 ? totalMoves / elapsedSec : 0;
        const etaSec = mps > 0 ? Math.max(0, (moveTarget - totalMoves) / mps) : null;
        setBenchmarkStats('visual', {
          completed,
          total: games.length,
          totalMoves,
          moveTarget,
          elapsedSec,
          state: benchmarkStopRequested ? 'Stopping...' : 'Running (visual)',
          etaSec,
        });
        await raf();
      }

      const elapsedSec = elapsedSecNow();
      const mps = elapsedSec > 0 ? totalMoves / elapsedSec : 0;
      const etaSec = mps > 0 ? Math.max(0, (moveTarget - totalMoves) / mps) : 0;
      if (benchmarkStopRequested) {
        setBenchmarkStats('visual', {
          completed,
          total: games.length,
          totalMoves,
          moveTarget,
          elapsedSec,
          state: `Stopped at ${completed}/${games.length} in ${elapsedSec.toFixed(2)}s${
            invalidGames > 0 ? ` (invalid games: ${invalidGames})` : ''
          }`,
          etaSec,
        });
      } else {
        setBenchmarkStats('visual', {
          completed,
          total: games.length,
          totalMoves,
          moveTarget,
          elapsedSec,
          state: `Completed in ${elapsedSec.toFixed(2)}s${
            invalidGames > 0 ? ` (invalid games: ${invalidGames})` : ''
          }`,
          etaSec,
        });
      }
    } finally {
      benchmarkRunning = false;
      benchmarkMode = 'idle';
      benchmarkPaused = false;
      benchmarkStopRequested = false;
      setBenchmarkButtons({ runningMode: benchmarkMode });
      setBenchmarkModeLabel('Idle');
      setReplayControlsDisabled(false);
    }
  };

  gameSelect.addEventListener('change', loadReplay);
  navStart?.addEventListener('click', () => replayer.start());
  navPrev?.addEventListener('click', () => replayer.prev());
  navPlay?.addEventListener('click', () => replayer.togglePlay());
  navNext?.addEventListener('click', () => replayer.next());
  navEnd?.addEventListener('click', () => replayer.end());
  benchmarkFastBtn?.addEventListener('click', async () => {
    await runRegularBenchmark();
  });
  benchmarkBtn?.addEventListener('click', async () => {
    if (benchmarkRunning || games.length === 0) {
      return;
    }

    await runRegularBenchmark();
    await runVisualBenchmark();
  });
  benchmarkPauseBtn?.addEventListener('click', () => {
    if (!benchmarkRunning || benchmarkMode !== 'visual') {
      return;
    }

    if (!benchmarkPaused) {
      benchmarkPaused = true;
      benchmarkPauseStartedAt = performance.now();
      benchmarkPauseBtn.textContent = 'Resume';
    } else {
      benchmarkPaused = false;
      benchmarkPausedTotalMs += Math.max(0, performance.now() - benchmarkPauseStartedAt);
      benchmarkPauseStartedAt = 0;
      benchmarkPauseBtn.textContent = 'Pause';
    }
  });
  benchmarkStopBtn?.addEventListener('click', () => {
    if (!benchmarkRunning || benchmarkMode !== 'visual') {
      return;
    }
    benchmarkStopRequested = true;
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

  gameSelect.value = '0';
  loadReplay();
}

bootstrap().catch((error) => {
  const statusEl = document.querySelector('#status');
  if (statusEl) {
    statusEl.textContent = `Startup failed: ${error.message}`;
  }
});
