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

export function createReplayer({ boardEl, statusEl, moveRange }) {
  let currentReplay = { moves: [], fens: [] };
  let moveIndex = 0;
  let timer = null;
  let speedMs = 600;

  function paint() {
    const fen = currentReplay.fens[moveIndex] ?? currentReplay.fens[0];
    if (!fen) {
      statusEl.textContent = 'No game loaded';
      return;
    }
    renderBoard(boardEl, fen);
    const moveText = moveIndex === 0 ? 'start' : currentReplay.moves[moveIndex - 1] ?? '';
    statusEl.textContent = `Move ${moveIndex}/${currentReplay.moves.length} - ${moveText}`;
    moveRange.value = String(moveIndex);
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  function play() {
    stop();
    timer = setInterval(() => {
      if (moveIndex >= currentReplay.moves.length) {
        stop();
        return;
      }
      moveIndex += 1;
      paint();
    }, speedMs);
  }

  return {
    loadReplay(replay) {
      stop();
      currentReplay = replay;
      moveIndex = 0;
      moveRange.max = String(Math.max(0, replay.moves.length));
      paint();
    },
    play,
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
  };
}
