#!/usr/bin/env python3
"""
LURKER Momentum Scanner — Detect volume/price spikes in real-time
Catches pumps that happen AFTER initial detection (like ODAI)
"""
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

# Config
MOMENTUM_FILE = Path("state/momentum_state.json")
ALERTS_FILE = Path("logs/momentum_alerts.json")

# Thresholds for momentum detection
VOLUME_SPIKE_THRESHOLD = 3.0  # 3x volume increase
PRICE_SPIKE_THRESHOLD = 1.2   # 20% price increase
LIQ_SPIKE_THRESHOLD = 2.0     # 2x liquidity increase

# Telegram config
BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
ALERT_CHAT_ID = os.getenv("LURKER_ALERTS_CHAT_ID")

def load_json(path: Path) -> dict:
    if path.exists():
        with open(path) as f:
            return json.load(f)
    return {}

def save_json(path: Path, data: dict):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, 'w') as f:
        json.dump(data, f, indent=2)

def send_telegram_alert(text: str) -> bool:
    """Send momentum alert to Telegram"""
    import urllib.request
    import urllib.parse
    
    if not BOT_TOKEN or not ALERT_CHAT_ID:
        print("[MOMENTUM] Missing Telegram credentials")
        return False
    
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    data = urllib.parse.urlencode({
        'chat_id': ALERT_CHAT_ID,
        'text': text,
        'parse_mode': 'HTML',
        'disable_web_page_preview': 'true'
    }).encode()
    
    try:
        req = urllib.request.Request(url, data=data, method='POST')
        with urllib.request.urlopen(req, timeout=30) as response:
            result = json.loads(response.read().decode())
            return result.get('ok', False)
    except Exception as e:
        print(f"[MOMENTUM] Failed to send: {e}")
        return False

def format_momentum_alert(token: dict, spike_type: str, change_pct: float, old_val: float, new_val: float) -> str:
    """Format momentum alert message"""
    symbol = token['token']['symbol']
    address = token['token']['address']
    metrics = token['metrics']
    
    # Determine emoji and message based on spike type
    if spike_type == 'volume':
        emoji = "📈"
        msg = f"Volume spike: {change_pct:.1f}x in 15min"
    elif spike_type == 'price':
        emoji = "🚀"
        msg = f"Price pump: +{change_pct*100:.0f}% in 15min"
    elif spike_type == 'liquidity':
        emoji = "💧"
        msg = f"Liquidity surge: {change_pct:.1f}x in 15min"
    else:
        emoji = "⚡"
        msg = f"Momentum detected: {change_pct:.1f}x change"
    
    alert_text = f"""<b>{emoji} MOMENTUM ALERT: ${symbol}</b>

<b>{msg}</b>

<b>Token:</b> <code>{address}</code>

<b>Current Metrics:</b>
💧 Liquidity: ${metrics['liq_usd']/1000:.1f}k
📊 Volume 1h: ${metrics.get('vol_1h_usd', 0)/1000:.1f}k
🔥 Volume 5m: ${metrics.get('vol_5m_usd', 0)/1000:.1f}k
💰 Price: ${metrics.get('price_usd', 0):.2e}

<b>Change:</b>
{spike_type.upper()}: {old_val/1000:.1f}k → {new_val/1000:.1f}k

<a href="https://dexscreener.com/base/{address}">View on DexScreener →</a>

⚠️ High momentum detected — exercise caution
👁️ LURKER Momentum Scanner"""
    
    return alert_text

