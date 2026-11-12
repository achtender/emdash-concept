# EmDash Starter

A minimal [EmDash](https://emdashcms.com) site built with Astro. It includes posts, pages,
categories, tags, search, a primary menu, a sidebar widget area, and forms via
`@emdash-cms/plugin-forms`.

## Requirements

- Node.js `>= 22.23.4` (Astro 7 requirement)
- Yarn 1.x (a `yarn.lock` is checked in)

## Getting started

```bash
yarn install
yarn dev
```

Open <http://localhost:4321>. On the first run the dev server creates `data.db`, applies
migrations, seeds the schema and site settings, and generates `emdash-env.d.ts`. The admin
setup wizard is at <http://localhost:4321/_emdash/admin>.

The starter seed (`seed/seed.json`) also contains demo posts and pages. They are imported
during setup when you choose to include demo content; skipping that step gives you an empty
site with the same schema.

## Scripts

| Command | Description |
| --- | --- |
| `yarn dev` | Start the Astro dev server |
| `yarn build` | Build the production server to `dist/` |
| `yarn start` | Run the built standalone server (`dist/server/entry.mjs`) |
| `yarn preview` | Preview the production build |
| `yarn typecheck` | Run `astro check` (TypeScript + Astro diagnostics) |
| `yarn types` | Regenerate `emdash-env.d.ts` from a running dev server |

## Project structure

```
seed/seed.json          Schema, taxonomies, menus, widgets, and demo content
src/live.config.ts      EmDash live collection registration (Astro boilerplate)
src/layouts/Base.astro  Shared layout: SEO head, menu, search, widget hooks
src/pages/              Routes (home, posts, pages, categories, tags, 404)
src/utils/              Small helpers
astro.config.mjs        Node adapter, SQLite database, local media storage, forms plugin
data.db                 SQLite database (created at runtime, gitignored)
uploads/                Local media storage (created at runtime, gitignored)
emdash-env.d.ts         Generated collection types (written by the dev server)
```

`emdash-env.d.ts` is committed so `yarn typecheck` works on a fresh clone. The dev server
regenerates it whenever the schema changes; commit the result.

## Configuration

`astro.config.mjs` uses the Node adapter in standalone mode, SQLite at `file:./data.db`,
and local media storage in `./uploads`. To deploy elsewhere, swap the adapter and the
`database`/`storage` providers; see the
[EmDash configuration docs](https://docs.emdashcms.com).

If the site sits behind a TLS-terminating reverse proxy, set `siteUrl` on the `emdash()`
integration (or the `EMDASH_SITE_URL` environment variable) so passkeys, CSRF checks, and
canonical URLs use the public origin.

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

The plugin's stylesheet is imported in `src/layouts/Base.astro`. Submissions are stored in
plugin tables inside `data.db`. Notification and autoresponder emails use EmDash's email
pipeline, so they only send once an email provider is configured (in development the console
provider logs them to the terminal).
