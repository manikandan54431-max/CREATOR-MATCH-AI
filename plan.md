# CreatorHub AI — Implementation Plan

## Scope

Maintain the supplied CreatorHub AI creator-and-brand marketplace. Keep the existing English UI and product flow except for the database-provider changes and the user's newly requested site-wide AI features. The application has three server-verified account roles: Creator, Brand, and Admin.

The active page routes are `/`, `/discover`, `/creator/:id`, `/auth`, `/workspace`, `/studio`, `/admin`, `/brief-assistant`, and `/setup`. Keep `public/manus-routes.json` synchronized with these routes; the app's catch-all is not a page declaration.

## Product flow

1. Visitors browse the landing page, active creator profiles, and portfolio items.
2. Creators and Brands create accounts and sign in; the server hashes passwords and persists 30-day sessions.
3. Brands create briefs and invitations. Creators review invitations and respond. Admins manage the creator/brand directory and review campaign work.
4. The existing Studio remains available for creator editing workflows. The Brief Assistant generates a structured first-draft brief but does not save it.
5. A contextual AI Copilot is visible across every page. Signed-in users can ask for page-appropriate drafts or guidance; guests see a sign-in gate. Outputs remain manual suggestions and are never applied, saved, sent, or published automatically.

## Technical architecture

### Frontend and application server

- **Frontend:** Preserve the supplied Vite + React + TypeScript app, Lucide icons, existing CSS, page content, and layout. `src/App.tsx` owns the route shell and auth/profile state; reusable Copilot UI belongs in `src/components/AICopilot.tsx` and its CSS; typed same-origin calls belong in `src/lib/api.ts`.
- **Backend:** Keep the uploaded Express/TypeScript server in `server/index.ts`. Serve the production Vite bundle and API from the same listener, honoring `PORT` and defaulting to 3000. The container uses the supplied `Dockerfile` and the unauthenticated `/health` route.
- **Route manifest:** Declare exactly the nine current page routes above in `public/manus-routes.json`; exclude `/api/*`, assets, the health check, and the catch-all.

### Persistent managed database

- Use the project-approved, project-scoped Manus-managed MySQL database. The managed provider supplies the server-only `DATABASE_URL`; do not put it in browser bundles. Preview/development and published runtime share this database, so schema changes and ordinary user writes are production-relevant.
- Use the existing `mysql2/promise` pool in `server/db.ts`, parameterized queries, bcrypt password hashing, role/ownership checks, and 30-day session records. Keep HTTPS cookies `SameSite=None; Secure`; use a separate localhost-only HTTP cookie mode.
- `server/schema.mysql.sql` defines profiles, sessions, portfolio items, creative briefs, invitations, and an `ai_request_limits` row keyed by user ID. `server/migrate.ts` applies repeatable, additive schema statements and records schema versions. Application startup does not run migrations.
- The AI limiter uses a transactional MySQL counter: at most 20 AI requests per user in each 10-minute window, consistently enforced across restarts and replicas. The only AI-related database write is this rate-limit counter; it does not save prompts, conversations, or generated content.
- AI session authentication queries only the session's user ID, role, and active status. It must not retrieve or send account/profile fields as incidental context.

### Site-wide AI

- Use the project-provided platform LLM through server-side `server/llm.ts`, reading the available `BUILT_IN_FORGE_API_URL` / `BUILT_IN_FORGE_API_KEY` pair or the `MANUS_API_URL` / `MANUS_API_KEY` compatibility pair. This uploaded Express project has no injected scaffold LLM helper; keep the adapter server-only. Never embed a server credential in browser code.
- Chat endpoint: authenticated `POST /api/ai/chat`; accept a normalized allowlisted page key, a user message up to 2,000 characters, and at most 8 prior user/assistant messages of up to 1,200 characters each. Use the live model catalog to choose a currently listed supported GPT-5 model. Limit completion output to 1,200 completion tokens and 5,000 characters. Prompts contain only the current page category, server-verified role, and user-entered conversation text—not database rows, account emails, passwords, or credentials.
- Brief endpoint: authenticated `POST /api/ai/brief`; preserve the 12–2,000 character idea limit. Select a known structured-output model only if it is present in the live catalog; otherwise return an availability error rather than selecting an arbitrary model. Require strict JSON Schema output and validate the parsed result at runtime: title ≤80 characters, description ≤420, audience ≤280, 3–4 deliverables each ≤140, format ≤120, style ≤300, and 3–4 checklist items each ≤120. If the initial structured response is empty or invalid, permit one bounded JSON-only fallback and validate it with the same schema; otherwise retain the user's idea and show a recoverable error.
- Enforce the shared per-user rate limit on both endpoints and derive role from the server session. No AI route reads creator profiles, portfolios, briefs, invitations, or other business records; no tool call or action execution is available to the model.
- The Copilot shows route- and role-specific prompt chips for campaign ideas, discovery/outreach, creator-profile/portfolio writing, sign-in/role help, briefs/invitations, Studio scripts/storyboards/captions, admin workflow support, and setup/privacy guidance. Guest users can open it but must sign in before sending. Results are plain text and have manual copy only. Clearly warn users not to enter passwords or confidential information.
- Preserve responsive behavior and accessible keyboard interaction: a labelled non-modal dialog, Escape to close, focus to the launcher on close, focus to input/sign-in on open, visible keyboard focus, and status/live announcements limited to new AI replies and short state messages. Normalize trailing slashes when deriving the page key.

