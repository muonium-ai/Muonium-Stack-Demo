import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, 'node_modules', 'stockfish.wasm');
const DEST_DIR = path.join(ROOT, 'public', 'stockfish');
const FILES = ['stockfish.js', 'stockfish.worker.js', 'stockfish.wasm'];

async function main() {
  await fs.mkdir(DEST_DIR, { recursive: true });

  for (const fileName of FILES) {
    const src = path.join(SRC_DIR, fileName);
    const dest = path.join(DEST_DIR, fileName);
    await fs.copyFile(src, dest);
  }

  console.log(`stockfish:sync -> copied ${FILES.length} files to ${DEST_DIR}`);
}

main().catch((error) => {
  console.error(`stockfish:sync failed: ${error.message}`);
  process.exit(1);
});
