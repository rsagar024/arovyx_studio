# Arovyx Studio — Implementation Plan

Derived from `prompt.md`. This document breaks the build into ordered phases, with sub-phases
where a phase is large. Nothing gets coded until this plan is reviewed and approved.

**Stack (fixed):** Next.js 14+ (App Router) · TypeScript (strict) · React 18 · Tailwind CSS ·
Prisma + SQLite (fallback: JSON data layer in `lib/db.ts`) · NVIDIA NIM API · lucide-react ·
react-hot-toast · no UI library, no animation library.

**Design commitment:** dark "studio lab" theme, accent color = electric cyan `#22d3ee`,
Fontshare "Clash Display" (display) + "Space Grotesk" (body) via CDN `<link>`, CSS-only motion.

---

## Phase 0 — Project Scaffold & Configuration ✅ DONE
**Goal:** a runnable Next.js app with all tooling configured.

- **0.1** Initialize Next.js 14+ app (`create-next-app` or manual): TypeScript strict, Tailwind, App Router, `src/` directory.
- **0.2** Config files: `tsconfig.json`, `tailwind.config.ts` (accent color, fonts, custom keyframes), `next.config.mjs`, `postcss.config.mjs`.
- **0.3** Dependencies: `prisma`, `@prisma/client`, `zod`, `lucide-react`, `react-hot-toast`; dev: `tsx`, `@types/*`.
- **0.4** `.env.example` with all 6 variables from spec §3; `.env` local copy; `.gitignore`.
- **0.5** Google/Fontshare font `<link>` tags + base CSS variables in `globals.css` (theme colors, noise/grain texture, glassmorphism utilities).

**Exit criteria:** `npm run dev` renders a blank themed page; typecheck passes.
**Status:** ✅ Completed — Next 14.2.35 + TS strict + Tailwind 3.4 scaffolded; config files, `.env.example`/`.env`, fonts, theme CSS, root layout and placeholder page in place. `tsc --noEmit` clean, `next build` passes, live server returned HTTP 200.

---

## Phase 1 — Data Layer (Prisma + Zod) ✅ DONE
**Goal:** schema, DB access, validation, seed data.

- **1.1** `prisma/schema.prisma`: `Project` (§4 fields, enums `Category`, `Status`), `ContactMessage`, `SiteConfig`, `AiLog`. SQLite-compatible types.
- **1.2** `src/lib/db.ts`: Prisma client singleton (`globalThis` guard for dev hot-reload).
- **1.3** `src/lib/validators.ts`: Zod schemas — `ProjectInput`, `ProjectDraft` (AI output), `ContactInput`, `LoginInput`, `SettingsInput`.
- **1.4** `src/lib/slug.ts`: slugify + uniqueness check against DB.
- **1.5** `src/lib/utils.ts`: `cn()`-style class merge, date formatting, category/status metadata (label, color, icon).
- **1.6** Seed script (`prisma/seed.ts`): 3 example projects (1 APP, 1 GAME, 1 PACKAGE) + default `SiteConfig` (dummy socials marked editable) + `npx prisma db push`.

**Exit criteria:** DB pushes cleanly; seed produces queryable rows.
**Status:** ✅ Completed — schema validated & pushed to SQLite, client generated, seed created 3 projects + SiteConfig. Verified via `scripts/verify-phase1.ts`: JSON-column decoding, enum-fallback mappers, unique slugs (`pulseboard-2` self-exclusion works). `tsc --noEmit` clean, `next build` passes. Note: SQLite forces String columns for category/status (Zod-enforced) and JSON-string arrays for tags/techStack/features — mappers keep app code array-typed.

---

## Phase 2 — Core Server Libraries ✅ DONE
**Goal:** the fetch → AI → save pipeline's server side, plus auth primitives.

- **2.1** `src/lib/fetchers.ts` — `fetchProjectData(url)`:
  - GitHub/GitLab → REST repo + `/languages` + README endpoints.
  - npm → `registry.npmjs.org/{pkg}`; PyPI → `pypi.org/pypi/{pkg}/json`.
  - Generic → raw HTML fetch, extract `<title>`, meta/OG tags, strip scripts/styles, cap ~8000 chars.
  - Normalized `FetchedData` return type; graceful error objects (never throw raw).
- **2.2** `src/lib/nim.ts`:
  - `nimChat(system, user, opts)` — raw `fetch` to `${NVIDIA_NIM_BASE_URL}/chat/completions`, 60s `AbortController` timeout, 2 retries with backoff on 429/5xx, `temperature: 0.4`, `response_format: json_object` when supported.
  - `generateProjectDetails(rawData)` — builds prompt per spec §8 system prompt, defensively parses JSON (strip fences, validate via `ProjectDraftSchema`, apply fallbacks).
  - `improveDescription(current)` — the "AI Description Improver" call.
  - Server-only import of `NVIDIA_NIM_API_KEY` (never `NEXT_PUBLIC_`).
- **2.3** `src/lib/auth.ts`: constant-time compare vs `ADMIN_SECRET_KEY`; sign/verify HMAC JWT for the HTTP-only cookie using `ADMIN_JWT_SECRET`; `getSession()` helper for server components/actions.
- **2.4** `src/middleware.ts`: protect `/studio/*` (except the login page) and `/api/admin/*`; unauthenticated → redirect to `/studio`.

**Exit criteria:** unit-testable functions exist for fetch, NIM JSON parse, and token verify.
**Status:** ✅ Completed — `fetchers.ts` (GitHub/GitLab/npm/PyPI APIs + generic HTML extraction, cap 8000, warnings never throw), `nim.ts` (nimChat 60s timeout, 2 retries w/ backoff on 429/5xx, response_format fallback, defensive JSON extraction, generateProjectDetails + improveDescription, AiLog writes), `auth.ts` (Web Crypto HS256 sessions, constant-time key verify — runs in Edge + Node), `middleware.ts`. Verified: `scripts/verify-phase2.ts` 25/25 (incl. live GitHub/npm/site fetches, mocked-NIM retry 429→200, tamper/expiry rejection); HTTP test: no cookie → 307 to `/studio` + 401 JSON on API, valid cookie → passes middleware. `tsc` clean, `next build` passes (middleware bundled 27 kB). Note: `example.com` is unreachable from this network (connect timeout) — not a code issue.

---

## Phase 3 — Public Site ✅ DONE
**Goal:** the full visitor-facing site, dark theme, responsive.