## Project structure

- `public/manus-routes.json`: complete page route declaration.
- `server/index.ts`: Express health/readiness, session/auth, role-checked data API, and authenticated AI endpoints.
- `server/db.ts`: TLS-verified MySQL pool, parameterized queries, minimal AI-session lookup, transactional shared rate-limit counter, password/session helpers.
- `server/schema.mysql.sql`: idempotent application schema, including AI rate-limit state.
- `server/migrate.ts`: explicit, repeatable schema migration runner.
- `server/llm.ts`: server-only platform LLM credential selection, live model catalog, bounded completion calls and response extraction.
- `src/App.tsx`: existing page routes, auth shell, authoritative database readiness, Brief Assistant integration, and global Copilot mount.
- `src/components/AICopilot.tsx` / `AICopilot.css`: responsive contextual assistant, accessible open/close/focus behavior, route suggestions, and manual copy.
- `src/lib/api.ts`: typed session-status, data, brief-generation, and same-origin AI chat clients.
- `package.json`, `package-lock.json`, `.npmrc`, and `Dockerfile`: dependency, install, build, and runtime configuration.

## Design system

### Design movement

**Creator Editorial Workbench** — a portfolio-first marketplace with the expressive energy of an independent creative studio and the clarity of a production tool. The AI Copilot follows the same tone; it adds a focused tool surface without redesigning existing pages.

### Core principles

1. **Portfolio-first:** creative work is the visual anchor; data and AI never outrank the work itself.
2. **Expressive but legible:** color and gradient carry personality, while typography and hierarchy stay practical.
3. **Workflow clarity:** every screen has visible state and a predictable next step.
4. **Human control:** AI proposes; the user reviews and chooses. No generated action is silently applied.

### Color philosophy

Keep the existing near-black plum and charcoal surfaces for a focused studio feel, with soft-white text for legibility. Signature lime communicates action and creative momentum; lavender signals imagination and AI. Keep gradients as small connective accents rather than decoration that competes with portfolio work.

### Layout paradigm

Preserve the site's split editorial landing page and responsive marketplace/workbench sections. Use the existing page layouts, cards, and content order; the floating Copilot panel overlays the lower corner without reflowing page content and fits the viewport on mobile.

### Signature elements

- A compact aperture mark beside the lowercase `creatorhub` wordmark.
- Lime-to-lavender gradient headlines and restrained color fields.
- Clear role, draft, and workflow-status pills alongside framed portfolio cards.

### Interaction philosophy and animation

Keep actions close to the relevant work, show loading/error/success state, and leave consequential edits under human control. Use short 160–240 ms ease-out transitions, respect `prefers-reduced-motion`, and never animate generated content in a way that delays reading or selection.

### Typography system

Preserve the supplied DM Sans interface typography and Fraunces editorial display pairing. Keep body text comfortably readable, page titles distinct, and labels concise; do not introduce new font packages for the Copilot.

### Brand essence and voice

Positioning: **CreatorHub helps brands and independent creators shape clear, AI-assisted creative work together.**

Personality: **creative, clear, collaborative.**

Voice examples:
- Headline: “Make the next idea easier to create.”
- CTA: “Shape the brief together.”

### Wordmark & logo

Retain the supplied aperture icon with the lowercase `creatorhub` wordmark, accented “hub,” and small “AI MARKETPLACE” descriptor. Do not replace or redraw the user-provided brand assets as part of these feature updates.

### Signature brand color

**CreatorHub Lime — `#d7f36a`**, used for primary action and focus cues; lavender (`#a98cff`) remains the secondary AI/creative accent.

## Demo creator detail route amendment

Resolve `/creator/:id` from the pathname's actual capture group and wait for a real profile lookup to finish before showing a not-found state. When a route ID matches a supplied sample creator, render the corresponding local sample profile and portfolio and visibly label it as a sample. Sample profiles must not create database invitations; only an active database creator may be invited. Unknown non-sample IDs show the existing not-found state after lookup. Keep sample content local and read-only; do not insert it into the shared managed database.

## Admin project assignment amendment

Add a panel to the existing `/admin` console for an authenticated, active Admin to select an open creative brief and an active Creator. Use a dedicated server-only `POST /api/admin/assignments` endpoint; require the `X-Requested-With: CreatorHub` same-origin header, derive the Admin identity from the verified session, derive `brand_id` from the selected brief, and validate that the target Creator is active. Create the existing unique `(brief_id, creator_id)` project invitation with `status='pending'`; reject duplicate assignments and do not let this endpoint start a project directly. The selected Creator can accept or decline from the existing workspace; only the brief's Brand can move an accepted invitation to `in_progress` and then `completed`. No schema migration is needed because the invitation table already has the required unique index and transitions. The user explicitly chose not to promote any account now; leave all profile roles unchanged and keep the assignment console gated until the user later authorizes an exact account.
