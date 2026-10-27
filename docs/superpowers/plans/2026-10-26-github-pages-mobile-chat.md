# GitHub Pages Mobile Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a phone-first static chat site on GitHub Pages with local conversation history and a Cloudflare Worker proxy for authenticated `gpt-6.1-sol` streaming chat.

**Architecture:** `site/` is a dependency-free static app served by GitHub Pages. It stores versioned conversation state in `localStorage`, sends the selected conversation context to a Worker, and renders SSE deltas. `worker/` is a TypeScript-free-at-runtime Cloudflare Worker source that validates credentials and requests, signs an HttpOnly session cookie, and forwards the upstream provider stream while keeping `XJ_API_KEY` server-side.

**Tech Stack:** HTML, CSS, browser JavaScript, Cloudflare Workers Fetch API, Wrangler, Vitest tests for pure Worker helpers.

**Spec:** `docs/superpowers/specs/2026-10-26-github-pages-mobile-chat-design.md`

## Global Constraints

- Chat model is `gpt-6.1-sol`; reasoning effort values are `low`, `medium`, and `high`.
- API credentials and login secrets are never committed or placed in browser code.
- Browser state is local to the current device/browser and must support export/import.
- GitHub Pages publishes only `site/`; the existing Next.js app remains intact.
- Worker requests use the exact configured `WEB_ORIGIN` for credentialed CORS.
- Mobile layout must remain usable at 360px width.

---

### Task 1: Add Worker pure helpers and tests

**Files:**
- Create: `worker/src/core.ts`
- Create: `worker/tests/core.test.ts`
- Create: `worker/package.json`

**Interfaces:**
- Produces `parseLoginBody`, `parseChatBody`, `createSessionToken`, `verifySessionToken`, `buildUpstreamChatRequest`, and `normalizeUpstreamError` for the Worker entrypoint.

- [ ] **Step 1: Write failing tests** for valid/invalid login and chat payloads, signed token expiry/tampering, upstream request construction, and safe status mapping.
- [ ] **Step 2: Run `npm test -- --run worker/tests/core.test.ts`** and confirm the helpers are missing.
- [ ] **Step 3: Implement the minimal pure helpers** with no secret values or network calls.
- [ ] **Step 4: Run the Worker tests** and confirm they pass.

### Task 2: Implement the Cloudflare Worker API

**Files:**
- Create: `worker/src/index.ts`
- Create: `worker/wrangler.toml`
- Create: `worker/README.md`

**Interfaces:**
- Consumes the pure helpers from Task 1.
- Provides `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout`, and `POST /api/chat`.

- [ ] **Step 1: Add route tests** for CORS rejection, login success/failure, invalid sessions, chat validation, upstream request construction, and safe provider failures.
- [ ] **Step 2: Run the route tests** and confirm they fail before the Worker route exists.
- [ ] **Step 3: Implement CORS, signed cookie auth, bounded chat validation, and SSE proxying.**
- [ ] **Step 4: Document Wrangler variables/secrets and deployment commands without real values.**
- [ ] **Step 5: Run all Worker tests and a TypeScript check.**

### Task 3: Build the mobile static chat app

**Files:**
- Create: `site/index.html`
- Create: `site/styles.css`
- Create: `site/config.js`
- Create: `site/app.js`

**Interfaces:**
- Consumes the Worker URL from `site/config.js`.
- Sends `{ messages, reasoningEffort }` to `/api/chat` with credentialed fetch.

- [ ] **Step 1: Add browser-level source tests** for state migration/validation and request payload shape.
- [ ] **Step 2: Implement login, responsive drawer, conversation CRUD, local export/import, effort selector, and streamed assistant rendering.**
- [ ] **Step 3: Add accessible error states for login, session expiry, provider failure, and storage failure.**
- [ ] **Step 4: Validate the static files with a local HTTP server and a 360px browser smoke check.**

### Task 4: Add GitHub Pages publishing and repository documentation

**Files:**
- Create: `.github/workflows/deploy-pages.yml`
- Modify: `README.md`
- Create: `site/README.md`

- [ ] **Step 1: Configure Pages artifact upload for `site/` on pushes to `main`.**
- [ ] **Step 2: Document GitHub Pages and Cloudflare setup, secret injection, and phone usage.**
- [ ] **Step 3: Check the diff for secret leakage and unrelated file changes.**

### Task 5: Run the complete verification suite

- [ ] **Step 1: Run Worker tests, existing Vitest tests, `npx tsc --noEmit`, and `npm run build`.**
- [ ] **Step 2: Run static-site syntax and HTTP smoke checks.**
- [ ] **Step 3: Perform a final security/code audit and report any deployment step that still requires the user's Cloudflare account.**
