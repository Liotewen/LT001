# LT AI Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a password-protected, mobile-first AI workspace with persistent projects, conversations, streaming `gpt-6.1-sol` chat, and asynchronous `gpt-image-2.5` image generation.

**Architecture:** A Next.js App Router monolith serves the React workspace and authenticated `/api/*` route handlers. SQLite stores projects, conversations, messages, and image tasks; the server proxies provider calls using environment variables so the browser never sees the provider key.

**Tech Stack:** Next.js, React, TypeScript, better-sqlite3, Vitest, lucide-react, react-markdown, CSS Modules/global CSS, Docker.

**Spec:** `docs/superpowers/specs/2026-10-26-ai-workspace-design.md`

## Global Constraints

- Provider base URL is `https://xjjuhe.site/v1` and provider secrets are server-only environment variables.
- Chat uses `gpt-6.1-sol` through `/v1/codex/chat/completions` with `reasoning_effort` values `low`, `medium`, or `high`.
- Images use `gpt-image-2.5` through `/v1/images/generations` and a provider task polling endpoint.
- The workspace is a single private account; no public registration or multi-user administration is in scope.
- UI must be usable at mobile widths with 44px minimum touch targets and no horizontal overflow.
- Do not commit `.env.local`, SQLite files, provider keys, GitHub tokens, or generated build output.

---

### Task 1: Scaffold the application and test harness

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `next-env.d.ts`, `vitest.config.ts`, `.gitignore`, `.env.example`
- Create: `app/layout.tsx`, `app/page.tsx`, `app/globals.css`
- Test: `tests/smoke.test.ts`

**Interfaces:**
- Produces npm scripts `dev`, `build`, `start`, `test`, and `test:watch`.
- Produces a Vitest environment that resolves the `@/*` TypeScript alias.

- [ ] **Step 1: Write the failing smoke test**

```ts
import { describe, expect, it } from 'vitest';

describe('workspace scaffold', () => {
  it('exposes the fixed provider defaults', async () => {
    const { CHAT_MODEL, IMAGE_MODEL } = await import('@/lib/constants');
    expect(CHAT_MODEL).toBe('gpt-6.1-sol');
    expect(IMAGE_MODEL).toBe('gpt-image-2.5');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- --run tests/smoke.test.ts`

Expected: FAIL because `@/lib/constants` does not exist.

- [ ] **Step 3: Add the minimal scaffold and constants module**

