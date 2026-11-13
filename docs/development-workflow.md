# Development workflow

How code and content move between local development, the customer preview, and
production. Read this before the first deploy and before every schema change.

## The two rules everything follows

1. **Code only ever moves forward, through Git.** Nobody edits code on a deployed
   site. A deploy is the only way code reaches a server.
2. **Content lives in one authoritative place at a time.** Either local development
   or the deployed site owns the content — never both. The switch between the two
   is the single most important moment in a project, and it is explicit below.

Everything else is a consequence of those two rules.

## Environments

| Environment | Purpose | Content owner | `storage/` |
| --- | --- | --- | --- |
| Local | Build the site, iterate fast | **Yes, during phase 1** | `storage/` (gitignored) |
| Preview (dev domain) | Customer reviews design, then enters content | Yes, from phase 2 | shared across releases |
| Production | Live site | Yes, after launch | shared across releases |

Each environment has its own database and media. They are never in sync
automatically, and there is no two-way sync. Data moves on purpose, in one
direction, at defined moments.

## What is committed, and what is not

| Path | Committed | Why |
| --- | --- | --- |
| `src/`, `scripts/`, `astro.config.mjs` | Yes | The code |
| `seed/seed.json` | Yes | Schema + content, in reviewable text form |
| `seed/uploads/` | Yes | Media referenced by the seed |
| `storage/` | **No** | Live database, WAL sidecars, uploads, backups |
| `.env` | **No** | Secrets, per environment |

Never commit `storage/data.db`. It is a live SQLite file with a write-ahead log,
it changes while the server runs, it cannot be reviewed or merged, and it carries
environment-specific users and passkeys. The committed seed is the portable
equivalent.

## Phase 1 — Preview mirrors local development

Local is the source of truth. The customer sees a read-only preview that is rebuilt
from the repository on every deploy.

### Daily loop

```bash
yarn dev                     # work locally against storage/data.db
yarn content:export          # refresh seed/seed.json + seed/uploads from your DB
git add -A && git commit -m "…"
git push                     # preview rebuilds from the commit
```

`yarn content:export` runs `emdash export-seed --with-content all`, rewrites media
references to `$media.file`, and copies the referenced bytes into `seed/uploads/`.
Commit both together — a seed that points at media that is not in the repository
will fail to seed.

### Preview deploy script

Set `PREVIEW_SYNC=1` in the preview site's environment, and use this build script:

```sh
mkdir -p storage
yarn install --frozen-lockfile
yarn build
if [ "$PREVIEW_SYNC" = "1" ]; then yarn preview:sync; fi
```

`yarn preview:sync` copies `seed/uploads/` into `storage/uploads/` and runs:

```bash
emdash seed seed/seed.json \
  --database storage/data.db \
  --uploads-dir storage/uploads \
  --on-conflict update
```

That upserts settings, collections, fields, taxonomies, bylines, menus, widgets,
and content. It does **not** touch the `users` table, so the preview admin account
and its passkey survive every deploy. Media is deduplicated by content hash, so
repeated syncs do not duplicate files or media rows.

The same repository and the same build script are used on production. Only the
`PREVIEW_SYNC` variable differs. That is deliberate: one code path, one place to
get it wrong.

### Things to know about phase 1

- **Seed entries are matched by slug + locale, not by id.** An existing entry with
  the same slug is updated in place; a new slug creates a new entry. So renaming a
  slug locally leaves the old entry behind on the preview — change slugs rarely, or
  clean up afterwards. (An entry with no slug falls back to its seed id, which is
  environment-specific and would duplicate; keep slugs on everything.)
- **Deleting content locally does not delete it on the preview.** Seed apply is an
  upsert. Delete it in the preview admin, or reset the preview database once.
- **The sync runs during the build**, before the new release is live. The old
  release briefly serves the new content. That is harmless on a preview. If the
  old release holds a write lock for more than a few seconds, the sync can fail
  and the deploy stops — traffic stays on the old release, so retry the deploy.
- **Every sync creates content revisions.** History on the preview will be noisy.
  That is acceptable; the seed stays the source of truth.
- **Media added locally is handled**, as long as you run `yarn content:export`
  before committing. External image URLs are left as URLs and downloaded at seed
  time, so the build server needs network access to them.
- **Forms are not in the seed.** Run `yarn seed:forms` once against the preview
  database. The form persists across deploys because plugin storage is not seeded.

## Phase 2 — The customer starts entering content

This is the switch point. Once real content entry begins on the preview, stop
syncing from the repository or the next deploy will overwrite their work.

To flip:

1. Set `PREVIEW_SYNC=0` (or remove it) on the preview site.
2. Redeploy.
3. From then on, the preview's `storage/` is the source of truth for content.

To test against the customer's content locally, pull it down — never push it up:

```bash
# on the preview (SSH)
yarn backup
# download storage/backups/data-YYYY-MM-DD.db, then locally:
#   stop yarn dev, move storage/data.db* aside, copy the download into place
```

Local is now a sandbox. Treat any local content as disposable.

## Phase 3 — Launch

A launch is a cutover, not a deploy: content moves from preview to production once,
inside a freeze window.

1. **Freeze content entry.** Tell the customer to stop editing; note the time.
2. **Back up both sides.** `yarn backup` on preview, and again on production before
   the import.
3. **Export the preview:**
   ```bash
   npx emdash site export --url https://preview.example --token <token> -o fieldwork.emdash
   ```
