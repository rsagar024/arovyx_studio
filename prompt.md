# PROJECT: "Arovyx Studio" — AI-Powered Portfolio Website

Build a complete, production-ready website called **"Arovyx Studio"** using **Next.js 14+ (App Router) + React + TypeScript + Tailwind CSS**. The code must be fully functional, not a skeleton — no placeholder logic.

## 1. PROJECT OVERVIEW

Arovyx Studio is a personal developer showcase website where the owner displays their:
- **Apps**
- **Games**
- **Packages (npm/PyPI etc.)**
- **Plugins / Extensions**

The unique feature: an **AI-powered auto-fill engine**. When the owner adds a link (GitHub repo, npm page, Play Store page, itch.io page, website URL, etc.) in a hidden admin panel, the system fetches the content of that link, sends it to **NVIDIA NIM API**, and the AI automatically generates and fills in ALL project details (title, description, long description, tech stack, tags, category, features list, status, version, etc.). The site then instantly updates for normal visitors.

Normal users can browse the entire site freely (read-only). There is **no login for public users**.

## 2. TECH STACK (use exactly this)

- **Next.js 14+ with App Router** (`app/` directory)
- **TypeScript** (strict mode)
- **React 18+**
- **Tailwind CSS** for styling
- **Prisma ORM + SQLite** for the database (easily upgradeable later). If Prisma + SQLite is problematic in the environment, use a JSON-file-based data layer (`lib/db.ts`) with the same interface — but prefer Prisma.
- **Next.js API Routes / Server Actions** for backend logic
- **NVIDIA NIM API** (`https://integrate.api.nvidia.com/v1/chat/completions`) for all AI features
- **lucide-react** for icons
- **react-hot-toast** (or sonner) for notifications
- No UI component library (build custom components). No heavy animation library — use CSS transitions/keyframes.

## 3. ENVIRONMENT VARIABLES

Create a `.env.example` file with:
```
NVIDIA_NIM_API_KEY=""
NVIDIA_NIM_MODEL="meta/llama-3.3-70b-instruct"
NVIDIA_NIM_BASE_URL="https://integrate.api.nvidia.com/v1"
ADMIN_SECRET_KEY="change-this-to-a-strong-password"
ADMIN_JWT_SECRET="change-this-random-string"
NEXT_PUBLIC_SITE_URL="http://localhost:3000"
```
Read `NVIDIA_NIM_API_KEY` only on the server side. Never expose it to the client.

## 4. DATABASE SCHEMA (Prisma)

**Project model:**
- id (string, cuid)
- slug (unique, auto-generated from title)
- title
- shortDescription (1-2 lines)
- longDescription (rich text/markdown)
- category: enum `APP | GAME | PACKAGE | PLUGIN`
- tags (array of strings)
- techStack (array of strings, e.g. ["Next.js", "TypeScript"])
- features (array of strings)
- status: enum `LIVE | IN_DEVELOPMENT | ARCHIVED`
- version (string, optional)
- sourceUrl (the original link added by admin)
- demoUrl (optional)
- imageUrl (string, optional — allow admin to paste an image URL; AI may also extract one)
- stars (int, optional), downloads (int, optional)
- isPublished (boolean, default true)
- aiGenerated (boolean, default true)
- createdAt, updatedAt

**ContactMessage model:**
- id, name, email, subject, message, createdAt, isRead

**SiteConfig model (key-value):**
- ownerName, tagline, bio, email, githubUrl, linkedinUrl, instagramUrl, avatarUrl, resumeUrl, etc.

## 5. PUBLIC PAGES (what normal users see)

1. **`/` — Home / Hero page**
   - Big bold hero with site name "Arovyx Studio", animated tagline, and the owner's bio
   - A live "stats strip": total projects, total apps/games/packages/plugins counts (computed from DB)
   - Featured projects section (latest 3-6 published projects as cards)
   - Category filter tiles (Apps / Games / Packages / Plugins) linking to `/projects?category=...`
   - Smooth scroll-reveal animations on sections

2. **`/projects` — All projects**
   - Filterable + searchable grid: filter by category (tabs), search by title/tag/tech stack (client-side or server-side search with URL params)
   - Project cards: image/icon, title, short description, category badge, tech stack chips, status badge, link icons

3. **`/projects/[slug]` — Project detail page**
   - Full AI-generated details: long description, features list, tech stack, tags, meta info (version, status, stars/downloads if available)
   - Buttons: "View Source", "Live Demo" (only show if URLs exist)
   - "Similar projects" section at bottom (same category or shared tags)
   - SEO metadata + Open Graph tags generated per project

4. **`/about` — About page**
   - Owner bio, skills/tech arsenal, timeline of work (optional)

