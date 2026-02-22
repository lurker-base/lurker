#!/usr/bin/env python3
"""
LURKER Telegram Notifier — Early detection alerts
Send alerts for ALL new tokens (not just PREMIUM) so users can enter early
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
    return {"notified": {}, "updates": []}

def save_state(state):
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(STATE_FILE, 'w') as f:
        json.dump(state, f, indent=2)

def calculate_badge(token):
    """Calculate badge: PREMIUM, GOOD, or WATCH"""
    quality = token.get('quality', {})
    q_score = quality.get('quality_score', 0)
    liq = token['metrics']['liq_usd']
    vol1h = token['metrics'].get('vol_1h_usd', 0)
    
    # Same logic as unifiedFeed.js
    is_pumping = vol1h > 100000
    is_premium = q_score >= 80 and (liq > 40000 or is_pumping)
    is_good = q_score >= 60 or liq > 30000 or vol1h > 50000
    
    if is_premium:
        return "PREMIUM", "🔥"
    elif is_good:
        return "GOOD", "✅"
    else:
        return "WATCH", "👁️"

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
        with urllib.request.urlopen(req, timeout=30) as response:
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

def format_token_alert(token, badge_name, badge_emoji):
    """Format token info for Telegram with badge"""
    symbol = token['token']['symbol']
    name = token['token']['name']
    addr = token['token']['address']
    liq = token['metrics']['liq_usd']
    vol1h = token['metrics'].get('vol_1h_usd', 0)
    vol5m = token['metrics'].get('vol_5m_usd', 0)
    age = token['timestamps']['age_minutes']
    quality = token.get('quality', {})
    risk = token.get('risk_level', 'unknown')
    score = token.get('scores', {}).get('cio_score', 0)
    
    # Risk emoji
    risk_emoji = "🟢" if risk == 'low' else "🟡" if risk == 'medium' else "🔴"
    
    # Quality icons
    icons = ""
    if quality.get('has_image'): icons += "🖼️"
    if quality.get('has_socials'): icons += "💬"
    if quality.get('has_website'): icons += "🌐"
    
    msg = f"""<b>{badge_emoji} {badge_name}</b>

<b>${symbol}</b> — {name}
{icons}

📊 Score: {score}/100
{risk_emoji} Risk: {risk.upper()}
💧 Liquidity: ${liq/1000:.1f}k
📈 Volume 1h: ${vol1h/1000:.1f}k
🔥 Volume 5m: ${vol5m/1000:.1f}k
⏱️ Age: {age:.0f} minutes

<a href="https://dexscreener.com/base/{addr}">View on DexScreener →</a>

👁️ LURKER — Early Detection"""
    
    return msg

def format_upgrade_alert(token, old_badge, new_badge, badge_emoji):
    """Format upgrade notification (e.g., WATCH -> GOOD)"""
    symbol = token['token']['symbol']
    addr = token['token']['address']
    liq = token['metrics']['liq_usd']
    
    msg = f"""<b>{badge_emoji} UPGRADE: {old_badge} → {new_badge}</b>

<b>${symbol}</b> 

💧 Liquidity: ${liq/1000:.1f}k

Token upgraded to {new_badge}!

<a href="https://dexscreener.com/base/{addr}">View on DexScreener →</a>

👁️ LURKER"""
    
    return msg

def main():
    print("=" * 60)
    print("[TELEGRAM NOTIFIER] Early Detection Mode")
    print("=" * 60)
    
    if not CIO_FILE.exists():
        print("[ERROR] CIO feed not found")
        sys.exit(1)
    
    with open(CIO_FILE) as f:
        data = json.load(f)
    
    candidates = data.get('candidates', [])
    state = load_state()
    notified = state.get('notified', {})
    
    new_tokens = []
    upgraded_tokens = []
    
    for token in candidates:
        addr = token['token']['address'].lower()
        badge_name, badge_emoji = calculate_badge(token)
        
        if addr not in notified:
            # New token — send alert immediately
            new_tokens.append((token, badge_name, badge_emoji))
            notified[addr] = {
                "badge": badge_name,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "symbol": token['token']['symbol']
            }
        elif notified[addr].get('badge') != badge_name:
            # Badge upgraded — send update
            old_badge = notified[addr]['badge']
            if badge_name in ['GOOD', 'PREMIUM'] and old_badge in ['WATCH', 'GOOD']:
                upgraded_tokens.append((token, old_badge, badge_name, badge_emoji))
                notified[addr]['badge'] = badge_name
                notified[addr]['upgraded_at'] = datetime.now(timezone.utc).isoformat()
    
    print(f"[INFO] {len(candidates)} tokens in CIO feed")
    print(f"[INFO] {len(new_tokens)} new tokens to notify")
    print(f"[INFO] {len(upgraded_tokens)} upgrades to notify")
    
    sent = 0
    failed = []
    
    # Send new token alerts
    for token, badge_name, badge_emoji in new_tokens:
        msg = format_token_alert(token, badge_name, badge_emoji)
        if send_telegram_message(msg):
            sent += 1
        else:
            failed.append(token['token']['address'].lower())
    
    # Send upgrade alerts
    for token, old_badge, new_badge, badge_emoji in upgraded_tokens:
        msg = format_upgrade_alert(token, old_badge, new_badge, badge_emoji)
        if send_telegram_message(msg):
            sent += 1
        else:
            failed.append(token['token']['address'].lower())
    
    # Remove failed from state so they retry
    for addr in failed:
        if addr in notified:
            del notified[addr]
    
    # Save state
    state['notified'] = notified
    state['last_check'] = datetime.now(timezone.utc).isoformat()
    save_state(state)
    
    print(f"[INFO] Sent {sent} notifications")
    print("[DONE]")
    return 0

if __name__ == "__main__":
    sys.exit(main())
