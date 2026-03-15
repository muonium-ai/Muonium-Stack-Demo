import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, 'node_modules', 'sql.js', 'dist');
const DEST_DIR = path.join(ROOT, 'public');
const FILES = ['sql-wasm.wasm', 'sql-wasm-browser.wasm'];

async function main() {
  for (const file of FILES) {
    await fs.copyFile(path.join(SRC_DIR, file), path.join(DEST_DIR, file));
  }
  console.log(`sql:sync -> copied ${FILES.join(', ')} to public/`);
}

main().catch((error) => {
  console.error(`sql:sync failed: ${error.message}`);
  process.exit(1);
});
