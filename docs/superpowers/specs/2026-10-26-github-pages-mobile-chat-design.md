# GitHub Pages Mobile Chat Design

## Goal

Provide a zero-server-cost, phone-first chat site for the owner's personal use. GitHub Pages serves the static UI, while a Cloudflare Worker keeps the model API key private, authenticates the owner, and proxies streaming chat responses. Conversations are stored only in the phone browser.

## Scope

The static site includes:

- Username/password login through the Worker.
- Multiple local conversations with titles, timestamps, message history, and delete/new actions.
- Full conversation context sent with each request.
- `gpt-6.1-sol` chat requests with low/medium/high reasoning depth.
- Mobile-first responsive layout with a collapsible conversation drawer.
- Local export/import of conversation data for manual phone backup.

The static site does not include projects, image generation, server-side SQLite, cross-device synchronization, or shared accounts. The existing full Next.js application remains available for a hosted Node deployment.

## Architecture

```text
Phone browser
  ├─ GitHub Pages: static HTML/CSS/JavaScript
  └─ Cloudflare Worker: login, signed bearer session, chat proxy
                                      └─ xjjuhe.site/v1/codex/chat/completions
```

The browser stores conversations under a versioned local-storage key. Each chat request sends only the selected conversation's stored messages and the selected reasoning effort to the Worker. The Worker adds the configured model name and upstream authorization header, then forwards the upstream SSE body to the browser.

## Worker API contract

All API endpoints require the exact `WEB_ORIGIN` CORS origin. The static browser uses `Authorization: Bearer <session token>` and `credentials: 'omit'` so mobile third-party-cookie restrictions do not prevent login. The Worker retains HttpOnly cookie compatibility.

### `POST /api/auth/login`

Request: `{ "username": string, "password": string }`.

Success: `200 { "authenticated": true, "username": string, "token": string }` and a signed session cookie.

Failure: `400` for malformed input or `401` for invalid credentials.

### `GET /api/auth/me`

Success: `200 { "authenticated": true, "username": string }`.

Failure: `401 { "error": { "code": "UNAUTHORIZED", "message": string } }`.

### `POST /api/auth/logout`

Clears the session cookie and returns `204`; the browser clears its token from memory and sessionStorage. Already-issued tokens expire after seven days; rotating the server session secret invalidates all existing sessions.

### `POST /api/chat`

Request: `{ "messages": Array<{ "role": "user" | "assistant", "content": string }>, "reasoningEffort": "low" | "medium" | "high" }`.

The Worker validates the message count and content sizes, sends `model: "gpt-6.1-sol"`, `stream: true`, and the requested `reasoning_effort` upstream, and returns normalized SSE `delta`, `done`, and safe `error` events. Provider credentials and raw provider errors never reach the browser. Requests exceeding 100 messages, 20,000 characters per message, or 200,000 characters total are rejected with an explanation; context is never silently truncated.

## Security and configuration

The model key, login username, login password, session secret, and GitHub/Cloudflare credentials are never committed. The public upstream base URL and allowed origin are Wrangler variables. The Worker reads configuration as follows:

- `XJ_API_KEY` secret
- `APP_USERNAME` secret
- `APP_PASSWORD` secret
- `APP_SESSION_SECRET` secret
- `XJ_API_BASE_URL` variable, defaulting to `https://xjjuhe.site/v1`
- `WEB_ORIGIN` variable set to the GitHub Pages origin

The session token is an HMAC-signed, expiring token stored only in the current tab's sessionStorage (or memory when unavailable). Conversation exports exclude the token. The compatibility cookie uses `Secure`, `HttpOnly`, `SameSite=Lax`. The static site does not store the password or model key.

## Static site storage

The local storage record is versioned so future migrations can be explicit:

```ts
type LocalChatState = {
  version: 1;
  selectedId: string | null;
  conversations: Array<{
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    reasoningEffort: 'low' | 'medium' | 'high';
    messages: Array<{
      id: string;
      role: 'user' | 'assistant';
      content: string;
      createdAt: string;
    }>;
  }>;
};
```

The UI handles disabled or full storage by keeping the current session in memory and showing a clear backup warning. Export writes JSON only; import validates the version and message shape before replacing local state.

## Deployment

- `.github/workflows/deploy-pages.yml` publishes the `site/` directory through GitHub Pages.
- `worker/wrangler.toml` and `worker/src/index.ts` define the Worker.
- `worker/README.md` gives exact commands for setting variables/secrets and deploying.
- `site/config.js` contains only the public Worker URL and can be changed without touching application logic.

GitHub Pages deploys without a build step. The Worker is deployed from the user's Cloudflare account using official Wrangler OAuth, with four secrets injected through stdin. The public Worker URL is configured in `site/config.js`.

## Error handling

The UI distinguishes login failure, unauthorized session, upstream authentication failure, rate limiting, timeout/unavailable provider, malformed input, and browser storage errors. Streaming assistant text already received remains visible if the upstream connection ends unexpectedly, with an inline retry message.

## Acceptance criteria

1. `site/index.html` opens without a build server and remains usable at 360px width.
2. Login succeeds only when the Worker credentials match and does not expose any upstream key in page source or network request headers.
3. A new chat, multiple messages, refresh, delete, export, and import work using local storage.
4. Chat requests include the complete selected conversation context and selected reasoning effort.
5. Worker tests cover CORS rejection, login success/failure, expired/invalid sessions, chat validation, upstream request construction, and safe error mapping.
6. Existing Next.js tests and production build remain passing.
