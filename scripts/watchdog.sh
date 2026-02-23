#!/bin/bash
# LURKER Watchdog - Surveillance continue en background
# Usage: nohup ./scripts/watchdog.sh > /data/.openclaw/logs/watchdog.log 2>&1 &

echo "[$(date)] LURKER Watchdog started (PID: $$)"

while true; do
    # Check every 5 minutes
    sleep 300
    
    cd /data/.openclaw/workspace/lurker-project
    
    # Check feed health
    python3 scripts/feed_sentinel.py > /tmp/feed_check.log 2>&1
    
    if [ $? -ne 0 ]; then
        echo "[$(date)] 🚨 FEED STALE - Auto-fixing..."
        
        # Send alert
        python3 -c "
import os
import urllib.request
import urllib.parse
bot_token = '8455628045:AAGb6Q2PdkPHpobhTAcmMK3SFqJm1QlM6bY'
chat_id = '@LurkerAlphaSignals'
msg = '🚨 WATCHDOG ALERT: Feed stale >15min. Auto-fixing now...'
url = f'https://api.telegram.org/bot{bot_token}/sendMessage'
data = urllib.parse.urlencode({'chat_id': chat_id, 'text': msg}).encode()
urllib.request.urlopen(urllib.request.Request(url, data=data, method='POST'), timeout=30)
" 2>/dev/null
        
        # Run emergency fix
        ./scripts/emergency_update.sh > /tmp/autofix.log 2>&1
        
        echo "[$(date)] ✅ Auto-fix completed"
    else
        echo "[$(date)] ✓ Feed healthy"
    fi
done
