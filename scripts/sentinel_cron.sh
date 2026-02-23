#!/bin/bash
# LURKER Feed Sentinel — Cron job pour vérifier le feed toutes les 10 minutes
# Add to crontab: */10 * * * * /data/.openclaw/workspace/lurker-project/scripts/sentinel_cron.sh

cd /data/.openclaw/workspace/lurker-project

# Check feed health
python3 scripts/feed_sentinel.py --alert

# If feed is stale (exit code 1), try to fix automatically
if [ $? -ne 0 ]; then
    echo "[$(date)] Feed stale — attempting auto-fix..." >> /data/.openclaw/logs/sentinel.log
    
    # Run scanner manually
    python3 scripts/scanner_cio_ultra.py >> /data/.openclaw/logs/sentinel.log 2>&1
    
    # Commit if changes
    git add signals/cio_feed.json state/token_registry.json 2>/dev/null
    git diff --cached --quiet || git commit -m "fix: auto-recovery from stale feed [$(date +%H:%M)]" 2>/dev/null
    git push origin main 2>/dev/null
    
    # Verify fix
    python3 scripts/feed_sentinel.py --alert >> /data/.openclaw/logs/sentinel.log 2>&1
fi
