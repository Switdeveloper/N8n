# OpenCode Chat — NVIDIA AI Web Interface

## Overview
A web-based chat interface for interacting with NVIDIA NIM AI models (Kimi K2, Kimi K2.6, MiniMax M2.7), powered by opencode and connected to Telegram for remote access.

## Architecture

### Artifacts
- **`artifacts/opencode-chat`** — React + Vite web UI (serves at `/`, port 22560)
- **`artifacts/api-server`** — Express API server (serves at `/api`, port 8080)

### Workflows
- `artifacts/opencode-chat: web` — Vite dev server for the chat UI
- `artifacts/api-server: API Server` — Backend API
- `Telegram Bot` — @grinev/opencode-telegram-bot connecting to opencode server
- `artifacts/mockup-sandbox: Component Preview Server` — Canvas design sandbox

## AI Models (NVIDIA NIM)
All via `https://integrate.api.nvidia.com/v1` using `NVIDIA_API_KEY`:
- `moonshotai/kimi-k2-instruct` — Default model (1T params, 128K ctx)
- `moonshotai/kimi-k2-thinking` — Chain-of-thought reasoning
- `moonshotai/kimi-k2.5` — Multimodal VLM (256K ctx)
- `moonshotai/kimi-k2.6` — Latest VLM
- `minimax/minimax-m2.7` — 230B params

## Key Files
- `~/.config/opencode/config.json` — OpenCode config with NVIDIA provider
- `scripts/start-telegram-bot.sh` — Telegram bot startup script
- `scripts/telegram-bot-config/.env` — Bot config (auto-written at startup)
- `artifacts/api-server/src/routes/opencode.ts` — OpenCode + NVIDIA API routes
- `artifacts/opencode-chat/src/pages/chat.tsx` — Main chat UI
- `lib/api-spec/openapi.yaml` — API contract

## API Endpoints
- `GET /api/opencode/status` — OpenCode server health
- `GET /api/opencode/models` — List available AI models
- `GET /api/opencode/sessions` — List opencode sessions
- `POST /api/opencode/sessions` — Create new session
- `GET /api/opencode/sessions/:id/messages` — Get session messages
- `POST /api/opencode/sessions/:id/messages` — Send message to session
- `POST /api/opencode/sessions/:id/abort` — Abort current task
- `POST /api/opencode/chat` — Direct NVIDIA AI chat (no session)

## Secrets
- `NVIDIA_API_KEY` — NVIDIA NIM API key
- `TELEGRAM_BOT_TOKEN` — Telegram bot token
- `SESSION_SECRET` — Session secret

## Telegram Bot
- Allowed user ID: `5039241656`
- Bot auto-starts opencode server on port 4096
- Default model: `moonshotai/kimi-k2-instruct` via NVIDIA
- Configured via `OPENCODE_TELEGRAM_HOME` env var

## Environment Variables
- `NVIDIA_API_KEY` — Set in Replit secrets
- `TELEGRAM_BOT_TOKEN` — Set in Replit secrets
- Opencode config: `~/.config/opencode/config.json`