5. **`/contact` — Contact page**
   - Contact form (name, email, subject, message) that saves to the `ContactMessage` table and sends a confirmation (server-side)
   - Contact source cards with icons + direct links: **Email, GitHub, LinkedIn, Instagram** (values come from SiteConfig)
   - Copy-to-clipboard for email

6. **Global layout:**
   - Sticky glassmorphism navbar with logo "Arovyx Studio", nav links (Home, Projects with dropdown of categories, About, Contact)
   - Footer with social icons (Email, GitHub, LinkedIn, Instagram), copyright, and a subtle "Built with NVIDIA NIM" credit
   - Fully responsive (mobile-first). Dark theme **default** with a light/dark toggle saved in localStorage.
   - Custom 404 page

## 6. HIDDEN ADMIN PANEL (the core feature)

**Access:** A secret route **`/studio`** (do NOT link it anywhere in the navbar/footer). Add a small invisible/hidden entry point (e.g., pressing the logo 5 times, or keyboard shortcut `Ctrl + Shift + A`, or just direct URL access — implement direct URL + keyboard shortcut).

**Auth:**
- Login page at `/studio` asking for the admin key (compared with `ADMIN_SECRET_KEY` using constant-time comparison)
- On success, issue an HTTP-only signed cookie/JWT (`ADMIN_JWT_SECRET`). Middleware (`middleware.ts`) protects all `/studio/*` routes and `/api/admin/*` routes. Unauthenticated → redirect to `/studio` login.
- Logout button inside the admin panel.

**Admin Dashboard layout:** sidebar with sections:
- **Overview** (counts, recent AI jobs, recent contact messages)
- **Projects** (list, edit, delete, publish/unpublish)
- **Add Project (AI Auto-Fill)** ← the star feature
- **Messages** (inbox of contact form submissions)
- **Site Settings** (edit owner name, bio, email, GitHub, LinkedIn, Instagram, avatar — these update the public site)

### 6.1 AI Auto-Fill "Add Project" flow (implement exactly this pipeline)

Step 1 — Admin pastes one or more **links** into an input field (supports: GitHub/GitLab repo URL, npm/PyPI package page, Play Store/App Store page, itch.io page, Steam page, or any generic website URL). Also a category dropdown (AUTO / APP / GAME / PACKAGE / PLUGIN) — default AUTO (AI decides).

Step 2 — **Fetch phase** (server-side, in `lib/fetchers.ts`):
- If GitHub URL → use GitHub REST API (`https://api.github.com/repos/{owner}/{repo}` + `/languages` + README endpoint) to get name, description, topics, languages, stars, license, README markdown.
- If npm URL → use `https://registry.npmjs.org/{package}` to get name, description, keywords, version, repository link.
- Otherwise → fetch the raw HTML of the page server-side, extract `<title>`, meta description, Open Graph tags, and visible text (strip scripts/styles), cap at ~8000 characters.
- Handle fetch errors gracefully (show error toast; let admin still fill fields manually).

Step 3 — **AI phase** (server-side, in `lib/nim.ts`):
- Build a single chat completion request to NVIDIA NIM:
  - Endpoint: `${NVIDIA_NIM_BASE_URL}/chat/completions`
  - Headers: `Authorization: Bearer ${NVIDIA_NIM_API_KEY}`, `Content-Type: application/json`
  - Model: `${NVIDIA_NIM_MODEL}` (configurable via env; fall back to `meta/llama-3.3-70b-instruct`)
  - `temperature: 0.4`, `response_format: {"type": "json_object"}` if supported
- System prompt (use this intent): *"You are the content engine for Arovyx Studio, a developer portfolio. Given raw fetched data from a project link, generate polished portfolio content. Respond ONLY with valid JSON matching the schema: { title, shortDescription, longDescription (markdown, 3-5 paragraphs), category (APP|GAME|PACKAGE|PLUGIN), tags (5-10), techStack (array), features (5-8 bullet strings), status (LIVE|IN_DEVELOPMENT|ARCHIVED), version, imageUrl, demoUrl }. Never invent facts not supported by the input; if unknown, use null."*
- User message contains the fetched raw data + the original URL.
- Parse the JSON response defensively (strip markdown fences if present, validate fields, apply fallbacks).
- On NIM API failure (401/429/timeout), show a clear error and allow retry.

Step 4 — **Preview & Save:**
- Return the AI result to the admin UI and show it in an **editable preview form** (all fields editable before saving — admin can tweak anything).
- "Regenerate" button (re-runs the AI with the same fetched data, optionally with an extra instruction textarea, e.g. "make it more playful").
- "Save Project" button → writes to DB with `aiGenerated: true`, auto-generates slug, and instantly makes it live on the public site (if `isPublished`).
- Also support **manual add** without AI (empty form) and **edit** for existing projects.

**Bulk mode (bonus):** allow pasting multiple URLs (one per line) → queue fetch+AI for each → show progress list → each result saved as draft project.