- **3.1** Global layout: `layout.tsx` (fonts, theme init script to avoid FOUC, Toaster), `Navbar` (sticky glassmorphism, logo, Projects dropdown with categories, mobile menu), `Footer` (social icons, "Built with NVIDIA NIM" credit), `ThemeToggle` (light/dark, localStorage).
- **3.2** Shared components: `ProjectCard`, `CategoryBadge`, `StatusBadge`, `TechChip`, `Reveal` (IntersectionObserver scroll-reveal), `SectionHeading`, `Container`.
- **3.3** `/` Home: asymmetric hero (big type + gradient orb/card collage), animated typing tagline, bio, live stats strip (server-computed counts), featured projects (latest 3–6 published), category filter tiles.
- **3.4** `/projects`: category tabs + search box synced to URL params (`?category=&q=`), responsive grid, empty state.
- **3.5** `/projects/[slug]`: full detail (markdown long description, features, tech stack, tags, meta), conditional Source/Demo buttons, "Similar projects" (same category or shared tags), per-project `generateMetadata` + Open Graph.
- **3.6** `/about`: bio, tech arsenal, optional timeline.
- **3.7** `/contact`: form (name, email, subject, message) → `/api/contact`; contact source cards (Email, GitHub, LinkedIn, Instagram) from `SiteConfig`; copy-to-clipboard email.
- **3.8** `not-found.tsx` custom 404.

**Exit criteria:** all public pages render with seeded data, responsive at 360px+, keyboard navigable.
**Status:** ✅ Completed — `(public)` route group with Navbar (glass, projects dropdown, mobile menu), Footer (social icons + NVIDIA NIM credit), ThemeToggle (localStorage, dark default + `dark`/`light` classes), Reveal (IntersectionObserver), Hero (typing tagline, gradient orb, floating cards), stats strip, featured grid, category tiles, `/projects` (tabs + debounced search synced to `?category=&q=`), `/projects/[slug]` (safe markdown renderer, OG/Twitter meta, JSON-LD, conditional source/demo buttons, similar projects with same-category/tag scoring + fallback), `/about` (bio, tech arsenal, shipped timeline), `/contact` (form + source cards + copy-email), custom 404 with own chrome. Verified: `tsc` clean, `next build` passes, HTTP 200 on all pages with content markers, 404 for unknown slugs & routes. Contact form POSTs to `/api/contact` (ships in Phase 4).

---

## Phase 4 — Public API Routes ✅ DONE

- **4.1** `GET /api/projects` — `?category=&q=` filters, published-only for non-admin.
- **4.2** `POST /api/contact` — Zod validation + simple rate limiting (IP/time-window), writes `ContactMessage`.
- **4.3** Consistent JSON error shape; revalidate public pages after mutations.

**Exit criteria:** `curl`-verified responses for each route.
**Status:** ✅ Completed — `src/lib/api.ts` (shared `{ ok, error, details? }` error shape + `{ ok, ... }` success shape, Zod issue→field mapping, in-memory sliding-window rate limiter on `globalThis`, `isAdminRequest()` session probe, `revalidatePublicPages()`), `GET /api/projects` (case-insensitive category → 400 on unknown, `q` search across title/shortDescription/tags/techStack matching the client-side filter, drafts included only with a valid admin cookie), `POST /api/contact` (malformed-JSON 400, Zod 400 with per-field `details`, 5/IP per 10 min → 429 with `Retry-After`, 201 on insert, revalidates public pages). Verified by HTTP against `next build && next start`: 200/400/201/429 responses incl. headers, `q` + category filters, anonymous=3 vs admin=4 (draft included), garbage cookie treated as anonymous, contact row written with `isRead: false`, `ContactForm`'s `payload.error` contract satisfied. `tsc --noEmit` clean, `next build` passes (both routes ƒ dynamic). Test fixtures (1 draft project, 5 contact messages) deleted afterward; verification server stopped. Note: `scripts/print-session.ts` needs `.env` sourced manually (`set -a; . ./.env; set +a`) since tsx doesn't load it.

---

## Phase 5 — Admin Auth & Shell ✅ DONE

- **5.1** `POST /api/admin/login` — constant-time key check, set HTTP-only signed cookie; `POST /api/admin/logout` — clear cookie.
- **5.2** `/studio` login page: key input, error states, noindex, redirect away if already authenticated.
- **5.3** Studio layout: sidebar shell (Overview / Projects / Add Project / Messages / Settings), logout button, top bar; unlinked from navbar/footer.
- **5.4** Hidden entry points: direct URL + `Ctrl+Shift+A` global shortcut.
- **5.5** `middleware.ts` verification: protected routes redirect when cookie missing/invalid.

**Exit criteria:** unauthenticated request to `/studio/projects` and `/api/admin/*` is blocked.
**Status:** ✅ Completed — `src/lib/session.ts` (Node-only `getSession`/`createSession`/`clearSession` via `next/headers`, kept out of the Edge middleware bundle — `auth.ts` stays cookie-free), `POST /api/admin/login` (Zod + 10-per-15-min per-IP rate limit + constant-time verify → HTTP-only/SameSite=Lax cookie, 12 h TTL), `POST /api/admin/logout` (clears cookie; both exempted in `middleware.ts` so they're reachable unauthenticated), `/studio` login page (server-side redirect away if authed, noindex, inline error states for invalid key / rate limit / network), studio shell via `(panel)` route group (auth-checked layout → client `StudioShell`: sidebar with the 5 sections + active states, sticky topbar with ThemeToggle, logout button, mobile drawer; section pages are honest Phase-6 placeholders), `AdminShortcut` (invisible Ctrl/Cmd+Shift+A → `/studio`, mounted in root layout). Verified by HTTP against `next build && next start`: unauthenticated `/studio/projects` → 307 to `/studio?next=…` and `/api/admin/projects` → 401; wrong/missing key → 401/400 from the route; correct key → 200 + HttpOnly signed cookie, all 4 section pages 200, `/studio` → 307 to overview; logout → cookie expired (Max-Age=0), subsequent request 307 again; `noindex` present on login + panel pages; zero `href="/studio"` links in any public page; shortcut handler confirmed in the client bundle. `tsc` clean, `next build` passes (all 8 studio routes ƒ dynamic). Note: sessions are stateless JWTs — logout expires the cookie in the browser; the token itself stays cryptographically valid until its 12 h expiry (no server-side revocation list, per spec's simple signed-cookie design).

---

## Phase 6 — Admin Features (core: AI Auto-Fill) ✅ DONE
**Goal:** the star feature plus full CRUD. Large phase → sub-phases.

### 6A — Projects CRUD ✅ DONE

- `GET/POST /api/admin/projects`, `GET/PATCH/DELETE /api/admin/projects/[id]` with Zod + auth checks.
- Projects list page: table/cards, publish/unpublish toggle, edit, delete (confirm), search.

