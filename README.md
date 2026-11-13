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

Open <http://localhost:4321>. On the first run the dev server creates `data.db`, applies
migrations, seeds the schema and site settings, and generates `emdash-env.d.ts`. The admin
setup wizard is at <http://localhost:4321/_emdash/admin>.

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

## Project structure

```
seed/seed.json           Schema, taxonomies, bylines, menus, widgets, and demo content
scripts/seed-forms.mjs   Seeds the contact form into the forms plugin storage
src/styles/              Tailwind v4 entry, design tokens, typography, prose, components
src/layouts/Base.astro   Shared layout: SEO head, theme bootstrap, menus, footer
src/components/          UI primitives, page blocks, cards, bylines, calendar pieces
src/pages/               Routes for every collection, taxonomy, search, feed, and form
src/utils/               Date, calendar, taxonomy, and formatting helpers
astro.config.mjs         Node adapter, SQLite database, local media storage, forms plugin
data.db                  SQLite database (created at runtime, gitignored)
uploads/                 Local media storage (created at runtime, gitignored)
emdash-env.d.ts          Generated collection types (written by the dev server)
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

`/contact` is an explicit route rather than the catch-all page route so it can embed the
form. The plugin's stylesheet is imported in `src/layouts/Base.astro`, and
`src/styles/global.css` maps its variables onto the site tokens. Submissions are stored in
plugin tables inside `data.db`. Notification and autoresponder emails use EmDash's email
pipeline, so they only send once an email provider is configured (in development the console
provider logs them to the terminal).
