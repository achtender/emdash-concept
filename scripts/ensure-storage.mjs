/**
 * Make sure the runtime storage directories exist.
 *
 * SQLite creates the database file but not its parent directory, and the local
 * media provider expects `storage/uploads` to exist. A fresh clone has neither,
 * so this runs before `dev` and `build` (via the predev/prebuild hooks) and is
 * safe to run repeatedly.
 *
 * On xCloud the `storage` folder is shared between releases; once it exists the
 * deploy links it into the new release and this script is a no-op.
 *
 * Usage: node scripts/ensure-storage.mjs
 *
 * Environment:
 *   EMDASH_STORAGE_DIR  runtime data directory (default: storage)
 */
import { mkdirSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const storageDir = isAbsolute(process.env.EMDASH_STORAGE_DIR ?? "")
	? process.env.EMDASH_STORAGE_DIR
	: resolve(ROOT, process.env.EMDASH_STORAGE_DIR ?? "storage");

mkdirSync(storageDir, { recursive: true });
mkdirSync(join(storageDir, "uploads"), { recursive: true });

console.log(`[ensure-storage] ready at ${storageDir}`);
