#!/usr/bin/env python3
"""
LURKER Telegram Notifier - Premium Alerts
Sends alerts for:
- New PREMIUM token detected
- Pump detected (+20% in 1h)
- Dump detected (-15% in 1h)
- PREMIUM token disappears from top
"""
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

# Config
BASE_DIR = Path("/data/.openclaw/workspace/lurker-project")

# Telegram config via env vars
BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
ALERT_CHAT_ID = os.getenv("LURKER_ALERTS_CHAT_ID")

# Thresholds
PUMP_THRESHOLD = 20  # 20%
DUMP_THRESHOLD = -15  # -15%

def send_telegram_message(text):
    """Send message to Telegram"""
    import urllib.request
    import urllib.parse
    
    if not BOT_TOKEN or not ALERT_CHAT_ID:
        print("[NOTIFIER] Missing Telegram credentials (TELEGRAM_BOT_TOKEN, LURKER_ALERTS_CHAT_ID)")
        return False
    
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    data = urllib.parse.urlencode({
        'chat_id': ALERT_CHAT_ID,
        'text': text,
        'parse_mode': 'HTML',
        'disable_web_page_preview': 'false'
    }).encode()
    
    try:
        req = urllib.request.Request(url, data=data, method='POST')
        with urllib.request.urlopen(req, timeout=30) as response:
            result = json.loads(response.read().decode())
            return result.get('ok', False)
    except Exception as e:
        print(f"[NOTIFIER] Failed to send: {e}")
        return False


def get_badge(score):
    """Get badge based on score"""
    if score >= 80:
        return "💎 DIAMOND"
    elif score >= 60:
        return "🔥 HOT"
    elif score >= 40:
        return "⭐ PREMIUM"
    elif score >= 20:
        return "📈 WATCH"
    else:
        return "🆕 NEW"


def get_recommendation(change_pct, score, liquidity, volume):
    """Generate BUY/SELL/HOLD recommendation"""
    # Base recommendation
    if change_pct >= 15 and liquidity > 10000 and volume > 50000:
        return "🤜 STRONG BUY"
    elif change_pct >= 10 and liquidity > 5000:
        return "✅ BUY"
    elif change_pct <= -20:
        return "🛑 SELL"
    elif change_pct <= -10:
        return "⚠️ SELL"
    elif score >= 60 and change_pct > 0:
        return "✅ HOLD (BUY)"
    elif score >= 40:
        return "⏸️ HOLD"
    else:
        return "❌ AVOID"


def format_price(price):
    """Format price nicely"""
    if price is None or price == 0:
        return "N/A"
    if price >= 1:
        return f"${price:.4f}"
    elif price >= 0.01:
        return f"${price:.6f}"
    else:
        return f"${price:.8f}"


def format_large_number(num):
    """Format large numbers"""
    if num is None or num == 0:
        return "$0"
    if num >= 1_000_000:
        return f"${num/1_000_000:.2f}M"
    elif num >= 1_000:
        return f"${num/1_000:.1f}k"
    else:
        return f"${num:.0f}"


# ============================================================
# ALERT TYPES
# ============================================================

def send_new_premium_token(token_data):
    """Alert when new PREMIUM token detected"""
    symbol = token_data.get("symbol") or token_data.get("token", {}).get("symbol", "UNKNOWN")
    address = token_data.get("address") or token_data.get("token", {}).get("address", "")
    price = token_data.get("price") or token_data.get("metrics", {}).get("price_usd", 0)
    liquidity = token_data.get("liquidity") or token_data.get("metrics", {}).get("liq_usd", 0)
    volume = token_data.get("volume_24h") or token_data.get("metrics", {}).get("vol_24h_usd", 0)
    score = token_data.get("score") or token_data.get("scores", {}).get("cio_score", 0)
    change_pct = token_data.get("change_pct", 0)
    
    badge = get_badge(score)
    recommendation = get_recommendation(change_pct, score, liquidity, volume)
    
    msg = f"""<b>🆕 NOUVEAU TOKEN PREMIUM</b>

<b>{badge}</b> <code>{symbol}</code>

<b>Prix:</b> {format_price(price)}
<b>Variation:</b> {change_pct:+.2f}%
<b>Score:</b> {score}/100

<b>Liquidité:</b> {format_large_number(liquidity)}
<b>Volume 24h:</b> {format_large_number(volume)}

<b>📊 Recommandation:</b> {recommendation}

<a href="https://dexscreener.com/base/{address}">Voir sur DexScreener →</a>

👁️ LURKER Premium Alert"""
    
    return send_telegram_message(msg)


