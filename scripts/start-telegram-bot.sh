#!/bin/bash
set -e

BOT_HOME="/home/runner/workspace/scripts/telegram-bot-config"
mkdir -p "$BOT_HOME"

cat > "$BOT_HOME/.env" << EOF
TELEGRAM_BOT_TOKEN=$TELEGRAM_BOT_TOKEN
TELEGRAM_ALLOWED_USER_ID=5039241656
OPENCODE_API_URL=http://localhost:4096
OPENCODE_MODEL_PROVIDER=nvidia
OPENCODE_MODEL_ID=moonshotai/kimi-k2-instruct
OPENCODE_AUTO_RESTART_ENABLED=true
BOT_LOCALE=en
EOF

echo "Config written. Starting OpenCode Telegram Bot..."
exec env OPENCODE_TELEGRAM_HOME="$BOT_HOME" opencode-telegram start
