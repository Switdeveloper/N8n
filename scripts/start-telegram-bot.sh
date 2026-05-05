#!/bin/bash
set -e

BOT_HOME="/home/runner/workspace/scripts/telegram-bot-config"
mkdir -p "$BOT_HOME"

# Write .env config for the bot (follows reference repo env var names)
cat > "$BOT_HOME/.env" << EOF
TELEGRAM_BOT_TOKEN=$TELEGRAM_BOT_TOKEN
TELEGRAM_ALLOWED_USER_ID=5039241656
OPENCODE_API_URL=http://localhost:4096
OPENCODE_MODEL_PROVIDER=nvidia
OPENCODE_MODEL_ID=minimax/minimax-m2.7
OPENCODE_FALLBACK_MODEL_PROVIDER=nvidia
OPENCODE_FALLBACK_MODEL_ID=moonshotai/kimi-k2.6
OPENCODE_AUTO_RESTART_ENABLED=true
OPENCODE_MONITOR_INTERVAL_SEC=60
BOT_LOCALE=en
RESPONSE_STREAMING=true
MESSAGE_FORMAT_MODE=markdown
SERVICE_MESSAGES_INTERVAL_SEC=3
EOF

echo "Config written."

# Start the OpenCode server if not already running
if ! curl -sf http://localhost:4096/health > /dev/null 2>&1; then
  echo "Starting OpenCode server on port 4096..."
  opencode serve --port 4096 &
  OPENCODE_PID=$!
  echo "OpenCode server PID: $OPENCODE_PID"

  # Wait up to 30 seconds for opencode to become ready
  for i in $(seq 1 30); do
    if curl -sf http://localhost:4096/health > /dev/null 2>&1; then
      echo "OpenCode server is ready (${i}s)."
      break
    fi
    sleep 1
    if [ $i -eq 30 ]; then
      echo "Warning: OpenCode server did not respond after 30s — continuing anyway."
    fi
  done
else
  echo "OpenCode server already running on port 4096."
fi

echo "Starting OpenCode Telegram Bot..."
exec env OPENCODE_TELEGRAM_HOME="$BOT_HOME" opencode-telegram start
