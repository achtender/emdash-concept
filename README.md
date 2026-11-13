# Fieldwork

A demonstration editorial site built with [EmDash](https://emdashcms.com) and Astro. The
design follows the `fieldnote` direction: a shared Supabase-derived token set, hairline
borders, small radii, Inter + Source Code Pro, generated cover art, and a light/dark theme.
Every section of the site is editable in EmDash.

## What it demonstrates

- **Collections** — `posts` (journal), `pages` (block layouts), `events` (calendar), and
  `handbook` chapters.
- **Bylines** — three studio authors, credits on entries, author indexes and detail pages.
- **Taxonomies** — hierarchical `category` terms and flat `tag` terms with archive routes.
- **Menus** — `primary` and `footer` menus resolved in the layout.
- **Blocks** — hero, feature grid, callout, stats, CTA, and quote blocks on pages.
- **Comments** — threaded comments and a comment form on journal entries, moderated in the
  admin.
- **Forms** — a contact form embedded from `@emdash-cms/plugin-forms`, with submissions
  stored in plugin storage.
- **Search** — EmDash's full-text `LiveSearch` across all four collections.
- **Calendar** — a Monday-first month grid at `/calendar?month=YYYY-MM`, an upcoming list,
  and per-event `.ics` downloads.
- **Feeds** — an RSS feed at `/rss.xml`.

The seeded sidebar widget area is still present in the admin, but the frontend intentionally
does not render `WidgetArea`.

## Requirements

- Node.js `>= 22.23.4` (Astro 7 requirement)
- Yarn 1.x (a `yarn.lock` is checked in)

## Getting started

```bash
yarn install
yarn dev
```

Open <http://localhost:4321>. On the first run the dev server creates `storage/data.db`,
applies migrations, seeds the schema and site settings, and generates `emdash-env.d.ts`. The
admin setup wizard is at <http://localhost:4321/_emdash/admin>.

Everything the site writes at runtime — the database, its WAL sidecars, and uploaded media —
lives under `storage/`, which is gitignored. Keeping it in one directory is what makes the
production deploy safe: that folder is shared across releases, so code deploys never touch
content or media.

`seed/seed.json` contains the full schema plus demo content: settings, four collections,
taxonomy terms, bylines, menus, widgets, and entries. It is imported during setup when you
choose to include demo content; skipping that step gives you an empty site with the same
schema.

Forms are plugin data rather than content entries, so they cannot live in `seed.json`. Seed
the demo contact form into an existing database with:

```bash
yarn seed:forms
```

The script is idempotent: it updates the `contact` form if it already exists.

## Routes

| Route | Description |
| --- | --- |
| `/` | Home: lead story, recent journal entries, upcoming events, handbook, bylines |
| `/journal` | Journal index with pagination |
| `/journal/[slug]` | Entry with byline, TOC, related entries, comments |
| `/calendar` | Month grid and upcoming events (`?month=YYYY-MM`) |
| `/events` | Event index |
| `/events/[slug]` | Event detail |
| `/events/[slug].ics` | Calendar download |
| `/handbook` | Handbook index |
| `/handbook/[slug]` | Handbook chapter |
| `/authors` | Byline index |
| `/authors/[slug]` | Author profile and credits |
| `/category/[slug]` | Category archive |
| `/tag/[slug]` | Tag archive |
| `/search` | Full-text search |
| `/contact` | Contact page with the embedded form |
| `/rss.xml` | RSS 2.0 feed |
| `/[slug]` | Pages (block layout or prose) |
| `/404` | Not found |

## Scripts

| Command | Description |
| --- | --- |
| `yarn dev` | Start the Astro dev server |
| `yarn build` | Build the production server to `dist/` |
| `yarn start` | Run the built standalone server (`dist/server/entry.mjs`) |
| `yarn preview` | Preview the production build |
| `yarn typecheck` | Run `astro check` (TypeScript + Astro diagnostics) |
| `yarn types` | Regenerate `emdash-env.d.ts` from a running dev server |
| `yarn seed:forms` | Seed the demo contact form into plugin storage |
| `yarn backup` | Snapshot the database and media into `storage/backups/` |
| `yarn content:export` | Export local content and media to `seed/` for the preview deploy |
| `yarn preview:sync` | Apply the committed seed to a preview database (preview only) |

## Project structure

```
seed/seed.json              Schema, taxonomies, bylines, menus, widgets, and demo content
seed/uploads/               Media referenced by the seed (committed)
scripts/seed-forms.mjs      Seeds the contact form into the forms plugin storage
scripts/backup.mjs          Database snapshot and media archive into storage/backups
scripts/export-content.mjs  Exports local content + media into seed/
scripts/sync-preview.mjs    Applies the committed seed to a preview database
scripts/ensure-storage.mjs  Creates storage/ and storage/uploads/ before dev and build
docs/development-workflow.md  Local → preview → production workflow and cutovers
docs/xcloud-setup.md        Step-by-step xCloud setup and redeploy test
src/styles/                 Tailwind v4 entry, design tokens, typography, prose, components
src/layouts/Base.astro      Shared layout: SEO head, theme bootstrap, menus, footer
src/components/             UI primitives, page blocks, cards, bylines, calendar pieces
src/pages/                  Routes for every collection, taxonomy, search, feed, and form
src/utils/                  Date, calendar, taxonomy, and formatting helpers
astro.config.mjs            Node adapter, SQLite database, local media storage, forms plugin
storage/                    Runtime data: data.db, WAL sidecars, uploads, backups (gitignored)
emdash-env.d.ts             Generated collection types (written by the dev server)
```

`emdash-env.d.ts` is committed so `yarn typecheck` works on a fresh clone. The dev server
regenerates it whenever the schema changes; commit the result.

## Configuration

`astro.config.mjs` uses the Node adapter in standalone mode, SQLite at
`file:./storage/data.db`, and local media storage in `./storage/uploads`. To deploy elsewhere,
swap the adapter and the `database`/`storage` providers; see the
[EmDash configuration docs](https://docs.emdashcms.com).

If the site sits behind a TLS-terminating reverse proxy, set the `EMDASH_SITE_URL`
environment variable (or `siteUrl` on the `emdash()` integration) so passkeys, CSRF checks, and
canonical URLs use the public origin. Prefer the environment variable: it is read at runtime,
so changing the domain does not require a rebuild.

Set `EMDASH_TRUSTED_PROXY_HEADERS` when the app runs behind a proxy that sets a client IP
header. This makes auth and comment rate limiting see the real client address instead of the
proxy's:

```bash
EMDASH_TRUSTED_PROXY_HEADERS=x-real-ip,x-forwarded-for
```

Only set it when you control the proxy — trusting these headers from an open network lets
clients spoof their IP.

## Deployment on xCloud

The site runs as a native xCloud **Node.js Git site** with **Release mode** enabled and a
single shared `storage/` folder. Every deploy builds a new release, starts it on a second port,
health-checks it, and switches nginx over. Because `storage/` is shared, the database, media,
forms, submissions, and comments stay in place while the code is replaced.

### Site settings

| Setting | Value |
| --- | --- |
| Server | NGINX, Node 24, 4 GB RAM |
| Site type | Deploy via Git → Node.js |
| Serving mode | SSR |
| Start command | `node ./dist/server/entry.mjs` |
| Port | `3000` (xCloud injects `PORT`; the standalone server reads it) |

### Build & deploy script

```sh
yarn install --frozen-lockfile
yarn build
```

`yarn build` runs `prebuild`, which creates `storage/` and `storage/uploads/` before Astro
starts. SQLite creates the database file but not its parent directory, so this is what makes a
fresh clone work; after the first deploy the shared folder exists and the step is a no-op.

For the customer preview site, add `PREVIEW_SYNC=1` to its environment and append:

```sh
if [ "$PREVIEW_SYNC" = "1" ]; then yarn preview:sync; fi
```

That rebuilds the preview's content from `seed/seed.json` on every deploy, so local development
stays the source of truth. Never set `PREVIEW_SYNC` on production. The full local → preview →
production flow, including the switch point and the launch cutover, is in
[docs/development-workflow.md](docs/development-workflow.md); step-by-step xCloud setup is in
[docs/xcloud-setup.md](docs/xcloud-setup.md).

The preview sync logs the storage path it resolved. On a correct deploy it says
`shared across releases`. If it says `local to this release`, xCloud linked the shared folder
after the build; stop and fix the shared path before relying on `PREVIEW_SYNC`, or the sync will
write into a release folder that disappears on the next deploy.

### Environment variables

```bash
NODE_ENV=production
EMDASH_SITE_URL=https://your-domain.example
EMDASH_ENCRYPTION_KEY=emdash_enc_v1_...
HOST=127.0.0.1
EMDASH_TRUSTED_PROXY_HEADERS=x-real-ip,x-forwarded-for
```

- `EMDASH_ENCRYPTION_KEY` encrypts plugin secrets at rest. Generate it once with
  `npx emdash secrets generate` and store a copy outside the server. Losing it loses every
  encrypted plugin setting; it is never written to the database.
- `EMDASH_SITE_URL` must match the public origin exactly before you register the first passkey.
  Passkeys are bound to the origin, so changing domains later invalidates them.
- Leave `PORT` to xCloud, and leave migrations on the default `auto`.
- Never commit `.env`. xCloud keeps an untracked root `.env` across deploys; a committed one is
  overwritten every time.

### First deploy

The full click-by-click version, including the redeploy test, is in
[docs/xcloud-setup.md](docs/xcloud-setup.md). The short version:

1. Create the site with **Deploy via Git → Node.js**, SSR, start command
   `node ./dist/server/entry.mjs`, port `3000`, and Node 24. Turn on **Release mode** in the
   wizard if you have the **Manage deploy scripts** permission; the site converts to Release
   mode after its first successful deploy. Leave `PREVIEW_SYNC` unset for now.
2. Set the environment variables above. Use the final origin for `EMDASH_SITE_URL` before you
   create the first passkey, or plan to register the passkey again after the domain changes.
3. Deploy. The first request runs migrations and auto-seeds the schema, settings, menus,
   widgets, and theme sections into the empty database. Demo content is *not* auto-applied.
4. Open `https://<domain>/_emdash/admin`, run the setup wizard, create the admin account and
   passkey on that origin, and choose to include demo content if this site should have it.
   Passkeys registered on `localhost:4321` will not work in production.
5. Seed the contact form (forms are plugin data, so `seed.json` does not include it). From the
   site terminal, which opens in the site folder:
   ```bash
   yarn seed:forms
   ```
   Or create a form with the id `contact` under **Forms** in the admin.
6. In **Site → Git → Release mode**, add `storage` under **Shared between releases**. xCloud
   moves the existing folder into the shared location and links it into the live release. This
   must happen after the first deploy, because the folder has to exist first.
7. Run the redeploy test in [docs/xcloud-setup.md](docs/xcloud-setup.md#6-test-a-redeploy):
   create a test post and image, redeploy, and confirm both survive. Then delete the test data.
8. Enable xCloud Site Backup, schedule `yarn backup` nightly, and run one restore test.
9. Only for the preview site: add `PREVIEW_SYNC=1` to its environment and redeploy. Confirm
   the deploy log says `[sync-preview] storage … (shared across releases)`. Never set it on
   production.

### Persistent data

| Path | Contents |
| --- | --- |
| `storage/data.db` | SQLite database: content, settings, users, plugin storage, comments |
| `storage/data.db-wal`, `-shm` | Write-ahead log sidecars; leave them beside the database |
| `storage/uploads/` | Media files served through `/_emdash/api/media/file` |
| `storage/backups/` | Nightly snapshots from `yarn backup` |

`storage/` must be gitignored, must not be tracked by Git, and must exist before it can be
added as a shared path. It is the only shared path this site needs.

## Backups and restore

Two independent layers:

| Layer | Covers | Cadence |
| --- | --- | --- |
| xCloud Site Backup | site files and a database dump | daily, per xCloud schedule |
| `yarn backup` | `VACUUM INTO` database snapshot + `storage/uploads` archive | nightly cron |

`yarn backup` is authoritative because it reads `storage/` directly, including the shared
folder that xCloud's file backup may not follow for Node.js sites. It:

1. writes a consistent snapshot with `VACUUM INTO` while the app is running in WAL mode;
2. verifies the snapshot with `PRAGMA integrity_check`;
3. archives `storage/uploads` with `tar`;
4. prunes files older than 14 days (`EMDASH_BACKUP_RETENTION_DAYS`).

Keep at least one copy off the server: point a second xCloud backup destination at
`storage/backups`, or sync it to S3/B2 with `rclone`.

### Restore

1. Stop the site so nothing writes during the swap.
2. Move the current `storage/data.db` and its `-wal`/`-shm` files aside.
3. Copy the chosen `storage/backups/data-YYYY-MM-DD.db` to `storage/data.db` and remove any
   stale `-wal`/`-shm` files.
4. Extract the matching `uploads-YYYY-MM-DD.tar.gz` over `storage/`.
5. Start the site and check content, media, the contact form, and admin login.

Migrations run on `auto`, so a restored database is brought up to the current schema on boot.

## Rolling back

xCloud rollback switches the code release only; it never reverses database migrations. Run
`yarn backup` before any deploy that includes a schema change. If a bad deploy changed the
schema, roll the code back **and** restore the pre-deploy snapshot. Shared files survive
rollbacks, so media uploaded after a deploy is still present.

## Forms

The [Forms plugin](https://www.npmjs.com/package/@emdash-cms/plugin-forms) is registered in
`astro.config.mjs`:

```js
plugins: [formsPlugin()],
```

Manage forms and submissions under **Forms** and **Submissions** in the admin. Insert a form
into content with the **Form** Portable Text block, or render one directly:

```astro
---
import { Form } from "@emdash-cms/plugin-forms/ui";
---

<Form id="contact" />
```

`/contact` is an explicit route rather than the catch-all page route so it can embed the
form. The plugin's stylesheet is imported in `src/layouts/Base.astro`, and
`src/styles/global.css` maps its variables onto the site tokens. Submissions are stored in
plugin tables inside `storage/data.db`. Notification and autoresponder emails use EmDash's email
pipeline, so they only send once an email provider is configured (in development the console
provider logs them to the terminal).
