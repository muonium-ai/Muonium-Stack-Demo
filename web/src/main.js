import initWasm from './wasm_pkg/wasm_core.js';
import { Chess } from 'chess.js';
import { createGameDb, createGameDbFromPgn } from './db.js';
import { GrafeoAdapter } from './graph.js';
import { createReplayer } from './replay.js';
import './styles.css';
import {
  BUILT_IN_THEMES,
  DEFAULT_THEME_ID,
  initializeThemeFoundation,
  persistThemeId,
  resolveInitialThemeId,
  setActiveTheme,
} from './theme.js';
import { createPlayBenchmarkDb } from './playBenchmarkDb.js';
import { createStockfishService } from './stockfish.js';
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
const DEFAULT_PLAY_REPLAY_SPEED_MS = 600;
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

function parseFenBoard(fen) {
  const placement = String(fen ?? '').split(' ')[0] ?? '';
  const rows = placement.split('/');
  const board = [];

  for (const row of rows) {
    const expanded = [];
    for (const ch of row) {
      const asNum = Number(ch);
      if (Number.isInteger(asNum) && asNum > 0) {
        for (let index = 0; index < asNum; index += 1) {
          expanded.push('');
        }
      } else {
        expanded.push(ch);
      }
    }
    board.push(expanded.slice(0, 8));
  }

  while (board.length < 8) {
    board.push(['', '', '', '', '', '', '', '']);
  }

  return board;
}