**Status:** ✅ Completed — `projectUpdateSchema` (partial + optional slug override) in `validators.ts`; `GET /api/admin/projects` (all incl. drafts, `updatedAt` desc) + `POST` (Zod, auto unique slug `title` → `title-2`); `[id]` route: `GET`, `PATCH` (partial merge — arrays re-encoded only when touched, untouched arrays keep stored encoding; slug override uniquified excluding own id; 404 on unknown), `DELETE` (404 on unknown); every handler re-checks the session (defense in depth over middleware) and mutations call `revalidatePublicPages` incl. `/projects/[slug]`. `/studio/projects` is now the real manager: `AdminProjectsList` (fetches on mount, loading/error/retry + empty states, live/draft counts, search across title/slug/category/tags, publish-unpublish toggle, two-step confirm delete, edit link, demo link, toast feedback); `/studio/projects/[id]/edit` loads the project (404 if unknown) as a Phase 6C form shell. Verified by scripted HTTP lifecycle (29/29): anon 401s, login, create + slug uniqueness, validation 400 with field details, public list reflecting isPublished in real time, PATCH slug/array-merge behavior, new slug live on public detail page, all 404 paths, deletes restoring seed state, studio pages gated by cookie. `tsc` clean, `next build` passes (18 routes).

### 6B — AI Auto-Fill pipeline (`AiGeneratePanel`) ✅ DONE

- Link input (one URL) + category dropdown (`AUTO | APP | GAME | PACKAGE | PLUGIN`, default AUTO).
- `POST /api/admin/ai/generate` → `fetchProjectData` → `generateProjectDetails` → typed result.
- Client states: idle → fetching → generating → preview / error (clear message on 401/429/timeout with Retry).
- **Bulk mode:** multiline URL input (one per line), queued sequential processing, per-URL progress list, each result saved as a draft.

**Status:** ✅ Completed — `POST /api/admin/ai/generate` (defensive session check, `aiGenerateSchema`, fetch phase: `FetchError` → 422, no-content → 422 surfacing the fetcher's warnings verbatim; AI phase: typed `NIMError` mapping — missing_key→503, rate_limited→429, timeout→504, auth/server/invalid_response/network→502, each with the `details.code` + NIM's human message; returns `{ project, source, sourceLabel, warnings, stars }`). `AiGeneratePanel`: Single/Bulk tabs, category select (AUTO omits the field so the AI decides), state machine idle → working → preview/error with Retry, single preview card (chips, version, stars, features, fetch warnings, Start over), bulk mode processes URLs sequentially with per-URL queued/working/saved/error progress and saves each result via `POST /api/admin/projects` as `isPublished:false, aiGenerated:true` draft; wired into `/studio/add`. Verified by scripted HTTP against `next build && next start` + a switchable mock NIM (20/20): anon 401, invalid URL 400, `ftp://` 422, unreachable host 422 with fetch problem, happy path with **live GitHub fetch** (source=github, 143222★, valid draft), AiLog rows written, category override, extraInstruction, mock-429→429 (`details.code=rate_limited`) after retries, mock-401→502 with key message, recovery, and panel SSR markers in the `/studio/add` DOM. **Gotcha found:** Next.js inlines `process.env.*` at build time — pointing `NVIDIA_NIM_BASE_URL` at a mock via shell env at `next start` has no effect; the values must be in `.env` *and* rebuilt. `.env` restored to original values and rebuilt afterward; verification servers stopped, temp scripts removed.

### 6C — Preview & Save ✅ DONE

- Editable preview form (`ProjectForm`) — every AI field editable, unsaved-state handling.
- **Regenerate** button re-running AI on the same fetched data with optional extra-instruction textarea.
- **Save Project** → insert with `aiGenerated: true`, auto slug, live immediately if `isPublished`.
- **Manual add** (empty form) and **edit existing** share the same `ProjectForm`.
- **AI Description Improver** button on the description field.

**Status:** ✅ Completed — `fetchedDataSchema` + `improveInputSchema` in `validators.ts` (TDZ-safe ordering); generate route now accepts `fetchedData` (validated round-trip skips the fetch phase — proves "same fetched data" on Regenerate) and returns `fetched`; `nimHttpStatus` moved to `nim.ts`; new `POST /api/admin/ai/improve`. `ProjectForm` (shared): string-typed state, dirty tracking (beforeunload + confirm on back + "Unsaved changes" badge), client validation → server Zod `details` mapped per field, create (POST → redirect) / edit (PATCH, `aiGenerated` untouched), comma/line-separated tags/tech/features inputs, Improve-with-AI on the descriptions (disabled until both filled), Regenerate box with optional extra instruction (confirm before overwriting edits), publish toggle. `StudioAddFlow` switches panel ↔ form; manual add sends `aiGenerated:false`; wired into `/studio/add` and `/studio/projects/[id]/edit` (real 404 for unknown ids). Verified: scripted HTTP (mock NIM) **18/18** — fetchedData echo skips fetch (unreachable-URL-in-echo still 200), malformed echo → 400, improve round-trip + AiLog + 400 details + anon 401, full form create/edit lifecycle with persisted arrays, DOM markers on both pages; plus **live real-NIM battery 8/8 with 0 parse failures** (improve ×5, GitHub/npm generate ×3).