Create `lib/constants.ts` with the two exported constants and create the package scripts/configuration needed by Next.js and Vitest.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- --run tests/smoke.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.json next.config.mjs next-env.d.ts vitest.config.ts .gitignore .env.example app lib tests/smoke.test.ts
git commit -m "chore: scaffold AI workspace"
```

### Task 2: Implement SQLite persistence and pure domain helpers

**Files:**
- Create: `lib/db.ts`, `lib/schema.ts`, `lib/repositories.ts`, `lib/validation.ts`
- Test: `tests/repositories.test.ts`, `tests/validation.test.ts`

**Interfaces:**
- `getDatabase(): Database` returns the initialized SQLite connection.
- `createProject(input)`, `listProjects()`, `createConversation(input)`, `listConversations(projectId?)`, `getConversation(id)`, `listMessages(conversationId)`, `insertMessage(input)`, and `createImageTask(input)` expose repository operations.
- `normalizeTitle(text)` returns a trimmed, max-40-character conversation title.

- [ ] **Step 1: Write failing repository and validation tests**

Cover project creation, conversation ordering by `updated_at`, message ordering by `created_at`, and title truncation. Use a temporary database path per test process.

- [ ] **Step 2: Run targeted tests and verify the expected missing-module failures**

Run: `npm test -- --run tests/repositories.test.ts tests/validation.test.ts`

Expected: FAIL because the database and repository functions are not implemented.

- [ ] **Step 3: Implement schema initialization and repositories**

Create the four tables from the spec, enable foreign keys, add indexes for conversation and message ordering, and parameterize every SQL query.

- [ ] **Step 4: Run targeted tests and verify they pass**

Run: `npm test -- --run tests/repositories.test.ts tests/validation.test.ts`

Expected: PASS with no unhandled warnings.

- [ ] **Step 5: Commit**

```bash
git add lib/db.ts lib/schema.ts lib/repositories.ts lib/validation.ts tests/repositories.test.ts tests/validation.test.ts
git commit -m "feat: add SQLite workspace persistence"
```

### Task 3: Add signed session authentication and protected route helpers

**Files:**
- Create: `lib/auth.ts`, `app/api/auth/login/route.ts`, `app/api/auth/logout/route.ts`, `app/api/auth/me/route.ts`
- Test: `tests/auth.test.ts`

**Interfaces:**
- `verifyCredentials(username, password, env)` returns a boolean using constant-time comparison.
- `createSessionToken(username, secret, now?)` and `verifySessionToken(token, secret, now?)` sign and validate an expiring token.
- `requireSession()` throws a structured 401 response for protected handlers.

- [ ] **Step 1: Write failing auth tests**

Cover valid and invalid credentials, tampered signatures, expired tokens, and a successful login response setting an HttpOnly cookie.

- [ ] **Step 2: Run the auth tests and verify the expected failures**

Run: `npm test -- --run tests/auth.test.ts`

Expected: FAIL because the auth module and routes do not exist.

- [ ] **Step 3: Implement HMAC-signed cookie sessions**

Use Node `crypto.createHmac` and `timingSafeEqual`, set `HttpOnly`, `SameSite=Lax`, `Secure` in production, and a seven-day max age. Never log credentials or token contents.

- [ ] **Step 4: Run auth tests and verify they pass**

Run: `npm test -- --run tests/auth.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/auth.ts app/api/auth tests/auth.test.ts
git commit -m "feat: protect workspace with signed sessions"
```

### Task 4: Implement project and conversation API routes

**Files:**
- Create: `app/api/projects/route.ts`, `app/api/projects/[id]/route.ts`
- Create: `app/api/conversations/route.ts`, `app/api/conversations/[id]/route.ts`
- Test: `tests/api-routes.test.ts`

**Interfaces:**
- `GET/POST /api/projects`, `PATCH/DELETE /api/projects/:id`.
- `GET/POST /api/conversations`, `GET/PATCH/DELETE /api/conversations/:id`.
- `GET /api/conversations/:id` returns conversation metadata and ordered messages.

- [ ] **Step 1: Write failing route tests**

Cover unauthenticated 401 responses, project creation, conversation creation with the fixed chat model, and message retrieval in chronological order.

- [ ] **Step 2: Run route tests and verify failure**

Run: `npm test -- --run tests/api-routes.test.ts`

Expected: FAIL because route handlers are absent.

- [ ] **Step 3: Implement validated handlers**

Validate IDs and names, return JSON errors with `code`, update timestamps on mutations, and cascade conversation deletion through the foreign key schema.

- [ ] **Step 4: Run route tests and verify pass**

Run: `npm test -- --run tests/api-routes.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/api/projects app/api/conversations tests/api-routes.test.ts
git commit -m "feat: add project and conversation APIs"
```

### Task 5: Add provider clients, streaming chat, and image task polling

**Files:**
- Create: `lib/provider.ts`, `lib/provider-errors.ts`, `app/api/chat/route.ts`, `app/api/images/route.ts`, `app/api/images/[id]/route.ts`
- Test: `tests/provider.test.ts`, `tests/provider-errors.test.ts`

**Interfaces:**
- `buildChatRequest(messages, effort)` returns the exact provider JSON payload.
- `buildImageRequest(prompt, size, count)` returns the exact image submission payload.
- `normalizeProviderError(status, body)` returns `{ code, message }` without secrets.

- [ ] **Step 1: Write failing provider tests**

Assert the fixed models, complete message history, `stream: true`, effort mapping, image size/count, and status-specific error codes.

- [ ] **Step 2: Run the tests and verify failure**

Run: `npm test -- --run tests/provider.test.ts tests/provider-errors.test.ts`

Expected: FAIL because the provider client is absent.

- [ ] **Step 3: Implement provider clients and route handlers**

Chat handler persists the user message, forwards ordered history to `/v1/codex/chat/completions`, translates upstream SSE chunks to browser SSE, and persists the assistant content when the stream closes. Image handler creates a task record, calls `/v1/images/generations`, then stores provider task metadata. Polling handler refreshes the provider status and persists the terminal result.

- [ ] **Step 4: Run tests and add a mocked integration smoke check**

Run: `npm test -- --run tests/provider.test.ts tests/provider-errors.test.ts`; then run a local request with a test fetch stub to confirm no key appears in response bodies.

Expected: PASS and no provider key in captured output.

- [ ] **Step 5: Commit**

```bash
git add lib/provider.ts lib/provider-errors.ts app/api/chat app/api/images tests/provider.test.ts tests/provider-errors.test.ts
git commit -m "feat: proxy streaming chat and image tasks"
```

### Task 6: Build the responsive workspace UI

**Files:**
- Create: `app/(workspace)/page.tsx`, `app/(workspace)/Workspace.tsx`
- Create: `components/LoginScreen.tsx`, `components/Sidebar.tsx`, `components/ConversationView.tsx`, `components/Composer.tsx`, `components/SettingsDrawer.tsx`, `components/MessageBubble.tsx`, `components/ImageTaskCard.tsx`
- Modify: `app/page.tsx`, `app/layout.tsx`, `app/globals.css`

**Interfaces:**
- Workspace state loads `/api/projects`, `/api/conversations`, and `/api/auth/me`.
- Chat composer posts `{ conversationId, content, reasoningEffort }` to `/api/chat` and consumes SSE deltas.
- Image composer posts `{ conversationId, prompt, size, count }` to `/api/images` and polls `/api/images/:id` until terminal.

- [ ] **Step 1: Add component tests for login gating, mobile drawer state, and composer mode**

Use Testing Library only for user-visible behavior: password form submits, sidebar opens on a narrow viewport, and image mode sends the image payload.

- [ ] **Step 2: Run component tests and verify failure**

Run: `npm test -- --run tests/components.test.tsx`

Expected: FAIL because the components are absent.

- [ ] **Step 3: Implement the UI and responsive CSS**

Use lucide icons with tooltips, keep the composer above the mobile safe area, preserve unsent text on failures, render Markdown safely, and show actionable Chinese error messages. Keep provider details out of user-facing UI except the fixed model label and depth control.

- [ ] **Step 4: Run component tests and production build**

Run: `npm test -- --run tests/components.test.tsx`; `npm run build`

Expected: PASS and a successful Next.js production build.

- [ ] **Step 5: Commit**

```bash
git add app components tests/components.test.tsx
git commit -m "feat: add responsive AI workspace UI"
```

### Task 7: Add deployment configuration, local secrets, and verification

**Files:**
- Create: `Dockerfile`, `render.yaml`, `README.md`, `scripts/smoke-test.mjs`
- Create locally only: `.env.local`, `data/app.db`
- Modify: `.gitignore`, `.env.example`

**Interfaces:**
- `npm run dev` starts the local workspace.
- `npm run build && npm start` starts the production server.
- `scripts/smoke-test.mjs` logs in, creates a conversation, and checks the protected API without printing credentials.

- [ ] **Step 1: Add deployment and usage documentation**

Document required environment variables, generated local login credentials, persistent storage requirements, and the provider endpoints without including any real secret.

- [ ] **Step 2: Create local environment values from the supplied attachment**

Read the provider base URL and key locally, generate a random session secret and app password, and write them to ignored `.env.local` only. Never stage the file.

- [ ] **Step 3: Run the full verification set**

Run: `npm test -- --run`; `npm run build`; `npm start` in a separate process; `node scripts/smoke-test.mjs`; inspect `git diff --check`; scan tracked files for `sk-`, `github_pat_`, and `.env.local`.

Expected: all tests pass, build exits 0, smoke test authenticates and reaches protected routes, and the secret scan finds no credentials.

- [ ] **Step 4: Push source to GitHub**

Configure the remote using the supplied GitHub token without putting it in `.git/config`, push `main` to `https://github.com/Liotewen/LT001`, and verify the remote tree contains no secret files.

- [ ] **Step 5: Start an acceptance server and report access details**

Run the production server with the local ignored environment. If no permanent hosting credential is available, expose the local server through a temporary tunnel for acceptance and clearly label its lifetime; report the generated app username/password separately from the repository URL.
