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

function rowsFromQuery(db, sql) {
  const stmt = db.prepare(sql);
  const rows = [];

  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }

  stmt.free();
  return rows;
}

async function fetchSqliteBytes(dbUrl, onProgress) {
  const response = await fetch(dbUrl, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to fetch SQLite DB: ${response.status}`);
  }

  const totalBytes = Number(response.headers.get('content-length') ?? 0);
  if (!response.body || totalBytes === 0) {
    const fallback = new Uint8Array(await response.arrayBuffer());
    if (onProgress) {
      onProgress({ phase: 'download', loadedBytes: fallback.length, totalBytes: fallback.length });
    }
    return fallback;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let loadedBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (!value) {
      continue;
    }

    chunks.push(value);
    loadedBytes += value.length;
    if (onProgress) {
      onProgress({ phase: 'download', loadedBytes, totalBytes });
    }
  }

  const merged = new Uint8Array(loadedBytes);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }

  return merged;
}

function assertSqliteSignature(bytes) {
  const signature = [
    0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6f, 0x72, 0x6d, 0x61, 0x74, 0x20, 0x33,
    0x00,
  ];

  if (!bytes || bytes.length < signature.length) {
    throw new Error('Downloaded DB is empty or truncated');
  }

  for (let index = 0; index < signature.length; index += 1) {
    if (bytes[index] !== signature[index]) {
      throw new Error('Downloaded file is not a valid SQLite database');
    }
  }
}

async function openDbFromUrl(SQL, dbUrl, onProgress) {
  const dbBytes = await fetchSqliteBytes(dbUrl, onProgress);
  assertSqliteSignature(dbBytes);
  return new SQL.Database(dbBytes);
}

function countGames(db) {
  const stmt = db.prepare('SELECT COUNT(*) AS total FROM games');
  let totalGames = 0;
  if (stmt.step()) {
    const row = stmt.getAsObject();
    totalGames = Number(row.total ?? 0);
  }
  stmt.free();
  return totalGames;
}

export async function createGameDb({ dbUrl = '/data/anand.sqlite', onProgress }) {
  const SQL = await initSqlJs({
    locateFile: (file) => `/node_modules/sql.js/dist/${file}`,
  });

  let db = await openDbFromUrl(SQL, dbUrl, onProgress);
  const cache = new MiniRedisCache('games-v3');

  db.run(DB_SCHEMA);

  let totalGames = countGames(db);
  if (totalGames === 0) {
    db.close();
    const bustUrl = `${dbUrl}${dbUrl.includes('?') ? '&' : '?'}v=${Date.now()}`;
    db = await openDbFromUrl(SQL, bustUrl, onProgress);
    db.run(DB_SCHEMA);
    totalGames = countGames(db);
  }

  if (totalGames === 0) {
    throw new Error('SQLite loaded but contains 0 games. Run npm run db:build and restart dev server.');
  }

  if (onProgress) {
    onProgress({ phase: 'games', loaded: totalGames, total: totalGames });
  }

  return {
    listGames() {
      const cached = cache.get('all');
      if (Array.isArray(cached) && cached.length > 0) {
        return cached;
      }

      if (Array.isArray(cached) && cached.length === 0 && totalGames === 0) {
        return cached;
      }

      const rows = rowsFromQuery(
        db,
        `
          SELECT id, event, white_player, black_player, result, move_count
          FROM games
          ORDER BY id
        `,
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

      const row = rowsFromQuery(
        db,
        `
          SELECT moves_json, fens_json
          FROM games
          WHERE id = ${Number(id)}
          LIMIT 1
        `,
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