## 7. API ROUTES TO IMPLEMENT

- `POST /api/admin/login` — verify admin key, set auth cookie
- `POST /api/admin/logout`
- `GET/POST /api/admin/projects` — list / create
- `GET/PATCH/DELETE /api/admin/projects/[id]`
- `POST /api/admin/ai/generate` — body: `{ url, category?, extraInstruction? }` → runs fetch + NIM pipeline, returns generated JSON
- `GET/PATCH /api/admin/settings`
- `GET/DELETE /api/admin/messages`, `POST /api/contact` (public form submission with basic validation + simple rate limiting)
- `GET /api/projects` (public, with `?category=&q=` filters)

All admin routes must validate the auth cookie. Use Zod for request validation.

## 8. AI SERVICE (`lib/nim.ts`) — requirements

- A typed `nimChat(system: string, user: string, opts?)` function using `fetch` (no SDK needed).
- Request timeout (e.g., 60s via `AbortController`), 2 automatic retries with backoff on 429/5xx.
- A helper `generateProjectDetails(rawData: FetchedData)` that builds the prompt, calls `nimChat`, and returns a validated `ProjectDraft` object (use Zod schema `ProjectDraftSchema`).
- A second AI feature: **"AI Description Improver"** in the admin edit form — a button that sends the current draft to NIM with "Improve/expand this description while keeping facts accurate" and replaces the field content.
- Log AI usage (timestamp, URL, success/failure) to a simple `AiLog` table shown in admin Overview.

## 9. DESIGN DIRECTION (make it look premium, not generic)

- **Aesthetic:** dark futuristic "studio lab" vibe — deep charcoal/near-black background with a subtle noise/grain texture, one sharp accent color (electric cyan `#22d3ee` or acid lime `#c7f464` — pick one and commit), soft glassmorphism panels, thin glowing borders.
- **Typography:** load Google Fonts via `<link>`: display font **"Clash Display" (via Fontshare CDN) or "Syne"**, body font **"DM Mono" or "Space Grotesk"** for a technical feel. Use tight letter-spacing on big headings, uppercase micro-labels with wide tracking.
- **Layout:** asymmetric hero (large type on left, animated project-card collage or gradient orb on the right), grid-breaking elements (overlapping badges, diagonal accent lines), generous but intentional spacing.
- **Motion:** staggered fade-up reveals on scroll (CSS `IntersectionObserver` or pure CSS), hover states on cards (lift + accent glow border), animated gradient in hero, typing effect on tagline. Keep it tasteful — choreographed, not chaotic.
- **Cards:** category color coding (each category gets its own accent chip color), tech-stack chips, status dot (green/yellow/gray).
- Must be fully responsive and pass basic accessibility (semantic HTML, alt text, focus states, keyboard-navigable).

## 10. PROJECT STRUCTURE (follow this)

```
arovyx-studio/
├── prisma/schema.prisma
├── src/
│   ├── app/
│   │   ├── layout.tsx, page.tsx, globals.css, not-found.tsx
│   │   ├── projects/page.tsx, projects/[slug]/page.tsx
│   │   ├── about/page.tsx, contact/page.tsx
│   │   ├── studio/            (admin: login page, layout with sidebar, dashboard, projects, add, messages, settings)
│   │   └── api/               (routes listed in section 7)
│   ├── components/            (Navbar, Footer, ProjectCard, CategoryBadge, Hero, ContactForm, AdminSidebar, ProjectForm, AiGeneratePanel, ThemeToggle, etc.)
│   ├── lib/                   (db.ts, nim.ts, fetchers.ts, auth.ts, slug.ts, validators.ts (Zod), utils.ts)
│   └── middleware.ts          (protect /studio and /api/admin)
├── .env.example
├── README.md                  (setup instructions: npm install, prisma db push, npm run dev, how to get NVIDIA NIM API key from build.nvidia.com, where to change admin key)
└── tailwind.config.ts, tsconfig.json, next.config.mjs, package.json
```

## 11. DELIVERY RULES

- Output the FULL code for every file, in logical order (config first, then lib, then components, then pages). No "rest of the code unchanged" shortcuts, no `// TODO` placeholders.
- All TypeScript with proper types/interfaces. Strict, working code.
- Seed the DB with 2-3 example projects (one APP, one GAME, one PACKAGE) so the site looks alive on first run, plus default SiteConfig values ("Arovyx Studio", dummy social links clearly marked as editable).
- Include the README with: install steps, env setup, how to get a free NVIDIA NIM API key (build.nvidia.com → Get API Key), and how to access the hidden admin (`/studio` or `Ctrl+Shift+A`).
- Assume the developer will run `npm install && npx prisma db push && npm run dev`.

Start now. Build the complete project file by file.