import initWasm from './wasm_pkg/wasm_core.js';
import { createGameDb } from './db.js';
import { GrafeoAdapter } from './graph.js';
import { createReplayer } from './replay.js';
import './styles.css';
import { MuonVecAdapter } from './vector.js';

function formatElapsedMs(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
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
  const moveRange = document.querySelector('#moveRange');
  const loadProgress = document.querySelector('#loadProgress');
  const loadProgressText = document.querySelector('#loadProgressText');

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
  });

  const vectorAdapter = new MuonVecAdapter();
  vectorAdapter.upsertGames(games);

  const graphAdapter = new GrafeoAdapter();
  await graphAdapter.init();
  await graphAdapter.indexGames(games.slice(0, 20));

  const loadReplay = () => {
    const gameId = Number(gameSelect.value || 0);
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

  gameSelect.addEventListener('change', loadReplay);
  speedRange.addEventListener('input', (event) => replayer.setSpeed(event.target.value));
  playBtn.addEventListener('click', () => replayer.play());
  pauseBtn.addEventListener('click', () => replayer.pause());
  resetBtn.addEventListener('click', () => replayer.reset());
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
