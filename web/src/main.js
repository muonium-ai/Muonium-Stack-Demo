import initWasm, { game_positions_json, list_games } from './wasm_pkg/wasm_core.js';
import { createGameDb } from './db.js';
import { GrafeoAdapter } from './graph.js';
import { createReplayer } from './replay.js';
import './styles.css';
import { MuonVecAdapter } from './vector.js';

async function loadPgn() {
  const response = await fetch('/chess/games/Anand.pgn');
  if (!response.ok) {
    throw new Error('Unable to load PGN file');
  }
  return response.text();
}

async function bootstrap() {
  const statusEl = document.querySelector('#status');
  const boardEl = document.querySelector('#board');
  const gameSelect = document.querySelector('#gameSelect');
  const speedRange = document.querySelector('#speedRange');
  const playBtn = document.querySelector('#playBtn');
  const pauseBtn = document.querySelector('#pauseBtn');
  const resetBtn = document.querySelector('#resetBtn');
  const moveRange = document.querySelector('#moveRange');

  statusEl.textContent = 'Initializing WASM...';
  await initWasm();

  statusEl.textContent = 'Loading PGN and ingesting SQLite...';
  const pgnText = await loadPgn();
  const db = await createGameDb({
    pgnText,
    listGames: list_games,
    gamePositionsJson: game_positions_json,
  });

  const games = db.listGames();
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
