# Arovyx Studio

An AI-powered developer portfolio for showcasing **apps, games, packages and plugins**.

Paste a link (GitHub/GitLab repo, npm or PyPI package, Play Store, itch.io, Steam or any website) into the hidden admin panel. The server fetches the page, sends it to the **NVIDIA NIM** API, and fills in every project field: title, descriptions, category, tags, tech stack, features, status and version. You review and edit the draft, save it, and it's live for visitors immediately.

Visitors browse read-only; there are no public accounts.

**Live site:** <https://arovyx-studio.vercel.app> · **Admin:** <https://arovyx-studio.vercel.app/studio> (see [Live deployment](#live-deployment))

---

## Stack

- **Next.js 14** (App Router) · **React 18** · **TypeScript** (strict)
- **Tailwind CSS**: custom components only, CSS-only motion (no UI or animation libraries)
- **Prisma + PostgreSQL** (hosted on **Neon**, free tier)
- Hosting on **Vercel**, deployed by **GitHub Actions** on every merge to `master`
- **NVIDIA NIM** (OpenAI-compatible `chat/completions`, called with plain `fetch`)
- **Zod** validation · **lucide-react** icons · **react-hot-toast**

---

## Quick start

Requires **Node.js 18.17+** and a **PostgreSQL** connection string. The easiest source is a free Neon database; see [Local development against Neon](#local-development-against-neon).

```bash
cp .env.example .env        # then fill in the values (see below)
npm install
npx prisma db push
npm run dev
```

Open <http://localhost:3000>.

The first `npm run dev` seeds a fresh database automatically (production is seeded by the deploy workflow): 3 example projects (an app, a game and a package) plus default site settings. On later runs the seed sees existing data and skips, so your edits are never overwritten. Run `npm run db:seed` to force a re-seed (it upserts the example projects again).

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
| `DATABASE_URL` | yes | PostgreSQL **pooled** connection string (Neon host contains `-pooler`). Used by the app at runtime. |
| `DIRECT_URL` | yes | PostgreSQL **direct** (non-pooled) connection string. Used by `prisma db push`. |

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

**On the live site** that's <https://arovyx-studio.vercel.app/studio>, and the key is the `ADMIN_SECRET_KEY` **GitHub secret** you chose. See [Admin access on the live site](#admin-access-on-the-live-site) for how to change it.

**Changing the admin key locally:** edit `ADMIN_SECRET_KEY` in `.env` and restart (`npm run dev`), or rebuild and restart in production. To also invalidate all existing sessions immediately, change `ADMIN_JWT_SECRET` at the same time. Sessions are stateless, so logging out clears the cookie in that browser, and a copied token stays valid until it expires unless the JWT secret changes.

---

## Features

### Public site
- **Home:** hero with typing tagline, live stats strip, featured projects, category tiles
- **`/projects`:** category tabs and search (title, tag, tech) synced to `?category=&q=`
- **`/projects/[slug]`:** full detail (markdown), features, tech stack, source/demo buttons, similar projects, per-project SEO and Open Graph. When set, it also shows an **app icon** beside the title, a **banner / feature graphic** behind the header, and a scrollable **screenshot gallery**. Play Store projects get a **"Get it on Google Play"** button; without media those parts simply don't render.
- **`/about`:** bio, avatar, résumé link, tech arsenal, shipped timeline
- **`/contact`:** form (validated and rate-limited, 5 per 10 min per IP), plus email/GitHub/LinkedIn/Instagram cards with copy-email. After a submission the server saves the message and returns a confirmation shown on the page; no email is sent.
- Dark theme by default with a light/dark toggle (remembered, synced across tabs), custom 404, skip link, keyboard-friendly menus, `sitemap.xml`, `robots.txt` and a default social card at `/og`

### Admin panel (`/studio`)
- **Overview:** project counts per category (live/draft), unread messages, AI jobs in the last 30 days with success rate, recent AI jobs (with errors), recently updated projects
- **Add Project (AI auto-fill):**
  - paste a URL and choose a category (or **AUTO**) to get an editable preview
  - **Google Play links** also bring in the **app icon**, **feature graphic** and up to 8 **phone screenshots**, plus the install count, read from the store page itself (never invented by the AI). All of it stays editable under **Media** in the form, and you can fill Media by hand for any project.
  - **Regenerate** re-runs the AI on the *same* fetched data, with an optional extra instruction (e.g. "make it more playful")
  - **Bulk mode:** one URL per line, processed in sequence with per-URL progress, each saved as a draft
  - **Manual add** without AI
- **Projects:** search, publish/unpublish, edit (same form, with the **AI Description Improver**), delete
- **Messages:** inbox with read/unread, detail view, reply by email, delete
- **Settings:** site name, owner name, tagline, bio, email, socials, avatar and résumé, live on the public site as soon as you save. **Hero showcase:** pick up to 3 projects (and their order) for the floating cards beside the home page title; with none picked, the latest 3 published are shown.

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
| `npm start` | Serve the build |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm run db:push` | Apply the Prisma schema to the database |
| `npm run db:generate` | Regenerate the Prisma client |
| `npm run db:seed` | Seed / re-seed the example data |

---

## Project structure

```
prisma/
  schema.prisma        Project, ContactMessage, SiteConfig, AiLog
  seed.ts              example data (--if-empty used by predev and the deploy workflow)
.github/workflows/
  deploy.yml           merge to master → typecheck → sync secrets → Neon schema/seed → Vercel deploy
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

## Live deployment

The live site runs on **Vercel** (hosting + serverless functions) with a **Neon** PostgreSQL database (free tier), both linked to the Vercel account behind this repo. **Every merge (or push) to `master` deploys automatically** via GitHub Actions. You never deploy by hand.

| | |
| --- | --- |
| Live site | <https://arovyx-studio.vercel.app> |
| Admin panel | <https://arovyx-studio.vercel.app/studio> (or `Ctrl/Cmd + Shift + A` on any page) |
| Deploy workflow | `.github/workflows/deploy.yml` → repo **Actions** tab → "Deploy to Vercel" |
| Database | Neon project `arovyx-db`, managed from the Vercel dashboard → project **arovyx-studio** → **Storage** |

> **Why not GitHub Pages?** Pages only serves static files. This app needs a server for the `/studio` login, the API routes, the NVIDIA NIM calls (the API key must stay server-side) and the database, so it's hosted on Vercel, which runs Next.js natively.

### How a deploy works

```
merge PR → master
   │
   ▼
GitHub Actions: "Deploy to Vercel"
   ├─ check   npm ci → typecheck → prisma validate
   └─ deploy  1. verify every required secret exists
              2. sync GitHub Secrets → Vercel runtime env
              3. prisma db push   (apply schema to Neon; refuses destructive changes)
              4. seed --if-empty  (only fills an empty database)
              5. vercel pull → vercel build --prod → vercel deploy --prebuilt --prod
              6. smoke test: /, /projects, /api/projects, /robots.txt, /sitemap.xml, /studio → 200;
                 /studio/overview (logged out) → 307
```

GitHub Secrets are the single source of truth. Change a value there, re-run the workflow, and it's live. Vercel's own Git auto-deploy is turned off for this project, so each merge deploys exactly once. Runs never overlap (`concurrency: production`). The deployed URL appears on the run summary and on the repo's **Environments → production** panel.

**Redeploy without a code change** (e.g. after changing a secret):
- GitHub → **Actions** → **Deploy to Vercel** → **Run workflow** (branch `master`), or
- `gh workflow run deploy.yml --repo rsagar024/arovyx_studio`, then `gh run watch`

### Secrets & variables

Stored in GitHub → repo **Settings → Secrets and variables → Actions**.

| Name | Type | What it is | How to change |
| --- | --- | --- | --- |
| `ADMIN_SECRET_KEY` | secret | **Your admin password** for `/studio` | `gh secret set ADMIN_SECRET_KEY`, then redeploy |
| `ADMIN_JWT_SECRET` | secret | Signs admin session cookies (random 64-hex) | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` → `gh secret set ADMIN_JWT_SECRET`, then redeploy. **Logs out every session.** |
| `NVIDIA_NIM_API_KEY` | secret | NVIDIA NIM key (server-only) | `gh secret set NVIDIA_NIM_API_KEY`, then redeploy |
| `DATABASE_URL` | secret | Neon **pooled** URL, used by CI for schema push/seed. At runtime Vercel gets the same value from the Neon integration. | Rotate the password in Neon, then update both |
| `DIRECT_URL` | secret | Neon **direct** URL (schema push) | as above |
| `VERCEL_TOKEN` | secret | Lets Actions deploy to your Vercel account | Create at vercel.com/account/settings/tokens → `gh secret set VERCEL_TOKEN` |
| `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | secret | Which Vercel project to deploy | Only if the project is recreated (from `.vercel/project.json` after `vercel link`) |
| `NEXT_PUBLIC_SITE_URL` | variable | Public URL for canonical/OG/sitemap | `gh variable set NEXT_PUBLIC_SITE_URL --body https://your-domain`, then redeploy |
| `NVIDIA_NIM_MODEL` | variable | NIM model id | `gh variable set NVIDIA_NIM_MODEL --body <model>` |
| `NVIDIA_NIM_BASE_URL` | variable | NIM endpoint | rarely changes |

`gh secret set NAME` with no `--body` prompts for the value, so it never lands in your shell history. Secret values can't be read back from GitHub, so keep your admin password in a password manager.

### Admin access on the live site

1. Open **<https://arovyx-studio.vercel.app/studio>**, or press **`Ctrl + Shift + A`** (`Cmd + Shift + A` on macOS) on any page. The panel is deliberately not linked anywhere and is excluded from search engines (`noindex` + `robots.txt`).
2. Enter your admin password (the `ADMIN_SECRET_KEY` secret). Login is rate-limited (10 attempts per 15 min per IP) and the session lasts 12 hours.
3. From there:
   - **Add Project:** paste a GitHub/npm/PyPI/store/website URL, review the AI draft, edit, **Save**. It's live immediately, no redeploy needed.
   - **Bulk mode:** one URL per line; each becomes a draft.
   - **Projects:** publish/unpublish, edit (with **Improve with AI**), delete.
   - **Messages:** contact-form inbox. **Settings:** name, bio, socials, avatar, résumé, and **Hero showcase** (which projects float beside the home title), all live on save.
   - **Overview:** counts plus a log of every AI job.
4. **Log out** at the bottom of the sidebar.

**Forgot or want to change the password:** `gh secret set ADMIN_SECRET_KEY --repo rsagar024/arovyx_studio`, then run the workflow. To also kick out every existing session, rotate `ADMIN_JWT_SECRET` at the same time.

Content you add in `/studio` lives in the Neon database, not in Git, so deploys never overwrite it.

### One-time setup (already done for this repo)

For reference, or to recreate the setup on a new account:

1. Sign up at **vercel.com** with **Continue with GitHub** (Hobby plan, free).
2. `npx vercel login`, then in the repo: `npx vercel link --yes --project arovyx-studio` and `npx vercel git disconnect --yes` (Actions does the deploying).
3. Neon (free): `npx vercel integration accept-terms neon`, then `npx vercel integration add neon --name arovyx-db --plan free_v3 --metadata region=iad1`.
4. Create a Vercel token (Account Settings → Tokens), then `gh secret set VERCEL_TOKEN`.
5. `gh secret set ADMIN_SECRET_KEY` (your password). Also set `ADMIN_JWT_SECRET`, `NVIDIA_NIM_API_KEY`, `DATABASE_URL` (Neon pooled), `DIRECT_URL` (Neon unpooled), `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID`, plus the variables `NEXT_PUBLIC_SITE_URL`, `NVIDIA_NIM_MODEL` and `NVIDIA_NIM_BASE_URL`.
6. Merge to `master` (or run the workflow).

### Local development against Neon

Local dev also uses PostgreSQL. With the Vercel CLI logged in and the repo linked:

```bash
npx vercel env pull .env.local --environment=development   # gitignored
```

Then open `.env.local` and add `DIRECT_URL="…"` with the value of `DATABASE_URL_UNPOOLED` from the same file (Prisma needs both). Run `npm run dev`.

Note this points at the **live** database, so anything you add or delete locally is real. For a safe sandbox, create a **branch** of the database in the Neon console (Branches → New branch) and put that branch's pooled/direct URLs in `.env.local` instead. Keep the NIM/admin values in `.env`.

### Troubleshooting

| Symptom | Fix |
| --- | --- |
| Workflow fails at **Check required secrets** | The error names the missing secret or variable; add it and re-run |
| `PrismaClientInitializationError … rhel-openssl-3.0.x` | `binaryTargets` in `prisma/schema.prisma` must include `rhel-openssl-3.0.x` (it does); re-run so the client regenerates |
| **prisma db push** refuses with a data-loss warning | A schema change would drop data. Migrate it deliberately; the workflow never passes `--accept-data-loss` |
| AI generate times out on the live site | The hosted NIM model is slow or down (it can take ~45 s); retry, or set `NVIDIA_NIM_MODEL` to another model your key can call |
| Changed a secret but the site didn't change | Secrets apply on the next deploy: run the workflow |
| Admin login always says invalid | Re-set `ADMIN_SECRET_KEY` (watch for trailing spaces), then redeploy |
| Need to roll back | Vercel dashboard → project → **Deployments** → pick a previous one → **Promote to Production** |

---

## Notes

- **Data model:** the schema is portable. `category` and `status` are strings validated by Zod, and `tags`, `techStack` and `features` are JSON-encoded strings exposed as `string[]` by the mappers in `src/lib/validators.ts`. That design dates from the original SQLite version and works unchanged on PostgreSQL.
- **Function duration:** the AI routes declare `maxDuration = 300` because NIM calls can take ~45 s and retry.
- **Social card:** `/og` runs on the edge runtime. In the Node runtime, `@vercel/og` fails to build on Windows, and edge can't reach Prisma, so the card shows the brand text rather than the editable site name. Projects with an `imageUrl` use that image instead.
- **Rate limits** (contact form, login) are in memory per serverless instance, so on Vercel they're best-effort rather than global. Use a shared store (e.g. Upstash Redis) if that ever matters.
