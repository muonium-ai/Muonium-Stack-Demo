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

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

function isPieceWhite(piece) {
  return piece && piece === piece.toUpperCase();
}

function indexToSquare(index) {
  const file = FILES[index % 8] ?? 'a';
  const rank = 8 - Math.floor(index / 8);
  return `${file}${rank}`;
}

function squareToIndex(square) {
  if (!square || square.length < 2) {
    return -1;
  }

  const file = FILES.indexOf(square[0]);
  const rank = Number(square[1]);
  if (file < 0 || Number.isNaN(rank) || rank < 1 || rank > 8) {
    return -1;
  }

  const row = 8 - rank;
  return row * 8 + file;
}

function flattenFenBoard(fen) {
  const boardPart = (fen ?? '').split(' ')[0] ?? '';
  const squares = [];

  for (const ch of boardPart) {
    if (ch === '/') {
      continue;
    }
    if (/\d/.test(ch)) {
      const count = Number(ch);
      for (let index = 0; index < count; index += 1) {
        squares.push('');
      }
    } else {
      squares.push(ch);
    }
  }

  while (squares.length < 64) {
    squares.push('');
  }

  return squares.slice(0, 64);
}

function detectMoveArrow(prevFen, nextFen) {
  if (!prevFen || !nextFen || prevFen === nextFen) {
    return null;
  }

  const prev = flattenFenBoard(prevFen);
  const next = flattenFenBoard(nextFen);
  const changed = [];
  for (let index = 0; index < 64; index += 1) {
    if ((prev[index] ?? '') !== (next[index] ?? '')) {
      changed.push(index);
    }
  }

  if (changed.length < 2) {
    return null;
  }

  const fromCandidates = changed.filter((index) => {
    const before = prev[index] ?? '';
    const after = next[index] ?? '';
    if (!before) {
      return false;
    }
    if (!after) {
      return true;
    }
    return isPieceWhite(before) !== isPieceWhite(after);
  });

  const toCandidates = changed.filter((index) => {
    const before = prev[index] ?? '';
    const after = next[index] ?? '';
    if (!after) {
      return false;
    }
    if (!before) {
      return true;
    }
    if (isPieceWhite(before) !== isPieceWhite(after)) {
      return true;
    }
    return before.toLowerCase() !== after.toLowerCase();
  });

  if (fromCandidates.length === 0 || toCandidates.length === 0) {
    return null;
  }

  let fromIndex = fromCandidates[0];
  let toIndex = toCandidates[0];

  const kingDestination = toCandidates.find((index) => {
    const piece = next[index] ?? '';
    return piece === 'K' || piece === 'k';
  });

  if (kingDestination !== undefined) {
    const movingKing = next[kingDestination];
    const kingStart = fromCandidates.find((index) => (prev[index] ?? '') === movingKing);
    if (kingStart !== undefined) {
      fromIndex = kingStart;
      toIndex = kingDestination;
    }
  } else {
    const movingPiece = prev[fromIndex] ?? '';
    const movingColor = movingPiece ? isPieceWhite(movingPiece) : null;
    const sameColorDestination = toCandidates.find((index) => {
      const piece = next[index] ?? '';
      return piece && movingColor !== null && isPieceWhite(piece) === movingColor;
    });
    if (sameColorDestination !== undefined) {
      toIndex = sameColorDestination;
    }
  }

  return {
    from: indexToSquare(fromIndex),
    to: indexToSquare(toIndex),
  };
}

function createBoardRenderer(boardEl) {
  const svgNs = 'http://www.w3.org/2000/svg';
  const squareEls = [];
  const state = {
    table: null,
    arrowSvg: null,
    arrowLine: null,
    lastSquares: Array.from({ length: 64 }, () => null),
  };

  const table = document.createElement('table');
  const tbody = document.createElement('tbody');

  for (let rank = 0; rank < 8; rank += 1) {
    const tr = document.createElement('tr');
    for (let file = 0; file < 8; file += 1) {
      const td = document.createElement('td');
      td.className = (rank + file) % 2 === 0 ? 'light' : 'dark';
      tr.appendChild(td);
      squareEls.push(td);
    }
    tbody.appendChild(tr);
  }

  table.appendChild(tbody);

  const svg = document.createElementNS(svgNs, 'svg');
  svg.setAttribute('class', 'moveArrowOverlay');

  const defs = document.createElementNS(svgNs, 'defs');
  const marker = document.createElementNS(svgNs, 'marker');
  marker.setAttribute('id', 'move-arrow-head');
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
  svg.appendChild(defs);

  const line = document.createElementNS(svgNs, 'line');
  line.setAttribute('stroke', '#2563eb');
  line.setAttribute('stroke-width', '6');
  line.setAttribute('stroke-linecap', 'round');
  line.setAttribute('stroke-opacity', '0.85');
  line.setAttribute('marker-end', 'url(#move-arrow-head)');
  line.style.display = 'none';
  svg.appendChild(line);

  boardEl.innerHTML = '';
  boardEl.appendChild(table);
  boardEl.appendChild(svg);

  state.table = table;
  state.arrowSvg = svg;
  state.arrowLine = line;

  return {
    renderBoard(fen) {
      const squares = flattenFenBoard(fen);
      for (let index = 0; index < 64; index += 1) {
        const piece = squares[index] ?? '';
        if (state.lastSquares[index] === piece) {
          continue;
        }
        if (!piece) {
          squareEls[index].textContent = '';
        } else {
          const span = document.createElement('span');
          span.className = `boardPiece ${isPieceWhite(piece) ? 'white' : 'black'}`;
          span.textContent = PIECE_TO_UNICODE[piece] ?? '';
          squareEls[index].replaceChildren(span);
        }
        state.lastSquares[index] = piece;
      }
    },
    renderArrow(arrow) {
      if (!arrow?.from || !arrow?.to || !state.arrowLine || !state.arrowSvg || !state.table) {
        if (state.arrowLine) {
          state.arrowLine.style.display = 'none';
        }
        return;
      }

      const fromIndex = squareToIndex(arrow.from);
      const toIndex = squareToIndex(arrow.to);
      if (fromIndex < 0 || toIndex < 0) {
        state.arrowLine.style.display = 'none';
        return;
      }

      const boardSize = state.table.offsetWidth;
      if (!boardSize) {
        state.arrowLine.style.display = 'none';
        return;
      }

      const cellSize = boardSize / 8;
      const fromFile = fromIndex % 8;
      const fromRank = Math.floor(fromIndex / 8);
      const toFile = toIndex % 8;
      const toRank = Math.floor(toIndex / 8);

      const x1 = fromFile * cellSize + cellSize / 2;
      const y1 = fromRank * cellSize + cellSize / 2;
      const x2 = toFile * cellSize + cellSize / 2;
      const y2 = toRank * cellSize + cellSize / 2;

      state.arrowSvg.setAttribute('viewBox', `0 0 ${boardSize} ${boardSize}`);
      state.arrowLine.setAttribute('x1', String(x1));
      state.arrowLine.setAttribute('y1', String(y1));
      state.arrowLine.setAttribute('x2', String(x2));
      state.arrowLine.setAttribute('y2', String(y2));
      state.arrowLine.style.display = 'block';
    },
    hideArrow() {
      if (state.arrowLine) {
        state.arrowLine.style.display = 'none';
      }
    },
  };
}

