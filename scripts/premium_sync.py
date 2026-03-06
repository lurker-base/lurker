#!/usr/bin/env python3
"""
LURKER Premium Token Sync
Sync tokens from lifecycle to premium tracker and send Telegram alerts
Run this in a loop: while true; do python3 premium_sync.py; sleep 60; done
"""
import json
import os
import time
import requests
from datetime import datetime, timezone
from pathlib import Path

BASE_DIR = Path("/data/.openclaw/workspace/lurker-project")
STATE_FILE = BASE_DIR / "state" / "lurker_state.json"
PREMIUM_FILE = BASE_DIR / "state" / "premium_tracker.json"
NOTIFIED_FILE = BASE_DIR / "state" / "sync_notified.json"

# Telegram
BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")

# Thresholds
MIN_LIQ = 10000
MIN_VOL = 50000
MIN_HOLDERS = 50
MIN_AGE_HOURS = 2

def load_json(path):
    if path.exists():
        with open(path) as f:
            return json.load(f)
    return None

def save_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, 'w') as f:
        json.dump(data, f, indent=2)

def get_price_change(token_addr):
    """Get current price and 1h change from DexScreener"""
    try:
        url = f"https://api.dexscreener.com/tokens/base/{token_addr}"
        resp = requests.get(url, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            if "pair" in data:
                pair = data["pair"]
                price = float(pair.get("priceUsd", 0))
                change_1h = float(pair.get("priceChange", {}).get("h1", 0))
                volume = float(pair.get("volume", {}).get("h24", 0))
                liquidity = float(pair.get("liquidity", {}).get("usd", 0))
                return {
                    "price": price,
                    "change_1h": change_1h,
                    "volume_24h": volume,
                    "liquidity": liquidity,
                    "buys": pair.get("txns", {}).get("h24", {}).get("buys", 0),
                    "sells": pair.get("txns", {}).get("h24", {}).get("sells", 0)
                }
    except Exception as e:
        print(f"Error fetching price for {token_addr}: {e}")
    return None

def get_badge(token_data):
    """Calculate badges based on token metrics"""
    liq = token_data.get("liquidity_usd", 0)
    vol = token_data.get("volume_24h", 0)
    holders = token_data.get("holder_count", 0)
    q_score = token_data.get("quality_score", 0)
    age_hours = token_data.get("age_hours", 0)
    price_change = token_data.get("price_change_1h", 0)
    
    badges = []
    
    if price_change >= 20:
        badges.append("🔥 PUMP")
    elif price_change <= -15:
        badges.append("📉 DUMP")
    
    if q_score >= 80:
        badges.append("⭐ PREMIUM")
    
    if liq >= 100000 and holders >= 500:
        badges.append("🛡️ SAFE")
    
    if age_hours >= 24:
        badges.append("⏰ OLD")
    
    if not badges:
        badges.append("👁️ WATCH")
    
    return " ".join(badges)

def send_telegram(msg):
    if not BOT_TOKEN or not CHAT_ID:
        return False
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    try:
        requests.post(url, json={'chat_id': CHAT_ID, 'text': msg, 'parse_mode': 'Markdown'}, timeout=10)
        return True
    except:
        return False

def sync_tokens():
    print("[SYNC] Starting premium token sync...")
    
    # Load states
    state = load_json(STATE_FILE)
    premium = load_json(PREMIUM_FILE) or {"tracked_tokens": {}, "pump_alerts": [], "dump_alerts": []}
    notified = load_json(NOTIFIED_FILE) or {"notified": []}
    
    if not state:
        print("[SYNC] No state file")
        return
    
    tokens = state.get("tokens", {})
    tracked = premium.get("tracked_tokens", {})
    
    new_premium = 0
    
    for addr, token in tokens.items():
        # Get live metrics
        live = get_price_change(addr)
        if not live:
            continue
        
        # Update token with live data
        token["price_usd"] = live["price"]
        token["price_change_1h"] = live["change_1h"]
        token["volume_24h"] = live["volume_24h"]
        token["liquidity_usd"] = live["liquidity"]
        
        # Check if should be tracked
        liq = live["liquidity"]
        vol = live["volume_24h"]
        age_hours = token.get("age_hours", 0)
        
        if liq >= MIN_LIQ and vol >= MIN_VOL and age_hours >= MIN_AGE_HOURS:
            if addr not in tracked:
                # New premium token!
                tracked[addr] = {
                    "symbol": token.get("symbol", addr[:8]),
                    "address": addr,
                    "first_tracked": datetime.now(timezone.utc).isoformat(),
                    "liquidity": liq,
                    "volume_24h": vol,
                    "quality_score": token.get("quality_score", 0),
                    "last_price": live["price"],
                    "last_check": datetime.now(timezone.utc).isoformat()
                }
                new_premium += 1
                
                # Send Telegram alert
                badge = get_badge(token)
                msg = f"⭐ *NEW PREMIUM TOKEN*\n\n"
                msg += f"{badge}\n"
                msg += f"*{token.get('symbol', 'UNKNOWN')}*\n\n"
                msg += f"💧 Liquidity: ${liq:,.0f}\n"
                msg += f"📊 Volume 24h: ${vol:,.0f}\n"
                msg += f"📈 Change 1h: {live['change_1h']:+.2f}%\n\n"
                msg += f"`{addr[:12]}...`"
                
                if addr not in notified.get("notified", []):
                    send_telegram(msg)
                    notified.setdefault("notified", []).append(addr)
                    print(f"[SYNC] New premium: {token.get('symbol')} - ${liq:,.0f} liq")
            else:
                # Update tracked token
                tracked[addr].update({
                    "liquidity": liq,
                    "volume_24h": vol,
                    "last_price": live["price"],
                    "last_check": datetime.now(timezone.utc).isoformat()
                })
                
                # Check for pump/dump on tracked tokens
                last_price = tracked[addr].get("last_price")
                if last_price and last_price > 0:
                    change = (live["price"] - last_price) / last_price * 100
                    
                    if change >= 20:
                        alert = {
                            "token": token.get("symbol", addr[:8]),
                            "address": addr,
                            "change_pct": round(change, 2),
                            "price": live["price"],
                            "volume_24h": vol,
                            "liquidity": liq,
                            "time": datetime.now(timezone.utc).isoformat()
                        }
                        premium.setdefault("pump_alerts", []).append(alert)
                        
                        msg = f"🔥 *PUMP ALERT*\n\n*{token.get('symbol')}* +{change:.1f}%\n💧 ${liq:,.0f} | 📊 ${vol:,.0f}"
                        if addr not in notified.get("notified", []):
                            send_telegram(msg)
                            notified.setdefault("notified", []).append(addr)
                    
                    elif change <= -15:
                        alert = {
                            "token": token.get("symbol", addr[:8]),
                            "address": addr,
                            "change_pct": round(change, 2),
                            "price": live["price"],
                            "volume_24h": vol,
                            "liquidity": liq,
                            "time": datetime.now(timezone.utc).isoformat()
                        }
                        premium.setdefault("dump_alerts", []).append(alert)
                        
                        msg = f"📉 *DUMP ALERT*\n\n*{token.get('symbol')}* {change:.1f}%\n💧 ${liq:,.0f} | 📊 ${vol:,.0f}"
                        if addr not in notified.get("notified", []):
                            send_telegram(msg)
                            notified.setdefault("notified", []).append(addr)
    
    # Save states
    save_json(PREMIUM_FILE, premium)
    save_json(NOTIFIED_FILE, notified)
    
    print(f"[SYNC] Done. Tracked: {len(tracked)}, New premium: {new_premium}")
    
    # Return summary for Twitter
    return {
        "tracked": len(tracked),
        "new_premium": new_premium,
        "pumps": len(premium.get("pump_alerts", [])),
        "dumps": len(premium.get("dump_alerts", []))
    }

if __name__ == "__main__":
    sync_tokens()
