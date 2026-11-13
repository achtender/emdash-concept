/**
 * Seed the contact form into the EmDash forms plugin.
 *
 * Forms are plugin data, not content entries, so they cannot be added through
 * `seed.json`. This script writes the same shape the plugin stores when a form
 * is created in the admin: a JSON document in `_plugin_storage` under
 * `plugin_id = "emdash-forms"`, `collection = "forms"`.
 *
 * Usage: node scripts/seed-forms.mjs
 *
 * Writes to `storage/data.db` by default. Override the path with
 * `EMDASH_DB_PATH=/path/to/data.db` when running against a production release
 * whose live database lives outside the release folder.
 */
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";

const PLUGIN_ID = "emdash-forms";
const COLLECTION = "forms";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DB_PATH = process.env.EMDASH_DB_PATH ?? "storage/data.db";
const dbPath = isAbsolute(DB_PATH) ? DB_PATH : resolve(ROOT, DB_PATH);

if (!existsSync(dbPath)) {
	console.error(
		`Database not found at ${dbPath}. Start the site once so migrations run, or set EMDASH_DB_PATH.`,
	);
	process.exit(1);
}

const now = new Date().toISOString();

const form = {
	name: "Studio contact",
	slug: "contact",
	status: "active",
	pages: [
		{
			title: "Tell us what you are making",
			fields: [
				{
					id: "fld-name",
					type: "text",
					label: "Your name",
					name: "name",
					placeholder: "Mara Voss",
					required: true,
					width: "half",
					validation: { maxLength: 120 },
				},
				{
					id: "fld-email",
					type: "email",
					label: "Email",
					name: "email",
					placeholder: "you@example.com",
					required: true,
					width: "half",
				},
				{
					id: "fld-org",
					type: "text",
					label: "Studio or organisation",
					name: "organization",
					placeholder: "Optional",
					required: false,
					width: "half",
				},
				{
					id: "fld-reason",
					type: "select",
					label: "What brings you here?",
					name: "reason",
					placeholder: "Choose one",
					required: false,
					width: "half",
					options: [
						{ label: "A project that needs a second reader", value: "project" },
						{ label: "Editorial or design work", value: "editorial" },
						{ label: "A workshop or event", value: "workshop" },
						{ label: "Press or speaking", value: "press" },
						{ label: "Something else", value: "other" },
					],
				},
				{
					id: "fld-message",
					type: "textarea",
					label: "The note",
					name: "message",
					placeholder:
						"What are you making, who is it for, and what kind of help do you need?",
					helpText: "A few sentences is plenty. Links are welcome.",
					required: true,
					width: "full",
					validation: { minLength: 20, maxLength: 4000 },
				},
				{
					id: "fld-timeline",
					type: "select",
					label: "Timeline",
					name: "timeline",
					placeholder: "No deadline yet",
					required: false,
					width: "full",
					options: [
						{ label: "Just exploring", value: "exploring" },
						{ label: "Within a month", value: "month" },
						{ label: "This quarter", value: "quarter" },
						{ label: "No deadline", value: "none" },
					],
				},
				{
					id: "fld-updates",
					type: "checkbox",
					label: "Send me the occasional studio note",
					name: "updates",
					required: false,
					width: "full",
					defaultValue: "yes",
				},
				{
					id: "fld-source",
					type: "hidden",
					label: "Source",
					name: "source",
					required: false,
					width: "full",
					defaultValue: "contact-page",
				},
			],
		},
	],
	settings: {
		confirmationMessage:
			"Thank you — your note is in the studio queue. We read everything, and reply within a week.",
		notifyEmails: ["studio@fieldwork.example"],
		digestEnabled: false,
		digestHour: 9,
		retentionDays: 365,
		spamProtection: "honeypot",
		submitLabel: "Send the note",
		nextLabel: "Next",
		prevLabel: "Back",
	},
	submissionCount: 0,
	lastSubmissionAt: null,
	createdAt: now,
	updatedAt: now,
};

const db = new DatabaseSync(dbPath);
db.exec("PRAGMA busy_timeout = 5000");

const existing = db
	.prepare(
		`SELECT id FROM _plugin_storage
		 WHERE plugin_id = ? AND collection = ? AND json_extract(data, '$.slug') = ?`,
	)
	.get(PLUGIN_ID, COLLECTION, form.slug);

const id = existing?.id ?? `contact-${randomUUID()}`;
const revision = randomUUID();

db.prepare(
	`INSERT INTO _plugin_storage (plugin_id, collection, id, data, created_at, updated_at, revision)
	 VALUES (?, ?, ?, ?, ?, ?, ?)
	 ON CONFLICT (plugin_id, collection, id) DO UPDATE SET
	   data = excluded.data,
	   updated_at = excluded.updated_at,
	   revision = excluded.revision`,
).run(PLUGIN_ID, COLLECTION, id, JSON.stringify(form), now, now, revision);

const saved = db
	.prepare(`SELECT id, json_extract(data, '$.name') AS name FROM _plugin_storage WHERE id = ?`)
	.get(id);

console.log(
	`${existing ? "Updated" : "Created"} form "${saved.name}" (${saved.id}) with slug "${form.slug}".`,
);

db.close();