4. **Provision production** (same repo, same build script, `PREVIEW_SYNC` unset) and
   set the production environment. Deploy, then run the setup wizard at
   `https://www.example/_emdash/admin`:
   - **Skip demo content.** The import only accepts a target with no entries,
     media, revisions, or bylines. A schema-only setup is fine; the import clears
     the seeded scaffold and replaces it.
   - Create the production admin and an API token — the import needs one, and
     users do not transfer from the preview.
5. **Import into the empty production site:**
   ```bash
   npx emdash site import fieldwork.emdash --url https://www.example --token <token> --analyze
   npx emdash site import fieldwork.emdash --url https://www.example --token <token> \
     --plan sha256:<digest> --confirm
   ```
   The import targets an empty site. It carries the content model, content,
   revision history, settings, menus, and media.
6. **Recreate what does not transfer:**
   - **Users and passkeys** — passkeys are origin-bound and cannot be copied, so
     the production admin is the one created in step 4, on the production origin.
     Do not expect the preview admin to work.
   - **Plugin storage** — `_plugin_*` tables are non-portable. Re-run
     `node scripts/seed-forms.mjs` against the production database. Existing form
     submissions stay behind; migrate them with a SQL script only if the customer
     needs them.
   - **Secrets** — set `EMDASH_ENCRYPTION_KEY` in production before the import. Use
     the same key as the preview if encrypted plugin settings must remain readable.
7. **Verify:** home, journal entry, contact form submission, search, RSS, admin
   login, media.
8. **Point DNS and issue SSL**, then confirm `EMDASH_SITE_URL` matches the final
   origin.
9. **Unfreeze.** Production is now the source of truth. Retire or repurpose the
   preview.

## Phase 4 — Maintenance after launch

Production owns the content. Code still only arrives through Git. Most changes
move no data at all.

| Change | How to ship it | Data movement |
| --- | --- | --- |
| Template, style, route, component | Commit → deploy | None |
| Bug fix | Commit → deploy | None |
| New **optional** field | Add it in the production admin, or `emdash schema add-field` | None |
| New collection / required field | Add schema to production, backfill entries, then deploy the templates that use it | None (schema only) |
| Bulk content edit or restructure | Copy production into the preview, do the work there, then apply the same change to production in a window | Planned, one direction |
| Full relaunch (new design + restructured content) | Freeze → export production → work on preview/local → cut over with a full import | Yes, freeze required |

### Routine code changes

```bash
git pull
yarn dev
yarn typecheck && yarn build
git commit -am "…" && git push
```

xCloud builds a new release, health-checks it, and switches traffic. Pending EmDash
migrations run on the first request after the switch. The database is not touched
otherwise. Take `yarn backup` first if the release includes a migration or schema
change.

### Schema changes

Schema lives in the database, not in your code, so a deploy alone will not add a
field to production. Choose one:

- **Admin UI** — best for customer-facing model changes; the customer sees it at once.
- **CLI against the running site** — repeatable and scriptable:
  ```bash
  npx emdash schema add-field posts subtitle --type string --label "Subtitle" \
    --url https://www.example --token <token>
  ```
- **Seed apply on the server** — when `seed/seed.json` is the canonical definition:
  ```bash
  npx emdash seed seed/seed.json --database storage/data.db \
    --on-conflict update --no-content
  ```

Prefer optional fields. Adding a required field to a collection that already has
entries leaves those entries failing validation until they are re-saved.

### Content restructuring and relaunches

Do the work where you can break things, then cut over deliberately:

1. Restore a production backup into the preview (or locally).
2. Make the content and schema changes there, with the new code.
3. Freeze production content entry.
4. Back up production.
5. Cut over: either import the prepared site into a fresh production, or apply the
   same transformation to production with a script.
6. Verify, then unfreeze.

## The one workflow to avoid

> Export production data into the preview, edit it, then import it back to production.

That is a **relaunch**, not a code-change loop, and it has three sharp edges:

- `emdash site import` only accepts an **empty** target. Importing "the changed
  data" means wiping production and re-importing — downtime, and no partial merge.
- Anything the customer wrote after your export is lost, unless the content is
  frozen for the whole cycle.
- Users, passkeys, and plugin storage never transfer, so production admin access
  and form data need separate handling every time.

Use it when you are genuinely relaunching. For anything else, ship code without
moving data, and apply content or schema changes directly to production.

## Guardrails

- `PREVIEW_SYNC=1` exists only on the preview. Never set it on production.
- Never run `emdash seed`, `preview:sync`, or `site import` against a site with
  customer content unless you intend to replace it.
- Run `yarn backup` before every schema change and every cutover, on both sides.
- Freeze content entry for the whole cutover window and tell the customer when it
  ends.
- Keep the same `EMDASH_ENCRYPTION_KEY` across environments if plugin secrets must
  survive a transfer; keep it out of Git either way.
- Rollback in xCloud restores code only. A migration or schema change is not rolled
  back; restore the matching database snapshot.

## Command reference

| Task | Command |
| --- | --- |
| Local development | `yarn dev` |
| Export local content for the preview | `yarn content:export` |
| Apply the committed seed to the preview | `yarn preview:sync` |
| Snapshot a deployed database + media | `yarn backup` |
| Seed the contact form | `yarn seed:forms` |
| Add a field on a running site | `npx emdash schema add-field … --url … --token …` |
| Apply seed schema without touching content | `npx emdash seed seed/seed.json --database storage/data.db --on-conflict update --no-content` |
| Export a whole site | `npx emdash site export --url … --token … -o site.emdash` |
| Import into an empty site | `npx emdash site import site.emdash --url … --token … --analyze` |
| Generate an API token | Admin → Settings → API tokens, or `emdash login` |