def check_momentum(current_feed: list, previous_state: dict) -> list:
    """Check for momentum spikes between current and previous state"""
    alerts = []
    
    for token in current_feed:
        symbol = token['token']['symbol']
        address = token['token']['address']
        
        # Skip if not in previous state (new token)
        if address not in previous_state:
            continue
        
        prev = previous_state[address]
        curr = token['metrics']
        
        # Check volume spike
        prev_vol_1h = prev.get('vol_1h_usd', 0)
        curr_vol_1h = curr.get('vol_1h_usd', 0)
        if prev_vol_1h > 1000 and curr_vol_1h > 0:
            vol_ratio = curr_vol_1h / prev_vol_1h
            if vol_ratio >= VOLUME_SPIKE_THRESHOLD:
                alerts.append({
                    'token': token,
                    'type': 'volume',
                    'change': vol_ratio,
                    'old_val': prev_vol_1h,
                    'new_val': curr_vol_1h
                })
                continue
        
        # Check price spike
        prev_price = prev.get('price_usd', 0)
        curr_price = curr.get('price_usd', 0)
        if prev_price > 0 and curr_price > 0:
            price_ratio = curr_price / prev_price
            if price_ratio >= PRICE_SPIKE_THRESHOLD:
                alerts.append({
                    'token': token,
                    'type': 'price',
                    'change': price_ratio,
                    'old_val': prev_price,
                    'new_val': curr_price
                })
                continue
        
        # Check liquidity spike
        prev_liq = prev.get('liq_usd', 0)
        curr_liq = curr.get('liq_usd', 0)
        if prev_liq > 1000 and curr_liq > 0:
            liq_ratio = curr_liq / prev_liq
            if liq_ratio >= LIQ_SPIKE_THRESHOLD:
                alerts.append({
                    'token': token,
                    'type': 'liquidity',
                    'change': liq_ratio,
                    'old_val': prev_liq,
                    'new_val': curr_liq
                })
    
    return alerts

def save_state(feed: list):
    """Save current feed state for comparison next run"""
    state = {}
    for token in feed:
        addr = token['token']['address']
        state[addr] = {
            'vol_1h_usd': token['metrics'].get('vol_1h_usd', 0),
            'vol_5m_usd': token['metrics'].get('vol_5m_usd', 0),
            'price_usd': token['metrics'].get('price_usd', 0),
            'liq_usd': token['metrics'].get('liq_usd', 0),
            'timestamp': datetime.now(timezone.utc).isoformat()
        }
    save_json(MOMENTUM_FILE, state)

def log_alert(alert: dict):
    """Log momentum alert to file"""
    alerts = load_json(ALERTS_FILE)
    alert_id = f"mom_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}_{alert['token']['token']['symbol']}"
    alerts[alert_id] = {
        'timestamp': datetime.now(timezone.utc).isoformat(),
        'token': alert['token']['token'],
        'type': alert['type'],
        'change': alert['change'],
        'old_value': alert['old_val'],
        'new_value': alert['new_val']
    }
    save_json(ALERTS_FILE, alerts)

def main():
    """Main momentum scan"""
    print("=" * 60)
    print("[MOMENTUM SCANNER] Checking for volume/price spikes")
    print("=" * 60)
    
    # Load current feed
    cio_file = Path(__file__).parent.parent / "signals" / "cio_feed.json"
    if not cio_file.exists():
        print("[ERROR] CIO feed not found")
        sys.exit(1)
    
    with open(cio_file) as f:
        feed_data = json.load(f)
    
    current_feed = feed_data.get('candidates', [])
    
    # Load previous state
    previous_state = load_json(MOMENTUM_FILE)
    
    # Check for momentum
    alerts = check_momentum(current_feed, previous_state)
    
    print(f"[INFO] Checked {len(current_feed)} tokens")
    print(f"[INFO] Found {len(alerts)} momentum alerts")
    
    # Send alerts
    for alert in alerts:
        text = format_momentum_alert(
            alert['token'],
            alert['type'],
            alert['change'],
            alert['old_val'],
            alert['new_val']
        )
        
        if send_telegram_alert(text):
            print(f"[ALERT SENT] {alert['token']['token']['symbol']} - {alert['type']}")
            log_alert(alert)
        else:
            print(f"[FAILED] {alert['token']['token']['symbol']}")
    
    # Save current state for next comparison
    save_state(current_feed)
    
    print("[DONE] State saved for next comparison")

if __name__ == "__main__":
    main()
