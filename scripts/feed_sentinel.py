#!/usr/bin/env python3
"""
LURKER Feed Sentinel — Surveillance locale du feed CIO
Alerte immédiate si le feed est stale (pas de mise à jour depuis >10 min)
Usage: python3 feed_sentinel.py [--alert]
"""
import json
import sys
import subprocess
from datetime import datetime, timezone
from pathlib import Path

def check_feed_health():
    """Vérifie si le feed est à jour"""
    feed_path = Path("/data/.openclaw/workspace/lurker-project/signals/cio_feed.json")
    
    if not feed_path.exists():
        return False, "Feed file not found", None
    
    try:
        with open(feed_path) as f:
            data = json.load(f)
        
        updated_at = data.get('meta', {}).get('updated_at')
        if not updated_at:
            return False, "No updated_at timestamp", None
        
        # Parse timestamp
        try:
            last_update = datetime.fromisoformat(updated_at.replace('Z', '+00:00'))
        except:
            last_update = datetime.strptime(updated_at, "%Y-%m-%dT%H:%M:%S.%f%z")
        
        now = datetime.now(timezone.utc)
        stale_minutes = (now - last_update).total_seconds() / 60
        
        if stale_minutes > 15:  # Alert if > 15 min
            return False, f"Feed stale for {stale_minutes:.0f} minutes", stale_minutes
        
        count = data.get('meta', {}).get('count', 0)
        return True, f"Feed healthy — {count} tokens — last update {stale_minutes:.0f}min ago", stale_minutes
        
    except Exception as e:
        return False, f"Error reading feed: {e}", None

def send_alert(message, stale_time):
    """Envoie alerte Telegram si configuré"""
    import urllib.request
    import urllib.parse
    import os
    
    bot_token = os.getenv("TELEGRAM_BOT_TOKEN", "8455628045:AAGb6Q2PdkPHpobhTAcmMK3SFqJm1QlM6bY")
    chat_id = os.getenv("LURKER_ALERTS_CHAT_ID", "@LurkerAlphaSignals")
    
    if not bot_token or not chat_id:
        print("[ALERT] Missing Telegram credentials")
        return False
    
    alert_text = f"""🚨 LURKER FEED ALERT

{message}

⏰ Feed hasn't updated in {stale_time:.0f} minutes

🔧 Action needed:
1. Check GitHub Actions status
2. Run manual scan: python3 scripts/scanner_cio_ultra.py
3. Push update if needed

👁️ Sentinel — {datetime.now(timezone.utc).strftime('%H:%M UTC')}"""
    
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    data = urllib.parse.urlencode({
        'chat_id': chat_id,
        'text': alert_text,
        'parse_mode': 'HTML'
    }).encode()
    
    try:
        req = urllib.request.Request(url, data=data, method='POST')
        with urllib.request.urlopen(req, timeout=30) as response:
            return json.loads(response.read().decode()).get('ok', False)
    except Exception as e:
        print(f"[ALERT] Failed to send: {e}")
        return False

def main():
    healthy, message, stale_time = check_feed_health()
    
    print(f"[{datetime.now(timezone.utc).strftime('%H:%M:%S')}] {message}")
    
    if not healthy and stale_time and '--alert' in sys.argv:
        send_alert(message, stale_time)
    
    sys.exit(0 if healthy else 1)

if __name__ == "__main__":
    main()
