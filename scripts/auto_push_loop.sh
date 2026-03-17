#!/bin/bash
# Auto Push Loop - Runs every 15 minutes
cd /data/.openclaw/workspace/lurker-project
while true; do
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] Auto push check..."
    git add -A
    if ! git diff --cached --quiet; then
        git commit -m "auto: hourly update $(date +\%H:\%M)"
    fi 
    git pull origin main --rebase || true
    git push origin main
    sleep 900  # 15 minutes
done
