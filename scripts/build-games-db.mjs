import fs from 'node:fs/promises';
import path from 'node:path';
import initSqlJs from 'sql.js';
import { Chess } from 'chess.js';

const ROOT = process.cwd();
const PGN_PATH = path.join(ROOT, 'chess', 'games', 'Anand.pgn');
const OUT_DIR = path.join(ROOT, 'public', 'data');
const OUT_DB = path.join(OUT_DIR, 'anand.sqlite');

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
  return cleaned
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !/^\d+\.{1,3}$/.test(token))
    .filter((token) => !/^\$\d+$/.test(token))
    .filter((token) => !['1-0', '0-1', '1/2-1/2', '*'].includes(token));
}

function splitGames(pgnText) {
  const normalized = pgnText.replace(/\r\n/g, '\n');
  const chunks = normalized
    .split('\n\n[Event ')
    .map((chunk) => (chunk.startsWith('[Event ') ? chunk : `[Event ${chunk}`));

  const games = [];
  for (const chunk of chunks) {
    if (!chunk.includes('[Event ')) {
      continue;
    }

    const separator = chunk.indexOf('\n\n');
    const tagBlock = separator === -1 ? chunk : chunk.slice(0, separator);
    const moveBlock = separator === -1 ? '' : chunk.slice(separator + 2);

    const event = parseTag(tagBlock, 'Event');
    const white = parseTag(tagBlock, 'White');
    const black = parseTag(tagBlock, 'Black');
    const result = parseTag(tagBlock, 'Result');
    const moves = parseMoves(moveBlock);

    games.push({ event, white, black, result, moves });
  }

  return games;
}

function buildFens(moves) {
  const chess = new Chess();
  const fens = [chess.fen()];

  for (const san of moves) {
    try {
      const move = chess.move(san, { strict: false });
      if (!move) {
        continue;
      }
      fens.push(chess.fen());
    } catch {
      continue;
    }
  }

  return fens;
}

async function main() {
  const pgnText = await fs.readFile(PGN_PATH, 'utf8');
  const games = splitGames(pgnText);

  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run(DB_SCHEMA);
  const stmt = db.prepare(`
    INSERT INTO games (
      id, event, white_player, black_player, result, move_count, moves_json, fens_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (let index = 0; index < games.length; index += 1) {
    const game = games[index];
    const fens = buildFens(game.moves);
    stmt.run([
      index,
      game.event,
      game.white,
      game.black,
      game.result,
      game.moves.length,
      JSON.stringify(game.moves),
      JSON.stringify(fens),
    ]);
  }

  stmt.free();

  await fs.mkdir(OUT_DIR, { recursive: true });
  const dbBytes = db.export();
  await fs.writeFile(OUT_DB, Buffer.from(dbBytes));

  console.log(`Generated ${OUT_DB} with ${games.length} games.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
