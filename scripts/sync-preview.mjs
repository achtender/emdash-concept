/**
 * Rebuild the preview site's content from the committed seed.
 *
 * Run this only on the preview/staging site, after the release is built and
 * before traffic switches to it. It upserts schema, settings, menus, and content
 * from `seed/seed.json` and copies `seed/uploads` into the shared storage, so the
 * preview mirrors the commit that is being deployed.
 *
 * It never touches users or passkeys, so the preview admin account survives.
 * It must never run against production: once a site is live, the database is the
 * source of truth and this script would overwrite customer edits.
 *
 * Usage: node scripts/sync-preview.mjs
 *
 * Environment:
 *   EMDASH_STORAGE_DIR  runtime data directory (default: storage)
 *   EMDASH_DB_PATH      database path (default: <storage>/data.db)
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdirSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CLI = join(ROOT, "node_modules", "emdash", "dist", "cli", "index.mjs");
const seedPath = join(ROOT, "seed", "seed.json");
const seedMediaDir = join(ROOT, "seed", "uploads");

const storageDir = resolvePath(process.env.EMDASH_STORAGE_DIR ?? "storage");
const dbPath = resolvePath(process.env.EMDASH_DB_PATH ?? join(storageDir, "data.db"));
const uploadsDir = join(storageDir, "uploads");

function resolvePath(path) {
	return isAbsolute(path) ? path : resolve(ROOT, path);
}

function fail(message) {
	console.error(`[sync-preview] ${message}`);
	process.exit(1);
}

// Create the storage tree before seeding: `emdash seed` needs the database's
// parent directory, and the uploads copy needs a destination.
mkdirSync(uploadsDir, { recursive: true });

const shared = lstatSync(storageDir).isSymbolicLink();
console.log(
	`[sync-preview] storage ${storageDir} (${shared ? "shared across releases" : "local to this release"})`,
);
console.log(`[sync-preview] database ${dbPath}`);

if (!existsSync(seedPath)) {
	fail(`seed not found at ${seedPath}. Run "yarn content:export" and commit the result.`);
}

if (!existsSync(CLI)) {
	fail(`EmDash CLI not found at ${CLI}. Run yarn install first.`);
}

if (existsSync(seedMediaDir)) {
	cpSync(seedMediaDir, uploadsDir, { recursive: true });
	console.log(`[sync-preview] copied ${seedMediaDir} to ${uploadsDir}`);
}

const seeded = spawnSync(
	process.execPath,
	[
		CLI,
		"seed",
		seedPath,
		"--database",
		dbPath,
		"--uploads-dir",
		uploadsDir,
		"--on-conflict",
		"update",
	],
	{ cwd: ROOT, stdio: "inherit" },
);

if (seeded.error) {
	fail(`seed failed: ${seeded.error.message}`);
}
if (seeded.status !== 0) {
	fail(`seed exited with status ${seeded.status}`);
}

console.log(`[sync-preview] preview content synced from ${seedPath}`);
