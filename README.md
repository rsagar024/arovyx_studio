# Arovyx Studio

An AI-powered developer portfolio for showcasing **apps, games, packages and plugins**.

Paste a link (GitHub/GitLab repo, npm or PyPI package, Play Store, itch.io, Steam or any website) into the hidden admin panel. The server fetches the page, sends it to the **NVIDIA NIM** API, and fills in every project field: title, descriptions, category, tags, tech stack, features, status and version. You review and edit the draft, save it, and it's live for visitors immediately.

Visitors browse read-only; there are no public accounts.

---

## Stack

- **Next.js 14** (App Router) · **React 18** · **TypeScript** (strict)
- **Tailwind CSS**: custom components only, CSS-only motion (no UI or animation libraries)
- **Prisma + SQLite**
- **NVIDIA NIM** (OpenAI-compatible `chat/completions`, called with plain `fetch`)
- **Zod** validation · **lucide-react** icons · **react-hot-toast**

---

## Quick start

Requires **Node.js 18.17+**.

```bash
cp .env.example .env        # then fill in the values (see below)
npm install
npx prisma db push
npm run dev
```

Open <http://localhost:3000>.

The first `npm run dev` (or `npm start`) seeds a fresh database automatically: 3 example projects (an app, a game and a package) plus default site settings. On later runs the seed sees existing data and skips, so your edits are never overwritten. Run `npm run db:seed` to force a re-seed (it upserts the example projects again).

### Production

```bash
npm run build
npm start
```

> **Rebuild after changing `.env`.** Next.js reads environment values at build time for production builds. If you edit `.env` and only restart `npm start`, the old values stay in effect.

---

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `NVIDIA_NIM_API_KEY` | for AI features | Your NIM key. Read **only on the server**, never sent to the browser. Without it, AI requests return a clear "missing key" error, and manual add/edit still works. |
| `NVIDIA_NIM_MODEL` | no | Chat model id. Default `meta/llama-3.2-11b-vision-instruct` (see the model note below). |
| `NVIDIA_NIM_BASE_URL` | no | Default `https://integrate.api.nvidia.com/v1`. |
| `ADMIN_SECRET_KEY` | **yes** | The password for the hidden admin panel. |
| `ADMIN_JWT_SECRET` | **yes** | Random string used to sign the admin session cookie (HMAC-SHA256). |
| `NEXT_PUBLIC_SITE_URL` | yes | Public base URL, used for canonical/Open Graph URLs, the sitemap and robots. |
| `DATABASE_URL` | yes | SQLite file, relative to `prisma/`. Default `file:./dev.db`. |

Generate a strong JWT secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## Getting a free NVIDIA NIM API key