def send_pump_alert(token_data):
    """Alert when pump detected (+20% in 1h)"""
    symbol = token_data.get("symbol") or token_data.get("token", {}).get("symbol", "UNKNOWN")
    address = token_data.get("address") or token_data.get("token", {}).get("address", "")
    price = token_data.get("price") or token_data.get("metrics", {}).get("price_usd", 0)
    liquidity = token_data.get("liquidity") or token_data.get("metrics", {}).get("liq_usd", 0)
    volume = token_data.get("volume_24h") or token_data.get("metrics", {}).get("vol_24h_usd", 0)
    score = token_data.get("score") or token_data.get("scores", {}).get("cio_score", 0)
    change_pct = token_data.get("change_pct", 0)
    
    badge = get_badge(score)
    recommendation = get_recommendation(change_pct, score, liquidity, volume)
    
    msg = f"""<b>🚀 PUMP ALERT: {symbol}</b>

{badge} <code>{symbol}</code>

<b>Prix actuel:</b> {format_price(price)}
<b>📈 Variation:</b> <b>+{change_pct:.2f}%</b> en 1h
<b>Score:</b> {score}/100

<b>Liquidité:</b> {format_large_number(liquidity)}
<b>Volume 24h:</b> {format_large_number(volume)}

<b>📊 Recommandation:</b> {recommendation}

<a href="https://dexscreener.com/base/{address}">Voir sur DexScreener →</a>

🔥 LURKER Pump Alert"""
    
    return send_telegram_message(msg)


def send_dump_alert(token_data):
    """Alert when dump detected (-15% in 1h)"""
    symbol = token_data.get("symbol") or token_data.get("token", {}).get("symbol", "UNKNOWN")
    address = token_data.get("address") or token_data.get("token", {}).get("address", "")
    price = token_data.get("price") or token_data.get("metrics", {}).get("price_usd", 0)
    liquidity = token_data.get("liquidity") or token_data.get("metrics", {}).get("liq_usd", 0)
    volume = token_data.get("volume_24h") or token_data.get("metrics", {}).get("vol_24h_usd", 0)
    score = token_data.get("score") or token_data.get("scores", {}).get("cio_score", 0)
    change_pct = token_data.get("change_pct", 0)
    
    badge = get_badge(score)
    recommendation = get_recommendation(change_pct, score, liquidity, volume)
    
    msg = f"""<b>📉 DUMP ALERT: {symbol}</b>

{badge} <code>{symbol}</code>

<b>Prix actuel:</b> {format_price(price)}
<b>📉 Variation:</b> <b>{change_pct:.2f}%</b> en 1h
<b>Score:</b> {score}/100

<b>Liquidité:</b> {format_large_number(liquidity)}
<b>Volume 24h:</b> {format_large_number(volume)}

<b>📊 Recommandation:</b> {recommendation}

<a href="https://dexscreener.com/base/{address}">Voir sur DexScreener →</a>

⚠️ LURKER Dump Alert"""
    
    return send_telegram_message(msg)


def send_premium_removed(token_data):
    """Alert when PREMIUM token disappears from top"""
    symbol = token_data.get("symbol") or token_data.get("token", {}).get("symbol", "UNKNOWN")
    address = token_data.get("address") or token_data.get("token", {}).get("address", "")
    last_price = token_data.get("last_price") or token_data.get("metrics", {}).get("price_usd", 0)
    change_pct = token_data.get("change_pct", 0)
    
    msg = f"""<b>❌ TOKEN PREMIUM SORTI DU TOP</b>

<code>{symbol}</code>

<b>Dernier prix:</b> {format_price(last_price)}
<b>Variation finale:</b> {change_pct:.2f}%
<b>Adresse:</b> <code>{address}</code>

<b>Cause possible:</b>
• Liquidity trop faible
• Volume trop bas
• Token établi comme inactif
• RUG détecté

<a href="https://dexscreener.com/base/{address}">Voir historique →</a>

👁️ LURKER Premium Exit"""
    
    return send_telegram_message(msg)


# ============================================================
# INTEGRATION HELPERS
# ============================================================

def notify_new_premium(token):
    """Notify new premium token - call from scanner_cio_ultra.py"""
    return send_new_premium_token(token)


def notify_pump(token_data):
    """Notify pump alert - call from premium_tracker.py"""
    return send_pump_alert(token_data)


def notify_dump(token_data):
    """Notify dump alert - call from premium_tracker.py"""
    return send_dump_alert(token_data)


def notify_premium_removed(token):
    """Notify premium token removed from top - call from lifecycle_core.py"""
    return send_premium_removed(token)


# ============================================================
# MAIN / TEST
# ============================================================

def test():
    """Test all alert types"""
    test_token = {
        "symbol": "TEST",
        "address": "0x742d35Cc6634C0532925a3b844Bc9e7595f0",
        "price": 0.00342,
        "liquidity": 85000,
        "volume_24h": 250000,
        "score": 75,
        "change_pct": 25.5
    }
    
    print("Testing new premium token...")
    send_new_premium_token(test_token)
    
    print("Testing pump alert...")
    send_pump_alert(test_token)
    
    print("Testing dump alert...")
    dump_token = test_token.copy()
    dump_token["change_pct"] = -18.5
    send_dump_alert(dump_token)
    
    print("Testing premium removed...")
    send_premium_removed(test_token)


if __name__ == "__main__":
    test()
