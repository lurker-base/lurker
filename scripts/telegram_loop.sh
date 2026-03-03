#!/bin/bash
# Telegram Notifier Loop - Run every 2 minutes
cd /data/.openclaw/workspace/lurker-project
source .env.telegram
while true; do
    python3 scripts/telegram_notifier.py >> logs/telegram.log 2>&1
    sleep 120
done
