import initSqlJs from 'sql.js';
import { Chess } from 'chess.js';
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

CREATE TABLE IF NOT EXISTS eco_lines (
  id INTEGER PRIMARY KEY,
  eco_code TEXT,
  opening_name TEXT,
  variation_name TEXT,
  move_count INTEGER,
  moves_json TEXT
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

function getRegularBenchmarkSummary(db) {
  const stmt = db.prepare(`
    SELECT
      COUNT(*) AS total_games,
      COALESCE(SUM(move_count), 0) AS total_moves
    FROM games
  `);

  let summary = { totalGames: 0, totalMoves: 0 };
  if (stmt.step()) {
    const row = stmt.getAsObject();
    summary = {
      totalGames: Number(row.total_games ?? 0),
      totalMoves: Number(row.total_moves ?? 0),
    };
  }

  stmt.free();
  return summary;
}

function parseTag(block, key) {
  const needle = `[${key} "`;
  const start = block.indexOf(needle);
  if (start === -1) {
    return '?';
  }

  const valueStart = start + needle.length;
  const end = block.indexOf('"]', valueStart);
  if (end === -1) {
    return '?';
  }

  return block.slice(valueStart, end).trim() || '?';
}

function stripPgnNoise(text) {
  let out = '';
  let inComment = false;
  let variationDepth = 0;

  for (const ch of text) {
    if (ch === '{') {
      inComment = true;
      continue;
    }
    if (ch === '}') {
      inComment = false;
      continue;
    }
    if (!inComment && ch === '(') {
      variationDepth += 1;
      continue;
    }
    if (!inComment && ch === ')' && variationDepth > 0) {
      variationDepth -= 1;
      continue;
    }

    if (!inComment && variationDepth === 0) {
      out += ch;
    }
  }

  return out;
}

function parseMoves(moveText) {
  const cleaned = stripPgnNoise(moveText);

  const normalizeSan = (token) => {
    const withoutMovePrefix = token.replace(/^\d+\.(\.\.\.)?/, '');
    return withoutMovePrefix.replace(/[!?]+$/g, '');
  };

  return cleaned
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !/^\d+\.{1,3}$/.test(token))
    .filter((token) => !/^\$\d+$/.test(token))
    .filter((token) => !['1-0', '0-1', '1/2-1/2', '*'].includes(token))
    .map(normalizeSan)
    .filter(Boolean);
}

function yieldToBrowser() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function splitGamesAsync(pgnText) {
  const normalized = pgnText.replace(/\r\n/g, '\n');
  const firstEventIndex = normalized.indexOf('[Event ');
  if (firstEventIndex === -1) {
    return [];
  }

  const games = [];
  const delimiter = '\n\n[Event ';
  let chunkStart = firstEventIndex;

  while (chunkStart !== -1) {
    const nextDelimiterIndex = normalized.indexOf(delimiter, chunkStart + 7);
    const chunk =
      nextDelimiterIndex === -1
        ? normalized.slice(chunkStart)
        : normalized.slice(chunkStart, nextDelimiterIndex);

    const separator = chunk.indexOf('\n\n');
    const tagBlock = separator === -1 ? chunk : chunk.slice(0, separator);
    const moveBlock = separator === -1 ? '' : chunk.slice(separator + 2);

    const event = parseTag(tagBlock, 'Event');
    const white = parseTag(tagBlock, 'White');
    const black = parseTag(tagBlock, 'Black');
    const result = parseTag(tagBlock, 'Result');
    const moves = parseMoves(moveBlock);

    games.push({ event, white, black, result, moves });

    if (games.length % 40 === 0) {
      await yieldToBrowser();
    }

    chunkStart = nextDelimiterIndex === -1 ? -1 : nextDelimiterIndex + 2;
  }

  return games;
}

function buildReplay(moves) {
  const chess = new Chess();
  const validMoves = [];
  const fens = [chess.fen()];

  for (const san of moves) {
    try {
      const move = chess.move(san, { strict: false, sloppy: true });
      if (!move) {
        continue;
      }
      validMoves.push(san);
      fens.push(chess.fen());
    } catch {
      continue;
    }
  }

  return { validMoves, fens };
}

function createGameDbAdapter(db, cacheNamespace, totalGames) {
  const cache = new MiniRedisCache(cacheNamespace);
  const regularBenchmarkSummary = getRegularBenchmarkSummary(db);

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

    getRegularBenchmarkSummary() {
      return regularBenchmarkSummary;
    },

    listEcoLines() {
      const cached = cache.get('eco_lines');
      if (Array.isArray(cached)) {
        return cached;
      }

      const rows = rowsFromQuery(
        db,
        `
          SELECT id, eco_code, opening_name, variation_name, move_count, moves_json
          FROM eco_lines
          ORDER BY move_count ASC, id ASC
        `,
      ).map((row) => ({
        id: Number(row.id),
        eco_code: String(row.eco_code ?? ''),
        opening_name: String(row.opening_name ?? ''),
        variation_name: String(row.variation_name ?? ''),
        move_count: Number(row.move_count ?? 0),
        moves: JSON.parse(row.moves_json ?? '[]'),
      }));

      cache.set('eco_lines', rows);
      return rows;
    },
  };
}

export async function createGameDb({ dbUrl = '/data/anand.sqlite', onProgress }) {
  const SQL = await initSqlJs({
    locateFile: (file) => `/node_modules/sql.js/dist/${file}`,
  });

  let db = await openDbFromUrl(SQL, dbUrl, onProgress);
  const cacheNamespace = `games-v3:${String(dbUrl).replace(/[^a-z0-9]+/gi, '_')}`;

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

  return createGameDbAdapter(db, cacheNamespace, totalGames);
}

export async function createGameDbFromPgn({ pgnText, cacheKey = 'uploaded', onProgress }) {
  const normalizedText = String(pgnText ?? '').trim();
  if (!normalizedText) {
    throw new Error('PGN file is empty.');
  }

  const SQL = await initSqlJs({
    locateFile: (file) => `/node_modules/sql.js/dist/${file}`,
  });

  const parsedGames = await splitGamesAsync(normalizedText);
  if (parsedGames.length === 0) {
    throw new Error('Invalid PGN: no games found.');
  }

  const db = new SQL.Database();
  db.run(DB_SCHEMA);

  const stmt = db.prepare(`
    INSERT INTO games (
      id, event, white_player, black_player, result, move_count, moves_json, fens_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let insertedGames = 0;
  for (let index = 0; index < parsedGames.length; index += 1) {
    const game = parsedGames[index];
    const { validMoves, fens } = buildReplay(game.moves);
    if (validMoves.length === 0) {
      continue;
    }

    stmt.run([
      insertedGames,
      game.event,
      game.white,
      game.black,
      game.result,
      validMoves.length,
      JSON.stringify(validMoves),
      JSON.stringify(fens),
    ]);

    insertedGames += 1;
    if (onProgress && ((index + 1) % 200 === 0 || index + 1 === parsedGames.length)) {
      onProgress({ phase: 'parse', loaded: index + 1, total: parsedGames.length });
    }

    if ((index + 1) % 25 === 0) {
      await yieldToBrowser();
    }
  }

  stmt.free();

  if (insertedGames === 0) {
    throw new Error('Invalid PGN: no playable games found.');
  }

  if (onProgress) {
    onProgress({ phase: 'games', loaded: insertedGames, total: insertedGames });
  }

  return createGameDbAdapter(db, `games-v3:upload:${cacheKey}`, insertedGames);
}
