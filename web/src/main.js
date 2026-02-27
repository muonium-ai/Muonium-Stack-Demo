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
const DEFAULT_MOVE_ARROW_DURATION_MS = 120;
const VISUAL_BENCHMARK_ARROW_DURATION_MS = 5;
const VISUAL_BENCHMARK_MOVE_UPDATE_INTERVAL = 16;
const VISUAL_BENCHMARK_GAME_UPDATE_INTERVAL = 8;
const VISUAL_BENCHMARK_PGN_UPDATE_INTERVAL = 16;
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

function formatBenchmarkDuration(elapsedSec) {
  const safeSeconds = Math.max(0, Number(elapsedSec) || 0);

  if (safeSeconds < 0.001) {
    const microseconds = Math.max(1, Math.round(safeSeconds * 1_000_000));
    return `${microseconds}µs`;
  }

  if (safeSeconds < 1) {
    return `${(safeSeconds * 1000).toFixed(2)}ms`;
  }

  return `${safeSeconds.toFixed(2)}s`;
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

function extractYearFromGame(game) {
  const eventText = String(game?.event ?? '');
  const match = eventText.match(/\b(18|19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
}

function precomputeSearchTable(games) {
  const rows = games.map((game) => {
    const year = extractYearFromGame(game);
    const text = [
      game.id,
      game.event,
      game.white_player,
      game.black_player,
      game.result,
      year ?? 'unknown',
    ]
      .join(' ')
      .toLowerCase();

    return {
      id: Number(game.id),
      event: game.event ?? '?',
      white: game.white_player ?? '?',
      black: game.black_player ?? '?',
      year,
      text,
    };
  });

  const whites = Array.from(new Set(rows.map((row) => row.white))).sort((a, b) =>
    a.localeCompare(b),
  );
  const blacks = Array.from(new Set(rows.map((row) => row.black))).sort((a, b) =>
    a.localeCompare(b),
  );
  const years = Array.from(new Set(rows.map((row) => row.year).filter((year) => year !== null))).sort(
    (a, b) => b - a,
  );

  return { rows, whites, blacks, years };
}

function setSelectOptions(selectEl, options, includeAny = true) {
  if (!selectEl) {
    return;
  }

  const previousValue = selectEl.value;
  selectEl.innerHTML = '';

  if (includeAny) {
    const anyOption = document.createElement('option');
    anyOption.value = '';
    anyOption.textContent = 'Any';
    selectEl.appendChild(anyOption);
  }

  for (const optionText of options) {
    const option = document.createElement('option');
    option.value = String(optionText);
    option.textContent = String(optionText);
    selectEl.appendChild(option);
  }

  if (previousValue && Array.from(selectEl.options).some((opt) => opt.value === previousValue)) {
    selectEl.value = previousValue;
  }
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

function renderPgnViewer(container, moves, moveIndex, state, options = {}) {
  if (!container) {
    return;
  }

  const forceFull = Boolean(options.forceFull);
  const shouldRebuild = forceFull || state.movesRef !== moves || state.moveCount !== moves.length;

  if (shouldRebuild) {
    state.movesRef = moves;
    state.moveCount = moves.length;
    state.activeMoveIndex = -1;
    state.spans = [];

    container.innerHTML = '';
    const fragment = document.createDocumentFragment();

    for (let index = 0; index < moves.length; index += 1) {
      const span = document.createElement('span');
      span.className = 'pgnMove';
      if (index % 2 === 0) {
        span.textContent = `${Math.floor(index / 2) + 1}. ${moves[index]}`;
      } else {
        span.textContent = moves[index];
      }
      fragment.appendChild(span);
      state.spans.push(span);
    }

    container.appendChild(fragment);
  }

  const nextActiveIndex = moveIndex - 1;
  if (state.activeMoveIndex >= 0 && state.activeMoveIndex < state.spans.length) {
    state.spans[state.activeMoveIndex].classList.remove('active');
  }
  if (nextActiveIndex >= 0 && nextActiveIndex < state.spans.length) {
    state.spans[nextActiveIndex].classList.add('active');
  }
  state.activeMoveIndex = nextActiveIndex;

  if (options.scrollActive !== false && nextActiveIndex >= 0 && nextActiveIndex < state.spans.length) {
    state.spans[nextActiveIndex].scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
}

async function bootstrap() {
  const loadStartedAt = performance.now();
  const statusEl = document.querySelector('#status');
  const boardEl = document.querySelector('#board');
  const gameSelect = document.querySelector('#gameSelect');
  const moveArrowToggle = document.querySelector('#moveArrowToggle');
  const searchModalOpen = document.querySelector('#searchModalOpen');
  const searchModal = document.querySelector('#searchModal');
  const searchModalClose = document.querySelector('#searchModalClose');
  const searchTabFilters = document.querySelector('#searchTabFilters');
  const searchTabCounts = document.querySelector('#searchTabCounts');
  const searchTabPanelFilters = document.querySelector('#searchTabPanelFilters');
  const searchTabPanelCounts = document.querySelector('#searchTabPanelCounts');
  const searchWhite = document.querySelector('#searchWhite');
  const searchBlack = document.querySelector('#searchBlack');
  const searchYear = document.querySelector('#searchYear');
  const searchText = document.querySelector('#searchText');
  const searchGameId = document.querySelector('#searchGameId');
  const searchResults = document.querySelector('#searchResults');
  const searchResultMeta = document.querySelector('#searchResultMeta');
  const searchOpenSelectedBtn = document.querySelector('#searchOpenSelectedBtn');
  const searchOpenPlaySelectedBtn = document.querySelector('#searchOpenPlaySelectedBtn');
  const searchOpenByIdBtn = document.querySelector('#searchOpenByIdBtn');
  const searchOpenPlayByIdBtn = document.querySelector('#searchOpenPlayByIdBtn');
  const searchCountGroup = document.querySelector('#searchCountGroup');
  const searchCountPageSize = document.querySelector('#searchCountPageSize');
  const searchCountMeta = document.querySelector('#searchCountMeta');
  const searchCountResults = document.querySelector('#searchCountResults');
  const searchCountPrevBtn = document.querySelector('#searchCountPrevBtn');
  const searchCountNextBtn = document.querySelector('#searchCountNextBtn');
  const searchCountPageInfo = document.querySelector('#searchCountPageInfo');
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
  const benchmarkVisualArrowLatency = document.querySelector('#benchmarkVisualArrowLatency');
  const benchmarkVisualState = document.querySelector('#benchmarkVisualState');
  const whiteName = document.querySelector('#whiteName');
  const blackName = document.querySelector('#blackName');
  const whiteCaptures = document.querySelector('#whiteCaptures');
  const blackCaptures = document.querySelector('#blackCaptures');
  const resultBanner = document.querySelector('#resultBanner');
  const pgnViewer = document.querySelector('#pgnViewer');
  const pgnState = {
    movesRef: null,
    moveCount: 0,
    activeMoveIndex: -1,
    spans: [],
  };

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

  const gamesById = new Map(games.map((game) => [Number(game.id), game]));
  const searchTable = precomputeSearchTable(games);
  let searchMatchedRows = searchTable.rows;
  let searchCountPage = 0;
  let activeSearchTab = 'filters';

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

      const shouldRenderPgn =
        benchmarkMode !== 'visual' ||
        isComplete ||
        moveIndex === 0 ||
        moveIndex % VISUAL_BENCHMARK_PGN_UPDATE_INTERVAL === 0;
      if (shouldRenderPgn) {
        renderPgnViewer(pgnViewer, moves, moveIndex, pgnState, {
          forceFull: moveIndex === 0,
          scrollActive: benchmarkMode !== 'visual',
        });
      }
    },
  });

  replayer.setMoveArrowDuration(DEFAULT_MOVE_ARROW_DURATION_MS);
  replayer.setMoveArrowEnabled(Boolean(moveArrowToggle?.checked ?? true));

  moveArrowToggle?.addEventListener('change', () => {
    replayer.setMoveArrowEnabled(Boolean(moveArrowToggle.checked));
    if (benchmarkMode !== 'visual') {
      replayer.setMoveArrowDuration(DEFAULT_MOVE_ARROW_DURATION_MS);
    }
  });

  const vectorAdapter = new MuonVecAdapter();
  vectorAdapter.upsertGames(games);

  const graphAdapter = new GrafeoAdapter();
  await graphAdapter.init();
  await graphAdapter.indexGames(games.slice(0, 20));

  const loadReplay = () => {
    const gameId = Number(gameSelect.value || games[0]?.id || 0);
    const game = gamesById.get(gameId);
    if (!game) {
      return false;
    }

    activeGame = game;
    const replay = db.getReplay(gameId);
    replayer.loadReplay(replay);

    const similar = vectorAdapter.search(
      `${game.white_player ?? ''} ${game.black_player ?? ''}`,
      3,
    );
    if (similar.length > 0) {
      statusEl.textContent = `${statusEl.textContent} | Similar: ${similar
        .map((s) => `${s.game.white_player}-${s.game.black_player}`)
        .join(', ')}`;
    }

    return true;
  };

  const openGameById = (rawId, { autoPlay = false } = {}) => {
    const gameId = Number(rawId);
    if (!Number.isInteger(gameId)) {
      return false;
    }

    if (!gamesById.has(gameId)) {
      statusEl.textContent = `Game id ${gameId} not found`;
      return false;
    }

    gameSelect.value = String(gameId);
    const opened = loadReplay();
    if (opened && autoPlay) {
      replayer.play();
    }
    return opened;
  };

  const setSearchTab = (tab) => {
    activeSearchTab = tab === 'counts' ? 'counts' : 'filters';
    const isFilters = activeSearchTab === 'filters';

    searchTabFilters?.classList.toggle('isActive', isFilters);
    searchTabCounts?.classList.toggle('isActive', !isFilters);
    searchTabPanelFilters?.classList.toggle('hidden', !isFilters);
    searchTabPanelCounts?.classList.toggle('hidden', isFilters);
  };

  const buildSearchCountRows = () => {
    const groupBy = searchCountGroup?.value ?? 'players';

    if (groupBy === 'players') {
      const counts = new Map();

      for (const row of searchMatchedRows) {
        const white = row.white || '?';
        const black = row.black || '?';

        const whiteEntry = counts.get(white) ?? { name: white, total: 0, white: 0, black: 0 };
        whiteEntry.total += 1;
        whiteEntry.white += 1;
        counts.set(white, whiteEntry);

        const blackEntry = counts.get(black) ?? { name: black, total: 0, white: 0, black: 0 };
        blackEntry.total += 1;
        blackEntry.black += 1;
        counts.set(black, blackEntry);
      }

      return Array.from(counts.values()).sort(
        (left, right) => right.total - left.total || left.name.localeCompare(right.name),
      );
    }

    if (groupBy === 'years') {
      const counts = new Map();
      for (const row of searchMatchedRows) {
        const year = row.year ?? 'Unknown';
        counts.set(year, (counts.get(year) ?? 0) + 1);
      }

      return Array.from(counts.entries())
        .map(([year, count]) => ({ year, count }))
        .sort((left, right) => right.count - left.count || String(right.year).localeCompare(String(left.year)));
    }

    const tournamentCounts = new Map();
    for (const row of searchMatchedRows) {
      const tournament = row.event || '?';
      tournamentCounts.set(tournament, (tournamentCounts.get(tournament) ?? 0) + 1);
    }

    return Array.from(tournamentCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
  };

  const renderSearchCounts = ({ resetPage = false } = {}) => {
    if (!searchCountResults || !searchCountMeta || !searchCountPageInfo) {
      return;
    }

    const rows = buildSearchCountRows();
    const pageSize = Math.max(1, Number(searchCountPageSize?.value ?? 10) || 10);
    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));

    if (resetPage) {
      searchCountPage = 0;
    }
    searchCountPage = Math.max(0, Math.min(searchCountPage, totalPages - 1));

    const start = searchCountPage * pageSize;
    const pageRows = rows.slice(start, start + pageSize);

    searchCountResults.innerHTML = '';
    const groupBy = searchCountGroup?.value ?? 'players';

    for (const row of pageRows) {
      const option = document.createElement('option');
      if (groupBy === 'players') {
        option.textContent = `(${row.total}) games • ${row.name} (White: ${row.white}, Black: ${row.black})`;
      } else if (groupBy === 'years') {
        option.textContent = `(${row.count}) games in ${row.year}`;
      } else {
        option.textContent = `(${row.count}) games • ${row.name}`;
      }
      searchCountResults.appendChild(option);
    }

    if (pageRows.length === 0) {
      const option = document.createElement('option');
      option.disabled = true;
      option.textContent = 'No groups found for current filters';
      searchCountResults.appendChild(option);
    }

    const groupLabel = groupBy === 'tournaments' ? 'Tournaments' : groupBy === 'years' ? 'Years' : 'Players';
    searchCountMeta.textContent = `${groupLabel}: ${rows.length} unique • Filtered games: ${searchMatchedRows.length}`;
    searchCountPageInfo.textContent = `Page ${searchCountPage + 1} / ${totalPages}`;

    if (searchCountPrevBtn) {
      searchCountPrevBtn.disabled = searchCountPage <= 0;
    }
    if (searchCountNextBtn) {
      searchCountNextBtn.disabled = searchCountPage >= totalPages - 1;
    }
  };

  const updateSearchResults = () => {
    if (!searchResults || !searchResultMeta) {
      return;
    }

    const selectedWhite = searchWhite?.value ?? '';
    const selectedBlack = searchBlack?.value ?? '';
    const selectedYear = searchYear?.value ?? '';
    const textQuery = String(searchText?.value ?? '')
      .trim()
      .toLowerCase();

    const matched = searchTable.rows.filter((row) => {
      if (selectedWhite && row.white !== selectedWhite) {
        return false;
      }
      if (selectedBlack && row.black !== selectedBlack) {
        return false;
      }
      if (selectedYear && String(row.year ?? '') !== selectedYear) {
        return false;
      }
      if (textQuery && !row.text.includes(textQuery)) {
        return false;
      }
      return true;
    });

    searchMatchedRows = matched;

    searchResultMeta.textContent = `Matches: ${matched.length}`;
    searchResults.innerHTML = '';

    const maxResults = 500;
    for (const row of matched.slice(0, maxResults)) {
      const option = document.createElement('option');
      option.value = String(row.id);
      const yearText = row.year ?? '?';
      option.textContent = `#${row.id} ${row.white} vs ${row.black} (${yearText}) • ${row.event}`;
      searchResults.appendChild(option);
    }

    if (matched.length > maxResults) {
      const option = document.createElement('option');
      option.disabled = true;
      option.textContent = `… showing first ${maxResults} matches`;
      searchResults.appendChild(option);
    }

    renderSearchCounts({ resetPage: true });
  };

  const openSearchModal = () => {
    if (!searchModal) {
      return;
    }

    setSelectOptions(searchWhite, searchTable.whites);
    setSelectOptions(searchBlack, searchTable.blacks);
    setSelectOptions(searchYear, searchTable.years);
    searchCountPage = 0;
    setSearchTab('filters');
    updateSearchResults();
    searchModal.classList.remove('hidden');
    searchModal.setAttribute('aria-hidden', 'false');
  };

  const closeSearchModal = () => {
    if (!searchModal) {
      return;
    }

    searchModal.classList.add('hidden');
    searchModal.setAttribute('aria-hidden', 'true');
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
    if (searchModalOpen) {
      searchModalOpen.disabled = disabled;
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
      arrowLatency: benchmarkVisualArrowLatency,
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
    arrowLatencyMs = null,
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
    if (row.arrowLatency) {
      if (arrowLatencyMs === 0) {
        row.arrowLatency.textContent = 'Arrow latency: Off';
      } else if (Number.isFinite(arrowLatencyMs) && arrowLatencyMs > 0) {
        row.arrowLatency.textContent = `Arrow latency: ${arrowLatencyMs}ms/move`;
      } else {
        row.arrowLatency.textContent = 'Arrow latency: --';
      }
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
    const summary = db.getRegularBenchmarkSummary();
    const totalGames = Number(summary?.totalGames ?? games.length);
    const totalMoveTarget = Number(summary?.totalMoves ?? 0);
    const startedAt = performance.now();

    setBenchmarkButtons({ runningMode: benchmarkMode });
    setBenchmarkModeLabel('Regular');

    setBenchmarkStats('regular', {
      completed,
      total: totalGames,
      totalMoves,
      moveTarget: totalMoveTarget,
      elapsedSec: 0,
      state: 'Running (regular)',
      etaSec: null,
      arrowLatencyMs: null,
    });

    try {
      completed = totalGames;
      totalMoves = totalMoveTarget;
      await raf();

      const elapsedSec = Math.max(0, (performance.now() - startedAt) / 1000);
      setBenchmarkStats('regular', {
        completed,
        total: totalGames,
        totalMoves,
        moveTarget: totalMoveTarget,
        elapsedSec,
        state: `Completed regular in ${formatBenchmarkDuration(elapsedSec)}`,
        etaSec: 0,
        arrowLatencyMs: null,
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

    const arrowEnabledForBenchmark = Boolean(moveArrowToggle?.checked ?? true);
    const activeArrowLatencyMs = arrowEnabledForBenchmark
      ? VISUAL_BENCHMARK_ARROW_DURATION_MS
      : 0;
    replayer.setMoveArrowEnabled(arrowEnabledForBenchmark);
    replayer.setMoveArrowDuration(
      activeArrowLatencyMs,
    );

    setBenchmarkStats('visual', {
      completed,
      total: games.length,
      totalMoves,
      moveTarget,
      elapsedSec: 0,
      state: 'Running (visual)',
      etaSec: null,
      arrowLatencyMs: activeArrowLatencyMs,
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
            arrowLatencyMs: activeArrowLatencyMs,
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
                arrowLatencyMs: activeArrowLatencyMs,
              });
              await new Promise((resolve) => setTimeout(resolve, 50));
            }

            if (benchmarkStopRequested) {
              break;
            }

            await replayer.setMove(index);
            totalMoves += 1;

            if (
              index % VISUAL_BENCHMARK_MOVE_UPDATE_INTERVAL === 0 ||
              index === moves.length
            ) {
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
                arrowLatencyMs: activeArrowLatencyMs,
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
        if (
          completed % VISUAL_BENCHMARK_GAME_UPDATE_INTERVAL === 0 ||
          completed === games.length ||
          benchmarkStopRequested
        ) {
          setBenchmarkStats('visual', {
            completed,
            total: games.length,
            totalMoves,
            moveTarget,
            elapsedSec,
            state: benchmarkStopRequested ? 'Stopping...' : 'Running (visual)',
            etaSec,
            arrowLatencyMs: activeArrowLatencyMs,
          });
          await raf();
        }
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
          state: `Stopped at ${completed}/${games.length} in ${formatBenchmarkDuration(elapsedSec)}${
            invalidGames > 0 ? ` (invalid games: ${invalidGames})` : ''
          }`,
          etaSec,
          arrowLatencyMs: activeArrowLatencyMs,
        });
      } else {
        setBenchmarkStats('visual', {
          completed,
          total: games.length,
          totalMoves,
          moveTarget,
          elapsedSec,
          state: `Completed in ${formatBenchmarkDuration(elapsedSec)}${
            invalidGames > 0 ? ` (invalid games: ${invalidGames})` : ''
          }`,
          etaSec,
          arrowLatencyMs: activeArrowLatencyMs,
        });
      }
    } finally {
      benchmarkRunning = false;
      benchmarkMode = 'idle';
      benchmarkPaused = false;
      benchmarkStopRequested = false;
      replayer.setMoveArrowEnabled(Boolean(moveArrowToggle?.checked ?? true));
      replayer.setMoveArrowDuration(DEFAULT_MOVE_ARROW_DURATION_MS);
      setBenchmarkButtons({ runningMode: benchmarkMode });
      setBenchmarkModeLabel('Idle');
      setReplayControlsDisabled(false);
    }
  };

  gameSelect.addEventListener('change', loadReplay);
  searchModalOpen?.addEventListener('click', openSearchModal);
  searchModalClose?.addEventListener('click', closeSearchModal);
  searchModal?.addEventListener('click', (event) => {
    if (event.target === searchModal) {
      closeSearchModal();
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeSearchModal();
    }
  });

  searchWhite?.addEventListener('change', updateSearchResults);
  searchBlack?.addEventListener('change', updateSearchResults);
  searchYear?.addEventListener('change', updateSearchResults);
  searchText?.addEventListener('input', updateSearchResults);
  searchTabFilters?.addEventListener('click', () => setSearchTab('filters'));
  searchTabCounts?.addEventListener('click', () => setSearchTab('counts'));
  searchCountGroup?.addEventListener('change', () => {
    renderSearchCounts({ resetPage: true });
  });
  searchCountPageSize?.addEventListener('change', () => {
    renderSearchCounts({ resetPage: true });
  });
  searchCountPrevBtn?.addEventListener('click', () => {
    searchCountPage -= 1;
    renderSearchCounts();
  });
  searchCountNextBtn?.addEventListener('click', () => {
    searchCountPage += 1;
    renderSearchCounts();
  });

  searchOpenSelectedBtn?.addEventListener('click', () => {
    const selectedId = Number(searchResults?.value ?? NaN);
    if (Number.isInteger(selectedId) && openGameById(selectedId, { autoPlay: false })) {
      closeSearchModal();
    }
  });

  searchOpenPlaySelectedBtn?.addEventListener('click', () => {
    const selectedId = Number(searchResults?.value ?? NaN);
    if (Number.isInteger(selectedId) && openGameById(selectedId, { autoPlay: true })) {
      closeSearchModal();
    }
  });

  searchOpenByIdBtn?.addEventListener('click', () => {
    const inputId = Number(searchGameId?.value ?? NaN);
    if (openGameById(inputId, { autoPlay: false })) {
      closeSearchModal();
    }
  });

  searchOpenPlayByIdBtn?.addEventListener('click', () => {
    const inputId = Number(searchGameId?.value ?? NaN);
    if (openGameById(inputId, { autoPlay: true })) {
      closeSearchModal();
    }
  });

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

    const currentId = Number(gameSelect.value || games[0]?.id || 0);
    let nextIndex = Math.floor(Math.random() * games.length);
    let nextGame = games[nextIndex];

    if (games.length > 1 && Number(nextGame?.id) === currentId) {
      nextIndex = (nextIndex + 1) % games.length;
      nextGame = games[nextIndex];
    }

    gameSelect.value = String(nextGame?.id ?? currentId);
    loadReplay();
    replayer.play();
  });

  gameSelect.value = String(games[0]?.id ?? 0);
  loadReplay();
}

bootstrap().catch((error) => {
  const statusEl = document.querySelector('#status');
  if (statusEl) {
    statusEl.textContent = `Startup failed: ${error.message}`;
  }
});
