/**
 * Export the local database to `seed/seed.json` (schema + content) and copy the
 * media those entries reference into `seed/uploads/`.
 *
 * The preview site is rebuilt from these two committed paths on every deploy,
 * so local development stays the source of truth without committing a live
 * SQLite file.
 *
 * Media handling: `emdash export-seed` writes site-relative media URLs. This
 * script rewrites them to `$media.file` references and copies the bytes next to
 * the seed, which is the form `emdash seed` can read without a running server.
 *
 * Usage: node scripts/export-content.mjs [outputPath]
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const CLI = join(ROOT, "node_modules", "emdash", "dist", "cli", "index.mjs");
const MEDIA_ROUTE = "/_emdash/api/media/file/";

const dbPath = resolvePath(process.env.EMDASH_DB_PATH ?? "storage/data.db");
const storageDir = resolvePath(process.env.EMDASH_STORAGE_DIR ?? "storage");
const uploadsDir = join(storageDir, "uploads");
const outPath = resolve(ROOT, process.argv[2] ?? "seed/seed.json");
const outMediaDir = join(dirname(outPath), "uploads");

const copied = new Set();
const missing = new Set();

function resolvePath(path) {
	return isAbsolute(path) ? path : resolve(ROOT, path);
}

function fail(message) {
	console.error(`[export-content] ${message}`);
	process.exit(1);
}

function copyMedia(key) {
	if (copied.has(key)) return;

	const source = join(uploadsDir, key);
	const target = join(outMediaDir, key);

	if (!existsSync(source)) {
		missing.add(key);
		return;
	}

	mkdirSync(dirname(target), { recursive: true });
	copyFileSync(source, target);
	copied.add(key);
}

function mediaKeyFromUrl(url) {
	const index = url.indexOf(MEDIA_ROUTE);
	if (index === -1) return null;
	return decodeURIComponent(url.slice(index + MEDIA_ROUTE.length));
}

function rewrite(node) {
	if (Array.isArray(node)) return node.map(rewrite);
	if (node === null || typeof node !== "object") return node;

	// Byline avatars are seeded as an existing storage key, not a download.
	if (typeof node.storageKey === "string" && node.storageKey.length > 0) {
		copyMedia(node.storageKey);
	}

	const media = node.$media;
	if (media && typeof media === "object" && typeof media.url === "string") {
		const key = mediaKeyFromUrl(media.url);
		if (key === null) {
			console.warn(`[export-content] external media left as a URL: ${media.url}`);
			return { ...node, $media: media };
		}

		copyMedia(key);
		const { url: _url, ...rest } = media;
		return { ...node, $media: { ...rest, file: `uploads/${key}` } };
	}

	const result = {};
	for (const [key, value] of Object.entries(node)) {
		result[key] = rewrite(value);
	}
	return result;
}

if (!existsSync(dbPath)) {
	fail(`database not found at ${dbPath}. Start the site once so migrations run.`);
}

if (!existsSync(CLI)) {
	fail(`EmDash CLI not found at ${CLI}. Run yarn install first.`);
}

const exported = spawnSync(
	process.execPath,
	[CLI, "export-seed", "--database", dbPath, "--with-content", "all"],
	{ cwd: ROOT, encoding: "utf8", maxBuffer: 512 * 1024 * 1024 },
);

if (exported.error) {
	fail(`export-seed failed: ${exported.error.message}`);
}
if (exported.status !== 0) {
	process.stderr.write(exported.stderr ?? "");
	fail(`export-seed exited with status ${exported.status}`);
}

let seed;
try {
	seed = JSON.parse(exported.stdout);
} catch (error) {
	fail(`could not parse export-seed output: ${error.message}`);
}

const rewritten = rewrite(seed);

// `export-seed` always writes a generic `meta` block. Keep the committed one so
// the site name and description survive a content export.
if (existsSync(outPath)) {
	try {
		const previous = JSON.parse(readFileSync(outPath, "utf8"));
		if (previous.meta && typeof previous.meta === "object") {
			rewritten.meta = previous.meta;
		}
	} catch (error) {
		console.warn(`[export-content] could not read existing seed meta: ${error.message}`);
	}
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(rewritten, null, "\t")}\n`, "utf8");

const entries = Object.values(rewritten.content ?? {}).reduce(
	(total, list) => total + (Array.isArray(list) ? list.length : 0),
	0,
);

console.log(`[export-content] wrote ${outPath}`);
console.log(
	`[export-content] ${rewritten.collections?.length ?? 0} collection(s), ${entries} entr(ies), ${copied.size} media file(s)`,
);

if (missing.size > 0) {
	console.warn(
		`[export-content] ${missing.size} referenced media file(s) missing from ${uploadsDir}:`,
	);
	for (const key of missing) console.warn(`  - ${key}`);
}
