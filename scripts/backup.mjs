/**
 * Back up the EmDash runtime data.
 *
 * The database is snapshotted with `VACUUM INTO`, which writes a consistent,
 * fully-checkpointed copy while the app keeps running in WAL mode. Media files
 * are archived separately. Both land in `storage/backups/` so they survive
 * code deploys, and old files are pruned by age.
 *
 * Usage: node scripts/backup.mjs
 *
 * Environment:
 *   EMDASH_STORAGE_DIR            runtime data directory (default: storage)
 *   EMDASH_DB_PATH                database path (default: <storage>/data.db)
 *   EMDASH_BACKUP_RETENTION_DAYS  days to keep (default: 14)
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const RETENTION_DAYS = Number(process.env.EMDASH_BACKUP_RETENTION_DAYS ?? 14);
const DAY_MS = 24 * 60 * 60 * 1000;

const storageDir = resolvePath(process.env.EMDASH_STORAGE_DIR ?? "storage");
const dbPath = resolvePath(process.env.EMDASH_DB_PATH ?? join(storageDir, "data.db"));
const backupDir = join(storageDir, "backups");
const stamp = new Date().toISOString().slice(0, 10);

function resolvePath(path) {
	return isAbsolute(path) ? path : resolve(ROOT, path);
}

function fail(message) {
	console.error(`[backup] ${message}`);
	process.exit(1);
}

function sizeOf(path) {
	const bytes = statSync(path).size;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function escapeSqlString(value) {
	return value.replace(/'/g, "''");
}

if (!Number.isFinite(RETENTION_DAYS) || RETENTION_DAYS < 1) {
	fail(`EMDASH_BACKUP_RETENTION_DAYS must be a positive number, got "${process.env.EMDASH_BACKUP_RETENTION_DAYS}"`);
}

if (!existsSync(dbPath)) {
	fail(`database not found at ${dbPath}`);
}

mkdirSync(backupDir, { recursive: true });

// --- Database snapshot -------------------------------------------------------

const dbTarget = join(backupDir, `data-${stamp}.db`);

for (const stale of [dbTarget, `${dbTarget}-wal`, `${dbTarget}-shm`]) {
	rmSync(stale, { force: true });
}

const db = new DatabaseSync(dbPath);
try {
	// Match the app's connection: wait briefly instead of failing when the
	// running release is writing.
	db.exec("PRAGMA busy_timeout = 5000");
	db.exec(`VACUUM INTO '${escapeSqlString(dbTarget)}'`);
} catch (error) {
	fail(`VACUUM INTO failed: ${error.message}`);
} finally {
	db.close();
}

const check = new DatabaseSync(dbTarget, { readOnly: true });
try {
	const row = check.prepare("PRAGMA integrity_check").get();
	const result = row?.integrity_check;
	if (result !== "ok") {
		fail(`integrity check failed on ${dbTarget}: ${result ?? "no result"}`);
	}
} finally {
	check.close();
}

console.log(`[backup] database  ${dbTarget} (${sizeOf(dbTarget)})`);

// --- Media archive -----------------------------------------------------------

const uploadsDir = join(storageDir, "uploads");
let mediaCount = 0;

if (existsSync(uploadsDir)) {
	mediaCount = readdirSync(uploadsDir, { recursive: true }).length;
}

if (mediaCount > 0) {
	const archiveTarget = join(backupDir, `uploads-${stamp}.tar.gz`);
	rmSync(archiveTarget, { force: true });

	const tar = spawnSync("tar", ["-czf", archiveTarget, "-C", storageDir, "uploads"], {
		stdio: "inherit",
	});

	if (tar.error) {
		fail(`tar failed: ${tar.error.message}`);
	}
	if (tar.status !== 0) {
		fail(`tar exited with status ${tar.status}`);
	}

	console.log(`[backup] uploads   ${archiveTarget} (${sizeOf(archiveTarget)})`);
} else {
	console.log("[backup] uploads   skipped, storage/uploads is empty or missing");
}

// --- Retention ---------------------------------------------------------------

const cutoff = Date.now() - RETENTION_DAYS * DAY_MS;
const backupPattern = /^(data|uploads)-.*\.(db|tar\.gz)$/;
let pruned = 0;

for (const name of readdirSync(backupDir)) {
	if (!backupPattern.test(name)) continue;

	const fullPath = join(backupDir, name);
	if (statSync(fullPath).mtimeMs >= cutoff) continue;

	rmSync(fullPath, { force: true });
	pruned += 1;
}

console.log(
	`[backup] retention removed ${pruned} file(s) older than ${RETENTION_DAYS} day(s) from ${backupDir}`,
);