**Live-NIM findings (fixed, not worked around):** (1) `.env` has a real API key; the spec's default `meta/llama-3.3-70b-instruct` is **retired (410 Gone)** and hosted accounts only have entitlement to a catalog subset (others 404) — model set to `meta/llama-3.2-11b-vision-instruct` in `.env`, `.env.example` and the `nim.ts` fallback. (2) `extractJson`'s non-greedy ``` fence regex **truncated at the first inner code block** inside `longDescription` — now only boundary fences are stripped (the root cause of most "invalid JSON" failures). (3) Model emits raw newlines/`"""` triple-quoted strings and occasionally stops before the final `}` — added string-aware repairs (`escapeControlCharsInStrings`, `restoreTripleQuotedStrings`, `closeTruncatedJson`) as escalating parse candidates, one automatic re-ask on `invalid_response` (`nimJson`), explicit `max_tokens: 4096`, and failure-only diagnostics (parse errors + full content + non-`finish_reason=stop`). (4) Pitfall: `next start` serving a `.next` replaced by a rebuild yields `EADDRINUSE`/mixed chunks — always kill port 3000 before rebuilding.

### 6D — Messages & Settings ✅ DONE
- Messages inbox: list, read/unread, detail view, delete.
- Site Settings form (`GET/PATCH /api/admin/settings`): owner name, tagline, bio, email, GitHub, LinkedIn, Instagram, avatar, resume — immediately reflected on the public site.

**Status:** ✅ Completed — API: `GET /api/admin/messages` (newest first + `unreadCount`), `PATCH /api/admin/messages/[id]` (`messageUpdateSchema` `{ isRead }`), `DELETE /api/admin/messages/[id]`, `GET/PATCH /api/admin/settings` (`settingsInputSchema.partial()`, upsert id=1, `revalidatePublicPages()`); URL fields in `settingsInputSchema` now `.trim()` before `.url()`. `MessagesInbox` (client): load/error/Retry states, total/unread counts, All/Unread filter (the open message stays listed after it's auto-read), search across name/email/subject/body, master–detail layout (stacked on mobile), unread dot + bold, opening auto-marks read (optimistic, reverts on failure), Mark read/unread toggle, mailto Reply with `Re:` subject, copy-email, two-step delete that selects the next message. `SettingsForm` (client, seeded server-side from `getSiteConfig()` — no loading flash): Identity / Contact & socials / Media fieldsets, bio counter, live avatar preview with broken-image warning, client validation mirroring the schema, server `details` → per-field errors, dirty tracking (beforeunload + badge, Save disabled when clean), Reset to last saved. Public site: `/about` now renders the avatar (with owner name) and a Résumé button when set; previously `avatarUrl`/`resumeUrl` were stored but unused. Verified by scripted HTTP against `next build && next start` (**36/36**): anon 401 on every messages/settings method + 307 on `/studio/messages`, contact POST → inbox lists newest first with `unreadCount` +2 → PATCH read → +1, bad body 400 with `details`, malformed JSON 400, unknown id 404 (PATCH + DELETE), deletes restore counts, settings invalid email/URL → 400 with both field details, blank ownerName 400, valid PATCH → URL trimmed server-side and new values visible on `/` (hero + footer siteName), `/about` (avatar + résumé) and `/contact` (GitHub) without restart, both studio pages 200 with markers, original settings restored. `tsc` clean, `next build` passes (22 routes). Test messages deleted; server stopped; temp script removed. Deferred: unread badge on the sidebar Messages item (Overview in 6E will surface recent messages).

### 6E — Overview dashboard + AI logging ✅ DONE
- Counts (projects per category, published/draft), recent contact messages, recent `AiLog` entries (timestamp, URL, success/failure).

**Status:** ✅ Completed — AI logging already existed (`logAiUse()` in `nim.ts` writes an `AiLog` row per generate/improve call and never throws; fetch failures return 422 before NIM is called and are not logged, by design), so 6E reads it. `src/lib/dashboard.ts` `getDashboardData()` is a single `Promise.all`: `groupBy(category, isPublished)` seeded with zeros for every category (unknown strings ignored), AI-generated count, 5 recent messages + unread count, 10 recent AiLogs + 30-day success/failure counts, 5 most recently updated projects. No new API route; the server page is the only consumer. `/studio/overview` is now an async server component: 4 stat tiles (projects live/drafts, unread messages → inbox, AI jobs over 30d with success rate, AI-generated), projects-by-category rows with CSS published-ratio bars in category colors, recent messages (unread dot, relative time), recent AI jobs (✓/✗, action chip, host+path URL with full URL on hover, model, truncated error on failures), recently updated projects (→ edit, Live/Draft chip), and header actions (View site, Add project). New `relativeTime()` in `utils.ts`. Verified by scripted HTTP against `next build && next start` (**22/22 dashboard checks**): anon 307, total/live/drafts/AI-generated and all 4 per-category published/draft counts match `GET /api/admin/projects`, unread matches the messages API, creating a GAME draft → drafts +1 and GAME draft +1 and listed under Recently updated, a contact POST → unread +1 and subject listed, a failed AI job (NIM timeout) is rendered with its error text; test project/message deleted and counts restored. `tsc` clean, `next build` passes.

**Exit criteria:** paste a GitHub URL → preview appears → edit → save → project visible on `/projects` without restart.
**Exit-criterion status: ✅ met (closed in Phase 8.2).** The NIM outage of 2026-10-25 (the hosted 11b-vision model hung; 2 timed-out attempts are logged as failures on Overview) later cleared. The Phase 8 live flow ran: GitHub URL → live NIM generate (200 in 46.9 s) → edited title → save → title on `/projects` and detail page 200, with no restart.

---

## Phase 7 — Polish, SEO & Accessibility ✅ DONE

- **7.1** Motion pass: staggered fade-up reveals, card hover lift + accent glow, animated hero gradient, typing tagline — CSS/keyframes only, respects `prefers-reduced-motion`. ✅
- **7.2** Category color coding, status dots, overlapping/grid-breaking badges per spec §9. ✅

**7.1 Status:** ✅ Completed. This was a gap-closing pass; Reveal, the typing tagline, the gradient heading and the global reduced-motion kill-switch already existed. Fixes:
- **Hero orb:** `animate-gradient-x` on a default-size gradient never visibly moved; it now has `bg-[length:200%_200%]`.
- **Hero cards:** new `float` keyframe; the three floating cards drift out of phase (`motion-safe:animate-float`, delays 0/1.2s/2.4s), with an outer float wrapper so the inner hover lift still works. Card labels now use `CATEGORY_META.accentText`.
- **Tagline a11y:** `aria-label` on a `<p>` (ignored by screen readers) replaced with `sr-only` text plus an `aria-hidden` animated span.
- **`Reveal`:** sets `data-reveal`; under reduced motion it shows immediately with no stagger delay. A `<noscript>` style in the root layout un-hides `[data-reveal]` so the no-JS view isn't blank.
- **`/projects` grid:** previously had no motion; now a CSS-only `motion-safe:animate-fade-up` stagger (60 ms steps, capped at 8). The grid is keyed on category, so switching tabs replays it. While searching, only newly matching cards animate; re-keying per keystroke flickered.
- **Card hover:** lift + glow now also applies on keyboard focus (`focus-within`), in the category's color (see 7.2).

**7.2 Status:** ✅ Completed. `CATEGORY_META` gained literal `hoverBorder` / `glow` / `line` strings per category (cyan / lime / violet / amber).
- **`ProjectCard`:**
  - The category badge now overlaps the card's top border (`absolute -top-3 left-5` on an opaque `--bg` backing, grid-breaking per spec §9). `overflow-hidden` was removed to allow this.
  - The quick-link slide was reduced to `translate-x-2`, so nothing pokes past the card at 360px.
  - Added a 1px category-colored top accent line.
  - Hover/focus border and glow are in the category color instead of cyan everywhere.
  - Grids got `gap-y-8` so the overlapping badges have room.
- **`CategoryBadge`:** a colored dot, so the coding isn't text-color-only.
- **`StatusBadge`:** LIVE gets a pulsing `motion-safe:animate-ping` ring; dots stay green/yellow/gray.
- **Home category tiles:** category glow plus a `focus-visible` lift.
- **`/projects` tabs:** the active tab takes its category chip colors (`All` keeps the accent).
- **Detail page:** diagonal accent line in the category color behind the header (`hidden sm:block`, clipped).

**Verification (7.1 + 7.2):**
- `tsc` clean, `next build` passes.
- Rendered HTML of `/`, `/projects`, `/projects?category=GAME` and a LIVE detail page has every marker: float + delays, orb bg-size, sr-only tagline (no `aria-label`), `data-reveal` + `<noscript>` fallback, ≥3 overlapping badges, fade-up stagger, category hover borders, accent lines, the LIVE ping, badge dots, a lime active GAME tab, and the diagonal detail line.
- The CSS bundle has hover + `focus-within` glow rules for all 4 category colors, `@keyframes float`, `motion-safe:` rules inside `prefers-reduced-motion:no-preference`, and the reduced-motion kill-switch.
- Still to do by hand (no browser in this environment): hover and Tab through cards in both themes at 360px and desktop, and toggle OS reduced motion.
- **7.3** SEO: site-level `generateMetadata`, sitemap/robots if trivial, OG tags on all public pages. ✅
- **7.4** A11y: semantic landmarks, alt text, visible focus states, labeled form inputs, skip link. ✅
- **7.5** Theme toggle correctness across public + studio routes. ✅

**7.3 Status:** ✅ Completed.
- **Root layout:** now `generateMetadata()`: `metadataBase` from `NEXT_PUBLIC_SITE_URL` (the build's `metadataBase` warning is gone), title default/template from the editable `SiteConfig.siteName`, OG/Twitter defaults, and a `viewport` export with dark/light `theme-color` + `colorScheme`.
  - Deliberately **no** site-wide canonical, since every page that didn't set its own would inherit it.
- **`src/lib/seo.ts` `pageMetadata()`:** each public page uses it to build the full canonical + OG + Twitter set.
  - Next *replaces* a page's `openGraph` object rather than merging it, so a partial override would drop `siteName`/images.
  - The home page now has explicit metadata, with its description truncated to 160 chars because the bio can be 4000.
  - `/projects/[slug]` keeps `type: article` + keywords + its own `imageUrl`, falling back to the default card.
- **Default card:** served by `GET /og` (`next/og` `ImageResponse`, 1200×630, brand + category chips) instead of the `opengraph-image` file convention. File-based images override config images and would have clobbered per-project `imageUrl`.
  - **Gotcha:** in the Node runtime `@vercel/og` fails at build on Windows ("Invalid URL" loading its bundled font), so the route runs on **edge**. It therefore can't read Prisma and carries static brand text.
- **New `sitemap.ts`:** 4 static pages + every published project with `lastModified`.
- **New `robots.ts`:** disallows `/studio` and `/api/`, links the sitemap.

**7.4 Status:** ✅ Completed.
- **Skip link:** new `SkipLink` ("Skip to content", visible on focus), first element in the public layout, the studio shell and the 404. Matching `<main id="main" tabIndex={-1}>` also on the login page.
- **404:** now has a `<main>` landmark, and its broken indentation is fixed.
- **Field focus:** 9 fields used `focus:outline-none`, which outranks the global `:focus-visible` rule. A global `input/textarea/select:focus-visible` box-shadow ring now survives it.
- **Menus:** Escape closes the Navbar mobile menu and the studio drawer and returns focus to the toggle. Both toggles gained `aria-expanded` / `aria-controls`.
- **Icons:** decorative icons in the menu/theme toggles are `aria-hidden`.
- **Already compliant (audit):** landmarks, nav labels, form labels (contact/login/studio forms), image alt text.

**7.5 Status:** ✅ Completed.
- **Real bug found:** `bg-[var(--bg)]/80|90|95` generated **no CSS at all**, because Tailwind can't apply an alpha modifier to a `var()` hex. The scrolled navbar, the projects dropdown, the mobile menu and the studio sidebar/topbar were see-through apart from blur. Fixed with per-theme `--bg-rgb` triplets and `bg-[rgb(var(--bg-rgb)/0.8)]`-style classes.
- **`ThemeToggle`:** instances now sync. A `arovyx-theme` window event covers the desktop and mobile navbar toggles on the same page; the `storage` event covers other tabs and applies the class there. It also gained a `title` tooltip.
- **Toaster:** follows the theme via a new `--toast-bg` var plus `--fg` / `--border` (it was hard-coded dark).

**Verification (7.3–7.5):**
- `tsc` clean, `next build` passes with no warnings.
- Scripted HTTP against `next start`, **71/71** checks (one regex fixed for the minifier's selector order):
  - `sitemap.xml` has all 4 static pages + every published slug, no studio/api.
  - `robots.txt` has the disallows + sitemap.
  - `/og` returns a 200 `image/png` (>5 kB).
  - `/`, `/projects`, `/about`, `/contact` and detail pages each have `og:title`, `og:site_name`, an absolute `og:url` matching the canonical, an absolute `og:image`, `summary_large_image`, 2 `theme-color` metas, and skip link + `#main`.
  - A detail page with `imageUrl` keeps it; one without falls back to `/og`.
  - The home title is the site name.
  - The 404 has `<main id=main>`; the studio login + panel have the skip target + `noindex` + drawer `aria-controls`.
  - The CSS has the translucent 0.8/0.9/0.95 rules, `--bg-rgb` / `--toast-bg` for both themes, the field focus ring and the skip-link focus rule.
- Still to do in a browser: Tab → skip link; Escape closes both menus; theme sync across both navbar toggles + a second tab; toasts in light mode; the now-opaque scrolled navbar/dropdown.

---

## Phase 8 — Verification & Docs ✅ DONE

- **8.1** `npx tsc --noEmit` (strict) and `npm run build` — zero errors.
- **8.2** Flow test through the app: seed → browse → search/filter → project detail → contact form writes DB → login → AI generate (mock/real) → save → appears publicly → settings update reflected → logout.
- **8.3** API checks via HTTP for every route in spec §7, including auth-rejection paths.
- **8.4** README: install steps (`npm install && npx prisma db push && npm run dev`), env setup, getting a free NVIDIA NIM key (build.nvidia.com → Get API Key), admin access (`/studio` or `Ctrl+Shift+A`), where to change the admin key.
- **8.5** Final review against every numbered requirement in `prompt.md` (§1–§11).

**Status:** ✅ Completed. Two spec gaps were found and fixed during the audit:
- **§11 first run:** `npx prisma db push` doesn't run the seed, so the spec's `npm install && npx prisma db push && npm run dev` produced an empty site. `seed.ts` now takes `--if-empty` (skips when any Project/SiteConfig row exists) and runs via `predev`/`prestart` hooks, so later runs never overwrite edits or resurrect deleted seed projects. Verified on a scratch DB: run 1 seeded 3 projects + config, run 2 skipped, real `dev.db` hash unchanged; `npm start` logged the skip.
- **§7 `DELETE /api/admin/messages`:** only the per-id route existed. Added a collection `DELETE { ids: cuid[1..100] }` → `{ deleted }` (`messageBulkDeleteSchema`).

Results:
- **8.1:** `npm run typecheck` clean; `npm run build` exit 0 with **zero warnings or errors** (27 routes).
- **8.2 + 8.3:** one scripted run against `npm start` with real GitHub + **live NVIDIA NIM**: **106/106 passed, 0 blocked**.
  - Public browsing: home stats strip = DB counts per category, the NIM footer credit, dark default, no `/studio` links; GAME tab filter and `q` search; detail + similar projects; `/about`, `/contact`; custom 404.
  - Contact: POST 201 with confirmation → row `isRead:false`.
  - Auth: wrong key 401 → login with HttpOnly cookie.
  - Live generate (200, 46.9 s, github source + stars) → edited title saved → visible on `/projects` + detail (**Phase 6 exit criterion**).
  - Settings: owner name on `/` without restart.
  - **Every admin route × anon 401 and forged-cookie 401** (13 method/route pairs); all 5 studio pages 307 when anonymous.
  - Login 400s; projects CRUD (draft hidden from anon list and detail 404, visible to admin, publish → public, 400/404 paths).
  - AI validation (400 / 422 ftp / 400 category) and improve 400.
  - Settings 400 with details; messages PATCH/DELETE per id + bulk DELETE (400 empty / non-cuid / malformed, deleted:2 then 0).
  - Public `/api/projects` bad category 400 + case-insensitive filter; contact 400 details + 429 with `Retry-After` on the 6th post.
  - sitemap / robots / og 200.
  - **`NVIDIA_NIM_API_KEY`, `ADMIN_SECRET_KEY` and `ADMIN_JWT_SECRET` appear in none of the 35 `.next/static` files or the public HTML.**
  - Cleanup restored settings, project count and inbox. Logout expires the cookie (`Max-Age=0`) → 307.
- **8.4:** `README.md` covers quick start (3 commands, auto-seed), the env table, the free NIM key steps, the retired-model note, admin access (`/studio`, Ctrl/Cmd+Shift+A, 12 h session, how to change the key and invalidate sessions), the features tour, the API table, scripts, structure, and notes (rebuild after `.env` changes, SQLite → Postgres, on-page contact confirmation, edge OG card, in-memory rate limits).
- **8.5:** see **Spec compliance** below. No `TODO` / `FIXME` / placeholder text remains in `src/`.

---

## Spec compliance (prompt.md §1–§11)

✅ = met · ⚠️ = met with a documented deviation

| § | Requirement | Status | Where |
|---|---|---|---|
| 1 | Showcase of apps/games/packages/plugins; AI auto-fill from a link; public read-only, no public login | ✅ | `(public)/*`, `studio/(panel)/add`, `lib/fetchers.ts` + `lib/nim.ts` |
| 2 | Next 14 App Router, TS strict, React 18, Tailwind, Prisma+SQLite, API routes, NIM, lucide, react-hot-toast, no UI/animation libs | ✅ | `package.json`, `tsconfig.json` |
| 3 | `.env.example` with the 6 vars; NIM key server-only | ⚠️ | `.env.example` (+ `DATABASE_URL`). The default model is `meta/llama-3.2-11b-vision-instruct` because the spec's 3.3-70b is retired (410). Key absent from client bundles (8.3). |
| 4 | Project / ContactMessage / SiteConfig models with all fields | ⚠️ | `prisma/schema.prisma`. SQLite has no enums or lists: category/status are Zod-validated strings and tags/techStack/features are JSON strings with array mappers. Extra `AiLog` model per §8. |
| 5.1 | Home: hero, animated tagline, bio, live stats strip, featured 3–6, category tiles, scroll reveals | ✅ | `(public)/page.tsx`, `Hero`, `Reveal` |
| 5.2 | `/projects`: category tabs + search (title/tag/tech) via URL params; card contents | ✅ | `ProjectExplorer`, `ProjectCard` |
| 5.3 | Detail: long desc, features, tech, tags, meta; conditional Source/Demo; similar projects; per-project SEO/OG | ✅ | `projects/[slug]/page.tsx`, `lib/seo.ts` |
| 5.4 | About: bio, tech arsenal, timeline | ✅ | `about/page.tsx` (+ avatar/résumé) |
| 5.5 | Contact form → DB + "sends a confirmation (server-side)"; source cards; copy email | ⚠️ | `api/contact`, `ContactForm`, `ContactLinks`. The confirmation is the server-generated response shown on the page; no email (decided in Phase 8, no mail infrastructure). |
| 5.6 | Glass sticky navbar + Projects dropdown; footer socials, copyright, NIM credit; responsive; dark default + toggle in localStorage; custom 404 | ✅ | `Navbar`, `Footer`, `ThemeToggle`, `not-found.tsx` |
| 6 | Hidden `/studio` (unlinked) via direct URL + Ctrl+Shift+A | ✅ | `studio/page.tsx`, `AdminShortcut` |
| 6 | Constant-time key check; HTTP-only signed cookie (`ADMIN_JWT_SECRET`); middleware protects `/studio/*` + `/api/admin/*`; logout | ✅ | `lib/auth.ts`, `lib/session.ts`, `middleware.ts`, `StudioShell` |
| 6 | Sidebar: Overview, Projects, Add (AI), Messages, Settings | ✅ | `studio/(panel)/*` |
| 6.1 | Step 1: link input (GitHub/GitLab/npm/PyPI/Play/App Store/itch/Steam/any) + AUTO/category dropdown | ✅ | `AiGeneratePanel` (non-API hosts use generic HTML extraction) |
| 6.1 | Step 2: GitHub repo + languages + README; npm registry; generic HTML title/meta/OG/visible text ≤8000; graceful errors | ✅ | `lib/fetchers.ts` (+ GitLab, PyPI) |
| 6.1 | Step 3: NIM chat/completions, Bearer, env model + fallback, temp 0.4, `json_object` if supported, spec system prompt, defensive parse, clear 401/429/timeout errors + retry | ✅ | `lib/nim.ts`, `api/admin/ai/generate` |
| 6.1 | Step 4: editable preview; Regenerate on same data + extra instruction; Save (`aiGenerated`, slug, live if published); manual add; edit | ✅ | `ProjectForm`, `StudioAddFlow` |
| 6.1 | Bulk mode: multi-URL queue, progress, saved as drafts | ✅ | `AiGeneratePanel` (Bulk tab) |
| 7 | All listed routes, auth-validated, Zod | ✅ | `src/app/api/**`; collection `DELETE /api/admin/messages` added in Phase 8; 8.3 covers every route |
| 8 | Typed `nimChat` via fetch, 60 s timeout, 2 retries w/ backoff on 429/5xx; `generateProjectDetails` → `ProjectDraftSchema`; AI Description Improver; `AiLog` shown on Overview | ✅ | `lib/nim.ts`, `api/admin/ai/improve`, `lib/dashboard.ts` |
| 9 | Dark studio-lab look, noise, single accent (cyan `#22d3ee`), glass, glowing borders | ✅ | `globals.css`, `tailwind.config.ts` |
| 9 | Clash Display (Fontshare) + Space Grotesk via `<link>`; tight headings; micro-labels | ✅ | `app/layout.tsx`, `.micro-label` |
| 9 | Asymmetric hero, grid-breaking overlapping badges, diagonal accent lines | ✅ | `Hero`, `ProjectCard`, detail page |
| 9 | Staggered fade-up, card lift + glow, animated hero gradient, typing tagline; tasteful | ✅ | Phase 7.1 (reduced-motion respected) |
| 9 | Category chip colors, tech chips, status dot green/yellow/gray | ✅ | `CATEGORY_META`, `STATUS_META`, badges |
| 9 | Responsive + basic a11y (semantic HTML, alt, focus, keyboard) | ✅ | Phase 7.4 (skip link, landmarks, focus rings, Escape menus) |
| 10 | Project structure | ✅ | Matches. Admin sidebar lives in `studio/StudioShell` (the spec's suggested `AdminSidebar` name). |
| 11 | Full code, typed, no TODOs | ✅ | grep for `TODO`/`FIXME`/placeholders: 0 hits |
| 11 | Seed 2–3 projects (APP, GAME, PACKAGE) + default SiteConfig with editable dummy socials | ✅ | `prisma/seed.ts` |
| 11 | README: install, env, free NIM key, hidden admin access | ✅ | `README.md` |
| 11 | Works with `npm install && npx prisma db push && npm run dev` | ✅ | auto-seed via `predev` (fixed in Phase 8) |

---

## Phase 9 — Deployment (Vercel + Neon, GitHub Actions) ✅ DONE

GitHub Pages was ruled out because it's static-only: it can't run `/studio` auth, the API routes, NIM calls or a database.
- **DB:** Prisma moved from SQLite to **PostgreSQL** (`url` pooled + `directUrl`, `binaryTargets` adds `rhel-openssl-3.0.x` for Vercel functions). The column design is unchanged. A free Neon DB `arovyx-db` (iad1) was provisioned via the Vercel Marketplace CLI.
- **Hosting:** Vercel project `arovyx-studio` (iad1), linked by CLI with **Vercel Git auto-deploy disconnected**, so Actions is the only deploy path.
- **Workflow:** `.github/workflows/deploy.yml` runs on push to `master` and on manual dispatch, with `concurrency: production`.
  - `check`: typecheck + `prisma validate`.
  - `deploy`: required-secret gate → sync GitHub Secrets to Vercel runtime env (`DATABASE_URL` excluded, since the Neon integration manages it) → `prisma db push` (no data-loss flag) → `seed --if-empty` → `vercel pull/build --prod/deploy --prebuilt --prod` → smoke test.
- **Secrets:** all in GitHub Secrets (8) + Variables (3). `ADMIN_SECRET_KEY` and `VERCEL_TOKEN` were entered by the owner; the rest were piped in without being printed, and `ADMIN_JWT_SECRET` was freshly generated. The AI routes declare `maxDuration = 300`. `prestart` was dropped and `postinstall: prisma generate` added.
- **Live:** <https://arovyx-studio.vercel.app> (admin at `/studio`). First green deploy: run #4 (PR #4), 1m32s.
- **CI fixes on the way** (each shipped as its own PR, so merge-triggered deploys were exercised 4×):
  1. PR #2: `vercel env` needs project settings, so pull before sync. It still failed in CI with the CLI's generic "Could not retrieve Project Settings" (the same command works locally).
  2. PR #3: replaced the CLI with the **Vercel REST API upsert** (`POST /v10/projects/:id/env?upsert=true`), so failures now print the real HTTP status and error. The sync then passed.
  3. PR #4: values synced as *sensitive* can't be read back, so `vercel pull` wrote `[SENSITIVE]` for `NEXT_PUBLIC_SITE_URL` and the prerender crashed on `new URL(...)`. GitHub **Variables** now sync as *plain* and **Secrets** stay *sensitive* (runtime-only). This was reproduced locally with `vercel pull` + `vercel build --prod` before shipping.
- **Verification:**
  - Locally: schema pushed to Neon, seeded 3 projects (second run skipped), production `next build` against Neon passes (27 routes, no warnings).
  - Workflow smoke test: `/`, `/projects`, `/api/projects`, `/robots.txt`, `/sitemap.xml` and `/studio` → 200; anonymous `/studio/overview` → 307.
  - Independent live checks:
    - 3 projects served from Neon
    - detail page 200
    - sitemap on the live domain
    - `/studio` has `noindex, nofollow`
    - anonymous `/api/admin/projects` 401
    - wrong admin key 401
    - contact validation 400
    - `/og` PNG
    - custom 404
    - NIM key in **0 of 12** live JS bundles
  - Admin login and a live AI generate need the owner's password, so the owner checks them.

## Phase 10 — Play Store media + Studio-controlled hero cards ✅ DONE

**Play Store media**
- **Fetcher:** new source `playstore` (`play.google.com/store/apps/details?id=…`), fetched as `hl=en&gl=US` with a browser user agent.
  - Reads Play's embedded `ds:5` data: icon `[95,0,3,2]`, feature graphic `[96,0,3,2]`, screenshots `[78,0][i][3,2]` with dims, installs `[13,1]`.
  - Phone screenshots are kept by aspect ratio ≥ 1.7 (tablet/Chromebook are ~1.33–1.6), de-duplicated, max 8. Image URLs are re-sized: `=s512` / `=w1024` / `=h720`.
  - Fallbacks: `og:image` for the icon and `<img alt="Screenshot image">` for screenshots, with a warning. Missing media stays empty.
  - Live-tested on Spotify, DuckDuckGo, Firefox and Fossify Notes (all media 200 `image/*`); a bogus id returns a clean 404 warning.
- **Data:** additive columns `Project.bannerUrl`, `Project.screenshots` (JSON `string[]`); `imageUrl` is now the app icon.
  - Encoded or decoded only when touched (create/PATCH), like `tags`.
  - Zod: `screenshots` URLs only, max 12. `fetchedDataSchema` carries the media so Regenerate keeps it.
- **Generate route:** fetched media **overrides** the AI draft (the AI never invents media). This also covers bulk mode. Installs are passed to the AI prompt and into the form.
- **UI:**
  - Studio form: a **Media** group (icon, banner, screenshots, each with a preview); the AI preview shows the banner, icon and screenshot count.
  - Detail page: banner header with a theme-aware fade, 80 px icon beside the title, and a scroll-snap screenshot gallery (omitted when empty).
  - **"Get it on Google Play"** button via `sourceLinkMeta()`; other hosts get GitHub/GitLab/npm/PyPI/Visit labels.
  - The OG image prefers the banner. JSON-LD gains `image`, `screenshot` and Android `installUrl`.
  - Cards get a Play badge and a source-aware quick link.

**Hero cards**
- `SiteConfig.heroProjectIds` (JSON, max 3 cuids). `pickHeroProjects()` keeps the chosen order, skips unpublished or deleted projects, and falls back to the latest 3.
- `Hero` takes `cards`; the hard-coded PulseBoard/Nebula Drift/tinyfetch are gone. Each card is now a real link with icon and category colour.
- Studio **Settings → Hero showcase**: tick up to 3 projects and reorder with ▲/▼.

**Verification**
- `tsc` clean; `next build` passes on real PostgreSQL (27 routes).
- Testing used a throwaway **embedded-postgres** in the scratchpad. PGlite was tried first but can't serve a Next build's parallel workers. The live Neon DB was never touched before merge.
- E2E against `next start`: **39/39**.
  - Live Play generate in 23 s with media from the fetch.
  - Detail page: banner, icon, button and gallery all present. The no-media project shows no gallery or banner.
  - PATCH validation: a bad URL and 13 screenshots each → 400; other edits keep the screenshots; clearing works.
  - Hero: default = latest 3; chosen order honoured; invalid id or 4 ids → 400; an unpublished choice is skipped; cleared → fallback.
  - Studio pages render the new controls.
- Two first-run failures were test-scope artifacts and were re-verified with scoped assertions: "View source" came from the GitHub cards under *Similar projects*, and the old hero phrases are seed descriptions in the *Featured* grid.

## Phase 11 — Light-mode polish, relevant "Similar projects", publisher, image proxy ✅ DONE

**Light theme.** Found by screenshotting every key page in light mode (Playwright, desktop + mobile).
- **Contrast:** `--accent` was `#22d3ee` in both themes, so micro-labels sat at 1.67:1. In light it's now `#0e7490`: 4.95:1 on the page and 5.36:1 on cards (passes WCAG AA).
- **New per-theme tokens:**
  - `--panel` is solid `#fff` in light, so cards separate from the page.
  - `--panel-2` (icon tiles, gallery fill) and `--code-bg` replace the hard-coded `bg-black/20` / `bg-black/30`.
  - `--shadow-card`: Tailwind `shadow-card` now uses `var()`. Light gets a soft layered shadow instead of the 90%-black smudge.
  - `--noise-opacity` drops to 0.02 in light; `--border` is slightly stronger in light.
- **Detail header:** the feature graphic now renders as a strip *above* the title instead of behind it. Store graphics carry their own lettering ("Ad-free, Open-source…"), which collided with the title.
- **Accent line:** the decorative diagonal no longer pokes into the navbar.
- **Dark mode:** re-shot, no regressions.

**Broken Play images (found in the screenshots).** Hot-linking `play-lh.googleusercontent.com` returned **HTTP 429** under load, showing broken boxes.
- New edge route `GET /api/img?u=`: allow-list of Google image hosts, https only, image content types only.
  - Success responses carry `Cache-Control: public, max-age/s-maxage=31536000, immutable`, so Vercel's CDN serves each image once.
  - Failures return 502 `no-store`, so they aren't cached.
- `mediaSrc()` routes Play artwork through it everywhere: detail, cards, hero and Studio previews.
- `SafeImg` / `ScreenshotGallery` hide images that still fail. A card falls back to its initial letter; the gallery hides itself if all its images fail.

**Publisher.** Additive `Project.publisher`, editable in Studio ("Published by") and shown as "by X" under the detail title, plus JSON-LD `author`.
- Fetchers fill it automatically: Play developer `[68,0]`, GitHub `owner.login`, GitLab namespace, npm author/maintainer, PyPI author/maintainer, `og:site_name`.
- The Play genre `[79,0,0,0]` is added to topics. The publisher is also passed to the AI prompt and overlaid from the fetch (never AI-invented).

**Similar projects.** `pickSimilarProjects()` is a pure function, unit-tested.
- Scores: publisher (or GitHub/GitLab owner from `sourceUrl`) +5, each shared meaningful title word +3 (stopwords like app/pro/lite/android excluded), each shared tag +2, each shared tech +1. Same category is a +1 tie-breaker only.
- A project counts as related only when relevance (without category) ≥ 2, so one shared language alone isn't enough.
- No fallback padding: the section disappears when nothing is related.

**Verification**
- `tsc` clean; `next build` passes on a throwaway embedded PostgreSQL.
- Similarity unit tests: **11/11**.
- HTTP checks: **15/15**.
  - Unrelated project → no section; same publisher → only that project; GitHub-owner siblings.
  - "by X" and JSON-LD author render.
  - Images are proxied; the banner sits above the text.
  - Publisher validation and clearing.
  - Proxy: 200 + 1-year cache; other host, http and garbage → 400; upstream failure → 502 no-store.
- Live fetcher publisher check: Play "Fossify", npm "Colin McDonnell", GitHub returns the repo's *current* owner after a transfer.

## Build Order (summary)

| # | Phase | Depends on |
|---|-------|-----------|
| 0 | Scaffold & config ✅ | — |
| 1 | Data layer ✅ | 0 |
| 2 | Server libs (fetchers, NIM, auth, middleware) ✅ | 1 |
| 3 | Public site ✅ | 1 |
| 4 | Public API routes ✅ | 1, 2 |
| 5 | Admin auth & shell ✅ | 2 |
| 6 | Admin features (6A–6E) ✅ | 4, 5 |
| 7 | Polish, SEO, a11y ✅ | 3, 6 |
| 8 | Verification & README ✅ | all |

**Notes / decisions to confirm before coding:**
1. Prisma + SQLite is the primary plan; if `prisma db push` fails in this environment, I fall back to the JSON-file data layer in `lib/db.ts` with an identical interface (permitted by spec §2).
2. A real `NVIDIA_NIM_API_KEY` IS present in `.env` (discovered during Phase 6C) — automated checks still use a mock NIM for deterministic error paths (429/401), and live calls are verified against the real API (model: `meta/llama-3.2-11b-vision-instruct`; the spec's `meta/llama-3.3-70b-instruct` is retired/410).
3. Accent color committed to **electric cyan `#22d3ee`**; fonts **Clash Display + Space Grotesk**.
