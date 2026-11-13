# xCloud setup and redeploy test

Step-by-step setup for one Fieldwork site on xCloud, followed by the test that proves a
redeploy does not lose content, media, or form submissions. Repeat the same steps for the
customer preview and for production; only `PREVIEW_SYNC` differs.

For the content workflow behind these steps, read
[development-workflow.md](development-workflow.md). For the short version, see the
deployment section of the [README](../README.md).

## What you need

- An xCloud account and a connected server with **NGINX**, **Node 24**, and at least 4 GB RAM.
- The repository pushed to the branch you will deploy.
- The **Manage deploy scripts** permission on the team (needed to turn Release mode on).
- The final site origin, if you already have it. Passkeys are bound to the origin, so it is
  easiest to attach the real domain before creating the first admin account.

## 1. Create the site

1. In xCloud, open the server and choose **Add New Site → Deploy via Git**.
2. Select the repository and confirm the app type is **Node.js**.
3. Choose the branch and a domain:
   - Use the generated **Staging domain** to check the build, or
   - choose **Use a live domain** if DNS is ready.
4. Under **Build & serving**, set:

   | Setting | Value |
   | --- | --- |
   | Serving mode | **SSR (Node process)** |
   | Start command | `node ./dist/server/entry.mjs` |
   | Port | `3000` |
   | Health check | `/` (xCloud requests it automatically) |

5. Expand **Advance** and choose **Node.js 24**.
6. Turn on **Release mode (zero-downtime deploys)** if the option is available. The site
   converts to Release mode after its first successful deploy; if the option is missing, turn
   it on later in **Site → Git**.
7. Leave the environment empty for now and continue to the summary.

Do not add a `PREVIEW_SYNC` variable yet. The first deploy must run without it so the setup
wizard owns the initial content.

## 2. Environment variables

Open **Site → Environment** (or the environment field in the deploy wizard) and add one
`KEY=value` pair per line:

```bash
NODE_ENV=production
EMDASH_SITE_URL=https://your-domain.example
EMDASH_ENCRYPTION_KEY=emdash_enc_v1_replace_me
HOST=127.0.0.1
EMDASH_TRUSTED_PROXY_HEADERS=x-real-ip,x-forwarded-for
```

- `EMDASH_SITE_URL` must be the exact public origin, including `https://` and no trailing
  slash. Passkeys, CSRF checks, and canonical URLs use it. It is read at runtime, so a later
  change does not need a rebuild.
- `EMDASH_ENCRYPTION_KEY` encrypts plugin secrets at rest. Generate it once on your machine:
  ```bash
  npx emdash secrets generate
  ```
  Store a copy in your password manager. Losing it loses every encrypted plugin setting.
- Leave `PORT` out. xCloud sets it per release, and Release mode alternates between two ports.
- `HOST=127.0.0.1` is what xCloud's health check and nginx expect. Do not use `localhost`.
- `EMDASH_TRUSTED_PROXY_HEADERS` makes rate limiting see the visitor's address instead of the
  proxy's. Only set it because xCloud's nginx sets these headers.
- Never commit `.env`. xCloud keeps an untracked root `.env` across deploys; a committed one is
  overwritten and makes Release mode refuse the deploy.

## 3. Build & deploy script

Use exactly this for the first deploy and for production:

```sh
yarn install --frozen-lockfile
yarn build
```

`yarn build` runs the `prebuild` hook, which creates `storage/` and `storage/uploads/`. SQLite
creates the database file but not its parent directory, so this is what makes a fresh clone
work. Once `storage` is shared, the step is a no-op.

For the **preview** site, add this only after the first deploy and the redeploy test below:

```sh
if [ "$PREVIEW_SYNC" = "1" ]; then yarn preview:sync; fi
```

The complete preview script becomes:

```sh
yarn install --frozen-lockfile
yarn build
if [ "$PREVIEW_SYNC" = "1" ]; then yarn preview:sync; fi
```

`PREVIEW_SYNC` belongs on the preview site only. Never set it on production.

## 4. First deploy

1. Select **Deploy** and follow the log. The install and build must finish without errors.
2. Open the domain. The first request runs EmDash migrations and seeds the schema, settings,
   menus, widgets, and theme sections. Demo content is **not** auto-applied.
3. If the health check fails, read **Monitoring → Logs → PM2 Log** (or the release log) before
   changing anything. The common causes are a wrong start command, a missing environment
   variable, or an app listening on `localhost` instead of `127.0.0.1`.

## 5. Finish setup

1. Open `https://your-domain.example/_emdash/admin`.
2. Complete the setup wizard:
   - Create the admin account and register a passkey **on this origin**.
   - Include demo content if this is the customer preview or a demo site.
   - Skip demo content on production if you plan to import the real site later.
3. If the domain changes later, update `EMDASH_SITE_URL` first, then register a new passkey.
   Passkeys created on `localhost:4321` or on a staging domain will not work on the new origin.
4. Seed the contact form. Forms are plugin data, so they are not in `seed/seed.json`.
   - Open **Site → Open Terminal** (the site terminal starts in the site folder) and run:
     ```bash
     yarn seed:forms
     ```
   - Or create a form with the id `contact` under **Forms** in the admin.
5. Open `/contact` and confirm the form renders.

## 6. Test a redeploy

This is the test that matters: it proves the database and uploads live outside the release
folder. Do it before handing the site to the customer, and again after any change to shared
paths or the deploy script.

### Before the redeploy

1. In the admin, create and publish a test post titled **Deploy persistence test** with a
   distinctive sentence in the body.
