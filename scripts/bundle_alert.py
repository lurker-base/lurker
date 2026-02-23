#!/usr/bin/env python3
"""
LURKER Bundle Farming Alert - Telegram notifications for suspicious patterns
"""
import os
import json
import requests
from datetime import datetime, timezone
from pathlib import Path

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "")
TELEGRAM_CHANNEL = os.getenv("TELEGRAM_CHANNEL", "@LurkerAlphaSignals")

def now():
    return datetime.now(timezone.utc)

ALERT_LOG_FILE = Path(__file__).parent.parent / "logs" / "bundle_alerts.log"

def log_alert_locally(token_symbol, token_address, risk_factors, metrics):
    """Log alert to local file when Telegram fails"""
    ALERT_LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    
    alert_entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "token_symbol": token_symbol,
        "token_address": token_address,
        "risk_factors": risk_factors,
        "metrics": metrics,
        "telegram_sent": False
    }
    
    with open(ALERT_LOG_FILE, 'a') as f:
        f.write(json.dumps(alert_entry) + '\n')
    
    print(f"[ALERT] 📝 Logged locally to {ALERT_LOG_FILE}")
    return True

def send_telegram_alert(token_symbol, token_address, risk_factors, metrics):
    """Send Telegram alert for bundle farming detection"""
    
    if not TELEGRAM_BOT_TOKEN:
        print("[ALERT] Telegram bot token not configured, logging locally")
        return log_alert_locally(token_symbol, token_address, risk_factors, metrics)
    
    # Try channel first, then chat ID
    chat_targets = []
    if TELEGRAM_CHANNEL:
        chat_targets.append(TELEGRAM_CHANNEL)
    if TELEGRAM_CHAT_ID:
        chat_targets.append(TELEGRAM_CHAT_ID)
    
    if not chat_targets:
        print("[ALERT] No Telegram target configured, logging locally")
        return log_alert_locally(token_symbol, token_address, risk_factors, metrics)
    
    # Build alert message
    emoji = "🚨"
    title = f"{emoji} BUNDLE FARMING DETECTED"
    
    message = f"""{title}

<b>Token:</b> {token_symbol}
<b>Address:</b> <code>{token_address}</code>

<b>Risk Factors:</b>
"""
    
    for factor in risk_factors:
        factor_display = factor.replace('_', ' ').upper()
        if factor == 'bundle_farming':
            message += f"  🔴 <b>{factor_display}</b>\n"
        elif factor in ['suspicious_balances', 'bot_wallets']:
            message += f"  🟠 {factor_display}\n"
        else:
            message += f"  ⚠️ {factor_display}\n"
    
    message += f"""
<b>Metrics:</b>
  💧 Liquidity: ${metrics.get('liquidity', 0):,.0f}
  📊 Volume 24h: ${metrics.get('volume_24h', 0):,.0f}
  ⏱️ Age: {metrics.get('age_hours', 0):.1f}h

<b>Warning:</b> This token shows signs of artificial volume manipulation. High risk of rug pull.

<a href="https://dexscreener.com/base/{token_address}">View on DexScreener</a>
<a href="https://basescan.org/address/{token_address}">View on BaseScan</a>

<i>LURKER Watchdog — {now().strftime('%H:%M UTC')}</i>
"""
    
    # Try each target until one works
    for chat_id in chat_targets:
        try:
            url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
            payload = {
                "chat_id": chat_id,
                "text": message,
                "parse_mode": "HTML",
                "disable_web_page_preview": True
            }
            
            response = requests.post(url, json=payload, timeout=30)
            result = response.json()
            
            if result.get('ok'):
                print(f"[ALERT] ✅ Telegram alert sent to {chat_id} for {token_symbol}")
                return True
            else:
                error = result.get('description', 'Unknown error')
                if 'chat not found' in error.lower() or 'forbidden' in error.lower():
                    print(f"[ALERT] ⚠️ Cannot send to {chat_id}: {error}")
                    continue  # Try next target
                print(f"[ALERT] ⚠️ Failed to send to {chat_id}: {error}")
                
        except Exception as e:
            print(f"[ALERT] ⚠️ Error sending to {chat_id}: {e}")
            continue
    
    print(f"[ALERT] ⚠️ All Telegram targets failed, logging locally")
    return log_alert_locally(token_symbol, token_address, risk_factors, metrics)

def check_and_alert(token_data):
    """Check if token has bundle farming and send alert"""
    
    risk = token_data.get('risk', {})
    risk_level = risk.get('level', 'low')
    risk_factors = risk.get('factors', [])
    
    # Only alert for high risk with bundle farming
    if risk_level != 'high':
        return False
    
    if 'bundle_farming' not in risk_factors and len(risk_factors) < 3:
        return False
    
    # Check if we already alerted for this token
    alert_file = '/tmp/bundle_alerts.json'
    alerted = {}
    
    if os.path.exists(alert_file):
        with open(alert_file) as f:
            alerted = json.load(f)
    
    token_address = token_data.get('token', {}).get('address', '')
    
    if token_address in alerted:
        print(f"[ALERT] Already alerted for {token_address[:16]}...")
        return False
    
    # Send alert
    token_symbol = token_data.get('token', {}).get('symbol', 'UNKNOWN')
    
    dex = token_data.get('dexscreener', {})
    metrics = {
        'liquidity': dex.get('liquidity', {}).get('usd', 0),
        'volume_24h': dex.get('volume', {}).get('h24', 0),
        'age_hours': token_data.get('age_hours', 0)
    }
    
    success = send_telegram_alert(token_symbol, token_address, risk_factors, metrics)
    
    if success:
        alerted[token_address] = {
            'alerted_at': now().isoformat(),
            'symbol': token_symbol
        }
        
        with open(alert_file, 'w') as f:
            json.dump(alerted, f, indent=2)
    
    return success

if __name__ == "__main__":
    # Test with example data
    test_token = {
        "token": {
            "address": "0x1234...",
            "symbol": "TEST"
        },
        "risk": {
            "level": "high",
            "factors": ["bundle_farming", "suspicious_balances"]
        },
        "dexscreener": {
            "liquidity": {"usd": 37500},
            "volume": {"h24": 150000}
        },
        "age_hours": 2.5
    }
    
    check_and_alert(test_token)
