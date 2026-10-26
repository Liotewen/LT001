# LT AI Workspace Design

## Goal

Build a mobile-first private AI workspace that provides persistent projects, conversations, full conversation context, GPT-6.1-sol chat with selectable reasoning depth, and GPT Image 2.5 image generation behind a password-protected login.

## Scope

The first release covers one private workspace account, project and conversation management, streaming chat, image generation with asynchronous status polling, SQLite persistence, and a deployable Node runtime. It does not add multi-user registration, billing, public sharing, file upload, or a second model provider.

## Architecture

The application is a Next.js App Router monolith. Browser requests go to authenticated route handlers under `/api/*`; route handlers read and write SQLite and proxy provider calls server-side. The provider key is read only from `XJ_API_KEY`, and the browser never receives it.

The local and hosted runtime uses a persistent SQLite file selected by `DATABASE_PATH`. The schema stores projects, conversations, messages, and image generation tasks. Chat requests persist the user message before calling the provider, stream assistant deltas to the browser, and persist the completed assistant message. Image requests create a provider task and the browser polls the local task endpoint until completion.

## Provider Contract

- Chat endpoint: `POST https://xjjuhe.site/v1/codex/chat/completions`.
- Chat model: fixed `gpt-6.1-sol`.
- Chat request includes the complete ordered `messages` history for the conversation, `stream: true`, and `reasoning_effort` set to `low`, `medium`, or `high`.
- Image endpoint: `POST https://xjjuhe.site/v1/images/generations` with fixed model `gpt-image-2.5`, prompt, count, and size.
- Image task status endpoint: `GET https://xjjuhe.site/v1/images/generations/{task_id}`.
- Provider errors are normalized to user-safe messages and never include the provider key.

## Authentication

The login form accepts `APP_USERNAME` and `APP_PASSWORD` configured only on the server. A signed, HttpOnly, SameSite cookie is issued after a constant-time credential check. `APP_SESSION_SECRET` signs the cookie. All data and provider routes require the cookie; logout clears it.

## Data Model

- `projects`: `id`, `name`, `color`, `created_at`, `updated_at`.
- `conversations`: `id`, optional `project_id`, `title`, `model`, `reasoning_effort`, `created_at`, `updated_at`.
- `messages`: `id`, `conversation_id`, `role`, `content`, optional `image_url`, `status`, `created_at`.
- `image_generations`: `id`, optional `conversation_id`, `prompt`, `provider_task_id`, `status`, optional `image_url`, optional `error`, `created_at`, `updated_at`.

## UI

The desktop layout has a compact navigation rail/sidebar, a centered conversation column, and a collapsible context/settings panel. On small screens the sidebar and settings become drawers, the composer remains fixed above the safe-area inset, and touch targets stay at least 44px. The visual language uses warm white surfaces, charcoal text, indigo for active controls, cyan for system state, and amber for warnings.

Core interactions:

1. Login and restore the last open conversation.
2. Create or select a project and conversation.
3. Change reasoning depth before sending a message.
4. Stream a response while keeping the full transcript in SQLite.
5. Switch the composer to image mode, submit a prompt, and watch the task card update.
6. Rename, archive, or delete projects and conversations.

## Error Handling

The server returns structured errors with stable `code` values (`AUTH_REQUIRED`, `INVALID_INPUT`, `PROVIDER_AUTH`, `PROVIDER_RATE_LIMIT`, `PROVIDER_UNAVAILABLE`, `PROVIDER_ERROR`). The client maps these to concise Chinese messages and keeps the unsent composer content when a request fails.

## Verification

Automated tests cover credential verification, signed session round-trips, SQLite conversation ordering, request construction for chat/image calls, and provider error normalization. The final verification includes a production build, a local smoke test through the login and chat endpoints, responsive browser screenshots at desktop and mobile widths, and a repository secret scan before pushing.

## Deployment

The repository includes `.env.example`, `Dockerfile`, and `render.yaml` for a persistent Node host. GitHub stores source and version history. A temporary public tunnel may be used for live acceptance from the local runtime when no external hosting credentials are available; the permanent deployment still requires setting `XJ_API_KEY`, `APP_USERNAME`, `APP_PASSWORD`, `APP_SESSION_SECRET`, and a persistent `DATABASE_PATH` on the chosen host.
