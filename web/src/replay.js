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
  const boardPart = fen.split(' ')[0];
  const rows = boardPart.split('/');
  return rows.map((row) => {
    const squares = [];
    for (const ch of row) {
      if (/\d/.test(ch)) {
        for (let i = 0; i < Number(ch); i += 1) {
          squares.push('');
        }
      } else {
        squares.push(ch);
      }
    }
    return squares;
  });
}

function renderBoard(boardEl, fen) {
  const grid = parseFenBoard(fen);
  const table = document.createElement('table');
  const tbody = document.createElement('tbody');

  for (let rank = 0; rank < 8; rank += 1) {
    const tr = document.createElement('tr');
    for (let file = 0; file < 8; file += 1) {
      const td = document.createElement('td');
      td.className = (rank + file) % 2 === 0 ? 'light' : 'dark';
      const piece = grid[rank][file];
      td.textContent = piece ? PIECE_TO_UNICODE[piece] : '';
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }

  table.appendChild(tbody);
  boardEl.innerHTML = '';
  boardEl.appendChild(table);
}

export function createReplayer({ boardEl, statusEl, getEmptyMessage, onUpdate, onPlayState }) {
  let currentReplay = { moves: [], fens: [] };
  let moveIndex = 0;
  let timer = null;
  let speedMs = 600;

  function paint() {
    const fen = currentReplay.fens[moveIndex] ?? currentReplay.fens[0];
    if (!fen) {
      statusEl.textContent =
        typeof getEmptyMessage === 'function' ? getEmptyMessage() : 'No game loaded';
      return;
    }
    renderBoard(boardEl, fen);
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
    if (timer) {
      clearInterval(timer);
      timer = null;
      if (typeof onPlayState === 'function') {
        onPlayState(false);
      }
    }
  }

  function play() {
    stop();
    if (moveIndex >= currentReplay.moves.length) {
      moveIndex = 0;
      paint();
    }

    if (typeof onPlayState === 'function') {
      onPlayState(true);
    }

    timer = setInterval(() => {
      if (moveIndex >= currentReplay.moves.length) {
        stop();
        return;
      }
      moveIndex += 1;
      paint();
    }, speedMs);
  }

  function start() {
    stop();
    moveIndex = 0;
    paint();
  }

  function end() {
    stop();
    moveIndex = currentReplay.moves.length;
    paint();
  }

  function prev() {
    stop();
    moveIndex = Math.max(0, moveIndex - 1);
    paint();
  }

  function next() {
    stop();
    moveIndex = Math.min(currentReplay.moves.length, moveIndex + 1);
    paint();
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
      paint();
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
      paint();
    },
    setSpeed(speed) {
      speedMs = Number(speed);
      if (timer) {
        play();
      }
    },
    setMove(index) {
      moveIndex = Number(index);
      paint();
    },
    isPlaying() {
      return Boolean(timer);
    },
  };
}
