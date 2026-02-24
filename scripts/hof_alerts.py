#!/usr/bin/env python3
"""
LURKER Hall of Fame Alerts — Telegram notifications for new winners
Triggered when a token enters the Hall of Fame
"""
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

HALL_OF_FAME_FILE = Path(__file__).parent.parent / "signals" / "hall_of_fame.json"
ALERTS_STATE_FILE = Path(__file__).parent.parent / "state" / "hof_alerts_sent.json"

def load_hof_alerts_state():
    if ALERTS_STATE_FILE.exists():
        with open(ALERTS_STATE_FILE) as f:
            return json.load(f)
    return {"alerted_tokens": []}

def save_hof_alerts_state(state):
    ALERTS_STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(ALERTS_STATE_FILE, 'w') as f:
        json.dump(state, f, indent=2)

def send_telegram_alert(message):
    """Send alert to Telegram"""
    import urllib.request
    import urllib.parse
    
    BOT_TOKEN = os.getenv('TELEGRAM_BOT_TOKEN')
    CHAT_ID = os.getenv('LURKER_ALERTS_CHAT_ID')
    
    if not BOT_TOKEN or not CHAT_ID:
        print("[ALERT] Missing Telegram credentials")
        return False
    
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    data = urllib.parse.urlencode({
        'chat_id': CHAT_ID,
        'text': message,
        'parse_mode': 'HTML',
        'disable_web_page_preview': 'true'
    }).encode()
    
    try:
        req = urllib.request.Request(url, data=data, method='POST')
        with urllib.request.urlopen(req, timeout=30) as response:
            result = json.loads(response.read().decode())
            return result.get('ok', False)
    except Exception as e:
        print(f"[ALERT] Failed: {e}")
        return False

def check_new_hof_entries():
    """Check for new Hall of Fame entries and alert"""
    hof = json.load(open(HALL_OF_FAME_FILE)) if HALL_OF_FAME_FILE.exists() else {"certified": []}
    state = load_hof_alerts_state()
    
    alerted = state.get("alerted_tokens", [])
    new_entries = []
    
    for token in hof.get("certified", []):
        token_id = token.get("token", {}).get("address", "")
        if token_id and token_id not in alerted:
            new_entries.append(token)
            alerted.append(token_id)
    
    if new_entries:
        print(f"🎉 {len(new_entries)} new Hall of Fame entries!")
        
        for entry in new_entries:
            symbol = entry.get("token", {}).get("symbol", "UNKNOWN")
            gain_pct = entry.get("gain_pct", 0)
            max_gain = entry.get("max_gain_pct", 0)
            age_hours = entry.get("age_hours", 0)
            
            message = f"""🏆 <b>HALL OF FAME ENTRY</b>

<b>${symbol}</b> has been certified!

📈 <b>Performance:</b>
• Total Gain: +{gain_pct}%
• Peak Gain: +{max_gain}%
• Age: {age_hours}h

This token was detected early by LURKER and delivered real gains.

👁️ Early detection matters."""
            
            if send_telegram_alert(message):
                print(f"   ✅ Alert sent for {symbol}")
            else:
                print(f"   ❌ Failed to alert for {symbol}")
        
        # Save state
        state["alerted_tokens"] = alerted
        state["last_check"] = datetime.now(timezone.utc).isoformat()
        save_hof_alerts_state(state)
    else:
        print("✅ No new Hall of Fame entries")

if __name__ == "__main__":
    print("="*60)
    print("LURKER Hall of Fame Alerts")
    print("="*60)
    check_new_hof_entries()