export function createReplayer({ boardEl, statusEl, getEmptyMessage, onUpdate, onPlayState }) {
  const boardRenderer = createBoardRenderer(boardEl);
  let currentReplay = { moves: [], fens: [] };
  let moveIndex = 0;
  let timer = null;
  let playing = false;
  let paintVersion = 0;
  let speedMs = 600;
  let showMoveArrow = true;
  let moveArrowDurationMs = 120;

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function paint({ animate = true } = {}) {
    const version = ++paintVersion;
    const fen = currentReplay.fens[moveIndex] ?? currentReplay.fens[0];
    if (!fen) {
      statusEl.textContent =
        typeof getEmptyMessage === 'function' ? getEmptyMessage() : 'No game loaded';
      return;
    }

    if (animate && showMoveArrow && moveArrowDurationMs > 0 && moveIndex > 0) {
      const prevFen = currentReplay.fens[moveIndex - 1];
      const arrow = detectMoveArrow(prevFen, fen);
      if (prevFen && arrow) {
        boardRenderer.renderBoard(prevFen);
        boardRenderer.renderArrow(arrow);
        await sleep(moveArrowDurationMs);
        if (version !== paintVersion) {
          return;
        }
      }
    }

    boardRenderer.renderBoard(fen);
    boardRenderer.hideArrow();
    const moveText = moveIndex === 0 ? 'start' : currentReplay.moves[moveIndex - 1] ?? '';
    statusEl.textContent = `Move ${moveIndex}/${currentReplay.moves.length} - ${moveText}`;

    if (typeof onUpdate === 'function') {
      onUpdate({
        moveIndex,
        totalMoves: currentReplay.moves.length,
        moveText,
        fen,
        moves: currentReplay.moves,
        isComplete: moveIndex >= currentReplay.moves.length,
      });
    }
  }

  function stop() {
    paintVersion += 1;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (playing) {
      playing = false;
      if (typeof onPlayState === 'function') {
        onPlayState(false);
      }
    }
  }

  function play() {
    stop();
    if (moveIndex >= currentReplay.moves.length) {
      moveIndex = 0;
      paint({ animate: false });
    }

    playing = true;

    if (typeof onPlayState === 'function') {
      onPlayState(true);
    }

    const tick = async () => {
      timer = null;
      if (!playing) {
        return;
      }
      if (moveIndex >= currentReplay.moves.length) {
        stop();
        return;
      }

      moveIndex += 1;
      await paint({ animate: true });

      if (!playing) {
        return;
      }
      timer = setTimeout(tick, speedMs);
    };

    timer = setTimeout(tick, speedMs);
  }

  function start() {
    stop();
    moveIndex = 0;
    paint({ animate: false });
  }

  function end() {
    stop();
    moveIndex = currentReplay.moves.length;
    paint({ animate: false });
  }

  function prev() {
    stop();
    moveIndex = Math.max(0, moveIndex - 1);
    paint({ animate: false });
  }

  function next() {
    stop();
    moveIndex = Math.min(currentReplay.moves.length, moveIndex + 1);
    paint({ animate: true });
  }

  function togglePlay() {
    if (timer) {
      stop();
    } else {
      play();
    }
  }

  return {
    loadReplay(replay) {
      stop();
      currentReplay = replay;
      moveIndex = 0;
      paint({ animate: false });
    },
    play,
    togglePlay,
    start,
    end,
    prev,
    next,
    pause: stop,
    reset() {
      stop();
      moveIndex = 0;
      paint({ animate: false });
    },
    setSpeed(speed) {
      speedMs = Number(speed);
      if (timer) {
        play();
      }
    },
    setMove(index) {
      moveIndex = Number(index);
      return paint({ animate: true });
    },
    setMoveArrowEnabled(enabled) {
      showMoveArrow = Boolean(enabled);
    },
    setMoveArrowDuration(ms) {
      moveArrowDurationMs = Math.max(0, Number(ms) || 0);
    },
    isPlaying() {
      return playing;
    },
  };
}