1. Go to **[build.nvidia.com](https://build.nvidia.com)** and sign in (or create a free NVIDIA account).
2. Open any model page, for example a Llama chat model.
3. Click **"Get API Key"** and then **Generate Key**. Copy the key (it starts with `nvapi-`).
4. Paste it into `.env` as `NVIDIA_NIM_API_KEY="nvapi-…"` and restart (or rebuild for production).

**Model note:** the original spec's default, `meta/llama-3.3-70b-instruct`, has been **retired** by NVIDIA (it returns `410 Gone`). Hosted keys can also only call the models they're entitled to; others return `404`. This project defaults to `meta/llama-3.2-11b-vision-instruct`. To switch, pick a chat model from the catalog that your key can call and set `NVIDIA_NIM_MODEL`.

Hosted models can be slow or briefly unavailable. Requests time out after 60 s, retry twice on `429`/`5xx`, and the admin UI shows the error with a **Retry** button.

---

## Admin access (hidden)

The admin panel isn't linked anywhere on the public site. To open it:

- go to **`/studio`** directly, or
- press **`Ctrl + Shift + A`** (`Cmd + Shift + A` on macOS) on any page.

Sign in with the value of `ADMIN_SECRET_KEY`. The session is an HTTP-only signed cookie valid for **12 hours**.

**Changing the admin key:** edit `ADMIN_SECRET_KEY` in `.env` and restart (`npm run dev`), or rebuild and restart in production. To also invalidate all existing sessions immediately, change `ADMIN_JWT_SECRET` at the same time. Sessions are stateless, so logging out clears the cookie in that browser, and a copied token stays valid until it expires unless the JWT secret changes.

---

## Features

### Public site
- **Home:** hero with typing tagline, live stats strip, featured projects, category tiles
- **`/projects`:** category tabs and search (title, tag, tech) synced to `?category=&q=`
- **`/projects/[slug]`:** full detail (markdown), features, tech stack, source/demo buttons, similar projects, per-project SEO and Open Graph
- **`/about`:** bio, avatar, résumé link, tech arsenal, shipped timeline
- **`/contact`:** form (validated and rate-limited, 5 per 10 min per IP), plus email/GitHub/LinkedIn/Instagram cards with copy-email. After a submission the server saves the message and returns a confirmation shown on the page; no email is sent.
- Dark theme by default with a light/dark toggle (remembered, synced across tabs), custom 404, skip link, keyboard-friendly menus, `sitemap.xml`, `robots.txt` and a default social card at `/og`

### Admin panel (`/studio`)
- **Overview:** project counts per category (live/draft), unread messages, AI jobs in the last 30 days with success rate, recent AI jobs (with errors), recently updated projects
- **Add Project (AI auto-fill):**
  - paste a URL and choose a category (or **AUTO**) to get an editable preview
  - **Regenerate** re-runs the AI on the *same* fetched data, with an optional extra instruction (e.g. "make it more playful")
  - **Bulk mode:** one URL per line, processed in sequence with per-URL progress, each saved as a draft
  - **Manual add** without AI
- **Projects:** search, publish/unpublish, edit (same form, with the **AI Description Improver**), delete
- **Messages:** inbox with read/unread, detail view, reply by email, delete
- **Settings:** site name, owner name, tagline, bio, email, socials, avatar and résumé, live on the public site as soon as you save

Every AI call (generate or improve, success or failure) is logged to the `AiLog` table and shown on Overview.

---

## API

All `/api/admin/*` routes require the admin session cookie (checked by middleware and again in each handler) and validate bodies with Zod. Errors use one shape: `{ ok: false, error, details? }`.

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/admin/login` | Verify the admin key (constant-time compare, rate-limited) and set the cookie |
| `POST` | `/api/admin/logout` | Clear the cookie |
| `GET` / `POST` | `/api/admin/projects` | List all projects (incl. drafts) / create |
| `GET` / `PATCH` / `DELETE` | `/api/admin/projects/[id]` | Read / partial update / delete |
| `POST` | `/api/admin/ai/generate` | `{ url, category?, extraInstruction?, fetchedData? }` → fetch + NIM pipeline |
| `POST` | `/api/admin/ai/improve` | AI Description Improver |
| `GET` / `PATCH` | `/api/admin/settings` | Site settings |
| `GET` / `DELETE` | `/api/admin/messages` | Inbox (+ unread count) / bulk delete `{ ids: [...] }` |
| `PATCH` / `DELETE` | `/api/admin/messages/[id]` | Mark read/unread / delete one |
| `POST` | `/api/contact` | Public contact form |
| `GET` | `/api/projects` | Public list, `?category=&q=` (drafts only for admins) |

---

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server (seeds a fresh DB first) |
| `npm run build` | Production build |
| `npm start` | Serve the build (seeds a fresh DB first) |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm run db:push` | Apply the Prisma schema to the database |
| `npm run db:generate` | Regenerate the Prisma client |
| `npm run db:seed` | Seed / re-seed the example data |

---

## Project structure

```
prisma/
  schema.prisma        Project, ContactMessage, SiteConfig, AiLog
  seed.ts              example data (--if-empty used by predev/prestart)
src/
  app/
    (public)/          home, projects, projects/[slug], about, contact
    studio/            login page + (panel)/ overview, projects, add, messages, settings
    api/               routes listed above
    og/route.tsx       default social card
    layout.tsx, not-found.tsx, sitemap.ts, robots.ts, globals.css
  components/          Navbar, Footer, Hero, ProjectCard, badges, ThemeToggle, …
    studio/            StudioShell, AiGeneratePanel, ProjectForm, MessagesInbox, SettingsForm, …
  lib/
    fetchers.ts        GitHub/GitLab/npm/PyPI APIs + generic HTML extraction
    nim.ts             nimChat (timeout + retries), generateProjectDetails, improveDescription, AiLog
    auth.ts            HMAC-signed sessions, constant-time key check (Edge-safe)
    session.ts         cookie helpers for server code
    validators.ts      Zod schemas + DB ↔ DTO mappers
    db.ts, projects.ts, dashboard.ts, seo.ts, slug.ts, api.ts, utils.ts, markdown.ts
  middleware.ts        protects /studio/* and /api/admin/*
```

---

## Notes

- **SQLite limitations:** Prisma's SQLite connector has no enums or scalar lists. `category` and `status` are strings validated by Zod, and `tags`, `techStack` and `features` are stored as JSON strings and exposed as `string[]` by the mappers in `src/lib/validators.ts`. To move to Postgres later, change the `datasource` in `prisma/schema.prisma` and run `npx prisma db push`.
- **Social card:** `/og` runs on the edge runtime. In the Node runtime, `@vercel/og` fails to build on Windows, and edge can't reach Prisma, so the card shows the brand text rather than the editable site name. Projects with an `imageUrl` use that image instead.
- **Rate limits** (contact form, login) are in-memory per server process. That's fine for a single instance; use a shared store if you scale out.