2. Upload a test image to the media library and note its public URL.
3. Submit the contact form once and confirm the submission appears under **Submissions**.

### Redeploy

1. Select **Deploy Now** in xCloud, or push an empty commit to the deployed branch.
2. Wait until the new release is **Live** and the health check has passed.

### After the redeploy

Confirm all of these:

- The test post still exists and opens at its journal URL.
- The test image still loads from `/_emdash/api/media/file/...`.
- The contact submission is still listed in the admin.
- The admin passkey still signs you in.
- The deploy log contains `[ensure-storage] ready at …`.
- On the preview only, the log contains
  `[sync-preview] storage … (shared across releases)`. If it says
  `(local to this release)`, stop: the shared path is not linked during the build, and
  `PREVIEW_SYNC` is writing into a folder that will disappear.

Then delete the test post, the test image, and the test submission.

If the post or image is gone, `storage` is not shared. See
[Turn on Release mode and share storage](#7-turn-on-release-mode-and-share-storage).

## 7. Turn on Release mode and share storage

Do this after the first successful deploy, because xCloud only shares a folder that already
exists.

1. Open **Site → Git** and find the **Release mode** card.
2. If Release mode is off, turn it on and confirm. The current files become the first release,
   marked **Converted** and **Live**.
3. In the same card, find **Shared between releases**. Type `storage` and click **Add path**.
4. Wait for **The shared paths are updated.** The folder moves out of the live release into the
   shared location and is linked back at once. Later releases link it too.
5. Confirm the list shows `.env` and `storage`.

Then repeat the [redeploy test](#6-test-a-redeploy). This second pass is the real proof that
new releases use the shared folder.

## 8. Turn on preview sync (preview only)

Only after the redeploy test passes and only on the customer preview:

1. Add `PREVIEW_SYNC=1` to the preview site's environment.
2. Append the conditional `yarn preview:sync` line to the build script.
3. Redeploy. The log must say `[sync-preview] storage … (shared across releases)`.
4. Open `/journal` and confirm the demo content from `seed/seed.json` is present.

From then on, every preview deploy rebuilds content from the committed seed. That is phase 1
of the [development workflow](development-workflow.md#phase-1--preview-mirrors-local-development).
When the customer starts entering content, stop the sync by setting `PREVIEW_SYNC=0` (or
removing it) and redeploying.

## 9. Backups

Two independent layers:

1. **xCloud Site Backup** — enable it in the site settings and pick a schedule. This covers
   site files and a database dump.
2. **`yarn backup`** — a consistent `VACUUM INTO` snapshot plus a `storage/uploads` archive in
   `storage/backups/`, pruned after 14 days. Because it reads the shared folder directly, it is
   the authoritative copy for this site.

Schedule the second layer nightly. From the site terminal, run it once by hand to verify:

```bash
yarn backup
ls -lh storage/backups
```

Then add a nightly scheduled command that runs in the site folder:

```bash
yarn backup
```

Use xCloud's **Cron Jobs** if available, or the site user's crontab. If the scheduler does not
start in the site folder, prefix the command with `cd /path/to/site &&`. Keep at least one copy
off the server: point a second backup destination at `storage/backups`, or sync it to S3/B2
with `rclone`.

Run one restore test before launch. The restore steps are in the
[README](../README.md#restore).

## 10. Go-live checks

- [ ] `EMDASH_SITE_URL` matches the final origin exactly.
- [ ] The production admin and passkey were created on that origin.
- [ ] `storage` is listed under **Shared between releases**.
- [ ] The redeploy test passed after `storage` was shared.
- [ ] `PREVIEW_SYNC` is **unset** on production.
- [ ] The contact form exists and a submission reaches the admin.
- [ ] `yarn backup` runs and the snapshot passes its integrity check.
- [ ] xCloud Site Backup is enabled.
- [ ] A code rollback has been tested, and you know it does not reverse migrations.

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Deploy fails at `yarn install` | Node version is 24, `yarn.lock` is committed, and the repository has no tracked `.env`. |
| Deploy succeeds but the site returns 502 | **PM2 Log**; start command is `node ./dist/server/entry.mjs`; `HOST=127.0.0.1`; `PORT` is not set manually. |
| Site returns 500 on the first request | `EMDASH_ENCRYPTION_KEY` and `EMDASH_SITE_URL` are set; check the PM2 log for the stack trace. |
| Content or media disappears after a deploy | `storage` is not shared. Add it under **Shared between releases**, then redeploy. Data written to a release-local folder before sharing cannot be recovered from that release. |
| xCloud refuses the `storage` path | The folder must exist in the site. Deploy once, or run `mkdir -p storage` in the site terminal, then add the path. |
| Preview deploy fails in `preview:sync` | The old release may hold the SQLite write lock. Retry the deploy. Also confirm `seed/uploads/` is committed and `seed/seed.json` is valid. |
| Preview log says `(local to this release)` | The shared path is linked after the build. Do not rely on `PREVIEW_SYNC`; fix the shared path or move the sync to a start-time step. |
| Passkey stops working | The origin changed. Update `EMDASH_SITE_URL`, then register a new passkey on the new origin. |
| Release mode refuses the deploy | The commit tracks `.env`, or the deploy script contains PM2 commands or a custom `ecosystem.config.js`. Remove them. |

## What not to do

- Do not commit `storage/data.db` or any `storage/` file. The committed seed is the transport.
- Do not set `PREVIEW_SYNC=1` on production.
- Do not run `emdash seed`, `preview:sync`, or `emdash site import` against a site with
  customer content unless you intend to replace it.
- Do not rely on an xCloud code rollback to undo a migration. Restore the matching database
  snapshot.
