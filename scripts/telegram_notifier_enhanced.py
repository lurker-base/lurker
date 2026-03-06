#!/usr/bin/env python3
"""
LURKER Enhanced Telegram Notifier
Sends alerts with improved badges: 🔥 PUMP, 📉 DUMP, ⭐ PREMIUM, 🛡️ SAFE, ⚡ HOT
"""
import json
import os
import time
import requests
from datetime import datetime, timezone
from pathlib import Path

# Config
BASE_DIR = Path("/data/.openclaw/workspace/lurker-project")
STATE_FILE = BASE_DIR / "state" / "telegram_notified.json"
PREMIUM_FILE = BASE_DIR / "state" / "premium_tracker.json"

# Telegram config
BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")

def load_state():
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    if STATE_FILE.exists():
        with open(STATE_FILE) as f:
            return json.load(f)
    return {"notified": {}, "pump_alerts": [], "dump_alerts": []}

def save_state(state):
    with open(STATE_FILE, 'w') as f:
        json.dump(state, f, indent=2)

def calculate_enhanced_badge(token):
    """Calculate enhanced badges: 🔥PUMP 📉DUMP ⭐PREMIUM 🛡️SAFE ⚡HOT"""
    metrics = token.get('metrics', {})
    quality = token.get('quality', {})
    
    liq = metrics.get('liq_usd', 0)
    vol_1h = metrics.get('vol_1h_usd', 0)
    vol_24h = metrics.get('vol_24h_usd', 0)
    holders = metrics.get('holder_count', 0)
    q_score = quality.get('quality_score', 0)
    price_change_1h = metrics.get('price_change_1h', 0)
    price_change_24h = metrics.get('price_change_24h', 0)
    
    badges = []
    
    # 🔥 PUMP - +20% en 1h
    if price_change_1h >= 20:
        badges.append("🔥 PUMP")
    
    # 📉 DUMP - -15% en 1h
    elif price_change_1h <= -15:
        badges.append("📉 DUMP")
    
    # ⭐ PREMIUM - score >= 80
    if q_score >= 80:
        badges.append("⭐ PREMIUM")
    
    # 🛡️ SAFE - high liquidity + holders
    if liq >= 100000 and holders >= 500:
        badges.append("🛡️ SAFE")
    
    # ⚡ HOT - high recent volume
    if vol_1h >= 50000 and vol_1h >= (vol_24h / 24) * 3:
        badges.append("⚡ HOT")
    
    # Default badge
    if not badges:
        badges.append("👁️ WATCH")
    
    return " ".join(badges)

def get_recommendation(token):
    """Get BUY/SELL/HOLD recommendation based on metrics"""
    metrics = token.get('metrics', {})
    quality = token.get('quality', {})
    
    q_score = quality.get('quality_score', 0)
    price_change_1h = metrics.get('price_change_1h', 0)
    liq = metrics.get('liq_usd', 0)
    vol_24h = metrics.get('vol_24h_usd', 0)
    
    # Buy signals
    if q_score >= 80 and liq >= 50000:
        return "🟢 BUY"
    if price_change_1h >= 15 and price_change_1h <= 25:
        return "🟢 BUY (momentum)"
    if q_score >= 60 and liq >= 30000:
        return "🟢 BUY"
    
    # Sell signals
    if price_change_1h <= -10:
        return "🔴 SELL"
    if q_score < 40 and liq < 10000:
        return "🔴 SELL"
    
    return "🟡 HOLD"

def send_telegram_message(text):
    if not BOT_TOKEN or not CHAT_ID:
        print("[TELEGRAM] Missing credentials")
        return False
    
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    data = {
        'chat_id': CHAT_ID,
        'text': text,
        'parse_mode': 'Markdown'
    }
    
    try:
        resp = requests.post(url, json=data, timeout=10)
        return resp.status_code == 200
    except Exception as e:
        print(f"[TELEGRAM] Error: {e}")
        return False

def check_premium_alerts():
    """Check for pump/dump alerts on tracked premium tokens"""
    state = load_state()
    
    # Load premium tracker state
    if not PREMIUM_FILE.exists():
        print("[TELEGRAM] No premium tracker state")
        return
    
    with open(PREMIUM_FILE) as f:
        premium = json.load(f)
    
    tracked = premium.get("tracked_tokens", {})
    pump_alerts = premium.get("pump_alerts", [])
    dump_alerts = premium.get("dump_alerts", [])
    
    # Check recent pumps
    for alert in pump_alerts[-5:]:
        token = alert.get("token", "UNKNOWN")
        change = alert.get("change_pct", 0)
        addr = alert.get("address", "")
        
        # Only notify once
        key = f"pump_{addr}"
        if key not in state.get("notified", {}):
            msg = f"🚀 *PUMP DETECTED*\n\n"
            msg += f"*{token}* +{change}%\n"
            msg += f"Address: `{addr[:6]}...{addr[-4:]}`\n\n"
            msg += f"Time: {alert.get('time', 'N/A')}"
            
            if send_telegram_message(msg):
                state.setdefault("notified", {})[key] = True
                print(f"[TELEGRAM] Pump alert sent for {token}")
    
    # Check recent dumps
    for alert in dump_alerts[-5:]:
        token = alert.get("token", "UNKNOWN")
        change = alert.get("change_pct", 0)
        addr = alert.get("address", "")
        
        key = f"dump_{addr}"
        if key not in state.get("notified", {}):
            msg = f"📉 *DUMP DETECTED*\n\n"
            msg += f"*{token}* {change}%\n"
            msg += f"Address: `{addr[:6]}...{addr[-4:]}`\n\n"
            msg += f"Time: {alert.get('time', 'N/A')}"
            
            if send_telegram_message(msg):
                state.setdefault("notified", {})[key] = True
                print(f"[TELEGRAM] Dump alert sent for {token}")
    
    # Summary of tracked premium tokens
    if tracked:
        msg = f"📊 *LURKER Premium Update*\n\n"
        msg += f"Tracking: {len(tracked)} tokens\n\n"
        
        # Top 3 by liquidity
        sorted_tokens = sorted(tracked.items(), 
                              key=lambda x: x[1].get('liquidity', 0), 
                              reverse=True)[:3]
        
        for addr, data in sorted_tokens:
            symbol = data.get('symbol', addr[:6])
            liq = data.get('liquidity', 0)
            vol = data.get('volume_24h', 0)
            msg += f"• {symbol}: ${liq:,.0f} liq\n"
        
        # Don't spam - only send if there are new alerts
        # send_telegram_message(msg)
    
    save_state(state)

def main():
    print("[TELEGRAM NOTIFIER] Starting...")
    check_premium_alerts()
    print("[TELEGRAM NOTIFIER] Done")

if __name__ == "__main__":
    main()
