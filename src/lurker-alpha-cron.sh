#!/bin/bash
# LURKER ALPHA Bot — Cron runner
# Exécute le bot toutes les 2 minutes via cron host

set -e

BOT_DIR="/data/.openclaw/workspace/lurker-project"
LOG_FILE="/var/log/lurker-alpha-bot.log"
LOCK_FILE="/tmp/lurker-alpha-bot.lock"

# Anti-overlap (max 90s runtime)
exec 200>"$LOCK_FILE"
if ! flock -n 200; then
  echo "$(date) — Skip: another instance running" >> "$LOG_FILE"
  exit 0
fi

# Check environnement
cd "$BOT_DIR"

# Charger env
if [ -f .env.telegram ]; then
  export $(grep -v '^#' .env.telegram | xargs)
fi

if [ -z "$TELEGRAM_BOT_TOKEN" ]; then
  echo "$(date) — ERROR: TELEGRAM_BOT_TOKEN not set" >> "$LOG_FILE"
  exit 1
fi

export TELEGRAM_CHANNEL="${TELEGRAM_CHANNEL:-@LurkerAlphaSignals}"

# Run
echo "$(date) — Starting ALPHA bot..." >> "$LOG_FILE"
node src/lurker-alpha-bot.js >> "$LOG_FILE" 2>&1 || {
  echo "$(date) — Bot failed with code $?" >> "$LOG_FILE"
  exit 1
}

echo "$(date) — Done" >> "$LOG_FILE"
