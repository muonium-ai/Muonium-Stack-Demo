import initSqlJs from 'sql.js';
import { MiniRedisCache } from './cache.js';

const DB_SCHEMA = `
CREATE TABLE IF NOT EXISTS games (
  id INTEGER PRIMARY KEY,
  event TEXT,
  white_player TEXT,
  black_player TEXT,
  result TEXT,
  move_count INTEGER,
  moves_json TEXT,
  fens_json TEXT
);
`;

function rowsFromResult(result) {
  if (!result || result.length === 0) {
    return [];
  }
  const [{ columns, values }] = result;
  return values.map((row) => {
    const item = {};
    columns.forEach((column, index) => {
      item[column] = row[index];
    });
    return item;
  });
}

export async function createGameDb({ pgnText, listGames, gamePositionsJson }) {
  const SQL = await initSqlJs({
    locateFile: (file) => `/node_modules/sql.js/dist/${file}`,
  });
  const db = new SQL.Database();
  const cache = new MiniRedisCache('games');

  db.run(DB_SCHEMA);

  const existing = rowsFromResult(db.exec('SELECT COUNT(*) AS total FROM games'))[0]?.total ?? 0;
  if (existing === 0) {
    const games = JSON.parse(listGames(pgnText));
    const insertStmt = db.prepare(`
      INSERT INTO games (
        id, event, white_player, black_player, result, move_count, moves_json, fens_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const game of games) {
      const replay = JSON.parse(gamePositionsJson(pgnText, game.id));
      insertStmt.run([
        game.id,
        game.event,
        game.white,
        game.black,
        game.result,
        game.moves,
        JSON.stringify(replay.moves_san ?? []),
        JSON.stringify(replay.fens ?? []),
      ]);
    }

    insertStmt.free();
  }

  return {
    listGames() {
      const cached = cache.get('all');
      if (cached) {
        return cached;
      }

      const rows = rowsFromResult(
        db.exec(`
          SELECT id, event, white_player, black_player, result, move_count
          FROM games
          ORDER BY id
        `),
      );
      cache.set('all', rows);
      return rows;
    },

    getReplay(id) {
      const cacheKey = `replay:${id}`;
      const cached = cache.get(cacheKey);
      if (cached) {
        return cached;
      }

      const row = rowsFromResult(
        db.exec(`
          SELECT moves_json, fens_json
          FROM games
          WHERE id = ${Number(id)}
          LIMIT 1
        `),
      )[0];

      if (!row) {
        return { moves: [], fens: [] };
      }

      const replay = {
        moves: JSON.parse(row.moves_json),
        fens: JSON.parse(row.fens_json),
      };
      cache.set(cacheKey, replay);
      return replay;
    },
  };
}
