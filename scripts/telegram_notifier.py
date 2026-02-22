#!/usr/bin/env python3
"""
LURKER Telegram Notifier — Send alerts for new PREMIUM tokens
Triggered by changes to cio_feed.json
"""
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

CIO_FILE = Path("signals/cio_feed.json")
STATE_FILE = Path("state/telegram_notified.json")

# Telegram config from env
BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")

def load_state():
    if STATE_FILE.exists():
        with open(STATE_FILE) as f:
            return json.load(f)
    return {"notified": []}

def save_state(state):
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(STATE_FILE, 'w') as f:
        json.dump(state, f, indent=2)

def send_telegram_message(text):
    import urllib.request
    import urllib.parse
    
    if not BOT_TOKEN or not CHAT_ID:
        print("[TELEGRAM] Missing credentials")
        return False
    
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    data = urllib.parse.urlencode({
        'chat_id': CHAT_ID,
        'text': text,
        'parse_mode': 'HTML',
        'disable_web_page_preview': 'true'
    }).encode()
    
    try:
        req = urllib.request.Request(url, data=data, method='POST')
        with urllib.request.urlopen(req) as response:
            result = json.loads(response.read().decode())
            if result.get('ok'):
                print(f"[TELEGRAM] Message sent")
                return True
            else:
                print(f"[TELEGRAM] Error: {result}")
                return False
    except Exception as e:
        print(f"[TELEGRAM] Failed: {e}")
        return False

def format_token_alert(token):
    """Format token info for Telegram"""
    symbol = token['token']['symbol']
    name = token['token']['name']
    addr = token['token']['address']
    liq = token['metrics']['liq_usd']
    vol1h = token['metrics'].get('vol_1h_usd', 0)
    age = token['timestamps']['age_minutes']
    quality = token.get('quality', {})
    
    # Determine badge
    q_score = quality.get('quality_score', 0)
    is_premium = q_score >= 80 and (liq > 40000 or vol1h > 100000)
    
    badge = "🔥 PREMIUM" if is_premium else "✅ NEW"
    
    # Quality icons
    icons = ""
    if quality.get('has_image'): icons += "🖼️ "
    if quality.get('has_socials'): icons += "💬 "
    if quality.get('has_website'): icons += "🌐 "
    
    msg = f"""<b>{badge} SIGNAL</b>

<b>${symbol}</b> — {name}

💧 Liquidity: ${liq/1000:.1f}k
📈 Volume 1h: ${vol1h/1000:.1f}k
⏱️ Age: {age:.0f} minutes

{icons}

<a href="https://dexscreener.com/base/{addr}">View on DexScreener →</a>

👁️ LURKER detected"""
    
    return msg

def main():
    print("=" * 60)
    print("[TELEGRAM NOTIFIER] Checking for new PREMIUM tokens")
    print("=" * 60)
    
    if not CIO_FILE.exists():
        print("[ERROR] CIO feed not found")
        sys.exit(1)
    
    with open(CIO_FILE) as f:
        data = json.load(f)
    
    candidates = data.get('candidates', [])
    state = load_state()
    notified = set(state.get('notified', []))
    
    new_premium = []
    
    for token in candidates:
        addr = token['token']['address'].lower()
        liq = token['metrics']['liq_usd']
        vol1h = token['metrics'].get('vol_1h_usd', 0)
        quality = token.get('quality', {})
        q_score = quality.get('quality_score', 0)
        
        # Only notify for PREMIUM tokens
        is_premium = q_score >= 80 and (liq > 40000 or vol1h > 100000)
        
        if is_premium and addr not in notified:
            new_premium.append(token)
            notified.add(addr)
    
    print(f"[INFO] Found {len(new_premium)} new PREMIUM tokens")
    
    sent = 0
    for token in new_premium:
        msg = format_token_alert(token)
        if send_telegram_message(msg):
            sent += 1
        else:
            # Remove from notified if failed
            notified.discard(token['token']['address'].lower())
    
    # Save state
    state['notified'] = list(notified)
    state['last_check'] = datetime.now(timezone.utc).isoformat()
    save_state(state)
    
    print(f"[INFO] Sent {sent} notifications")
    print("[DONE]")
    return 0 if sent > 0 else 0  # Exit 0 even if no new tokens

if __name__ == "__main__":
    sys.exit(main())
