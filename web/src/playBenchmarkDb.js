import initSqlJs from 'sql.js';

const PLAY_BENCHMARK_SCHEMA = `
CREATE TABLE IF NOT EXISTS benchmark_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL,
  depth INTEGER NOT NULL,
  target_games INTEGER NOT NULL,
  completed_games INTEGER NOT NULL DEFAULT 0,
  total_moves INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS benchmark_games (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  game_index INTEGER NOT NULL,
  result TEXT NOT NULL,
  ply_count INTEGER NOT NULL,
  pgn_text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(run_id) REFERENCES benchmark_runs(id)
);

CREATE TABLE IF NOT EXISTS benchmark_moves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL,
  game_id INTEGER NOT NULL,
  ply INTEGER NOT NULL,
  side TEXT NOT NULL,
  uci_move TEXT NOT NULL,
  san_move TEXT NOT NULL,
  fen_after TEXT NOT NULL,
  FOREIGN KEY(run_id) REFERENCES benchmark_runs(id),
  FOREIGN KEY(game_id) REFERENCES benchmark_games(id)
);
`;

function toIsoNow() {
  return new Date().toISOString();
}

export async function createPlayBenchmarkDb() {
  const SQL = await initSqlJs({
    locateFile: (file) => `${import.meta.env.BASE_URL}${file}`,
  });

  const db = new SQL.Database();
  db.run(PLAY_BENCHMARK_SCHEMA);

  const createRun = ({ depth, targetGames }) => {
    const stmt = db.prepare(
      `
        INSERT INTO benchmark_runs (created_at, depth, target_games, completed_games, total_moves)
        VALUES (?, ?, ?, 0, 0)
      `,
    );
    stmt.run([toIsoNow(), Number(depth) || 0, Math.max(1, Number(targetGames) || 1)]);
    stmt.free();

    const idQuery = db.exec('SELECT last_insert_rowid() AS id');
    return Number(idQuery?.[0]?.values?.[0]?.[0] ?? 0);
  };

  const recordCompletedGame = ({ runId, gameIndex, result, pgnText, moves }) => {
    const safeMoves = Array.isArray(moves) ? moves : [];

    const insertGameStmt = db.prepare(
      `
        INSERT INTO benchmark_games (run_id, game_index, result, ply_count, pgn_text, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
    );
    insertGameStmt.run([
      Number(runId) || 0,
      Number(gameIndex) || 0,
      String(result || '*'),
      safeMoves.length,
      String(pgnText || ''),
      toIsoNow(),
    ]);
    insertGameStmt.free();

    const gameIdQuery = db.exec('SELECT last_insert_rowid() AS id');
    const gameId = Number(gameIdQuery?.[0]?.values?.[0]?.[0] ?? 0);

    const insertMoveStmt = db.prepare(
      `
        INSERT INTO benchmark_moves (run_id, game_id, ply, side, uci_move, san_move, fen_after)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
    );

    for (const move of safeMoves) {
      insertMoveStmt.run([
        Number(runId) || 0,
        gameId,
        Number(move.ply) || 0,
        String(move.side || ''),
        String(move.uci || ''),
        String(move.san || ''),
        String(move.fen || ''),
      ]);
    }

    insertMoveStmt.free();

    const updateRunStmt = db.prepare(
      `
        UPDATE benchmark_runs
        SET completed_games = completed_games + 1,
            total_moves = total_moves + ?
        WHERE id = ?
      `,
    );
    updateRunStmt.run([safeMoves.length, Number(runId) || 0]);
    updateRunStmt.free();

    return gameId;
  };

  const getLatestRunSummary = () => {
    const rows = db.exec(
      `
        SELECT id, depth, target_games, completed_games, total_moves
        FROM benchmark_runs
        ORDER BY id DESC
        LIMIT 1
      `,
    );

    if (!rows?.[0]?.values?.length) {
      return null;
    }

    const [id, depth, targetGames, completedGames, totalMoves] = rows[0].values[0];
    return {
      id: Number(id),
      depth: Number(depth),
      targetGames: Number(targetGames),
      completedGames: Number(completedGames),
      totalMoves: Number(totalMoves),
    };
  };

  const getAllGamesAsPgn = () => {
    const rows = db.exec(
      `
        SELECT pgn_text
        FROM benchmark_games
        ORDER BY run_id ASC, game_index ASC, id ASC
      `,
    );

    if (!rows?.[0]?.values?.length) {
      return '';
    }

    return rows[0].values
      .map((entry) => String(entry?.[0] ?? '').trim())
      .filter(Boolean)
      .join('\n\n');
  };

  const getTotals = () => {
    const runsResult = db.exec('SELECT COUNT(*) AS count FROM benchmark_runs');
    const gamesResult = db.exec('SELECT COUNT(*) AS count FROM benchmark_games');
    const movesResult = db.exec('SELECT COUNT(*) AS count FROM benchmark_moves');

    return {
      runs: Number(runsResult?.[0]?.values?.[0]?.[0] ?? 0),
      games: Number(gamesResult?.[0]?.values?.[0]?.[0] ?? 0),
      moves: Number(movesResult?.[0]?.values?.[0]?.[0] ?? 0),
    };
  };

  return {
    createRun,
    recordCompletedGame,
    getLatestRunSummary,
    getAllGamesAsPgn,
    getTotals,
  };
}