function renderPlayBoard(
  container,
  fen,
  { selectedSquare = '', legalTargetSquares = [], moveArrow = null, arrowVisible = false } = {},
) {
  if (!container) {
    return;
  }

  const selected = String(selectedSquare || '').toLowerCase();
  const legalTargets = new Set(
    Array.isArray(legalTargetSquares)
      ? legalTargetSquares.map((square) => String(square || '').toLowerCase())
      : [],
  );
  const board = parseFenBoard(fen);
  const table = document.createElement('table');
  const tbody = document.createElement('tbody');
  const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

  for (let rank = 0; rank < 8; rank += 1) {
    const tr = document.createElement('tr');
    for (let file = 0; file < 8; file += 1) {
      const td = document.createElement('td');
      const square = `${files[file]}${8 - rank}`;
      td.dataset.square = square;
      td.className = (rank + file) % 2 === 0 ? 'light' : 'dark';
      if (square === selected) {
        td.classList.add('isSelected');
      }
      if (legalTargets.has(square)) {
        td.classList.add('isLegalTarget');
      }

      const piece = board[rank]?.[file] ?? '';
      if (piece) {
        const span = document.createElement('span');
        const pieceKind = piece === piece.toUpperCase() ? 'white' : 'black';
        span.className = `boardPiece ${pieceKind}`;
        span.textContent = PIECE_TO_UNICODE[piece] ?? '';
        td.appendChild(span);
      }

      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }

  table.appendChild(tbody);

  const boardPixelSize = table.offsetWidth || 544;
  const cellSize = boardPixelSize / 8;
  const svgNs = 'http://www.w3.org/2000/svg';
  const arrowSvg = document.createElementNS(svgNs, 'svg');
  arrowSvg.setAttribute('class', 'moveArrowOverlay');
  arrowSvg.setAttribute('viewBox', `0 0 ${boardPixelSize} ${boardPixelSize}`);

  const defs = document.createElementNS(svgNs, 'defs');
  const marker = document.createElementNS(svgNs, 'marker');
  marker.setAttribute('id', 'play-move-arrow-head');
  marker.setAttribute('markerWidth', '8');
  marker.setAttribute('markerHeight', '8');
  marker.setAttribute('refX', '6');
  marker.setAttribute('refY', '3');
  marker.setAttribute('orient', 'auto');
  marker.setAttribute('markerUnits', 'strokeWidth');

  const markerPath = document.createElementNS(svgNs, 'path');
  markerPath.setAttribute('d', 'M0,0 L0,6 L6,3 z');
  markerPath.setAttribute('fill', '#2563eb');
  marker.appendChild(markerPath);
  defs.appendChild(marker);
  arrowSvg.appendChild(defs);

  const arrowLine = document.createElementNS(svgNs, 'line');
  arrowLine.setAttribute('stroke', '#2563eb');
  arrowLine.setAttribute('stroke-width', '6');
  arrowLine.setAttribute('stroke-linecap', 'round');
  arrowLine.setAttribute('stroke-opacity', '0.85');
  arrowLine.setAttribute('marker-end', 'url(#play-move-arrow-head)');
  arrowLine.style.display = 'none';

  if (arrowVisible && moveArrow?.from && moveArrow?.to) {
    const fromFile = files.indexOf(String(moveArrow.from)[0]);
    const fromRank = Number(String(moveArrow.from)[1]);
    const toFile = files.indexOf(String(moveArrow.to)[0]);
    const toRank = Number(String(moveArrow.to)[1]);

    if (fromFile >= 0 && toFile >= 0 && fromRank >= 1 && fromRank <= 8 && toRank >= 1 && toRank <= 8) {
      const x1 = fromFile * cellSize + cellSize / 2;
      const y1 = (8 - fromRank) * cellSize + cellSize / 2;
      const x2 = toFile * cellSize + cellSize / 2;
      const y2 = (8 - toRank) * cellSize + cellSize / 2;

      arrowLine.setAttribute('x1', String(x1));
      arrowLine.setAttribute('y1', String(y1));
      arrowLine.setAttribute('x2', String(x2));
      arrowLine.setAttribute('y2', String(y2));
      arrowLine.style.display = 'block';
    }
  }

  arrowSvg.appendChild(arrowLine);

  container.innerHTML = '';
  container.appendChild(table);
  container.appendChild(arrowSvg);
}

const PLAYER_DATASET_STORAGE_KEY = 'muon.selectedPlayerDataset';
const MAX_PGN_FILE_BYTES = 100 * 1024 * 1024;
const PLAYER_DATASETS = [
  {
    id: 'carlsen',
    label: 'Magnus Carlsen',
    dbUrl: '/data/carlsen.sqlite',
  },
  {
    id: 'anand',
    label: 'Viswanathan Anand',
    dbUrl: '/data/anand.sqlite',
  },
];

function getDatasetById(id) {
  return PLAYER_DATASETS.find((dataset) => dataset.id === id) ?? null;
}

function getDefaultDataset() {
  return getDatasetById('carlsen') ?? PLAYER_DATASETS[0];
}

function resolveInitialDataset() {
  const fromStorage = localStorage.getItem(PLAYER_DATASET_STORAGE_KEY);
  const stored = getDatasetById(fromStorage);
  if (stored) {
    return stored;
  }

  return getDefaultDataset();
}

function renderDatasetOptions(selectEl, selectedDatasetId) {
  if (!selectEl) {
    return;
  }

  selectEl.innerHTML = '';
  for (const dataset of PLAYER_DATASETS) {
    const option = document.createElement('option');
    option.value = dataset.id;
    option.textContent = dataset.label;
    selectEl.appendChild(option);
  }
  selectEl.value = selectedDatasetId;
}

function renderThemeOptions(selectEl, selectedThemeId) {
  if (!selectEl) {
    return;
  }

  selectEl.innerHTML = '';
  for (const theme of BUILT_IN_THEMES) {
    const option = document.createElement('option');
    option.value = theme.id;
    option.textContent = theme.label;
    selectEl.appendChild(option);
  }

  const hasSelected = Array.from(selectEl.options).some((option) => option.value === selectedThemeId);
  selectEl.value = hasSelected ? selectedThemeId : DEFAULT_THEME_ID;
}

function formatElapsedMs(ms) {
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatFileSize(bytes) {
  const size = Math.max(0, Number(bytes) || 0);
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }
  if (size >= 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${size} B`;
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

function formatGroupedDecimal(value) {
  const safeValue = Number.isFinite(value) && value >= 0 ? value : 0;
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(safeValue);
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

function buildSimplePgn({ event = 'Play Benchmark', white = 'Stockfish', black = 'Stockfish', result = '*', moves = [] } = {}) {
  const safeMoves = Array.isArray(moves) ? moves : [];
  const lines = [
    `[Event "${String(event)}"]`,
    `[White "${String(white)}"]`,
    `[Black "${String(black)}"]`,
    `[Result "${String(result)}"]`,
    '',
  ];

  const moveTokens = [];
  for (let index = 0; index < safeMoves.length; index += 1) {
    if (index % 2 === 0) {
      moveTokens.push(`${Math.floor(index / 2) + 1}.`);
    }
    moveTokens.push(String(safeMoves[index] ?? ''));
  }
  moveTokens.push(result);
  lines.push(moveTokens.join(' ').trim());

  return lines.join('\n').trim();
}

function normalizeSanForCompare(move) {
  return String(move ?? '')
    .trim()
    .replace(/[!?+#]+$/g, '')
    .replace(/^0-0-0$/, 'O-O-O')
    .replace(/^0-0$/, 'O-O');
}

function createEcoClassifier(ecoLines) {
  const normalizedLines = Array.isArray(ecoLines)
    ? ecoLines
        .map((line) => ({
          ecoCode: String(line?.eco_code ?? '').trim(),
          opening: String(line?.opening_name ?? '').trim(),
          variation: String(line?.variation_name ?? '').trim(),
          moves: Array.isArray(line?.moves) ? line.moves.map(normalizeSanForCompare).filter(Boolean) : [],
        }))
        .filter((line) => line.opening && line.moves.length > 0)
    : [];

  const byFirstMove = new Map();
  for (const line of normalizedLines) {
    const firstMove = line.moves[0];
    if (!firstMove) {
      continue;
    }
    if (!byFirstMove.has(firstMove)) {
      byFirstMove.set(firstMove, []);
    }
    byFirstMove.get(firstMove).push(line);
  }

  for (const [, lines] of byFirstMove) {
    lines.sort((left, right) => left.moves.length - right.moves.length);
  }

  return {
    hasData: normalizedLines.length > 0,
    classify(gameMoves, moveIndex) {
      const playedCount = Math.max(0, Number(moveIndex) || 0);
      if (playedCount <= 0 || !Array.isArray(gameMoves) || gameMoves.length === 0) {
        return null;
      }

      const normalizedGameMoves = gameMoves.map(normalizeSanForCompare);
      const firstMove = normalizedGameMoves[0];
      const candidates = byFirstMove.get(firstMove) ?? [];
      if (candidates.length === 0) {
        return null;
      }

      const matched = [];
      for (const line of candidates) {
        if (line.moves.length > playedCount) {
          continue;
        }

        let isPrefix = true;
        for (let index = 0; index < line.moves.length; index += 1) {
          if (line.moves[index] !== normalizedGameMoves[index]) {
            isPrefix = false;
            break;
          }
        }

        if (isPrefix) {
          matched.push(line);
        }
      }

      if (matched.length === 0) {
        return null;
      }

      const openingMatch = matched[0];
      const variantMatch = [...matched]
        .reverse()
        .find((line) => line.opening === openingMatch.opening && line.variation);

      return {
        ecoCode: openingMatch.ecoCode,
        opening: openingMatch.opening,
        variant: variantMatch?.variation ?? '',
      };
    },
  };
}

function createPlayOpeningCatalog(ecoLines) {
  const whiteMap = new Map();
  const blackByWhiteMap = new Map();

  for (const line of Array.isArray(ecoLines) ? ecoLines : []) {
    const opening = String(line?.opening_name ?? '').trim();
    const variation = String(line?.variation_name ?? '').trim();
    const normalizedMoves = Array.isArray(line?.moves)
      ? line.moves.map(normalizeSanForCompare).filter(Boolean)
      : [];

    if (!opening || normalizedMoves.length === 0) {
      continue;
    }

    const whiteMove = normalizedMoves[0];
    if (whiteMove && !whiteMap.has(whiteMove)) {
      const variationSuffix = variation ? ` (${variation})` : '';
      whiteMap.set(whiteMove, {
        value: whiteMove,
        label: `${whiteMove} — ${opening}${variationSuffix}`,
      });
    }

    if (normalizedMoves.length < 2) {
      continue;
    }

    const blackMove = normalizedMoves[1];
    if (!blackMove) {
      continue;
    }

    if (!blackByWhiteMap.has(whiteMove)) {
      blackByWhiteMap.set(whiteMove, new Map());
    }

    const responseMap = blackByWhiteMap.get(whiteMove);
    if (!responseMap.has(blackMove)) {
      const variationSuffix = variation ? ` (${variation})` : '';
      responseMap.set(blackMove, {
        value: blackMove,
        label: `${blackMove} — ${opening}${variationSuffix}`,
      });
    }
  }

  const whiteOptions = Array.from(whiteMap.values()).sort((left, right) =>
    left.label.localeCompare(right.label),
  );

  const blackOptionsByWhite = new Map();
  for (const [whiteMove, responseMap] of blackByWhiteMap.entries()) {
    const responses = Array.from(responseMap.values()).sort((left, right) =>
      left.label.localeCompare(right.label),
    );
    blackOptionsByWhite.set(whiteMove, responses);
  }

  return {
    whiteOptions,
    blackOptionsByWhite,
  };
}

function setLabeledSelectOptions(selectEl, options, placeholderLabel) {
  if (!selectEl) {
    return;
  }

  const previousValue = selectEl.value;
  selectEl.innerHTML = '';

  const placeholderOption = document.createElement('option');
  placeholderOption.value = '';
  placeholderOption.textContent = placeholderLabel;
  selectEl.appendChild(placeholderOption);

  for (const optionData of Array.isArray(options) ? options : []) {
    const option = document.createElement('option');
    option.value = String(optionData.value ?? '');
    option.textContent = String(optionData.label ?? optionData.value ?? '');
    selectEl.appendChild(option);
  }

  if (previousValue && Array.from(selectEl.options).some((opt) => opt.value === previousValue)) {
    selectEl.value = previousValue;
  }
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
  const initialThemeId = resolveInitialThemeId();
  initializeThemeFoundation(initialThemeId);

  const loadStartedAt = performance.now();
  const statusEl = document.querySelector('#status');
  const appTabBenchmark = document.querySelector('#appTabBenchmark');
  const appTabPlay = document.querySelector('#appTabPlay');
  const appPanelBenchmark = document.querySelector('#appPanelBenchmark');
  const appPanelPlay = document.querySelector('#appPanelPlay');
  const benchmarkOnlyControls = Array.from(document.querySelectorAll('.benchmarkOnlyControl'));
  const playBoard = document.querySelector('#playBoard');
  const playMoveInfo = document.querySelector('#playMoveInfo');
  const playTurnNotice = document.querySelector('#playTurnNotice');
  const playWhiteName = document.querySelector('#playWhiteName');
  const playBlackName = document.querySelector('#playBlackName');
  const playWhiteCaptures = document.querySelector('#playWhiteCaptures');
  const playBlackCaptures = document.querySelector('#playBlackCaptures');
  const playPgnViewer = document.querySelector('#playPgnViewer');
  const playModeInfo = document.querySelector('#playModeInfo');
  const playEngineStatus = document.querySelector('#playEngineStatus');
  const playModeSelect = document.querySelector('#playModeSelect');
  const playHumanSideSelect = document.querySelector('#playHumanSideSelect');
  const playWhiteOpeningSelect = document.querySelector('#playWhiteOpeningSelect');
  const playBlackDefenseSelect = document.querySelector('#playBlackDefenseSelect');
  const playEngineDepthSelect = document.querySelector('#playEngineDepthSelect');
  const playArrowToggle = document.querySelector('#playArrowToggle');
  const playArrowDurationSelect = document.querySelector('#playArrowDurationSelect');
  const playAutoplayStartBtn = document.querySelector('#playAutoplayStartBtn');
  const playAutoplayStopBtn = document.querySelector('#playAutoplayStopBtn');
  const playResetBtn = document.querySelector('#playResetBtn');
  const playNavStart = document.querySelector('#playNavStart');
  const playNavPrev = document.querySelector('#playNavPrev');
  const playNavPlay = document.querySelector('#playNavPlay');
  const playNavNext = document.querySelector('#playNavNext');
  const playNavEnd = document.querySelector('#playNavEnd');
  const playBenchmarkGamesInput = document.querySelector('#playBenchmarkGamesInput');
  const playBenchmarkRunBtn = document.querySelector('#playBenchmarkRunBtn');
  const playBenchmarkDownloadBtn = document.querySelector('#playBenchmarkDownloadBtn');
  const playBenchmarkStatus = document.querySelector('#playBenchmarkStatus');
  const boardEl = document.querySelector('#board');
  const themeSelect = document.querySelector('#themeSelect');
  const playerDatasetSelect = document.querySelector('#playerDatasetSelect');
  const gameSelect = document.querySelector('#gameSelect');
  const moveArrowToggle = document.querySelector('#moveArrowToggle');
  const openingClassifierToggle = document.querySelector('#openingClassifierToggle');
  const searchModalOpen = document.querySelector('#searchModalOpen');
  const uploadPgnOpen = document.querySelector('#uploadPgnOpen');
  const searchModal = document.querySelector('#searchModal');
  const searchModalClose = document.querySelector('#searchModalClose');
  const searchTabFilters = document.querySelector('#searchTabFilters');
  const searchTabCounts = document.querySelector('#searchTabCounts');
  const searchTabUpload = document.querySelector('#searchTabUpload');
  const searchTabPanelFilters = document.querySelector('#searchTabPanelFilters');
  const searchTabPanelCounts = document.querySelector('#searchTabPanelCounts');
  const searchTabPanelUpload = document.querySelector('#searchTabPanelUpload');
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
  const pgnDropZone = document.querySelector('#pgnDropZone');
  const pgnFileInput = document.querySelector('#pgnFileInput');
  const pgnImportStatus = document.querySelector('#pgnImportStatus');
  const randomBtn = document.querySelector('#randomBtn');
  const benchmarkFastBtn = document.querySelector('#benchmarkFastBtn');
  const benchmarkBtn = document.querySelector('#benchmarkBtn');
  const benchmarkPauseBtn = document.querySelector('#benchmarkPauseBtn');
  const benchmarkStopBtn = document.querySelector('#benchmarkStopBtn');
  const benchmarkHideBtn = document.querySelector('#benchmarkHideBtn');
  const navStart = document.querySelector('#navStart');
  const navPrev = document.querySelector('#navPrev');
  const navPlay = document.querySelector('#navPlay');
  const navNext = document.querySelector('#navNext');
  const navEnd = document.querySelector('#navEnd');
  const loadProgressText = document.querySelector('#loadProgressText');
  const benchmarkModeLabel = document.querySelector('#benchmarkModeLabel');
  const benchmarkPanel = document.querySelector('#benchmarkPanel');
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
  const datasetLoadInfo = document.querySelector('#datasetLoadInfo');
  const openingInfo = document.querySelector('#openingInfo');
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
  const playPgnState = {
    movesRef: null,
    moveCount: 0,
    activeMoveIndex: -1,
    spans: [],
  };

  let activeGame = null;
  let activeReplayMoves = [];
  let activeReplayMoveIndex = 0;
  let benchmarkRunning = false;
  let benchmarkPaused = false;
  let benchmarkStopRequested = false;
  let benchmarkPauseStartedAt = 0;
  let benchmarkPausedTotalMs = 0;
  let benchmarkMode = 'idle';
  let benchmarkHasRun = false;
  let activeDataset = resolveInitialDataset();
  let ecoClassifier = createEcoClassifier([]);
  let activeAppTab = 'benchmark';
  let playOpeningCatalog = createPlayOpeningCatalog([]);
  let playAutoplayToken = 0;
  let playAutoplayRunning = false;
  let playMode = 'engine';
  let playHumanSide = 'white';
  let playHumanThinking = false;
  let playSelectedSquare = '';
  let playSelectedMoves = [];
  let playLastArrow = null;
  let playArrowHideTimer = 0;
  let playArrowEnabled = Boolean(playArrowToggle?.checked ?? true);
  let playArrowDurationMs = Math.max(0, Number(playArrowDurationSelect?.value ?? 120) || 120);
  let playBenchmarkRunning = false;
  let playBenchmarkDb = null;
  let playReplayFens = [];
  let playReplayMoves = [];
  let playReplayIndex = 0;
  let playReplayPlaying = false;
  let playReplayTimer = 0;
  let playWhitePlayerName = 'Stockfish';
  let playBlackPlayerName = 'Stockfish';
  let playMoveRecords = [];
  let playGamePersisted = false;
  const playChess = new Chess();
  const playUciMoves = [];

  const toUciMove = (move) =>
    `${String(move?.from ?? '')}${String(move?.to ?? '')}${String(move?.promotion ?? '')}`.toLowerCase();

  const humanTurnColor = () => (playHumanSide === 'black' ? 'b' : 'w');
  const engineTurnColor = () => (humanTurnColor() === 'w' ? 'b' : 'w');
  const serviceForTurnColor = (turnColor) => (turnColor === 'w' ? stockfishWhiteService : stockfishBlackService);
  const currentPlayMoveLabel = () => {
    return playReplayIndex > 0 ? playReplayMoves[playReplayIndex - 1] ?? 'start' : 'start';
  };

  const updatePlayPlayerLabels = () => {
    if (playWhiteName) {
      playWhiteName.textContent = `White: ${playWhitePlayerName}`;
    }
    if (playBlackName) {
      playBlackName.textContent = `Black: ${playBlackPlayerName}`;
    }
  };

  const applyPlayPlayerNames = () => {
    if (playMode === 'engine') {
      playWhitePlayerName = 'Stockfish';
      playBlackPlayerName = 'Stockfish';
    } else if (playHumanSide === 'white') {
      playWhitePlayerName = 'Human';
      playBlackPlayerName = 'Stockfish';
    } else {
      playWhitePlayerName = 'Stockfish';
      playBlackPlayerName = 'Human';
    }
    updatePlayPlayerLabels();
  };

  const clearPlaySelection = () => {
    playSelectedSquare = '';
    playSelectedMoves = [];
  };

  const setPlayArrowFromMove = (move) => {
    if (!move?.from || !move?.to) {
      playLastArrow = null;
      return;
    }
    playLastArrow = {
      from: String(move.from).toLowerCase(),
      to: String(move.to).toLowerCase(),
    };
  };

  const clearPlayArrowTimer = () => {
    if (playArrowHideTimer) {
      clearTimeout(playArrowHideTimer);
      playArrowHideTimer = 0;
    }
  };

  const clearPlayReplayTimer = () => {
    if (playReplayTimer) {
      clearTimeout(playReplayTimer);
      playReplayTimer = 0;
    }
    playReplayPlaying = false;
    if (playNavPlay) {
      playNavPlay.textContent = '▶';
    }
  };

  const schedulePlayArrowHide = (moveLabel) => {
    clearPlayArrowTimer();
    if (!playArrowEnabled || playArrowDurationMs <= 0 || !playLastArrow) {
      return;
    }

    playArrowHideTimer = window.setTimeout(() => {
      playArrowHideTimer = 0;
      playLastArrow = null;
      renderActivePlayState(moveLabel);
    }, playArrowDurationMs);
  };

  const renderActivePlayState = (moveLabel = 'start') => {
    const maxIndex = Math.max(0, playReplayFens.length - 1);
    playReplayIndex = Math.max(0, Math.min(playReplayIndex, maxIndex));
    const replayFen = playReplayFens[playReplayIndex] ?? playChess.fen();
    const isLatestPosition = playReplayIndex === playReplayMoves.length;

    renderPlayBoard(playBoard, replayFen, {
      selectedSquare: playSelectedSquare,
      legalTargetSquares: playSelectedMoves.map((move) => move.to),
      moveArrow: playLastArrow,
      arrowVisible:
        playArrowEnabled && playArrowDurationMs > 0 && Boolean(playLastArrow) && isLatestPosition,
    });
    renderPgnViewer(playPgnViewer, playReplayMoves, playReplayIndex, playPgnState, {
      forceFull: playReplayIndex === 0,
      scrollActive: true,
    });

    const counts = pieceCountsFromFen(replayFen);
    if (playWhiteCaptures) {
      const captured = capturesToUnicode(counts, CAPTURE_ORDER_WHITE);
      playWhiteCaptures.textContent = captured || 'No captures yet';
    }
    if (playBlackCaptures) {
      const captured = capturesToUnicode(counts, CAPTURE_ORDER_BLACK);
      playBlackCaptures.textContent = captured || 'No captures yet';
    }

    if (playTurnNotice) {
      const replayTurn = String(replayFen.split(' ')[1] ?? '').toLowerCase();
      const latestTurn = playChess.turn();
      const isLatestPosition = playReplayIndex === playReplayMoves.length;
      const humanTurn = humanTurnColor();

      if (!isLatestPosition) {
        playTurnNotice.textContent = `Viewing history: move ${playReplayIndex}/${playReplayMoves.length}`;
      } else if (playChess.isGameOver()) {
        playTurnNotice.textContent = 'Game over';
      } else if (playMode === 'human' && latestTurn === humanTurn) {
        playTurnNotice.textContent = 'Your turn: make a move';
      } else if (playMode === 'human' && latestTurn !== humanTurn) {
        playTurnNotice.textContent = 'Engine turn';
      } else if (replayTurn === 'w' || replayTurn === 'b') {
        playTurnNotice.textContent = replayTurn === 'w' ? 'Turn: White' : 'Turn: Black';
      } else {
        playTurnNotice.textContent = 'Turn: --';
      }
    }

    if (playMoveInfo) {
      const label = playReplayIndex > 0 ? playReplayMoves[playReplayIndex - 1] ?? moveLabel : 'start';
      playMoveInfo.textContent = `Move ${playReplayIndex}/${playReplayMoves.length} • ${label}`;
    }
  };

  const resetPlayReplayState = () => {
    playReplayFens = [playChess.fen()];
    playReplayMoves = [];
    playReplayIndex = 0;
  };

  const appendPlayReplayMove = (move) => {
    playReplayMoves.push(String(move?.san ?? ''));
    playReplayFens.push(playChess.fen());
    playReplayIndex = playReplayMoves.length;
  };

  const appendPlayMoveRecord = (move, uci) => {
    playMoveRecords.push({
      ply: playMoveRecords.length + 1,
      side: String(move?.color ?? ''),
      uci: String(uci ?? '').toLowerCase(),
      san: String(move?.san ?? ''),
      fen: playChess.fen(),
    });
  };

  const recordCompletedPlayedGame = () => {
    if (!playBenchmarkDb || playGamePersisted || !playChess.isGameOver()) {
      return;
    }

    const runId = playBenchmarkDb.createRun({
      depth: Math.max(1, Number(playEngineDepthSelect?.value ?? 10) || 10),
      targetGames: 1,
    });
    const result = resultFromChess(playChess);
    const pgnText = buildSimplePgn({
      event: 'Play Session',
      white: playWhitePlayerName,
      black: playBlackPlayerName,
      result,
      moves: playReplayMoves,
    });

    playBenchmarkDb.recordCompletedGame({
      runId,
      gameIndex: 1,
      result,
      pgnText,
      moves: playMoveRecords,
    });

    playGamePersisted = true;
    const totals = playBenchmarkDb.getTotals();
    updatePlayBenchmarkStatus(
      `Benchmark DB: ${totals.runs} runs • ${totals.games} games • ${totals.moves} moves`,
    );
  };

  const setPlayEngineStatus = (text) => {
    if (playEngineStatus) {
      playEngineStatus.textContent = text;
    }
  };

  const updatePlayBenchmarkStatus = (text) => {
    if (playBenchmarkStatus) {
      playBenchmarkStatus.textContent = text;
    }
  };

  const syncPlayModeUi = () => {
    const isEngineMode = playMode === 'engine';
    const isBusy = playAutoplayRunning || playHumanThinking || playBenchmarkRunning;

    if (playModeInfo) {
      playModeInfo.textContent = isEngineMode
        ? 'Mode: Stockfish vs Stockfish'
        : `Mode: Human (${playHumanSide === 'white' ? 'White' : 'Black'}) vs Stockfish`;
    }

    if (playAutoplayStartBtn) {
      playAutoplayStartBtn.textContent = isEngineMode ? 'Start Autoplay' : 'Start Human Game';
      playAutoplayStartBtn.disabled = isBusy;
    }

    if (playAutoplayStopBtn) {
      playAutoplayStopBtn.disabled = !isEngineMode || !playAutoplayRunning;
    }

    if (playModeSelect) {
      playModeSelect.disabled = isBusy;
    }

    if (playHumanSideSelect) {
      playHumanSideSelect.disabled = isBusy || isEngineMode;
    }

    if (playWhiteOpeningSelect) {
      playWhiteOpeningSelect.disabled = isBusy || !isEngineMode;
    }

    if (playBlackDefenseSelect) {
      playBlackDefenseSelect.disabled = isBusy || !isEngineMode;
    }

    if (playEngineDepthSelect) {
      playEngineDepthSelect.disabled = isBusy;
    }
    if (playArrowToggle) {
      playArrowToggle.disabled = isBusy;
    }
    if (playArrowDurationSelect) {
      playArrowDurationSelect.disabled = isBusy;
    }
    if (playBenchmarkGamesInput) {
      playBenchmarkGamesInput.disabled = isBusy;
    }
    if (playBenchmarkRunBtn) {
      playBenchmarkRunBtn.disabled = isBusy;
    }
    if (playBenchmarkDownloadBtn) {
      playBenchmarkDownloadBtn.disabled = isBusy;
    }
    if (playNavStart) {
      playNavStart.disabled = isBusy || playReplayIndex <= 0;
    }
    if (playNavPrev) {
      playNavPrev.disabled = isBusy || playReplayIndex <= 0;
    }
    if (playNavPlay) {
      playNavPlay.disabled = isBusy || playReplayMoves.length === 0;
    }
    if (playNavNext) {
      playNavNext.disabled = isBusy || playReplayIndex >= playReplayMoves.length;
    }
    if (playNavEnd) {
      playNavEnd.disabled = isBusy || playReplayIndex >= playReplayMoves.length;
    }
  };

  const stockfishWhiteService = createStockfishService();
  const stockfishBlackService = createStockfishService();

  const refreshBlackDefenseOptions = () => {
    const whiteMove = String(playWhiteOpeningSelect?.value ?? '').trim();
    const blackOptions = playOpeningCatalog.blackOptionsByWhite.get(whiteMove) ?? [];
    setLabeledSelectOptions(playBlackDefenseSelect, blackOptions, 'Auto');
  };

  const setPlayOpeningCatalog = (ecoLines) => {
    playOpeningCatalog = createPlayOpeningCatalog(ecoLines);
    setLabeledSelectOptions(playWhiteOpeningSelect, playOpeningCatalog.whiteOptions, 'Random');
    refreshBlackDefenseOptions();

    if (playWhiteOpeningSelect && playOpeningCatalog.whiteOptions.length > 0) {
      const hasE4 = playOpeningCatalog.whiteOptions.some((option) => option.value === 'e4');
      playWhiteOpeningSelect.value = hasE4 ? 'e4' : playOpeningCatalog.whiteOptions[0].value;
      refreshBlackDefenseOptions();
      const selectedWhite = String(playWhiteOpeningSelect.value || '').trim();
      const defenseOptions = playOpeningCatalog.blackOptionsByWhite.get(selectedWhite) ?? [];
      const hasE5 = defenseOptions.some((option) => option.value === 'e5');
      if (playBlackDefenseSelect && defenseOptions.length > 0) {
        playBlackDefenseSelect.value = hasE5 ? 'e5' : defenseOptions[0].value;
      }
    }
  };

  const applySelectedOpeningMoves = () => {
    clearPlaySelection();
    clearPlayArrowTimer();
    clearPlayReplayTimer();
    playLastArrow = null;
    playChess.reset();
    playUciMoves.length = 0;
    playMoveRecords = [];
    playGamePersisted = false;
    resetPlayReplayState();

    const selectedWhite = String(playWhiteOpeningSelect?.value ?? '').trim();
    const selectedBlack = String(playBlackDefenseSelect?.value ?? '').trim();
    const preMoves = [];

    if (selectedWhite) {
      const whiteMove = playChess.move(selectedWhite);
      if (whiteMove) {
        const uci = toUciMove(whiteMove);
        playUciMoves.push(uci);
        preMoves.push(whiteMove.san);
        appendPlayReplayMove(whiteMove);
        appendPlayMoveRecord(whiteMove, uci);
      }
    }

    if (selectedBlack && !playChess.isGameOver()) {
      const blackMove = playChess.move(selectedBlack);
      if (blackMove) {
        const uci = toUciMove(blackMove);
        playUciMoves.push(uci);
        preMoves.push(blackMove.san);
        appendPlayReplayMove(blackMove);
        appendPlayMoveRecord(blackMove, uci);
      }
    }

    renderActivePlayState(preMoves.length > 0 ? preMoves.join(' ') : 'start');
  };

  const resetHumanGame = () => {
    clearPlaySelection();
    clearPlayArrowTimer();
    clearPlayReplayTimer();
    playLastArrow = null;
    playChess.reset();
    playUciMoves.length = 0;
    playMoveRecords = [];
    playGamePersisted = false;
    resetPlayReplayState();
    renderActivePlayState('start');
  };

  const applyBestMoveFromEngine = (bestMoveRaw) => {
    const bestMove = String(bestMoveRaw ?? '').trim().toLowerCase();
    const uciMatch = bestMove.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/i);
    if (!uciMatch) {
      return { ok: false, error: `no playable move (${bestMove || 'none'})` };
    }

    const [, from, to, promotion] = uciMatch;
    const played = playChess.move({ from, to, promotion: promotion?.toLowerCase() });
    if (!played) {
      return { ok: false, error: `illegal move (${bestMove})` };
    }

    const uci = `${from}${to}${promotion ?? ''}`.toLowerCase();
    playUciMoves.push(uci);
    clearPlaySelection();
    appendPlayReplayMove(played);
    appendPlayMoveRecord(played, uci);
    setPlayArrowFromMove(played);
    renderActivePlayState(played.san);
    schedulePlayArrowHide(played.san);
    return { ok: true, bestMove, san: played.san };
  };

  const stopPlayAutoplay = ({ reasonText = 'Stockfish WASM: autoplay stopped' } = {}) => {
    playAutoplayToken += 1;
    playAutoplayRunning = false;
    playHumanThinking = false;
    clearPlayArrowTimer();
    clearPlayReplayTimer();
    syncPlayModeUi();
    setPlayEngineStatus(reasonText);
  };

  const setPlayReplayIndex = (index) => {
    playReplayIndex = Math.max(0, Math.min(Number(index) || 0, playReplayMoves.length));
    if (playReplayIndex !== playReplayMoves.length) {
      clearPlaySelection();
    }
    renderActivePlayState(currentPlayMoveLabel());
    syncPlayModeUi();
  };

  const playReplayTick = () => {
    if (!playReplayPlaying) {
      return;
    }
    if (playReplayIndex >= playReplayMoves.length) {
      clearPlayReplayTimer();
      syncPlayModeUi();
      return;
    }
    setPlayReplayIndex(playReplayIndex + 1);
    playReplayTimer = window.setTimeout(playReplayTick, DEFAULT_PLAY_REPLAY_SPEED_MS);
  };

  const togglePlayReplay = () => {
    if (playReplayPlaying) {
      clearPlayReplayTimer();
      syncPlayModeUi();
      return;
    }
    if (playReplayMoves.length === 0) {
      return;
    }
    if (playReplayIndex >= playReplayMoves.length) {
      setPlayReplayIndex(0);
    }
    playReplayPlaying = true;
    if (playNavPlay) {
      playNavPlay.textContent = '⏸';
    }
    playReplayTimer = window.setTimeout(playReplayTick, DEFAULT_PLAY_REPLAY_SPEED_MS);
    syncPlayModeUi();
  };

  const runHumanEngineReply = async () => {
    if (playMode !== 'human' || playChess.isGameOver()) {
      return;
    }

    const expectedTurn = engineTurnColor();
    if (playChess.turn() !== expectedTurn) {
      return;
    }

    const service = serviceForTurnColor(expectedTurn);
    if (!service.isReady()) {
      setPlayEngineStatus('Stockfish WASM: unavailable (engine not ready)');
      return;
    }

    playHumanThinking = true;
    playAutoplayToken += 1;
    const runToken = playAutoplayToken;
    syncPlayModeUi();
    setPlayEngineStatus('Stockfish WASM: engine thinking...');

    try {
      const depth = Math.max(1, Number(playEngineDepthSelect?.value ?? 10) || 10);
      const result = await service.getBestMove({ uciMoves: playUciMoves, depth });
      if (runToken !== playAutoplayToken) {
        return;
      }

      const applied = applyBestMoveFromEngine(result.bestMove);
      if (!applied.ok) {
        setPlayEngineStatus(`Stockfish WASM: ${applied.error}`);
        return;
      }

      if (playChess.isGameOver()) {
        recordCompletedPlayedGame();
        if (playChess.isCheckmate()) {
          const winner = playChess.turn() === 'w' ? 'Black' : 'White';
          setPlayEngineStatus(`Stockfish WASM: completed (${winner} won by checkmate)`);
        } else if (playChess.isDraw()) {
          setPlayEngineStatus('Stockfish WASM: completed (draw)');
        } else {
          setPlayEngineStatus('Stockfish WASM: completed (game over)');
        }
      } else {
        setPlayEngineStatus(`Stockfish WASM: ready • engine played ${applied.bestMove}`);
      }
    } catch (error) {
      if (runToken === playAutoplayToken) {
        setPlayEngineStatus(`Stockfish WASM: error (${error?.message ?? 'unknown'})`);
      }
    } finally {
      if (runToken === playAutoplayToken) {
        playHumanThinking = false;
        syncPlayModeUi();
      }
    }
  };

  const runPlayAutoplay = async () => {
    if (playAutoplayRunning || playMode !== 'engine') {
      return;
    }

    if (!stockfishWhiteService.isReady() || !stockfishBlackService.isReady()) {
      setPlayEngineStatus('Stockfish WASM: unavailable (engine not ready)');
      return;
    }

    applySelectedOpeningMoves();

    playAutoplayRunning = true;
    playAutoplayToken += 1;
    const runToken = playAutoplayToken;
    syncPlayModeUi();
    setPlayEngineStatus('Stockfish WASM: autoplay running...');

    try {
      while (!playChess.isGameOver() && runToken === playAutoplayToken) {
        const sideToMove = playChess.turn();
        const service = sideToMove === 'w' ? stockfishWhiteService : stockfishBlackService;
        const depth = Math.max(1, Number(playEngineDepthSelect?.value ?? 10) || 10);
        const result = await service.getBestMove({ uciMoves: playUciMoves, depth });
        if (runToken !== playAutoplayToken) {
          return;
        }

        const applied = applyBestMoveFromEngine(result.bestMove);
        if (!applied.ok) {
          setPlayEngineStatus(`Stockfish WASM: ${applied.error}`);
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 180));
      }

      if (runToken !== playAutoplayToken) {
        return;
      }

      if (playChess.isGameOver()) {
        recordCompletedPlayedGame();
        if (playChess.isCheckmate()) {
          const winner = playChess.turn() === 'w' ? 'Black' : 'White';
          setPlayEngineStatus(`Stockfish WASM: completed (${winner} won by checkmate)`);
        } else if (playChess.isDraw()) {
          setPlayEngineStatus('Stockfish WASM: completed (draw)');
        } else {
          setPlayEngineStatus('Stockfish WASM: completed (game over)');
        }
      }
    } catch (error) {
      if (runToken === playAutoplayToken) {
        setPlayEngineStatus(`Stockfish WASM: error (${error?.message ?? 'unknown'})`);
      }
    } finally {
      if (runToken === playAutoplayToken) {
        playAutoplayRunning = false;
        syncPlayModeUi();
      }
    }
  };

  const runPlayBenchmark = async () => {
    if (playBenchmarkRunning || !playBenchmarkDb) {
      return;
    }

    if (!stockfishWhiteService.isReady() || !stockfishBlackService.isReady()) {
      setPlayEngineStatus('Stockfish WASM: unavailable (engine not ready)');
      return;
    }

    const targetGames = Math.max(1, Number(playBenchmarkGamesInput?.value ?? 10) || 10);
    const depth = Math.max(1, Number(playEngineDepthSelect?.value ?? 10) || 10);
    const runId = playBenchmarkDb.createRun({ depth, targetGames });

    playBenchmarkRunning = true;
    syncPlayModeUi();
    updatePlayBenchmarkStatus(
      `Benchmark run #${runId}: starting ${targetGames} games at depth ${depth}...`,
    );

    let recordedMovesTotal = 0;

    try {
      for (let gameIndex = 1; gameIndex <= targetGames; gameIndex += 1) {
        const benchChess = new Chess();
        const benchUciMoves = [];
        const benchMoveRecords = [];

        const openingWhite = String(playWhiteOpeningSelect?.value ?? '').trim();
        const openingBlack = String(playBlackDefenseSelect?.value ?? '').trim();

        if (openingWhite) {
          const move = benchChess.move(openingWhite);
          if (move) {
            benchUciMoves.push(toUciMove(move));
            benchMoveRecords.push({
              ply: benchMoveRecords.length + 1,
              side: move.color,
              uci: toUciMove(move),
              san: move.san,
              fen: benchChess.fen(),
            });
          }
        }

        if (openingBlack && !benchChess.isGameOver()) {
          const move = benchChess.move(openingBlack);
          if (move) {
            benchUciMoves.push(toUciMove(move));
            benchMoveRecords.push({
              ply: benchMoveRecords.length + 1,
              side: move.color,
              uci: toUciMove(move),
              san: move.san,
              fen: benchChess.fen(),
            });
          }
        }

        const maxPly = 260;
        while (!benchChess.isGameOver() && benchMoveRecords.length < maxPly) {
          const turnColor = benchChess.turn();
          const service = serviceForTurnColor(turnColor);
          const bestResult = await service.getBestMove({ uciMoves: benchUciMoves, depth });
          const bestMove = String(bestResult.bestMove ?? '').trim().toLowerCase();
          const uciMatch = bestMove.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/i);
          if (!uciMatch) {
            break;
          }

          const [, from, to, promotion] = uciMatch;
          const played = benchChess.move({ from, to, promotion: promotion?.toLowerCase() });
          if (!played) {
            break;
          }

          const uci = `${from}${to}${promotion ?? ''}`.toLowerCase();
          benchUciMoves.push(uci);
          benchMoveRecords.push({
            ply: benchMoveRecords.length + 1,
            side: played.color,
            uci,
            san: played.san,
            fen: benchChess.fen(),
          });
        }

        const result = resultFromChess(benchChess);
        const pgnText = buildSimplePgn({
          event: `Play Benchmark Run ${runId}`,
          white: 'Stockfish',
          black: 'Stockfish',
          result,
          moves: benchChess.history(),
        });

        playBenchmarkDb.recordCompletedGame({
          runId,
          gameIndex,
          result,
          pgnText,
          moves: benchMoveRecords,
        });

        recordedMovesTotal += benchMoveRecords.length;
        updatePlayBenchmarkStatus(
          `Benchmark run #${runId}: recorded game ${gameIndex}/${targetGames} • total moves ${recordedMovesTotal}`,
        );
      }

      const totals = playBenchmarkDb.getTotals();
      updatePlayBenchmarkStatus(
        `Benchmark DB: ${totals.runs} runs • ${totals.games} games • ${totals.moves} moves`,
      );
      setPlayEngineStatus(`Stockfish WASM: benchmark run #${runId} completed`);
    } catch (error) {
      updatePlayBenchmarkStatus(
        `Benchmark run #${runId}: failed (${error?.message ?? 'unknown'})`,
      );
    } finally {
      playBenchmarkRunning = false;
      syncPlayModeUi();
    }
  };

  const downloadPlayBenchmarkPgn = () => {
    if (!playBenchmarkDb) {
      return;
    }

    const pgnText = playBenchmarkDb.getAllGamesAsPgn();
    if (!pgnText.trim()) {
      updatePlayBenchmarkStatus('Benchmark DB: no games recorded to export');
      return;
    }

    const blob = new Blob([`${pgnText}\n`], { type: 'application/x-chess-pgn;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'play-benchmark-games.pgn';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);

    const totals = playBenchmarkDb.getTotals();
    updatePlayBenchmarkStatus(
      `Benchmark DB: ${totals.runs} runs • ${totals.games} games • ${totals.moves} moves • PGN downloaded`,
    );
  };

  const setAppTab = (tab) => {
    if (tab !== 'play' && (playAutoplayRunning || playHumanThinking)) {
      stopPlayAutoplay({ reasonText: 'Stockfish WASM: play stopped (switched tab)' });
    }

    activeAppTab = tab === 'play' ? 'play' : 'benchmark';
    appTabBenchmark?.classList.toggle('isActive', activeAppTab === 'benchmark');
    appTabPlay?.classList.toggle('isActive', activeAppTab === 'play');
    appPanelBenchmark?.classList.toggle('hidden', activeAppTab !== 'benchmark');
    appPanelPlay?.classList.toggle('hidden', activeAppTab !== 'play');
    for (const control of benchmarkOnlyControls) {
      control.classList.toggle('hidden', activeAppTab !== 'benchmark');
    }
  };

  const updateOpeningInfo = () => {
    if (!openingInfo) {
      return;
    }

    const classifierEnabled = Boolean(openingClassifierToggle?.checked ?? true);
    if (!classifierEnabled) {
      openingInfo.textContent = 'Opening: Off';
      return;
    }

    if (!ecoClassifier.hasData) {
      openingInfo.textContent = 'Opening: unavailable for this dataset';
      return;
    }

    if (activeReplayMoveIndex <= 0) {
      openingInfo.textContent = 'Opening: --';
      return;
    }

    const match = ecoClassifier.classify(activeReplayMoves, activeReplayMoveIndex);
    if (!match) {
      openingInfo.textContent = 'Opening: Unclassified';
      return;
    }

    const variantPart = match.variant ? ` • Variant: ${match.variant}` : '';
    const ecoPart = match.ecoCode ? ` (${match.ecoCode})` : '';
    openingInfo.textContent = `Opening: ${match.opening}${variantPart}${ecoPart}`;
  };

  renderThemeOptions(themeSelect, initialThemeId);
  themeSelect?.addEventListener('change', () => {
    const selectedThemeId = themeSelect.value || DEFAULT_THEME_ID;
    setActiveTheme(selectedThemeId);
    persistThemeId(selectedThemeId);
  });

  renderDatasetOptions(playerDatasetSelect, activeDataset.id);
  playerDatasetSelect?.addEventListener('change', () => {
    const next = getDatasetById(playerDatasetSelect.value) ?? getDefaultDataset();
    if (next.id === activeDataset.id) {
      return;
    }

    localStorage.setItem(PLAYER_DATASET_STORAGE_KEY, next.id);
    window.location.reload();
  });

  setAppTab('benchmark');
  playMode = String(playModeSelect?.value ?? 'engine') === 'human' ? 'human' : 'engine';
  playHumanSide = String(playHumanSideSelect?.value ?? 'white') === 'black' ? 'black' : 'white';
  applyPlayPlayerNames();
  syncPlayModeUi();
  renderActivePlayState();
  appTabBenchmark?.addEventListener('click', () => setAppTab('benchmark'));
  appTabPlay?.addEventListener('click', () => setAppTab('play'));

  statusEl.textContent = 'Initializing WASM...';
  await initWasm();

  setPlayEngineStatus('Stockfish WASM: initializing engines...');
  const [whiteReady, blackReady] = await Promise.all([
    stockfishWhiteService.init(),
    stockfishBlackService.init(),
  ]);
  const stockfishReady = whiteReady && blackReady;
  if (playEngineStatus) {
    const reason = stockfishWhiteService.getLastError() || stockfishBlackService.getLastError();
    const isolationHint = window.crossOriginIsolated
      ? 'verify /stockfish assets are present'
      : 'requires COOP/COEP headers (restart dev server)';
    playEngineStatus.textContent = stockfishReady
      ? 'Stockfish WASM: ready (white + black engines)'
      : `Stockfish WASM: unavailable (${reason || isolationHint})`;
  }

  playBenchmarkDb = await createPlayBenchmarkDb();
  const initialTotals = playBenchmarkDb.getTotals();
  updatePlayBenchmarkStatus(
    `Benchmark DB: ${initialTotals.runs} runs • ${initialTotals.games} games • ${initialTotals.moves} moves`,
  );

  statusEl.textContent = `Downloading ${activeDataset.label} SQLite... (${formatElapsedMs(performance.now() - loadStartedAt)})`;
  let db = await createGameDb({
    dbUrl: activeDataset.dbUrl,
    onProgress: (progress) => {
      if (!loadProgressText) {
        return;
      }

      if (progress.phase === 'download') {
        const totalBytes = Math.max(1, Number(progress.totalBytes ?? 1));
        const loadedBytes = Math.min(totalBytes, Number(progress.loadedBytes ?? 0));
        const pct = Math.round((loadedBytes / totalBytes) * 100);
        const elapsed = formatElapsedMs(performance.now() - loadStartedAt);
        loadProgressText.textContent = `${activeDataset.label}: downloading DB ${pct}% • ${elapsed}`;
        statusEl.textContent = `Downloading ${activeDataset.label} SQLite... ${pct}% (${elapsed})`;
        return;
      }

      if (progress.phase === 'games') {
        const total = Number(progress.total ?? 0);
        const loaded = Number(progress.loaded ?? 0);
        const elapsed = formatElapsedMs(performance.now() - loadStartedAt);
        loadProgressText.textContent = `${activeDataset.label}: loaded ${loaded} / ${total} games • ${elapsed}`;
        statusEl.textContent = `${activeDataset.label}: loaded ${loaded} / ${total} games (${elapsed})`;
      }
    },
  });

  if (loadProgressText) {
    const elapsed = formatElapsedMs(performance.now() - loadStartedAt);
    loadProgressText.textContent = `${loadProgressText.textContent} (ready in ${elapsed})`;
  }

  const setDatasetLoadInfo = ({ sourceLabel, totalGames, elapsedMs, fileSizeLabel = null }) => {
    if (!datasetLoadInfo) {
      return;
    }

    const elapsedText = formatElapsedMs(elapsedMs);
    const fileText = fileSizeLabel ? ` • file size ${fileSizeLabel}` : '';
    datasetLoadInfo.textContent = `${sourceLabel}: loaded ${totalGames} games • load time ${elapsedText}${fileText}`;
  };

  let games = db.listGames();
  if (games.length === 0) {
    statusEl.textContent = `No game loaded (loaded 0 games in ${formatElapsedMs(performance.now() - loadStartedAt)})`;
    return;
  }

  let gamesById = new Map(games.map((game) => [Number(game.id), game]));
  let searchTable = precomputeSearchTable(games);
  let searchMatchedRows = searchTable.rows;
  let searchCountPage = 0;
  let activeSearchTab = 'filters';
  const ecoLines = db.listEcoLines();
  ecoClassifier = createEcoClassifier(ecoLines);
  setPlayOpeningCatalog(ecoLines);

  setDatasetLoadInfo({
    sourceLabel: activeDataset.label,
    totalGames: games.length,
    elapsedMs: performance.now() - loadStartedAt,
  });

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
      activeReplayMoves = Array.isArray(moves) ? moves : [];
      activeReplayMoveIndex = Number(moveIndex) || 0;

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

      updateOpeningInfo();

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

  openingClassifierToggle?.addEventListener('change', () => {
    updateOpeningInfo();
  });

  playArrowToggle?.addEventListener('change', () => {
    playArrowEnabled = Boolean(playArrowToggle.checked);
    if (!playArrowEnabled) {
      clearPlayArrowTimer();
      playLastArrow = null;
    }
    renderActivePlayState(currentPlayMoveLabel());
  });

  playArrowDurationSelect?.addEventListener('change', () => {
    playArrowDurationMs = Math.max(0, Number(playArrowDurationSelect.value) || 0);
    if (playArrowDurationMs <= 0) {
      clearPlayArrowTimer();
      playLastArrow = null;
      renderActivePlayState(currentPlayMoveLabel());
      return;
    }

    if (playLastArrow && playArrowEnabled) {
      schedulePlayArrowHide(currentPlayMoveLabel());
    }
  });

  playModeSelect?.addEventListener('change', () => {
    if (playAutoplayRunning || playHumanThinking) {
      stopPlayAutoplay({ reasonText: 'Stockfish WASM: play stopped (mode changed)' });
    }

    playMode = String(playModeSelect.value ?? 'engine') === 'human' ? 'human' : 'engine';
    clearPlaySelection();
    applyPlayPlayerNames();
    syncPlayModeUi();

    if (playMode === 'engine') {
      applySelectedOpeningMoves();
      if (stockfishWhiteService.isReady() && stockfishBlackService.isReady()) {
        setPlayEngineStatus('Stockfish WASM: ready (white + black engines)');
      }
    } else {
      resetHumanGame();
      if (stockfishWhiteService.isReady() && stockfishBlackService.isReady()) {
        setPlayEngineStatus('Stockfish WASM: ready (human mode)');
      }
    }
  });

  playHumanSideSelect?.addEventListener('change', () => {
    if (playAutoplayRunning || playHumanThinking) {
      return;
    }
    playHumanSide = String(playHumanSideSelect.value ?? 'white') === 'black' ? 'black' : 'white';
    applyPlayPlayerNames();
    syncPlayModeUi();
    if (playMode === 'human') {
      resetHumanGame();
      if (stockfishWhiteService.isReady() && stockfishBlackService.isReady()) {
        setPlayEngineStatus('Stockfish WASM: ready (human mode)');
      }
    }
  });

  playWhiteOpeningSelect?.addEventListener('change', () => {
    if (playMode !== 'engine' || playAutoplayRunning || playHumanThinking) {
      return;
    }
    refreshBlackDefenseOptions();
    applySelectedOpeningMoves();
  });

  playBlackDefenseSelect?.addEventListener('change', () => {
    if (playMode !== 'engine' || playAutoplayRunning || playHumanThinking) {
      return;
    }
    applySelectedOpeningMoves();
  });

  playAutoplayStartBtn?.addEventListener('click', async () => {
    if (playMode === 'engine') {
      await runPlayAutoplay();
      return;
    }

    resetHumanGame();
    if (humanTurnColor() === 'b') {
      await runHumanEngineReply();
    } else {
      setPlayEngineStatus('Stockfish WASM: ready • your move');
    }
  });

  playAutoplayStopBtn?.addEventListener('click', () => {
    stopPlayAutoplay();
  });

  playResetBtn?.addEventListener('click', () => {
    if (playAutoplayRunning) {
      stopPlayAutoplay({ reasonText: 'Stockfish WASM: autoplay stopped (reset)' });
    }
    if (playMode === 'engine') {
      applySelectedOpeningMoves();
      if (stockfishWhiteService.isReady() && stockfishBlackService.isReady()) {
        setPlayEngineStatus('Stockfish WASM: ready (white + black engines)');
      }
      return;
    }

    resetHumanGame();
    if (stockfishWhiteService.isReady() && stockfishBlackService.isReady()) {
      setPlayEngineStatus('Stockfish WASM: ready (human mode)');
    }
  });

  playNavStart?.addEventListener('click', () => {
    clearPlayReplayTimer();
    setPlayReplayIndex(0);
  });

  playNavPrev?.addEventListener('click', () => {
    clearPlayReplayTimer();
    setPlayReplayIndex(playReplayIndex - 1);
  });

  playNavPlay?.addEventListener('click', () => {
    togglePlayReplay();
  });

  playNavNext?.addEventListener('click', () => {
    clearPlayReplayTimer();
    setPlayReplayIndex(playReplayIndex + 1);
  });

  playNavEnd?.addEventListener('click', () => {
    clearPlayReplayTimer();
    setPlayReplayIndex(playReplayMoves.length);
  });

  playBenchmarkRunBtn?.addEventListener('click', async () => {
    await runPlayBenchmark();
  });

  playBenchmarkDownloadBtn?.addEventListener('click', () => {
    downloadPlayBenchmarkPgn();
  });

  playBoard?.addEventListener('click', async (event) => {
    const cell = event.target instanceof Element ? event.target.closest('td[data-square]') : null;
    if (!cell) {
      return;
    }

    if (playMode !== 'human' || playAutoplayRunning || playHumanThinking) {
      return;
    }

    if (playReplayIndex !== playReplayMoves.length) {
      setPlayEngineStatus('Stockfish WASM: jump to latest move to continue play');
      return;
    }

    if (playChess.isGameOver()) {
      return;
    }

    const activeHumanColor = humanTurnColor();
    if (playChess.turn() !== activeHumanColor) {
      setPlayEngineStatus('Stockfish WASM: wait for engine move');
      return;
    }

    const square = String(cell.dataset.square ?? '').toLowerCase();
    if (!square) {
      return;
    }

    if (playSelectedSquare) {
      const matchingMoves = playSelectedMoves.filter((move) => move.to === square);
      if (matchingMoves.length > 0) {
        const preferredMove =
          matchingMoves.find((move) => !move.promotion || move.promotion === 'q') ?? matchingMoves[0];

        const played = playChess.move({
          from: preferredMove.from,
          to: preferredMove.to,
          promotion: preferredMove.promotion,
        });

        if (!played) {
          clearPlaySelection();
          renderActivePlayState(currentPlayMoveLabel());
          return;
        }

        playUciMoves.push(toUciMove(played));
        clearPlaySelection();
        setPlayArrowFromMove(played);
        renderActivePlayState(played.san);
        schedulePlayArrowHide(played.san);

        if (playChess.isGameOver()) {
          recordCompletedPlayedGame();
          if (playChess.isCheckmate()) {
            const winner = playChess.turn() === 'w' ? 'Black' : 'White';
            setPlayEngineStatus(`Stockfish WASM: completed (${winner} won by checkmate)`);
          } else if (playChess.isDraw()) {
            setPlayEngineStatus('Stockfish WASM: completed (draw)');
          } else {
            setPlayEngineStatus('Stockfish WASM: completed (game over)');
          }
          return;
        }

        await runHumanEngineReply();
        return;
      }
    }

    const piece = playChess.get(square);
    if (!piece || piece.color !== activeHumanColor) {
      clearPlaySelection();
      renderActivePlayState(currentPlayMoveLabel());
      return;
    }

    const legalMoves = playChess.moves({ square, verbose: true });
    if (!Array.isArray(legalMoves) || legalMoves.length === 0) {
      clearPlaySelection();
      renderActivePlayState(currentPlayMoveLabel());
      return;
    }

    playSelectedSquare = square;
    playSelectedMoves = legalMoves;
    renderActivePlayState(currentPlayMoveLabel());
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

  const refillGameSelectOptions = () => {
    if (!gameSelect) {
      return;
    }

    gameSelect.innerHTML = '';
    for (const game of games) {
      const opt = document.createElement('option');
      opt.value = String(game.id);
      opt.textContent = `${game.white_player} vs ${game.black_player} | ${game.event}`;
      gameSelect.appendChild(opt);
    }
  };

  const applyDbToUi = (nextDb, { sourceLabel, elapsedMs = 0, fileSizeLabel = null } = {}) => {
    db = nextDb;
    games = db.listGames();
    if (games.length === 0) {
      throw new Error('No valid games found in selected PGN.');
    }

    gamesById = new Map(games.map((game) => [Number(game.id), game]));
    searchTable = precomputeSearchTable(games);
    searchMatchedRows = searchTable.rows;
    searchCountPage = 0;
    const refreshedEcoLines = db.listEcoLines();
    ecoClassifier = createEcoClassifier(refreshedEcoLines);
    setPlayOpeningCatalog(refreshedEcoLines);

    refillGameSelectOptions();
    vectorAdapter.upsertGames(games);
    graphAdapter.indexGames(games.slice(0, 20));

    benchmarkHasRun = false;
    setBenchmarkPanelVisible(false);
    setBenchmarkModeLabel('Idle');

    if (loadProgressText) {
      loadProgressText.textContent = `${sourceLabel}: loaded ${games.length} / ${games.length} games`;
    }

    setDatasetLoadInfo({
      sourceLabel,
      totalGames: games.length,
      elapsedMs,
      fileSizeLabel,
    });

    gameSelect.value = String(games[0]?.id ?? 0);
    loadReplay();
    updateSearchResults();
  };

  const importPgnFile = async (file) => {
    if (!file) {
      return;
    }

    const fileName = String(file.name ?? '').toLowerCase();
    if (!fileName.endsWith('.pgn')) {
      const message = 'Invalid file type. Please upload a .pgn file.';
      if (pgnImportStatus) {
        pgnImportStatus.textContent = message;
      }
      statusEl.textContent = message;
      return;
    }

    if (file.size > MAX_PGN_FILE_BYTES) {
      const message = 'File too large. Maximum PGN size is 100 MB.';
      if (pgnImportStatus) {
        pgnImportStatus.textContent = message;
      }
      statusEl.textContent = message;
      return;
    }

    try {
      setReplayControlsDisabled(true);
      const importStartedAt = performance.now();
      const fileSizeLabel = formatFileSize(file.size);
      if (pgnImportStatus) {
        pgnImportStatus.textContent = `Importing ${file.name} (${fileSizeLabel})...`;
      }
      statusEl.textContent = `Importing ${file.name} (${fileSizeLabel})...`;

      const pgnText = await file.text();
      const uploadDb = await createGameDbFromPgn({
        pgnText,
        cacheKey: `${file.name}-${file.size}-${file.lastModified}`,
        onProgress: (progress) => {
          if (!pgnImportStatus) {
            return;
          }

          if (progress.phase === 'parse') {
            const loaded = Number(progress.loaded ?? 0);
            const total = Number(progress.total ?? 0);
            const elapsed = formatElapsedMs(performance.now() - importStartedAt);
            pgnImportStatus.textContent = `Parsing ${file.name} (${fileSizeLabel})... ${loaded}/${total} • ${elapsed}`;
            return;
          }

          if (progress.phase === 'games') {
            const total = Number(progress.total ?? 0);
            const elapsed = formatElapsedMs(performance.now() - importStartedAt);
            pgnImportStatus.textContent = `Preparing in-memory SQLite... loaded ${total} games • ${elapsed}`;
          }
        },
      });

      activeDataset = {
        id: 'uploaded',
        label: `Uploaded (${file.name})`,
        dbUrl: 'memory',
      };
      const elapsedMs = performance.now() - importStartedAt;
      applyDbToUi(uploadDb, {
        sourceLabel: activeDataset.label,
        elapsedMs,
        fileSizeLabel,
      });
      closeSearchModal();

      const elapsed = formatElapsedMs(elapsedMs);
      const success = `Loaded ${activeDataset.label}: ${games.length} games • ${fileSizeLabel} • ${elapsed}`;
      statusEl.textContent = success;
      if (pgnImportStatus) {
        pgnImportStatus.textContent = success;
      }
      if (loadProgressText) {
        loadProgressText.textContent = `${activeDataset.label}: loaded ${games.length} / ${games.length} games • ${fileSizeLabel} • ${elapsed}`;
      }
    } catch (error) {
      const message = `PGN import failed: ${error?.message ?? 'Invalid PGN'}`;
      statusEl.textContent = message;
      if (pgnImportStatus) {
        pgnImportStatus.textContent = message;
      }
    } finally {
      setReplayControlsDisabled(false);
      if (pgnFileInput) {
        pgnFileInput.value = '';
      }
    }
  };

  const setSearchTab = (tab) => {
    activeSearchTab = tab === 'counts' || tab === 'upload' ? tab : 'filters';
    const isFilters = activeSearchTab === 'filters';
    const isCounts = activeSearchTab === 'counts';
    const isUpload = activeSearchTab === 'upload';

    searchTabFilters?.classList.toggle('isActive', isFilters);
    searchTabCounts?.classList.toggle('isActive', isCounts);
    searchTabUpload?.classList.toggle('isActive', isUpload);
    searchTabPanelFilters?.classList.toggle('hidden', !isFilters);
    searchTabPanelCounts?.classList.toggle('hidden', !isCounts);
    searchTabPanelUpload?.classList.toggle('hidden', !isUpload);
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

  const openSearchModal = (initialTab = 'filters') => {
    if (!searchModal) {
      return;
    }

    setSelectOptions(searchWhite, searchTable.whites);
    setSelectOptions(searchBlack, searchTable.blacks);
    setSelectOptions(searchYear, searchTable.years);
    searchCountPage = 0;
    setSearchTab(initialTab);
    if (pgnImportStatus) {
      pgnImportStatus.textContent = 'No file selected.';
    }
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
    if (themeSelect) {
      themeSelect.disabled = disabled;
    }
    if (playerDatasetSelect) {
      playerDatasetSelect.disabled = disabled;
    }
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
    if (uploadPgnOpen) {
      uploadPgnOpen.disabled = disabled;
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

  const setBenchmarkPanelVisible = (visible) => {
    benchmarkPanel?.classList.toggle('hidden', !visible);
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
      row.mps.textContent = `Moves/s: ${formatGroupedDecimal(mps)}`;
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
    benchmarkHasRun = true;
    setBenchmarkPanelVisible(true);
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
    benchmarkHasRun = true;
    setBenchmarkPanelVisible(true);
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
  searchModalOpen?.addEventListener('click', () => openSearchModal('filters'));
  uploadPgnOpen?.addEventListener('click', () => openSearchModal('upload'));
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
  searchTabUpload?.addEventListener('click', () => setSearchTab('upload'));
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

  pgnFileInput?.addEventListener('change', async (event) => {
    const file = event.target?.files?.[0];
    await importPgnFile(file);
  });

  pgnDropZone?.addEventListener('dragover', (event) => {
    event.preventDefault();
    pgnDropZone.classList.add('isDragOver');
  });

  pgnDropZone?.addEventListener('dragleave', () => {
    pgnDropZone.classList.remove('isDragOver');
  });

  pgnDropZone?.addEventListener('drop', async (event) => {
    event.preventDefault();
    pgnDropZone.classList.remove('isDragOver');
    const file = event.dataTransfer?.files?.[0];
    await importPgnFile(file);
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
  benchmarkHideBtn?.addEventListener('click', () => {
    setBenchmarkPanelVisible(false);
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

  setBenchmarkPanelVisible(benchmarkHasRun);
  syncPlayModeUi();
  if (playMode === 'engine') {
    applySelectedOpeningMoves();
  } else {
    resetHumanGame();
  }

  gameSelect.value = String(games[0]?.id ?? 0);
  loadReplay();
  updateOpeningInfo();
}

bootstrap().catch((error) => {
  const statusEl = document.querySelector('#status');
  if (statusEl) {
    statusEl.textContent = `Startup failed: ${error.message}`;
  }
});
