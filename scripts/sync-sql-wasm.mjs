import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');
const DEST = path.join(ROOT, 'public', 'sql-wasm.wasm');

async function main() {
  await fs.copyFile(SRC, DEST);
  console.log(`sql:sync -> copied sql-wasm.wasm to public/`);
}

main().catch((error) => {
  console.error(`sql:sync failed: ${error.message}`);
  process.exit(1);
});
